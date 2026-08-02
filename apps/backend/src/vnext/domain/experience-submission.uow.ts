export interface SubmitVnextExperienceInput {
  readonly ownerPrincipalId: string;
  readonly experienceSessionId: string;
  readonly clientRequestId: string;
  readonly text: string;
  readonly processingEvidenceRef: string;
}

export interface VnextExperienceSubmission {
  readonly sourceMessageId: string;
  readonly taskId: string;
  readonly projectionVersionId: string;
  readonly creationDisposition: "created" | "replayed";
}

export type VnextExperienceSubmissionWritePoint =
  | "after_source_message"
  | "after_understand_task"
  | "after_projection_version"
  | "before_commit";

export interface VnextExperienceSubmissionProbe {
  afterWrite(point: VnextExperienceSubmissionWritePoint): void | Promise<void>;
}

export interface VnextExperienceSubmissionUow {
  submit(input: SubmitVnextExperienceInput): Promise<VnextExperienceSubmission>;
}

export class VnextExperienceSubmissionConflictError extends Error {
  override readonly name = "VnextExperienceSubmissionConflictError";

  constructor() {
    super("experience submission idempotency key is bound to different input");
  }
}

export class VnextExperienceSubmissionNotFoundError extends Error {
  override readonly name = "VnextExperienceSubmissionNotFoundError";

  constructor() {
    super("owned active experience session was not found");
  }
}

export const VNEXT_EXPERIENCE_SUBMISSION_UOW = Symbol(
  "VNEXT_EXPERIENCE_SUBMISSION_UOW",
);
