import type { PolicyVerdictView } from "./governance-policy.js";

export type StoryIntakeEntrySurface = "chat" | "room" | "story_list";
export type StoryIntakeMode = "has_setting" | "only_feeling" | "repair_line" | "pitch_me";
export type StoryIntakeSessionStatus = "draft" | "proposals_ready" | "commission_confirmed" | "converted";
export type StoryProposalStatus = "generated" | "selected" | "discarded";
export type StoryProposalCapabilityTruthState =
  | "runtime_backed"
  | "runtime_degraded"
  | "simulation_fallback";

export interface StoryIntakeSessionRequest {
  account_token: string;
  entry_surface: StoryIntakeEntrySurface;
  intake_mode: StoryIntakeMode;
  brief_payload: Record<string, unknown>;
  client_request_id: string;
}

export interface StoryIntakeSessionResponse {
  session_id: string;
  status: StoryIntakeSessionStatus;
  next_action: "generate_proposals";
}

export interface StoryProposalView {
  proposal_id: string;
  proposal_no: number;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
}

export interface StoryProposalCapabilityTruthView {
  state: StoryProposalCapabilityTruthState;
  requested_tier: string;
  selected_tier: string;
  fallback_applied: boolean;
  provider_id: string | null;
  model_id: string | null;
  attempted_tiers: string[];
}

export interface StoryGenreBriefView {
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

export interface StoryProposalGenerateRequest {
  client_request_id: string;
  mix_hints?: Record<string, unknown>;
}

export interface StoryProposalGenerateResponse {
  job_id: string | null;
  genre_brief: StoryGenreBriefView;
  proposals: StoryProposalView[];
  status: "proposals_ready" | "queued";
  capability_truth?: StoryProposalCapabilityTruthView;
  policy_verdict?: PolicyVerdictView;
}

export interface StoryCanonSeedItemView {
  item_id: string;
  item_type: string;
  title: string;
  attributes: Record<string, unknown>;
  reveal_level: string;
  continuity_status: string;
  version_no: number;
}

export interface StoryCanonSeedView {
  artifact_type: "canon_seed";
  story_id: string;
  selected_proposal_id: string;
  item_count: number;
  items: StoryCanonSeedItemView[];
  created_at: string;
}

export interface StoryOutlineChapterView {
  chapter_no: number;
  title: string;
  goal: string;
  emotional_beat: string;
}

export interface StoryOutlineBundleView {
  artifact_type: "outline_bundle";
  story_id: string;
  selected_proposal_id: string;
  seed_text: string;
  front_ten_chapter_promise: string;
  relationship_axis: string;
  hook_plan: string[];
  chapters: StoryOutlineChapterView[];
  created_at: string;
}

export interface StoryProposalAcceptRequest {
  commission_adjustments?: Record<string, unknown>;
  launch_first_chapter: boolean;
  client_request_id: string;
}

export interface StoryProposalAcceptResponse {
  story_id: string;
  selected_proposal: StoryProposalView;
  commission_brief: Record<string, unknown>;
  canon_seed: StoryCanonSeedView;
  outline_bundle: StoryOutlineBundleView;
  current_chapter_job: {
    job_id: string;
    job_type: "chapter_generate";
  } | null;
  deep_link: string;
  policy_verdict?: PolicyVerdictView;
}
