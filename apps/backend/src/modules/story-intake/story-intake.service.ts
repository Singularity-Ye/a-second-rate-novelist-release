import type {
  StoryProposalCapabilityTruthView,
  StoryIntakeSessionRequest,
  StoryIntakeSessionResponse,
  StoryProposalAcceptRequest,
  StoryProposalAcceptResponse,
  StoryProposalGenerateRequest,
  StoryProposalGenerateResponse,
  StoryProposalView,
} from "@erliu/shared-contracts";
import { buildRuntimeTaskArtifactRef } from "@erliu/shared-contracts";
import { createAccountRepository } from "../../common/repositories/account.repository.js";
import { createChapterRuntimeRepository } from "../../common/repositories/chapter-runtime.repository.js";
import { createStoryWorkspaceRepository } from "../../common/repositories/story-workspace.repository.js";
import {
  toGenreBriefArtifact,
  toGenreBriefObjectKey,
  toCanonSeedArtifact,
  toCanonSeedObjectKey,
  toCommissionBriefArtifact,
  toCommissionBriefObjectKey,
  toOutlineBundleArtifact,
  toOutlineBundleObjectKey,
  toProposalSetArtifact,
  toProposalSetObjectKey,
  toSelectedProposalArtifact,
  toSelectedProposalObjectKey,
} from "../../common/truth-source/creative-artifact.contract.js";
import { scheduleCreativeArtifactObjectStorageShadowUpload } from "../../common/truth-source/creative-artifact-object-storage-shadow-mirror.js";
import { scheduleStoryIntakePostgresShadowMirror } from "../../common/truth-source/story-intake-postgres-shadow-mirror.js";
import { upsertShadowAccount } from "../identity/shadow-account-registry.js";
import { recordDomainEvent } from "../telemetry-intake/telemetry-intake.service.js";
import { bootstrapCanonSeedForWorkspace } from "../canon-service/canon-service.service.js";
import {
  generateStoryProposalsViaAiRuntime,
  type StoryProposalAiRuntimeOverrides,
} from "../ai-runtime/story-proposal-runtime.service.js";
import { recordAiRuntimeObservation } from "../ai-runtime/ai-runtime-observability.service.js";
import {
  assertAccountAiBudgetAvailable,
  assertStorySlotAvailable,
  recordAccountCapabilitySpend,
} from "../identity-membership/account-control-plane.service.js";
import { evaluatePolicyVerdict } from "../governance-compliance/policy-engine.service.js";
import { queueChapterGenerationTask } from "../runtime-tasks/runtime-tasks.service.js";

function resolveH5BaseUrl() {
  return process.env.H5_BASE_URL ?? "http://127.0.0.1:3000";
}

async function emitEvent(
  event_name: string,
  account_id: string,
  payload: Record<string, string | number | boolean | null>,
) {
  await recordDomainEvent({
    event_name,
    account_id,
    payload,
  });
}

async function findAccountByToken(account_token: string) {
  const account = await createAccountRepository().findAccountByToken(account_token);

  if (!account) {
    throw new Error(`Account not found for token ${account_token}`);
  }

  return account;
}

function toProposalGenerationIdempotencyKey(session_id: string, client_request_id: string) {
  return `proposal_generate:${session_id}:${client_request_id}`;
}

function mergeArtifactRefs<T extends { artifact_type: string; object_key: string }>(existing: T[], next: T[]) {
  const seen = new Set(existing.map((item) => `${item.artifact_type}:${item.object_key}`));
  const merged = [...existing];

  for (const item of next) {
    const key = `${item.artifact_type}:${item.object_key}`;

    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }

  return merged;
}

function resolveSeedTextFromPayload(brief_payload: Record<string, unknown>) {
  return typeof brief_payload.seed_text === "string" ? brief_payload.seed_text.trim() : "";
}

