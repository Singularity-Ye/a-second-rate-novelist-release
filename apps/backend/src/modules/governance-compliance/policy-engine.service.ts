import { randomUUID } from "node:crypto";
import type {
  ExportLabelMode,
  PolicyCapabilityTraceView,
  PolicyRiskTag,
  PolicySafetyMode,
  PolicyScope,
  PolicyVerdict,
  PolicyVerdictView,
} from "@erliu/shared-contracts";
import { createOpsControlRepository } from "../../common/repositories/ops-control.repository.js";
import { readAppState, writeAppState } from "../../common/store.js";
import { readAiRuntimeConfig, resolveAiCapabilityExecutionPlan } from "../ai-runtime/ai-runtime.config.js";
import { recordAccountCapabilitySpend } from "../identity-membership/account-control-plane.service.js";
import { recordDomainEvent } from "../telemetry-intake/telemetry-intake.service.js";

const ABUSE_WINDOW_SECONDS = 10 * 60;
const HUMAN_REVIEW_SLA_HOURS = 2;

const MINOR_PATTERN =
  /(未成年|还没成年|未满十八|未满18|高中生|初中生|小学生|十[二三四五六七]岁|十[二三四五六七]|1[0-7]岁|\bminor\b)/i;
const SEXUAL_PATTERN = /(露骨|性爱|床戏|性描写|亲密描写|smut|explicit|调情|上床)/i;
const SELF_HARM_PATTERN = /(自残|自杀|伤害自己|轻生)/i;
const ILLEGAL_PATTERN = /(炸弹|洗钱|伪造证件|黑客入侵|毒品制作)/i;

export interface EvaluatePolicyVerdictInput {
  scope: PolicyScope;
  account_id: string | null;
  story_id?: string | null;
  source_ref: {
    ref_type: string;
    ref_id: string;
  };
  input_text?: string | null;
  safety_mode?: PolicySafetyMode | null;
  export_context?: {
    label_mode_requested?: ExportLabelMode | null;
    blocked_branch_count?: number;
  };
  attachment_context?: {
    blocked_reason?: string | null;
  };
  abuse_context?: {
    consecutive_blocked_attempts?: number | null;
  };
}

function trimText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

async function resolveSafetyMode(
  account_id: string | null,
  explicit?: PolicySafetyMode | null,
  input_text?: string | null,
): Promise<PolicySafetyMode> {
  if (explicit) {
    return explicit;
  }

  if (trimText(input_text) && MINOR_PATTERN.test(input_text ?? "")) {
    return "minor_safe";
  }

  if (!account_id) {
    return "default";
  }

  const state = await readAppState();
  const profile = state.profiles.find((item) => item.account_id === account_id);
  return profile?.safety_mode ?? "default";
}

function buildModerationTrace(): PolicyCapabilityTraceView {
  const config = readAiRuntimeConfig();
  const plan = resolveAiCapabilityExecutionPlan(config, {
    capability: "policy_moderation",
  });

  return {
    capability: "policy_moderation",
    selected_capability: plan.selected_capability as "policy_moderation" | "human_review_trigger",
    strategy: plan.strategy as "model_route" | "human_review",
    backend_id: plan.backend_id,
    provider_id: plan.provider_id,
    model_id: plan.model_id,
    timeout_ms: plan.timeout_ms,
    fallback_applied: plan.fallback_applied,
    attempted_routes: plan.attempted_routes,
    secret_scope: plan.secret_scope,
    supply_mode: plan.supply_mode,
    budget_max_cost_usd: plan.budget_max_cost_usd,
  };
}

function isSuspiciousAttachment(blocked_reason?: string | null) {
  return [
    "SSRF_PRIVATE_ADDRESS_BLOCKED",
    "ATTACHMENT_SOURCE_PROTOCOL_UNSUPPORTED",
    "ATTACHMENT_SOURCE_URL_INVALID",
    "ATTACHMENT_FETCH_TIMEOUT",
  ].includes(blocked_reason ?? "");
}

async function countRecentBlockedAttempts(
  account_id: string | null,
  scope: PolicyScope,
  risk_tag: PolicyRiskTag,
) {
  if (!account_id) {
    return 0;
  }

  const state = await readAppState();
  const threshold = Date.now() - ABUSE_WINDOW_SECONDS * 1000;
  return state.policyEvaluations.filter((item) => {
    if (item.account_id !== account_id || item.scope !== scope) {
      return false;
    }

    if (!item.risk_tags.includes(risk_tag)) {
      return false;
    }

    if (item.verdict !== "block" && item.verdict !== "human_review") {
      return false;
    }

    return new Date(item.created_at).getTime() >= threshold;
  }).length;
}

