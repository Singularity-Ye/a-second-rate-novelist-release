import { randomBytes, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

const gatewayOrigin = process.env.ATTEST_GATEWAY_ORIGIN?.trim() || "http://127.0.0.1:3300";
const publicOrigin = process.env.ATTEST_PUBLIC_ORIGIN?.trim();
const environmentLabel = process.env.ATTEST_ENVIRONMENT?.trim() || "private-pilot";
const username = process.env.PREVIEW_GATEWAY_BASIC_AUTH_USERNAME?.trim();
const password = process.env.PREVIEW_GATEWAY_BASIC_AUTH_PASSWORD;

if (!publicOrigin || !username || !password) {
  throw new Error("attestation_environment_incomplete");
}

const authorization = `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;

function publicFailure(code, details = {}) {
  const error = new Error(code);
  error.publicDetails = details;
  return error;
}

async function parseJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    throw publicFailure("invalid_json_response", { status: response.status });
  }
}

async function jsonRequest(path, { method = "GET", cookie, body } = {}) {
  const headers = {
    accept: "application/json",
    authorization,
    origin: publicOrigin,
  };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${gatewayOrigin}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "error",
  });
  const responseBody = await parseJsonResponse(response);
  if (!response.ok) {
    throw publicFailure("http_request_failed", {
      path,
      status: response.status,
      code:
        responseBody && typeof responseBody === "object" && typeof responseBody.code === "string"
          ? responseBody.code
          : "unknown",
    });
  }
  return { response, body: responseBody };
}

function requireObject(value, code) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw publicFailure(code);
  }
  return value;
}

function profileById(settings, id) {
  const profiles = Array.isArray(settings.profiles) ? settings.profiles : [];
  const profile = profiles.find((candidate) => candidate?.id === id);
  if (!profile) throw publicFailure("profile_missing", { profileId: id });
  return profile;
}

function preferenceFor(settings, purpose) {
  const preferences = requireObject(settings.preferences, "preferences_missing");
  return requireObject(preferences[purpose], "preference_missing");
}

async function selectProfile(cookie, settings, purpose, profileId) {
  const preference = preferenceFor(settings, purpose);
  if (!Number.isSafeInteger(preference.revision) || preference.revision < 0) {
    throw publicFailure("invalid_preference_revision", { purpose });
  }
  return (
    await jsonRequest(`/api/vnext/model-profiles/preferences/${purpose}`, {
      method: "PUT",
      cookie,
      body: { profileId, expectedRevision: preference.revision },
    })
  ).body;
}

async function expectUnavailableProfileWrite(cookie, settings, purpose, profileId) {
  const preference = preferenceFor(settings, purpose);
  const response = await fetch(
    `${gatewayOrigin}/api/vnext/model-profiles/preferences/${purpose}`,
    {
      method: "PUT",
      headers: {
        accept: "application/json",
        authorization,
        cookie,
        origin: publicOrigin,
        "content-type": "application/json",
      },
      body: JSON.stringify({ profileId, expectedRevision: preference.revision }),
      redirect: "error",
    },
  );
  const body = await parseJsonResponse(response);
  const code = body && typeof body === "object" ? body.code : undefined;
  if (response.status !== 400 || code !== "invalid_model_profile") {
    throw publicFailure("unavailable_profile_not_rejected", {
      profileId,
      status: response.status,
      code: typeof code === "string" ? code : "unknown",
    });
  }
  return { profileId, status: response.status, code };
}

function extractCookie(response) {
  const setCookie = response.headers.get("set-cookie");
  const cookie = setCookie?.split(";", 1)[0]?.trim();
  if (!cookie || !cookie.includes("=")) throw publicFailure("session_cookie_missing");
  return cookie;
}

function parseSseFrame(frame) {
  let eventName = "message";
  const dataLines = [];
  for (const line of frame.split(/\r?\n/u)) {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length === 0) return null;
  let data;
  try {
    data = JSON.parse(dataLines.join("\n"));
  } catch {
    throw publicFailure("invalid_sse_json", { eventName });
  }
  return { eventName, data };
}

async function readRoomStream(cookie) {
  const requestId = randomUUID();
  const startedAt = performance.now();
  const response = await fetch(`${gatewayOrigin}/api/vnext/room/messages/stream`, {
    method: "POST",
    headers: {
      accept: "text/event-stream",
      authorization,
      cookie,
      origin: publicOrigin,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      clientRequestId: requestId,
      channel: "novelist",
      text: "连接测试。用六句简短中文说明你已收到这条消息，每句不超过二十字。",
      messages: [],
    }),
    redirect: "error",
  });
  if (!response.ok || !response.body) {
    let code = "unknown";
    try {
      const body = await response.json();
      if (body && typeof body === "object" && typeof body.code === "string") code = body.code;
    } catch {
      // Keep provider/user text out of attestation failures.
    }
    throw publicFailure("room_stream_failed", { status: response.status, code });
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("text/event-stream")) {
    throw publicFailure("room_stream_content_type_invalid", { contentType });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let transportChunks = 0;
  let firstTransportChunkMs = null;
  let firstContentChunkMs = null;
  let completedMs = null;
  let contentCharacters = 0;
  let contentChunkEvents = 0;
  let route = null;
  let ready = null;
  let complete = null;

  const consumeFrame = (frame) => {
    const parsed = parseSseFrame(frame);
    if (!parsed) return;
    const data = requireObject(parsed.data, "invalid_sse_event");
    if (data.requestId !== requestId) {
      throw publicFailure("sse_request_id_mismatch", { eventName: parsed.eventName });
    }
    if (parsed.eventName === "route") route = data;
    if (parsed.eventName === "ready") ready = data;
    if (parsed.eventName === "chunk") {
      if (typeof data.text !== "string") throw publicFailure("invalid_content_chunk");
      contentChunkEvents += 1;
      contentCharacters += Array.from(data.text).length;
      if (firstContentChunkMs === null) firstContentChunkMs = performance.now() - startedAt;
    }
    if (parsed.eventName === "complete") {
      complete = data;
      completedMs = performance.now() - startedAt;
    }
    if (parsed.eventName === "error") {
      throw publicFailure("room_stream_error_event", {
        code: typeof data.code === "string" ? data.code : "unknown",
        routeReceived: route !== null,
        readyReceived: ready !== null,
        contentChunkEvents,
        contentCharacters,
      });
    }
  };

  while (true) {
    const next = await reader.read();
    if (next.done) break;
    transportChunks += 1;
    if (firstTransportChunkMs === null) firstTransportChunkMs = performance.now() - startedAt;
    buffer += decoder.decode(next.value, { stream: true });
    while (true) {
      const boundary = buffer.match(/\r?\n\r?\n/u);
      if (!boundary || boundary.index === undefined) break;
      const frame = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary[0].length);
      consumeFrame(frame);
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) consumeFrame(buffer);

  for (const [name, value] of [
    ["route", route],
    ["ready", ready],
    ["complete", complete],
  ]) {
    if (!value) throw publicFailure("required_sse_event_missing", { eventName: name });
  }
  if (route.intent !== "conversation" || route.handling !== "conversation") {
    throw publicFailure("unexpected_room_route", {
      intent: route.intent,
      handling: route.handling,
    });
  }
  for (const event of [ready, complete]) {
    if (
      event.requestedProfileId !== "deepseek" ||
      event.actualProfileId !== "deepseek" ||
      event.provider !== "deepseek" ||
      event.fallbackApplied !== false ||
      event.routeFallbackApplied !== false
    ) {
      throw publicFailure("room_route_attestation_mismatch", {
        requestedProfileId: event.requestedProfileId,
        actualProfileId: event.actualProfileId,
        provider: event.provider,
        model: event.model,
        fallbackApplied: event.fallbackApplied,
        routeFallbackApplied: event.routeFallbackApplied,
      });
    }
  }
  const incremental =
    contentChunkEvents >= 2 &&
    firstContentChunkMs !== null &&
    completedMs !== null &&
    firstContentChunkMs < completedMs;
  if (!incremental) {
    throw publicFailure("room_stream_not_incremental", {
      contentChunkEvents,
      firstContentChunkMs,
      completedMs,
    });
  }

  return {
    status: response.status,
    contentType,
    route: { intent: route.intent, handling: route.handling },
    requestedProfileId: ready.requestedProfileId,
    actualProfileId: ready.actualProfileId,
    provider: ready.provider,
    model: ready.model,
    fallbackApplied: ready.fallbackApplied,
    routeFallbackApplied: ready.routeFallbackApplied,
    transportChunks,
    contentChunkEvents,
    contentCharacters,
    firstTransportChunkMs: Math.round(firstTransportChunkMs ?? 0),
    firstContentChunkMs: Math.round(firstContentChunkMs ?? 0),
    completedMs: Math.round(completedMs ?? 0),
    incremental,
  };
}

async function main() {
  const manifest = requireObject(
    (await jsonRequest("/api/vnext/sessions/admission-manifest")).body,
    "manifest_invalid",
  );
  const sessionResponse = await jsonRequest("/api/vnext/sessions/guest", {
    method: "POST",
    body: {
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
    },
  });
  const cookie = extractCookie(sessionResponse.response);
  let settings = requireObject(
    (await jsonRequest("/api/vnext/model-profiles", { cookie })).body,
    "model_settings_invalid",
  );

  const expectedStatuses = {
    deepseek: "available",
    gpt: "not_configured",
    gemini: "not_configured",
    grok: "available",
  };
  for (const [profileId, status] of Object.entries(expectedStatuses)) {
    const profile = profileById(settings, profileId);
    if (profile.status !== status) {
      throw publicFailure("profile_status_mismatch", {
        profileId,
        expected: status,
        actual: profile.status,
      });
    }
  }

  const unavailableProfileNegative = await expectUnavailableProfileWrite(
    cookie,
    settings,
    "conversation",
    "gpt",
  );
  settings = requireObject(
    await selectProfile(cookie, settings, "conversation", "deepseek"),
    "conversation_preference_write_invalid",
  );
  settings = requireObject(
    await selectProfile(cookie, settings, "analysis", "grok"),
    "analysis_preference_write_invalid",
  );
  const persisted = requireObject(
    (await jsonRequest("/api/vnext/model-profiles", { cookie })).body,
    "persisted_model_settings_invalid",
  );
  const conversation = preferenceFor(persisted, "conversation");
  const analysis = preferenceFor(persisted, "analysis");
  if (
    conversation.profileId !== "deepseek" ||
    conversation.source !== "stored" ||
    conversation.available !== true ||
    analysis.profileId !== "grok" ||
    analysis.source !== "stored" ||
    analysis.available !== true
  ) {
    throw publicFailure("model_preferences_not_persisted", {
      conversation: {
        profileId: conversation.profileId,
        source: conversation.source,
        available: conversation.available,
      },
      analysis: {
        profileId: analysis.profileId,
        source: analysis.source,
        available: analysis.available,
      },
    });
  }

  const sse = await readRoomStream(cookie);
  const profiles = Object.fromEntries(
    Object.keys(expectedStatuses).map((id) => {
      const profile = profileById(persisted, id);
      return [
        id,
        {
          status: profile.status,
          provider: profile.provider,
          model: profile.model,
          purposes: profile.purposes,
          streaming: profile.streaming,
        },
      ];
    }),
  );
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        evidenceLevel: "private_runtime",
        environment: environmentLabel,
        session: { status: sessionResponse.body.status, httpOnlyCookieReceived: true },
        catalogVersion: persisted.catalogVersion,
        profiles,
        preferences: {
          conversation: {
            profileId: conversation.profileId,
            revision: conversation.revision,
            source: conversation.source,
            available: conversation.available,
          },
          analysis: {
            profileId: analysis.profileId,
            revision: analysis.revision,
            source: analysis.source,
            available: analysis.available,
          },
        },
        negative: { unavailableProfileWrite: unavailableProfileNegative },
        sse,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({
      ok: false,
      code: error instanceof Error ? error.message : "unknown_failure",
      details:
        error && typeof error === "object" && error.publicDetails
          ? error.publicDetails
          : {},
    })}\n`,
  );
  process.exitCode = 1;
});
