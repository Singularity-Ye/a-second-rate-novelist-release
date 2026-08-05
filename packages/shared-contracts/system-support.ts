export const SYSTEM_SOURCE_RIGHTS = [
  "owned_or_authorized",
  "public_domain",
  "analysis_only",
  "unknown",
] as const;

export type SystemSourceRights = (typeof SYSTEM_SOURCE_RIGHTS)[number];

/** Stable opaque reference used when World Lab hands a source into the
 * formal ledger. The manuscript body stays outside this contract. */
export const WORLD_LAB_SOURCE_REF_PREFIX = "world-lab:" as const;

export function isWorldLabSourceRef(value: string) {
  if (typeof value !== "string") return false;
  const normalized = value.normalize("NFKC").trim();
  if (!normalized.startsWith(WORLD_LAB_SOURCE_REF_PREFIX)) return false;
  const opaqueId = normalized.slice(WORLD_LAB_SOURCE_REF_PREFIX.length);
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u.test(opaqueId);
}

export const SYSTEM_SOURCE_USE_MODES = [
  "continue_authorized_source",
  "extract_craft",
  "original_transform",
] as const;

export type SystemSourceUseMode = (typeof SYSTEM_SOURCE_USE_MODES)[number];

export const ENCOUNTER_MANIFESTATION_MODES = [
  "field_trip_discovery",
  "doorstep_delivery",
  "reader_letter",
  "direct_message",
] as const;

export type EncounterManifestationMode =
  (typeof ENCOUNTER_MANIFESTATION_MODES)[number];

export const FORMAL_WORK_EVIDENCE_KINDS = [
  "chapter_draft",
  "chapter_revision",
  "accepted_chapter",
  "reader_review",
] as const;

export type FormalWorkEvidenceKind =
  (typeof FORMAL_WORK_EVIDENCE_KINDS)[number];

export const PROCESS_ONLY_EVIDENCE_KINDS = [
  "life_trace",
  "activity_completion",
  "dialogue",
] as const;

export type ProcessOnlyEvidenceKind =
  (typeof PROCESS_ONLY_EVIDENCE_KINDS)[number];

export interface SystemSourceMaterial {
  readonly schemaVersion: 1;
  readonly sourceMaterialId: string;
  readonly ownerPrincipalId: string;
  readonly storyId: string;
  readonly title: string;
  readonly sourceRef: string;
  readonly sourceDigest: string;
  readonly rights: SystemSourceRights;
  readonly registeredAt: string;
}

export interface SubsystemDirective {
  readonly schemaVersion: 1;
  readonly directiveId: string;
  readonly ownerPrincipalId: string;
  readonly storyId: string;
  readonly sourceMaterialId: string;
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
  readonly issuedAt: string;
}

export interface HostTaskDraft {
  readonly schemaVersion: 1;
  readonly draftId: string;
  readonly directiveId: string;
  readonly ownerPrincipalId: string;
  readonly storyId: string;
  readonly sourceMaterialId: string;
  readonly version: number;
  readonly userFacingMessage: string;
  readonly whyNow: string;
  readonly objective: string;
  readonly hardConstraints: readonly string[];
  readonly minimumDeliverable: string;
  readonly acceptanceCriteria: readonly string[];
  readonly expectedEvidenceKind: FormalWorkEvidenceKind;
  readonly sourceUseMode: SystemSourceUseMode;
  readonly manifestationMode: EncounterManifestationMode;
  readonly opportunityTags: readonly string[];
  readonly updatedAt: string;
}

export type HostTaskDraftIssueCode =
  | "reference_mismatch"
  | "missing_user_message"
  | "missing_why_now"
  | "missing_objective"
  | "hard_constraint_mismatch"
  | "missing_deliverable"
  | "missing_acceptance_criteria"
  | "missing_opportunity_tags"
  | "unsupported_source_use_mode"
  | "unsupported_manifestation_mode"
  | "unsupported_evidence_kind"
  | "source_rights_do_not_allow_continuation";

export interface HostTaskDraftIssue {
  readonly code: HostTaskDraftIssueCode;
  readonly field: string;
}

