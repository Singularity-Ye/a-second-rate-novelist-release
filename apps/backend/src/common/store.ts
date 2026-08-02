import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
import type {
  BetaAccessState,
  BetaEntryChannel,
  BetaIncidentSeverity,
  BetaIncidentStatus,
  BetaIncidentSurface,
  BetaInviteIssuer,
  BetaInviteStatus,
  BetaOnboardingStatus,
  BetaSupportCategory,
  BetaSupportStatus,
  BetaSupportSurface,
  BetaSupportTargetObjectType,
  BetaProgramStatus,
  PersonaStateReasonRefView,
  PersonaSurfaceState,
  PolicyRiskTag,
  PolicySafetyMode,
  PolicyScope,
  PolicyVerdict,
  PublicReportCategory,
  PublicReportStatus,
  PublicReportSurface,
  ReportTargetObjectType,
  RoomVisualTokensView,
} from "@erliu/shared-contracts";
import { getPrismaClient, isPostgresTruthSourceConfigured } from "./truth-source/prisma.client.js";
import { readTruthSourceConfig, resolveJsonStateFile } from "./truth-source/truth-source.config.js";

export interface ShadowAccountRecord {
  account_id: string;
  account_token: string;
  account_status: "guest" | "active" | "recovery_pending" | "deletion_pending" | "deleted";
  primary_channel: string;
  accepted_policy_version?: string;
  created_at: string;
  updated_at: string;
}

export interface SessionRecord {
  session_id: string;
  account_id: string;
  device_id?: string;
  device_type?: string;
  revoked_at?: string | null;
  last_seen_at: string;
}

export interface NormalizedMessageRecord {
  id: string;
  account_id: string;
  channel_message_id: string;
  channel: string;
  text: string;
  created_at: string;
}

