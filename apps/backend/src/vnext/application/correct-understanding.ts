import {
  createExperiencePublicError,
  type ExperienceProjection,
  type VnextExperienceRequest,
} from "@erliu/shared-contracts/vnext-experience";
import {
  VnextCorrectionAdmissionConflictError,
  VnextCorrectionAdmissionNotFoundError,
  VnextCorrectionAdmissionStaleVersionError,
  type VnextCorrectionAdmissionUow,
} from "../domain/correction-admission.uow.js";
import { assertVnextUuid } from "../domain/source-message.js";
import {
  SyntheticFixtureNotApprovedError,
  type SyntheticFixtureAuthorizer,
} from "../domain/synthetic-fixture.js";
import type { CheckInputSafety } from "./check-input-safety.js";
import type { ReadExperienceProjection } from "./read-experience-projection.js";

export interface CorrectUnderstandingInput {
  readonly ownerPrincipalId: string;
  readonly experienceSessionId: string;
  readonly request: VnextExperienceRequest<"correct_understanding">;
}

export interface CorrectUnderstandingResult {
  readonly projection: ExperienceProjection;
  readonly creationDisposition: "created" | "replayed";
}

export class VnextCorrectionInputSafetyBlockedError extends Error {
  override readonly name = "VnextCorrectionInputSafetyBlockedError";

  constructor() {
    super("understanding correction was blocked by the input safety policy");
  }
}

export class CorrectUnderstanding {
  constructor(
    private readonly uow: VnextCorrectionAdmissionUow,
    private readonly currentProjection: Pick<ReadExperienceProjection, "execute">,
    private readonly inputSafety: Pick<CheckInputSafety, "execute">,
    private readonly syntheticFixtures: SyntheticFixtureAuthorizer,
  ) {}

  async execute(
    input: CorrectUnderstandingInput,
  ): Promise<CorrectUnderstandingResult> {
    assertVnextUuid(input.ownerPrincipalId, "ownerPrincipalId");
    assertVnextUuid(input.experienceSessionId, "experienceSessionId");
    if (input.request.action !== "correct_understanding") {
      throw new Error("CorrectUnderstanding only accepts correct_understanding");
    }
    assertVnextUuid(input.request.basedOnVersionId, "basedOnVersionId");

    const fixture = this.syntheticFixtures.authorize(input.request.text);
    const scope = await this.uow.resolveSafetyScope({
      ownerPrincipalId: input.ownerPrincipalId,
      experienceSessionId: input.experienceSessionId,
      basedOnUnderstandingId: input.request.basedOnVersionId,
    });
    assertVnextUuid(scope.workspaceId, "workspaceId");
    if (!Number.isSafeInteger(scope.basedOnVersion) || scope.basedOnVersion < 1) {
      throw new Error("basedOnVersion must be a positive safe integer");
    }

    const safety = await this.inputSafety.execute({
      ownerPrincipalId: input.ownerPrincipalId,
      experienceSessionId: input.experienceSessionId,
      workspaceId: scope.workspaceId,
      content: input.request.text,
    });
    if (safety.disposition !== "support") {
      throw new VnextCorrectionInputSafetyBlockedError();
    }

    const admitted = await this.uow.admit({
      ownerPrincipalId: input.ownerPrincipalId,
      experienceSessionId: input.experienceSessionId,
      clientRequestId: input.request.clientRequestId,
      text: input.request.text,
      basedOnUnderstandingId: input.request.basedOnVersionId,
      basedOnVersion: scope.basedOnVersion,
      workspaceId: scope.workspaceId,
      processingEvidenceRef: fixture.evidenceRef,
    });
    const projection = await this.currentProjection.execute(
      input.ownerPrincipalId,
      input.experienceSessionId,
    );
    return {
      creationDisposition: admitted.creationDisposition,
      projection,
    };
  }
}

export type CorrectUnderstandingErrorResponse = {
  readonly status: 401 | 403 | 409 | 503;
  readonly body: ReturnType<typeof createExperiencePublicError>;
};

export function correctUnderstandingErrorResponse(
  error: unknown,
): CorrectUnderstandingErrorResponse {
  if (error instanceof VnextCorrectionAdmissionNotFoundError) {
    return {
      status: 401,
      body: createExperiencePublicError("session_expired", "restore_session"),
    };
  }
  if (error instanceof VnextCorrectionAdmissionStaleVersionError) {
    return {
      status: 409,
      body: createExperiencePublicError("stale_version", "refresh_projection"),
    };
  }
  if (error instanceof VnextCorrectionAdmissionConflictError) {
    return {
      status: 409,
      body: createExperiencePublicError("conflict", "correct_request"),
    };
  }
  if (error instanceof VnextCorrectionInputSafetyBlockedError) {
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
