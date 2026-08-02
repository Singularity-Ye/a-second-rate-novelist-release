import { createHmac } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppState } from "../../../apps/backend/src/common/store.js";

function signToken(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function buildSeedDeepLinkToken(input: {
  account_id: string;
  account_token: string;
  target_route: "/chat" | "/room";
  expires_at: string;
  secret?: string;
}) {
  const payload = Buffer.from(
    JSON.stringify({
      account_id: input.account_id,
      account_token: input.account_token,
      target_route: input.target_route,
      expires_at: input.expires_at,
    }),
    "utf8",
  ).toString("base64url");
  const signature = signToken(payload, input.secret ?? "m1-local-secret");

  return `${payload}.${signature}`;
}

export function buildM1SeedState(): AppState {
  const now = new Date().toISOString();
  const deepLinkExpiresAt = new Date(Date.now() + 30 * 60_000).toISOString();

  return {
    accounts: [
      {
        account_id: "account-seed-reader-single",
        account_token: "seed_reader_single",
        account_status: "guest",
        primary_channel: "wechat",
        created_at: now,
        updated_at: now,
      },
      {
        account_id: "account-seed-reader-multi",
        account_token: "seed_reader_multi",
        account_status: "guest",
        primary_channel: "wechat",
        created_at: now,
        updated_at: now,
      },
      {
        account_id: "account-seed-reader-edge",
        account_token: "seed_reader_edge",
        account_status: "guest",
        primary_channel: "wechat",
        created_at: now,
        updated_at: now,
      },
    ],
    sessions: [],
    messages: [
      {
        id: "message-gamma-wrong-archive",
        account_id: "account-seed-reader-single",
        channel_message_id: "wx-seed-gamma-001",
        channel: "wechat",
        text: "把《灰烬信》的氛围先记下，但它现在被故意记错地方了。",
        created_at: now,
      },
    ],
    deepLinks: [
      {
        token: buildSeedDeepLinkToken({
          account_id: "account-seed-reader-single",
          account_token: "seed_reader_single",
          target_route: "/room",
          expires_at: deepLinkExpiresAt,
        }),
        account_id: "account-seed-reader-single",
        expires_at: deepLinkExpiresAt,
      },
    ],
    storyWorkspaces: [
      {
        id: "story_alpha",
        account_id: "account-seed-reader-single",
        title: "雨夜列车",
        keywords: ["雨夜", "列车", "重逢"],
        workspace_status: "active",
        entry_surface: "chat",
        intake_mode: "only_feeling",
        privacy_scope: "private",
        commission_brief: {
          title: "雨夜列车",
          summary: "旧城夜班车上的重逢拉扯。",
        },
        current_chapter_id: "chapter_alpha_1",
        created_at: now,
        updated_at: now,
        updated_by: "m1-seed",
      },
      {
        id: "story_beta",
        account_id: "account-seed-reader-multi",
        title: "玻璃海",
        keywords: ["玻璃海", "海风", "重逢"],
        workspace_status: "active",
        entry_surface: "chat",
        intake_mode: "only_feeling",
        privacy_scope: "private",
        commission_brief: {
          title: "玻璃海",
          summary: "海风里的失而复得。",
        },
        current_chapter_id: "chapter_beta_1",
        created_at: now,
        updated_at: now,
        updated_by: "m1-seed",
      },
      {
        id: "story_gamma",
        account_id: "account-seed-reader-single",
        title: "灰烬信",
        keywords: ["灰烬信", "旧信", "回流"],
        workspace_status: "paused",
        entry_surface: "room",
        intake_mode: "repair_line",
        privacy_scope: "private",
        commission_brief: {
          title: "灰烬信",
          summary: "关于误存情绪回流的补丁故事。",
        },
        current_chapter_id: null,
        created_at: now,
        updated_at: now,
        updated_by: "m1-seed",
      },
    ],
    storyIntakeSessions: [
      {
        id: "seed-intake-session-multi",
        account_id: "account-seed-reader-multi",
        entry_surface: "chat",
        intake_mode: "only_feeling",
        brief_payload: {
          seed_text: "想看多故事上下文歧义。",
        },
        status: "draft",
        selected_proposal_id: null,
        client_request_id: "seed-intake-session-multi",
        created_at: now,
        updated_at: now,
      },
    ],
    storyProposals: [],
    chapters: [
      {
        id: "chapter_alpha_1",
        story_id: "story_alpha",
        chapter_no: 1,
        status: "accepted",
        title: "第一章 · 雨夜列车",
        body_text: "第一章原文：雨夜列车在旧站台停下，她终于再次见到他。",
        summary: "雨夜列车的开篇已经稳定。",
        generation_job_id: "job-alpha-1",
        created_at: now,
        updated_at: now,
      },
      {
        id: "chapter_beta_1",
        story_id: "story_beta",
        chapter_no: 1,
        status: "generated",
        title: "第一章 · 玻璃海",
        body_text: "第一章原文：海风把那封迟到的信吹回手边。",
        summary: "玻璃海的第一章用于多故事路由。",
        generation_job_id: "job-beta-1",
        created_at: now,
        updated_at: now,
      },
    ],
    chapterRevisions: [],
    runtimeTasks: [],
    notifications: [
      {
        id: "notification-alpha-1",
        account_id: "account-seed-reader-single",
        story_id: "story_alpha",
        title: "雨夜列车 第一章已送达",
        body: "可以直接打开阅读器继续往下看。",
        deep_link: "http://127.0.0.1:3000/stories/story_alpha/chapters/chapter_alpha_1",
        status: "unread",
        created_at: now,
      },
    ],
    onboardingSessions: [
      {
        session_id: "onboarding-single",
        account_id: "account-seed-reader-single",
        answers: {
          reading_archive: "《白夜行》",
          taste_archive: "想看慢热拉扯。",
          boundaries: "不要未成年",
          collaboration_mode: "你直接导演我改。",
        },
        status: "confirmed",
        updated_at: now,
      },
      {
        session_id: "onboarding-multi",
        account_id: "account-seed-reader-multi",
        answers: {
          reading_archive: "《玻璃海》",
        },
        status: "collecting",
        updated_at: now,
      },
      {
        session_id: "onboarding-edge",
        account_id: "account-seed-reader-edge",
        answers: {},
        status: "collecting",
        updated_at: now,
      },
    ],
    profiles: [
      {
        id: "profile-seed-single",
        account_id: "account-seed-reader-single",
        reading_archive: {
          favorite_books: ["《白夜行》"],
        },
        taste_archive: {
          relationship_preference: ["慢热拉扯"],
          pace: "slow-burn",
          emotion: "dense",
          ending: "bittersweet",
        },
        boundaries: {
          red_lines: ["不要未成年"],
        },
        collaboration_mode: "director",
        safety_mode: "minor_safe",
        profile_status: "confirmed",
        last_confirmed_at: now,
        version_no: 3,
      },
      {
        id: "profile-seed-multi",
        account_id: "account-seed-reader-multi",
        reading_archive: {
          favorite_books: ["《玻璃海》"],
        },
        taste_archive: {
          relationship_preference: [],
          pace: "",
          emotion: "",
          ending: "",
        },
        boundaries: {
          red_lines: [],
        },
        collaboration_mode: "read_only",
        safety_mode: "default",
        profile_status: "draft",
        last_confirmed_at: null,
        version_no: 1,
      },
      {
        id: "profile-seed-edge",
        account_id: "account-seed-reader-edge",
        reading_archive: {
          favorite_books: [],
        },
        taste_archive: {
          relationship_preference: [],
          pace: "",
          emotion: "",
          ending: "",
        },
        boundaries: {
          red_lines: [],
        },
        collaboration_mode: "read_only",
        safety_mode: "default",
        profile_status: "draft",
        last_confirmed_at: null,
        version_no: 0,
      },
    ],
    chatRouteDecisions: [],
    messageIntents: [
      {
        id: "intent_gamma_wrong_archive",
        message_id: "message-gamma-wrong-archive",
        account_id: "account-seed-reader-single",
        channel_message_id: "wx-seed-gamma-001",
        final_intent: "recent_note",
        intent_type: "recent_note",
        target_type: "recent_notes",
        target_id: null,
        target_label: "最近记下",
        ack_copy: "我先替你记到最近记下，后面可以再纠正。",
        deep_link: "/archive/intents?token=seed-reader-single",
        confidence_band: "high",
        patch_document: null,
        status: "acknowledged",
        version_no: 2,
        created_at: now,
        updated_at: now,
      },
    ],
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
    riskReports: [],
    exportJobs: [],
    exportArtifacts: [],
    evidencePacks: [],
    deliveryManifests: [],
    labelWaiverRequests: [],
    reportCases: [],
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
    betaPrograms: [],
    betaInvites: [],
    betaAccessGrants: [],
    betaSupportCases: [],
    betaIncidentBroadcasts: [],
  };
}

export async function writeM1SeedState(state: AppState, stateFile?: string) {
  const configuredStateFile = process.env.APP_DATA_FILE?.trim();
  const targetFile = stateFile ?? configuredStateFile ?? path.resolve(process.cwd(), "infra/m1-local-state.json");

  await mkdir(path.dirname(targetFile), { recursive: true });
  await writeFile(targetFile, JSON.stringify(state, null, 2), "utf8");
}

async function main() {
  await writeM1SeedState(buildM1SeedState());
}

void main();