export interface AppState {
  accounts: ShadowAccountRecord[];
  sessions: SessionRecord[];
  messages: NormalizedMessageRecord[];
  intentEnvelopes: Array<{
    id: string;
    message_id: string;
    account_id: string;
    session_id: string;
    surface: "wechat_im" | "room" | "reader" | "export_center";
    channel: string;
    channel_message_id: string;
    story_id: string | null;
    chapter_id: string | null;
    message_text: string;
    attachments: Array<{
      file_name: string;
      mime_type: string;
      size_bytes: number;
    }>;
    delivery_constraints: {
      reply_window: "active" | "passive_limited";
      max_segment_chars: number;
      async_allowed: boolean;
    };
    intent_seed: {
      raw_text: string;
      source_surface: "chat" | "room";
    };
    created_at: string;
  }>;
  deepLinks: Array<{ token: string; account_id: string; expires_at: string }>;
  storyWorkspaces: Array<{
    id: string;
    account_id: string;
    title: string;
    keywords: string[];
    workspace_status: "draft" | "active" | "paused" | "archived";
    entry_surface?: "chat" | "room" | "story_list" | "deep_link";
    intake_mode?: "has_setting" | "only_feeling" | "repair_line" | "pitch_me";
    privacy_scope?: "private";
    commission_brief?: Record<string, unknown> | null;
    current_chapter_id?: string | null;
    created_at: string;
    updated_at: string;
    updated_by: string;
  }>;
  storyIntakeSessions: Array<{
    id: string;
    account_id: string;
    entry_surface: "chat" | "room" | "story_list";
    intake_mode: "has_setting" | "only_feeling" | "repair_line" | "pitch_me";
    brief_payload: Record<string, unknown>;
    status: "draft" | "proposals_ready" | "commission_confirmed" | "converted";
    selected_proposal_id: string | null;
    client_request_id: string;
    created_at: string;
    updated_at: string;
  }>;
  storyProposals: Array<{
    id: string;
    session_id: string;
    proposal_no: number;
    title: string;
    summary: string;
    payload: Record<string, unknown>;
    status: "generated" | "selected" | "discarded";
    created_at: string;
    updated_at: string;
  }>;
  chapters: Array<{
    id: string;
    story_id: string;
    chapter_no: number;
    status: "queued" | "generated" | "accepted" | "superseded";
    title: string;
    body_text: string;
    summary: string;
    scene_card_set?: Record<string, unknown> | null;
    reader_review?: Record<string, unknown> | null;
    generation_job_id: string | null;
    created_at: string;
    updated_at: string;
  }>;
  chapterRevisions: Array<{
    id: string;
    chapter_id: string;
    revision_kind: "rewrite" | "light_edit";
    instruction_text: string;
    anchor_range: {
      start_paragraph: number;
      end_paragraph: number;
    } | null;
    revised_text: string;
    source_intent_id: string;
    created_at: string;
    updated_at: string;
  }>;
  runtimeTasks: Array<{
    id: string;
    job_type: "proposal_generate" | "chapter_generate";
    account_id: string;
    story_id: string | null;
    session_id: string | null;
    target: "next_chapter" | "next_scene" | "first_chapter" | null;
    status: "queued" | "running" | "waiting_human" | "succeeded" | "failed" | "canceled";
    notification_id: string | null;
    result_chapter_id: string | null;
    client_request_id: string;
    idempotency_key: string;
    workflow_key?: string | null;
    adapter_kind?: string | null;
    context_bundle_id?: string | null;
    persona_snapshot_id?: string | null;
    callback_status?: "pending" | "applied" | "failed" | null;
    memory_map?: {
      context_ref_ids: string[];
      scene_ref_ids: string[];
      promise_ref_ids: string[];
      guarded_ref_ids: string[];
      persona_reason_ref_ids: string[];
      persona_state_code: string;
    } | null;
    agent_roster?: string[];
    tool_scope?: Array<{
      agent: string;
      tools: string[];
      access_mode: "read" | "write_patch" | "write_artifact" | "emit";
    }>;
    result_artifact_refs?: Array<{
      artifact_type:
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
      story_id: string | null;
      session_id?: string | null;
      chapter_id?: string | null;
      export_job_id?: string | null;
      object_key: string;
      created_at: string;
      contract_version?: "v1.1";
      writeback_owner?:
        | "story_intake_runtime"
        | "story_intake_accept"
        | "chapter_generation_callback"
        | "chapter_review_gate"
        | "chapter_acceptance"
        | "chapter_revision"
        | "rights_export";
      compatibility_aliases?: string[];
    }>;
    task_result_summary?: string | null;
    failure_kind?:
      | "model_failed"
      | "permission_denied"
      | "compliance_blocked"
      | "downstream_timeout"
      | "human_review_required"
      | "not_found"
      | null;
    dispatch_started_at?: string | null;
    callback_applied_at?: string | null;
    last_error?: string | null;
    created_at: string;
    updated_at: string;
  }>;
  notifications: Array<{
    id: string;
    account_id: string;
    story_id: string;
    title: string;
    body: string;
    deep_link: string;
    status: "unread" | "read" | "delivered" | "seen" | "acted" | "expired";
    category?: "chapter_update" | "export" | "risk" | "membership" | "system";
    source_type?: string;
    source_id?: string | null;
    created_at: string;
  }>;
  onboardingSessions: Array<{
    session_id: string;
    account_id: string;
    answers: Partial<Record<"reading_archive" | "taste_archive" | "boundaries" | "collaboration_mode", string>>;
    status: "collecting" | "confirm_pending" | "confirmed";
    updated_at: string;
  }>;
  profiles: Array<{
    id: string;
    account_id: string;
    reading_archive: { favorite_books: string[] };
    taste_archive: {
      relationship_preference: string[];
      pace: string;
      emotion: string;
      ending: string;
    };
    boundaries: { red_lines: string[] };
    collaboration_mode: "read_only" | "co_create" | "director";
    safety_mode: "default" | "minor_safe" | "strict";
    profile_status: "draft" | "confirmed" | "evolving" | "archived";
    last_confirmed_at: string | null;
    version_no: number;
  }>;
  chatRouteDecisions: Array<{
    id: string;
    message_id: string;
    account_id: string;
    candidate_story_ids: string[];
    selected_story_id: string | null;
    confidence_score: number;
    route_mode: "auto" | "clarified" | "parked";
    status: "pending" | "auto_resolved" | "ambiguous" | "user_confirmed" | "parked_to_recent" | "acknowledged";
    reason_summary: {
      matched_story_ids: string[];
      active_story_id: string | null;
      recent_story_id: string | null;
      fallback_mode: "none" | "recent_notes" | "new_story";
    };
    created_at: string;
    updated_at: string;
  }>;
  messageIntents: Array<{
    id: string;
    envelope_id: string;
    message_id: string;
    account_id: string;
    channel_message_id: string | null;
    final_intent: string;
    intent_type: string;
    target_type: string;
    target_id: string | null;
    target_label: string;
    ack_copy: string;
    deep_link: string | null;
    confidence_band: "high" | "medium" | "low";
    confidence_score: number;
    target_object: {
      object_type:
        | "reader_profile"
        | "canon"
        | "chapter"
        | "branch"
        | "workspace"
        | "asset"
        | "export_job"
        | "relationship_memory"
        | "route_decision"
        | "recent_note";
      object_id: string | null;
      object_label: string;
    };
    proposed_patch: Record<string, unknown> | null;
    route_hint:
      | "interviewer"
      | "architect"
      | "scene_writer"
      | "canon_keeper"
      | "rights_clerk"
      | "coordinator_only";
    correction_state: {
      status: "recorded" | "needs_clarification" | "corrected" | "replayed";
      entry_deep_link: string | null;
      last_corrected_at: string | null;
    };
    patch_document: Record<string, unknown> | null;
    status: "acknowledged" | "archived" | "corrected";
    version_no: number;
    created_at: string;
    updated_at: string;
  }>;
  channelEvents: Array<{
    id: string;
    account_id: string | null;
    session_id: string | null;
    channel: string;
    adapter_kind: string;
    direction: "inbound";
    provider_message_id: string;
    idempotency_key: string;
    status: "accepted" | "delivered";
    replay_count: number;
    last_replayed_at: string | null;
    message_text: string;
    attachment_handoff: Array<{
      handoff_id: string;
      file_name: string;
      mime_type: string;
      size_bytes: number;
      attachment_kind?: "voice" | "image" | "document" | "unknown";
      source_url?: string | null;
      inline_text?: string | null;
      inline_bytes_base64?: string | null;
      handoff_mode: "metadata_only" | "resolved";
      target: "multimodal_intake_queue";
      status: "deferred" | "processed" | "blocked";
      source_kind?: "inline_text" | "inline_base64" | "remote_url" | "metadata_only";
      capability_preflight?: {
        capability: "asr" | "ocr_document_extraction" | "vision_understanding";
        status: "ready" | "degraded" | "blocked";
        backend_id: string;
        budget_max_cost_usd: number;
        timeout_ms: number;
        secret_scope: string[];
        fallback_capability: string | null;
      } | null;
      artifact_ref_id?: string | null;
      reference_asset_id?: string | null;
      blocked_reason?: string | null;
      structured_result?: {
        summary: string;
        structured_text_preview: string | null;
        source_excerpt: string | null;
      } | null;
    }>;
    capability_preflight: {
      capability: "text_generation";
      status: "ready" | "degraded" | "blocked";
      backend_id: string;
      budget_max_cost_usd: number;
      timeout_ms: number;
      secret_scope: string[];
    };
    linked_message_id: string | null;
    linked_intent_id: string | null;
    linked_route_decision_id: string | null;
    response_snapshot: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
  }>;
  channelDeliveries: Array<{
    id: string;
    channel_event_id: string;
    channel: string;
    adapter_kind: string;
    status: "succeeded" | "partial_failed" | "failed";
    attempt_count: number;
    max_attempts: number;
    retry_backoff_ms: number;
    last_error: string | null;
    segments: Array<{
      segment_id: string;
      segment_index: number;
      kind: "ack" | "reply";
      text: string;
      status: "succeeded" | "failed";
      provider_delivery_id: string | null;
      attempts: Array<{
        attempt_no: number;
        status: "succeeded" | "failed";
        attempted_at: string;
        error_message: string | null;
      }>;
    }>;
    created_at: string;
    updated_at: string;
  }>;
  multimodalArtifacts: Array<{
    id: string;
    channel_event_id: string | null;
    handoff_id: string;
    account_id: string | null;
    session_id: string | null;
    story_id: string | null;
    file_name: string;
    mime_type: string;
    size_bytes: number;
    attachment_kind: "voice" | "image" | "document" | "unknown";
    source_kind: "inline_text" | "inline_base64" | "remote_url" | "metadata_only";
    source_locator: string | null;
    resolution_status: "processed" | "blocked";
    blocked_reason: string | null;
    fetch_status: "resolved" | "blocked" | "skipped";
    fetch_size_bytes: number;
    capability: "asr" | "ocr_document_extraction" | "vision_understanding";
    capability_status: "ready" | "degraded" | "blocked";
    backend_id: string;
    provider_id: string | null;
    model_id: string | null;
    timeout_ms: number;
    budget_max_cost_usd: number;
    structured_text: string | null;
    summary: string;
    reference_asset_id: string | null;
    created_at: string;
    updated_at: string;
  }>;
  relationshipContextMemories: Array<{
    id: string;
    account_id: string;
    story_workspace_id: string | null;
    message_id: string;
    memory_type: "care_signal" | "reassurance" | "tease" | "complaint" | "ritual";
    summary_text: string;
    expires_at: string;
    visibility_scope: "chat_only" | "chat_and_room_hint";
    created_at: string;
    updated_at: string;
  }>;
  canonItems: Array<{
    id: string;
    story_id: string;
    item_type: "character" | "location" | "relationship" | "world_rule" | "timeline_marker";
    title: string;
    attributes: Record<string, unknown>;
    reveal_level: "public_now" | "guarded" | "hidden";
    source_refs: Array<{
      ref_type: string;
      ref_id: string;
      title: string;
    }>;
    continuity_status: "stable" | "pending_patch" | "conflicted";
    version_no: number;
    created_at: string;
    updated_at: string;
  }>;
  canonPatches: Array<{
    id: string;
    story_id: string;
    target_item_id: string;
    patch_document: Record<string, unknown>;
    reason: string;
    status: "applied" | "conflicted";
    source_type: "user_action" | "branch_merge" | "continuity_fix" | "asset_attach";
    client_request_id: string;
    created_at: string;
  }>;
  continuityIssues: Array<{
    id: string;
    story_id: string;
    issue_type: "timeline" | "character_trait" | "relationship" | "reveal" | "world_rule";
    severity: "info" | "warn" | "block";
    summary: string;
    object_refs: Array<{
      ref_type: string;
      ref_id: string;
    }>;
    resolution_status: "open" | "accepted" | "fixed" | "ignored";
    created_at: string;
  }>;
  contextBundles: Array<{
    id: string;
    story_id: string;
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
    scene_focus: {
      source_artifact_type: "scene_card_set" | "outline_bundle";
      selected_scene_no: number;
      chapter_goal: string;
      chapter_cliffhanger_goal: string;
      scene_goal: string;
      scene_conflict: string;
      scene_turning_point: string;
      reveal_guard: string;
    };
    promise_slice: {
      front_ten_chapter_promise: string | null;
      relationship_promise: string | null;
      reader_review_summary: string | null;
      rewrite_targets: string[];
      promise_gap: string | null;
    };
    continuity_policy: {
      reveal_policy: "reveal_safe";
      reveal_safe_summary: string;
      compact_summary: string;
      suggested_patch: {
        target_item_id: string;
        target_title: string;
        reason: string;
        summary: string;
      } | null;
      guarded_canon_ids: string[];
      guarded_titles: string[];
      recent_patch_ids: string[];
      open_issue_ids: string[];
      reader_review_informed: boolean;
    };
    trim_summary: {
      reason_code: "CTX-101";
      trimmed_count: number;
    } | null;
    created_at: string;
  }>;
  storyBranches: Array<{
    id: string;
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
    created_at: string;
    updated_at: string;
  }>;
  branchMergeProposals: Array<{
    id: string;
    branch_id: string;
    target_story_version_id: string;
    merge_mode: "replace" | "selective_patch" | "keep_parallel";
    selected_sections: Array<{ label: string }>;
    status: "draft" | "accepted" | "conflicted" | "rejected";
    created_patch_refs: string[];
    created_at: string;
  }>;
  referenceAssets: Array<{
    id: string;
    account_id: string;
    story_id: string | null;
    scope: "story" | "user_private_library";
    file_name: string;
    mime_type: string;
    source_kind: "manual_upload" | "channel_attachment";
    source_ref_id: string | null;
    source_locator: string | null;
    extract_status: "uploaded" | "review_pending" | "ready" | "failed" | "revoked";
    created_at: string;
    updated_at: string;
  }>;
  assetExtractResults: Array<{
    id: string;
    asset_id: string;
    extract_type: "character" | "location" | "relationship" | "style" | "theme" | "conflict_pattern";
    payload: Record<string, unknown>;
    status: "suggested" | "accepted" | "rejected";
    created_at: string;
  }>;
  assetAttachments: Array<{
    id: string;
    asset_id: string;
    target_type: "story" | "canon_item";
    target_id: string;
    usage_mode: "style" | "lore" | "character" | "world_rule" | "mood";
    status: "active" | "revoked";
    created_at: string;
  }>;
  personaStateSnapshots: Array<{
    id: string;
    account_id: string;
    story_workspace_id: string | null;
    state_code: PersonaSurfaceState;
    label: string;
    mood_tags: string[];
    reason_refs: PersonaStateReasonRefView[];
    room_visual_tokens: RoomVisualTokensView;
    generated_at: string;
    visible_until: string;
  }>;
  accountIdentities: Array<{
    id: string;
    account_id: string;
    channel: string;
    provider_user_id: string;
    is_primary: boolean;
    verified_at: string;
  }>;
  syncConflicts: Array<{
    id: string;
    account_id: string;
    story_id: string;
    object_type: string;
    version_a: string;
    version_b: string;
    status: "detected" | "auto_merged" | "user_action_required" | "resolved";
    resolution: string | null;
    created_at: string;
    updated_at: string;
    resulting_branch_id: string | null;
  }>;
  notificationPreferences: Array<{
    account_id: string;
    in_app_enabled: boolean;
    push_enabled: boolean;
    im_enabled: boolean;
    quiet_hours: {
      enabled: boolean;
      start_local: string;
      end_local: string;
      time_zone: string;
    };
    categories: {
      export: boolean;
      risk: boolean;
      membership: boolean;
      system: boolean;
    };
    version_no: number;
    updated_at: string;
  }>;
  membershipPlans: Array<{
    plan_id: string;
    tier: string;
    story_slots: number;
    export_quota: number;
    branch_quota: number;
    asset_storage_mb: number;
    price: number;
    is_active: boolean;
  }>;
  membershipEntitlements: Array<{
    account_id: string;
    current_plan_id: string;
    story_slots: number;
    export_quota: number;
    branch_quota: number;
    asset_storage_mb: number;
    updated_at: string;
  }>;
  membershipOrders: Array<{
    id: string;
    account_id: string;
    target_plan_id: string;
    billing_cycle: string;
    payment_channel: string;
    trigger_reason: string | null;
    status: "paid";
    payable_amount: number;
    created_at: string;
  }>;
  privacyDataRequests: Array<{
    id: string;
    account_id: string;
    request_type: "export" | "delete" | "revoke_consent";
    scope: "account" | "story" | "asset";
    story_id: string | null;
    status: "queued" | "cooling_off";
    due_at: string;
    cooling_off_until: string | null;
    created_at: string;
  }>;
  riskChecks: Array<{
    id: string;
    story_id: string;
    export_purpose: string;
    branch_ids: string[];
    asset_refs: string[];
    label_mode_requested: "embedded_notice" | "label_waiver_requested";
    result: "pass" | "warn" | "block";
    issues: Array<{
      code: "CMP-004" | "CMP-005";
      severity: "warn" | "block";
      blocking: boolean;
      object_ref: {
        ref_type: "branch" | "story" | "export_job";
        ref_id: string;
      } | null;
      resolution_hint: string;
    }>;
    required_actions: string[];
    valid_until: string;
    evidence_entry_id: string;
    created_at: string;
  }>;
  riskReports: Array<{
    id: string;
    risk_check_id: string;
    story_id: string;
    manifest_version: "risk_report_v1";
    object_key: string;
    download_body: string;
    status: "ready";
    result: "pass" | "warn" | "block";
    label_mode_requested: "embedded_notice" | "label_waiver_requested";
    issues: Array<{
      code: "CMP-004" | "CMP-005";
      severity: "warn" | "block";
      blocking: boolean;
      object_ref: {
        ref_type: "branch" | "story" | "export_job";
        ref_id: string;
      } | null;
      resolution_hint: string;
    }>;
    required_actions: string[];
    valid_until: string;
    created_at: string;
  }>;
  exportJobs: Array<{
    id: string;
    story_id: string;
    account_id: string;
    export_purpose: string;
    requested_formats: Array<"docx" | "epub" | "pdf" | "md" | "txt">;
    chapter_range: {
      mode: "all" | "range";
      start_chapter_no?: number;
      end_chapter_no?: number;
    };
    branch_ids: string[];
    include_evidence: boolean;
    include_rights_statement: boolean;
    label_mode_preference: "embedded_notice" | "label_waiver_requested";
    risk_check_id: string;
    risk_acknowledged?: boolean;
    client_request_id: string;
    status: "blocked" | "queued" | "generating" | "partial_failed" | "succeeded";
    progress_stage: string;
    progress_percent: number;
    notification_id: string | null;
    evidence_pack_id: string | null;
    delivery_manifest_id?: string | null;
    rights_statement_body: string | null;
    error_code: string | null;
    error_message: string | null;
    created_at: string;
    finished_at: string | null;
    updated_at: string;
  }>;
  exportArtifacts: Array<{
    id: string;
    export_job_id: string;
    story_id: string;
    format: "docx" | "epub" | "pdf" | "md" | "txt";
    file_name: string;
    file_body: string;
    file_size_mb: number;
    object_key: string;
    expires_at: string;
    status: "ready";
    created_at: string;
  }>;
  evidencePacks: Array<{
    id: string;
    export_job_id: string;
    story_id: string;
    manifest_version: string;
    record_count: number;
    object_key: string;
    download_body: string;
    status: "ready";
    records: Array<{
      record_id: string;
      record_type: "event_log" | "audit_log" | "risk_check" | "artifact";
      label: string;
      created_at: string;
    }>;
    created_at: string;
  }>;
  deliveryManifests: Array<{
    id: string;
    export_job_id: string;
    story_id: string;
    manifest_version: "delivery_manifest_v1";
    label_mode_effective: "embedded_notice" | "label_waiver_requested";
    entry_count: number;
    object_key: string;
    download_body: string;
    status: "ready";
    entries: Array<{
      entry_type: "artifact" | "evidence_bundle" | "rights_statement" | "risk_report" | "export_manifest";
      label: string;
      ref_id: string;
      download_url: string | null;
      object_key: string | null;
    }>;
    created_at: string;
  }>;
  labelWaiverRequests: Array<{
    id: string;
    story_id: string;
    export_job_id: string;
    status: "pending_user_consent";
    justification: string;
    target_channel: string;
    user_acknowledgements: string[];
    consent_version: string;
    retained_until: string;
    ops_case_id: string | null;
    created_at: string;
  }>;
  reportCases: Array<{
    id: string;
    account_id: string;
    story_id: string | null;
    ops_case_id: string | null;
    status: PublicReportStatus;
    surface: PublicReportSurface;
    category: PublicReportCategory;
    summary: string;
    description: string;
    target_object: {
      object_type: ReportTargetObjectType;
      object_id: string;
      object_label: string | null;
    };
    evidence_refs: Array<{
      ref_type: string;
      ref_id: string;
      label: string | null;
      object_key: string | null;
    }>;
    latest_status_note: string | null;
    client_request_id: string;
    created_at: string;
    updated_at: string;
    sla_due_at: string;
  }>;
  eventLogs: Array<{
    event_name: string;
    account_id: string;
    payload: Record<string, string | number | boolean | null>;
    created_at: string;
  }>;
  auditLogs: Array<{
    event_name: string;
    account_id: string;
    payload: Record<string, string | number | boolean | null>;
    created_at: string;
  }>;
  policyEvaluations: Array<{
    id: string;
    scope: PolicyScope;
    account_id: string | null;
    story_id: string | null;
    source_ref: {
      ref_type: string;
      ref_id: string;
    };
    input_preview: string | null;
    verdict: PolicyVerdict;
    reason_codes: string[];
    risk_tags: PolicyRiskTag[];
    safety_mode: PolicySafetyMode;
    review_case_id: string | null;
    created_at: string;
  }>;
  metricSnapshots: Array<{
    metric_key: string;
    bucket_start: string;
    bucket_end: string;
    value: number;
    segment_key: string;
    freshness_status: "fresh" | "stale" | "delayed";
    created_at: string;
  }>;
  opsCases: Array<{
    id: string;
    case_type:
      | "export_review"
      | "risk_review"
      | "membership_exception"
      | "environment_alert"
      | "public_report"
      | "beta_support";
    priority: "P0" | "P1" | "P2";
    owner_id: string | null;
    status: "open" | "triaged" | "pending_user" | "pending_review" | "resolved" | "rejected";
    entity_type: string;
    entity_id: string;
    account_id: string | null;
    story_id: string | null;
    summary: string;
    source_ref: {
      ref_type: string;
      ref_id: string;
    };
    sla_due_at: string;
    created_at: string;
    updated_at: string;
  }>;
  reviewDecisions: Array<{
    id: string;
    case_id: string;
    decision: "approve" | "warn" | "block" | "request_info" | "escalate";
    note: string;
    actor_id: string;
    actor_role: string;
    notify_user: boolean;
    created_at: string;
  }>;
  opsAuditLogs: Array<{
    id: string;
    actor_role: string;
    action: string;
    entity_ref: {
      entity_type: string;
      entity_id: string;
    };
    payload: Record<string, string | number | boolean | null>;
    created_at: string;
  }>;
  environmentRegistry: Array<{
    environment_key: "shared-dev" | "staging" | "live";
    domain: string;
    release_version: string;
    health_status: "healthy" | "degraded" | "maintenance" | "blocked";
    blockers: string[];
    artifact_channel: string;
    secret_scope: string;
    last_deploy_at: string | null;
  }>;
  releaseCandidates: Array<{
    release_id: string;
    artifact_sha: string;
    artifact_uri: string;
    source_commit_sha: string;
    target_environment: "shared-dev" | "staging" | "live";
    migration_bundle_id: string;
    change_summary: string;
    status: "planned";
    verification_plan_id: string;
    created_at: string;
  }>;
  deploymentRuns: Array<{
    deployment_id: string;
    release_id: string;
    from_environment: "shared-dev" | "staging" | "live";
    to_environment: "shared-dev" | "staging" | "live";
    status: "planned" | "running" | "verifying" | "succeeded" | "failed" | "rolled_back";
    verification_result: "pending" | "passed" | "failed";
    migration_status: "pending" | "succeeded" | "failed" | "restored";
    started_at: string;
    completed_at: string | null;
  }>;
  backupSnapshots: Array<{
    snapshot_id: string;
    environment_key: "shared-dev" | "staging" | "live";
    snapshot_type: "database" | "object_storage" | "secrets" | "logs_archive";
    status: "scheduled" | "running" | "completed" | "failed" | "expired";
    verified_at: string | null;
    retained_until: string;
    created_at: string;
  }>;
  restoreDrills: Array<{
    drill_id: string;
    snapshot_id: string;
    environment_key: "shared-dev" | "staging" | "live";
    drill_type: "db_only" | "db_and_object_storage" | "full_stack";
    status: "running" | "completed" | "failed";
    result: "passed" | "failed" | null;
    rto_minutes: number | null;
    notes: string;
    created_at: string;
    completed_at: string | null;
  }>;
  alertIncidents: Array<{
    incident_id: string;
    environment_key: "shared-dev" | "staging" | "live";
    service: string;
    severity: "info" | "warn" | "critical";
    status: "open" | "acknowledged" | "resolved";
    release_id: string | null;
    summary: string;
    created_at: string;
  }>;
  betaPrograms: Array<{
    program_key: string;
    status: BetaProgramStatus;
    seat_limit: number;
    waitlist_open: boolean;
    invite_only: boolean;
    created_at: string;
    updated_at: string;
  }>;
  betaInvites: Array<{
    invite_code: string;
    program_key: string;
    status: BetaInviteStatus;
    source_channel: string;
    source_label: string;
    campaign_key: string;
    inviter_account_id: string | null;
    root_invite_code: string | null;
    issued_by: BetaInviteIssuer;
    allowed_channels: BetaEntryChannel[];
    max_redemptions: number;
    redeemed_count: number;
    redeemed_account_id: string | null;
    issued_at: string;
    updated_at: string;
  }>;
  betaAccessGrants: Array<{
    account_id: string;
    program_key: string;
    invite_code: string;
    access_state: BetaAccessState;
    onboarding_status: BetaOnboardingStatus;
    entry_channel: BetaEntryChannel;
    allowed_channels: BetaEntryChannel[];
    bound_channels: BetaEntryChannel[];
    source_channel: string;
    source_label: string;
    campaign_key: string;
    inviter_account_id: string | null;
    root_invite_code: string | null;
    next_step_copy: string;
    deny_reason_copy: string | null;
    created_at: string;
    updated_at: string;
  }>;
  betaSupportCases: Array<{
    id: string;
    account_id: string;
    story_id: string | null;
    ops_case_id: string | null;
    status: BetaSupportStatus;
    surface: BetaSupportSurface;
    category: BetaSupportCategory;
    priority: "P0" | "P1" | "P2";
    summary: string;
    description: string;
    target_object: {
      object_type: BetaSupportTargetObjectType;
      object_id: string;
      object_label: string | null;
    };
    latest_status_note: string | null;
    client_request_id: string;
    created_at: string;
    updated_at: string;
    sla_due_at: string;
  }>;
  betaIncidentBroadcasts: Array<{
    incident_id: string;
    alert_incident_id: string;
    program_key: string;
    severity: BetaIncidentSeverity;
    status: BetaIncidentStatus;
    headline: string;
    summary: string;
    recommended_action: string;
    affected_surfaces: BetaIncidentSurface[];
    notification_ids: string[];
    created_at: string;
    updated_at: string;
    resolved_at: string | null;
  }>;
}

