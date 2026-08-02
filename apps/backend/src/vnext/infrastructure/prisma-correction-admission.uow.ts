import { createHash, randomUUID } from "node:crypto";
import {
  Prisma,
  PrismaClient,
  VnextAudienceMode,
  VnextCommissionStatus,
  VnextComplianceStatus,
  VnextCreativeRunStatus,
  VnextCreativeTaskKind,
  VnextCreativeTaskStatus,
  VnextExperienceAuthState,
  VnextInputPolicy,
  VnextPrincipalKind,
  VnextProcessingPurpose,
  VnextReaderMemoryItemKind,
  VnextReaderMemoryItemStatus,
  VnextStoryWorkspaceStatus,
  VnextUnderstandingStatus,
  type VnextCreativeTask,
  type VnextSourceMessage,
} from "@prisma/client";
import {
  createActiveHardBoundarySnapshot,
  rehydrateActiveHardBoundarySnapshot,
} from "../domain/creative-runtime.port.js";
import {
  VnextCorrectionAdmissionConflictError,
  VnextCorrectionAdmissionNotFoundError,
  VnextCorrectionAdmissionStaleVersionError,
  type AdmitVnextCorrectionInput,
  type ResolveVnextCorrectionSafetyScopeInput,
  type VnextCorrectionAdmission,
  type VnextCorrectionAdmissionProbe,
  type VnextCorrectionAdmissionUow,
} from "../domain/correction-admission.uow.js";
import {
  createSourceMessageRequestDigest,
  validateSourceMessageInput,
  type CreateVnextSourceMessageInput,
} from "../domain/source-message.js";
import { lockCreativeTaskMutationWindow } from "./prisma-creative-task-mutation-fence.js";

const TRANSACTION_ATTEMPTS = 3;
const UNDERSTAND_DEADLINE_MS = 180_000;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const SYNTHETIC_FIXTURE_EVIDENCE_PATTERN =
  /^fixture:[A-Za-z0-9][A-Za-z0-9._-]{0,63}:sha256:([0-9a-f]{64})$/;
const ACTIVE_TASK_STATUSES = [
  VnextCreativeTaskStatus.QUEUED,
  VnextCreativeTaskStatus.LEASED,
  VnextCreativeTaskStatus.RETRY_WAIT,
] as const;

type CorrectionUnderstandArtifacts = {
  readonly schemaVersion: 2;
  readonly kind: "understand";
  readonly sourceMessage: {
    readonly id: string;
    readonly requestDigest: string;
  };
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
  readonly hardBoundaries: ReturnType<typeof plainSnapshot>;
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
    throw new Error("correction admission clock returned an invalid date");
  }
  return new Date(now.getTime());
}

function requireSyntheticFixtureEvidence(content: string, evidenceRef: string) {
  const match = SYNTHETIC_FIXTURE_EVIDENCE_PATTERN.exec(evidenceRef);
  const contentDigest = createHash("sha256").update(content).digest("hex");
  if (match?.[1] !== contentDigest) {
    throw new Error("synthetic fixture evidence is invalid");
  }
  return evidenceRef;
}

function exactRecord(value: unknown, fields: readonly string[]) {
  try {
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null)
    ) {
      return null;
    }
    const record = value as Record<string, unknown>;
    const keys = Reflect.ownKeys(record);
    if (
      keys.length !== fields.length ||
      keys.some((key) => typeof key !== "string" || !fields.includes(key))
    ) {
      return null;
    }
    if (
      keys.some((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(record, key);
        return descriptor === undefined || !("value" in descriptor);
      })
    ) {
      return null;
    }
    return record;
  } catch {
    return null;
  }
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
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

