import {
  ENCOUNTER_MANIFESTATION_MODES,
  FORMAL_WORK_EVIDENCE_KINDS,
  PROCESS_ONLY_EVIDENCE_KINDS,
  SYSTEM_SOURCE_RIGHTS,
  SYSTEM_SOURCE_USE_MODES,
  type CompanionChronicleFact,
  type CreativeAttemptRecord,
  type EncounterManifestationEvent,
  type EncounterOpportunityRef,
  type EncounterPlan,
  type EncounterPlanReason,
  type EncounterPlanStatus,
  type FormalWorkEvidence,
  type FormalWorkEvidenceKind,
  type HostTaskChoice,
  type HostTaskDraft,
  type HostTaskDraftIssue,
  type HostTaskDraftValidation,
  type NextDaySystemOutcome,
  type NextSuggestionGuard,
  type ProcessOnlyEvidence,
  type PublishedHostTask,
  type RegisteredLifeOpportunity,
  type SubsystemDirective,
  type SystemSourceMaterial,
  type SystemSupportDayCloseProjection,
  type SystemSupportEvidence,
} from "@erliu/shared-contracts";

export type SystemSupportDomainErrorCode =
  | "invalid_source_material"
  | "invalid_subsystem_directive"
  | "draft_not_publishable"
  | "unauthorized_task_publisher"
  | "invalid_host_choice"
  | "invalid_opportunity_contract"
  | "encounter_not_ready"
  | "host_choice_not_executable"
  | "process_evidence_is_not_work_evidence"
  | "formal_evidence_mismatch"
  | "projection_reference_mismatch";

export class SystemSupportDomainError extends Error {
  constructor(
    readonly code: SystemSupportDomainErrorCode,
    readonly details: readonly string[] = [],
  ) {
    super(code);
    this.name = "SystemSupportDomainError";
  }
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/iu;
const MAX_SHORT_TEXT = 240;
const MAX_LONG_TEXT = 4_000;
const OPPORTUNITY_KEYS = new Set([
  "schemaVersion",
  "opportunityId",
  "contractRef",
  "activityKey",
  "beatId",
  "routeKey",
  "manifestationModes",
  "semanticTags",
  "availability",
  "requiresNewHostChoice",
]);

function fail(
  code: SystemSupportDomainErrorCode,
  ...details: string[]
): never {
  throw new SystemSupportDomainError(code, details);
}

function text(value: unknown, field: string, maximum = MAX_SHORT_TEXT) {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    [...value].length > maximum
  ) {
    fail("invalid_source_material", field);
  }
  return value.trim();
}

function domainText(
  value: unknown,
  field: string,
  code: SystemSupportDomainErrorCode,
  maximum = MAX_SHORT_TEXT,
) {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    [...value].length > maximum
  ) {
    fail(code, field);
  }
  return value.trim();
}

function timestamp(
  value: unknown,
  field: string,
  code: SystemSupportDomainErrorCode,
) {
  const normalized = domainText(value, field, code, 80);
  if (Number.isNaN(Date.parse(normalized))) {
    fail(code, field);
  }
  return normalized;
}

function positiveInteger(
  value: unknown,
  field: string,
  code: SystemSupportDomainErrorCode,
) {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    fail(code, field);
  }
  return Number(value);
}

function stringList(
  value: unknown,
  field: string,
  code: SystemSupportDomainErrorCode,
  options: { readonly allowEmpty?: boolean; readonly maximumItems?: number } = {},
) {
  const maximumItems = options.maximumItems ?? 24;
  if (
    !Array.isArray(value) ||
    (!options.allowEmpty && value.length === 0) ||
    value.length > maximumItems
  ) {
    fail(code, field);
  }
  const normalized = value.map((item, index) =>
    domainText(item, `${field}[${index}]`, code, MAX_LONG_TEXT),
  );
  if (new Set(normalized).size !== normalized.length) {
    fail(code, `${field}:duplicate`);
  }
  return normalized;
}

