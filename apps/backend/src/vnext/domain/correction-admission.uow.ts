export interface ResolveVnextCorrectionSafetyScopeInput {
  readonly ownerPrincipalId: string;
  readonly experienceSessionId: string;
  readonly basedOnUnderstandingId: string;
}

export interface VnextCorrectionSafetyScope {
  readonly workspaceId: string;
  readonly basedOnVersion: number;
}

export interface AdmitVnextCorrectionInput extends VnextCorrectionSafetyScope {
  readonly ownerPrincipalId: string;
  readonly experienceSessionId: string;
  readonly clientRequestId: string;
  readonly text: string;
  readonly basedOnUnderstandingId: string;
  readonly processingEvidenceRef: string;
}

export interface VnextCorrectionAdmission {
  readonly sourceMessageId: string;
  readonly taskId: string;
  readonly projectionVersionId: string;
  readonly creationDisposition: "created" | "replayed";
}

export type VnextCorrectionAdmissionWritePoint =
  | "after_expired_correction_fence"
  | "after_opening_task_fence"
  | "after_running_trace_fence"
  | "after_source_message"
  | "after_understand_task"
  | "after_projection_version"
  | "before_commit";

export interface VnextCorrectionAdmissionProbe {
  afterWrite(point: VnextCorrectionAdmissionWritePoint): void | Promise<void>;
}

export interface VnextCorrectionAdmissionUow {
  resolveSafetyScope(
    input: ResolveVnextCorrectionSafetyScopeInput,
  ): Promise<VnextCorrectionSafetyScope>;
  admit(input: AdmitVnextCorrectionInput): Promise<VnextCorrectionAdmission>;
}

export class VnextCorrectionAdmissionNotFoundError extends Error {
  override readonly name = "VnextCorrectionAdmissionNotFoundError";

  constructor() {
    super("owned active experience session was not found");
  }
}

export class VnextCorrectionAdmissionStaleVersionError extends Error {
  override readonly name = "VnextCorrectionAdmissionStaleVersionError";

  constructor() {
    super("understanding correction basis is stale or not owned");
  }
}

export class VnextCorrectionAdmissionConflictError extends Error {
  override readonly name = "VnextCorrectionAdmissionConflictError";

  constructor() {
    super("understanding correction request conflicts with active truth");
  }
}

export const VNEXT_CORRECTION_ADMISSION_UOW = Symbol(
  "VNEXT_CORRECTION_ADMISSION_UOW",
);
