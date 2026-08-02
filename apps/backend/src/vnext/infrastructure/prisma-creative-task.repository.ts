import { createHash, randomUUID } from "node:crypto";
import {
  Prisma,
  PrismaClient,
  VnextCommissionStatus,
  VnextCreativeRunStatus,
  VnextCreativeRuntimeMode,
  VnextCreativeTaskKind,
  VnextCreativeTaskStatus,
  VnextOutboxEventStatus,
  VnextProcessingPurpose,
  VnextReaderMemoryItemKind,
  VnextReaderMemoryItemStatus,
  VnextSourceMessageAction,
  VnextStoryContentKind,
  VnextStoryContentStatus,
  VnextStoryWorkspaceStatus,
  VnextUnderstandingStatus,
  VnextWorkerKind,
  VnextWorkerStatus,
  type VnextCreativeTask,
} from "@prisma/client";
import { rehydrateActiveHardBoundarySnapshot } from "../domain/creative-runtime.port.js";
import {
  CreativeRuntimeExecutionError,
  CreativeTaskCompletionNotConfiguredError,
  CreativeTaskIdempotencyConflictError,
  CreativeTaskInputStaleError,
  type ClaimCreativeTaskInput,
  type CreativeTaskCompletionDisposition,
  type CreativeTaskCompletionPort,
  type CreativeTaskExecutionSuccess,
  type CreativeTaskFailureDisposition,
  type CreativeTaskInputLoader,
  type CreativeTaskLease,
  type CreativeTaskLeasePort,
  type CreativeTaskQueueRepository,
  type CreativeTaskRuntimeInput,
  type CreativeWorkerHeartbeatInput,
  type CreativeWorkerHeartbeatPort,
  type CreativeWorkerReadiness,
  type CreativeWorkerReadinessPort,
  type FailCreativeTaskLeaseInput,
  type NonEmptyCreativeTaskKindList,
  type QueueCreativeTaskRecord,
  type QueueableCreativeTaskArtifacts,
  type PersistedCreativeTaskArtifacts,
  type QueuedCreativeTask,
  type WriteOpeningTaskArtifacts,
} from "../domain/creative-task.js";
import {
  boundaryValueDigest,
  createSourceMessageRequestDigest,
  validateExplicitBoundaryEvidence,
  type VnextSourceMessageAction as DomainSourceMessageAction,
} from "../domain/source-message.js";
import {
  createCommissionPayloadDigest,
  createStoryTruthCorrectionDigest,
  createStoryTruthPublicationDigest,
  validateCommissionFields,
  validateUnderstandingFields,
  type VnextCommissionFields,
  type VnextUnderstandingFields,
} from "../domain/understanding-draft.js";
import type { VnextCurrentSessionAdmission } from "../domain/vnext-session.repository.js";
import {
  CompletionSessionFenceLostError,
  currentActiveGuestSessionWhere,
  rotateCurrentSessionProjection,
} from "./prisma-completion-session-fence.js";
import { isTaskProcessingAuthorityCurrent } from "./prisma-processing-authority.js";

const TRANSACTION_ATTEMPTS = 3;
const CLAIM_CANDIDATE_LIMIT = 16;
const REAP_CANDIDATE_LIMIT = 64;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const MAXIMUM_PROVIDER_TRACE_ID_LENGTH = 200;
const MAXIMUM_PROVIDER_LENGTH = 100;
const MAXIMUM_TRACE_TEXT_LENGTH = 200;

export type CreativeTaskCompletionWritePoint =
  | "after_task_fence"
  | "after_trace"
  | "after_story_content"
  | "after_success_outbox"
  | "before_commit";

export interface CreativeTaskCompletionProbe {
  afterWrite(point: CreativeTaskCompletionWritePoint): void | Promise<void>;
}

export interface PrismaCreativeTaskRepositoryOptions {
  readonly afterWrite?: CreativeTaskCompletionProbe["afterWrite"];
  readonly clock?: () => Date;
  readonly admissionPolicy?: VnextCurrentSessionAdmission;
}

type CreativeTaskClient = Pick<
  Prisma.TransactionClient,
  | "vnextCommissionBrief"
  | "vnextCreativeRunTrace"
  | "vnextCreativeTask"
  | "vnextExperienceSession"
  | "vnextOutboxEvent"
  | "vnextReaderMemory"
  | "vnextReaderMemoryItem"
  | "vnextSourceMessage"
  | "vnextStoryContent"
  | "vnextStoryWorkspace"
  | "vnextUnderstandingDraft"
  | "vnextWorkerHeartbeat"
>;

function runtimeModeEnum(mode: ClaimCreativeTaskInput["runtimeMode"]) {
  return mode === "runtime_worker_synthetic"
    ? VnextCreativeRuntimeMode.SYNTHETIC
    : VnextCreativeRuntimeMode.CONFIGURED;
}

function runtimeModeValue(mode: VnextCreativeRuntimeMode) {
  return mode === VnextCreativeRuntimeMode.SYNTHETIC
    ? ("runtime_worker_synthetic" as const)
    : ("runtime_worker_configured" as const);
}

function taskKindEnum(kind: QueueableCreativeTaskArtifacts["kind"]) {
  return kind === "understand"
    ? VnextCreativeTaskKind.UNDERSTAND
    : VnextCreativeTaskKind.WRITE_OPENING;
}

function taskKindValue(kind: VnextCreativeTaskKind) {
  switch (kind) {
    case VnextCreativeTaskKind.UNDERSTAND:
      return "understand" as const;
    case VnextCreativeTaskKind.WRITE_OPENING:
      return "write_opening" as const;
    case VnextCreativeTaskKind.REVISE:
      return "revise" as const;
    default:
      return "continue_story" as const;
  }
}

function taskStatusValue(status: VnextCreativeTaskStatus) {
  return status.toLowerCase() as QueuedCreativeTask["status"];
}

function requiredRecord(value: unknown, field: string) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CreativeTaskInputStaleError(`${field}_invalid`);
  }
  return value as Record<string, unknown>;
}

function exactDataRecord(value: unknown, fields: readonly string[]) {
  try {
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null)
    ) {
      return false;
    }
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== fields.length ||
      keys.some((key) => typeof key !== "string" || !fields.includes(key))
    ) {
      return false;
    }
    return keys.every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor !== undefined && "value" in descriptor;
    });
  } catch {
    return false;
  }
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new CreativeTaskInputStaleError(`${field}_invalid`);
  }
  return value;
}

function requiredStringList(value: unknown, field: string) {
  if (
    !Array.isArray(value) ||
    value.length > 20 ||
    value.some((item) => typeof item !== "string" || item.trim().length === 0)
  ) {
    throw new CreativeTaskInputStaleError(`${field}_invalid`);
  }
  return value.map((item) => item as string);
}

function requiredInteger(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new CreativeTaskInputStaleError(`${field}_invalid`);
  }
  return value;
}

function requiredDigest(value: unknown, field: string) {
  const digest = requiredString(value, field);
  if (!HASH_PATTERN.test(digest)) {
    throw new CreativeTaskInputStaleError(`${field}_invalid`);
  }
  return digest;
}

