import { randomUUID } from "node:crypto";
import {
  Prisma,
  PrismaClient,
  VnextCommissionStatus,
  VnextReaderMemoryItemKind,
  VnextReaderMemoryItemStatus,
  VnextReaderMemoryScope,
  VnextSourceMessageAction,
  VnextStoryWorkspaceStatus,
  VnextUnderstandingStatus,
  type VnextReaderMemoryItem,
  type VnextSourceMessage,
} from "@prisma/client";
import {
  NOOP_VNEXT_STORY_TRUTH_AUDIT,
  assertVnextUuid,
  boundaryValueDigest,
  validateExplicitBoundaryEvidence,
  type ExplicitBoundaryEvidence,
  type VnextStoryTruthAuditPort,
} from "../domain/source-message.js";
import {
  VnextStoryTruthIdempotencyConflictError,
  VnextStoryTruthNotFoundError,
  VnextStoryTruthStaleVersionError,
  createCommissionPayloadDigest,
  createStoryTruthCorrectionDigest,
  createStoryTruthPublicationDigest,
  validateCommissionFields,
  validateUnderstandingFields,
  type CorrectVnextStoryTruthInput,
  type PublishVnextStoryTruthInput,
  type VnextHardBoundaryCorrectionAction,
  type VnextStoryTruthPublication,
  type VnextStoryTruthTransactionProbe,
  type VnextUnderstandingRepository,
} from "../domain/understanding-draft.js";

const TRANSACTION_ATTEMPTS = 3;
const MAX_BOUNDARY_CHANGES_PER_TRANSACTION = 100;
const CURRENT_UNDERSTANDING_STATUSES = [
  VnextUnderstandingStatus.PROPOSED,
  VnextUnderstandingStatus.CORRECTED,
  VnextUnderstandingStatus.CONFIRMED,
] as const;
const CURRENT_COMMISSION_STATUSES = [
  VnextCommissionStatus.DRAFT,
  VnextCommissionStatus.ACTIVE,
] as const;

type StoryTruthClient = Pick<
  PrismaClient,
  | "vnextCommissionBrief"
  | "vnextReaderMemory"
  | "vnextReaderMemoryItem"
  | "vnextSourceMessage"
  | "vnextStoryWorkspace"
  | "vnextUnderstandingDraft"
>;

type ActiveBoundaryProjection = {
  readonly id: string;
  readonly sourceMessageId: string;
  readonly status: "active";
  readonly value: string;
  readonly version: number;
};

type CorrectionProvenance = {
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
  readonly boundaryActions: readonly {
    readonly operation: "add" | "replace" | "revoke";
    readonly targetBoundaryId: string | null;
    readonly expectedTargetVersion: number | null;
    readonly evidence: ExplicitBoundaryEvidence;
  }[];
};