function freezeDeep<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) {
      freezeDeep((value as Record<PropertyKey, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function contains<T>(values: readonly T[], value: unknown): value is T {
  return values.includes(value as T);
}

function sameStringList(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length && left.every((value, index) => value === right[index])
  );
}

function assertSharedIdentity(
  source: SystemSourceMaterial,
  directive: SubsystemDirective,
) {
  if (
    directive.ownerPrincipalId !== source.ownerPrincipalId ||
    directive.storyId !== source.storyId ||
    directive.sourceMaterialId !== source.sourceMaterialId
  ) {
    fail("invalid_subsystem_directive", "source_reference_mismatch");
  }
}

export function registerSystemSourceMaterial(
  input: SystemSourceMaterial,
): SystemSourceMaterial {
  if (input.schemaVersion !== 1 || !contains(SYSTEM_SOURCE_RIGHTS, input.rights)) {
    fail("invalid_source_material", "schema_or_rights");
  }
  const sourceDigest = domainText(
    input.sourceDigest,
    "sourceDigest",
    "invalid_source_material",
    64,
  ).toLowerCase();
  if (!SHA256_PATTERN.test(sourceDigest)) {
    fail("invalid_source_material", "sourceDigest");
  }
  return freezeDeep({
    schemaVersion: 1,
    sourceMaterialId: text(input.sourceMaterialId, "sourceMaterialId"),
    ownerPrincipalId: text(input.ownerPrincipalId, "ownerPrincipalId"),
    storyId: text(input.storyId, "storyId"),
    title: text(input.title, "title"),
    sourceRef: text(input.sourceRef, "sourceRef", MAX_LONG_TEXT),
    sourceDigest,
    rights: input.rights,
    registeredAt: timestamp(
      input.registeredAt,
      "registeredAt",
      "invalid_source_material",
    ),
  });
}

export function issueSubsystemDirective(
  source: SystemSourceMaterial,
  input: SubsystemDirective,
): SubsystemDirective {
  if (input.schemaVersion !== 1) {
    fail("invalid_subsystem_directive", "schemaVersion");
  }
  assertSharedIdentity(source, input);
  if (
    !contains(FORMAL_WORK_EVIDENCE_KINDS, input.expectedEvidenceKind) ||
    !["low", "medium", "high"].includes(input.confidence)
  ) {
    fail("invalid_subsystem_directive", "evidence_or_confidence");
  }
  if (
    !Array.isArray(input.suggestedManifestationModes) ||
    input.suggestedManifestationModes.length === 0 ||
    input.suggestedManifestationModes.some(
      (mode) => !contains(ENCOUNTER_MANIFESTATION_MODES, mode),
    )
  ) {
    fail("invalid_subsystem_directive", "suggestedManifestationModes");
  }
  return freezeDeep({
    schemaVersion: 1,
    directiveId: domainText(
      input.directiveId,
      "directiveId",
      "invalid_subsystem_directive",
    ),
    ownerPrincipalId: source.ownerPrincipalId,
    storyId: source.storyId,
    sourceMaterialId: source.sourceMaterialId,
    observationRefs: stringList(
      input.observationRefs,
      "observationRefs",
      "invalid_subsystem_directive",
    ),
    whyNow: domainText(
      input.whyNow,
      "whyNow",
      "invalid_subsystem_directive",
      MAX_LONG_TEXT,
    ),
    objective: domainText(
      input.objective,
      "objective",
      "invalid_subsystem_directive",
      MAX_LONG_TEXT,
    ),
    hardConstraints: stringList(
      input.hardConstraints,
      "hardConstraints",
      "invalid_subsystem_directive",
      { allowEmpty: true },
    ),
    minimumDeliverable: domainText(
      input.minimumDeliverable,
      "minimumDeliverable",
      "invalid_subsystem_directive",
      MAX_LONG_TEXT,
    ),
    acceptanceCriteria: stringList(
      input.acceptanceCriteria,
      "acceptanceCriteria",
      "invalid_subsystem_directive",
    ),
    expectedEvidenceKind: input.expectedEvidenceKind,
    suggestedManifestationModes: [...new Set(input.suggestedManifestationModes)],
    opportunityTags: stringList(
      input.opportunityTags,
      "opportunityTags",
      "invalid_subsystem_directive",
    ),
    confidence: input.confidence,
    issuedAt: timestamp(
      input.issuedAt,
      "issuedAt",
      "invalid_subsystem_directive",
    ),
  });
}

function addDraftIssue(
  issues: HostTaskDraftIssue[],
  code: HostTaskDraftIssue["code"],
  field: string,
) {
  issues.push({ code, field });
}

function draftTextMissing(value: unknown) {
  return typeof value !== "string" || value.trim().length === 0;
}

export function validateHostTaskDraft(
  source: SystemSourceMaterial,
  directive: SubsystemDirective,
  draft: HostTaskDraft,
): HostTaskDraftValidation {
  const issues: HostTaskDraftIssue[] = [];
  if (
    draft.schemaVersion !== 1 ||
    draft.directiveId !== directive.directiveId ||
    draft.ownerPrincipalId !== directive.ownerPrincipalId ||
    draft.storyId !== directive.storyId ||
    draft.sourceMaterialId !== directive.sourceMaterialId ||
    directive.sourceMaterialId !== source.sourceMaterialId
  ) {
    addDraftIssue(issues, "reference_mismatch", "references");
  }
  if (draftTextMissing(draft.userFacingMessage)) {
    addDraftIssue(issues, "missing_user_message", "userFacingMessage");
  }
  if (draftTextMissing(draft.whyNow)) {
    addDraftIssue(issues, "missing_why_now", "whyNow");
  }
  if (draftTextMissing(draft.objective)) {
    addDraftIssue(issues, "missing_objective", "objective");
  }
  if (!Array.isArray(draft.hardConstraints) || !sameStringList(draft.hardConstraints, directive.hardConstraints)) {
    addDraftIssue(issues, "hard_constraint_mismatch", "hardConstraints");
  }
  if (draftTextMissing(draft.minimumDeliverable)) {
    addDraftIssue(issues, "missing_deliverable", "minimumDeliverable");
  }
  if (
    !Array.isArray(draft.acceptanceCriteria) ||
    draft.acceptanceCriteria.length === 0 ||
    draft.acceptanceCriteria.some(draftTextMissing)
  ) {
    addDraftIssue(
      issues,
      "missing_acceptance_criteria",
      "acceptanceCriteria",
    );
  }
  if (
    !Array.isArray(draft.opportunityTags) ||
    draft.opportunityTags.length === 0 ||
    draft.opportunityTags.some(draftTextMissing)
  ) {
    addDraftIssue(issues, "missing_opportunity_tags", "opportunityTags");
  }
  if (!contains(SYSTEM_SOURCE_USE_MODES, draft.sourceUseMode)) {
    addDraftIssue(issues, "unsupported_source_use_mode", "sourceUseMode");
  }
  if (!contains(ENCOUNTER_MANIFESTATION_MODES, draft.manifestationMode)) {
    addDraftIssue(
      issues,
      "unsupported_manifestation_mode",
      "manifestationMode",
    );
  }
  if (!contains(FORMAL_WORK_EVIDENCE_KINDS, draft.expectedEvidenceKind)) {
    addDraftIssue(
      issues,
      "unsupported_evidence_kind",
      "expectedEvidenceKind",
    );
  }
  if (
    draft.sourceUseMode === "continue_authorized_source" &&
    source.rights !== "owned_or_authorized" &&
    source.rights !== "public_domain"
  ) {
    addDraftIssue(
      issues,
      "source_rights_do_not_allow_continuation",
      "sourceUseMode",
    );
  }
  return freezeDeep({ canPublish: issues.length === 0, issues: [...issues] });
}

export function publishHostTask(input: {
  readonly actor: "main_system" | "subsystem";
  readonly source: SystemSourceMaterial;
  readonly directive: SubsystemDirective;
  readonly draft: HostTaskDraft;
  readonly taskId: string;
  readonly publishedAt: string;
}): PublishedHostTask {
  if (input.actor !== "main_system") {
    fail("unauthorized_task_publisher", input.actor);
  }
  const validation = validateHostTaskDraft(
    input.source,
    input.directive,
    input.draft,
  );
  if (!validation.canPublish) {
    fail(
      "draft_not_publishable",
      ...validation.issues.map((issue) => `${issue.code}:${issue.field}`),
    );
  }
  const draft = input.draft;
  return freezeDeep({
    schemaVersion: 1,
    taskId: domainText(
      input.taskId,
      "taskId",
      "draft_not_publishable",
    ),
    directiveId: draft.directiveId,
    draftId: domainText(
      draft.draftId,
      "draftId",
      "draft_not_publishable",
    ),
    draftVersion: positiveInteger(
      draft.version,
      "draft.version",
      "draft_not_publishable",
    ),
    ownerPrincipalId: draft.ownerPrincipalId,
    storyId: draft.storyId,
    sourceMaterialId: draft.sourceMaterialId,
    userFacingMessage: domainText(
      draft.userFacingMessage,
      "userFacingMessage",
      "draft_not_publishable",
      MAX_LONG_TEXT,
    ),
    whyNow: domainText(
      draft.whyNow,
      "whyNow",
      "draft_not_publishable",
      MAX_LONG_TEXT,
    ),
    objective: domainText(
      draft.objective,
      "objective",
      "draft_not_publishable",
      MAX_LONG_TEXT,
    ),
    hardConstraints: [...draft.hardConstraints],
    minimumDeliverable: domainText(
      draft.minimumDeliverable,
      "minimumDeliverable",
      "draft_not_publishable",
      MAX_LONG_TEXT,
    ),
    acceptanceCriteria: [...draft.acceptanceCriteria],
    expectedEvidenceKind: draft.expectedEvidenceKind,
    sourceUseMode: draft.sourceUseMode,
    manifestationMode: draft.manifestationMode,
    opportunityTags: [...draft.opportunityTags],
    status: "published",
    publishedBy: "main_system",
    publishedAt: timestamp(
      input.publishedAt,
      "publishedAt",
      "draft_not_publishable",
    ),
  });
}

export function recordHostTaskChoice(
  task: PublishedHostTask,
  input: HostTaskChoice,
): HostTaskChoice {
  if (
    input.schemaVersion !== 1 ||
    input.actor !== "novelist" ||
    input.taskId !== task.taskId ||
    !["accepted", "narrowed", "deferred", "rejected"].includes(input.decision) ||
    !["existing_plan_only", "allow_registered_nudge"].includes(
      input.lifeInterventionConsent,
    )
  ) {
    fail("invalid_host_choice", "identity_or_decision");
  }
  const narrowedObjective =
    input.narrowedObjective === null
      ? null
      : domainText(
          input.narrowedObjective,
          "narrowedObjective",
          "invalid_host_choice",
          MAX_LONG_TEXT,
        );
  if (
    (input.decision === "narrowed" && narrowedObjective === null) ||
    (input.decision !== "narrowed" && narrowedObjective !== null)
  ) {
    fail("invalid_host_choice", "narrowedObjective");
  }
  return freezeDeep({
    schemaVersion: 1,
    choiceId: domainText(
      input.choiceId,
      "choiceId",
      "invalid_host_choice",
    ),
    taskId: task.taskId,
    actor: "novelist",
    decision: input.decision,
    reason:
      input.reason === null
        ? null
        : domainText(
            input.reason,
            "reason",
            "invalid_host_choice",
            MAX_LONG_TEXT,
          ),
    narrowedObjective,
    lifeInterventionConsent: input.lifeInterventionConsent,
    chosenAt: timestamp(
      input.chosenAt,
      "chosenAt",
      "invalid_host_choice",
    ),
  });
}

function validateOpportunity(
  input: RegisteredLifeOpportunity,
): RegisteredLifeOpportunity {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !OPPORTUNITY_KEYS.has(key))
  ) {
    fail("invalid_opportunity_contract", "unknown_or_geometry_field");
  }
  if (
    input.schemaVersion !== 1 ||
    !["available", "planned_later", "inactive"].includes(input.availability) ||
    typeof input.requiresNewHostChoice !== "boolean" ||
    !Array.isArray(input.manifestationModes) ||
    input.manifestationModes.length === 0 ||
    input.manifestationModes.some(
      (mode) => !contains(ENCOUNTER_MANIFESTATION_MODES, mode),
    )
  ) {
    fail("invalid_opportunity_contract", "shape");
  }
  const routeKey =
    input.routeKey === null
      ? null
      : domainText(
          input.routeKey,
          "routeKey",
          "invalid_opportunity_contract",
        );
  return freezeDeep({
    schemaVersion: 1,
    opportunityId: domainText(
      input.opportunityId,
      "opportunityId",
      "invalid_opportunity_contract",
    ),
    contractRef: domainText(
      input.contractRef,
      "contractRef",
      "invalid_opportunity_contract",
      MAX_LONG_TEXT,
    ),
    activityKey: domainText(
      input.activityKey,
      "activityKey",
      "invalid_opportunity_contract",
    ),
    beatId: domainText(
      input.beatId,
      "beatId",
      "invalid_opportunity_contract",
    ),
    routeKey,
    manifestationModes: [...new Set(input.manifestationModes)],
    semanticTags: stringList(
      input.semanticTags,
      "semanticTags",
      "invalid_opportunity_contract",
    ),
    availability: input.availability,
    requiresNewHostChoice: input.requiresNewHostChoice,
  });
}

