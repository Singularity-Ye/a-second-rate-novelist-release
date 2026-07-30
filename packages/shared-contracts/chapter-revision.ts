import type { ChapterReaderReviewView } from "./chapter-job.js";

export interface ChapterAcceptResponse {
  chapter_id: string;
  status: "accepted";
  room_snapshot_hint: {
    highlight: "desk" | "computer";
  };
  accepted_object_key: string;
  continuity_patch_id: string | null;
  continuity_patch_summary: string | null;
  truth_source_effect: "accepted_to_mainline";
  reader_review?: ChapterReaderReviewView | null;
}

export interface ChapterRevisionRequest {
  revision_kind: "rewrite" | "light_edit";
  instruction_text: string;
  anchor_range?: {
    start_paragraph: number;
    end_paragraph: number;
  };
  client_request_id: string;
}

export interface ChapterRevisionView {
  revision_id: string;
  chapter_id: string;
  revision_kind: "rewrite" | "light_edit";
  revised_text: string;
}

export interface ChapterRevisionResponse {
  job_id: string | null;
  revision: ChapterRevisionView | null;
  revision_count: number;
  truth_source_effect: "draft_only" | "revision_pending";
  status: "queued" | "succeeded";
  reader_review?: ChapterReaderReviewView | null;
}
