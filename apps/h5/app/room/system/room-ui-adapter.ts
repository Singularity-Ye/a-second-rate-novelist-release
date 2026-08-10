import type {
  ExperienceAction,
  ExperienceDraft,
  ExperienceProjection,
  ExperienceState,
} from "@erliu/shared-contracts/vnext-experience";
import type {
  VnextModelProfileId,
  VnextWriteOpeningCandidate,
  VnextWriteOpeningCandidateSetResponse,
} from "@erliu/shared-contracts";
import type {
  RoomDraftFeedback,
  RoomStoryContext,
  RoomStoryContextResponse,
  RoomStoryCreativeJob,
  RoomStoryProgressState,
} from "../../lib/room-story-api";
import type { SystemConversationMessage } from "./system-layer";

/**
 * Presentation-only state for the next room frontstage.
 *
 * This module deliberately does not fetch, mutate, or infer server truth. It
 * converts the existing formal room state into a stable view-model so the
 * visual test page can be connected later without learning the backend
 * contracts or reading local fixtures as if they were story truth.
 */

export type RoomUiChatHandling = "conversation" | "submitted" | "not_available" | null;
export type RoomUiChatPhase =
  | "idle"
  | "connecting"
  | "online"
  | "queued"
  | "error"
  | "restricted"
  | "local";

export type RoomUiRecoveryKind =
  | "blocked"
  | "unavailable"
  | "401"
  | "409"
  | "5xx"
  | "attestation_mismatch";

export interface RoomUiRecoveryInput {
  readonly kind: RoomUiRecoveryKind;
  readonly message: string;
  readonly retryable: boolean;
  readonly code?: string;
  readonly requestId?: string;
  readonly recovery?: string;
}

export interface RoomUiLifeInput {
  readonly sceneLabel: string;
  readonly activityLabel: string;
  readonly focus: number;
  readonly fatigue: number;
  readonly inspiration: number;
  readonly emotionalLoad: number;
  /** Optional runtime-selected portrait; the visual shell never infers one. */
  readonly avatar?: {
    readonly src: string;
    readonly state: string;
    readonly label: string;
  } | null;
  /** Mood is accepted only when the life runtime supplies it explicitly. */
  readonly mood?: {
    readonly label: string;
    readonly text: string;
    readonly source: "life_runtime";
  } | null;
}

export interface RoomUiAdapterInput {
  readonly chat: {
    readonly messages: readonly SystemConversationMessage[];
    readonly handling: RoomUiChatHandling;
    readonly phase: RoomUiChatPhase;
    readonly requestId?: string;
    /** Only set from a completed, attested novelist-chat stream result. */
    readonly modelAttestation?: {
      readonly provider: string;
      readonly model: string;
      readonly profileId?: VnextModelProfileId;
      readonly source: "chat_attestation";
    } | null;
  };
  readonly life: RoomUiLifeInput;
  readonly projection: ExperienceProjection | null;
  readonly roomStory: RoomStoryContextResponse | null;
  readonly draftFeedback: RoomDraftFeedback | null;
  readonly draftFeedbackState: "idle" | "loading" | "ready" | "error";
  /** Server-verified identity returned by the feedback SSE ready event. */
  readonly feedbackDraftContentId?: string | null;
  /** Server-verified projection identity returned by the feedback SSE ready event. */
  readonly feedbackProjectionVersionId?: string | null;
  readonly variantReview?: {
    readonly snapshot: VnextWriteOpeningCandidateSetResponse | null;
    readonly state: "idle" | "loading" | "ready" | "selecting" | "error";
    readonly previewCandidateId: string | null;
    readonly selectingCandidateId: string | null;
    readonly errorCode: string | null;
  };
  readonly recovery?: RoomUiRecoveryInput | null;
}

export interface RoomUiChatMessage {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly kind: "conversation" | "submitted_ack";
  readonly text: string;
  readonly createdAt: string;
}

export interface RoomUiChatView {
  readonly messages: readonly RoomUiChatMessage[];
  readonly composer: {
    readonly placeholder: string;
    readonly enabled: boolean;
  };
  readonly streamState: {
    readonly phase: "idle" | "streaming" | "submitted_ack" | "recovering" | "blocked";
    readonly requestId?: string;
  };
}

