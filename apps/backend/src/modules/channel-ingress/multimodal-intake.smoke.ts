import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readAppState } from "../../common/store.js";
import { upsertStoryWorkspace } from "../chat-router/story-workspace-registry.js";
import { upsertShadowAccount } from "../identity/shadow-account-registry.js";
import { buildChatSessionResponse } from "./chat-session-bridge.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const smokeStateFile = path.resolve(currentDir, "../../../../.tmp/tc-cdx-112/multimodal-intake-smoke-state.json");

const EMPTY_STATE = {
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
  exportJobs: [],
  exportArtifacts: [],
  evidencePacks: [],
  labelWaiverRequests: [],
  eventLogs: [],
  auditLogs: [],
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
};

function applySmokeEnv() {
  process.env.APP_DATA_FILE = smokeStateFile;
  process.env.CAPABILITY_BACKEND_PLATFORM_MULTIMODAL_ROUTER_BASE_URL = "http://127.0.0.1:4100";
  process.env.CAPABILITY_ROUTE_ASR_PROVIDER = "openai";
  process.env.CAPABILITY_ROUTE_ASR_MODEL = "gpt-4o-mini-transcribe";
  process.env.CAPABILITY_ROUTE_OCR_DOCUMENT_EXTRACTION_PROVIDER = "openai";
  process.env.CAPABILITY_ROUTE_OCR_DOCUMENT_EXTRACTION_MODEL = "gpt-4.1-mini";
  process.env.CAPABILITY_ROUTE_VISION_UNDERSTANDING_PROVIDER = "openai";
  process.env.CAPABILITY_ROUTE_VISION_UNDERSTANDING_MODEL = "gpt-4.1-mini";
}

async function main() {
  applySmokeEnv();
  mkdirSync(path.dirname(smokeStateFile), { recursive: true });
  writeFileSync(smokeStateFile, JSON.stringify(EMPTY_STATE, null, 2), "utf8");

  const account = await upsertShadowAccount({
    account_token: "wx-openid-multimodal-smoke",
    channel: "wechat",
  });
  const story = await upsertStoryWorkspace({
    account_id: account.account_id,
    title: "雨站回声",
    keywords: ["重逢", "站台", "法医"],
    workspace_status: "active",
    updated_by: "multimodal-intake-smoke",
  });

  const voiceResponse = await buildChatSessionResponse({
    channel_message_id: "wx-multimodal-voice-smoke",
    channel: "wechat",
    account_token: account.account_token,
    attachments: [
      {
        file_name: "voice-intake.m4a",
        mime_type: "audio/m4a",
        size_bytes: 128,
        attachment_kind: "voice",
        inline_text: "我喜欢先婚后爱，也喜欢重逢以后慢慢失控。",
      },
    ],
  });
  const assetResponse = await buildChatSessionResponse({
    channel_message_id: "wx-multimodal-asset-smoke",
    channel: "wechat",
    account_token: account.account_token,
    text: "把这两份材料挂进当前故事的参考资产。",
    client_context: {
      source_surface: "chat",
      active_story_id: story.story_workspace_id,
    },
    attachments: [
      {
        file_name: "moodboard.png",
        mime_type: "image/png",
        size_bytes: 256,
        attachment_kind: "image",
        inline_text: "夜雨旧站台，克制暧昧，重逢张力。",
      },
      {
        file_name: "setting-notes.pdf",
        mime_type: "application/pdf",
        size_bytes: 512,
        attachment_kind: "document",
        inline_text: "女主是修复旧案的法医，男主是多年未见的前任警官。",
      },
    ],
  });
  const blockedResponse = await buildChatSessionResponse({
    channel_message_id: "wx-multimodal-ssrf-smoke",
    channel: "wechat",
    account_token: account.account_token,
    text: "这份来源先过安全边界。",
    attachments: [
      {
        file_name: "meta.txt",
        mime_type: "text/plain",
        size_bytes: 64,
        attachment_kind: "document",
        source_url: "http://169.254.169.254/latest/meta-data",
      },
    ],
  });

  const state = await readAppState();

  console.log(
    JSON.stringify(
      {
        evidence_level: "runtime",
        voice: {
          normalized_text: voiceResponse.normalized_message.text,
          intent_type: voiceResponse.intent_patch.intent_type,
          attachment_handoff: voiceResponse.channel_event?.attachment_handoff ?? [],
        },
        reference_assets: {
          intent_patch: assetResponse.intent_patch.proposed_patch,
          attachment_handoff: assetResponse.channel_event?.attachment_handoff ?? [],
        },
        blocked: {
          attachment_handoff: blockedResponse.channel_event?.attachment_handoff ?? [],
        },
        state_summary: {
          multimodal_artifact_count: state.multimodalArtifacts.length,
          reference_asset_count: state.referenceAssets.length,
          extract_result_count: state.assetExtractResults.length,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