function detectGenreLane(seedText: string, intake_mode: string) {
  if (
    intake_mode === "repair_line" ||
    /修复|续写|意难平|同人|倒带|重写命运|补番外/.test(seedText)
  ) {
    return "意难平修复 / 同人转译";
  }

  if (/升级|逆袭|打脸|系统|修仙|宗门|爽/.test(seedText)) {
    return "男频升级爽文";
  }

  return "女频关系驱动";
}

function detectTargetReaderSegment(genreLane: string) {
  if (genreLane === "男频升级爽文") {
    return "想看压制破局、持续升级与阶段性战果的追更读者";
  }

  if (genreLane === "意难平修复 / 同人转译") {
    return "想看命运重开、迟到回应与关系修复的追更读者";
  }

  return "想看慢热拉扯与旧债重逢的追更读者";
}

function detectCorePromise(genreLane: string) {
  if (genreLane === "男频升级爽文") {
    return "压制、破局与更大门槛会一层层升级。";
  }

  if (genreLane === "意难平修复 / 同人转译") {
    return "命运岔路与迟到回应会把修复代价越推越深。";
  }

  return "重逢后的试探与站队会一章章升级。";
}

function detectTropeFamily(seedText: string, genreLane: string) {
  const inferred = [
    /重逢/.test(seedText) ? "重逢" : null,
    /暧昧|拉扯|慢热/.test(seedText) ? "慢热拉扯" : null,
    /修复|意难平|续写/.test(seedText) ? "命运修复" : null,
    /升级|逆袭|打脸/.test(seedText) ? "升级破局" : null,
  ].filter((item): item is string => Boolean(item));

  if (inferred.length > 0) {
    return inferred;
  }

  if (genreLane === "男频升级爽文") {
    return ["压制破局", "阶段性战果"];
  }

  if (genreLane === "意难平修复 / 同人转译") {
    return ["命运岔路", "迟到回应"];
  }

  return ["重逢", "慢热拉扯"];
}

function detectFrontTenChapterPromise(genreLane: string) {
  if (genreLane === "男频升级爽文") {
    return "前十章先把压制、第一战果与更大门槛钉住。";
  }

  if (genreLane === "意难平修复 / 同人转译") {
    return "前十章先把命运岔路、迟到回应与修复代价钉住。";
  }

  return "前十章先把试探、站队与旧债钉住。";
}

function detectRelationshipPromise(genreLane: string) {
  if (genreLane === "男频升级爽文") {
    return "每三章至少推进一次主角位置变化与对手压迫升级。";
  }

  if (genreLane === "意难平修复 / 同人转译") {
    return "每三章至少推进一次修复尝试与新的情绪代价。";
  }

  return "每三章至少推进一次信任与风险站队。";
}

function detectRiskFlags(genreLane: string) {
  if (genreLane === "男频升级爽文") {
    return ["避免世界观 dump", "避免前两章爽点兑现过空"];
  }

  if (genreLane === "意难平修复 / 同人转译") {
    return ["避免只修复不引入新代价"];
  }

  return ["避免过早确认关系"];
}

function buildGenreBriefForSession(input: {
  session_id: string;
  intake_mode: string;
  brief_payload: Record<string, unknown>;
  story_id?: string | null;
  created_at?: string;
}) {
  const seedText = resolveSeedTextFromPayload(input.brief_payload) || "想开一本新书";
  const genreLane = detectGenreLane(seedText, input.intake_mode);

  return toGenreBriefArtifact({
    session_id: input.session_id,
    story_id: input.story_id ?? null,
    target_reader_segment: detectTargetReaderSegment(genreLane),
    genre_lane: genreLane,
    core_promise: detectCorePromise(genreLane),
    core_trope_family: detectTropeFamily(seedText, genreLane),
    front_ten_chapter_promise: detectFrontTenChapterPromise(genreLane),
    relationship_promise: detectRelationshipPromise(genreLane),
    risk_flags: detectRiskFlags(genreLane),
    ...(input.created_at ? { created_at: input.created_at } : {}),
  });
}

