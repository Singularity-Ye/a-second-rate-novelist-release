import { createReaderProfileRepository } from "../../common/repositories/reader-profile.repository.js";
import { createRelationshipMemoryRepository } from "../../common/repositories/relationship-memory.repository.js";
import { readAppState } from "../../common/store.js";
import type {
  ChatPersonaCopyResult,
  PersonaGroundedArtifactType,
  PersonaRelationshipStage,
  PersonaRelationshipState,
  PersonaTaskCue,
  PersonaWorkflowArtifactContext,
  PersonaWorkflowCue,
  PersonaWorkflowStage,
  SystemNotificationCopyResult,
  WorkflowPersonaCopyResult,
} from "./persona-engine.contract.js";

const DEFAULT_VOICE_CONSTRAINTS = [
  "no_ai_disclosure",
  "no_emotional_manipulation",
  "system_transactions_use_system_voice",
  "prefer_short_sentences",
];

function toRelationshipStage(total_messages: number): PersonaRelationshipStage {
  if (total_messages > 20) {
    return "long_term";
  }

  if (total_messages >= 4) {
    return "familiar";
  }

  return "stranger";
}

async function resolveRelationshipState(input: {
  account_id: string;
  story_id: string | null;
}): Promise<PersonaRelationshipState> {
  const state = await readAppState();
  const profile = await createReaderProfileRepository().findLatestActiveProfileByAccount(input.account_id);
  const activeMemories = await createRelationshipMemoryRepository().listActiveMemoriesByAccount(input.account_id, {
    ...(input.story_id !== null ? { story_workspace_id: input.story_id } : {}),
    limit: 5,
  });

  return {
    stage: toRelationshipStage(state.messages.filter((item) => item.account_id === input.account_id).length),
    total_messages: state.messages.filter((item) => item.account_id === input.account_id).length,
    active_memory_types: activeMemories.map((item) => item.memory_type),
    preference_hint:
      profile?.taste_archive.relationship_preference[0] ??
      profile?.taste_archive.ending ??
      profile?.taste_archive.emotion ??
      null,
  };
}

async function resolveTaskCue(input: {
  story_id: string | null;
  task_cue?: PersonaTaskCue | null;
}): Promise<PersonaTaskCue | null> {
  if (input.task_cue !== undefined) {
    return input.task_cue ?? null;
  }

  if (!input.story_id) {
    return null;
  }

  const latest = (await readAppState())
    .runtimeTasks.filter(
      (item) =>
        item.story_id === input.story_id &&
        (item.status === "queued" || item.status === "running" || item.status === "waiting_human"),
    )
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))[0];

  if (!latest) {
    return null;
  }

  return {
    job_type: latest.job_type,
    status: latest.status,
    target_label:
      latest.job_type === "chapter_generate"
        ? latest.target === "next_chapter"
          ? "下一章"
          : latest.target === "next_scene"
            ? "这一场"
            : "第一章"
        : "提案",
  };
}

function resolveRoomPresenceState(input: {
  routing_status: "selected_story" | "recent_notes" | "ambiguous";
  task_cue: PersonaTaskCue | null;
}) {
  if (input.routing_status === "ambiguous") {
    return {
      state: "waiting_for_user" as const,
      label: "等你挑故事线",
    };
  }

  if (input.task_cue?.status === "running") {
    return {
      state: input.task_cue.job_type === "chapter_generate" ? ("writing" as const) : ("asset_processing" as const),
      label: `${input.task_cue.target_label ?? "这条线"}还在桌上`,
    };
  }

  if (input.task_cue?.status === "waiting_human") {
    return {
      state: "waiting_for_user" as const,
      label: "等你定一句话",
    };
  }

  if (input.task_cue?.status === "failed") {
    return {
      state: "stuck" as const,
      label: "这条线卡了一下",
    };
  }

  if (input.routing_status === "selected_story") {
    return {
      state: "waiting_for_user" as const,
      label: "等你继续往下写",
    };
  }

  return {
    state: "welcoming" as const,
    label: "先替你记下",
  };
}

