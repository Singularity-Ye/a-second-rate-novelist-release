import { writeFile } from "node:fs/promises";
import path from "node:path";
import { readAppState } from "../../common/store.js";
import { redeemBetaInvite } from "../beta-access/beta-access.service.js";
import {
  createBetaIncidentBroadcast,
  createBetaSupportCase,
  getBetaSupportOverview,
} from "./beta-ops.service.js";
import {
  acceptStoryProposal,
  createStoryIntakeSession,
  generateStoryProposals,
} from "../story-intake/story-intake.service.js";

async function main() {
  const redeemed = await redeemBetaInvite({
    invite_code: "PHASE0-XHS-001",
    entry_channel: "h5",
    account_token: "beta-ops-smoke-001",
    accepted_policy_version: "beta-policy-v1",
  });

  const intake = await createStoryIntakeSession({
    account_token: redeemed.account_token,
    entry_surface: "chat",
    intake_mode: "only_feeling",
    brief_payload: {
      seed_text: "需要一条 beta support smoke 样本。",
    },
    client_request_id: "beta-ops-smoke-intake",
  });
  const proposals = await generateStoryProposals({
    session_id: intake.session_id,
    client_request_id: "beta-ops-smoke-proposals",
  });
  const accepted = await acceptStoryProposal({
    proposal_id: proposals.proposals[0]!.proposal_id,
    launch_first_chapter: false,
    client_request_id: "beta-ops-smoke-accept",
  });

  const created = await createBetaSupportCase({
    account_token: redeemed.account_token,
    story_id: accepted.story_id,
    surface: "chat",
    category: "story_quality",
    summary: "smoke: 主线程承接断了",
    description: "smoke: 章节和聊天之间没接上。",
    target_object: {
      object_type: "chat_thread",
      object_id: "smoke-thread",
      object_label: "主聊天线程",
    },
    client_request_id: "beta-ops-smoke-case",
  });
  const incident = await createBetaIncidentBroadcast({
    actor_role: "ops_support",
    actor_id: "beta-ops-smoke",
    severity: "warn",
    status: "degraded",
    headline: "smoke: 微信回流延迟",
    summary: "smoke: 当前微信 ClawBot 存在延迟。",
    recommended_action: "smoke: 优先切回 H5。",
    program_key: "external_beta_phase0",
    affected_surfaces: ["chat", "room", "notifications"],
  });
  const overview = await getBetaSupportOverview({
    account_token: redeemed.account_token,
  });
  const state = await readAppState();

  const output = {
    evidence_level: "runtime",
    created_case_id: created.case_id,
    incident_id: incident.incident_id,
    active_incident_count: overview.active_incidents.length,
    notification_count: state.notifications.filter(
      (item) => item.source_type === "beta_support_case" || item.source_type === "beta_incident_broadcast",
    ).length,
  };

  const outArg = process.argv.slice(2).find((item) => item.startsWith("--out="));
  if (outArg) {
    const target = path.resolve(process.cwd(), outArg.replace("--out=", ""));
    await writeFile(target, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  } else {
    console.log(JSON.stringify(output, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
