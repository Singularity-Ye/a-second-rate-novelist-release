import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import {
  createRoomGateway,
  parseRoomRequest,
  readGatewayConfig,
  resolveModelEndpoint,
} from "./server.mjs";

const allowedOrigin = "https://nonghua123.github.io";

function config(overrides = {}) {
  return {
    host: "127.0.0.1",
    port: 4318,
    allowedOrigins: new Set([allowedOrigin]),
    trustProxy: false,
    modelEndpoint: "https://provider.example/v1/chat/completions",
    modelApiKey: "fixture-model-key-not-a-secret",
    modelName: "grok-4.5",
    providerId: "grok",
    modelTimeoutMs: 5_000,
    modelAttempts: 3,
    modelRetryDelayMs: 10,
    rateLimitWindowMs: 60_000,
    rateLimitMax: 10,
    maxConcurrentStreams: 3,
    maxRequestBytes: 49_152,
    ...overrides,
  };
}

function body() {
  return {
    clientRequestId: "a30ffbee-a8c1-4c43-8a74-aa95a77f86f2",
    channel: "novelist",
    text: "你今天写到哪里了？",
    messages: [],
    persona: {},
    task: { title: "先聊清楚", deliverable: "不把聊天冒充作品" },
    observation: { sceneLabel: "书房", activityLabel: "发呆" },
  };
}

async function withServer(server, callback) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("normalizes an OpenAI-compatible provider base URL", () => {
  assert.equal(resolveModelEndpoint("https://provider.example"), "https://provider.example/v1/chat/completions");
  assert.equal(resolveModelEndpoint("https://provider.example/v1"), "https://provider.example/v1/chat/completions");
});

test("requires model secrets only from server environment", () => {
  assert.throws(() => readGatewayConfig({
    ALLOWED_ORIGINS: allowedOrigin,
    MODEL_BASE_URL: "https://provider.example",
    MODEL_NAME: "grok-4.5",
  }), /MODEL_API_KEY is required/u);
});

test("bounds public room requests", () => {
  const parsed = parseRoomRequest(body());
  assert.equal(parsed.channel, "novelist");
  assert.equal(parsed.text, "你今天写到哪里了？");
  assert.throws(() => parseRoomRequest({ ...body(), text: "" }), /invalid_request/u);
});

test("rejects unapproved browser origins", async () => {
  const server = createRoomGateway({ config: config(), logger: { info() {} } });
  await withServer(server, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/vnext/room/messages/stream`, {
      method: "POST",
      headers: { origin: "https://attacker.example", "content-type": "application/json" },
      body: JSON.stringify(body()),
    });
    assert.equal(response.status, 403);
  });
});

test("streams the Pages room contract without exposing the provider key", async () => {
  let authorization = "";
  const fetchImpl = async (_url, init) => {
    authorization = String(init.headers.authorization);
    const frames = [
      `data: ${JSON.stringify({ model: "grok-4.5", choices: [{ delta: { content: "写到一半，" } }] })}\n\n`,
      `data: ${JSON.stringify({ model: "grok-4.5", choices: [{ delta: { content: "正和第二段较劲。" } }] })}\n\n`,
      "data: [DONE]\n\n",
    ].join("");
    return new Response(frames, { status: 200, headers: { "content-type": "text/event-stream" } });
  };
  const server = createRoomGateway({ config: config(), fetchImpl, logger: { info() {} } });
  await withServer(server, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/vnext/room/messages/stream`, {
      method: "POST",
      headers: { origin: allowedOrigin, accept: "text/event-stream", "content-type": "application/json" },
      body: JSON.stringify(body()),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), allowedOrigin);
    const stream = await response.text();
    assert.match(stream, /"type":"route"/u);
    assert.match(stream, /"type":"chunk"/u);
    assert.match(stream, /"type":"complete"/u);
    assert.match(stream, /正和第二段较劲/u);
    assert.doesNotMatch(stream, /fixture-model-key/u);
  });
  assert.equal(authorization, "Bearer fixture-model-key-not-a-secret");
});

test("retries a transient provider connection failure before SSE starts", async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    if (attempts === 1) throw new TypeError("fetch failed");
    const frame = `data: ${JSON.stringify({ model: "grok-4.5", choices: [{ delta: { content: "连接恢复。" } }] })}\n\ndata: [DONE]\n\n`;
    return new Response(frame, { status: 200, headers: { "content-type": "text/event-stream" } });
  };
  const server = createRoomGateway({ config: config(), fetchImpl, logger: { info() {} } });
  await withServer(server, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/vnext/room/messages/stream`, {
      method: "POST",
      headers: { origin: allowedOrigin, "content-type": "application/json" },
      body: JSON.stringify(body()),
    });
    const stream = await response.text();
    assert.equal(response.status, 200);
    assert.match(stream, /连接恢复/u);
    assert.match(stream, /"type":"complete"/u);
  });
  assert.equal(attempts, 2);
});
