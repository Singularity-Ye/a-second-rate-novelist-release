import { randomUUID } from "node:crypto";
import type {
  AccountOverviewResponse,
  ChannelBindingResponse,
  GuestUpgradeResponse,
  MembershipOrderListResponse,
  MembershipOrderResponse,
  MembershipRefundResponse,
  NotificationListResponse,
  NotificationPreferenceResponse,
  PrivacyDataRequestResponse,
  SyncConflictResolveResponse,
  SyncStatusResponse,
} from "@erliu/shared-contracts";
import { createAccountMembershipRepository, type NotificationPreferenceRecord } from "../../common/repositories/account-membership.repository.js";
import { createAccountRepository } from "../../common/repositories/account.repository.js";
import { createOpsControlRepository } from "../../common/repositories/ops-control.repository.js";
import { createChapterRuntimeRepository } from "../../common/repositories/chapter-runtime.repository.js";
import { createStoryWorkspaceRepository } from "../../common/repositories/story-workspace.repository.js";
import { createBranch } from "../branch-service/branch-service.service.js";
import {
  defaultAccountEntitlement,
  getAccountRuntimeControl,
  resolveUnreadNotificationCount,
  validateNotificationPreferenceInput,
  validatePrivacyDataRequestInput,
} from "./account-control-plane.service.js";
import { listUnifiedNotificationFeed } from "../room-projection/room-event-projection.service.js";
import { recordDomainEvent } from "../telemetry-intake/telemetry-intake.service.js";

const API_BASE_URL =
  process.env.API_BASE_URL ??
  `http://${process.env.HOST?.trim() || "127.0.0.1"}:${process.env.PORT?.trim() || "4000"}`;
const H5_BASE_URL = process.env.H5_BASE_URL ?? "http://127.0.0.1:3000";
const DELETE_CONFIRM_PHRASE = "DELETE MY ACCOUNT";

export async function fetchAccountOverview(account_token: string): Promise<AccountOverviewResponse> {
  const account = await ensureAccount(account_token);
  const membershipRepository = createAccountMembershipRepository();
  const entitlements =
    (await membershipRepository.findEntitlementByAccountId(account.account_id)) ?? defaultAccountEntitlement(account.account_id);
  const syncStatus = await buildSyncStatus(account.account_id);
  const runtimeControl = await getAccountRuntimeControl(account.account_id);

  return {
    account: {
      account_id: account.account_id,
      account_status: account.account_status,
      primary_channel: account.primary_channel,
      unread_notification_count: await resolveUnreadNotificationCount(account.account_id),
    },
    entitlements: {
      current_plan_id: entitlements.current_plan_id,
      story_slots: entitlements.story_slots,
      export_quota: entitlements.export_quota,
      branch_quota: entitlements.branch_quota,
      asset_storage_mb: entitlements.asset_storage_mb,
    },
    sync_summary: {
      device_count: syncStatus.device_count,
      pending_conflict_count: syncStatus.pending_conflict_count,
      sync_health: syncStatus.sync_health,
    },
    runtime_control: runtimeControl,
  };
}

