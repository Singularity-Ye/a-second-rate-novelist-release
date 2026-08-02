import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { upsertStoryWorkspace } from "../chat-router/story-workspace-registry.js";
import { routeInboundChatMessage } from "../chat-router/chat-routing.service.js";
import { upsertShadowAccount } from "../identity/shadow-account-registry.js";
import { correctArchiveIntent, listArchiveIntents } from "./correction/intent-correction.service.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const smokeStateFile = path.resolve(currentDir, "../../../../.tmp/tc-cdx-094/intent-envelope-smoke-state.json");

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

async function main() {
  process.env.APP_DATA_FILE = smokeStateFile;
  mkdirSync(path.dirname(smokeStateFile), { recursive: true });
  writeFileSync(smokeStateFile, JSON.stringify(EMPTY_STATE, null, 2), "utf8");

  const account = await upsertShadowAccount({
    account_token: "wx-openid-intent-envelope-smoke",
    channel: "wechat",
  });
  const story = await upsertStoryWorkspace({
    account_id: account.account_id,
    title: "玻璃海",
    keywords: ["玻璃海", "暧昧", "重逢"],
    workspace_status: "active",
    updated_by: "intent-envelope-smoke",
  });

  const intakeResponse = await routeInboundChatMessage({
    channel_message_id: "wx-intent-envelope-smoke-intake",
    channel: "wechat",
    account_token: account.account_token,
    text: "我想看一本文艺一点、重逢后慢慢失控的长篇。",
    client_context: {
      source_surface: "chat",
    },
  });
  const storyResponse = await routeInboundChatMessage({
    channel_message_id: "wx-intent-envelope-smoke-story",
    channel: "wechat",
    account_token: account.account_token,
    text: "你昨晚没来，我有点想你，先替我记下这个感觉。",
    client_context: {
      source_surface: "chat",
      active_story_id: story.story_workspace_id,
    },
  });
  const archiveResponse = await routeInboundChatMessage({
    channel_message_id: "wx-intent-envelope-smoke-archive",
    channel: "wechat",
    account_token: account.account_token,
    text: "把我对《白夜行》的偏爱先记下来。",
    client_context: {
      source_surface: "chat",
    },
  });

  const listed = await listArchiveIntents(account.account_token);
  const archiveItem = listed.items.find((item) => item.intent_id === archiveResponse.intent_patch.intent_id);
  const corrected = await correctArchiveIntent({
    intent_id: archiveResponse.intent_patch.intent_id,
    new_target_type: "reader_profile",
    patch_document: {
      ...(typeof archiveItem?.version_no === "number"
        ? {
            base_version: archiveItem.version_no,
          }
        : {}),
      reading_archive_patch: {
        favorite_books_append: ["《白夜行》"],
      },
    },
    client_request_id: "req-intent-envelope-smoke-correction",
  });

  console.log(
    JSON.stringify(
      {
        evidence_level: "runtime",
        intake: {
          envelope_surface: intakeResponse.intent_envelope.surface,
          intent_type: intakeResponse.intent_patch.intent_type,
          target_object: intakeResponse.intent_patch.target_object,
        },
        story_context: {
          intent_type: storyResponse.intent_patch.intent_type,
          target_object: storyResponse.intent_patch.target_object,
          correction_state: storyResponse.intent_patch.correction_state,
        },
        archive: {
          listed_count: listed.items.length,
          latest_target: archiveResponse.intent_patch.target_object,
          corrected_target: corrected.intent.target_object,
          corrected_state: corrected.intent.correction_state,
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
