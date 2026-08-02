import { createHash, randomUUID } from "node:crypto";
import {
  Prisma,
  PrismaClient,
  VnextAudienceMode,
  VnextComplianceStatus,
  VnextCreativeTaskKind,
  VnextCreativeTaskStatus,
  VnextExperienceAuthState,
  VnextInputPolicy,
  VnextPrincipalKind,
  type VnextCreativeTask,
} from "@prisma/client";
import {
  VnextExperienceRetryConflictError,
  VnextExperienceRetryNotFoundError,
  VnextExperienceRetryStaleVersionError,
  type RetryVnextExperienceTaskInput,
  type VnextExperienceRetry,
  type VnextExperienceRetryProbe,
  type VnextExperienceRetryUow,
} from "../domain/experience-retry.uow.js";
import type { VnextCreativeTaskKind as PublicTaskKind } from "../domain/experience-state.js";
import { isManualRetryEligibleFailure } from "../domain/manual-retry-policy.js";
import { assertVnextUuid } from "../domain/source-message.js";

const TRANSACTION_ATTEMPTS = 3;
const RETRY_DEADLINE_MS = 180_000;
const ACTIVE_TASK_STATUSES = [
  VnextCreativeTaskStatus.QUEUED,
  VnextCreativeTaskStatus.LEASED,
  VnextCreativeTaskStatus.RETRY_WAIT,
] as const;
const VERSION_PATTERN =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):([1-9][0-9]*)$/i;

function currentTime(clock: () => Date) {
  const now = clock();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("experience retry clock returned an invalid date");
  }
  return new Date(now.getTime());
}

function boundedNonEmpty(value: string, maximumCodePoints: number) {
  return value.trim().length > 0 && [...value].length <= maximumCodePoints;
}

function parseVersion(versionId: string) {
  const matched = VERSION_PATTERN.exec(versionId);
  if (!matched) {
    throw new VnextExperienceRetryStaleVersionError();
  }
  const stateVersion = Number(matched[2]);
  if (!Number.isSafeInteger(stateVersion)) {
    throw new VnextExperienceRetryStaleVersionError();
  }
  return { taskId: matched[1]!, stateVersion };
}

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function idempotencyKey(input: RetryVnextExperienceTaskInput) {
  return `experience-retry-key:${hash([
    input.ownerPrincipalId,
    input.experienceSessionId,
    input.clientRequestId,
  ])}`;
}

function requestId(input: RetryVnextExperienceTaskInput) {
  return `experience-retry:${hash([
    input.ownerPrincipalId,
    input.experienceSessionId,
    input.clientRequestId,
    input.basedOnVersionId,
  ])}`;
}

function jsonInput(value: Prisma.JsonValue) {
  const cloned = JSON.parse(JSON.stringify(value)) as unknown;
  if (cloned === null || typeof cloned !== "object") {
    throw new VnextExperienceRetryStaleVersionError();
  }
  return cloned as Prisma.InputJsonValue;
}

function sameJson(left: Prisma.JsonValue, right: Prisma.JsonValue) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function taskBelongsToSession(experienceSessionId: string) {
  return {
    OR: [
      { sourceMessage: { experienceSessionId } },
      { workspace: { originSourceMessage: { experienceSessionId } } },
    ],
  } satisfies Prisma.VnextCreativeTaskWhereInput;
}

type RetryTarget = VnextCreativeTask & {
  readonly runTraces: readonly {
    readonly failureCode: string | null;
    readonly retryable: boolean;
  }[];
};

function publicTaskKind(kind: VnextCreativeTaskKind): PublicTaskKind {
  switch (kind) {
    case VnextCreativeTaskKind.UNDERSTAND:
      return "understand";
    case VnextCreativeTaskKind.WRITE_OPENING:
      return "write_opening";
    case VnextCreativeTaskKind.REVISE:
      return "revise";
    case VnextCreativeTaskKind.CONTINUE_STORY:
      return "continue_story";
  }
}

function manualRetryTaskStatus(status: VnextCreativeTaskStatus) {
  if (status === VnextCreativeTaskStatus.FAILED) return "failed" as const;
  if (status === VnextCreativeTaskStatus.TIMED_OUT) return "timed_out" as const;
  return "other" as const;
}

