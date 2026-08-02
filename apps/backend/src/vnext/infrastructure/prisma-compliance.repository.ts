import { createHash, randomUUID } from "node:crypto";
import {
  Prisma,
  PrismaClient,
  VnextAudienceMode,
  VnextComplianceStatus,
  VnextConsentKind,
  VnextConsentStatus,
  VnextContinuousUseReceiptStatus,
  VnextCreativeRunStatus,
  VnextCreativeTaskStatus,
  VnextExperienceAuthState,
  VnextInputPolicy,
  VnextOutboxEventStatus,
  VnextProcessingBasisStatus,
  VnextProcessingPurpose,
  VnextSafetyCaseStatus,
  type VnextComplianceSession,
} from "@prisma/client";
import {
  ComplianceInvariantError,
  ComplianceOperationNotAllowedError,
  ComplianceResourceNotFoundError,
  ComplianceVersionConflictError,
  CONTINUOUS_USE_REMINDER_INTERVAL_MS,
  CONTINUOUS_USE_POLICY_VERSION,
  type AcknowledgeContinuousUseReceiptRecord,
  type AppealSafetyDecisionRecord,
  type CancelSessionCreativeTasksRecord,
  type ComplianceOwnerScope,
  type ComplianceProcessingPurpose,
  type ComplianceReadinessRepository,
  type ComplianceSessionStatus,
  type ConsentWithdrawalResult,
  type ContinuousUseAcknowledgement,
  type ContinuousUseEvaluation,
  type EvaluateContinuousUseRecord,
  type OwnedConsentView,
  type OwnedSafetyCaseView,
  type ProcessingBasisTransitionResult,
  type ReadOwnedSafetyCaseRecord,
  type SafetyAppealResult,
  type SessionExitResult,
  type TransitionProcessingBasisRecord,
  type WithdrawConsentRecord,
} from "../domain/compliance-readiness.js";
import { lockCreativeTaskMutationWindow } from "./prisma-creative-task-mutation-fence.js";

type ComplianceTransaction = Prisma.TransactionClient;

const PENDING_TASK_STATUSES = [
  VnextCreativeTaskStatus.QUEUED,
  VnextCreativeTaskStatus.RETRY_WAIT,
  VnextCreativeTaskStatus.LEASED,
] as const;
const TRANSACTION_ATTEMPTS = 3;
const DATA_CATEGORY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const CONTINUOUS_USE_RECEIPT_AGGREGATE =
  "continuous_use_reminder_receipt";
const CONTINUOUS_USE_EMITTED_EVENT =
  "vnext.continuous_use.reminder.emitted.v1";
const CONTINUOUS_USE_ACKNOWLEDGED_EVENT =
  "vnext.continuous_use.reminder.acknowledged.v1";
const CONTINUOUS_USE_ACKNOWLEDGEABLE_STATUSES: ReadonlySet<VnextComplianceStatus> =
  new Set([
    VnextComplianceStatus.ELIGIBLE,
    VnextComplianceStatus.BLOCKED,
    VnextComplianceStatus.WITHDRAWN,
  ]);

