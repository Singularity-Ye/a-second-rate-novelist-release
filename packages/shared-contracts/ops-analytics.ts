export type OpsActorRole = "ops_support" | "ops_risk_reviewer" | "ops_finance" | "admin" | "pm";

export type OpsFreshnessStatus = "fresh" | "stale" | "delayed";

export type OpsCaseType =
  | "export_review"
  | "risk_review"
  | "membership_exception"
  | "environment_alert"
  | "public_report"
  | "beta_support";

export type OpsCasePriority = "P0" | "P1" | "P2";

export type OpsCaseStatus = "open" | "triaged" | "pending_user" | "pending_review" | "resolved" | "rejected";

export interface OpsDashboardOverviewResponse {
  freshness_status: OpsFreshnessStatus;
  north_star: {
    metric_key: "weekly_story_followers";
    label: string;
    value: number;
    delta_ratio: number;
  };
  funnel_summary: Array<{
    funnel_key: string;
    label: string;
    conversion_rate: number;
    sample_size: number;
  }>;
  reliability_summary: {
    export_partial_failure_count: number;
    notification_backlog_count: number;
    data_quality_alert_count: number;
  };
  revenue_summary: {
    paid_order_count: number;
    paid_amount_total: number;
    active_subscription_count: number;
  };
  open_case_counts: {
    open: number;
    pending_review: number;
    pending_user: number;
  };
}

export interface OpsFunnelResponse {
  funnel_key: string;
  freshness_status: OpsFreshnessStatus;
  sample_size: number;
  steps: Array<{
    step_key: string;
    label: string;
    user_count: number;
    conversion_rate: number;
    median_duration_ms: number;
  }>;
  drop_offs: Array<{
    from_step_key: string;
    to_step_key: string;
    drop_off_count: number;
    drop_off_ratio: number;
  }>;
}

export interface OpsUsersSearchResponse {
  items: Array<{
    user_id: string;
    display_name: string;
    primary_channel: string;
    membership_tier: string;
    active_story_count: number;
    last_seen_at: string | null;
    pii_masked: boolean;
  }>;
  next_cursor: string | null;
}

export interface OpsUser360Response {
  account: {
    account_id: string;
    display_name: string;
    account_status: string;
    primary_channel: string;
    membership_tier: string;
    active_story_count: number;
    pii_masked: boolean;
  };
  active_stories: Array<{
    story_id: string;
    title: string;
    workspace_status: string;
    current_chapter_id: string | null;
  }>;
  notifications: Array<{
    notification_id: string;
    category: string;
    status: string;
    source_type: string;
    title: string;
  }>;
  open_cases: Array<{
    case_id: string;
    case_type: OpsCaseType;
    status: OpsCaseStatus;
    priority: OpsCasePriority;
    summary: string;
  }>;
  recent_events: Array<{
    event_name: string;
    created_at: string;
  }>;
}

export interface OpsStory360Response {
  story: {
    story_id: string;
    title: string;
    workspace_status: string;
    account_id: string;
    current_chapter_id: string | null;
  };
  export_summary: {
    latest_job_status: string | null;
    latest_risk_result: string | null;
    evidence_pack_count: number;
  };
  notifications: Array<{
    notification_id: string;
    source_type: string;
    title: string;
  }>;
  related_cases: Array<{
    case_id: string;
    case_type: OpsCaseType;
    status: OpsCaseStatus;
    summary: string;
  }>;
}

export interface OpsReviewCasesResponse {
  items: Array<{
    case_id: string;
    case_type: OpsCaseType;
    priority: OpsCasePriority;
    status: OpsCaseStatus;
    entity_type: string;
    entity_id: string;
    summary: string;
    owner_id: string | null;
    sla_due_at: string;
  }>;
  counts: Record<OpsCaseStatus, number>;
}

export interface OpsReviewCaseDecisionResponse {
  case_id: string;
  status: OpsCaseStatus;
  decision_at: string;
}
