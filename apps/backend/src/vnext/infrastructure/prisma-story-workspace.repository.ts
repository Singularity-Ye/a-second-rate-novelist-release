import {
  PrismaClient,
  VnextStoryWorkspaceStatus,
} from "@prisma/client";
import { isVnextUuid } from "../domain/source-message.js";
import type {
  VnextStoryTruthPublication,
  VnextStoryWorkspaceRepository,
} from "../domain/understanding-draft.js";

function mapStatus(
  status: VnextStoryWorkspaceStatus,
): VnextStoryTruthPublication["workspace"]["status"] {
  switch (status) {
    case VnextStoryWorkspaceStatus.ACTIVE:
      return "active";
    case VnextStoryWorkspaceStatus.PAUSED:
      return "paused";
    case VnextStoryWorkspaceStatus.ARCHIVED:
      return "archived";
    default:
      return "forming";
  }
}

export class PrismaStoryWorkspaceRepository
  implements VnextStoryWorkspaceRepository
{
  constructor(private readonly client: PrismaClient) {}

  async findOwned(ownerPrincipalId: string, workspaceId: string) {
    if (!isVnextUuid(ownerPrincipalId) || !isVnextUuid(workspaceId)) {
      return null;
    }
    const record = await this.client.vnextStoryWorkspace.findFirst({
      where: { id: workspaceId, ownerPrincipalId },
    });
    return record
      ? {
          aggregateVersion: record.aggregateVersion,
          id: record.id,
          status: mapStatus(record.status),
        }
      : null;
  }
}
