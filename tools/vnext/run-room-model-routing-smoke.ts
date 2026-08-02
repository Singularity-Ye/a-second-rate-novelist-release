import { randomBytes, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

const backendBase = process.env.TC209_BACKEND_BASE_URL?.trim() || "http://127.0.0.1:4000";
const origin = process.env.TC209_ORIGIN?.trim() || "http://127.0.0.1:3000";
const expectedModel = process.env.TC209_EXPECTED_LIGHT_MODEL?.trim() || "gemini-3.6-flash";
const timeoutMs = 180_000;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function asRecord(value: unknown) {
  assert(typeof value === "object" && value !== null && !Array.isArray(value), "expected object");
  return value as Record<string, unknown>;
}

async function fetchWithTimeout(input: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function createSessionCookie() {
  const manifestResponse = await fetchWithTimeout(
    `${backendBase}/vnext/sessions/admission-manifest`,
    { headers: { accept: "application/json", origin } },
  );
  assert(manifestResponse.status === 200, `manifest status ${manifestResponse.status}`);
  const manifest = asRecord(await manifestResponse.json());
  const response = await fetchWithTimeout(`${backendBase}/vnext/sessions/guest`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      origin,
    },
    body: JSON.stringify({
      clientRequestId: randomUUID(),
      bootstrapRecoverySecret: randomBytes(32).toString("base64url"),
      audienceMode: manifest.audienceMode,
      inputPolicy: manifest.inputPolicy,
      admissionPolicyVersion: manifest.admissionPolicyVersion,
      aiIdentityNoticeVersion: manifest.aiIdentityNoticeVersion,
      serviceTermsVersion: manifest.serviceTermsVersion,
      privacyNoticeVersion: manifest.privacyNoticeVersion,
      aiIdentityAcknowledged: true,
      serviceTermsAccepted: true,
      privacyNoticeAcknowledged: true,
    }),
  });
  if (response.status !== 201) {
    throw new Error(`guest session status ${response.status}: ${await response.text()}`);
  }
  const setCookie = response.headers.get("set-cookie");
  assert(setCookie, "guest session did not set a cookie");
  return setCookie.split(";", 1)[0]!;
}

interface StreamResult {
  readonly text: string;
  readonly route: Record<string, unknown>;
  readonly ready: Record<string, unknown>;
  readonly complete: Record<string, unknown>;
  readonly networkReads: number;
  readonly frames: number;
  readonly chunks: number;
  readonly firstChunkMs: number;
  readonly completeMs: number;
}

