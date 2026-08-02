import { randomUUID } from "node:crypto";
import type {
  PublicReportCategory,
  PublicReportStatus,
  ReportCaseCreateRequest,
  ReportCaseListResponse,
  ReportCaseResponse,
  TrustCaseSummary,
  TrustLegalSummaryResponse,
} from "@erliu/shared-contracts";
import { TRUST_LEGAL_DOCUMENTS } from "@erliu/shared-contracts";
import { createAccountRepository } from "../../common/repositories/account.repository.js";
import { createAccountMembershipRepository } from "../../common/repositories/account-membership.repository.js";
import { createOpsControlRepository } from "../../common/repositories/ops-control.repository.js";
import { createReportingCaseRepository } from "../../common/repositories/reporting-case.repository.js";
import { readAppState, writeAppState } from "../../common/store.js";
import { ensureDerivedOpsCases } from "../ops-console/ops-case-derivation.js";
import { recordDomainEvent } from "../telemetry-intake/telemetry-intake.service.js";

const H5_BASE_URL = process.env.H5_BASE_URL ?? "http://127.0.0.1:3000";
const REPORT_HISTORY_PATH = "/report/new?tab=history";

export async function getTrustLegalSummary(): Promise<TrustLegalSummaryResponse> {
  return {
    documents: TRUST_LEGAL_DOCUMENTS.map((item) => ({
      ...item,
      url: `${H5_BASE_URL}${item.url}`,
    })),
    reporting_entry: {
      new_case_url: `${H5_BASE_URL}/report/new`,
      history_url: `${H5_BASE_URL}${REPORT_HISTORY_PATH}`,
      default_privacy_copy: "所有内容默认私密，仅在处理举报、复核或申诉时按最小必要范围调阅。",
      sla_copy: "P0 4 小时内受理，P1 24 小时内反馈，复杂取证会进入持续通知。",
      contact_copy: "统一举报入口支持回看状态、SLA 和最近通知，不再散落在单个页面。",
    },
  };
}

export async function createReportCase(input: ReportCaseCreateRequest): Promise<ReportCaseResponse> {
  const account = await ensureAccount(input.account_token);
  const reportingRepository = createReportingCaseRepository();
  const opsRepository = createOpsControlRepository();
  const membershipRepository = createAccountMembershipRepository();
  const now = new Date().toISOString();
  const case_id = randomUUID();
  const reportRecord = {
    id: case_id,
    account_id: account.account_id,
    story_id: input.story_id ?? null,
    ops_case_id: null,
    status: "submitted" as const,
    surface: input.surface,
    category: input.category,
    summary: input.summary.trim(),
    description: input.description.trim(),
    target_object: {
      object_type: input.target_object.object_type,
      object_id: input.target_object.object_id,
      object_label: input.target_object.object_label ?? null,
    },
    evidence_refs: input.evidence_refs.map((item) => ({
      ref_type: item.ref_type,
      ref_id: item.ref_id,
      label: item.label ?? null,
      object_key: item.object_key ?? null,
    })),
    latest_status_note: "已提交，等待受理。",
    client_request_id: input.client_request_id,
    created_at: now,
    updated_at: now,
    sla_due_at: new Date(Date.now() + getSlaHours(input.category) * 60 * 60 * 1000).toISOString(),
  };
  await reportingRepository.createReportCase(reportRecord);

  const opsCase = await opsRepository.createOpsCase({
    case_type: "public_report",
    priority: getPriority(input.category),
    owner_id: null,
    status: "open",
    entity_type: "public_report_case",
    entity_id: case_id,
    account_id: account.account_id,
    story_id: input.story_id ?? null,
    summary: `[${input.category}] ${input.summary.trim()}`,
    source_ref: {
      ref_type: "public_report_case",
      ref_id: case_id,
    },
    sla_due_at: reportRecord.sla_due_at,
    created_at: now,
    updated_at: now,
  });

  const saved = await reportingRepository.saveReportCase({
    ...reportRecord,
    ops_case_id: opsCase.id,
  });

  await membershipRepository.createNotification({
    account_id: account.account_id,
    story_id: input.story_id ?? "",
    title: "举报已提交",
    body: "我们已经收到你的举报，会按 SLA 回看并继续通知你处理状态。",
    deep_link: `${H5_BASE_URL}${REPORT_HISTORY_PATH}`,
    status: "delivered",
    category: "system",
    source_type: "public_report_case",
    source_id: case_id,
    created_at: now,
  });

  await appendTrustAuditLog({
    account_id: account.account_id,
    event_name: "public_report_case_created",
    payload: {
      case_id,
      category: input.category,
      surface: input.surface,
      target_object_type: input.target_object.object_type,
      evidence_ref_count: input.evidence_refs.length,
    },
  });
  await recordDomainEvent({
    event_name: "public_report_case_created",
    account_id: account.account_id,
    payload: {
      case_id,
      category: input.category,
      surface: input.surface,
    },
  });

  return toReportCaseResponse(saved, opsCase.id);
}

export async function listReportCases(input: { account_token: string }): Promise<ReportCaseListResponse> {
  const account = await ensureAccount(input.account_token);
  const repository = createReportingCaseRepository();
  const opsState = await createOpsControlRepository().readOpsViewState();
  ensureDerivedOpsCases(opsState);
  const latestReviewDecisionByCaseId = new Map(
    opsState.reviewDecisions
      .slice()
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
      .map((item) => [item.case_id, item]),
  );
  const reportCases = (await repository.listReportCasesByAccount(account.account_id)).map((item) =>
    toReportCaseResponse(item, item.ops_case_id ?? ""),
  );
  const derivedTrustCases = opsState.opsCases
    .filter((item) => item.account_id === account.account_id)
    .filter(isDerivedTrustOpsCase)
    .map((item) =>
      toOpsTrustCaseSummary({
        ops_case: item,
        latest_status_note: latestReviewDecisionByCaseId.get(item.id)?.note ?? null,
      }),
    );

  return {
    items: [...reportCases, ...derivedTrustCases].sort((left, right) => right.updated_at.localeCompare(left.updated_at)),
  };
}

