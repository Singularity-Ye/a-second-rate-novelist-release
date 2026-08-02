import { createHash, randomUUID } from "node:crypto";
import {
  Prisma,
  PrismaClient,
  VnextComplianceStatus,
  VnextCreativeRunStatus,
  VnextCreativeTaskKind,
  VnextCreativeTaskStatus,
  VnextExperienceAuthState,
  VnextOutboxEventStatus,
  VnextSafetyCaseStatus,
  VnextSafetyDisposition,
  VnextSafetySeverity,
  VnextSafetyTriggerType,
  VnextStoryContentStatus,
} from "@prisma/client";
import {
  SafetyDispositionConflictError,
  SafetyDispositionFenceLostError,
  SafetyDispositionNotFoundError,
  type SafetyDispositionCommand,
  type SafetyDispositionEvidence,
  type SafetyDispositionResult,
  type SafetyDispositionUnitOfWork,
  type VnextSafetyDispositionProbe,
} from "../domain/safety-disposition.uow.js";
import { SAFETY_ESCALATION_EVENT_TYPE } from "../domain/crisis-escalation.port.js";
import { lockCreativeTaskMutationWindow } from "./prisma-creative-task-mutation-fence.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const REASON_CODE_PATTERN = /^[a-z0-9][a-z0-9_.:-]{0,99}$/;
const SAFE_REFERENCE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,199}$/;
const IDEMPOTENCY_KEY_PATTERN = /^safety:(?:input|output):[0-9a-f]{64}$/;
const CANDIDATE_REF_PATTERN = /^candidate-(?:input|output):[0-9a-f]{64}$/;
const STORY_CONTENT_REF_PATTERN =
  /^story-content:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const IMPLICATED_CONTENT_REF_PREFIX = "implicated:";
const MAX_REFERENCE_COUNT = 100;
const TRANSACTION_ATTEMPTS = 3;

type ScopeSnapshot = {
  readonly compliance: {
    readonly id: string;
    readonly version: number;
    readonly safetyCaseRefs: unknown;
  };
  readonly session: { readonly projectionVersionId: string };
};

type ContentEvidencePartition = {
  readonly suppressedContentRefs: string[];
  readonly implicatedContentRefs: string[];
  readonly mutableContentIds: string[];
};

function jsonInput(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
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

function currentTime(clock: () => Date) {
  const now = clock();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("safety disposition clock returned an invalid date");
  }
  return new Date(now.getTime());
}

function requireUuid(value: string | null, field: string) {
  if (value !== null && !UUID_PATTERN.test(value)) {
    throw new Error(`${field} must be a UUID`);
  }
}

