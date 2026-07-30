export type TrustLegalSlug = "terms" | "privacy" | "aigc";

export type PublicReportSurface = "room" | "reader" | "export" | "settings";

export type PublicReportCategory =
  | "content_safety"
  | "minor_safety"
  | "privacy"
  | "harassment_abuse"
  | "rights_labeling"
  | "other";

export type ReportTargetObjectType =
  | "room_session"
  | "story_chapter"
  | "export_job"
  | "account_privacy"
  | "chat_thread"
  | "reference_asset";

export type PublicReportStatus = "submitted" | "triaged" | "pending_user" | "under_review" | "resolved" | "rejected";
export type TrustCaseType = "public_report" | "risk_review" | "export_review";

export interface TrustCaseSummary {
  case_type: TrustCaseType;
  case_id: string;
  ops_case_id: string;
  status: PublicReportStatus;
  summary: string;
  latest_status_note: string | null;
  created_at: string;
  updated_at: string;
  sla_due_at: string;
  target_route: string | null;
  legal_links: {
    terms_url: string;
    privacy_url: string;
    aigc_url: string;
  };
}

export interface ReportCaseCreateRequest {
  account_token: string;
  story_id?: string;
  surface: PublicReportSurface;
  category: PublicReportCategory;
  summary: string;
  description: string;
  target_object: {
    object_type: ReportTargetObjectType;
    object_id: string;
    object_label?: string | null;
  };
  evidence_refs: Array<{
    ref_type: string;
    ref_id: string;
    label?: string | null;
    object_key?: string | null;
  }>;
  client_request_id: string;
}

export interface ReportCaseResponse extends TrustCaseSummary {
  case_type: "public_report";
  case_id: string;
  ops_case_id: string;
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
  created_at: string;
  updated_at: string;
  sla_due_at: string;
}

export interface ReportCaseListResponse {
  items: TrustCaseSummary[];
}

export interface TrustLegalDocument {
  slug: TrustLegalSlug;
  title: string;
  url: string;
  version: string;
  summary: string;
  bullets: string[];
}

export interface TrustLegalSummaryResponse {
  documents: TrustLegalDocument[];
  reporting_entry: {
    new_case_url: string;
    history_url: string;
    default_privacy_copy: string;
    sla_copy: string;
    contact_copy: string;
  };
}

export const TRUST_LEGAL_DOCUMENTS: TrustLegalDocument[] = [
  {
    slug: "terms",
    title: "服务协议",
    url: "/legal/terms",
    version: "2026-04-03",
    summary: "明确平台提供的是创作与治理服务，不承诺版权归属、登记结果或法律结论。",
    bullets: [
      "平台提供创作、治理、导出与举报处理能力，不替代法律意见。",
      "用户对下载、传播、商业使用承担责任，平台承担合规治理责任。",
      "涉及风险、权利与举报的操作都会留下最小必要留痕。",
    ],
  },
  {
    slug: "privacy",
    title: "隐私政策",
    url: "/legal/privacy",
    version: "2026-04-03",
    summary: "所有故事、素材和输入默认私密，仅在功能运行和风险处置所需范围内最小必要使用。",
    bullets: [
      "默认私密：新故事、参考资产和聊天输入默认不公开。",
      "最小必要留存：仅保留运行、申诉、导出和治理所需记录。",
      "举报与风险处置会调阅必要证据，但不会扩大公开范围。",
    ],
  },
  {
    slug: "aigc",
    title: "AIGC 标识说明",
    url: "/legal/aigc",
    version: "2026-04-03",
    summary: "生成内容默认附带 AIGC 说明，导出链路默认保留标识；无显式标识仅能走审批留痕流程。",
    bullets: [
      "站内阅读、导出和外发默认保留 AIGC 与创作背景说明。",
      "无显式标识导出必须走用户确认、风险审核和不少于 180 天留痕。",
      "平台保留风险报告、证据包与标识策略变更记录，供治理与申诉使用。",
    ],
  },
];
