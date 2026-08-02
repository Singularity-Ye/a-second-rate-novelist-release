import type { VnextCreativeTaskKind } from "./experience-state.js";

const MANUAL_RETRY_TASK_KINDS = new Set<VnextCreativeTaskKind>([
  "understand",
  "write_opening",
]);
const MANUAL_RETRY_FAILURE_CODES = new Set([
  "provider_timeout",
  "provider_unavailable",
  "runtime_execution_failed",
  "persistence_failed",
]);

export interface ManualRetryFailureFacts {
  readonly taskKind: VnextCreativeTaskKind;
  readonly taskStatus: "failed" | "timed_out" | "other";
  readonly taskFailureCode: string | null;
  readonly lastRunFailureCode: string | null;
  readonly lastRunRetryable: boolean;
}

export function isManualRetryEligibleFailure(
  facts: ManualRetryFailureFacts,
): boolean {
  return (
    facts.taskStatus === "failed" &&
    MANUAL_RETRY_TASK_KINDS.has(facts.taskKind) &&
    facts.lastRunRetryable &&
    facts.taskFailureCode !== null &&
    facts.taskFailureCode === facts.lastRunFailureCode &&
    MANUAL_RETRY_FAILURE_CODES.has(facts.taskFailureCode)
  );
}