async function requireActiveSyntheticSession(
  client: Pick<Prisma.TransactionClient, "vnextExperienceSession">,
  ownerPrincipalId: string,
  experienceSessionId: string,
  now: Date,
) {
  const session = await client.vnextExperienceSession.findFirst({
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
    throw new VnextCorrectionAdmissionNotFoundError();
  }
  return session;
}

async function readOwnedBasis(
  client: Pick<Prisma.TransactionClient, "vnextUnderstandingDraft">,
  input: ResolveVnextCorrectionSafetyScopeInput,
) {
  return client.vnextUnderstandingDraft.findFirst({
    where: {
      id: input.basedOnUnderstandingId,
      ownerPrincipalId: input.ownerPrincipalId,
      workspace: {
        ownerPrincipalId: input.ownerPrincipalId,
        originSourceMessage: {
          experienceSessionId: input.experienceSessionId,
          ownerPrincipalId: input.ownerPrincipalId,
        },
      },
    },
    select: {
      version: true,
      workspaceId: true,
      commissionBrief: { select: { id: true } },
    },
  });
}

async function readActiveBoundarySnapshot(
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

function sourceMatches(
  source: VnextSourceMessage,
  input: CreateVnextSourceMessageInput,
  requestDigest: string,
) {
  return (
    source.ownerPrincipalId === input.ownerPrincipalId &&
    source.experienceSessionId === input.experienceSessionId &&
    source.clientRequestId === input.clientRequestId &&
    source.action === "CORRECTION" &&
    source.body === input.body &&
    source.basedOnUnderstandingId === input.basedOnUnderstandingId &&
    source.basedOnVersion === input.basedOnVersion &&
    source.requestDigest === requestDigest
  );
}

function correctionTaskMatches(
  task: VnextCreativeTask,
  source: VnextSourceMessage,
  input: AdmitVnextCorrectionInput,
  requestId: string,
  processingEvidenceRef: string,
) {
  const artifacts = exactRecord(task.inputArtifactVersions, [
    "schemaVersion",
    "kind",
    "sourceMessage",
    "workspace",
    "understanding",
    "commission",
    "hardBoundaries",
  ]);
  const sourceArtifact = exactRecord(artifacts?.sourceMessage, [
    "id",
    "requestDigest",
  ]);
  const workspaceArtifact = exactRecord(artifacts?.workspace, [
    "id",
    "aggregateVersion",
    "publicationDigest",
  ]);
  const understandingArtifact = exactRecord(artifacts?.understanding, [
    "id",
    "version",
    "payloadDigest",
  ]);
  const commissionArtifact = exactRecord(artifacts?.commission, [
    "id",
    "version",
    "payloadDigest",
  ]);
  if (
    task.ownerPrincipalId !== input.ownerPrincipalId ||
    task.sourceMessageId !== source.id ||
    task.workspaceId !== input.workspaceId ||
    task.understandingId !== input.basedOnUnderstandingId ||
    task.commissionId === null ||
    task.kind !== VnextCreativeTaskKind.UNDERSTAND ||
    task.processingPurpose !== VnextProcessingPurpose.SYNTHETIC_CREATIVE ||
    task.processingBasisRecordId !== null ||
    task.consentRecordId !== null ||
    task.processingCoverageKey !== null ||
    task.processingEvidenceRef !== processingEvidenceRef ||
    task.requestId !== requestId ||
    task.idempotencyKey !== requestId ||
    !HASH_PATTERN.test(task.inputDigest) ||
    artifacts === null ||
    artifacts.schemaVersion !== 2 ||
    artifacts.kind !== "understand" ||
    sourceArtifact === null ||
    sourceArtifact.id !== source.id ||
    sourceArtifact.requestDigest !== source.requestDigest ||
    workspaceArtifact === null ||
    workspaceArtifact.id !== task.workspaceId ||
    !positiveInteger(workspaceArtifact.aggregateVersion) ||
    !HASH_PATTERN.test(String(workspaceArtifact.publicationDigest)) ||
    understandingArtifact === null ||
    understandingArtifact.id !== task.understandingId ||
    understandingArtifact.version !== input.basedOnVersion ||
    !HASH_PATTERN.test(String(understandingArtifact.payloadDigest)) ||
    commissionArtifact === null ||
    commissionArtifact.id !== task.commissionId ||
    !positiveInteger(commissionArtifact.version) ||
    !HASH_PATTERN.test(String(commissionArtifact.payloadDigest))
  ) {
    return false;
  }
  try {
    const hardBoundaries = rehydrateActiveHardBoundarySnapshot(
      artifacts.hardBoundaries,
    );
    if (hardBoundaries.ownerPrincipalId !== input.ownerPrincipalId) {
      return false;
    }
    const canonical: CorrectionUnderstandArtifacts = {
      schemaVersion: 2,
      kind: "understand",
      sourceMessage: {
        id: String(sourceArtifact.id),
        requestDigest: String(sourceArtifact.requestDigest),
      },
      workspace: {
        id: String(workspaceArtifact.id),
        aggregateVersion: Number(workspaceArtifact.aggregateVersion),
        publicationDigest: String(workspaceArtifact.publicationDigest),
      },
      understanding: {
        id: String(understandingArtifact.id),
        version: Number(understandingArtifact.version),
        payloadDigest: String(understandingArtifact.payloadDigest),
      },
      commission: {
        id: String(commissionArtifact.id),
        version: Number(commissionArtifact.version),
        payloadDigest: String(commissionArtifact.payloadDigest),
      },
      hardBoundaries: plainSnapshot(hardBoundaries),
    };
    return task.inputDigest === digest(canonical);
  } catch {
    return false;
  }
}

async function readExactReplay(
  transaction: Prisma.TransactionClient,
  sourceInput: CreateVnextSourceMessageInput,
  input: AdmitVnextCorrectionInput,
  requestDigest: string,
  requestId: string,
  processingEvidenceRef: string,
  projectionVersionId: string,
): Promise<VnextCorrectionAdmission | null> {
  const source = await transaction.vnextSourceMessage.findUnique({
    where: {
      ownerPrincipalId_clientRequestId: {
        ownerPrincipalId: input.ownerPrincipalId,
        clientRequestId: input.clientRequestId,
      },
    },
  });
  if (!source) {
    return null;
  }
  const task = await transaction.vnextCreativeTask.findUnique({
    where: {
      ownerPrincipalId_requestId: {
        ownerPrincipalId: input.ownerPrincipalId,
        requestId,
      },
    },
  });
  if (
    task === null ||
    !sourceMatches(source, sourceInput, requestDigest) ||
    !correctionTaskMatches(
      task,
      source,
      input,
      requestId,
      processingEvidenceRef,
    )
  ) {
    throw new VnextCorrectionAdmissionConflictError();
  }
  return {
    sourceMessageId: source.id,
    taskId: task.id,
    projectionVersionId,
    creationDisposition: "replayed",
  };
}

async function readCurrentCorrectionBasis(
  transaction: Prisma.TransactionClient,
  input: AdmitVnextCorrectionInput,
) {
  const understanding = await transaction.vnextUnderstandingDraft.findFirst({
    where: {
      id: input.basedOnUnderstandingId,
      ownerPrincipalId: input.ownerPrincipalId,
      workspaceId: input.workspaceId,
      version: input.basedOnVersion,
      workspace: {
        ownerPrincipalId: input.ownerPrincipalId,
        originSourceMessage: {
          ownerPrincipalId: input.ownerPrincipalId,
          experienceSessionId: input.experienceSessionId,
        },
      },
    },
    include: {
      commissionBrief: true,
      supersededByUnderstanding: { select: { id: true } },
      workspace: true,
    },
  });
  if (
    !understanding ||
    understanding.supersededByUnderstanding !== null ||
    (understanding.status !== VnextUnderstandingStatus.PROPOSED &&
      understanding.status !== VnextUnderstandingStatus.CORRECTED &&
      understanding.status !== VnextUnderstandingStatus.CONFIRMED) ||
    !understanding.commissionBrief ||
    (understanding.commissionBrief.status !== VnextCommissionStatus.DRAFT &&
      understanding.commissionBrief.status !== VnextCommissionStatus.ACTIVE) ||
    (understanding.workspace.status !== VnextStoryWorkspaceStatus.FORMING &&
      understanding.workspace.status !== VnextStoryWorkspaceStatus.ACTIVE)
  ) {
    throw new VnextCorrectionAdmissionStaleVersionError();
  }
  return {
    understanding,
    commission: understanding.commissionBrief,
    workspace: understanding.workspace,
  };
}

async function cancelActiveOpeningWork(
  transaction: Prisma.TransactionClient,
  ownerPrincipalId: string,
  workspaceId: string,
  now: Date,
  probe: VnextCorrectionAdmissionProbe | undefined,
) {
  const tasks = await transaction.vnextCreativeTask.findMany({
    where: {
      ownerPrincipalId,
      workspaceId,
      kind: VnextCreativeTaskKind.WRITE_OPENING,
      status: { in: [...ACTIVE_TASK_STATUSES] },
    },
    select: { id: true, status: true },
    orderBy: [{ id: "asc" }],
  });
  const taskIds = tasks.map((task) => task.id);
  const leasedTaskIds = tasks
    .filter((task) => task.status === VnextCreativeTaskStatus.LEASED)
    .map((task) => task.id);
  const runningTraces =
    taskIds.length === 0
      ? []
      : await transaction.vnextCreativeRunTrace.findMany({
          where: {
            ownerPrincipalId,
            taskId: { in: taskIds },
            status: VnextCreativeRunStatus.RUNNING,
          },
          select: { id: true, taskId: true },
          orderBy: [{ id: "asc" }],
        });
  const leasedSet = new Set(leasedTaskIds);
  if (
    runningTraces.length !== leasedTaskIds.length ||
    new Set(runningTraces.map((trace) => trace.taskId)).size !==
      leasedTaskIds.length ||
    runningTraces.some((trace) => !leasedSet.has(trace.taskId))
  ) {
    throw new VnextCorrectionAdmissionConflictError();
  }
  if (taskIds.length > 0) {
    const cancelled = await transaction.vnextCreativeTask.updateMany({
      where: {
        id: { in: taskIds },
        ownerPrincipalId,
        workspaceId,
        kind: VnextCreativeTaskKind.WRITE_OPENING,
        status: { in: [...ACTIVE_TASK_STATUSES] },
      },
      data: {
        status: VnextCreativeTaskStatus.CANCELLED,
        cancellationRequestedAt: now,
        completedAt: now,
        leaseOwner: null,
        leaseToken: null,
        leaseExpiresAt: null,
        lastFailureCode: "understanding_corrected",
        stateVersion: { increment: 1 },
      },
    });
    if (cancelled.count !== taskIds.length) {
      throw new VnextCorrectionAdmissionConflictError();
    }
  }
  await probe?.afterWrite("after_opening_task_fence");

  if (runningTraces.length > 0) {
    const traceUpdate = await transaction.vnextCreativeRunTrace.updateMany({
      where: {
        id: { in: runningTraces.map((trace) => trace.id) },
        ownerPrincipalId,
        taskId: { in: leasedTaskIds },
        status: VnextCreativeRunStatus.RUNNING,
      },
      data: {
        status: VnextCreativeRunStatus.CANCELLED,
        retryable: false,
        failureCode: "understanding_corrected",
        completedAt: now,
      },
    });
    if (traceUpdate.count !== runningTraces.length) {
      throw new VnextCorrectionAdmissionConflictError();
    }
  }
  await probe?.afterWrite("after_running_trace_fence");
}

async function fenceExpiredCorrection(
  transaction: Prisma.TransactionClient,
  ownerPrincipalId: string,
  workspaceId: string,
  now: Date,
  activeCorrection:
    | {
        readonly id: string;
        readonly status: VnextCreativeTaskStatus;
        readonly deadlineAt: Date;
      }
    | null,
  probe: VnextCorrectionAdmissionProbe | undefined,
) {
  if (activeCorrection !== null) {
    if (activeCorrection.deadlineAt.getTime() > now.getTime()) {
      throw new VnextCorrectionAdmissionConflictError();
    }
    const runningTraces = await transaction.vnextCreativeRunTrace.findMany({
      where: {
        ownerPrincipalId,
        taskId: activeCorrection.id,
        status: VnextCreativeRunStatus.RUNNING,
      },
      select: { id: true },
    });
    if (
      (activeCorrection.status === VnextCreativeTaskStatus.LEASED &&
        runningTraces.length !== 1) ||
      (activeCorrection.status !== VnextCreativeTaskStatus.LEASED &&
        runningTraces.length !== 0)
    ) {
      throw new VnextCorrectionAdmissionConflictError();
    }
    const timedOut = await transaction.vnextCreativeTask.updateMany({
      where: {
        id: activeCorrection.id,
        ownerPrincipalId,
        workspaceId,
        kind: VnextCreativeTaskKind.UNDERSTAND,
        status: { in: [...ACTIVE_TASK_STATUSES] },
        deadlineAt: { lte: now },
      },
      data: {
        status: VnextCreativeTaskStatus.TIMED_OUT,
        completedAt: now,
        leaseOwner: null,
        leaseToken: null,
        leaseExpiresAt: null,
        lastFailureCode: "correction_deadline_expired",
        stateVersion: { increment: 1 },
      },
    });
    if (timedOut.count !== 1) {
      throw new VnextCorrectionAdmissionConflictError();
    }
    if (runningTraces.length === 1) {
      const traceUpdate = await transaction.vnextCreativeRunTrace.updateMany({
        where: {
          id: runningTraces[0]!.id,
          ownerPrincipalId,
          taskId: activeCorrection.id,
          status: VnextCreativeRunStatus.RUNNING,
        },
        data: {
          status: VnextCreativeRunStatus.TIMED_OUT,
          retryable: false,
          failureCode: "correction_deadline_expired",
          completedAt: now,
        },
      });
      if (traceUpdate.count !== 1) {
        throw new VnextCorrectionAdmissionConflictError();
      }
    }
  }
  await probe?.afterWrite("after_expired_correction_fence");
}

export class PrismaCorrectionAdmissionUow
  implements VnextCorrectionAdmissionUow
{
  constructor(
    private readonly client: PrismaClient,
    private readonly probe?: VnextCorrectionAdmissionProbe,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async resolveSafetyScope(input: ResolveVnextCorrectionSafetyScopeInput) {
    const now = currentTime(this.clock);
    await requireActiveSyntheticSession(
      this.client,
      input.ownerPrincipalId,
      input.experienceSessionId,
      now,
    );
    const basis = await readOwnedBasis(this.client, input);
    if (!basis || basis.commissionBrief === null) {
      throw new VnextCorrectionAdmissionStaleVersionError();
    }
    return {
      workspaceId: basis.workspaceId,
      basedOnVersion: basis.version,
    };
  }

  async admit(input: AdmitVnextCorrectionInput): Promise<VnextCorrectionAdmission> {
    const processingEvidenceRef = requireSyntheticFixtureEvidence(
      input.text,
      input.processingEvidenceRef,
    );
    const sourceInput = validateSourceMessageInput({
      action: "correction",
      basedOnUnderstandingId: input.basedOnUnderstandingId,
      basedOnVersion: input.basedOnVersion,
      body: input.text,
      clientRequestId: input.clientRequestId,
      experienceSessionId: input.experienceSessionId,
      ownerPrincipalId: input.ownerPrincipalId,
    });
    if (!positiveInteger(input.basedOnVersion)) {
      throw new VnextCorrectionAdmissionStaleVersionError();
    }
    const requestDigest = createSourceMessageRequestDigest(sourceInput);
    const requestId = `experience-correction:${requestDigest}:understand`;

    for (let attempt = 1; attempt <= TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.client.$transaction(
          async (transaction) => {
            const now = currentTime(this.clock);
            const session = await requireActiveSyntheticSession(
              transaction,
              input.ownerPrincipalId,
              input.experienceSessionId,
              now,
            );
            const replay = await readExactReplay(
              transaction,
              sourceInput,
              input,
              requestDigest,
              requestId,
              processingEvidenceRef,
              session.projectionVersionId,
            );
            if (replay) {
              return replay;
            }

            await lockCreativeTaskMutationWindow(transaction);
            const basis = await readCurrentCorrectionBasis(transaction, input);
            const [landedOpening, landedContent] = await Promise.all([
              transaction.vnextCreativeTask.findFirst({
                where: {
                  ownerPrincipalId: input.ownerPrincipalId,
                  workspaceId: input.workspaceId,
                  kind: VnextCreativeTaskKind.WRITE_OPENING,
                  status: VnextCreativeTaskStatus.SUCCEEDED,
                },
                select: { id: true },
              }),
              transaction.vnextStoryContent.findFirst({
                where: {
                  ownerPrincipalId: input.ownerPrincipalId,
                  workspaceId: input.workspaceId,
                },
                select: { id: true },
              }),
            ]);
            if (landedOpening !== null || landedContent !== null) {
              throw new VnextCorrectionAdmissionStaleVersionError();
            }
            const activeCorrection =
              await transaction.vnextCreativeTask.findFirst({
                where: {
                  ownerPrincipalId: input.ownerPrincipalId,
                  workspaceId: input.workspaceId,
                  understandingId: input.basedOnUnderstandingId,
                  commissionId: basis.commission.id,
                  kind: VnextCreativeTaskKind.UNDERSTAND,
                  status: { in: [...ACTIVE_TASK_STATUSES] },
                },
                select: { id: true, status: true, deadlineAt: true },
              });
            await fenceExpiredCorrection(
              transaction,
              input.ownerPrincipalId,
              input.workspaceId,
              now,
              activeCorrection,
              this.probe,
            );
            const collision = await transaction.vnextCreativeTask.findFirst({
              where: {
                ownerPrincipalId: input.ownerPrincipalId,
                OR: [{ requestId }, { idempotencyKey: requestId }],
              },
              select: { id: true },
            });
            if (collision) {
              throw new VnextCorrectionAdmissionConflictError();
            }

            await cancelActiveOpeningWork(
              transaction,
              input.ownerPrincipalId,
              input.workspaceId,
              now,
              this.probe,
            );

            const boundarySnapshot = plainSnapshot(
              await readActiveBoundarySnapshot(
                transaction,
                input.ownerPrincipalId,
                now,
              ),
            );
            const source = await transaction.vnextSourceMessage.create({
              data: {
                action: "CORRECTION",
                basedOnUnderstandingId: sourceInput.basedOnUnderstandingId,
                basedOnVersion: sourceInput.basedOnVersion,
                body: sourceInput.body,
                clientRequestId: sourceInput.clientRequestId,
                experienceSessionId: sourceInput.experienceSessionId,
                ownerPrincipalId: sourceInput.ownerPrincipalId,
                requestDigest,
              },
            });
            await this.probe?.afterWrite("after_source_message");

            const artifacts: CorrectionUnderstandArtifacts = {
              schemaVersion: 2,
              kind: "understand",
              sourceMessage: { id: source.id, requestDigest },
              workspace: {
                id: basis.workspace.id,
                aggregateVersion: basis.workspace.aggregateVersion,
                publicationDigest: basis.workspace.publicationDigest,
              },
              understanding: {
                id: basis.understanding.id,
                version: basis.understanding.version,
                payloadDigest: basis.understanding.payloadDigest,
              },
              commission: {
                id: basis.commission.id,
                version: basis.commission.version,
                payloadDigest: basis.commission.payloadDigest,
              },
              hardBoundaries: boundarySnapshot,
            };
            const task = await transaction.vnextCreativeTask.create({
              data: {
                ownerPrincipalId: input.ownerPrincipalId,
                sourceMessageId: source.id,
                workspaceId: basis.workspace.id,
                understandingId: basis.understanding.id,
                commissionId: basis.commission.id,
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
                  projectionVersionId: session.projectionVersionId,
                },
                data: { projectionVersionId },
              });
            if (projectionUpdated.count !== 1) {
              throw new VnextCorrectionAdmissionNotFoundError();
            }
            await this.probe?.afterWrite("after_projection_version");
            await this.probe?.afterWrite("before_commit");
            return {
              sourceMessageId: source.id,
              taskId: task.id,
              projectionVersionId,
              creationDisposition: "created" as const,
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
          (error.code === "P2002" || error.code === "P2034")
        ) {
          const recovered = await this.client.$transaction(
            async (transaction) => {
              const now = currentTime(this.clock);
              const session = await requireActiveSyntheticSession(
                transaction,
                input.ownerPrincipalId,
                input.experienceSessionId,
                now,
              );
              return readExactReplay(
                transaction,
                sourceInput,
                input,
                requestDigest,
                requestId,
                processingEvidenceRef,
                session.projectionVersionId,
              );
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
          );
          if (recovered) {
            return recovered;
          }
          throw new VnextCorrectionAdmissionConflictError();
        }
        throw error;
      }
    }
    throw new VnextCorrectionAdmissionConflictError();
  }
}
