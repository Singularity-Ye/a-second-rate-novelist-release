export type BetaProgramStatus = "active" | "paused";
export type BetaAccessState = "ready" | "waitlisted" | "blocked";
export type BetaOnboardingStatus = "invite_required" | "invite_redeemed" | "chat_ready" | "waitlisted" | "blocked";
export type BetaEntryChannel = "h5" | "wechat" | "feishu";
export type BetaInviteStatus = "available" | "redeemed" | "exhausted";
export type BetaInviteIssuer = "ops_seed" | "referral";
export type BetaInviteRedeemErrorCode = "invite_not_found" | "invite_exhausted";

export interface BetaProgramSummary {
  program_key: string;
  status: BetaProgramStatus;
  seat_limit: number;
  seats_used: number;
  waitlist_open: boolean;
  invite_only: boolean;
}

export interface BetaInviteSummary {
  invite_code: string;
  status: BetaInviteStatus;
  source_channel: string;
  source_label: string;
  campaign_key: string;
  inviter_account_id: string | null;
  root_invite_code: string | null;
  issued_by: BetaInviteIssuer;
  allowed_channels: BetaEntryChannel[];
  max_redemptions: number;
  redeemed_count: number;
}

export interface BetaAttributionView {
  source_channel: string;
  source_label: string;
  campaign_key: string;
  inviter_account_id: string | null;
  root_invite_code: string | null;
}

export interface BetaAccessAccountView {
  account_id: string;
  account_token: string;
  invite_code: string;
  access_state: BetaAccessState;
  onboarding_status: BetaOnboardingStatus;
  primary_channel: string;
  bound_channels: BetaEntryChannel[];
  allowed_channels: BetaEntryChannel[];
  next_step_copy: string;
  deny_reason_copy: string | null;
  attribution: BetaAttributionView;
  share_invites: BetaInviteSummary[];
  entry_links: {
    beta_url: string;
    chat_url: string | null;
    room_url: string | null;
  };
  runtime_gate_summary: {
    story_slots_status: "ready" | "blocked";
    branch_quota_status: "ready" | "blocked";
    ai_budget_status: "ready" | "blocked";
  };
}

export interface BetaAccessStatusResponse {
  program: BetaProgramSummary;
  invite: BetaInviteSummary | null;
  account: BetaAccessAccountView | null;
}

export interface BetaInviteRedeemRequest {
  invite_code: string;
  entry_channel: BetaEntryChannel;
  accepted_policy_version?: string;
  client_request_id?: string;
  account_token?: string;
}

export interface BetaInviteRedeemResponse extends BetaAccessAccountView {}

export interface BetaInviteRedeemErrorResponse {
  error_code: BetaInviteRedeemErrorCode;
  message: string;
  invite_code: string;
  invite_status: BetaInviteStatus | "invalid";
}

export interface BetaAccessChannelBindRequest {
  account_token: string;
  channel: BetaEntryChannel;
  provider_user_id: string;
  set_as_primary: boolean;
}

export interface BetaAccessChannelBindResponse {
  binding_id: string;
  onboarding_status: BetaOnboardingStatus;
  bound_channels: BetaEntryChannel[];
  next_step_copy: string;
}

export interface OpsBetaAccessOverviewResponse {
  program: BetaProgramSummary;
  invites: {
    issued: number;
    redeemed: number;
    available: number;
    waitlisted: number;
    shared: number;
  };
  source_breakdown: Array<{
    source_channel: string;
    source_label: string;
    campaign_key: string;
    redeemed_count: number;
    approved_count: number;
  }>;
  channel_breakdown: Array<{
    channel: BetaEntryChannel;
    bound_count: number;
  }>;
  recent_accounts: Array<{
    account_token: string;
    access_state: BetaAccessState;
    onboarding_status: BetaOnboardingStatus;
    invite_code: string;
    source_label: string;
  }>;
}
