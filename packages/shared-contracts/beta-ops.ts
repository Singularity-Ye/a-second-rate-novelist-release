import type { OpsActorRole, OpsCasePriority, OpsCaseStatus } from "./ops-analytics.js";

export type BetaSupportSurface = "chat" | "room" | "export" | "account";

export type BetaSupportCategory =
  | "story_quality"
  | "delivery_blocker"
  | "channel_sync"
  | "billing_membership"
  | "onboarding_blocker"
  | "other";

export type BetaSupportStatus = "submitted" | "triaged" | "pending_user" | "resolved" | "rejected";

export type BetaSupportTargetObjectType = "chat_thread" | "room_session" | "export_job" | "account_overview";

export interface BetaSupportCaseCreateRequest {
  account_token: string;
  story_id?: string | null;
  surface: BetaSupportSurface;
  category: BetaSupportCategory;
  summary: string;
  description: string;
  target_object: {
    object_type: BetaSupportTargetObjectType;
    object_id: string;
    object_label?: string | null;
  };
  client_request_id: string;
}

export interface BetaSupportCaseResponse {
  case_type: "beta_support";
  case_id: string;
  ops_case_id: string;
  status: BetaSupportStatus;
  surface: BetaSupportSurface;
  category: BetaSupportCategory;
  priority: OpsCasePriority;
  summary: string;
  description: string;
  target_object: {
    object_type: BetaSupportTargetObjectType;
    object_id: string;
    object_label: string | null;
  };
  latest_status_note: string | null;
  created_at: string;
  updated_at: string;
  sla_due_at: string;
  target_route: string;
}

export type BetaIncidentSeverity = "info" | "warn" | "critical";
export type BetaIncidentStatus = "monitoring" | "degraded" | "stop_service" | "resolved";
export type BetaIncidentSurface = "chat" | "room" | "notifications" | "export" | "account";

export interface BetaIncidentBroadcastView {
  incident_id: string;
  severity: BetaIncidentSeverity;
  status: BetaIncidentStatus;
  headline: string;
  summary: string;
  recommended_action: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface BetaSupportOverviewResponse {
  entry: {
    sla_copy: string;
    support_hours_copy: string;
    history_url: string;
  };
  active_incidents: BetaIncidentBroadcastView[];
  cases: BetaSupportCaseResponse[];
  daily_digest: {
    active_beta_accounts: number;
    open_case_count: number;
    pending_user_count: number;
    top_categories: BetaSupportCategory[];
  };
}

export interface OpsBetaSupportOverviewResponse {
  queue: {
    open: number;
    pending_user: number;
    resolved_today: number;
    overdue: number;
  };
  daily_digest: {
    active_beta_accounts: number;
    new_cases_today: number;
    followup_due_today: number;
    top_categories: BetaSupportCategory[];
  };
  active_incidents: BetaIncidentBroadcastView[];
  recent_cases: Array<{
    case_id: string;
    case_type: "beta_support";
    status: OpsCaseStatus;
    priority: OpsCasePriority;
    summary: string;
    owner_id: string | null;
    sla_due_at: string;
  }>;
}

export interface OpsBetaIncidentCreateRequest {
  actor_role?: OpsActorRole;
  actor_id?: string;
  severity: BetaIncidentSeverity;
  status: Exclude<BetaIncidentStatus, "resolved">;
  headline: string;
  summary: string;
  recommended_action: string;
  program_key: string;
  affected_surfaces: BetaIncidentSurface[];
}

export interface OpsBetaIncidentCreateResponse {
  incident_id: string;
  status: Exclude<BetaIncidentStatus, "resolved">;
  created_at: string;
  notified_account_count: number;
}

export interface OpsBetaIncidentResolveResponse {
  incident_id: string;
  status: "resolved";
  resolved_at: string;
}
