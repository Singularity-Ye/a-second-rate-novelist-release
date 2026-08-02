import { afterEach, describe, expect, it, vi } from "vitest";
import { generateWorldLabTurnStream, WorldLabRequestError, type WorldLabTurnRequest, type WorldLabTurnResponse } from "./world-lab-api";

const input: Omit<WorldLabTurnRequest, "requestId"> = {
  storyTitle: "The rain gate",
  genre: "fantasy",
  currentScene: "The protagonist hears a name behind the sealed door.",
  selectedAction: "Ask who is outside.",
  depth: 0,
  nodes: [{ id: "protagonist", label: "Mira", kind: "character" }],
  accumulatedPreferences: [],
  branchMemory: {
    branchId: "main",
    headTurnId: "turn-0",
    checkpointTrail: [],
    earlierSummary: "",
    recentScenes: [{ turnId: "turn-0", action: "opening", scene: "The sealed door waits." }],
    facts: [],
    openThreads: ["the name behind the door"],
    ledgerStats: { character_state: 0, relationship: 0, timeline: 0, item: 0, foreshadowing: 0, promise: 0 },
    retrievedLedger: [],
  },
};

function result(traceId = "trace-stream"): WorldLabTurnResponse {
  return {
    scene: "A voice answers from the rain.",
    preferenceSignals: ["curiosity"],
    deltas: [],
    discoveries: [],
    memoryUpdates: [],
    choices: [
      { label: "Open the door", hint: "Meet the visitor", preferenceSignals: [], predictedDeltas: [] },
      { label: "Stay silent", hint: "Keep the advantage", preferenceSignals: [], predictedDeltas: [] },
      { label: "Search the room", hint: "Find another clue", preferenceSignals: [], predictedDeltas: [] },
    ],
    trace: { traceId, provider: "company-router", model: "gpt-5.5", workflowVersion: "vnext.world-lab-turn.v3", outputHash: "a".repeat(64) },
    fallbackApplied: false,
  };
}

function attestedJsonResponse(payload: WorldLabTurnResponse) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function sseResponse(payload: WorldLabTurnResponse, split = 17) {
  const encoded = JSON.stringify(payload);
  const frames = [
    `event: status\ndata: ${JSON.stringify({ type: "status", phase: "connected", model: "gpt-5.5" })}\n\n`,
    ...[encoded.slice(0, 8), encoded.slice(8, 21), encoded.slice(21)].map((content) =>
      `event: message\ndata: ${JSON.stringify({ id: "trace-stream", choices: [{ delta: { content } }] })}\n\n`,
    ),
    `event: scene\ndata: ${JSON.stringify({ type: "scene", text: payload.scene.slice(0, 9) })}\n\n`,
    `event: scene\ndata: ${JSON.stringify({ type: "scene", text: payload.scene.slice(9) })}\n\n`,
    `event: complete\ndata: ${JSON.stringify({ type: "complete", result: payload })}\n\n`,
    "data: [DONE]\n\n",
  ];
  const bytes = new TextEncoder().encode(frames.join(""));
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (let index = 0; index < bytes.length; index += split) controller.enqueue(bytes.slice(index, index + split));
      controller.close();
    },
  }), { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8" } });
}

afterEach(() => vi.unstubAllGlobals());

describe("generateWorldLabTurnStream", () => {
  it("emits scene chunks before returning the complete validated result", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => sseResponse(result()));
    vi.stubGlobal("fetch", fetcher);
    const chunks: string[] = [];

    const completed = await generateWorldLabTurnStream(input, (chunk) => chunks.push(chunk));

    expect(chunks.join("")).toBe(result().scene);
    expect(completed.trace.traceId).toBe("trace-stream");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("falls back to the non-stream route when streaming is unavailable", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "stream_unsupported" }), { status: 501, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(attestedJsonResponse(result("trace-fallback")));
    vi.stubGlobal("fetch", fetcher);
    const chunks: string[] = [];

    const completed = await generateWorldLabTurnStream(input, (chunk) => chunks.push(chunk));

    expect(completed.trace.traceId).toBe("trace-fallback");
    expect(chunks).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not expose a partial stream as a completed turn", async () => {
    const partial = JSON.stringify({ id: "trace-stream", choices: [{ delta: { content: '{"scene":"partial' } }] });
    const error = JSON.stringify({ type: "error", code: "invalid_runtime_output" });
    const body = `data: ${partial}\n\n` + `event: error\ndata: ${error}\n\n`;
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } })));

    await expect(generateWorldLabTurnStream(input, vi.fn())).rejects.toThrow("invalid_runtime_output");
  });

  it("keeps an upstream outage as one task error and preserves its request id", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ code: "provider_unavailable", requestId: "turn-request-503" }),
      { status: 503, headers: { "content-type": "application/json", "x-request-id": "turn-request-503" } },
    ));
    vi.stubGlobal("fetch", fetcher);

    await expect(generateWorldLabTurnStream(input, vi.fn())).rejects.toMatchObject({
      code: "provider_unavailable",
      requestId: "turn-request-503",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("surfaces provider rate limiting without retrying the same turn", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ code: "provider_rate_limited", requestId: "turn-request-429" }),
      { status: 429, headers: { "content-type": "application/json", "x-request-id": "turn-request-429" } },
    ));
    vi.stubGlobal("fetch", fetcher);

    await expect(generateWorldLabTurnStream(input, vi.fn())).rejects.toMatchObject({
      code: "provider_rate_limited",
      requestId: "turn-request-429",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not fall back after a rate-limit error arrives mid-stream", async () => {
    const body = [
      `event: scene\ndata: ${JSON.stringify({ type: "scene", text: "partial preview" })}\n\n`,
      `event: error\ndata: ${JSON.stringify({ type: "error", code: "provider_rate_limited", requestId: "turn-request-429-stream" })}\n\n`,
    ].join("");
    const fetcher = vi.fn<typeof fetch>(async () => new Response(body, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }));
    vi.stubGlobal("fetch", fetcher);
    const chunks: string[] = [];

    await expect(generateWorldLabTurnStream(input, (chunk) => chunks.push(chunk))).rejects.toMatchObject({
      code: "provider_rate_limited",
      requestId: "turn-request-429-stream",
    });
    expect(chunks).toEqual(["partial preview"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