export interface HostTaskDraftValidation {
  readonly canPublish: boolean;
  readonly issues: readonly HostTaskDraftIssue[];
}

export interface PublishedHostTask {
  readonly schemaVersion: 1;
  readonly taskId: string;
  readonly directiveId: string;
  readonly draftId: string;
  readonly draftVersion: number;
  readonly ownerPrincipalId: string;
  readonly storyId: string;
  readonly sourceMaterialId: string;
  readonly userFacingMessage: string;
  readonly whyNow: string;
  readonly objective: string;
  readonly hardConstraints: readonly string[];
  readonly minimumDeliverable: string;
  readonly acceptanceCriteria: readonly string[];
  readonly expectedEvidenceKind: FormalWorkEvidenceKind;
  readonly sourceUseMode: SystemSourceUseMode;
  readonly manifestationMode: EncounterManifestationMode;
  readonly opportunityTags: readonly string[];
  readonly status: "published";
  readonly publishedBy: "main_system";
  readonly publishedAt: string;
}

export type HostTaskChoiceDecision =
  | "accepted"
  | "narrowed"
  | "deferred"
  | "rejected";

export interface HostTaskChoice {
  readonly schemaVersion: 1;
  readonly choiceId: string;
  readonly taskId: string;
  readonly actor: "novelist";
  readonly decision: HostTaskChoiceDecision;
  readonly reason: string | null;
  readonly narrowedObjective: string | null;
  readonly lifeInterventionConsent:
    | "existing_plan_only"
    | "allow_registered_nudge";
  readonly chosenAt: string;
}

export interface RegisteredLifeOpportunity {
  readonly schemaVersion: 1;
  readonly opportunityId: string;
  readonly contractRef: string;
  readonly activityKey: string;
  readonly beatId: string;
  readonly routeKey: string | null;
  readonly manifestationModes: readonly EncounterManifestationMode[];
  readonly semanticTags: readonly string[];
  readonly availability: "available" | "planned_later" | "inactive";
  readonly requiresNewHostChoice: boolean;
}

export interface EncounterOpportunityRef {
  readonly opportunityId: string;
  readonly contractRef: string;
  readonly activityKey: string;
  readonly beatId: string;
  readonly routeKey: string | null;
}

export type EncounterPlanStatus =
  | "ready"
  | "waiting"
  | "needs_host_choice"
  | "no_legal_path"
  | "cancelled";

export type EncounterPlanReason =
  | "task_choice_missing"
  | "host_rejected"
  | "host_deferred"
  | "no_registered_opportunity"
  | "waiting_for_registered_opportunity"
  | "additional_host_choice_required"
  | "ready_on_existing_plan"
  | "ready_with_registered_nudge";

export interface EncounterPlan {
  readonly schemaVersion: 1;
  readonly planId: string;
  readonly taskId: string;
  readonly sourceMaterialId: string;
  readonly status: EncounterPlanStatus;
  readonly reason: EncounterPlanReason;
  readonly opportunity: EncounterOpportunityRef | null;
  readonly compiledAt: string;
}

export interface EncounterManifestationEvent {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly planId: string;
  readonly taskId: string;
  readonly sourceMaterialId: string;
  readonly opportunity: EncounterOpportunityRef;
  readonly result: "noticed" | "ignored" | "misused" | "kept";
  readonly occurredAt: string;
}

export interface CreativeAttemptRecord {
  readonly schemaVersion: 1;
  readonly attemptId: string;
  readonly taskId: string;
  readonly manifestationEventId: string | null;
  readonly activityEventRef: string;
  readonly status: "started" | "completed" | "interrupted";
  readonly startedAt: string;
  readonly endedAt: string | null;
}

export interface FormalWorkEvidence {
  readonly schemaVersion: 1;
  readonly evidenceId: string;
  readonly taskId: string;
  readonly kind: FormalWorkEvidenceKind;
  readonly source: "creative_runtime";
  readonly artifactRef: string;
  readonly artifactVersion: number;
  readonly lineageRefs: readonly string[];
  readonly verdict: "submitted" | "revision_requested" | "accepted";
  readonly recordedAt: string;
}

