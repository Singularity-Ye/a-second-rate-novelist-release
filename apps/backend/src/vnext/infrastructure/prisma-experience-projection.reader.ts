import {
  Prisma,
  PrismaClient,
  VnextComplianceStatus,
  VnextCreativeTaskKind,
  VnextCreativeTaskStatus,
  VnextExperienceAuthState,
  VnextStoryContentStatus,
  VnextUnderstandingStatus,
} from "@prisma/client";
import type { ExperienceProjection } from "@erliu/shared-contracts/vnext-experience";
import type {
  VnextExperienceProjectionReader,
  VnextExperienceProjectionSnapshot,
} from "../domain/experience-projection.reader.js";
import type { VnextCreativeTaskKind as PublicTaskKind } from "../domain/experience-state.js";
import { isManualRetryEligibleFailure } from "../domain/manual-retry-policy.js";

const ACTIVE_TASK_STATUSES = [
  VnextCreativeTaskStatus.QUEUED,
  VnextCreativeTaskStatus.LEASED,
  VnextCreativeTaskStatus.RETRY_WAIT,
] as const;
const TERMINAL_FAILURE_STATUSES = [
  VnextCreativeTaskStatus.FAILED,
  VnextCreativeTaskStatus.TIMED_OUT,
  VnextCreativeTaskStatus.BLOCKED,
] as const;

function currentTime(clock: () => Date) {
  const now = clock();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("experience projection clock returned an invalid date");
  }
  return new Date(now.getTime());
}

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

function clarificationQuestion(value: unknown) {
  if (
    !Array.isArray(value) ||
    value.length > 1 ||
    value.some((item) => typeof item !== "string" || item.trim().length === 0)
  ) {
    throw new Error("persisted clarification questions are invalid");
  }
  return (value[0] as string | undefined) ?? null;
}

function understandingProjection(
  understanding:
    | {
        id: string;
        storyDesire: string;
        emotionalTarget: string;
        relationshipTension: string;
        clarificationQuestions: unknown;
      }
    | null,
): ExperienceProjection["understanding"] {
  if (understanding === null) {
    return null;
  }
  const fields = [
    understanding.storyDesire,
    understanding.emotionalTarget,
    understanding.relationshipTension,
  ];
  if (fields.some((field) => field.trim().length === 0)) {
    throw new Error("persisted understanding fields are invalid");
  }
  return {
    versionId: understanding.id,
    statement: `${understanding.storyDesire}；情绪会落在${understanding.emotionalTarget}，关系张力是${understanding.relationshipTension}。`,
    clarificationQuestion: clarificationQuestion(
      understanding.clarificationQuestions,
    ),
  };
}

