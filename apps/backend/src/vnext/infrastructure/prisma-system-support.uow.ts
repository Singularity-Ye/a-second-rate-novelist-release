import { createHash, randomUUID } from "node:crypto";
import {
  Prisma,
  PrismaClient,
  VnextComplianceStatus,
  VnextCreativeRunStatus,
  VnextCreativeTaskStatus,
  VnextExperienceAuthState,
  VnextPrincipalKind,
  VnextStoryContentStatus,
  VnextSystemSupportCommandActor,
  VnextSystemSupportCommandType,
  VnextSystemSupportFactType,
  type VnextSystemSupportCase,
} from "@prisma/client";
import type {
  CreativeAttemptRecord,
  EncounterManifestationEvent,
  EncounterOpportunityRef,
  EncounterPlan,
  FormalWorkEvidence,
  HostTaskChoice,
  HostTaskDraft,
  PublishedHostTask,
  SubsystemDirective,
  SystemSourceMaterial,
  SystemSupportDayCloseProjection,
  VnextSystemSupportCaseProjection,
  VnextSystemSupportMutationResponse,
} from "@erliu/shared-contracts";
import {
  compileEncounter,
  issueSubsystemDirective,
  projectSystemSupportDayClose,
  publishHostTask,
  recordCreativeAttempt,
  recordEncounterManifestation,
  recordFormalWorkEvidence,
  recordHostTaskChoice,
  registerSystemSourceMaterial,
  validateHostTaskDraft,
} from "../domain/system-support.js";
import {
  SystemSupportCanonicalEvidenceError,
  SystemSupportCaseNotFoundError,
  SystemSupportIdempotencyConflictError,
  SystemSupportLedgerCorruptError,
  SystemSupportSessionNotFoundError,
  SystemSupportStaleVersionError,
  SystemSupportStateConflictError,
  type CloseSystemSupportDayInput,
  type CompileSystemSupportEncounterInput,
  type IssueSystemSupportDirectiveInput,
  type PublishSystemSupportHostTaskInput,
  type ReadOwnedSystemSupportCaseInput,
  type RecordSystemSupportCreativeAttemptInput,
  type RecordSystemSupportFormalEvidenceInput,
  type RecordSystemSupportHostChoiceInput,
  type RecordSystemSupportManifestationInput,
  type RegisterSystemSupportSourceInput,
  type SystemSupportUnitOfWork,
  type SystemSupportWriteProbe,
} from "../domain/system-support.uow.js";

const TRANSACTION_ATTEMPTS = 3;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const PLAN_STATUSES = new Set([
  "ready",
  "waiting",
  "needs_host_choice",
  "no_legal_path",
  "cancelled",
]);
const PLAN_REASONS = new Set([
  "task_choice_missing",
  "host_rejected",
  "host_deferred",
  "no_registered_opportunity",
  "waiting_for_registered_opportunity",
  "additional_host_choice_required",
  "ready_on_existing_plan",
  "ready_with_registered_nudge",
]);

type Transaction = Prisma.TransactionClient;

interface LedgerFact {
  readonly sequence: number;
  readonly factType: VnextSystemSupportFactType;
  readonly payload: Prisma.JsonValue;
  readonly payloadDigest: string;
}

interface ProjectionMetadata {
  readonly caseId: string;
  readonly ownerPrincipalId: string;
  readonly workspaceId: string;
  readonly versionId: string;
  readonly aggregateVersion: number;
  readonly lastFactSequence: number;
}

interface PendingFact {
  readonly factType: VnextSystemSupportFactType;
  readonly payload: object;
}

interface CaseCommandSettings {
  readonly ownerPrincipalId: string;
  readonly experienceSessionId?: string;
  readonly caseId: string;
  readonly clientRequestId: string;
  readonly basedOnVersionId: string;
  readonly commandType: VnextSystemSupportCommandType;
  readonly actor: VnextSystemSupportCommandActor;
  readonly requestPayload: object;
  readonly buildFacts: (input: {
    readonly transaction: Transaction;
    readonly supportCase: VnextSystemSupportCase;
    readonly projection: VnextSystemSupportCaseProjection;
    readonly now: Date;
  }) => Promise<readonly PendingFact[]> | readonly PendingFact[];
}

function canonicalValue(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalValue);
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      if (record[key] === undefined) {
        throw new SystemSupportLedgerCorruptError();
      }
      normalized[key] = canonicalValue(record[key]);
    }
    return normalized;
  }
  throw new SystemSupportLedgerCorruptError();
}

function canonicalJson(value: unknown) {
  return JSON.stringify(canonicalValue(value));
}

function digest(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function jsonInput(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function currentTime(clock: () => Date) {
  const now = clock();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("system-support clock returned an invalid date");
  }
  return new Date(now.getTime());
}

function requiredRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SystemSupportLedgerCorruptError();
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new SystemSupportLedgerCorruptError();
  }
}

function assertCanonicalEqual(actual: unknown, expected: unknown) {
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new SystemSupportLedgerCorruptError();
  }
}

