import type { VnextRoomStoryContext } from "./vnext-room-story-context.js";
import type { VnextModelProfileId } from "./vnext-model-profiles.js";

export interface VnextRoomDraftFeedbackRequest {
  readonly clientRequestId: string;
  readonly draftContentId: string;
  readonly basedOnProjectionVersionId: string;
  readonly question?: string;
}

/**
 * This is an ephemeral companion message, not story truth.  The server owns
 * progress and content identity; the model may only supply bounded prose
 * fields after the draft and projection have been re-checked.
 */
export interface VnextRoomDraftFeedback {
  readonly summary: string;
  readonly nextStep: string;
  readonly revisionSuggestion: string | null;
}

export interface VnextRoomDraftFeedbackReadyEvent {
  readonly type: "draft_feedback_ready";
  readonly requestId: string;
  readonly projectionVersionId: string;
  readonly draftContentId: string;
  readonly provider: string;
  readonly model: string;
  readonly requestedTier: "light";
  readonly requestedProfileId?: VnextModelProfileId;
  readonly actualProfileId?: VnextModelProfileId;
  readonly routeFallbackApplied: false;
  readonly fallbackApplied: false;
  readonly feedback: VnextRoomDraftFeedback;
  readonly storyContext: VnextRoomStoryContext;
}

export interface VnextRoomDraftFeedbackCompleteEvent {
  readonly type: "draft_feedback_complete";
  readonly requestId: string;
  readonly projectionVersionId: string;
  readonly draftContentId: string;
}