export interface RoomUiActionView {
  readonly code: ExperienceAction["code"];
  readonly label: string;
  readonly basedOnVersionId?: string;
}

export interface RoomUiTaskView {
  readonly projection: {
    readonly versionId: string;
    readonly status: ExperienceState;
    readonly headline: string;
    readonly body: string;
    readonly understanding: ExperienceProjection["understanding"];
    readonly primaryAction: RoomUiActionView | null;
    readonly secondaryActions: readonly RoomUiActionView[];
  } | null;
}

export interface RoomUiCreativeJobView {
  readonly taskId: string;
  readonly requestId: string;
  readonly kind: RoomStoryCreativeJob["kind"];
  readonly status: RoomStoryCreativeJob["status"];
  readonly progress: RoomStoryProgressState;
  readonly stateVersion: number;
  readonly route: RoomStoryCreativeJob["route"];
}

export interface RoomUiModelRuntime {
  /** The latest completed conversation route; null while unverified. */
  readonly conversation: {
    readonly provider: string;
    readonly model: string;
    readonly profileId?: VnextModelProfileId;
    readonly source: "chat_attestation";
  } | null;
  /** The server-persisted creative route; may coexist with conversation. */
  readonly creativeJob: {
    readonly provider: string;
    readonly model: string;
    readonly source: "story_truth";
  } | null;
}

export interface RoomUiDraftReadyView {
  readonly contentId: string;
  readonly kind: "opening" | "scene" | "chapter";
  readonly status: "draft" | "accepted";
  readonly version: number;
  readonly characterCount: number;
  readonly preview: string;
  readonly feedback: RoomDraftFeedback | null;
  readonly feedbackState: "idle" | "loading" | "ready" | "error";
}

export interface RoomUiDraftReaderView {
  readonly contentId: string;
  readonly versionId: string;
  readonly kind: "opening" | "scene" | "chapter";
  readonly body: string;
}

export interface RoomUiVariantReviewView {
  readonly state: "loading" | "ready" | "selecting" | "error";
  readonly candidateSetId: string;
  readonly candidateSetVersion: number;
  readonly candidates: readonly VnextWriteOpeningCandidate[];
  readonly selectedPreviewId: string | null;
  readonly selectingCandidateId: string | null;
  readonly errorCode: string | null;
  readonly attestation: {
    readonly provider: string;
    readonly model: string;
    readonly route: string;
    readonly workflowVersion: string;
    readonly providerTraceId: string;
    readonly source: "variant_attestation";
  } | null;
}

export interface RoomUiPresentationModel {
  readonly chat: RoomUiChatView;
  readonly life: {
    readonly sceneLabel: string;
    readonly activityLabel: string;
    readonly avatar: RoomUiLifeInput["avatar"] | null;
    readonly needs: {
      readonly focus: number;
      readonly fatigue: number;
      readonly inspiration: number;
      readonly emotionalLoad: number;
    };
    readonly mood: RoomUiLifeInput["mood"];
  };
  readonly task: RoomUiTaskView;
  readonly progress: {
    readonly roomContextProgress: RoomStoryProgressState | null;
    readonly creativeJob: RoomUiCreativeJobView | null;
    readonly source: "persisted_story_truth" | "none" | "blocked";
  };
  readonly draftReady: RoomUiDraftReadyView | null;
  /** Candidate truth is independent from draft, projection, chat, and modelRuntime. */
  readonly variantReview?: RoomUiVariantReviewView | null;
  /** Optional for legacy visual fixtures; formal adapter output always supplies it. */
  readonly modelRuntime?: RoomUiModelRuntime;
  readonly workspacePointer: {
    readonly workspaceId: string;
    readonly storyId: string;
    readonly currentChapter: {
      readonly contentId: string;
      readonly version: number;
    } | null;
  } | null;
  readonly recovery: RoomUiRecoveryInput | null;
}