function readOpportunityRef(value: unknown): EncounterOpportunityRef {
  const record = requiredRecord(value);
  exactKeys(record, [
    "opportunityId",
    "contractRef",
    "activityKey",
    "beatId",
    "routeKey",
  ]);
  if (
    typeof record.opportunityId !== "string" ||
    typeof record.contractRef !== "string" ||
    typeof record.activityKey !== "string" ||
    typeof record.beatId !== "string" ||
    (record.routeKey !== null && typeof record.routeKey !== "string")
  ) {
    throw new SystemSupportLedgerCorruptError();
  }
  return {
    opportunityId: record.opportunityId,
    contractRef: record.contractRef,
    activityKey: record.activityKey,
    beatId: record.beatId,
    routeKey: record.routeKey,
  };
}

function readEncounterPlan(
  payload: unknown,
  task: PublishedHostTask,
): EncounterPlan {
  const record = requiredRecord(payload);
  exactKeys(record, [
    "schemaVersion",
    "planId",
    "taskId",
    "sourceMaterialId",
    "status",
    "reason",
    "opportunity",
    "compiledAt",
  ]);
  if (
    record.schemaVersion !== 1 ||
    typeof record.planId !== "string" ||
    record.taskId !== task.taskId ||
    record.sourceMaterialId !== task.sourceMaterialId ||
    typeof record.status !== "string" ||
    !PLAN_STATUSES.has(record.status) ||
    typeof record.reason !== "string" ||
    !PLAN_REASONS.has(record.reason) ||
    typeof record.compiledAt !== "string" ||
    Number.isNaN(Date.parse(record.compiledAt))
  ) {
    throw new SystemSupportLedgerCorruptError();
  }
  const opportunity =
    record.opportunity === null
      ? null
      : readOpportunityRef(record.opportunity);
  if ((record.status === "ready") !== (opportunity !== null)) {
    if (
      record.status !== "waiting" &&
      record.status !== "needs_host_choice"
    ) {
      throw new SystemSupportLedgerCorruptError();
    }
  }
  return {
    schemaVersion: 1,
    planId: record.planId,
    taskId: task.taskId,
    sourceMaterialId: task.sourceMaterialId,
    status: record.status as EncounterPlan["status"],
    reason: record.reason as EncounterPlan["reason"],
    opportunity,
    compiledAt: record.compiledAt,
  };
}

