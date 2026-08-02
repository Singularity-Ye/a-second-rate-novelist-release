import type {
  ComplianceRecoveryRepository,
  SafetyAppealResult,
} from "../domain/compliance-readiness.js";
import type { VnextClock } from "../domain/vnext-session.repository.js";
import type { SafetyAppealSealer } from "../domain/safety-appeal-sealer.port.js";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_APPEAL_REASON_CODE_POINTS = 2_000;

function normalizedAppealReason(reason: string) {
  const normalized = reason.normalize("NFKC").trim();
  let codePoints = 0;
  for (const point of normalized) {
    if (point === "\u0000") {
      throw new TypeError("invalid appeal reason");
    }
    codePoints += 1;
    if (codePoints > MAX_APPEAL_REASON_CODE_POINTS) {
      throw new TypeError("appeal reason is too long");
    }
  }
  if (codePoints === 0) {
    throw new TypeError("appeal reason is required");
  }
  return normalized;
}

export interface AppealSafetyDecisionInput {
  readonly ownerPrincipalId: string;
  readonly experienceSessionId: string;
  readonly safetyCaseId: string;
  readonly expectedVersion: number;
  readonly reason: string;
}

export class AppealSafetyDecision {
  constructor(
    private readonly repository: ComplianceRecoveryRepository,
    private readonly clock: VnextClock,
    private readonly sealer: SafetyAppealSealer,
  ) {}

  execute(input: AppealSafetyDecisionInput): Promise<SafetyAppealResult> {
    if (
      !UUID_V4_PATTERN.test(input.ownerPrincipalId) ||
      !UUID_V4_PATTERN.test(input.experienceSessionId) ||
      !UUID_V4_PATTERN.test(input.safetyCaseId) ||
      !Number.isSafeInteger(input.expectedVersion) ||
      input.expectedVersion <= 0 ||
      typeof input.reason !== "string"
    ) {
      throw new TypeError("invalid safety appeal input");
    }
    const reason = normalizedAppealReason(input.reason);
    const sealedReason = this.sealer.seal(
      {
        ownerPrincipalId: input.ownerPrincipalId,
        safetyCaseId: input.safetyCaseId,
        caseVersion: input.expectedVersion + 1,
      },
      reason,
    );
    return this.repository.appealSafetyDecision({
      ownerPrincipalId: input.ownerPrincipalId,
      experienceSessionId: input.experienceSessionId,
      safetyCaseId: input.safetyCaseId,
      expectedVersion: input.expectedVersion,
      sealedReason,
      now: this.clock.now(),
    });
  }
}