export class PrismaExperienceProjectionReader
  implements VnextExperienceProjectionReader
{
  constructor(
    private readonly client: PrismaClient,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async read(
    ownerPrincipalId: string,
    experienceSessionId: string,
  ): Promise<VnextExperienceProjectionSnapshot | null> {
    const now = currentTime(this.clock);
    return this.client.$transaction(
      async (transaction) => {
        const session = await transaction.vnextExperienceSession.findFirst({
          where: {
            id: experienceSessionId,
            principalId: ownerPrincipalId,
            authState: VnextExperienceAuthState.GUEST_ACTIVE,
            revokedAt: null,
            guestExpiresAt: { gt: now },
            expiresAt: { gt: now },
          },
          include: { complianceSession: true },
        });
        if (session === null) {
          return null;
        }

        const sessionTaskScope: Prisma.VnextCreativeTaskWhereInput = {
          ownerPrincipalId,
          OR: [
            { sourceMessage: { experienceSessionId } },
            { workspace: { originSourceMessage: { experienceSessionId } } },
          ],
        };
        const [activeTasks, latestTask, draft, landedContent, understanding] =
          await Promise.all([
            transaction.vnextCreativeTask.findMany({
              where: {
                ...sessionTaskScope,
                status: { in: [...ACTIVE_TASK_STATUSES] },
                deadlineAt: { gt: now },
              },
              select: {
                kind: true,
                workspaceId: true,
                understandingId: true,
              },
            }),
            transaction.vnextCreativeTask.findFirst({
              where: sessionTaskScope,
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              select: {
                id: true,
                kind: true,
                workspaceId: true,
                understandingId: true,
                status: true,
                stateVersion: true,
                deadlineAt: true,
                lastFailureCode: true,
                runTraces: {
                  orderBy: { attemptNumber: "desc" },
                  take: 1,
                  select: { failureCode: true, retryable: true },
                },
              },
            }),
            transaction.vnextStoryContent.findFirst({
              where: {
                ownerPrincipalId,
                status: VnextStoryContentStatus.DRAFT,
                workspace: { originSourceMessage: { experienceSessionId } },
              },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              select: { id: true },
            }),
            transaction.vnextStoryContent.findFirst({
              where: {
                ownerPrincipalId,
                status: VnextStoryContentStatus.ACCEPTED,
                workspace: { originSourceMessage: { experienceSessionId } },
              },
              select: { id: true },
            }),
            transaction.vnextUnderstandingDraft.findFirst({
              where: {
                ownerPrincipalId,
                status: {
                  in: [
                    VnextUnderstandingStatus.PROPOSED,
                    VnextUnderstandingStatus.CORRECTED,
                    VnextUnderstandingStatus.CONFIRMED,
                  ],
                },
                sourceMessage: { experienceSessionId },
              },
              orderBy: [
                { createdAt: "desc" },
                { version: "desc" },
                { id: "desc" },
              ],
              select: {
                id: true,
                workspaceId: true,
                storyDesire: true,
                emotionalTarget: true,
                relationshipTension: true,
                clarificationQuestions: true,
              },
            }),
          ]);

        const projectedUnderstanding = understandingProjection(understanding);
        const latestTaskIsExpired =
          latestTask !== null &&
          ACTIVE_TASK_STATUSES.some((status) => status === latestTask.status) &&
          latestTask.deadlineAt.getTime() <= now.getTime();
        const latestTaskIsTerminalFailure =
          latestTask !== null &&
          TERMINAL_FAILURE_STATUSES.some(
            (status) => status === latestTask.status,
          );
        const lastRun = latestTask?.runTraces[0] ?? null;
        const retryableTaskVersionId =
          latestTask !== null &&
          isManualRetryEligibleFailure({
            taskKind: publicTaskKind(latestTask.kind),
            taskStatus: manualRetryTaskStatus(latestTask.status),
            taskFailureCode: latestTask.lastFailureCode,
            lastRunFailureCode: lastRun?.failureCode ?? null,
            lastRunRetryable: lastRun?.retryable ?? false,
          })
            ? `${latestTask.id}:${latestTask.stateVersion}`
            : null;
        return {
          versionId: latestTaskIsExpired
            ? `${session.projectionVersionId}:deadline:${latestTask.id}:${latestTask.stateVersion}`
            : session.projectionVersionId,
          unreadPersistedDraft: draft !== null,
          activeTaskKinds: [
            ...new Set(activeTasks.map((task) => publicTaskKind(task.kind))),
          ],
          awaitingClarification:
            landedContent === null &&
            projectedUnderstanding?.clarificationQuestion !== null &&
            projectedUnderstanding?.clarificationQuestion !== undefined,
          correctionWhileWritingAllowed:
            understanding !== null &&
            landedContent === null &&
            activeTasks.some(
              (task) =>
                task.kind === VnextCreativeTaskKind.WRITE_OPENING &&
                task.workspaceId === understanding.workspaceId &&
                task.understandingId === understanding.id,
            ),
          correctionRecoveryAllowed:
            projectedUnderstanding !== null &&
            landedContent === null &&
            latestTask !== null &&
            (latestTask.kind === VnextCreativeTaskKind.UNDERSTAND ||
              latestTask.kind === VnextCreativeTaskKind.WRITE_OPENING) &&
            latestTask.workspaceId === understanding?.workspaceId &&
            latestTask.understandingId === understanding?.id &&
            (latestTaskIsTerminalFailure || latestTaskIsExpired),
          retryableTaskVersionId,
          readinessBlocked:
            latestTaskIsTerminalFailure || latestTaskIsExpired,
          complianceBlocked:
            session.complianceSession?.status !== VnextComplianceStatus.ELIGIBLE,
          understanding: projectedUnderstanding,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
