import { randomUUID } from "node:crypto";
import { ConflictException, NotFoundException } from "@nestjs/common";
import type {
  BetaAccessChannelBindRequest,
  BetaAccessChannelBindResponse,
  BetaAccessStatusResponse,
  BetaEntryChannel,
  BetaInviteRedeemErrorCode,
  BetaInviteRedeemErrorResponse,
  BetaInviteRedeemRequest,
  BetaInviteRedeemResponse,
  BetaInviteSummary,
  BetaProgramSummary,
  OpsBetaAccessOverviewResponse,
} from "@erliu/shared-contracts";
import { createAccountMembershipRepository } from "../../common/repositories/account-membership.repository.js";
import { createAccountRepository } from "../../common/repositories/account.repository.js";
import {
  createBetaAccessRepository,
  type BetaAccessGrantRecord,
  type BetaInviteRecord,
  type BetaProgramRecord,
} from "../../common/repositories/beta-access.repository.js";
import { getAccountRuntimeControl } from "../identity-membership/account-control-plane.service.js";
import { verifyChannelBinding } from "../identity-membership/identity-membership.service.js";
import { upsertShadowAccount } from "../identity/shadow-account-registry.js";
import { recordDomainEvent } from "../telemetry-intake/telemetry-intake.service.js";

const PROGRAM_KEY = "external_beta_phase0";
const DEFAULT_POLICY_VERSION = "beta-policy-v1";
const SEED_INVITE_MAX_REDEMPTIONS = 1;

const DEFAULT_PROGRAM: Omit<BetaProgramRecord, "created_at" | "updated_at"> = {
  program_key: PROGRAM_KEY,
  status: "active",
  seat_limit: 500,
  waitlist_open: true,
  invite_only: true,
};

const DEFAULT_SEED_INVITES: Array<{
  invite_code: string;
  source_channel: string;
  source_label: string;
  campaign_key: string;
}> = [
  {
    invite_code: "PHASE0-XHS-001",
    source_channel: "xiaohongshu",
    source_label: "小红书 KOL 招募",
    campaign_key: "phase0_xiaohongshu_kol",
  },
  {
    invite_code: "PHASE0-WB-001",
    source_channel: "weibo",
    source_label: "微博话题裂变",
    campaign_key: "phase0_weibo_topic",
  },
  {
    invite_code: "PHASE0-FS-001",
    source_channel: "feishu_seed",
    source_label: "飞书种子社群",
    campaign_key: "phase0_feishu_seed",
  },
];

type BetaGateDecision =
  | {
      allowed: true;
      account_token: string;
    }
  | {
      allowed: false;
      account_token: string;
      ack_copy: string;
      reply_text: string;
      deep_link: string;
    };

