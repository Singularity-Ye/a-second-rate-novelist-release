import {
  CONTINUOUS_USE_REMINDER_INTERVAL_MS,
  type ComplianceRecoveryRepository,
  type ContinuousUseEvaluation,
} from "../domain/compliance-readiness.js";
import type { VnextClock } from "../domain/vnext-session.repository.js";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface EvaluateContinuousUseReminderInput {
  readonly ownerPrincipalId: string;
  readonly experienceSessionId: string;
}

export class EvaluateContinuousUseReminder {
  constructor(
    private readonly repository: ComplianceRecoveryRepository,
    private readonly clock: VnextClock,
    private readonly reminderIntervalMs = CONTINUOUS_USE_REMINDER_INTERVAL_MS,
  ) {
    if (
      !Number.isSafeInteger(reminderIntervalMs) ||
      reminderIntervalMs <= 0 ||
      reminderIntervalMs > CONTINUOUS_USE_REMINDER_INTERVAL_MS ||
      reminderIntervalMs % 1_000 !== 0
    ) {
      throw new TypeError("invalid continuous-use reminder interval");
    }
  }

  execute(
    input: EvaluateContinuousUseReminderInput,
  ): Promise<ContinuousUseEvaluation> {
    if (
      !UUID_V4_PATTERN.test(input.ownerPrincipalId) ||
      !UUID_V4_PATTERN.test(input.experienceSessionId)
    ) {
      throw new TypeError("invalid continuous-use scope");
    }
    return this.repository.evaluateContinuousUse({
      ...input,
      now: this.clock.now(),
      reminderIntervalMs: this.reminderIntervalMs,
    });
  }
}
