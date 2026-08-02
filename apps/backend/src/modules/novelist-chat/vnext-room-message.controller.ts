import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { IncomingMessage } from "node:http";
import type {
  VnextRoomCompleteEvent,
  VnextRoomRouteEvent,
} from "@erliu/shared-contracts/vnext-experience";
import { VnextOriginGuard } from "../../vnext/api/vnext-origin.guard.js";
import { VnextPrincipal } from "../../vnext/api/vnext-principal.decorator.js";
import {
  VnextSessionGuard,
  type VnextAuthenticatedRequest,
} from "../../vnext/api/vnext-session.guard.js";
import type { VnextPrincipalContext } from "../../vnext/domain/vnext-session.repository.js";
import {
  VNEXT_MODEL_RUNTIME_ADMISSION,
  type ModelRuntimeAdmissionPort,
  type ModelRuntimeLease,
} from "../../vnext/domain/model-runtime-admission.port.js";
import {
  ModelProfileSelectionError,
  ModelProfileSelectionService,
} from "../../vnext/application/model-profile-selection.js";
import type { ConfiguredModelProfile } from "../../vnext/infrastructure/configured-model-profile-catalog.js";
import {
  NovelistChatRuntimeError,
  NovelistChatService,
  parseNovelistChatRequest,
  type NovelistChatInput,
} from "./novelist-chat.service.js";
import {
  RoomMessageRoutePublicError,
  RoomMessageRouter,
} from "./room-message-router.js";

interface StreamResponse {
  headersSent: boolean;
  destroyed?: boolean;
  writableEnded?: boolean;
  setHeader(name: string, value: string): void;
  flushHeaders?: () => void;
  write(chunk: string): boolean;
  end(): void;
  once(event: "close" | "drain", listener: () => void): void;
  off(event: "close" | "drain", listener: () => void): void;
  status(code: number): StreamResponse;
  json(body: unknown): void;
}

type StreamRequest = VnextAuthenticatedRequest &
  Pick<IncomingMessage, "aborted" | "destroyed" | "off" | "once">;

interface ParsedRoomMessage extends NovelistChatInput {
  readonly clientRequestId: string;
}

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseVnextRoomMessageRequest(value: unknown): ParsedRoomMessage {
  if (!isRecord(value) || !UUID_V4_PATTERN.test(String(value.clientRequestId ?? ""))) {
    throw new NovelistChatRuntimeError("invalid_request:clientRequestId", 400);
  }
  const clientRequestId = String(value.clientRequestId);
  return {
    ...parseNovelistChatRequest(value),
    clientRequestId,
    requestId: clientRequestId,
  };
}

export async function writeSseEvent(
  response: StreamResponse,
  event: unknown,
  abortSignal?: AbortSignal,
) {
  if (response.destroyed || response.writableEnded || abortSignal?.aborted) {
    return false;
  }
  const type =
    typeof event === "object" && event !== null && "type" in event
      ? String((event as { type: unknown }).type)
      : "message";
  let accepted: boolean;
  try {
    accepted = response.write(
      `event: ${type}\ndata: ${JSON.stringify(event)}\n\n`,
    );
  } catch {
    return false;
  }
  if (accepted) return true;

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const cleanup = () => {
      response.off("drain", onDrain);
      response.off("close", onClose);
      abortSignal?.removeEventListener("abort", onAbort);
    };
    const settle = (value: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const onDrain = () => settle(true);
    const onClose = () => settle(false);
    const onAbort = () => settle(false);
    response.once("drain", onDrain);
    response.once("close", onClose);
    abortSignal?.addEventListener("abort", onAbort, { once: true });
    if (response.destroyed || response.writableEnded || abortSignal?.aborted) {
      settle(false);
    }
  });
}

function beginStream(response: StreamResponse, requestId: string) {
  response.setHeader("X-Request-Id", requestId);
  response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  response.setHeader("Connection", "keep-alive");
  response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  response.setHeader("X-Accel-Buffering", "no");
  response.flushHeaders?.();
}

function chatFailure(error: unknown) {
  if (error instanceof ModelProfileSelectionError) {
    return { code: error.code, status: error.status };
  }
  if (error instanceof NovelistChatRuntimeError) {
    return { code: error.code.split(":", 1)[0], status: error.status };
  }
  return { code: "provider_unavailable", status: 503 };
}

function admissionFailure(code: "duplicate_request" | string) {
  return code === "duplicate_request"
    ? {
        status: 409,
        body: {
          code: "request_in_progress",
          recovery: "wait_for_current_request",
        },
      }
    : {
        status: 429,
        body: {
          code: "model_capacity_exceeded",
          recovery: "retry_later",
        },
      };
}

@Controller("vnext/room")
export class VnextRoomMessageController {
  constructor(
    @Inject(RoomMessageRouter)
    private readonly router: RoomMessageRouter,
    @Inject(NovelistChatService)
    private readonly chat: NovelistChatService,
    @Inject(ModelProfileSelectionService)
    private readonly modelProfiles: ModelProfileSelectionService,
    @Inject(VNEXT_MODEL_RUNTIME_ADMISSION)
    private readonly admission: ModelRuntimeAdmissionPort,
  ) {}