function opportunityRef(
  opportunity: RegisteredLifeOpportunity,
): EncounterOpportunityRef {
  return {
    opportunityId: opportunity.opportunityId,
    contractRef: opportunity.contractRef,
    activityKey: opportunity.activityKey,
    beatId: opportunity.beatId,
    routeKey: opportunity.routeKey,
  };
}

function plan(
  input: {
    readonly planId: string;
    readonly task: PublishedHostTask;
    readonly compiledAt: string;
  },
  status: EncounterPlanStatus,
  reason: EncounterPlanReason,
  opportunity: RegisteredLifeOpportunity | null,
): EncounterPlan {
  return freezeDeep({
    schemaVersion: 1,
    planId: domainText(
      input.planId,
      "planId",
      "invalid_opportunity_contract",
    ),
    taskId: input.task.taskId,
    sourceMaterialId: input.task.sourceMaterialId,
    status,
    reason,
    opportunity: opportunity === null ? null : opportunityRef(opportunity),
    compiledAt: timestamp(
      input.compiledAt,
      "compiledAt",
      "invalid_opportunity_contract",
    ),
  });
}

function tagsOverlap(left: readonly string[], right: readonly string[]) {
  const normalized = new Set(left.map((value) => value.trim().toLowerCase()));
  return right.some((value) => normalized.has(value.trim().toLowerCase()));
}

