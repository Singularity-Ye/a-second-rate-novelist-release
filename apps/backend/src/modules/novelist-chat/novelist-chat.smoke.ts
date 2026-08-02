import assert from "node:assert/strict";
import {
  NovelistChatService,
  parseNovelistChatRequest,
  readNovelistChatRuntimeConfig,
} from "./novelist-chat.service.js";

const previousFetch = globalThis.fetch;
const managedEnvironment = [
  "LITELLM_BASE_URL",
  "LITELLM_API_KEY",
  "MODEL_ROUTE_CREATIVE_LARGE_PROVIDER",
  "MODEL_ROUTE_CREATIVE_LARGE_MODEL",
  "MODEL_ROUTE_CREATIVE_LIGHT_PROVIDER",
  "MODEL_ROUTE_CREATIVE_LIGHT_MODEL",
  "VNEXT_CREATIVE_TIMEOUT_MS",
  "XAI_API_KEY",
  "NOVELIST_CHAT_MODEL",
] as const;
const previousEnvironment = Object.fromEntries(
  managedEnvironment.map((name) => [name, process.env[name]]),
);

try {
  const parsed = parseNovelistChatRequest({
    requestId: "smoke-request",
    channel: "novelist",
    text: "继续写吧",
    messages: [
      { role: "user", content: "你好" },
      { role: "assistant", content: "道友，本座已经替你开写了。" },
    ],
    persona: {
      identityName: "修仙大能",
      personalityCode: "ABC",
      addressStyle: "称对方为道友",
      lexicon: ["道友", "本座"],
    },
    task: { status: "offered", title: "今天写一点", deliverable: "一段动作", evidenceStatus: "awaiting" },
    observation: { sceneLabel: "书房", activityLabel: "发呆", focus: 40, fatigue: 20, inspiration: 60, emotionalLoad: 10 },
  });
  assert.equal(parsed.channel, "novelist");
  assert.equal(parsed.persona.identityName, "修仙大能");
  assert.equal(parsed.messages.length, 2);

  let requestBody: Record<string, unknown> | null = null;
  process.env.LITELLM_BASE_URL = "http://127.0.0.1:4317/v1";
  process.env.LITELLM_API_KEY = "unified-smoke-only-key";
  process.env.MODEL_ROUTE_CREATIVE_LARGE_PROVIDER = "company-router";
  process.env.MODEL_ROUTE_CREATIVE_LARGE_MODEL = "grok-4.5";
  process.env.MODEL_ROUTE_CREATIVE_LIGHT_PROVIDER = "company-router";
  process.env.MODEL_ROUTE_CREATIVE_LIGHT_MODEL = "gemini-3.6-flash";
  process.env.VNEXT_CREATIVE_TIMEOUT_MS = "180000";
  process.env.XAI_API_KEY = "legacy-key-must-not-be-used";
  process.env.NOVELIST_CHAT_MODEL = "legacy-model-must-not-be-used";

  const runtime = readNovelistChatRuntimeConfig();
  assert.equal(runtime.config.model, "gemini-3.6-flash");
  assert.equal(runtime.config.provider, "company-router");
  assert.equal(runtime.routeFallbackApplied, false);
  delete process.env.MODEL_ROUTE_CREATIVE_LIGHT_MODEL;
  assert.throws(
    () => readNovelistChatRuntimeConfig(),
    (error: unknown) =>
      error instanceof Error && error.message === "provider_unconfigured",
  );
  process.env.MODEL_ROUTE_CREATIVE_LIGHT_MODEL = "gemini-3.6-flash";

  let authorization = "";
  globalThis.fetch = (async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    authorization = new Headers(init?.headers).get("authorization") ?? "";
    return new Response(
      "data: {\"choices\":[{\"delta\":{\"content\":\"我还没拿到可续写的正式稿件。\"}}]}\n\n"
      + "data: [DONE]\n\n",
      {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "x-vnext-route-attestation": "v1",
          "x-vnext-actual-provider": "company-router",
          "x-vnext-actual-model": "gemini-3.6-flash",
          "x-vnext-fallback-applied": "false",
        },
      },
    );
  }) as typeof fetch;

  const events: string[] = [];
  for await (const event of new NovelistChatService().stream({
    ...parsed,
    runtimeBoundary: {
      requestedIntent: "continue",
      execution: "not_available",
    },
  })) {
    if (event.type === "chunk") events.push(event.text);
  }
  assert.deepEqual(events, ["我还没拿到可续写的正式稿件。"]);
  assert.ok(requestBody);
  const capturedRequest = requestBody as Record<string, unknown>;
  assert.equal(capturedRequest.model, "gemini-3.6-flash");
  assert.equal(capturedRequest.stream, true);
  assert.equal(authorization, "Bearer unified-smoke-only-key");
  assert.ok(Array.isArray(capturedRequest.messages));
  const outboundMessages = capturedRequest.messages as Array<Record<string, unknown>>;
  const systemPrompt = String(outboundMessages[0]?.content ?? "");
  const contextMessage = String(outboundMessages.at(-1)?.content ?? "");
  const outboundHistory = outboundMessages.slice(1, -1);
  assert.match(systemPrompt, /小说家“小韩”本人/u);
  assert.doesNotMatch(systemPrompt, /修仙大能|称对方为道友|人格：ABC/u);
  assert.deepEqual(outboundHistory, [{ role: "user", content: "你好" }]);
  assert.equal(outboundHistory.some((message) => /道友|本座/u.test(String(message.content))), false);
  assert.match(contextMessage, /"requestedIntent":"continue"/u);
  assert.match(contextMessage, /"execution":"not_available"/u);
  assert.doesNotMatch(contextMessage, /修仙大能|称对方为道友/u);

  globalThis.fetch = (async () => new Response(
    "data: {\"choices\":[{\"delta\":{\"content\":\"不应被接收\"}}]}\n\n",
    {
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "x-vnext-route-attestation": "v1",
        "x-vnext-actual-provider": "company-router",
        "x-vnext-actual-model": "gemini-3.6-flash",
        "x-vnext-fallback-applied": "true",
      },
    },
  )) as typeof fetch;
  await assert.rejects(async () => {
    for await (const _event of new NovelistChatService().stream(parsed)) {
      // Route attestation must fail before a user-visible event is emitted.
    }
  }, (error: unknown) => error instanceof Error && error.message === "invalid_runtime_output");

  console.log("novelist-chat smoke passed");
} finally {
  globalThis.fetch = previousFetch;
  for (const name of managedEnvironment) {
    const previous = previousEnvironment[name];
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}
