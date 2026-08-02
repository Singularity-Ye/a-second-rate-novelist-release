export interface RetryVnextExperienceTaskInput {
  readonly ownerPrincipalId: string;
  readonly experienceSessionId: string;
  readonly clientRequestId: string;
  readonly basedOnVersionId: string;
}

export interface VnextExperienceRetry {
  readonly taskId: string;
  readonly projectionVersionId: string;
  readonly creationDisposition: "created" | "replayed";
}

export type VnextExperienceRetryWritePoint =
  | "after_retry_task"
  | "after_projection_version"
  | "before_commit";

export interface VnextExperienceRetryProbe {
  afterWrite(point: VnextExperienceRetryWritePoint): void | Promise<void>;
}

export interface VnextExperienceRetryUow {
  retry(input: RetryVnextExperienceTaskInput): Promise<VnextExperienceRetry>;
}

export class VnextExperienceRetryNotFoundError extends Error {
  override readonly name = "VnextExperienceRetryNotFoundError";

  constructor() {
    super("owned active experience session was not found");
  }
}

export class VnextExperienceRetryStaleVersionError extends Error {
  override readonly name = "VnextExperienceRetryStaleVersionError";

  constructor() {
    super("retry target is no longer the current retryable task version");
  }
}

export class VnextExperienceRetryConflictError extends Error {
  override readonly name = "VnextExperienceRetryConflictError";

  constructor() {
    super("retry conflicts with an active task or prior idempotency binding");
  }
}

export const VNEXT_EXPERIENCE_RETRY_UOW = Symbol(
  "VNEXT_EXPERIENCE_RETRY_UOW",
);