/**
 * Interaction boundary for a visual frontstage.
 *
 * The frontstage owns layout and DOM hit areas. These callbacks remain in the
 * formal room so it cannot bypass the existing chat, draft-feedback, or
 * recovery guards.
 */
export interface RoomUiPresentationalSurfaceProps {
  readonly model: RoomUiPresentationModel;
  readonly draftReader: RoomUiDraftReaderView | null;
  readonly variantReview?: RoomUiVariantReviewView | null;
  readonly onClose: () => void;
  readonly onCloseDraftReader: () => void;
  readonly onSendMessage: (text: string) => void;
  readonly onStopStreaming: () => void;
  readonly onRetry: (() => void) | null;
  /**
   * Accepts the server-provided session admission manifest.
   *
   * The Panel supplies this only while a validated manifest is pending;
   * visual surfaces must not manufacture admission input or assume success.
   */
  readonly onAdmissionAcknowledge?: (() => void) | null;
  /**
   * Re-runs the formal session bootstrap after a gateway failure.
   *
   * The Panel supplies this only while the gateway is in its error state;
   * visual surfaces must not treat it as a successful model response.
   */
  readonly onGatewayReconnect?: (() => void) | null;
  readonly onFillComposer: (text: string) => void;
  readonly onProjectionAction: (action: RoomUiActionView) => void;
  readonly onRequestDraftFeedback: () => void;
  readonly onOpenDraft: () => void;
  readonly onOpenVariantCandidate?: ((candidateId: string) => void) | null;
  readonly onCloseVariantPreview?: (() => void) | null;
  readonly onSelectVariantCandidate?: ((candidateId: string) => void) | null;
}

export function createRoomUiDraftReaderView(
  draft: ExperienceDraft,
  roomStory: RoomStoryContextResponse | null,
): RoomUiDraftReaderView | null {
  const context = roomStory?.context;
  const currentDraft = context?.draft;
  if (
    context === undefined
    || context.access !== "available"
    || context.source !== "persisted_story_truth"
    || context.progress !== "draft_ready"
    || context.workspace === null
    || currentDraft === null
    || currentDraft === undefined
    || currentDraft.status !== "draft"
    || currentDraft.contentId !== draft.contentId
    || currentDraft.kind !== draft.kind
    || draft.versionId !== `${currentDraft.contentId}:${currentDraft.version}`
  ) {
    return null;
  }
  return {
    contentId: draft.contentId,
    versionId: draft.versionId,
    kind: draft.kind,
    body: draft.body,
  };
}

function actionView(action: ExperienceAction | null): RoomUiActionView | null {
  if (action === null) return null;
  return {
    code: action.code,
    label: action.label,
    ...(action.basedOnVersionId === undefined
      ? {}
      : { basedOnVersionId: action.basedOnVersionId }),
  };
}

function taskView(projection: ExperienceProjection | null): RoomUiTaskView {
  if (projection === null) return { projection: null };
  return {
    projection: {
      versionId: projection.versionId,
      status: projection.status,
      headline: projection.headline,
      body: projection.body,
      understanding: projection.understanding,
      primaryAction: actionView(projection.primaryAction),
      secondaryActions: projection.secondaryActions.map((action) => actionView(action)!).filter(Boolean),
    },
  };
}

function chatPhase(
  handling: RoomUiChatHandling,
  phase: RoomUiChatPhase,
): RoomUiChatView["streamState"]["phase"] {
  if (phase === "restricted" || handling === "not_available") return "blocked";
  if (handling === "submitted" && (phase === "queued" || phase === "online")) return "submitted_ack";
  if (phase === "connecting") return "streaming";
  if (phase === "error") return "recovering";
  return "idle";
}

function chatView(input: RoomUiAdapterInput["chat"]): RoomUiChatView {
  let latestAssistantIndex = -1;
  for (let index = input.messages.length - 1; index >= 0; index -= 1) {
    if (input.messages[index]?.role === "novelist") {
      latestAssistantIndex = index;
      break;
    }
  }
  return {
    messages: input.messages.map((message, index) => ({
      id: message.id,
      role: message.role === "system" ? "user" : "assistant",
      kind: input.handling === "submitted" && index === latestAssistantIndex
        ? "submitted_ack"
        : "conversation",
      text: message.text,
      createdAt: message.createdAt,
    })),
    composer: {
      placeholder: input.handling === "submitted"
        ? "后台处理中；你可以继续补充一句话"
        : "直接和小说家说点什么…",
      enabled: input.phase !== "restricted" && input.handling !== "not_available",
    },
    streamState: {
      phase: chatPhase(input.handling, input.phase),
      ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
    },
  };
}

