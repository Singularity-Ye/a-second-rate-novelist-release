import type { VnextClock } from "../domain/vnext-session.repository.js";
import type {
  ComplianceRecoveryRepository,
  ConsentWithdrawalResult,
} from "../domain/compliance-readiness.js";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface WithdrawConsentInput {
  readonly ownerPrincipalId: string;
  readonly experienceSessionId: string;
  readonly consentRecordId: string;
  readonly expectedVersion: number;
}

export class WithdrawConsent {
  constructor(
    private readonly repository: ComplianceRecoveryRepository,
    private readonly clock: VnextClock,
  ) {}

  execute(input: WithdrawConsentInput): Promise<ConsentWithdrawalResult> {
    if (
      !UUID_V4_PATTERN.test(input.ownerPrincipalId) ||
      !UUID_V4_PATTERN.test(input.experienceSessionId) ||
      !UUID_V4_PATTERN.test(input.consentRecordId) ||
      !Number.isSafeInteger(input.expectedVersion) ||
      input.expectedVersion <= 0
    ) {
      throw new TypeError("invalid consent withdrawal input");
    }
    return this.repository.withdrawConsent({ ...input, now: this.clock.now() });
  }
}