function jsonInput(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function artifactDigest(value: PersistedCreativeTaskArtifacts) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function validateExactHardBoundaryArtifact(value: unknown) {
  const record = requiredRecord(value, "hard_boundary_snapshot");
  if (
    !exactDataRecord(record, [
      "snapshotId",
      "ownerPrincipalId",
      "version",
      "capturedAt",
      "items",
    ]) ||
    !Array.isArray(record.items)
  ) {
    throw new CreativeTaskInputStaleError("hard_boundary_snapshot_invalid");
  }
  for (const item of record.items) {
    if (
      !exactDataRecord(item, [
        "boundaryId",
        "value",
        "sourceRef",
        "status",
        "version",
      ])
    ) {
      throw new CreativeTaskInputStaleError("hard_boundary_snapshot_invalid");
    }
  }
}

function sanitizedTraceArtifacts(
  value: unknown,
  ownerPrincipalId: string,
): Prisma.InputJsonValue {
  const artifacts = parseArtifacts(value, ownerPrincipalId);
  const hardBoundaries = {
    snapshotId: artifacts.hardBoundaries.snapshotId,
    version: artifacts.hardBoundaries.version,
    capturedAt: artifacts.hardBoundaries.capturedAt,
    items: artifacts.hardBoundaries.items.map((item) => ({
      boundaryId: item.boundaryId,
      sourceRef: item.sourceRef,
      version: item.version,
      valueDigest: boundaryValueDigest(item.value),
    })),
  };
  if (artifacts.kind === "understand") {
    return jsonInput(
      artifacts.schemaVersion === 1
        ? {
            schemaVersion: 1,
            kind: artifacts.kind,
            sourceMessage: artifacts.sourceMessage,
            hardBoundaries,
          }
        : {
            schemaVersion: 2,
            kind: artifacts.kind,
            sourceMessage: artifacts.sourceMessage,
            workspace: artifacts.workspace,
            understanding: artifacts.understanding,
            commission: artifacts.commission,
            hardBoundaries,
          },
    );
  }
  return jsonInput({
    schemaVersion: 1,
    kind: artifacts.kind,
    workspace: artifacts.workspace,
    understanding: artifacts.understanding,
    commission: artifacts.commission,
    hardBoundaries,
  });
}

function parseArtifacts(
  value: unknown,
  ownerPrincipalId: string,
): PersistedCreativeTaskArtifacts {
  const record = requiredRecord(value, "input_artifacts");
  const initialUnderstand =
    record.schemaVersion === 1 &&
    record.kind === "understand" &&
    exactDataRecord(record, [
      "schemaVersion",
      "kind",
      "sourceMessage",
      "hardBoundaries",
    ]);
  const correctionUnderstand =
    record.schemaVersion === 2 &&
    record.kind === "understand" &&
    exactDataRecord(record, [
      "schemaVersion",
      "kind",
      "sourceMessage",
      "workspace",
      "understanding",
      "commission",
      "hardBoundaries",
    ]);
  const writeOpening =
    record.schemaVersion === 1 &&
    record.kind === "write_opening" &&
    exactDataRecord(record, [
      "schemaVersion",
      "kind",
      "workspace",
      "understanding",
      "commission",
      "hardBoundaries",
    ]);
  if (
    !initialUnderstand &&
    !correctionUnderstand &&
    !writeOpening
  ) {
    throw new CreativeTaskInputStaleError("input_schema_version_unsupported");
  }
  validateExactHardBoundaryArtifact(record.hardBoundaries);
  let hardBoundaries: ReturnType<
    typeof rehydrateActiveHardBoundarySnapshot
  >;
  try {
    hardBoundaries = rehydrateActiveHardBoundarySnapshot(
      record.hardBoundaries,
    );
  } catch {
    throw new CreativeTaskInputStaleError("hard_boundary_snapshot_invalid");
  }
  if (hardBoundaries.ownerPrincipalId !== ownerPrincipalId) {
    throw new CreativeTaskInputStaleError("input_owner_mismatch");
  }
  const normalizedBoundaries = {
    snapshotId: hardBoundaries.snapshotId,
    ownerPrincipalId: hardBoundaries.ownerPrincipalId,
    version: hardBoundaries.version,
    capturedAt: hardBoundaries.capturedAt,
    items: hardBoundaries.items.map((item) => ({ ...item })),
  };
  if (initialUnderstand || correctionUnderstand) {
    const source = requiredRecord(record.sourceMessage, "source_message");
    if (!exactDataRecord(source, ["id", "requestDigest"])) {
      throw new CreativeTaskInputStaleError("source_message_artifact_invalid");
    }
    const sourceMessage = {
      id: requiredString(source.id, "source_message_id"),
      requestDigest: requiredDigest(
        source.requestDigest,
        "source_message_digest",
      ),
    };
    if (initialUnderstand) {
      return {
        schemaVersion: 1,
        kind: "understand",
        sourceMessage,
        hardBoundaries: normalizedBoundaries,
      };
    }
    const workspace = requiredRecord(record.workspace, "workspace");
    const understanding = requiredRecord(record.understanding, "understanding");
    const commission = requiredRecord(record.commission, "commission");
    if (
      !exactDataRecord(workspace, [
        "id",
        "aggregateVersion",
        "publicationDigest",
      ]) ||
      !exactDataRecord(understanding, ["id", "version", "payloadDigest"]) ||
      !exactDataRecord(commission, ["id", "version", "payloadDigest"])
    ) {
      throw new CreativeTaskInputStaleError("input_artifact_shape_invalid");
    }
    return {
      schemaVersion: 2,
      kind: "understand",
      sourceMessage,
      workspace: {
        id: requiredString(workspace.id, "workspace_id"),
        aggregateVersion: requiredInteger(
          workspace.aggregateVersion,
          "workspace_version",
        ),
        publicationDigest: requiredDigest(
          workspace.publicationDigest,
          "workspace_digest",
        ),
      },
      understanding: {
        id: requiredString(understanding.id, "understanding_id"),
        version: requiredInteger(understanding.version, "understanding_version"),
        payloadDigest: requiredDigest(
          understanding.payloadDigest,
          "understanding_digest",
        ),
      },
      commission: {
        id: requiredString(commission.id, "commission_id"),
        version: requiredInteger(commission.version, "commission_version"),
        payloadDigest: requiredDigest(
          commission.payloadDigest,
          "commission_digest",
        ),
      },
      hardBoundaries: normalizedBoundaries,
    };
  }
  if (record.kind !== "write_opening") {
    throw new CreativeTaskInputStaleError("input_kind_unsupported");
  }
  const workspace = requiredRecord(record.workspace, "workspace");
  const understanding = requiredRecord(record.understanding, "understanding");
  const commission = requiredRecord(record.commission, "commission");
  if (
    !exactDataRecord(workspace, [
      "id",
      "aggregateVersion",
      "publicationDigest",
    ]) ||
    !exactDataRecord(understanding, ["id", "version", "payloadDigest"]) ||
    !exactDataRecord(commission, ["id", "version", "payloadDigest"])
  ) {
    throw new CreativeTaskInputStaleError("input_artifact_shape_invalid");
  }
  return {
    schemaVersion: 1,
    kind: "write_opening",
    workspace: {
      id: requiredString(workspace.id, "workspace_id"),
      aggregateVersion: requiredInteger(
        workspace.aggregateVersion,
        "workspace_version",
      ),
      publicationDigest: requiredDigest(
        workspace.publicationDigest,
        "workspace_digest",
      ),
    },
    understanding: {
      id: requiredString(understanding.id, "understanding_id"),
      version: requiredInteger(understanding.version, "understanding_version"),
      payloadDigest: requiredDigest(
        understanding.payloadDigest,
        "understanding_digest",
      ),
    },
    commission: {
      id: requiredString(commission.id, "commission_id"),
      version: requiredInteger(commission.version, "commission_version"),
      payloadDigest: requiredDigest(
        commission.payloadDigest,
        "commission_digest",
      ),
    },
    hardBoundaries: normalizedBoundaries,
  };
}

function queuedProjection(
  task: VnextCreativeTask,
  creationDisposition: "created" | "replayed",
): QueuedCreativeTask {
  const kind = taskKindValue(task.kind);
  if (kind !== "understand" && kind !== "write_opening") {
    throw new Error("TC164 queue returned an unsupported task kind");
  }
  return {
    id: task.id,
    ownerPrincipalId: task.ownerPrincipalId,
    requestId: task.requestId,
    idempotencyKey: task.idempotencyKey,
    kind,
    inputDigest: task.inputDigest,
    status: taskStatusValue(task.status),
    creationDisposition,
  };
}

function replayMatches(task: VnextCreativeTask, input: QueueCreativeTaskRecord) {
  return (
    task.requestId === input.requestId &&
    task.kind === taskKindEnum(input.artifacts.kind) &&
    task.inputDigest === input.inputDigest &&
    task.maxAttempts === input.maxAttempts &&
    task.availableAt.getTime() === input.availableAt.getTime() &&
    task.deadlineAt.getTime() === input.deadlineAt.getTime() &&
    task.processingPurpose ===
      processingPurposeEnum(input.processingAuthority.purpose) &&
    task.processingBasisRecordId ===
      input.processingAuthority.processingBasisRecordId &&
    task.consentRecordId === input.processingAuthority.consentRecordId &&
    task.processingCoverageKey ===
      input.processingAuthority.processingCoverageKey &&
    task.processingEvidenceRef ===
      input.processingAuthority.processingEvidenceRef
  );
}

function processingPurposeEnum(
  purpose: QueueCreativeTaskRecord["processingAuthority"]["purpose"],
) {
  switch (purpose) {
    case "core_creative":
      return VnextProcessingPurpose.CORE_CREATIVE;
    case "external_experience":
      return VnextProcessingPurpose.EXTERNAL_EXPERIENCE;
    case "synthetic_creative":
      return VnextProcessingPurpose.SYNTHETIC_CREATIVE;
  }
}

function exactLeaseWhere(lease: CreativeTaskLease, now: Date) {
  return {
    id: lease.taskId,
    ownerPrincipalId: lease.ownerPrincipalId,
    status: VnextCreativeTaskStatus.LEASED,
    stateVersion: lease.stateVersion,
    leaseToken: lease.leaseToken,
    leaseExpiresAt: { gt: now },
    deadlineAt: { gt: now },
  } satisfies Prisma.VnextCreativeTaskWhereInput;
}

function leaseIdentityWhere(lease: CreativeTaskLease) {
  return {
    id: lease.taskId,
    ownerPrincipalId: lease.ownerPrincipalId,
    status: VnextCreativeTaskStatus.LEASED,
    stateVersion: lease.stateVersion,
    leaseToken: lease.leaseToken,
  } satisfies Prisma.VnextCreativeTaskWhereInput;
}

function openingTaskAndLeaseMatch(
  task: VnextCreativeTask,
  lease: CreativeTaskLease,
) {
  return (
    lease.kind === "write_opening" &&
    task.kind === VnextCreativeTaskKind.WRITE_OPENING &&
    task.requestId === lease.requestId &&
    task.attemptCount === lease.attemptNumber &&
    task.inputDigest === lease.inputDigest &&
    task.sourceMessageId === null &&
    task.workspaceId !== null &&
    task.understandingId !== null &&
    task.commissionId !== null
  );
}

function sourceMessageActionValue(
  action: VnextSourceMessageAction,
): DomainSourceMessageAction | null {
  switch (action) {
    case VnextSourceMessageAction.COMMISSION:
      return "commission";
    case VnextSourceMessageAction.CORRECTION:
      return "correction";
    case VnextSourceMessageAction.BOUNDARY_UPDATE:
      return "boundary_update";
    default:
      return null;
  }
}

function sourceMessageDigestMatches(source: {
  readonly action: VnextSourceMessageAction;
  readonly basedOnUnderstandingId: string | null;
  readonly basedOnVersion: number | null;
  readonly body: string;
  readonly clientRequestId: string;
  readonly experienceSessionId: string;
  readonly ownerPrincipalId: string;
  readonly requestDigest: string;
}) {
  const action = sourceMessageActionValue(source.action);
  return (
    action !== null &&
    source.requestDigest ===
      createSourceMessageRequestDigest({
        action,
        basedOnUnderstandingId: source.basedOnUnderstandingId,
        basedOnVersion: source.basedOnVersion,
        body: source.body,
        clientRequestId: source.clientRequestId,
        experienceSessionId: source.experienceSessionId,
        ownerPrincipalId: source.ownerPrincipalId,
      })
  );
}

async function rotateProjectionForTask(
  client: CreativeTaskClient,
  ownerPrincipalId: string,
  taskId: string,
) {
  const task = await client.vnextCreativeTask.findFirst({
    where: { id: taskId, ownerPrincipalId },
    select: {
      sourceMessage: { select: { experienceSessionId: true } },
      workspace: {
        select: {
          originSourceMessage: { select: { experienceSessionId: true } },
        },
      },
    },
  });
  const experienceSessionId =
    task?.sourceMessage?.experienceSessionId ??
    task?.workspace?.originSourceMessage.experienceSessionId ??
    null;
  if (experienceSessionId === null) {
    return;
  }
  await client.vnextExperienceSession.updateMany({
    where: { id: experienceSessionId, principalId: ownerPrincipalId },
    data: { projectionVersionId: randomUUID() },
  });
}

async function currentBoundarySnapshotMatches(
  client: CreativeTaskClient,
  ownerPrincipalId: string,
  artifacts: PersistedCreativeTaskArtifacts,
) {
  const expected = artifacts.hardBoundaries;
  const [memory, items] = await Promise.all([
    client.vnextReaderMemory.findUnique({
      where: { ownerPrincipalId },
      select: { id: true, version: true },
    }),
    client.vnextReaderMemoryItem.findMany({
      where: {
        ownerPrincipalId,
        itemKind: VnextReaderMemoryItemKind.HARD_BOUNDARY,
        status: VnextReaderMemoryItemStatus.ACTIVE,
        supersededAt: null,
      },
      select: {
        id: true,
        sourceMessageId: true,
        value: true,
        version: true,
      },
      orderBy: [{ id: "asc" }],
    }),
  ]);
  if (memory === null) {
    return expected.items.length === 0 && items.length === 0;
  }
  if (memory.id !== expected.snapshotId || memory.version !== expected.version) {
    return false;
  }
  const expectedItems = [...expected.items].sort((left, right) =>
    left.boundaryId.localeCompare(right.boundaryId),
  );
  if (items.length !== expectedItems.length) {
    return false;
  }
  return items.every((item, index) => {
    const expectedItem = expectedItems[index];
    return (
      expectedItem !== undefined &&
      item.id === expectedItem.boundaryId &&
      item.version === expectedItem.version &&
      item.value === expectedItem.value &&
      item.sourceMessageId === expectedItem.sourceRef
    );
  });
}

type CanonicalBoundaryProjection = {
  readonly id: string;
  readonly sourceMessageId: string;
  readonly status: "active";
  readonly value: string;
  readonly version: number;
};

type CanonicalCorrectionBoundaryAction = {
  readonly operation: "add" | "replace" | "revoke";
  readonly targetBoundaryId: string | null;
  readonly expectedTargetVersion: number | null;
  readonly evidence: {
    readonly value: string;
    readonly evidenceStart: number;
    readonly evidenceEnd: number;
  };
};

type CanonicalCorrectionProvenance = {
  readonly schemaVersion: 1;
  readonly sourceMessage: {
    readonly id: string;
    readonly requestDigest: string;
    readonly basedOnUnderstandingId: string;
  };
  readonly priorWorkspace: {
    readonly id: string;
    readonly aggregateVersion: number;
    readonly publicationDigest: string;
  };
  readonly priorUnderstanding: {
    readonly id: string;
    readonly version: number;
    readonly payloadDigest: string;
  };
  readonly priorCommission: {
    readonly id: string;
    readonly version: number;
    readonly payloadDigest: string;
  };
  readonly boundaryActions: readonly CanonicalCorrectionBoundaryAction[];
};

function requiredNonNegativeInteger(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new CreativeTaskInputStaleError(`${field}_invalid`);
  }
  return value;
}

function parseCorrectionBoundaryActions(
  value: unknown,
  field: string,
): CanonicalCorrectionBoundaryAction[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new CreativeTaskInputStaleError(`${field}_invalid`);
  }
  return value.map((entry, index) => {
    const action = requiredRecord(entry, `${field}_${index}`);
    if (
      !exactDataRecord(action, [
        "operation",
        "targetBoundaryId",
        "expectedTargetVersion",
        "evidence",
      ]) ||
      (action.operation !== "add" &&
        action.operation !== "replace" &&
        action.operation !== "revoke")
    ) {
      throw new CreativeTaskInputStaleError(`${field}_invalid`);
    }
    const evidence = requiredRecord(
      action.evidence,
      `${field}_${index}_evidence`,
    );
    if (
      !exactDataRecord(evidence, ["value", "evidenceStart", "evidenceEnd"])
    ) {
      throw new CreativeTaskInputStaleError(`${field}_invalid`);
    }
    const evidenceStart = requiredNonNegativeInteger(
      evidence.evidenceStart,
      `${field}_${index}_evidence_start`,
    );
    const evidenceEnd = requiredInteger(
      evidence.evidenceEnd,
      `${field}_${index}_evidence_end`,
    );
    if (evidenceEnd <= evidenceStart) {
      throw new CreativeTaskInputStaleError(`${field}_invalid`);
    }
    const operation = action.operation;
    if (operation === "add") {
      if (
        action.targetBoundaryId !== null ||
        action.expectedTargetVersion !== null
      ) {
        throw new CreativeTaskInputStaleError(`${field}_invalid`);
      }
      return {
        operation,
        targetBoundaryId: null,
        expectedTargetVersion: null,
        evidence: {
          value: requiredString(
            evidence.value,
            `${field}_${index}_evidence_value`,
          ),
          evidenceStart,
          evidenceEnd,
        },
      };
    }
    return {
      operation,
      targetBoundaryId: requiredString(
        action.targetBoundaryId,
        `${field}_${index}_target`,
      ),
      expectedTargetVersion: requiredInteger(
        action.expectedTargetVersion,
        `${field}_${index}_target_version`,
      ),
      evidence: {
        value: requiredString(
          evidence.value,
          `${field}_${index}_evidence_value`,
        ),
        evidenceStart,
        evidenceEnd,
      },
    };
  });
}

function parseCorrectionProvenance(
  value: unknown,
  field: string,
): CanonicalCorrectionProvenance {
  const provenance = requiredRecord(value, field);
  if (
    !exactDataRecord(provenance, [
      "schemaVersion",
      "sourceMessage",
      "priorWorkspace",
      "priorUnderstanding",
      "priorCommission",
      "boundaryActions",
    ]) ||
    provenance.schemaVersion !== 1
  ) {
    throw new CreativeTaskInputStaleError(`${field}_invalid`);
  }
  const source = requiredRecord(provenance.sourceMessage, `${field}_source`);
  const workspace = requiredRecord(
    provenance.priorWorkspace,
    `${field}_workspace`,
  );
  const understanding = requiredRecord(
    provenance.priorUnderstanding,
    `${field}_understanding`,
  );
  const commission = requiredRecord(
    provenance.priorCommission,
    `${field}_commission`,
  );
  if (
    !exactDataRecord(source, [
      "id",
      "requestDigest",
      "basedOnUnderstandingId",
    ]) ||
    !exactDataRecord(workspace, [
      "id",
      "aggregateVersion",
      "publicationDigest",
    ]) ||
    !exactDataRecord(understanding, ["id", "version", "payloadDigest"]) ||
    !exactDataRecord(commission, ["id", "version", "payloadDigest"])
  ) {
    throw new CreativeTaskInputStaleError(`${field}_invalid`);
  }
  return {
    schemaVersion: 1,
    sourceMessage: {
      id: requiredString(source.id, `${field}_source_id`),
      requestDigest: requiredDigest(
        source.requestDigest,
        `${field}_source_digest`,
      ),
      basedOnUnderstandingId: requiredString(
        source.basedOnUnderstandingId,
        `${field}_source_based_on`,
      ),
    },
    priorWorkspace: {
      id: requiredString(workspace.id, `${field}_workspace_id`),
      aggregateVersion: requiredInteger(
        workspace.aggregateVersion,
        `${field}_workspace_version`,
      ),
      publicationDigest: requiredDigest(
        workspace.publicationDigest,
        `${field}_workspace_digest`,
      ),
    },
    priorUnderstanding: {
      id: requiredString(understanding.id, `${field}_understanding_id`),
      version: requiredInteger(
        understanding.version,
        `${field}_understanding_version`,
      ),
      payloadDigest: requiredDigest(
        understanding.payloadDigest,
        `${field}_understanding_digest`,
      ),
    },
    priorCommission: {
      id: requiredString(commission.id, `${field}_commission_id`),
      version: requiredInteger(
        commission.version,
        `${field}_commission_version`,
      ),
      payloadDigest: requiredDigest(
        commission.payloadDigest,
        `${field}_commission_digest`,
      ),
    },
    boundaryActions: parseCorrectionBoundaryActions(
      provenance.boundaryActions,
      `${field}_actions`,
    ),
  };
}