export function compileEncounter(input: {
  readonly planId: string;
  readonly task: PublishedHostTask;
  readonly choice: HostTaskChoice | null;
  readonly opportunities: readonly RegisteredLifeOpportunity[];
  readonly compiledAt: string;
}): EncounterPlan {
  if (!Array.isArray(input.opportunities) || input.opportunities.length > 200) {
    fail("invalid_opportunity_contract", "opportunities");
  }
  const opportunities = input.opportunities.map(validateOpportunity);
  if (input.choice === null) {
    return plan(input, "needs_host_choice", "task_choice_missing", null);
  }
  const choice = recordHostTaskChoice(input.task, input.choice);
  if (choice.decision === "rejected") {
    return plan(input, "cancelled", "host_rejected", null);
  }
  if (choice.decision === "deferred") {
    return plan(input, "waiting", "host_deferred", null);
  }
  const matching = opportunities
    .filter(
      (opportunity) =>
        opportunity.manifestationModes.includes(input.task.manifestationMode) &&
        tagsOverlap(input.task.opportunityTags, opportunity.semanticTags),
    )
    .sort((left, right) => left.opportunityId.localeCompare(right.opportunityId));

  const ready = matching.find(
    (opportunity) =>
      opportunity.availability === "available" &&
      (!opportunity.requiresNewHostChoice ||
        choice.lifeInterventionConsent === "allow_registered_nudge"),
  );
  if (ready !== undefined) {
    return plan(
      input,
      "ready",
      ready.requiresNewHostChoice
        ? "ready_with_registered_nudge"
        : "ready_on_existing_plan",
      ready,
    );
  }
  const needsChoice = matching.find(
    (opportunity) =>
      opportunity.availability === "available" &&
      opportunity.requiresNewHostChoice,
  );
  if (needsChoice !== undefined) {
    return plan(
      input,
      "needs_host_choice",
      "additional_host_choice_required",
      needsChoice,
    );
  }
  const waiting = matching.find(
    (opportunity) => opportunity.availability === "planned_later",
  );
  if (waiting !== undefined) {
    return plan(
      input,
      "waiting",
      "waiting_for_registered_opportunity",
      waiting,
    );
  }
  return plan(input, "no_legal_path", "no_registered_opportunity", null);
}

