import { createHash } from "node:crypto";
import type { ActiveHardBoundarySnapshot } from "./creative-runtime.port.js";
import type { ExplicitBoundaryEvidence } from "./source-message.js";

export type VnextUnderstandingStatus =
  | "proposed"
  | "corrected"
  | "confirmed"
  | "expired";
export type VnextCommissionStatus = "draft" | "active" | "superseded";
export type VnextStoryWorkspaceStatus = "forming" | "active" | "paused" | "archived";

export interface VnextUnderstandingFields {
  readonly clarificationQuestions: readonly string[];
  readonly confidence: number;
  readonly emotionalTarget: string;
  readonly relationshipTension: string;
  readonly storyDesire: string;
  readonly userCorrection: string | null;
}

export interface VnextCommissionFields {
  readonly continuationIntent: string;
  readonly emotionalPromise: string;
  readonly premise: string;
  readonly relationshipCore: string;
  readonly styleConstraints: readonly string[];
}

export interface PublishVnextStoryTruthInput {
  readonly commission: VnextCommissionFields;
  readonly explicitHardBoundaries: readonly ExplicitBoundaryEvidence[];
  readonly ownerPrincipalId: string;
  readonly sourceMessageId: string;
  readonly understanding: VnextUnderstandingFields;
}

interface BoundaryTarget {
  readonly expectedItemVersion: number;
  readonly targetItemId: string;
}

export type VnextHardBoundaryCorrectionAction =
  | ({ readonly operation: "add" } & ExplicitBoundaryEvidence)
  | ({ readonly operation: "replace" } & BoundaryTarget & ExplicitBoundaryEvidence)
  | ({
      readonly operation: "revoke";
      readonly evidence: ExplicitBoundaryEvidence;
    } & BoundaryTarget);

export interface CorrectVnextStoryTruthInput {
  readonly boundaryActions: readonly VnextHardBoundaryCorrectionAction[];
  readonly commission: VnextCommissionFields;
  readonly correctionSourceMessageId: string;
  readonly expectedAggregateVersion: number;
  readonly ownerPrincipalId: string;
  readonly understanding: VnextUnderstandingFields;
  readonly workspaceId: string;
}

export interface VnextStoryTruthPublication {
  readonly activeHardBoundaries: readonly {
    readonly id: string;
    readonly sourceMessageId: string;
    readonly status: "active";
    readonly value: string;
    readonly version: number;
  }[];
  readonly commission: {
    readonly id: string;
    readonly status: VnextCommissionStatus;
    readonly version: number;
  };
  readonly understanding: {
    readonly id: string;
    readonly status: VnextUnderstandingStatus;
    readonly version: number;
  };
  readonly workspace: {
    readonly aggregateVersion: number;
    readonly id: string;
    readonly status: VnextStoryWorkspaceStatus;
  };
}

export class VnextStoryTruthIdempotencyConflictError extends Error {
  override readonly name = "VnextStoryTruthIdempotencyConflictError";
  constructor() {
    super("story-truth idempotency key is already bound to different input");
  }
}

export class VnextStoryTruthStaleVersionError extends Error {
  override readonly name = "VnextStoryTruthStaleVersionError";
  constructor() {
    super("story-truth version is stale");
  }
}

export class VnextStoryTruthNotFoundError extends Error {
  override readonly name = "VnextStoryTruthNotFoundError";
  constructor() {
    super("story truth was not found");
  }
}

export type VnextStoryTruthWritePoint =
  | "after_workspace"
  | "after_understanding"
  | "after_commission"
  | "after_reader_memory"
  | "after_workspace_cas"
  | "after_boundary_revoke"
  | "after_boundary_add"
  | "before_commit";

export interface VnextStoryTruthTransactionProbe {
  afterWrite(point: VnextStoryTruthWritePoint): void | Promise<void>;
}

export interface VnextUnderstandingRepository {
  publish(input: PublishVnextStoryTruthInput): Promise<VnextStoryTruthPublication>;
  correct(input: CorrectVnextStoryTruthInput): Promise<VnextStoryTruthPublication>;
  findOwned(
    ownerPrincipalId: string,
    understandingId: string,
  ): Promise<VnextStoryTruthPublication["understanding"] | null>;
}

export interface VnextStoryWorkspaceRepository {
  findOwned(
    ownerPrincipalId: string,
    workspaceId: string,
  ): Promise<VnextStoryTruthPublication["workspace"] | null>;
}

export interface VnextCommissionBriefRepository {
  findOwned(
    ownerPrincipalId: string,
    commissionId: string,
  ): Promise<VnextStoryTruthPublication["commission"] | null>;
}

export interface VnextReaderMemoryRecord {
  readonly activeHardBoundaries: VnextStoryTruthPublication["activeHardBoundaries"];
  readonly id: string;
  readonly ownerPrincipalId: string;
  readonly participationStyle: string | null;
  readonly version: number;
}

export interface VnextReaderMemoryRepository {
  findOwned(ownerPrincipalId: string): Promise<VnextReaderMemoryRecord | null>;
  activeHardBoundarySnapshot(
    ownerPrincipalId: string,
  ): Promise<ActiveHardBoundarySnapshot | null>;
}

