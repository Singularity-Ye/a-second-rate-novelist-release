import { createHash } from "node:crypto";
import { createActiveHardBoundarySnapshot } from "../domain/creative-runtime.port.js";
import {
  type CreativeTaskQueueRepository,
  type CreativeTaskProcessingAuthority,
  type HardBoundaryArtifactSnapshot,
  type QueueableCreativeTaskArtifacts,
  type QueuedCreativeTask,
} from "../domain/creative-task.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const SYNTHETIC_FIXTURE_EVIDENCE_PATTERN =
  /^fixture:[A-Za-z0-9][A-Za-z0-9._-]{0,63}:sha256:[0-9a-f]{64}$/;
const PROCESSING_COVERAGE_KEY_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/;

export interface QueueCreativeTaskInput {
  readonly ownerPrincipalId: string;
  readonly requestId: string;
  readonly idempotencyKey: string;
  readonly processingAuthority: CreativeTaskProcessingAuthority;
  readonly artifacts: QueueableCreativeTaskArtifacts;
  readonly availableAt: Date;
  readonly deadlineAt: Date;
  readonly maxAttempts?: number;
}

function requireUuid(value: string, field: string) {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`${field} must be a UUID`);
  }
  return value;
}

function requireDigest(value: string, field: string) {
  if (!DIGEST_PATTERN.test(value)) {
    throw new Error(`${field} must be a SHA-256 hex digest`);
  }
  return value;
}

function requirePositiveInteger(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function requireKey(value: string, field: string) {
  if (value.trim().length === 0 || value.length > 200) {
    throw new Error(`${field} must be non-empty and at most 200 characters`);
  }
  return value;
}

function normalizedProcessingAuthority(
  authority: CreativeTaskProcessingAuthority,
): CreativeTaskProcessingAuthority {
  if (authority.purpose === "synthetic_creative") {
    if (
      authority.processingBasisRecordId !== null ||
      authority.consentRecordId !== null ||
      authority.processingCoverageKey !== null ||
      !SYNTHETIC_FIXTURE_EVIDENCE_PATTERN.test(
        authority.processingEvidenceRef,
      )
    ) {
      throw new Error("synthetic creative tasks cannot claim consent or a basis");
    }
    return authority;
  }
  if (
    authority.processingEvidenceRef !== null ||
    !PROCESSING_COVERAGE_KEY_PATTERN.test(authority.processingCoverageKey) ||
    Number(authority.processingBasisRecordId !== null) +
      Number(authority.consentRecordId !== null) !==
    1
  ) {
    throw new Error("non-synthetic tasks require exactly one authority record");
  }
  if (authority.processingBasisRecordId !== null) {
    requireUuid(authority.processingBasisRecordId, "processingBasisRecordId");
  } else if (authority.consentRecordId !== null) {
    requireUuid(authority.consentRecordId, "consentRecordId");
  }
  return authority;
}

function normalizedBoundaries(
  input: HardBoundaryArtifactSnapshot,
  ownerPrincipalId: string,
): HardBoundaryArtifactSnapshot {
  const snapshot = createActiveHardBoundarySnapshot(input);
  if (snapshot.ownerPrincipalId !== ownerPrincipalId) {
    throw new Error("hard-boundary snapshot owner mismatch");
  }
  return {
    snapshotId: snapshot.snapshotId,
    ownerPrincipalId: snapshot.ownerPrincipalId,
    version: snapshot.version,
    capturedAt: snapshot.capturedAt,
    items: [...snapshot.items]
      .sort((left, right) =>
        `${left.boundaryId}:${left.version}`.localeCompare(
          `${right.boundaryId}:${right.version}`,
        ),
      )
      .map((item) => ({
        boundaryId: item.boundaryId,
        value: item.value,
        sourceRef: item.sourceRef,
        status: "active" as const,
        version: item.version,
      })),
  };
}

export function normalizeCreativeTaskArtifacts(
  artifacts: QueueableCreativeTaskArtifacts,
  ownerPrincipalId: string,
): QueueableCreativeTaskArtifacts {
  const hardBoundaries = normalizedBoundaries(
    artifacts.hardBoundaries,
    ownerPrincipalId,
  );
  if (artifacts.kind === "understand") {
    if (artifacts.schemaVersion !== 1) {
      throw new Error("correction understanding tasks require correction admission");
    }
    return {
      schemaVersion: 1,
      kind: "understand",
      sourceMessage: {
        id: requireUuid(artifacts.sourceMessage.id, "sourceMessage.id"),
        requestDigest: requireDigest(
          artifacts.sourceMessage.requestDigest,
          "sourceMessage.requestDigest",
        ),
      },
      hardBoundaries,
    };
  }
  return {
    schemaVersion: 1,
    kind: "write_opening",
    workspace: {
      id: requireUuid(artifacts.workspace.id, "workspace.id"),
      aggregateVersion: requirePositiveInteger(
        artifacts.workspace.aggregateVersion,
        "workspace.aggregateVersion",
      ),
      publicationDigest: requireDigest(
        artifacts.workspace.publicationDigest,
        "workspace.publicationDigest",
      ),
    },
    understanding: {
      id: requireUuid(artifacts.understanding.id, "understanding.id"),
      version: requirePositiveInteger(
        artifacts.understanding.version,
        "understanding.version",
      ),
      payloadDigest: requireDigest(
        artifacts.understanding.payloadDigest,
        "understanding.payloadDigest",
      ),
    },
    commission: {
      id: requireUuid(artifacts.commission.id, "commission.id"),
      version: requirePositiveInteger(
        artifacts.commission.version,
        "commission.version",
      ),
      payloadDigest: requireDigest(
        artifacts.commission.payloadDigest,
        "commission.payloadDigest",
      ),
    },
    hardBoundaries,
  };
}

export function creativeTaskInputDigest(
  artifacts: QueueableCreativeTaskArtifacts,
) {
  return createHash("sha256").update(JSON.stringify(artifacts)).digest("hex");
}

export class QueueCreativeTask {
  constructor(private readonly repository: CreativeTaskQueueRepository) {}

  async execute(input: QueueCreativeTaskInput): Promise<QueuedCreativeTask> {
    requireUuid(input.ownerPrincipalId, "ownerPrincipalId");
    requireKey(input.requestId, "requestId");
    requireKey(input.idempotencyKey, "idempotencyKey");
    if (
      !(input.availableAt instanceof Date) ||
      !Number.isFinite(input.availableAt.getTime()) ||
      !(input.deadlineAt instanceof Date) ||
      !Number.isFinite(input.deadlineAt.getTime()) ||
      input.availableAt.getTime() >= input.deadlineAt.getTime()
    ) {
      throw new Error("creative task deadline must be after availableAt");
    }
    const maxAttempts = input.maxAttempts ?? 3;
    if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
      throw new Error("maxAttempts must be an integer from 1 to 10");
    }
    const artifacts = normalizeCreativeTaskArtifacts(
      input.artifacts,
      input.ownerPrincipalId,
    );
    return this.repository.queue({
      ownerPrincipalId: input.ownerPrincipalId,
      requestId: input.requestId,
      idempotencyKey: input.idempotencyKey,
      processingAuthority: normalizedProcessingAuthority(
        input.processingAuthority,
      ),
      artifacts,
      inputDigest: creativeTaskInputDigest(artifacts),
      availableAt: input.availableAt,
      deadlineAt: input.deadlineAt,
      maxAttempts,
    });
  }
}
