import type {
  VnextSelectWriteOpeningCandidateRequest,
  VnextWriteOpeningCandidate,
  VnextWriteOpeningCandidateSetResponse,
} from "@erliu/shared-contracts";
import { resolveH5ApiBaseUrl } from "../../lib/runtime-api-base";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const CANDIDATE_SET_FIELDS = new Set([
  "candidateSetId",
  "candidateSetVersion",
  "status",
  "workspace",
  "understanding",
  "commission",
  "task",
  "trace",
  "attestation",
  "candidates",
  "selectedCandidateId",
  "selectedContentId",
]);
const CANDIDATE_FIELDS = new Set([
  "candidateId",
  "candidateSetId",
  "candidateSetVersion",
  "ordinal",
  "techniqueLabels",
  "techniqueSummary",
  "body",
  "bodyHash",
  "status",
]);

export class RoomWriteOpeningVariantsApiError extends Error {
  override readonly name = "RoomWriteOpeningVariantsApiError";

  constructor(
    readonly code: string,
    readonly recovery: string | undefined,
    readonly status: number,
  ) {
    super(code);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactFields(
  value: unknown,
  fields: ReadonlySet<string>,
): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const keys = Reflect.ownKeys(value);
  return keys.length === fields.size
    && keys.every((key) => typeof key === "string" && fields.has(key));
}

function field(value: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && "value" in descriptor
    ? descriptor.value
    : undefined;
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function containsInvalidUnicodeOrControl(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (
      unit === 0xfffd
      || unit === 0x7f
      || (unit < 0x20 && unit !== 0x09 && unit !== 0x0a && unit !== 0x0d)
    ) return true;
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!Number.isInteger(next) || next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
      continue;
    }
    if (unit >= 0xdc00 && unit <= 0xdfff) return true;
  }
  return false;
}

function boundedText(
  value: unknown,
  maximumCodePoints: number,
  minimumCodePoints = 1,
): value is string {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  const length = [...value].length;
  return length >= minimumCodePoints
    && length <= maximumCodePoints
    && !containsInvalidUnicodeOrControl(value);
}

function identityVersion(
  value: unknown,
  versionField: "aggregateVersion" | "version" | "stateVersion",
): { readonly id: string; readonly version: number } | null {
  const fields = new Set(["id", versionField]);
  if (!hasExactFields(value, fields)) return null;
  const id = field(value, "id");
  const version = field(value, versionField);
  return typeof id === "string" && UUID_V4_PATTERN.test(id) && positiveInteger(version)
    ? { id, version }
    : null;
}

async function sha256Hex(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new RoomWriteOpeningVariantsApiError(
      "invalid_runtime_output",
      "return_later",
      502,
    );
  }
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function parseCandidate(
  value: unknown,
  candidateSetId: string,
  candidateSetVersion: number,
): Promise<VnextWriteOpeningCandidate | null> {
  if (!hasExactFields(value, CANDIDATE_FIELDS)) return null;
  const candidateId = field(value, "candidateId");
  const ordinal = field(value, "ordinal");
  const techniqueLabels = field(value, "techniqueLabels");
  const techniqueSummary = field(value, "techniqueSummary");
  const body = field(value, "body");
  const bodyHash = field(value, "bodyHash");
  const status = field(value, "status");
  if (
    typeof candidateId !== "string"
    || !UUID_V4_PATTERN.test(candidateId)
    || field(value, "candidateSetId") !== candidateSetId
    || field(value, "candidateSetVersion") !== candidateSetVersion
    || (ordinal !== 1 && ordinal !== 2 && ordinal !== 3)
    || !Array.isArray(techniqueLabels)
    || techniqueLabels.length < 1
    || techniqueLabels.length > 3
    || techniqueLabels.some((label) => !boundedText(label, 100))
    || !boundedText(techniqueSummary, 2_000)
    || !boundedText(body, 1_200, 500)
    || typeof bodyHash !== "string"
    || !HASH_PATTERN.test(bodyHash)
    || (status !== "pending" && status !== "selected" && status !== "rejected")
  ) return null;
  if (await sha256Hex(body) !== bodyHash) return null;
  return {
    candidateId,
    candidateSetId,
    candidateSetVersion,
    ordinal,
    techniqueLabels: [...techniqueLabels] as string[],
    techniqueSummary,
    body,
    bodyHash,
    status,
  };
}

