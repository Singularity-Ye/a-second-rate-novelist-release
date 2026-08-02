import type {
  VnextPublishSystemHostTaskRequest,
  VnextRegisterSystemSourceRequest,
  VnextSystemSupportCaseProjection,
  VnextSystemSupportMutationResponse,
} from "@erliu/shared-contracts";
import {
  SystemSupportDomainError,
} from "../domain/system-support.js";
import {
  SystemSupportCanonicalEvidenceError,
  SystemSupportCaseNotFoundError,
  SystemSupportIdempotencyConflictError,
  SystemSupportLedgerCorruptError,
  SystemSupportSessionNotFoundError,
  SystemSupportStaleVersionError,
  SystemSupportStateConflictError,
  type CloseSystemSupportDayInput,
  type CompileSystemSupportEncounterInput,
  type IssueSystemSupportDirectiveInput,
  type RecordSystemSupportCreativeAttemptInput,
  type RecordSystemSupportFormalEvidenceInput,
  type RecordSystemSupportHostChoiceInput,
  type RecordSystemSupportManifestationInput,
  type SystemSupportLifeOpportunityPort,
  type SystemSupportUnitOfWork,
} from "../domain/system-support.uow.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class InvalidSystemSupportIdentifierError extends Error {
  override readonly name = "InvalidSystemSupportIdentifierError";

  constructor() {
    super("system-support identifier is invalid");
  }
}

function assertUuid(value: string) {
  if (!UUID_PATTERN.test(value)) {
    throw new InvalidSystemSupportIdentifierError();
  }
}

function assertPublicScope(input: {
  readonly ownerPrincipalId: string;
  readonly experienceSessionId: string;
}) {
  assertUuid(input.ownerPrincipalId);
  assertUuid(input.experienceSessionId);
}

function assertTrustedScope(input: {
  readonly ownerPrincipalId: string;
  readonly caseId: string;
  readonly basedOnVersionId: string;
}) {
  assertUuid(input.ownerPrincipalId);
  assertUuid(input.caseId);
  assertUuid(input.basedOnVersionId);
}

export class NoRegisteredSystemSupportLifeOpportunityPort
  implements SystemSupportLifeOpportunityPort
{
  async listRegisteredOpportunities() {
    return [] as const;
  }
}

export class SystemSupportApplication {
  constructor(
    private readonly uow: SystemSupportUnitOfWork,
    private readonly lifeOpportunities: SystemSupportLifeOpportunityPort,
  ) {}

  registerSource(input: {
    readonly ownerPrincipalId: string;
    readonly experienceSessionId: string;
    readonly request: VnextRegisterSystemSourceRequest;
  }): Promise<VnextSystemSupportMutationResponse> {
    assertPublicScope(input);
    assertUuid(input.request.workspaceId);
    return this.uow.registerSource(input);
  }

  readCase(input: {
    readonly ownerPrincipalId: string;
    readonly experienceSessionId: string;
    readonly caseId: string;
  }): Promise<VnextSystemSupportCaseProjection> {
    assertPublicScope(input);
    assertUuid(input.caseId);
    return this.uow.readOwnedCase(input);
  }

  publishHostTask(input: {
    readonly ownerPrincipalId: string;
    readonly experienceSessionId: string;
    readonly caseId: string;
    readonly request: VnextPublishSystemHostTaskRequest;
  }): Promise<VnextSystemSupportMutationResponse> {
    assertPublicScope(input);
    assertUuid(input.caseId);
    assertUuid(input.request.basedOnVersionId);
    return this.uow.publishHostTask(input);
  }

  issueDirective(input: IssueSystemSupportDirectiveInput) {
    assertTrustedScope(input);
    return this.uow.issueDirective(input);
  }

  recordHostChoice(input: RecordSystemSupportHostChoiceInput) {
    assertTrustedScope(input);
    return this.uow.recordHostChoice(input);
  }

  async compileEncounter(
    input: Omit<CompileSystemSupportEncounterInput, "opportunities">,
  ): Promise<VnextSystemSupportMutationResponse> {
    assertTrustedScope(input);
    const opportunities = await this.lifeOpportunities.listRegisteredOpportunities({
      ownerPrincipalId: input.ownerPrincipalId,
      caseId: input.caseId,
    });
    return this.uow.compileEncounter({ ...input, opportunities });
  }

  recordManifestation(input: RecordSystemSupportManifestationInput) {
    assertTrustedScope(input);
    return this.uow.recordManifestation(input);
  }

  recordCreativeAttempt(input: RecordSystemSupportCreativeAttemptInput) {
    assertTrustedScope(input);
    return this.uow.recordCreativeAttempt(input);
  }

  recordFormalEvidence(input: RecordSystemSupportFormalEvidenceInput) {
    assertTrustedScope(input);
    assertUuid(input.storyContentId);
    return this.uow.recordFormalEvidence(input);
  }

  closeDay(input: CloseSystemSupportDayInput) {
    assertTrustedScope(input);
    return this.uow.closeDay(input);
  }
}

export interface SystemSupportPublicErrorBody {
  readonly code:
    | "authentication_required"
    | "not_found"
    | "invalid_request"
    | "stale_version"
    | "conflict"
    | "temporarily_unavailable";
  readonly recovery:
    | "restore_session"
    | "none"
    | "correct_request"
    | "refresh_case"
    | "return_later";
}

export type SystemSupportErrorResponse = {
  readonly status: 400 | 401 | 404 | 409 | 422 | 503;
  readonly body: SystemSupportPublicErrorBody;
};

export function systemSupportErrorResponse(
  error: unknown,
): SystemSupportErrorResponse {
  if (error instanceof SystemSupportSessionNotFoundError) {
    return {
      status: 401,
      body: { code: "authentication_required", recovery: "restore_session" },
    };
  }
  if (error instanceof SystemSupportCaseNotFoundError) {
    return { status: 404, body: { code: "not_found", recovery: "none" } };
  }
  if (error instanceof InvalidSystemSupportIdentifierError) {
    return {
      status: 400,
      body: { code: "invalid_request", recovery: "correct_request" },
    };
  }
  if (error instanceof SystemSupportStaleVersionError) {
    return {
      status: 409,
      body: { code: "stale_version", recovery: "refresh_case" },
    };
  }
  if (
    error instanceof SystemSupportIdempotencyConflictError ||
    error instanceof SystemSupportStateConflictError
  ) {
    return {
      status: 409,
      body: { code: "conflict", recovery: "correct_request" },
    };
  }
  if (
    error instanceof SystemSupportDomainError ||
    error instanceof SystemSupportCanonicalEvidenceError
  ) {
    return {
      status: 422,
      body: { code: "invalid_request", recovery: "correct_request" },
    };
  }
  if (error instanceof SystemSupportLedgerCorruptError) {
    return {
      status: 503,
      body: { code: "temporarily_unavailable", recovery: "return_later" },
    };
  }
  return {
    status: 503,
    body: { code: "temporarily_unavailable", recovery: "return_later" },
  };
}
