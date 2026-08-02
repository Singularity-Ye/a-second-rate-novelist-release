import { randomBytes, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

const apiBase =
  process.env.TC215_PUBLIC_API_BASE_URL?.trim() ||
  "http://127.0.0.1:3000/api";
const origin = process.env.TC215_ORIGIN?.trim() || "http://127.0.0.1:3000";
const timeoutMs = 180_000;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function record(value: unknown, message = "expected object") {
  assert(
    typeof value === "object" && value !== null && !Array.isArray(value),
    message,
  );
  return value as Record<string, unknown>;
}

async function timedFetch(input: string, init: RequestInit = {}) {
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
  const manifestResponse = await timedFetch(
    `${apiBase}/vnext/sessions/admission-manifest`,
    { headers: { accept: "application/json", origin } },
  );
  assert(manifestResponse.status === 200, `manifest ${manifestResponse.status}`);
  const manifest = record(await manifestResponse.json());
  const response = await timedFetch(`${apiBase}/vnext/sessions/guest`, {
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
  assert(response.status === 201, `guest session ${response.status}`);
  const setCookie = response.headers.get("set-cookie");
  assert(setCookie, "guest session cookie missing");
  return setCookie.split(";", 1)[0]!;
}

async function readSettings(cookie: string) {
  const response = await timedFetch(`${apiBase}/vnext/model-profiles`, {
    headers: { accept: "application/json", cookie, origin },
  });
  assert(response.status === 200, `model settings ${response.status}`);
  return record(await response.json(), "model settings must be an object");
}

function preference(settings: Record<string, unknown>, purpose: string) {
  const preferences = record(settings.preferences, "preferences missing");
  return record(preferences[purpose], `${purpose} preference missing`);
}

function profile(settings: Record<string, unknown>, profileId: string) {
  assert(Array.isArray(settings.profiles), "profile catalog missing");
  const selected = settings.profiles
    .map((item) => record(item, "invalid profile"))
    .find((item) => item.id === profileId);
  assert(selected, `profile ${profileId} missing`);
  return selected;
}

async function selectProfile(
  cookie: string,
  settings: Record<string, unknown>,
  purpose: "conversation" | "analysis",
  profileId: "deepseek" | "grok",
) {
  const current = preference(settings, purpose);
  assert(
    typeof current.revision === "number" &&
      Number.isSafeInteger(current.revision) &&
      current.revision >= 0,
    `${purpose} revision invalid`,
  );
  const response = await timedFetch(
    `${apiBase}/vnext/model-profiles/preferences/${purpose}`,
    {
      method: "PUT",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        cookie,
        origin,
      },
      body: JSON.stringify({
        profileId,
        expectedRevision: current.revision,
      }),
    },
  );
  assert(response.status === 200, `${purpose}/${profileId} selection ${response.status}`);
  const updated = record(await response.json());
  const selected = preference(updated, purpose);
  assert(selected.profileId === profileId, `${purpose} selection did not persist`);
  assert(selected.available === true, `${profileId} is not available for ${purpose}`);
  return updated;
}

interface StreamProof {
  readonly profileId: string;
  readonly provider: string;
  readonly model: string;
  readonly chunks: number;
  readonly networkReads: number;
  readonly firstChunkMs: number;
  readonly completeMs: number;
}

async function streamProof(
  cookie: string,
  expectedProfile: Record<string, unknown>,
): Promise<StreamProof> {
  assert(typeof expectedProfile.id === "string", "expected profile id missing");
  assert(typeof expectedProfile.provider === "string", "expected provider missing");
  assert(typeof expectedProfile.model === "string", "expected model missing");
  const clientRequestId = randomUUID();
  const started = performance.now();
  const response = await timedFetch(`${apiBase}/vnext/room/messages/stream`, {
    method: "POST",
    headers: {
      accept: "text/event-stream",
      "content-type": "application/json",
      cookie,
      origin,
    },
    body: JSON.stringify({
      clientRequestId,
      channel: "novelist",
      text: "只按当前真实状态，简短告诉我你是否在线。",
      messages: [],
      persona: {
        identityName: "玄烛剑尊",
        personalityCode: "AAA",
        addressStyle: "直说",
        interventionStyle: "observe",
        relationshipLabel: "刚刚绑定",
        lexicon: ["道友", "本座"],
        voice: {
          authority: 80,
          warmth: 35,
          pressure: 50,
          humor: 35,
          distance: 60,
        },
      },
      task: {
        status: "offered",
        title: "连接验证",
        deliverable: "只验证流式模型路由",
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
  assert(response.status === 200, `room stream ${response.status}`);
  assert(
    (response.headers.get("content-type") ?? "").includes("text/event-stream"),
    "room response is not SSE",
  );
  if (new URL(apiBase).port === "3000") {
    assert(
      response.headers.get("x-erliu-sse-proxy") === "byte-stream-v2",
      "3000 did not use the byte-stream proxy",
    );
  }
  assert(response.body, "room stream body missing");

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  let routeSeen = false;
  let ready: Record<string, unknown> | undefined;
  let complete: Record<string, unknown> | undefined;
  let chunks = 0;
  let networkReads = 0;
  let firstChunkMs = -1;
  let completeMs = -1;

  const consume = (frame: string) => {
    const data = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim();
    if (!data) return;
    const event = record(JSON.parse(data), "invalid SSE event");
    if (event.type === "route") routeSeen = true;
    if (event.type === "ready") ready = event;
    if (event.type === "chunk") {
      assert(routeSeen && ready, "chunk arrived before route attestation");
      assert(typeof event.text === "string" && !event.text.includes("\uFFFD"), "invalid chunk");
      if (firstChunkMs < 0) firstChunkMs = Math.round(performance.now() - started);
      chunks += 1;
    }
    if (event.type === "complete") {
      complete = event;
      completeMs = Math.round(performance.now() - started);
    }
    if (event.type === "error") throw new Error(`room stream ${String(event.code)}`);
  };

  while (true) {
    const next = await reader.read();
    networkReads += 1;
    buffer += decoder.decode(next.value ?? new Uint8Array(), {
      stream: !next.done,
    });
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

  assert(routeSeen && ready && complete, "incomplete room stream contract");
  for (const event of [ready, complete]) {
    assert(event.requestedProfileId === expectedProfile.id, "requested profile mismatch");
    assert(event.actualProfileId === expectedProfile.id, "actual profile mismatch");
    assert(event.provider === expectedProfile.provider, "provider mismatch");
    assert(event.model === expectedProfile.model, "model mismatch");
    assert(event.routeFallbackApplied === false, "route fallback applied");
    assert(event.fallbackApplied === false, "provider fallback applied");
  }
  assert(chunks > 0 && firstChunkMs >= 0, "no streamed chunks");
  assert(completeMs > firstChunkMs, "reply was not incrementally observable");

  return {
    profileId: expectedProfile.id,
    provider: expectedProfile.provider,
    model: expectedProfile.model,
    chunks,
    networkReads,
    firstChunkMs,
    completeMs,
  };
}

async function main() {
  const cookie = await createSessionCookie();
  let settings = await readSettings(cookie);
  const deepseek = profile(settings, "deepseek");
  const grok = profile(settings, "grok");
  for (const candidate of [deepseek, grok]) {
    assert(candidate.status === "available", `${String(candidate.id)} not available`);
    assert(
      Array.isArray(candidate.purposes) && candidate.purposes.includes("conversation"),
      `${String(candidate.id)} cannot serve conversation`,
    );
  }

  settings = await selectProfile(
    cookie,
    settings,
    "conversation",
    "deepseek",
  );
  const deepseekProof = await streamProof(cookie, deepseek);

  settings = await selectProfile(cookie, settings, "conversation", "grok");
  const grokProof = await streamProof(cookie, grok);

  settings = await selectProfile(cookie, settings, "analysis", "grok");
  const persisted = await readSettings(cookie);
  assert(
    preference(persisted, "conversation").profileId === "grok",
    "conversation preference was not persisted",
  );
  assert(
    preference(persisted, "analysis").profileId === "grok",
    "analysis preference was not persisted",
  );

  console.log(
    JSON.stringify(
      {
        verdict: "PASS",
        apiBase,
        profileStatus: (persisted.profiles as Record<string, unknown>[]).map(
          (item) => ({ id: item.id, status: item.status }),
        ),
        preferences: persisted.preferences,
        rounds: [deepseekProof, grokProof],
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
