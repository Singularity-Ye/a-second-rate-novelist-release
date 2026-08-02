import { BadRequestException, ConflictException } from "@nestjs/common";
import { createAccountMembershipRepository } from "../../common/repositories/account-membership.repository.js";
import { createObservabilityRepository } from "../../common/repositories/observability.repository.js";
import { createStoryWorkspaceRepository } from "../../common/repositories/story-workspace.repository.js";
import { readAppState } from "../../common/store.js";
import { readAiRuntimeConfig, type AiCapabilityKey } from "../ai-runtime/ai-runtime.config.js";
import { listUnifiedNotificationFeed } from "../room-projection/room-event-projection.service.js";

const DEFAULT_QUIET_HOURS = {
  enabled: false,
  start_local: "22:00",
  end_local: "08:00",
  time_zone: "Asia/Shanghai",
};

const DEFAULT_NOTIFICATION_CATEGORIES = {
  export: true,
  risk: true,
  membership: true,
  system: true,
};

export function defaultAccountEntitlement(account_id: string) {
  return {
    account_id,
    current_plan_id: "plan_guest",
    story_slots: 2,
    export_quota: 1,
    branch_quota: 2,
    asset_storage_mb: 128,
  };
}

function roundUsd(value: number) {
  return Number(value.toFixed(2));
}

function clampRemaining(limit: number, used: number) {
  return Math.max(0, limit - used);
}

async function resolveEntitlement(account_id: string) {
  return (
    (await createAccountMembershipRepository().findEntitlementByAccountId(account_id)) ?? defaultAccountEntitlement(account_id)
  );
}

async function resolveNotificationPreference(account_id: string) {
  const stored = await createAccountMembershipRepository().findNotificationPreferenceByAccount(account_id);

  if (stored) {
    return stored;
  }

  return {
    account_id,
    in_app_enabled: true,
    push_enabled: false,
    im_enabled: false,
    quiet_hours: DEFAULT_QUIET_HOURS,
    categories: DEFAULT_NOTIFICATION_CATEGORIES,
    version_no: 0,
    updated_at: null,
  };
}

async function resolveUsage(account_id: string) {
  const state = await readAppState();
  const activeStories = state.storyWorkspaces.filter((item) => item.account_id === account_id);
  const storyIds = new Set(activeStories.map((item) => item.id));
  const branchCount = state.storyBranches.filter((item) => storyIds.has(item.story_id)).length;
  const exportJobCount = state.exportJobs.filter((item) => item.account_id === account_id && item.status !== "blocked").length;

  return {
    active_story_count: activeStories.length,
    branch_count: branchCount,
    export_job_count: exportJobCount,
  };
}

async function resolveTextGenerationBudget(account_id: string) {
  const config = readAiRuntimeConfig();
  const budget = config.capability_plane.capability_registry.text_generation.budget;
  const usedSnapshot = (
    await createObservabilityRepository().listMetricSnapshots({
      metric_key: budget.metric_key,
      segment_key: `account:${account_id}`,
    })
  )[0];
  const usedTodayUsd = roundUsd(usedSnapshot?.value ?? 0);
  const remainingTodayUsd = roundUsd(clampRemaining(budget.max_cost_usd_per_day, usedTodayUsd));

  return {
    capability: "text_generation" as const,
    status: remainingTodayUsd >= budget.max_cost_usd_per_request ? ("ready" as const) : ("blocked" as const),
    metric_key: budget.metric_key,
    daily_limit_usd: budget.max_cost_usd_per_day,
    estimated_request_cost_usd: budget.max_cost_usd_per_request,
    used_today_usd: usedTodayUsd,
    remaining_today_usd: remainingTodayUsd,
  };
}

function buildGate(input: {
  gate_key: "story_slots" | "branch_quota" | "export_quota" | "ai_text_generation";
  status: "ready" | "blocked";
  reason_code: string | null;
  detail: string;
}) {
  return input;
}

