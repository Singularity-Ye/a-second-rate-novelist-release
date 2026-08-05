import { resolveH5ApiBaseUrl } from "../../lib/runtime-api-base";
import {
  EXPERIENCE_RECOVERY_ACTIONS,
  EXPERIENCE_STATES,
  ROOM_MESSAGE_HANDLINGS,
  ROOM_MESSAGE_INTENTS,
  type ExperienceProjection,
  type ExperienceRecoveryAction,
  type RoomMessageHandling,
  type RoomMessageIntent,
} from "@erliu/shared-contracts/vnext-experience";
import {
  isVnextModelProfileId,
  type VnextModelProfileId,
} from "@erliu/shared-contracts";
import {
  parseRoomStoryContext,
  type RoomStoryContext,
} from "../../lib/room-story-api";

export type NovelistChatChannel = "novelist" | "subsystem";

export interface NovelistChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface NovelistChatRequest {
  clientRequestId: string;
  channel: NovelistChatChannel;
  text: string;
  messages: readonly NovelistChatMessage[];
  persona: {
    identityName: string;
    personalityCode: string;
    addressStyle: string;
    interventionStyle: string;
    relationshipLabel: string;
    lexicon: readonly string[];
    voice: {
      authority: number;
      warmth: number;
      pressure: number;
      humor: number;
      distance: number;
    };
  };
  task: {
    status: string;
    title: string;
    deliverable: string;
    userInstruction?: string;
    evidenceStatus: string;
  };
  observation: {
    sceneLabel: string;
    activityLabel: string;
    focus: number;
    fatigue: number;
    inspiration: number;
    emotionalLoad: number;
  };
}

export interface RoomMessageRoute {
  intent: RoomMessageIntent;
  handling: RoomMessageHandling;
  projection: ExperienceProjection;
  storyContext?: RoomStoryContext;
}

export interface RoomMessageStreamResult {
  route: RoomMessageRoute;
  storyContext?: RoomStoryContext;
  provider?: string;
  model?: string;
  profileId?: VnextModelProfileId;
  requestedTier?: "light";
  routeFallbackApplied?: boolean;
  fallbackApplied?: false;
  requestId?: string;
}

export type RoomMessageRouteHandler = (route: RoomMessageRoute) => void;

export class NovelistChatRequestError extends Error {
  readonly code: string;
  readonly requestId: string | undefined;
  readonly recovery: ExperienceRecoveryAction | undefined;

  constructor(code: string, requestId?: string, recovery?: ExperienceRecoveryAction) {
    super(code);
    this.name = "NovelistChatRequestError";
    this.code = code;
    this.requestId = requestId;
    this.recovery = recovery;
  }
}

const RECOVERY_ACTION_SET = new Set<string>(EXPERIENCE_RECOVERY_ACTIONS);

function responseRecovery(payload: unknown): ExperienceRecoveryAction | undefined {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return undefined;
  const recovery = (payload as Record<string, unknown>).recovery;
  return typeof recovery === "string" && RECOVERY_ACTION_SET.has(recovery)
    ? recovery as ExperienceRecoveryAction
    : undefined;
}

function responseCode(response: Response, payload: unknown) {
  if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    if (typeof record.code === "string") return record.code;
    if (typeof record.error === "string") return record.error;
  }
  if (response.status === 401) return "authentication_required";
  if (response.status === 403) return "compliance_blocked";
  if (response.status === 408 || response.status === 504) return "provider_timeout";
  if (response.status === 429) return "provider_rate_limited";
  return "provider_unavailable";
}

function requestError(response: Response, payload: unknown) {
  const requestId = response.headers.get("x-request-id") ?? undefined;
  return new NovelistChatRequestError(responseCode(response, payload), requestId, responseRecovery(payload));
}

function parseFrame(frame: string) {
  return frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
    .trim();
}

