import type { BranchSparseMemory } from "../vnext/world-lab/interactive-branch";

export interface WorldLabTurnRequest {
  requestId: string;
  storyTitle: string;
  genre: string;
  currentScene: string;
  selectedAction: string;
  depth: number;
  nodes: Array<{ id: string; label: string; kind: string }>;
  accumulatedPreferences: string[];
  branchMemory: BranchSparseMemory;
}

export interface WorldLabTurnResponse {
  scene: string;
  preferenceSignals: string[];
  deltas: Array<{ targetNodeId: string; label: string; before: string; after: string }>;
  discoveries: Array<{ label: string; kind: string; summary: string; connectToNodeId: string; relationLabel: string }>;
  memoryUpdates: Array<{
    kind: "character_state" | "relationship" | "timeline" | "item" | "foreshadowing" | "promise";
    key: string;
    value: string;
    status: "active" | "resolved";
    relevantNodeIds: string[];
  }>;
  choices: Array<{
    label: string;
    hint: string;
    preferenceSignals: string[];
    predictedDeltas: Array<{ targetNodeId: string; label: string; before: string; after: string }>;
  }>;
  trace: { traceId: string; provider: string; model: string; responseFormat?: "strict" | "json_object"; workflowVersion: string; outputHash: string };
  fallbackApplied: false;
}

export class WorldLabRequestError extends Error {
  readonly code: string;
  readonly requestId: string | undefined;
  readonly detail: string | undefined;

  constructor(code: string, requestId?: string, detail?: string) {
    super(code);
    this.name = "WorldLabRequestError";
    this.code = code;
    this.requestId = requestId;
    this.detail = detail;
  }
}

export function worldLabErrorCode(error: unknown, fallback = "provider_unavailable") {
  return error instanceof WorldLabRequestError
    ? error.code
    : error instanceof Error && error.message
      ? error.message
      : fallback;
}

export function worldLabErrorRequestId(error: unknown) {
  return error instanceof WorldLabRequestError ? error.requestId : undefined;
}

export function worldLabErrorDetail(error: unknown) {
  return error instanceof WorldLabRequestError ? error.detail : undefined;
}

export function worldLabErrorMessage(message: string, error: unknown) {
  const requestId = worldLabErrorRequestId(error);
  const detail = worldLabErrorDetail(error);
  const detailSuffix = detail ? `：${detail}` : "";
  return requestId ? `${message}${detailSuffix}（任务 ${requestId}）` : `${message}${detailSuffix}`;
}

function validText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function httpFallbackErrorCode(status: number) {
  if (status === 401 || status === 403) return "provider_auth_failed";
  if (status === 408 || status === 504) return "provider_timeout";
  if (status === 429) return "provider_rate_limited";
  return "provider_unavailable";
}

export function worldLabRequestError(payload: unknown, fallbackCode = "provider_unavailable", response?: Response) {
  const record = typeof payload === "object" && payload !== null && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : null;
  const responseFallback = response && !response.ok ? httpFallbackErrorCode(response.status) : fallbackCode;
  const code = typeof record?.code === "string" ? record.code : responseFallback;
  const requestId = typeof record?.requestId === "string"
    ? record.requestId
    : response?.headers.get("x-request-id") ?? undefined;
  const detail = typeof record?.reason === "string"
    ? record.reason
    : typeof record?.detail === "string"
      ? record.detail
      : undefined;
  return new WorldLabRequestError(code, requestId, detail);
}

function requestError(payload: unknown, fallbackCode = "provider_unavailable", response?: Response) {
  return worldLabRequestError(payload, fallbackCode, response);
}

function parseResponse(value: unknown): WorldLabTurnResponse {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("invalid_runtime_output");
  const output = value as Record<string, unknown>;
  if (!validText(output.scene) || !Array.isArray(output.preferenceSignals) || !Array.isArray(output.deltas) || !Array.isArray(output.discoveries) || !Array.isArray(output.memoryUpdates) || !Array.isArray(output.choices) || output.choices.length !== 3 || output.fallbackApplied !== false) {
    throw new Error("invalid_runtime_output");
  }
  const trace = output.trace as Record<string, unknown> | null;
  if (!trace || !validText(trace.traceId) || !validText(trace.provider) || !validText(trace.model) || trace.workflowVersion !== "vnext.world-lab-turn.v3") {
    throw new Error("invalid_runtime_output");
  }
  return output as unknown as WorldLabTurnResponse;
}

export async function generateWorldLabTurn(input: Omit<WorldLabTurnRequest, "requestId">) {
  const response = await fetch("/api/vnext/world-lab/turns", {
    method: "POST",
    credentials: "include",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ ...input, requestId: globalThis.crypto.randomUUID() }),
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw requestError(null, httpFallbackErrorCode(response.status), response);
  }
  if (!response.ok) {
    throw requestError(payload, httpFallbackErrorCode(response.status), response);
  }
  try {
    return parseResponse(payload);
  } catch {
    throw requestError(null, "invalid_runtime_output", response);
  }
}