export async function guestUpgradeAccount(input: {
  account_token: string;
  upgrade_method: string;
  verification_payload: Record<string, unknown>;
  accepted_policy_version: string;
  client_request_id: string;
}): Promise<GuestUpgradeResponse> {
  const accountRepository = createAccountRepository();
  const membershipRepository = createAccountMembershipRepository();
  const workspaceRepository = createStoryWorkspaceRepository();
  const account = await ensureAccount(input.account_token);

  await membershipRepository.ensureDefaultMembershipPlans();
  await membershipRepository.ensureDefaultEntitlement(account.account_id);

  account.account_status = "active";
  account.accepted_policy_version = input.accepted_policy_version;
  account.updated_at = new Date().toISOString();
  await accountRepository.saveAccount(account);

  const providerUserId = String(input.verification_payload.provider_user_id ?? input.account_token);
  const existingBinding = await membershipRepository.findBindingByChannelAndProvider(account.primary_channel, providerUserId);

  if (existingBinding && existingBinding.account_id !== account.account_id) {
    throw new Error("409 channel binding already belongs to another account");
  }

  await demoteAccountBindings(account.account_id);
  await membershipRepository.saveChannelBinding({
    id: existingBinding?.id ?? randomUUID(),
    account_id: account.account_id,
    channel: account.primary_channel,
    provider_user_id: providerUserId,
    is_primary: true,
    verified_at: new Date().toISOString(),
  });

  await accountRepository.ensureSession({
    account_id: account.account_id,
    device_id: `${account.primary_channel}:${providerUserId}`,
    device_type: account.primary_channel,
  });
  await membershipRepository.createNotification({
    account_id: account.account_id,
    story_id: (await workspaceRepository.listWorkspacesByAccount(account.account_id))[0]?.id ?? "",
    title: "账户已转正",
    body: "游客故事、通知与权益已并入正式账户。",
    deep_link: `${H5_BASE_URL}/profile/account?account_token=${account.account_token}`,
    status: "delivered",
    category: "system",
    source_type: "account_upgrade",
    source_id: account.account_id,
    created_at: new Date().toISOString(),
  });

  await recordDomainEvent({
    event_name: "account_channel_bind_complete",
    account_id: account.account_id,
    payload: {
      channel: account.primary_channel,
      is_primary: true,
    },
  });

  return {
    account_id: account.account_id,
    status: "active",
    merged_guest_story_count: (await workspaceRepository.listWorkspacesByAccount(account.account_id)).length,
    primary_channel: account.primary_channel,
    session_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

export async function verifyChannelBinding(input: {
  account_token: string;
  channel: string;
  provider_user_id: string;
  set_as_primary: boolean;
}): Promise<ChannelBindingResponse> {
  const accountRepository = createAccountRepository();
  const membershipRepository = createAccountMembershipRepository();
  const account = await ensureAccount(input.account_token);
  const existing = await membershipRepository.findBindingByChannelAndProvider(input.channel, input.provider_user_id);

  if (existing && existing.account_id !== account.account_id) {
    throw new Error("409 channel binding already belongs to another account");
  }

  if (input.set_as_primary) {
    await demoteAccountBindings(account.account_id);
    account.primary_channel = input.channel;
    account.updated_at = new Date().toISOString();
    await accountRepository.saveAccount(account);
  }

  const saved = await membershipRepository.saveChannelBinding({
    id: existing?.id ?? randomUUID(),
    account_id: account.account_id,
    channel: input.channel,
    provider_user_id: input.provider_user_id,
    is_primary: input.set_as_primary,
    verified_at: new Date().toISOString(),
  });

  await accountRepository.ensureSession({
    account_id: account.account_id,
    device_id: `${input.channel}:${input.provider_user_id}`,
    device_type: input.channel,
  });
  await maybeCreateSyncConflict(account.account_id, account.account_token);

  await recordDomainEvent({
    event_name: "account_channel_bind_complete",
    account_id: account.account_id,
    payload: {
      channel: input.channel,
      is_primary: input.set_as_primary,
    },
  });

  return {
    binding_id: saved.id,
    status: "verified",
    is_primary: input.set_as_primary,
    recovery_enabled: true,
  };
}

export async function getSyncStatus(input: { account_token: string }): Promise<SyncStatusResponse> {
  const account = await ensureAccount(input.account_token);
  return buildSyncStatus(account.account_id);
}

export async function resolveSyncConflict(input: {
  account_token: string;
  conflict_id: string;
  resolution: "keep_server" | "keep_client" | "create_branch" | "merge_fields";
  selected_version_ids: string[];
  merge_patch: Record<string, unknown> | null;
}): Promise<SyncConflictResolveResponse> {
  const membershipRepository = createAccountMembershipRepository();
  const workspaceRepository = createStoryWorkspaceRepository();
  const account = await ensureAccount(input.account_token);
  const conflict = await membershipRepository.findSyncConflictById(input.conflict_id);

  if (!conflict || conflict.account_id !== account.account_id) {
    throw new Error(`Sync conflict not found for ${input.conflict_id}`);
  }

  let resulting_branch_id: string | null = null;
  if (input.resolution === "create_branch") {
    const currentChapterId =
      (await workspaceRepository.findWorkspaceById(conflict.story_id))?.current_chapter_id ?? conflict.version_a;
    const branch = await createBranch({
      story_id: conflict.story_id,
      anchor_ref: {
        chapter_id: currentChapterId,
      },
      branch_type: "sync_conflict",
      goal: "保留同步冲突的一侧为独立分支。",
      rights_mode: "private_sandbox",
      client_request_id: `sync-conflict-${conflict.id}`,
    });
    resulting_branch_id = branch.branch_id;
  }

  await membershipRepository.saveSyncConflict({
    ...conflict,
    status: "resolved",
    resolution: input.resolution,
    updated_at: new Date().toISOString(),
    resulting_branch_id,
  });

  return {
    conflict_id: conflict.id,
    status: "resolved",
    resulting_branch_id,
    evidence_entry_id: randomUUID(),
  };
}

export async function updateNotificationPreferences(input: {
  account_token: string;
  in_app_enabled: boolean;
  push_enabled: boolean;
  im_enabled: boolean;
  quiet_hours: {
    enabled: boolean;
    start_local: string;
    end_local: string;
    time_zone: string;
  };
  categories: {
    export: boolean;
    risk: boolean;
    membership: boolean;
    system: boolean;
  };
}): Promise<NotificationPreferenceResponse> {
  const account = await ensureAccount(input.account_token);
  await validateNotificationPreferenceInput(input);
  const stored = await createAccountMembershipRepository().upsertNotificationPreference({
    account_id: account.account_id,
    in_app_enabled: input.in_app_enabled,
    push_enabled: input.push_enabled,
    im_enabled: input.im_enabled,
    quiet_hours: input.quiet_hours,
    categories: input.categories,
  });

  await recordDomainEvent({
    event_name: "notification_preference_update",
    account_id: account.account_id,
    payload: {
      channels: [input.in_app_enabled ? "in_app" : null, input.im_enabled ? "im" : null, input.push_enabled ? "push" : null]
        .filter(Boolean)
        .join(","),
      quiet_hours_enabled: input.quiet_hours.enabled,
    },
  });

  return {
    preference_version: stored.version_no,
    effective_channels: resolveEffectiveChannels(stored),
    next_quiet_window: stored.quiet_hours.enabled
      ? {
          start_local: stored.quiet_hours.start_local,
          end_local: stored.quiet_hours.end_local,
          time_zone: stored.quiet_hours.time_zone,
        }
      : null,
  };
}

export async function createMembershipOrder(input: {
  account_token: string;
  target_plan_id: string;
  billing_cycle: string;
  payment_channel: string;
  trigger_reason?: string;
}): Promise<MembershipOrderResponse> {
  const membershipRepository = createAccountMembershipRepository();
  const workspaceRepository = createStoryWorkspaceRepository();
  const account = await ensureAccount(input.account_token);

  await membershipRepository.ensureDefaultMembershipPlans();
  const plan = await membershipRepository.findMembershipPlanById(input.target_plan_id);

  if (!plan || !plan.is_active) {
    throw new Error(`Membership plan not found for id ${input.target_plan_id}`);
  }

  await recordDomainEvent({
    event_name: "membership_purchase_start",
    account_id: account.account_id,
    payload: {
      target_plan: input.target_plan_id,
      trigger_reason: input.trigger_reason ?? null,
      pricing_page_source: "profile_account_membership",
    },
  });

  const entitlement = await membershipRepository.upsertEntitlement({
    account_id: account.account_id,
    current_plan_id: plan.plan_id,
    story_slots: plan.story_slots,
    export_quota: plan.export_quota,
    branch_quota: plan.branch_quota,
    asset_storage_mb: plan.asset_storage_mb,
  });
  const order = await membershipRepository.createMembershipOrder({
    account_id: account.account_id,
    target_plan_id: plan.plan_id,
    billing_cycle: input.billing_cycle,
    payment_channel: input.payment_channel,
    trigger_reason: input.trigger_reason ?? null,
    status: "paid",
    payable_amount: plan.price,
    created_at: new Date().toISOString(),
  });
  await membershipRepository.createNotification({
    account_id: account.account_id,
    story_id: (await workspaceRepository.listWorkspacesByAccount(account.account_id))[0]?.id ?? "",
    title: "会员方案已更新",
    body: `当前方案已升级为 ${plan.plan_id}。`,
    deep_link: `${H5_BASE_URL}/profile/account/membership?account_token=${account.account_token}`,
    status: "delivered",
    category: "membership",
    source_type: "membership_order",
    source_id: order.id,
    created_at: new Date().toISOString(),
  });

  await recordDomainEvent({
    event_name: "membership_purchase_complete",
    account_id: account.account_id,
    payload: {
      purchased_plan: plan.plan_id,
      purchase_amount: plan.price,
      is_first_purchase: true,
    },
  });

  return {
    order_id: order.id,
    checkout_status: order.status,
    payable_amount: order.payable_amount,
    entitlement_preview: {
      current_plan_id: entitlement.current_plan_id,
      story_slots: entitlement.story_slots,
      export_quota: entitlement.export_quota,
      branch_quota: entitlement.branch_quota,
      asset_storage_mb: entitlement.asset_storage_mb,
    },
  };
}

export async function listMembershipOrders(account_token: string): Promise<MembershipOrderListResponse> {
  const membershipRepository = createAccountMembershipRepository();
  const opsRepository = createOpsControlRepository();
  const account = await ensureAccount(account_token);
  const [orders, opsCases] = await Promise.all([
    membershipRepository.listOrdersByAccount(account.account_id),
    opsRepository.listOpsCases(),
  ]);

  return {
    orders: orders.map((order) => {
      const refundCase =
        opsCases
          .filter(
            (item) =>
              item.case_type === "membership_exception" &&
              item.entity_type === "membership_order" &&
              item.entity_id === order.id &&
              item.account_id === account.account_id,
          )
          .sort((left, right) => right.updated_at.localeCompare(left.updated_at))[0] ?? null;

      return {
        order_id: order.id,
        target_plan_id: order.target_plan_id,
        billing_cycle: order.billing_cycle,
        status: order.status,
        payable_amount: order.payable_amount,
        created_at: order.created_at,
        invoice_download_url: `${API_BASE_URL}/membership/orders/${order.id}/invoice?account_token=${encodeURIComponent(account.account_token)}`,
        refund_status: refundCase ? deriveRefundStatus(refundCase.status) : "not_requested",
        refund_case_id: refundCase?.id ?? null,
      };
    }),
  };
}

export async function requestMembershipRefund(input: {
  account_token: string;
  order_id: string;
  reason: string;
}): Promise<MembershipRefundResponse> {
  const account = await ensureAccount(input.account_token);
  const opsRepository = createOpsControlRepository();
  const order = await findMembershipOrderForAccount(account.account_id, input.order_id);

  const existingCase =
    (await opsRepository.listOpsCases())
      .filter(
        (item) =>
          item.case_type === "membership_exception" &&
          item.entity_type === "membership_order" &&
          item.entity_id === order.id &&
          item.account_id === account.account_id,
      )
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at))[0] ?? null;

  if (existingCase && existingCase.status !== "resolved" && existingCase.status !== "rejected") {
    return {
      case_id: existingCase.id,
      order_id: order.id,
      refund_status: deriveRefundStatus(existingCase.status),
    };
  }

  const now = new Date().toISOString();
  const opsCase = await opsRepository.createOpsCase({
    case_type: "membership_exception",
    priority: "P1",
    owner_id: null,
    status: "pending_review",
    entity_type: "membership_order",
    entity_id: order.id,
    account_id: account.account_id,
    story_id: null,
    summary: `退款申请：${order.target_plan_id} / ${input.reason}`,
    source_ref: {
      ref_type: "membership_refund_request",
      ref_id: order.id,
    },
    sla_due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    created_at: now,
    updated_at: now,
  });

  await createAccountMembershipRepository().createNotification({
    account_id: account.account_id,
    story_id: "",
    title: "退款申请已提交",
    body: "退款申请已进入审核队列，可在帮助中心继续追踪。",
    deep_link: `${H5_BASE_URL}/profile/account/orders?account_token=${account.account_token}`,
    status: "delivered",
    category: "membership",
    source_type: "membership_refund",
    source_id: opsCase.id,
    created_at: now,
  });

  return {
    case_id: opsCase.id,
    order_id: order.id,
    refund_status: "pending_review",
  };
}

