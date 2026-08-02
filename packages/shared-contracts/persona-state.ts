import type { PersonaSurfaceState } from "./chat-session.js";

export type PersonaSnapshotStatus = "snapshot_ready" | "snapshot_degraded";

export type PersonaReasonRefType =
  | "story_workspace"
  | "chapter"
  | "notification"
  | "profile"
  | "system"
  | "canon"
  | "asset";

export interface PersonaStateReasonRefView {
  ref_type: PersonaReasonRefType;
  ref_id: string;
  label: string;
  reason_code?: "ROOM-101";
  visibility?: "visible" | "hidden";
}

export interface RoomVisualTokensView {
  ambience: string;
  desk_state: string;
  lighting: string;
}

export interface RoomPendingActionView {
  action_code: string;
  label: string;
  route: string;
  emphasis: "primary" | "secondary";
}

export interface PersonaStateSnapshotView {
  snapshot_id: string;
  label: string;
  state: PersonaSurfaceState;
  state_code: PersonaSurfaceState;
  mood_tags: string[];
  reason_refs: PersonaStateReasonRefView[];
  generated_at: string;
}

export interface PersonaStateDetailResponse {
  snapshot_status: PersonaSnapshotStatus;
  state_snapshot: PersonaStateSnapshotView;
  recent_transitions: Array<{
    snapshot_id: string;
    state_code: PersonaSurfaceState;
    label: string;
    generated_at: string;
  }>;
  recommended_actions: RoomPendingActionView[];
}
