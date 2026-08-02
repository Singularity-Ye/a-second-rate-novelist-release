import type {
  ComplianceRecoveryRepository,
  SessionExitResult,
} from "../domain/compliance-readiness.js";
import type { VnextClock } from "../domain/vnext-session.repository.js";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CancelSessionCreativeTasksInput {
  readonly ownerPrincipalId: string;
  readonly experienceSessionId: string;
}

export class CancelSessionCreativeTasks {
  constructor(
    private readonly repository: ComplianceRecoveryRepository,
    private readonly clock: VnextClock,
  ) {}

  execute(input: CancelSessionCreativeTasksInput): Promise<SessionExitResult> {
    if (
      !UUID_V4_PATTERN.test(input.ownerPrincipalId) ||
      !UUID_V4_PATTERN.test(input.experienceSessionId)
    ) {
      throw new TypeError("invalid session-exit scope");
    }
    return this.repository.cancelSessionCreativeTasks({
      ...input,
      now: this.clock.now(),
    });
  }
}