export function recordEncounterManifestation(input: {
  readonly eventId: string;
  readonly plan: EncounterPlan;
  readonly result: EncounterManifestationEvent["result"];
  readonly occurredAt: string;
}): EncounterManifestationEvent {
  if (input.plan.status !== "ready" || input.plan.opportunity === null) {
    fail("encounter_not_ready", input.plan.status);
  }
  if (!["noticed", "ignored", "misused", "kept"].includes(input.result)) {
    fail("encounter_not_ready", "result");
  }
  return freezeDeep({
    schemaVersion: 1,
    eventId: domainText(
      input.eventId,
      "eventId",
      "encounter_not_ready",
    ),
    planId: input.plan.planId,
    taskId: input.plan.taskId,
    sourceMaterialId: input.plan.sourceMaterialId,
    opportunity: { ...input.plan.opportunity },
    result: input.result,
    occurredAt: timestamp(
      input.occurredAt,
      "occurredAt",
      "encounter_not_ready",
    ),
  });
}

export function recordCreativeAttempt(input: {
  readonly task: PublishedHostTask;
  readonly choice: HostTaskChoice;
  readonly attemptId: string;
  readonly manifestationEventId: string | null;
  readonly activityEventRef: string;
  readonly status: CreativeAttemptRecord["status"];
  readonly startedAt: string;
  readonly endedAt: string | null;
}): CreativeAttemptRecord {
  const choice = recordHostTaskChoice(input.task, input.choice);
  if (choice.decision !== "accepted" && choice.decision !== "narrowed") {
    fail("host_choice_not_executable", choice.decision);
  }
  if (!["started", "completed", "interrupted"].includes(input.status)) {
    fail("host_choice_not_executable", "attempt_status");
  }
  if (input.status === "started" && input.endedAt !== null) {
    fail("host_choice_not_executable", "started_attempt_has_end");
  }
  if (input.status !== "started" && input.endedAt === null) {
    fail("host_choice_not_executable", "finished_attempt_missing_end");
  }
  return freezeDeep({
    schemaVersion: 1,
    attemptId: domainText(
      input.attemptId,
      "attemptId",
      "host_choice_not_executable",
    ),
    taskId: input.task.taskId,
    manifestationEventId:
      input.manifestationEventId === null
        ? null
        : domainText(
            input.manifestationEventId,
            "manifestationEventId",
            "host_choice_not_executable",
          ),
    activityEventRef: domainText(
      input.activityEventRef,
      "activityEventRef",
      "host_choice_not_executable",
      MAX_LONG_TEXT,
    ),
    status: input.status,
    startedAt: timestamp(
      input.startedAt,
      "startedAt",
      "host_choice_not_executable",
    ),
    endedAt:
      input.endedAt === null
        ? null
        : timestamp(
            input.endedAt,
            "endedAt",
            "host_choice_not_executable",
          ),
  });
}

