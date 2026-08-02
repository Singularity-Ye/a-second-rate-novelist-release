import { afterEach, describe, expect, it, vi } from "vitest";
import { streamNovelistChat, type NovelistChatRequest } from "./novelist-chat-api";

const request: NovelistChatRequest = {
  clientRequestId: "10000000-0000-4000-8000-000000000001",
  channel: "novelist",
  text: "听得见吗？",
  messages: [],
  persona: {
    identityName: "小说家系统",
    personalityCode: "ABC",
    addressStyle: "直接称呼",
    interventionStyle: "observe",
    relationshipLabel: "正在建立默契",
    lexicon: [],
    voice: {
      authority: 50,
      warmth: 50,
      pressure: 35,
      humor: 45,
      distance: 40,
    },
  },
  task: {
    status: "offered",
    title: "今天的创作任务",
    deliverable: "完成一个小片段",
    evidenceStatus: "awaiting",
  },
  observation: {
    sceneLabel: "书房",
    activityLabel: "写作",
    focus: 60,
    fatigue: 20,
    inspiration: 50,
    emotionalLoad: 10,
  },
};

const projection = {
  versionId: "20000000-0000-4000-8000-000000000002",
  status: "unavailable",
  headline: "当前还不能开始",
  body: "当前条件还未满足。",
  understanding: null,
  primaryAction: null,
  secondaryActions: [{ code: "return_later", label: "稍后再来" }],
} as const;

function frame(event: string, payload: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("streamNovelistChat", () => {
  it("preserves a structured recovery action from a public HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ code: "compliance_blocked", recovery: "none" }),
      { status: 403, headers: { "content-type": "application/json" } },
    )));

    await expect(streamNovelistChat(request, vi.fn())).rejects.toMatchObject({
      code: "compliance_blocked",
      recovery: "none",
    });
  });

  it("delivers text chunks before the complete frame closes the request", async () => {
    const encoder = new TextEncoder();
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(stream, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        })),
    );
    const chunks: string[] = [];
    let settled = false;
    const resultPromise = streamNovelistChat(request, (chunk) => chunks.push(chunk))
      .finally(() => {
        settled = true;
      });

    streamController.enqueue(
      encoder.encode(
        frame("route", {
          type: "route",
          requestId: request.clientRequestId,
          intent: "conversation",
          handling: "conversation",
          projection,
        })
          + frame("ready", {
            type: "ready",
            requestId: request.clientRequestId,
            provider: "company-router",
            model: "grok-4.5",
            requestedTier: "light",
            routeFallbackApplied: false,
            fallbackApplied: false,
          })
          + frame("chunk", {
            type: "chunk",
            requestId: request.clientRequestId,
            text: "第一截，",
          }),
      ),
    );

    await vi.waitFor(() => expect(chunks).toEqual(["第一截，"]));
    expect(settled).toBe(false);

    streamController.enqueue(
      encoder.encode(
        frame("chunk", {
          type: "chunk",
          requestId: request.clientRequestId,
          text: "第二截。",
        })
          + frame("complete", {
            type: "complete",
            requestId: request.clientRequestId,
            provider: "company-router",
            model: "grok-4.5",
            requestedTier: "light",
            routeFallbackApplied: false,
            fallbackApplied: false,
          }),
      ),
    );
    streamController.close();

    const result = await resultPromise;
    expect(chunks).toEqual(["第一截，", "第二截。"]);
    expect(result.model).toBe("grok-4.5");
    expect(result.route.handling).toBe("conversation");
  });
});