function readStringFromProposalPayload(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readStringListFromProposalPayload(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function readRuntimeContextFromProposalPayload(payload: Record<string, unknown>) {
  const runtimeContext = payload.runtime_context;

  if (!runtimeContext || typeof runtimeContext !== "object" || Array.isArray(runtimeContext)) {
    return null;
  }

  return runtimeContext as Record<string, unknown>;
}

function toCapabilityTruthState(input: {
  strategy?: unknown;
  fallback_applied?: unknown;
  provider_id?: unknown;
  model_id?: unknown;
  trace_present?: boolean;
}) {
  const strategy = typeof input.strategy === "string" ? input.strategy : null;
  const fallbackApplied = input.fallback_applied === true;
  const providerId = typeof input.provider_id === "string" ? input.provider_id : null;
  const modelId = typeof input.model_id === "string" ? input.model_id : null;

  if (!input.trace_present && strategy === "rules_first" && !providerId && !modelId) {
    return "simulation_fallback" as const;
  }

  if (fallbackApplied) {
    return "runtime_degraded" as const;
  }

  return "runtime_backed" as const;
}

function buildCapabilityTruthFromExecution(input: {
  execution: {
    requested_tier: string;
    selected_tier: string;
    fallback_applied: boolean;
    provider_id: string | null;
    model_id: string | null;
    attempted_tiers: string[];
    strategy: string;
  };
  trace_present: boolean;
}): StoryProposalCapabilityTruthView {
  return {
    state: toCapabilityTruthState({
      strategy: input.execution.strategy,
      fallback_applied: input.execution.fallback_applied,
      provider_id: input.execution.provider_id,
      model_id: input.execution.model_id,
      trace_present: input.trace_present,
    }),
    requested_tier: input.execution.requested_tier,
    selected_tier: input.execution.selected_tier,
    fallback_applied: input.execution.fallback_applied,
    provider_id: input.execution.provider_id,
    model_id: input.execution.model_id,
    attempted_tiers: input.execution.attempted_tiers,
  };
}

function buildCapabilityTruthFromStoredProposal(proposal: Pick<StoryProposalView, "payload">) {
  const runtimeContext = readRuntimeContextFromProposalPayload(proposal.payload);

  if (!runtimeContext) {
    return null;
  }

  const requestedTier = typeof runtimeContext.requested_tier === "string" ? runtimeContext.requested_tier : null;
  const selectedTier = typeof runtimeContext.selected_tier === "string" ? runtimeContext.selected_tier : null;
  const attemptedTiers = Array.isArray(runtimeContext.attempted_tiers)
    ? runtimeContext.attempted_tiers.filter((item): item is string => typeof item === "string")
    : [];

  if (!requestedTier || !selectedTier || attemptedTiers.length === 0) {
    return null;
  }

  return {
    state: toCapabilityTruthState({
      strategy: runtimeContext.strategy,
      fallback_applied: runtimeContext.fallback_applied,
      provider_id: runtimeContext.provider_id,
      model_id: runtimeContext.model_id,
      trace_present: typeof runtimeContext.base_url === "string" || typeof runtimeContext.message_id === "string",
    }),
    requested_tier: requestedTier,
    selected_tier: selectedTier,
    fallback_applied: runtimeContext.fallback_applied === true,
    provider_id: typeof runtimeContext.provider_id === "string" ? runtimeContext.provider_id : null,
    model_id: typeof runtimeContext.model_id === "string" ? runtimeContext.model_id : null,
    attempted_tiers: attemptedTiers,
  } satisfies StoryProposalCapabilityTruthView;
}

function resolveGenreBriefFromProposal(input: {
  session_id: string;
  intake_mode: string;
  brief_payload: Record<string, unknown>;
  proposal_payload: Record<string, unknown>;
  story_id?: string | null;
}) {
  const fallback = buildGenreBriefForSession({
    session_id: input.session_id,
    intake_mode: input.intake_mode,
    brief_payload: input.brief_payload,
    story_id: input.story_id ?? null,
  });

  return toGenreBriefArtifact({
    session_id: input.session_id,
    story_id: input.story_id ?? null,
    target_reader_segment:
      readStringFromProposalPayload(input.proposal_payload, "target_reader_segment") ??
      fallback.target_reader_segment,
    genre_lane: readStringFromProposalPayload(input.proposal_payload, "genre_lane") ?? fallback.genre_lane,
    core_promise: readStringFromProposalPayload(input.proposal_payload, "core_promise") ?? fallback.core_promise,
    core_trope_family:
      readStringListFromProposalPayload(input.proposal_payload, "core_trope_family").length > 0
        ? readStringListFromProposalPayload(input.proposal_payload, "core_trope_family")
        : fallback.core_trope_family,
    front_ten_chapter_promise:
      readStringFromProposalPayload(input.proposal_payload, "front_ten_chapter_promise") ??
      fallback.front_ten_chapter_promise,
    relationship_promise:
      readStringFromProposalPayload(input.proposal_payload, "relationship_promise") ??
      fallback.relationship_promise,
    risk_flags:
      readStringListFromProposalPayload(input.proposal_payload, "risk_flags").length > 0
        ? readStringListFromProposalPayload(input.proposal_payload, "risk_flags")
        : fallback.risk_flags,
  });
}

export async function createStoryIntakeSession(
  input: StoryIntakeSessionRequest,
): Promise<StoryIntakeSessionResponse> {
  const account = await findAccountByToken(input.account_token);
  const repository = createStoryWorkspaceRepository();
  const created = await repository.createIntakeSession({
    account_id: account.account_id,
    entry_surface: input.entry_surface,
    intake_mode: input.intake_mode,
    brief_payload: input.brief_payload,
    client_request_id: input.client_request_id,
  });

  await emitEvent("story_intake_started", account.account_id, {
    entry_surface: input.entry_surface,
    intake_mode: input.intake_mode,
  });
  scheduleStoryIntakePostgresShadowMirror({
    account,
    intake_session: created,
  });

  return {
    session_id: created.id,
    status: created.status,
    next_action: "generate_proposals",
  };
}

interface GenerateStoryProposalsServiceOverrides {
  runtime?: StoryProposalAiRuntimeOverrides;
}

export async function generateStoryProposals(
  input: {
    session_id: string;
  } & StoryProposalGenerateRequest,
  overrides: GenerateStoryProposalsServiceOverrides = {},
): Promise<StoryProposalGenerateResponse> {
  const repository = createStoryWorkspaceRepository();
  const runtimeTaskRepository = createChapterRuntimeRepository();
  const session = await repository.findIntakeSessionById(input.session_id);

  if (!session) {
    throw new Error(`Story intake session not found for id ${input.session_id}`);
  }

  const account = await createAccountRepository().findAccountById(session.account_id);
  const existing = await repository.listProposalsBySession(session.id);
  const seedText = typeof session.brief_payload.seed_text === "string" ? session.brief_payload.seed_text : "想开一本新书";
  const policy_verdict = await evaluatePolicyVerdict({
    scope: "story_intake",
    account_id: session.account_id,
    source_ref: {
      ref_type: "intake_session",
      ref_id: session.id,
    },
    input_text: seedText,
  });
  const genreBriefArtifact = buildGenreBriefForSession({
    session_id: session.id,
    intake_mode: session.intake_mode,
    brief_payload: session.brief_payload,
  });
  const idempotency_key = toProposalGenerationIdempotencyKey(session.id, input.client_request_id);
  let task = await runtimeTaskRepository.findRuntimeTaskByIdempotencyKey(idempotency_key);

  if (existing.length > 0) {
    const existingTask =
      task ?? (await runtimeTaskRepository.findLatestRuntimeTaskBySession(session.id, "proposal_generate"));
    const capability_truth = existing
      .map((proposal) => buildCapabilityTruthFromStoredProposal(proposal))
      .find((item): item is StoryProposalCapabilityTruthView => Boolean(item));

    scheduleStoryIntakePostgresShadowMirror({
      account,
      intake_session: await repository.findIntakeSessionById(session.id),
      proposals: existing,
    });
    return {
      job_id: existingTask?.id ?? null,
      genre_brief: genreBriefArtifact,
      proposals: existing.map(toProposalView),
      status: "proposals_ready",
      ...(capability_truth ? { capability_truth } : {}),
      policy_verdict,
    };
  }

  if (policy_verdict.verdict === "block" || policy_verdict.verdict === "human_review") {
    if (!task) {
      task = await runtimeTaskRepository.createRuntimeTask({
        job_type: "proposal_generate",
        account_id: session.account_id,
        story_id: null,
        session_id: session.id,
        target: null,
        client_request_id: input.client_request_id,
        idempotency_key,
      });
    }

    task.status = policy_verdict.verdict === "human_review" ? "waiting_human" : "failed";
    task.workflow_key = "story.proposal.generate";
    task.adapter_kind = "story_backend_sync";
    task.failure_kind = policy_verdict.verdict === "human_review" ? "human_review_required" : "compliance_blocked";
    task.task_result_summary = `Proposal generation held by policy verdict ${policy_verdict.verdict}.`;
    task.updated_at = new Date().toISOString();
    await runtimeTaskRepository.saveRuntimeTask(task);

    return {
      job_id: task.id,
      genre_brief: genreBriefArtifact,
      proposals: [],
      status: "queued",
      policy_verdict,
    };
  }

  await assertAccountAiBudgetAvailable(session.account_id, "text_generation");

  if (!task) {
    task = await runtimeTaskRepository.createRuntimeTask({
      job_type: "proposal_generate",
      account_id: session.account_id,
      story_id: null,
      session_id: session.id,
      target: null,
      client_request_id: input.client_request_id,
      idempotency_key,
    });
  }

  const started_at = new Date().toISOString();
  task.status = "running";
  task.workflow_key = "story.proposal.generate";
  task.adapter_kind = "story_backend_sync";
  task.task_result_summary = "Proposal generation in progress.";
  task.updated_at = started_at;
  await runtimeTaskRepository.saveRuntimeTask(task);

  const startedAt = Date.now();
  const runtimeResult = await generateStoryProposalsViaAiRuntime(
    {
      seedText,
      intakeMode: session.intake_mode,
    },
    overrides.runtime,
  );
  const proposals = await repository.saveGeneratedProposals({
    session_id: session.id,
    proposals: runtimeResult.proposals.map((proposal, index) => ({
      proposal_no: index + 1,
      title: proposal.title,
      summary: proposal.summary,
      payload: {
        seed_text: seedText,
        relationship: proposal.relationship,
        atmosphere: proposal.atmosphere,
        intake_mode: session.intake_mode,
        target_reader_segment: genreBriefArtifact.target_reader_segment,
        genre_lane: genreBriefArtifact.genre_lane,
        core_promise: genreBriefArtifact.core_promise,
        core_trope_family: genreBriefArtifact.core_trope_family,
        front_ten_chapter_promise: genreBriefArtifact.front_ten_chapter_promise,
        relationship_promise: genreBriefArtifact.relationship_promise,
        risk_flags: genreBriefArtifact.risk_flags,
        runtime_context: {
          requested_tier: runtimeResult.execution.requested_tier,
          selected_tier: runtimeResult.execution.selected_tier,
          attempted_tiers: runtimeResult.execution.attempted_tiers,
          fallback_applied: runtimeResult.execution.fallback_applied,
          provider_id: runtimeResult.execution.provider_id,
          model_id: runtimeResult.execution.model_id,
          strategy: runtimeResult.execution.strategy,
          base_url: runtimeResult.trace?.base_url ?? null,
          session_id: runtimeResult.trace?.session_id ?? null,
          message_id: runtimeResult.trace?.message_id ?? null,
          cost: runtimeResult.trace?.cost ?? null,
          tokens: runtimeResult.trace?.tokens ?? null,
          errors: runtimeResult.errors,
        },
      },
    })),
  });

  await recordAiRuntimeObservation({
    account_id: session.account_id,
    task_key: "story_proposal_generate",
    latency_ms: Date.now() - startedAt,
    execution: runtimeResult.execution,
    trace: runtimeResult.trace,
    errors: runtimeResult.errors,
  });
  await recordAccountCapabilitySpend({
    account_id: session.account_id,
    capability: "text_generation",
    provider_id: runtimeResult.execution.provider_id,
    observed_cost_usd: runtimeResult.trace?.cost ?? null,
  });

  await emitEvent("proposal_generated", session.account_id, {
    proposal_count: proposals.length,
    latency_ms: Date.now() - startedAt,
    runtime_selected_tier: runtimeResult.execution.selected_tier,
    runtime_fallback_applied: runtimeResult.execution.fallback_applied,
    runtime_provider_id: runtimeResult.execution.provider_id ?? "rules_first",
    runtime_model_id: runtimeResult.execution.model_id ?? "rules_first",
    runtime_attempted_tiers: runtimeResult.execution.attempted_tiers.join(","),
    runtime_trace_message_id: runtimeResult.trace?.message_id ?? null,
  });
  scheduleStoryIntakePostgresShadowMirror({
    account,
    intake_session: await repository.findIntakeSessionById(session.id),
    proposals,
  });
  const capability_truth = buildCapabilityTruthFromExecution({
    execution: runtimeResult.execution,
    trace_present: Boolean(runtimeResult.trace),
  });
  const proposalSetArtifact = toProposalSetArtifact({
    session,
    proposals,
    created_at: started_at,
  });
  const proposalSetRef = buildRuntimeTaskArtifactRef({
    artifact_type: "proposal_set",
    story_id: null,
    session_id: session.id,
    object_key: toProposalSetObjectKey(session.id),
    created_at: proposalSetArtifact.created_at,
  });
  const genreBriefRef = buildRuntimeTaskArtifactRef({
    artifact_type: "genre_brief",
    story_id: null,
    session_id: session.id,
    object_key: toGenreBriefObjectKey(session.id),
    created_at: genreBriefArtifact.created_at,
  });

  if (account) {
    scheduleCreativeArtifactObjectStorageShadowUpload({
      account_id: account.account_id,
      aggregate_key: "genre_brief",
      object_key: genreBriefRef.object_key,
      body: JSON.stringify(genreBriefArtifact),
      content_type: "application/json",
    });
  }

  if (account) {
    scheduleCreativeArtifactObjectStorageShadowUpload({
      account_id: account.account_id,
      aggregate_key: "proposal_set",
      object_key: proposalSetRef.object_key,
      body: JSON.stringify(proposalSetArtifact),
      content_type: "application/json",
    });
  }

  task.status = "waiting_human";
  task.result_artifact_refs = mergeArtifactRefs(task.result_artifact_refs ?? [], [
    genreBriefRef,
    proposalSetRef,
  ]);
  task.task_result_summary = `Generated ${proposals.length} proposals and waiting for user selection.`;
  task.failure_kind = null;
  task.updated_at = new Date().toISOString();
  await runtimeTaskRepository.saveRuntimeTask(task);

  return {
    job_id: task.id,
    genre_brief: genreBriefArtifact,
    proposals: proposals.map(toProposalView),
    status: "proposals_ready",
    capability_truth,
    policy_verdict,
  };
}

export async function acceptStoryProposal(input: {
  proposal_id: string;
} & StoryProposalAcceptRequest): Promise<StoryProposalAcceptResponse> {
  const repository = createStoryWorkspaceRepository();
  const accountRepository = createAccountRepository();
  const runtimeTaskRepository = createChapterRuntimeRepository();
  const proposal = await repository.findProposalById(input.proposal_id);

  if (!proposal) {
    throw new Error(`Story proposal not found for id ${input.proposal_id}`);
  }

  const session = await repository.findIntakeSessionById(proposal.session_id);

  if (!session) {
    throw new Error(`Story intake session not found for proposal ${input.proposal_id}`);
  }

  const account = await accountRepository.findAccountById(session.account_id);

  if (!account) {
    throw new Error(`Account not found for session ${session.id}`);
  }

  await assertStorySlotAvailable(session.account_id);

  const selectedProposal = toProposalView(proposal);
  const selectedGenreBrief = resolveGenreBriefFromProposal({
    session_id: session.id,
    intake_mode: session.intake_mode,
    brief_payload: session.brief_payload,
    proposal_payload: proposal.payload,
  });
  const commission_brief = {
    proposal_id: selectedProposal.proposal_id,
    title: selectedProposal.title,
    summary: selectedProposal.summary,
    intake_mode: session.intake_mode,
    entry_surface: session.entry_surface,
    seed_text:
      typeof session.brief_payload.seed_text === "string" ? session.brief_payload.seed_text : "",
    target_reader_segment: selectedGenreBrief.target_reader_segment,
    genre_lane: selectedGenreBrief.genre_lane,
    core_promise: selectedGenreBrief.core_promise,
    core_trope_family: selectedGenreBrief.core_trope_family,
    front_ten_chapter_promise: selectedGenreBrief.front_ten_chapter_promise,
    relationship_promise: selectedGenreBrief.relationship_promise,
    risk_flags: selectedGenreBrief.risk_flags,
    tone_hint:
      typeof input.commission_adjustments?.tone_hint === "string"
        ? input.commission_adjustments.tone_hint
        : "保持慢热拉扯，但别太快确认关系。",
    serialization_scope: "long_form",
  };

  const { workspace, session: convertedSession } = await repository.convertProposalToWorkspace({
    proposal_id: proposal.id,
    workspace: {
      account_id: session.account_id,
      title: selectedProposal.title,
      keywords: [selectedProposal.title, ...(commission_brief.seed_text ? [commission_brief.seed_text] : [])],
      workspace_status: "active",
      entry_surface: session.entry_surface,
      intake_mode: session.intake_mode,
      privacy_scope: "private",
      commission_brief,
      current_chapter_id: null,
      updated_by: "story-intake",
    },
  });
  const canonSeedItems = await bootstrapCanonSeedForWorkspace(workspace);
  scheduleStoryIntakePostgresShadowMirror({
    account,
    intake_session: convertedSession,
    proposals: await repository.listProposalsBySession(convertedSession.id),
    workspace,
  });

  await emitEvent("proposal_selected", session.account_id, {
    proposal_no: proposal.proposal_no,
    launch_first_chapter: input.launch_first_chapter,
  });

  const routedAccount = await upsertShadowAccount({
    account_token: account.account_token,
    channel: account.primary_channel,
    target_route: "/room",
  });
  const deep_link = `${resolveH5BaseUrl()}/room?storyId=${workspace.id}&token=${encodeURIComponent(routedAccount.deep_link_token)}`;
  const selectedProposalArtifact = toSelectedProposalArtifact({
    session_id: session.id,
    story_id: workspace.id,
    proposal,
  });
  const commissionBriefArtifact = toCommissionBriefArtifact({
    story_id: workspace.id,
    proposal_id: proposal.id,
    commission_brief,
  });
  const canonSeedArtifact = toCanonSeedArtifact({
    story_id: workspace.id,
    selected_proposal_id: proposal.id,
    items: canonSeedItems,
  });
  const outlineBundleArtifact = toOutlineBundleArtifact({
    story_id: workspace.id,
    proposal,
    session,
    commission_brief,
  });
  const selectedProposalRef = buildRuntimeTaskArtifactRef({
    artifact_type: "selected_proposal",
    story_id: workspace.id,
    session_id: session.id,
    object_key: toSelectedProposalObjectKey(workspace.id),
    created_at: selectedProposalArtifact.selected_at,
  });
  const commissionBriefRef = buildRuntimeTaskArtifactRef({
    artifact_type: "commission_brief",
    story_id: workspace.id,
    session_id: session.id,
    object_key: toCommissionBriefObjectKey(workspace.id),
    created_at: commissionBriefArtifact.created_at,
  });
  const canonSeedRef = buildRuntimeTaskArtifactRef({
    artifact_type: "canon_seed",
    story_id: workspace.id,
    session_id: session.id,
    object_key: toCanonSeedObjectKey(workspace.id),
    created_at: canonSeedArtifact.created_at,
  });
  const outlineBundleRef = buildRuntimeTaskArtifactRef({
    artifact_type: "outline_bundle",
    story_id: workspace.id,
    session_id: session.id,
    object_key: toOutlineBundleObjectKey(workspace.id),
    created_at: outlineBundleArtifact.created_at,
  });

  scheduleCreativeArtifactObjectStorageShadowUpload({
    account_id: account.account_id,
    aggregate_key: "selected_proposal",
    object_key: selectedProposalRef.object_key,
    body: JSON.stringify(selectedProposalArtifact),
    content_type: "application/json",
  });
  scheduleCreativeArtifactObjectStorageShadowUpload({
    account_id: account.account_id,
    aggregate_key: "commission_brief",
    object_key: commissionBriefRef.object_key,
    body: JSON.stringify(commissionBriefArtifact),
    content_type: "application/json",
  });
  scheduleCreativeArtifactObjectStorageShadowUpload({
    account_id: account.account_id,
    aggregate_key: "canon_seed",
    object_key: canonSeedRef.object_key,
    body: JSON.stringify(canonSeedArtifact),
    content_type: "application/json",
  });
  scheduleCreativeArtifactObjectStorageShadowUpload({
    account_id: account.account_id,
    aggregate_key: "outline_bundle",
    object_key: outlineBundleRef.object_key,
    body: JSON.stringify(outlineBundleArtifact),
    content_type: "application/json",
  });

  const proposalTask = await runtimeTaskRepository.findLatestRuntimeTaskBySession(session.id, "proposal_generate");

  if (proposalTask) {
    proposalTask.story_id = workspace.id;
    proposalTask.status = "succeeded";
    proposalTask.result_artifact_refs = mergeArtifactRefs(proposalTask.result_artifact_refs ?? [], [
      selectedProposalRef,
      commissionBriefRef,
      canonSeedRef,
      outlineBundleRef,
    ]);
    proposalTask.task_result_summary =
      "Proposal selected, commission brief locked, canon seed prepared, and outline bundle prepared.";
    proposalTask.failure_kind = null;
    proposalTask.updated_at = new Date().toISOString();
    await runtimeTaskRepository.saveRuntimeTask(proposalTask);
  }

  const queuedChapterTask = input.launch_first_chapter
    ? await queueChapterGenerationTask({
        story_id: workspace.id,
        target: "first_chapter",
        client_request_id: input.client_request_id,
      })
    : null;

  return {
    story_id: workspace.id,
    selected_proposal: selectedProposal,
    commission_brief,
    canon_seed: canonSeedArtifact,
    outline_bundle: outlineBundleArtifact,
    current_chapter_job: queuedChapterTask
      ? {
          job_id: queuedChapterTask.job_id,
          job_type: "chapter_generate",
        }
      : null,
    deep_link,
  };
}

function toProposalView(proposal: {
  id: string;
  proposal_no: number;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
}) {
  return {
    proposal_id: proposal.id,
    proposal_no: proposal.proposal_no,
    title: proposal.title,
    summary: proposal.summary,
    payload: proposal.payload,
  } satisfies StoryProposalView;
}