export async function parseWriteOpeningCandidateSet(
  value: unknown,
): Promise<VnextWriteOpeningCandidateSetResponse | null> {
  if (!hasExactFields(value, CANDIDATE_SET_FIELDS)) return null;
  const candidateSetId = field(value, "candidateSetId");
  const candidateSetVersion = field(value, "candidateSetVersion");
  const status = field(value, "status");
  if (
    typeof candidateSetId !== "string"
    || !UUID_V4_PATTERN.test(candidateSetId)
    || !positiveInteger(candidateSetVersion)
    || (status !== "pending" && status !== "selected" && status !== "rejected")
  ) return null;

  const workspace = identityVersion(field(value, "workspace"), "aggregateVersion");
  const understanding = identityVersion(field(value, "understanding"), "version");
  const commission = identityVersion(field(value, "commission"), "version");
  const task = identityVersion(field(value, "task"), "stateVersion");
  const traceValue = field(value, "trace");
  const attestationValue = field(value, "attestation");
  if (
    workspace === null
    || understanding === null
    || commission === null
    || task === null
    || !hasExactFields(traceValue, new Set(["id", "attemptNumber", "outputHash"]))
    || !hasExactFields(attestationValue, new Set([
      "provider",
      "model",
      "route",
      "workflowVersion",
      "providerTraceId",
      "fallbackApplied",
    ]))
  ) return null;
  const traceId = field(traceValue, "id");
  const traceAttemptNumber = field(traceValue, "attemptNumber");
  const traceOutputHash = field(traceValue, "outputHash");
  const provider = field(attestationValue, "provider");
  const model = field(attestationValue, "model");
  const route = field(attestationValue, "route");
  const workflowVersion = field(attestationValue, "workflowVersion");
  const providerTraceId = field(attestationValue, "providerTraceId");
  if (
    typeof traceId !== "string"
    || !UUID_V4_PATTERN.test(traceId)
    || !positiveInteger(traceAttemptNumber)
    || typeof traceOutputHash !== "string"
    || !HASH_PATTERN.test(traceOutputHash)
    || !boundedText(provider, 100)
    || !boundedText(model, 200)
    || !boundedText(route, 200)
    || !boundedText(workflowVersion, 200)
    || !boundedText(providerTraceId, 200)
    || field(attestationValue, "fallbackApplied") !== false
  ) return null;

  const candidatesValue = field(value, "candidates");
  if (!Array.isArray(candidatesValue) || candidatesValue.length !== 3) return null;
  const parsedCandidates = await Promise.all(candidatesValue.map((candidate) => (
    parseCandidate(candidate, candidateSetId, candidateSetVersion)
  )));
  if (parsedCandidates.some((candidate) => candidate === null)) return null;
  const candidates = parsedCandidates as [
    VnextWriteOpeningCandidate,
    VnextWriteOpeningCandidate,
    VnextWriteOpeningCandidate,
  ];
  candidates.sort((left, right) => left.ordinal - right.ordinal);
  if (
    candidates[0].ordinal !== 1
    || candidates[1].ordinal !== 2
    || candidates[2].ordinal !== 3
    || new Set(candidates.map((candidate) => candidate.candidateId)).size !== 3
  ) return null;

  const selectedCandidateId = field(value, "selectedCandidateId");
  const selectedContentId = field(value, "selectedContentId");
  if (status === "pending") {
    if (
      selectedCandidateId !== null
      || selectedContentId !== null
      || candidates.some((candidate) => candidate.status !== "pending")
    ) return null;
  } else if (status === "selected") {
    if (
      typeof selectedCandidateId !== "string"
      || !UUID_V4_PATTERN.test(selectedCandidateId)
      || typeof selectedContentId !== "string"
      || !UUID_V4_PATTERN.test(selectedContentId)
      || candidates.filter((candidate) => candidate.status === "selected").length !== 1
      || candidates.find((candidate) => candidate.status === "selected")?.candidateId !== selectedCandidateId
      || candidates.some((candidate) => (
        candidate.candidateId !== selectedCandidateId && candidate.status !== "rejected"
      ))
    ) return null;
  } else if (
    selectedCandidateId !== null
    || selectedContentId !== null
    || candidates.some((candidate) => candidate.status !== "rejected")
  ) return null;

  return {
    candidateSetId,
    candidateSetVersion,
    status,
    workspace: { id: workspace.id, aggregateVersion: workspace.version },
    understanding: { id: understanding.id, version: understanding.version },
    commission: { id: commission.id, version: commission.version },
    task: { id: task.id, stateVersion: task.version },
    trace: {
      id: traceId,
      attemptNumber: traceAttemptNumber,
      outputHash: traceOutputHash,
    },
    attestation: {
      provider,
      model,
      route,
      workflowVersion,
      providerTraceId,
      fallbackApplied: false,
    },
    candidates,
    selectedCandidateId: selectedCandidateId as string | null,
    selectedContentId: selectedContentId as string | null,
  };
}

function apiError(response: Response, payload: unknown) {
  const errorFields = new Set(["code", "recovery"]);
  if (!hasExactFields(payload, errorFields)) {
    return new RoomWriteOpeningVariantsApiError(
      "invalid_runtime_output",
      "return_later",
      response.status,
    );
  }
  const code = field(payload, "code");
  const recovery = field(payload, "recovery");
  if (!boundedText(code, 200) || !boundedText(recovery, 200)) {
    return new RoomWriteOpeningVariantsApiError(
      "invalid_runtime_output",
      "return_later",
      response.status,
    );
  }
  return new RoomWriteOpeningVariantsApiError(code, recovery, response.status);
}

