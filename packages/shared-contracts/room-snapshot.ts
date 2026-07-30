import type { PersonaSurfaceState } from "./chat-session.js";
import type {
  PersonaSnapshotStatus,
  PersonaStateDetailResponse,
  PersonaStateReasonRefView,
  RoomPendingActionView,
  RoomVisualTokensView,
} from "./persona-state.js";

export type RoomHotspotCode =
  | "desk"
  | "computer"
  | "bookshelf"
  | "archive_profile"
  | "sticky_wall"
  | "mailbox";

export interface RoomOverviewRequest {
  account_token: string;
  story_id?: string | null;
  fallback_target?: RoomHotspotCode | null;
}

export interface RoomPersonaStateView {
  snapshot_id: string;
  label: string;
  state: PersonaSurfaceState;
  state_code: PersonaSurfaceState;
  mood_tags: string[];
  reason_refs: PersonaStateReasonRefView[];
  generated_at: string;
}

export interface RoomStoryCardView {
  story_id: string;
  title: string;
  workspace_status: "draft" | "active" | "paused" | "archived";
  current_chapter_id: string | null;
  chapter_deep_link: string | null;
}

export interface RoomHotspotView {
  hotspot_code: RoomHotspotCode;
  label: string;
  description: string;
  state: "active" | "fallback" | "disabled" | "attention";
  target_route: string;
  entry_story_id: string | null;
}

export interface RoomNotificationView {
  notification_id: string;
  title: string;
  body: string;
  status: "unread" | "read" | "delivered" | "seen" | "acted" | "expired";
  source_type: string;
  target_route: string;
}

export interface RoomFallbackContextView {
  reason_code: "ROOM-001";
  title: string;
  message: string;
  cta_label: string;
  target_route: string;
}

export interface RoomOverviewResponse {
  snapshot_status: PersonaSnapshotStatus;
  persona_state: RoomPersonaStateView;
  room_visual_tokens: RoomVisualTokensView;
  current_story_card: RoomStoryCardView | null;
  objects: RoomHotspotView[];
  pending_actions: RoomPendingActionView[];
  recent_notifications: RoomNotificationView[];
  fallback_context: RoomFallbackContextView | null;
}

export interface RoomPersonaDetailRequest {
  account_token: string;
  story_id?: string | null;
}

export type RoomPersonaDetailResponse = PersonaStateDetailResponse;