function requireNonEmptyText(value: string, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be non-empty`);
  }
  return value;
}

function requireTextList(
  value: readonly string[],
  field: string,
  maximum: number,
) {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new Error(`${field} exceeds its accepted item limit`);
  }
  for (const item of value) {
    requireNonEmptyText(item, field);
  }
  return [...value];
}

export function validateUnderstandingFields(
  fields: VnextUnderstandingFields,
): VnextUnderstandingFields {
  if (
    typeof fields.confidence !== "number" ||
    !Number.isFinite(fields.confidence) ||
    fields.confidence < 0 ||
    fields.confidence > 1
  ) {
    throw new Error("understanding confidence must be between zero and one");
  }
  if (fields.userCorrection !== null) {
    requireNonEmptyText(fields.userCorrection, "understanding.userCorrection");
  }
  return {
    clarificationQuestions: requireTextList(
      fields.clarificationQuestions,
      "understanding.clarificationQuestions",
      1,
    ),
    confidence: fields.confidence,
    emotionalTarget: requireNonEmptyText(
      fields.emotionalTarget,
      "understanding.emotionalTarget",
    ),
    relationshipTension: requireNonEmptyText(
      fields.relationshipTension,
      "understanding.relationshipTension",
    ),
    storyDesire: requireNonEmptyText(
      fields.storyDesire,
      "understanding.storyDesire",
    ),
    userCorrection: fields.userCorrection,
  };
}

export function validateCommissionFields(
  fields: VnextCommissionFields,
): VnextCommissionFields {
  return {
    continuationIntent: requireNonEmptyText(
      fields.continuationIntent,
      "commission.continuationIntent",
    ),
    emotionalPromise: requireNonEmptyText(
      fields.emotionalPromise,
      "commission.emotionalPromise",
    ),
    premise: requireNonEmptyText(fields.premise, "commission.premise"),
    relationshipCore: requireNonEmptyText(
      fields.relationshipCore,
      "commission.relationshipCore",
    ),
    styleConstraints: requireTextList(
      fields.styleConstraints,
      "commission.styleConstraints",
      20,
    ),
  };
}

function digest(payload: unknown) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function understandingTuple(fields: VnextUnderstandingFields) {
  return [
    fields.storyDesire,
    fields.emotionalTarget,
    fields.relationshipTension,
    [...fields.clarificationQuestions],
    fields.confidence,
    fields.userCorrection,
  ];
}

function commissionTuple(fields: VnextCommissionFields) {
  return [
    fields.premise,
    fields.emotionalPromise,
    fields.relationshipCore,
    [...fields.styleConstraints],
    fields.continuationIntent,
  ];
}

function boundaryEvidenceTuple(evidence: ExplicitBoundaryEvidence) {
  return [evidence.value, evidence.evidenceStart, evidence.evidenceEnd];
}

function boundaryActionTuple(action: VnextHardBoundaryCorrectionAction) {
  if (action.operation === "revoke") {
    return [
      action.operation,
      action.targetItemId,
      action.expectedItemVersion,
      boundaryEvidenceTuple(action.evidence),
    ];
  }
  return [
    action.operation,
    "targetItemId" in action ? action.targetItemId : null,
    "expectedItemVersion" in action ? action.expectedItemVersion : null,
    boundaryEvidenceTuple(action),
  ];
}

export function createUnderstandingPayloadDigest(
  fields: VnextUnderstandingFields,
  hardBoundaries: readonly { readonly id: string; readonly version: number }[],
) {
  return digest([understandingTuple(fields), hardBoundaries]);
}

export function createCommissionPayloadDigest(
  fields: VnextCommissionFields,
  hardBoundaries: readonly { readonly id: string; readonly version: number }[],
) {
  return digest([commissionTuple(fields), hardBoundaries]);
}

export function createStoryTruthPublicationDigest(
  input: PublishVnextStoryTruthInput,
) {
  return digest([
    input.ownerPrincipalId,
    input.sourceMessageId,
    understandingTuple(input.understanding),
    commissionTuple(input.commission),
    input.explicitHardBoundaries.map(boundaryEvidenceTuple),
  ]);
}

export function createStoryTruthCorrectionDigest(
  input: CorrectVnextStoryTruthInput,
) {
  return digest([
    input.ownerPrincipalId,
    input.workspaceId,
    input.correctionSourceMessageId,
    input.expectedAggregateVersion,
    understandingTuple(input.understanding),
    commissionTuple(input.commission),
    input.boundaryActions.map(boundaryActionTuple),
  ]);
}

export const VNEXT_UNDERSTANDING_REPOSITORY = Symbol(
  "VNEXT_UNDERSTANDING_REPOSITORY",
);
export const VNEXT_STORY_WORKSPACE_REPOSITORY = Symbol(
  "VNEXT_STORY_WORKSPACE_REPOSITORY",
);
export const VNEXT_COMMISSION_BRIEF_REPOSITORY = Symbol(
  "VNEXT_COMMISSION_BRIEF_REPOSITORY",
);
export const VNEXT_READER_MEMORY_REPOSITORY = Symbol(
  "VNEXT_READER_MEMORY_REPOSITORY",
);