export async function getMembershipInvoiceDownload(input: { account_token: string; order_id: string }) {
  const account = await ensureAccount(input.account_token);
  const order = await findMembershipOrderForAccount(account.account_id, input.order_id);

  return {
    file_name: `${order.id}-invoice.txt`,
    download_body: [
      "二流小说家 Membership Invoice",
      `order_id: ${order.id}`,
      `account_id: ${account.account_id}`,
      `target_plan_id: ${order.target_plan_id}`,
      `billing_cycle: ${order.billing_cycle}`,
      `payment_channel: ${order.payment_channel}`,
      `payable_amount: ${order.payable_amount}`,
      `status: ${order.status}`,
      `created_at: ${order.created_at}`,
    ].join("\n"),
  };
}

export async function createPrivacyDataRequest(input: {
  account_token: string;
  request_type: "export" | "delete" | "revoke_consent";
  scope: "account" | "story" | "asset";
  story_id?: string;
  confirm_phrase: string;
}): Promise<PrivacyDataRequestResponse> {
  const membershipRepository = createAccountMembershipRepository();
  const account = await ensureAccount(input.account_token);

  if (input.request_type === "delete" && input.confirm_phrase !== DELETE_CONFIRM_PHRASE) {
    throw new Error("invalid confirm phrase for delete request");
  }

  await validatePrivacyDataRequestInput({
    account_id: account.account_id,
    request_type: input.request_type,
    scope: input.scope,
    ...(input.story_id ? { story_id: input.story_id } : {}),
  });

  const request = await membershipRepository.createPrivacyDataRequest({
    account_id: account.account_id,
    request_type: input.request_type,
    scope: input.scope,
    story_id: input.story_id ?? null,
    status: input.request_type === "delete" ? "cooling_off" : "queued",
    due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    cooling_off_until:
      input.request_type === "delete" ? new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString() : null,
    created_at: new Date().toISOString(),
  });
  await membershipRepository.createNotification({
    account_id: account.account_id,
    story_id: input.story_id ?? "",
    title: "数据请求已创建",
    body: input.request_type === "delete" ? "删除申请已进入冷静期。" : "数据导出请求已进入队列。",
    deep_link: `${H5_BASE_URL}/profile/account/data?account_token=${account.account_token}`,
    status: "delivered",
    category: "system",
    source_type: "privacy_data_request",
    source_id: request.id,
    created_at: new Date().toISOString(),
  });

  await recordDomainEvent({
    event_name: "privacy_data_request_submit",
    account_id: account.account_id,
    payload: {
      request_type: input.request_type,
      scope: input.scope,
    },
  });

  return {
    data_request_id: request.id,
    status: request.status,
    due_at: request.due_at,
    cooling_off_until: request.cooling_off_until,
  };
}