export interface ProcessOnlyEvidence {
  readonly schemaVersion: 1;
  readonly evidenceId: string;
  readonly taskId: string;
  readonly kind: ProcessOnlyEvidenceKind;
  readonly source: "life_runtime" | "dialogue_runtime";
  readonly sourceRef: string;
  readonly recordedAt: string;
}

export type SystemSupportEvidence = FormalWorkEvidence | ProcessOnlyEvidence;

export type NextDaySystemOutcome =
  | "host_rejected"
  | "host_deferred"
  | "awaiting_host_choice"
  | "awaiting_legal_opportunity"
  | "awaiting_manifestation"
  | "source_encountered"
  | "attempted_without_evidence"
  | "evidence_submitted"
  | "revision_requested"
  | "evidence_accepted";

export type NextSuggestionGuard =
  | "do_not_repeat_unchanged"
  | "wait_until_deferred_window"
  | "ask_before_life_intervention"
  | "do_not_fabricate_route"
  | "observe_before_suggesting"
  | "may_build_on_evidence";

export interface NextDaySystemMemory {
  readonly schemaVersion: 1;
  readonly memoryId: string;
  readonly ownerPrincipalId: string;
  readonly storyId: string;
  readonly taskId: string;
  readonly taskChoice: HostTaskChoiceDecision | "missing";
  readonly outcome: NextDaySystemOutcome;
  readonly formalEvidenceRef: string | null;
  readonly unresolvedRefs: readonly string[];
  readonly nextSuggestionGuard: NextSuggestionGuard;
  readonly generatedAt: string;
}

export interface CompanionChronicleFact {
  readonly kind:
    | "task_published"
    | "host_choice"
    | "encounter_plan"
    | "manifestation"
    | "creative_attempt"
    | "formal_evidence";
  readonly sourceRef: string;
  readonly summary: string;
}

export interface CompanionChronicleSeed {
  readonly schemaVersion: 1;
  readonly chronicleId: string;
  readonly ownerPrincipalId: string;
  readonly storyId: string;
  readonly taskId: string;
  readonly titleHint: string;
  readonly facts: readonly CompanionChronicleFact[];
  readonly sourceEventRefs: readonly string[];
  readonly workEvidenceEligible: false;
  readonly generatedAt: string;
}

export interface SystemSupportDayCloseProjection {
  readonly schemaVersion: 1;
  readonly memory: NextDaySystemMemory;
  readonly chronicle: CompanionChronicleSeed;
}

export interface VnextRegisterSystemSourceRequest {
  readonly clientRequestId: string;
  readonly workspaceId: string;
  readonly title: string;
  readonly sourceRef: string;
  readonly sourceDigest: string;
  readonly rights: SystemSourceRights;
}

export interface VnextPublishSystemHostTaskRequest {
  readonly clientRequestId: string;
  readonly basedOnVersionId: string;
  readonly userFacingMessage: string;
  readonly whyNow: string;
  readonly objective: string;
  readonly hardConstraints: readonly string[];
  readonly minimumDeliverable: string;
  readonly acceptanceCriteria: readonly string[];
  readonly expectedEvidenceKind: FormalWorkEvidenceKind;
  readonly sourceUseMode: SystemSourceUseMode;
  readonly manifestationMode: EncounterManifestationMode;
  readonly opportunityTags: readonly string[];
}

export interface VnextSystemSupportCaseProjection {
  readonly schemaVersion: 1;
  readonly caseId: string;
  readonly workspaceId: string;
  readonly versionId: string;
  readonly aggregateVersion: number;
  readonly sourceMaterial: SystemSourceMaterial;
  readonly subsystemDirective: SubsystemDirective | null;
  readonly latestDraft: HostTaskDraft | null;
  readonly publishedTask: PublishedHostTask | null;
  readonly hostChoice: HostTaskChoice | null;
  readonly encounterPlan: EncounterPlan | null;
  readonly manifestation: EncounterManifestationEvent | null;
  readonly creativeAttempt: CreativeAttemptRecord | null;
  readonly formalEvidence: FormalWorkEvidence | null;
  readonly dayClose: SystemSupportDayCloseProjection | null;
}

