import type { RelationshipMemoryType, PersonaSurfaceState } from "@erliu/shared-contracts";

export type PersonaMode = "persona" | "system";
export type PersonaRelationshipStage = "stranger" | "familiar" | "long_term";
export type PersonaWorkflowStage = "proposal_explanation" | "chapter_progress" | "rewrite_explanation";
export type PersonaGroundedArtifactType = "genre_brief" | "outline_bundle" | "reader_review";

export interface PersonaRelationshipState {
  stage: PersonaRelationshipStage;
  total_messages: number;
  active_memory_types: RelationshipMemoryType[];
  preference_hint: string | null;
}

export interface PersonaTaskCue {
  job_type: "proposal_generate" | "chapter_generate";
  status: "queued" | "running" | "waiting_human" | "succeeded" | "failed" | "canceled";
  target_label?: string | null;
}

export interface PersonaGenreBriefCue {
  target_reader_segment: string;
  genre_lane: string;
  core_promise: string;
  front_ten_chapter_promise: string;
  relationship_promise?: string | null;
}

export interface PersonaOutlineBundleCue {
  current_chapter_title?: string | null;
  current_chapter_goal?: string | null;
  current_emotional_beat?: string | null;
  chapter_cliffhanger_goal?: string | null;
  front_ten_chapter_promise?: string | null;
}

export interface PersonaReaderReviewCue {
  summary: string;
  rewrite_targets: string[];
  acceptance_recommendation: "accept" | "rewrite" | "light_edit";
}

export interface PersonaWorkflowArtifactContext {
  genre_brief?: PersonaGenreBriefCue;
  outline_bundle?: PersonaOutlineBundleCue;
  reader_review?: PersonaReaderReviewCue;
}

export interface PersonaWorkflowCue {
  workflow_stage: PersonaWorkflowStage;
  artifact_context: PersonaWorkflowArtifactContext;
}

export interface PersonaCopyContext {
  persona_mode: PersonaMode;
  relationship_state: PersonaRelationshipState;
  room_presence_state: PersonaSurfaceState;
  state_label: string;
  voice_constraints: string[];
  safety_boundary_flags: string[];
}

export interface ChatPersonaCopyResult extends PersonaCopyContext {
  ack_copy: string;
  reply_text: string;
  workflow_stage?: PersonaWorkflowStage | null;
  grounded_artifact_types?: PersonaGroundedArtifactType[];
}

export interface SystemNotificationCopyResult extends PersonaCopyContext {
  title: string;
  body: string;
}

export interface WorkflowPersonaCopyResult extends PersonaCopyContext {
  workflow_stage: PersonaWorkflowStage;
  grounded_artifact_types: PersonaGroundedArtifactType[];
  explanation: string;
  next_action: string;
}