export async function getNotifications(input: {
  account_token: string;
  category?: "chapter_update" | "export" | "risk" | "membership" | "system" | null;
  unread_only?: boolean;
  story_id?: string | null;
}): Promise<NotificationListResponse> {
  const account = await ensureAccount(input.account_token);
  const notificationPreference =
    (await createAccountMembershipRepository().findNotificationPreferenceByAccount(account.account_id)) ?? {
      account_id: account.account_id,
      in_app_enabled: true,
      push_enabled: false,
      im_enabled: false,
      quiet_hours: {
        enabled: false,
        start_local: "22:00",
        end_local: "08:00",
        time_zone: "Asia/Shanghai",
      },
      categories: {
        export: true,
        risk: true,
        membership: true,
        system: true,
      },
      version_no: 0,
      updated_at: null,
    };
  const items = (await listUnifiedNotificationFeed({
    account_id: account.account_id,
    ...(input.category !== undefined ? { category: input.category } : {}),
    ...(input.unread_only !== undefined ? { unread_only: input.unread_only } : {}),
    ...(input.story_id !== undefined ? { story_id: input.story_id } : {}),
  })).map((item) => ({
    notification_id: item.notification_id,
    category: item.category,
    title: item.title,
    body: item.body,
    status: item.status,
    source_type: item.source_type,
    created_at: item.created_at,
    target_route: item.target_route,
  }));

  return {
    items,
    preference_summary: {
      in_app_enabled: notificationPreference.in_app_enabled,
      push_enabled: notificationPreference.push_enabled,
      im_enabled: notificationPreference.im_enabled,
      quiet_hours_enabled: notificationPreference.quiet_hours.enabled,
      quiet_hours_start_local: notificationPreference.quiet_hours.start_local,
      quiet_hours_end_local: notificationPreference.quiet_hours.end_local,
    },
  };
}

