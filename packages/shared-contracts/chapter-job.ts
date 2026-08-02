import type { RuntimeTaskStatus } from "./task-system.js";
import type { PolicyVerdictView } from "./governance-policy.js";

export interface ChapterSceneCardView {
  chapter_goal: string;
  chapter_cliffhanger_goal: string;
  scene_count: number;
  first_scene_goal: string;
}

export interface ChapterReaderReviewView {
  summary: string;
  acceptance_recommendation: "accept" | "rewrite" | "tweak" | "continuity_patch";
  rewrite_targets: string[];
}

export interface ChapterGenerateRequest {
  target: "next_chapter" | "next_scene" | "first_chapter";
  instruction_context?: string;
  client_request_id: string;
}

export interface ChapterGenerateResponse {
  job_id: string;
  status: RuntimeTaskStatus;
  notification_id: string | null;
  policy_verdict?: PolicyVerdictView;
}

export interface ChapterView {
  chapter_id: string;
  story_id: string;
  chapter_no: number;
  title: string;
  status: "queued" | "generated" | "accepted" | "superseded";
  body_text: string;
  summary: string;
  scene_card_set?: ChapterSceneCardView | null;
  reader_review?: ChapterReaderReviewView | null;
}
