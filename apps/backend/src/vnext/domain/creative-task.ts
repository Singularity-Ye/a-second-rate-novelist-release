import type {
  ActiveHardBoundarySnapshotInput,
  ContinueStoryInput,
  ContinueStoryResult,
  ReviseInput,
  ReviseResult,
  UnderstandInput,
  UnderstandResult,
  WriteOpeningInput,
  WriteOpeningResult,
} from "./creative-runtime.port.js";

export const CREATIVE_TASK_KINDS = [
  "understand",
  "write_opening",
  "revise",
  "continue_story",
] as const;

export const TC164_SUPPORTED_CREATIVE_TASK_KINDS = [
  "understand",
  "write_opening",
] as const;

export type CreativeTaskKind = (typeof CREATIVE_TASK_KINDS)[number];
export type Tc164SupportedCreativeTaskKind =
  (typeof TC164_SUPPORTED_CREATIVE_TASK_KINDS)[number];
export type NonEmptyCreativeTaskKindList = readonly [
  Tc164SupportedCreativeTaskKind,
  ...Tc164SupportedCreativeTaskKind[],
];
export type CreativeWorkerRuntimeMode =
  | "runtime_worker_synthetic"
  | "runtime_worker_configured";

export type CreativeTaskProcessingAuthority =
  | {
      readonly purpose: "synthetic_creative";
      readonly processingBasisRecordId: null;
      readonly consentRecordId: null;
      readonly processingCoverageKey: null;
      readonly processingEvidenceRef: string;
    }
  | {
      readonly purpose: "core_creative" | "external_experience";
      readonly processingBasisRecordId: string;
      readonly consentRecordId: null;
      readonly processingCoverageKey: string;
      readonly processingEvidenceRef: null;
    }
  | {
      readonly purpose: "core_creative" | "external_experience";
      readonly processingBasisRecordId: null;
      readonly consentRecordId: string;
      readonly processingCoverageKey: string;
      readonly processingEvidenceRef: null;
    };

export interface HardBoundaryArtifactSnapshot
  extends ActiveHardBoundarySnapshotInput {}

interface CreativeTaskArtifactBase {
  readonly hardBoundaries: HardBoundaryArtifactSnapshot;
}

export interface InitialUnderstandTaskArtifacts extends CreativeTaskArtifactBase {
  readonly schemaVersion: 1;
  readonly kind: "understand";
  readonly sourceMessage: {
    readonly id: string;
    readonly requestDigest: string;
  };
}

export interface CorrectionUnderstandTaskArtifacts extends CreativeTaskArtifactBase {
  readonly schemaVersion: 2;
  readonly kind: "understand";
  readonly sourceMessage: {
    readonly id: string;
    readonly requestDigest: string;
  };
  readonly workspace: {
    readonly id: string;
    readonly aggregateVersion: number;
    readonly publicationDigest: string;
  };
  readonly understanding: {
    readonly id: string;
    readonly version: number;
    readonly payloadDigest: string;
  };
  readonly commission: {
    readonly id: string;
    readonly version: number;
    readonly payloadDigest: string;
  };
}

export type UnderstandTaskArtifacts =
  | InitialUnderstandTaskArtifacts
  | CorrectionUnderstandTaskArtifacts;

export interface WriteOpeningTaskArtifacts extends CreativeTaskArtifactBase {
  readonly schemaVersion: 1;
  readonly kind: "write_opening";
  readonly workspace: {
    readonly id: string;
    readonly aggregateVersion: number;
    readonly publicationDigest: string;
  };
  readonly understanding: {
    readonly id: string;
    readonly version: number;
    readonly payloadDigest: string;
  };
  readonly commission: {
    readonly id: string;
    readonly version: number;
    readonly payloadDigest: string;
  };
}

export type PersistedCreativeTaskArtifacts =
  | UnderstandTaskArtifacts
  | WriteOpeningTaskArtifacts;

// Correction UNDERSTAND tasks are admitted only by the correction UoW, which
// atomically fences prior work and binds the immutable prior truth. The generic
// queue API must not provide a bypass around that transaction.
export type QueueableCreativeTaskArtifacts =
  | InitialUnderstandTaskArtifacts
  | WriteOpeningTaskArtifacts;

export interface QueueCreativeTaskRecord {
  readonly ownerPrincipalId: string;
  readonly requestId: string;
  readonly idempotencyKey: string;
  readonly processingAuthority: CreativeTaskProcessingAuthority;
  readonly artifacts: QueueableCreativeTaskArtifacts;
  readonly inputDigest: string;
  readonly availableAt: Date;
  readonly deadlineAt: Date;
  readonly maxAttempts: number;
}

export interface QueuedCreativeTask {
  readonly id: string;
  readonly ownerPrincipalId: string;
  readonly requestId: string;
  readonly idempotencyKey: string;
  readonly kind: Tc164SupportedCreativeTaskKind;
  readonly inputDigest: string;
  readonly status:
    | "queued"
    | "leased"
    | "retry_wait"
    | "succeeded"
    | "failed"
    | "blocked"
    | "cancelled"
    | "timed_out";
  readonly creationDisposition: "created" | "replayed";
}

export interface CreativeTaskQueueRepository {
  queue(input: QueueCreativeTaskRecord): Promise<QueuedCreativeTask>;
}

export class CreativeTaskIdempotencyConflictError extends Error {
  constructor() {
    super("creative task idempotency key is already bound to different input");
    this.name = "CreativeTaskIdempotencyConflictError";
  }
}

