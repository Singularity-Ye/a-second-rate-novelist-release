import { createHash, randomUUID } from "node:crypto";
import {
  Prisma,
  PrismaClient,
  VnextAudienceMode,
  VnextComplianceStatus,
  VnextCreativeTaskKind,
  VnextExperienceAuthState,
  VnextInputPolicy,
  VnextPrincipalKind,
  VnextProcessingPurpose,
  VnextReaderMemoryItemKind,
  VnextReaderMemoryItemStatus,
  type VnextCreativeTask,
  type VnextSourceMessage,
} from "@prisma/client";
import {
  createActiveHardBoundarySnapshot,
  rehydrateActiveHardBoundarySnapshot,
} from "../domain/creative-runtime.port.js";
import {
  VnextExperienceSubmissionConflictError,
  VnextExperienceSubmissionNotFoundError,
  type SubmitVnextExperienceInput,
  type VnextExperienceSubmission,
  type VnextExperienceSubmissionProbe,
  type VnextExperienceSubmissionUow,
} from "../domain/experience-submission.uow.js";
import {
  createSourceMessageRequestDigest,
  validateSourceMessageInput,
  type CreateVnextSourceMessageInput,
} from "../domain/source-message.js";

const TRANSACTION_ATTEMPTS = 3;
const UNDERSTAND_DEADLINE_MS = 180_000;
const INPUT_DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const SYNTHETIC_FIXTURE_EVIDENCE_PATTERN =
  /^fixture:[A-Za-z0-9][A-Za-z0-9._-]{0,63}:sha256:([0-9a-f]{64})$/;

function jsonInput(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function requireSyntheticFixtureEvidence(content: string, evidenceRef: string) {
  const match = SYNTHETIC_FIXTURE_EVIDENCE_PATTERN.exec(evidenceRef);
  const contentDigest = createHash("sha256").update(content).digest("hex");
  if (match?.[1] !== contentDigest) {
    throw new Error("synthetic fixture evidence is invalid");
  }
  return evidenceRef;
}

function requiredRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function hasExactDataFields(
  value: Record<string, unknown>,
  fields: readonly string[],
) {
  try {
    const keys = Reflect.ownKeys(value);
    return (
      keys.length === fields.length &&
      keys.every(
        (key) =>
          typeof key === "string" &&
          fields.includes(key) &&
          "value" in (Object.getOwnPropertyDescriptor(value, key) ?? {}),
      )
    );
  } catch {
    return false;
  }
}

function currentTime(clock: () => Date) {
  const now = clock();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("experience submission clock returned an invalid date");
  }
  return new Date(now.getTime());
}

function sourceMatches(
  source: VnextSourceMessage,
  input: CreateVnextSourceMessageInput,
  requestDigest: string,
) {
  return (
    source.ownerPrincipalId === input.ownerPrincipalId &&
    source.experienceSessionId === input.experienceSessionId &&
    source.clientRequestId === input.clientRequestId &&
    source.action === "COMMISSION" &&
    source.body === input.body &&
    source.basedOnUnderstandingId === null &&
    source.basedOnVersion === null &&
    source.requestDigest === requestDigest
  );
}

function taskMatches(
  task: VnextCreativeTask,
  source: VnextSourceMessage,
  requestId: string,
  processingEvidenceRef: string,
) {
  const artifacts = requiredRecord(task.inputArtifactVersions);
  const sourceArtifact = requiredRecord(artifacts?.sourceMessage);
  if (
    task.ownerPrincipalId !== source.ownerPrincipalId ||
    task.sourceMessageId !== source.id ||
    task.kind !== VnextCreativeTaskKind.UNDERSTAND ||
    task.processingPurpose !== VnextProcessingPurpose.SYNTHETIC_CREATIVE ||
    task.processingBasisRecordId !== null ||
    task.consentRecordId !== null ||
    task.processingCoverageKey !== null ||
    task.processingEvidenceRef !== processingEvidenceRef ||
    task.requestId !== requestId ||
    task.idempotencyKey !== requestId ||
    !INPUT_DIGEST_PATTERN.test(task.inputDigest) ||
    artifacts === null ||
    !hasExactDataFields(artifacts, [
      "schemaVersion",
      "kind",
      "sourceMessage",
      "hardBoundaries",
    ]) ||
    artifacts.schemaVersion !== 1 ||
    artifacts.kind !== "understand" ||
    sourceArtifact === null ||
    !hasExactDataFields(sourceArtifact, ["id", "requestDigest"]) ||
    sourceArtifact.id !== source.id ||
    sourceArtifact.requestDigest !== source.requestDigest
  ) {
    return false;
  }
  try {
    const hardBoundaries = rehydrateActiveHardBoundarySnapshot(
      artifacts.hardBoundaries,
    );
    if (hardBoundaries.ownerPrincipalId !== source.ownerPrincipalId) {
      return false;
    }
    const canonicalArtifacts = {
      schemaVersion: 1 as const,
      kind: "understand" as const,
      sourceMessage: {
        id: source.id,
        requestDigest: source.requestDigest,
      },
      hardBoundaries: plainSnapshot(hardBoundaries),
    };
    return task.inputDigest === digest(canonicalArtifacts);
  } catch {
    return false;
  }
}

