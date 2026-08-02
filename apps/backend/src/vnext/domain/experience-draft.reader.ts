import type { ExperienceDraft } from "@erliu/shared-contracts/vnext-experience";

export interface VnextExperienceDraftReader {
  read(
    ownerPrincipalId: string,
    experienceSessionId: string,
  ): Promise<ExperienceDraft | null>;
}

export const VNEXT_EXPERIENCE_DRAFT_READER = Symbol(
  "VNEXT_EXPERIENCE_DRAFT_READER",
);
