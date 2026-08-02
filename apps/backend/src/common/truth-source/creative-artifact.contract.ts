import type { ChapterView } from "@erliu/shared-contracts";
import type { ChapterRecord, ChapterRevisionRecord } from "../repositories/chapter-runtime.repository.js";
import type {
  ExportArtifactRecord,
  ExportJobRecord,
  RiskCheckRecord,
} from "../repositories/export-rights.repository.js";
import type {
  StoryIntakeSessionRecord,
  StoryProposalRecord,
} from "../repositories/story-workspace.repository.js";
import type { CanonItemRecord } from "../repositories/story-knowledge.repository.js";

interface ProposalSetEntry {
  proposal_id: string;
  proposal_no: number;
  title: string;
  summary: string;
  status: StoryProposalRecord["status"];
}

export interface GenreBriefArtifact {
  artifact_type: "genre_brief";
  session_id: string;
  story_id: string | null;
  target_reader_segment: string;
  genre_lane: string;
  core_promise: string;
  core_trope_family: string[];
  front_ten_chapter_promise: string;
  relationship_promise: string;
  risk_flags: string[];
  created_at: string;
}

export interface ProposalSetArtifact {
  artifact_type: "proposal_set";
  session_id: string;
  story_id: null;
  intake_mode: StoryIntakeSessionRecord["intake_mode"];
  seed_text: string;
  proposal_count: number;
  proposals: ProposalSetEntry[];
  created_at: string;
}

export interface SelectedProposalArtifact {
  artifact_type: "selected_proposal";
  session_id: string;
  story_id: string;
  proposal_id: string;
  proposal_no: number;
  title: string;
  summary: string;
  selected_at: string;
}

export interface CommissionBriefArtifact {
  artifact_type: "commission_brief";
  story_id: string;
  proposal_id: string;
  commission_brief: Record<string, unknown>;
  created_at: string;
}

export interface CanonSeedArtifact {
  artifact_type: "canon_seed";
  story_id: string;
  selected_proposal_id: string;
  item_count: number;
  items: Array<{
    item_id: string;
    item_type: CanonItemRecord["item_type"];
    title: string;
    attributes: CanonItemRecord["attributes"];
    reveal_level: CanonItemRecord["reveal_level"];
    continuity_status: CanonItemRecord["continuity_status"];
    version_no: number;
  }>;
  created_at: string;
}

export interface OutlineBundleArtifact {
  artifact_type: "outline_bundle";
  story_id: string;
  selected_proposal_id: string;
  seed_text: string;
  front_ten_chapter_promise: string;
  relationship_axis: string;
  hook_plan: string[];
  chapters: Array<{
    chapter_no: number;
    title: string;
    goal: string;
    emotional_beat: string;
  }>;
  created_at: string;
}

export interface SceneCardSetArtifact {
  artifact_type: "scene_card_set";
  story_id: string;
  chapter_id: string;
  based_on_outline_bundle_id: string;
  chapter_goal: string;
  chapter_cliffhanger_goal: string;
  scenes: Array<{
    scene_no: number;
    scene_goal: string;
    conflict: string;
    turning_point: string;
    trope_hook: string;
    must_keep_reveal_state: string;
    expected_after_state: string;
  }>;
  created_at: string;
}

export type ReaderReviewAcceptanceRecommendation =
  | "accept"
  | "rewrite"
  | "tweak"
  | "continuity_patch";

export interface ReaderReviewArtifact {
  artifact_type: "reader_review";
  story_id: string;
  chapter_id: string;
  source_artifact_id: string;
  review_dimensions: {
    clarity: number;
    promise_delivery: number;
    relationship_tension: number;
    chapter_progression: number;
    cliffhanger_strength: number;
  };
  summary: string;
  rewrite_targets: string[];
  acceptance_recommendation: ReaderReviewAcceptanceRecommendation;
  created_at: string;
}