async function readExactReplay(
  transaction: Prisma.TransactionClient,
  sourceInput: CreateVnextSourceMessageInput,
  requestDigest: string,
  requestId: string,
  processingEvidenceRef: string,
  projectionVersionId: string,
): Promise<VnextExperienceSubmission | null> {
  const existingSource = await transaction.vnextSourceMessage.findUnique({
    where: {
      ownerPrincipalId_clientRequestId: {
        ownerPrincipalId: sourceInput.ownerPrincipalId,
        clientRequestId: sourceInput.clientRequestId,
      },
    },
  });
  if (!existingSource) {
    return null;
  }
  const task = await transaction.vnextCreativeTask.findUnique({
    where: {
      ownerPrincipalId_requestId: {
        ownerPrincipalId: sourceInput.ownerPrincipalId,
        requestId,
      },
    },
  });
  if (
    task === null ||
    !sourceMatches(existingSource, sourceInput, requestDigest) ||
    !taskMatches(task, existingSource, requestId, processingEvidenceRef)
  ) {
    throw new VnextExperienceSubmissionConflictError();
  }
  return {
    sourceMessageId: existingSource.id,
    taskId: task.id,
    projectionVersionId,
    creationDisposition: "replayed",
  };
}

async function requireActiveOwnedSession(
  transaction: Prisma.TransactionClient,
  ownerPrincipalId: string,
  experienceSessionId: string,
  now: Date,
) {
  const session = await transaction.vnextExperienceSession.findFirst({
    where: {
      id: experienceSessionId,
      principalId: ownerPrincipalId,
      authState: VnextExperienceAuthState.GUEST_ACTIVE,
      revokedAt: null,
      guestExpiresAt: { gt: now },
      expiresAt: { gt: now },
    },
    include: { principal: true, complianceSession: true },
  });
  if (
    !session ||
    session.principal.kind !== VnextPrincipalKind.GUEST ||
    !session.complianceSession ||
    session.complianceSession.ownerPrincipalId !== ownerPrincipalId ||
    session.complianceSession.status !== VnextComplianceStatus.ELIGIBLE ||
    session.complianceSession.audienceMode !== VnextAudienceMode.INTERNAL ||
    session.complianceSession.inputPolicy !== VnextInputPolicy.SYNTHETIC_ONLY
  ) {
    throw new VnextExperienceSubmissionNotFoundError();
  }
  return session;
}

async function readBoundarySnapshot(
  transaction: Prisma.TransactionClient,
  ownerPrincipalId: string,
  now: Date,
) {
  const memory = await transaction.vnextReaderMemory.findUnique({
    where: { ownerPrincipalId },
    include: {
      items: {
        where: {
          itemKind: VnextReaderMemoryItemKind.HARD_BOUNDARY,
          status: VnextReaderMemoryItemStatus.ACTIVE,
          supersededAt: null,
        },
        orderBy: [{ id: "asc" }],
      },
    },
  });
  return createActiveHardBoundarySnapshot({
    snapshotId: memory?.id ?? `empty:${ownerPrincipalId}`,
    ownerPrincipalId,
    version: memory?.version ?? 1,
    capturedAt: (memory?.updatedAt ?? now).toISOString(),
    items:
      memory?.items.map((item) => ({
        boundaryId: item.id,
        value: item.value,
        sourceRef: item.sourceMessageId,
        status: "active" as const,
        version: item.version,
      })) ?? [],
  });
}

function plainSnapshot(
  snapshot: ReturnType<typeof createActiveHardBoundarySnapshot>,
) {
  return {
    snapshotId: snapshot.snapshotId,
    ownerPrincipalId: snapshot.ownerPrincipalId,
    version: snapshot.version,
    capturedAt: snapshot.capturedAt,
    items: snapshot.items.map((item) => ({ ...item })),
  };
}

