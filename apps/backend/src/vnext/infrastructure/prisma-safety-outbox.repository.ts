import { createHash, randomUUID } from "node:crypto";
import {
  Prisma,
  PrismaClient,
  VnextCreativeRuntimeMode,
  VnextOutboxEventStatus,
  VnextSafetyCaseStatus,
  VnextSafetyDisposition,
  VnextWorkerKind,
  VnextWorkerStatus,
} from "@prisma/client";
import {
  SAFETY_ESCALATION_EVENT_TYPE,
  SafetyDeliveryConflictError,
  type SafetyDispatcherHeartbeatInput,
  type SafetyOutboxFailureDisposition,
  type SafetyOutboxLease,
  type SafetyOutboxRepository,
} from "../domain/crisis-escalation.port.js";
import type {
  VnextInfrastructureReadiness,
  VnextReadinessPort,
} from "../domain/vnext-readiness.port.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_REFERENCE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,199}$/;
const DELIVERY_AUDIT_PREFIX = "delivery:";
const MAXIMUM_WORKER_ID_LENGTH = 200;
const TRANSACTION_ATTEMPTS = 3;

class SafetyOutboxFenceLostError extends Error {
  override readonly name = "SafetyOutboxFenceLostError";
}

function exactRecord(value: unknown): Record<string, unknown> | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return null;
  }
  return value as Record<string, unknown>;
}

