import type { CreativeTaskLease } from "./creative-task.js";
import type {
  VnextBlockingSafetyDisposition,
  VnextSafetySeverity,
  VnextSafetyTriggerType,
} from "./safety-policy.port.js";

export interface SafetyDispositionEvidence {
  readonly triggerType: VnextSafetyTriggerType;
  readonly triggerDigest: string;
  readonly severity: VnextSafetySeverity;
  readonly disposition: VnextBlockingSafetyDisposition;
  readonly policyVersion: string;
  readonly reasonCode: string;
  readonly safetyContactRef: string | null;
}

export interface SafetyDispositionCommand {
  readonly ownerPrincipalId: string;
  readonly experienceSessionId: string;
  readonly workspaceId: string | null;
  readonly triggeringTask: CreativeTaskLease | null;
  /**
   * Stable candidate references only; raw input/output is forbidden. The UoW
   * records accepted story content as implicated audit evidence, never as
   * suppressed content.
   */
  readonly suppressedContentRefs: readonly string[];
  readonly evidence: SafetyDispositionEvidence;
  readonly idempotencyKey: string;
}

export interface SafetyDispositionResult {
  readonly caseId: string;
  readonly disposition: VnextBlockingSafetyDisposition;
  readonly projectionVersionId: string;
  readonly cancelledTaskCount: number;
  readonly creationDisposition: "created" | "replayed";
}

export type VnextSafetyDispositionWritePoint =
  | "after_scope_fence"
  | "after_safety_case"
  | "after_content_suppression"
  | "after_triggering_task"
  | "after_trigger_trace"
  | "after_related_task_cancel"
  | "after_compliance_projection"
  | "after_session_projection"
  | "after_outbox"
  | "before_commit";

export interface VnextSafetyDispositionProbe {
  afterWrite(point: VnextSafetyDispositionWritePoint): void | Promise<void>;
}

export interface SafetyDispositionUnitOfWork {
  apply(input: SafetyDispositionCommand): Promise<SafetyDispositionResult>;
}

export class SafetyDispositionNotFoundError extends Error {
  override readonly name = "SafetyDispositionNotFoundError";

  constructor() {
    super("owned active safety scope was not found");
  }
}

export class SafetyDispositionFenceLostError extends Error {
  override readonly name = "SafetyDispositionFenceLostError";

  constructor() {
    super("safety disposition exact task lease was lost");
  }
}

export class SafetyDispositionConflictError extends Error {
  override readonly name = "SafetyDispositionConflictError";

  constructor() {
    super("safety disposition idempotency key is bound to different evidence");
  }
}

export const VNEXT_SAFETY_DISPOSITION_UOW = Symbol(
  "VNEXT_SAFETY_DISPOSITION_UOW",
);
