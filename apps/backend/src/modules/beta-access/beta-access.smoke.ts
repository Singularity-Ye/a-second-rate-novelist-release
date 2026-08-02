import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EMPTY_STATE } from "../../common/store.js";
import { buildChatSessionResponse } from "../channel-ingress/chat-session-bridge.js";
import {
  getOpsBetaAccessOverview,
  redeemBetaInvite,
  registerBetaAccessChannel,
} from "./beta-access.service.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const smokeDir = path.resolve(currentDir, "../../../../.tmp/tc-cdx-100");
const smokeStateFile = path.resolve(smokeDir, "beta-access-smoke-state.json");
const smokeOutputFile = path.resolve(smokeDir, "beta-access-smoke.json");

async function main() {
  mkdirSync(smokeDir, { recursive: true });
  process.env.APP_DATA_FILE = smokeStateFile;
  writeFileSync(smokeStateFile, JSON.stringify(EMPTY_STATE, null, 2), "utf8");

  const redeemed = await redeemBetaInvite({
    invite_code: "PHASE0-XHS-001",
    entry_channel: "h5",
    accepted_policy_version: "policy-v1",
    client_request_id: "beta-smoke-redeem",
  });
  const binding = await registerBetaAccessChannel({
    account_token: redeemed.account_token,
    channel: "wechat",
    provider_user_id: "wx-beta-smoke-001",
    set_as_primary: true,
  });
  const external = await buildChatSessionResponse({
    channel_message_id: "wx-beta-smoke-msg-001",
    channel: "wechat",
    account_token: "wx-beta-smoke-001",
    text: "今晚先记下一条会回流的重逢场景。",
  });
  const outsider = await buildChatSessionResponse({
    channel_message_id: "wx-beta-outsider-smoke-001",
    channel: "wechat",
    account_token: "wx-beta-outsider-smoke-001",
    text: "让我直接开始。",
  });
  const opsOverview = await getOpsBetaAccessOverview();

  const output = {
    evidence_level: "runtime",
    generated_at: new Date().toISOString(),
    redeemed: {
      account_token: redeemed.account_token,
      invite_code: redeemed.invite_code,
      share_invite_count: redeemed.share_invites.length,
      chat_url: redeemed.entry_links.chat_url,
    },
    binding,
    external_channel: {
      account_token: external.account_token,
      reply_text: external.reply.text,
    },
    outsider_guard: {
      ack_copy: outsider.ack.ack_copy,
      reply_text: outsider.reply.text,
    },
    ops_overview: {
      seats_used: opsOverview.program.seats_used,
      redeemed_invites: opsOverview.invites.redeemed,
      source_breakdown: opsOverview.source_breakdown,
    },
  };

  writeFileSync(smokeOutputFile, JSON.stringify(output, null, 2), "utf8");
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
