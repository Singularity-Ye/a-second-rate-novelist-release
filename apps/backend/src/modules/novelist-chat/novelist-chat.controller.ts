import { Body, Controller, HttpCode, Post, Res, UseGuards } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { VnextOriginGuard } from "../../vnext/api/vnext-origin.guard.js";
import { VnextSessionGuard } from "../../vnext/api/vnext-session.guard.js";
import {
  NovelistChatRuntimeError,
  NovelistChatService,
  parseNovelistChatRequest,
} from "./novelist-chat.service.js";

interface StreamResponse {
  headersSent: boolean;
  setHeader(name: string, value: string): void;
  flushHeaders?: () => void;
  write(chunk: string): boolean;
  end(): void;
  status(code: number): StreamResponse;
  json(body: unknown): void;
}

function requestIdFor(body: unknown) {
  if (typeof body === "object" && body !== null && !Array.isArray(body)) {
    const value = (body as Record<string, unknown>).requestId;
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 200);
  }
  return `novelist-chat-${randomUUID()}`;
}

function failureFor(error: unknown) {
  if (error instanceof NovelistChatRuntimeError) {
    return { code: error.code.split(":", 1)[0], status: error.status };
  }
  return { code: "provider_unavailable", status: 503 };
}

function writeEvent(response: StreamResponse, event: unknown) {
  const type = typeof event === "object" && event !== null && "type" in event
    ? String((event as { type: unknown }).type)
    : "message";
  response.write(`event: ${type}\ndata: ${JSON.stringify(event)}\n\n`);
}

@Controller("chat/novelist")
export class NovelistChatController {
  constructor(private readonly service: NovelistChatService) {}

  @Post("stream")
  @HttpCode(200)
  @UseGuards(VnextOriginGuard, VnextSessionGuard)
  async stream(@Body() body: unknown, @Res() response: StreamResponse) {
    const requestId = requestIdFor(body);
    response.setHeader("X-Request-Id", requestId);
    let input;
    try {
      input = parseNovelistChatRequest(body);
    } catch (error) {
      const failure = failureFor(error);
      response.status(failure.status).json({ code: failure.code, requestId });
      return;
    }

    response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders?.();
    try {
      for await (const event of this.service.stream(input)) {
        writeEvent(response, event);
      }
    } catch (error) {
      const failure = failureFor(error);
      if (!response.headersSent) {
        response.status(failure.status).json({ code: failure.code, requestId });
        return;
      }
      writeEvent(response, { type: "error", requestId, code: failure.code });
    } finally {
      response.end();
    }
  }
}
