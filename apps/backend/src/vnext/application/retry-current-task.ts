import {
  createExperiencePublicError,
  type ExperienceProjection,
  type VnextExperienceRequest,
} from "@erliu/shared-contracts/vnext-experience";
import {
  VnextExperienceRetryConflictError,
  VnextExperienceRetryNotFoundError,
  VnextExperienceRetryStaleVersionError,
  type VnextExperienceRetryUow,
} from "../domain/experience-retry.uow.js";
import { assertVnextUuid } from "../domain/source-message.js";
import type { ReadExperienceProjection } from "./read-experience-projection.js";

export interface RetryCurrentTaskInput {
  readonly ownerPrincipalId: string;
  readonly experienceSessionId: string;
  readonly request: VnextExperienceRequest<"retry_current_task">;
}

export interface RetryCurrentTaskResult {
  readonly projection: ExperienceProjection;
  readonly creationDisposition: "created" | "replayed";
}

export class RetryCurrentTask {
  constructor(
    private readonly uow: VnextExperienceRetryUow,
    private readonly currentProjection: Pick<ReadExperienceProjection, "execute">,
  ) {}

  async execute(input: RetryCurrentTaskInput): Promise<RetryCurrentTaskResult> {
    assertVnextUuid(input.ownerPrincipalId, "ownerPrincipalId");
    assertVnextUuid(input.experienceSessionId, "experienceSessionId");
    if (input.request.action !== "retry_current_task") {
      throw new Error("RetryCurrentTask only accepts retry_current_task");
    }
    const retried = await this.uow.retry({
      ownerPrincipalId: input.ownerPrincipalId,
      experienceSessionId: input.experienceSessionId,
      clientRequestId: input.request.clientRequestId,
      basedOnVersionId: input.request.basedOnVersionId,
    });
    const projection = await this.currentProjection.execute(
      input.ownerPrincipalId,
      input.experienceSessionId,
    );
    return {
      creationDisposition: retried.creationDisposition,
      projection,
    };
  }
}

export type RetryCurrentTaskErrorResponse = {
  readonly status: 401 | 409 | 503;
  readonly body: ReturnType<typeof createExperiencePublicError>;
};

export function retryCurrentTaskErrorResponse(
  error: unknown,
): RetryCurrentTaskErrorResponse {
  if (error instanceof VnextExperienceRetryNotFoundError) {
    return {
      status: 401,
      body: createExperiencePublicError("session_expired", "restore_session"),
    };
  }
  if (error instanceof VnextExperienceRetryStaleVersionError) {
    return {
      status: 409,
      body: createExperiencePublicError("stale_version", "refresh_projection"),
    };
  }
  if (error instanceof VnextExperienceRetryConflictError) {
    return {
      status: 409,
      body: createExperiencePublicError("conflict", "refresh_projection"),
    };
  }
  return {
    status: 503,
    body: createExperiencePublicError("temporarily_unavailable", "return_later"),
  };
}
