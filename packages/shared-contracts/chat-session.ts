import type { PolicyVerdictView } from "./governance-policy.js";

export type ChannelKind = "wechat" | "feishu" | "h5" | "app" | "web_embed";
export type ChannelAdapterKind =
  | "clawbot_text_webhook"
  | "feishu_text_webhook"
  | "h5_session_bridge"
  | "room_session_bridge"
  | "generic_channel_gateway";
export type AccountStatus =
  | "guest"
  | "registered"
  | "subscribed"
  | "suspended"
  | "active"
  | "recovery_pending"
  | "deletion_pending"
  | "deleted";
export type PersonaSurfaceState =
  | "welcoming"
  | "waiting_for_user"
  | "writing"
  | "revising"
  | "stuck"
  | "resting"
  | "asset_processing";
export type DeepLinkTargetRoute = "/chat" | "/room" | `/${string}`;
export type ChannelAttachmentKind = "voice" | "image" | "document" | "unknown";
export type ChannelAttachmentSourceKind = "inline_text" | "inline_base64" | "remote_url" | "metadata_only";
export type ChannelMultimodalCapability = "asr" | "ocr_document_extraction" | "vision_understanding";

export interface ChannelAttachmentMetadata {
  file_name: string;
  mime_type: string;
  size_bytes: number;
  attachment_kind?: ChannelAttachmentKind;
  source_url?: string | null;
  inline_text?: string | null;
  inline_bytes_base64?: string | null;
}

export interface ChannelAttachmentCapabilityPreflightView {
  capability: ChannelMultimodalCapability;
  status: "ready" | "degraded" | "blocked";
  backend_id: string;
  budget_max_cost_usd: number;
  timeout_ms: number;
  secret_scope: string[];
  fallback_capability: string | null;
}

export interface ChannelAttachmentStructuredResultView {
  summary: string;
  structured_text_preview: string | null;
  source_excerpt: string | null;
}

export interface ChannelAttachmentHandoffView extends ChannelAttachmentMetadata {
  handoff_id: string;
  handoff_mode: "metadata_only" | "resolved";
  target: "multimodal_intake_queue";
  status: "deferred" | "processed" | "blocked";
  source_kind?: ChannelAttachmentSourceKind;
  capability_preflight?: ChannelAttachmentCapabilityPreflightView | null;
  artifact_ref_id?: string | null;
  reference_asset_id?: string | null;
  blocked_reason?: string | null;
  structured_result?: ChannelAttachmentStructuredResultView | null;
}

export interface ChannelCapabilityPreflightView {
  capability: "text_generation";
  status: "ready" | "degraded" | "blocked";
  backend_id: string;
  budget_max_cost_usd: number;
  timeout_ms: number;
  secret_scope: string[];
}

export interface ChannelEventView {
  event_id: string;
  channel: ChannelKind;
  adapter_kind: ChannelAdapterKind;
  direction: "inbound";
  provider_message_id: string;
  idempotency_key: string;
  status: "delivered" | "replayed";
  deduplicated: boolean;
  linked_message_id: string | null;
  linked_intent_id: string | null;
  linked_route_decision_id: string | null;
  created_at: string;
  capability_preflight: ChannelCapabilityPreflightView;
  attachment_handoff: ChannelAttachmentHandoffView[];
  policy_verdict?: PolicyVerdictView;
}

export interface ChannelDeliveryAttemptView {
  attempt_no: number;
  status: "succeeded" | "failed";
  attempted_at: string;
  error_message: string | null;
}

export interface ChannelDeliverySegmentView {
  segment_id: string;
  segment_index: number;
  kind: "ack" | "reply";
  text: string;
  status: "succeeded" | "failed";
  provider_delivery_id: string | null;
  attempts: ChannelDeliveryAttemptView[];
}

export interface ChannelDeliveryView {
  delivery_id: string;
  channel_event_id: string;
  channel: ChannelKind;
  adapter_kind: ChannelAdapterKind;
  status: "succeeded" | "partial_failed" | "failed";
  attempt_count: number;
  max_attempts: number;
  retry_backoff_ms: number;
  created_at: string;
  segments: ChannelDeliverySegmentView[];
  last_error: string | null;
}

export interface ChannelMessageRequest {
  channel_message_id: string;
  channel: ChannelKind;
  account_token: string;
  provider_message_id?: string;
  adapter_kind?: ChannelAdapterKind;
  text?: string;
  attachments?: ChannelAttachmentMetadata[];
  client_context?: {
    source_surface?: "chat" | "room";
    active_story_id?: string | null;
  };
}

export interface DeepLinkTokenPayload {
  account_id: string;
  account_token: string;
  target_route: DeepLinkTargetRoute;
  issued_at: string;
  expires_at: string;
}

export interface DeepLinkExchangeRequest {
  token: string;
}

export interface DeepLinkIssueRequest {
  account_token: string;
  target_route: DeepLinkTargetRoute;
}

export interface DeepLinkIssueResponse {
  token: string;
  target_route: DeepLinkTargetRoute;
  expires_at: string;
}

export interface DeepLinkExchangeResponse {
  account_id: string;
  account_token: string;
  target_route: DeepLinkTargetRoute;
  expires_at: string;
}

export interface ChatSessionResponse {
  account_id: string;
  account_token: string;
  account_status: AccountStatus;
  session_id: string;
  normalized_message: {
    id: string;
    channel_message_id: string;
    channel: ChannelKind;
    text: string;
  };
  deep_link: string;
  persona_state: {
    label: string;
    state: PersonaSurfaceState;
  };
  policy_verdict?: PolicyVerdictView;
  channel_event?: ChannelEventView;
  delivery?: ChannelDeliveryView;
}