export async function generateWorldLabTurnStream(
  input: Omit<WorldLabTurnRequest, "requestId">,
  onSceneChunk: (chunk: string) => void,
) {
  const requestId = globalThis.crypto.randomUUID();
  const response = await fetch("/api/vnext/world-lab/turns/stream", {
    method: "POST",
    credentials: "include",
    headers: { accept: "text/event-stream", "content-type": "application/json" },
    body: JSON.stringify({ ...input, requestId }),
  });

  if (response.status === 404 || response.status === 501) {
    return generateWorldLabTurn(input);
  }
  if (!response.ok) {
    let payload: unknown = null;
    try { payload = await response.json(); } catch { /* preserve the stable provider error below */ }
    const error = requestError(payload, response.status === 400 ? "stream_unsupported" : httpFallbackErrorCode(response.status), response);
    if (error.code === "stream_unsupported") return generateWorldLabTurn(input);
    throw error;
  }
  if (!response.body) return generateWorldLabTurn(input);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: WorldLabTurnResponse | null = null;
  let sawScene = false;

  const consumeFrame = (frame: string) => {
    const data = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") return;
    const event = JSON.parse(data) as { type?: string; text?: string; result?: unknown; code?: string; requestId?: string };
    if (event.type === "scene" && typeof event.text === "string") {
      sawScene = true;
      onSceneChunk(event.text);
      return;
    }
    if (event.type === "complete") {
      try {
        result = parseResponse(event.result);
      } catch {
        throw new WorldLabRequestError("invalid_runtime_output", event.requestId ?? response.headers.get("x-request-id") ?? undefined);
      }
      return;
    }
    if (event.type === "error") {
      const code = event.code ?? "provider_unavailable";
      if (code === "stream_unsupported" && !sawScene) throw new WorldLabRequestError("__stream_fallback__", event.requestId);
      throw new WorldLabRequestError(code, event.requestId);
    }
  };

  try {
    while (true) {
      const next = await reader.read();
      buffer += decoder.decode(next.value ?? new Uint8Array(), { stream: !next.done });
      buffer = buffer.replace(/\r\n/gu, "\n");
      let separator = buffer.indexOf("\n\n");
      while (separator >= 0) {
        consumeFrame(buffer.slice(0, separator));
        buffer = buffer.slice(separator + 2);
        separator = buffer.indexOf("\n\n");
      }
      if (next.done) break;
    }
    if (buffer.trim()) consumeFrame(buffer);
  } catch (error) {
    if (error instanceof WorldLabRequestError && error.message === "__stream_fallback__") {
      return generateWorldLabTurn(input);
    }
    throw error;
  }
  if (!result) throw new WorldLabRequestError("invalid_runtime_output", response.headers.get("x-request-id") ?? undefined);
  return result;
}

export interface GenerateCharacterPortraitResponse {
  imageUrl: string;
  trace: { traceId: string; provider: string; model: string; workflowVersion: "vnext.image-generation.v1"; outputHash: string };
  fallbackApplied: false;
}

type ImageGenerationJobStatus = "queued" | "running" | "succeeded" | "failed";

interface ImageGenerationJobResponse {
  jobId: string;
  status: ImageGenerationJobStatus;
  statusUrl: string;
  assetUrl?: string;
  errorCode?: string;
  trace?: GenerateCharacterPortraitResponse["trace"];
}

function parseImageGenerationJob(value: unknown): ImageGenerationJobResponse {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("invalid_runtime_output");
  const output = value as Record<string, unknown>;
  const status = output.status;
  if (
    typeof output.jobId !== "string" ||
    !output.jobId ||
    !["queued", "running", "succeeded", "failed"].includes(String(status)) ||
    typeof output.statusUrl !== "string"
  ) {
    throw new Error("invalid_runtime_output");
  }
  const trace = output.trace;
  if (trace !== undefined && (typeof trace !== "object" || trace === null || Array.isArray(trace))) throw new Error("invalid_runtime_output");
  return {
    jobId: output.jobId,
    status: status as ImageGenerationJobStatus,
    statusUrl: output.statusUrl,
    ...(typeof output.assetUrl === "string" ? { assetUrl: output.assetUrl } : {}),
    ...(typeof output.errorCode === "string" ? { errorCode: output.errorCode } : {}),
    ...(trace ? { trace: trace as GenerateCharacterPortraitResponse["trace"] } : {}),
  };
}

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    throw new Error("provider_unavailable");
  }
}

function responseError(payload: unknown) {
  return typeof payload === "object" && payload !== null && "code" in payload
    ? String((payload as { code: unknown }).code)
    : "provider_unavailable";
}

export interface ImageReferenceInput {
  dataUrl: string;
  fileName?: string;
}

export async function generateCharacterPortrait(prompt: string, referenceImage?: ImageReferenceInput) {
  const response = await fetch("/api/vnext/world-lab/images/jobs", {
    method: "POST",
    credentials: "include",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      requestId: globalThis.crypto.randomUUID(),
      prompt,
      size: "1536x1024",
      quality: "medium",
      ...(referenceImage ? { referenceImage } : {}),
    }),
  });
  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(responseError(payload));
  }
  let job = parseImageGenerationJob(payload);
  const deadline = Date.now() + 20 * 60 * 1000;
  while (job.status === "queued" || job.status === "running") {
    if (Date.now() >= deadline) throw new Error("image_job_poll_timeout");
    await new Promise((resolve) => window.setTimeout(resolve, 1_500));
    const poll = await fetch(`/api/vnext/world-lab/images/jobs/${encodeURIComponent(job.jobId)}`, {
      credentials: "include",
      headers: { accept: "application/json" },
    });
    const nextPayload = await readJson(poll);
    if (!poll.ok) throw new Error(responseError(nextPayload));
    job = parseImageGenerationJob(nextPayload);
  }
  if (job.status === "failed") throw new Error(job.errorCode ?? "provider_unavailable");
  if (!job.assetUrl || !job.trace) throw new Error("invalid_runtime_output");
  return {
    imageUrl: `/api/vnext/world-lab/images/jobs/${encodeURIComponent(job.jobId)}/asset`,
    trace: job.trace,
    fallbackApplied: false,
} satisfies GenerateCharacterPortraitResponse;
}