async function responsePayload(response: Response) {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new RoomWriteOpeningVariantsApiError(
      "invalid_runtime_output",
      "return_later",
      response.status,
    );
  }
  if (!response.ok) throw apiError(response, payload);
  if (
    response.status !== 200
    || !response.headers.get("content-type")?.toLowerCase().startsWith("application/json")
  ) {
    throw new RoomWriteOpeningVariantsApiError(
      "invalid_runtime_output",
      "return_later",
      response.status,
    );
  }
  const parsed = await parseWriteOpeningCandidateSet(payload);
  if (parsed === null) {
    throw new RoomWriteOpeningVariantsApiError(
      "invalid_runtime_output",
      "refresh_candidate_set",
      502,
    );
  }
  return parsed;
}

function endpoint(candidateSetId: string, suffix = "") {
  if (!UUID_V4_PATTERN.test(candidateSetId)) {
    throw new RoomWriteOpeningVariantsApiError("invalid_request", "refresh_projection", 400);
  }
  return `${resolveH5ApiBaseUrl()}/vnext/experience/write-opening-variants/${candidateSetId}${suffix}`;
}

function requestFailure(signal: AbortSignal | undefined) {
  return signal?.aborted
    ? new RoomWriteOpeningVariantsApiError("request_aborted", "return_later", 0)
    : new RoomWriteOpeningVariantsApiError("temporarily_unavailable", "return_later", 0);
}

export async function readWriteOpeningVariantSet(
  candidateSetId: string,
  signal?: AbortSignal,
): Promise<VnextWriteOpeningCandidateSetResponse> {
  let response: Response;
  try {
    response = await fetch(endpoint(candidateSetId), {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      headers: { accept: "application/json" },
      ...(signal === undefined ? {} : { signal }),
    });
  } catch {
    throw requestFailure(signal);
  }
  const parsed = await responsePayload(response);
  if (parsed.candidateSetId !== candidateSetId) {
    throw new RoomWriteOpeningVariantsApiError(
      "invalid_runtime_output",
      "refresh_candidate_set",
      502,
    );
  }
  return parsed;
}

function sameSelectionBasis(
  current: VnextWriteOpeningCandidateSetResponse,
  selected: VnextWriteOpeningCandidateSetResponse,
) {
  return selected.candidateSetId === current.candidateSetId
    && selected.candidateSetVersion === current.candidateSetVersion
    && selected.workspace.id === current.workspace.id
    && selected.workspace.aggregateVersion === current.workspace.aggregateVersion
    && selected.understanding.id === current.understanding.id
    && selected.understanding.version === current.understanding.version
    && selected.commission.id === current.commission.id
    && selected.commission.version === current.commission.version
    && selected.task.id === current.task.id
    && selected.task.stateVersion === current.task.stateVersion
    && selected.trace.id === current.trace.id
    && selected.trace.attemptNumber === current.trace.attemptNumber
    && selected.trace.outputHash === current.trace.outputHash
    && JSON.stringify(selected.attestation) === JSON.stringify(current.attestation);
}

export async function selectWriteOpeningVariant(
  current: VnextWriteOpeningCandidateSetResponse,
  candidateId: string,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<VnextWriteOpeningCandidateSetResponse> {
  if (
    current.status !== "pending"
    || !UUID_V4_PATTERN.test(candidateId)
    || current.candidates.find((candidate) => candidate.candidateId === candidateId)?.status !== "pending"
    || !boundedText(idempotencyKey, 200)
  ) {
    throw new RoomWriteOpeningVariantsApiError("invalid_request", "refresh_candidate_set", 400);
  }
  const request: VnextSelectWriteOpeningCandidateRequest = {
    candidateId,
    candidateSetVersion: current.candidateSetVersion,
    workspaceAggregateVersion: current.workspace.aggregateVersion,
    understandingVersion: current.understanding.version,
    commissionVersion: current.commission.version,
    taskStateVersion: current.task.stateVersion,
    traceAttemptNumber: current.trace.attemptNumber,
    traceOutputHash: current.trace.outputHash,
    idempotencyKey,
  };
  let response: Response;
  try {
    response = await fetch(endpoint(current.candidateSetId, "/select"), {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
      ...(signal === undefined ? {} : { signal }),
    });
  } catch {
    throw requestFailure(signal);
  }
  const selected = await responsePayload(response);
  if (
    !sameSelectionBasis(current, selected)
    || selected.status !== "selected"
    || selected.selectedCandidateId !== candidateId
    || selected.selectedContentId === null
  ) {
    throw new RoomWriteOpeningVariantsApiError(
      "invalid_runtime_output",
      "refresh_candidate_set",
      502,
    );
  }
  return selected;
}