export const EMPTY_STATE: AppState = {
  accounts: [],
  sessions: [],
  messages: [],
  intentEnvelopes: [],
  deepLinks: [],
  storyWorkspaces: [],
  storyIntakeSessions: [],
  storyProposals: [],
  chapters: [],
  chapterRevisions: [],
  runtimeTasks: [],
  notifications: [],
  onboardingSessions: [],
  profiles: [],
  chatRouteDecisions: [],
  messageIntents: [],
  channelEvents: [],
  channelDeliveries: [],
  multimodalArtifacts: [],
  relationshipContextMemories: [],
  canonItems: [],
  canonPatches: [],
  continuityIssues: [],
  contextBundles: [],
  storyBranches: [],
  branchMergeProposals: [],
  referenceAssets: [],
  assetExtractResults: [],
  assetAttachments: [],
  personaStateSnapshots: [],
  accountIdentities: [],
  syncConflicts: [],
  notificationPreferences: [],
  membershipPlans: [],
  membershipEntitlements: [],
  membershipOrders: [],
  privacyDataRequests: [],
  riskChecks: [],
  riskReports: [],
  exportJobs: [],
  exportArtifacts: [],
  evidencePacks: [],
  deliveryManifests: [],
  labelWaiverRequests: [],
  reportCases: [],
  eventLogs: [],
  auditLogs: [],
  policyEvaluations: [],
  metricSnapshots: [],
  opsCases: [],
  reviewDecisions: [],
  opsAuditLogs: [],
  environmentRegistry: [],
  releaseCandidates: [],
  deploymentRuns: [],
  backupSnapshots: [],
  restoreDrills: [],
  alertIncidents: [],
  betaPrograms: [],
  betaInvites: [],
  betaAccessGrants: [],
  betaSupportCases: [],
  betaIncidentBroadcasts: [],
};