function isDerivedTrustOpsCase(
  item: Awaited<ReturnType<ReturnType<typeof createOpsControlRepository>["readOpsViewState"]>>["opsCases"][number],
): item is Awaited<ReturnType<ReturnType<typeof createOpsControlRepository>["readOpsViewState"]>>["opsCases"][number] & {
  case_type: "risk_review" | "export_review";
} {
  return item.case_type === "risk_review" || item.case_type === "export_review";
}

export async function syncReportCaseWithOpsDecision(input: {
  ops_case_id: string;
  ops_status: "open" | "triaged" | "pending_user" | "pending_review" | "resolved" | "rejected";
  note: string;
}) {
  const repository = createReportingCaseRepository();
  const existing = await repository.findReportCaseByOpsCaseId(input.ops_case_id);

  if (!existing) {
    return null;
  }

  const nextStatus = toPublicReportStatus(input.ops_status);
  const updated = await repository.saveReportCase({
    ...existing,
    status: nextStatus,
    latest_status_note: input.note,
    updated_at: new Date().toISOString(),
  });

  await appendTrustAuditLog({
    account_id: updated.account_id,
    event_name: "public_report_case_status_updated",
    payload: {
      case_id: updated.id,
      ops_case_id: input.ops_case_id,
      status: nextStatus,
    },
  });

  return updated;
}

function toReportCaseResponse(input: {
  id: string;
  ops_case_id: string | null;
  status: PublicReportStatus;
  surface: ReportCaseResponse["surface"];
  category: ReportCaseResponse["category"];
  summary: string;
  description: string;
  target_object: ReportCaseResponse["target_object"];
  evidence_refs: ReportCaseResponse["evidence_refs"];
  latest_status_note: string | null;
  created_at: string;
  updated_at: string;
  sla_due_at: string;
}, ops_case_id: string): ReportCaseResponse {
  return {
    case_type: "public_report",
    case_id: input.id,
    ops_case_id: input.ops_case_id ?? ops_case_id,
    status: input.status,
    surface: input.surface,
    category: input.category,
    summary: input.summary,
    description: input.description,
    target_object: input.target_object,
    evidence_refs: input.evidence_refs,
    latest_status_note: input.latest_status_note,
    created_at: input.created_at,
    updated_at: input.updated_at,
    sla_due_at: input.sla_due_at,
    target_route: buildTrustHistoryRoute(),
    legal_links: {
      terms_url: `${H5_BASE_URL}/legal/terms`,
      privacy_url: `${H5_BASE_URL}/legal/privacy`,
      aigc_url: `${H5_BASE_URL}/legal/aigc`,
    },
  };
}

function toOpsTrustCaseSummary(input: {
  ops_case: {
    id: string;
    case_type: "risk_review" | "export_review";
    status: "open" | "triaged" | "pending_user" | "pending_review" | "resolved" | "rejected";
    summary: string;
    story_id: string | null;
    created_at: string;
    updated_at: string;
    sla_due_at: string;
  };
  latest_status_note: string | null;
}): TrustCaseSummary {
  return {
    case_type: input.ops_case.case_type,
    case_id: input.ops_case.id,
    ops_case_id: input.ops_case.id,
    status: toPublicReportStatus(input.ops_case.status),
    summary: input.ops_case.summary,
    latest_status_note: input.latest_status_note,
    created_at: input.ops_case.created_at,
    updated_at: input.ops_case.updated_at,
    sla_due_at: input.ops_case.sla_due_at,
    target_route:
      input.ops_case.case_type === "export_review" && input.ops_case.story_id
        ? `/stories/${input.ops_case.story_id}/exports`
        : buildTrustHistoryRoute(),
    legal_links: {
      terms_url: `${H5_BASE_URL}/legal/terms`,
      privacy_url: `${H5_BASE_URL}/legal/privacy`,
      aigc_url: `${H5_BASE_URL}/legal/aigc`,
    },
  };
}

function getPriority(category: PublicReportCategory) {
  return category === "minor_safety" ? "P0" : "P1";
}

function getSlaHours(category: PublicReportCategory) {
  if (category === "minor_safety") {
    return 4;
  }
  if (category === "privacy") {
    return 12;
  }
  if (category === "rights_labeling") {
    return 12;
  }
  return 24;
}

function toPublicReportStatus(
  status: "open" | "triaged" | "pending_user" | "pending_review" | "resolved" | "rejected",
): PublicReportStatus {
  switch (status) {
    case "triaged":
      return "triaged";
    case "pending_review":
      return "under_review";
    case "pending_user":
      return "pending_user";
    case "resolved":
      return "resolved";
    case "rejected":
      return "rejected";
    default:
      return "submitted";
  }
}

function buildTrustHistoryRoute() {
  return REPORT_HISTORY_PATH;
}

async function ensureAccount(account_token: string) {
  const account = await createAccountRepository().findAccountByToken(account_token);
  if (!account) {
    throw new Error(`Account not found for token ${account_token}`);
  }
  return account;
}

async function appendTrustAuditLog(input: {
  account_id: string;
  event_name: string;
  payload: Record<string, string | number | boolean | null>;
}) {
  const state = await readAppState();
  state.auditLogs.push({
    event_name: input.event_name,
    account_id: input.account_id,
    payload: input.payload,
    created_at: new Date().toISOString(),
  });
  await writeAppState(state);
}
