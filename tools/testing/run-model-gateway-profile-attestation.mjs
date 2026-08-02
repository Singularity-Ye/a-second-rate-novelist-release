import { performance } from "node:perf_hooks";

const profileId = process.env.ATTEST_PROFILE_ID?.trim();
const environmentLabel = process.env.ATTEST_ENVIRONMENT?.trim() || "private-pilot";
const gatewayOrigin = process.env.ATTEST_MODEL_GATEWAY_ORIGIN?.trim() || "http://127.0.0.1:4317";
const localToken = process.env.VNEXT_LOCAL_ROUTE_ADAPTER_TOKEN;

if (!profileId || !/^[a-z][a-z0-9_-]{0,31}$/u.test(profileId) || !localToken) {
  throw new Error("attestation_environment_incomplete");
}

const prefix = `VNEXT_MODEL_PROFILE_${profileId.toUpperCase().replaceAll("-", "_")}`;
const model = process.env[`${prefix}_MODEL`]?.trim();
const provider = process.env[`${prefix}_PROVIDER`]?.trim();
const enabled = process.env[`${prefix}_ENABLED`]?.trim().toLowerCase();
if (!model || !provider || !["1", "true", "yes", "on"].includes(enabled ?? "")) {
  throw new Error("profile_not_configured");
}

function publicFailure(code, details = {}) {
  const error = new Error(code);
  error.publicDetails = details;
  return error;
}

function parseOpenAiFrame(frame) {
  const dataLines = frame
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());
  if (dataLines.length === 0) return { kind: "empty" };
  const payload = dataLines.join("\n").trim();
  if (payload === "[DONE]") return { kind: "done" };
  try {
    return { kind: "json", value: JSON.parse(payload) };
  } catch {
    throw publicFailure("invalid_provider_sse_json");
  }
}

async function main() {
  const startedAt = performance.now();
  const response = await fetch(`${gatewayOrigin}/v1/chat/completions`, {
    method: "POST",
    headers: {
      accept: "text/event-stream",
      authorization: `Bearer ${localToken}`,
      "content-type": "application/json",
      "x-vnext-model-profile-id": profileId,
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        {
          role: "user",
          content:
            "这是内部合成链路测试。请输出八句彼此不同、每句十五到二十五个汉字的系统架构观察，只输出正文，不提及测试说明。",
        },
      ],
    }),
    redirect: "error",
  });
  if (!response.ok || !response.body) {
    throw publicFailure("gateway_stream_failed", { status: response.status });
  }
  const contentType = response.headers.get("content-type") ?? "";
  const attestedProvider = response.headers.get("x-vnext-actual-provider");
  const attestedModel = response.headers.get("x-vnext-actual-model");
  const attestedProfileId = response.headers.get("x-vnext-actual-profile-id");
  const fallbackApplied = response.headers.get("x-vnext-fallback-applied");
  const attestationVersion = response.headers.get("x-vnext-route-attestation");
  if (
    !contentType.toLowerCase().includes("text/event-stream") ||
    attestationVersion !== "v1" ||
    attestedProvider !== provider ||
    attestedModel !== model ||
    attestedProfileId !== profileId ||
    fallbackApplied !== "false"
  ) {
    throw publicFailure("gateway_attestation_mismatch", {
      contentType,
      attestationVersion,
      provider: attestedProvider,
      model: attestedModel,
      profileId: attestedProfileId,
      fallbackApplied,
    });
  }

  const headersMs = performance.now() - startedAt;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let transportChunks = 0;
  let dataEvents = 0;
  let contentEvents = 0;
  let contentCharacters = 0;
  let firstTransportChunkMs = null;
  let firstContentChunkMs = null;
  let doneMs = null;

  const consumeFrame = (frame) => {
    const parsed = parseOpenAiFrame(frame);
    if (parsed.kind === "empty") return;
    if (parsed.kind === "done") {
      doneMs = performance.now() - startedAt;
      return;
    }
    dataEvents += 1;
    const choice = Array.isArray(parsed.value?.choices) ? parsed.value.choices[0] : undefined;
    const content = choice?.delta?.content;
    if (typeof content === "string" && content.length > 0) {
      contentEvents += 1;
      contentCharacters += Array.from(content).length;
      if (firstContentChunkMs === null) firstContentChunkMs = performance.now() - startedAt;
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
  const completedMs = performance.now() - startedAt;
  const terminalMs = doneMs ?? completedMs;
  const incremental =
    contentEvents >= 2 &&
    firstContentChunkMs !== null &&
    firstContentChunkMs < terminalMs;
  if (!incremental) {
    throw publicFailure("gateway_stream_not_incremental", {
      transportChunks,
      dataEvents,
      contentEvents,
      firstContentChunkMs,
      terminalMs,
    });
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        evidenceLevel: "private_runtime",
        environment: environmentLabel,
        profileId,
        provider: attestedProvider,
        model: attestedModel,
        fallbackApplied: false,
        attestationVersion,
        contentType,
        transportChunks,
        dataEvents,
        contentEvents,
        contentCharacters,
        headersMs: Math.round(headersMs),
        firstTransportChunkMs: Math.round(firstTransportChunkMs ?? 0),
        firstContentChunkMs: Math.round(firstContentChunkMs ?? 0),
        completedMs: Math.round(completedMs),
        incremental,
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