function projectLedger(
  metadata: ProjectionMetadata,
  facts: readonly LedgerFact[],
): VnextSystemSupportCaseProjection {
  if (
    facts.length === 0 ||
    facts[facts.length - 1]?.sequence !== metadata.lastFactSequence
  ) {
    throw new SystemSupportLedgerCorruptError();
  }

  let sourceMaterial: SystemSourceMaterial | null = null;
  let subsystemDirective: SubsystemDirective | null = null;
  let latestDraft: HostTaskDraft | null = null;
  let publishedTask: PublishedHostTask | null = null;
  let hostChoice: HostTaskChoice | null = null;
  let encounterPlan: EncounterPlan | null = null;
  let manifestation: EncounterManifestationEvent | null = null;
  let creativeAttempt: CreativeAttemptRecord | null = null;
  let formalEvidence: FormalWorkEvidence | null = null;
  let dayClose: SystemSupportDayCloseProjection | null = null;

  for (const [index, fact] of facts.entries()) {
    if (
      fact.sequence !== index + 1 ||
      !SHA256_PATTERN.test(fact.payloadDigest) ||
      digest(fact.payload) !== fact.payloadDigest
    ) {
      throw new SystemSupportLedgerCorruptError();
    }
    const payload = requiredRecord(fact.payload);
    if (payload.schemaVersion !== 1) {
      throw new SystemSupportLedgerCorruptError();
    }

    switch (fact.factType) {
      case VnextSystemSupportFactType.SOURCE_MATERIAL: {
        if (sourceMaterial !== null || fact.sequence !== 1) {
          throw new SystemSupportLedgerCorruptError();
        }
        sourceMaterial = registerSystemSourceMaterial(
          payload as unknown as SystemSourceMaterial,
        );
        if (
          sourceMaterial.ownerPrincipalId !== metadata.ownerPrincipalId ||
          sourceMaterial.storyId !== metadata.workspaceId
        ) {
          throw new SystemSupportLedgerCorruptError();
        }
        break;
      }
      case VnextSystemSupportFactType.SUBSYSTEM_DIRECTIVE: {
        if (sourceMaterial === null || publishedTask !== null) {
          throw new SystemSupportLedgerCorruptError();
        }
        subsystemDirective = issueSubsystemDirective(
          sourceMaterial,
          payload as unknown as SubsystemDirective,
        );
        break;
      }
      case VnextSystemSupportFactType.HOST_TASK_DRAFT: {
        if (sourceMaterial === null || subsystemDirective === null) {
          throw new SystemSupportLedgerCorruptError();
        }
        const draft = payload as unknown as HostTaskDraft;
        if (!validateHostTaskDraft(sourceMaterial, subsystemDirective, draft).canPublish) {
          throw new SystemSupportLedgerCorruptError();
        }
        latestDraft = draft;
        break;
      }
      case VnextSystemSupportFactType.PUBLISHED_HOST_TASK: {
        if (
          sourceMaterial === null ||
          subsystemDirective === null ||
          latestDraft === null ||
          publishedTask !== null
        ) {
          throw new SystemSupportLedgerCorruptError();
        }
        const expected = publishHostTask({
          actor: "main_system",
          source: sourceMaterial,
          directive: subsystemDirective,
          draft: latestDraft,
          taskId: String(payload.taskId),
          publishedAt: String(payload.publishedAt),
        });
        assertCanonicalEqual(payload, expected);
        publishedTask = expected;
        break;
      }
      case VnextSystemSupportFactType.HOST_TASK_CHOICE: {
        if (publishedTask === null || hostChoice !== null) {
          throw new SystemSupportLedgerCorruptError();
        }
        const expected = recordHostTaskChoice(
          publishedTask,
          payload as unknown as HostTaskChoice,
        );
        assertCanonicalEqual(payload, expected);
        hostChoice = expected;
        break;
      }
      case VnextSystemSupportFactType.ENCOUNTER_PLAN: {
        if (publishedTask === null) {
          throw new SystemSupportLedgerCorruptError();
        }
        encounterPlan = readEncounterPlan(payload, publishedTask);
        break;
      }
      case VnextSystemSupportFactType.ENCOUNTER_MANIFESTATION: {
        if (encounterPlan === null || manifestation !== null) {
          throw new SystemSupportLedgerCorruptError();
        }
        const expected = recordEncounterManifestation({
          eventId: String(payload.eventId),
          plan: encounterPlan,
          result: payload.result as EncounterManifestationEvent["result"],
          occurredAt: String(payload.occurredAt),
        });
        assertCanonicalEqual(payload, expected);
        manifestation = expected;
        break;
      }
      case VnextSystemSupportFactType.CREATIVE_ATTEMPT: {
        if (
          publishedTask === null ||
          hostChoice === null ||
          creativeAttempt !== null
        ) {
          throw new SystemSupportLedgerCorruptError();
        }
        const expected = recordCreativeAttempt({
          task: publishedTask,
          choice: hostChoice,
          attemptId: String(payload.attemptId),
          manifestationEventId:
            payload.manifestationEventId === null
              ? null
              : String(payload.manifestationEventId),
          activityEventRef: String(payload.activityEventRef),
          status: payload.status as CreativeAttemptRecord["status"],
          startedAt: String(payload.startedAt),
          endedAt: payload.endedAt === null ? null : String(payload.endedAt),
        });
        assertCanonicalEqual(payload, expected);
        creativeAttempt = expected;
        break;
      }
      case VnextSystemSupportFactType.FORMAL_WORK_EVIDENCE: {
        if (publishedTask === null || formalEvidence !== null) {
          throw new SystemSupportLedgerCorruptError();
        }
        const expected = recordFormalWorkEvidence(
          publishedTask,
          payload as unknown as FormalWorkEvidence,
        );
        assertCanonicalEqual(payload, expected);
        formalEvidence = expected;
        break;
      }
      case VnextSystemSupportFactType.DAY_CLOSE: {
        if (publishedTask === null || encounterPlan === null || dayClose !== null) {
          throw new SystemSupportLedgerCorruptError();
        }
        const persisted = payload as unknown as SystemSupportDayCloseProjection;
        const expected = projectSystemSupportDayClose({
          memoryId: persisted.memory.memoryId,
          chronicleId: persisted.chronicle.chronicleId,
          generatedAt: persisted.memory.generatedAt,
          task: publishedTask,
          choice: hostChoice,
          encounterPlan,
          manifestation,
          attempt: creativeAttempt,
          evidence: formalEvidence,
        });
        assertCanonicalEqual(payload, expected);
        dayClose = expected;
        break;
      }
      default:
        throw new SystemSupportLedgerCorruptError();
    }
  }

  if (sourceMaterial === null) {
    throw new SystemSupportLedgerCorruptError();
  }
  return {
    schemaVersion: 1,
    caseId: metadata.caseId,
    workspaceId: metadata.workspaceId,
    versionId: metadata.versionId,
    aggregateVersion: metadata.aggregateVersion,
    sourceMaterial,
    subsystemDirective,
    latestDraft,
    publishedTask,
    hostChoice,
    encounterPlan,
    manifestation,
    creativeAttempt,
    formalEvidence,
    dayClose,
  };
}

async function requireActiveOwnedSession(
  transaction: Transaction,
  ownerPrincipalId: string,
  experienceSessionId: string,
  now: Date,
) {
  const session = await transaction.vnextExperienceSession.findFirst({
    where: {
      id: experienceSessionId,
      principalId: ownerPrincipalId,
      revokedAt: null,
      expiresAt: { gt: now },
      OR: [
        {
          authState: VnextExperienceAuthState.GUEST_ACTIVE,
          guestExpiresAt: { gt: now },
        },
        { authState: VnextExperienceAuthState.ACCOUNT_ACTIVE },
      ],
    },
    include: { principal: true, complianceSession: true },
  });
  const identityMatchesAuthState =
    session !== null &&
    ((session.authState === VnextExperienceAuthState.GUEST_ACTIVE &&
      session.principal.kind === VnextPrincipalKind.GUEST) ||
      (session.authState === VnextExperienceAuthState.ACCOUNT_ACTIVE &&
        session.principal.kind === VnextPrincipalKind.ACCOUNT));
  if (
    session === null ||
    !identityMatchesAuthState ||
    session.complianceSession === null ||
    session.complianceSession.ownerPrincipalId !== ownerPrincipalId ||
    session.complianceSession.status !== VnextComplianceStatus.ELIGIBLE
  ) {
    throw new SystemSupportSessionNotFoundError();
  }
}