function requireCommand(input: SafetyDispositionCommand) {
  requireUuid(input.ownerPrincipalId, "ownerPrincipalId");
  requireUuid(input.experienceSessionId, "experienceSessionId");
  requireUuid(input.workspaceId, "workspaceId");
  const referencedContentIds = storyContentIds(input.suppressedContentRefs).map(
    (id) => id.toLowerCase(),
  );
  if (
    !IDEMPOTENCY_KEY_PATTERN.test(input.idempotencyKey) ||
    !DIGEST_PATTERN.test(input.evidence.triggerDigest) ||
    !SAFE_REFERENCE_PATTERN.test(input.evidence.policyVersion) ||
    !REASON_CODE_PATTERN.test(input.evidence.reasonCode) ||
    !["input_policy", "output_policy", "crisis", "illegal_content"].includes(
      input.evidence.triggerType,
    ) ||
    !["low", "medium", "high", "critical"].includes(input.evidence.severity) ||
    !["block", "escalate", "restrict"].includes(input.evidence.disposition) ||
    (input.evidence.triggerType === "crisis" &&
      input.evidence.disposition !== "escalate") ||
    (input.evidence.triggerType === "output_policy" &&
      (input.triggeringTask === null || input.workspaceId === null)) ||
    (input.evidence.disposition === "escalate" &&
      (input.evidence.safetyContactRef === null ||
        !["high", "critical"].includes(input.evidence.severity))) ||
    (input.evidence.safetyContactRef !== null &&
      !SAFE_REFERENCE_PATTERN.test(input.evidence.safetyContactRef)) ||
    input.suppressedContentRefs.length > MAX_REFERENCE_COUNT ||
    new Set(input.suppressedContentRefs).size !==
      input.suppressedContentRefs.length ||
    new Set(referencedContentIds).size !== referencedContentIds.length ||
    input.suppressedContentRefs.some(
      (ref) =>
        !CANDIDATE_REF_PATTERN.test(ref) &&
        !STORY_CONTENT_REF_PATTERN.test(ref),
    ) ||
    (input.workspaceId === null &&
      input.suppressedContentRefs.some((ref) =>
        STORY_CONTENT_REF_PATTERN.test(ref),
      ))
  ) {
    throw new Error("invalid safety disposition command");
  }
  if (input.triggeringTask !== null) {
    requireUuid(input.triggeringTask.taskId, "triggeringTask.taskId");
    requireUuid(input.triggeringTask.runTraceId, "triggeringTask.runTraceId");
    requireUuid(input.triggeringTask.leaseToken, "triggeringTask.leaseToken");
    if (
      input.triggeringTask.ownerPrincipalId !== input.ownerPrincipalId ||
      !Number.isSafeInteger(input.triggeringTask.stateVersion) ||
      input.triggeringTask.stateVersion < 1 ||
      !Number.isSafeInteger(input.triggeringTask.attemptNumber) ||
      input.triggeringTask.attemptNumber < 1 ||
      !Number.isSafeInteger(input.triggeringTask.maxAttempts) ||
      input.triggeringTask.maxAttempts < input.triggeringTask.attemptNumber ||
      input.triggeringTask.requestId.trim().length === 0 ||
      input.triggeringTask.requestId.length > 200 ||
      !DIGEST_PATTERN.test(input.triggeringTask.inputDigest)
    ) {
      throw new Error("invalid safety triggering task");
    }
  }
}

function enumTrigger(value: SafetyDispositionEvidence["triggerType"]) {
  return {
    input_policy: VnextSafetyTriggerType.INPUT_POLICY,
    output_policy: VnextSafetyTriggerType.OUTPUT_POLICY,
    crisis: VnextSafetyTriggerType.CRISIS,
    illegal_content: VnextSafetyTriggerType.ILLEGAL_CONTENT,
  }[value];
}

function enumSeverity(value: SafetyDispositionEvidence["severity"]) {
  return {
    low: VnextSafetySeverity.LOW,
    medium: VnextSafetySeverity.MEDIUM,
    high: VnextSafetySeverity.HIGH,
    critical: VnextSafetySeverity.CRITICAL,
  }[value];
}

function enumDisposition(value: SafetyDispositionEvidence["disposition"]) {
  return {
    block: VnextSafetyDisposition.BLOCK,
    escalate: VnextSafetyDisposition.ESCALATE,
    restrict: VnextSafetyDisposition.RESTRICT,
  }[value];
}

function enumTaskKind(
  value: NonNullable<SafetyDispositionCommand["triggeringTask"]>["kind"],
) {
  return {
    understand: VnextCreativeTaskKind.UNDERSTAND,
    write_opening: VnextCreativeTaskKind.WRITE_OPENING,
    revise: VnextCreativeTaskKind.REVISE,
    continue_story: VnextCreativeTaskKind.CONTINUE_STORY,
  }[value];
}

function readReferenceList(value: unknown) {
  if (
    !Array.isArray(value) ||
    value.length > 1_000 ||
    value.some(
      (item) => typeof item !== "string" || !UUID_PATTERN.test(item),
    ) ||
    new Set(value).size !== value.length
  ) {
    throw new SafetyDispositionConflictError();
  }
  return value as string[];
}

function sameStringList(left: unknown, right: readonly string[]) {
  return (
    Array.isArray(left) &&
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  );
}

function includesStringRefs(value: unknown, refs: readonly string[]) {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string") &&
    refs.every((ref) => value.includes(ref))
  );
}