function parseCanonicalBoundaryProjectionList(
  value: unknown,
  field: string,
): CanonicalBoundaryProjection[] {
  if (!Array.isArray(value)) {
    throw new CreativeTaskInputStaleError(`${field}_invalid`);
  }
  return value.map((entry, index) => {
    const item = requiredRecord(entry, `${field}_${index}`);
    if (
      !exactDataRecord(item, [
        "id",
        "sourceMessageId",
        "status",
        "value",
        "version",
      ]) ||
      item.status !== "active"
    ) {
      throw new CreativeTaskInputStaleError(`${field}_invalid`);
    }
    return {
      id: requiredString(item.id, `${field}_${index}_id`),
      sourceMessageId: requiredString(
        item.sourceMessageId,
        `${field}_${index}_source`,
      ),
      status: "active" as const,
      value: requiredString(item.value, `${field}_${index}_value`),
      version: requiredInteger(item.version, `${field}_${index}_version`),
    };
  });
}

function canonicalBoundaryListsMatch(
  left: readonly CanonicalBoundaryProjection[],
  right: readonly CanonicalBoundaryProjection[],
) {
  return (
    left.length === right.length &&
    left.every((item, index) => {
      const expected = right[index];
      return (
        expected !== undefined &&
        item.id === expected.id &&
        item.sourceMessageId === expected.sourceMessageId &&
        item.status === expected.status &&
        item.value === expected.value &&
        item.version === expected.version
      );
    })
  );
}

function workspaceStatusValue(status: VnextStoryWorkspaceStatus) {
  switch (status) {
    case VnextStoryWorkspaceStatus.FORMING:
      return "forming" as const;
    case VnextStoryWorkspaceStatus.ACTIVE:
      return "active" as const;
    case VnextStoryWorkspaceStatus.PAUSED:
      return "paused" as const;
    case VnextStoryWorkspaceStatus.ARCHIVED:
      return "archived" as const;
  }
}

function understandingStatusValue(status: VnextUnderstandingStatus) {
  switch (status) {
    case VnextUnderstandingStatus.PROPOSED:
      return "proposed" as const;
    case VnextUnderstandingStatus.CORRECTED:
      return "corrected" as const;
    case VnextUnderstandingStatus.CONFIRMED:
      return "confirmed" as const;
    case VnextUnderstandingStatus.EXPIRED:
      return "expired" as const;
  }
}

function commissionStatusValue(status: VnextCommissionStatus) {
  switch (status) {
    case VnextCommissionStatus.DRAFT:
      return "draft" as const;
    case VnextCommissionStatus.ACTIVE:
      return "active" as const;
    case VnextCommissionStatus.SUPERSEDED:
      return "superseded" as const;
  }
}

function publicationSnapshotMatches(
  value: unknown,
  expected: {
    readonly activeHardBoundaries: readonly CanonicalBoundaryProjection[];
    readonly commission: {
      readonly id: string;
      readonly status: string;
      readonly version: number;
    };
    readonly understanding: {
      readonly id: string;
      readonly status: string;
      readonly version: number;
    };
    readonly workspace: {
      readonly aggregateVersion: number;
      readonly id: string;
      readonly status: string;
    };
    readonly correctionProvenance?: CanonicalCorrectionProvenance;
  },
) {
  try {
    const snapshot = requiredRecord(value, "publication_snapshot");
    const expectedFields =
      expected.correctionProvenance === undefined
        ? ["activeHardBoundaries", "commission", "understanding", "workspace"]
        : [
            "activeHardBoundaries",
            "commission",
            "understanding",
            "workspace",
            "correctionProvenance",
          ];
    if (
      !exactDataRecord(snapshot, expectedFields)
    ) {
      return false;
    }
    const commission = requiredRecord(
      snapshot.commission,
      "publication_commission",
    );
    const understanding = requiredRecord(
      snapshot.understanding,
      "publication_understanding",
    );
    const workspace = requiredRecord(
      snapshot.workspace,
      "publication_workspace",
    );
    if (
      !exactDataRecord(commission, ["id", "status", "version"]) ||
      !exactDataRecord(understanding, ["id", "status", "version"]) ||
      !exactDataRecord(workspace, ["aggregateVersion", "id", "status"])
    ) {
      return false;
    }
    const boundaries = parseCanonicalBoundaryProjectionList(
      snapshot.activeHardBoundaries,
      "publication_boundaries",
    );
    const provenance =
      expected.correctionProvenance === undefined
        ? null
        : parseCorrectionProvenance(
            snapshot.correctionProvenance,
            "publication_correction_provenance",
          );
    return (
      canonicalBoundaryListsMatch(
        boundaries,
        expected.activeHardBoundaries,
      ) &&
      commission.id === expected.commission.id &&
      commission.status === expected.commission.status &&
      commission.version === expected.commission.version &&
      understanding.id === expected.understanding.id &&
      understanding.status === expected.understanding.status &&
      understanding.version === expected.understanding.version &&
      workspace.id === expected.workspace.id &&
      workspace.status === expected.workspace.status &&
      workspace.aggregateVersion === expected.workspace.aggregateVersion &&
      (expected.correctionProvenance === undefined ||
        (provenance !== null &&
          correctionProvenanceMatches(
            provenance,
            expected.correctionProvenance,
          )))
    );
  } catch (error) {
    if (error instanceof CreativeTaskInputStaleError) {
      return false;
    }
    throw error;
  }
}

function correctionBoundaryActionMatches(
  left: CanonicalCorrectionBoundaryAction,
  right: CanonicalCorrectionBoundaryAction,
) {
  return (
    left.operation === right.operation &&
    left.targetBoundaryId === right.targetBoundaryId &&
    left.expectedTargetVersion === right.expectedTargetVersion &&
    left.evidence.value === right.evidence.value &&
    left.evidence.evidenceStart === right.evidence.evidenceStart &&
    left.evidence.evidenceEnd === right.evidence.evidenceEnd
  );
}

function correctionProvenanceMatches(
  left: CanonicalCorrectionProvenance,
  right: CanonicalCorrectionProvenance,
) {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.sourceMessage.id === right.sourceMessage.id &&
    left.sourceMessage.requestDigest === right.sourceMessage.requestDigest &&
    left.sourceMessage.basedOnUnderstandingId ===
      right.sourceMessage.basedOnUnderstandingId &&
    left.priorWorkspace.id === right.priorWorkspace.id &&
    left.priorWorkspace.aggregateVersion ===
      right.priorWorkspace.aggregateVersion &&
    left.priorWorkspace.publicationDigest ===
      right.priorWorkspace.publicationDigest &&
    left.priorUnderstanding.id === right.priorUnderstanding.id &&
    left.priorUnderstanding.version === right.priorUnderstanding.version &&
    left.priorUnderstanding.payloadDigest ===
      right.priorUnderstanding.payloadDigest &&
    left.priorCommission.id === right.priorCommission.id &&
    left.priorCommission.version === right.priorCommission.version &&
    left.priorCommission.payloadDigest === right.priorCommission.payloadDigest &&
    left.boundaryActions.length === right.boundaryActions.length &&
    left.boundaryActions.every((action, index) => {
      const expected = right.boundaryActions[index];
      return (
        expected !== undefined &&
        correctionBoundaryActionMatches(action, expected)
      );
    })
  );
}

function canonicalUnderstandingOutput(
  understanding: VnextUnderstandingFields,
  commission: VnextCommissionFields,
  explicitHardBoundaries: readonly {
    readonly value: string;
    readonly evidenceStart: number;
    readonly evidenceEnd: number;
  }[],
) {
  return JSON.stringify({
    storyDesire: understanding.storyDesire,
    emotionalTarget: understanding.emotionalTarget,
    relationshipTension: understanding.relationshipTension,
    clarificationQuestion: understanding.clarificationQuestions[0] ?? null,
    confidence: understanding.confidence,
    commission: {
      premise: commission.premise,
      emotionalPromise: commission.emotionalPromise,
      relationshipCore: commission.relationshipCore,
      styleConstraints: [...commission.styleConstraints],
      continuationIntent: commission.continuationIntent,
    },
    explicitHardBoundaries: explicitHardBoundaries.map((boundary) => ({
      value: boundary.value,
      evidenceStart: boundary.evidenceStart,
      evidenceEnd: boundary.evidenceEnd,
    })),
  });
}

function canonicalCorrectionUnderstandingOutput(
  understanding: VnextUnderstandingFields,
  commission: VnextCommissionFields,
  boundaryActions: readonly CanonicalCorrectionBoundaryAction[],
) {
  return JSON.stringify({
    storyDesire: understanding.storyDesire,
    emotionalTarget: understanding.emotionalTarget,
    relationshipTension: understanding.relationshipTension,
    clarificationQuestion: understanding.clarificationQuestions[0] ?? null,
    confidence: understanding.confidence,
    commission: {
      premise: commission.premise,
      emotionalPromise: commission.emotionalPromise,
      relationshipCore: commission.relationshipCore,
      styleConstraints: [...commission.styleConstraints],
      continuationIntent: commission.continuationIntent,
    },
    boundaryActions: boundaryActions.map((action) => ({
      operation: action.operation,
      targetBoundaryId: action.targetBoundaryId,
      expectedTargetVersion: action.expectedTargetVersion,
      evidence: {
        value: action.evidence.value,
        evidenceStart: action.evidence.evidenceStart,
        evidenceEnd: action.evidence.evidenceEnd,
      },
    })),
  });
}

function correctionDigestActions(
  actions: readonly CanonicalCorrectionBoundaryAction[],
) {
  return actions.map((action) => {
    if (action.operation === "add") {
      return { operation: "add" as const, ...action.evidence };
    }
    if (action.operation === "revoke") {
      return {
        operation: "revoke" as const,
        targetItemId: action.targetBoundaryId!,
        expectedItemVersion: action.expectedTargetVersion!,
        evidence: action.evidence,
      };
    }
    return {
      operation: "replace" as const,
      targetItemId: action.targetBoundaryId!,
      expectedItemVersion: action.expectedTargetVersion!,
      ...action.evidence,
    };
  });
}

function validateCorrectionProvenanceActions(
  sourceBody: string,
  actions: readonly CanonicalCorrectionBoundaryAction[],
  priorBoundaries: readonly CanonicalBoundaryProjection[],
) {
  const seenRanges = new Set<string>();
  const seenValues = new Set<string>();
  const seenTargets = new Set<string>();
  const priorById = new Map(
    priorBoundaries.map((boundary) => [boundary.id, boundary] as const),
  );
  for (const action of actions) {
    const evidence = validateExplicitBoundaryEvidence(sourceBody, action.evidence);
    const rangeKey = `${evidence.evidenceStart}:${evidence.evidenceEnd}`;
    const valueKey = boundaryValueDigest(evidence.value);
    if (seenRanges.has(rangeKey) || seenValues.has(valueKey)) {
      throw new CreativeTaskInputStaleError();
    }
    seenRanges.add(rangeKey);
    seenValues.add(valueKey);
    if (action.operation === "add") {
      continue;
    }
    const targetId = action.targetBoundaryId;
    const targetVersion = action.expectedTargetVersion;
    if (
      targetId === null ||
      targetVersion === null ||
      seenTargets.has(targetId) ||
      priorById.get(targetId)?.version !== targetVersion
    ) {
      throw new CreativeTaskInputStaleError();
    }
    seenTargets.add(targetId);
  }
}

function historicalPublicationSnapshotMatches(
  value: unknown,
  expected: {
    readonly activeHardBoundaries: readonly CanonicalBoundaryProjection[];
    readonly commission: {
      readonly id: string;
      readonly status: string;
      readonly version: number;
    };
    readonly understanding: {
      readonly id: string;
      readonly status: string;
      readonly version: number;
    };
    readonly workspace: {
      readonly aggregateVersion: number;
      readonly id: string;
      readonly status: string;
    };
    readonly corrected: boolean;
  },
) {
  try {
    if (!expected.corrected) {
      return publicationSnapshotMatches(value, expected);
    }
    const snapshot = requiredRecord(value, "historical_publication_snapshot");
    const provenance = parseCorrectionProvenance(
      snapshot.correctionProvenance,
      "historical_correction_provenance",
    );
    return publicationSnapshotMatches(value, {
      ...expected,
      correctionProvenance: provenance,
    });
  } catch (error) {
    if (error instanceof CreativeTaskInputStaleError) {
      return false;
    }
    throw error;
  }
}

function successfulUnderstandingTraceMatches(
  sourceTask: {
    readonly attemptCount: number;
    readonly inputDigest: string;
  },
  sourceTrace:
    | {
        readonly attemptNumber: number;
        readonly completedAt: Date | null;
        readonly fallbackApplied: boolean | null;
        readonly inputDigest: string;
        readonly model: string | null;
        readonly outputHash: string | null;
        readonly provider: string | null;
        readonly providerTraceId: string | null;
        readonly route: string | null;
        readonly workflowVersion: string | null;
      }
    | undefined,
  expectedOutputHash: string,
) {
  return (
    sourceTrace !== undefined &&
    sourceTrace.attemptNumber === sourceTask.attemptCount &&
    sourceTrace.inputDigest === sourceTask.inputDigest &&
    sourceTrace.outputHash === expectedOutputHash &&
    sourceTrace.fallbackApplied === false &&
    sourceTrace.providerTraceId !== null &&
    sourceTrace.providerTraceId.trim().length > 0 &&
    sourceTrace.provider !== null &&
    sourceTrace.provider.trim().length > 0 &&
    sourceTrace.model !== null &&
    sourceTrace.model.trim().length > 0 &&
    sourceTrace.route !== null &&
    sourceTrace.route.trim().length > 0 &&
    sourceTrace.workflowVersion !== null &&
    sourceTrace.workflowVersion.trim().length > 0 &&
    sourceTrace.completedAt !== null
  );
}

