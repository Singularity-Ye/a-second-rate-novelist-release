import type {
  VnextModelProfileId,
  VnextModelPurpose,
} from "@erliu/shared-contracts";

export interface ModelRuntimeAdmissionRequest {
  readonly ownerPrincipalId: string;
  readonly purpose: VnextModelPurpose;
  readonly profileId: VnextModelProfileId;
  readonly requestId: string;
}

export interface ModelRuntimeLease {
  /** Idempotent: callers may safely release from more than one cleanup path. */
  release(): Promise<void>;
}

export type ModelRuntimeAdmissionDenialCode =
  | "duplicate_request"
  | "principal_capacity"
  | "profile_capacity"
  | "global_capacity";

export type ModelRuntimeAdmissionResult =
  | {
      readonly accepted: true;
      readonly lease: ModelRuntimeLease;
    }
  | {
      readonly accepted: false;
      readonly code: ModelRuntimeAdmissionDenialCode;
      readonly retryAfterSeconds: number;
    };

export interface ModelRuntimeAdmissionPort {
  tryAcquire(
    request: ModelRuntimeAdmissionRequest,
  ): Promise<ModelRuntimeAdmissionResult>;
}

export const VNEXT_MODEL_RUNTIME_ADMISSION = Symbol(
  "VNEXT_MODEL_RUNTIME_ADMISSION",
);
