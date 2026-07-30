import type {
  ChannelDeliveryView,
  ChannelEventView,
  ChannelKind,
  PersonaSurfaceState,
} from "./chat-session.js";
import type { PolicyVerdictView } from "./governance-policy.js";

export type ConfidenceBand = "high" | "medium" | "low";
export type ChatRouteMode = "auto" | "clarified" | "parked";
export type ChatRouteStatus = "auto_resolved" | "ambiguous" | "user_confirmed" | "parked_to_recent";
export type ChatIntentType =
  | "onboarding_step"
  | "story_context"
  | "relationship_ping"
  | "relationship_dialogue"
  | "recent_note"
  | "quick_action"
  | "new_story_intake"
  | "revision_request";
export type AckTargetType = "story_workspace" | "recent_notes" | "reader_profile" | "route_decision";
export type RelationshipMemoryType =
  | "care_signal"
  | "reassurance"
  | "tease"
  | "complaint"
  | "ritual";
export type IntentEnvelopeSurface = "wechat_im" | "room" | "reader" | "export_center";
export type IntentRouteHint =
  | "interviewer"
  | "architect"
  | "scene_writer"
  | "canon_keeper"
  | "rights_clerk"
  | "coordinator_only";
export type IntentTargetObjectType =
  | "reader_profile"
  | "canon"
  | "chapter"
  | "branch"
  | "workspace"
  | "asset"
  | "export_job"
  | "relationship_memory"
  | "route_decision"
  | "recent_note";
export type IntentCorrectionStatus = "recorded" | "needs_clarification" | "corrected" | "replayed";

export interface IntentEnvelopeView {
  envelope_id: string;
  surface: IntentEnvelopeSurface;
  message: {
    message_id: string;
    channel_message_id: string;
    channel: ChannelKind;
    text: string;
    attachments: Array<{
      file_name: string;
      mime_type: string;
      size_bytes: number;
    }>;
  };
  actor_context: {
    account_id: string;
    session_id: string;
    story_id: string | null;
    chapter_id: string | null;
  };
  intent_seed: {
    raw_text: string;
    source_surface: "chat" | "room";
  };
  delivery_constraints: {
    reply_window: "active" | "passive_limited";
    max_segment_chars: number;
    async_allowed: boolean;
  };
}

export interface IntentTargetObjectView {
  object_type: IntentTargetObjectType;
  object_id: string | null;
  object_label: string;
}

export interface IntentConfidenceView {
  score: number;
  band: ConfidenceBand;
}

export interface IntentCorrectionStateView {
  status: IntentCorrectionStatus;
  entry_deep_link: string | null;
  last_corrected_at: string | null;
}

export interface IntentPatchView {
  intent_id: string;
  envelope_id: string;
  intent_type: ChatIntentType;
  target_object: IntentTargetObjectView;
  proposed_patch: Record<string, unknown>;
  confidence: IntentConfidenceView;
  ack_copy: string;
  route_hint: IntentRouteHint;
  correction_state: IntentCorrectionStateView;
}

export interface StoryCandidateView {
  story_id: string;
  story_title: string;
  confidence_score: number;
  reason_labels: string[];
}

export interface ChatReplyView {
  text: string;
}

export interface ChatAckView {
  intent_id: string;
  intent_type: ChatIntentType;
  target_type: AckTargetType;
  target_id: string | null;
  target_label: string;
  deep_link: string | null;
  confidence_band: ConfidenceBand;
  ack_copy: string;
}

export interface ChatRoutingView {
  route_decision_id: string;
  status: ChatRouteStatus;
  route_mode: ChatRouteMode;
  confidence_score: number;
  confidence_band: ConfidenceBand;
  selected_story_id: string | null;
  selected_story_title: string | null;
  candidates: StoryCandidateView[];
}

export interface QuickActionView {
  action_key: string;
  label: string;
  intent_type: ChatIntentType;
  requires_story: boolean;
  requires_chapter: boolean;
  tracking_payload: Record<string, string | number | boolean | null>;
}

export interface ChatMessageResponse {
  account_id: string;
  account_token: string;
  account_status:
    | "guest"
    | "registered"
    | "subscribed"
    | "suspended"
    | "active"
    | "recovery_pending"
    | "deletion_pending"
    | "deleted";
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
  intent_envelope: IntentEnvelopeView;
  intent_patch: IntentPatchView;
  reply: ChatReplyView;
  ack: ChatAckView;
  routing: ChatRoutingView;
  follow_up_actions: QuickActionView[];
  policy_verdict?: PolicyVerdictView;
  channel_event?: ChannelEventView;
  delivery?: ChannelDeliveryView;
}

export interface ChatContextResolveRequest {
  route_decision_id: string;
  selected_story_id?: string;
  fallback_mode?: "new_story" | "recent_notes";
}

export interface ChatContextResolveResponse {
  resolved_story: {
    story_id: string | null;
    story_title: string;
  };
  ack: ChatAckView;
  replayed_reply: ChatReplyView;
  routing: ChatRoutingView;
  follow_up_actions: QuickActionView[];
}