export interface ChapterDraftArtifact {
  artifact_type: "chapter_draft";
  story_id: string;
  chapter_id: string;
  chapter_no: number;
  title: string;
  status: ChapterRecord["status"];
  summary: string;
  body_text: string;
  generation_job_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AcceptedChapterArtifact {
  artifact_type: "accepted_chapter";
  story_id: string;
  chapter_id: string;
  chapter_no: number;
  title: string;
  status: ChapterRecord["status"];
  summary: string;
  body_text: string;
  generation_job_id: string | null;
  accepted_at: string;
}

export interface ChapterRevisionArtifact {
  artifact_type: "chapter_revision";
  story_id: string;
  chapter_id: string;
  revision_id: string;
  revision_kind: ChapterRevisionRecord["revision_kind"];
  instruction_text: string;
  anchor_range: ChapterRevisionRecord["anchor_range"];
  revised_text: string;
  source_intent_id: string;
  created_at: string;
  updated_at: string;
}

export interface ExportManifestArtifact {
  artifact_type: "export_manifest";
  story_id: string;
  export_job_id: string;
  requested_formats: ExportJobRecord["requested_formats"];
  delivered_formats: ExportArtifactRecord["format"][];
  status: ExportJobRecord["status"];
  label_mode_preference: ExportJobRecord["label_mode_preference"];
  risk_check_id: string;
  risk_result: RiskCheckRecord["result"];
  evidence_pack_id: string | null;
  artifact_downloads: Array<{
    artifact_id: string;
    format: ExportArtifactRecord["format"];
    object_key: string;
  }>;
  created_at: string;
  finished_at: string | null;
}

export type CreativeChapterArtifact = ChapterDraftArtifact | AcceptedChapterArtifact;

function resolveSeedText(session: Pick<StoryIntakeSessionRecord, "brief_payload">) {
  return typeof session.brief_payload.seed_text === "string" ? session.brief_payload.seed_text : "";
}

function resolveToneHint(commission_brief: Record<string, unknown>) {
  return typeof commission_brief.tone_hint === "string"
    ? commission_brief.tone_hint
    : "保持慢热拉扯，但别太快确认关系。";
}

function resolveOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toTrimmedStringList(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function resolveFrontTenChapterPromise(
  proposal: Pick<StoryProposalRecord, "title">,
  commission_brief: Record<string, unknown>,
) {
  return (
    resolveOptionalString(commission_brief.front_ten_chapter_promise) ??
    `前十章先把《${proposal.title}》的试探、站队与关系失衡钉住。`
  );
}

function resolveRelationshipAxis(
  proposal: Pick<StoryProposalRecord, "title">,
  commission_brief: Record<string, unknown>,
) {
  return (
    resolveOptionalString(commission_brief.relationship_axis) ??
    `《${proposal.title}》会沿着“想靠近却不敢确认”的关系轴持续拉扯。`
  );
}

function resolveHookPlan(
  proposal: Pick<StoryProposalRecord, "title">,
  commission_brief: Record<string, unknown>,
) {
  const explicit = toTrimmedStringList(commission_brief.hook_plan);

  if (explicit.length > 0) {
    return explicit;
  }

  return [
    `第 1-3 章先立住《${proposal.title}》的重逢钩子`,
    "第 4-7 章逐步掀开旧债与站队压力",
    "第 8-10 章把关系承诺和下一次不可回头的选择压实",
  ];
}

export function toGenreBriefObjectKey(session_id: string) {
  return `creative-artifacts/intake-sessions/${session_id}/genre-brief.json`;
}

export function toProposalSetObjectKey(session_id: string) {
  return `creative-artifacts/intake-sessions/${session_id}/proposal-set.json`;
}

export function toSelectedProposalObjectKey(story_id: string) {
  return `creative-artifacts/stories/${story_id}/intake/selected-proposal.json`;
}

export function toCommissionBriefObjectKey(story_id: string) {
  return `creative-artifacts/stories/${story_id}/intake/commission-brief.json`;
}

export function toCanonSeedObjectKey(story_id: string) {
  return `creative-artifacts/stories/${story_id}/canon/canon-seed.json`;
}

export function toOutlineBundleObjectKey(story_id: string) {
  return `creative-artifacts/stories/${story_id}/structure/outline-bundle.json`;
}

export function toSceneCardSetObjectKey(story_id: string, chapter_id: string) {
  return `creative-artifacts/stories/${story_id}/chapters/${chapter_id}/scene-card-set.json`;
}

export function toChapterDraftObjectKey(story_id: string, chapter_id: string) {
  return `creative-artifacts/stories/${story_id}/chapters/${chapter_id}/draft.json`;
}

export function toReaderReviewObjectKey(story_id: string, chapter_id: string) {
  return `creative-artifacts/stories/${story_id}/chapters/${chapter_id}/reader-review.json`;
}

export function toAcceptedChapterObjectKey(story_id: string, chapter_id: string) {
  return `creative-artifacts/stories/${story_id}/chapters/${chapter_id}/accepted.json`;
}

export function toChapterRevisionObjectKey(story_id: string, chapter_id: string, revision_id: string) {
  return `creative-artifacts/stories/${story_id}/chapters/${chapter_id}/revisions/${revision_id}.json`;
}

export function toExportManifestObjectKey(story_id: string, export_job_id: string) {
  return `creative-artifacts/stories/${story_id}/exports/${export_job_id}/export-manifest.json`;
}

export function toProposalSetArtifact(input: {
  session: StoryIntakeSessionRecord;
  proposals: StoryProposalRecord[];
  created_at?: string;
}): ProposalSetArtifact {
  return {
    artifact_type: "proposal_set",
    session_id: input.session.id,
    story_id: null,
    intake_mode: input.session.intake_mode,
    seed_text: resolveSeedText(input.session),
    proposal_count: input.proposals.length,
    proposals: input.proposals.map((proposal) => ({
      proposal_id: proposal.id,
      proposal_no: proposal.proposal_no,
      title: proposal.title,
      summary: proposal.summary,
      status: proposal.status,
    })),
    created_at: input.created_at ?? new Date().toISOString(),
  };
}

export function toGenreBriefArtifact(input: {
  session_id: string;
  story_id?: string | null;
  target_reader_segment: string;
  genre_lane: string;
  core_promise: string;
  core_trope_family: string[];
  front_ten_chapter_promise: string;
  relationship_promise: string;
  risk_flags?: string[];
  created_at?: string;
}): GenreBriefArtifact {
  return {
    artifact_type: "genre_brief",
    session_id: input.session_id,
    story_id: input.story_id ?? null,
    target_reader_segment: input.target_reader_segment,
    genre_lane: input.genre_lane,
    core_promise: input.core_promise,
    core_trope_family: [...input.core_trope_family],
    front_ten_chapter_promise: input.front_ten_chapter_promise,
    relationship_promise: input.relationship_promise,
    risk_flags: [...(input.risk_flags ?? [])],
    created_at: input.created_at ?? new Date().toISOString(),
  };
}

export function toSelectedProposalArtifact(input: {
  session_id: string;
  story_id: string;
  proposal: StoryProposalRecord;
  selected_at?: string;
}): SelectedProposalArtifact {
  return {
    artifact_type: "selected_proposal",
    session_id: input.session_id,
    story_id: input.story_id,
    proposal_id: input.proposal.id,
    proposal_no: input.proposal.proposal_no,
    title: input.proposal.title,
    summary: input.proposal.summary,
    selected_at: input.selected_at ?? new Date().toISOString(),
  };
}

export function toCommissionBriefArtifact(input: {
  story_id: string;
  proposal_id: string;
  commission_brief: Record<string, unknown>;
  created_at?: string;
}): CommissionBriefArtifact {
  return {
    artifact_type: "commission_brief",
    story_id: input.story_id,
    proposal_id: input.proposal_id,
    commission_brief: input.commission_brief,
    created_at: input.created_at ?? new Date().toISOString(),
  };
}

export function toCanonSeedArtifact(input: {
  story_id: string;
  selected_proposal_id: string;
  items: CanonItemRecord[];
  created_at?: string;
}): CanonSeedArtifact {
  return {
    artifact_type: "canon_seed",
    story_id: input.story_id,
    selected_proposal_id: input.selected_proposal_id,
    item_count: input.items.length,
    items: input.items.map((item) => ({
      item_id: item.id,
      item_type: item.item_type,
      title: item.title,
      attributes: item.attributes,
      reveal_level: item.reveal_level,
      continuity_status: item.continuity_status,
      version_no: item.version_no,
    })),
    created_at: input.created_at ?? new Date().toISOString(),
  };
}

export function toOutlineBundleArtifact(input: {
  story_id: string;
  proposal: StoryProposalRecord;
  session: StoryIntakeSessionRecord;
  commission_brief: Record<string, unknown>;
  created_at?: string;
}): OutlineBundleArtifact {
  const seed_text = resolveSeedText(input.session);
  const tone_hint = resolveToneHint(input.commission_brief);
  const front_ten_chapter_promise = resolveFrontTenChapterPromise(input.proposal, input.commission_brief);
  const relationship_axis = resolveRelationshipAxis(input.proposal, input.commission_brief);
  const hook_plan = resolveHookPlan(input.proposal, input.commission_brief);

  return {
    artifact_type: "outline_bundle",
    story_id: input.story_id,
    selected_proposal_id: input.proposal.id,
    seed_text,
    front_ten_chapter_promise,
    relationship_axis,
    hook_plan,
    chapters: [
      {
        chapter_no: 1,
        title: `${input.proposal.title} · 雨夜开场`,
        goal: `把 ${input.proposal.title} 的关系张力和初始悬念立住。`,
        emotional_beat: "克制试探",
      },
      {
        chapter_no: 2,
        title: `${input.proposal.title} · 旧事回潮`,
        goal: `顺着“${tone_hint}”继续把前史和误解往外掀一层。`,
        emotional_beat: "拉扯升温",
      },
      {
        chapter_no: 3,
        title: `${input.proposal.title} · 选择前夜`,
        goal: `让角色为了 ${seed_text || "这段关系"} 做出一次无法轻易回头的选择。`,
        emotional_beat: "悬而未决",
      },
    ],
    created_at: input.created_at ?? new Date().toISOString(),
  };
}

export function toSceneCardSetArtifact(input: {
  story_id: string;
  chapter_id: string;
  based_on_outline_bundle_id: string;
  chapter_goal: string;
  chapter_cliffhanger_goal: string;
  scenes: SceneCardSetArtifact["scenes"];
  created_at?: string;
}): SceneCardSetArtifact {
  return {
    artifact_type: "scene_card_set",
    story_id: input.story_id,
    chapter_id: input.chapter_id,
    based_on_outline_bundle_id: input.based_on_outline_bundle_id,
    chapter_goal: input.chapter_goal,
    chapter_cliffhanger_goal: input.chapter_cliffhanger_goal,
    scenes: input.scenes.map((scene) => ({
      ...scene,
    })),
    created_at: input.created_at ?? new Date().toISOString(),
  };
}

export function toChapterDraftArtifact(chapter: ChapterRecord): ChapterDraftArtifact {
  return {
    artifact_type: "chapter_draft",
    story_id: chapter.story_id,
    chapter_id: chapter.id,
    chapter_no: chapter.chapter_no,
    title: chapter.title,
    status: chapter.status,
    summary: chapter.summary,
    body_text: chapter.body_text,
    generation_job_id: chapter.generation_job_id,
    created_at: chapter.created_at,
    updated_at: chapter.updated_at,
  };
}

export function toReaderReviewArtifact(input: {
  story_id: string;
  chapter_id: string;
  source_artifact_id: string;
  review_dimensions: ReaderReviewArtifact["review_dimensions"];
  summary: string;
  rewrite_targets: string[];
  acceptance_recommendation: ReaderReviewAcceptanceRecommendation;
  created_at?: string;
}): ReaderReviewArtifact {
  return {
    artifact_type: "reader_review",
    story_id: input.story_id,
    chapter_id: input.chapter_id,
    source_artifact_id: input.source_artifact_id,
    review_dimensions: {
      ...input.review_dimensions,
    },
    summary: input.summary,
    rewrite_targets: [...input.rewrite_targets],
    acceptance_recommendation: input.acceptance_recommendation,
    created_at: input.created_at ?? new Date().toISOString(),
  };
}

export function toAcceptedChapterArtifact(chapter: ChapterRecord): AcceptedChapterArtifact {
  return {
    artifact_type: "accepted_chapter",
    story_id: chapter.story_id,
    chapter_id: chapter.id,
    chapter_no: chapter.chapter_no,
    title: chapter.title,
    status: chapter.status,
    summary: chapter.summary,
    body_text: chapter.body_text,
    generation_job_id: chapter.generation_job_id,
    accepted_at: chapter.updated_at,
  };
}

export function toChapterRevisionArtifact(
  story_id: string,
  revision: ChapterRevisionRecord,
): ChapterRevisionArtifact {
  return {
    artifact_type: "chapter_revision",
    story_id,
    chapter_id: revision.chapter_id,
    revision_id: revision.id,
    revision_kind: revision.revision_kind,
    instruction_text: revision.instruction_text,
    anchor_range: revision.anchor_range,
    revised_text: revision.revised_text,
    source_intent_id: revision.source_intent_id,
    created_at: revision.created_at,
    updated_at: revision.updated_at,
  };
}

export function toExportManifestArtifact(input: {
  job: ExportJobRecord;
  risk_check: RiskCheckRecord;
  artifacts: ExportArtifactRecord[];
}): ExportManifestArtifact {
  return {
    artifact_type: "export_manifest",
    story_id: input.job.story_id,
    export_job_id: input.job.id,
    requested_formats: input.job.requested_formats,
    delivered_formats: input.artifacts.map((artifact) => artifact.format),
    status: input.job.status,
    label_mode_preference: input.job.label_mode_preference,
    risk_check_id: input.risk_check.id,
    risk_result: input.risk_check.result,
    evidence_pack_id: input.job.evidence_pack_id,
    artifact_downloads: input.artifacts.map((artifact) => ({
      artifact_id: artifact.id,
      format: artifact.format,
      object_key: artifact.object_key,
    })),
    created_at: input.job.created_at,
    finished_at: input.job.finished_at,
  };
}

export function parseCreativeChapterArtifact(raw: string): CreativeChapterArtifact | null {
  try {
    const parsed = JSON.parse(raw) as Partial<CreativeChapterArtifact>;

    if (
      parsed &&
      (parsed.artifact_type === "chapter_draft" || parsed.artifact_type === "accepted_chapter") &&
      typeof parsed.story_id === "string" &&
      typeof parsed.chapter_id === "string" &&
      typeof parsed.chapter_no === "number" &&
      typeof parsed.title === "string" &&
      typeof parsed.status === "string" &&
      typeof parsed.summary === "string" &&
      typeof parsed.body_text === "string"
    ) {
      return parsed as CreativeChapterArtifact;
    }
  } catch {
    return null;
  }

  return null;
}

export function toChapterViewFromArtifact(artifact: CreativeChapterArtifact): ChapterView {
  return {
    chapter_id: artifact.chapter_id,
    story_id: artifact.story_id,
    chapter_no: artifact.chapter_no,
    title: artifact.title,
    status: artifact.status,
    body_text: artifact.body_text,
    summary: artifact.summary,
  };
}