function availableContext(roomStory: RoomStoryContextResponse | null): RoomStoryContext | null {
  const context = roomStory?.context ?? null;
  if (
    context === null
    || context.access !== "available"
    || context.source !== "persisted_story_truth"
  ) {
    return null;
  }
  return context;
}

function progressView(roomStory: RoomStoryContextResponse | null): RoomUiPresentationModel["progress"] {
  const context = roomStory?.context ?? null;
  if (context === null) {
    return { roomContextProgress: null, creativeJob: null, source: "none" };
  }
  if (context.access === "blocked") {
    return { roomContextProgress: null, creativeJob: null, source: "blocked" };
  }
  if (context.source !== "persisted_story_truth") {
    return { roomContextProgress: null, creativeJob: null, source: "none" };
  }
  const creativeJob = context.creativeJob;
  return {
    roomContextProgress: context.progress,
    creativeJob: creativeJob === null
      ? null
      : {
          taskId: creativeJob.taskId,
          requestId: creativeJob.requestId,
          kind: creativeJob.kind,
          status: creativeJob.status,
          progress: creativeJob.progress,
          stateVersion: creativeJob.stateVersion,
          route: creativeJob.route,
        },
    source: "persisted_story_truth",
  };
}

function draftReadyView(
  roomStory: RoomStoryContextResponse | null,
  draftFeedback: RoomDraftFeedback | null,
  draftFeedbackState: RoomUiAdapterInput["draftFeedbackState"],
  feedbackDraftContentId: string | null | undefined,
  feedbackProjectionVersionId: string | null | undefined,
): RoomUiDraftReadyView | null {
  const context = availableContext(roomStory);
  const draft = context?.draft ?? null;
  if (context === null || context.progress !== "draft_ready" || draft === null) return null;
  if (draft.status !== "draft") return null;
  const feedbackMatchesCurrentDraft =
    feedbackDraftContentId === draft.contentId
    && feedbackProjectionVersionId === roomStory?.projectionVersionId
    && draftFeedback !== null;
  const feedbackState = feedbackMatchesCurrentDraft ? draftFeedbackState : "idle";
  return {
    contentId: draft.contentId,
    kind: draft.kind,
    status: draft.status,
    version: draft.version,
    characterCount: draft.characterCount,
    preview: draft.preview,
    feedback: feedbackState === "ready" ? draftFeedback : null,
    feedbackState,
  };
}

function workspacePointer(roomStory: RoomStoryContextResponse | null): RoomUiPresentationModel["workspacePointer"] {
  const workspace = availableContext(roomStory)?.workspace ?? null;
  if (workspace === null) return null;
  return {
    workspaceId: workspace.id,
    storyId: workspace.storyId,
    currentChapter: workspace.currentChapter,
  };
}

function modelRuntime(input: RoomUiAdapterInput): RoomUiModelRuntime {
  const context = availableContext(input.roomStory);
  const route = context?.creativeJob?.route ?? null;
  return {
    conversation: input.chat.modelAttestation ?? null,
    creativeJob: route === null || route.fallbackApplied !== false
      ? null
      : {
          provider: route.provider,
          model: route.model,
          source: "story_truth",
        },
  };
}