function buildSelectedStoryCopy(input: {
  stage: PersonaRelationshipStage;
  story_label: string;
  task_cue: PersonaTaskCue | null;
  preference_hint: string | null;
}): Pick<ChatPersonaCopyResult, "ack_copy" | "reply_text"> {
  if (input.stage === "stranger") {
    return {
      ack_copy: `这句我先替你记到${input.story_label}里。别急，我先把它收一收。`,
      reply_text:
        input.task_cue?.status === "running"
          ? `${input.task_cue.target_label ?? "上一章"}我还在收口，这句先替你压住。`
          : "我先收着，不把它一下子写满。",
    };
  }

  if (input.stage === "familiar") {
    return {
      ack_copy: `这句我先记到${input.story_label}里，先别让它散。`,
      reply_text:
        input.task_cue?.status === "running"
          ? `你上次说别把劲一下子放完。${input.task_cue.target_label ?? "这一章"}我还在桌上写，这句先替你压住。`
          : `你上次说过喜欢${input.preference_hint ?? "那种慢一点逼近的劲"}，这句我先替你往后压半步。`,
    };
  }

  return {
    ack_copy: `行，这句我替你按${input.story_label}收住。`,
    reply_text:
      input.task_cue?.status === "running"
        ? `${input.task_cue.target_label ?? "这一章"}我还在手上，但照你那口味，该留的回头路我没忘。`
        : "照你那口味，我先不把它写得太顺。该留的回头路，我没忘。",
  };
}

function buildRecentNotesCopy(stage: PersonaRelationshipStage): Pick<ChatPersonaCopyResult, "ack_copy" | "reply_text"> {
  if (stage === "stranger") {
    return {
      ack_copy: "这句我先替你记到最近记下，不急着往故事里硬塞。",
      reply_text: "我先替你收着，等你想清楚归哪条线，再接着往下写。",
    };
  }

  if (stage === "familiar") {
    return {
      ack_copy: "这句我先放进最近记下，先别硬塞进任何一条线里。",
      reply_text: "先留着。你回头要是想把它归到哪本，我再替你接过去。",
    };
  }

  return {
    ack_copy: "行，这句先留在最近记下，等你回头要归哪条线再说。",
    reply_text: "我先替你扣着，不急着把它塞进故事里。你想好了再叫我。",
  };
}

function buildAmbiguousCopy(stage: PersonaRelationshipStage): Pick<ChatPersonaCopyResult, "ack_copy" | "reply_text"> {
  if (stage === "stranger") {
    return {
      ack_copy: "我先替你收着了，但这句可能不止落在一条故事线里。你点一下要归到哪本，我就继续接。",
      reply_text: "这句像连着不止一条线。你点一下具体故事，我就接着往下记。",
    };
  }

  if (stage === "familiar") {
    return {
      ack_copy: "我先替你扣着，但这句像是两条线都能接上。你给我点一本，我别记串了。",
      reply_text: "这句像两条线都能接上。你给我点一本，我别记串了。",
    };
  }

  return {
    ack_copy: "这句我先收住，不过它两条线都能接上。你点一本，我就不写岔。",
    reply_text: "这句两条线都能接上。你点一本，我就不写岔。",
  };
}

function collectGroundedArtifactTypes(
  artifact_context: PersonaWorkflowArtifactContext,
): PersonaGroundedArtifactType[] {
  const grounded: PersonaGroundedArtifactType[] = [];

  if (artifact_context.genre_brief) {
    grounded.push("genre_brief");
  }

  if (artifact_context.outline_bundle) {
    grounded.push("outline_bundle");
  }

  if (artifact_context.reader_review) {
    grounded.push("reader_review");
  }

  return grounded;
}

function resolveFrontTenPromise(artifact_context: PersonaWorkflowArtifactContext) {
  return (
    artifact_context.outline_bundle?.front_ten_chapter_promise ??
    artifact_context.genre_brief?.front_ten_chapter_promise ??
    null
  );
}

function buildProposalExplanation(input: {
  stage: PersonaRelationshipStage;
  artifact_context: PersonaWorkflowArtifactContext;
}) {
  const genreBrief = input.artifact_context.genre_brief;

  if (!genreBrief) {
    return {
      explanation: "这条线我还不想空口乱夸，得先把题材 promise 和前十章抓手认稳，再往下说。",
      next_action: "先补齐题材 promise，再看提案。",
    };
  }

  const intro =
    input.stage === "stranger"
      ? "这条线我先不靠空口喜欢来推。"
      : input.stage === "familiar"
        ? "这条线我先按正式起盘来收。"
        : "这条线我还是按咱们认过的门路来起盘。";
  const relationshipPromise = genreBrief.relationship_promise
    ? `关系线先守住“${genreBrief.relationship_promise}”。`
    : "";

  return {
    explanation: `${intro}${genreBrief.genre_lane}这条线先抓${genreBrief.target_reader_segment}，核心 promise 是“${genreBrief.core_promise}”。前十章我得先把“${genreBrief.front_ten_chapter_promise}”立住。${relationshipPromise}`.trim(),
    next_action: "先挑最像这股 promise 的提案，再往委托书收。",
  };
}