function evidenceSatisfies(
  expected: FormalWorkEvidenceKind,
  actual: FormalWorkEvidenceKind,
) {
  const accepted: Readonly<Record<FormalWorkEvidenceKind, readonly FormalWorkEvidenceKind[]>> = {
    chapter_draft: ["chapter_draft", "chapter_revision", "accepted_chapter"],
    chapter_revision: ["chapter_revision", "accepted_chapter"],
    accepted_chapter: ["accepted_chapter"],
    reader_review: ["reader_review"],
  };
  return accepted[expected].includes(actual);
}

export function recordFormalWorkEvidence(
  task: PublishedHostTask,
  input: SystemSupportEvidence,
): FormalWorkEvidence {
  if (
    contains(PROCESS_ONLY_EVIDENCE_KINDS, input.kind) ||
    input.source !== "creative_runtime"
  ) {
    fail("process_evidence_is_not_work_evidence", input.kind);
  }
  const evidence = input as FormalWorkEvidence;
  if (
    evidence.schemaVersion !== 1 ||
    evidence.taskId !== task.taskId ||
    !contains(FORMAL_WORK_EVIDENCE_KINDS, evidence.kind) ||
    !evidenceSatisfies(task.expectedEvidenceKind, evidence.kind) ||
    !["submitted", "revision_requested", "accepted"].includes(
      evidence.verdict,
    )
  ) {
    fail("formal_evidence_mismatch", "shape_or_task");
  }
  return freezeDeep({
    schemaVersion: 1,
    evidenceId: domainText(
      evidence.evidenceId,
      "evidenceId",
      "formal_evidence_mismatch",
    ),
    taskId: task.taskId,
    kind: evidence.kind,
    source: "creative_runtime",
    artifactRef: domainText(
      evidence.artifactRef,
      "artifactRef",
      "formal_evidence_mismatch",
      MAX_LONG_TEXT,
    ),
    artifactVersion: positiveInteger(
      evidence.artifactVersion,
      "artifactVersion",
      "formal_evidence_mismatch",
    ),
    lineageRefs: stringList(
      evidence.lineageRefs,
      "lineageRefs",
      "formal_evidence_mismatch",
      { allowEmpty: true },
    ),
    verdict: evidence.verdict,
    recordedAt: timestamp(
      evidence.recordedAt,
      "recordedAt",
      "formal_evidence_mismatch",
    ),
  });
}