async function ensureHumanReviewCase(input: {
  scope: PolicyScope;
  account_id: string | null;
  story_id: string | null;
  source_ref: {
    ref_type: string;
    ref_id: string;
  };
  summary: string;
}) {
  const repository = createOpsControlRepository();
  const existing = (await repository.listOpsCases()).find(
    (item) =>
      item.source_ref.ref_type === input.source_ref.ref_type &&
      item.source_ref.ref_id === input.source_ref.ref_id,
  );

  if (existing) {
    return existing;
  }

  return repository.createOpsCase({
    case_type: "risk_review",
    priority: "P0",
    owner_id: null,
    status: "open",
    entity_type: "policy_verdict",
    entity_id: input.source_ref.ref_id,
    account_id: input.account_id,
    story_id: input.story_id,
    summary: input.summary,
    source_ref: input.source_ref,
    sla_due_at: new Date(Date.now() + HUMAN_REVIEW_SLA_HOURS * 60 * 60 * 1000).toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

function toPolicyVerdictResult(input: {
  verdict: PolicyVerdict;
  scope: PolicyScope;
  safety_mode: PolicySafetyMode;
  reason_codes: string[];
  risk_tags: PolicyRiskTag[];
  moderation: PolicyCapabilityTraceView;
  review_case_id?: string | null;
  review_queue_key?: string | null;
  review_summary?: string | null;
  review_due_at?: string | null;
  abuse_bucket_key?: string | null;
  abuse_attempts: number;
}): PolicyVerdictView {
  return {
    verdict: input.verdict,
    scope: input.scope,
    safety_mode: input.safety_mode,
    reason_codes: unique(input.reason_codes),
    risk_tags: unique(input.risk_tags),
    blocking: input.verdict === "block" || input.verdict === "human_review",
    review_required: input.verdict === "human_review",
    moderation: input.moderation,
    human_review: {
      triggered: input.verdict === "human_review",
      case_id: input.review_case_id ?? null,
      queue_key: input.review_queue_key ?? null,
      reason_summary: input.review_summary ?? null,
      sla_due_at: input.review_due_at ?? null,
    },
    abuse_throttle: {
      bucket_key: input.abuse_bucket_key ?? null,
      attempts_in_window: input.abuse_attempts,
      window_seconds: ABUSE_WINDOW_SECONDS,
      throttled: input.verdict === "human_review" && input.abuse_attempts >= 3,
    },
    created_at: new Date().toISOString(),
  };
}

async function persistPolicyVerdict(input: EvaluatePolicyVerdictInput, verdict: PolicyVerdictView) {
  const state = await readAppState();
  state.policyEvaluations.push({
    id: randomUUID(),
    scope: input.scope,
    account_id: input.account_id,
    story_id: input.story_id ?? null,
    source_ref: input.source_ref,
    input_preview: trimText(input.input_text)?.slice(0, 240) ?? input.attachment_context?.blocked_reason ?? null,
    verdict: verdict.verdict,
    reason_codes: verdict.reason_codes,
    risk_tags: verdict.risk_tags,
    safety_mode: verdict.safety_mode,
    review_case_id: verdict.human_review.case_id,
    created_at: verdict.created_at,
  });
  await writeAppState(state);

  if (input.account_id) {
    await recordDomainEvent({
      event_name: verdict.verdict === "human_review" ? "human_review_triggered" : "policy_verdict_recorded",
      account_id: input.account_id,
      payload: {
        scope: input.scope,
        verdict: verdict.verdict,
        source_ref_type: input.source_ref.ref_type,
        source_ref_id: input.source_ref.ref_id,
        reason_codes: verdict.reason_codes.join(","),
        risk_tags: verdict.risk_tags.join(","),
        review_case_id: verdict.human_review.case_id,
      },
    });
  }
}

export async function evaluatePolicyVerdict(input: EvaluatePolicyVerdictInput): Promise<PolicyVerdictView> {
  const text = trimText(input.input_text) ?? "";
  const safety_mode = await resolveSafetyMode(input.account_id, input.safety_mode, text);
  const moderation = buildModerationTrace();
  const config = readAiRuntimeConfig();
  const humanReviewQueue = config.capability_plane.provider_registry.ops_human_review.queue_key ?? "ops-human-review";
  const reason_codes: string[] = [];
  const risk_tags: PolicyRiskTag[] = [];
  let verdict: PolicyVerdict = "allow";

  if (input.export_context?.label_mode_requested === "label_waiver_requested") {
    verdict = "warn";
    reason_codes.push("POL-EXPORT-LABEL-WAIVER");
    risk_tags.push("export_label");
  }

  if ((input.export_context?.blocked_branch_count ?? 0) > 0) {
    verdict = "block";
    reason_codes.push("POL-EXPORT-RIGHTS-BLOCKED");
    risk_tags.push("export_rights");
  }

  if (text && MINOR_PATTERN.test(text) && SEXUAL_PATTERN.test(text)) {
    verdict = "block";
    reason_codes.push("POL-MINOR-SEXUAL-CONTENT");
    risk_tags.push("minor", "sexual_content");
  } else if (text && SELF_HARM_PATTERN.test(text)) {
    verdict = "human_review";
    reason_codes.push("POL-SELF-HARM-HUMAN-REVIEW");
    risk_tags.push("self_harm");
  } else if (text && ILLEGAL_PATTERN.test(text)) {
    verdict = "block";
    reason_codes.push("POL-ILLEGAL-INSTRUCTIONS");
    risk_tags.push("illegal_activity");
  }

  if (isSuspiciousAttachment(input.attachment_context?.blocked_reason)) {
    verdict = "block";
    reason_codes.push("POL-SUSPICIOUS-ATTACHMENT");
    risk_tags.push("suspicious_attachment");
  }

  const priorAttempts =
    input.abuse_context?.consecutive_blocked_attempts ??
    (risk_tags.includes("suspicious_attachment")
      ? (await countRecentBlockedAttempts(input.account_id, "attachment", "suspicious_attachment")) + 1
      : 0);

  let review_case_id: string | null = null;
  let review_queue_key: string | null = null;
  let review_due_at: string | null = null;
  let review_summary: string | null = null;

  if (priorAttempts >= 3 && risk_tags.includes("suspicious_attachment")) {
    verdict = "human_review";
    reason_codes.push("POL-ABUSE-THROTTLE");
    risk_tags.push("abuse_throttle");
    const reviewCase = await ensureHumanReviewCase({
      scope: input.scope,
      account_id: input.account_id,
      story_id: input.story_id ?? null,
      source_ref: {
        ref_type: "policy_bucket",
        ref_id: `${input.scope}:${input.account_id ?? "anonymous"}:suspicious_attachment`,
      },
      summary: "同一账号在短时间内重复触发可疑附件阻断，需人工复核滥用风险。",
    });
    review_case_id = reviewCase.id;
    review_due_at = reviewCase.sla_due_at;
    review_summary = reviewCase.summary;
    review_queue_key = humanReviewQueue;
  } else if (verdict === "human_review") {
    const reviewCase = await ensureHumanReviewCase({
      scope: input.scope,
      account_id: input.account_id,
      story_id: input.story_id ?? null,
      source_ref: input.source_ref,
      summary: "内容触发人工复核基线，请在继续创作或投递前确认风险结论。",
    });
    review_case_id = reviewCase.id;
    review_due_at = reviewCase.sla_due_at;
    review_summary = reviewCase.summary;
    review_queue_key = humanReviewQueue;
  }

  const result = toPolicyVerdictResult({
    verdict,
    scope: input.scope,
    safety_mode,
    reason_codes,
    risk_tags,
    moderation,
    review_case_id,
    review_queue_key,
    review_due_at,
    review_summary,
    abuse_bucket_key:
      priorAttempts > 0 && risk_tags.includes("suspicious_attachment")
        ? `${input.scope}:${input.account_id ?? "anonymous"}:suspicious_attachment`
        : null,
    abuse_attempts: priorAttempts,
  });

  await persistPolicyVerdict(input, result);

  if (input.account_id) {
    await recordAccountCapabilitySpend({
      account_id: input.account_id,
      capability: moderation.selected_capability === "human_review_trigger" ? "human_review_trigger" : "policy_moderation",
      provider_id: moderation.provider_id,
    });
  }

  return result;
}

export function buildPolicyGuardCopy(verdict: PolicyVerdictView) {
  if (verdict.verdict === "human_review") {
    return {
      ack_copy: "这条内容先进入人工复核，我先不把它推进到创作链里。",
      reply_text: "我先把这条请求停在治理复核里，等人工复核后再继续。",
      sanitized_text: "人工复核中的内容未进入创作链。",
    };
  }

  if (verdict.verdict === "block") {
    return {
      ack_copy: "这条内容触发了安全规则，我先不把它推进到创作链里。",
      reply_text: "我不能继续处理这类内容。你可以换成安全范围内的表达，我会继续帮你。",
      sanitized_text: "被安全规则阻断的内容未进入创作链。",
    };
  }

  return {
    ack_copy: null,
    reply_text: null,
    sanitized_text: null,
  };
}
