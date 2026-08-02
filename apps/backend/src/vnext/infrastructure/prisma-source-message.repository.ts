import {
  Prisma,
  PrismaClient,
  VnextSourceMessageAction as PrismaSourceMessageAction,
  type VnextSourceMessage,
} from "@prisma/client";
import {
  NOOP_VNEXT_STORY_TRUTH_AUDIT,
  createSourceMessageRequestDigest,
  isVnextUuid,
  validateSourceMessageInput,
  type CreateVnextSourceMessageInput,
  type VnextSourceMessageAction,
  type VnextSourceMessageCreation,
  type VnextSourceMessageRecord,
  type VnextSourceMessageRepository,
  type VnextStoryTruthAuditPort,
} from "../domain/source-message.js";
import {
  VnextStoryTruthIdempotencyConflictError,
  VnextStoryTruthNotFoundError,
} from "../domain/understanding-draft.js";

function toPrismaAction(action: VnextSourceMessageAction) {
  switch (action) {
    case "commission":
      return PrismaSourceMessageAction.COMMISSION;
    case "correction":
      return PrismaSourceMessageAction.CORRECTION;
    case "boundary_update":
      return PrismaSourceMessageAction.BOUNDARY_UPDATE;
    default:
      throw new Error("source message action is unsupported");
  }
}

function fromPrismaAction(action: PrismaSourceMessageAction): VnextSourceMessageAction {
  switch (action) {
    case PrismaSourceMessageAction.CORRECTION:
      return "correction";
    case PrismaSourceMessageAction.BOUNDARY_UPDATE:
      return "boundary_update";
    case PrismaSourceMessageAction.COMMISSION:
      return "commission";
    default:
      throw new Error("persisted source message action is unsupported");
  }
}

function mapRecord(record: VnextSourceMessage): VnextSourceMessageRecord {
  return {
    action: fromPrismaAction(record.action),
    basedOnUnderstandingId: record.basedOnUnderstandingId,
    basedOnVersion: record.basedOnVersion,
    body: record.body,
    clientRequestId: record.clientRequestId,
    createdAt: record.createdAt,
    experienceSessionId: record.experienceSessionId,
    id: record.id,
    ownerPrincipalId: record.ownerPrincipalId,
    requestDigest: record.requestDigest,
  };
}

function isExactReplay(
  record: VnextSourceMessage,
  input: CreateVnextSourceMessageInput,
  requestDigest: string,
) {
  return (
    record.requestDigest === requestDigest &&
    record.ownerPrincipalId === input.ownerPrincipalId &&
    record.experienceSessionId === input.experienceSessionId &&
    record.clientRequestId === input.clientRequestId &&
    record.action === toPrismaAction(input.action) &&
    record.basedOnUnderstandingId === input.basedOnUnderstandingId &&
    record.basedOnVersion === input.basedOnVersion &&
    record.body === input.body
  );
}

export class PrismaSourceMessageRepository implements VnextSourceMessageRepository {
  constructor(
    private readonly client: PrismaClient,
    private readonly audit: VnextStoryTruthAuditPort = NOOP_VNEXT_STORY_TRUTH_AUDIT,
  ) {}

  private async replay(
    input: CreateVnextSourceMessageInput,
    requestDigest: string,
  ): Promise<VnextSourceMessageCreation | null> {
    const existing = await this.client.vnextSourceMessage.findUnique({
      where: {
        ownerPrincipalId_clientRequestId: {
          clientRequestId: input.clientRequestId,
          ownerPrincipalId: input.ownerPrincipalId,
        },
      },
    });
    if (!existing) {
      return null;
    }
    if (!isExactReplay(existing, input, requestDigest)) {
      this.audit.record({
        event: "story_truth",
        operation: "source_create",
        outcome: "conflict",
        resourceKind: "source_message",
      });
      throw new VnextStoryTruthIdempotencyConflictError();
    }
    this.audit.record({
      event: "story_truth",
      operation: "source_create",
      outcome: "replayed",
      resourceKind: "source_message",
    });
    return { ...mapRecord(existing), creationDisposition: "replayed" };
  }

  async createOrReplay(
    input: CreateVnextSourceMessageInput,
  ): Promise<VnextSourceMessageCreation> {
    validateSourceMessageInput(input);
    const requestDigest = createSourceMessageRequestDigest(input);
    const replay = await this.replay(input, requestDigest);
    if (replay) {
      return replay;
    }
    try {
      const created = await this.client.vnextSourceMessage.create({
        data: {
          action: toPrismaAction(input.action),
          basedOnUnderstandingId: input.basedOnUnderstandingId,
          basedOnVersion: input.basedOnVersion,
          body: input.body,
          clientRequestId: input.clientRequestId,
          experienceSessionId: input.experienceSessionId,
          ownerPrincipalId: input.ownerPrincipalId,
          requestDigest,
        },
      });
      this.audit.record({
        event: "story_truth",
        operation: "source_create",
        outcome: "created",
        resourceKind: "source_message",
      });
      return { ...mapRecord(created), creationDisposition: "created" };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const concurrentReplay = await this.replay(input, requestDigest);
        if (concurrentReplay) {
          return concurrentReplay;
        }
        throw new VnextStoryTruthIdempotencyConflictError();
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2003"
      ) {
        throw new VnextStoryTruthNotFoundError();
      }
      this.audit.record({
        event: "story_truth",
        operation: "source_create",
        outcome: "failed",
        resourceKind: "source_message",
      });
      throw error;
    }
  }

  async findOwned(ownerPrincipalId: string, sourceMessageId: string) {
    if (!isVnextUuid(ownerPrincipalId) || !isVnextUuid(sourceMessageId)) {
      return null;
    }
    const record = await this.client.vnextSourceMessage.findFirst({
      where: { id: sourceMessageId, ownerPrincipalId },
    });
    return record ? mapRecord(record) : null;
  }
}