const ROOM_MESSAGE_INTENT_SET = new Set<string>(ROOM_MESSAGE_INTENTS);
const ROOM_MESSAGE_HANDLING_SET = new Set<string>(ROOM_MESSAGE_HANDLINGS);
const EXPERIENCE_STATE_SET = new Set<string>(EXPERIENCE_STATES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProjection(value: unknown): value is ExperienceProjection {
  if (!isRecord(value) || typeof value.versionId !== "string" || !value.versionId.trim()) return false;
  if (typeof value.status !== "string" || !EXPERIENCE_STATE_SET.has(value.status)) return false;
  if (typeof value.headline !== "string" || typeof value.body !== "string") return false;
  if (value.understanding !== null && !isRecord(value.understanding)) return false;
  if (value.primaryAction !== null && !isRecord(value.primaryAction)) return false;
  return Array.isArray(value.secondaryActions);
}

function parseRouteEvent(value: Record<string, unknown>, requestId: string | undefined): RoomMessageRoute {
  if (
    typeof value.intent !== "string"
    || !ROOM_MESSAGE_INTENT_SET.has(value.intent)
    || typeof value.handling !== "string"
    || !ROOM_MESSAGE_HANDLING_SET.has(value.handling)
    || !isProjection(value.projection)
  ) {
    throw new NovelistChatRequestError("invalid_runtime_output", requestId);
  }
  let storyContext: RoomStoryContext | undefined;
  if (value.storyContext !== undefined) {
    const parsedStoryContext = parseRoomStoryContext(value.storyContext);
    if (parsedStoryContext === null) {
      throw new NovelistChatRequestError("invalid_runtime_output", requestId);
    }
    storyContext = parsedStoryContext;
  }
  return {
    intent: value.intent as RoomMessageIntent,
    handling: value.handling as RoomMessageHandling,
    projection: value.projection,
    ...(storyContext === undefined ? {} : { storyContext }),
  };
}

export async function streamNovelistChat(
  input: NovelistChatRequest,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
  onRoute?: RoomMessageRouteHandler,
): Promise<RoomMessageStreamResult> {
  const publicRoomDemo = process.env.NEXT_PUBLIC_PUBLIC_ROOM_DEMO === "true";
  const requestInit: RequestInit = {
    method: "POST",
    credentials: publicRoomDemo ? "omit" : "include",
    headers: {
      accept: "text/event-stream",
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  };
  if (signal) requestInit.signal = signal;
  const response = await fetch(`${resolveH5ApiBaseUrl()}/vnext/room/messages/stream`, requestInit);

  if (!response.ok) {
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      // Keep the stable provider error code derived from the HTTP status.
    }
    throw requestError(response, payload);
  }
  if (!response.body) {
    throw new NovelistChatRequestError("stream_unsupported", response.headers.get("x-request-id") ?? undefined);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  let model: string | undefined;
  let provider: string | undefined;
  let profileId: VnextModelProfileId | undefined;
  let requestedProfileId: VnextModelProfileId | undefined;
  let routeAttested = false;
  let routeFallbackApplied: boolean | undefined;
  let requestId = response.headers.get("x-request-id") ?? undefined;
  let completed = false;
  let roomCompleted = false;
  let route: RoomMessageRoute | undefined;
  let storyContext: RoomStoryContext | undefined;

  const consumeFrame = (frame: string) => {
    const data = parseFrame(frame);
    if (!data || data === "[DONE]") return;
    let event: Record<string, unknown>;
    try {
      const parsed = JSON.parse(data) as unknown;
      if (!isRecord(parsed)) throw new TypeError("event must be an object");
      event = parsed;
    } catch {
      throw new NovelistChatRequestError("invalid_runtime_output", requestId);
    }
    requestId = typeof event.requestId === "string" ? event.requestId : requestId;
    if (event.type === "route") {
      if (route !== undefined || completed || roomCompleted) {
        throw new NovelistChatRequestError("invalid_runtime_output", requestId);
      }
      route = parseRouteEvent(event, requestId);
      storyContext = route.storyContext;
      onRoute?.(route);
      return;
    }
    if (event.type === "chunk" && typeof event.text === "string") {
      const submittedAcknowledgementAttested = route?.handling === "submitted"
        && provider === "deepseek"
        && model === "deepseek-v4-flash"
        && requestedProfileId === "deepseek"
        && profileId === "deepseek"
        && routeFallbackApplied === false
        && routeAttested;
      if (
        route === undefined
        || (!routeAttested && route.handling !== "conversation")
        || (route.handling !== "conversation" && !submittedAcknowledgementAttested)
        || (route.handling === "conversation" && !routeAttested)
        || completed
        || roomCompleted
      ) {
        throw new NovelistChatRequestError("invalid_runtime_output", requestId);
      }
      if (event.text.includes("\uFFFD")) {
        throw new NovelistChatRequestError("invalid_runtime_output", requestId);
      }
      onChunk(event.text);
      return;
    }
    if (event.type === "room_complete") {
      if (
        route === undefined
        || route.handling === "conversation"
        || roomCompleted
        || event.intent !== route.intent
        || event.handling !== route.handling
        || (route.handling === "submitted" && !completed)
      ) {
        throw new NovelistChatRequestError("invalid_runtime_output", requestId);
      }
      if (event.storyContext !== undefined) {
        const completedStoryContext = parseRoomStoryContext(event.storyContext);
        if (completedStoryContext === null) {
          throw new NovelistChatRequestError("invalid_runtime_output", requestId);
        }
        storyContext = completedStoryContext;
      }
      roomCompleted = true;
      return;
    }
    if (event.type === "ready" || event.type === "complete") {
      if (
        route === undefined
        || route.handling === "not_available"
        || roomCompleted
        || (event.type === "ready" && routeAttested)
        || (event.type === "complete" && (!routeAttested || completed))
      ) {
        throw new NovelistChatRequestError("invalid_runtime_output", requestId);
      }
      const eventRequestedProfileId = event.requestedProfileId;
      const actualProfileId = event.actualProfileId;
      if (
        typeof event.provider !== "string"
        || !event.provider.trim()
        || typeof event.model !== "string"
        || !event.model.trim()
        || (eventRequestedProfileId !== undefined
          && !isVnextModelProfileId(eventRequestedProfileId))
        || (actualProfileId !== undefined
          && !isVnextModelProfileId(actualProfileId))
        || eventRequestedProfileId !== actualProfileId
        || event.requestedTier !== "light"
        || typeof event.routeFallbackApplied !== "boolean"
        || event.fallbackApplied !== false
        || (route.handling === "submitted" && (
          event.provider !== "deepseek"
          || event.model !== "deepseek-v4-flash"
          || eventRequestedProfileId !== "deepseek"
          || actualProfileId !== "deepseek"
          || event.routeFallbackApplied !== false
        ))
      ) {
        throw new NovelistChatRequestError("invalid_runtime_output", requestId);
      }
      if (
        (event.type === "ready" && routeAttested) ||
        (event.type === "complete" && !routeAttested) ||
        (routeAttested &&
          (provider !== event.provider ||
            model !== event.model ||
            requestedProfileId !== eventRequestedProfileId ||
            profileId !== actualProfileId ||
            routeFallbackApplied !== event.routeFallbackApplied))
      ) {
        throw new NovelistChatRequestError("invalid_runtime_output", requestId);
      }
      provider = event.provider;
      model = event.model;
      requestedProfileId = isVnextModelProfileId(eventRequestedProfileId)
        ? eventRequestedProfileId
        : requestedProfileId;
      profileId = isVnextModelProfileId(actualProfileId)
        ? actualProfileId
        : profileId;
      routeFallbackApplied = event.routeFallbackApplied;
      routeAttested = true;
      if (event.type === "complete") completed = true;
      return;
    }
    if (event.type === "error") {
      const recovery = typeof event.recovery === "string" && RECOVERY_ACTION_SET.has(event.recovery)
        ? event.recovery as ExperienceRecoveryAction
        : undefined;
      throw new NovelistChatRequestError(
        typeof event.code === "string" ? event.code : "provider_unavailable",
        requestId,
        recovery,
      );
    }
    throw new NovelistChatRequestError("invalid_runtime_output", requestId);
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

  if (route === undefined) {
    throw new NovelistChatRequestError("invalid_runtime_output", requestId);
  }
  if (route.handling === "conversation" && !completed) {
    throw new NovelistChatRequestError("provider_connection_reset", requestId);
  }
  if (route.handling !== "conversation" && !roomCompleted) {
    throw new NovelistChatRequestError("provider_connection_reset", requestId);
  }
  const conversationTrace = route.handling === "conversation"
    ? {
        requestedTier: "light" as const,
        ...(routeFallbackApplied === undefined ? {} : { routeFallbackApplied }),
        fallbackApplied: false as const,
      }
    : {};

  return {
    route,
    ...(storyContext === undefined ? {} : { storyContext }),
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
    ...(profileId ? { profileId } : {}),
    ...conversationTrace,
    ...(requestId ? { requestId } : {}),
  };
}
