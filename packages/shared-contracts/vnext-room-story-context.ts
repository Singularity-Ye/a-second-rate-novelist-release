export const ROOM_STORY_CONTEXT_SCHEMA_VERSION = 2 as const;

export const ROOM_STORY_WORKSPACE_STATUSES = Object.freeze([
  "forming",
  "active",
  "paused",
  "archived",
] as const);

export type RoomStoryWorkspaceStatus =
  (typeof ROOM_STORY_WORKSPACE_STATUSES)[number];

export const ROOM_STORY_PROGRESS_STATES = Object.freeze([
  "idle",
  "understanding",
  "writing",
  "revising",
  "draft_ready",
  "accepted",
  "blocked",
] as const);

export type RoomStoryProgressState =
  (typeof ROOM_STORY_PROGRESS_STATES)[number];

export const ROOM_STORY_CREATIVE_TASK_KINDS = Object.freeze([
  "understand",
  "write_opening",
  "revise",
  "continue_story",
] as const);

export type RoomStoryCreativeTaskKind =
  (typeof ROOM_STORY_CREATIVE_TASK_KINDS)[number];

export const ROOM_STORY_CREATIVE_TASK_STATUSES = Object.freeze([
  "queued",
  "leased",
  "retry_wait",
  "succeeded",
  "failed",
  "cancelled",
  "timed_out",
  "blocked",
] as const);

export type RoomStoryCreativeTaskStatus =
  (typeof ROOM_STORY_CREATIVE_TASK_STATUSES)[number];

export interface VnextRoomStoryContentReference {
  readonly contentId: string;
  readonly kind: "opening" | "scene" | "chapter";
  readonly status: "draft" | "accepted";
  readonly version: number;
  readonly characterCount: number;
  readonly updatedAt: string;
  /** A bounded, server-selected preview; the full body is read separately. */
  readonly preview: string;
}

export interface VnextRoomStoryUnderstandingReference {
  readonly id: string;
  readonly version: number;
  readonly storyDesire: string;
  readonly emotionalTarget: string;
  readonly relationshipTension: string;
}

export interface VnextRoomStoryCommissionReference {
  readonly id: string;
  readonly version: number;
  readonly status: "draft" | "active" | "superseded";
  readonly premise: string;
  readonly emotionalPromise: string;
  readonly continuationIntent: string;
}

export interface VnextRoomStoryCreativeJob {
  readonly taskId: string;
  readonly requestId: string;
  readonly kind: RoomStoryCreativeTaskKind;
  readonly status: RoomStoryCreativeTaskStatus;
  readonly progress: RoomStoryProgressState;
  readonly stateVersion: number;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly updatedAt: string;
  readonly route: {
    readonly provider: string;
    readonly model: string;
    readonly fallbackApplied: false;
  } | null;
}

export interface VnextRoomStoryContext {
  readonly schemaVersion: typeof ROOM_STORY_CONTEXT_SCHEMA_VERSION;
  readonly access: "available" | "blocked";
  readonly blockedReason: "compliance" | null;
  readonly source: "none" | "persisted_story_truth";
  readonly progress: RoomStoryProgressState;
  readonly workspace: {
    readonly id: string;
    /** The vNext story aggregate currently uses the workspace identity. */
    readonly storyId: string;
    readonly title: string | null;
    readonly currentChapter: {
      readonly contentId: string;
      readonly version: number;
    } | null;
    readonly status: RoomStoryWorkspaceStatus;
    readonly aggregateVersion: number;
    readonly updatedAt: string;
  } | null;
  readonly understanding: VnextRoomStoryUnderstandingReference | null;
  readonly commission: VnextRoomStoryCommissionReference | null;
  readonly acceptedContent: VnextRoomStoryContentReference | null;
  readonly draft: VnextRoomStoryContentReference | null;
  readonly creativeJob: VnextRoomStoryCreativeJob | null;
  readonly updatedAt: string | null;
}

export interface VnextRoomStoryContextResponse {
  readonly projectionVersionId: string;
  readonly context: VnextRoomStoryContext;
}