function assertProjectionRefs(input: {
  readonly task: PublishedHostTask;
  readonly choice: HostTaskChoice | null;
  readonly encounterPlan: EncounterPlan;
  readonly manifestation: EncounterManifestationEvent | null;
  readonly attempt: CreativeAttemptRecord | null;
  readonly evidence: FormalWorkEvidence | null;
}) {
  const { task, choice, encounterPlan, manifestation, attempt, evidence } = input;
  if (
    encounterPlan.taskId !== task.taskId ||
    encounterPlan.sourceMaterialId !== task.sourceMaterialId ||
    (choice !== null && choice.taskId !== task.taskId) ||
    (manifestation !== null &&
      (manifestation.planId !== encounterPlan.planId ||
        manifestation.taskId !== task.taskId ||
        manifestation.sourceMaterialId !== task.sourceMaterialId)) ||
    (attempt !== null && attempt.taskId !== task.taskId) ||
    (attempt?.manifestationEventId !== null &&
      attempt?.manifestationEventId !== undefined &&
      attempt.manifestationEventId !== manifestation?.eventId) ||
    (evidence !== null && evidence.taskId !== task.taskId)
  ) {
    fail("projection_reference_mismatch");
  }
}

function dayOutcome(input: {
  readonly choice: HostTaskChoice | null;
  readonly encounterPlan: EncounterPlan;
  readonly manifestation: EncounterManifestationEvent | null;
  readonly attempt: CreativeAttemptRecord | null;
  readonly evidence: FormalWorkEvidence | null;
}): readonly [NextDaySystemOutcome, NextSuggestionGuard] {
  if (input.choice === null) {
    return ["awaiting_host_choice", "ask_before_life_intervention"];
  }
  if (input.choice.decision === "rejected") {
    return ["host_rejected", "do_not_repeat_unchanged"];
  }
  if (input.choice.decision === "deferred") {
    return ["host_deferred", "wait_until_deferred_window"];
  }
  if (input.evidence?.verdict === "accepted") {
    return ["evidence_accepted", "may_build_on_evidence"];
  }
  if (input.evidence?.verdict === "revision_requested") {
    return ["revision_requested", "observe_before_suggesting"];
  }
  if (input.evidence !== null) {
    return ["evidence_submitted", "observe_before_suggesting"];
  }
  if (input.attempt !== null) {
    return ["attempted_without_evidence", "observe_before_suggesting"];
  }
  if (input.manifestation !== null) {
    return ["source_encountered", "observe_before_suggesting"];
  }
  if (input.encounterPlan.status === "ready") {
    return ["awaiting_manifestation", "observe_before_suggesting"];
  }
  if (input.encounterPlan.status === "needs_host_choice") {
    return ["awaiting_host_choice", "ask_before_life_intervention"];
  }
  return ["awaiting_legal_opportunity", "do_not_fabricate_route"];
}