function jsonInput(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`;
}

function digestPayload(payload: unknown) {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

function exactJsonRecord(
  value: Prisma.JsonValue,
  fields: readonly string[],
): Record<string, Prisma.JsonValue> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== fields.length ||
    Object.keys(value).some((field) => !fields.includes(field))
  ) {
    throw new ComplianceInvariantError("lifecycle outbox payload is malformed");
  }
  return value as Record<string, Prisma.JsonValue>;
}

function canonicalDataCategories(
  value: Prisma.JsonValue,
  field: string,
): readonly string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) {
    throw new ComplianceInvariantError(`${field} is malformed`);
  }
  const categories: string[] = [];
  let previous: string | null = null;
  for (const item of value) {
    if (
      typeof item !== "string" ||
      !DATA_CATEGORY_PATTERN.test(item) ||
      (previous !== null && item <= previous)
    ) {
      throw new ComplianceInvariantError(`${field} is malformed`);
    }
    categories.push(item);
    previous = item;
  }
  return categories;
}

function consentScopeDataCategories(
  value: Prisma.JsonValue,
  expectedCoverageKey: string,
): readonly string[] {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 3 ||
    Object.keys(value).some(
      (field) =>
        !["schemaVersion", "coverageKey", "dataCategories"].includes(field),
    )
  ) {
    throw new ComplianceInvariantError("consent scope is malformed");
  }
  const scope = value as Record<string, Prisma.JsonValue>;
  if (
    scope.schemaVersion !== 1 ||
    scope.coverageKey !== expectedCoverageKey ||
    scope.dataCategories === undefined
  ) {
    throw new ComplianceInvariantError("consent scope is malformed");
  }
  return canonicalDataCategories(
    scope.dataCategories,
    "consent scope data categories",
  );
}

function sameDataCategories(
  left: readonly string[],
  right: readonly string[],
) {
  return (
    left.length === right.length &&
    left.every((category, index) => category === right[index])
  );
}

function nonNegativeInteger(value: Prisma.JsonValue | undefined) {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new ComplianceInvariantError("lifecycle outbox count is malformed");
  }
  return Number(value);
}

function replayComplianceStatus(value: Prisma.JsonValue | undefined) {
  if (
    typeof value !== "string" ||
    !["pending", "eligible", "withdrawn", "blocked", "expired"].includes(
      value,
    )
  ) {
    throw new ComplianceInvariantError("lifecycle outbox status is malformed");
  }
  return value as ComplianceSessionStatus;
}

function verifyLifecycleEventDigest(event: {
  readonly payload: Prisma.JsonValue;
  readonly payloadDigest: string;
}) {
  if (digestPayload(event.payload) !== event.payloadDigest) {
    throw new ComplianceInvariantError("lifecycle outbox digest is invalid");
  }
}

function purposeValue(
  purpose: VnextProcessingPurpose,
): ComplianceProcessingPurpose {
  switch (purpose) {
    case VnextProcessingPurpose.UNVERIFIED_MIGRATED:
      throw new ComplianceInvariantError(
        "unverified migrated tasks cannot own authority records",
      );
    case VnextProcessingPurpose.CORE_CREATIVE:
      return "core_creative";
    case VnextProcessingPurpose.EXTERNAL_EXPERIENCE:
      return "external_experience";
    case VnextProcessingPurpose.MODEL_TRAINING:
      return "model_training";
    case VnextProcessingPurpose.SYNTHETIC_CREATIVE:
      throw new ComplianceInvariantError(
        "synthetic processing cannot have a basis or consent record",
      );
  }
}

function complianceStatusValue(
  status: VnextComplianceStatus,
): ComplianceSessionStatus {
  return status.toLowerCase() as ComplianceSessionStatus;
}

function safetyStatusValue(status: VnextSafetyCaseStatus) {
  return status.toLowerCase() as OwnedSafetyCaseView["status"];
}

function appendAuditRef(value: Prisma.JsonValue, reference: string) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new ComplianceInvariantError("compliance audit refs are malformed");
  }
  return [...value, reference];
}

function transactionConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}

function uniqueConstraintConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function continuousUseUnavailable(
  compliance: {
    readonly status: VnextComplianceStatus;
    readonly experienceSession: {
      readonly revokedAt: Date | null;
      readonly authState: VnextExperienceAuthState;
      readonly guestExpiresAt: Date;
      readonly expiresAt: Date;
    };
  },
  now: Date,
) {
  return (
    compliance.status === VnextComplianceStatus.EXPIRED ||
    compliance.experienceSession.revokedAt !== null ||
    compliance.experienceSession.authState ===
      VnextExperienceAuthState.EXPIRED ||
    compliance.experienceSession.guestExpiresAt.getTime() <= now.getTime() ||
    compliance.experienceSession.expiresAt.getTime() <= now.getTime()
  );
}

interface ContinuousUseReceiptEvidence {
  readonly id: string;
  readonly ownerPrincipalId: string;
  readonly experienceSessionId: string;
  readonly complianceSessionId: string;
  readonly status: VnextContinuousUseReceiptStatus;
  readonly policyVersion: string;
  readonly intervalSeconds: number;
  readonly windowStartedAt: Date;
  readonly dueAt: Date;
  readonly emittedAt: Date;
  readonly acknowledgedAt: Date | null;
  readonly emissionEventId: string;
  readonly acknowledgementEventId: string | null;
  readonly version: number;
}

function verifyContinuousUseReceiptShape(
  receipt: ContinuousUseReceiptEvidence,
) {
  if (
    receipt.policyVersion !== CONTINUOUS_USE_POLICY_VERSION ||
    !Number.isSafeInteger(receipt.intervalSeconds) ||
    receipt.intervalSeconds < 1 ||
    receipt.intervalSeconds > CONTINUOUS_USE_REMINDER_INTERVAL_MS / 1_000 ||
    receipt.dueAt.getTime() !==
      receipt.windowStartedAt.getTime() + receipt.intervalSeconds * 1_000 ||
    receipt.emittedAt.getTime() < receipt.dueAt.getTime()
  ) {
    throw new ComplianceInvariantError(
      "continuous-use receipt policy evidence is invalid",
    );
  }
}

async function verifyContinuousUseEmission(
  transaction: ComplianceTransaction,
  receipt: ContinuousUseReceiptEvidence,
) {
  verifyContinuousUseReceiptShape(receipt);
  const event = await transaction.vnextOutboxEvent.findUnique({
    where: { id: receipt.emissionEventId },
  });
  const payload = event
    ? exactJsonRecord(event.payload, [
        "receiptId",
        "experienceSessionId",
        "receiptVersion",
        "emittedAt",
        "intervalSeconds",
      ])
    : null;
  if (
    event === null ||
    event.ownerPrincipalId !== receipt.ownerPrincipalId ||
    event.taskId !== null ||
    event.aggregateType !== CONTINUOUS_USE_RECEIPT_AGGREGATE ||
    event.aggregateId !== receipt.id ||
    event.aggregateVersion !== 1 ||
    event.eventType !== CONTINUOUS_USE_EMITTED_EVENT ||
    event.idempotencyKey !==
      `continuous-use-reminder:emitted:${receipt.id}:1` ||
    event.status !== VnextOutboxEventStatus.PENDING ||
    event.attemptCount !== 0 ||
    event.maxAttempts !== 10 ||
    event.availableAt.getTime() !== receipt.emittedAt.getTime() ||
    event.leaseOwner !== null ||
    event.leaseToken !== null ||
    event.leaseExpiresAt !== null ||
    event.publishedAt !== null ||
    event.lastFailureCode !== null ||
    payload?.receiptId !== receipt.id ||
    payload.experienceSessionId !== receipt.experienceSessionId ||
    payload.receiptVersion !== 1 ||
    payload.emittedAt !== receipt.emittedAt.toISOString() ||
    payload.intervalSeconds !== receipt.intervalSeconds
  ) {
    throw new ComplianceInvariantError(
      "continuous-use receipt emission evidence is invalid",
    );
  }
  verifyLifecycleEventDigest(event);
}

async function verifyContinuousUseAcknowledgement(
  transaction: ComplianceTransaction,
  receipt: ContinuousUseReceiptEvidence,
) {
  if (
    receipt.status !== VnextContinuousUseReceiptStatus.ACKNOWLEDGED ||
    receipt.version !== 2 ||
    receipt.acknowledgedAt === null ||
    receipt.acknowledgementEventId === null
  ) {
    throw new ComplianceInvariantError(
      "continuous-use acknowledgement state is invalid",
    );
  }
  const event = await transaction.vnextOutboxEvent.findUnique({
    where: { id: receipt.acknowledgementEventId },
  });
  const payload = event
    ? exactJsonRecord(event.payload, [
        "receiptId",
        "experienceSessionId",
        "receiptVersion",
        "acknowledgedAt",
      ])
    : null;
  if (
    event === null ||
    event.ownerPrincipalId !== receipt.ownerPrincipalId ||
    event.taskId !== null ||
    event.aggregateType !== CONTINUOUS_USE_RECEIPT_AGGREGATE ||
    event.aggregateId !== receipt.id ||
    event.aggregateVersion !== 2 ||
    event.eventType !== CONTINUOUS_USE_ACKNOWLEDGED_EVENT ||
    event.idempotencyKey !==
      `continuous-use-reminder:acknowledged:${receipt.id}:2` ||
    event.status !== VnextOutboxEventStatus.PENDING ||
    event.attemptCount !== 0 ||
    event.maxAttempts !== 10 ||
    event.availableAt.getTime() !== receipt.acknowledgedAt.getTime() ||
    event.leaseOwner !== null ||
    event.leaseToken !== null ||
    event.leaseExpiresAt !== null ||
    event.publishedAt !== null ||
    event.lastFailureCode !== null ||
    payload?.receiptId !== receipt.id ||
    payload.experienceSessionId !== receipt.experienceSessionId ||
    payload.receiptVersion !== 2 ||
    payload.acknowledgedAt !== receipt.acknowledgedAt.toISOString()
  ) {
    throw new ComplianceInvariantError(
      "continuous-use acknowledgement evidence is invalid",
    );
  }
  verifyLifecycleEventDigest(event);
}

function requiredForSession(
  compliance: Pick<
    VnextComplianceSession,
    "audienceMode" | "inputPolicy"
  >,
  purpose: VnextProcessingPurpose,
  authority:
    | { readonly kind: "basis" }
    | {
        readonly kind: "consent";
        readonly consentKind: VnextConsentKind;
      },
) {
  if (
    authority.kind === "consent" &&
    authority.consentKind !== VnextConsentKind.REQUIRED
  ) {
    return false;
  }
  if (purpose === VnextProcessingPurpose.MODEL_TRAINING) {
    return false;
  }
  if (purpose === VnextProcessingPurpose.EXTERNAL_EXPERIENCE) {
    return compliance.audienceMode === VnextAudienceMode.VERIFIED_ADULT_EXTERNAL;
  }
  return compliance.inputPolicy === VnextInputPolicy.REAL_INPUT;
}

function restrictedStatusAfterAuthorityLoss(
  status: VnextComplianceStatus,
  loss: "consent" | "processing_basis",
) {
  if (
    status === VnextComplianceStatus.BLOCKED ||
    status === VnextComplianceStatus.EXPIRED ||
    status === VnextComplianceStatus.WITHDRAWN
  ) {
    return status;
  }
  return loss === "consent"
    ? VnextComplianceStatus.WITHDRAWN
    : VnextComplianceStatus.BLOCKED;
}

async function createOutboxEvent(
  transaction: ComplianceTransaction,
  input: {
    readonly eventId: string;
    readonly ownerPrincipalId: string;
    readonly aggregateType: string;
    readonly aggregateId: string;
    readonly aggregateVersion: number;
    readonly eventType: string;
    readonly idempotencyKey: string;
    readonly payload: unknown;
    readonly now: Date;
  },
) {
  await transaction.vnextOutboxEvent.create({
    data: {
      id: input.eventId,
      ownerPrincipalId: input.ownerPrincipalId,
      taskId: null,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      aggregateVersion: input.aggregateVersion,
      eventType: input.eventType,
      idempotencyKey: input.idempotencyKey,
      payload: jsonInput(input.payload),
      payloadDigest: digestPayload(input.payload),
      status: VnextOutboxEventStatus.PENDING,
      availableAt: input.now,
    },
  });
}

async function cancelOwnedPendingTasks(
  transaction: ComplianceTransaction,
  input: {
    readonly ownerPrincipalId: string;
    readonly scope: Prisma.VnextCreativeTaskWhereInput;
    readonly now: Date;
    readonly failureCode: string;
  },
) {
  const candidates = await transaction.vnextCreativeTask.findMany({
    where: {
      ownerPrincipalId: input.ownerPrincipalId,
      status: { in: [...PENDING_TASK_STATUSES] },
      ...input.scope,
    },
    select: { id: true, status: true },
    orderBy: { id: "asc" },
  });
  if (candidates.length === 0) {
    return [];
  }
  const candidateIds = candidates.map((task) => task.id);
  const leasedIds = candidates
    .filter((task) => task.status === VnextCreativeTaskStatus.LEASED)
    .map((task) => task.id);
  const runningTraces = await transaction.vnextCreativeRunTrace.findMany({
    where: {
      ownerPrincipalId: input.ownerPrincipalId,
      taskId: { in: candidateIds },
      status: VnextCreativeRunStatus.RUNNING,
    },
    select: { id: true, taskId: true },
    orderBy: { id: "asc" },
  });
  const leasedIdSet = new Set(leasedIds);
  if (
    runningTraces.length !== leasedIds.length ||
    runningTraces.some((trace) => !leasedIdSet.has(trace.taskId)) ||
    new Set(runningTraces.map((trace) => trace.taskId)).size !== leasedIds.length
  ) {
    throw new ComplianceInvariantError(
      "pending task and running trace state are inconsistent",
    );
  }
  const cancelled = await transaction.vnextCreativeTask.updateMany({
    where: {
      id: { in: candidateIds },
      ownerPrincipalId: input.ownerPrincipalId,
      status: { in: [...PENDING_TASK_STATUSES] },
      ...input.scope,
    },
    data: {
      status: VnextCreativeTaskStatus.CANCELLED,
      cancellationRequestedAt: input.now,
      completedAt: input.now,
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
      lastFailureCode: input.failureCode,
      stateVersion: { increment: 1 },
    },
  });
  if (cancelled.count !== candidateIds.length) {
    throw new ComplianceVersionConflictError("task cancellation lost CAS");
  }
  if (runningTraces.length > 0) {
    const traceUpdate = await transaction.vnextCreativeRunTrace.updateMany({
      where: {
        id: { in: runningTraces.map((trace) => trace.id) },
        ownerPrincipalId: input.ownerPrincipalId,
        taskId: { in: leasedIds },
        status: VnextCreativeRunStatus.RUNNING,
      },
      data: {
        status: VnextCreativeRunStatus.CANCELLED,
        retryable: false,
        failureCode: input.failureCode,
        completedAt: input.now,
      },
    });
    if (traceUpdate.count !== runningTraces.length) {
      throw new ComplianceVersionConflictError("trace cancellation lost CAS");
    }
  }
  return candidateIds;
}

async function cancelTasksBoundToAuthority(
  transaction: ComplianceTransaction,
  input: {
    readonly ownerPrincipalId: string;
    readonly recordKind: "consent" | "processing_basis";
    readonly recordId: string;
    readonly now: Date;
    readonly failureCode: string;
  },
) {
  return cancelOwnedPendingTasks(transaction, {
    ownerPrincipalId: input.ownerPrincipalId,
    scope:
      input.recordKind === "consent"
        ? { consentRecordId: input.recordId }
        : { processingBasisRecordId: input.recordId },
    now: input.now,
    failureCode: input.failureCode,
  });
}

async function hasAlternativeAuthority(
  transaction: ComplianceTransaction,
  input: {
    readonly ownerPrincipalId: string;
    readonly complianceSessionId: string;
    readonly purpose: VnextProcessingPurpose;
    readonly coverageKey: string;
    readonly dataCategories: readonly string[];
    readonly excludedConsentId?: string;
    readonly excludedBasisId?: string;
    readonly now: Date;
  },
) {
  const [bases, consents] = await Promise.all([
    input.purpose === VnextProcessingPurpose.MODEL_TRAINING
      ? Promise.resolve([])
      : transaction.vnextProcessingBasisRecord.findMany({
          where: {
            ownerPrincipalId: input.ownerPrincipalId,
            complianceSessionId: input.complianceSessionId,
            purpose: input.purpose,
            coverageKey: input.coverageKey,
            status: VnextProcessingBasisStatus.ACTIVE,
            effectiveAt: { lte: input.now },
            revokedOrExpiredAt: null,
            ...(input.excludedBasisId
              ? { id: { not: input.excludedBasisId } }
              : {}),
          },
          select: { dataCategories: true },
        }),
    transaction.vnextConsentRecord.findMany({
      where: {
        ownerPrincipalId: input.ownerPrincipalId,
        complianceSessionId: input.complianceSessionId,
        purpose: input.purpose,
        coverageKey: input.coverageKey,
        consentKind: VnextConsentKind.REQUIRED,
        status: VnextConsentStatus.ACTIVE,
        grantedAt: { lte: input.now },
        withdrawnAt: null,
        ...(input.excludedConsentId
          ? { id: { not: input.excludedConsentId } }
          : {}),
      },
      select: { scope: true },
    }),
  ]);
  return (
    bases.some((basis) =>
      sameDataCategories(
        canonicalDataCategories(
          basis.dataCategories,
          "processing basis data categories",
        ),
        input.dataCategories,
      ),
    ) ||
    consents.some((consent) =>
      sameDataCategories(
        consentScopeDataCategories(consent.scope, input.coverageKey),
        input.dataCategories,
      ),
    )
  );
}

async function rotateProjection(
  transaction: ComplianceTransaction,
  ownerPrincipalId: string,
  experienceSessionId: string,
) {
  const rotated = await transaction.vnextExperienceSession.updateMany({
    where: { id: experienceSessionId, principalId: ownerPrincipalId },
    data: { projectionVersionId: randomUUID() },
  });
  if (rotated.count !== 1) {
    throw new ComplianceInvariantError("owned experience session disappeared");
  }
}

export class PrismaComplianceRepository
  implements ComplianceReadinessRepository
{
  constructor(private readonly client: PrismaClient) {}

  private async requireOwnedComplianceScope(input: ComplianceOwnerScope) {
    const compliance = await this.client.vnextComplianceSession.findFirst({
      where: {
        ownerPrincipalId: input.ownerPrincipalId,
        experienceSessionId: input.experienceSessionId,
      },
      select: { id: true },
    });
    if (!compliance) {
      throw new ComplianceResourceNotFoundError("compliance scope not found");
    }
    return compliance;
  }

  async listOwnedConsents(
    input: ComplianceOwnerScope,
  ): Promise<readonly OwnedConsentView[]> {
    const compliance = await this.requireOwnedComplianceScope(input);
    const consents = await this.client.vnextConsentRecord.findMany({
      where: {
        ownerPrincipalId: input.ownerPrincipalId,
        complianceSessionId: compliance.id,
        complianceSession: {
          is: {
            ownerPrincipalId: input.ownerPrincipalId,
            experienceSessionId: input.experienceSessionId,
          },
        },
      },
      select: {
        id: true,
        purpose: true,
        consentKind: true,
        status: true,
        version: true,
        grantedAt: true,
        withdrawnAt: true,
      },
      orderBy: [{ grantedAt: "asc" }, { id: "asc" }],
    });
    return consents.map((consent) => ({
      id: consent.id,
      purpose: purposeValue(consent.purpose),
      kind: consent.consentKind.toLowerCase() as OwnedConsentView["kind"],
      status: consent.status.toLowerCase() as OwnedConsentView["status"],
      version: consent.version,
      grantedAt: consent.grantedAt,
      withdrawnAt: consent.withdrawnAt,
    }));
  }

  private async serializable<T>(
    operation: (transaction: ComplianceTransaction) => Promise<T>,
  ) {
    for (let attempt = 1; attempt <= TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.client.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (transactionConflict(error) && attempt < TRANSACTION_ATTEMPTS) {
          continue;
        }
        throw error;
      }
    }
    throw new ComplianceInvariantError("transaction retry budget exhausted");
  }

  private async loadCompliance(
    transaction: ComplianceTransaction,
    ownerPrincipalId: string,
    experienceSessionId: string,
  ) {
    const compliance = await transaction.vnextComplianceSession.findFirst({
      where: { ownerPrincipalId, experienceSessionId },
      include: {
        experienceSession: {
          select: {
            revokedAt: true,
            authState: true,
            expiresAt: true,
            guestExpiresAt: true,
          },
        },
      },
    });
    if (!compliance) {
      throw new ComplianceResourceNotFoundError("compliance scope not found");
    }
    return compliance;
  }

  async withdrawConsent(
    input: WithdrawConsentRecord,
  ): Promise<ConsentWithdrawalResult> {
    return this.serializable(async (transaction) => {
      await lockCreativeTaskMutationWindow(transaction);
      const compliance = await this.loadCompliance(
        transaction,
        input.ownerPrincipalId,
        input.experienceSessionId,
      );
      const consent = await transaction.vnextConsentRecord.findFirst({
        where: {
          id: input.consentRecordId,
          ownerPrincipalId: input.ownerPrincipalId,
          complianceSessionId: compliance.id,
        },
      });
      if (!consent) {
        throw new ComplianceResourceNotFoundError("consent not found");
      }
      const purpose = purposeValue(consent.purpose);
      if (consent.status === VnextConsentStatus.WITHDRAWN) {
        if (
          input.expectedVersion !== consent.version &&
          input.expectedVersion !== consent.version - 1
        ) {
          throw new ComplianceVersionConflictError("stale consent version");
        }
        const replayKey = `consent-withdrawn:${consent.id}:${consent.version}`;
        const event = await transaction.vnextOutboxEvent.findUnique({
          where: {
            ownerPrincipalId_idempotencyKey: {
              ownerPrincipalId: input.ownerPrincipalId,
              idempotencyKey: replayKey,
            },
          },
          select: {
            aggregateType: true,
            aggregateId: true,
            aggregateVersion: true,
            eventType: true,
            payload: true,
            payloadDigest: true,
          },
        });
        if (
          !event ||
          event.aggregateType !== "consent_record" ||
          event.aggregateId !== consent.id ||
          event.aggregateVersion !== consent.version ||
          event.eventType !== "vnext.consent.withdrawn.v1"
        ) {
          throw new ComplianceInvariantError(
            "consent withdrawal replay evidence is missing",
          );
        }
        verifyLifecycleEventDigest(event);
        const payload = exactJsonRecord(event.payload, [
          "consentRecordId",
          "experienceSessionId",
          "purpose",
          "complianceStatus",
          "cancelledTaskCount",
          "withdrawnAt",
        ]);
        if (
          payload.consentRecordId !== consent.id ||
          payload.experienceSessionId !== input.experienceSessionId ||
          payload.purpose !== purpose
        ) {
          throw new ComplianceInvariantError(
            "consent withdrawal replay evidence is out of scope",
          );
        }
        return {
          disposition: "replayed",
          recordVersion: consent.version,
          purpose,
          cancelledTaskCount: nonNegativeInteger(payload.cancelledTaskCount),
          complianceStatus: replayComplianceStatus(payload.complianceStatus),
        };
      }
      if (consent.version !== input.expectedVersion) {
        throw new ComplianceVersionConflictError("stale consent version");
      }
      const required = requiredForSession(compliance, consent.purpose, {
        kind: "consent",
        consentKind: consent.consentKind,
      });
      const dataCategories = consentScopeDataCategories(
        consent.scope,
        consent.coverageKey,
      );
      const updated = await transaction.vnextConsentRecord.updateMany({
        where: {
          id: consent.id,
          ownerPrincipalId: input.ownerPrincipalId,
          complianceSessionId: compliance.id,
          status: VnextConsentStatus.ACTIVE,
          version: input.expectedVersion,
          withdrawnAt: null,
        },
        data: {
          status: VnextConsentStatus.WITHDRAWN,
          withdrawnAt: input.now,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new ComplianceVersionConflictError("consent transition lost CAS");
      }
      const cancelledTaskIds = await cancelTasksBoundToAuthority(transaction, {
        ownerPrincipalId: input.ownerPrincipalId,
        recordKind: "consent",
        recordId: consent.id,
        now: input.now,
        failureCode: "consent_withdrawn",
      });
      const alternative = required
        ? await hasAlternativeAuthority(transaction, {
            ownerPrincipalId: input.ownerPrincipalId,
            complianceSessionId: compliance.id,
            purpose: consent.purpose,
            coverageKey: consent.coverageKey,
            dataCategories,
            excludedConsentId: consent.id,
            now: input.now,
          })
        : false;
      const nextStatus =
        required && !alternative
          ? restrictedStatusAfterAuthorityLoss(compliance.status, "consent")
          : compliance.status;
      const eventId = randomUUID();
      const auditRef = `outbox:${eventId}`;
      const complianceUpdate = await transaction.vnextComplianceSession.updateMany({
        where: {
          id: compliance.id,
          ownerPrincipalId: input.ownerPrincipalId,
          experienceSessionId: input.experienceSessionId,
          version: compliance.version,
        },
        data: {
          status: nextStatus,
          auditRefs: jsonInput(appendAuditRef(compliance.auditRefs, auditRef)),
          version: { increment: 1 },
        },
      });
      if (complianceUpdate.count !== 1) {
        throw new ComplianceVersionConflictError("compliance transition lost CAS");
      }
      const recordVersion = consent.version + 1;
      const payload = {
        consentRecordId: consent.id,
        experienceSessionId: input.experienceSessionId,
        purpose,
        complianceStatus: complianceStatusValue(nextStatus),
        cancelledTaskCount: cancelledTaskIds.length,
        withdrawnAt: input.now.toISOString(),
      };
      await createOutboxEvent(transaction, {
        eventId,
        ownerPrincipalId: input.ownerPrincipalId,
        aggregateType: "consent_record",
        aggregateId: consent.id,
        aggregateVersion: recordVersion,
        eventType: "vnext.consent.withdrawn.v1",
        idempotencyKey: `consent-withdrawn:${consent.id}:${recordVersion}`,
        payload,
        now: input.now,
      });
      await rotateProjection(
        transaction,
        input.ownerPrincipalId,
        input.experienceSessionId,
      );
      return {
        disposition: "withdrawn",
        recordVersion,
        purpose,
        cancelledTaskCount: cancelledTaskIds.length,
        complianceStatus: complianceStatusValue(nextStatus),
      };
    });
  }

  async transitionProcessingBasis(
    input: TransitionProcessingBasisRecord,
  ): Promise<ProcessingBasisTransitionResult> {
    return this.serializable(async (transaction) => {
      await lockCreativeTaskMutationWindow(transaction);
      const compliance = await this.loadCompliance(
        transaction,
        input.ownerPrincipalId,
        input.experienceSessionId,
      );
      const basis = await transaction.vnextProcessingBasisRecord.findFirst({
        where: {
          id: input.processingBasisRecordId,
          ownerPrincipalId: input.ownerPrincipalId,
          complianceSessionId: compliance.id,
        },
      });
      if (!basis) {
        throw new ComplianceResourceNotFoundError("processing basis not found");
      }
      const purpose = purposeValue(basis.purpose);
      if (purpose === "model_training") {
        throw new ComplianceInvariantError(
          "model training must be governed by optional consent",
        );
      }
      const targetStatus =
        input.transition === "expired"
          ? VnextProcessingBasisStatus.EXPIRED
          : VnextProcessingBasisStatus.REVOKED;
      if (basis.status !== VnextProcessingBasisStatus.ACTIVE) {
        if (
          basis.status !== targetStatus ||
          (input.expectedVersion !== basis.version &&
            input.expectedVersion !== basis.version - 1)
        ) {
          throw new ComplianceVersionConflictError(
            "processing basis already transitioned differently",
          );
        }
        const replayKey = `processing-basis-${input.transition}:${basis.id}:${basis.version}`;
        const event = await transaction.vnextOutboxEvent.findUnique({
          where: {
            ownerPrincipalId_idempotencyKey: {
              ownerPrincipalId: input.ownerPrincipalId,
              idempotencyKey: replayKey,
            },
          },
          select: {
            aggregateType: true,
            aggregateId: true,
            aggregateVersion: true,
            eventType: true,
            payload: true,
            payloadDigest: true,
          },
        });
        if (
          !event ||
          event.aggregateType !== "processing_basis_record" ||
          event.aggregateId !== basis.id ||
          event.aggregateVersion !== basis.version ||
          event.eventType !==
            `vnext.processing_basis.${input.transition}.v1`
        ) {
          throw new ComplianceInvariantError(
            "processing-basis replay evidence is missing",
          );
        }
        verifyLifecycleEventDigest(event);
        const payload = exactJsonRecord(event.payload, [
          "processingBasisRecordId",
          "experienceSessionId",
          "purpose",
          "transition",
          "authorizationRef",
          "complianceStatus",
          "cancelledTaskCount",
          "transitionedAt",
        ]);
        if (
          payload.processingBasisRecordId !== basis.id ||
          payload.experienceSessionId !== input.experienceSessionId ||
          payload.purpose !== purpose ||
          payload.transition !== input.transition ||
          payload.authorizationRef !== input.authorizationRef
        ) {
          throw new ComplianceVersionConflictError(
            "processing-basis replay authority conflict",
          );
        }
        return {
          disposition: "replayed",
          recordVersion: basis.version,
          purpose,
          transition: input.transition,
          cancelledTaskCount: nonNegativeInteger(payload.cancelledTaskCount),
          complianceStatus: replayComplianceStatus(payload.complianceStatus),
        };
      }
      if (basis.version !== input.expectedVersion) {
        throw new ComplianceVersionConflictError("stale processing-basis version");
      }
      const required = requiredForSession(compliance, basis.purpose, {
        kind: "basis",
      });
      const dataCategories = canonicalDataCategories(
        basis.dataCategories,
        "processing basis data categories",
      );
      const updated = await transaction.vnextProcessingBasisRecord.updateMany({
        where: {
          id: basis.id,
          ownerPrincipalId: input.ownerPrincipalId,
          complianceSessionId: compliance.id,
          status: VnextProcessingBasisStatus.ACTIVE,
          version: input.expectedVersion,
          revokedOrExpiredAt: null,
        },
        data: {
          status: targetStatus,
          revokedOrExpiredAt: input.now,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new ComplianceVersionConflictError(
          "processing-basis transition lost CAS",
        );
      }
      const cancelledTaskIds = await cancelTasksBoundToAuthority(transaction, {
        ownerPrincipalId: input.ownerPrincipalId,
        recordKind: "processing_basis",
        recordId: basis.id,
        now: input.now,
        failureCode: `processing_basis_${input.transition}`,
      });
      const alternative = required
        ? await hasAlternativeAuthority(transaction, {
            ownerPrincipalId: input.ownerPrincipalId,
            complianceSessionId: compliance.id,
            purpose: basis.purpose,
            coverageKey: basis.coverageKey,
            dataCategories,
            excludedBasisId: basis.id,
            now: input.now,
          })
        : false;
      const nextStatus =
        required && !alternative
          ? restrictedStatusAfterAuthorityLoss(
              compliance.status,
              "processing_basis",
            )
          : compliance.status;
      const eventId = randomUUID();
      const complianceUpdate = await transaction.vnextComplianceSession.updateMany({
        where: {
          id: compliance.id,
          ownerPrincipalId: input.ownerPrincipalId,
          experienceSessionId: input.experienceSessionId,
          version: compliance.version,
        },
        data: {
          status: nextStatus,
          auditRefs: jsonInput(
            appendAuditRef(compliance.auditRefs, `outbox:${eventId}`),
          ),
          version: { increment: 1 },
        },
      });
      if (complianceUpdate.count !== 1) {
        throw new ComplianceVersionConflictError("compliance transition lost CAS");
      }
      const recordVersion = basis.version + 1;
      const payload = {
        processingBasisRecordId: basis.id,
        experienceSessionId: input.experienceSessionId,
        purpose,
        transition: input.transition,
        authorizationRef: input.authorizationRef,
        complianceStatus: complianceStatusValue(nextStatus),
        cancelledTaskCount: cancelledTaskIds.length,
        transitionedAt: input.now.toISOString(),
      };
      await createOutboxEvent(transaction, {
        eventId,
        ownerPrincipalId: input.ownerPrincipalId,
        aggregateType: "processing_basis_record",
        aggregateId: basis.id,
        aggregateVersion: recordVersion,
        eventType: `vnext.processing_basis.${input.transition}.v1`,
        idempotencyKey: `processing-basis-${input.transition}:${basis.id}:${recordVersion}`,
        payload,
        now: input.now,
      });
      await rotateProjection(
        transaction,
        input.ownerPrincipalId,
        input.experienceSessionId,
      );
      return {
        disposition: "transitioned",
        recordVersion,
        purpose,
        transition: input.transition,
        cancelledTaskCount: cancelledTaskIds.length,
        complianceStatus: complianceStatusValue(nextStatus),
      };
    });
  }

  async evaluateContinuousUse(
    input: EvaluateContinuousUseRecord,
  ): Promise<ContinuousUseEvaluation> {
    if (
      !Number.isSafeInteger(input.reminderIntervalMs) ||
      input.reminderIntervalMs <= 0 ||
      input.reminderIntervalMs > CONTINUOUS_USE_REMINDER_INTERVAL_MS ||
      input.reminderIntervalMs % 1_000 !== 0
    ) {
      throw new ComplianceInvariantError(
        "continuous-use reminder interval is invalid",
      );
    }
    for (let attempt = 1; attempt <= TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.serializable(async (transaction) => {
          const compliance = await this.loadCompliance(
            transaction,
            input.ownerPrincipalId,
            input.experienceSessionId,
          );
          if (continuousUseUnavailable(compliance, input.now)) {
            throw new ComplianceOperationNotAllowedError(
              "continuous-use evaluation is unavailable after exit",
            );
          }
          const pending =
            await transaction.vnextContinuousUseReminderReceipt.findFirst({
              where: {
                ownerPrincipalId: input.ownerPrincipalId,
                experienceSessionId: input.experienceSessionId,
                complianceSessionId: compliance.id,
                status: VnextContinuousUseReceiptStatus.PENDING,
              },
              orderBy: [{ emittedAt: "asc" }, { id: "asc" }],
            });
          if (pending !== null) {
            if (
              !CONTINUOUS_USE_ACKNOWLEDGEABLE_STATUSES.has(
                compliance.status,
              ) ||
              pending.version !== 1 ||
              pending.acknowledgedAt !== null ||
              pending.acknowledgementEventId !== null ||
              pending.emittedAt.getTime() > input.now.getTime()
            ) {
              throw new ComplianceInvariantError(
                "pending continuous-use receipt is invalid",
              );
            }
            await verifyContinuousUseEmission(transaction, pending);
            return {
              status: "pending",
              receiptId: pending.id,
              receiptVersion: 1,
              emittedAt: pending.emittedAt,
            };
          }
          if (compliance.status !== VnextComplianceStatus.ELIGIBLE) {
            throw new ComplianceOperationNotAllowedError(
              "continuous-use receipt emission requires an eligible session",
            );
          }
          const anchor =
            compliance.lastDurationReminderAt ??
            compliance.continuousUseStartedAt;
          if (anchor.getTime() > input.now.getTime()) {
            throw new ComplianceInvariantError(
              "continuous-use clock is ahead of server time",
            );
          }
          const nextReminderAt = new Date(
            anchor.getTime() + input.reminderIntervalMs,
          );
          if (input.now.getTime() < nextReminderAt.getTime()) {
            return { status: "not_due", nextReminderAt };
          }
          const receiptId = randomUUID();
          const eventId = randomUUID();
          const intervalSeconds = input.reminderIntervalMs / 1_000;
          const payload = {
            receiptId,
            experienceSessionId: input.experienceSessionId,
            receiptVersion: 1,
            emittedAt: input.now.toISOString(),
            intervalSeconds,
          };
          await createOutboxEvent(transaction, {
            eventId,
            ownerPrincipalId: input.ownerPrincipalId,
            aggregateType: CONTINUOUS_USE_RECEIPT_AGGREGATE,
            aggregateId: receiptId,
            aggregateVersion: 1,
            eventType: CONTINUOUS_USE_EMITTED_EVENT,
            idempotencyKey: `continuous-use-reminder:emitted:${receiptId}:1`,
            payload,
            now: input.now,
          });
          await transaction.vnextContinuousUseReminderReceipt.create({
            data: {
              id: receiptId,
              ownerPrincipalId: input.ownerPrincipalId,
              experienceSessionId: input.experienceSessionId,
              complianceSessionId: compliance.id,
              status: VnextContinuousUseReceiptStatus.PENDING,
              policyVersion: CONTINUOUS_USE_POLICY_VERSION,
              intervalSeconds,
              windowStartedAt: anchor,
              dueAt: nextReminderAt,
              emittedAt: input.now,
              emissionEventId: eventId,
            },
          });
          return {
            status: "pending",
            receiptId,
            receiptVersion: 1,
            emittedAt: input.now,
          };
        });
      } catch (error) {
        if (uniqueConstraintConflict(error) && attempt < TRANSACTION_ATTEMPTS) {
          continue;
        }
        throw error;
      }
    }
    throw new ComplianceInvariantError(
      "continuous-use receipt retry budget exhausted",
    );
  }

  async acknowledgeContinuousUseReceipt(
    input: AcknowledgeContinuousUseReceiptRecord,
  ): Promise<ContinuousUseAcknowledgement> {
    if (input.expectedReceiptVersion !== 1) {
      throw new ComplianceVersionConflictError(
        "stale continuous-use receipt version",
      );
    }
    for (let attempt = 1; attempt <= TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.serializable(async (transaction) => {
          const compliance = await this.loadCompliance(
            transaction,
            input.ownerPrincipalId,
            input.experienceSessionId,
          );
          if (continuousUseUnavailable(compliance, input.now)) {
            throw new ComplianceOperationNotAllowedError(
              "continuous-use acknowledgement is unavailable after exit",
            );
          }
          const receipt =
            await transaction.vnextContinuousUseReminderReceipt.findFirst({
              where: {
                id: input.receiptId,
                ownerPrincipalId: input.ownerPrincipalId,
                experienceSessionId: input.experienceSessionId,
                complianceSessionId: compliance.id,
              },
            });
          if (receipt === null) {
            throw new ComplianceResourceNotFoundError(
              "continuous-use receipt not found",
            );
          }
          if (
            !CONTINUOUS_USE_ACKNOWLEDGEABLE_STATUSES.has(compliance.status)
          ) {
            throw new ComplianceOperationNotAllowedError(
              "continuous-use acknowledgement is unavailable in this state",
            );
          }
          await verifyContinuousUseEmission(transaction, receipt);
          if (
            receipt.status === VnextContinuousUseReceiptStatus.ACKNOWLEDGED
          ) {
            await verifyContinuousUseAcknowledgement(transaction, receipt);
            if (receipt.acknowledgedAt!.getTime() > input.now.getTime()) {
              throw new ComplianceInvariantError(
                "continuous-use acknowledgement clock is ahead of server time",
              );
            }
            return {
              disposition: "replayed",
              receiptId: receipt.id,
              status: "acknowledged",
              receiptVersion: 2,
              acknowledgedAt: receipt.acknowledgedAt!,
            };
          }
          if (
            receipt.status !== VnextContinuousUseReceiptStatus.PENDING ||
            receipt.version !== 1 ||
            receipt.acknowledgedAt !== null ||
            receipt.acknowledgementEventId !== null
          ) {
            throw new ComplianceInvariantError(
              "continuous-use receipt state is invalid",
            );
          }
          if (
            input.now.getTime() < receipt.emittedAt.getTime() ||
            input.now.getTime() < compliance.continuousUseStartedAt.getTime() ||
            (compliance.lastDurationReminderAt !== null &&
              input.now.getTime() <=
                compliance.lastDurationReminderAt.getTime())
          ) {
            throw new ComplianceInvariantError(
              "continuous-use acknowledgement time is invalid",
            );
          }
          const eventId = randomUUID();
          const payload = {
            receiptId: receipt.id,
            experienceSessionId: input.experienceSessionId,
            receiptVersion: 2,
            acknowledgedAt: input.now.toISOString(),
          };
          await createOutboxEvent(transaction, {
            eventId,
            ownerPrincipalId: input.ownerPrincipalId,
            aggregateType: CONTINUOUS_USE_RECEIPT_AGGREGATE,
            aggregateId: receipt.id,
            aggregateVersion: 2,
            eventType: CONTINUOUS_USE_ACKNOWLEDGED_EVENT,
            idempotencyKey:
              `continuous-use-reminder:acknowledged:${receipt.id}:2`,
            payload,
            now: input.now,
          });
          const receiptUpdate =
            await transaction.vnextContinuousUseReminderReceipt.updateMany({
              where: {
                id: receipt.id,
                ownerPrincipalId: input.ownerPrincipalId,
                experienceSessionId: input.experienceSessionId,
                complianceSessionId: compliance.id,
                status: VnextContinuousUseReceiptStatus.PENDING,
                version: 1,
                acknowledgedAt: null,
                acknowledgementEventId: null,
              },
              data: {
                status: VnextContinuousUseReceiptStatus.ACKNOWLEDGED,
                acknowledgedAt: input.now,
                acknowledgementEventId: eventId,
                version: 2,
              },
            });
          if (receiptUpdate.count !== 1) {
            throw new ComplianceVersionConflictError(
              "continuous-use acknowledgement lost receipt CAS",
            );
          }
          const complianceUpdate =
            await transaction.vnextComplianceSession.updateMany({
              where: {
                id: compliance.id,
                ownerPrincipalId: input.ownerPrincipalId,
                experienceSessionId: input.experienceSessionId,
                status: {
                  in: [
                    VnextComplianceStatus.ELIGIBLE,
                    VnextComplianceStatus.BLOCKED,
                    VnextComplianceStatus.WITHDRAWN,
                  ],
                },
                version: compliance.version,
                lastDurationReminderAt:
                  compliance.lastDurationReminderAt,
              },
              data: {
                lastDurationReminderAt: input.now,
                auditRefs: jsonInput(
                  appendAuditRef(
                    compliance.auditRefs,
                    `outbox:${eventId}`,
                  ),
                ),
                version: { increment: 1 },
              },
            });
          if (complianceUpdate.count !== 1) {
            throw new ComplianceVersionConflictError(
              "continuous-use acknowledgement lost compliance CAS",
            );
          }
          return {
            disposition: "acknowledged",
            receiptId: receipt.id,
            status: "acknowledged",
            receiptVersion: 2,
            acknowledgedAt: input.now,
          };
        });
      } catch (error) {
        if (
          (error instanceof ComplianceVersionConflictError ||
            uniqueConstraintConflict(error)) &&
          attempt < TRANSACTION_ATTEMPTS
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new ComplianceInvariantError(
      "continuous-use acknowledgement retry budget exhausted",
    );
  }

  async cancelSessionCreativeTasks(
    input: CancelSessionCreativeTasksRecord,
  ): Promise<SessionExitResult> {
    return this.serializable(async (transaction) => {
      await lockCreativeTaskMutationWindow(transaction);
      const compliance = await this.loadCompliance(
        transaction,
        input.ownerPrincipalId,
        input.experienceSessionId,
      );
      if (
        compliance.experienceSession.revokedAt !== null ||
        compliance.experienceSession.authState ===
          VnextExperienceAuthState.EXPIRED
      ) {
        const events = await transaction.vnextOutboxEvent.findMany({
          where: {
            ownerPrincipalId: input.ownerPrincipalId,
            aggregateType: "experience_session",
            aggregateId: input.experienceSessionId,
            eventType: "vnext.session.exited.v1",
          },
          select: {
            aggregateType: true,
            aggregateId: true,
            aggregateVersion: true,
            eventType: true,
            idempotencyKey: true,
            payload: true,
            payloadDigest: true,
          },
          orderBy: [{ aggregateVersion: "asc" }, { id: "asc" }],
          take: 2,
        });
        if (events.length !== 1) {
          throw new ComplianceInvariantError(
            "session exit replay evidence is missing or ambiguous",
          );
        }
        const event = events[0]!;
        if (
          event.aggregateType !== "experience_session" ||
          event.aggregateId !== input.experienceSessionId ||
          event.eventType !== "vnext.session.exited.v1" ||
          event.idempotencyKey !==
            `session-exited:${input.experienceSessionId}:${event.aggregateVersion}`
        ) {
          throw new ComplianceInvariantError(
            "session exit replay evidence is out of scope",
          );
        }
        verifyLifecycleEventDigest(event);
        const payload = exactJsonRecord(event.payload, [
          "experienceSessionId",
          "cancelledTaskCount",
          "exitedAt",
        ]);
        if (payload.experienceSessionId !== input.experienceSessionId) {
          throw new ComplianceInvariantError(
            "session exit replay evidence is out of scope",
          );
        }
        return {
          disposition: "replayed",
          cancelledTaskCount: nonNegativeInteger(payload.cancelledTaskCount),
        };
      }
      const cancelledTaskIds = await cancelOwnedPendingTasks(transaction, {
        ownerPrincipalId: input.ownerPrincipalId,
        scope: {
          OR: [
            {
              sourceMessage: {
                is: { experienceSessionId: input.experienceSessionId },
              },
            },
            {
              workspace: {
                is: {
                  originSourceMessage: {
                    is: { experienceSessionId: input.experienceSessionId },
                  },
                },
              },
            },
          ],
        },
        now: input.now,
        failureCode: "session_exited",
      });
      const sessionUpdate = await transaction.vnextExperienceSession.updateMany({
        where: {
          id: input.experienceSessionId,
          principalId: input.ownerPrincipalId,
          revokedAt: null,
          authState: { not: VnextExperienceAuthState.EXPIRED },
        },
        data: {
          revokedAt: input.now,
          authState: VnextExperienceAuthState.EXPIRED,
          projectionVersionId: randomUUID(),
        },
      });
      if (sessionUpdate.count !== 1) {
        throw new ComplianceVersionConflictError("session exit lost CAS");
      }
      const eventId = randomUUID();
      const complianceUpdate = await transaction.vnextComplianceSession.updateMany({
        where: {
          id: compliance.id,
          ownerPrincipalId: input.ownerPrincipalId,
          experienceSessionId: input.experienceSessionId,
          version: compliance.version,
        },
        data: {
          status: VnextComplianceStatus.EXPIRED,
          auditRefs: jsonInput(
            appendAuditRef(compliance.auditRefs, `outbox:${eventId}`),
          ),
          version: { increment: 1 },
        },
      });
      if (complianceUpdate.count !== 1) {
        throw new ComplianceVersionConflictError("compliance exit lost CAS");
      }
      const payload = {
        experienceSessionId: input.experienceSessionId,
        cancelledTaskCount: cancelledTaskIds.length,
        exitedAt: input.now.toISOString(),
      };
      await createOutboxEvent(transaction, {
        eventId,
        ownerPrincipalId: input.ownerPrincipalId,
        aggregateType: "experience_session",
        aggregateId: input.experienceSessionId,
        aggregateVersion: compliance.version + 1,
        eventType: "vnext.session.exited.v1",
        idempotencyKey: `session-exited:${input.experienceSessionId}:${compliance.version + 1}`,
        payload,
        now: input.now,
      });
      return {
        disposition: "exited",
        cancelledTaskCount: cancelledTaskIds.length,
      };
    });
  }

  async appealSafetyDecision(
    input: AppealSafetyDecisionRecord,
  ): Promise<SafetyAppealResult> {
    return this.serializable(async (transaction) => {
      const compliance = await this.loadCompliance(
        transaction,
        input.ownerPrincipalId,
        input.experienceSessionId,
      );
      const safetyCase = await transaction.vnextSafetyCase.findFirst({
        where: {
          id: input.safetyCaseId,
          ownerPrincipalId: input.ownerPrincipalId,
          experienceSessionId: input.experienceSessionId,
          complianceSessionId: compliance.id,
        },
      });
      if (!safetyCase) {
        throw new ComplianceResourceNotFoundError("safety case not found");
      }
      const appealRecord =
        await transaction.vnextSafetyAppealRecord.findUnique({
          where: {
            safetyCaseId_ownerPrincipalId: {
              safetyCaseId: safetyCase.id,
              ownerPrincipalId: input.ownerPrincipalId,
            },
          },
          select: {
            id: true,
            reasonDigest: true,
            caseVersion: true,
            createdAt: true,
          },
        });
      if (appealRecord !== null) {
        const idempotencyKey =
          `safety-case-appealed:${safetyCase.id}:${appealRecord.caseVersion}`;
        const receipt = await transaction.vnextOutboxEvent.findFirst({
          where: {
            ownerPrincipalId: input.ownerPrincipalId,
            idempotencyKey,
          },
        });
        const payload = receipt
          ? exactJsonRecord(receipt.payload, [
              "safetyCaseId",
              "experienceSessionId",
              "appealRecordId",
              "appealReasonDigest",
              "appealedAt",
            ])
          : null;
        if (
          safetyCase.appealReasonDigest !== input.sealedReason.reasonDigest ||
          appealRecord.reasonDigest !== input.sealedReason.reasonDigest ||
          input.expectedVersion !== appealRecord.caseVersion - 1 ||
          safetyCase.appealedAt === null ||
          safetyCase.appealedAt.getTime() !== appealRecord.createdAt.getTime() ||
          receipt === null ||
          receipt.aggregateType !== "safety_case" ||
          receipt.aggregateId !== safetyCase.id ||
          receipt.aggregateVersion !== appealRecord.caseVersion ||
          receipt.eventType !== "vnext.safety_case.appealed.v1" ||
          receipt.idempotencyKey !== idempotencyKey ||
          payload?.safetyCaseId !== safetyCase.id ||
          payload.experienceSessionId !== input.experienceSessionId ||
          payload.appealRecordId !== appealRecord.id ||
          payload.appealReasonDigest !== appealRecord.reasonDigest ||
          payload.appealedAt !== appealRecord.createdAt.toISOString()
        ) {
          throw new ComplianceVersionConflictError("safety case appeal conflict");
        }
        verifyLifecycleEventDigest(receipt);
        return {
          disposition: "replayed",
          safetyCaseId: safetyCase.id,
          status: "appealed",
          version: appealRecord.caseVersion,
          appealedAt: appealRecord.createdAt,
        };
      }
      if (safetyCase.status === VnextSafetyCaseStatus.APPEALED) {
        throw new ComplianceInvariantError(
          "appealed safety case has no immutable appeal record",
        );
      }
      if (safetyCase.status === VnextSafetyCaseStatus.RESOLVED) {
        throw new ComplianceOperationNotAllowedError(
          "resolved safety case cannot be appealed through this path",
        );
      }
      if (safetyCase.version !== input.expectedVersion) {
        throw new ComplianceVersionConflictError("stale safety case version");
      }
      const updated = await transaction.vnextSafetyCase.updateMany({
        where: {
          id: safetyCase.id,
          ownerPrincipalId: input.ownerPrincipalId,
          experienceSessionId: input.experienceSessionId,
          status: VnextSafetyCaseStatus.OPEN,
          version: input.expectedVersion,
          appealedAt: null,
        },
        data: {
          status: VnextSafetyCaseStatus.APPEALED,
          appealReasonDigest: input.sealedReason.reasonDigest,
          appealedAt: input.now,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new ComplianceVersionConflictError("safety appeal lost CAS");
      }
      const version = safetyCase.version + 1;
      const appealRecordId = randomUUID();
      await transaction.vnextSafetyAppealRecord.create({
        data: {
          id: appealRecordId,
          ownerPrincipalId: input.ownerPrincipalId,
          safetyCaseId: safetyCase.id,
          caseVersion: version,
          reasonDigest: input.sealedReason.reasonDigest,
          reasonCiphertext: input.sealedReason.reasonCiphertext,
          nonce: input.sealedReason.nonce,
          authTag: input.sealedReason.authTag,
          keyVersion: input.sealedReason.keyVersion,
          createdAt: input.now,
        },
      });
      const eventId = randomUUID();
      const complianceUpdate = await transaction.vnextComplianceSession.updateMany({
        where: {
          id: compliance.id,
          ownerPrincipalId: input.ownerPrincipalId,
          experienceSessionId: input.experienceSessionId,
          version: compliance.version,
        },
        data: {
          auditRefs: jsonInput(
            appendAuditRef(
              appendAuditRef(
                compliance.auditRefs,
                `safety-appeal:${appealRecordId}`,
              ),
              `outbox:${eventId}`,
            ),
          ),
          version: { increment: 1 },
        },
      });
      if (complianceUpdate.count !== 1) {
        throw new ComplianceVersionConflictError("compliance appeal lost CAS");
      }
      const payload = {
        safetyCaseId: safetyCase.id,
        experienceSessionId: input.experienceSessionId,
        appealRecordId,
        appealReasonDigest: input.sealedReason.reasonDigest,
        appealedAt: input.now.toISOString(),
      };
      await createOutboxEvent(transaction, {
        eventId,
        ownerPrincipalId: input.ownerPrincipalId,
        aggregateType: "safety_case",
        aggregateId: safetyCase.id,
        aggregateVersion: version,
        eventType: "vnext.safety_case.appealed.v1",
        idempotencyKey: `safety-case-appealed:${safetyCase.id}:${version}`,
        payload,
        now: input.now,
      });
      await rotateProjection(
        transaction,
        input.ownerPrincipalId,
        input.experienceSessionId,
      );
      return {
        disposition: "appealed",
        safetyCaseId: safetyCase.id,
        status: "appealed",
        version,
        appealedAt: input.now,
      };
    });
  }

  async readOwnedSafetyCase(
    input: ReadOwnedSafetyCaseRecord,
  ): Promise<OwnedSafetyCaseView> {
    const compliance = await this.client.vnextComplianceSession.findFirst({
      where: {
        ownerPrincipalId: input.ownerPrincipalId,
        experienceSessionId: input.experienceSessionId,
      },
      select: { id: true },
    });
    if (!compliance) {
      throw new ComplianceResourceNotFoundError("compliance scope not found");
    }
    const safetyCase = await this.client.vnextSafetyCase.findFirst({
      where: {
        id: input.safetyCaseId,
        ownerPrincipalId: input.ownerPrincipalId,
        experienceSessionId: input.experienceSessionId,
        complianceSessionId: compliance.id,
      },
      select: {
        id: true,
        status: true,
        disposition: true,
        severity: true,
        version: true,
        openedAt: true,
        appealedAt: true,
        closedAt: true,
      },
    });
    if (!safetyCase) {
      throw new ComplianceResourceNotFoundError("safety case not found");
    }
    return {
      safetyCaseId: safetyCase.id,
      status: safetyStatusValue(safetyCase.status),
      disposition: safetyCase.disposition.toLowerCase() as OwnedSafetyCaseView["disposition"],
      severity: safetyCase.severity.toLowerCase() as OwnedSafetyCaseView["severity"],
      version: safetyCase.version,
      openedAt: safetyCase.openedAt,
      appealedAt: safetyCase.appealedAt,
      closedAt: safetyCase.closedAt,
    };
  }

  async listOwnedSafetyCases(
    input: ComplianceOwnerScope,
  ): Promise<readonly OwnedSafetyCaseView[]> {
    const compliance = await this.requireOwnedComplianceScope(input);
    const safetyCases = await this.client.vnextSafetyCase.findMany({
      where: {
        ownerPrincipalId: input.ownerPrincipalId,
        experienceSessionId: input.experienceSessionId,
        complianceSessionId: compliance.id,
        complianceSession: {
          is: {
            ownerPrincipalId: input.ownerPrincipalId,
            experienceSessionId: input.experienceSessionId,
          },
        },
      },
      select: {
        id: true,
        status: true,
        disposition: true,
        severity: true,
        version: true,
        openedAt: true,
        appealedAt: true,
        closedAt: true,
      },
      orderBy: [{ openedAt: "asc" }, { id: "asc" }],
    });
    return safetyCases.map((safetyCase) => ({
      safetyCaseId: safetyCase.id,
      status: safetyStatusValue(safetyCase.status),
      disposition:
        safetyCase.disposition.toLowerCase() as OwnedSafetyCaseView["disposition"],
      severity:
        safetyCase.severity.toLowerCase() as OwnedSafetyCaseView["severity"],
      version: safetyCase.version,
      openedAt: safetyCase.openedAt,
      appealedAt: safetyCase.appealedAt,
      closedAt: safetyCase.closedAt,
    }));
  }
}
