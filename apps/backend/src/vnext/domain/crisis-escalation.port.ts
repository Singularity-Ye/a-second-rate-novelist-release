export const SAFETY_ESCALATION_EVENT_TYPE =
  "vnext.safety.escalation_requested" as const;

export const VNEXT_CRISIS_ESCALATION_PORT = Symbol(
  "VNEXT_CRISIS_ESCALATION_PORT",
);

export interface CrisisEscalationRequest {
  readonly idempotencyKey: string;
  readonly safetyCaseId: string;
  readonly safetyContactRef: string;
}

export interface CrisisEscalationReceipt {
  readonly deliveryRef: string;
}

export interface CrisisEscalationPort {
  escalate(input: CrisisEscalationRequest): Promise<CrisisEscalationReceipt>;
}

export interface SafetyOutboxLease {
  readonly eventId: string;
  readonly ownerPrincipalId: string;
  readonly idempotencyKey: string;
  readonly safetyCaseId: string;
  readonly safetyContactRef: string;
  readonly attemptNumber: number;
  readonly maxAttempts: number;
  readonly leaseToken: string;
}

export type SafetyOutboxFailureDisposition = "retry_wait" | "dead_letter" | "fenced";

export interface SafetyDispatcherHeartbeatInput {
  readonly workerInstanceId: string;
  readonly buildId: string;
  readonly processId: number;
}

export interface SafetyOutboxRepository {
  claimNext(input: {
    readonly workerInstanceId: string;
    readonly leaseDurationMs: number;
  }): Promise<SafetyOutboxLease | null>;
  markPublished(
    lease: SafetyOutboxLease,
    deliveryRef: string,
  ): Promise<boolean>;
  markFailed(
    lease: SafetyOutboxLease,
    retryDelayMs: number,
  ): Promise<SafetyOutboxFailureDisposition>;
  startHeartbeat(input: SafetyDispatcherHeartbeatInput): Promise<void>;
  refreshHeartbeat(
    workerInstanceId: string,
    activity?: "claimed" | "succeeded" | "failed",
  ): Promise<void>;
  stopHeartbeat(workerInstanceId: string): Promise<void>;
  markHeartbeatError(workerInstanceId: string, errorCode: string): Promise<void>;
}

export class SafetyDeliveryConflictError extends Error {
  override readonly name = "SafetyDeliveryConflictError";

  constructor() {
    super("safety delivery reference conflicts with committed delivery truth");
  }
}
