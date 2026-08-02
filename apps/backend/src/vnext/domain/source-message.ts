import { createHash } from "node:crypto";

export type VnextSourceMessageAction =
  | "commission"
  | "correction"
  | "boundary_update";

export interface CreateVnextSourceMessageInput {
  readonly action: VnextSourceMessageAction;
  readonly basedOnUnderstandingId: string | null;
  readonly basedOnVersion: number | null;
  readonly body: string;
  readonly clientRequestId: string;
  readonly experienceSessionId: string;
  readonly ownerPrincipalId: string;
}

export interface VnextSourceMessageRecord extends CreateVnextSourceMessageInput {
  readonly id: string;
  readonly requestDigest: string;
  readonly createdAt: Date;
}

export type VnextSourceMessageCreation = VnextSourceMessageRecord & {
  readonly creationDisposition: "created" | "replayed";
};

export interface ExplicitBoundaryEvidence {
  readonly evidenceEnd: number;
  readonly evidenceStart: number;
  readonly value: string;
}

export interface VnextSourceMessageRepository {
  createOrReplay(input: CreateVnextSourceMessageInput): Promise<VnextSourceMessageCreation>;
  findOwned(
    ownerPrincipalId: string,
    sourceMessageId: string,
  ): Promise<VnextSourceMessageRecord | null>;
}

export type VnextStoryTruthAuditEvent = {
  readonly event: "story_truth";
  readonly operation: "source_create" | "publish" | "correct" | "owned_read";
  readonly outcome:
    | "created"
    | "replayed"
    | "published"
    | "corrected"
    | "not_found"
    | "conflict"
    | "stale"
    | "failed";
  readonly resourceKind:
    | "source_message"
    | "understanding"
    | "workspace"
    | "commission"
    | "reader_memory";
};

export interface VnextStoryTruthAuditPort {
  record(event: VnextStoryTruthAuditEvent): void;
}

export const NOOP_VNEXT_STORY_TRUTH_AUDIT: VnextStoryTruthAuditPort = {
  record() {},
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SOURCE_MESSAGE_CODE_POINTS = 50_000;
const MAX_BOUNDARY_CODE_POINTS = 1_000;
const MAX_CLIENT_REQUEST_CODE_POINTS = 200;

export function assertVnextUuid(value: string, field: string) {
  if (!isVnextUuid(value)) {
    throw new Error(`${field} must be a UUID`);
  }
}

export function isVnextUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function createSourceMessageRequestDigest(
  input: CreateVnextSourceMessageInput,
) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        input.ownerPrincipalId,
        input.experienceSessionId,
        input.clientRequestId,
        input.action,
        input.basedOnUnderstandingId,
        input.basedOnVersion,
        input.body,
      ]),
    )
    .digest("hex");
}

export function validateSourceMessageInput(input: CreateVnextSourceMessageInput) {
  assertVnextUuid(input.ownerPrincipalId, "ownerPrincipalId");
  assertVnextUuid(input.experienceSessionId, "experienceSessionId");
  if (
    typeof input.clientRequestId !== "string" ||
    input.clientRequestId.trim().length === 0 ||
    [...input.clientRequestId].length > MAX_CLIENT_REQUEST_CODE_POINTS
  ) {
    throw new Error("clientRequestId must be non-empty and within the accepted limit");
  }
  if (
    typeof input.body !== "string" ||
    input.body.trim().length === 0 ||
    [...input.body].length > MAX_SOURCE_MESSAGE_CODE_POINTS
  ) {
    throw new Error("source message body must be non-empty and within the accepted limit");
  }
  if (
    input.action !== "commission" &&
    input.action !== "correction" &&
    input.action !== "boundary_update"
  ) {
    throw new Error("source message action is unsupported");
  }
  if ((input.basedOnUnderstandingId === null) !== (input.basedOnVersion === null)) {
    throw new Error("basedOnUnderstandingId and basedOnVersion must be provided together");
  }
  if (input.basedOnUnderstandingId !== null) {
    assertVnextUuid(input.basedOnUnderstandingId, "basedOnUnderstandingId");
  }
  if (
    input.basedOnVersion !== null &&
    (!Number.isInteger(input.basedOnVersion) || input.basedOnVersion < 1)
  ) {
    throw new Error("basedOnVersion must be a positive integer");
  }
  if (input.action === "commission" && input.basedOnVersion !== null) {
    throw new Error("commission source messages cannot claim a prior understanding");
  }
  if (input.action !== "commission" && input.basedOnVersion === null) {
    throw new Error("correction source messages require a prior understanding version");
  }
  return input;
}

export function validateExplicitBoundaryEvidence(
  sourceBody: string,
  evidence: ExplicitBoundaryEvidence,
): ExplicitBoundaryEvidence {
  const valueCodePoints = [...evidence.value];
  if (
    valueCodePoints.length === 0 ||
    valueCodePoints.length > MAX_BOUNDARY_CODE_POINTS ||
    evidence.value.trim().length === 0 ||
    !Number.isInteger(evidence.evidenceStart) ||
    !Number.isInteger(evidence.evidenceEnd) ||
    evidence.evidenceStart < 0 ||
    evidence.evidenceEnd <= evidence.evidenceStart ||
    evidence.evidenceEnd > sourceBody.length ||
    sourceBody.slice(evidence.evidenceStart, evidence.evidenceEnd) !== evidence.value
  ) {
    throw new Error(
      "hard boundary must exactly match its owned SourceMessage evidence",
    );
  }
  return {
    evidenceEnd: evidence.evidenceEnd,
    evidenceStart: evidence.evidenceStart,
    value: evidence.value,
  };
}

export function normalizedBoundaryValue(value: string) {
  return value.trim().replace(/\s+/g, " ").normalize("NFKC").toLocaleLowerCase("zh-CN");
}

export function boundaryValueDigest(value: string) {
  return createHash("sha256").update(normalizedBoundaryValue(value)).digest("hex");
}

export const VNEXT_SOURCE_MESSAGE_REPOSITORY = Symbol(
  "VNEXT_SOURCE_MESSAGE_REPOSITORY",
);
export const VNEXT_STORY_TRUTH_AUDIT = Symbol("VNEXT_STORY_TRUTH_AUDIT");
