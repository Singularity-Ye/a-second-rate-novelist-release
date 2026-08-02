export interface AccountRuntimeGateView {
  gate_key: "story_slots" | "branch_quota" | "export_quota" | "ai_text_generation";
  status: "ready" | "blocked";
  reason_code: string | null;
  detail: string;
}

export interface AccountAiBudgetView {
  capability: "text_generation";
  status: "ready" | "blocked";
  metric_key: string;
  daily_limit_usd: number;
  estimated_request_cost_usd: number;
  used_today_usd: number;
  remaining_today_usd: number;
}

export interface AccountOverviewResponse {
  account: {
    account_id: string;
    account_status: "guest" | "active" | "recovery_pending" | "deletion_pending" | "deleted";
    primary_channel: string;
    unread_notification_count: number;
  };
  entitlements: {
    current_plan_id: string;
    story_slots: number;
    export_quota: number;
    branch_quota: number;
    asset_storage_mb: number;
  };
  sync_summary: {
    device_count: number;
    pending_conflict_count: number;
    sync_health: "healthy" | "degraded" | "offline";
  };
  runtime_control: {
    usage: {
      active_story_count: number;
      branch_count: number;
      export_job_count: number;
    };
    remaining: {
      story_slots: number;
      export_quota: number;
      branch_quota: number;
    };
    ai_budget: AccountAiBudgetView;
    gates: AccountRuntimeGateView[];
    notification: {
      effective_channels: string[];
      enabled_categories: string[];
      updated_at: string | null;
    };
    privacy: {
      open_request_count: number;
      cooling_off_request_count: number;
      latest_request_id: string | null;
    };
  };
}

export interface GuestUpgradeResponse {
  account_id: string;
  status: "active";
  merged_guest_story_count: number;
  primary_channel: string;
  session_expires_at: string;
}

export interface ChannelBindingResponse {
  binding_id: string;
  status: "verified";
  is_primary: boolean;
  recovery_enabled: boolean;
}

export interface SyncConflictView {
  conflict_id: string;
  object_type: string;
  status: "detected" | "auto_merged" | "user_action_required" | "resolved";
}

export interface SyncStatusResponse {
  account_id: string;
  device_count: number;
  active_devices: Array<{
    device_id: string;
    device_type: string;
    last_active_at: string;
  }>;
  pending_conflict_count: number;
  sync_health: "healthy" | "degraded" | "offline";
  offline_changes_count: number;
  pending_conflicts: SyncConflictView[];
}

export interface SyncConflictResolveResponse {
  conflict_id: string;
  status: "resolved";
  resulting_branch_id: string | null;
  evidence_entry_id: string;
}

export interface NotificationPreferenceResponse {
  preference_version: number;
  effective_channels: string[];
  next_quiet_window: {
    start_local: string;
    end_local: string;
    time_zone: string;
  } | null;
}

export interface MembershipOrderResponse {
  order_id: string;
  checkout_status: "paid";
  payable_amount: number;
  entitlement_preview: {
    current_plan_id: string;
    story_slots: number;
    export_quota: number;
    branch_quota: number;
    asset_storage_mb: number;
  };
}

export interface MembershipOrderListResponse {
  orders: Array<{
    order_id: string;
    target_plan_id: string;
    billing_cycle: string;
    status: "paid";
    payable_amount: number;
    created_at: string;
    invoice_download_url: string;
    refund_status: "not_requested" | "pending_review" | "resolved" | "rejected";
    refund_case_id: string | null;
  }>;
}

export interface MembershipRefundResponse {
  case_id: string;
  order_id: string;
  refund_status: "pending_review" | "resolved" | "rejected";
}

export interface PrivacyDataRequestResponse {
  data_request_id: string;
  status: "queued" | "cooling_off";
  due_at: string;
  cooling_off_until: string | null;
}

export interface NotificationListResponse {
  items: Array<{
    notification_id: string;
    category: "chapter_update" | "export" | "risk" | "membership" | "system";
    title: string;
    body: string;
    status: "unread" | "read" | "delivered" | "seen" | "acted" | "expired";
    source_type: string;
    created_at: string;
    target_route: string;
  }>;
  preference_summary: {
    in_app_enabled: boolean;
    push_enabled: boolean;
    im_enabled: boolean;
    quiet_hours_enabled: boolean;
    quiet_hours_start_local: string;
    quiet_hours_end_local: string;
  };
}
