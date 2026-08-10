import { resolveH5ApiBaseUrl } from "./runtime-api-base";
import type {
  RoomStoryCreativeTaskKind as CanonicalRoomStoryCreativeTaskKind,
  RoomStoryCreativeTaskStatus as CanonicalRoomStoryCreativeTaskStatus,
  RoomStoryProgressState as CanonicalRoomStoryProgressState,
  RoomStoryWorkspaceStatus as CanonicalRoomStoryWorkspaceStatus,
  VnextRoomDraftFeedback as CanonicalRoomDraftFeedback,
  VnextRoomDraftFeedbackCompleteEvent as CanonicalRoomDraftFeedbackCompleteEvent,
  VnextRoomDraftFeedbackReadyEvent as CanonicalRoomDraftFeedbackReadyEvent,
  VnextRoomDraftFeedbackRequest as CanonicalRoomDraftFeedbackRequest,
  VnextRoomStoryCommissionReference as CanonicalRoomStoryCommissionReference,
  VnextRoomStoryContentReference as CanonicalRoomStoryContentReference,
  VnextRoomStoryContext as CanonicalRoomStoryContext,
  VnextRoomStoryContextResponse as CanonicalRoomStoryContextResponse,
  VnextRoomStoryCreativeJob as CanonicalRoomStoryCreativeJob,
  VnextRoomStoryUnderstandingReference as CanonicalRoomStoryUnderstandingReference,
} from "@erliu/shared-contracts/vnext-experience";

export type RoomStoryWorkspaceStatus = CanonicalRoomStoryWorkspaceStatus;
export type RoomStoryProgressState = CanonicalRoomStoryProgressState;
export type RoomStoryCreativeTaskKind = CanonicalRoomStoryCreativeTaskKind;
export type RoomStoryCreativeTaskStatus = CanonicalRoomStoryCreativeTaskStatus;
export type RoomStoryContentReference = CanonicalRoomStoryContentReference;
export type RoomStoryUnderstandingReference = CanonicalRoomStoryUnderstandingReference;
export type RoomStoryCommissionReference = CanonicalRoomStoryCommissionReference;
export type RoomStoryCreativeJob = CanonicalRoomStoryCreativeJob;
export type RoomStoryContext = CanonicalRoomStoryContext;
export type RoomStoryContextResponse = CanonicalRoomStoryContextResponse;
export type RoomDraftFeedback = CanonicalRoomDraftFeedback;
export type RoomDraftFeedbackReadyEvent = Omit<CanonicalRoomDraftFeedbackReadyEvent, "requestedProfileId" | "actualProfileId"> & {
  readonly requestedProfileId: "deepseek";
  readonly actualProfileId: "deepseek";
};
export type RoomDraftFeedbackCompleteEvent = CanonicalRoomDraftFeedbackCompleteEvent;
export type RoomDraftFeedbackInput = Omit<CanonicalRoomDraftFeedbackRequest, "clientRequestId">;

export class RoomStoryApiError extends Error {
  readonly code: string;
  readonly recovery: string | undefined;
  readonly status: number;

  constructor(code: string, recovery: string | undefined, status: number) {
    super(`room story request failed: ${code}`);
    this.name = "RoomStoryApiError";
    this.code = code;
    this.recovery = recovery;
    this.status = status;
  }
}

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STORY_PROGRESS_STATES = new Set<RoomStoryProgressState>([
  "idle",
  "understanding",
  "writing",
  "variant_review",
  "revising",
  "draft_ready",
  "accepted",
  "blocked",
]);

const STORY_WORKSPACE_STATUSES = new Set<RoomStoryWorkspaceStatus>([
  "forming",
  "active",
  "paused",
  "archived",
]);