function matchesContentEvidence(
  suppressedValue: unknown,
  auditValue: unknown,
  expected: ContentEvidencePartition,
) {
  if (
    !Array.isArray(suppressedValue) ||
    !Array.isArray(auditValue) ||
    suppressedValue.some((ref) => typeof ref !== "string") ||
    auditValue.some((ref) => typeof ref !== "string")
  ) {
    return false;
  }
  const implicatedRefs = (auditValue as string[])
    .filter((ref) => ref.startsWith(IMPLICATED_CONTENT_REF_PREFIX))
    .map((ref) => ref.slice(IMPLICATED_CONTENT_REF_PREFIX.length));
  return (
    sameStringList(suppressedValue, expected.suppressedContentRefs) &&
    sameStringList(implicatedRefs, expected.implicatedContentRefs)
  );
}

function expectedEvent(input: SafetyDispositionCommand, caseId: string) {
  if (input.evidence.disposition === "escalate") {
    return {
      eventType: SAFETY_ESCALATION_EVENT_TYPE,
      payload: {
        caseId,
        safetyContactRef: input.evidence.safetyContactRef,
      },
    } as const;
  }
  return {
    eventType: "vnext.safety.case.opened",
    payload: {
      schemaVersion: 1,
      caseId,
      disposition: input.evidence.disposition,
      severity: input.evidence.severity,
      triggerType: input.evidence.triggerType,
    },
  } as const;
}

function isRetryableTransactionError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "P2034" || error.code === "P2002")
  );
}

function taskScopeWhere(input: SafetyDispositionCommand) {
  if (input.workspaceId !== null) {
    return { workspaceId: input.workspaceId };
  }
  return {
    OR: [
      {
        sourceMessage: {
          experienceSessionId: input.experienceSessionId,
        },
      },
      {
        workspace: {
          originSourceMessage: {
            experienceSessionId: input.experienceSessionId,
          },
        },
      },
    ],
  } satisfies Prisma.VnextCreativeTaskWhereInput;
}

async function readReplay(
  transaction: Prisma.TransactionClient,
  input: SafetyDispositionCommand,
): Promise<SafetyDispositionResult | null> {
  const event = await transaction.vnextOutboxEvent.findUnique({
    where: {
      ownerPrincipalId_idempotencyKey: {
        ownerPrincipalId: input.ownerPrincipalId,
        idempotencyKey: input.idempotencyKey,
      },
    },
  });
  if (event === null) return null;
  const safetyCase = await transaction.vnextSafetyCase.findFirst({
    where: { id: event.aggregateId, ownerPrincipalId: input.ownerPrincipalId },
  });
  const session = await transaction.vnextExperienceSession.findFirst({
    where: {
      id: input.experienceSessionId,
      principalId: input.ownerPrincipalId,
    },
    select: { projectionVersionId: true },
  });
  const expected = expectedEvent(input, event.aggregateId);
  const expectedPayloadDigest = digest(expected.payload);
  if (safetyCase === null || session === null) {
    throw new SafetyDispositionConflictError();
  }
  const expectedContentEvidence = await partitionContentEvidence(
    transaction,
    input,
    "replay",
  );
  if (
    event.aggregateType !== "safety_case" ||
    event.aggregateVersion !== 1 ||
    event.taskId !== (input.triggeringTask?.taskId ?? null) ||
    event.eventType !== expected.eventType ||
    event.payloadDigest !== expectedPayloadDigest ||
    digest(event.payload) !== expectedPayloadDigest ||
    safetyCase.experienceSessionId !== input.experienceSessionId ||
    safetyCase.workspaceId !== input.workspaceId ||
    safetyCase.triggeringTaskId !== (input.triggeringTask?.taskId ?? null) ||
    safetyCase.triggerDigest !== input.evidence.triggerDigest ||
    safetyCase.triggerType !== enumTrigger(input.evidence.triggerType) ||
    safetyCase.severity !== enumSeverity(input.evidence.severity) ||
    safetyCase.disposition !== enumDisposition(input.evidence.disposition) ||
    safetyCase.policyVersion !== input.evidence.policyVersion ||
    safetyCase.safetyContactRef !== input.evidence.safetyContactRef ||
    !matchesContentEvidence(
      safetyCase.suppressedContentRefs,
      safetyCase.auditRefs,
      expectedContentEvidence,
    ) ||
    !includesStringRefs(safetyCase.auditRefs, [
      `policy:${input.evidence.policyVersion}`,
      `reason:${input.evidence.reasonCode}`,
    ])
  ) {
    throw new SafetyDispositionConflictError();
  }
  const cancellations = readReferenceList(safetyCase.taskCancellationRefs);
  return {
    caseId: safetyCase.id,
    disposition: input.evidence.disposition,
    projectionVersionId: session.projectionVersionId,
    cancelledTaskCount: cancellations.length,
    creationDisposition: "replayed",
  };
}