const TITLE_BY_OUTCOME: Readonly<Record<NextDaySystemOutcome, string>> = {
  host_rejected: "宿主没有接下这项任务",
  host_deferred: "任务被留到了以后",
  awaiting_host_choice: "系统还欠宿主一次明确询问",
  awaiting_legal_opportunity: "素材仍在等待合法入场",
  awaiting_manifestation: "奇遇已经排好，但尚未发生",
  source_encountered: "素材与宿主发生了接触",
  attempted_without_evidence: "宿主尝试过，作品证据尚未回来",
  evidence_submitted: "作品已经提交，等待验收",
  revision_requested: "作品留下了返修要求",
  evidence_accepted: "这次扶持终于留下了正式作品",
};

export function projectSystemSupportDayClose(input: {
  readonly memoryId: string;
  readonly chronicleId: string;
  readonly generatedAt: string;
  readonly task: PublishedHostTask;
  readonly choice: HostTaskChoice | null;
  readonly encounterPlan: EncounterPlan;
  readonly manifestation: EncounterManifestationEvent | null;
  readonly attempt: CreativeAttemptRecord | null;
  readonly evidence: FormalWorkEvidence | null;
}): SystemSupportDayCloseProjection {
  assertProjectionRefs(input);
  const generatedAt = timestamp(
    input.generatedAt,
    "generatedAt",
    "projection_reference_mismatch",
  );
  const [outcome, nextSuggestionGuard] = dayOutcome(input);
  const unresolvedRefs = [
    ...(outcome === "awaiting_host_choice" ||
    outcome === "awaiting_legal_opportunity" ||
    outcome === "awaiting_manifestation"
      ? [input.encounterPlan.planId]
      : []),
    ...(outcome === "attempted_without_evidence" && input.attempt !== null
      ? [input.attempt.attemptId]
      : []),
    ...(outcome === "evidence_submitted" || outcome === "revision_requested"
      ? [input.evidence!.evidenceId]
      : []),
  ];
  const facts: CompanionChronicleFact[] = [
    {
      kind: "task_published",
      sourceRef: input.task.taskId,
      summary: "主系统发布了一项经过编辑的宿主任务。",
    },
  ];
  if (input.choice !== null) {
    facts.push({
      kind: "host_choice",
      sourceRef: input.choice.choiceId,
      summary: `小说家的明确选择是 ${input.choice.decision}。`,
    });
  }
  facts.push({
    kind: "encounter_plan",
    sourceRef: input.encounterPlan.planId,
    summary: `奇遇编译结果为 ${input.encounterPlan.status}，原因 ${input.encounterPlan.reason}。`,
  });
  if (input.manifestation !== null) {
    facts.push({
      kind: "manifestation",
      sourceRef: input.manifestation.eventId,
      summary: `素材显现后，小说家的实际反应是 ${input.manifestation.result}。`,
    });
  }
  if (input.attempt !== null) {
    facts.push({
      kind: "creative_attempt",
      sourceRef: input.attempt.attemptId,
      summary: `本次创作尝试状态为 ${input.attempt.status}。`,
    });
  }
  if (input.evidence !== null) {
    facts.push({
      kind: "formal_evidence",
      sourceRef: input.evidence.evidenceId,
      summary: `正式作品证据状态为 ${input.evidence.verdict}。`,
    });
  }
  const sourceEventRefs = [...new Set(facts.map((fact) => fact.sourceRef))];
  return freezeDeep({
    schemaVersion: 1 as const,
    memory: {
      schemaVersion: 1,
      memoryId: domainText(
        input.memoryId,
        "memoryId",
        "projection_reference_mismatch",
      ),
      ownerPrincipalId: input.task.ownerPrincipalId,
      storyId: input.task.storyId,
      taskId: input.task.taskId,
      taskChoice: input.choice?.decision ?? "missing",
      outcome,
      formalEvidenceRef: input.evidence?.artifactRef ?? null,
      unresolvedRefs,
      nextSuggestionGuard,
      generatedAt,
    },
    chronicle: {
      schemaVersion: 1,
      chronicleId: domainText(
        input.chronicleId,
        "chronicleId",
        "projection_reference_mismatch",
      ),
      ownerPrincipalId: input.task.ownerPrincipalId,
      storyId: input.task.storyId,
      taskId: input.task.taskId,
      titleHint: TITLE_BY_OUTCOME[outcome],
      facts,
      sourceEventRefs,
      workEvidenceEligible: false,
      generatedAt,
    },
  });
}

export type { ProcessOnlyEvidence };