const STORY_CONTENT_KINDS = new Set(["opening", "scene", "chapter"] as const);
const STORY_CONTENT_STATUSES = new Set(["draft", "accepted"] as const);
const STORY_TASK_KINDS = new Set<RoomStoryCreativeTaskKind>([
  "understand",
  "write_opening",
  "revise",
  "continue_story",
]);
const STORY_TASK_STATUSES = new Set<RoomStoryCreativeTaskStatus>([
  "queued",
  "leased",
  "retry_wait",
  "succeeded",
  "failed",
  "cancelled",
  "timed_out",
  "blocked",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactFields(
  value: unknown,
  fields: ReadonlySet<string>,
): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const keys = Reflect.ownKeys(value);
  return (
    keys.length === fields.size &&
    keys.every((key) => typeof key === "string" && fields.has(key))
  );
}

function field(value: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && "value" in descriptor
    ? descriptor.value
    : undefined;
}

function boundedString(value: unknown, maximum: number, allowEmpty = false): value is string {
  if (typeof value !== "string" || (!allowEmpty && value.trim().length === 0)) {
    return false;
  }
  let count = 0;
  for (const _point of value) {
    count += 1;
    if (count > maximum) return false;
  }
  return true;
}

function canonicalInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function nullableCanonicalInstant(value: unknown): value is string | null {
  return value === null || canonicalInstant(value);
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function parseContentReference(value: unknown): RoomStoryContentReference | null {
  const fields = new Set([
    "contentId",
    "kind",
    "status",
    "version",
    "characterCount",
    "updatedAt",
    "preview",
  ]);
  if (!hasExactFields(value, fields)) return null;
  const contentId = field(value, "contentId");
  const kind = field(value, "kind");
  const status = field(value, "status");
  const version = field(value, "version");
  const characterCount = field(value, "characterCount");
  const updatedAt = field(value, "updatedAt");
  const preview = field(value, "preview");
  if (
    !boundedString(contentId, 200) ||
    typeof kind !== "string" || !STORY_CONTENT_KINDS.has(kind as RoomStoryContentReference["kind"]) ||
    typeof status !== "string" || !STORY_CONTENT_STATUSES.has(status as RoomStoryContentReference["status"]) ||
    !positiveInteger(version) ||
    !nonNegativeInteger(characterCount) ||
    !canonicalInstant(updatedAt) ||
    !boundedString(preview, 2_000, true)
  ) {
    return null;
  }
  return {
    contentId,
    kind: kind as RoomStoryContentReference["kind"],
    status: status as RoomStoryContentReference["status"],
    version,
    characterCount,
    updatedAt,
    preview,
  };
}

function parseUnderstanding(value: unknown): RoomStoryUnderstandingReference | null {
  const fields = new Set(["id", "version", "storyDesire", "emotionalTarget", "relationshipTension"]);
  if (!hasExactFields(value, fields)) return null;
  const id = field(value, "id");
  const version = field(value, "version");
  const storyDesire = field(value, "storyDesire");
  const emotionalTarget = field(value, "emotionalTarget");
  const relationshipTension = field(value, "relationshipTension");
  if (
    !boundedString(id, 200) ||
    !positiveInteger(version) ||
    !boundedString(storyDesire, 2_000, true) ||
    !boundedString(emotionalTarget, 2_000, true) ||
    !boundedString(relationshipTension, 2_000, true)
  ) {
    return null;
  }
  return { id, version, storyDesire, emotionalTarget, relationshipTension };
}

function parseCommission(value: unknown): RoomStoryCommissionReference | null {
  const fields = new Set([
    "id",
    "version",
    "status",
    "premise",
    "emotionalPromise",
    "continuationIntent",
  ]);
  if (!hasExactFields(value, fields)) return null;
  const id = field(value, "id");
  const version = field(value, "version");
  const status = field(value, "status");
  const premise = field(value, "premise");
  const emotionalPromise = field(value, "emotionalPromise");
  const continuationIntent = field(value, "continuationIntent");
  if (
    !boundedString(id, 200) ||
    !positiveInteger(version) ||
    (status !== "draft" && status !== "active" && status !== "superseded") ||
    !boundedString(premise, 4_000, true) ||
    !boundedString(emotionalPromise, 4_000, true) ||
    !boundedString(continuationIntent, 4_000, true)
  ) {
    return null;
  }
  return { id, version, status, premise, emotionalPromise, continuationIntent };
}

function parseCreativeJob(value: unknown): RoomStoryCreativeJob | null {
  const baseFields = new Set([
    "taskId",
    "requestId",
    "kind",
    "status",
    "progress",
    "stateVersion",
    "startedAt",
    "completedAt",
    "updatedAt",
    "route",
  ]);
  const fieldsWithCandidateReview = new Set([
    ...baseFields,
    "candidateReview",
  ]);
  if (
    !hasExactFields(value, baseFields)
    && !hasExactFields(value, fieldsWithCandidateReview)
  ) return null;
  const taskId = field(value, "taskId");
  const requestId = field(value, "requestId");
  const kind = field(value, "kind");
  const status = field(value, "status");
  const progress = field(value, "progress");
  const stateVersion = field(value, "stateVersion");
  const startedAt = field(value, "startedAt");
  const completedAt = field(value, "completedAt");
  const updatedAt = field(value, "updatedAt");
  const routeValue = field(value, "route");
  const candidateReviewValue = field(value, "candidateReview");
  let route: RoomStoryCreativeJob["route"] = null;
  if (routeValue !== null) {
    const routeFields = new Set(["provider", "model", "fallbackApplied"]);
    if (!hasExactFields(routeValue, routeFields)) return null;
    const provider = field(routeValue, "provider");
    const model = field(routeValue, "model");
    if (!boundedString(provider, 200) || !boundedString(model, 200) || field(routeValue, "fallbackApplied") !== false) {
      return null;
    }
    route = { provider, model, fallbackApplied: false };
  }
  let candidateReview: RoomStoryCreativeJob["candidateReview"];
  if (candidateReviewValue !== undefined) {
    const candidateReviewFields = new Set([
      "candidateSetId",
      "candidateSetVersion",
      "status",
      "candidateCount",
    ]);
    if (!hasExactFields(candidateReviewValue, candidateReviewFields)) return null;
    const candidateSetId = field(candidateReviewValue, "candidateSetId");
    const candidateSetVersion = field(candidateReviewValue, "candidateSetVersion");
    const candidateStatus = field(candidateReviewValue, "status");
    if (
      typeof candidateSetId !== "string"
      || !UUID_V4_PATTERN.test(candidateSetId)
      || !positiveInteger(candidateSetVersion)
      || candidateStatus !== "pending"
      || field(candidateReviewValue, "candidateCount") !== 3
    ) {
      return null;
    }
    candidateReview = {
      candidateSetId,
      candidateSetVersion,
      status: candidateStatus,
      candidateCount: 3,
    };
  }
  if (
    !boundedString(taskId, 200) ||
    !boundedString(requestId, 200) ||
    typeof kind !== "string" || !STORY_TASK_KINDS.has(kind as RoomStoryCreativeTaskKind) ||
    typeof status !== "string" || !STORY_TASK_STATUSES.has(status as RoomStoryCreativeTaskStatus) ||
    typeof progress !== "string" || !STORY_PROGRESS_STATES.has(progress as RoomStoryProgressState) ||
    !nonNegativeInteger(stateVersion) ||
    !nullableCanonicalInstant(startedAt) ||
    !nullableCanonicalInstant(completedAt) ||
    !canonicalInstant(updatedAt)
  ) {
    return null;
  }
  if (
    (progress === "variant_review" && candidateReview === undefined)
    || (progress !== "variant_review" && candidateReview !== undefined)
  ) {
    return null;
  }
  return {
    taskId,
    requestId,
    kind: kind as RoomStoryCreativeTaskKind,
    status: status as RoomStoryCreativeTaskStatus,
    progress: progress as RoomStoryProgressState,
    stateVersion,
    startedAt,
    completedAt,
    updatedAt,
    route,
    ...(candidateReview === undefined ? {} : { candidateReview }),
  };
}

export function parseRoomStoryContext(value: unknown): RoomStoryContext | null {
  const fields = new Set([
    "schemaVersion",
    "access",
    "blockedReason",
    "source",
    "progress",
    "workspace",
    "understanding",
    "commission",
    "acceptedContent",
    "draft",
    "creativeJob",
    "updatedAt",
  ]);
  if (!hasExactFields(value, fields)) return null;
  const schemaVersion = field(value, "schemaVersion");
  const access = field(value, "access");
  const blockedReason = field(value, "blockedReason");
  const source = field(value, "source");
  const progress = field(value, "progress");
  const workspaceValue = field(value, "workspace");
  const understandingValue = field(value, "understanding");
  const commissionValue = field(value, "commission");
  const acceptedContentValue = field(value, "acceptedContent");
  const draftValue = field(value, "draft");
  const creativeJobValue = field(value, "creativeJob");
  const updatedAt = field(value, "updatedAt");

  if (
    schemaVersion !== 2 ||
    (access !== "available" && access !== "blocked") ||
    (blockedReason !== null && blockedReason !== "compliance") ||
    (source !== "none" && source !== "persisted_story_truth") ||
    typeof progress !== "string" || !STORY_PROGRESS_STATES.has(progress as RoomStoryProgressState) ||
    (updatedAt !== null && !canonicalInstant(updatedAt))
  ) {
    return null;
  }

  let workspace: RoomStoryContext["workspace"] = null;
  if (workspaceValue !== null) {
    const workspaceFields = new Set([
      "id",
      "storyId",
      "title",
      "currentChapter",
      "status",
      "aggregateVersion",
      "updatedAt",
    ]);
    if (!hasExactFields(workspaceValue, workspaceFields)) return null;
    const id = field(workspaceValue, "id");
    const storyId = field(workspaceValue, "storyId");
    const title = field(workspaceValue, "title");
    const currentChapterValue = field(workspaceValue, "currentChapter");
    const status = field(workspaceValue, "status");
    const aggregateVersion = field(workspaceValue, "aggregateVersion");
    const workspaceUpdatedAt = field(workspaceValue, "updatedAt");
    let currentChapter: NonNullable<RoomStoryContext["workspace"]>["currentChapter"] = null;
    if (currentChapterValue !== null) {
      const chapterFields = new Set(["contentId", "version"]);
      if (!hasExactFields(currentChapterValue, chapterFields)) return null;
      const contentId = field(currentChapterValue, "contentId");
      const version = field(currentChapterValue, "version");
      if (!boundedString(contentId, 200) || !positiveInteger(version)) return null;
      currentChapter = { contentId, version };
    }
    if (
      !boundedString(id, 200) ||
      !boundedString(storyId, 200) ||
      (title !== null && !boundedString(title, 500, true)) ||
      typeof status !== "string" || !STORY_WORKSPACE_STATUSES.has(status as RoomStoryWorkspaceStatus) ||
      !nonNegativeInteger(aggregateVersion) ||
      !canonicalInstant(workspaceUpdatedAt)
    ) {
      return null;
    }
    workspace = {
      id,
      storyId,
      title,
      currentChapter,
      status: status as RoomStoryWorkspaceStatus,
      aggregateVersion,
      updatedAt: workspaceUpdatedAt,
    };
  }

  const understanding = understandingValue === null ? null : parseUnderstanding(understandingValue);
  const commission = commissionValue === null ? null : parseCommission(commissionValue);
  const acceptedContent = acceptedContentValue === null ? null : parseContentReference(acceptedContentValue);
  const draft = draftValue === null ? null : parseContentReference(draftValue);
  const creativeJob = creativeJobValue === null ? null : parseCreativeJob(creativeJobValue);
  if (
    (understandingValue !== null && understanding === null) ||
    (commissionValue !== null && commission === null) ||
    (acceptedContentValue !== null && acceptedContent === null) ||
    (draftValue !== null && draft === null) ||
    (creativeJobValue !== null && creativeJob === null)
  ) {
    return null;
  }

  if (
    progress === "variant_review"
    && (
      access !== "available"
      || source !== "persisted_story_truth"
      || workspace === null
      || understanding === null
      || commission === null
      || draft !== null
      || creativeJob === null
      || creativeJob.progress !== "variant_review"
      || creativeJob.candidateReview === undefined
    )
  ) {
    return null;
  }
  if (progress !== "variant_review" && creativeJob?.candidateReview !== undefined) {
    return null;
  }

  if (access === "blocked") {
    if (
      blockedReason === null ||
      source !== "none" ||
      progress !== "blocked" ||
      workspace !== null ||
      understanding !== null ||
      commission !== null ||
      acceptedContent !== null ||
      draft !== null ||
      creativeJob !== null ||
      updatedAt !== null
    ) {
      return null;
    }
  }

  return {
    schemaVersion: 2,
    access,
    blockedReason,
    source,
    progress: progress as RoomStoryProgressState,
    workspace,
    understanding,
    commission,
    acceptedContent,
    draft,
    creativeJob,
    updatedAt,
  };
}

function parseRoomStoryContextResponse(value: unknown): RoomStoryContextResponse | null {
  const fields = new Set(["projectionVersionId", "context"]);
  if (!hasExactFields(value, fields)) return null;
  const projectionVersionId = field(value, "projectionVersionId");
  const context = parseRoomStoryContext(field(value, "context"));
  return boundedString(projectionVersionId, 200) && context !== null
    ? { projectionVersionId, context }
    : null;
}

function parseFeedback(value: unknown): RoomDraftFeedback | null {
  const fields = new Set(["summary", "nextStep", "revisionSuggestion"]);
  if (!hasExactFields(value, fields)) return null;
  const summary = field(value, "summary");
  const nextStep = field(value, "nextStep");
  const revisionSuggestion = field(value, "revisionSuggestion");
  return boundedString(summary, 2_000) &&
    boundedString(nextStep, 2_000) &&
    (revisionSuggestion === null || boundedString(revisionSuggestion, 2_000))
    ? { summary, nextStep, revisionSuggestion }
    : null;
}

function parseReadyEvent(
  value: Record<string, unknown>,
  input: RoomDraftFeedbackInput,
  clientRequestId: string,
): RoomDraftFeedbackReadyEvent | null {
  const fields = new Set([
    "type",
    "requestId",
    "projectionVersionId",
    "draftContentId",
    "provider",
    "model",
    "requestedTier",
    "requestedProfileId",
    "actualProfileId",
    "routeFallbackApplied",
    "fallbackApplied",
    "feedback",
    "storyContext",
  ]);
  if (!hasExactFields(value, fields)) return null;
  const requestId = field(value, "requestId");
  const projectionVersionId = field(value, "projectionVersionId");
  const draftContentId = field(value, "draftContentId");
  const provider = field(value, "provider");
  const model = field(value, "model");
  const requestedTier = field(value, "requestedTier");
  const requestedProfileId = field(value, "requestedProfileId");
  const actualProfileId = field(value, "actualProfileId");
  const feedback = parseFeedback(field(value, "feedback"));
  const storyContext = parseRoomStoryContext(field(value, "storyContext"));
  if (
    field(value, "type") !== "draft_feedback_ready" ||
    requestId !== clientRequestId ||
    !boundedString(projectionVersionId, 200) ||
    projectionVersionId !== input.basedOnProjectionVersionId ||
    !boundedString(draftContentId, 200) ||
    draftContentId !== input.draftContentId ||
    provider !== "deepseek" ||
    !boundedString(model, 200) ||
    !/^deepseek(?:[-_]|$)/iu.test(model) ||
    requestedTier !== "light" ||
    requestedProfileId !== "deepseek" ||
    actualProfileId !== "deepseek" ||
    field(value, "routeFallbackApplied") !== false ||
    field(value, "fallbackApplied") !== false ||
    feedback === null ||
    storyContext === null ||
    storyContext.access !== "available" ||
    storyContext.source !== "persisted_story_truth" ||
    storyContext.progress !== "draft_ready" ||
    storyContext.draft === null ||
    storyContext.draft.contentId !== draftContentId
  ) {
    return null;
  }
  return {
    type: "draft_feedback_ready",
    requestId,
    projectionVersionId,
    draftContentId,
    provider,
    model,
    requestedTier: "light",
    requestedProfileId: "deepseek",
    actualProfileId: "deepseek",
    routeFallbackApplied: false,
    fallbackApplied: false,
    feedback,
    storyContext,
  };
}

function parseCompleteEvent(
  value: Record<string, unknown>,
  ready: RoomDraftFeedbackReadyEvent,
): RoomDraftFeedbackCompleteEvent | null {
  const fields = new Set(["type", "requestId", "projectionVersionId", "draftContentId"]);
  if (!hasExactFields(value, fields)) return null;
  const requestId = field(value, "requestId");
  const projectionVersionId = field(value, "projectionVersionId");
  const draftContentId = field(value, "draftContentId");
  return field(value, "type") === "draft_feedback_complete" &&
    requestId === ready.requestId &&
    projectionVersionId === ready.projectionVersionId &&
    draftContentId === ready.draftContentId
    ? { type: "draft_feedback_complete", requestId, projectionVersionId, draftContentId }
    : null;
}

function parseFrame(frame: string): string {
  return frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
    .trim();
}

function responseError(response: Response, payload: unknown): RoomStoryApiError {
  const record = isRecord(payload) ? payload : null;
  const code = record !== null && typeof field(record, "code") === "string"
    ? field(record, "code") as string
    : response.status === 401 ? "authentication_required" : "room_story_unavailable";
  const recovery = record !== null && typeof field(record, "recovery") === "string"
    ? field(record, "recovery") as string
    : undefined;
  return new RoomStoryApiError(code, recovery, response.status);
}

function clientRequestId(): string {
  const requestId = globalThis.crypto?.randomUUID?.();
  if (!requestId || !UUID_V4_PATTERN.test(requestId)) {
    throw new RoomStoryApiError("client_request_id_unavailable", "return_later", 0);
  }
  return requestId;
}

function apiPath(path: string): string {
  return `${resolveH5ApiBaseUrl()}/vnext${path}`;
}

export async function readRoomStoryContext(signal?: AbortSignal): Promise<RoomStoryContextResponse> {
  let response: Response;
  try {
    response = await fetch(apiPath("/room/context"), {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      headers: { accept: "application/json" },
      ...(signal === undefined ? {} : { signal }),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new RoomStoryApiError("room_story_unavailable", "return_later", 0);
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    throw new RoomStoryApiError("invalid_runtime_output", "return_later", response.status);
  }
  if (!response.ok) throw responseError(response, payload);
  if (response.status !== 200) {
    throw new RoomStoryApiError("invalid_runtime_output", "return_later", response.status);
  }
  const parsed = parseRoomStoryContextResponse(payload);
  if (parsed === null) {
    throw new RoomStoryApiError("invalid_runtime_output", "return_later", 502);
  }
  return parsed;
}

export async function streamRoomDraftFeedback(
  input: RoomDraftFeedbackInput,
  onReady?: (event: RoomDraftFeedbackReadyEvent) => void,
  signal?: AbortSignal,
): Promise<RoomDraftFeedbackReadyEvent> {
  if (
    !UUID_V4_PATTERN.test(input.draftContentId) ||
    !boundedString(input.basedOnProjectionVersionId, 200) ||
    (input.question !== undefined && !boundedString(input.question, 300))
  ) {
    throw new RoomStoryApiError("invalid_request", "correct_request", 400);
  }
  const requestId = clientRequestId();
  const body = {
    clientRequestId: requestId,
    draftContentId: input.draftContentId,
    basedOnProjectionVersionId: input.basedOnProjectionVersionId,
    ...(input.question === undefined ? {} : { question: input.question }),
  };
  let response: Response;
  try {
    response = await fetch(apiPath("/room/draft-feedback/stream"), {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      headers: {
        accept: "text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      ...(signal === undefined ? {} : { signal }),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new RoomStoryApiError("room_story_unavailable", "return_later", 0);
  }
  if (!response.ok) {
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      // The HTTP status remains the only safe failure signal.
    }
    throw responseError(response, payload);
  }
  if (!response.body) {
    throw new RoomStoryApiError("stream_unsupported", "return_later", response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  let ready: RoomDraftFeedbackReadyEvent | null = null;
  let complete: RoomDraftFeedbackCompleteEvent | null = null;

  const consumeFrame = (frame: string) => {
    const data = parseFrame(frame);
    if (!data || data === "[DONE]") return;
    let event: Record<string, unknown>;
    try {
      const parsed = JSON.parse(data) as unknown;
      if (!isRecord(parsed)) throw new TypeError("event must be an object");
      event = parsed;
    } catch {
      throw new RoomStoryApiError("invalid_runtime_output", "return_later", 502);
    }
    if (event.type === "error") {
      const code = typeof field(event, "code") === "string" ? field(event, "code") as string : "room_story_unavailable";
      const recovery = typeof field(event, "recovery") === "string" ? field(event, "recovery") as string : "return_later";
      throw new RoomStoryApiError(code, recovery, 502);
    }
    if (event.type === "draft_feedback_ready") {
      if (ready !== null || complete !== null) {
        throw new RoomStoryApiError("invalid_runtime_output", "return_later", 502);
      }
      ready = parseReadyEvent(event, input, requestId);
      if (ready === null) {
        throw new RoomStoryApiError("invalid_runtime_output", "return_later", 502);
      }
      onReady?.(ready);
      return;
    }
    if (event.type === "draft_feedback_complete") {
      if (ready === null || complete !== null) {
        throw new RoomStoryApiError("invalid_runtime_output", "return_later", 502);
      }
      complete = parseCompleteEvent(event, ready);
      if (complete === null) {
        throw new RoomStoryApiError("invalid_runtime_output", "return_later", 502);
      }
      return;
    }
    throw new RoomStoryApiError("invalid_runtime_output", "return_later", 502);
  };

  try {
    while (true) {
      const next = await reader.read();
      buffer += decoder.decode(next.value ?? new Uint8Array(), { stream: !next.done });
      buffer = buffer.replace(/\r\n/gu, "\n");
      let separator = buffer.indexOf("\n\n");
      while (separator >= 0) {
        consumeFrame(buffer.slice(0, separator));
        buffer = buffer.slice(separator + 2);
        separator = buffer.indexOf("\n\n");
      }
      if (next.done) break;
    }
    if (buffer.trim()) consumeFrame(buffer);
  } finally {
    reader.releaseLock();
  }
  if (ready === null || complete === null) {
    throw new RoomStoryApiError("provider_connection_reset", "return_later", 502);
  }
  return ready;
}