async function requireOwnedScope(
  transaction: Prisma.TransactionClient,
  input: SafetyDispositionCommand,
  now: Date,
): Promise<ScopeSnapshot> {
  const session = await transaction.vnextExperienceSession.findFirst({
    where: {
      id: input.experienceSessionId,
      principalId: input.ownerPrincipalId,
      OR: [
        {
          authState: VnextExperienceAuthState.GUEST_ACTIVE,
          guestExpiresAt: { gt: now },
        },
        { authState: VnextExperienceAuthState.ACCOUNT_ACTIVE },
      ],
      revokedAt: null,
      expiresAt: { gt: now },
    },
    select: { projectionVersionId: true },
  });
  const compliance = await transaction.vnextComplianceSession.findFirst({
    where: {
      experienceSessionId: input.experienceSessionId,
      ownerPrincipalId: input.ownerPrincipalId,
    },
    select: {
      id: true,
      version: true,
      safetyCaseRefs: true,
    },
  });
  if (session === null || compliance === null) {
    throw new SafetyDispositionNotFoundError();
  }
  if (input.workspaceId !== null) {
    const workspace = await transaction.vnextStoryWorkspace.findFirst({
      where: {
        id: input.workspaceId,
        ownerPrincipalId: input.ownerPrincipalId,
        originSourceMessage: {
          experienceSessionId: input.experienceSessionId,
        },
      },
      select: { id: true },
    });
    if (workspace === null) throw new SafetyDispositionNotFoundError();
  }
  return { compliance, session };
}

function storyContentIds(refs: readonly string[]) {
  return refs.flatMap((ref) => {
    const match = STORY_CONTENT_REF_PATTERN.exec(ref);
    return match?.[1] ? [match[1]] : [];
  });
}

async function partitionContentEvidence(
  transaction: Prisma.TransactionClient,
  input: SafetyDispositionCommand,
  mode: "create" | "replay",
): Promise<ContentEvidencePartition> {
  const contentIds = storyContentIds(input.suppressedContentRefs);
  const ownedContents =
    contentIds.length === 0
      ? []
      : await transaction.vnextStoryContent.findMany({
          where: {
            id: { in: contentIds },
            ownerPrincipalId: input.ownerPrincipalId,
            ...(input.workspaceId === null
              ? {}
              : { workspaceId: input.workspaceId }),
          },
          select: { id: true, status: true, acceptedAt: true },
        });
  if (ownedContents.length !== contentIds.length) {
    if (mode === "replay") throw new SafetyDispositionConflictError();
    throw new SafetyDispositionNotFoundError();
  }
  if (
    ownedContents.some(
      (content) =>
        (content.status === VnextStoryContentStatus.ACCEPTED) !==
        (content.acceptedAt !== null),
    )
  ) {
    if (mode === "replay") throw new SafetyDispositionConflictError();
    throw new SafetyDispositionFenceLostError();
  }
  const acceptedContentIds = new Set(
    ownedContents
      .filter((content) => content.status === VnextStoryContentStatus.ACCEPTED)
      .map((content) => content.id),
  );
  const implicatedContentRefs = input.suppressedContentRefs.filter((ref) => {
    const contentId = STORY_CONTENT_REF_PATTERN.exec(ref)?.[1];
    return (
      contentId !== undefined && acceptedContentIds.has(contentId.toLowerCase())
    );
  });
  const implicatedContentRefSet = new Set(implicatedContentRefs);
  return {
    suppressedContentRefs: input.suppressedContentRefs.filter(
      (ref) => !implicatedContentRefSet.has(ref),
    ),
    implicatedContentRefs,
    mutableContentIds: ownedContents
      .filter(
        (content) =>
          content.acceptedAt === null &&
          (content.status === VnextStoryContentStatus.DRAFT ||
            content.status === VnextStoryContentStatus.REVISION),
      )
      .map((content) => content.id),
  };
}

