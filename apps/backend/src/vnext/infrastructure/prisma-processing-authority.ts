import {
  VnextAudienceMode,
  VnextComplianceStatus,
  VnextConsentStatus,
  VnextInputPolicy,
  VnextProcessingBasisStatus,
  VnextProcessingPurpose,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

type ProcessingAuthorityClient = PrismaClient | Prisma.TransactionClient;

export interface PersistedTaskProcessingAuthority {
  readonly ownerPrincipalId: string;
  readonly processingPurpose: VnextProcessingPurpose;
  readonly processingBasisRecordId: string | null;
  readonly consentRecordId: string | null;
  readonly processingCoverageKey: string | null;
  readonly processingEvidenceRef: string | null;
}

const SYNTHETIC_FIXTURE_EVIDENCE_PATTERN =
  /^fixture:[A-Za-z0-9][A-Za-z0-9._-]{0,63}:sha256:[0-9a-f]{64}$/;
const PROCESSING_COVERAGE_KEY_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/;

export async function isTaskProcessingAuthorityCurrent(
  client: ProcessingAuthorityClient,
  task: PersistedTaskProcessingAuthority,
  experienceSessionId: string | null,
  now: Date,
) {
  if (
    task.processingPurpose === VnextProcessingPurpose.SYNTHETIC_CREATIVE
  ) {
    if (
      !(
        task.processingBasisRecordId === null &&
        task.consentRecordId === null &&
        task.processingCoverageKey === null &&
        task.processingEvidenceRef !== null &&
        SYNTHETIC_FIXTURE_EVIDENCE_PATTERN.test(task.processingEvidenceRef)
      ) ||
      experienceSessionId === null
    ) {
      return false;
    }
    return (
      (await client.vnextComplianceSession.findFirst({
        where: {
          ownerPrincipalId: task.ownerPrincipalId,
          experienceSessionId,
          audienceMode: VnextAudienceMode.INTERNAL,
          inputPolicy: VnextInputPolicy.SYNTHETIC_ONLY,
          status: VnextComplianceStatus.ELIGIBLE,
        },
        select: { id: true },
      })) !== null
    );
  }

  if (
    task.processingPurpose === VnextProcessingPurpose.MODEL_TRAINING ||
    task.processingPurpose === VnextProcessingPurpose.UNVERIFIED_MIGRATED ||
    task.processingCoverageKey === null ||
    !PROCESSING_COVERAGE_KEY_PATTERN.test(task.processingCoverageKey) ||
    task.processingEvidenceRef !== null ||
    experienceSessionId === null
  ) {
    return false;
  }

  if (task.processingBasisRecordId !== null) {
    if (
      (task.processingPurpose !== VnextProcessingPurpose.CORE_CREATIVE &&
        task.processingPurpose !==
          VnextProcessingPurpose.EXTERNAL_EXPERIENCE) ||
      task.consentRecordId !== null
    ) {
      return false;
    }
    const basis = await client.vnextProcessingBasisRecord.findFirst({
      where: {
        id: task.processingBasisRecordId,
        ownerPrincipalId: task.ownerPrincipalId,
        purpose: task.processingPurpose,
        coverageKey: task.processingCoverageKey,
        status: VnextProcessingBasisStatus.ACTIVE,
        effectiveAt: { lte: now },
        revokedOrExpiredAt: null,
        complianceSession: {
          experienceSessionId,
          ownerPrincipalId: task.ownerPrincipalId,
          status: VnextComplianceStatus.ELIGIBLE,
        },
      },
      select: { id: true },
    });
    return basis !== null;
  }

  if (task.consentRecordId === null) {
    return false;
  }
  const consent = await client.vnextConsentRecord.findFirst({
    where: {
      id: task.consentRecordId,
      ownerPrincipalId: task.ownerPrincipalId,
      purpose: task.processingPurpose,
      coverageKey: task.processingCoverageKey,
      status: VnextConsentStatus.ACTIVE,
      grantedAt: { lte: now },
      withdrawnAt: null,
      complianceSession: {
        experienceSessionId,
        ownerPrincipalId: task.ownerPrincipalId,
        status: VnextComplianceStatus.ELIGIBLE,
      },
    },
    select: { id: true },
  });
  return consent !== null;
}
