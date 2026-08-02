export type CanonItemType = "character" | "location" | "relationship" | "world_rule" | "timeline_marker";
export type CanonRevealLevel = "public_now" | "guarded" | "hidden";
export type CanonContinuityStatus = "stable" | "pending_patch" | "conflicted";

export interface CanonItemView {
  item_id: string;
  story_id: string;
  item_type: CanonItemType;
  title: string;
  attributes: Record<string, unknown>;
  reveal_level: CanonRevealLevel;
  source_refs: Array<{
    ref_type: string;
    ref_id: string;
    title: string;
  }>;
  continuity_status: CanonContinuityStatus;
  version_no: number;
}

export interface CanonViewResponse {
  items: CanonItemView[];
  relations: CanonItemView[];
  recent_patches: CanonPatchView[];
  continuity_brief: CanonContinuityBriefView;
  reveal_summary: {
    public_count: number;
    guarded_count: number;
    hidden_count: number;
  };
}

export interface CanonPatchView {
  patch_id: string;
  target_item_id: string;
  reason: string;
  status: "applied" | "conflicted";
  created_at: string;
}

export interface CanonPatchRequest {
  target_item_id: string;
  patch_document: Record<string, unknown>;
  reason: string;
  client_request_id: string;
  expected_version_no?: number;
}

export interface CanonPatchResponse {
  patch_id: string;
  item_version: number;
  status: "applied" | "conflicted";
  error_code?: "CAN-101";
  continuity_issues: ContinuityIssueView[];
}

export interface ContinuityIssueView {
  issue_id: string;
  issue_type: "timeline" | "character_trait" | "relationship" | "reveal" | "world_rule";
  severity: "info" | "warn" | "block";
  summary: string;
  object_refs: Array<{
    ref_type: string;
    ref_id: string;
  }>;
  resolution_status: "open" | "accepted" | "fixed" | "ignored";
}

export interface ContinuityIssuesResponse {
  issues: ContinuityIssueView[];
  summary: {
    open_count: number;
    block_count: number;
  };
}

export interface ContinuitySuggestedPatchView {
  target_item_id: string;
  target_title: string;
  reason: string;
  summary: string;
}

export interface CanonContinuityBriefView {
  reveal_safe_summary: string;
  compact_summary: string;
  latest_reader_review_summary: string | null;
  open_issue_ids: string[];
  recent_patch_ids: string[];
  suggested_patch: ContinuitySuggestedPatchView | null;
}

export interface ContextSceneFocusView {
  source_artifact_type: "scene_card_set" | "outline_bundle";
  selected_scene_no: number;
  chapter_goal: string;
  chapter_cliffhanger_goal: string;
  scene_goal: string;
  scene_conflict: string;
  scene_turning_point: string;
  reveal_guard: string;
}

export interface ContextPromiseSliceView {
  front_ten_chapter_promise: string | null;
  relationship_promise: string | null;
  reader_review_summary: string | null;
  rewrite_targets: string[];
  promise_gap: string | null;
}

export interface ContextContinuityPolicyView {
  reveal_policy: "reveal_safe";
  reveal_safe_summary: string;
  compact_summary: string;
  suggested_patch: ContinuitySuggestedPatchView | null;
  guarded_canon_ids: string[];
  guarded_titles: string[];
  recent_patch_ids: string[];
  open_issue_ids: string[];
  reader_review_informed: boolean;
}

export interface ContextBundleResponse {
  bundle_id: string;
  task_type: "write" | "revise" | "compare_branch" | "summarize_asset";
  status: "ready" | "trimmed";
  composition_strategy: "scene_first";
  included_refs: Array<{
    ref_type: string;
    ref_id: string;
    title: string;
  }>;
  excluded_refs: Array<{
    ref_type: string;
    ref_id: string;
    title: string;
    reason_code: "CAN-102" | "CTX-101" | "AST-102";
    }>;
  token_budget: number;
  scene_focus: ContextSceneFocusView;
  promise_slice: ContextPromiseSliceView;
  continuity_policy: ContextContinuityPolicyView;
  trim_summary?: {
    reason_code: "CTX-101";
    trimmed_count: number;
  };
}
