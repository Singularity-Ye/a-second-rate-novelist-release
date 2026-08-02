import { createHash } from "node:crypto";
import {
  Prisma,
  PrismaClient,
  VnextCreativeRunStatus,
  VnextExperienceAuthState,
  VnextStoryContentKind,
  VnextStoryContentStatus,
} from "@prisma/client";
import type { ExperienceDraft } from "@erliu/shared-contracts/vnext-experience";
import type { VnextExperienceDraftReader } from "../domain/experience-draft.reader.js";

function currentTime(clock: () => Date) {
  const now = clock();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("experience draft clock returned an invalid date");
  }
  return new Date(now.getTime());
}

function publicDraftKind(kind: VnextStoryContentKind): ExperienceDraft["kind"] {
  switch (kind) {
    case VnextStoryContentKind.OPENING:
      return "opening";
    case VnextStoryContentKind.SCENE:
      return "scene";
    case VnextStoryContentKind.CHAPTER:
      return "chapter";
  }
}

export class PrismaExperienceDraftReader implements VnextExperienceDraftReader {
  constructor(
    private readonly client: PrismaClient,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async read(
    ownerPrincipalId: string,
    experienceSessionId: string,
  ): Promise<ExperienceDraft | null> {
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
          select: { id: true },
        });
        if (session === null) {
          return null;
        }

        const draft = await transaction.vnextStoryContent.findFirst({
          where: {
            ownerPrincipalId,
            status: VnextStoryContentStatus.DRAFT,
            workspace: {
              ownerPrincipalId,
              originSourceMessage: {
                ownerPrincipalId,
                experienceSessionId,
              },
            },
          },
          orderBy: [
            { createdAt: "desc" },
            { version: "desc" },
            { id: "desc" },
          ],
          select: {
            id: true,
            kind: true,
            version: true,
            body: true,
            bodyHash: true,
            createdByTrace: {
              select: {
                outputHash: true,
                status: true,
              },
            },
          },
        });
        if (draft === null) {
          return null;
        }
        const recomputedBodyHash = createHash("sha256")
          .update(draft.body)
          .digest("hex");
        if (
          draft.bodyHash !== recomputedBodyHash ||
          draft.createdByTrace.status !== VnextCreativeRunStatus.SUCCEEDED ||
          draft.createdByTrace.outputHash !== recomputedBodyHash
        ) {
          return null;
        }
        return {
          contentId: draft.id,
          versionId: `${draft.id}:${draft.version}`,
          kind: publicDraftKind(draft.kind),
          body: draft.body,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
