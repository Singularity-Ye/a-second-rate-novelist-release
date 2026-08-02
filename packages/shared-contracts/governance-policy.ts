export type PolicyVerdict = "allow" | "warn" | "block" | "human_review";
export type PolicyScope = "private_chat" | "story_intake" | "chapter_generation" | "export" | "attachment";
export type PolicySafetyMode = "default" | "minor_safe" | "strict";
export type PolicyRiskTag =
  | "minor"
  | "sexual_content"
  | "self_harm"
  | "illegal_activity"
  | "abuse_throttle"
  | "suspicious_attachment"
  | "export_label"
  | "export_rights";

export interface PolicyCapabilityTraceView {
  capability: "policy_moderation";
  selected_capability: "policy_moderation" | "human_review_trigger";
  strategy: "model_route" | "human_review";
  backend_id: string;
  provider_id: string | null;
  model_id: string | null;
  timeout_ms: number;
  fallback_applied: boolean;
  attempted_routes: string[];
  secret_scope: string[];
  supply_mode: string;
  budget_max_cost_usd: number;
}

export interface HumanReviewTriggerView {
  triggered: boolean;
  case_id: string | null;
  queue_key: string | null;
  reason_summary: string | null;
  sla_due_at: string | null;
}

export interface AbuseThrottleView {
  bucket_key: string | null;
  attempts_in_window: number;
  window_seconds: number;
  throttled: boolean;
}

export interface PolicyVerdictView {
  verdict: PolicyVerdict;
  scope: PolicyScope;
  safety_mode: PolicySafetyMode;
  reason_codes: string[];
  risk_tags: PolicyRiskTag[];
  blocking: boolean;
  review_required: boolean;
  moderation: PolicyCapabilityTraceView;
  human_review: HumanReviewTriggerView;
  abuse_throttle: AbuseThrottleView;
  created_at: string;
}
