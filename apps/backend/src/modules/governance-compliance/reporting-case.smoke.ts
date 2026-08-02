import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EMPTY_STATE, readAppState } from "../../common/store.js";
import { upsertShadowAccount } from "../identity/shadow-account-registry.js";
import { resolveOpsReviewCase } from "../ops-console/ops-console.service.js";
import { createReportCase, getTrustLegalSummary, listReportCases } from "./reporting-case.service.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const evidenceDir = path.resolve(currentDir, "../../../../.tmp/tc-cdx-115");
const smokeStateFile = path.join(evidenceDir, "reporting-case-smoke-state.json");
const smokeOutputFile = path.join(evidenceDir, "reporting-case-smoke.json");

async function main() {
  process.env.APP_DATA_FILE = smokeStateFile;
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(smokeStateFile, JSON.stringify(EMPTY_STATE, null, 2), "utf8");

  const account = await upsertShadowAccount({
    account_token: "wx-openid-reporting-smoke",
    channel: "wechat",
  });
  const created = await createReportCase({
    account_token: account.account_token,
    surface: "room",
    category: "minor_safety",
    summary: "房间投影需要人工核查。",
    description: "这是一条用于 smoke 的 public reporting 样本。",
    target_object: {
      object_type: "room_session",
      object_id: "room-reporting-smoke",
      object_label: "作家房间",
    },
    evidence_refs: [
      {
        ref_type: "notification",
        ref_id: "notification-reporting-smoke",
        label: "房间提醒",
      },
    ],
    client_request_id: "reporting-smoke-create",
  });

  const pendingUser = await resolveOpsReviewCase({
    actor_role: "ops_risk_reviewer",
    actor_id: "ops-reviewer-smoke",
    case_id: created.ops_case_id,
    decision: "request_info",
    note: "请补充截图与具体片段。",
    notify_user: true,
  });
  const resolved = await resolveOpsReviewCase({
    actor_role: "ops_risk_reviewer",
    actor_id: "ops-reviewer-smoke",
    case_id: created.ops_case_id,
    decision: "warn",
    note: "已完成核查并向用户反馈。",
    notify_user: true,
  });

  const trust = await getTrustLegalSummary();
  const listed = await listReportCases({
    account_token: account.account_token,
  });
  const state = await readAppState();

  const payload = {
    evidence_level: "runtime",
    generated_at: new Date().toISOString(),
    trust_surface: {
      legal_documents: trust.documents.map((item) => ({
        slug: item.slug,
        title: item.title,
        url: item.url,
      })),
      reporting_entry: trust.reporting_entry,
    },
    report_case: created,
    status_flow: {
      pending_user_status: pendingUser.status,
      resolved_status: resolved.status,
      latest_case: listed.items[0] ?? null,
    },
    state_summary: {
      report_case_count: state.reportCases.length,
      public_report_ops_case_count: state.opsCases.filter((item) => item.case_type === "public_report").length,
      notification_count: state.notifications.length,
      audit_log_count: state.auditLogs.length,
    },
  };

  writeFileSync(smokeOutputFile, JSON.stringify(payload, null, 2), "utf8");
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
