import type { PolicyVerdictView } from "./governance-policy.js";

export type ExportFormat = "docx" | "epub" | "pdf" | "md" | "txt";
export type ExportLabelMode = "embedded_notice" | "label_waiver_requested";
export type ExportJobStatus = "blocked" | "queued" | "generating" | "partial_failed" | "succeeded";
export type RiskCheckResult = "pass" | "warn" | "block";

export interface ExportListItemView {
  job_id: string;
  story_id: string;
  export_purpose: string;
  requested_formats: ExportFormat[];
  status: ExportJobStatus;
  created_at: string;
  evidence_pack_id: string | null;
}

export interface StoryExportsListResponse {
  jobs: ExportListItemView[];
}

export interface ExportCapabilitiesResponse {
  story_id: string;
  workspace_status: string;
  export_allowed: boolean;
  allowed_formats: ExportFormat[];
  blocked_branch_ids: string[];
  quota: {
    remaining_exports_this_period: number;
    rights_pack_remaining: number;
  };
  label_options: ExportLabelMode[];
  latest_risk_summary: {
    result: RiskCheckResult;
    issue_codes: string[];
    valid_until: string;
  } | null;
  latest_evidence_pack_id: string | null;
}

export interface RiskIssueView {
  code: "CMP-004" | "CMP-005";
  severity: "warn" | "block";
  blocking: boolean;
  object_ref: {
    ref_type: "branch" | "story" | "export_job";
    ref_id: string;
  } | null;
  resolution_hint: string;
}

export interface RiskReportView {
  report_id: string;
  risk_check_id: string;
  manifest_version: "risk_report_v1";
  result: RiskCheckResult;
  label_mode_requested: ExportLabelMode;
  issues: RiskIssueView[];
  required_actions: string[];
  valid_until: string;
  created_at: string;
  download_url: string;
}

export interface RiskCheckResponse {
  risk_check_id: string;
  result: RiskCheckResult;
  issues: RiskIssueView[];
  required_actions: string[];
  valid_until: string;
  evidence_entry_id: string;
  risk_report: RiskReportView;
  policy_verdict?: PolicyVerdictView;
}

export interface ExportJobCreateRequest {
  export_purpose: string;
  formats: ExportFormat[];
  chapter_range: {
    mode: "all" | "range";
    start_chapter_no?: number;
    end_chapter_no?: number;
  };
  branch_ids: string[];
  include_evidence: boolean;
  include_rights_statement: boolean;
  label_mode_preference: ExportLabelMode;
  risk_check_id: string;
  risk_acknowledged?: boolean;
  client_request_id: string;
}

export interface ExportJobCreateResponse {
  job_id: string;
  status: ExportJobStatus;
  progress_stage: string;
  notification_id: string | null;
  next_action: string | null;
  estimated_ready_at: string | null;
  error_code?: "CMP-004" | "CMP-005" | "EXP-201" | "EXP-202";
}

export interface ExportJobView {
  job_id: string;
  job_type: "export";
  status: ExportJobStatus;
  progress_stage: string;
  progress_percent: number;
  notification_id: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  finished_at: string | null;
}

export interface ExportArtifactView {
  artifact_id: string;
  format: ExportFormat;
  file_name: string;
  file_size_mb: number;
  expires_at: string;
  download_url: string;
  status: "ready";
}

export interface EvidenceBundleView {
  pack_id: string;
  manifest_version: string;
  download_url: string;
}

export interface ExportManifestLinkView {
  artifact_type: "export_manifest";
  object_key: string;
  download_url: string;
}

export interface DeliveryManifestView {
  manifest_id: string;
  manifest_version: "delivery_manifest_v1";
  label_mode_effective: ExportLabelMode;
  entry_count: number;
  download_url: string;
}

export interface ExportControlResultView {
  verdict: RiskCheckResult;
  blocking: boolean;
  label_mode_effective: ExportLabelMode;
  label_decision_state: "default_embedded" | "waiver_pending" | "waiver_submitted";
  required_actions: string[];
  issue_codes: string[];
  policy_verdict?: PolicyVerdictView;
}

export interface ExportJobDetailResponse {
  job: ExportJobView;
  artifacts: ExportArtifactView[];
  risk_summary: {
    result: RiskCheckResult;
    issue_codes: string[];
    warning_count: number;
    blocked_reason_codes: string[];
  };
  label_mode_effective: ExportLabelMode;
  control_result: ExportControlResultView;
  risk_report: RiskReportView;
  delivery_manifest: DeliveryManifestView;
  export_manifest: ExportManifestLinkView;
  evidence_bundle: EvidenceBundleView | null;
  evidence_pack_id: string | null;
  rights_statement_url: string | null;
}

export interface EvidenceRecordView {
  record_id: string;
  record_type: "event_log" | "audit_log" | "risk_check" | "artifact";
  label: string;
  created_at: string;
}

export interface EvidencePackDetailResponse {
  pack_id: string;
  story_id: string;
  manifest_version: string;
  record_count: number;
  records: EvidenceRecordView[];
  download_url: string;
}

export interface LabelWaiverRequestResponse {
  waiver_request_id: string;
  status: "pending_user_consent";
  consent_version: string;
  retained_until: string;
  ops_case_id: string | null;
}
