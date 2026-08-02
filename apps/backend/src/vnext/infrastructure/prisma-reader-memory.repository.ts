import {
  Prisma,
  PrismaClient,
  VnextReaderMemoryItemKind,
  VnextReaderMemoryItemStatus,
} from "@prisma/client";
import { createActiveHardBoundarySnapshot } from "../domain/creative-runtime.port.js";
import { isVnextUuid } from "../domain/source-message.js";
import type {
  VnextReaderMemoryRecord,
  VnextReaderMemoryRepository,
} from "../domain/understanding-draft.js";

type MemoryWithActiveItems = Prisma.VnextReaderMemoryGetPayload<{
  include: { items: true };
}>;

function mapRecord(
  memory: MemoryWithActiveItems,
): VnextReaderMemoryRecord {
  return {
    activeHardBoundaries: memory.items.map((item) => ({
      id: item.id,
      sourceMessageId: item.sourceMessageId,
      status: "active" as const,
      value: item.value,
      version: item.version,
    })),
    id: memory.id,
    ownerPrincipalId: memory.ownerPrincipalId,
    participationStyle: memory.participationStyle,
    version: memory.version,
  };
}

export class PrismaReaderMemoryRepository implements VnextReaderMemoryRepository {
  constructor(private readonly client: PrismaClient) {}

  private async readOwned(ownerPrincipalId: string) {
    return this.client.vnextReaderMemory.findUnique({
      where: { ownerPrincipalId },
      include: {
        items: {
          where: {
            itemKind: VnextReaderMemoryItemKind.HARD_BOUNDARY,
            status: VnextReaderMemoryItemStatus.ACTIVE,
            supersededAt: null,
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
      },
    });
  }

  async findOwned(ownerPrincipalId: string) {
    if (!isVnextUuid(ownerPrincipalId)) {
      return null;
    }
    const memory = await this.readOwned(ownerPrincipalId);
    return memory ? mapRecord(memory) : null;
  }

  async activeHardBoundarySnapshot(ownerPrincipalId: string) {
    if (!isVnextUuid(ownerPrincipalId)) {
      return null;
    }
    const memory = await this.readOwned(ownerPrincipalId);
    if (!memory) {
      return null;
    }
    return createActiveHardBoundarySnapshot({
      capturedAt: memory.updatedAt.toISOString(),
      items: memory.items.map((item) => ({
        boundaryId: item.id,
        sourceRef: item.sourceMessageId,
        status: "active",
        value: item.value,
        version: item.version,
      })),
      ownerPrincipalId,
      snapshotId: memory.id,
      version: memory.version,
    });
  }
}
