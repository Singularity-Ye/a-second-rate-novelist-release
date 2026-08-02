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
  VnextReaderMemoryItemKind,
  VnextReaderMemoryItemStatus,
  VnextReaderMemoryScope,
  VnextSourceMessageAction,
  VnextStoryWorkspaceStatus,
  VnextUnderstandingStatus,
} from "@prisma/client";
import {
  createActiveHardBoundarySnapshot,
  rehydrateActiveHardBoundarySnapshot,
  type ActiveHardBoundarySnapshot,
  type CorrectionBoundaryAction,
  type CorrectionUnderstandingOutput,
  type InitialUnderstandingOutput,
  type UnderstandingOutput,
} from "../domain/creative-runtime.port.js";
import {
  CreativeRuntimeExecutionError,
  CreativeTaskInputStaleError,
  type CreativeTaskCompletionDisposition,
  type CreativeTaskLease,
  type UnderstandTaskArtifacts,
  type WriteOpeningTaskArtifacts,
} from "../domain/creative-task.js";
import {
  boundaryValueDigest,
  createSourceMessageRequestDigest,
  validateExplicitBoundaryEvidence,
  type ExplicitBoundaryEvidence,
} from "../domain/source-message.js";
import {
  createCommissionPayloadDigest,
  createStoryTruthCorrectionDigest,
  createStoryTruthPublicationDigest,
  validateCommissionFields,
  validateUnderstandingFields,
  type VnextHardBoundaryCorrectionAction,
  type VnextStoryTruthPublication,
} from "../domain/understanding-draft.js";
import type {
  UnderstandingCompletionInput,
  VnextUnderstandingCompletionProbe,
  VnextUnderstandingCompletionUow,
} from "../domain/understanding-completion.uow.js";
import type { VnextCurrentSessionAdmission } from "../domain/vnext-session.repository.js";
import {
  CompletionSessionFenceLostError,
  currentActiveGuestSessionWhere,
  rotateCurrentSessionProjection,
} from "./prisma-completion-session-fence.js";
import { readCurrentOpeningTruth } from "./prisma-creative-task.repository.js";
import { isTaskProcessingAuthorityCurrent } from "./prisma-processing-authority.js";

const TRANSACTION_ATTEMPTS = 3;
const OPENING_DEADLINE_MS = 180_000;
const MAX_BOUNDARY_CHANGES_PER_TRANSACTION = 100;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type InitialUnderstandingArtifacts = {
  readonly mode: "initial";
  readonly sourceMessage: UnderstandTaskArtifacts["sourceMessage"];
  readonly hardBoundaries: ActiveHardBoundarySnapshot;
  readonly canonicalDigest: string;
};

type CorrectionUnderstandingArtifacts = {
  readonly mode: "correction";
  readonly sourceMessage: UnderstandTaskArtifacts["sourceMessage"];
  readonly workspace: {
    readonly id: string;
    readonly aggregateVersion: number;
    readonly publicationDigest: string;
  };
  readonly understanding: {
    readonly id: string;
    readonly version: number;
    readonly payloadDigest: string;
  };
  readonly commission: {
    readonly id: string;
    readonly version: number;
    readonly payloadDigest: string;
  };
  readonly hardBoundaries: ActiveHardBoundarySnapshot;
  readonly canonicalDigest: string;
};

type UnderstandingArtifacts =
  | InitialUnderstandingArtifacts
  | CorrectionUnderstandingArtifacts;

type ActiveBoundaryProjection = {
  readonly id: string;
  readonly sourceMessageId: string;
  readonly status: "active";
  readonly value: string;
  readonly version: number;
};

type NormalizedCorrectionBoundaryAction = {
  readonly operation: "add" | "replace" | "revoke";
  readonly targetBoundaryId: string | null;
  readonly expectedTargetVersion: number | null;
  readonly evidence: ExplicitBoundaryEvidence;
};

type CorrectionProvenance = {
  readonly schemaVersion: 1;
  readonly sourceMessage: {
    readonly id: string;
    readonly requestDigest: string;
    readonly basedOnUnderstandingId: string;
  };
  readonly priorWorkspace: CorrectionUnderstandingArtifacts["workspace"];
  readonly priorUnderstanding: CorrectionUnderstandingArtifacts["understanding"];
  readonly priorCommission: CorrectionUnderstandingArtifacts["commission"];
  readonly boundaryActions: readonly NormalizedCorrectionBoundaryAction[];
};

function jsonInput(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function currentTime(clock: () => Date) {
  const now = clock();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("understanding completion clock returned an invalid date");
  }
  return new Date(now.getTime());
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

function nonEmptyString(value: unknown, maximum = Number.MAX_SAFE_INTEGER) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maximum
  );
}

