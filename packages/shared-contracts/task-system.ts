export type RuntimeTaskJobType = "proposal_generate" | "chapter_generate";

export type RuntimeTaskStatus =
  | "queued"
  | "running"
  | "waiting_human"
  | "succeeded"
  | "failed"
  | "canceled";

export type RuntimeTaskFailureKind =
  | "model_failed"
  | "permission_denied"
  | "compliance_blocked"
  | "downstream_timeout"
  | "human_review_required"
  | "not_found";

export type RuntimeTaskArtifactType =
  | "genre_brief"
  | "proposal_set"
  | "selected_proposal"
  | "commission_brief"
  | "canon_seed"
  | "outline_bundle"
  | "scene_card_set"
  | "chapter_draft"
  | "reader_review"
  | "accepted_chapter"
  | "chapter_revision"
  | "export_manifest";

export type RuntimeTaskWritebackOwner =
  | "story_intake_runtime"
  | "story_intake_accept"
  | "chapter_generation_callback"
  | "chapter_review_gate"
  | "chapter_acceptance"
  | "chapter_revision"
  | "rights_export";

export type RuntimeTaskAgentRole =
  | "interviewer"
  | "story_architect"
  | "reader_promise_gate"
  | "scene_writer"
  | "continuity_auditor"
  | "rights_guard";

export type RuntimeTaskToolAccessMode =
  | "read"
  | "write_patch"
  | "write_artifact"
  | "emit";

export interface RuntimeTaskToolScopeView {
  agent: RuntimeTaskAgentRole;
  tools: string[];
  access_mode: RuntimeTaskToolAccessMode;
}

export interface RuntimeTaskArtifactContractView {
  artifact_type: RuntimeTaskArtifactType;
  contract_version: "v1.1";
  writeback_owner: RuntimeTaskWritebackOwner;
  compatibility_aliases: string[];
}

export interface RuntimeTaskStageContractView extends RuntimeTaskArtifactContractView {
  stage_key: string;
  source_artifact_types: RuntimeTaskArtifactType[];
  required: boolean;
}

export interface RuntimeTaskJobContractView {
  job_type: RuntimeTaskJobType;
  contract_version: "v1.1";
  agent_roster: RuntimeTaskAgentRole[];
  tool_scope: RuntimeTaskToolScopeView[];
  stage_chain: RuntimeTaskStageContractView[];
}

export interface RuntimeTaskArtifactRefView {
  artifact_type: RuntimeTaskArtifactType;
  story_id: string | null;
  session_id?: string | null;
  chapter_id?: string | null;
  export_job_id?: string | null;
  object_key: string;
  created_at: string;
  contract_version?: "v1.1";
  writeback_owner?: RuntimeTaskWritebackOwner;
  compatibility_aliases?: string[];
}

export interface RuntimeTaskMemoryMapView {
  context_ref_ids: string[];
  scene_ref_ids: string[];
  promise_ref_ids: string[];
  guarded_ref_ids: string[];
  persona_reason_ref_ids: string[];
  persona_state_code: string;
}

export interface RuntimeTaskView {
  job_id: string;
  job_type: RuntimeTaskJobType;
  status: RuntimeTaskStatus;
  notification_id: string | null;
  result_chapter_id: string | null;
  workflow_key: string | null;
  adapter_kind: string | null;
  context_bundle_id: string | null;
  persona_snapshot_id: string | null;
  callback_status: "pending" | "applied" | "failed" | null;
  result_artifact_refs: RuntimeTaskArtifactRefView[];
  task_result_summary: string | null;
  failure_kind: RuntimeTaskFailureKind | null;
  memory_map: RuntimeTaskMemoryMapView | null;
}

const RUNTIME_TASK_ARTIFACT_CONTRACTS: Record<
  RuntimeTaskArtifactType,
  RuntimeTaskArtifactContractView