export async function listPrivacyDataRequests(account_token: string) {
  const account = await ensureAccount(account_token);

  return {
    items: await createAccountMembershipRepository().listPrivacyDataRequestsByAccount(account.account_id),
  };
}

async function buildSyncStatus(account_id: string): Promise<SyncStatusResponse> {
  const active_devices = (await createAccountRepository()
    .listActiveSessionsByAccount(account_id))
    .map((item) => ({
      device_id: item.device_id ?? item.session_id,
      device_type: item.device_type ?? "h5",
      last_active_at: item.last_seen_at,
    }));
  const pending_conflicts = (await createAccountMembershipRepository()
    .listOpenSyncConflictsByAccount(account_id))
    .map((item) => ({
      conflict_id: item.id,
      object_type: item.object_type,
      status: item.status,
    }));

  return {
    account_id,
    device_count: active_devices.length,
    active_devices,
    pending_conflict_count: pending_conflicts.length,
    sync_health: pending_conflicts.length > 0 ? "degraded" : active_devices.length === 0 ? "offline" : "healthy",
    offline_changes_count: 0,
    pending_conflicts,
  };
}

async function ensureAccount(account_token: string) {
  const account = await createAccountRepository().findAccountByToken(account_token);

  if (!account) {
    throw new Error(`Account not found for token ${account_token}`);
  }

  return account;
}