export class PrismaSafetyDispositionUow implements SafetyDispositionUnitOfWork {
  constructor(
    private readonly client: PrismaClient,
    private readonly probe?: VnextSafetyDispositionProbe,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async apply(
    input: SafetyDispositionCommand,
  ): Promise<SafetyDispositionResult> {
    requireCommand(input);
    const safetyCaseId = randomUUID();
    const nextProjectionVersionId = randomUUID();

    for (let attempt = 1; attempt <= TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.client.$transaction(
          async (transaction) => {
            await lockCreativeTaskMutationWindow(transaction);
            const replay = await readReplay(transaction, input);
            if (replay !== null) return replay;

            const now = currentTime(this.clock);
            const scope = await requireOwnedScope(transaction, input, now);
            const activeRelatedTasks =
              await transaction.vnextCreativeTask.findMany({
                where: {
                  ownerPrincipalId: input.ownerPrincipalId,
                  ...(input.triggeringTask === null
                    ? {}
                    : { id: { not: input.triggeringTask.taskId } }),
                  status: {
                    in: [
                      VnextCreativeTaskStatus.QUEUED,
                      VnextCreativeTaskStatus.LEASED,
                      VnextCreativeTaskStatus.RETRY_WAIT,
                    ],
                  },
                  ...taskScopeWhere(input),
                },
                select: { id: true, status: true },
                orderBy: { id: "asc" },
              });
            const relatedTaskIds = activeRelatedTasks.map((task) => task.id);
            const relatedLeasedTaskIds = activeRelatedTasks
              .filter((task) => task.status === VnextCreativeTaskStatus.LEASED)
              .map((task) => task.id);
            const relatedRunningTraces =
              relatedTaskIds.length === 0
                ? []
                : await transaction.vnextCreativeRunTrace.findMany({
                    where: {
                      ownerPrincipalId: input.ownerPrincipalId,
                      taskId: { in: relatedTaskIds },
                      status: VnextCreativeRunStatus.RUNNING,
                    },
                    select: { id: true, taskId: true },
                    orderBy: { id: "asc" },
                  });
            const leasedTaskIdSet = new Set(relatedLeasedTaskIds);
            if (
              relatedRunningTraces.length !== relatedLeasedTaskIds.length ||
              relatedRunningTraces.some(
                (trace) => !leasedTaskIdSet.has(trace.taskId),
              ) ||
              new Set(relatedRunningTraces.map((trace) => trace.taskId))
                .size !== relatedLeasedTaskIds.length
            ) {
              throw new SafetyDispositionFenceLostError();
            }
            // The triggering task is separately recorded and terminalized as
            // BLOCKED. Only tasks that actually transition to CANCELLED belong in
            // taskCancellationRefs / cancelledTaskCount.
            const cancellationRefs = relatedTaskIds;
            const contentEvidence = await partitionContentEvidence(
              transaction,
              input,
              "create",
            );
            const auditRefs = [
              `policy:${input.evidence.policyVersion}`,
              `reason:${input.evidence.reasonCode}`,
              ...contentEvidence.implicatedContentRefs.map(
                (ref) => `${IMPLICATED_CONTENT_REF_PREFIX}${ref}`,
              ),
            ];
            await this.probe?.afterWrite("after_scope_fence");

            await transaction.vnextSafetyCase.create({
              data: {
                id: safetyCaseId,
                ownerPrincipalId: input.ownerPrincipalId,
                experienceSessionId: input.experienceSessionId,
                complianceSessionId: scope.compliance.id,
                workspaceId: input.workspaceId,
                triggeringTaskId: input.triggeringTask?.taskId ?? null,
                triggerType: enumTrigger(input.evidence.triggerType),
                triggerDigest: input.evidence.triggerDigest,
                severity: enumSeverity(input.evidence.severity),
                policyVersion: input.evidence.policyVersion,
                disposition: enumDisposition(input.evidence.disposition),
                status: VnextSafetyCaseStatus.OPEN,
                safetyContactRef: input.evidence.safetyContactRef,
                taskCancellationRefs: jsonInput(cancellationRefs),
                suppressedContentRefs: jsonInput(
                  contentEvidence.suppressedContentRefs,
                ),
                // Delivery evidence belongs to the outbox dispatcher and must not
                // be pre-written by a policy evaluation.
                humanEscalationRef: null,
                auditRefs: jsonInput(auditRefs),
                openedAt: now,
                version: 1,
              },
            });
            await this.probe?.afterWrite("after_safety_case");

            if (contentEvidence.mutableContentIds.length > 0) {
              const contentUpdate =
                await transaction.vnextStoryContent.updateMany({
                  where: {
                    id: { in: contentEvidence.mutableContentIds },
                    ownerPrincipalId: input.ownerPrincipalId,
                    ...(input.workspaceId === null
                      ? {}
                      : { workspaceId: input.workspaceId }),
                    status: {
                      in: [
                        VnextStoryContentStatus.DRAFT,
                        VnextStoryContentStatus.REVISION,
                      ],
                    },
                    acceptedAt: null,
                  },
                  data: { status: VnextStoryContentStatus.REJECTED },
                });
              if (
                contentUpdate.count !== contentEvidence.mutableContentIds.length
              ) {
                throw new SafetyDispositionFenceLostError();
              }
            }
            await this.probe?.afterWrite("after_content_suppression");

            if (input.triggeringTask !== null) {
              const task = input.triggeringTask;
              const taskUpdate = await transaction.vnextCreativeTask.updateMany(
                {
                  where: {
                    id: task.taskId,
                    ownerPrincipalId: input.ownerPrincipalId,
                    kind: enumTaskKind(task.kind),
                    requestId: task.requestId,
                    status: VnextCreativeTaskStatus.LEASED,
                    attemptCount: task.attemptNumber,
                    maxAttempts: task.maxAttempts,
                    stateVersion: task.stateVersion,
                    leaseToken: task.leaseToken,
                    leaseExpiresAt: { equals: task.leaseExpiresAt, gt: now },
                    deadlineAt: { equals: task.deadlineAt, gt: now },
                    inputDigest: task.inputDigest,
                    ...taskScopeWhere(input),
                  },
                  data: {
                    status: VnextCreativeTaskStatus.BLOCKED,
                    stateVersion: { increment: 1 },
                    cancellationRequestedAt: now,
                    lastFailureCode: `safety_${input.evidence.disposition}`,
                    completedAt: now,
                    leaseOwner: null,
                    leaseToken: null,
                    leaseExpiresAt: null,
                  },
                },
              );
              if (taskUpdate.count !== 1) {
                throw new SafetyDispositionFenceLostError();
              }
              await this.probe?.afterWrite("after_triggering_task");

              const traceUpdate =
                await transaction.vnextCreativeRunTrace.updateMany({
                  where: {
                    id: task.runTraceId,
                    taskId: task.taskId,
                    ownerPrincipalId: input.ownerPrincipalId,
                    attemptNumber: task.attemptNumber,
                    inputDigest: task.inputDigest,
                    status: VnextCreativeRunStatus.RUNNING,
                  },
                  data: {
                    status: VnextCreativeRunStatus.BLOCKED,
                    retryable: false,
                    failureCode: `safety_${input.evidence.disposition}`,
                    completedAt: now,
                    sanitizedMetadata: jsonInput({
                      safetyCaseId,
                      policyVersion: input.evidence.policyVersion,
                      reasonCode: input.evidence.reasonCode,
                    }),
                  },
                });
              if (traceUpdate.count !== 1) {
                throw new SafetyDispositionFenceLostError();
              }
              await this.probe?.afterWrite("after_trigger_trace");
            }

            if (relatedTaskIds.length > 0) {
              const relatedTaskUpdate =
                await transaction.vnextCreativeTask.updateMany({
                  where: {
                    id: { in: relatedTaskIds },
                    ownerPrincipalId: input.ownerPrincipalId,
                    status: {
                      in: [
                        VnextCreativeTaskStatus.QUEUED,
                        VnextCreativeTaskStatus.LEASED,
                        VnextCreativeTaskStatus.RETRY_WAIT,
                      ],
                    },
                  },
                  data: {
                    status: VnextCreativeTaskStatus.CANCELLED,
                    stateVersion: { increment: 1 },
                    cancellationRequestedAt: now,
                    lastFailureCode: "safety_case",
                    completedAt: now,
                    leaseOwner: null,
                    leaseToken: null,
                    leaseExpiresAt: null,
                  },
                });
              if (relatedTaskUpdate.count !== relatedTaskIds.length) {
                throw new SafetyDispositionFenceLostError();
              }
              const relatedRunningTraceIds = relatedRunningTraces.map(
                (trace) => trace.id,
              );
              if (relatedRunningTraceIds.length > 0) {
                const relatedTraceUpdate =
                  await transaction.vnextCreativeRunTrace.updateMany({
                    where: {
                      id: { in: relatedRunningTraceIds },
                      ownerPrincipalId: input.ownerPrincipalId,
                      taskId: { in: relatedLeasedTaskIds },
                      status: VnextCreativeRunStatus.RUNNING,
                    },
                    data: {
                      status: VnextCreativeRunStatus.CANCELLED,
                      retryable: false,
                      failureCode: "safety_case",
                      completedAt: now,
                      sanitizedMetadata: jsonInput({ safetyCaseId }),
                    },
                  });
                if (
                  relatedTraceUpdate.count !== relatedRunningTraceIds.length
                ) {
                  throw new SafetyDispositionFenceLostError();
                }
              }
            }
            await this.probe?.afterWrite("after_related_task_cancel");

            const safetyCaseRefs = [
              ...readReferenceList(scope.compliance.safetyCaseRefs),
              safetyCaseId,
            ];
            const complianceUpdate =
              await transaction.vnextComplianceSession.updateMany({
                where: {
                  id: scope.compliance.id,
                  ownerPrincipalId: input.ownerPrincipalId,
                  experienceSessionId: input.experienceSessionId,
                  version: scope.compliance.version,
                },
                data: {
                  status: VnextComplianceStatus.BLOCKED,
                  safetyCaseRefs: jsonInput(safetyCaseRefs),
                  version: { increment: 1 },
                },
              });
            if (complianceUpdate.count !== 1) {
              throw new SafetyDispositionFenceLostError();
            }
            await this.probe?.afterWrite("after_compliance_projection");

            const sessionUpdate =
              await transaction.vnextExperienceSession.updateMany({
                where: {
                  id: input.experienceSessionId,
                  principalId: input.ownerPrincipalId,
                  projectionVersionId: scope.session.projectionVersionId,
                },
                data: { projectionVersionId: nextProjectionVersionId },
              });
            if (sessionUpdate.count !== 1) {
              throw new SafetyDispositionFenceLostError();
            }
            await this.probe?.afterWrite("after_session_projection");

            const event = expectedEvent(input, safetyCaseId);
            await transaction.vnextOutboxEvent.create({
              data: {
                ownerPrincipalId: input.ownerPrincipalId,
                taskId: input.triggeringTask?.taskId ?? null,
                aggregateType: "safety_case",
                aggregateId: safetyCaseId,
                aggregateVersion: 1,
                eventType: event.eventType,
                idempotencyKey: input.idempotencyKey,
                payload: jsonInput(event.payload),
                payloadDigest: digest(event.payload),
                status: VnextOutboxEventStatus.PENDING,
                attemptCount: 0,
                maxAttempts: 10,
                availableAt: now,
              },
            });
            await this.probe?.afterWrite("after_outbox");
            await this.probe?.afterWrite("before_commit");

            return {
              caseId: safetyCaseId,
              disposition: input.evidence.disposition,
              projectionVersionId: nextProjectionVersionId,
              cancelledTaskCount: cancellationRefs.length,
              creationDisposition: "created",
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (!isRetryableTransactionError(error)) throw error;
        const replay = await this.client.$transaction(
          (transaction) => readReplay(transaction, input),
          { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
        );
        if (replay !== null) return replay;
        if (attempt === TRANSACTION_ATTEMPTS) throw error;
      }
    }
    throw new Error("safety disposition transaction attempts exhausted");
  }
}