export async function getAccountRuntimeControl(account_id: string) {
  const entitlement = await resolveEntitlement(account_id);
  const usage = await resolveUsage(account_id);
  const ai_budget = await resolveTextGenerationBudget(account_id);
  const notificationPreference = await resolveNotificationPreference(account_id);
  const privacyRequests = await createAccountMembershipRepository().listPrivacyDataRequestsByAccount(account_id);

  const remaining = {
    story_slots: clampRemaining(entitlement.story_slots, usage.active_story_count),
    export_quota: clampRemaining(entitlement.export_quota, usage.export_job_count),
    branch_quota: clampRemaining(entitlement.branch_quota, usage.branch_count),
  };

  return {
    usage,
    remaining,
    ai_budget,
    gates: [
      buildGate({
        gate_key: "story_slots",
        status: remaining.story_slots > 0 ? "ready" : "blocked",
        reason_code: remaining.story_slots > 0 ? null : "story_slots_exhausted",
        detail:
          remaining.story_slots > 0
            ? `仍可新开 ${remaining.story_slots} 条故事。`
            : "当前故事槽位已用尽，需先升级会员或关闭旧故事后再新开。",
      }),
      buildGate({
        gate_key: "branch_quota",
        status: remaining.branch_quota > 0 ? "ready" : "blocked",
        reason_code: remaining.branch_quota > 0 ? null : "branch_quota_exhausted",
        detail:
          remaining.branch_quota > 0
            ? `仍可再拉出 ${remaining.branch_quota} 条分支。`
            : "当前分支额度已用尽，新的分支与冲突分流会被阻断。",
      }),
      buildGate({
        gate_key: "export_quota",
        status: remaining.export_quota > 0 ? "ready" : "blocked",
        reason_code: remaining.export_quota > 0 ? null : "export_quota_exhausted",
        detail:
          remaining.export_quota > 0
            ? `本周期仍可导出 ${remaining.export_quota} 次。`
            : "本周期导出额度已用尽，需先升级会员后再发起新的导出。",
      }),
      buildGate({
        gate_key: "ai_text_generation",
        status: ai_budget.status,
        reason_code: ai_budget.status === "ready" ? null : "ai_daily_budget_exhausted",
        detail:
          ai_budget.status === "ready"
            ? `今日 AI 预算剩余 $${ai_budget.remaining_today_usd}。`
            : "今日 AI 文本预算已见底，新的提案或章节生成会被阻断。",
      }),
    ],
    notification: {
      effective_channels: [
        notificationPreference.in_app_enabled ? "in_app" : null,
        notificationPreference.push_enabled ? "push" : null,
        notificationPreference.im_enabled ? "im" : null,
      ].filter((item): item is string => Boolean(item)),
      enabled_categories: Object.entries(notificationPreference.categories)
        .filter(([, enabled]) => enabled)
        .map(([key]) => key),
      updated_at: notificationPreference.updated_at,
    },
    privacy: {
      open_request_count: privacyRequests.filter((item) => item.status === "queued" || item.status === "cooling_off").length,
      cooling_off_request_count: privacyRequests.filter((item) => item.status === "cooling_off").length,
      latest_request_id: privacyRequests[0]?.id ?? null,
    },
  };
}

export async function resolveUnreadNotificationCount(account_id: string) {
  return (
    await listUnifiedNotificationFeed({
      account_id,
      unread_only: true,
      limit: 200,
    })
  ).length;
}

export async function assertStorySlotAvailable(account_id: string) {
  const control = await getAccountRuntimeControl(account_id);

  if (control.remaining.story_slots <= 0) {
    throw new ConflictException("story_slots_exhausted");
  }
}

export async function assertBranchQuotaAvailable(account_id: string) {
  const control = await getAccountRuntimeControl(account_id);

  if (control.remaining.branch_quota <= 0) {
    return {
      status: "blocked" as const,
      reason_code: "branch_quota_exhausted" as const,
    };
  }

  return {
    status: "ready" as const,
    reason_code: null,
  };
}