function buildChapterProgressExplanation(input: {
  stage: PersonaRelationshipStage;
  artifact_context: PersonaWorkflowArtifactContext;
}) {
  const outlineBundle = input.artifact_context.outline_bundle;
  const genreBrief = input.artifact_context.genre_brief;
  const frontTenPromise = resolveFrontTenPromise(input.artifact_context);
  const opener =
    input.stage === "stranger"
      ? "这章我没急着往外放。"
      : input.stage === "familiar"
        ? "这章我还在压，不是故意吊着你。"
        : "这章我还在收口，你知道我不是在故意拖。";
  const promiseLine = frontTenPromise ? `前十章 promise 定的是“${frontTenPromise}”。` : "";
  const chapterGoal = outlineBundle?.current_chapter_goal ? `这一章先得${outlineBundle.current_chapter_goal}。` : "";
  const emotionalBeat = outlineBundle?.current_emotional_beat
    ? `情绪拍点我按“${outlineBundle.current_emotional_beat}”收。`
    : "";
  const cliffhanger = outlineBundle?.chapter_cliffhanger_goal
    ? `章末还得把“${outlineBundle.chapter_cliffhanger_goal}”落住。`
    : "";
  const corePromise = genreBrief?.core_promise ? `不然“${genreBrief.core_promise}”会先泄劲。` : "";

  return {
    explanation: `${opener}${promiseLine}${chapterGoal}${emotionalBeat}${cliffhanger}${corePromise}`.trim(),
    next_action: "等这章把 promise 和章末钩子都钉住，我再给你看。",
  };
}

function buildRewriteExplanation(input: {
  stage: PersonaRelationshipStage;
  artifact_context: PersonaWorkflowArtifactContext;
}) {
  const review = input.artifact_context.reader_review;
  const frontTenPromise = resolveFrontTenPromise(input.artifact_context);
  const targets = review?.rewrite_targets ?? [];
  const targetLine =
    targets.length === 0
      ? "先把卡住的那一处掰开。"
      : targets.length === 1
        ? `先改“${targets[0]}”。`
        : `先改“${targets[0]}”，再补“${targets[1]}”。`;
  const opener =
    input.stage === "long_term"
      ? "照咱们这条线的标准，我先把卡点摊开。"
      : "这次不是笼统再压一压，我先把卡点摊开。";
  const reviewSummary = review?.summary ? `回看里已经写明：${review.summary}` : "";
  const promiseLine = frontTenPromise ? `前十章 promise 还得守住“${frontTenPromise}”。` : "";

  return {
    explanation: `${opener}${reviewSummary}${targetLine}${promiseLine}`.trim(),
    next_action:
      review?.acceptance_recommendation === "rewrite" ? "先按这几个点重写，再回来确认追更钩子。" : "先按回看意见微调，再看要不要重写。",
  };
}

function buildWorkflowExplanation(input: {
  stage: PersonaRelationshipStage;
  workflow_stage: PersonaWorkflowStage;
  artifact_context: PersonaWorkflowArtifactContext;
}) {
  if (input.workflow_stage === "proposal_explanation") {
    return buildProposalExplanation(input);
  }

  if (input.workflow_stage === "chapter_progress") {
    return buildChapterProgressExplanation(input);
  }

  return buildRewriteExplanation(input);
}