function canonicalUnderstanding(
  output: UnderstandingOutput,
  mode: UnderstandingArtifacts["mode"],
) {
  const base = {
    storyDesire: output.storyDesire,
    emotionalTarget: output.emotionalTarget,
    relationshipTension: output.relationshipTension,
    clarificationQuestion: output.clarificationQuestion,
    confidence: output.confidence,
    commission: {
      premise: output.commission.premise,
      emotionalPromise: output.commission.emotionalPromise,
      relationshipCore: output.commission.relationshipCore,
      styleConstraints: [...output.commission.styleConstraints],
      continuationIntent: output.commission.continuationIntent,
    },
  };
  if (mode === "initial") {
    const initial = output as InitialUnderstandingOutput;
    return JSON.stringify({
      ...base,
      explicitHardBoundaries: initial.explicitHardBoundaries.map(
        (boundary) => ({
          value: boundary.value,
          evidenceStart: boundary.evidenceStart,
          evidenceEnd: boundary.evidenceEnd,
        }),
      ),
    });
  }
  const correction = output as CorrectionUnderstandingOutput;
  return JSON.stringify({
    ...base,
    boundaryActions: correction.boundaryActions.map((action) => ({
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

function validCorrectionBoundaryAction(value: unknown) {
  if (
    !exactDataRecord(value, [
      "operation",
      "targetBoundaryId",
      "expectedTargetVersion",
      "evidence",
    ])
  ) {
    return false;
  }
  const action = value as Record<string, unknown>;
  if (
    action.operation !== "add" &&
    action.operation !== "replace" &&
    action.operation !== "revoke"
  ) {
    return false;
  }
  const evidence = action.evidence as Record<string, unknown>;
  if (
    !exactDataRecord(evidence, ["value", "evidenceStart", "evidenceEnd"]) ||
    !nonEmptyString(evidence.value) ||
    !Number.isSafeInteger(evidence.evidenceStart) ||
    !Number.isSafeInteger(evidence.evidenceEnd) ||
    Number(evidence.evidenceStart) < 0 ||
    Number(evidence.evidenceEnd) <= Number(evidence.evidenceStart)
  ) {
    return false;
  }
  return action.operation === "add"
    ? action.targetBoundaryId === null && action.expectedTargetVersion === null
    : typeof action.targetBoundaryId === "string" &&
        UUID_PATTERN.test(action.targetBoundaryId) &&
        Number.isSafeInteger(action.expectedTargetVersion) &&
        Number(action.expectedTargetVersion) > 0;
}

function validateCompletionResult(
  input: UnderstandingCompletionInput,
  mode: UnderstandingArtifacts["mode"],
) {
  const result = input.result;
  const outputFields =
    mode === "initial"
      ? [
          "storyDesire",
          "emotionalTarget",
          "relationshipTension",
          "clarificationQuestion",
          "confidence",
          "commission",
          "explicitHardBoundaries",
        ]
      : [
          "storyDesire",
          "emotionalTarget",
          "relationshipTension",
          "clarificationQuestion",
          "confidence",
          "commission",
          "boundaryActions",
        ];
  if (
    !exactDataRecord(result, ["output", "trace", "fallbackApplied"]) ||
    result.fallbackApplied !== false ||
    !exactDataRecord(result.output, outputFields) ||
    !exactDataRecord(result.output.commission, [
      "premise",
      "emotionalPromise",
      "relationshipCore",
      "styleConstraints",
      "continuationIntent",
    ]) ||
    !nonEmptyString(result.output.storyDesire) ||
    !nonEmptyString(result.output.emotionalTarget) ||
    !nonEmptyString(result.output.relationshipTension) ||
    (result.output.clarificationQuestion !== null &&
      !nonEmptyString(result.output.clarificationQuestion)) ||
    typeof result.output.confidence !== "number" ||
    !Number.isFinite(result.output.confidence) ||
    result.output.confidence < 0 ||
    result.output.confidence > 1 ||
    !nonEmptyString(result.output.commission.premise) ||
    !nonEmptyString(result.output.commission.emotionalPromise) ||
    !nonEmptyString(result.output.commission.relationshipCore) ||
    !Array.isArray(result.output.commission.styleConstraints) ||
    result.output.commission.styleConstraints.length > 20 ||
    !result.output.commission.styleConstraints.every((item) =>
      nonEmptyString(item),
    ) ||
    !nonEmptyString(result.output.commission.continuationIntent) ||
    !exactDataRecord(result.trace, [
      "traceId",
      "provider",
      "model",
      "workflowVersion",
      "startedAt",
      "completedAt",
      "outputHash",
    ]) ||
    !nonEmptyString(result.trace.traceId, 200) ||
    !nonEmptyString(result.trace.provider, 100) ||
    !nonEmptyString(result.trace.model, 200) ||
    !nonEmptyString(result.trace.workflowVersion, 200) ||
    !nonEmptyString(input.route, 200) ||
    !HASH_PATTERN.test(result.trace.outputHash)
  ) {
    throw new CreativeRuntimeExecutionError("invalid_runtime_output", false);
  }
  if (mode === "initial") {
    const output = result.output as InitialUnderstandingOutput;
    if (
      !Array.isArray(output.explicitHardBoundaries) ||
      output.explicitHardBoundaries.length >
        MAX_BOUNDARY_CHANGES_PER_TRANSACTION ||
      !output.explicitHardBoundaries.every(
        (boundary) =>
          exactDataRecord(boundary, ["value", "evidenceStart", "evidenceEnd"]) &&
          nonEmptyString(boundary.value) &&
          Number.isSafeInteger(boundary.evidenceStart) &&
          Number.isSafeInteger(boundary.evidenceEnd) &&
          boundary.evidenceStart >= 0 &&
          boundary.evidenceEnd > boundary.evidenceStart,
      )
    ) {
      throw new CreativeRuntimeExecutionError("invalid_runtime_output", false);
    }
  } else {
    const output = result.output as CorrectionUnderstandingOutput;
    if (
      !Array.isArray(output.boundaryActions) ||
      output.boundaryActions.length > MAX_BOUNDARY_CHANGES_PER_TRANSACTION ||
      !output.boundaryActions.every(validCorrectionBoundaryAction)
    ) {
      throw new CreativeRuntimeExecutionError("invalid_runtime_output", false);
    }
  }
  const providerStartedAt = Date.parse(result.trace.startedAt);
  const providerCompletedAt = Date.parse(result.trace.completedAt);
  const outputHash = createHash("sha256")
    .update(canonicalUnderstanding(result.output, mode))
    .digest("hex");
  if (
    !Number.isFinite(providerStartedAt) ||
    !Number.isFinite(providerCompletedAt) ||
    new Date(providerStartedAt).toISOString() !== result.trace.startedAt ||
    new Date(providerCompletedAt).toISOString() !== result.trace.completedAt ||
    providerCompletedAt < providerStartedAt ||
    result.trace.outputHash !== outputHash
  ) {
    throw new CreativeRuntimeExecutionError("invalid_runtime_output", false);
  }
  return {
    commission: validateCommissionFields({
      continuationIntent: result.output.commission.continuationIntent,
      emotionalPromise: result.output.commission.emotionalPromise,
      premise: result.output.commission.premise,
      relationshipCore: result.output.commission.relationshipCore,
      styleConstraints: [...result.output.commission.styleConstraints],
    }),
    providerCompletedAt,
    providerStartedAt,
    understanding: validateUnderstandingFields({
      clarificationQuestions:
        result.output.clarificationQuestion === null
          ? []
          : [result.output.clarificationQuestion],
      confidence: result.output.confidence,
      emotionalTarget: result.output.emotionalTarget,
      relationshipTension: result.output.relationshipTension,
      storyDesire: result.output.storyDesire,
      userCorrection: null,
    }),
    output: result.output,
  };
}

function requiredRecord(value: unknown, field: string) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CreativeTaskInputStaleError(`${field}_invalid`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new CreativeTaskInputStaleError(`${field}_invalid`);
  }
  return value;
}

function requiredPositiveInteger(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new CreativeTaskInputStaleError(`${field}_invalid`);
  }
  return value;
}

function requiredDigest(value: unknown, field: string) {
  const result = requiredString(value, field);
  if (!HASH_PATTERN.test(result)) {
    throw new CreativeTaskInputStaleError(`${field}_invalid`);
  }
  return result;
}

function parseUnderstandingArtifacts(
  value: unknown,
  ownerPrincipalId: string,
): UnderstandingArtifacts {
  const record = requiredRecord(value, "input_artifacts");
  const isInitial =
    record.schemaVersion === 1 &&
    exactDataRecord(record, [
      "schemaVersion",
      "kind",
      "sourceMessage",
      "hardBoundaries",
    ]);
  const isCorrection =
    record.schemaVersion === 2 &&
    exactDataRecord(record, [
      "schemaVersion",
      "kind",
      "sourceMessage",
      "workspace",
      "understanding",
      "commission",
      "hardBoundaries",
    ]);
  if (
    (!isInitial && !isCorrection) ||
    record.kind !== "understand"
  ) {
    throw new CreativeTaskInputStaleError("input_schema_or_kind_invalid");
  }
  const source = requiredRecord(record.sourceMessage, "source_message");
  if (!exactDataRecord(source, ["id", "requestDigest"])) {
    throw new CreativeTaskInputStaleError("source_message_artifact_invalid");
  }
  const sourceMessageId = requiredString(source.id, "source_message_id");
  const requestDigest = requiredString(
    source.requestDigest,
    "source_message_digest",
  );
  if (!UUID_PATTERN.test(sourceMessageId) || !HASH_PATTERN.test(requestDigest)) {
    throw new CreativeTaskInputStaleError("source_message_artifact_invalid");
  }
  const rawBoundarySnapshot = requiredRecord(
    record.hardBoundaries,
    "hard_boundary_snapshot",
  );
  if (
    !exactDataRecord(rawBoundarySnapshot, [
      "snapshotId",
      "ownerPrincipalId",
      "version",
      "capturedAt",
      "items",
    ]) ||
    !Array.isArray(rawBoundarySnapshot.items) ||
    rawBoundarySnapshot.items.some(
      (item) =>
        !exactDataRecord(item, [
          "boundaryId",
          "value",
          "sourceRef",
          "status",
          "version",
        ]),
    )
  ) {
    throw new CreativeTaskInputStaleError("hard_boundary_snapshot_invalid");
  }
  let hardBoundaries: ActiveHardBoundarySnapshot;
  try {
    hardBoundaries = rehydrateActiveHardBoundarySnapshot(record.hardBoundaries);
  } catch {
    throw new CreativeTaskInputStaleError("hard_boundary_snapshot_invalid");
  }
  if (hardBoundaries.ownerPrincipalId !== ownerPrincipalId) {
    throw new CreativeTaskInputStaleError("input_owner_mismatch");
  }
  const plainBoundaries = {
    snapshotId: hardBoundaries.snapshotId,
    ownerPrincipalId: hardBoundaries.ownerPrincipalId,
    version: hardBoundaries.version,
    capturedAt: hardBoundaries.capturedAt,
    items: hardBoundaries.items.map((item) => ({ ...item })),
  };
  if (isInitial) {
    const canonicalArtifacts: UnderstandTaskArtifacts = {
      schemaVersion: 1,
      kind: "understand",
      sourceMessage: { id: sourceMessageId, requestDigest },
      hardBoundaries: plainBoundaries,
    };
    return {
      mode: "initial",
      sourceMessage: { id: sourceMessageId, requestDigest },
      hardBoundaries,
      canonicalDigest: digest(canonicalArtifacts),
    };
  }
  const workspace = requiredRecord(record.workspace, "workspace_artifact");
  const understanding = requiredRecord(
    record.understanding,
    "understanding_artifact",
  );
  const commission = requiredRecord(record.commission, "commission_artifact");
  if (
    !exactDataRecord(workspace, ["id", "aggregateVersion", "publicationDigest"]) ||
    !exactDataRecord(understanding, ["id", "version", "payloadDigest"]) ||
    !exactDataRecord(commission, ["id", "version", "payloadDigest"])
  ) {
    throw new CreativeTaskInputStaleError("correction_truth_artifact_invalid");
  }
  const parsedWorkspace = {
    id: requiredString(workspace.id, "workspace_id"),
    aggregateVersion: requiredPositiveInteger(
      workspace.aggregateVersion,
      "workspace_version",
    ),
    publicationDigest: requiredDigest(
      workspace.publicationDigest,
      "workspace_digest",
    ),
  };
  const parsedUnderstanding = {
    id: requiredString(understanding.id, "understanding_id"),
    version: requiredPositiveInteger(
      understanding.version,
      "understanding_version",
    ),
    payloadDigest: requiredDigest(
      understanding.payloadDigest,
      "understanding_digest",
    ),
  };
  const parsedCommission = {
    id: requiredString(commission.id, "commission_id"),
    version: requiredPositiveInteger(commission.version, "commission_version"),
    payloadDigest: requiredDigest(
      commission.payloadDigest,
      "commission_digest",
    ),
  };
  if (
    !UUID_PATTERN.test(parsedWorkspace.id) ||
    !UUID_PATTERN.test(parsedUnderstanding.id) ||
    !UUID_PATTERN.test(parsedCommission.id)
  ) {
    throw new CreativeTaskInputStaleError("correction_truth_artifact_invalid");
  }
  const canonicalArtifacts: UnderstandTaskArtifacts = {
    schemaVersion: 2,
    kind: "understand",
    sourceMessage: { id: sourceMessageId, requestDigest },
    workspace: parsedWorkspace,
    understanding: parsedUnderstanding,
    commission: parsedCommission,
    hardBoundaries: plainBoundaries,
  };
  return {
    mode: "correction",
    sourceMessage: { id: sourceMessageId, requestDigest },
    workspace: parsedWorkspace,
    understanding: parsedUnderstanding,
    commission: parsedCommission,
    hardBoundaries,
    canonicalDigest: digest(canonicalArtifacts),
  };
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

function runtimeModeEnum(mode: UnderstandingCompletionInput["runtimeMode"]) {
  return mode === "runtime_worker_synthetic"
    ? VnextCreativeRuntimeMode.SYNTHETIC
    : VnextCreativeRuntimeMode.CONFIGURED;
}

function validateEvidenceSet(
  sourceBody: string,
  evidenceItems: InitialUnderstandingOutput["explicitHardBoundaries"],
) {
  const seenRanges = new Set<string>();
  const seenValues = new Set<string>();
  const validatedEvidence = evidenceItems.map((evidence) => {
    const validated = validateExplicitBoundaryEvidence(sourceBody, evidence);
    const rangeKey = `${validated.evidenceStart}:${validated.evidenceEnd}`;
    const valueKey = boundaryValueDigest(validated.value);
    if (seenRanges.has(rangeKey) || seenValues.has(valueKey)) {
      throw new CreativeRuntimeExecutionError("invalid_runtime_output", false);
    }
    seenRanges.add(rangeKey);
    seenValues.add(valueKey);
    return validated;
  });
  for (let index = 1; index < validatedEvidence.length; index += 1) {
    const previous = validatedEvidence[index - 1]!;
    const current = validatedEvidence[index]!;
    if (
      previous.evidenceStart > current.evidenceStart ||
      (previous.evidenceStart === current.evidenceStart &&
        previous.evidenceEnd > current.evidenceEnd)
    ) {
      throw new CreativeRuntimeExecutionError("invalid_runtime_output", false);
    }
  }
  return validatedEvidence;
}

function validateCorrectionActions(
  sourceBody: string,
  outputActions: readonly CorrectionBoundaryAction[],
  snapshot: ActiveHardBoundarySnapshot,
) {
  const seenRanges = new Set<string>();
  const seenValues = new Set<string>();
  const seenTargets = new Set<string>();
  const snapshotItems = new Map(
    snapshot.items.map((item) => [item.boundaryId, item] as const),
  );
  const normalized: NormalizedCorrectionBoundaryAction[] = [];
  const domainActions: VnextHardBoundaryCorrectionAction[] = [];

  for (const action of outputActions) {
    const evidence = validateExplicitBoundaryEvidence(
      sourceBody,
      action.evidence,
    );
    const rangeKey = `${evidence.evidenceStart}:${evidence.evidenceEnd}`;
    const valueKey = boundaryValueDigest(evidence.value);
    if (seenRanges.has(rangeKey) || seenValues.has(valueKey)) {
      throw new CreativeRuntimeExecutionError("invalid_runtime_output", false);
    }
    seenRanges.add(rangeKey);
    seenValues.add(valueKey);

    if (action.operation === "add") {
      if (
        snapshot.items.some(
          (item) =>
            boundaryValueDigest(item.value) === boundaryValueDigest(evidence.value),
        )
      ) {
        throw new CreativeRuntimeExecutionError("invalid_runtime_output", false);
      }
      normalized.push({
        operation: "add",
        targetBoundaryId: null,
        expectedTargetVersion: null,
        evidence,
      });
      domainActions.push({ operation: "add", ...evidence });
      continue;
    }

    const targetBoundaryId = action.targetBoundaryId;
    const expectedTargetVersion = action.expectedTargetVersion;
    if (
      targetBoundaryId === null ||
      expectedTargetVersion === null ||
      seenTargets.has(targetBoundaryId)
    ) {
      throw new CreativeRuntimeExecutionError("invalid_runtime_output", false);
    }
    const snapshotItem = snapshotItems.get(targetBoundaryId);
    if (
      snapshotItem === undefined ||
      snapshotItem.version !== expectedTargetVersion
    ) {
      throw new CreativeRuntimeExecutionError("invalid_runtime_output", false);
    }
    seenTargets.add(targetBoundaryId);
    normalized.push({
      operation: action.operation,
      targetBoundaryId,
      expectedTargetVersion,
      evidence,
    });
    domainActions.push(
      action.operation === "revoke"
        ? {
            operation: "revoke",
            targetItemId: targetBoundaryId,
            expectedItemVersion: expectedTargetVersion,
            evidence,
          }
        : {
            operation: "replace",
            targetItemId: targetBoundaryId,
            expectedItemVersion: expectedTargetVersion,
            ...evidence,
          },
    );
  }
  return { normalized, domainActions };
}

async function currentBoundarySnapshotMatches(
  transaction: Prisma.TransactionClient,
  ownerPrincipalId: string,
  expected: ActiveHardBoundarySnapshot,
) {
  const [memory, items] = await Promise.all([
    transaction.vnextReaderMemory.findUnique({
      where: { ownerPrincipalId },
      select: { id: true, version: true },
    }),
    transaction.vnextReaderMemoryItem.findMany({
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
    return (
      expected.snapshotId === `empty:${ownerPrincipalId}` &&
      expected.version === 1 &&
      expected.items.length === 0 &&
      items.length === 0
    );
  }
  if (memory.id !== expected.snapshotId || memory.version !== expected.version) {
    return false;
  }
  const expectedItems = [...expected.items].sort((left, right) =>
    left.boundaryId.localeCompare(right.boundaryId),
  );
  return (
    items.length === expectedItems.length &&
    items.every((item, index) => {
      const expectedItem = expectedItems[index];
      return (
        expectedItem !== undefined &&
        item.id === expectedItem.boundaryId &&
        item.sourceMessageId === expectedItem.sourceRef &&
        item.value === expectedItem.value &&
        item.version === expectedItem.version
      );
    })
  );
}

async function ensureReaderMemory(
  transaction: Prisma.TransactionClient,
  ownerPrincipalId: string,
  changesMemory: boolean,
) {
  return transaction.vnextReaderMemory.upsert({
    where: { ownerPrincipalId },
    create: {
      ownerPrincipalId,
      scope: VnextReaderMemoryScope.PRINCIPAL,
      version: 1,
    },
    update: changesMemory ? { version: { increment: 1 } } : {},
  });
}

async function supersedeActiveBoundaryWithEvidence(
  transaction: Prisma.TransactionClient,
  memoryId: string,
  ownerPrincipalId: string,
  sourceMessageId: string,
  evidence: ExplicitBoundaryEvidence,
  now: Date,
) {
  const valueDigest = boundaryValueDigest(evidence.value);
  const existing = await transaction.vnextReaderMemoryItem.findFirst({
    where: {
      itemKind: VnextReaderMemoryItemKind.HARD_BOUNDARY,
      ownerPrincipalId,
      status: VnextReaderMemoryItemStatus.ACTIVE,
      supersededAt: null,
      valueDigest,
    },
  });
  if (existing) {
    const revoked = await transaction.vnextReaderMemoryItem.updateMany({
      where: {
        id: existing.id,
        ownerPrincipalId,
        status: VnextReaderMemoryItemStatus.ACTIVE,
        supersededAt: null,
        version: existing.version,
      },
      data: {
        status: VnextReaderMemoryItemStatus.REVOKED,
        supersededAt: now,
      },
    });
    if (revoked.count !== 1) {
      throw new CreativeTaskInputStaleError("hard_boundary_concurrent_change");
    }
  }
  return transaction.vnextReaderMemoryItem.create({
    data: {
      evidenceEnd: evidence.evidenceEnd,
      evidenceStart: evidence.evidenceStart,
      evidenceValue: evidence.value,
      itemKind: VnextReaderMemoryItemKind.HARD_BOUNDARY,
      ownerPrincipalId,
      readerMemoryId: memoryId,
      sourceMessageId,
      status: VnextReaderMemoryItemStatus.ACTIVE,
      supersedesItemId: existing?.id ?? null,
      value: evidence.value,
      valueDigest,
      version: existing ? existing.version + 1 : 1,
    },
  });
}

async function loadOwnedActiveBoundary(
  transaction: Prisma.TransactionClient,
  ownerPrincipalId: string,
  targetBoundaryId: string,
  expectedTargetVersion: number,
) {
  const target = await transaction.vnextReaderMemoryItem.findFirst({
    where: {
      id: targetBoundaryId,
      itemKind: VnextReaderMemoryItemKind.HARD_BOUNDARY,
      ownerPrincipalId,
      status: VnextReaderMemoryItemStatus.ACTIVE,
      supersededAt: null,
      version: expectedTargetVersion,
    },
  });
  if (target === null) {
    throw new CreativeTaskInputStaleError("hard_boundary_concurrent_change");
  }
  return target;
}

async function revokeBoundary(
  transaction: Prisma.TransactionClient,
  target: Awaited<ReturnType<typeof loadOwnedActiveBoundary>>,
  ownerPrincipalId: string,
  sourceMessageId: string,
  evidence: ExplicitBoundaryEvidence,
  now: Date,
) {
  const revoked = await transaction.vnextReaderMemoryItem.updateMany({
    where: {
      id: target.id,
      ownerPrincipalId,
      status: VnextReaderMemoryItemStatus.ACTIVE,
      supersededAt: null,
      version: target.version,
    },
    data: {
      status: VnextReaderMemoryItemStatus.REVOKED,
      supersededAt: now,
    },
  });
  if (revoked.count !== 1) {
    throw new CreativeTaskInputStaleError("hard_boundary_concurrent_change");
  }
  return transaction.vnextReaderMemoryItem.create({
    data: {
      evidenceEnd: evidence.evidenceEnd,
      evidenceStart: evidence.evidenceStart,
      evidenceValue: evidence.value,
      itemKind: VnextReaderMemoryItemKind.HARD_BOUNDARY,
      ownerPrincipalId,
      readerMemoryId: target.readerMemoryId,
      sourceMessageId,
      status: VnextReaderMemoryItemStatus.REVOKED,
      supersedesItemId: target.id,
      value: target.value,
      valueDigest: target.valueDigest,
      version: target.version + 1,
    },
  });
}

async function replaceBoundary(
  transaction: Prisma.TransactionClient,
  target: Awaited<ReturnType<typeof loadOwnedActiveBoundary>>,
  ownerPrincipalId: string,
  sourceMessageId: string,
  evidence: ExplicitBoundaryEvidence,
  now: Date,
) {
  const valueDigest = boundaryValueDigest(evidence.value);
  const duplicate = await transaction.vnextReaderMemoryItem.findFirst({
    where: {
      id: { not: target.id },
      itemKind: VnextReaderMemoryItemKind.HARD_BOUNDARY,
      ownerPrincipalId,
      status: VnextReaderMemoryItemStatus.ACTIVE,
      supersededAt: null,
      valueDigest,
    },
    select: { id: true },
  });
  if (duplicate !== null) {
    throw new CreativeRuntimeExecutionError("invalid_runtime_output", false);
  }
  const revoked = await transaction.vnextReaderMemoryItem.updateMany({
    where: {
      id: target.id,
      ownerPrincipalId,
      status: VnextReaderMemoryItemStatus.ACTIVE,
      supersededAt: null,
      version: target.version,
    },
    data: {
      status: VnextReaderMemoryItemStatus.REVOKED,
      supersededAt: now,
    },
  });
  if (revoked.count !== 1) {
    throw new CreativeTaskInputStaleError("hard_boundary_concurrent_change");
  }
  return transaction.vnextReaderMemoryItem.create({
    data: {
      evidenceEnd: evidence.evidenceEnd,
      evidenceStart: evidence.evidenceStart,
      evidenceValue: evidence.value,
      itemKind: VnextReaderMemoryItemKind.HARD_BOUNDARY,
      ownerPrincipalId,
      readerMemoryId: target.readerMemoryId,
      sourceMessageId,
      status: VnextReaderMemoryItemStatus.ACTIVE,
      supersedesItemId: target.id,
      value: evidence.value,
      valueDigest,
      version: target.version + 1,
    },
  });
}

async function readActiveBoundaries(
  transaction: Prisma.TransactionClient,
  ownerPrincipalId: string,
): Promise<ActiveBoundaryProjection[]> {
  const rows = await transaction.vnextReaderMemoryItem.findMany({
    where: {
      itemKind: VnextReaderMemoryItemKind.HARD_BOUNDARY,
      ownerPrincipalId,
      status: VnextReaderMemoryItemStatus.ACTIVE,
      supersededAt: null,
    },
    orderBy: [{ id: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    sourceMessageId: row.sourceMessageId,
    status: "active",
    value: row.value,
    version: row.version,
  }));
}

function boundaryJson(boundaries: readonly ActiveBoundaryProjection[]) {
  return boundaries.map((boundary) => ({ ...boundary }));
}

function publicationJson(
  publication: VnextStoryTruthPublication,
  correctionProvenance?: CorrectionProvenance,
) {
  return {
    activeHardBoundaries: publication.activeHardBoundaries.map((boundary) => ({
      ...boundary,
    })),
    commission: { ...publication.commission },
    understanding: { ...publication.understanding },
    workspace: { ...publication.workspace },
    ...(correctionProvenance === undefined
      ? {}
      : {
          correctionProvenance: {
            schemaVersion: correctionProvenance.schemaVersion,
            sourceMessage: { ...correctionProvenance.sourceMessage },
            priorWorkspace: { ...correctionProvenance.priorWorkspace },
            priorUnderstanding: {
              ...correctionProvenance.priorUnderstanding,
            },
            priorCommission: { ...correctionProvenance.priorCommission },
            boundaryActions: correctionProvenance.boundaryActions.map(
              (action) => ({
                operation: action.operation,
                targetBoundaryId: action.targetBoundaryId,
                expectedTargetVersion: action.expectedTargetVersion,
                evidence: { ...action.evidence },
              }),
            ),
          },
        }),
  } as Prisma.InputJsonObject;
}

function hardBoundarySnapshot(
  memory: { id: string; ownerPrincipalId: string; version: number },
  boundaries: readonly ActiveBoundaryProjection[],
  capturedAt: Date,
): WriteOpeningTaskArtifacts["hardBoundaries"] {
  const snapshot = createActiveHardBoundarySnapshot({
    snapshotId: memory.id,
    ownerPrincipalId: memory.ownerPrincipalId,
    version: memory.version,
    capturedAt: capturedAt.toISOString(),
    items: boundaries.map((boundary) => ({
      boundaryId: boundary.id,
      value: boundary.value,
      sourceRef: boundary.sourceMessageId,
      status: "active" as const,
      version: boundary.version,
    })),
  });
  return {
    snapshotId: snapshot.snapshotId,
    ownerPrincipalId: snapshot.ownerPrincipalId,
    version: snapshot.version,
    capturedAt: snapshot.capturedAt,
    items: snapshot.items.map((item) => ({ ...item })),
  };
}

async function rotateProjection(
  transaction: Prisma.TransactionClient,
  ownerPrincipalId: string,
  experienceSessionId: string,
) {
  const updated = await transaction.vnextExperienceSession.updateMany({
    where: { id: experienceSessionId, principalId: ownerPrincipalId },
    data: { projectionVersionId: randomUUID() },
  });
  if (updated.count !== 1) {
    throw new CreativeTaskInputStaleError("experience_session_missing");
  }
}

function taskAndLeaseMatch(
  task: {
    attemptCount: number;
    inputDigest: string;
    kind: VnextCreativeTaskKind;
    requestId: string;
    sourceMessageId: string | null;
  },
  lease: CreativeTaskLease,
) {
  return (
    lease.kind === "understand" &&
    task.kind === VnextCreativeTaskKind.UNDERSTAND &&
    task.sourceMessageId !== null &&
    task.requestId === lease.requestId &&
    task.attemptCount === lease.attemptNumber &&
    task.inputDigest === lease.inputDigest
  );
}

export class PrismaUnderstandingCompletionUow
  implements VnextUnderstandingCompletionUow
{
  constructor(
    private readonly client: PrismaClient,
    private readonly probe?: VnextUnderstandingCompletionProbe,
    private readonly clock: () => Date = () => new Date(),
    private readonly admissionPolicy?: VnextCurrentSessionAdmission,
  ) {}

  private async markStaleInput(
    transaction: Prisma.TransactionClient,
    input: UnderstandingCompletionInput,
    completedAt: Date,
    experienceSessionId: string | null,
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
    await this.probe?.afterWrite("after_task_fence");
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
        status: VnextCreativeRunStatus.STALE_INPUT,
        failureCode: "stale_input",
        retryable: false,
        completedAt,
      },
    });
    if (trace.count !== 1) {
      throw new Error("creative task running trace is missing");
    }
    await this.probe?.afterWrite("after_trace");
    if (experienceSessionId !== null) {
      await rotateProjection(
        transaction,
        input.lease.ownerPrincipalId,
        experienceSessionId,
      );
      await this.probe?.afterWrite("after_projection_version");
    }
    await this.probe?.afterWrite("before_commit");
    return "stale_input";
  }

  private async markTimedOutCompletion(
    transaction: Prisma.TransactionClient,
    input: UnderstandingCompletionInput,
    completedAt: Date,
    experienceSessionId: string | null,
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
    await this.probe?.afterWrite("after_task_fence");
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
        status: VnextCreativeRunStatus.TIMED_OUT,
        failureCode: "deadline_exceeded",
        retryable: false,
        completedAt,
      },
    });
    if (trace.count !== 1) {
      throw new Error("creative task running trace is missing");
    }
    await this.probe?.afterWrite("after_trace");
    if (experienceSessionId !== null) {
      await rotateProjection(
        transaction,
        input.lease.ownerPrincipalId,
        experienceSessionId,
      );
      await this.probe?.afterWrite("after_projection_version");
    }
    await this.probe?.afterWrite("before_commit");
    return "timed_out";
  }

  private markSerializationConflictStale(input: UnderstandingCompletionInput) {
    const completedAt = currentTime(this.clock);
    return this.client.$transaction(async (transaction) => {
      const task = await transaction.vnextCreativeTask.findFirst({
        where: {
          id: input.lease.taskId,
          ownerPrincipalId: input.lease.ownerPrincipalId,
        },
        select: {
          sourceMessage: { select: { experienceSessionId: true } },
        },
      });
      return this.markStaleInput(
        transaction,
        input,
        completedAt,
        task?.sourceMessage?.experienceSessionId ?? null,
      );
    });
  }

  async complete(
    input: UnderstandingCompletionInput,
  ): Promise<CreativeTaskCompletionDisposition> {
    for (let attempt = 1; attempt <= TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        const completedAt = currentTime(this.clock);
        return await this.client.$transaction(
          async (transaction) => {
            const task = await transaction.vnextCreativeTask.findFirst({
              where: {
                id: input.lease.taskId,
                ownerPrincipalId: input.lease.ownerPrincipalId,
              },
              include: { sourceMessage: true },
            });
            if (
              !task ||
              task.status !== VnextCreativeTaskStatus.LEASED ||
              task.stateVersion !== input.lease.stateVersion ||
              task.leaseToken !== input.lease.leaseToken ||
              task.leaseExpiresAt === null
            ) {
              return "fenced";
            }
            const experienceSessionId =
              task.sourceMessage?.experienceSessionId ?? null;
            if (task.deadlineAt.getTime() <= completedAt.getTime()) {
              return this.markTimedOutCompletion(
                transaction,
                input,
                completedAt,
                experienceSessionId,
              );
            }
            if (task.leaseExpiresAt.getTime() <= completedAt.getTime()) {
              return "fenced";
            }
            if (
              !(await isTaskProcessingAuthorityCurrent(
                transaction,
                task,
                experienceSessionId,
                completedAt,
              ))
            ) {
              return this.markStaleInput(
                transaction,
                input,
                completedAt,
                experienceSessionId,
              );
            }
            if (!taskAndLeaseMatch(task, input.lease)) {
              return this.markStaleInput(
                transaction,
                input,
                completedAt,
                experienceSessionId,
              );
            }

            const activeSessionWhere =
              experienceSessionId === null
                ? null
                : currentActiveGuestSessionWhere({
                    ownerPrincipalId: input.lease.ownerPrincipalId,
                    experienceSessionId,
                    now: completedAt,
                    policy: this.admissionPolicy,
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
                null,
              );
            }

            let artifacts: UnderstandingArtifacts;
            try {
              artifacts = parseUnderstandingArtifacts(
                task.inputArtifactVersions,
                input.lease.ownerPrincipalId,
              );
            } catch (error) {
              if (error instanceof CreativeTaskInputStaleError) {
                return this.markStaleInput(
                  transaction,
                  input,
                  completedAt,
                  experienceSessionId,
                );
              }
              throw error;
            }
            if (task.inputDigest !== artifacts.canonicalDigest) {
              return this.markStaleInput(
                transaction,
                input,
                completedAt,
                experienceSessionId,
              );
            }
            const validated = validateCompletionResult(input, artifacts.mode);
            const source = task.sourceMessage;
            if (!source || source.id !== artifacts.sourceMessage.id ||
              source.ownerPrincipalId !== input.lease.ownerPrincipalId ||
              source.requestDigest !== artifacts.sourceMessage.requestDigest) {
              return this.markStaleInput(
                transaction,
                input,
                completedAt,
                experienceSessionId,
              );
            }
            const sourceAction =
              artifacts.mode === "initial" ? "commission" : "correction";
            if (
              source.action !==
                (artifacts.mode === "initial"
                  ? VnextSourceMessageAction.COMMISSION
                  : VnextSourceMessageAction.CORRECTION) ||
              source.requestDigest !==
                createSourceMessageRequestDigest({
                  action: sourceAction,
                  basedOnUnderstandingId: source.basedOnUnderstandingId,
                  basedOnVersion: source.basedOnVersion,
                  body: source.body,
                  clientRequestId: source.clientRequestId,
                  experienceSessionId: source.experienceSessionId,
                  ownerPrincipalId: source.ownerPrincipalId,
                }) ||
              (artifacts.mode === "initial"
                ? source.basedOnUnderstandingId !== null ||
                  source.basedOnVersion !== null ||
                  task.workspaceId !== null ||
                  task.understandingId !== null ||
                  task.commissionId !== null
                : source.basedOnUnderstandingId !== artifacts.understanding.id ||
                  source.basedOnVersion !== artifacts.understanding.version ||
                  task.workspaceId !== artifacts.workspace.id ||
                  task.understandingId !== artifacts.understanding.id ||
                  task.commissionId !== artifacts.commission.id)
            ) {
              return this.markStaleInput(
                transaction,
                input,
                completedAt,
                experienceSessionId,
              );
            }
            if (
              !(await currentBoundarySnapshotMatches(
                transaction,
                input.lease.ownerPrincipalId,
                artifacts.hardBoundaries,
              ))
            ) {
              return this.markStaleInput(
                transaction,
                input,
                completedAt,
                experienceSessionId,
              );
            }

            const correctionBasis =
              artifacts.mode === "correction"
                ? await readCurrentOpeningTruth(
                    transaction,
                    input.lease.ownerPrincipalId,
                    {
                      schemaVersion: 1,
                      kind: "write_opening",
                      workspace: artifacts.workspace,
                      understanding: artifacts.understanding,
                      commission: artifacts.commission,
                      hardBoundaries: artifacts.hardBoundaries,
                    },
                  )
                : null;
            const correctionOrigin =
              correctionBasis === null
                ? null
                : await transaction.vnextSourceMessage.findFirst({
                    where: {
                      id: correctionBasis.workspace.originSourceMessageId,
                      ownerPrincipalId: input.lease.ownerPrincipalId,
                      experienceSessionId: experienceSessionId!,
                      action: VnextSourceMessageAction.COMMISSION,
                    },
                    select: { id: true },
                  });
            if (
              artifacts.mode === "correction" &&
              (correctionBasis === null ||
                correctionOrigin === null ||
                correctionBasis.understanding.payloadDigest !==
                  artifacts.understanding.payloadDigest ||
                correctionBasis.workspace.id !== artifacts.workspace.id ||
                correctionBasis.workspace.aggregateVersion !==
                  artifacts.workspace.aggregateVersion ||
                correctionBasis.workspace.publicationDigest !==
                  artifacts.workspace.publicationDigest ||
                (correctionBasis.workspace.status !==
                  VnextStoryWorkspaceStatus.FORMING &&
                  correctionBasis.workspace.status !==
                    VnextStoryWorkspaceStatus.ACTIVE) ||
                correctionBasis.commission.id !== artifacts.commission.id ||
                correctionBasis.commission.version !==
                  artifacts.commission.version ||
                correctionBasis.commission.payloadDigest !==
                  artifacts.commission.payloadDigest ||
                (correctionBasis.commission.status !==
                  VnextCommissionStatus.DRAFT &&
                  correctionBasis.commission.status !==
                    VnextCommissionStatus.ACTIVE) ||
                correctionBasis.understanding.version !==
                  correctionBasis.workspace.aggregateVersion ||
                correctionBasis.commission.version !==
                  correctionBasis.workspace.aggregateVersion)
            ) {
              return this.markStaleInput(
                transaction,
                input,
                completedAt,
                experienceSessionId,
              );
            }

            let evidence: ExplicitBoundaryEvidence[] = [];
            let correctionActions:
              | ReturnType<typeof validateCorrectionActions>
              | undefined;
            try {
              if (artifacts.mode === "initial") {
                evidence = validateEvidenceSet(
                  source.body,
                  (validated.output as InitialUnderstandingOutput)
                    .explicitHardBoundaries,
                );
              } else {
                correctionActions = validateCorrectionActions(
                  source.body,
                  (validated.output as CorrectionUnderstandingOutput)
                    .boundaryActions,
                  artifacts.hardBoundaries,
                );
              }
            } catch (error) {
              if (error instanceof CreativeRuntimeExecutionError) {
                throw error;
              }
              throw new CreativeRuntimeExecutionError(
                "invalid_runtime_output",
                false,
              );
            }
            const correctedUnderstanding =
              artifacts.mode === "correction"
                ? validateUnderstandingFields({
                    ...validated.understanding,
                    userCorrection: source.body,
                  })
                : validated.understanding;
            const publicationDigest =
              artifacts.mode === "initial"
                ? createStoryTruthPublicationDigest({
                    commission: validated.commission,
                    explicitHardBoundaries: evidence,
                    ownerPrincipalId: input.lease.ownerPrincipalId,
                    sourceMessageId: source.id,
                    understanding: validated.understanding,
                  })
                : createStoryTruthCorrectionDigest({
                    boundaryActions: correctionActions!.domainActions,
                    commission: validated.commission,
                    correctionSourceMessageId: source.id,
                    expectedAggregateVersion:
                      artifacts.workspace.aggregateVersion,
                    ownerPrincipalId: input.lease.ownerPrincipalId,
                    understanding: correctedUnderstanding,
                    workspaceId: artifacts.workspace.id,
                  });

            const fenced = await transaction.vnextCreativeTask.updateMany({
              where: {
                ...exactLeaseWhere(input.lease, completedAt),
                sourceMessage: {
                  experienceSession: activeSessionWhere,
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
                  null,
                );
              }
              return "fenced";
            }
            await this.probe?.afterWrite("after_task_fence");

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
                latencyMs: Math.max(
                  0,
                  validated.providerCompletedAt - validated.providerStartedAt,
                ),
                completedAt,
              },
            });
            if (trace.count !== 1) {
              throw new Error("creative task running trace is missing");
            }
            await this.probe?.afterWrite("after_trace");

            if (artifacts.mode === "correction") {
              const basis = correctionBasis!;
              const actions = correctionActions!;
              const workspaceCas = await transaction.vnextStoryWorkspace.updateMany({
                where: {
                  id: artifacts.workspace.id,
                  ownerPrincipalId: input.lease.ownerPrincipalId,
                  aggregateVersion: artifacts.workspace.aggregateVersion,
                  publicationDigest: artifacts.workspace.publicationDigest,
                  status: {
                    in: [
                      VnextStoryWorkspaceStatus.FORMING,
                      VnextStoryWorkspaceStatus.ACTIVE,
                    ],
                  },
                },
                data: {
                  aggregateVersion: { increment: 1 },
                  publicationDigest,
                },
              });
              if (workspaceCas.count !== 1) {
                throw new CreativeTaskInputStaleError(
                  "story_truth_concurrent_change",
                );
              }
              await this.probe?.afterWrite("after_workspace_cas");

              const memory = await ensureReaderMemory(
                transaction,
                input.lease.ownerPrincipalId,
                actions.normalized.length > 0,
              );
              for (const action of actions.normalized) {
                if (action.operation === "add") {
                  await supersedeActiveBoundaryWithEvidence(
                    transaction,
                    memory.id,
                    input.lease.ownerPrincipalId,
                    source.id,
                    action.evidence,
                    completedAt,
                  );
                  await this.probe?.afterWrite("after_boundary_add");
                  continue;
                }
                const target = await loadOwnedActiveBoundary(
                  transaction,
                  input.lease.ownerPrincipalId,
                  action.targetBoundaryId!,
                  action.expectedTargetVersion!,
                );
                if (action.operation === "revoke") {
                  await revokeBoundary(
                    transaction,
                    target,
                    input.lease.ownerPrincipalId,
                    source.id,
                    action.evidence,
                    completedAt,
                  );
                  await this.probe?.afterWrite("after_boundary_revoke");
                } else {
                  await replaceBoundary(
                    transaction,
                    target,
                    input.lease.ownerPrincipalId,
                    source.id,
                    action.evidence,
                    completedAt,
                  );
                  await this.probe?.afterWrite("after_boundary_revoke");
                  await this.probe?.afterWrite("after_boundary_add");
                }
              }
              const activeBoundaries = await readActiveBoundaries(
                transaction,
                input.lease.ownerPrincipalId,
              );
              await this.probe?.afterWrite("after_reader_memory");

              const expired = await transaction.vnextUnderstandingDraft.updateMany({
                where: {
                  id: artifacts.understanding.id,
                  ownerPrincipalId: input.lease.ownerPrincipalId,
                  workspaceId: artifacts.workspace.id,
                  version: artifacts.understanding.version,
                  payloadDigest: artifacts.understanding.payloadDigest,
                  status: {
                    in: [
                      VnextUnderstandingStatus.PROPOSED,
                      VnextUnderstandingStatus.CORRECTED,
                      VnextUnderstandingStatus.CONFIRMED,
                    ],
                  },
                },
                data: { status: VnextUnderstandingStatus.EXPIRED },
              });
              const superseded = await transaction.vnextCommissionBrief.updateMany({
                where: {
                  id: artifacts.commission.id,
                  ownerPrincipalId: input.lease.ownerPrincipalId,
                  workspaceId: artifacts.workspace.id,
                  version: artifacts.commission.version,
                  payloadDigest: artifacts.commission.payloadDigest,
                  status: {
                    in: [
                      VnextCommissionStatus.DRAFT,
                      VnextCommissionStatus.ACTIVE,
                    ],
                  },
                },
                data: { status: VnextCommissionStatus.SUPERSEDED },
              });
              if (expired.count !== 1 || superseded.count !== 1) {
                throw new CreativeTaskInputStaleError(
                  "story_truth_concurrent_change",
                );
              }

              const nextVersion = artifacts.workspace.aggregateVersion + 1;
              const understandingId = randomUUID();
              const commissionId = randomUUID();
              const publication: VnextStoryTruthPublication = {
                activeHardBoundaries: activeBoundaries,
                commission: {
                  id: commissionId,
                  status: "draft",
                  version: nextVersion,
                },
                understanding: {
                  id: understandingId,
                  status: "corrected",
                  version: nextVersion,
                },
                workspace: {
                  aggregateVersion: nextVersion,
                  id: artifacts.workspace.id,
                  status:
                    basis.workspace.status === VnextStoryWorkspaceStatus.ACTIVE
                      ? "active"
                      : "forming",
                },
              };
              const provenance: CorrectionProvenance = {
                schemaVersion: 1,
                sourceMessage: {
                  id: source.id,
                  requestDigest: source.requestDigest,
                  basedOnUnderstandingId: artifacts.understanding.id,
                },
                priorWorkspace: { ...artifacts.workspace },
                priorUnderstanding: { ...artifacts.understanding },
                priorCommission: { ...artifacts.commission },
                boundaryActions: actions.normalized.map((action) => ({
                  operation: action.operation,
                  targetBoundaryId: action.targetBoundaryId,
                  expectedTargetVersion: action.expectedTargetVersion,
                  evidence: { ...action.evidence },
                })),
              };
              const understanding =
                await transaction.vnextUnderstandingDraft.create({
                  data: {
                    clarificationQuestions: [
                      ...correctedUnderstanding.clarificationQuestions,
                    ],
                    confidence: correctedUnderstanding.confidence,
                    emotionalTarget: correctedUnderstanding.emotionalTarget,
                    hardBoundaries: jsonInput(boundaryJson(activeBoundaries)),
                    id: understandingId,
                    ownerPrincipalId: input.lease.ownerPrincipalId,
                    payloadDigest: publicationDigest,
                    publicationSnapshot: publicationJson(publication, provenance),
                    relationshipTension:
                      correctedUnderstanding.relationshipTension,
                    sourceMessageId: source.id,
                    status: VnextUnderstandingStatus.CORRECTED,
                    storyDesire: correctedUnderstanding.storyDesire,
                    supersedesUnderstandingId: artifacts.understanding.id,
                    userCorrection: source.body,
                    version: nextVersion,
                    workspaceId: artifacts.workspace.id,
                  },
                });
              await this.probe?.afterWrite("after_understanding");

              const commission = await transaction.vnextCommissionBrief.create({
                data: {
                  continuationIntent: validated.commission.continuationIntent,
                  emotionalPromise: validated.commission.emotionalPromise,
                  hardBoundaries: jsonInput(boundaryJson(activeBoundaries)),
                  id: commissionId,
                  ownerPrincipalId: input.lease.ownerPrincipalId,
                  payloadDigest: createCommissionPayloadDigest(
                    validated.commission,
                    activeBoundaries,
                  ),
                  premise: validated.commission.premise,
                  relationshipCore: validated.commission.relationshipCore,
                  sourceUnderstandingId: understanding.id,
                  status: VnextCommissionStatus.DRAFT,
                  styleConstraints: [...validated.commission.styleConstraints],
                  supersedesCommissionId: artifacts.commission.id,
                  version: nextVersion,
                  workspaceId: artifacts.workspace.id,
                },
              });
              await this.probe?.afterWrite("after_commission");

              let openingTaskId: string | null = null;
              if (correctedUnderstanding.clarificationQuestions.length === 0) {
                const openingArtifacts: WriteOpeningTaskArtifacts = {
                  schemaVersion: 1,
                  kind: "write_opening",
                  workspace: {
                    id: artifacts.workspace.id,
                    aggregateVersion: nextVersion,
                    publicationDigest,
                  },
                  understanding: {
                    id: understanding.id,
                    version: understanding.version,
                    payloadDigest: understanding.payloadDigest,
                  },
                  commission: {
                    id: commission.id,
                    version: commission.version,
                    payloadDigest: commission.payloadDigest,
                  },
                  hardBoundaries: hardBoundarySnapshot(
                    memory,
                    activeBoundaries,
                    completedAt,
                  ),
                };
                const openingKey =
                  `creative-task:${input.lease.taskId}:write-opening`;
                const openingTask = await transaction.vnextCreativeTask.create({
                  data: {
                    ownerPrincipalId: input.lease.ownerPrincipalId,
                    sourceMessageId: null,
                    workspaceId: artifacts.workspace.id,
                    understandingId: understanding.id,
                    commissionId: commission.id,
                    processingPurpose: task.processingPurpose,
                    processingBasisRecordId: task.processingBasisRecordId,
                    consentRecordId: task.consentRecordId,
                    processingCoverageKey: task.processingCoverageKey,
                    processingEvidenceRef: task.processingEvidenceRef,
                    requestId: openingKey,
                    idempotencyKey: openingKey,
                    kind: VnextCreativeTaskKind.WRITE_OPENING,
                    inputArtifactVersions: jsonInput(openingArtifacts),
                    inputDigest: digest(openingArtifacts),
                    availableAt: completedAt,
                    deadlineAt: new Date(
                      completedAt.getTime() + OPENING_DEADLINE_MS,
                    ),
                    maxAttempts: 3,
                  },
                });
                openingTaskId = openingTask.id;
                await this.probe?.afterWrite("after_opening_task");
              }

              const eventType =
                openingTaskId === null
                  ? "vnext.understanding.correction_needs_clarification"
                  : "vnext.understanding.correction_opening_queued";
              const outboxPayload = {
                commissionId: commission.id,
                openingTaskId,
                sourceMessageId: source.id,
                supersededCommissionId: artifacts.commission.id,
                supersededUnderstandingId: artifacts.understanding.id,
                taskId: input.lease.taskId,
                traceId: input.lease.runTraceId,
                understandingId: understanding.id,
                workspaceId: artifacts.workspace.id,
              };
              await transaction.vnextOutboxEvent.create({
                data: {
                  ownerPrincipalId: input.lease.ownerPrincipalId,
                  taskId: openingTaskId ?? input.lease.taskId,
                  aggregateType: "understanding",
                  aggregateId: understanding.id,
                  aggregateVersion: understanding.version,
                  eventType,
                  idempotencyKey:
                    `creative-task:${input.lease.taskId}:understanding-completed`,
                  payload: jsonInput(outboxPayload),
                  payloadDigest: digest(outboxPayload),
                  status: VnextOutboxEventStatus.PENDING,
                  availableAt: completedAt,
                },
              });
              await this.probe?.afterWrite("after_outbox");

              await rotateCurrentSessionProjection(
                transaction,
                activeSessionWhere,
                activeSession.projectionVersionId,
                randomUUID(),
              );
              await this.probe?.afterWrite("after_projection_version");
              await this.probe?.afterWrite("before_commit");
              return "committed";
            }

            const memory = await ensureReaderMemory(
              transaction,
              input.lease.ownerPrincipalId,
              evidence.length > 0,
            );
            for (const boundary of evidence) {
              await supersedeActiveBoundaryWithEvidence(
                transaction,
                memory.id,
                input.lease.ownerPrincipalId,
                source.id,
                boundary,
                completedAt,
              );
            }
            const activeBoundaries = await readActiveBoundaries(
              transaction,
              input.lease.ownerPrincipalId,
            );
            await this.probe?.afterWrite("after_reader_memory");

            const workspace = await transaction.vnextStoryWorkspace.create({
              data: {
                aggregateVersion: 1,
                originSourceMessageId: source.id,
                ownerPrincipalId: input.lease.ownerPrincipalId,
                publicationDigest,
                status: VnextStoryWorkspaceStatus.FORMING,
              },
            });
            await this.probe?.afterWrite("after_workspace");

            const understandingId = randomUUID();
            const commissionId = randomUUID();
            const publication: VnextStoryTruthPublication = {
              activeHardBoundaries: activeBoundaries,
              commission: { id: commissionId, status: "draft", version: 1 },
              understanding: {
                id: understandingId,
                status: "proposed",
                version: 1,
              },
              workspace: {
                aggregateVersion: workspace.aggregateVersion,
                id: workspace.id,
                status: "forming",
              },
            };
            const understanding =
              await transaction.vnextUnderstandingDraft.create({
                data: {
                  clarificationQuestions: [
                    ...validated.understanding.clarificationQuestions,
                  ],
                  confidence: validated.understanding.confidence,
                  emotionalTarget: validated.understanding.emotionalTarget,
                  hardBoundaries: jsonInput(boundaryJson(activeBoundaries)),
                  id: understandingId,
                  ownerPrincipalId: input.lease.ownerPrincipalId,
                  payloadDigest: publicationDigest,
                  publicationSnapshot: publicationJson(publication),
                  relationshipTension:
                    validated.understanding.relationshipTension,
                  sourceMessageId: source.id,
                  status: VnextUnderstandingStatus.PROPOSED,
                  storyDesire: validated.understanding.storyDesire,
                  userCorrection: null,
                  version: 1,
                  workspaceId: workspace.id,
                },
              });
            await this.probe?.afterWrite("after_understanding");

            const commission = await transaction.vnextCommissionBrief.create({
              data: {
                continuationIntent: validated.commission.continuationIntent,
                emotionalPromise: validated.commission.emotionalPromise,
                hardBoundaries: jsonInput(boundaryJson(activeBoundaries)),
                id: commissionId,
                ownerPrincipalId: input.lease.ownerPrincipalId,
                payloadDigest: createCommissionPayloadDigest(
                  validated.commission,
                  activeBoundaries,
                ),
                premise: validated.commission.premise,
                relationshipCore: validated.commission.relationshipCore,
                sourceUnderstandingId: understanding.id,
                status: VnextCommissionStatus.DRAFT,
                styleConstraints: [...validated.commission.styleConstraints],
                version: 1,
                workspaceId: workspace.id,
              },
            });
            await this.probe?.afterWrite("after_commission");

            const openingSnapshot = hardBoundarySnapshot(
              memory,
              activeBoundaries,
              completedAt,
            );
            let openingTaskId: string | null = null;
            if (validated.understanding.clarificationQuestions.length === 0) {
              const openingArtifacts: WriteOpeningTaskArtifacts = {
                schemaVersion: 1,
                kind: "write_opening",
                workspace: {
                  id: workspace.id,
                  aggregateVersion: workspace.aggregateVersion,
                  publicationDigest: workspace.publicationDigest,
                },
                understanding: {
                  id: understanding.id,
                  version: understanding.version,
                  payloadDigest: understanding.payloadDigest,
                },
                commission: {
                  id: commission.id,
                  version: commission.version,
                  payloadDigest: commission.payloadDigest,
                },
                hardBoundaries: openingSnapshot,
              };
              const openingKey = `creative-task:${input.lease.taskId}:write-opening`;
              const openingTask = await transaction.vnextCreativeTask.create({
                data: {
                  ownerPrincipalId: input.lease.ownerPrincipalId,
                  sourceMessageId: null,
                  workspaceId: workspace.id,
                  understandingId: understanding.id,
                  commissionId: commission.id,
                  processingPurpose: task.processingPurpose,
                  processingBasisRecordId: task.processingBasisRecordId,
                  consentRecordId: task.consentRecordId,
                  processingCoverageKey: task.processingCoverageKey,
                  processingEvidenceRef: task.processingEvidenceRef,
                  requestId: openingKey,
                  idempotencyKey: openingKey,
                  kind: VnextCreativeTaskKind.WRITE_OPENING,
                  inputArtifactVersions: jsonInput(openingArtifacts),
                  inputDigest: digest(openingArtifacts),
                  availableAt: completedAt,
                  deadlineAt: new Date(
                    completedAt.getTime() + OPENING_DEADLINE_MS,
                  ),
                  maxAttempts: 3,
                },
              });
              openingTaskId = openingTask.id;
              await this.probe?.afterWrite("after_opening_task");
            }

            const eventType =
              openingTaskId === null
                ? "vnext.understanding.needs_clarification"
                : "vnext.understanding.opening_queued";
            const outboxPayload = {
              commissionId: commission.id,
              openingTaskId,
              sourceMessageId: source.id,
              taskId: input.lease.taskId,
              traceId: input.lease.runTraceId,
              understandingId: understanding.id,
              workspaceId: workspace.id,
            };
            await transaction.vnextOutboxEvent.create({
              data: {
                ownerPrincipalId: input.lease.ownerPrincipalId,
                taskId: openingTaskId ?? input.lease.taskId,
                aggregateType: "understanding",
                aggregateId: understanding.id,
                aggregateVersion: understanding.version,
                eventType,
                idempotencyKey: `creative-task:${input.lease.taskId}:understanding-completed`,
                payload: jsonInput(outboxPayload),
                payloadDigest: digest(outboxPayload),
                status: VnextOutboxEventStatus.PENDING,
                availableAt: completedAt,
              },
            });
            await this.probe?.afterWrite("after_outbox");

            await rotateCurrentSessionProjection(
              transaction,
              activeSessionWhere,
              activeSession.projectionVersionId,
              randomUUID(),
            );
            await this.probe?.afterWrite("after_projection_version");
            await this.probe?.afterWrite("before_commit");
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
                currentTime(this.clock),
                null,
              ),
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
          );
        }
        if (error instanceof CreativeTaskInputStaleError) {
          return this.markSerializationConflictStale(input);
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
    throw new Error("understanding completion transaction retry budget exhausted");
  }
}