async function readInitialUnderstandingEvidence(
  client: CreativeTaskClient,
  ownerPrincipalId: string,
  source: { readonly body: string; readonly id: string },
) {
  const evidenceRows = await client.vnextReaderMemoryItem.findMany({
    where: {
      ownerPrincipalId,
      sourceMessageId: source.id,
      itemKind: VnextReaderMemoryItemKind.HARD_BOUNDARY,
    },
    select: {
      evidenceEnd: true,
      evidenceStart: true,
      evidenceValue: true,
      value: true,
      valueDigest: true,
    },
    orderBy: [
      { evidenceStart: "asc" },
      { evidenceEnd: "asc" },
      { id: "asc" },
    ],
  });
  const seenEvidenceRanges = new Set<string>();
  const seenEvidenceValues = new Set<string>();
  return evidenceRows.map((row) => {
    if (
      row.evidenceValue !== row.value ||
      row.valueDigest !== boundaryValueDigest(row.value)
    ) {
      throw new CreativeTaskInputStaleError();
    }
    const evidence = validateExplicitBoundaryEvidence(source.body, {
      evidenceEnd: row.evidenceEnd,
      evidenceStart: row.evidenceStart,
      value: row.evidenceValue,
    });
    const rangeKey = `${evidence.evidenceStart}:${evidence.evidenceEnd}`;
    const valueKey = boundaryValueDigest(evidence.value);
    if (
      seenEvidenceRanges.has(rangeKey) ||
      seenEvidenceValues.has(valueKey)
    ) {
      throw new CreativeTaskInputStaleError();
    }
    seenEvidenceRanges.add(rangeKey);
    seenEvidenceValues.add(valueKey);
    return evidence;
  });
}