function isRetryableTerminal(task: RetryTarget) {
  const lastRun = task.runTraces[0] ?? null;
  return isManualRetryEligibleFailure({
    taskKind: publicTaskKind(task.kind),
    taskStatus: manualRetryTaskStatus(task.status),
    taskFailureCode: task.lastFailureCode,
    lastRunFailureCode: lastRun?.failureCode ?? null,
    lastRunRetryable: lastRun?.retryable ?? false,
  });
}

function exactCloneMatches(
  clone: VnextCreativeTask,
  target: VnextCreativeTask,
  expectedRequestId: string,
  expectedIdempotencyKey: string,
) {
  return (
    clone.ownerPrincipalId === target.ownerPrincipalId &&
    clone.sourceMessageId === target.sourceMessageId &&
    clone.workspaceId === target.workspaceId &&
    clone.understandingId === target.understandingId &&
    clone.commissionId === target.commissionId &&
    clone.processingPurpose === target.processingPurpose &&
    clone.processingBasisRecordId === target.processingBasisRecordId &&
    clone.consentRecordId === target.consentRecordId &&
    clone.processingCoverageKey === target.processingCoverageKey &&
    clone.processingEvidenceRef === target.processingEvidenceRef &&
    clone.kind === target.kind &&
    clone.requestId === expectedRequestId &&
    clone.idempotencyKey === expectedIdempotencyKey &&
    clone.inputDigest === target.inputDigest &&
    sameJson(clone.inputArtifactVersions, target.inputArtifactVersions) &&
    clone.maxAttempts === target.maxAttempts
  );
}