async function requireOwnedCase(
  transaction: Transaction,
  ownerPrincipalId: string,
  caseId: string,
) {
  const supportCase = await transaction.vnextSystemSupportCase.findFirst({
    where: { id: caseId, ownerPrincipalId },
  });
  if (supportCase === null) {
    throw new SystemSupportCaseNotFoundError();
  }
  return supportCase;
}

async function projectAt(
  transaction: Transaction,
  metadata: ProjectionMetadata,
) {
  const facts = await transaction.vnextSystemSupportFact.findMany({
    where: {
      caseId: metadata.caseId,
      sequence: { lte: metadata.lastFactSequence },
    },
    orderBy: { sequence: "asc" },
    select: {
      sequence: true,
      factType: true,
      payload: true,
      payloadDigest: true,
    },
  });
  return projectLedger(metadata, facts);
}

async function currentProjection(
  transaction: Transaction,
  supportCase: VnextSystemSupportCase,
) {
  const latest = await transaction.vnextSystemSupportCommand.findFirst({
    where: { caseId: supportCase.id, ownerPrincipalId: supportCase.ownerPrincipalId },
    orderBy: { resultAggregateVersion: "desc" },
  });
  if (
    latest === null ||
    latest.resultAggregateVersion !== supportCase.aggregateVersion ||
    latest.resultVersionId !== supportCase.versionId
  ) {
    throw new SystemSupportLedgerCorruptError();
  }
  return {
    lastFactSequence: latest.lastFactSequence,
    projection: await projectAt(transaction, {
      caseId: supportCase.id,
      ownerPrincipalId: supportCase.ownerPrincipalId,
      workspaceId: supportCase.workspaceId,
      versionId: supportCase.versionId,
      aggregateVersion: supportCase.aggregateVersion,
      lastFactSequence: latest.lastFactSequence,
    }),
  };
}

async function readReplay(
  transaction: Transaction,
  input: {
    readonly ownerPrincipalId: string;
    readonly clientRequestId: string;
    readonly commandType: VnextSystemSupportCommandType;
    readonly actor: VnextSystemSupportCommandActor;
    readonly requestDigest: string;
    readonly caseId?: string;
    readonly basedOnVersionId: string | null;
  },
): Promise<VnextSystemSupportMutationResponse | null> {
  const command = await transaction.vnextSystemSupportCommand.findUnique({
    where: {
      ownerPrincipalId_clientRequestId: {
        ownerPrincipalId: input.ownerPrincipalId,
        clientRequestId: input.clientRequestId,
      },
    },
  });
  if (command === null) {
    return null;
  }
  if (
    command.commandType !== input.commandType ||
    command.actor !== input.actor ||
    command.requestDigest !== input.requestDigest ||
    command.basedOnVersionId !== input.basedOnVersionId ||
    (input.caseId !== undefined && command.caseId !== input.caseId)
  ) {
    throw new SystemSupportIdempotencyConflictError();
  }
  const supportCase = await requireOwnedCase(
    transaction,
    input.ownerPrincipalId,
    command.caseId,
  );
  return {
    creationDisposition: "replayed",
    projection: await projectAt(transaction, {
      caseId: supportCase.id,
      ownerPrincipalId: supportCase.ownerPrincipalId,
      workspaceId: supportCase.workspaceId,
      versionId: command.resultVersionId,
      aggregateVersion: command.resultAggregateVersion,
      lastFactSequence: command.lastFactSequence,
    }),
  };
}

function outboxPayload(input: {
  readonly caseId: string;
  readonly workspaceId: string;
  readonly commandId: string;
  readonly commandType: VnextSystemSupportCommandType;
  readonly factIds: readonly string[];
  readonly aggregateVersion: number;
  readonly versionId: string;
}) {
  return {
    schemaVersion: 1 as const,
    caseId: input.caseId,
    workspaceId: input.workspaceId,
    commandId: input.commandId,
    commandType: input.commandType,
    factIds: [...input.factIds],
    aggregateVersion: input.aggregateVersion,
    versionId: input.versionId,
  };
}

function isRetryableTransactionError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