export class PrismaExperienceSubmissionUow
  implements VnextExperienceSubmissionUow
{
  constructor(
    private readonly client: PrismaClient,
    private readonly probe?: VnextExperienceSubmissionProbe,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async submit(
    input: SubmitVnextExperienceInput,
  ): Promise<VnextExperienceSubmission> {
    const processingEvidenceRef = requireSyntheticFixtureEvidence(
      input.text,
      input.processingEvidenceRef,
    );
    const sourceInput = validateSourceMessageInput({
      action: "commission",
      basedOnUnderstandingId: null,
      basedOnVersion: null,
      body: input.text,
      clientRequestId: input.clientRequestId,
      experienceSessionId: input.experienceSessionId,
      ownerPrincipalId: input.ownerPrincipalId,
    });
    const requestDigest = createSourceMessageRequestDigest(sourceInput);
    const requestId = `experience:${requestDigest}:understand`;

    for (let attempt = 1; attempt <= TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.client.$transaction(
          async (transaction) => {
            const now = currentTime(this.clock);
            const session = await requireActiveOwnedSession(
              transaction,
              input.ownerPrincipalId,
              input.experienceSessionId,
              now,
            );
            const replay = await readExactReplay(
              transaction,
              sourceInput,
              requestDigest,
              requestId,
              processingEvidenceRef,
              session.projectionVersionId,
            );
            if (replay) {
              return replay;
            }

            const existingMainline =
              await transaction.vnextCreativeTask.findFirst({
                where: {
                  ownerPrincipalId: input.ownerPrincipalId,
                  kind: VnextCreativeTaskKind.UNDERSTAND,
                  sourceMessage: {
                    experienceSessionId: input.experienceSessionId,
                  },
                },
                select: { id: true },
              });
            if (existingMainline) {
              throw new VnextExperienceSubmissionConflictError();
            }

            const keyCollision = await transaction.vnextCreativeTask.findFirst({
              where: {
                ownerPrincipalId: input.ownerPrincipalId,
                OR: [{ requestId }, { idempotencyKey: requestId }],
              },
            });
            if (keyCollision) {
              throw new VnextExperienceSubmissionConflictError();
            }

            const snapshot = plainSnapshot(
              await readBoundarySnapshot(transaction, input.ownerPrincipalId, now),
            );
            const source = await transaction.vnextSourceMessage.create({
              data: {
                action: "COMMISSION",
                basedOnUnderstandingId: null,
                basedOnVersion: null,
                body: sourceInput.body,
                clientRequestId: sourceInput.clientRequestId,
                experienceSessionId: sourceInput.experienceSessionId,
                ownerPrincipalId: sourceInput.ownerPrincipalId,
                requestDigest,
              },
            });
            await this.probe?.afterWrite("after_source_message");

            const artifacts = {
              schemaVersion: 1 as const,
              kind: "understand" as const,
              sourceMessage: { id: source.id, requestDigest },
              hardBoundaries: snapshot,
            };
            const task = await transaction.vnextCreativeTask.create({
              data: {
                ownerPrincipalId: input.ownerPrincipalId,
                sourceMessageId: source.id,
                workspaceId: null,
                understandingId: null,
                commissionId: null,
                processingPurpose: VnextProcessingPurpose.SYNTHETIC_CREATIVE,
                processingBasisRecordId: null,
                consentRecordId: null,
                processingCoverageKey: null,
                processingEvidenceRef,
                requestId,
                idempotencyKey: requestId,
                kind: VnextCreativeTaskKind.UNDERSTAND,
                inputArtifactVersions: jsonInput(artifacts),
                inputDigest: digest(artifacts),
                availableAt: now,
                deadlineAt: new Date(now.getTime() + UNDERSTAND_DEADLINE_MS),
                maxAttempts: 3,
              },
            });
            await this.probe?.afterWrite("after_understand_task");

            const projectionVersionId = randomUUID();
            const projectionUpdated =
              await transaction.vnextExperienceSession.updateMany({
                where: {
                  id: session.id,
                  principalId: input.ownerPrincipalId,
                  authState: VnextExperienceAuthState.GUEST_ACTIVE,
                  revokedAt: null,
                  guestExpiresAt: { gt: now },
                  expiresAt: { gt: now },
                },
                data: { projectionVersionId },
              });
            if (projectionUpdated.count !== 1) {
              throw new VnextExperienceSubmissionNotFoundError();
            }
            await this.probe?.afterWrite("after_projection_version");
            await this.probe?.afterWrite("before_commit");
            return {
              sourceMessageId: source.id,
              taskId: task.id,
              projectionVersionId,
              creationDisposition: "created",
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === "P2002" || error.code === "P2034") &&
          attempt < TRANSACTION_ATTEMPTS
        ) {
          continue;
        }
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          const replay = await this.client.$transaction(
            async (transaction) => {
              const now = currentTime(this.clock);
              const session = await requireActiveOwnedSession(
                transaction,
                input.ownerPrincipalId,
                input.experienceSessionId,
                now,
              );
              return readExactReplay(
                transaction,
                sourceInput,
                requestDigest,
                requestId,
                processingEvidenceRef,
                session.projectionVersionId,
              );
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
          );
          if (replay) {
            return replay;
          }
          throw new VnextExperienceSubmissionConflictError();
        }
        throw error;
      }
    }
    throw new Error("experience submission transaction retry budget exhausted");
  }
}