interface AppStateDriver {
  kind: "json_file" | "postgres_prisma";
  readState(): Promise<AppState>;
  writeState(state: AppState): Promise<void>;
}

export interface PostgresPrimaryAppStateDriver {
  readState(): Promise<AppState>;
  writeState(state: AppState): Promise<void>;
}

const PRIMARY_APP_STATE_KEY = "default";
let postgresPrimaryAppStateDriverOverride: PostgresPrimaryAppStateDriver | null = null;

function normalizeAppState(parsed: Partial<AppState> | null | undefined): AppState {
  return {
    accounts: parsed?.accounts ?? [],
    sessions: parsed?.sessions ?? [],
    messages: parsed?.messages ?? [],
    intentEnvelopes: parsed?.intentEnvelopes ?? [],
    deepLinks: parsed?.deepLinks ?? [],
    storyWorkspaces: parsed?.storyWorkspaces ?? [],
    storyIntakeSessions: parsed?.storyIntakeSessions ?? [],
    storyProposals: parsed?.storyProposals ?? [],
    chapters: parsed?.chapters ?? [],
    chapterRevisions: parsed?.chapterRevisions ?? [],
    runtimeTasks:
      parsed?.runtimeTasks?.map((task) => ({
        ...task,
        memory_map:
          task.memory_map && typeof task.memory_map === "object"
            ? task.memory_map
            : null,
      })) ?? [],
    notifications: parsed?.notifications ?? [],
    onboardingSessions: parsed?.onboardingSessions ?? [],
    profiles: parsed?.profiles ?? [],
    chatRouteDecisions: parsed?.chatRouteDecisions ?? [],
    messageIntents:
      parsed?.messageIntents?.map((intent) => ({
        ...intent,
        envelope_id: typeof intent.envelope_id === "string" ? intent.envelope_id : intent.message_id,
        confidence_score:
          typeof intent.confidence_score === "number"
            ? intent.confidence_score
            : intent.confidence_band === "high"
              ? 0.85
              : intent.confidence_band === "medium"
                ? 0.6
                : 0.35,
        target_object:
          intent.target_object && typeof intent.target_object === "object"
            ? intent.target_object
            : {
                object_type:
                  intent.target_type === "story_workspace"
                    ? "workspace"
                    : intent.target_type === "route_decision"
                      ? "route_decision"
                      : "recent_note",
                object_id: intent.target_id ?? null,
                object_label: intent.target_label ?? "最近记下",
              },
        proposed_patch:
          intent.proposed_patch && typeof intent.proposed_patch === "object"
            ? intent.proposed_patch
            : intent.patch_document ?? null,
        route_hint:
          typeof intent.route_hint === "string" ? intent.route_hint : "coordinator_only",
        correction_state:
          intent.correction_state && typeof intent.correction_state === "object"
            ? intent.correction_state
            : {
                status: intent.status === "corrected" ? "corrected" : "recorded",
                entry_deep_link: intent.deep_link ?? null,
                last_corrected_at: null,
              },
      })) ?? [],
    channelEvents: parsed?.channelEvents ?? [],
    channelDeliveries: parsed?.channelDeliveries ?? [],
    multimodalArtifacts: parsed?.multimodalArtifacts ?? [],
    relationshipContextMemories: parsed?.relationshipContextMemories ?? [],
    canonItems: parsed?.canonItems ?? [],
    canonPatches: parsed?.canonPatches ?? [],
    continuityIssues: parsed?.continuityIssues ?? [],
    contextBundles:
      parsed?.contextBundles?.map((bundle) => ({
        ...bundle,
        composition_strategy: bundle.composition_strategy ?? "scene_first",
        scene_focus:
          bundle.scene_focus && typeof bundle.scene_focus === "object"
            ? bundle.scene_focus
            : {
                source_artifact_type: "outline_bundle",
                selected_scene_no: 1,
                chapter_goal: "把重逢后的试探、关系拉扯与站队风险先推到不可回头的一步。",
                chapter_cliffhanger_goal: "前十章先把试探、站队与旧债钉住。",
                scene_goal: "让两人在当前场景里先撞见，重新点燃旧张力。",
                scene_conflict: "都想装作平静，却先一步暴露出还没放下。",
                scene_turning_point: "其中一人先叫出了另一个人的旧称呼。",
                reveal_guard: "先别把真正站队和旧债底牌摊开。",
              },
        promise_slice:
          bundle.promise_slice && typeof bundle.promise_slice === "object"
            ? bundle.promise_slice
            : {
                front_ten_chapter_promise: null,
                relationship_promise: null,
                reader_review_summary: null,
                rewrite_targets: [],
                promise_gap: null,
              },
        continuity_policy:
          bundle.continuity_policy && typeof bundle.continuity_policy === "object"
            ? bundle.continuity_policy
            : {
                reveal_policy: "reveal_safe",
                reveal_safe_summary: "当前没有额外 reveal guard。",
                compact_summary: "当前没有 continuity 摘要。",
                suggested_patch: null,
                guarded_canon_ids: [],
                guarded_titles: [],
                recent_patch_ids: [],
                open_issue_ids: [],
                reader_review_informed: false,
              },
      })) ?? [],
    storyBranches: parsed?.storyBranches ?? [],
    branchMergeProposals: parsed?.branchMergeProposals ?? [],
    referenceAssets: parsed?.referenceAssets ?? [],
    assetExtractResults: parsed?.assetExtractResults ?? [],
    assetAttachments: parsed?.assetAttachments ?? [],
    personaStateSnapshots: parsed?.personaStateSnapshots ?? [],
    accountIdentities: parsed?.accountIdentities ?? [],
    syncConflicts: parsed?.syncConflicts ?? [],
    notificationPreferences: parsed?.notificationPreferences ?? [],
    membershipPlans: parsed?.membershipPlans ?? [],
    membershipEntitlements: parsed?.membershipEntitlements ?? [],
    membershipOrders: parsed?.membershipOrders ?? [],
    privacyDataRequests: parsed?.privacyDataRequests ?? [],
    riskChecks: parsed?.riskChecks ?? [],
    riskReports: parsed?.riskReports ?? [],
    exportJobs: parsed?.exportJobs ?? [],
    exportArtifacts: parsed?.exportArtifacts ?? [],
    evidencePacks: parsed?.evidencePacks ?? [],
    deliveryManifests: parsed?.deliveryManifests ?? [],
    labelWaiverRequests: parsed?.labelWaiverRequests ?? [],
    reportCases: parsed?.reportCases ?? [],
    eventLogs: parsed?.eventLogs ?? [],
    auditLogs: parsed?.auditLogs ?? [],
    policyEvaluations: parsed?.policyEvaluations ?? [],
    metricSnapshots: parsed?.metricSnapshots ?? [],
    opsCases: parsed?.opsCases ?? [],
    reviewDecisions: parsed?.reviewDecisions ?? [],
    opsAuditLogs: parsed?.opsAuditLogs ?? [],
    environmentRegistry: parsed?.environmentRegistry ?? [],
    releaseCandidates: parsed?.releaseCandidates ?? [],
    deploymentRuns: parsed?.deploymentRuns ?? [],
    backupSnapshots: parsed?.backupSnapshots ?? [],
    restoreDrills: parsed?.restoreDrills ?? [],
    alertIncidents: parsed?.alertIncidents ?? [],
    betaPrograms: parsed?.betaPrograms ?? [],
    betaInvites: parsed?.betaInvites ?? [],
    betaAccessGrants: parsed?.betaAccessGrants ?? [],
    betaSupportCases: parsed?.betaSupportCases ?? [],
    betaIncidentBroadcasts: parsed?.betaIncidentBroadcasts ?? [],
  };
}

