import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createChapterRuntimeRepository } from "../../common/repositories/chapter-runtime.repository.js";
import { readAppState, writeAppState } from "../../common/store.js";
import { routeInboundChatMessage } from "../chat-router/chat-routing.service.js";
import { upsertStoryWorkspace } from "../chat-router/story-workspace-registry.js";
import { upsertShadowAccount } from "../identity/shadow-account-registry.js";
import { buildChatPersonaCopy, buildSystemNotificationCopy, buildWorkflowPersonaCopy } from "./persona-runtime.service.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const smokeStateFile = path.resolve(currentDir, "../../../../.tmp/tc-cdx-081/persona-engine-smoke-state.json");

const EMPTY_STATE = {
  accounts: [],
  sessions: [],
  messages: [],
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

async function seedPersonaSignals(input: {
  account_id: string;
  message_count: number;
  relationship_preference: string[];
  story_id: string;
}) {
  const state = await readAppState();
  const now = Date.now();
  state.profiles.push({
    id: `profile-${input.account_id}`,
    account_id: input.account_id,
    reading_archive: {
      favorite_books: ["海边的卡夫卡"],
    },
    taste_archive: {
      relationship_preference: input.relationship_preference,
      pace: "慢一点再靠近",
      emotion: "压住但不躲",
      ending: "别强行和解",
    },
    boundaries: {
      red_lines: ["别写成轻浮调情"],
    },
    collaboration_mode: "co_create",
    safety_mode: "default",
    profile_status: "confirmed",
    last_confirmed_at: new Date(now).toISOString(),
    version_no: 1,
  });

  for (let index = 0; index < input.message_count; index += 1) {
    state.messages.push({
      id: `msg-${input.account_id}-${index}`,
      account_id: input.account_id,
      channel_message_id: `channel-${input.account_id}-${index}`,
      channel: "wechat",
      text: `历史对话 ${index + 1}`,
      created_at: new Date(now - (input.message_count - index) * 60_000).toISOString(),
    });
  }

  state.relationshipContextMemories.push({
    id: `memory-${input.account_id}-ritual`,
    account_id: input.account_id,
    story_workspace_id: input.story_id,
    message_id: `memory-message-${input.account_id}`,
    memory_type: "ritual",
    summary_text: "ritual memory",
    expires_at: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
    visibility_scope: "chat_only",
    created_at: new Date(now - 30_000).toISOString(),
    updated_at: new Date(now - 30_000).toISOString(),
  });

  await writeAppState(state);
}

async function main() {
  process.env.APP_DATA_FILE = smokeStateFile;
  mkdirSync(path.dirname(smokeStateFile), { recursive: true });
  writeFileSync(smokeStateFile, JSON.stringify(EMPTY_STATE, null, 2), "utf8");

  const account = await upsertShadowAccount({
    account_token: "wx-openid-persona-engine-smoke",
    channel: "wechat",
  });
  const story = await upsertStoryWorkspace({
    account_id: account.account_id,
    title: "玻璃潮汐",
    keywords: ["潮汐", "拉扯"],
    workspace_status: "active",
    updated_by: "persona-engine-smoke",
  });
  await seedPersonaSignals({
    account_id: account.account_id,
    message_count: 8,
    relationship_preference: ["拉扯感"],
    story_id: story.story_workspace_id,
  });

  const runtimeTaskRepository = createChapterRuntimeRepository();
  const task = await runtimeTaskRepository.createRuntimeTask({
    job_type: "chapter_generate",
    account_id: account.account_id,
    story_id: story.story_workspace_id,
    target: "first_chapter",
    client_request_id: "req-persona-engine-smoke-task",
    idempotency_key: "chapter_generate:persona-engine-smoke-task",
  });
  await runtimeTaskRepository.saveRuntimeTask({
    ...task,
    status: "running",
  });

  const chatCopy = await buildChatPersonaCopy({
    account_id: account.account_id,
    story_id: story.story_workspace_id,
    story_title: story.title,
    routing_status: "selected_story",
    user_text: "把那股快要失控的劲再按一按。",
  });
  const routed = await routeInboundChatMessage({
    channel_message_id: "wx-msg-persona-engine-smoke",
    channel: "wechat",
    account_token: account.account_token,
    text: "把那股快要失控的劲再按一按。",
    client_context: {
      source_surface: "chat",
      active_story_id: story.story_workspace_id,
    },
  });
  const exportNotice = await buildSystemNotificationCopy({
    account_id: account.account_id,
    story_id: story.story_workspace_id,
    story_title: story.title,
    notification_kind: "export_ready",
    delivery_status: "succeeded",
  });
  const proposalGate = await buildWorkflowPersonaCopy({
    account_id: account.account_id,
    story_id: story.story_workspace_id,
    story_title: story.title,
    workflow_stage: "proposal_explanation",
    task_cue: {
      job_type: "proposal_generate",
      status: "waiting_human",
      target_label: "提案",
    },
    artifact_context: {
      genre_brief: {
        target_reader_segment: "女频关系驱动读者",
        genre_lane: "女频关系驱动",
        core_promise: "表面克制、实际一步步失控的重逢线",
        front_ten_chapter_promise: "前十章先把重逢后的试探和站队理由钉住",
        relationship_promise: "先把舍不得退场的张力养起来",
      },
    },
  });
  const chapterGate = await buildWorkflowPersonaCopy({
    account_id: account.account_id,
    story_id: story.story_workspace_id,
    story_title: story.title,
    workflow_stage: "chapter_progress",
    task_cue: {
      job_type: "chapter_generate",
      status: "running",
      target_label: "第一章",
    },
    artifact_context: {
      genre_brief: {
        target_reader_segment: "女频关系驱动读者",
        genre_lane: "女频关系驱动",
        core_promise: "不是马上和好，而是先把彼此的试探逼到临界点",
        front_ten_chapter_promise: "前十章先把她为什么不退场、他为什么不敢回头立住",
      },
      outline_bundle: {
        current_chapter_title: "玻璃潮汐 · 雨棚下的回撤",
        current_chapter_goal: "把两个人都想退又退不掉的劲压到同一场对峙里",
        current_emotional_beat: "靠近后回撤",
        chapter_cliffhanger_goal: "章末要留下她突然改口站队的理由",
        front_ten_chapter_promise: "前十章先把她为什么不退场、他为什么不敢回头立住",
      },
    },
  });
  const rewriteGate = await buildWorkflowPersonaCopy({
    account_id: account.account_id,
    story_id: story.story_workspace_id,
    story_title: story.title,
    workflow_stage: "rewrite_explanation",
    task_cue: {
      job_type: "chapter_generate",
      status: "waiting_human",
      target_label: "第一章",
    },
    artifact_context: {
      genre_brief: {
        target_reader_segment: "女频关系驱动读者",
        genre_lane: "女频关系驱动",
        core_promise: "表面克制、实际一步步失控的重逢线",
        front_ten_chapter_promise: "前十章先把重逢后的试探和站队理由钉住",
      },
      reader_review: {
        summary: "情绪是对的，但关系张力在中段塌了，章末也没有留下继续追更的理由。",
        rewrite_targets: ["补足中段对峙里的试探回撤", "把章末钩子落到她为什么突然站队"],
        acceptance_recommendation: "rewrite",
      },
    },
  });
  const chatWorkflowCopy = await buildChatPersonaCopy({
    account_id: account.account_id,
    story_id: story.story_workspace_id,
    story_title: story.title,
    routing_status: "selected_story",
    user_text: "这章怎么还没放出来？",
    task_cue: {
      job_type: "chapter_generate",
      status: "running",
      target_label: "第一章",
    },
    workflow_cue: {
      workflow_stage: "chapter_progress",
      artifact_context: {
        genre_brief: {
          target_reader_segment: "女频关系驱动读者",
          genre_lane: "女频关系驱动",
          core_promise: "不是马上和好，而是先把彼此的试探逼到临界点",
          front_ten_chapter_promise: "前十章先把她为什么不退场、他为什么不敢回头立住",
        },
        outline_bundle: {
          current_chapter_title: "玻璃潮汐 · 雨棚下的回撤",
          current_chapter_goal: "把两个人都想退又退不掉的劲压到同一场对峙里",
          current_emotional_beat: "靠近后回撤",
          chapter_cliffhanger_goal: "章末要留下她突然改口站队的理由",
          front_ten_chapter_promise: "前十章先把她为什么不退场、他为什么不敢回头立住",
        },
      },
    },
  });

  console.log(
    JSON.stringify(
      {
        evidence_level: "runtime",
        account_id: account.account_id,
        story_id: story.story_workspace_id,
        chat_contract: {
          persona_mode: chatCopy.persona_mode,
          relationship_stage: chatCopy.relationship_state.stage,
          room_presence_state: chatCopy.room_presence_state,
          voice_constraints: chatCopy.voice_constraints,
          ack_copy: chatCopy.ack_copy,
          reply_text: chatCopy.reply_text,
        },
        routed_chat: {
          ack_copy: routed.ack.ack_copy,
          reply_text: routed.reply.text,
          persona_state: routed.persona_state,
        },
        export_notice: {
          title: exportNotice.title,
          body: exportNotice.body,
          persona_mode: exportNotice.persona_mode,
          safety_boundary_flags: exportNotice.safety_boundary_flags,
        },
        workflow_gate: {
          proposal_explanation: {
            grounded_artifact_types: proposalGate.grounded_artifact_types,
            explanation: proposalGate.explanation,
            next_action: proposalGate.next_action,
          },
          chapter_progress: {
            grounded_artifact_types: chapterGate.grounded_artifact_types,
            explanation: chapterGate.explanation,
            next_action: chapterGate.next_action,
          },
          rewrite_explanation: {
            grounded_artifact_types: rewriteGate.grounded_artifact_types,
            explanation: rewriteGate.explanation,
            next_action: rewriteGate.next_action,
          },
          chat_reply_with_gate: {
            workflow_stage: chatWorkflowCopy.workflow_stage,
            grounded_artifact_types: chatWorkflowCopy.grounded_artifact_types,
            reply_text: chatWorkflowCopy.reply_text,
          },
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