function parseSafetyPayload(value: unknown, expectedCaseId: string) {
  const payload = exactRecord(value);
  if (payload === null) {
    return null;
  }
  const keys = Object.keys(payload).sort();
  if (
    keys.length !== 2 ||
    keys[0] !== "caseId" ||
    keys[1] !== "safetyContactRef" ||
    payload.caseId !== expectedCaseId ||
    !UUID_PATTERN.test(expectedCaseId)
  ) {
    return null;
  }
  const safetyContactRef = payload.safetyContactRef;
  if (
    typeof safetyContactRef !== "string" ||
    safetyContactRef.trim().length === 0 ||
    safetyContactRef.length > 200
  ) {
    return null;
  }
  return { safetyContactRef };
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

function digest(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function jsonInput(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function requireDeliveryRef(value: unknown): asserts value is string {
  if (typeof value !== "string" || !SAFE_REFERENCE_PATTERN.test(value)) {
    throw new Error("invalid safety delivery reference");
  }
}

function deliveryAuditRef(deliveryRef: string) {
  return `${DELIVERY_AUDIT_PREFIX}${deliveryRef}`;
}

function readAuditRefs(value: unknown) {
  if (
    !Array.isArray(value) ||
    value.length > 1_000 ||
    value.some(
      (item) =>
        typeof item !== "string" ||
        item.trim().length === 0 ||
        item.length > 500,
    ) ||
    new Set(value).size !== value.length
  ) {
    throw new SafetyDeliveryConflictError();
  }
  return value as string[];
}

function deliveryAuditRefs(auditRefs: readonly string[]) {
  return auditRefs.filter((reference) =>
    reference.startsWith(DELIVERY_AUDIT_PREFIX),
  );
}

function isRetryableTransactionError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}

function requireWorkerId(value: string) {
  if (value.trim().length === 0 || value.length > MAXIMUM_WORKER_ID_LENGTH) {
    throw new Error(
      "safety worker id must be non-empty and at most 200 characters",
    );
  }
}

export interface PrismaSafetyOutboxRepositoryOptions {
  readonly clock?: () => Date;
}

export class PrismaSafetyOutboxRepository
  implements SafetyOutboxRepository, VnextReadinessPort
{
  constructor(
    private readonly client: PrismaClient,
    private readonly options: PrismaSafetyOutboxRepositoryOptions = {},
  ) {}

  private now() {
    const value = this.options.clock?.() ?? new Date();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
      throw new Error("safety outbox clock returned an invalid date");
    }
    return new Date(value.getTime());
  }

  async claimNext(input: {
    readonly workerInstanceId: string;
    readonly leaseDurationMs: number;
  }): Promise<SafetyOutboxLease | null> {
    requireWorkerId(input.workerInstanceId);
    if (
      !Number.isSafeInteger(input.leaseDurationMs) ||
      input.leaseDurationMs < 1
    ) {
      throw new Error("safety outbox leaseDurationMs must be positive");
    }
    const now = this.now();
    const leaseExpiresAt = new Date(now.getTime() + input.leaseDurationMs);
    for (let attempt = 1; attempt <= TRANSACTION_ATTEMPTS; attempt += 1) {
      const leaseToken = randomUUID();
      try {
        return await this.client.$transaction(
          async (transaction) => {
            const candidate = await transaction.vnextOutboxEvent.findFirst({
              where: {
                eventType: SAFETY_ESCALATION_EVENT_TYPE,
                OR: [
                  {
                    status: {
                      in: [
                        VnextOutboxEventStatus.PENDING,
                        VnextOutboxEventStatus.RETRY_WAIT,
                      ],
                    },
                    availableAt: { lte: now },
                  },
                  {
                    status: VnextOutboxEventStatus.LEASED,
                    leaseExpiresAt: { lte: now },
                  },
                ],
              },
              orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
            });
            if (candidate === null) {
              return null;
            }
            if (candidate.attemptCount >= candidate.maxAttempts) {
              await transaction.vnextOutboxEvent.updateMany({
                where: { id: candidate.id, status: candidate.status },
                data: {
                  status: VnextOutboxEventStatus.DEAD_LETTER,
                  leaseOwner: null,
                  leaseToken: null,
                  leaseExpiresAt: null,
                  lastFailureCode: "retry_budget_exhausted",
                },
              });
              return null;
            }
            const parsed = parseSafetyPayload(
              candidate.payload,
              candidate.aggregateId,
            );
            const safetyCase =
              parsed === null
                ? null
                : await transaction.vnextSafetyCase.findFirst({
                    where: {
                      id: candidate.aggregateId,
                      ownerPrincipalId: candidate.ownerPrincipalId,
                    },
                  });
            const expectedPayload =
              parsed === null
                ? null
                : {
                    caseId: candidate.aggregateId,
                    safetyContactRef: parsed.safetyContactRef,
                  };
            const expectedPayloadDigest =
              expectedPayload === null ? null : digest(expectedPayload);
            let auditRefs: string[] | null = null;
            if (safetyCase !== null) {
              try {
                auditRefs = readAuditRefs(safetyCase.auditRefs);
              } catch {
                auditRefs = null;
              }
            }
            if (
              parsed === null ||
              expectedPayload === null ||
              expectedPayloadDigest === null ||
              candidate.aggregateType !== "safety_case" ||
              candidate.aggregateVersion !== 1 ||
              candidate.payloadDigest !== expectedPayloadDigest ||
              digest(candidate.payload) !== expectedPayloadDigest ||
              safetyCase === null ||
              safetyCase.disposition !== VnextSafetyDisposition.ESCALATE ||
              (safetyCase.status !== VnextSafetyCaseStatus.OPEN &&
                safetyCase.status !== VnextSafetyCaseStatus.APPEALED) ||
              safetyCase.safetyContactRef !== parsed.safetyContactRef ||
              safetyCase.humanEscalationRef !== null ||
              auditRefs === null ||
              deliveryAuditRefs(auditRefs).length !== 0
            ) {
              await transaction.vnextOutboxEvent.updateMany({
                where: { id: candidate.id, status: candidate.status },
                data: {
                  status: VnextOutboxEventStatus.DEAD_LETTER,
                  leaseOwner: null,
                  leaseToken: null,
                  leaseExpiresAt: null,
                  lastFailureCode: "invalid_safety_event",
                },
              });
              return null;
            }
            const claimed = await transaction.vnextOutboxEvent.updateMany({
              where: {
                id: candidate.id,
                status: candidate.status,
                attemptCount: candidate.attemptCount,
                leaseToken: candidate.leaseToken,
              },
              data: {
                status: VnextOutboxEventStatus.LEASED,
                attemptCount: { increment: 1 },
                leaseOwner: input.workerInstanceId,
                leaseToken,
                leaseExpiresAt,
                lastFailureCode: null,
              },
            });
            if (claimed.count !== 1) {
              return null;
            }
            return {
              eventId: candidate.id,
              ownerPrincipalId: candidate.ownerPrincipalId,
              idempotencyKey: candidate.idempotencyKey,
              safetyCaseId: candidate.aggregateId,
              safetyContactRef: parsed.safetyContactRef,
              attemptNumber: candidate.attemptCount + 1,
              maxAttempts: candidate.maxAttempts,
              leaseToken,
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (!isRetryableTransactionError(error)) {
          throw error;
        }
        if (attempt === TRANSACTION_ATTEMPTS) return null;
      }
    }
    throw new Error("safety claim transaction attempts exhausted");
  }

  async markPublished(lease: SafetyOutboxLease, deliveryRef: string) {
    requireDeliveryRef(deliveryRef);
    const auditRef = deliveryAuditRef(deliveryRef);
    const now = this.now();
    for (let attempt = 1; attempt <= TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.client.$transaction(
          async (transaction) => {
            const event = await transaction.vnextOutboxEvent.findUnique({
              where: { id: lease.eventId },
            });
            if (event === null) return false;
            const payload = parseSafetyPayload(
              event.payload,
              lease.safetyCaseId,
            );
            const expectedPayload = {
              caseId: lease.safetyCaseId,
              safetyContactRef: lease.safetyContactRef,
            };
            const expectedPayloadDigest = digest(expectedPayload);
            if (
              event.ownerPrincipalId !== lease.ownerPrincipalId ||
              event.aggregateType !== "safety_case" ||
              event.aggregateId !== lease.safetyCaseId ||
              event.aggregateVersion !== 1 ||
              event.eventType !== SAFETY_ESCALATION_EVENT_TYPE ||
              event.idempotencyKey !== lease.idempotencyKey ||
              event.maxAttempts !== lease.maxAttempts ||
              payload?.safetyContactRef !== lease.safetyContactRef ||
              event.payloadDigest !== expectedPayloadDigest ||
              digest(event.payload) !== expectedPayloadDigest
            ) {
              return false;
            }

            const safetyCase = await transaction.vnextSafetyCase.findFirst({
              where: {
                id: lease.safetyCaseId,
                ownerPrincipalId: lease.ownerPrincipalId,
              },
            });
            if (
              safetyCase === null ||
              safetyCase.disposition !== VnextSafetyDisposition.ESCALATE ||
              safetyCase.safetyContactRef !== lease.safetyContactRef
            ) {
              return false;
            }
            const auditRefs = readAuditRefs(safetyCase.auditRefs);
            const committedDeliveryAuditRefs = deliveryAuditRefs(auditRefs);

            if (event.status === VnextOutboxEventStatus.PUBLISHED) {
              if (
                lease.attemptNumber < 1 ||
                lease.attemptNumber > event.attemptCount
              ) {
                return false;
              }
              if (
                event.publishedAt === null ||
                event.leaseOwner !== null ||
                event.leaseToken !== null ||
                event.leaseExpiresAt !== null ||
                event.lastFailureCode !== null ||
                safetyCase.humanEscalationRef !== deliveryRef ||
                committedDeliveryAuditRefs.length !== 1 ||
                committedDeliveryAuditRefs[0] !== auditRef
              ) {
                throw new SafetyDeliveryConflictError();
              }
              return true;
            }

            if (
              event.status !== VnextOutboxEventStatus.LEASED ||
              event.leaseToken !== lease.leaseToken ||
              event.attemptCount !== lease.attemptNumber
            ) {
              return false;
            }
            if (
              (safetyCase.status !== VnextSafetyCaseStatus.OPEN &&
                safetyCase.status !== VnextSafetyCaseStatus.APPEALED) ||
              safetyCase.humanEscalationRef !== null ||
              committedDeliveryAuditRefs.length !== 0
            ) {
              throw new SafetyDeliveryConflictError();
            }

            const safetyCaseUpdate =
              await transaction.vnextSafetyCase.updateMany({
                where: {
                  id: safetyCase.id,
                  ownerPrincipalId: lease.ownerPrincipalId,
                  disposition: VnextSafetyDisposition.ESCALATE,
                  status: {
                    in: [
                      VnextSafetyCaseStatus.OPEN,
                      VnextSafetyCaseStatus.APPEALED,
                    ],
                  },
                  safetyContactRef: lease.safetyContactRef,
                  humanEscalationRef: null,
                  version: safetyCase.version,
                },
                data: {
                  humanEscalationRef: deliveryRef,
                  auditRefs: jsonInput([...auditRefs, auditRef]),
                  version: { increment: 1 },
                },
              });
            if (safetyCaseUpdate.count !== 1) {
              throw new SafetyOutboxFenceLostError();
            }

            const eventUpdate =
              await transaction.vnextOutboxEvent.updateMany({
                where: {
                  id: lease.eventId,
                  ownerPrincipalId: lease.ownerPrincipalId,
                  aggregateType: "safety_case",
                  aggregateId: lease.safetyCaseId,
                  aggregateVersion: 1,
                  eventType: SAFETY_ESCALATION_EVENT_TYPE,
                  idempotencyKey: lease.idempotencyKey,
                  status: VnextOutboxEventStatus.LEASED,
                  leaseToken: lease.leaseToken,
                  attemptCount: lease.attemptNumber,
                  maxAttempts: lease.maxAttempts,
                },
                data: {
                  status: VnextOutboxEventStatus.PUBLISHED,
                  publishedAt: now,
                  leaseOwner: null,
                  leaseToken: null,
                  leaseExpiresAt: null,
                  lastFailureCode: null,
                },
              });
            if (eventUpdate.count !== 1) {
              throw new SafetyOutboxFenceLostError();
            }
            return true;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (error instanceof SafetyOutboxFenceLostError) return false;
        if (
          !isRetryableTransactionError(error) ||
          attempt === TRANSACTION_ATTEMPTS
        ) {
          throw error;
        }
      }
    }
    throw new Error("safety delivery transaction attempts exhausted");
  }

  async markFailed(
    lease: SafetyOutboxLease,
    retryDelayMs: number,
  ): Promise<SafetyOutboxFailureDisposition> {
    if (!Number.isSafeInteger(retryDelayMs) || retryDelayMs < 1) {
      throw new Error("safety outbox retryDelayMs must be positive");
    }
    const now = this.now();
    const exhausted = lease.attemptNumber >= lease.maxAttempts;
    const updated = await this.client.vnextOutboxEvent.updateMany({
      where: {
        id: lease.eventId,
        ownerPrincipalId: lease.ownerPrincipalId,
        status: VnextOutboxEventStatus.LEASED,
        leaseToken: lease.leaseToken,
        attemptCount: lease.attemptNumber,
      },
      data: {
        status: exhausted
          ? VnextOutboxEventStatus.DEAD_LETTER
          : VnextOutboxEventStatus.RETRY_WAIT,
        availableAt: exhausted
          ? now
          : new Date(now.getTime() + retryDelayMs),
        leaseOwner: null,
        leaseToken: null,
        leaseExpiresAt: null,
        lastFailureCode: "escalation_delivery_failed",
      },
    });
    if (updated.count !== 1) {
      return "fenced";
    }
    return exhausted ? "dead_letter" : "retry_wait";
  }

  async startHeartbeat(input: SafetyDispatcherHeartbeatInput) {
    requireWorkerId(input.workerInstanceId);
    if (
      input.buildId.trim().length === 0 ||
      input.buildId.length > 200 ||
      !Number.isSafeInteger(input.processId) ||
      input.processId < 1
    ) {
      throw new Error("invalid safety worker heartbeat metadata");
    }
    const now = this.now();
    await this.client.vnextWorkerHeartbeat.upsert({
      where: { workerId: input.workerInstanceId },
      create: {
        workerId: input.workerInstanceId,
        kind: VnextWorkerKind.OUTBOX,
        status: VnextWorkerStatus.READY,
        runtimeMode: VnextCreativeRuntimeMode.SYNTHETIC,
        buildId: input.buildId,
        processId: input.processId,
        supportedKinds: [SAFETY_ESCALATION_EVENT_TYPE],
        metadata: { role: "safety_dispatcher", mode: "sandbox" },
        startedAt: now,
        lastHeartbeatAt: now,
      },
      update: {
        kind: VnextWorkerKind.OUTBOX,
        status: VnextWorkerStatus.READY,
        runtimeMode: VnextCreativeRuntimeMode.SYNTHETIC,
        buildId: input.buildId,
        processId: input.processId,
        supportedKinds: [SAFETY_ESCALATION_EVENT_TYPE],
        metadata: { role: "safety_dispatcher", mode: "sandbox" },
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
    requireWorkerId(workerInstanceId);
    const now = this.now();
    await this.client.vnextWorkerHeartbeat.updateMany({
      where: {
        workerId: workerInstanceId,
        kind: VnextWorkerKind.OUTBOX,
        status: { in: [VnextWorkerStatus.READY, VnextWorkerStatus.DRAINING] },
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
    requireWorkerId(workerInstanceId);
    const now = this.now();
    await this.client.vnextWorkerHeartbeat.updateMany({
      where: { workerId: workerInstanceId, kind: VnextWorkerKind.OUTBOX },
      data: {
        status: VnextWorkerStatus.STOPPED,
        lastHeartbeatAt: now,
        stoppedAt: now,
      },
    });
  }

  async markHeartbeatError(workerInstanceId: string, errorCode: string) {
    requireWorkerId(workerInstanceId);
    if (errorCode.trim().length === 0 || errorCode.length > 100) {
      throw new Error("safety worker error code is invalid");
    }
    const now = this.now();
    await this.client.vnextWorkerHeartbeat.updateMany({
      where: { workerId: workerInstanceId, kind: VnextWorkerKind.OUTBOX },
      data: {
        status: VnextWorkerStatus.ERROR,
        lastHeartbeatAt: now,
        lastErrorCode: errorCode,
      },
    });
  }

  async readInfrastructure(
    freshnessWindowMs: number,
  ): Promise<VnextInfrastructureReadiness> {
    if (!Number.isSafeInteger(freshnessWindowMs) || freshnessWindowMs < 1) {
      throw new Error("readiness freshnessWindowMs must be positive");
    }
    const now = this.now();
    const freshAfter = new Date(now.getTime() - freshnessWindowMs);
    try {
      const [creativeWorker, safetyWorkers, deadLetterCount] = await Promise.all([
        this.client.vnextWorkerHeartbeat.findMany({
          where: {
            kind: VnextWorkerKind.CREATIVE,
            status: VnextWorkerStatus.READY,
            runtimeMode: VnextCreativeRuntimeMode.CONFIGURED,
            lastHeartbeatAt: { gte: freshAfter, lte: now },
          },
          select: { supportedKinds: true },
        }),
        this.client.vnextWorkerHeartbeat.findMany({
          where: {
            kind: VnextWorkerKind.OUTBOX,
            status: VnextWorkerStatus.READY,
            lastHeartbeatAt: { gte: freshAfter, lte: now },
          },
          select: { metadata: true },
        }),
        this.client.vnextOutboxEvent.count({
          where: {
            eventType: SAFETY_ESCALATION_EVENT_TYPE,
            status: VnextOutboxEventStatus.DEAD_LETTER,
          },
        }),
      ]);
      const safetyWorker = safetyWorkers.some((heartbeat) => {
        const metadata = exactRecord(heartbeat.metadata);
        return (
          metadata?.role === "safety_dispatcher" && metadata.mode === "sandbox"
        );
      });
      return {
        database: true,
        creativeWorker: creativeWorker.some((heartbeat) => {
          const supportedKinds = Array.isArray(heartbeat.supportedKinds)
            ? heartbeat.supportedKinds
            : [];
          return (
            supportedKinds.includes("understand") &&
            supportedKinds.includes("write_opening")
          );
        }),
        safetyWorker,
        safetyDeadLetterClear: deadLetterCount === 0,
      };
    } catch {
      return {
        database: false,
        creativeWorker: false,
        safetyWorker: false,
        safetyDeadLetterClear: false,
      };
    }
  }
}