export async function readCurrentOpeningTruth(
  client: CreativeTaskClient,
  ownerPrincipalId: string,
  artifacts: WriteOpeningTaskArtifacts,
) {
  const [workspace, understanding, commission, boundariesMatch] =
    await Promise.all([
      client.vnextStoryWorkspace.findFirst({
        where: {
          id: artifacts.workspace.id,
          ownerPrincipalId,
          aggregateVersion: artifacts.workspace.aggregateVersion,
          status: {
            in: [
              VnextStoryWorkspaceStatus.FORMING,
              VnextStoryWorkspaceStatus.ACTIVE,
            ],
          },
        },
      }),
      client.vnextUnderstandingDraft.findFirst({
        where: {
          id: artifacts.understanding.id,
          ownerPrincipalId,
          workspaceId: artifacts.workspace.id,
          version: artifacts.understanding.version,
          status: {
            in: [
              VnextUnderstandingStatus.PROPOSED,
              VnextUnderstandingStatus.CORRECTED,
              VnextUnderstandingStatus.CONFIRMED,
            ],
          },
        },
      }),
      client.vnextCommissionBrief.findFirst({
        where: {
          id: artifacts.commission.id,
          ownerPrincipalId,
          workspaceId: artifacts.workspace.id,
          sourceUnderstandingId: artifacts.understanding.id,
          version: artifacts.commission.version,
          status: {
            in: [VnextCommissionStatus.DRAFT, VnextCommissionStatus.ACTIVE],
          },
        },
      }),
      currentBoundarySnapshotMatches(client, ownerPrincipalId, artifacts),
    ]);
  if (!workspace || !understanding || !commission || !boundariesMatch) {
    throw new CreativeTaskInputStaleError();
  }
  try {
    const [source, originSource] = await Promise.all([
      client.vnextSourceMessage.findFirst({
        where: { id: understanding.sourceMessageId, ownerPrincipalId },
      }),
      client.vnextSourceMessage.findFirst({
        where: {
          id: workspace.originSourceMessageId,
          ownerPrincipalId,
          action: VnextSourceMessageAction.COMMISSION,
        },
      }),
    ]);
    if (
      source === null ||
      originSource === null ||
      !sourceMessageDigestMatches(source) ||
      !sourceMessageDigestMatches(originSource) ||
      originSource.basedOnUnderstandingId !== null ||
      originSource.basedOnVersion !== null ||
      source.experienceSessionId !== originSource.experienceSessionId
    ) {
      throw new CreativeTaskInputStaleError();
    }

    const understandingFields = validateUnderstandingFields({
      clarificationQuestions: requiredStringList(
        understanding.clarificationQuestions,
        "understanding_clarification_questions",
      ),
      confidence: understanding.confidence,
      emotionalTarget: requiredString(
        understanding.emotionalTarget,
        "understanding_emotional_target",
      ),
      relationshipTension: requiredString(
        understanding.relationshipTension,
        "understanding_relationship_tension",
      ),
      storyDesire: requiredString(
        understanding.storyDesire,
        "understanding_story_desire",
      ),
      userCorrection:
        understanding.userCorrection === null
          ? null
          : requiredString(
              understanding.userCorrection,
              "understanding_user_correction",
            ),
    });
    const commissionFields = validateCommissionFields({
      continuationIntent: requiredString(
        commission.continuationIntent,
        "commission_continuation_intent",
      ),
      emotionalPromise: requiredString(
        commission.emotionalPromise,
        "commission_emotional_promise",
      ),
      premise: requiredString(commission.premise, "commission_premise"),
      relationshipCore: requiredString(
        commission.relationshipCore,
        "commission_relationship_core",
      ),
      styleConstraints: requiredStringList(
        commission.styleConstraints,
        "commission_style_constraints",
      ),
    });
    const understandingBoundaries = parseCanonicalBoundaryProjectionList(
      understanding.hardBoundaries,
      "understanding_boundaries",
    );
    const commissionBoundaries = parseCanonicalBoundaryProjectionList(
      commission.hardBoundaries,
      "commission_boundaries",
    );
    const artifactBoundaries = artifacts.hardBoundaries.items.map((item) => ({
      id: item.boundaryId,
      sourceMessageId: item.sourceRef,
      status: "active" as const,
      value: item.value,
      version: item.version,
    }));
    if (
      !canonicalBoundaryListsMatch(
        understandingBoundaries,
        artifactBoundaries,
      ) ||
      !canonicalBoundaryListsMatch(commissionBoundaries, artifactBoundaries)
    ) {
      throw new CreativeTaskInputStaleError();
    }

    const commissionDigest = createCommissionPayloadDigest(
      commissionFields,
      commissionBoundaries,
    );
    const sourceTask = await client.vnextCreativeTask.findFirst({
      where: {
        ownerPrincipalId,
        sourceMessageId: source.id,
        kind: VnextCreativeTaskKind.UNDERSTAND,
        status: VnextCreativeTaskStatus.SUCCEEDED,
      },
      include: {
        runTraces: {
          where: { status: VnextCreativeRunStatus.SUCCEEDED },
          orderBy: { attemptNumber: "desc" },
          take: 1,
        },
      },
    });
    if (sourceTask === null) {
      throw new CreativeTaskInputStaleError();
    }
    const sourceArtifacts = parseArtifacts(
      sourceTask.inputArtifactVersions,
      ownerPrincipalId,
    );
    const sourceTrace = sourceTask.runTraces[0];
    if (
      sourceArtifacts.kind !== "understand" ||
      sourceArtifacts.sourceMessage.id !== source.id ||
      sourceArtifacts.sourceMessage.requestDigest !== source.requestDigest ||
      artifactDigest(sourceArtifacts) !== sourceTask.inputDigest
    ) {
      throw new CreativeTaskInputStaleError();
    }

    if (source.action === VnextSourceMessageAction.COMMISSION) {
      if (
        source.id !== originSource.id ||
        source.basedOnUnderstandingId !== null ||
        source.basedOnVersion !== null ||
        sourceArtifacts.schemaVersion !== 1 ||
        sourceTask.workspaceId !== null ||
        sourceTask.understandingId !== null ||
        sourceTask.commissionId !== null ||
        understanding.supersedesUnderstandingId !== null ||
        commission.supersedesCommissionId !== null
      ) {
        throw new CreativeTaskInputStaleError();
      }
      const explicitHardBoundaries = await readInitialUnderstandingEvidence(
        client,
        ownerPrincipalId,
        source,
      );
      const publicationDigest = createStoryTruthPublicationDigest({
        commission: commissionFields,
        explicitHardBoundaries,
        ownerPrincipalId,
        sourceMessageId: source.id,
        understanding: understandingFields,
      });
      const expectedOutputHash = createHash("sha256")
        .update(
          canonicalUnderstandingOutput(
            understandingFields,
            commissionFields,
            explicitHardBoundaries,
          ),
        )
        .digest("hex");
      if (
        workspace.publicationDigest !== publicationDigest ||
        understanding.payloadDigest !== publicationDigest ||
        commission.payloadDigest !== commissionDigest ||
        artifacts.workspace.publicationDigest !== publicationDigest ||
        artifacts.understanding.payloadDigest !== publicationDigest ||
        artifacts.commission.payloadDigest !== commissionDigest ||
        !publicationSnapshotMatches(understanding.publicationSnapshot, {
          activeHardBoundaries: artifactBoundaries,
          commission: {
            id: commission.id,
            status: commissionStatusValue(commission.status),
            version: commission.version,
          },
          understanding: {
            id: understanding.id,
            status: understandingStatusValue(understanding.status),
            version: understanding.version,
          },
          workspace: {
            aggregateVersion: workspace.aggregateVersion,
            id: workspace.id,
            status: workspaceStatusValue(workspace.status),
          },
        }) ||
        !successfulUnderstandingTraceMatches(
          sourceTask,
          sourceTrace,
          expectedOutputHash,
        )
      ) {
        throw new CreativeTaskInputStaleError();
      }
      return { commission, understanding, workspace };
    }

    if (
      source.action !== VnextSourceMessageAction.CORRECTION ||
      sourceArtifacts.schemaVersion !== 2
    ) {
      throw new CreativeTaskInputStaleError();
    }
    const snapshot = requiredRecord(
      understanding.publicationSnapshot,
      "publication_snapshot",
    );
    const provenance = parseCorrectionProvenance(
      snapshot.correctionProvenance,
      "publication_correction_provenance",
    );
    if (
      source.id !== provenance.sourceMessage.id ||
      source.requestDigest !== provenance.sourceMessage.requestDigest ||
      source.basedOnUnderstandingId !==
        provenance.sourceMessage.basedOnUnderstandingId ||
      source.basedOnUnderstandingId !== provenance.priorUnderstanding.id ||
      source.basedOnVersion !== provenance.priorUnderstanding.version ||
      sourceTask.workspaceId !== provenance.priorWorkspace.id ||
      sourceTask.understandingId !== provenance.priorUnderstanding.id ||
      sourceTask.commissionId !== provenance.priorCommission.id ||
      sourceArtifacts.workspace.id !== provenance.priorWorkspace.id ||
      sourceArtifacts.workspace.aggregateVersion !==
        provenance.priorWorkspace.aggregateVersion ||
      sourceArtifacts.workspace.publicationDigest !==
        provenance.priorWorkspace.publicationDigest ||
      sourceArtifacts.understanding.id !== provenance.priorUnderstanding.id ||
      sourceArtifacts.understanding.version !==
        provenance.priorUnderstanding.version ||
      sourceArtifacts.understanding.payloadDigest !==
        provenance.priorUnderstanding.payloadDigest ||
      sourceArtifacts.commission.id !== provenance.priorCommission.id ||
      sourceArtifacts.commission.version !== provenance.priorCommission.version ||
      sourceArtifacts.commission.payloadDigest !==
        provenance.priorCommission.payloadDigest ||
      provenance.priorWorkspace.id !== workspace.id ||
      workspace.aggregateVersion !==
        provenance.priorWorkspace.aggregateVersion + 1 ||
      understanding.version !== workspace.aggregateVersion ||
      commission.version !== workspace.aggregateVersion ||
      understanding.supersedesUnderstandingId !==
        provenance.priorUnderstanding.id ||
      commission.supersedesCommissionId !== provenance.priorCommission.id ||
      understanding.status !== VnextUnderstandingStatus.CORRECTED ||
      understanding.userCorrection !== source.body
    ) {
      throw new CreativeTaskInputStaleError();
    }

    const priorArtifactBoundaries = sourceArtifacts.hardBoundaries.items.map(
      (item) => ({
        id: item.boundaryId,
        sourceMessageId: item.sourceRef,
        status: "active" as const,
        value: item.value,
        version: item.version,
      }),
    );
    validateCorrectionProvenanceActions(
      source.body,
      provenance.boundaryActions,
      priorArtifactBoundaries,
    );

    const [priorUnderstanding, priorCommission, actionRows, priorRows] =
      await Promise.all([
        client.vnextUnderstandingDraft.findFirst({
          where: {
            id: provenance.priorUnderstanding.id,
            ownerPrincipalId,
            workspaceId: workspace.id,
            version: provenance.priorUnderstanding.version,
            status: VnextUnderstandingStatus.EXPIRED,
          },
        }),
        client.vnextCommissionBrief.findFirst({
          where: {
            id: provenance.priorCommission.id,
            ownerPrincipalId,
            workspaceId: workspace.id,
            sourceUnderstandingId: provenance.priorUnderstanding.id,
            version: provenance.priorCommission.version,
            status: VnextCommissionStatus.SUPERSEDED,
          },
        }),
        client.vnextReaderMemoryItem.findMany({
          where: {
            ownerPrincipalId,
            sourceMessageId: source.id,
            itemKind: VnextReaderMemoryItemKind.HARD_BOUNDARY,
          },
          orderBy: [
            { evidenceStart: "asc" },
            { evidenceEnd: "asc" },
            { id: "asc" },
          ],
        }),
        client.vnextReaderMemoryItem.findMany({
          where: {
            ownerPrincipalId,
            id: { in: priorArtifactBoundaries.map((boundary) => boundary.id) },
            itemKind: VnextReaderMemoryItemKind.HARD_BOUNDARY,
          },
        }),
      ]);
    if (
      priorUnderstanding === null ||
      priorCommission === null ||
      priorUnderstanding.payloadDigest !==
        provenance.priorUnderstanding.payloadDigest ||
      priorCommission.payloadDigest !== provenance.priorCommission.payloadDigest ||
      provenance.priorWorkspace.publicationDigest !==
        provenance.priorUnderstanding.payloadDigest ||
      sourceArtifacts.workspace.publicationDigest !==
        priorUnderstanding.payloadDigest ||
      priorRows.length !== priorArtifactBoundaries.length ||
      actionRows.length !== provenance.boundaryActions.length
    ) {
      throw new CreativeTaskInputStaleError();
    }

    const priorUnderstandingFields = validateUnderstandingFields({
      clarificationQuestions: requiredStringList(
        priorUnderstanding.clarificationQuestions,
        "prior_understanding_clarification_questions",
      ),
      confidence: priorUnderstanding.confidence,
      emotionalTarget: requiredString(
        priorUnderstanding.emotionalTarget,
        "prior_understanding_emotional_target",
      ),
      relationshipTension: requiredString(
        priorUnderstanding.relationshipTension,
        "prior_understanding_relationship_tension",
      ),
      storyDesire: requiredString(
        priorUnderstanding.storyDesire,
        "prior_understanding_story_desire",
      ),
      userCorrection:
        priorUnderstanding.userCorrection === null
          ? null
          : requiredString(
              priorUnderstanding.userCorrection,
              "prior_understanding_user_correction",
            ),
    });
    const priorCommissionFields = validateCommissionFields({
      continuationIntent: requiredString(
        priorCommission.continuationIntent,
        "prior_commission_continuation_intent",
      ),
      emotionalPromise: requiredString(
        priorCommission.emotionalPromise,
        "prior_commission_emotional_promise",
      ),
      premise: requiredString(
        priorCommission.premise,
        "prior_commission_premise",
      ),
      relationshipCore: requiredString(
        priorCommission.relationshipCore,
        "prior_commission_relationship_core",
      ),
      styleConstraints: requiredStringList(
        priorCommission.styleConstraints,
        "prior_commission_style_constraints",
      ),
    });
    const priorUnderstandingBoundaries = parseCanonicalBoundaryProjectionList(
      priorUnderstanding.hardBoundaries,
      "prior_understanding_boundaries",
    );
    const priorCommissionBoundaries = parseCanonicalBoundaryProjectionList(
      priorCommission.hardBoundaries,
      "prior_commission_boundaries",
    );
    if (
      !canonicalBoundaryListsMatch(
        priorUnderstandingBoundaries,
        priorArtifactBoundaries,
      ) ||
      !canonicalBoundaryListsMatch(
        priorCommissionBoundaries,
        priorArtifactBoundaries,
      ) ||
      createCommissionPayloadDigest(
        priorCommissionFields,
        priorCommissionBoundaries,
      ) !== priorCommission.payloadDigest
    ) {
      throw new CreativeTaskInputStaleError();
    }

    const priorSource = await client.vnextSourceMessage.findFirst({
      where: { id: priorUnderstanding.sourceMessageId, ownerPrincipalId },
    });
    if (
      priorSource === null ||
      !sourceMessageDigestMatches(priorSource) ||
      priorSource.experienceSessionId !== source.experienceSessionId
    ) {
      throw new CreativeTaskInputStaleError();
    }
    let priorExpectedDigest: string;
    let priorSnapshotStatus: "proposed" | "corrected";
    if (priorSource.action === VnextSourceMessageAction.COMMISSION) {
      if (
        priorSource.id !== originSource.id ||
        priorSource.basedOnUnderstandingId !== null ||
        priorSource.basedOnVersion !== null ||
        priorUnderstanding.supersedesUnderstandingId !== null ||
        priorCommission.supersedesCommissionId !== null
      ) {
        throw new CreativeTaskInputStaleError();
      }
      priorExpectedDigest = createStoryTruthPublicationDigest({
        commission: priorCommissionFields,
        explicitHardBoundaries: await readInitialUnderstandingEvidence(
          client,
          ownerPrincipalId,
          priorSource,
        ),
        ownerPrincipalId,
        sourceMessageId: priorSource.id,
        understanding: priorUnderstandingFields,
      });
      priorSnapshotStatus = "proposed";
    } else if (priorSource.action === VnextSourceMessageAction.CORRECTION) {
      const priorSnapshot = requiredRecord(
        priorUnderstanding.publicationSnapshot,
        "prior_publication_snapshot",
      );
      const priorProvenance = parseCorrectionProvenance(
        priorSnapshot.correctionProvenance,
        "prior_correction_provenance",
      );
      const [provenanceUnderstanding, provenanceCommission] =
        await Promise.all([
          client.vnextUnderstandingDraft.findFirst({
            where: {
              id: priorProvenance.priorUnderstanding.id,
              ownerPrincipalId,
              workspaceId: workspace.id,
            },
            select: { version: true, payloadDigest: true },
          }),
          client.vnextCommissionBrief.findFirst({
            where: {
              id: priorProvenance.priorCommission.id,
              ownerPrincipalId,
              workspaceId: workspace.id,
            },
            select: { version: true, payloadDigest: true },
          }),
        ]);
      if (
        provenanceUnderstanding === null ||
        provenanceCommission === null ||
        priorProvenance.priorWorkspace.id !== workspace.id ||
        priorProvenance.priorWorkspace.aggregateVersion !==
          provenanceUnderstanding.version ||
        priorProvenance.priorWorkspace.publicationDigest !==
          provenanceUnderstanding.payloadDigest ||
        priorProvenance.priorUnderstanding.version !==
          provenanceUnderstanding.version ||
        priorProvenance.priorUnderstanding.payloadDigest !==
          provenanceUnderstanding.payloadDigest ||
        priorProvenance.priorCommission.version !==
          provenanceCommission.version ||
        priorProvenance.priorCommission.payloadDigest !==
          provenanceCommission.payloadDigest ||
        priorProvenance.sourceMessage.id !== priorSource.id ||
        priorProvenance.sourceMessage.requestDigest !==
          priorSource.requestDigest ||
        priorProvenance.sourceMessage.basedOnUnderstandingId !==
          priorSource.basedOnUnderstandingId ||
        priorSource.basedOnUnderstandingId !==
          priorProvenance.priorUnderstanding.id ||
        priorSource.basedOnVersion !== priorProvenance.priorUnderstanding.version ||
        priorUnderstanding.supersedesUnderstandingId !==
          priorProvenance.priorUnderstanding.id ||
        priorCommission.supersedesCommissionId !==
          priorProvenance.priorCommission.id ||
        priorUnderstanding.userCorrection !== priorSource.body
      ) {
        throw new CreativeTaskInputStaleError();
      }
      priorExpectedDigest = createStoryTruthCorrectionDigest({
        ownerPrincipalId,
        workspaceId: workspace.id,
        correctionSourceMessageId: priorSource.id,
        expectedAggregateVersion:
          priorProvenance.priorWorkspace.aggregateVersion,
        understanding: priorUnderstandingFields,
        commission: priorCommissionFields,
        boundaryActions: correctionDigestActions(
          priorProvenance.boundaryActions,
        ),
      });
      priorSnapshotStatus = "corrected";
    } else {
      throw new CreativeTaskInputStaleError();
    }
    if (
      priorExpectedDigest !== priorUnderstanding.payloadDigest ||
      !historicalPublicationSnapshotMatches(
        priorUnderstanding.publicationSnapshot,
        {
          activeHardBoundaries: priorArtifactBoundaries,
          commission: {
            id: priorCommission.id,
            status: "draft",
            version: priorCommission.version,
          },
          understanding: {
            id: priorUnderstanding.id,
            status: priorSnapshotStatus,
            version: priorUnderstanding.version,
          },
          workspace: {
            aggregateVersion: provenance.priorWorkspace.aggregateVersion,
            id: workspace.id,
            status: workspaceStatusValue(workspace.status),
          },
          corrected: priorSnapshotStatus === "corrected",
        },
      )
    ) {
      throw new CreativeTaskInputStaleError();
    }

    const priorRowsById = new Map(priorRows.map((row) => [row.id, row]));
    const simulatedBoundaries = priorArtifactBoundaries.map((boundary) => ({
      ...boundary,
    }));
    for (const priorBoundary of priorArtifactBoundaries) {
      const row = priorRowsById.get(priorBoundary.id);
      if (
        row === undefined ||
        row.readerMemoryId !== sourceArtifacts.hardBoundaries.snapshotId ||
        row.sourceMessageId !== priorBoundary.sourceMessageId ||
        row.value !== priorBoundary.value ||
        row.valueDigest !== boundaryValueDigest(priorBoundary.value) ||
        row.version !== priorBoundary.version
      ) {
        throw new CreativeTaskInputStaleError();
      }
    }
    const usedActionRowIds = new Set<string>();
    for (const action of provenance.boundaryActions) {
      const actionRow = actionRows.find(
        (row) =>
          row.evidenceStart === action.evidence.evidenceStart &&
          row.evidenceEnd === action.evidence.evidenceEnd,
      );
      if (
        actionRow === undefined ||
        usedActionRowIds.has(actionRow.id) ||
        actionRow.readerMemoryId !== artifacts.hardBoundaries.snapshotId ||
        actionRow.evidenceValue !== action.evidence.value ||
        actionRow.supersededAt !== null
      ) {
        throw new CreativeTaskInputStaleError();
      }
      usedActionRowIds.add(actionRow.id);
      let supersededBoundary: CanonicalBoundaryProjection | undefined;
      if (action.operation === "add") {
        supersededBoundary = simulatedBoundaries.find(
          (boundary) =>
            boundaryValueDigest(boundary.value) ===
            boundaryValueDigest(action.evidence.value),
        );
      } else {
        supersededBoundary = simulatedBoundaries.find(
          (boundary) => boundary.id === action.targetBoundaryId,
        );
      }
      if (
        action.operation !== "add" &&
        (supersededBoundary === undefined ||
          supersededBoundary.version !== action.expectedTargetVersion)
      ) {
        throw new CreativeTaskInputStaleError();
      }
      if (supersededBoundary !== undefined) {
        const supersededRow = priorRowsById.get(supersededBoundary.id);
        if (
          supersededRow === undefined ||
          supersededRow.status !== VnextReaderMemoryItemStatus.REVOKED ||
          supersededRow.supersededAt === null
        ) {
          throw new CreativeTaskInputStaleError();
        }
        simulatedBoundaries.splice(
          simulatedBoundaries.findIndex(
            (boundary) => boundary.id === supersededBoundary!.id,
          ),
          1,
        );
      }
      const expectedRowValue =
        action.operation === "revoke"
          ? supersededBoundary!.value
          : action.evidence.value;
      if (
        actionRow.supersedesItemId !== (supersededBoundary?.id ?? null) ||
        actionRow.value !== expectedRowValue ||
        actionRow.valueDigest !== boundaryValueDigest(expectedRowValue) ||
        actionRow.version !== (supersededBoundary?.version ?? 0) + 1 ||
        actionRow.status !==
          (action.operation === "revoke"
            ? VnextReaderMemoryItemStatus.REVOKED
            : VnextReaderMemoryItemStatus.ACTIVE)
      ) {
        throw new CreativeTaskInputStaleError();
      }
      if (action.operation !== "revoke") {
        simulatedBoundaries.push({
          id: actionRow.id,
          sourceMessageId: source.id,
          status: "active",
          value: actionRow.value,
          version: actionRow.version,
        });
      }
    }
    if (
      usedActionRowIds.size !== actionRows.length ||
      artifacts.hardBoundaries.snapshotId !==
        sourceArtifacts.hardBoundaries.snapshotId ||
      artifacts.hardBoundaries.version !==
        sourceArtifacts.hardBoundaries.version +
          (provenance.boundaryActions.length > 0 ? 1 : 0) ||
      !canonicalBoundaryListsMatch(
        simulatedBoundaries.sort((left, right) => left.id.localeCompare(right.id)),
        artifactBoundaries,
      )
    ) {
      throw new CreativeTaskInputStaleError();
    }

    const correctionDigest = createStoryTruthCorrectionDigest({
      ownerPrincipalId,
      workspaceId: workspace.id,
      correctionSourceMessageId: source.id,
      expectedAggregateVersion: provenance.priorWorkspace.aggregateVersion,
      understanding: understandingFields,
      commission: commissionFields,
      boundaryActions: correctionDigestActions(provenance.boundaryActions),
    });
    const expectedOutputHash = createHash("sha256")
      .update(
        canonicalCorrectionUnderstandingOutput(
          understandingFields,
          commissionFields,
          provenance.boundaryActions,
        ),
      )
      .digest("hex");
    if (
      workspace.publicationDigest !== correctionDigest ||
      understanding.payloadDigest !== correctionDigest ||
      commission.payloadDigest !== commissionDigest ||
      artifacts.workspace.publicationDigest !== correctionDigest ||
      artifacts.understanding.payloadDigest !== correctionDigest ||
      artifacts.commission.payloadDigest !== commissionDigest ||
      !publicationSnapshotMatches(understanding.publicationSnapshot, {
        activeHardBoundaries: artifactBoundaries,
        commission: {
          id: commission.id,
          status: commissionStatusValue(commission.status),
          version: commission.version,
        },
        understanding: {
          id: understanding.id,
          status: understandingStatusValue(understanding.status),
          version: understanding.version,
        },
        workspace: {
          aggregateVersion: workspace.aggregateVersion,
          id: workspace.id,
          status: workspaceStatusValue(workspace.status),
        },
        correctionProvenance: provenance,
      }) ||
      !successfulUnderstandingTraceMatches(
        sourceTask,
        sourceTrace,
        expectedOutputHash,
      )
    ) {
      throw new CreativeTaskInputStaleError();
    }
  } catch (error) {
    if (error instanceof CreativeTaskInputStaleError) {
      throw error;
    }
    throw new CreativeTaskInputStaleError();
  }
  return { commission, understanding, workspace };
}