async function requireActiveSyntheticSession(
  transaction: Prisma.TransactionClient,
  input: RetryVnextExperienceTaskInput,
  now: Date,
) {
  const session = await transaction.vnextExperienceSession.findFirst({
    where: {
      id: input.experienceSessionId,
      principalId: input.ownerPrincipalId,
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
    session.complianceSession.ownerPrincipalId !== input.ownerPrincipalId ||
    session.complianceSession.status !== VnextComplianceStatus.ELIGIBLE ||
    session.complianceSession.audienceMode !== VnextAudienceMode.INTERNAL ||
    session.complianceSession.inputPolicy !== VnextInputPolicy.SYNTHETIC_ONLY
  ) {
    throw new VnextExperienceRetryNotFoundError();
  }
  return session;
}

async function readTarget(
  transaction: Prisma.TransactionClient,
  input: RetryVnextExperienceTaskInput,
) {
  const parsed = parseVersion(input.basedOnVersionId);
  const task = await transaction.vnextCreativeTask.findFirst({
    where: {
      id: parsed.taskId,
      ownerPrincipalId: input.ownerPrincipalId,
      stateVersion: parsed.stateVersion,
      ...taskBelongsToSession(input.experienceSessionId),
    },
    include: {
      runTraces: {
        orderBy: { attemptNumber: "desc" },
        take: 1,
        select: { failureCode: true, retryable: true },
      },
    },
  });
  if (!task || !isRetryableTerminal(task)) {
    throw new VnextExperienceRetryStaleVersionError();
  }
  return task;
}

async function retryInTransaction(
  transaction: Prisma.TransactionClient,
  input: RetryVnextExperienceTaskInput,
  now: Date,
  probe: VnextExperienceRetryProbe | undefined,
): Promise<VnextExperienceRetry> {
  const session = await requireActiveSyntheticSession(transaction, input, now);
  const expectedIdempotencyKey = idempotencyKey(input);
  const expectedRequestId = requestId(input);
  const existing = await transaction.vnextCreativeTask.findUnique({
    where: {
      ownerPrincipalId_idempotencyKey: {
        ownerPrincipalId: input.ownerPrincipalId,
        idempotencyKey: expectedIdempotencyKey,
      },
    },
  });
  if (existing) {
    if (existing.requestId !== expectedRequestId) {
      throw new VnextExperienceRetryConflictError();
    }
    const target = await readTarget(transaction, input);
    if (
      !exactCloneMatches(
        existing,
        target,
        expectedRequestId,
        expectedIdempotencyKey,
      )
    ) {
      throw new VnextExperienceRetryConflictError();
    }
    return {
      taskId: existing.id,
      projectionVersionId: session.projectionVersionId,
      creationDisposition: "replayed",
    };
  }

  const target = await readTarget(transaction, input);
  const latest = await transaction.vnextCreativeTask.findFirst({
    where: {
      ownerPrincipalId: input.ownerPrincipalId,
      ...taskBelongsToSession(input.experienceSessionId),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      runTraces: {
        orderBy: { attemptNumber: "desc" },
        take: 1,
        select: { failureCode: true, retryable: true },
      },
    },
  });
  if (
    !latest ||
    latest.id !== target.id ||
    latest.stateVersion !== target.stateVersion ||
    !isRetryableTerminal(latest)
  ) {
    const active = await transaction.vnextCreativeTask.findFirst({
      where: {
        ownerPrincipalId: input.ownerPrincipalId,
        status: { in: [...ACTIVE_TASK_STATUSES] },
        ...taskBelongsToSession(input.experienceSessionId),
      },
      select: { id: true },
    });
    if (active) {
      throw new VnextExperienceRetryConflictError();
    }
    throw new VnextExperienceRetryStaleVersionError();
  }
  const active = await transaction.vnextCreativeTask.findFirst({
    where: {
      ownerPrincipalId: input.ownerPrincipalId,
      status: { in: [...ACTIVE_TASK_STATUSES] },
      ...taskBelongsToSession(input.experienceSessionId),
    },
    select: { id: true },
  });
  if (active) {
    throw new VnextExperienceRetryConflictError();
  }
  const collision = await transaction.vnextCreativeTask.findFirst({
    where: {
      ownerPrincipalId: input.ownerPrincipalId,
      OR: [
        { requestId: expectedRequestId },
        { idempotencyKey: expectedIdempotencyKey },
      ],
    },
    select: { id: true },
  });
  if (collision) {
    throw new VnextExperienceRetryConflictError();
  }

  const task = await transaction.vnextCreativeTask.create({
    data: {
      ownerPrincipalId: target.ownerPrincipalId,
      sourceMessageId: target.sourceMessageId,
      workspaceId: target.workspaceId,
      understandingId: target.understandingId,
      commissionId: target.commissionId,
      processingPurpose: target.processingPurpose,
      processingBasisRecordId: target.processingBasisRecordId,
      consentRecordId: target.consentRecordId,
      processingCoverageKey: target.processingCoverageKey,
      processingEvidenceRef: target.processingEvidenceRef,
      requestId: expectedRequestId,
      idempotencyKey: expectedIdempotencyKey,
      kind: target.kind,
      inputArtifactVersions: jsonInput(target.inputArtifactVersions),
      inputDigest: target.inputDigest,
      availableAt: now,
      deadlineAt: new Date(now.getTime() + RETRY_DEADLINE_MS),
      maxAttempts: target.maxAttempts,
    },
  });
  await probe?.afterWrite("after_retry_task");

  const projectionVersionId = randomUUID();
  const projectionUpdated = await transaction.vnextExperienceSession.updateMany({
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
    throw new VnextExperienceRetryNotFoundError();
  }
  await probe?.afterWrite("after_projection_version");
  await probe?.afterWrite("before_commit");
  return {
    taskId: task.id,
    projectionVersionId,
    creationDisposition: "created",
  };
}

export class PrismaExperienceRetryUow implements VnextExperienceRetryUow {
  constructor(
    private readonly client: PrismaClient,
    private readonly probe?: VnextExperienceRetryProbe,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async retry(
    input: RetryVnextExperienceTaskInput,
  ): Promise<VnextExperienceRetry> {
    assertVnextUuid(input.ownerPrincipalId, "ownerPrincipalId");
    assertVnextUuid(input.experienceSessionId, "experienceSessionId");
    if (!boundedNonEmpty(input.clientRequestId, 200)) {
      throw new Error(
        "clientRequestId must be non-empty and within the accepted limit",
      );
    }
    parseVersion(input.basedOnVersionId);

    for (let attempt = 1; attempt <= TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.client.$transaction(
          (transaction) =>
            retryInTransaction(
              transaction,
              input,
              currentTime(this.clock),
              this.probe,
            ),
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
          throw new VnextExperienceRetryConflictError();
        }
        throw error;
      }
    }
    throw new VnextExperienceRetryConflictError();
  }
}