async function streamRoomMessage(
  cookie: string,
  text: string,
  messages: readonly { role: "user" | "assistant"; content: string }[],
): Promise<StreamResult> {
  const requestId = randomUUID();
  const startedAt = performance.now();
  const response = await fetchWithTimeout(`${backendBase}/vnext/room/messages/stream`, {
    method: "POST",
    headers: {
      accept: "text/event-stream",
      "content-type": "application/json",
      cookie,
      origin,
    },
    body: JSON.stringify({
      clientRequestId: requestId,
      requestId,
      channel: "novelist",
      text,
      messages,
      persona: {
        identityName: "玄烛剑尊",
        personalityCode: "AAA",
        addressStyle: "称对方为道友",
        interventionStyle: "sword-first",
        relationshipLabel: "刚刚绑定",
        lexicon: ["道友", "本座", "天道"],
        voice: { authority: 95, warmth: 30, pressure: 80, humor: 35, distance: 70 },
      },
      task: {
        status: "offered",
        title: "测试任务",
        deliverable: "只有真实作品才能验收",
        evidenceStatus: "awaiting",
      },
      observation: {
        sceneLabel: "书房",
        activityLabel: "等待",
        focus: 50,
        fatigue: 20,
        inspiration: 40,
        emotionalLoad: 10,
      },
    }),
  });
  if (response.status !== 200) {
    throw new Error(`room status ${response.status}: ${await response.text()}`);
  }
  assert((response.headers.get("content-type") ?? "").includes("text/event-stream"), "room response is not SSE");
  if (new URL(backendBase).port === "3000") {
    assert(
      response.headers.get("x-erliu-sse-proxy") === "byte-stream-v2",
      "H5 room response did not use the dedicated byte-stream proxy",
    );
  }
  assert(response.body, "room response has no body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  let networkReads = 0;
  let frames = 0;
  let chunks = 0;
  let firstChunkMs = -1;
  let completeMs = -1;
  let output = "";
  let route: Record<string, unknown> | undefined;
  let ready: Record<string, unknown> | undefined;
  let complete: Record<string, unknown> | undefined;

  const consume = (frame: string) => {
    const data = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim();
    if (!data) return;
    frames += 1;
    const event = asRecord(JSON.parse(data));
    if (event.type === "route") route = event;
    if (event.type === "ready") ready = event;
    if (event.type === "chunk") {
      assert(typeof event.text === "string", "chunk text missing");
      if (firstChunkMs < 0) firstChunkMs = Math.round(performance.now() - startedAt);
      output += event.text;
      chunks += 1;
    }
    if (event.type === "complete") {
      complete = event;
      completeMs = Math.round(performance.now() - startedAt);
    }
    if (event.type === "error") throw new Error(`room stream error: ${String(event.code)}`);
  };

  while (true) {
    const next = await reader.read();
    networkReads += 1;
    buffer += decoder.decode(next.value ?? new Uint8Array(), { stream: !next.done });
    buffer = buffer.replace(/\r\n/gu, "\n");
    let separator = buffer.indexOf("\n\n");
    while (separator >= 0) {
      consume(buffer.slice(0, separator));
      buffer = buffer.slice(separator + 2);
      separator = buffer.indexOf("\n\n");
    }
    if (next.done) break;
  }
  if (buffer.trim()) consume(buffer);
  assert(route && ready && complete, "incomplete room SSE contract");
  assert(chunks > 0 && firstChunkMs >= 0 && completeMs >= firstChunkMs, "no incremental chunk before completion");
  assert(
    networkReads >= 3,
    `SSE frames were buffered into ${networkReads} response reads`,
  );
  assert(
    completeMs > firstChunkMs,
    `first text chunk was not observable before completion: reads=${networkReads}, frames=${frames}, chunks=${chunks}, firstChunkMs=${firstChunkMs}, completeMs=${completeMs}`,
  );
  assert(ready.model === expectedModel && complete.model === expectedModel, "light model attestation mismatch");
  assert(ready.requestedTier === "light" && complete.requestedTier === "light", "light tier attestation missing");
  assert(ready.routeFallbackApplied === false && complete.routeFallbackApplied === false, "tier fallback was applied");
  assert(ready.fallbackApplied === false && complete.fallbackApplied === false, "provider fallback was applied");
  return { text: output, route, ready, complete, networkReads, frames, chunks, firstChunkMs, completeMs };
}

async function main() {
  const cookie = await createSessionCookie();
  const memoryQuestion = "你还记得上一本小说的内容吗？只按你现在实际拿到的作品事实回答。";
  const memory = await streamRoomMessage(cookie, memoryQuestion, []);
  assert(memory.route.intent === "conversation" && memory.route.handling === "conversation", "memory question route mismatch");
  assert(!memory.text.includes("\uFFFD"), "memory reply contained invalid UTF-8 replacement characters");
  assert(!/(道友|本座)/u.test(memory.text), "novelist inherited the main-system persona");

  const continuationQuestion = "继续写吧";
  const continuation = await streamRoomMessage(cookie, continuationQuestion, [
    { role: "user", content: memoryQuestion },
    { role: "assistant", content: memory.text },
  ]);
  assert(continuation.route.intent === "continue", "continuation intent was lost");
  assert(continuation.route.handling === "conversation", "continuation explanation did not use real conversation SSE");
  assert(!continuation.text.includes("\uFFFD"), "continuation reply contained invalid UTF-8 replacement characters");
  assert(!/(道友|本座)/u.test(continuation.text), "continuation reply inherited the main-system persona");
  assert(
    /(还没|尚未|不能|没拿到|暂时|无法|需要.{0,16}(正文|材料|内容|片段)|请先|得先|提供.{0,16}(正文|材料|内容|片段))/u.test(continuation.text),
    `continuation reply did not state the unavailable boundary: ${continuation.text.slice(0, 240)}`,
  );
  assert(!/(已经开写|已经动笔|正在续写|已经续写|已经改好)/u.test(continuation.text), "continuation reply claimed a false formal action");

  console.log(JSON.stringify({
  verdict: "PASS",
  expectedModel,
  memory: {
    intent: memory.route.intent,
    handling: memory.route.handling,
    provider: memory.complete.provider,
    model: memory.complete.model,
    requestedTier: memory.complete.requestedTier,
    routeFallbackApplied: memory.complete.routeFallbackApplied,
    fallbackApplied: memory.complete.fallbackApplied,
    networkReads: memory.networkReads,
    frames: memory.frames,
    chunks: memory.chunks,
    firstChunkMs: memory.firstChunkMs,
    completeMs: memory.completeMs,
    reply: memory.text,
  },
  continuation: {
    intent: continuation.route.intent,
    handling: continuation.route.handling,
    provider: continuation.complete.provider,
    model: continuation.complete.model,
    requestedTier: continuation.complete.requestedTier,
    routeFallbackApplied: continuation.complete.routeFallbackApplied,
    fallbackApplied: continuation.complete.fallbackApplied,
    networkReads: continuation.networkReads,
    frames: continuation.frames,
    chunks: continuation.chunks,
    firstChunkMs: continuation.firstChunkMs,
    completeMs: continuation.completeMs,
    reply: continuation.text,
  },
  }, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
