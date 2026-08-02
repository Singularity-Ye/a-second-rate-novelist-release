import {
  Prisma,
  VnextAudienceMode,
  VnextComplianceStatus,
  VnextExperienceAuthState,
  VnextInputPolicy,
  VnextPrincipalKind,
} from "@prisma/client";
import type { VnextCurrentSessionAdmission } from "../domain/vnext-session.repository.js";

export interface CompletionSessionFenceInput {
  readonly ownerPrincipalId: string;
  readonly experienceSessionId: string;
  readonly now: Date;
  readonly policy: VnextCurrentSessionAdmission | undefined;
}

export class CompletionSessionFenceLostError extends Error {
  override readonly name = "CompletionSessionFenceLostError";
}

export function currentActiveGuestSessionWhere(
  input: CompletionSessionFenceInput,
): Prisma.VnextExperienceSessionWhereInput | null {
  if (!input.policy?.configured) {
    return null;
  }
  return {
    id: input.experienceSessionId,
    principalId: input.ownerPrincipalId,
    authState: VnextExperienceAuthState.GUEST_ACTIVE,
    revokedAt: null,
    guestExpiresAt: { gt: input.now },
    expiresAt: { gt: input.now },
    principal: {
      is: {
        id: input.ownerPrincipalId,
        kind: VnextPrincipalKind.GUEST,
      },
    },
    complianceSession: {
      is: {
        ownerPrincipalId: input.ownerPrincipalId,
        experienceSessionId: input.experienceSessionId,
        status: VnextComplianceStatus.ELIGIBLE,
        audienceMode: VnextAudienceMode.INTERNAL,
        inputPolicy: VnextInputPolicy.SYNTHETIC_ONLY,
        admissionPolicyVersion: input.policy.admissionPolicyVersion,
        aiIdentityNoticeVersion: input.policy.aiIdentityNoticeVersion,
        serviceTermsVersion: input.policy.serviceTermsVersion,
        privacyNoticeVersion: input.policy.privacyNoticeVersion,
      },
    },
  };
}

export async function rotateCurrentSessionProjection(
  transaction: Pick<Prisma.TransactionClient, "vnextExperienceSession">,
  where: Prisma.VnextExperienceSessionWhereInput,
  expectedProjectionVersionId: string,
  nextProjectionVersionId: string,
) {
  const rotated = await transaction.vnextExperienceSession.updateMany({
    where: { ...where, projectionVersionId: expectedProjectionVersionId },
    data: { projectionVersionId: nextProjectionVersionId },
  });
  if (rotated.count !== 1) {
    throw new CompletionSessionFenceLostError();
  }
}