function requiredRecord(value: unknown, label: string) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be non-empty`);
  }
  return value;
}

function requiredPositiveInteger(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

function publicationJson(
  publication: VnextStoryTruthPublication,
  correctionProvenance?: CorrectionProvenance,
) {
  return {
    activeHardBoundaries: publication.activeHardBoundaries.map((boundary) => ({
      id: boundary.id,
      sourceMessageId: boundary.sourceMessageId,
      status: boundary.status,
      value: boundary.value,
      version: boundary.version,
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

function rehydratePublicationSnapshot(value: Prisma.JsonValue) {
  const snapshot = requiredRecord(value, "publication snapshot");
  if (!Array.isArray(snapshot.activeHardBoundaries)) {
    throw new Error("publication snapshot boundaries must be an array");
  }
  const activeHardBoundaries = snapshot.activeHardBoundaries.map(
    (rawBoundary, index) => {
      const boundary = requiredRecord(rawBoundary, `publication boundary ${index}`);
      if (boundary.status !== "active") {
        throw new Error("publication snapshot contains a non-active boundary");
      }
      return {
        id: requiredString(boundary.id, `publication boundary ${index}.id`),
        sourceMessageId: requiredString(
          boundary.sourceMessageId,
          `publication boundary ${index}.sourceMessageId`,
        ),
        status: "active" as const,
        value: requiredString(boundary.value, `publication boundary ${index}.value`),
        version: requiredPositiveInteger(
          boundary.version,
          `publication boundary ${index}.version`,
        ),
      };
    },
  );
  const commission = requiredRecord(snapshot.commission, "publication commission");
  const understanding = requiredRecord(
    snapshot.understanding,
    "publication understanding",
  );
  const workspace = requiredRecord(snapshot.workspace, "publication workspace");
  if (
    commission.status !== "draft" &&
    commission.status !== "active" &&
    commission.status !== "superseded"
  ) {
    throw new Error("publication commission status is invalid");
  }
  if (
    understanding.status !== "proposed" &&
    understanding.status !== "corrected" &&
    understanding.status !== "confirmed" &&
    understanding.status !== "expired"
  ) {
    throw new Error("publication understanding status is invalid");
  }
  if (
    workspace.status !== "forming" &&
    workspace.status !== "active" &&
    workspace.status !== "paused" &&
    workspace.status !== "archived"
  ) {
    throw new Error("publication workspace status is invalid");
  }
  return {
    activeHardBoundaries,
    commission: {
      id: requiredString(commission.id, "publication commission.id"),
      status: commission.status,
      version: requiredPositiveInteger(
        commission.version,
        "publication commission.version",
      ),
    },
    understanding: {
      id: requiredString(understanding.id, "publication understanding.id"),
      status: understanding.status,
      version: requiredPositiveInteger(
        understanding.version,
        "publication understanding.version",
      ),
    },
    workspace: {
      aggregateVersion: requiredPositiveInteger(
        workspace.aggregateVersion,
        "publication workspace.aggregateVersion",
      ),
      id: requiredString(workspace.id, "publication workspace.id"),
      status: workspace.status,
    },
  } satisfies VnextStoryTruthPublication;
}

function understandingStatus(
  status: VnextUnderstandingStatus,
): VnextStoryTruthPublication["understanding"]["status"] {
  switch (status) {
    case VnextUnderstandingStatus.CORRECTED:
      return "corrected";
    case VnextUnderstandingStatus.CONFIRMED:
      return "confirmed";
    case VnextUnderstandingStatus.EXPIRED:
      return "expired";
    default:
      return "proposed";
  }
}

function commissionStatus(
  status: VnextCommissionStatus,
): VnextStoryTruthPublication["commission"]["status"] {
  switch (status) {
    case VnextCommissionStatus.ACTIVE:
      return "active";
    case VnextCommissionStatus.SUPERSEDED:
      return "superseded";
    default:
      return "draft";
  }
}

function workspaceStatus(
  status: VnextStoryWorkspaceStatus,
): VnextStoryTruthPublication["workspace"]["status"] {
  switch (status) {
    case VnextStoryWorkspaceStatus.ACTIVE:
      return "active";
    case VnextStoryWorkspaceStatus.PAUSED:
      return "paused";
    case VnextStoryWorkspaceStatus.ARCHIVED:
      return "archived";
    default:
      return "forming";
  }
}

function recordAudit(
  audit: VnextStoryTruthAuditPort | undefined,
  operation: "publish" | "correct" | "owned_read",
  outcome:
    | "published"
    | "corrected"
    | "replayed"
    | "not_found"
    | "conflict"
    | "stale"
    | "failed",
  resourceKind: "understanding" | "workspace",
) {
  (audit ?? NOOP_VNEXT_STORY_TRUTH_AUDIT).record({
    event: "story_truth",
    operation,
    outcome,
    resourceKind,
  });
}

function jsonProjection(boundaries: readonly ActiveBoundaryProjection[]) {
  return boundaries.map((boundary) => ({
    id: boundary.id,
    sourceMessageId: boundary.sourceMessageId,
    status: boundary.status,
    value: boundary.value,
    version: boundary.version,
  })) as Prisma.InputJsonArray;
}

async function readActiveBoundaries(
  client: StoryTruthClient,
  ownerPrincipalId: string,
): Promise<ActiveBoundaryProjection[]> {
  const items = await client.vnextReaderMemoryItem.findMany({
    where: {
      itemKind: VnextReaderMemoryItemKind.HARD_BOUNDARY,
      ownerPrincipalId,
      status: VnextReaderMemoryItemStatus.ACTIVE,
      supersededAt: null,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return items.map((item) => ({
    id: item.id,
    sourceMessageId: item.sourceMessageId,
    status: "active",
    value: item.value,
    version: item.version,
  }));
}

async function readPublicationBySource(
  client: StoryTruthClient,
  ownerPrincipalId: string,
  sourceMessageId: string,
  expectedDigest?: string,
): Promise<VnextStoryTruthPublication | null> {
  const understanding = await client.vnextUnderstandingDraft.findFirst({
    where: { ownerPrincipalId, sourceMessageId },
    include: { commissionBrief: true, workspace: true },
  });
  if (!understanding?.commissionBrief) {
    return null;
  }
  if (expectedDigest !== undefined && understanding.payloadDigest !== expectedDigest) {
    throw new VnextStoryTruthIdempotencyConflictError();
  }
  const snapshot = rehydratePublicationSnapshot(
    understanding.publicationSnapshot,
  );
  if (
    snapshot.understanding.id !== understanding.id ||
    snapshot.commission.id !== understanding.commissionBrief.id ||
    snapshot.workspace.id !== understanding.workspace.id
  ) {
    throw new Error("publication snapshot does not match relational truth");
  }
  return snapshot;
}

function validateEvidenceSet(
  sourceBody: string,
  evidenceItems: readonly ExplicitBoundaryEvidence[],
) {
  if (
    !Array.isArray(evidenceItems) ||
    evidenceItems.length > MAX_BOUNDARY_CHANGES_PER_TRANSACTION
  ) {
    throw new Error("hard-boundary changes exceed the transaction limit");
  }
  const seenRanges = new Set<string>();
  const seenValues = new Set<string>();
  return evidenceItems.map((evidence) => {
    const validated = validateExplicitBoundaryEvidence(sourceBody, evidence);
    const rangeKey = `${validated.evidenceStart}:${validated.evidenceEnd}`;
    const valueKey = boundaryValueDigest(validated.value);
    if (seenRanges.has(rangeKey) || seenValues.has(valueKey)) {
      throw new Error("hard-boundary evidence must be unique within one source message");
    }
    seenRanges.add(rangeKey);
    seenValues.add(valueKey);
    return validated;
  });
}

function correctionEvidence(action: VnextHardBoundaryCorrectionAction) {
  return action.operation === "revoke" ? action.evidence : action;
}

function validateCorrectionActions(
  sourceBody: string,
  actions: readonly VnextHardBoundaryCorrectionAction[],
) {
  const validatedEvidence = validateEvidenceSet(
    sourceBody,
    actions.map(correctionEvidence),
  );
  const targetedItems = new Set<string>();
  return actions.map((action, index) => {
    if (action.operation !== "add") {
      assertVnextUuid(action.targetItemId, "boundaryAction.targetItemId");
      if (
        !Number.isInteger(action.expectedItemVersion) ||
        action.expectedItemVersion < 1
      ) {
        throw new Error("boundaryAction.expectedItemVersion must be positive");
      }
      if (targetedItems.has(action.targetItemId)) {
        throw new Error("one correction cannot mutate the same boundary twice");
      }
      targetedItems.add(action.targetItemId);
    }
    const evidence = validatedEvidence[index]!;
    return action.operation === "revoke"
      ? { ...action, evidence }
      : { ...action, ...evidence };
  });
}

function correctionProvenanceActions(
  actions: readonly VnextHardBoundaryCorrectionAction[],
): CorrectionProvenance["boundaryActions"] {
  return actions.map((action) => {
    const evidence = action.operation === "revoke" ? action.evidence : action;
    return {
      operation: action.operation,
      targetBoundaryId:
        action.operation === "add" ? null : action.targetItemId,
      expectedTargetVersion:
        action.operation === "add" ? null : action.expectedItemVersion,
      evidence: {
        value: evidence.value,
        evidenceStart: evidence.evidenceStart,
        evidenceEnd: evidence.evidenceEnd,
      },
    };
  });
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
      throw new VnextStoryTruthStaleVersionError();
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
  targetItemId: string,
  expectedItemVersion: number,
) {
  const target = await transaction.vnextReaderMemoryItem.findFirst({
    where: {
      id: targetItemId,
      itemKind: VnextReaderMemoryItemKind.HARD_BOUNDARY,
      ownerPrincipalId,
      status: VnextReaderMemoryItemStatus.ACTIVE,
      supersededAt: null,
      version: expectedItemVersion,
    },
  });
  if (!target) {
    throw new VnextStoryTruthStaleVersionError();
  }
  return target;
}

async function revokeBoundary(
  transaction: Prisma.TransactionClient,
  target: VnextReaderMemoryItem,
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
    throw new VnextStoryTruthStaleVersionError();
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
  target: VnextReaderMemoryItem,
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
  });
  if (duplicate) {
    throw new VnextStoryTruthIdempotencyConflictError();
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
    throw new VnextStoryTruthStaleVersionError();
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

function knownErrorCode(error: unknown, code: "P2002" | "P2034") {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

function mapPersistenceError(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2003"
  ) {
    throw new VnextStoryTruthNotFoundError();
  }
  throw error;
}

export class PrismaUnderstandingRepository implements VnextUnderstandingRepository {
  constructor(
    private readonly client: PrismaClient,
    private readonly probe?: VnextStoryTruthTransactionProbe,
    private readonly audit: VnextStoryTruthAuditPort = NOOP_VNEXT_STORY_TRUTH_AUDIT,
  ) {}

  async publish(
    input: PublishVnextStoryTruthInput,
  ): Promise<VnextStoryTruthPublication> {
    assertVnextUuid(input.ownerPrincipalId, "ownerPrincipalId");
    assertVnextUuid(input.sourceMessageId, "sourceMessageId");
    const understanding = validateUnderstandingFields(input.understanding);
    const commission = validateCommissionFields(input.commission);
    const publicationDigest = createStoryTruthPublicationDigest({
      ...input,
      commission,
      understanding,
    });
    let replay: VnextStoryTruthPublication | null;
    try {
      replay = await readPublicationBySource(
        this.client,
        input.ownerPrincipalId,
        input.sourceMessageId,
        publicationDigest,
      );
    } catch (error) {
      recordAudit(
        this.audit,
        "publish",
        error instanceof VnextStoryTruthIdempotencyConflictError
          ? "conflict"
          : "failed",
        "workspace",
      );
      throw error;
    }
    if (replay) {
      recordAudit(this.audit, "publish", "replayed", "workspace");
      return replay;
    }

    for (let attempt = 1; attempt <= TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        const published = await this.client.$transaction(
          async (transaction) => {
            const source = await transaction.vnextSourceMessage.findFirst({
              where: {
                action: VnextSourceMessageAction.COMMISSION,
                id: input.sourceMessageId,
                ownerPrincipalId: input.ownerPrincipalId,
              },
            });
            if (!source) {
              throw new VnextStoryTruthNotFoundError();
            }
            const concurrentReplay = await readPublicationBySource(
              transaction,
              input.ownerPrincipalId,
              input.sourceMessageId,
              publicationDigest,
            );
            if (concurrentReplay) {
              return { publication: concurrentReplay, replayed: true };
            }
            const evidence = validateEvidenceSet(
              source.body,
              input.explicitHardBoundaries,
            );
            const workspace = await transaction.vnextStoryWorkspace.create({
              data: {
                aggregateVersion: 1,
                originSourceMessageId: source.id,
                ownerPrincipalId: input.ownerPrincipalId,
                publicationDigest,
                status: VnextStoryWorkspaceStatus.FORMING,
              },
            });
            await this.probe?.afterWrite("after_workspace");
            const memory = await ensureReaderMemory(
              transaction,
              input.ownerPrincipalId,
              evidence.length > 0,
            );
            const now = new Date();
            for (const boundary of evidence) {
              await supersedeActiveBoundaryWithEvidence(
                transaction,
                memory.id,
                input.ownerPrincipalId,
                source.id,
                boundary,
                now,
              );
            }
            await this.probe?.afterWrite("after_reader_memory");
            const activeBoundaries = await readActiveBoundaries(
              transaction,
              input.ownerPrincipalId,
            );
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
                status: workspaceStatus(workspace.status),
              },
            };
            await transaction.vnextUnderstandingDraft.create({
                data: {
                  clarificationQuestions: [...understanding.clarificationQuestions],
                  confidence: understanding.confidence,
                  emotionalTarget: understanding.emotionalTarget,
                  hardBoundaries: jsonProjection(activeBoundaries),
                  id: understandingId,
                  ownerPrincipalId: input.ownerPrincipalId,
                  payloadDigest: publicationDigest,
                  publicationSnapshot: publicationJson(publication),
                  relationshipTension: understanding.relationshipTension,
                  sourceMessageId: source.id,
                  status: VnextUnderstandingStatus.PROPOSED,
                  storyDesire: understanding.storyDesire,
                  userCorrection: understanding.userCorrection,
                  version: 1,
                  workspaceId: workspace.id,
                },
              });
            await this.probe?.afterWrite("after_understanding");
            await transaction.vnextCommissionBrief.create({
              data: {
                continuationIntent: commission.continuationIntent,
                emotionalPromise: commission.emotionalPromise,
                hardBoundaries: jsonProjection(activeBoundaries),
                id: commissionId,
                ownerPrincipalId: input.ownerPrincipalId,
                payloadDigest: createCommissionPayloadDigest(
                  commission,
                  activeBoundaries,
                ),
                premise: commission.premise,
                relationshipCore: commission.relationshipCore,
                sourceUnderstandingId: understandingId,
                status: VnextCommissionStatus.DRAFT,
                styleConstraints: [...commission.styleConstraints],
                version: 1,
                workspaceId: workspace.id,
              },
            });
            await this.probe?.afterWrite("after_commission");
            await this.probe?.afterWrite("before_commit");
            const result = await readPublicationBySource(
              transaction,
              input.ownerPrincipalId,
              source.id,
              publicationDigest,
            );
            if (!result) {
              throw new Error("published story truth could not be reloaded");
            }
            return { publication: result, replayed: false };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        recordAudit(
          this.audit,
          "publish",
          published.replayed ? "replayed" : "published",
          "workspace",
        );
        return published.publication;
      } catch (error) {
        if (knownErrorCode(error, "P2034")) {
          if (attempt < TRANSACTION_ATTEMPTS) {
            continue;
          }
          recordAudit(this.audit, "publish", "failed", "workspace");
          throw error;
        }
        if (knownErrorCode(error, "P2002")) {
          const concurrentReplay = await readPublicationBySource(
            this.client,
            input.ownerPrincipalId,
            input.sourceMessageId,
            publicationDigest,
          );
          if (concurrentReplay) {
            recordAudit(this.audit, "publish", "replayed", "workspace");
            return concurrentReplay;
          }
          if (attempt < TRANSACTION_ATTEMPTS) {
            continue;
          }
          recordAudit(this.audit, "publish", "conflict", "workspace");
          throw new VnextStoryTruthIdempotencyConflictError();
        }
        if (error instanceof VnextStoryTruthNotFoundError) {
          recordAudit(this.audit, "publish", "not_found", "workspace");
        } else if (error instanceof VnextStoryTruthIdempotencyConflictError) {
          recordAudit(this.audit, "publish", "conflict", "workspace");
        } else {
          recordAudit(this.audit, "publish", "failed", "workspace");
        }
        mapPersistenceError(error);
      }
    }
    throw new Error("story-truth publish retry budget exhausted");
  }

  async correct(
    input: CorrectVnextStoryTruthInput,
  ): Promise<VnextStoryTruthPublication> {
    assertVnextUuid(input.ownerPrincipalId, "ownerPrincipalId");
    assertVnextUuid(input.workspaceId, "workspaceId");
    assertVnextUuid(input.correctionSourceMessageId, "correctionSourceMessageId");
    if (
      !Number.isInteger(input.expectedAggregateVersion) ||
      input.expectedAggregateVersion < 1
    ) {
      throw new Error("expectedAggregateVersion must be a positive integer");
    }
    const understanding = validateUnderstandingFields(input.understanding);
    const commission = validateCommissionFields(input.commission);
    const correctionDigest = createStoryTruthCorrectionDigest({
      ...input,
      commission,
      understanding,
    });
    let replay: VnextStoryTruthPublication | null;
    try {
      replay = await readPublicationBySource(
        this.client,
        input.ownerPrincipalId,
        input.correctionSourceMessageId,
        correctionDigest,
      );
    } catch (error) {
      recordAudit(
        this.audit,
        "correct",
        error instanceof VnextStoryTruthIdempotencyConflictError
          ? "conflict"
          : "failed",
        "understanding",
      );
      throw error;
    }
    if (replay) {
      recordAudit(this.audit, "correct", "replayed", "understanding");
      return replay;
    }

    for (let attempt = 1; attempt <= TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        const corrected = await this.client.$transaction(
          async (transaction) => {
            const source = await transaction.vnextSourceMessage.findFirst({
              where: {
                action: {
                  in: [
                    VnextSourceMessageAction.CORRECTION,
                    VnextSourceMessageAction.BOUNDARY_UPDATE,
                  ],
                },
                id: input.correctionSourceMessageId,
                ownerPrincipalId: input.ownerPrincipalId,
              },
            });
            if (!source) {
              throw new VnextStoryTruthNotFoundError();
            }
            const concurrentReplay = await readPublicationBySource(
              transaction,
              input.ownerPrincipalId,
              source.id,
              correctionDigest,
            );
            if (concurrentReplay) {
              return { publication: concurrentReplay, replayed: true };
            }
            const actions = validateCorrectionActions(
              source.body,
              input.boundaryActions,
            );
            const workspace = await transaction.vnextStoryWorkspace.findFirst({
              where: {
                id: input.workspaceId,
                ownerPrincipalId: input.ownerPrincipalId,
              },
            });
            if (!workspace) {
              throw new VnextStoryTruthNotFoundError();
            }
            const currentUnderstanding =
              await transaction.vnextUnderstandingDraft.findFirst({
                where: {
                  ownerPrincipalId: input.ownerPrincipalId,
                  status: { in: [...CURRENT_UNDERSTANDING_STATUSES] },
                  workspaceId: workspace.id,
                },
                orderBy: { version: "desc" },
              });
            const currentCommission =
              await transaction.vnextCommissionBrief.findFirst({
                where: {
                  ownerPrincipalId: input.ownerPrincipalId,
                  status: { in: [...CURRENT_COMMISSION_STATUSES] },
                  workspaceId: workspace.id,
                },
                orderBy: { version: "desc" },
              });
            if (!currentUnderstanding || !currentCommission) {
              throw new VnextStoryTruthNotFoundError();
            }
            if (
              workspace.aggregateVersion !== input.expectedAggregateVersion ||
              currentUnderstanding.version !== workspace.aggregateVersion ||
              currentCommission.version !== workspace.aggregateVersion ||
              source.basedOnUnderstandingId !== currentUnderstanding.id ||
              source.basedOnVersion !== currentUnderstanding.version
            ) {
              throw new VnextStoryTruthStaleVersionError();
            }
            const cas = await transaction.vnextStoryWorkspace.updateMany({
              where: {
                aggregateVersion: input.expectedAggregateVersion,
                id: workspace.id,
                ownerPrincipalId: input.ownerPrincipalId,
              },
              data: {
                aggregateVersion: { increment: 1 },
                publicationDigest: correctionDigest,
              },
            });
            if (cas.count !== 1) {
              throw new VnextStoryTruthStaleVersionError();
            }
            await this.probe?.afterWrite("after_workspace_cas");
            const memory = await ensureReaderMemory(
              transaction,
              input.ownerPrincipalId,
              actions.length > 0,
            );
            const now = new Date();
            for (const action of actions) {
              if (action.operation === "add") {
                await supersedeActiveBoundaryWithEvidence(
                  transaction,
                  memory.id,
                  input.ownerPrincipalId,
                  source.id,
                  action,
                  now,
                );
                await this.probe?.afterWrite("after_boundary_add");
                continue;
              }
              const target = await loadOwnedActiveBoundary(
                transaction,
                input.ownerPrincipalId,
                action.targetItemId,
                action.expectedItemVersion,
              );
              if (action.operation === "revoke") {
                await revokeBoundary(
                  transaction,
                  target,
                  input.ownerPrincipalId,
                  source.id,
                  action.evidence,
                  now,
                );
                await this.probe?.afterWrite("after_boundary_revoke");
              } else {
                await replaceBoundary(
                  transaction,
                  target,
                  input.ownerPrincipalId,
                  source.id,
                  action,
                  now,
                );
                await this.probe?.afterWrite("after_boundary_revoke");
                await this.probe?.afterWrite("after_boundary_add");
              }
            }
            await this.probe?.afterWrite("after_reader_memory");
            const activeBoundaries = await readActiveBoundaries(
              transaction,
              input.ownerPrincipalId,
            );
            const nextVersion = workspace.aggregateVersion + 1;
            const correctedUnderstandingId = randomUUID();
            const correctedCommissionId = randomUUID();
            const publication: VnextStoryTruthPublication = {
              activeHardBoundaries: activeBoundaries,
              commission: {
                id: correctedCommissionId,
                status: "draft",
                version: nextVersion,
              },
              understanding: {
                id: correctedUnderstandingId,
                status: "corrected",
                version: nextVersion,
              },
              workspace: {
                aggregateVersion: nextVersion,
                id: workspace.id,
                status: workspaceStatus(workspace.status),
              },
            };
            const correctionProvenance: CorrectionProvenance = {
              schemaVersion: 1,
              sourceMessage: {
                id: source.id,
                requestDigest: source.requestDigest,
                basedOnUnderstandingId: currentUnderstanding.id,
              },
              priorWorkspace: {
                id: workspace.id,
                aggregateVersion: workspace.aggregateVersion,
                publicationDigest: workspace.publicationDigest,
              },
              priorUnderstanding: {
                id: currentUnderstanding.id,
                version: currentUnderstanding.version,
                payloadDigest: currentUnderstanding.payloadDigest,
              },
              priorCommission: {
                id: currentCommission.id,
                version: currentCommission.version,
                payloadDigest: currentCommission.payloadDigest,
              },
              boundaryActions: correctionProvenanceActions(actions),
            };
            const expired = await transaction.vnextUnderstandingDraft.updateMany({
              where: {
                id: currentUnderstanding.id,
                ownerPrincipalId: input.ownerPrincipalId,
                status: { in: [...CURRENT_UNDERSTANDING_STATUSES] },
                version: currentUnderstanding.version,
              },
              data: { status: VnextUnderstandingStatus.EXPIRED },
            });
            const superseded = await transaction.vnextCommissionBrief.updateMany({
              where: {
                id: currentCommission.id,
                ownerPrincipalId: input.ownerPrincipalId,
                status: { in: [...CURRENT_COMMISSION_STATUSES] },
                version: currentCommission.version,
              },
              data: { status: VnextCommissionStatus.SUPERSEDED },
            });
            if (expired.count !== 1 || superseded.count !== 1) {
              throw new VnextStoryTruthStaleVersionError();
            }
            await transaction.vnextUnderstandingDraft.create({
                data: {
                  clarificationQuestions: [...understanding.clarificationQuestions],
                  confidence: understanding.confidence,
                  emotionalTarget: understanding.emotionalTarget,
                  hardBoundaries: jsonProjection(activeBoundaries),
                  id: correctedUnderstandingId,
                  ownerPrincipalId: input.ownerPrincipalId,
                  payloadDigest: correctionDigest,
                  publicationSnapshot: publicationJson(
                    publication,
                    correctionProvenance,
                  ),
                  relationshipTension: understanding.relationshipTension,
                  sourceMessageId: source.id,
                  status: VnextUnderstandingStatus.CORRECTED,
                  storyDesire: understanding.storyDesire,
                  supersedesUnderstandingId: currentUnderstanding.id,
                  userCorrection: understanding.userCorrection,
                  version: nextVersion,
                  workspaceId: workspace.id,
                },
              });
            await this.probe?.afterWrite("after_understanding");
            await transaction.vnextCommissionBrief.create({
              data: {
                continuationIntent: commission.continuationIntent,
                emotionalPromise: commission.emotionalPromise,
                hardBoundaries: jsonProjection(activeBoundaries),
                id: correctedCommissionId,
                ownerPrincipalId: input.ownerPrincipalId,
                payloadDigest: createCommissionPayloadDigest(
                  commission,
                  activeBoundaries,
                ),
                premise: commission.premise,
                relationshipCore: commission.relationshipCore,
                sourceUnderstandingId: correctedUnderstandingId,
                status: VnextCommissionStatus.DRAFT,
                styleConstraints: [...commission.styleConstraints],
                supersedesCommissionId: currentCommission.id,
                version: nextVersion,
                workspaceId: workspace.id,
              },
            });
            await this.probe?.afterWrite("after_commission");
            await this.probe?.afterWrite("before_commit");
            const result = await readPublicationBySource(
              transaction,
              input.ownerPrincipalId,
              source.id,
              correctionDigest,
            );
            if (!result) {
              throw new Error("corrected story truth could not be reloaded");
            }
            return { publication: result, replayed: false };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        recordAudit(
          this.audit,
          "correct",
          corrected.replayed ? "replayed" : "corrected",
          "understanding",
        );
        return corrected.publication;
      } catch (error) {
        if (knownErrorCode(error, "P2034")) {
          if (attempt < TRANSACTION_ATTEMPTS) {
            continue;
          }
          recordAudit(this.audit, "correct", "failed", "understanding");
          throw error;
        }
        if (knownErrorCode(error, "P2002")) {
          const concurrentReplay = await readPublicationBySource(
            this.client,
            input.ownerPrincipalId,
            input.correctionSourceMessageId,
            correctionDigest,
          );
          if (concurrentReplay) {
            recordAudit(this.audit, "correct", "replayed", "understanding");
            return concurrentReplay;
          }
          if (attempt < TRANSACTION_ATTEMPTS) {
            continue;
          }
          recordAudit(this.audit, "correct", "conflict", "understanding");
          throw new VnextStoryTruthIdempotencyConflictError();
        }
        if (error instanceof VnextStoryTruthNotFoundError) {
          recordAudit(this.audit, "correct", "not_found", "understanding");
        } else if (error instanceof VnextStoryTruthStaleVersionError) {
          recordAudit(this.audit, "correct", "stale", "understanding");
        } else if (error instanceof VnextStoryTruthIdempotencyConflictError) {
          recordAudit(this.audit, "correct", "conflict", "understanding");
        } else {
          recordAudit(this.audit, "correct", "failed", "understanding");
        }
        mapPersistenceError(error);
      }
    }
    throw new Error("story-truth correction retry budget exhausted");
  }

  async findOwned(ownerPrincipalId: string, understandingId: string) {
    try {
      assertVnextUuid(ownerPrincipalId, "ownerPrincipalId");
      assertVnextUuid(understandingId, "understandingId");
    } catch {
      return null;
    }
    const record = await this.client.vnextUnderstandingDraft.findFirst({
      where: { id: understandingId, ownerPrincipalId },
    });
    return record
      ? {
          id: record.id,
          status: understandingStatus(record.status),
          version: record.version,
        }
      : null;
  }
}
