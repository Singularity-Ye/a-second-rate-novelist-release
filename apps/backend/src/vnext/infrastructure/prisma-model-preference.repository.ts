import {
  Prisma,
  PrismaClient,
  VnextModelPurpose as PrismaModelPurpose,
} from "@prisma/client";
import type { VnextModelPurpose } from "@erliu/shared-contracts";
import {
  VnextModelPreferenceConflictError,
  type SetVnextModelPreferenceRecord,
  type VnextModelPreferenceRecord,
  type VnextModelPreferenceRepository,
} from "../domain/model-preference.repository.js";

function purposeEnum(purpose: VnextModelPurpose) {
  return purpose === "conversation"
    ? PrismaModelPurpose.CONVERSATION
    : PrismaModelPurpose.ANALYSIS;
}

function purposeValue(purpose: PrismaModelPurpose) {
  return purpose === PrismaModelPurpose.CONVERSATION
    ? ("conversation" as const)
    : ("analysis" as const);
}

function record(value: {
  ownerPrincipalId: string;
  purpose: PrismaModelPurpose;
  profileId: string;
  revision: number;
}): VnextModelPreferenceRecord {
  if (
    value.profileId !== "deepseek" &&
    value.profileId !== "gpt" &&
    value.profileId !== "gemini" &&
    value.profileId !== "grok"
  ) {
    throw new Error("stored model preference has an unsupported profile id");
  }
  return {
    ownerPrincipalId: value.ownerPrincipalId,
    purpose: purposeValue(value.purpose),
    profileId: value.profileId,
    revision: value.revision,
  };
}

function uniqueConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export class PrismaModelPreferenceRepository
  implements VnextModelPreferenceRepository
{
  constructor(private readonly client: PrismaClient) {}

  async listOwned(ownerPrincipalId: string) {
    const values = await this.client.vnextModelPreference.findMany({
      where: { ownerPrincipalId },
      orderBy: { purpose: "asc" },
    });
    return values.map(record);
  }

  async setOwned(input: SetVnextModelPreferenceRecord) {
    if (
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 0 ||
      input.expectedRevision > 2_147_483_646
    ) {
      throw new VnextModelPreferenceConflictError();
    }
    const purpose = purposeEnum(input.purpose);
    if (input.expectedRevision === 0) {
      try {
        return record(
          await this.client.vnextModelPreference.create({
            data: {
              ownerPrincipalId: input.ownerPrincipalId,
              purpose,
              profileId: input.profileId,
            },
          }),
        );
      } catch (error) {
        if (uniqueConflict(error)) {
          throw new VnextModelPreferenceConflictError();
        }
        throw error;
      }
    }
    const updated = await this.client.vnextModelPreference.updateMany({
      where: {
        ownerPrincipalId: input.ownerPrincipalId,
        purpose,
        revision: input.expectedRevision,
      },
      data: {
        profileId: input.profileId,
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new VnextModelPreferenceConflictError();
    }
    const value = await this.client.vnextModelPreference.findUnique({
      where: {
        ownerPrincipalId_purpose: {
          ownerPrincipalId: input.ownerPrincipalId,
          purpose,
        },
      },
    });
    if (value === null) {
      throw new VnextModelPreferenceConflictError();
    }
    return record(value);
  }
}