export interface VnextSystemSupportMutationResponse {
  readonly creationDisposition: "created" | "replayed";
  readonly projection: VnextSystemSupportCaseProjection;
}

export type VnextSystemSupportRequestParseResult<TRequest> =
  | { readonly success: true; readonly data: TRequest }
  | {
      readonly success: false;
      readonly error: {
        readonly code: "invalid_request";
        readonly recovery: "correct_request";
      };
    };

export interface VnextSystemSupportRequestSchema<TRequest> {
  safeParse(input: unknown): VnextSystemSupportRequestParseResult<TRequest>;
  parse(input: unknown): TRequest;
}

const VNEXT_SYSTEM_SUPPORT_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const VNEXT_SYSTEM_SUPPORT_SHA256_PATTERN = /^[0-9a-f]{64}$/iu;
const REGISTER_SOURCE_REQUEST_FIELDS = new Set([
  "clientRequestId",
  "workspaceId",
  "title",
  "sourceRef",
  "sourceDigest",
  "rights",
]);
const PUBLISH_HOST_TASK_REQUEST_FIELDS = new Set([
  "clientRequestId",
  "basedOnVersionId",
  "userFacingMessage",
  "whyNow",
  "objective",
  "hardConstraints",
  "minimumDeliverable",
  "acceptanceCriteria",
  "expectedEvidenceKind",
  "sourceUseMode",
  "manifestationMode",
  "opportunityTags",
]);

function systemSupportInvalidRequest<T>(): VnextSystemSupportRequestParseResult<T> {
  return {
    success: false,
    error: { code: "invalid_request", recovery: "correct_request" },
  };
}

function systemSupportRecord(
  input: unknown,
  fields: ReadonlySet<string>,
): Record<string, unknown> | null {
  try {
    if (
      typeof input !== "object" ||
      input === null ||
      Array.isArray(input) ||
      (Object.getPrototypeOf(input) !== Object.prototype &&
        Object.getPrototypeOf(input) !== null)
    ) {
      return null;
    }
    const record = input as Record<string, unknown>;
    const keys = Reflect.ownKeys(record);
    if (
      keys.length !== fields.size ||
      keys.some((key) => typeof key !== "string" || !fields.has(key))
    ) {
      return null;
    }
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      if (descriptor === undefined || !("value" in descriptor)) {
        return null;
      }
    }
    return record;
  } catch {
    return null;
  }
}

function systemSupportString(
  value: unknown,
  maximumCodePoints: number,
): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.normalize("NFKC").trim();
  if (normalized.length === 0 || normalized.includes("\u0000")) {
    return null;
  }
  let count = 0;
  for (const _point of normalized) {
    count += 1;
    if (count > maximumCodePoints) {
      return null;
    }
  }
  return normalized;
}

function systemSupportStringList(
  value: unknown,
  options: { readonly allowEmpty: boolean; readonly maximumItems?: number },
): readonly string[] | null {
  const maximumItems = options.maximumItems ?? 24;
  if (
    !Array.isArray(value) ||
    (!options.allowEmpty && value.length === 0) ||
    value.length > maximumItems
  ) {
    return null;
  }
  const normalized: string[] = [];
  for (const item of value) {
    const parsed = systemSupportString(item, 4_000);
    if (parsed === null) {
      return null;
    }
    normalized.push(parsed);
  }
  return new Set(normalized).size === normalized.length
    ? Object.freeze(normalized)
    : null;
}

function createSystemSupportRequestSchema<TRequest>(
  parser: (input: Record<string, unknown>) => TRequest | null,
  fields: ReadonlySet<string>,
): VnextSystemSupportRequestSchema<TRequest> {
  const safeParse = (
    input: unknown,
  ): VnextSystemSupportRequestParseResult<TRequest> => {
    const record = systemSupportRecord(input, fields);
    if (record === null) {
      return systemSupportInvalidRequest();
    }
    try {
      const parsed = parser(record);
      return parsed === null
        ? systemSupportInvalidRequest()
        : { success: true, data: parsed };
    } catch {
      return systemSupportInvalidRequest();
    }
  };
  return Object.freeze({
    safeParse,
    parse(input: unknown) {
      const result = safeParse(input);
      if (!result.success) {
        throw result.error;
      }
      return result.data;
    },
  });
}