> = {
  genre_brief: {
    artifact_type: "genre_brief",
    contract_version: "v1.1",
    writeback_owner: "story_intake_runtime",
    compatibility_aliases: [],
  },
  proposal_set: {
    artifact_type: "proposal_set",
    contract_version: "v1.1",
    writeback_owner: "story_intake_runtime",
    compatibility_aliases: [],
  },
  selected_proposal: {
    artifact_type: "selected_proposal",
    contract_version: "v1.1",
    writeback_owner: "story_intake_accept",
    compatibility_aliases: [],
  },
  commission_brief: {
    artifact_type: "commission_brief",
    contract_version: "v1.1",
    writeback_owner: "story_intake_accept",
    compatibility_aliases: [],
  },
  canon_seed: {
    artifact_type: "canon_seed",
    contract_version: "v1.1",
    writeback_owner: "story_intake_accept",
    compatibility_aliases: [],
  },
  outline_bundle: {
    artifact_type: "outline_bundle",
    contract_version: "v1.1",
    writeback_owner: "story_intake_accept",
    compatibility_aliases: [],
  },
  scene_card_set: {
    artifact_type: "scene_card_set",
    contract_version: "v1.1",
    writeback_owner: "chapter_generation_callback",
    compatibility_aliases: ["scene_plan"],
  },
  chapter_draft: {
    artifact_type: "chapter_draft",
    contract_version: "v1.1",
    writeback_owner: "chapter_generation_callback",
    compatibility_aliases: [],
  },
  reader_review: {
    artifact_type: "reader_review",
    contract_version: "v1.1",
    writeback_owner: "chapter_review_gate",
    compatibility_aliases: [],
  },
  accepted_chapter: {
    artifact_type: "accepted_chapter",
    contract_version: "v1.1",
    writeback_owner: "chapter_acceptance",
    compatibility_aliases: [],
  },
  chapter_revision: {
    artifact_type: "chapter_revision",
    contract_version: "v1.1",
    writeback_owner: "chapter_revision",
    compatibility_aliases: [],
  },
  export_manifest: {
    artifact_type: "export_manifest",
    contract_version: "v1.1",
    writeback_owner: "rights_export",
    compatibility_aliases: [],
  },
};

const STORY_INTAKE_TOOL_SCOPE: RuntimeTaskToolScopeView[] = [
  {
    agent: "interviewer",
    tools: ["reader_profile", "seed_text", "genre_brief"],
    access_mode: "write_artifact",
  },
  {
    agent: "story_architect",
    tools: ["proposal_set", "commission_brief", "canon_seed", "outline_bundle"],
    access_mode: "write_artifact",
  },
  {
    agent: "reader_promise_gate",
    tools: ["front_ten_chapter_promise", "proposal_explanation"],
    access_mode: "emit",
  },
];

const CHAPTER_RUNTIME_TOOL_SCOPE: RuntimeTaskToolScopeView[] = [
  {
    agent: "scene_writer",
    tools: ["outline_bundle", "scene_card_set", "chapter_draft"],
    access_mode: "write_artifact",
  },
  {
    agent: "reader_promise_gate",
    tools: ["chapter_draft", "reader_review"],
    access_mode: "write_artifact",
  },
  {
    agent: "continuity_auditor",
    tools: ["scene_card_set", "reader_review", "continuity_patch"],
    access_mode: "write_patch",
  },
];

