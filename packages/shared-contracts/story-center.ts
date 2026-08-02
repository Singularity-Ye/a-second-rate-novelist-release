import type { ExportFormat, ExportJobStatus, RiskCheckResult } from "./export-rights.js";

export interface StoryCenterChapterSummaryView {
  chapter_id: string;
  chapter_no: number;
  title: string;
  status: "queued" | "generated" | "accepted" | "superseded";
  summary: string;
  route: string;
}

export interface StoryCenterExportSummaryView {
  job_id: string;
  export_purpose: string;
  requested_formats: ExportFormat[];
  status: ExportJobStatus;
  created_at: string;
  route: string;
}

export interface StoryCenterNotificationSummaryView {
  notification_id: string;
  category: "chapter_update" | "export" | "risk" | "membership" | "system";
  title: string;
  body: string;
  status: "unread" | "read" | "delivered" | "seen" | "acted" | "expired";
  source_type: string;
  created_at: string;
  target_route: string;
}

export interface StoryCenterListItemView {
  story_id: string;
  title: string;
  keywords: string[];
  workspace_status: "draft" | "active" | "paused" | "archived";
  updated_at: string;
  continuation_next_step: string | null;
  current_chapter: StoryCenterChapterSummaryView | null;
  latest_export: StoryCenterExportSummaryView | null;
}

export interface StoryCenterListResponse {
  active_story_id: string | null;
  items: StoryCenterListItemView[];
}

export interface StoryCenterDetailResponse extends StoryCenterListItemView {
  export_capability: {
    export_allowed: boolean;
    latest_risk_result: RiskCheckResult | null;
    latest_evidence_pack_id: string | null;
  };
  recent_notifications: StoryCenterNotificationSummaryView[];
}