export class CreativeTaskInputStaleError extends Error {
  constructor(readonly failureCode = "stale_input") {
    super(failureCode);
    this.name = "CreativeTaskInputStaleError";
  }
}

export class CreativeRuntimeExecutionError extends Error {
  constructor(
    readonly failureCode: string,
    readonly retryable: boolean,
  ) {
    super(failureCode);
    this.name = "CreativeRuntimeExecutionError";
  }
}

export class CreativeTaskCompletionNotConfiguredError extends Error {
  constructor(readonly kind: CreativeTaskKind) {
    super(`creative task completion is not configured for ${kind}`);
    this.name = "CreativeTaskCompletionNotConfiguredError";
  }
}

export interface CreativeTaskLease {
  readonly taskId: string;
  readonly ownerPrincipalId: string;
  readonly requestId: string;
  readonly kind: CreativeTaskKind;
  readonly attemptNumber: number;
  readonly maxAttempts: number;
  readonly stateVersion: number;
  readonly leaseToken: string;
  readonly leaseExpiresAt: Date;
  readonly deadlineAt: Date;
  readonly runTraceId: string;
  readonly inputArtifactVersions: unknown;
  readonly inputDigest: string;
}

export interface ClaimCreativeTaskInput {
  readonly workerInstanceId: string;
  readonly runtimeMode: CreativeWorkerRuntimeMode;
  readonly supportedKinds: readonly Tc164SupportedCreativeTaskKind[];
  readonly leaseDurationMs: number;
}

export interface FailCreativeTaskLeaseInput {
  readonly lease: CreativeTaskLease;
  readonly failureCode: string;
  readonly retryable: boolean;
  readonly retryDelayMs: number;
}

export type CreativeTaskFailureDisposition =
  | "retry_wait"
  | "failed"
  | "timed_out"
  | "fenced";

export interface CreativeTaskLeasePort {
  claimNext(input: ClaimCreativeTaskInput): Promise<CreativeTaskLease | null>;
  failLease(
    input: FailCreativeTaskLeaseInput,
  ): Promise<CreativeTaskFailureDisposition>;
}

export type CreativeTaskRuntimeInput =
  | {
      readonly kind: "understand";
      readonly safetyScope: {
        readonly experienceSessionId: string;
        readonly workspaceId: string | null;
      };
      readonly input: UnderstandInput;
    }
  | {
      readonly kind: "write_opening";
      readonly safetyScope: {
        readonly experienceSessionId: string;
        readonly workspaceId: string;
      };
      readonly input: WriteOpeningInput;
    }
  | {
      readonly kind: "revise";
      readonly safetyScope: {
        readonly experienceSessionId: string;
        readonly workspaceId: string;
      };
      readonly input: ReviseInput;
    }
  | {
      readonly kind: "continue_story";
      readonly safetyScope: {
        readonly experienceSessionId: string;
        readonly workspaceId: string;
      };
      readonly input: ContinueStoryInput;
    };

export interface CreativeTaskInputLoader {
  load(lease: CreativeTaskLease): Promise<CreativeTaskRuntimeInput>;
}

interface CreativeTaskExecutionSuccessBase {
  readonly lease: CreativeTaskLease;
  readonly route: string;
  readonly runtimeMode: CreativeWorkerRuntimeMode;
}

export type CreativeTaskExecutionSuccess =
  | (CreativeTaskExecutionSuccessBase & {
      readonly kind: "understand";
      readonly result: UnderstandResult;
    })
  | (CreativeTaskExecutionSuccessBase & {
      readonly kind: "write_opening";
      readonly result: WriteOpeningResult;
    })
  | (CreativeTaskExecutionSuccessBase & {
      readonly kind: "revise";
      readonly result: ReviseResult;
    })
  | (CreativeTaskExecutionSuccessBase & {
      readonly kind: "continue_story";
      readonly result: ContinueStoryResult;
    });

export type CreativeTaskCompletionDisposition =
  | "committed"
  | "fenced"
  | "stale_input"
  | "timed_out";

export interface CreativeTaskCompletionPort {
  complete(
    input: CreativeTaskExecutionSuccess,
  ): Promise<CreativeTaskCompletionDisposition>;
}

export interface CreativeWorkerHeartbeatInput {
  readonly workerInstanceId: string;
  readonly runtimeMode: CreativeWorkerRuntimeMode;
  readonly buildId: string;
  readonly processId: number;
  readonly supportedKinds: readonly Tc164SupportedCreativeTaskKind[];
}

export interface CreativeWorkerHeartbeatPort {
  startHeartbeat(input: CreativeWorkerHeartbeatInput): Promise<void>;
  refreshHeartbeat(
    workerInstanceId: string,
    activity?: "claimed" | "succeeded" | "failed",
  ): Promise<void>;
  markHeartbeatError(workerInstanceId: string, errorCode: string): Promise<void>;
  stopHeartbeat(workerInstanceId: string): Promise<void>;
}

export interface CreativeWorkerReadiness {
  readonly ready: boolean;
  readonly workerInstanceId: string | null;
  readonly lastHeartbeatAt: Date | null;
  readonly runtimeMode: CreativeWorkerRuntimeMode | null;
}

export interface CreativeWorkerReadinessPort {
  readWorkerReadiness(
    freshnessWindowMs: number,
    requiredKinds: NonEmptyCreativeTaskKindList,
  ): Promise<CreativeWorkerReadiness>;
}
