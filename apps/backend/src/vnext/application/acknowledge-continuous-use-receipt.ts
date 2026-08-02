import type {
  ComplianceRecoveryRepository,
  ContinuousUseAcknowledgement,
} from "../domain/compliance-readiness.js";
import type { VnextClock } from "../domain/vnext-session.repository.js";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AcknowledgeContinuousUseReceiptInput {
  readonly ownerPrincipalId: string;
  readonly experienceSessionId: string;
  readonly receiptId: string;
  readonly expectedReceiptVersion: number;
}

export class AcknowledgeContinuousUseReceipt {
  constructor(
    private readonly repository: ComplianceRecoveryRepository,
    private readonly clock: VnextClock,
  ) {}

  execute(
    input: AcknowledgeContinuousUseReceiptInput,
  ): Promise<ContinuousUseAcknowledgement> {
    if (
      !UUID_V4_PATTERN.test(input.ownerPrincipalId) ||
      !UUID_V4_PATTERN.test(input.experienceSessionId) ||
      !UUID_V4_PATTERN.test(input.receiptId) ||
      input.expectedReceiptVersion !== 1
    ) {
      throw new TypeError("invalid continuous-use receipt acknowledgement");
    }
    return this.repository.acknowledgeContinuousUseReceipt({
      ...input,
      now: this.clock.now(),
    });
  }
}