  @Post("messages/stream")
  @HttpCode(200)
  @UseGuards(VnextOriginGuard, VnextSessionGuard)
  async stream(
    @Body() body: unknown,
    @VnextPrincipal() principal: VnextPrincipalContext,
    @Req() request: StreamRequest,
    @Res() response: StreamResponse,
  ) {
    let input: ParsedRoomMessage;
    try {
      input = parseVnextRoomMessageRequest(body);
    } catch (error) {
      const failure = chatFailure(error);
      response.status(failure.status).json({
        code: failure.code,
        recovery: "correct_request",
      });
      return;
    }
    if (request.vnextSessionId === undefined) {
      response.status(401).json({
        code: "authentication_required",
        recovery: "restore_session",
      });
      return;
    }

    let routed;
    try {
      routed = await this.router.route({
        ownerPrincipalId: principal.id,
        experienceSessionId: request.vnextSessionId,
        clientRequestId: input.clientRequestId,
        channel: input.channel,
        text: input.text,
      });
    } catch (error) {
      if (error instanceof RoomMessageRoutePublicError) {
        response.status(error.status).json(error.body);
        return;
      }
      response.status(503).json({
        code: "temporarily_unavailable",
        recovery: "return_later",
      });
      return;
    }

    let runtimeProfile: ConfiguredModelProfile | undefined;
    if (routed.handling === "conversation") {
      try {
        runtimeProfile = (
          await this.modelProfiles.resolve(principal.id, "conversation")
        ).profile;
      } catch (error) {
        const failure = chatFailure(error);
        response.status(failure.status).json({
          code: failure.code,
          recovery:
            failure.code === "model_profile_unavailable"
              ? "choose_available_profile"
              : "configure_provider",
        });
        return;
      }
    }

    let runtimeLease: ModelRuntimeLease | undefined;
    if (runtimeProfile !== undefined) {
      let admission;
      try {
        admission = await this.admission.tryAcquire({
          ownerPrincipalId: principal.id,
          purpose: "conversation",
          profileId: runtimeProfile.id,
          requestId: input.clientRequestId,
        });
      } catch {
        response.status(503).json({
          code: "capacity_control_unavailable",
          recovery: "return_later",
        });
        return;
      }
      if (!admission.accepted) {
        const failure = admissionFailure(admission.code);
        response.setHeader(
          "Retry-After",
          String(admission.retryAfterSeconds),
        );
        response.status(failure.status).json(failure.body);
        return;
      }
      runtimeLease = admission.lease;
    }

    if (routed.handling !== "conversation") {
      beginStream(response, input.clientRequestId);
      const routeEvent: VnextRoomRouteEvent = {
        type: "route",
        requestId: input.clientRequestId,
        intent: routed.intent,
        handling: routed.handling,
        projection: routed.projection,
      };
      const routeWritten = await writeSseEvent(response, routeEvent);
      if (routeWritten) {
        if (routed.intent === "conversation") {
          await writeSseEvent(response, {
            type: "error",
            requestId: input.clientRequestId,
            code: "invalid_runtime_output",
          });
        } else {
          const completeEvent: VnextRoomCompleteEvent = {
            type: "room_complete",
            requestId: input.clientRequestId,
            intent: routed.intent,
            handling: routed.handling,
          };
          await writeSseEvent(response, completeEvent);
        }
      }
      if (!response.destroyed && !response.writableEnded) response.end();
      return;
    }

    const clientAbort = new AbortController();
    const abortForDisconnect = () =>
      clientAbort.abort(new Error("client_disconnected"));
    request.once("aborted", abortForDisconnect);
    response.once("close", abortForDisconnect);
    // IncomingMessage.destroyed can already be true after Nest has consumed a
    // complete request body, so it is not a disconnect signal here. Only the
    // explicit aborted event/flag and the response close lifecycle are valid.
    if (request.aborted || response.destroyed) {
      abortForDisconnect();
    }

    const truthfulChatInput: NovelistChatInput = {
      ...input,
      runtimeBoundary: {
        requestedIntent: routed.intent,
        execution:
          routed.intent === "conversation" ? "not_requested" : "not_available",
      },
      task: {
        status: routed.projection.status,
        title: routed.projection.headline,
        deliverable: routed.projection.body,
        evidenceStatus:
          routed.projection.status === "draft_ready" ? "draft_ready" : "not_ready",
      },
      ...(runtimeProfile === undefined ? {} : { runtimeProfile }),
      runtimeAbortSignal: clientAbort.signal,
    };
    try {
      beginStream(response, input.clientRequestId);
      const routeEvent: VnextRoomRouteEvent = {
        type: "route",
        requestId: input.clientRequestId,
        intent: routed.intent,
        handling: routed.handling,
        projection: routed.projection,
      };
      if (!(await writeSseEvent(response, routeEvent, clientAbort.signal))) {
        return;
      }
      for await (const event of this.chat.stream(truthfulChatInput)) {
        if (clientAbort.signal.aborted || response.destroyed) break;
        if (!(await writeSseEvent(response, event, clientAbort.signal))) break;
      }
    } catch (error) {
      if (!clientAbort.signal.aborted && !response.destroyed) {
        const failure = chatFailure(error);
        await writeSseEvent(response, {
          type: "error",
          requestId: input.clientRequestId,
          code: failure.code,
        }, clientAbort.signal);
      }
    } finally {
      request.off("aborted", abortForDisconnect);
      response.off("close", abortForDisconnect);
      // Release is network-backed in multi-replica deployments. A bounded
      // adapter failure must not leave the HTTP response hanging; the lease
      // TTL remains the crash-recovery backstop.
      await runtimeLease?.release().catch(() => undefined);
      if (!response.destroyed && !response.writableEnded) response.end();
    }
  }
}