function parseRegisterSystemSourceRequest(
  input: Record<string, unknown>,
): VnextRegisterSystemSourceRequest | null {
  const clientRequestId = systemSupportString(input.clientRequestId, 200);
  const workspaceId = systemSupportString(input.workspaceId, 80);
  const title = systemSupportString(input.title, 240);
  const sourceRef = systemSupportString(input.sourceRef, 4_000);
  const sourceDigest = systemSupportString(input.sourceDigest, 64)?.toLowerCase();
  if (
    clientRequestId === null ||
    workspaceId === null ||
    !VNEXT_SYSTEM_SUPPORT_UUID_PATTERN.test(workspaceId) ||
    title === null ||
    sourceRef === null ||
    sourceDigest === undefined ||
    !VNEXT_SYSTEM_SUPPORT_SHA256_PATTERN.test(sourceDigest) ||
    !SYSTEM_SOURCE_RIGHTS.includes(input.rights as SystemSourceRights)
  ) {
    return null;
  }
  return {
    clientRequestId,
    workspaceId,
    title,
    sourceRef,
    sourceDigest,
    rights: input.rights as SystemSourceRights,
  };
}

function parsePublishSystemHostTaskRequest(
  input: Record<string, unknown>,
): VnextPublishSystemHostTaskRequest | null {
  const clientRequestId = systemSupportString(input.clientRequestId, 200);
  const basedOnVersionId = systemSupportString(input.basedOnVersionId, 80);
  const userFacingMessage = systemSupportString(input.userFacingMessage, 4_000);
  const whyNow = systemSupportString(input.whyNow, 4_000);
  const objective = systemSupportString(input.objective, 4_000);
  const hardConstraints = systemSupportStringList(input.hardConstraints, {
    allowEmpty: true,
  });
  const minimumDeliverable = systemSupportString(
    input.minimumDeliverable,
    4_000,
  );
  const acceptanceCriteria = systemSupportStringList(
    input.acceptanceCriteria,
    { allowEmpty: false },
  );
  const opportunityTags = systemSupportStringList(input.opportunityTags, {
    allowEmpty: false,
  });
  if (
    clientRequestId === null ||
    basedOnVersionId === null ||
    !VNEXT_SYSTEM_SUPPORT_UUID_PATTERN.test(basedOnVersionId) ||
    userFacingMessage === null ||
    whyNow === null ||
    objective === null ||
    hardConstraints === null ||
    minimumDeliverable === null ||
    acceptanceCriteria === null ||
    opportunityTags === null ||
    !FORMAL_WORK_EVIDENCE_KINDS.includes(
      input.expectedEvidenceKind as FormalWorkEvidenceKind,
    ) ||
    !SYSTEM_SOURCE_USE_MODES.includes(
      input.sourceUseMode as SystemSourceUseMode,
    ) ||
    !ENCOUNTER_MANIFESTATION_MODES.includes(
      input.manifestationMode as EncounterManifestationMode,
    )
  ) {
    return null;
  }
  return {
    clientRequestId,
    basedOnVersionId,
    userFacingMessage,
    whyNow,
    objective,
    hardConstraints,
    minimumDeliverable,
    acceptanceCriteria,
    expectedEvidenceKind: input.expectedEvidenceKind as FormalWorkEvidenceKind,
    sourceUseMode: input.sourceUseMode as SystemSourceUseMode,
    manifestationMode: input.manifestationMode as EncounterManifestationMode,
    opportunityTags,
  };
}

export const vnextRegisterSystemSourceRequestSchema =
  createSystemSupportRequestSchema(
    parseRegisterSystemSourceRequest,
    REGISTER_SOURCE_REQUEST_FIELDS,
  );

export const vnextPublishSystemHostTaskRequestSchema =
  createSystemSupportRequestSchema(
    parsePublishSystemHostTaskRequest,
    PUBLISH_HOST_TASK_REQUEST_FIELDS,
  );