export async function assertExportQuotaAvailable(account_id: string) {
  const control = await getAccountRuntimeControl(account_id);

  if (control.remaining.export_quota <= 0) {
    return {
      status: "blocked" as const,
      reason_code: "export_quota_exhausted" as const,
    };
  }

  return {
    status: "ready" as const,
    reason_code: null,
  };
}

export async function assertAccountAiBudgetAvailable(account_id: string, capability: AiCapabilityKey) {
  if (capability !== "text_generation") {
    return;
  }

  const budget = await resolveTextGenerationBudget(account_id);

  if (budget.remaining_today_usd < budget.estimated_request_cost_usd) {
    throw new ConflictException("ai_daily_budget_exhausted");
  }
}

export async function recordAccountCapabilitySpend(input: {
  account_id: string;
  capability: AiCapabilityKey;
  provider_id: string | null;
  observed_cost_usd?: number | null;
}) {
  const config = readAiRuntimeConfig();
  const budget = config.capability_plane.capability_registry[input.capability].budget;
  const observed = input.observed_cost_usd ?? null;
  const spend =
    observed !== null && Number.isFinite(observed)
      ? roundUsd(Math.min(Math.max(observed, 0), budget.max_cost_usd_per_request))
      : input.provider_id
        ? budget.max_cost_usd_per_request
        : 0;

  if (spend <= 0) {
    const repository = createObservabilityRepository();
    const segment_key = `account:${input.account_id}`;
    const usedTodayUsd =
      (
        await repository.listMetricSnapshots({
          metric_key: budget.metric_key,
          segment_key,
        })
      )[0]?.value ?? 0;
    return {
      metric_key: budget.metric_key,
      used_today_usd: roundUsd(usedTodayUsd),
      remaining_today_usd: roundUsd(clampRemaining(budget.max_cost_usd_per_day, usedTodayUsd)),
    };
  }

  const repository = createObservabilityRepository();
  const segment_key = `account:${input.account_id}`;
  const currentValue =
    (
      await repository.listMetricSnapshots({
        metric_key: budget.metric_key,
        segment_key,
      })
    )[0]?.value ?? 0;
  const nextValue = roundUsd(currentValue + spend);

  await repository.upsertMetricSnapshot({
    metric_key: budget.metric_key,
    segment_key,
    value: nextValue,
  });

  return {
    metric_key: budget.metric_key,
    used_today_usd: nextValue,
    remaining_today_usd: roundUsd(clampRemaining(budget.max_cost_usd_per_day, nextValue)),
  };
}

export async function validateNotificationPreferenceInput(input: {
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
}) {
  const anyChannelEnabled = input.in_app_enabled || input.push_enabled || input.im_enabled;
  const anyCategoryEnabled = Object.values(input.categories).some(Boolean);

  if (!anyChannelEnabled && anyCategoryEnabled) {
    throw new BadRequestException("notification_channels_required");
  }

  if (input.quiet_hours.enabled && input.quiet_hours.start_local === input.quiet_hours.end_local) {
    throw new BadRequestException("quiet_hours_window_invalid");
  }
}

export async function validatePrivacyDataRequestInput(input: {
  account_id: string;
  request_type: "export" | "delete" | "revoke_consent";
  scope: "account" | "story" | "asset";
  story_id?: string;
}) {
  if (input.scope === "story" && !input.story_id) {
    throw new BadRequestException("story_scope_requires_story_id");
  }

  if (input.story_id) {
    const workspace = await createStoryWorkspaceRepository().findWorkspaceById(input.story_id);

    if (!workspace || workspace.account_id !== input.account_id) {
      throw new ConflictException("story_scope_not_owned_by_account");
    }
  }

  const existing = await createAccountMembershipRepository().listPrivacyDataRequestsByAccount(input.account_id);
  const duplicateOpen = existing.find((item) => {
    if (item.status !== "queued" && item.status !== "cooling_off") {
      return false;
    }

    if (item.request_type !== input.request_type || item.scope !== input.scope) {
      return false;
    }

    return item.story_id === (input.story_id ?? null);
  });

  if (duplicateOpen) {
    throw new ConflictException("privacy_request_already_open");
  }
}