function openingSuccessIsValid(
  input: Extract<CreativeTaskExecutionSuccess, { kind: "write_opening" }>,
) {
  const body = input.result.output.body;
  const trace = input.result.trace;
  const bodyHash = createHash("sha256").update(body).digest("hex");
  const providerStartedAt = Date.parse(trace.startedAt);
  const providerCompletedAt = Date.parse(trace.completedAt);
  return (
    body.trim().length > 0 &&
    body.length <= 200_000 &&
    input.route.trim().length > 0 &&
    input.route.length <= MAXIMUM_TRACE_TEXT_LENGTH &&
    input.result.fallbackApplied === false &&
    trace.traceId.trim().length > 0 &&
    trace.traceId.length <= MAXIMUM_PROVIDER_TRACE_ID_LENGTH &&
    trace.provider.trim().length > 0 &&
    trace.provider.length <= MAXIMUM_PROVIDER_LENGTH &&
    trace.model.trim().length > 0 &&
    trace.model.length <= MAXIMUM_TRACE_TEXT_LENGTH &&
    trace.workflowVersion.trim().length > 0 &&
    trace.workflowVersion.length <= MAXIMUM_TRACE_TEXT_LENGTH &&
    Number.isFinite(providerStartedAt) &&
    Number.isFinite(providerCompletedAt) &&
    providerCompletedAt >= providerStartedAt &&
    trace.outputHash === bodyHash
  );
}

