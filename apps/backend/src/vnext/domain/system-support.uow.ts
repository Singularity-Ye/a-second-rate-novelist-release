import type {
  CreativeAttemptRecord,
  EncounterManifestationEvent,
  EncounterManifestationMode,
  FormalWorkEvidence,
  FormalWorkEvidenceKind,
  HostTaskChoiceDecision,
  RegisteredLifeOpportunity,
  SystemSourceUseMode,
  VnextPublishSystemHostTaskRequest,
  VnextRegisterSystemSourceRequest,
  VnextSystemSupportCaseProjection,
  VnextSystemSupportMutationResponse,
} from "@erliu/shared-contracts";

export interface RegisterSystemSupportSourceInput {
  readonly ownerPrincipalId: string;
  readonly experienceSessionId: string;
  readonly request: VnextRegisterSystemSourceRequest;
}

export interface ReadOwnedSystemSupportCaseInput {
  readonly ownerPrincipalId: string;
  readonly experienceSessionId: string;
  readonly caseId: string;
}

export interface PublishSystemSupportHostTaskInput {
  readonly ownerPrincipalId: string;
  readonly experienceSessionId: string;
  readonly caseId: string;
  readonly request: VnextPublishSystemHostTaskRequest;
}

interface TrustedSystemSupportCommandInput {
  readonly ownerPrincipalId: string;
  readonly caseId: string;
  readonly clientRequestId: string;
  readonly basedOnVersionId: string;
}

export interface IssueSystemSupportDirectiveInput
  extends TrustedSystemSupportCommandInput {
  readonly observationRefs: readonly string[];
  readonly whyNow: string;
  readonly objective: string;
  readonly hardConstraints: readonly string[];
  readonly minimumDeliverable: string;
  readonly acceptanceCriteria: readonly string[];
  readonly expectedEvidenceKind: FormalWorkEvidenceKind;
  readonly suggestedManifestationModes: readonly EncounterManifestationMode[];
  readonly opportunityTags: readonly string[];
  readonly confidence: "low" | "medium" | "high";
}

export interface RecordSystemSupportHostChoiceInput
  extends TrustedSystemSupportCommandInput {
  readonly decision: HostTaskChoiceDecision;
  readonly reason: string | null;
  readonly narrowedObjective: string | null;
  readonly lifeInterventionConsent:
    | "existing_plan_only"
    | "allow_registered_nudge";
}

export interface CompileSystemSupportEncounterInput
  extends TrustedSystemSupportCommandInput {
  readonly opportunities: readonly RegisteredLifeOpportunity[];
}

export interface RecordSystemSupportManifestationInput
  extends TrustedSystemSupportCommandInput {
  readonly result: EncounterManifestationEvent["result"];
}

export interface RecordSystemSupportCreativeAttemptInput
  extends TrustedSystemSupportCommandInput {
  readonly activityEventRef: string;
  readonly status: CreativeAttemptRecord["status"];
  readonly endedAt: string | null;
}

export interface RecordSystemSupportFormalEvidenceInput
  extends TrustedSystemSupportCommandInput {
  readonly storyContentId: string;
  readonly verdict: FormalWorkEvidence["verdict"];
}

export interface CloseSystemSupportDayInput
  extends TrustedSystemSupportCommandInput {}

export type SystemSupportWritePoint =
  | "after_case"
  | "after_case_version"
  | "after_fact"
  | "after_command"
  | "after_outbox"
  | "before_commit";

export interface SystemSupportWriteProbe {
  afterWrite(point: SystemSupportWritePoint): void | Promise<void>;
}

export interface SystemSupportUnitOfWork {
  registerSource(
    input: RegisterSystemSupportSourceInput,
  ): Promise<VnextSystemSupportMutationResponse>;
  readOwnedCase(
    input: ReadOwnedSystemSupportCaseInput,
  ): Promise<VnextSystemSupportCaseProjection>;
  issueDirective(
    input: IssueSystemSupportDirectiveInput,
  ): Promise<VnextSystemSupportMutationResponse>;
  publishHostTask(
    input: PublishSystemSupportHostTaskInput,
  ): Promise<VnextSystemSupportMutationResponse>;
  recordHostChoice(
    input: RecordSystemSupportHostChoiceInput,
  ): Promise<VnextSystemSupportMutationResponse>;
  compileEncounter(
    input: CompileSystemSupportEncounterInput,
  ): Promise<VnextSystemSupportMutationResponse>;
  recordManifestation(
    input: RecordSystemSupportManifestationInput,
  ): Promise<VnextSystemSupportMutationResponse>;
  recordCreativeAttempt(
    input: RecordSystemSupportCreativeAttemptInput,
  ): Promise<VnextSystemSupportMutationResponse>;
  recordFormalEvidence(
    input: RecordSystemSupportFormalEvidenceInput,
  ): Promise<VnextSystemSupportMutationResponse>;
  closeDay(
    input: CloseSystemSupportDayInput,
  ): Promise<VnextSystemSupportMutationResponse>;
}

export interface SystemSupportLifeOpportunityPort {
  listRegisteredOpportunities(input: {
    readonly ownerPrincipalId: string;
    readonly caseId: string;
  }): Promise<readonly RegisteredLifeOpportunity[]>;
}

export class SystemSupportSessionNotFoundError extends Error {
  override readonly name = "SystemSupportSessionNotFoundError";

  constructor() {
    super("owned active system-support session was not found");
  }
}

export class SystemSupportCaseNotFoundError extends Error {
  override readonly name = "SystemSupportCaseNotFoundError";

  constructor() {
    super("owned system-support case was not found");
  }
}

export class SystemSupportIdempotencyConflictError extends Error {
  override readonly name = "SystemSupportIdempotencyConflictError";

  constructor() {
    super("system-support idempotency key is bound to different input");
  }
}

export class SystemSupportStaleVersionError extends Error {
  override readonly name = "SystemSupportStaleVersionError";

  constructor() {
    super("system-support case version is stale");
  }
}

export class SystemSupportStateConflictError extends Error {
  override readonly name = "SystemSupportStateConflictError";

  constructor(readonly state: string) {
    super(`system-support command conflicts with current state: ${state}`);
  }
}

export class SystemSupportCanonicalEvidenceError extends Error {
  override readonly name = "SystemSupportCanonicalEvidenceError";

  constructor() {
    super("canonical story content is not eligible as work evidence");
  }
}

export class SystemSupportLedgerCorruptError extends Error {
  override readonly name = "SystemSupportLedgerCorruptError";

  constructor() {
    super("system-support fact ledger failed integrity validation");
  }
}

export const VNEXT_SYSTEM_SUPPORT_UOW = Symbol("VNEXT_SYSTEM_SUPPORT_UOW");
export const VNEXT_SYSTEM_SUPPORT_LIFE_OPPORTUNITY_PORT = Symbol(
  "VNEXT_SYSTEM_SUPPORT_LIFE_OPPORTUNITY_PORT",
);

export type { SystemSourceUseMode };