function variantReviewView(input: RoomUiAdapterInput): RoomUiVariantReviewView | null {
  const local = input.variantReview;
  if (local === undefined || local.state === "idle") return null;
  const context = input.roomStory?.context ?? null;
  const discovery = context?.creativeJob?.candidateReview;
  if (
    context === null
    || context.access !== "available"
    || context.source !== "persisted_story_truth"
    || context.progress !== "variant_review"
    || context.workspace === null
    || context.understanding === null
    || context.commission === null
    || context.draft !== null
    || context.creativeJob === null
    || context.creativeJob.progress !== "variant_review"
    || context.creativeJob.route === null
    || context.creativeJob.route.fallbackApplied !== false
    || discovery === undefined
    || discovery.status !== "pending"
    || discovery.candidateCount !== 3
  ) return null;

  const snapshot = local.snapshot;
  if (snapshot === null) {
    return {
      state: local.state === "ready" || local.state === "selecting" ? "error" : local.state,
      candidateSetId: discovery.candidateSetId,
      candidateSetVersion: discovery.candidateSetVersion,
      candidates: [],
      selectedPreviewId: null,
      selectingCandidateId: null,
      errorCode: local.errorCode,
      attestation: null,
    };
  }
  const validIdentity =
    snapshot.status === "pending"
    && snapshot.selectedCandidateId === null
    && snapshot.selectedContentId === null
    && snapshot.candidateSetId === discovery.candidateSetId
    && snapshot.candidateSetVersion === discovery.candidateSetVersion
    && snapshot.workspace.id === context.workspace.id
    && snapshot.workspace.aggregateVersion === context.workspace.aggregateVersion
    && snapshot.understanding.id === context.understanding.id
    && snapshot.understanding.version === context.understanding.version
    && snapshot.commission.id === context.commission.id
    && snapshot.commission.version === context.commission.version
    && snapshot.task.id === context.creativeJob.taskId
    && snapshot.task.stateVersion === context.creativeJob.stateVersion
    && snapshot.attestation.provider === context.creativeJob.route.provider
    && snapshot.attestation.model === context.creativeJob.route.model
    && snapshot.attestation.fallbackApplied === false
    && snapshot.candidates.length === 3
    && snapshot.candidates.every((candidate) => candidate.status === "pending");
  if (!validIdentity) return null;
  const previewCandidateId = snapshot.candidates.some(
    (candidate) => candidate.candidateId === local.previewCandidateId,
  ) ? local.previewCandidateId : null;
  const selectingCandidateId = snapshot.candidates.some(
    (candidate) => candidate.candidateId === local.selectingCandidateId,
  ) ? local.selectingCandidateId : null;
  return {
    state: local.state,
    candidateSetId: snapshot.candidateSetId,
    candidateSetVersion: snapshot.candidateSetVersion,
    candidates: snapshot.candidates,
    selectedPreviewId: previewCandidateId,
    selectingCandidateId,
    errorCode: local.errorCode,
    attestation: {
      provider: snapshot.attestation.provider,
      model: snapshot.attestation.model,
      route: snapshot.attestation.route,
      workflowVersion: snapshot.attestation.workflowVersion,
      providerTraceId: snapshot.attestation.providerTraceId,
      source: "variant_attestation",
    },
  };
}

export function createRoomUiPresentationModel(input: RoomUiAdapterInput): RoomUiPresentationModel {
  const context = input.roomStory?.context ?? null;
  const recovery = input.recovery
    ?? (context?.access === "blocked"
      ? {
          kind: "blocked" as const,
          message: "作品上下文暂不可读，当前不会显示猜测的作品进度。",
          retryable: false,
          code: context.blockedReason ?? "compliance_blocked",
        }
      : null);
  return {
    chat: chatView(input.chat),
    life: {
      sceneLabel: input.life.sceneLabel,
      activityLabel: input.life.activityLabel,
      avatar: input.life.avatar ?? null,
      needs: {
        focus: input.life.focus,
        fatigue: input.life.fatigue,
        inspiration: input.life.inspiration,
        emotionalLoad: input.life.emotionalLoad,
      },
      mood: input.life.mood ?? null,
    },
    task: taskView(input.projection),
    progress: progressView(input.roomStory),
    draftReady: draftReadyView(
      input.roomStory,
      input.draftFeedback,
      input.draftFeedbackState,
      input.feedbackDraftContentId,
      input.feedbackProjectionVersionId,
    ),
    variantReview: variantReviewView(input),
    modelRuntime: modelRuntime(input),
    workspacePointer: workspacePointer(input.roomStory),
    recovery,
  };
}
