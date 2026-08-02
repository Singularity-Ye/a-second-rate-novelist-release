import { PrismaClient, VnextCommissionStatus } from "@prisma/client";
import { isVnextUuid } from "../domain/source-message.js";
import type {
  VnextCommissionBriefRepository,
  VnextStoryTruthPublication,
} from "../domain/understanding-draft.js";

function mapStatus(
  status: VnextCommissionStatus,
): VnextStoryTruthPublication["commission"]["status"] {
  switch (status) {
    case VnextCommissionStatus.ACTIVE:
      return "active";
    case VnextCommissionStatus.SUPERSEDED:
      return "superseded";
    default:
      return "draft";
  }
}

export class PrismaCommissionBriefRepository
  implements VnextCommissionBriefRepository
{
  constructor(private readonly client: PrismaClient) {}

  async findOwned(ownerPrincipalId: string, commissionId: string) {
    if (!isVnextUuid(ownerPrincipalId) || !isVnextUuid(commissionId)) {
      return null;
    }
    const record = await this.client.vnextCommissionBrief.findFirst({
      where: { id: commissionId, ownerPrincipalId },
    });
    return record
      ? { id: record.id, status: mapStatus(record.status), version: record.version }
      : null;
  }
}