export async function redeemBetaInvite(
  input: BetaInviteRedeemRequest,
  options: {
    public_origin?: string;
  } = {},
): Promise<BetaInviteRedeemResponse> {
  const now = new Date().toISOString();
  const repository = createBetaAccessRepository();
  const membershipRepository = createAccountMembershipRepository();
  const accountRepository = createAccountRepository();
  const { program, invites, grants } = await ensureBetaFoundation();
  const invite = invites.find((item) => item.invite_code === input.invite_code);

  if (!invite) {
    throw buildRedeemBusinessError({
      error_code: "invite_not_found",
      invite_code: input.invite_code,
      invite_status: "invalid",
      message: "没有找到这个邀请码，请检查后再试。",
    });
  }

  if (invite.status === "exhausted" || invite.redeemed_count >= invite.max_redemptions) {
    throw buildRedeemBusinessError({
      error_code: "invite_exhausted",
      invite_code: input.invite_code,
      invite_status: "exhausted",
      message: "这个邀请码已经用完了，请换一个新的分享码或联系 concierge。",
    });
  }

  const nextSeatsUsed = grants.filter((item) => item.access_state === "ready").length + 1;
  const accessState = program.status === "paused"
    ? "blocked"
    : nextSeatsUsed > program.seat_limit
      ? "waitlisted"
      : "ready";
  if (accessState === "waitlisted" && !program.waitlist_open) {
    throw new Error("Beta waitlist is closed");
  }

  const accountToken = input.account_token?.trim() || `beta-${randomUUID()}`;
  const account = await upsertShadowAccount({
    account_token: accountToken,
    channel: input.entry_channel,
    target_route: "/chat",
  });
  await membershipRepository.ensureDefaultMembershipPlans();
  await membershipRepository.ensureDefaultEntitlement(account.account_id);

  account.account_status = accessState === "blocked" ? "guest" : "active";
  account.accepted_policy_version = input.accepted_policy_version ?? DEFAULT_POLICY_VERSION;
  account.updated_at = now;
  await accountRepository.saveAccount(account);

  const existingBinding =
    (await membershipRepository.findBindingByChannelAndProvider(input.entry_channel, account.account_token)) ?? null;
  await membershipRepository.saveChannelBinding({
    id: existingBinding?.id ?? randomUUID(),
    account_id: account.account_id,
    channel: input.entry_channel,
    provider_user_id: account.account_token,
    is_primary: true,
    verified_at: now,
  });

  const updatedInvite: BetaInviteRecord = {
    ...invite,
    redeemed_count: invite.redeemed_count + 1,
    redeemed_account_id: account.account_id,
    status: invite.redeemed_count + 1 >= invite.max_redemptions ? "exhausted" : "redeemed",
    updated_at: now,
  };
  await repository.saveInvite(updatedInvite);

  const grant: BetaAccessGrantRecord = {
    account_id: account.account_id,
    program_key: program.program_key,
    invite_code: updatedInvite.invite_code,
    access_state: accessState,
    onboarding_status: accessState === "ready" ? "invite_redeemed" : accessState === "waitlisted" ? "waitlisted" : "blocked",
    entry_channel: input.entry_channel,
    allowed_channels: updatedInvite.allowed_channels,
    bound_channels: [input.entry_channel],
    source_channel: updatedInvite.source_channel,
    source_label: updatedInvite.source_label,
    campaign_key: updatedInvite.campaign_key,
    inviter_account_id: updatedInvite.inviter_account_id,
    root_invite_code: updatedInvite.root_invite_code ?? updatedInvite.invite_code,
    next_step_copy:
      accessState === "ready"
        ? "先进入私聊，再决定要不要绑定微信 ClawBot 或飞书。"
        : accessState === "waitlisted"
          ? "当前名额已满，我们已把你放进候补名单，开放后会优先通知你。"
          : "当前 Beta 暂停开放，请等待下一轮开放通知。",
    deny_reason_copy:
      accessState === "ready"
        ? null
        : accessState === "waitlisted"
          ? "Beta 名额暂满，当前账号处于候补状态。"
          : "Beta 当前暂停开放。",
    created_at: now,
    updated_at: now,
  };
  await repository.saveGrant(grant);

  const shareInvites = accessState === "ready" ? await issueReferralInvites(account.account_id, grant) : [];

  await membershipRepository.createNotification({
    account_id: account.account_id,
    story_id: "",
    title: accessState === "ready" ? "Beta 入口已开放" : "Beta 候补状态已记录",
    body:
      accessState === "ready"
        ? "你已经拿到 Beta 入口，可以先从 H5 进入私聊，再绑定微信或飞书。"
        : "我们已记录你的状态，后续会继续通知你。",
    deep_link: `${resolvePublicH5BaseUrl(options.public_origin)}/beta?account_token=${encodeURIComponent(account.account_token)}`,
    status: "delivered",
    category: "system",
    source_type: "beta_access",
    source_id: updatedInvite.invite_code,
    created_at: now,
  });

  await recordDomainEvent({
    event_name: "beta_invite_redeemed",
    account_id: account.account_id,
    payload: {
      invite_code: updatedInvite.invite_code,
      source_channel: updatedInvite.source_channel,
      campaign_key: updatedInvite.campaign_key,
      access_state: accessState,
      entry_channel: input.entry_channel,
    },
  });

  if (shareInvites.length > 0) {
    await recordDomainEvent({
      event_name: "beta_share_invites_issued",
      account_id: account.account_id,
      payload: {
        invite_code: updatedInvite.invite_code,
        share_invite_count: shareInvites.length,
      },
    });
  }

  return buildAccountView({
    account: await requireAccount(account.account_token),
    grant,
    share_invites: shareInvites.map(toInviteSummary),
    ...(options.public_origin ? { public_origin: options.public_origin } : {}),
  });
}