export class PrismaSystemSupportUow implements SystemSupportUnitOfWork {
  constructor(
    private readonly client: PrismaClient,
    private readonly probe?: SystemSupportWriteProbe,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async registerSource(
    input: RegisterSystemSupportSourceInput,
  ): Promise<VnextSystemSupportMutationResponse> {
    const requestDigest = digest({
      command: "register_source",
      workspaceId: input.request.workspaceId,
      title: input.request.title,
      sourceRef: input.request.sourceRef,
      sourceDigest: input.request.sourceDigest,
      rights: input.request.rights,
    });

    for (let attempt = 1; attempt <= TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.client.$transaction(
          async (transaction) => {
            const now = currentTime(this.clock);
            await requireActiveOwnedSession(
              transaction,
              input.ownerPrincipalId,
              input.experienceSessionId,
              now,
            );
            const replay = await readReplay(transaction, {
              ownerPrincipalId: input.ownerPrincipalId,
              clientRequestId: input.request.clientRequestId,
              commandType: VnextSystemSupportCommandType.REGISTER_SOURCE,
              actor: VnextSystemSupportCommandActor.MAIN_SYSTEM,
              requestDigest,
              basedOnVersionId: null,
            });
            if (replay !== null) {
              return replay;
            }

            const workspace = await transaction.vnextStoryWorkspace.findFirst({
              where: {
                id: input.request.workspaceId,
                ownerPrincipalId: input.ownerPrincipalId,
              },
              select: { id: true },
            });
            if (workspace === null) {
              throw new SystemSupportCaseNotFoundError();
            }

            const caseId = randomUUID();
            const versionId = randomUUID();
            const commandId = randomUUID();
            const factId = randomUUID();
            const source = registerSystemSourceMaterial({
              schemaVersion: 1,
              sourceMaterialId: randomUUID(),
              ownerPrincipalId: input.ownerPrincipalId,
              storyId: workspace.id,
              title: input.request.title,
              sourceRef: input.request.sourceRef,
              sourceDigest: input.request.sourceDigest,
              rights: input.request.rights,
              registeredAt: now.toISOString(),
            });
            const supportCase = await transaction.vnextSystemSupportCase.create({
              data: {
                id: caseId,
                ownerPrincipalId: input.ownerPrincipalId,
                workspaceId: workspace.id,
                aggregateVersion: 1,
                versionId,
              },
            });
            await this.probe?.afterWrite("after_case");
            await transaction.vnextSystemSupportCommand.create({
              data: {
                id: commandId,
                caseId,
                ownerPrincipalId: input.ownerPrincipalId,
                clientRequestId: input.request.clientRequestId,
                commandType: VnextSystemSupportCommandType.REGISTER_SOURCE,
                actor: VnextSystemSupportCommandActor.MAIN_SYSTEM,
                requestDigest,
                basedOnVersionId: null,
                resultVersionId: versionId,
                resultAggregateVersion: 1,
                firstFactSequence: 1,
                lastFactSequence: 1,
              },
            });
            await this.probe?.afterWrite("after_command");
            await transaction.vnextSystemSupportFact.create({
              data: {
                id: factId,
                caseId,
                ownerPrincipalId: input.ownerPrincipalId,
                commandId,
                sequence: 1,
                factType: VnextSystemSupportFactType.SOURCE_MATERIAL,
                payload: jsonInput(source),
                payloadDigest: digest(source),
              },
            });
            await this.probe?.afterWrite("after_fact");
            const event = outboxPayload({
              caseId,
              workspaceId: workspace.id,
              commandId,
              commandType: VnextSystemSupportCommandType.REGISTER_SOURCE,
              factIds: [factId],
              aggregateVersion: 1,
              versionId,
            });
            await transaction.vnextOutboxEvent.create({
              data: {
                ownerPrincipalId: input.ownerPrincipalId,
                taskId: null,
                aggregateType: "system_support_case",
                aggregateId: caseId,
                aggregateVersion: 1,
                eventType: "vnext.system_support.source_registered",
                idempotencyKey: `system-support:${commandId}`,
                payload: jsonInput(event),
                payloadDigest: digest(event),
                availableAt: now,
              },
            });
            await this.probe?.afterWrite("after_outbox");
            await this.probe?.afterWrite("before_commit");
            return {
              creationDisposition: "created",
              projection: await projectAt(transaction, {
                caseId: supportCase.id,
                ownerPrincipalId: supportCase.ownerPrincipalId,
                workspaceId: supportCase.workspaceId,
                versionId,
                aggregateVersion: 1,
                lastFactSequence: 1,
              }),
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (isRetryableTransactionError(error) && attempt < TRANSACTION_ATTEMPTS) {
          continue;
        }
        throw error;
      }
    }
    throw new Error("system-support registration retry budget exhausted");
  }

  async readOwnedCase(
    input: ReadOwnedSystemSupportCaseInput,
  ): Promise<VnextSystemSupportCaseProjection> {
    return this.client.$transaction(
      async (transaction) => {
        const now = currentTime(this.clock);
        await requireActiveOwnedSession(
          transaction,
          input.ownerPrincipalId,
          input.experienceSessionId,
          now,
        );
        const supportCase = await requireOwnedCase(
          transaction,
          input.ownerPrincipalId,
          input.caseId,
        );
        return (await currentProjection(transaction, supportCase)).projection;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  issueDirective(input: IssueSystemSupportDirectiveInput) {
    return this.mutateCase({
      ...input,
      commandType: VnextSystemSupportCommandType.ISSUE_SUBSYSTEM_DIRECTIVE,
      actor: VnextSystemSupportCommandActor.SUBSYSTEM,
      requestPayload: {
        command: "issue_subsystem_directive",
        ...input,
      },
      buildFacts: ({ projection, now }) => {
        if (projection.subsystemDirective !== null || projection.publishedTask !== null) {
          throw new SystemSupportStateConflictError("directive_already_issued");
        }
        const directive = issueSubsystemDirective(projection.sourceMaterial, {
          schemaVersion: 1,
          directiveId: randomUUID(),
          ownerPrincipalId: input.ownerPrincipalId,
          storyId: projection.workspaceId,
          sourceMaterialId: projection.sourceMaterial.sourceMaterialId,
          observationRefs: input.observationRefs,
          whyNow: input.whyNow,
          objective: input.objective,
          hardConstraints: input.hardConstraints,
          minimumDeliverable: input.minimumDeliverable,
          acceptanceCriteria: input.acceptanceCriteria,
          expectedEvidenceKind: input.expectedEvidenceKind,
          suggestedManifestationModes: input.suggestedManifestationModes,
          opportunityTags: input.opportunityTags,
          confidence: input.confidence,
          issuedAt: now.toISOString(),
        });
        return [
          {
            factType: VnextSystemSupportFactType.SUBSYSTEM_DIRECTIVE,
            payload: directive,
          },
        ];
      },
    });
  }

  publishHostTask(input: PublishSystemSupportHostTaskInput) {
    return this.mutateCase({
      ownerPrincipalId: input.ownerPrincipalId,
      experienceSessionId: input.experienceSessionId,
      caseId: input.caseId,
      clientRequestId: input.request.clientRequestId,
      basedOnVersionId: input.request.basedOnVersionId,
      commandType: VnextSystemSupportCommandType.PUBLISH_HOST_TASK,
      actor: VnextSystemSupportCommandActor.MAIN_SYSTEM,
      requestPayload: { command: "publish_host_task", ...input.request },
      buildFacts: ({ projection, now }) => {
        if (projection.subsystemDirective === null) {
          throw new SystemSupportStateConflictError("directive_missing");
        }
        if (projection.publishedTask !== null) {
          throw new SystemSupportStateConflictError("task_already_published");
        }
        const draft: HostTaskDraft = {
          schemaVersion: 1,
          draftId: randomUUID(),
          directiveId: projection.subsystemDirective.directiveId,
          ownerPrincipalId: input.ownerPrincipalId,
          storyId: projection.workspaceId,
          sourceMaterialId: projection.sourceMaterial.sourceMaterialId,
          version: 1,
          userFacingMessage: input.request.userFacingMessage,
          whyNow: input.request.whyNow,
          objective: input.request.objective,
          hardConstraints: input.request.hardConstraints,
          minimumDeliverable: input.request.minimumDeliverable,
          acceptanceCriteria: input.request.acceptanceCriteria,
          expectedEvidenceKind: input.request.expectedEvidenceKind,
          sourceUseMode: input.request.sourceUseMode,
          manifestationMode: input.request.manifestationMode,
          opportunityTags: input.request.opportunityTags,
          updatedAt: now.toISOString(),
        };
        const task = publishHostTask({
          actor: "main_system",
          source: projection.sourceMaterial,
          directive: projection.subsystemDirective,
          draft,
          taskId: randomUUID(),
          publishedAt: now.toISOString(),
        });
        return [
          {
            factType: VnextSystemSupportFactType.HOST_TASK_DRAFT,
            payload: draft,
          },
          {
            factType: VnextSystemSupportFactType.PUBLISHED_HOST_TASK,
            payload: task,
          },
        ];
      },
    });
  }

  recordHostChoice(input: RecordSystemSupportHostChoiceInput) {
    return this.mutateCase({
      ...input,
      commandType: VnextSystemSupportCommandType.RECORD_HOST_CHOICE,
      actor: VnextSystemSupportCommandActor.NOVELIST,
      requestPayload: { command: "record_host_choice", ...input },
      buildFacts: ({ projection, now }) => {
        if (projection.publishedTask === null) {
          throw new SystemSupportStateConflictError("published_task_missing");
        }
        if (projection.hostChoice !== null) {
          throw new SystemSupportStateConflictError("host_choice_already_recorded");
        }
        const choice = recordHostTaskChoice(projection.publishedTask, {
          schemaVersion: 1,
          choiceId: randomUUID(),
          taskId: projection.publishedTask.taskId,
          actor: "novelist",
          decision: input.decision,
          reason: input.reason,
          narrowedObjective: input.narrowedObjective,
          lifeInterventionConsent: input.lifeInterventionConsent,
          chosenAt: now.toISOString(),
        });
        return [
          {
            factType: VnextSystemSupportFactType.HOST_TASK_CHOICE,
            payload: choice,
          },
        ];
      },
    });
  }

  compileEncounter(input: CompileSystemSupportEncounterInput) {
    return this.mutateCase({
      ...input,
      commandType: VnextSystemSupportCommandType.COMPILE_ENCOUNTER,
      actor: VnextSystemSupportCommandActor.SYSTEM_RUNTIME,
      requestPayload: {
        command: "compile_encounter",
        ownerPrincipalId: input.ownerPrincipalId,
        caseId: input.caseId,
        clientRequestId: input.clientRequestId,
        basedOnVersionId: input.basedOnVersionId,
      },
      buildFacts: ({ projection, now }) => {
        if (projection.publishedTask === null) {
          throw new SystemSupportStateConflictError("published_task_missing");
        }
        if (projection.manifestation !== null) {
          throw new SystemSupportStateConflictError("encounter_already_manifested");
        }
        const plan = compileEncounter({
          planId: randomUUID(),
          task: projection.publishedTask,
          choice: projection.hostChoice,
          opportunities: input.opportunities,
          compiledAt: now.toISOString(),
        });
        return [
          {
            factType: VnextSystemSupportFactType.ENCOUNTER_PLAN,
            payload: plan,
          },
        ];
      },
    });
  }

  recordManifestation(input: RecordSystemSupportManifestationInput) {
    return this.mutateCase({
      ...input,
      commandType: VnextSystemSupportCommandType.RECORD_MANIFESTATION,
      actor: VnextSystemSupportCommandActor.LIFE_RUNTIME,
      requestPayload: { command: "record_manifestation", ...input },
      buildFacts: ({ projection, now }) => {
        if (projection.encounterPlan === null) {
          throw new SystemSupportStateConflictError("encounter_plan_missing");
        }
        if (projection.manifestation !== null) {
          throw new SystemSupportStateConflictError("manifestation_already_recorded");
        }
        const manifestation = recordEncounterManifestation({
          eventId: randomUUID(),
          plan: projection.encounterPlan,
          result: input.result,
          occurredAt: now.toISOString(),
        });
        return [
          {
            factType: VnextSystemSupportFactType.ENCOUNTER_MANIFESTATION,
            payload: manifestation,
          },
        ];
      },
    });
  }

  recordCreativeAttempt(input: RecordSystemSupportCreativeAttemptInput) {
    return this.mutateCase({
      ...input,
      commandType: VnextSystemSupportCommandType.RECORD_CREATIVE_ATTEMPT,
      actor: VnextSystemSupportCommandActor.CREATIVE_RUNTIME,
      requestPayload: { command: "record_creative_attempt", ...input },
      buildFacts: ({ projection, now }) => {
        if (projection.publishedTask === null || projection.hostChoice === null) {
          throw new SystemSupportStateConflictError("executable_host_choice_missing");
        }
        if (projection.creativeAttempt !== null) {
          throw new SystemSupportStateConflictError("creative_attempt_already_recorded");
        }
        const attempt = recordCreativeAttempt({
          task: projection.publishedTask,
          choice: projection.hostChoice,
          attemptId: randomUUID(),
          manifestationEventId: projection.manifestation?.eventId ?? null,
          activityEventRef: input.activityEventRef,
          status: input.status,
          startedAt: now.toISOString(),
          endedAt: input.endedAt,
        });
        return [
          {
            factType: VnextSystemSupportFactType.CREATIVE_ATTEMPT,
            payload: attempt,
          },
        ];
      },
    });
  }

  recordFormalEvidence(input: RecordSystemSupportFormalEvidenceInput) {
    return this.mutateCase({
      ...input,
      commandType: VnextSystemSupportCommandType.RECORD_FORMAL_EVIDENCE,
      actor: VnextSystemSupportCommandActor.CREATIVE_RUNTIME,
      requestPayload: { command: "record_formal_evidence", ...input },
      buildFacts: async ({ transaction, supportCase, projection, now }) => {
        if (projection.publishedTask === null) {
          throw new SystemSupportStateConflictError("published_task_missing");
        }
        if (projection.formalEvidence !== null) {
          throw new SystemSupportStateConflictError("formal_evidence_already_recorded");
        }
        const content = await transaction.vnextStoryContent.findFirst({
          where: {
            id: input.storyContentId,
            ownerPrincipalId: input.ownerPrincipalId,
            workspaceId: supportCase.workspaceId,
          },
          include: { createdByTrace: true, createdByTask: true },
        });
        if (
          content === null ||
          content.status === VnextStoryContentStatus.REJECTED ||
          content.createdByTrace.status !== VnextCreativeRunStatus.SUCCEEDED ||
          content.createdByTrace.fallbackApplied !== false ||
          content.createdByTrace.outputHash !== content.bodyHash ||
          content.createdByTrace.completedAt === null ||
          content.createdByTask.status !== VnextCreativeTaskStatus.SUCCEEDED
        ) {
          throw new SystemSupportCanonicalEvidenceError();
        }
        const kind =
          content.status === VnextStoryContentStatus.ACCEPTED
            ? "accepted_chapter"
            : content.status === VnextStoryContentStatus.REVISION
              ? "chapter_revision"
              : "chapter_draft";
        const evidence = recordFormalWorkEvidence(projection.publishedTask, {
          schemaVersion: 1,
          evidenceId: randomUUID(),
          taskId: projection.publishedTask.taskId,
          kind,
          source: "creative_runtime",
          artifactRef: `vnext-story-content:${content.id}`,
          artifactVersion: content.version,
          lineageRefs: [
            ...(content.parentContentId === null
              ? []
              : [`vnext-story-content:${content.parentContentId}`]),
            `vnext-creative-task:${content.createdByTaskId}`,
            `vnext-creative-trace:${content.createdByTraceId}`,
          ],
          verdict: input.verdict,
          recordedAt: now.toISOString(),
        });
        return [
          {
            factType: VnextSystemSupportFactType.FORMAL_WORK_EVIDENCE,
            payload: evidence,
          },
        ];
      },
    });
  }

  closeDay(input: CloseSystemSupportDayInput) {
    return this.mutateCase({
      ...input,
      commandType: VnextSystemSupportCommandType.CLOSE_DAY,
      actor: VnextSystemSupportCommandActor.SYSTEM_RUNTIME,
      requestPayload: { command: "close_day", ...input },
      buildFacts: ({ projection, now }) => {
        if (projection.publishedTask === null || projection.encounterPlan === null) {
          throw new SystemSupportStateConflictError("day_close_inputs_missing");
        }
        if (projection.dayClose !== null) {
          throw new SystemSupportStateConflictError("day_already_closed");
        }
        const dayClose = projectSystemSupportDayClose({
          memoryId: randomUUID(),
          chronicleId: randomUUID(),
          generatedAt: now.toISOString(),
          task: projection.publishedTask,
          choice: projection.hostChoice,
          encounterPlan: projection.encounterPlan,
          manifestation: projection.manifestation,
          attempt: projection.creativeAttempt,
          evidence: projection.formalEvidence,
        });
        return [
          {
            factType: VnextSystemSupportFactType.DAY_CLOSE,
            payload: dayClose,
          },
        ];
      },
    });
  }

  private async mutateCase(
    settings: CaseCommandSettings,
  ): Promise<VnextSystemSupportMutationResponse> {
    const requestDigest = digest(settings.requestPayload);
    for (let attempt = 1; attempt <= TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.client.$transaction(
          async (transaction) => {
            const now = currentTime(this.clock);
            if (settings.experienceSessionId !== undefined) {
              await requireActiveOwnedSession(
                transaction,
                settings.ownerPrincipalId,
                settings.experienceSessionId,
                now,
              );
            }
            const replay = await readReplay(transaction, {
              ownerPrincipalId: settings.ownerPrincipalId,
              clientRequestId: settings.clientRequestId,
              commandType: settings.commandType,
              actor: settings.actor,
              requestDigest,
              caseId: settings.caseId,
              basedOnVersionId: settings.basedOnVersionId,
            });
            if (replay !== null) {
              return replay;
            }
            const supportCase = await requireOwnedCase(
              transaction,
              settings.ownerPrincipalId,
              settings.caseId,
            );
            if (supportCase.versionId !== settings.basedOnVersionId) {
              throw new SystemSupportStaleVersionError();
            }
            const current = await currentProjection(transaction, supportCase);
            const pendingFacts = await settings.buildFacts({
              transaction,
              supportCase,
              projection: current.projection,
              now,
            });
            if (pendingFacts.length === 0 || pendingFacts.length > 8) {
              throw new SystemSupportStateConflictError("invalid_fact_batch");
            }

            const nextAggregateVersion = supportCase.aggregateVersion + 1;
            const nextVersionId = randomUUID();
            const commandId = randomUUID();
            const firstFactSequence = current.lastFactSequence + 1;
            const lastFactSequence =
              firstFactSequence + pendingFacts.length - 1;
            const updated = await transaction.vnextSystemSupportCase.updateMany({
              where: {
                id: supportCase.id,
                ownerPrincipalId: settings.ownerPrincipalId,
                aggregateVersion: supportCase.aggregateVersion,
                versionId: settings.basedOnVersionId,
              },
              data: {
                aggregateVersion: nextAggregateVersion,
                versionId: nextVersionId,
              },
            });
            if (updated.count !== 1) {
              throw new SystemSupportStaleVersionError();
            }
            await this.probe?.afterWrite("after_case_version");
            await transaction.vnextSystemSupportCommand.create({
              data: {
                id: commandId,
                caseId: supportCase.id,
                ownerPrincipalId: settings.ownerPrincipalId,
                clientRequestId: settings.clientRequestId,
                commandType: settings.commandType,
                actor: settings.actor,
                requestDigest,
                basedOnVersionId: settings.basedOnVersionId,
                resultVersionId: nextVersionId,
                resultAggregateVersion: nextAggregateVersion,
                firstFactSequence,
                lastFactSequence,
              },
            });
            await this.probe?.afterWrite("after_command");
            const factIds: string[] = [];
            for (const [index, fact] of pendingFacts.entries()) {
              const factId = randomUUID();
              factIds.push(factId);
              await transaction.vnextSystemSupportFact.create({
                data: {
                  id: factId,
                  caseId: supportCase.id,
                  ownerPrincipalId: settings.ownerPrincipalId,
                  commandId,
                  sequence: firstFactSequence + index,
                  factType: fact.factType,
                  payload: jsonInput(fact.payload),
                  payloadDigest: digest(fact.payload),
                },
              });
              await this.probe?.afterWrite("after_fact");
            }
            const event = outboxPayload({
              caseId: supportCase.id,
              workspaceId: supportCase.workspaceId,
              commandId,
              commandType: settings.commandType,
              factIds,
              aggregateVersion: nextAggregateVersion,
              versionId: nextVersionId,
            });
            await transaction.vnextOutboxEvent.create({
              data: {
                ownerPrincipalId: settings.ownerPrincipalId,
                taskId: null,
                aggregateType: "system_support_case",
                aggregateId: supportCase.id,
                aggregateVersion: nextAggregateVersion,
                eventType: `vnext.system_support.${settings.commandType.toLowerCase()}`,
                idempotencyKey: `system-support:${commandId}`,
                payload: jsonInput(event),
                payloadDigest: digest(event),
                availableAt: now,
              },
            });
            await this.probe?.afterWrite("after_outbox");
            await this.probe?.afterWrite("before_commit");
            return {
              creationDisposition: "created",
              projection: await projectAt(transaction, {
                caseId: supportCase.id,
                ownerPrincipalId: supportCase.ownerPrincipalId,
                workspaceId: supportCase.workspaceId,
                versionId: nextVersionId,
                aggregateVersion: nextAggregateVersion,
                lastFactSequence,
              }),
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (isRetryableTransactionError(error) && attempt < TRANSACTION_ATTEMPTS) {
          continue;
        }
        throw error;
      }
    }
    throw new Error("system-support transaction retry budget exhausted");
  }
}