export class PrismaCreativeTaskRepository
  implements
    CreativeTaskQueueRepository,
    CreativeTaskLeasePort,
    CreativeTaskInputLoader,
    CreativeTaskCompletionPort,
    CreativeWorkerHeartbeatPort,
    CreativeWorkerReadinessPort
{
  constructor(
    private readonly client: PrismaClient,
    private readonly options: PrismaCreativeTaskRepositoryOptions = {},
  ) {}

  private currentTime() {
    const now = this.options.clock?.() ?? new Date();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      throw new Error("creative task repository clock returned an invalid date");
    }
    return new Date(now.getTime());
  }

  async queue(input: QueueCreativeTaskRecord): Promise<QueuedCreativeTask> {
    try {
      const task = await this.client.vnextCreativeTask.create({
        data: {
          ownerPrincipalId: input.ownerPrincipalId,
          sourceMessageId:
            input.artifacts.kind === "understand"
              ? input.artifacts.sourceMessage.id
              : null,
          workspaceId:
            input.artifacts.kind === "write_opening"
              ? input.artifacts.workspace.id
              : null,
          understandingId:
            input.artifacts.kind === "write_opening"
              ? input.artifacts.understanding.id
              : null,
          commissionId:
            input.artifacts.kind === "write_opening"
              ? input.artifacts.commission.id
              : null,
          processingPurpose: processingPurposeEnum(
            input.processingAuthority.purpose,
          ),
          processingBasisRecordId:
            input.processingAuthority.processingBasisRecordId,
          consentRecordId: input.processingAuthority.consentRecordId,
          processingCoverageKey:
            input.processingAuthority.processingCoverageKey,
          processingEvidenceRef:
            input.processingAuthority.processingEvidenceRef,
          requestId: input.requestId,
          idempotencyKey: input.idempotencyKey,
          kind: taskKindEnum(input.artifacts.kind),
          inputArtifactVersions: jsonInput(input.artifacts),
          inputDigest: input.inputDigest,
          availableAt: input.availableAt,
          deadlineAt: input.deadlineAt,
          maxAttempts: input.maxAttempts,
        },
      });
      return queuedProjection(task, "created");
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const [byIdempotencyKey, byRequestId] = await Promise.all([
          this.client.vnextCreativeTask.findUnique({
            where: {
              ownerPrincipalId_idempotencyKey: {
                ownerPrincipalId: input.ownerPrincipalId,
                idempotencyKey: input.idempotencyKey,
              },
            },
          }),
          this.client.vnextCreativeTask.findFirst({
            where: {
              ownerPrincipalId: input.ownerPrincipalId,
              requestId: input.requestId,
            },
          }),
        ]);
        if (
          byIdempotencyKey !== null &&
          byRequestId !== null &&
          byIdempotencyKey.id !== byRequestId.id
        ) {
          throw new CreativeTaskIdempotencyConflictError();
        }
        const existing = byIdempotencyKey ?? byRequestId;
        if (
          existing &&
          existing.idempotencyKey === input.idempotencyKey &&
          replayMatches(existing, input)
        ) {
          return queuedProjection(existing, "replayed");
        }
        throw new CreativeTaskIdempotencyConflictError();
      }
      throw error;
    }
  }

  private async closeTerminalCandidate(
    candidate: VnextCreativeTask,
    now: Date,
    status: typeof VnextCreativeTaskStatus.TIMED_OUT | typeof VnextCreativeTaskStatus.FAILED,
    failureCode: "deadline_exceeded" | "attempts_exhausted",
  ) {
    await this.client.$transaction(async (transaction) => {
      const updated = await transaction.vnextCreativeTask.updateMany({
        where: {
          id: candidate.id,
          ownerPrincipalId: candidate.ownerPrincipalId,
          stateVersion: candidate.stateVersion,
          status: candidate.status,
          attemptCount: candidate.attemptCount,
          ...(candidate.status === VnextCreativeTaskStatus.LEASED &&
          failureCode === "attempts_exhausted"
            ? {
                leaseToken: candidate.leaseToken,
                leaseExpiresAt: { lte: now },
              }
            : { deadlineAt: { lte: now } }),
        },
        data: {
          status,
          lastFailureCode: failureCode,
          completedAt: now,
          leaseOwner: null,
          leaseToken: null,
          leaseExpiresAt: null,
          stateVersion: { increment: 1 },
        },
      });
      if (updated.count === 1) {
        const traces = await transaction.vnextCreativeRunTrace.updateMany({
          where: {
            taskId: candidate.id,
            ownerPrincipalId: candidate.ownerPrincipalId,
            inputDigest: candidate.inputDigest,
            status: VnextCreativeRunStatus.RUNNING,
          },
          data: {
            status:
              status === VnextCreativeTaskStatus.TIMED_OUT
                ? VnextCreativeRunStatus.TIMED_OUT
                : VnextCreativeRunStatus.FAILED,
            failureCode,
            retryable: false,
            completedAt: now,
          },
        });
        if (
          candidate.status === VnextCreativeTaskStatus.LEASED &&
          traces.count !== 1
        ) {
          throw new Error("creative task running trace is missing");
        }
        await rotateProjectionForTask(
          transaction,
          candidate.ownerPrincipalId,
          candidate.id,
        );
      }
    });
  }

  private async reapTerminalTasks(now: Date) {
    const candidates = await this.client.vnextCreativeTask.findMany({
      where: {
        OR: [
          {
            status: {
              in: [
                VnextCreativeTaskStatus.QUEUED,
                VnextCreativeTaskStatus.RETRY_WAIT,
                VnextCreativeTaskStatus.LEASED,
              ],
            },
            deadlineAt: { lte: now },
          },
          {
            status: VnextCreativeTaskStatus.LEASED,
            leaseExpiresAt: { lte: now },
          },
        ],
      },
      orderBy: [{ deadlineAt: "asc" }, { createdAt: "asc" }],
      take: REAP_CANDIDATE_LIMIT,
    });
    for (const candidate of candidates) {
      if (candidate.deadlineAt.getTime() <= now.getTime()) {
        await this.closeTerminalCandidate(
          candidate,
          now,
          VnextCreativeTaskStatus.TIMED_OUT,
          "deadline_exceeded",
        );
      } else if (
        candidate.status === VnextCreativeTaskStatus.LEASED &&
        candidate.leaseExpiresAt !== null &&
        candidate.leaseExpiresAt.getTime() <= now.getTime() &&
        candidate.attemptCount >= candidate.maxAttempts
      ) {
        await this.closeTerminalCandidate(
          candidate,
          now,
          VnextCreativeTaskStatus.FAILED,
          "attempts_exhausted",
        );
      }
    }
  }

  async claimNext(input: ClaimCreativeTaskInput): Promise<CreativeTaskLease | null> {
    if (
      input.workerInstanceId.trim().length === 0 ||
      !Number.isSafeInteger(input.leaseDurationMs) ||
      input.leaseDurationMs < 1
    ) {
      throw new Error("workerInstanceId and leaseDurationMs are required");
    }
    const now = this.currentTime();
    await this.reapTerminalTasks(now);
    const minimumDeadlineAt = new Date(
      now.getTime() + input.leaseDurationMs,
    );
    const supportedKinds = input.supportedKinds.map((kind) => taskKindEnum(kind));
    const candidates = await this.client.vnextCreativeTask.findMany({
      where: {
        kind: { in: supportedKinds },
        deadlineAt: { gte: minimumDeadlineAt },
        OR: [
          {
            status: {
              in: [
                VnextCreativeTaskStatus.QUEUED,
                VnextCreativeTaskStatus.RETRY_WAIT,
              ],
            },
            availableAt: { lte: now },
          },
          {
            status: VnextCreativeTaskStatus.LEASED,
            leaseExpiresAt: { lte: now },
          },
        ],
      },
      orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      take: CLAIM_CANDIDATE_LIMIT,
    });

    for (const candidate of candidates) {
      if (candidate.attemptCount >= candidate.maxAttempts) {
        continue;
      }
      const leaseToken = randomUUID();
      const runTraceId = randomUUID();
      const leaseExpiresAt = minimumDeadlineAt;
      const claimed = await this.client.$transaction(async (transaction) => {
        const won = await transaction.vnextCreativeTask.updateMany({
          where: {
            id: candidate.id,
            ownerPrincipalId: candidate.ownerPrincipalId,
            status: candidate.status,
            stateVersion: candidate.stateVersion,
            attemptCount: candidate.attemptCount,
            deadlineAt: { gte: leaseExpiresAt },
            ...(candidate.status === VnextCreativeTaskStatus.LEASED
              ? {
                  leaseToken: candidate.leaseToken,
                  leaseExpiresAt: { lte: now },
                }
              : {
                  availableAt: { lte: now },
                  leaseOwner: null,
                  leaseToken: null,
                  leaseExpiresAt: null,
                }),
          },
          data: {
            status: VnextCreativeTaskStatus.LEASED,
            attemptCount: { increment: 1 },
            stateVersion: { increment: 1 },
            startedAt: candidate.startedAt ?? now,
            leaseOwner: input.workerInstanceId,
            leaseToken,
            leaseExpiresAt,
          },
        });
        if (won.count !== 1) {
          return null;
        }
        if (candidate.status === VnextCreativeTaskStatus.LEASED) {
          await transaction.vnextCreativeRunTrace.updateMany({
            where: {
              taskId: candidate.id,
              ownerPrincipalId: candidate.ownerPrincipalId,
              status: VnextCreativeRunStatus.RUNNING,
            },
            data: {
              status: VnextCreativeRunStatus.LEASE_EXPIRED,
              failureCode: "lease_expired",
              retryable: true,
              completedAt: now,
            },
          });
        }
        await transaction.vnextCreativeRunTrace.create({
          data: {
            id: runTraceId,
            ownerPrincipalId: candidate.ownerPrincipalId,
            taskId: candidate.id,
            attemptNumber: candidate.attemptCount + 1,
            runtimeMode: runtimeModeEnum(input.runtimeMode),
            inputArtifactVersions: sanitizedTraceArtifacts(
              candidate.inputArtifactVersions,
              candidate.ownerPrincipalId,
            ),
            inputDigest: candidate.inputDigest,
            startedAt: now,
          },
        });
        return {
          taskId: candidate.id,
          ownerPrincipalId: candidate.ownerPrincipalId,
          requestId: candidate.requestId,
          kind: taskKindValue(candidate.kind),
          attemptNumber: candidate.attemptCount + 1,
          maxAttempts: candidate.maxAttempts,
          stateVersion: candidate.stateVersion + 1,
          leaseToken,
          leaseExpiresAt,
          deadlineAt: candidate.deadlineAt,
          runTraceId,
          inputArtifactVersions: candidate.inputArtifactVersions,
          inputDigest: candidate.inputDigest,
        } satisfies CreativeTaskLease;
      });
      if (claimed) {
        return claimed;
      }
    }
    return null;
  }

  async failLease(
    input: FailCreativeTaskLeaseInput,
  ): Promise<CreativeTaskFailureDisposition> {
    const now = this.currentTime();
    if (!Number.isSafeInteger(input.retryDelayMs) || input.retryDelayMs < 0) {
      throw new Error("retryDelayMs must be a non-negative integer");
    }
    const retryAt = new Date(now.getTime() + input.retryDelayMs);
    const timedOut = now.getTime() >= input.lease.deadlineAt.getTime();
    const staleInput = input.failureCode === "stale_input";
    const canRetry =
      !timedOut &&
      !staleInput &&
      input.retryable &&
      input.lease.attemptNumber < input.lease.maxAttempts &&
      retryAt.getTime() < input.lease.deadlineAt.getTime();
    const status = timedOut
      ? VnextCreativeTaskStatus.TIMED_OUT
      : canRetry
        ? VnextCreativeTaskStatus.RETRY_WAIT
        : VnextCreativeTaskStatus.FAILED;
    const traceStatus = timedOut
      ? VnextCreativeRunStatus.TIMED_OUT
      : staleInput
        ? VnextCreativeRunStatus.STALE_INPUT
        : VnextCreativeRunStatus.FAILED;
    return this.client.$transaction(async (transaction) => {
      const updated = await transaction.vnextCreativeTask.updateMany({
        where: timedOut
          ? {
              ...leaseIdentityWhere(input.lease),
              deadlineAt: { lte: now },
            }
          : exactLeaseWhere(input.lease, now),
        data: {
          status,
          lastFailureCode: timedOut ? "deadline_exceeded" : input.failureCode,
          ...(canRetry ? { availableAt: retryAt } : {}),
          completedAt: canRetry ? null : now,
          leaseOwner: null,
          leaseToken: null,
          leaseExpiresAt: null,
          stateVersion: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        return "fenced";
      }
      const trace = await transaction.vnextCreativeRunTrace.updateMany({
        where: {
          id: input.lease.runTraceId,
          taskId: input.lease.taskId,
          ownerPrincipalId: input.lease.ownerPrincipalId,
          attemptNumber: input.lease.attemptNumber,
          inputDigest: input.lease.inputDigest,
          status: VnextCreativeRunStatus.RUNNING,
        },
        data: {
          status: traceStatus,
          failureCode: timedOut ? "deadline_exceeded" : input.failureCode,
          retryable: input.retryable && !timedOut && !staleInput,
          completedAt: now,
        },
      });
      if (trace.count !== 1) {
        throw new Error("creative task running trace is missing");
      }
      if (!canRetry) {
        await rotateProjectionForTask(
          transaction,
          input.lease.ownerPrincipalId,
          input.lease.taskId,
        );
      }
      return timedOut ? "timed_out" : canRetry ? "retry_wait" : "failed";
    });
  }

  async cancel(ownerPrincipalId: string, taskId: string) {
    const now = this.currentTime();
    return this.client.$transaction(async (transaction) => {
      const updated = await transaction.vnextCreativeTask.updateMany({
        where: {
          id: taskId,
          ownerPrincipalId,
          status: {
            in: [
              VnextCreativeTaskStatus.QUEUED,
              VnextCreativeTaskStatus.RETRY_WAIT,
              VnextCreativeTaskStatus.LEASED,
            ],
          },
        },
        data: {
          status: VnextCreativeTaskStatus.CANCELLED,
          cancellationRequestedAt: now,
          completedAt: now,
          leaseOwner: null,
          leaseToken: null,
          leaseExpiresAt: null,
          stateVersion: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        return false;
      }
      await transaction.vnextCreativeRunTrace.updateMany({
        where: {
          taskId,
          ownerPrincipalId,
          status: VnextCreativeRunStatus.RUNNING,
        },
        data: {
          status: VnextCreativeRunStatus.CANCELLED,
          retryable: false,
          completedAt: now,
        },
      });
      await rotateProjectionForTask(transaction, ownerPrincipalId, taskId);
      return true;
    });
  }

  async load(lease: CreativeTaskLease): Promise<CreativeTaskRuntimeInput> {
    const now = this.currentTime();
    const [task, trace] = await Promise.all([
      this.client.vnextCreativeTask.findFirst({
        where: {
          ...exactLeaseWhere(lease, now),
          id: lease.taskId,
          ownerPrincipalId: lease.ownerPrincipalId,
        },
        include: {
          sourceMessage: { select: { experienceSessionId: true } },
          workspace: {
            select: {
              originSourceMessage: {
                select: { experienceSessionId: true },
              },
            },
          },
        },
      }),
      this.client.vnextCreativeRunTrace.findFirst({
        where: {
          id: lease.runTraceId,
          taskId: lease.taskId,
          ownerPrincipalId: lease.ownerPrincipalId,
          attemptNumber: lease.attemptNumber,
          status: VnextCreativeRunStatus.RUNNING,
        },
        select: { inputDigest: true },
      }),
    ]);
    const experienceSessionId =
      task?.kind === VnextCreativeTaskKind.UNDERSTAND
        ? task.sourceMessage?.experienceSessionId ?? null
        : task?.kind === VnextCreativeTaskKind.WRITE_OPENING
          ? task.workspace?.originSourceMessage.experienceSessionId ?? null
          : null;
    if (
      !task ||
      !trace ||
      task.inputDigest !== lease.inputDigest ||
      trace.inputDigest !== lease.inputDigest ||
      experienceSessionId === null ||
      !(await isTaskProcessingAuthorityCurrent(
        this.client,
        task,
        experienceSessionId,
        now,
      ))
    ) {
      throw new CreativeTaskInputStaleError();
    }
    const activeSessionWhere = currentActiveGuestSessionWhere({
      ownerPrincipalId: lease.ownerPrincipalId,
      experienceSessionId,
      now,
      policy: this.options.admissionPolicy,
    });
    if (activeSessionWhere === null) {
      throw new CreativeTaskInputStaleError();
    }
    if (
      (await this.client.vnextExperienceSession.findFirst({
        where: activeSessionWhere,
        select: { id: true },
      })) === null
    ) {
      throw new CreativeTaskInputStaleError();
    }
    const artifacts = parseArtifacts(
      task.inputArtifactVersions,
      lease.ownerPrincipalId,
    );
    if (taskKindValue(task.kind) !== artifacts.kind) {
      throw new CreativeTaskInputStaleError("task_input_kind_mismatch");
    }
    if (artifactDigest(artifacts) !== task.inputDigest) {
      throw new CreativeTaskInputStaleError();
    }
    if (artifacts.kind === "understand") {
      if (
        task.sourceMessageId !== artifacts.sourceMessage.id ||
        (artifacts.schemaVersion === 1
          ? task.workspaceId !== null ||
            task.understandingId !== null ||
            task.commissionId !== null
          : task.workspaceId !== artifacts.workspace.id ||
            task.understandingId !== artifacts.understanding.id ||
            task.commissionId !== artifacts.commission.id)
      ) {
        throw new CreativeTaskInputStaleError();
      }
      const [sourceMessage, boundariesMatch] = await Promise.all([
        this.client.vnextSourceMessage.findFirst({
          where: {
            id: artifacts.sourceMessage.id,
            ownerPrincipalId: lease.ownerPrincipalId,
            requestDigest: artifacts.sourceMessage.requestDigest,
          },
        }),
        currentBoundarySnapshotMatches(
          this.client,
          lease.ownerPrincipalId,
          artifacts,
        ),
      ]);
      if (
        !sourceMessage ||
        !sourceMessageDigestMatches(sourceMessage) ||
        !boundariesMatch
      ) {
        throw new CreativeTaskInputStaleError();
      }
      if (artifacts.schemaVersion === 2) {
        if (
          sourceMessage.action !== VnextSourceMessageAction.CORRECTION ||
          sourceMessage.basedOnUnderstandingId !== artifacts.understanding.id ||
          sourceMessage.basedOnVersion !== artifacts.understanding.version
        ) {
          throw new CreativeTaskInputStaleError();
        }
        const truthArtifacts: WriteOpeningTaskArtifacts = {
          schemaVersion: 1,
          kind: "write_opening",
          workspace: artifacts.workspace,
          understanding: artifacts.understanding,
          commission: artifacts.commission,
          hardBoundaries: artifacts.hardBoundaries,
        };
        const truth = await readCurrentOpeningTruth(
          this.client,
          lease.ownerPrincipalId,
          truthArtifacts,
        );
        const originSource = await this.client.vnextSourceMessage.findFirst({
          where: {
            id: truth.workspace.originSourceMessageId,
            ownerPrincipalId: lease.ownerPrincipalId,
            experienceSessionId,
          },
          select: { id: true },
        });
        if (originSource === null) {
          throw new CreativeTaskInputStaleError();
        }
        const previousUnderstanding = validateUnderstandingFields({
          clarificationQuestions: requiredStringList(
            truth.understanding.clarificationQuestions,
            "understanding_clarification_questions",
          ),
          confidence: truth.understanding.confidence,
          emotionalTarget: requiredString(
            truth.understanding.emotionalTarget,
            "understanding_emotional_target",
          ),
          relationshipTension: requiredString(
            truth.understanding.relationshipTension,
            "understanding_relationship_tension",
          ),
          storyDesire: requiredString(
            truth.understanding.storyDesire,
            "understanding_story_desire",
          ),
          userCorrection:
            truth.understanding.userCorrection === null
              ? null
              : requiredString(
                  truth.understanding.userCorrection,
                  "understanding_user_correction",
                ),
        });
        const previousCommission = validateCommissionFields({
          continuationIntent: requiredString(
            truth.commission.continuationIntent,
            "commission_continuation_intent",
          ),
          emotionalPromise: requiredString(
            truth.commission.emotionalPromise,
            "commission_emotional_promise",
          ),
          premise: requiredString(truth.commission.premise, "commission_premise"),
          relationshipCore: requiredString(
            truth.commission.relationshipCore,
            "commission_relationship_core",
          ),
          styleConstraints: requiredStringList(
            truth.commission.styleConstraints,
            "commission_style_constraints",
          ),
        });
        return {
          kind: "understand",
          safetyScope: {
            experienceSessionId,
            workspaceId: truth.workspace.id,
          },
          input: {
            requestId: lease.requestId,
            sourceMessageId: sourceMessage.id,
            sourceText: sourceMessage.body,
            hardBoundaries: rehydrateActiveHardBoundarySnapshot(
              artifacts.hardBoundaries,
            ),
            correctionContext: {
              previousUnderstanding: {
                storyDesire: previousUnderstanding.storyDesire,
                emotionalTarget: previousUnderstanding.emotionalTarget,
                relationshipTension: previousUnderstanding.relationshipTension,
                clarificationQuestion:
                  previousUnderstanding.clarificationQuestions[0] ?? null,
                confidence: previousUnderstanding.confidence,
              },
              previousCommission,
            },
          },
        };
      }
      if (
        sourceMessage.action !== VnextSourceMessageAction.COMMISSION ||
        sourceMessage.basedOnUnderstandingId !== null ||
        sourceMessage.basedOnVersion !== null
      ) {
        throw new CreativeTaskInputStaleError();
      }
      return {
        kind: "understand",
        safetyScope: {
          experienceSessionId,
          workspaceId: null,
        },
        input: {
          requestId: lease.requestId,
          sourceMessageId: sourceMessage.id,
          sourceText: sourceMessage.body,
          hardBoundaries: rehydrateActiveHardBoundarySnapshot(
            artifacts.hardBoundaries,
          ),
        },
      };
    }
    if (
      !openingTaskAndLeaseMatch(task, lease) ||
      task.workspaceId !== artifacts.workspace.id ||
      task.understandingId !== artifacts.understanding.id ||
      task.commissionId !== artifacts.commission.id
    ) {
      throw new CreativeTaskInputStaleError();
    }
    const truth = await readCurrentOpeningTruth(
      this.client,
      lease.ownerPrincipalId,
      artifacts,
    );
    return {
      kind: "write_opening",
      safetyScope: {
        experienceSessionId,
        workspaceId: truth.workspace.id,
      },
      input: {
        requestId: lease.requestId,
        storyId: truth.workspace.id,
        understandingId: truth.understanding.id,
        commissionId: truth.commission.id,
        premise: requiredString(truth.commission.premise, "commission_premise"),
        emotionalPromise: requiredString(
          truth.commission.emotionalPromise,
          "commission_emotional_promise",
        ),
        relationshipCore: requiredString(
          truth.commission.relationshipCore,
          "commission_relationship_core",
        ),
        styleConstraints: requiredStringList(
          truth.commission.styleConstraints,
          "commission_style_constraints",
        ),
        continuationIntent: requiredString(
          truth.commission.continuationIntent,
          "commission_continuation_intent",
        ),
        hardBoundaries: rehydrateActiveHardBoundarySnapshot(
          artifacts.hardBoundaries,
        ),
      },
    };
  }

  private async markStaleInput(
    transaction: Prisma.TransactionClient,
    input: Extract<CreativeTaskExecutionSuccess, { kind: "write_opening" }>,
    completedAt: Date,
    rotateProjection = true,
  ): Promise<CreativeTaskCompletionDisposition> {
    const updated = await transaction.vnextCreativeTask.updateMany({
      where: exactLeaseWhere(input.lease, completedAt),
      data: {
        status: VnextCreativeTaskStatus.FAILED,
        lastFailureCode: "stale_input",
        completedAt,
        leaseOwner: null,
        leaseToken: null,
        leaseExpiresAt: null,
        stateVersion: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      return "fenced";
    }
    const trace = await transaction.vnextCreativeRunTrace.updateMany({
      where: {
        id: input.lease.runTraceId,
        taskId: input.lease.taskId,
        ownerPrincipalId: input.lease.ownerPrincipalId,
        attemptNumber: input.lease.attemptNumber,
        status: VnextCreativeRunStatus.RUNNING,
      },
      data: {
        status: VnextCreativeRunStatus.STALE_INPUT,
        failureCode: "stale_input",
        retryable: false,
        completedAt,
      },
    });
    if (trace.count !== 1) {
      throw new Error("creative task running trace is missing");
    }
    if (rotateProjection) {
      await rotateProjectionForTask(
        transaction,
        input.lease.ownerPrincipalId,
        input.lease.taskId,
      );
    }
    return "stale_input";
  }

  private async markTimedOutCompletion(
    transaction: Prisma.TransactionClient,
    input: Extract<CreativeTaskExecutionSuccess, { kind: "write_opening" }>,
    completedAt: Date,
  ): Promise<CreativeTaskCompletionDisposition> {
    const updated = await transaction.vnextCreativeTask.updateMany({
      where: {
        ...leaseIdentityWhere(input.lease),
        deadlineAt: { lte: completedAt },
      },
      data: {
        status: VnextCreativeTaskStatus.TIMED_OUT,
        lastFailureCode: "deadline_exceeded",
        completedAt,
        leaseOwner: null,
        leaseToken: null,
        leaseExpiresAt: null,
        stateVersion: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      return "fenced";
    }
    const trace = await transaction.vnextCreativeRunTrace.updateMany({
      where: {
        id: input.lease.runTraceId,
        taskId: input.lease.taskId,
        ownerPrincipalId: input.lease.ownerPrincipalId,
        attemptNumber: input.lease.attemptNumber,
        status: VnextCreativeRunStatus.RUNNING,
      },
      data: {
        status: VnextCreativeRunStatus.TIMED_OUT,
        failureCode: "deadline_exceeded",
        retryable: false,
        completedAt,
      },
    });
    if (trace.count !== 1) {
      throw new Error("creative task running trace is missing");
    }
    await rotateProjectionForTask(
      transaction,
      input.lease.ownerPrincipalId,
      input.lease.taskId,
    );
    return "timed_out";
  }

  private markSerializationConflictStale(
    input: Extract<CreativeTaskExecutionSuccess, { kind: "write_opening" }>,
  ) {
    return this.client.$transaction((transaction) =>
      this.markStaleInput(transaction, input, this.currentTime()),
    );
  }

  async complete(
    input: CreativeTaskExecutionSuccess,
  ): Promise<CreativeTaskCompletionDisposition> {
    if (input.kind !== "write_opening") {
      throw new CreativeTaskCompletionNotConfiguredError(input.kind);
    }
    if (!openingSuccessIsValid(input)) {
      throw new CreativeRuntimeExecutionError("invalid_runtime_output", false);
    }
    for (let attempt = 1; attempt <= TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        const completedAt = this.currentTime();
        return await this.client.$transaction(
          async (transaction) => {
            const [task, runningTrace] = await Promise.all([
              transaction.vnextCreativeTask.findFirst({
                where: {
                  id: input.lease.taskId,
                  ownerPrincipalId: input.lease.ownerPrincipalId,
                },
                include: {
                  workspace: {
                    select: {
                      originSourceMessage: {
                        select: { experienceSessionId: true },
                      },
                    },
                  },
                },
              }),
              transaction.vnextCreativeRunTrace.findFirst({
                where: {
                  id: input.lease.runTraceId,
                  taskId: input.lease.taskId,
                  ownerPrincipalId: input.lease.ownerPrincipalId,
                  attemptNumber: input.lease.attemptNumber,
                  status: VnextCreativeRunStatus.RUNNING,
                },
                select: { inputDigest: true, runtimeMode: true },
              }),
            ]);
            if (
              !task ||
              task.status !== VnextCreativeTaskStatus.LEASED ||
              task.stateVersion !== input.lease.stateVersion ||
              task.leaseToken !== input.lease.leaseToken ||
              task.leaseExpiresAt === null
            ) {
              return "fenced";
            }
            if (task.deadlineAt.getTime() <= completedAt.getTime()) {
              return this.markTimedOutCompletion(transaction, input, completedAt);
            }
            if (task.leaseExpiresAt.getTime() <= completedAt.getTime()) {
              return "fenced";
            }
            const experienceSessionId =
              task.workspace?.originSourceMessage.experienceSessionId ?? null;
            if (
              !(await isTaskProcessingAuthorityCurrent(
                transaction,
                task,
                experienceSessionId,
                completedAt,
              ))
            ) {
              return this.markStaleInput(transaction, input, completedAt);
            }
            if (
              !openingTaskAndLeaseMatch(task, input.lease) ||
              runningTrace === null ||
              runningTrace.inputDigest !== input.lease.inputDigest ||
              runningTrace.runtimeMode !== runtimeModeEnum(input.runtimeMode)
            ) {
              return this.markStaleInput(transaction, input, completedAt);
            }
            const activeSessionWhere =
              experienceSessionId === null
                ? null
                : currentActiveGuestSessionWhere({
                    ownerPrincipalId: input.lease.ownerPrincipalId,
                    experienceSessionId,
                    now: completedAt,
                    policy: this.options.admissionPolicy,
                  });
            const activeSession =
              activeSessionWhere === null
                ? null
                : await transaction.vnextExperienceSession.findFirst({
                    where: activeSessionWhere,
                    select: { id: true, projectionVersionId: true },
                  });
            if (activeSessionWhere === null || activeSession === null) {
              return this.markStaleInput(
                transaction,
                input,
                completedAt,
                false,
              );
            }
            let artifacts: PersistedCreativeTaskArtifacts;
            try {
              artifacts = parseArtifacts(
                task.inputArtifactVersions,
                input.lease.ownerPrincipalId,
              );
            } catch (error) {
              if (error instanceof CreativeTaskInputStaleError) {
                return this.markStaleInput(transaction, input, completedAt);
              }
              throw error;
            }
            if (
              artifacts.kind !== "write_opening" ||
              artifactDigest(artifacts) !== task.inputDigest ||
              task.workspaceId !== artifacts.workspace.id ||
              task.understandingId !== artifacts.understanding.id ||
              task.commissionId !== artifacts.commission.id
            ) {
              return this.markStaleInput(transaction, input, completedAt);
            }
            try {
              await readCurrentOpeningTruth(
                transaction,
                input.lease.ownerPrincipalId,
                artifacts,
              );
            } catch (error) {
              if (error instanceof CreativeTaskInputStaleError) {
                return this.markStaleInput(transaction, input, completedAt);
              }
              throw error;
            }

            const fenced = await transaction.vnextCreativeTask.updateMany({
              where: {
                ...exactLeaseWhere(input.lease, completedAt),
                workspace: {
                  originSourceMessage: {
                    experienceSession: activeSessionWhere,
                  },
                },
              },
              data: {
                status: VnextCreativeTaskStatus.SUCCEEDED,
                completedAt,
                lastFailureCode: null,
                leaseOwner: null,
                leaseToken: null,
                leaseExpiresAt: null,
                stateVersion: { increment: 1 },
              },
            });
            if (fenced.count !== 1) {
              if (
                (await transaction.vnextExperienceSession.findFirst({
                  where: activeSessionWhere,
                  select: { id: true },
                })) === null
              ) {
                return this.markStaleInput(
                  transaction,
                  input,
                  completedAt,
                  false,
                );
              }
              return "fenced";
            }
            await this.options.afterWrite?.("after_task_fence");

            const providerStartedAt = Date.parse(input.result.trace.startedAt);
            const providerCompletedAt = Date.parse(input.result.trace.completedAt);
            const trace = await transaction.vnextCreativeRunTrace.updateMany({
              where: {
                id: input.lease.runTraceId,
                taskId: input.lease.taskId,
                ownerPrincipalId: input.lease.ownerPrincipalId,
                attemptNumber: input.lease.attemptNumber,
                inputDigest: input.lease.inputDigest,
                runtimeMode: runtimeModeEnum(input.runtimeMode),
                status: VnextCreativeRunStatus.RUNNING,
              },
              data: {
                status: VnextCreativeRunStatus.SUCCEEDED,
                providerTraceId: input.result.trace.traceId,
                provider: input.result.trace.provider,
                model: input.result.trace.model,
                route: input.route,
                workflowVersion: input.result.trace.workflowVersion,
                outputHash: input.result.trace.outputHash,
                fallbackApplied: false,
                retryable: false,
                failureCode: null,
                latencyMs: Math.max(0, providerCompletedAt - providerStartedAt),
                completedAt,
              },
            });
            if (trace.count !== 1) {
              throw new Error("creative task running trace is missing");
            }
            await this.options.afterWrite?.("after_trace");

            const latestContent = await transaction.vnextStoryContent.findFirst({
              where: {
                ownerPrincipalId: input.lease.ownerPrincipalId,
                workspaceId: artifacts.workspace.id,
              },
              select: { version: true },
              orderBy: { version: "desc" },
            });
            const contentId = randomUUID();
            const contentVersion = (latestContent?.version ?? 0) + 1;
            const content = await transaction.vnextStoryContent.create({
              data: {
                id: contentId,
                ownerPrincipalId: input.lease.ownerPrincipalId,
                workspaceId: artifacts.workspace.id,
                kind: VnextStoryContentKind.OPENING,
                status: VnextStoryContentStatus.DRAFT,
                version: contentVersion,
                body: input.result.output.body,
                bodyHash: input.result.trace.outputHash,
                createdByTaskId: input.lease.taskId,
                createdByTraceId: input.lease.runTraceId,
              },
            });
            await this.options.afterWrite?.("after_story_content");

            const payload = {
              bodyHash: content.bodyHash,
              contentId: content.id,
              contentVersion: content.version,
              taskId: input.lease.taskId,
              traceId: input.lease.runTraceId,
              workspaceId: artifacts.workspace.id,
            };
            await transaction.vnextOutboxEvent.create({
              data: {
                ownerPrincipalId: input.lease.ownerPrincipalId,
                taskId: input.lease.taskId,
                aggregateType: "story_content",
                aggregateId: content.id,
                aggregateVersion: content.version,
                eventType: "vnext.story_content.draft_ready",
                idempotencyKey: `creative-task:${input.lease.taskId}:draft-ready`,
                payload,
                payloadDigest: createHash("sha256")
                  .update(JSON.stringify(payload))
                  .digest("hex"),
                status: VnextOutboxEventStatus.PENDING,
                availableAt: completedAt,
              },
            });
            await rotateCurrentSessionProjection(
              transaction,
              activeSessionWhere,
              activeSession.projectionVersionId,
              randomUUID(),
            );
            await this.options.afterWrite?.("after_success_outbox");
            await this.options.afterWrite?.("before_commit");
            return "committed";
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (error instanceof CompletionSessionFenceLostError) {
          return this.client.$transaction(
            (transaction) =>
              this.markStaleInput(
                transaction,
                input,
                this.currentTime(),
                false,
              ),
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
          );
        }
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034"
        ) {
          return this.markSerializationConflictStale(input);
        }
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002" &&
          attempt < TRANSACTION_ATTEMPTS
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new Error("creative task completion retry budget exhausted");
  }

  async startHeartbeat(input: CreativeWorkerHeartbeatInput) {
    const now = this.currentTime();
    await this.client.vnextWorkerHeartbeat.upsert({
      where: { workerId: input.workerInstanceId },
      create: {
        workerId: input.workerInstanceId,
        kind: VnextWorkerKind.CREATIVE,
        status: VnextWorkerStatus.READY,
        runtimeMode: runtimeModeEnum(input.runtimeMode),
        buildId: input.buildId,
        processId: input.processId,
        supportedKinds: [...input.supportedKinds],
        metadata: {},
        startedAt: now,
        lastHeartbeatAt: now,
      },
      update: {
        kind: VnextWorkerKind.CREATIVE,
        status: VnextWorkerStatus.READY,
        runtimeMode: runtimeModeEnum(input.runtimeMode),
        buildId: input.buildId,
        processId: input.processId,
        supportedKinds: [...input.supportedKinds],
        metadata: {},
        startedAt: now,
        lastHeartbeatAt: now,
        lastClaimedAt: null,
        lastSucceededAt: null,
        lastFailedAt: null,
        stoppedAt: null,
        lastErrorCode: null,
      },
    });
  }

  async refreshHeartbeat(
    workerInstanceId: string,
    activity?: "claimed" | "succeeded" | "failed",
  ) {
    const now = this.currentTime();
    await this.client.vnextWorkerHeartbeat.updateMany({
      where: {
        workerId: workerInstanceId,
        status: {
          in: [VnextWorkerStatus.READY, VnextWorkerStatus.DRAINING],
        },
      },
      data: {
        lastHeartbeatAt: now,
        ...(activity === "claimed" ? { lastClaimedAt: now } : {}),
        ...(activity === "succeeded" ? { lastSucceededAt: now } : {}),
        ...(activity === "failed" ? { lastFailedAt: now } : {}),
      },
    });
  }

  async stopHeartbeat(workerInstanceId: string) {
    const now = this.currentTime();
    await this.client.vnextWorkerHeartbeat.updateMany({
      where: { workerId: workerInstanceId },
      data: {
        status: VnextWorkerStatus.STOPPED,
        lastHeartbeatAt: now,
        stoppedAt: now,
      },
    });
  }

  async markHeartbeatError(workerInstanceId: string, errorCode: string) {
    if (errorCode.trim().length === 0 || errorCode.length > 100) {
      throw new Error("worker heartbeat errorCode must be non-empty and at most 100 characters");
    }
    const now = this.currentTime();
    await this.client.vnextWorkerHeartbeat.updateMany({
      where: { workerId: workerInstanceId },
      data: {
        status: VnextWorkerStatus.ERROR,
        lastErrorCode: errorCode,
        lastHeartbeatAt: now,
      },
    });
  }

  async readWorkerReadiness(
    freshnessWindowMs: number,
    requiredKinds: NonEmptyCreativeTaskKindList,
  ): Promise<CreativeWorkerReadiness> {
    if (!Number.isSafeInteger(freshnessWindowMs) || freshnessWindowMs < 1) {
      throw new Error("freshnessWindowMs must be a positive integer");
    }
    if (requiredKinds.length === 0) {
      throw new Error("requiredKinds must contain at least one task kind");
    }
    const now = this.currentTime();
    const freshAfter = new Date(now.getTime() - freshnessWindowMs);
    const heartbeats = await this.client.vnextWorkerHeartbeat.findMany({
      where: {
        kind: VnextWorkerKind.CREATIVE,
        status: VnextWorkerStatus.READY,
        lastHeartbeatAt: { gte: freshAfter, lte: now },
      },
      orderBy: { lastHeartbeatAt: "desc" },
    });
    const heartbeat = heartbeats.find((candidate) => {
      const supportedKinds = Array.isArray(candidate.supportedKinds)
        ? candidate.supportedKinds
        : [];
      return requiredKinds.every((kind) => supportedKinds.includes(kind));
    });
    return heartbeat
      ? {
          ready: true,
          workerInstanceId: heartbeat.workerId,
          lastHeartbeatAt: heartbeat.lastHeartbeatAt,
          runtimeMode: runtimeModeValue(heartbeat.runtimeMode),
        }
      : {
          ready: false,
          workerInstanceId: null,
          lastHeartbeatAt: null,
          runtimeMode: null,
        };
  }
}
