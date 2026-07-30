export interface BranchView {
  branch_id: string;
  story_id: string;
  anchor_ref: {
    chapter_id: string;
  };
  branch_type: string;
  goal: string;
  rights_mode: "private_sandbox" | "original_adaptation" | "export_blocked";
  merge_status: "kept_parallel" | "proposal_ready" | "merged" | "rejected";
  body_text: string;
  current_branch_chapter_id: string | null;
}

export interface BranchCreateRequest {
  anchor_ref: {
    chapter_id: string;
  };
  branch_type: string;
  goal: string;
  rights_mode: "private_sandbox" | "original_adaptation" | "export_blocked";
  client_request_id: string;
}

export interface BranchCreateResponse {
  branch_id: string;
  status: "branch_ready" | "invalid_anchor" | "blocked";
  error_code?: "BRN-101" | "BRN-201";
}

export interface BranchDetailResponse {
  branch: BranchView;
  diff_summary: {
    changed_sections: number;
    summary: string;
  };
  rights_summary: {
    rights_mode: BranchView["rights_mode"];
    export_allowed: boolean;
  };
  merge_proposals: MergeProposalView[];
}

export interface MergeProposalView {
  proposal_id: string;
  branch_id: string;
  target_story_version_id: string;
  merge_mode: "replace" | "selective_patch" | "keep_parallel";
  selected_sections: Array<{ label: string }>;
  status: "draft" | "accepted" | "conflicted" | "rejected";
}

export interface MergeProposalRequest {
  target_story_version_id: string;
  merge_mode: "replace" | "selective_patch" | "keep_parallel";
  selected_sections?: Array<{ label: string }>;
  client_request_id: string;
}

export interface MergeProposalResponse {
  proposal_id: string;
  status: "draft" | "conflicted";
  error_code?: "BRN-102";
}

export interface MergeProposalAcceptRequest {
  target_story_version_id: string;
  client_request_id: string;
}

export interface MergeProposalAcceptResponse {
  status: "accepted" | "conflicted";
  error_code?: "BRN-102";
  created_patch_refs: string[];
}