const RUNTIME_TASK_JOB_CONTRACTS: Record<RuntimeTaskJobType, RuntimeTaskJobContractView> = {
  proposal_generate: {
    job_type: "proposal_generate",
    contract_version: "v1.1",
    agent_roster: ["interviewer", "story_architect", "reader_promise_gate"],
    tool_scope: STORY_INTAKE_TOOL_SCOPE,
    stage_chain: [
      {
        stage_key: "reader-fit-brief",
        source_artifact_types: [],
        required: true,
        ...RUNTIME_TASK_ARTIFACT_CONTRACTS.genre_brief,
      },
      {
        stage_key: "proposal-set",
        source_artifact_types: ["genre_brief"],
        required: true,
        ...RUNTIME_TASK_ARTIFACT_CONTRACTS.proposal_set,
      },
      {
        stage_key: "selected-proposal",
        source_artifact_types: ["proposal_set"],
        required: true,
        ...RUNTIME_TASK_ARTIFACT_CONTRACTS.selected_proposal,
      },
      {
        stage_key: "commission-brief",
        source_artifact_types: ["selected_proposal", "genre_brief"],
        required: true,
        ...RUNTIME_TASK_ARTIFACT_CONTRACTS.commission_brief,
      },
      {
        stage_key: "canon-seed",
        source_artifact_types: ["commission_brief", "selected_proposal"],
        required: true,
        ...RUNTIME_TASK_ARTIFACT_CONTRACTS.canon_seed,
      },
      {
        stage_key: "outline-bundle",
        source_artifact_types: ["commission_brief", "canon_seed", "genre_brief"],
        required: true,
        ...RUNTIME_TASK_ARTIFACT_CONTRACTS.outline_bundle,
      },
    ],
  },
  chapter_generate: {
    job_type: "chapter_generate",
    contract_version: "v1.1",
    agent_roster: ["scene_writer", "reader_promise_gate", "continuity_auditor"],
    tool_scope: CHAPTER_RUNTIME_TOOL_SCOPE,
    stage_chain: [
      {
        stage_key: "scene-card-set",
        source_artifact_types: ["outline_bundle"],
        required: true,
        ...RUNTIME_TASK_ARTIFACT_CONTRACTS.scene_card_set,
      },
      {
        stage_key: "chapter-draft",
        source_artifact_types: ["scene_card_set", "outline_bundle"],
        required: true,
        ...RUNTIME_TASK_ARTIFACT_CONTRACTS.chapter_draft,
      },
      {
        stage_key: "reader-review",
        source_artifact_types: ["chapter_draft"],
        required: true,
        ...RUNTIME_TASK_ARTIFACT_CONTRACTS.reader_review,
      },
      {
        stage_key: "chapter-revision",
        source_artifact_types: ["reader_review", "chapter_draft"],
        required: false,
        ...RUNTIME_TASK_ARTIFACT_CONTRACTS.chapter_revision,
      },
      {
        stage_key: "accepted-chapter",
        source_artifact_types: ["reader_review", "chapter_draft", "scene_card_set"],
        required: true,
        ...RUNTIME_TASK_ARTIFACT_CONTRACTS.accepted_chapter,
      },
    ],
  },
};

function cloneToolScope(scope: RuntimeTaskToolScopeView[]): RuntimeTaskToolScopeView[] {
  return scope.map((entry) => ({
    ...entry,
    tools: [...entry.tools],
  }));
}

function cloneStageChain(
  stages: RuntimeTaskStageContractView[],
): RuntimeTaskStageContractView[] {
  return stages.map((stage) => ({
    ...stage,
    source_artifact_types: [...stage.source_artifact_types],
    compatibility_aliases: [...stage.compatibility_aliases],
  }));
}

export function getRuntimeTaskArtifactContract(
  artifact_type: RuntimeTaskArtifactType,
): RuntimeTaskArtifactContractView {
  const contract = RUNTIME_TASK_ARTIFACT_CONTRACTS[artifact_type];

  return {
    ...contract,
    compatibility_aliases: [...contract.compatibility_aliases],
  };
}

export function getRuntimeTaskJobContract(
  job_type: RuntimeTaskJobType,
): RuntimeTaskJobContractView {
  const contract = RUNTIME_TASK_JOB_CONTRACTS[job_type];

  return {
    ...contract,
    agent_roster: [...contract.agent_roster],
    tool_scope: cloneToolScope(contract.tool_scope),
    stage_chain: cloneStageChain(contract.stage_chain),
  };
}

export function buildRuntimeTaskArtifactRef(
  input: Omit<RuntimeTaskArtifactRefView, "contract_version" | "writeback_owner" | "compatibility_aliases"> & {
    writeback_owner?: RuntimeTaskWritebackOwner;
  },
): RuntimeTaskArtifactRefView {
  const contract = getRuntimeTaskArtifactContract(input.artifact_type);

  return {
    artifact_type: input.artifact_type,
    story_id: input.story_id,
    ...(input.session_id !== undefined ? { session_id: input.session_id } : {}),
    ...(input.chapter_id !== undefined ? { chapter_id: input.chapter_id } : {}),
    ...(input.export_job_id !== undefined ? { export_job_id: input.export_job_id } : {}),
    object_key: input.object_key,
    created_at: input.created_at,
    contract_version: contract.contract_version,
    writeback_owner: input.writeback_owner ?? contract.writeback_owner,
    compatibility_aliases: contract.compatibility_aliases,
  };
}
