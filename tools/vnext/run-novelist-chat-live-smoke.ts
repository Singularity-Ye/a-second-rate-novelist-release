import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  NovelistChatService,
  parseNovelistChatRequest,
  type NovelistChatInput,
} from "../../apps/backend/src/modules/novelist-chat/novelist-chat.service.ts";

const expectedModel = process.env.TC209_EXPECTED_LIGHT_MODEL?.trim() || "gemini-3.6-flash";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function baseInput(text: string, messages: NovelistChatInput["messages"]) {
  return parseNovelistChatRequest({
    requestId: randomUUID(),
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
      status: "unavailable",
      title: "当前还不能开始",
      deliverable: "还没有可续写的已接受正文",
      evidenceStatus: "not_ready",
    },
    observation: {
      sceneLabel: "书房",
      activityLabel: "等待",
      focus: 50,
      fatigue: 20,
      inspiration: 40,
      emotionalLoad: 10,
    },
  });
}

async function run(input: NovelistChatInput) {
  const startedAt = performance.now();
  let firstChunkMs = -1;
  let completeMs = -1;
  let chunks = 0;
  let text = "";
  let route: Record<string, unknown> | undefined;
  for await (const event of new NovelistChatService().stream(input)) {
    if (event.type === "ready") route = event;
    if (event.type === "chunk") {
      if (firstChunkMs < 0) firstChunkMs = Math.round(performance.now() - startedAt);
      chunks += 1;
      text += event.text;
    }
    if (event.type === "complete") {
      completeMs = Math.round(performance.now() - startedAt);
      route = event;
    }
  }
  assert(route, "missing route attestation");
  assert(route.model === expectedModel, `expected ${expectedModel}, received ${String(route.model)}`);
  assert(route.requestedTier === "light", "chat did not request light tier");
  assert(route.routeFallbackApplied === false && route.fallbackApplied === false, "chat used a fallback route");
  assert(chunks > 0 && firstChunkMs >= 0 && completeMs >= firstChunkMs, "chat was not incrementally streamed");
  return { text, chunks, firstChunkMs, completeMs, route };
}

async function main() {
  const memoryQuestion = "你还记得上一本小说的内容吗？只按你现在实际拿到的作品事实回答。";
  const memory = await run({
    ...baseInput(memoryQuestion, []),
    runtimeBoundary: { requestedIntent: "conversation", execution: "not_requested" },
  });
  assert(!/(道友|本座)/u.test(memory.text), "novelist inherited the main-system persona");

  const continuationQuestion = "继续写吧";
  const continuation = await run({
    ...baseInput(continuationQuestion, [
      { role: "user", content: memoryQuestion },
      { role: "assistant", content: memory.text },
    ]),
    runtimeBoundary: { requestedIntent: "continue", execution: "not_available" },
  });
  assert(!/(道友|本座)/u.test(continuation.text), "continuation reply inherited the main-system persona");
  assert(/(还没|尚未|不能|没拿到|暂时|无法)/u.test(continuation.text), "continuation reply hid the unavailable boundary");
  assert(!/(已经开写|已经动笔|正在续写|已经续写|已经改好)/u.test(continuation.text), "continuation reply claimed a false action");

  console.log(JSON.stringify({
    verdict: "PASS",
    expectedModel,
    memory: {
      provider: memory.route.provider,
      model: memory.route.model,
      requestedTier: memory.route.requestedTier,
      routeFallbackApplied: memory.route.routeFallbackApplied,
      fallbackApplied: memory.route.fallbackApplied,
      chunks: memory.chunks,
      firstChunkMs: memory.firstChunkMs,
      completeMs: memory.completeMs,
      reply: memory.text,
    },
    continuation: {
      provider: continuation.route.provider,
      model: continuation.route.model,
      requestedTier: continuation.route.requestedTier,
      routeFallbackApplied: continuation.route.routeFallbackApplied,
      fallbackApplied: continuation.route.fallbackApplied,
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