export async function getBetaAccessStatus(input: {
  account_token?: string;
  invite_code?: string;
},
options: {
  public_origin?: string;
} = {}): Promise<BetaAccessStatusResponse> {
  const { program, invites } = await ensureBetaFoundation();

  const invite = input.invite_code ? invites.find((item) => item.invite_code === input.invite_code) ?? null : null;
  if (!input.account_token) {
    return {
      program: toProgramSummary(program, await countReadySeats()),
      invite: invite ? toInviteSummary(invite) : null,
      account: null,
    };
  }

  const account = await createAccountRepository().findAccountByToken(input.account_token);
  if (!account) {
    return {
      program: toProgramSummary(program, await countReadySeats()),
      invite: invite ? toInviteSummary(invite) : null,
      account: null,
    };
  }

  const grant = await createBetaAccessRepository().findGrantByAccountId(account.account_id);
  if (!grant) {
    return {
      program: toProgramSummary(program, await countReadySeats()),
      invite: invite ? toInviteSummary(invite) : null,
      account: null,
    };
  }

  const shareInvites = (await createBetaAccessRepository().listInvitesByInviter(account.account_id)).map(toInviteSummary);

  return {
    program: toProgramSummary(program, await countReadySeats()),
    invite: invite ? toInviteSummary(invite) : null,
    account: await buildAccountView({
      account,
      grant,
      share_invites: shareInvites,
      ...(options.public_origin ? { public_origin: options.public_origin } : {}),
    }),
  };
}

export async function registerBetaAccessChannel(
  input: BetaAccessChannelBindRequest,
): Promise<BetaAccessChannelBindResponse> {
  const account = await requireAccount(input.account_token);
  const repository = createBetaAccessRepository();
  const grant = await repository.findGrantByAccountId(account.account_id);

  if (!grant) {
    throw new Error(`Beta access grant not found for account ${account.account_token}`);
  }

  const binding = await verifyChannelBinding({
    account_token: input.account_token,
    channel: input.channel,
    provider_user_id: input.provider_user_id,
    set_as_primary: input.set_as_primary,
  });
  const nextBoundChannels = Array.from(new Set([...grant.bound_channels, input.channel])) as BetaEntryChannel[];
  const nextGrant: BetaAccessGrantRecord = {
    ...grant,
    bound_channels: nextBoundChannels,
    onboarding_status: grant.access_state === "ready" ? "chat_ready" : grant.onboarding_status,
    next_step_copy:
      grant.access_state === "ready"
        ? "现在可以直接从微信 ClawBot 或飞书继续催更了。"
        : grant.next_step_copy,
    updated_at: new Date().toISOString(),
  };
  await repository.saveGrant(nextGrant);

  await recordDomainEvent({
    event_name: "beta_channel_bound",
    account_id: account.account_id,
    payload: {
      channel: input.channel,
      set_as_primary: input.set_as_primary,
      onboarding_status: nextGrant.onboarding_status,
    },
  });

  return {
    binding_id: binding.binding_id,
    onboarding_status: nextGrant.onboarding_status,
    bound_channels: nextBoundChannels,
    next_step_copy: nextGrant.next_step_copy,
  };
}

export async function evaluateBetaChannelAccess(input: {
  channel: string;
  presented_account_token: string;
}): Promise<BetaGateDecision> {
  if (input.channel !== "wechat" && input.channel !== "feishu") {
    return {
      allowed: true,
      account_token: input.presented_account_token,
    };
  }

  const resolved = await resolveCanonicalAccountToken({
    channel: input.channel,
    presented_account_token: input.presented_account_token,
  });
  if (!resolved.account) {
    return buildBlockedGateDecision(input.presented_account_token);
  }

  const grant = await createBetaAccessRepository().findGrantByAccountId(resolved.account.account_id);
  if (!grant || grant.access_state !== "ready" || !grant.allowed_channels.includes(input.channel as BetaEntryChannel)) {
    return buildBlockedGateDecision(resolved.account.account_token);
  }

  if (!grant.bound_channels.includes(input.channel as BetaEntryChannel)) {
    return buildBlockedGateDecision(resolved.account.account_token);
  }

  return {
    allowed: true,
    account_token: resolved.account.account_token,
  };
}