export async function buildWorkflowPersonaCopy(input: {
  account_id: string;
  story_id: string | null;
  story_title: string | null;
  task_cue?: PersonaTaskCue | null;
  workflow_stage: PersonaWorkflowStage;
  artifact_context: PersonaWorkflowArtifactContext;
}): Promise<WorkflowPersonaCopyResult> {
  const relationship_state = await resolveRelationshipState({
    account_id: input.account_id,
    story_id: input.story_id,
  });
  const task_cue = await resolveTaskCue({
    story_id: input.story_id,
    ...(input.task_cue !== undefined ? { task_cue: input.task_cue } : {}),
  });
  const roomPresence = resolveRoomPresenceState({
    routing_status: "selected_story",
    task_cue,
  });
  const grounded_artifact_types = collectGroundedArtifactTypes(input.artifact_context);
  const workflowCopy = buildWorkflowExplanation({
    stage: relationship_state.stage,
    workflow_stage: input.workflow_stage,
    artifact_context: input.artifact_context,
  });

  return {
    persona_mode: "persona",
    relationship_state,
    room_presence_state: roomPresence.state,
    state_label: roomPresence.label,
    voice_constraints: [...DEFAULT_VOICE_CONSTRAINTS],
    safety_boundary_flags: [],
    workflow_stage: input.workflow_stage,
    grounded_artifact_types,
    explanation: workflowCopy.explanation,
    next_action: workflowCopy.next_action,
  };
}

export async function buildChatPersonaCopy(input: {
  account_id: string;
  story_id: string | null;
  story_title: string | null;
  routing_status: "selected_story" | "recent_notes" | "ambiguous";
  user_text: string;
  task_cue?: PersonaTaskCue | null;
  workflow_cue?: PersonaWorkflowCue | null;
}): Promise<ChatPersonaCopyResult> {
  const relationship_state = await resolveRelationshipState({
    account_id: input.account_id,
    story_id: input.story_id,
  });
  const task_cue = await resolveTaskCue({
    story_id: input.story_id,
    ...(input.task_cue !== undefined ? { task_cue: input.task_cue } : {}),
  });
  const roomPresence = resolveRoomPresenceState({
    routing_status: input.routing_status,
    task_cue,
  });
  const story_label = input.story_title ? `《${input.story_title}》` : "这条故事线";
  const copy =
    input.routing_status === "ambiguous"
      ? buildAmbiguousCopy(relationship_state.stage)
      : input.routing_status === "recent_notes"
        ? buildRecentNotesCopy(relationship_state.stage)
        : buildSelectedStoryCopy({
            stage: relationship_state.stage,
            story_label,
            task_cue,
            preference_hint: relationship_state.preference_hint,
          });
  const workflowCopy =
    input.routing_status === "selected_story" && input.workflow_cue
      ? await buildWorkflowPersonaCopy({
          account_id: input.account_id,
          story_id: input.story_id,
          story_title: input.story_title,
          task_cue,
          workflow_stage: input.workflow_cue.workflow_stage,
          artifact_context: input.workflow_cue.artifact_context,
        })
      : null;

  return {
    persona_mode: "persona",
    relationship_state,
    room_presence_state: roomPresence.state,
    state_label: roomPresence.label,
    voice_constraints: [...DEFAULT_VOICE_CONSTRAINTS],
    safety_boundary_flags: [],
    ack_copy: copy.ack_copy,
    reply_text: workflowCopy?.explanation ?? copy.reply_text,
    workflow_stage: workflowCopy?.workflow_stage ?? null,
    grounded_artifact_types: workflowCopy?.grounded_artifact_types ?? [],
  };
}

export async function buildSystemNotificationCopy(input: {
  account_id: string;
  story_id: string;
  story_title: string;
  notification_kind: "export_ready";
  delivery_status: "succeeded" | "partial_failed";
}): Promise<SystemNotificationCopyResult> {
  const relationship_state = await resolveRelationshipState({
    account_id: input.account_id,
    story_id: input.story_id,
  });

  return {
    persona_mode: "system",
    relationship_state,
    room_presence_state: "waiting_for_user",
    state_label: "系统结果已就绪",
    voice_constraints: [...DEFAULT_VOICE_CONSTRAINTS],
    safety_boundary_flags: ["system_transaction"],
    title:
      input.delivery_status === "partial_failed"
        ? `${input.story_title} 导出结果已生成`
        : `${input.story_title} 导出文件已准备就绪`,
    body:
      input.delivery_status === "partial_failed"
        ? "导出结果已生成。PDF 版本失败，其他格式已保留，请在导出页查看并下载可用文件。"
        : "导出文件已准备就绪。文件包含内容生成标识，请在导出页查看详情。",
  };
}
