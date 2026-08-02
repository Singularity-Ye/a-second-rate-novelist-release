import type { ExperienceProjection } from "@erliu/shared-contracts/vnext-experience";
import type { ExperienceStateFacts } from "./experience-state.js";

export interface VnextExperienceProjectionSnapshot extends ExperienceStateFacts {
  readonly versionId: string;
  readonly correctionWhileWritingAllowed: boolean;
  readonly correctionRecoveryAllowed: boolean;
  readonly understanding: ExperienceProjection["understanding"];
}

export interface VnextExperienceProjectionReader {
  read(
    ownerPrincipalId: string,
    experienceSessionId: string,
  ): Promise<VnextExperienceProjectionSnapshot | null>;
}

export const VNEXT_EXPERIENCE_PROJECTION_READER = Symbol(
  "VNEXT_EXPERIENCE_PROJECTION_READER",
);