export async function getOpsBetaAccessOverview(): Promise<OpsBetaAccessOverviewResponse> {
  const repository = createBetaAccessRepository();
  const { program, invites, grants } = await ensureBetaFoundation();
  const accountRepository = createAccountRepository();
  const accounts = await Promise.all(grants.map((item) => accountRepository.findAccountById(item.account_id)));
  const sourceBreakdown = new Map<string, { source_channel: string; source_label: string; campaign_key: string; redeemed_count: number; approved_count: number }>();

  for (const invite of invites) {
    const key = `${invite.source_channel}:${invite.campaign_key}`;
    const existing = sourceBreakdown.get(key) ?? {
      source_channel: invite.source_channel,
      source_label: invite.source_label,
      campaign_key: invite.campaign_key,
      redeemed_count: 0,
      approved_count: 0,
    };
    existing.redeemed_count += invite.redeemed_count;
    existing.approved_count += grants.filter(
      (item) => item.campaign_key === invite.campaign_key && item.access_state === "ready",
    ).length;
    sourceBreakdown.set(key, existing);
  }

  const channelBreakdown = (["h5", "wechat", "feishu"] as const).map((channel) => ({
    channel,
    bound_count: grants.filter((item) => item.bound_channels.includes(channel)).length,
  }));

  return {
    program: toProgramSummary(program, grants.filter((item) => item.access_state === "ready").length),
    invites: {
      issued: invites.length,
      redeemed: invites.filter((item) => item.redeemed_count > 0).length,
      available: invites.filter((item) => item.status === "available").length,
      waitlisted: grants.filter((item) => item.access_state === "waitlisted").length,
      shared: invites.filter((item) => item.issued_by === "referral").length,
    },
    source_breakdown: [...sourceBreakdown.values()],
    channel_breakdown: channelBreakdown,
    recent_accounts: grants
      .slice()
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
      .slice(0, 10)
      .map((grant) => ({
        account_token: accounts.find((item) => item?.account_id === grant.account_id)?.account_token ?? grant.account_id,
        access_state: grant.access_state,
        onboarding_status: grant.onboarding_status,
        invite_code: grant.invite_code,
        source_label: grant.source_label,
      })),
  };
}

async function ensureBetaFoundation() {
  const repository = createBetaAccessRepository();
  const programs = await repository.listPrograms();
  const now = new Date().toISOString();
  const program =
    programs.find((item) => item.program_key === PROGRAM_KEY) ??
    (await repository.saveProgram({
      ...DEFAULT_PROGRAM,
      created_at: now,
      updated_at: now,
    }));

  const existingInvites = await repository.listInvites();
  for (const seed of DEFAULT_SEED_INVITES) {
    const existingInvite = existingInvites.find((item) => item.invite_code === seed.invite_code) ?? null;
    const normalizedRedeemedCount = existingInvite?.redeemed_count ?? 0;
    const normalizedStatus =
      normalizedRedeemedCount === 0
        ? "available"
        : normalizedRedeemedCount >= SEED_INVITE_MAX_REDEMPTIONS
          ? "exhausted"
          : "redeemed";

    await repository.saveInvite({
      invite_code: seed.invite_code,
      program_key: program.program_key,
      status: normalizedStatus,
      source_channel: seed.source_channel,
      source_label: seed.source_label,
      campaign_key: seed.campaign_key,
      inviter_account_id: null,
      root_invite_code: seed.invite_code,
      issued_by: "ops_seed",
      allowed_channels: ["h5", "wechat", "feishu"],
      max_redemptions: SEED_INVITE_MAX_REDEMPTIONS,
      redeemed_count: normalizedRedeemedCount,
      redeemed_account_id: existingInvite?.redeemed_account_id ?? null,
      issued_at: existingInvite?.issued_at ?? now,
      updated_at: now,
    });
  }

  return {
    program,
    invites: await repository.listInvites(),
    grants: await repository.listGrants(),
  };
}

async function issueReferralInvites(account_id: string, grant: BetaAccessGrantRecord) {
  const repository = createBetaAccessRepository();
  const existing = await repository.listInvitesByInviter(account_id);

  if (existing.length >= 2) {
    return existing.slice(0, 2);
  }

  const now = new Date().toISOString();
  const created: BetaInviteRecord[] = [];
  for (let index = existing.length; index < 2; index += 1) {
    const invite: BetaInviteRecord = {
      invite_code: `SHARE-${randomUUID().slice(0, 8).toUpperCase()}`,
      program_key: grant.program_key,
      status: "available",
      source_channel: "referral",
      source_label: "好友分享",
      campaign_key: "phase0_referral",
      inviter_account_id: account_id,
      root_invite_code: grant.root_invite_code ?? grant.invite_code,
      issued_by: "referral",
      allowed_channels: grant.allowed_channels,
      max_redemptions: 1,
      redeemed_count: 0,
      redeemed_account_id: null,
      issued_at: now,
      updated_at: now,
    };
    created.push(await repository.saveInvite(invite));
  }

  return [...existing, ...created].slice(0, 2);
}