function toInputJson(value: AppState) {
  return value as unknown as Prisma.InputJsonValue;
}

function createJsonFileDriver(
  env: Record<string, string | undefined> = process.env,
): AppStateDriver {
  const stateFile = resolveJsonStateFile(env);
  const stateDir = path.dirname(stateFile);

  return {
    kind: "json_file",
    async readState() {
      if (!existsSync(stateFile)) {
        mkdirSync(stateDir, { recursive: true });
        writeFileSync(stateFile, JSON.stringify(EMPTY_STATE, null, 2), "utf8");
      }

      const raw = readFileSync(stateFile, "utf8").trim();
      return normalizeAppState(raw ? (JSON.parse(raw) as Partial<AppState>) : EMPTY_STATE);
    },
    async writeState(state: AppState) {
      mkdirSync(stateDir, { recursive: true });
      writeFileSync(stateFile, JSON.stringify(state, null, 2), "utf8");
    },
  };
}

function createPostgresPrimaryDriver(
  env: Record<string, string | undefined> = process.env,
): AppStateDriver {
  const jsonSeedDriver = createJsonFileDriver({
    ...env,
    APP_DATA_FILE: resolveJsonStateFile(env),
  });

  return {
    kind: "postgres_prisma",
    async readState() {
      if (postgresPrimaryAppStateDriverOverride) {
        return postgresPrimaryAppStateDriverOverride.readState();
      }

      const prisma = getPrismaClient(env);
      const existing = await prisma.appStateSnapshot.findUnique({
        where: {
          stateKey: PRIMARY_APP_STATE_KEY,
        },
      });

      if (existing) {
        return normalizeAppState(existing.payload as Partial<AppState>);
      }

      const seedState = await jsonSeedDriver.readState();
      await prisma.appStateSnapshot.create({
        data: {
          stateKey: PRIMARY_APP_STATE_KEY,
          schemaVersion: 1,
          stateVersion: 1,
          payload: toInputJson(seedState),
        },
      });
      return seedState;
    },
    async writeState(state: AppState) {
      if (postgresPrimaryAppStateDriverOverride) {
        await postgresPrimaryAppStateDriverOverride.writeState(state);
        return;
      }

      const prisma = getPrismaClient(env);
      await prisma.appStateSnapshot.upsert({
        where: {
          stateKey: PRIMARY_APP_STATE_KEY,
        },
        create: {
          stateKey: PRIMARY_APP_STATE_KEY,
          schemaVersion: 1,
          stateVersion: 1,
          payload: toInputJson(state),
        },
        update: {
          payload: toInputJson(state),
          stateVersion: {
            increment: 1,
          },
        },
      });
    },
  };
}

function createAppStateDriver(
  env: Record<string, string | undefined> = process.env,
): AppStateDriver {
  const config = readTruthSourceConfig(env);

  if (isPostgresTruthSourceConfigured(env)) {
    return createPostgresPrimaryDriver(env);
  }

  return createJsonFileDriver({
    ...env,
    APP_DATA_FILE: config.json_state_file,
  });
}

export function __setPostgresPrimaryAppStateDriverForTests(
  override: PostgresPrimaryAppStateDriver | null,
) {
  postgresPrimaryAppStateDriverOverride = override;
}

export async function readAppState(): Promise<AppState> {
  return createAppStateDriver().readState();
}

export async function writeAppState(state: AppState): Promise<void> {
  await createAppStateDriver().writeState(state);
}
