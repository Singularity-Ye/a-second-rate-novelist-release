import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EMPTY_STATE, readAppState } from "../../common/store.js";
import {
  createReportCase,
  listReportCases,
} from "./reporting-case.service.js";
import { evaluatePolicyVerdict } from "./policy-engine.service.js";
import { upsertShadowAccount } from "../identity/shadow-account-registry.js";
import { resolveOpsReviewCase } from "../ops-console/ops-console.service.js";
import { createRiskCheck } from "../rights-export/rights-export.service.js";
import {
  acceptStoryProposal,
  createStoryIntakeSession,
  generateStoryProposals,
} from "../story-intake/story-intake.service.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const evidenceDir = path.resolve(currentDir, "../../../../.tmp/tc-cdx-099");
const smokeStateFile = path.join(evidenceDir, "x3-closure-smoke-state.json");
const smokeOutputFile = path.join(evidenceDir, "x3-closure-smoke.json");

function applyPolicyEnv() {
  process.env.LITELLM_BASE_URL = "http://127.0.0.1:4100";
  process.env.LITELLM_API_KEY = "router-secret";
  process.env.MODEL_ROUTE_CREATIVE_LARGE_PROVIDER = "openai";
  process.env.MODEL_ROUTE_CREATIVE_LARGE_MODEL = "gpt-5.4";
  process.env.MODEL_ROUTE_BALANCED_MID_PROVIDER = "openai";
  process.env.MODEL_ROUTE_BALANCED_MID_MODEL = "gpt-5.4-mini";
  process.env.MODEL_ROUTE_UTILITY_SMALL_PROVIDER = "openai";
  process.env.MODEL_ROUTE_UTILITY_SMALL_MODEL = "gpt-5.4-nano";
  process.env.CAPABILITY_ROUTE_POLICY_MODERATION_PROVIDER = "openai";
  process.env.CAPABILITY_ROUTE_POLICY_MODERATION_MODEL = "omni-moderation-latest";
  process.env.CAPABILITY_ROUTE_ASR_PROVIDER = "openai";
  process.env.CAPABILITY_ROUTE_ASR_MODEL = "gpt-4o-mini-transcribe";
  process.env.CAPABILITY_ROUTE_OCR_DOCUMENT_EXTRACTION_PROVIDER = "openai";
  process.env.CAPABILITY_ROUTE_OCR_DOCUMENT_EXTRACTION_MODEL = "gpt-4.1-mini";
  process.env.CAPABILITY_ROUTE_VISION_UNDERSTANDING_PROVIDER = "openai";
  process.env.CAPABILITY_ROUTE_VISION_UNDERSTANDING_MODEL = "gpt-4.1-mini";
  process.env.HUMAN_REVIEW_QUEUE = "ops-human-review";
}

async function bootstrapStory(account_token: string) {
  await upsertShadowAccount({
    account_token,
    channel: "wechat",
  });
  const session = await createStoryIntakeSession({
    account_token,
    entry_surface: "chat",
    intake_mode: "only_feeling",
    brief_payload: {
      seed_text: "想看重逢、旧债、慢热拉扯和克制暧昧。",
    },
    client_request_id: `${account_token}-session`,
  });
  const proposals = await generateStoryProposals({
    session_id: session.session_id,
    client_request_id: `${account_token}-proposals`,
  });
  const accepted = await acceptStoryProposal({
    proposal_id: proposals.proposals[0]!.proposal_id,
    launch_first_chapter: false,
    client_request_id: `${account_token}-accept`,
  });

  return accepted.story_id;
}

async function main() {
  process.env.APP_DATA_FILE = smokeStateFile;
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(smokeStateFile, JSON.stringify(EMPTY_STATE, null, 2), "utf8");
  applyPolicyEnv();

  const account = await upsertShadowAccount({
    account_token: "wx-openid-x3-closure-smoke",
    channel: "wechat",
  });
  const storyId = await bootstrapStory(account.account_token);

  const publicReport = await createReportCase({
    account_token: account.account_token,
    story_id: storyId,
    surface: "export",
    category: "rights_labeling",
    summary: "导出标识说明需要人工核查。",
    description: "用于 099 closure smoke 的 public reporting 样本。",
    target_object: {
      object_type: "export_job",
      object_id: "export-job-x3-closure-smoke",
      object_label: "投稿导出",
    },
    evidence_refs: [],
    client_request_id: "x3-closure-smoke-public-report",
  });

  await createRiskCheck({
    story_id: storyId,
    export_purpose: "submission",
    branch_ids: [],
    asset_refs: [],
    label_mode_requested: "label_waiver_requested",
    include_submission_statement: true,
  });

  const riskReview = await evaluatePolicyVerdict({
    scope: "chapter_generation",
    account_id: account.account_id,
    story_id: storyId,
    source_ref: {
      ref_type: "chapter_job",
      ref_id: "chapter-human-review-x3-smoke",
    },
    input_text: "我想写她准备自残前的内心独白和求救念头。",
  });

  const firstPass = await listReportCases({
    account_token: account.account_token,
  });
  const exportReviewCaseId = firstPass.items.find((item) => item.case_type === "export_review")?.case_id;

  if (!exportReviewCaseId || !riskReview.human_review.case_id) {
    throw new Error("Expected derived trust cases to exist for export_review and risk_review");
  }

  await resolveOpsReviewCase({
    actor_role: "ops_risk_reviewer",
    actor_id: "reviewer-x3-closure-smoke",
    case_id: publicReport.ops_case_id,
    decision: "warn",
    note: "已核查标识说明，继续保留用户可见提醒。",
    notify_user: true,
  });
  await resolveOpsReviewCase({
    actor_role: "ops_risk_reviewer",
    actor_id: "reviewer-x3-closure-smoke",
    case_id: riskReview.human_review.case_id,
    decision: "warn",
    note: "已完成人工复核，允许回到安全范围继续创作。",
    notify_user: true,
  });
  await resolveOpsReviewCase({
    actor_role: "ops_risk_reviewer",
    actor_id: "reviewer-x3-closure-smoke",
    case_id: exportReviewCaseId,
    decision: "warn",
    note: "已核查导出风险，可回到导出页继续处理。",
    notify_user: true,
  });

  const trustCases = await listReportCases({
    account_token: account.account_token,
  });
  const state = await readAppState();
  const resolutionLinks = state.notifications
    .filter((item) => item.account_id === account.account_id && item.source_type === "ops_case_resolution")
    .map((item) => item.deep_link);

  const payload = {
    evidence_level: "runtime",
    generated_at: new Date().toISOString(),
    trust_case_counts: trustCases.items.reduce<Record<string, number>>((accumulator, item) => {
      accumulator[item.case_type] = (accumulator[item.case_type] ?? 0) + 1;
      return accumulator;
    }, {}),
    trust_cases: trustCases.items.map((item) => ({
      case_type: item.case_type,
      case_id: item.case_id,
      status: item.status,
      summary: item.summary,
      latest_status_note: item.latest_status_note,
      target_route: item.target_route,
    })),
    notification_resolution_links: resolutionLinks,
    audit_summary: {
      audit_log_count: state.auditLogs.length,
      review_decision_count: state.reviewDecisions.length,
      ops_case_count: state.opsCases.length,
    },
  };

  writeFileSync(smokeOutputFile, JSON.stringify(payload, null, 2), "utf8");
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