async function findMembershipOrderForAccount(account_id: string, order_id: string) {
  const order = (await createAccountMembershipRepository().listOrdersByAccount(account_id)).find((item) => item.id === order_id);

  if (!order) {
    throw new Error(`Membership order not found for id ${order_id}`);
  }

  return order;
}

function deriveRefundStatus(status: "open" | "triaged" | "pending_user" | "pending_review" | "resolved" | "rejected") {
  switch (status) {
    case "resolved":
      return "resolved";
    case "rejected":
      return "rejected";
    default:
      return "pending_review";
  }
}

async function demoteAccountBindings(account_id: string) {
  const membershipRepository = createAccountMembershipRepository();

  for (const binding of await membershipRepository.listBindingsByAccount(account_id)) {
    if (!binding.is_primary) {
      continue;
    }

    await membershipRepository.saveChannelBinding({
      ...binding,
      is_primary: false,
      verified_at: new Date().toISOString(),
    });
  }
}

async function maybeCreateSyncConflict(account_id: string, account_token: string) {
  const membershipRepository = createAccountMembershipRepository();
  const accountRepository = createAccountRepository();
  const workspaceRepository = createStoryWorkspaceRepository();
  const chapterRepository = createChapterRuntimeRepository();
  const activeDevices = await accountRepository.listActiveSessionsByAccount(account_id);
  const activeStory = (await workspaceRepository.listWorkspacesByAccount(account_id))[0] ?? null;
  const existing = (await membershipRepository.listOpenSyncConflictsByAccount(account_id))[0] ?? null;
  const latestChapter = activeStory
    ? (await chapterRepository
        .listChaptersByStory(activeStory.id))
        .filter((item) => item.status !== "superseded")
        .sort((left, right) => left.created_at.localeCompare(right.created_at))
        .at(-1) ?? null
    : null;
  const conflictObjectType = activeStory?.current_chapter_id ?? latestChapter?.id ? "chapter" : "story_workspace";
  const versionAnchor = activeStory?.current_chapter_id ?? latestChapter?.id ?? activeStory?.id;

  if (activeDevices.length < 2 || !activeStory || !versionAnchor || existing) {
    return;
  }

  const conflict = await membershipRepository.createSyncConflict({
    account_id,
    story_id: activeStory.id,
    object_type: conflictObjectType,
    version_a: versionAnchor,
    version_b: randomUUID(),
    status: "user_action_required",
    resolution: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    resulting_branch_id: null,
  });

  await membershipRepository.createNotification({
    account_id,
    story_id: activeStory.id,
    title: "同步冲突已发现",
    body: "多端修改产生冲突，请前往同步页处理。",
    deep_link: `${H5_BASE_URL}/profile/account/sync?account_token=${account_token}`,
    status: "delivered",
    category: "system",
    source_type: "sync_conflict",
    source_id: conflict.id,
    created_at: new Date().toISOString(),
  });

  await recordDomainEvent({
    event_name: "sync_conflict_detected",
    account_id,
    payload: {
      object_type: conflictObjectType,
      story_id: activeStory.id,
      device_pair: activeDevices.map((item) => item.device_type ?? "unknown").join(","),
    },
  });
}

function resolveEffectiveChannels(preference: NotificationPreferenceRecord) {
  return [
    preference.in_app_enabled ? "in_app" : null,
    preference.push_enabled ? "push" : null,
    preference.im_enabled ? "im" : null,
  ].filter((item): item is string => Boolean(item));
}
