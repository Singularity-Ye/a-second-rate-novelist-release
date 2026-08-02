import {
  createExperiencePublicError,
  type ExperienceProjection,
  type VnextExperienceRequest,
} from "@erliu/shared-contracts/vnext-experience";
import {
  VnextExperienceSubmissionConflictError,
  VnextExperienceSubmissionNotFoundError,
  type VnextExperienceSubmissionUow,
} from "../domain/experience-submission.uow.js";
import { assertVnextUuid } from "../domain/source-message.js";
import {
  SyntheticFixtureNotApprovedError,
  type SyntheticFixtureAuthorizer,
} from "../domain/synthetic-fixture.js";
import type { CheckInputSafety } from "./check-input-safety.js";
import type { ReadExperienceProjection } from "./read-experience-projection.js";

export interface SubmitSourceMessageInput {
  readonly ownerPrincipalId: string;
  readonly experienceSessionId: string;
  readonly request: VnextExperienceRequest<"submit_intent">;
}

export interface SubmitSourceMessageResult {
  readonly projection: ExperienceProjection;
  readonly creationDisposition: "created" | "replayed";
}

export class VnextInputSafetyBlockedError extends Error {
  override readonly name = "VnextInputSafetyBlockedError";

  constructor() {
    super("source message was blocked by the input safety policy");
  }
}

export class SubmitSourceMessage {
  constructor(
    private readonly uow: VnextExperienceSubmissionUow,
    private readonly currentProjection: Pick<ReadExperienceProjection, "execute">,
    private readonly inputSafety: Pick<CheckInputSafety, "execute">,
    private readonly syntheticFixtures: SyntheticFixtureAuthorizer,
  ) {}

  async execute(input: SubmitSourceMessageInput): Promise<SubmitSourceMessageResult> {
    assertVnextUuid(input.ownerPrincipalId, "ownerPrincipalId");
    assertVnextUuid(input.experienceSessionId, "experienceSessionId");
    if (input.request.action !== "submit_intent") {
      throw new Error("SubmitSourceMessage only accepts submit_intent");
    }
    const fixture = this.syntheticFixtures.authorize(input.request.text);
    const safety = await this.inputSafety.execute({
      ownerPrincipalId: input.ownerPrincipalId,
      experienceSessionId: input.experienceSessionId,
      workspaceId: null,
      content: input.request.text,
    });
    if (safety.disposition !== "support") {
      throw new VnextInputSafetyBlockedError();
    }
    const submitted = await this.uow.submit({
      ownerPrincipalId: input.ownerPrincipalId,
      experienceSessionId: input.experienceSessionId,
      clientRequestId: input.request.clientRequestId,
      text: input.request.text,
      processingEvidenceRef: fixture.evidenceRef,
    });
    const projection = await this.currentProjection.execute(
      input.ownerPrincipalId,
      input.experienceSessionId,
    );
    return {
      creationDisposition: submitted.creationDisposition,
      projection,
    };
  }
}

export type SubmitSourceMessageErrorResponse = {
  readonly status: 401 | 403 | 409 | 503;
  readonly body: ReturnType<typeof createExperiencePublicError>;
};

export function submitSourceMessageErrorResponse(
  error: unknown,
): SubmitSourceMessageErrorResponse {
  if (error instanceof VnextExperienceSubmissionNotFoundError) {
    return {
      status: 401,
      body: createExperiencePublicError("session_expired", "restore_session"),
    };
  }
  if (error instanceof VnextExperienceSubmissionConflictError) {
    return {
      status: 409,
      body: createExperiencePublicError("conflict", "correct_request"),
    };
  }
  if (error instanceof VnextInputSafetyBlockedError) {
    return {
      status: 403,
      body: createExperiencePublicError(
        "safety_blocked",
        "appeal_safety_decision",
      ),
    };
  }
  if (error instanceof SyntheticFixtureNotApprovedError) {
    return {
      status: 403,
      body: createExperiencePublicError("compliance_blocked", "none"),
    };
  }
  return {
    status: 503,
    body: createExperiencePublicError("temporarily_unavailable", "return_later"),
  };
}