async function buildAccountView(input: {
  account: Awaited<ReturnType<ReturnType<typeof createAccountRepository>["findAccountByToken"]>>;
  grant: BetaAccessGrantRecord;
  share_invites: BetaInviteSummary[];
  public_origin?: string;
}): Promise<BetaInviteRedeemResponse> {
  if (!input.account) {
    throw new Error("Account not found while building beta access view");
  }

  const runtimeControl = await getAccountRuntimeControl(input.account.account_id);
  const entryLinks = await buildEntryLinks(input.account.account_token, input.public_origin);

  return {
    account_id: input.account.account_id,
    account_token: input.account.account_token,
    invite_code: input.grant.invite_code,
    access_state: input.grant.access_state,
    onboarding_status: input.grant.onboarding_status,
    primary_channel: input.account.primary_channel,
    bound_channels: input.grant.bound_channels,
    allowed_channels: input.grant.allowed_channels,
    next_step_copy: input.grant.next_step_copy,
    deny_reason_copy: input.grant.deny_reason_copy,
    attribution: {
      source_channel: input.grant.source_channel,
      source_label: input.grant.source_label,
      campaign_key: input.grant.campaign_key,
      inviter_account_id: input.grant.inviter_account_id,
      root_invite_code: input.grant.root_invite_code,
    },
    share_invites: input.share_invites,
    entry_links: entryLinks,
    runtime_gate_summary: {
      story_slots_status: runtimeControl.remaining.story_slots > 0 ? "ready" : "blocked",
      branch_quota_status: runtimeControl.remaining.branch_quota > 0 ? "ready" : "blocked",
      ai_budget_status: runtimeControl.ai_budget.status,
    },
  };
}

async function buildEntryLinks(account_token: string, publicOrigin?: string) {
  const chatAccount = await upsertShadowAccount({
    account_token,
    channel: "h5",
    target_route: "/chat",
  });
  const roomAccount = await upsertShadowAccount({
    account_token,
    channel: "h5",
    target_route: "/room",
  });

  const h5BaseUrl = resolvePublicH5BaseUrl(publicOrigin);

  return {
    beta_url: `${h5BaseUrl}/beta?account_token=${encodeURIComponent(account_token)}`,
    chat_url: `${h5BaseUrl}/chat?token=${encodeURIComponent(chatAccount.deep_link_token)}`,
    room_url: `${h5BaseUrl}/room?token=${encodeURIComponent(roomAccount.deep_link_token)}`,
  };
}

function toProgramSummary(program: BetaProgramRecord, seats_used: number): BetaProgramSummary {
  return {
    program_key: program.program_key,
    status: program.status,
    seat_limit: program.seat_limit,
    seats_used,
    waitlist_open: program.waitlist_open,
    invite_only: program.invite_only,
  };
}

function toInviteSummary(invite: BetaInviteRecord): BetaInviteSummary {
  return {
    invite_code: invite.invite_code,
    status: invite.status,
    source_channel: invite.source_channel,
    source_label: invite.source_label,
    campaign_key: invite.campaign_key,
    inviter_account_id: invite.inviter_account_id,
    root_invite_code: invite.root_invite_code,
    issued_by: invite.issued_by,
    allowed_channels: invite.allowed_channels,
    max_redemptions: invite.max_redemptions,
    redeemed_count: invite.redeemed_count,
  };
}

async function requireAccount(account_token: string) {
  const account = await createAccountRepository().findAccountByToken(account_token);

  if (!account) {
    throw new Error(`Account not found for token ${account_token}`);
  }

  return account;
}

async function countReadySeats() {
  return (await createBetaAccessRepository().listGrants()).filter((item) => item.access_state === "ready").length;
}

async function resolveCanonicalAccountToken(input: {
  channel: string;
  presented_account_token: string;
}) {
  const membershipRepository = createAccountMembershipRepository();
  const binding = await membershipRepository.findBindingByChannelAndProvider(input.channel, input.presented_account_token);
  if (!binding) {
    return {
      account: await createAccountRepository().findAccountByToken(input.presented_account_token),
    };
  }

  return {
    account: await createAccountRepository().findAccountById(binding.account_id),
  };
}

function buildBlockedGateDecision(account_token: string): BetaGateDecision {
  return {
    allowed: false,
    account_token,
    ack_copy: "这轮外部 Beta 还是邀请码制，我先把你的消息停在入口外。",
    reply_text: "现在还不能直接从这个外部渠道进入。先用邀请码去 H5 完成接入或绑定，再来找我。",
    deep_link: `${resolvePublicH5BaseUrl()}/beta`,
  };
}

function buildRedeemBusinessError(payload: BetaInviteRedeemErrorResponse) {
  if (payload.error_code === "invite_not_found") {
    return new NotFoundException(payload);
  }

  return new ConflictException(payload);
}

function resolvePublicH5BaseUrl(publicOrigin?: string) {
  return normalizeOrigin(publicOrigin) ?? normalizeOrigin(process.env.H5_BASE_URL) ?? "http://127.0.0.1:3000";
}

function normalizeOrigin(origin?: string) {
  const normalized = origin?.trim();
  if (!normalized) {
    return undefined;
  }

  return normalized.replace(/\/+$/, "");
}
