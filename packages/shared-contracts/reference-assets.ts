export interface ReferenceAssetView {
  asset_id: string;
  account_id: string;
  story_id: string | null;
  scope: "story" | "user_private_library";
  file_name: string;
  mime_type: string;
  extract_status: "uploaded" | "review_pending" | "ready" | "failed" | "revoked";
}

export interface ReferenceAssetStoryTargetView {
  story_id: string;
  label: string;
  workspace_status: "draft" | "active" | "paused" | "archived";
  availability: "available" | "blocked";
  reason: string | null;
}

export interface ReferenceAssetLibraryEntryView {
  asset_id: string;
  file_name: string;
  scope: "story" | "user_private_library";
  scope_label: string;
  extract_status: "uploaded" | "review_pending" | "ready" | "failed" | "revoked";
  story_id: string | null;
  story_label: string | null;
  lineage_note: string;
  extract_count: number;
  active_attachment_count: number;
  active_story_ids: string[];
  active_story_labels: string[];
  last_updated_at: string;
}

export interface ReferenceAssetLibraryShelfView {
  shelf_id: "story_live" | "private_library";
  title: string;
  description: string;
  asset_count: number;
  entries: ReferenceAssetLibraryEntryView[];
}

export interface ReferenceAssetLibraryResponse {
  focus_story: {
    story_id: string;
    label: string;
  } | null;
  applied_filters: {
    query: string;
    scope: "all" | "story" | "user_private_library";
    status: "all" | "uploaded" | "review_pending" | "ready" | "failed" | "revoked";
  };
  total_asset_count: number;
  reusable_asset_count: number;
  active_attachment_count: number;
  shelves: ReferenceAssetLibraryShelfView[];
}

export interface AssetExtractResultView {
  extract_ref_id: string;
  extract_type: "character" | "location" | "relationship" | "style" | "theme" | "conflict_pattern";
  status: "suggested" | "accepted" | "rejected";
}

export interface AssetAttachmentView {
  attachment_id: string;
  asset_id: string;
  target_type: "story" | "canon_item";
  target_id: string;
  target_label?: string;
  usage_mode: "style" | "lore" | "character" | "world_rule" | "mood";
  status: "active" | "revoked";
}

export interface ReferenceAssetRevokeImpactView {
  affected_attachment_ids: string[];
  affected_story_targets: Array<{
    story_id: string;
    label: string;
    attachment_count: number;
  }>;
  affected_references: Array<{
    attachment_id: string;
    target_type: "story" | "canon_item";
    target_id: string;
    target_label: string;
    usage_mode: "style" | "lore" | "character" | "world_rule" | "mood";
  }>;
}

export interface ReferenceAssetDetailResponse {
  asset: ReferenceAssetView;
  scope_label?: string;
  available_story_targets?: ReferenceAssetStoryTargetView[];
  extract_results: AssetExtractResultView[];
  attachments: AssetAttachmentView[];
  revoke_impact?: ReferenceAssetRevokeImpactView;
}
