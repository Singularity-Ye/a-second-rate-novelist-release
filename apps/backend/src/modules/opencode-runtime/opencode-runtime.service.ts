import { randomUUID } from "node:crypto";
import {
  buildRuntimeTaskArtifactRef,
  type ContextBundleResponse,
  type PersonaStateDetailResponse,
  type RuntimeTaskArtifactRefView,
  type RuntimeTaskAgentRole,
  type RuntimeTaskToolAccessMode,
} from "@erliu/shared-contracts";
import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk";
import { toChapterDraftObjectKey } from "../../common/truth-source/creative-artifact.contract.js";
import {
  readAiRuntimeConfig,
  resolveAiRuntimeExecutionPlan,
  type AiRuntimeExecutionPlan,
} from "../ai-runtime/ai-runtime.config.js";

export interface OpenCodeRuntimeConfig {
  enabled: boolean;
  baseUrl: string | null;
  directory?: string;
  agent: string;
  systemPrompt: string;
  providerId?: string;
  modelId?: string;
}

export interface OpenCodeRuntimeHealthSnapshot {
  enabled: boolean;
  configured: boolean;
  base_url: string | null;
  agent: string;
  provider_id: string | null;
  model_id: string | null;
}

export interface StoryProposalCandidate {
  title: string;
  summary: string;
  relationship: string;
  atmosphere: string;
}

export interface StoryProposalRuntimeTrace {
  runtime: "opencode";
  base_url: string;
  session_id: string;
  message_id: string;
  provider_id: string;
  model_id: string;
  cost: number;
  tokens: {
    input: number;
    output: number;
    reasoning: number;
  };
}

interface GenerateStoryProposalsInput {
  seedText: string;
  intakeMode: string;
}

interface GenerateStoryProposalsOverrides {
  config?: OpenCodeRuntimeConfig;
  clientFactory?: (config: OpenCodeRuntimeConfig) => Pick<OpencodeClient, "session">;
}

function normalizeOptional(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function extractTextFromParts(parts: Array<{ type: string; text?: string }>) {
  return parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function extractJsonCandidate(text: string) {
  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) {
    return objectMatch[0];
  }

  return text.trim();
}

function isStoryProposalCandidate(value: unknown): value is StoryProposalCandidate {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.title === "string" &&
    typeof candidate.summary === "string" &&
    typeof candidate.relationship === "string" &&
    typeof candidate.atmosphere === "string"
  );
}

export function readOpenCodeRuntimeConfig(
  env: Record<string, string | undefined> = process.env,
): OpenCodeRuntimeConfig {
  const baseUrl = normalizeOptional(env.OPENCODE_BASE_URL) ?? null;
  const directory = normalizeOptional(env.OPENCODE_DIRECTORY);
  const aiRuntimeConfig = readAiRuntimeConfig(env);
  const providerId =
    normalizeOptional(env.OPENCODE_PROVIDER_ID) ?? normalizeOptional(aiRuntimeConfig.routes.creative_large.provider_id);
  const modelId =
    normalizeOptional(env.OPENCODE_MODEL_ID) ?? normalizeOptional(aiRuntimeConfig.routes.creative_large.model_id);

  return {
    enabled: Boolean(baseUrl),
    baseUrl,
    agent: normalizeOptional(env.OPENCODE_AGENT) ?? "xiaohan-story-runtime",
    systemPrompt:
      normalizeOptional(env.OPENCODE_SYSTEM_PROMPT) ??
      "你是小韩，一个会根据读者线索给出 3 条长篇故事提案的落魄小说家。输出必须是 JSON。",
    ...(directory ? { directory } : {}),
    ...(providerId ? { providerId } : {}),
    ...(modelId ? { modelId } : {}),
  };
}

export function getOpenCodeRuntimeHealthSnapshot(
  env: Record<string, string | undefined> = process.env,
): OpenCodeRuntimeHealthSnapshot {
  const config = readOpenCodeRuntimeConfig(env);

  return {
    enabled: config.enabled,
    configured: Boolean(config.baseUrl && config.providerId && config.modelId),
    base_url: config.baseUrl,
    agent: config.agent,
    provider_id: config.providerId ?? null,
    model_id: config.modelId ?? null,
  };
}

export function extractProposalCandidatesFromText(text: string): StoryProposalCandidate[] {
  const payload = JSON.parse(extractJsonCandidate(text)) as { proposals?: unknown };
  const proposals = Array.isArray(payload.proposals) ? payload.proposals : [];
  const candidates = proposals.filter(isStoryProposalCandidate);

  if (candidates.length !== 3) {
    throw new Error(`OpenCode proposal generation must return exactly 3 proposals, received ${candidates.length}`);
  }

  return candidates;
}

function createClient(config: OpenCodeRuntimeConfig) {
  return createOpencodeClient({
    ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
    ...(config.directory ? { directory: config.directory } : {}),
  });
}

function buildProposalPrompt(input: GenerateStoryProposalsInput) {
  return [
    "请根据下面的开坑线索，生成 3 条适合作为长篇连载底稿的故事提案。",
    "必须输出 JSON，对象结构为 {\"proposals\": [{\"title\":\"...\",\"summary\":\"...\",\"relationship\":\"...\",\"atmosphere\":\"...\"}, ...]}。",
    "要求：3 条提案彼此明显不同，但都保留慢热、拉扯、适合连载的气质。",
    `intake_mode: ${input.intakeMode}`,
    `seed_text: ${input.seedText}`,
  ].join("\n");
}

export async function generateStoryProposalsViaOpenCode(
  input: GenerateStoryProposalsInput,
  overrides: GenerateStoryProposalsOverrides = {},
) {
  const config = overrides.config ?? readOpenCodeRuntimeConfig();

  if (!config.enabled || !config.baseUrl) {
    throw new Error("OpenCode runtime is not enabled");
  }

  const client = (overrides.clientFactory ?? createClient)(config);
  const created = await client.session.create({
    body: {
      title: `Story Intake · ${input.seedText.slice(0, 24)}`,
    },
  });
  const sessionId = created.data?.id;

  if (!sessionId) {
    throw new Error("OpenCode session.create did not return a session id");
  }

  const prompted = await client.session.prompt({
    path: {
      id: sessionId,
    },
    body: {
      agent: config.agent,
      system: config.systemPrompt,
      ...(config.providerId && config.modelId
        ? {
            model: {
              providerID: config.providerId,
              modelID: config.modelId,
            },
          }
        : {}),
      parts: [
        {
          type: "text",
          text: buildProposalPrompt(input),
        },
      ],
    },
  });

  const assistant = prompted.data?.info;
  const rawText = extractTextFromParts((prompted.data?.parts ?? []) as Array<{ type: string; text?: string }>);

  if (!assistant) {
    throw new Error("OpenCode session.prompt did not return assistant info");
  }

  const proposals = extractProposalCandidatesFromText(rawText);

  return {
    proposals,
    raw_text: rawText,
    trace: {
      runtime: "opencode" as const,
      base_url: config.baseUrl,
      session_id: sessionId,
      message_id: assistant.id,
      provider_id: assistant.providerID,
      model_id: assistant.modelID,
      cost: assistant.cost,
      tokens: {
        input: assistant.tokens.input,
        output: assistant.tokens.output,
        reasoning: assistant.tokens.reasoning,
      },
    },
  };
}

export interface RuntimeToolScopeEntry {
  agent: RuntimeTaskAgentRole;
  tools: string[];
  access_mode: RuntimeTaskToolAccessMode;
}

export interface BackendRuntimeDispatchEnvelope {
  task_id: string;
  story_id: string;
  account_id: string;
  workflow_key: "story.chapter.generate";
  adapter_kind: "backend_runtime_server";
  target: "next_chapter" | "next_scene" | "first_chapter";
  story_title: string;
  context_bundle_id: string;
  persona_snapshot_id: string;
  dispatched_at: string;
  execution: AiRuntimeExecutionPlan;
  agent_roster: string[];
  tool_scope: RuntimeToolScopeEntry[];
  memory_map: {
    context_ref_ids: string[];
    scene_ref_ids: string[];
    promise_ref_ids: string[];
    guarded_ref_ids: string[];
    persona_reason_ref_ids: string[];
    persona_state_code: string;
  };
}

export interface BackendRuntimeAdapterResult {
  workflow_key: "story.chapter.generate";
  adapter_kind: "backend_runtime_server";
  execution: AiRuntimeExecutionPlan;
  agent_roster: string[];
  tool_scope: RuntimeToolScopeEntry[];
  context_bundle_id: string;
  persona_snapshot_id: string;
  callback: {
    status: "applied";
    chapter: {
      chapter_id: string;
      chapter_no: number;
      title: string;
      summary: string;
      body_text: string;
    };
    notification: {
      title: string;
      body: string;
    };
    room_events: string[];
    artifact_refs: RuntimeTaskArtifactRefView[];
  };
}

const STORY_CHAPTER_AGENT_ROSTER: RuntimeTaskAgentRole[] = [
  "story_architect",
  "scene_writer",
  "reader_promise_gate",
  "continuity_auditor",
] as const;

const STORY_CHAPTER_TOOL_SCOPE: RuntimeToolScopeEntry[] = [
  {
    agent: "story_architect",
    tools: ["outline_bundle", "scene_goal_brief", "promise_slice"],
    access_mode: "read",
  },
  {
    agent: "scene_writer",
    tools: ["scene_focus", "chapter_draft", "reveal_guard"],
    access_mode: "write_artifact",
  },
  {
    agent: "reader_promise_gate",
    tools: ["reader_review", "promise_slice", "cliffhanger_goal"],
    access_mode: "write_artifact",
  },
  {
    agent: "continuity_auditor",
    tools: ["guarded_canon", "continuity_patch", "reveal_guard"],
    access_mode: "write_patch",
  },
];

function buildChapterDraftBody(input: {
  story_title: string;
  target: BackendRuntimeDispatchEnvelope["target"];
  context_bundle: ContextBundleResponse;
  persona: PersonaStateDetailResponse;
}) {
  const moodHint = input.persona.state_snapshot.mood_tags[0] ?? "继续推进";
  const sceneFocus = input.context_bundle.scene_focus;
  const promiseSlice = input.context_bundle.promise_slice;
  const continuityPolicy = input.context_bundle.continuity_policy;
  const referenceHint =
    input.context_bundle.included_refs.length > 0
      ? `本场优先盯住 ${input.context_bundle.included_refs
          .slice(0, 3)
          .map((item) => item.title)
          .join("、")}。`
      : "桌上没有多余的噪音，只有故事本身。";
  const targetHint =
    input.target === "next_scene"
      ? "这一场先把眼神和停顿写得更近。"
      : input.target === "next_chapter"
        ? "这一章要顺着上一段余温继续往前推。"
        : "这一章要把开场的关系张力先立住。";
  const promiseHint =
    promiseSlice.promise_gap ??
    promiseSlice.front_ten_chapter_promise ??
    "这一章要兑现读者已经被许下的追更承诺。";
  const rewriteHint =
    promiseSlice.rewrite_targets[0] ??
    "把章末钩子再往前埋深一点，让读者知道下一章非看不可。";
  const revealHint =
    continuityPolicy.guarded_titles.length > 0
      ? `先按 ${continuityPolicy.reveal_policy} 守住 ${continuityPolicy.guarded_titles.join("、")}，${sceneFocus.reveal_guard}`
      : `先按 ${continuityPolicy.reveal_policy} 守住底牌，${sceneFocus.reveal_guard}`;

  return [
    "第一章",
    "",
    `《${input.story_title}》在 ${moodHint} 的气流里开场。`,
    `${sceneFocus.chapter_goal}${targetHint}`,
    `她站在站台尽头，先听见旧列车碾过铁轨的回声，再听见自己心里那句迟迟没说出口的话。当前场景要先 ${sceneFocus.scene_goal}，冲突是 ${sceneFocus.scene_conflict}。`,
    `转折点已经埋好：${sceneFocus.scene_turning_point}。${referenceHint}`,
    `${promiseHint} 这一章还得记得 ${promiseSlice.relationship_promise ?? "把关系再往前推一步"}。`,
    `连续性提醒：${continuityPolicy.compact_summary}。${continuityPolicy.suggested_patch ? ` 下一次写回优先 ${continuityPolicy.suggested_patch.summary}` : ""}`,
    `${revealHint} ${continuityPolicy.reveal_safe_summary} ${rewriteHint}`,
    "风从潮湿的巷口灌进来，他终于出现，只说了一句：我还是想把那本没写完的故事，亲手交给你。",
  ].join("\n");
}

export function buildChapterGenerationRuntimeDispatch(input: {
  task_id: string;
  story_id: string;
  account_id: string;
  target: BackendRuntimeDispatchEnvelope["target"];
  story_title: string;
  context_bundle: ContextBundleResponse;
  persona: PersonaStateDetailResponse;
  env?: Record<string, string | undefined>;
}): BackendRuntimeDispatchEnvelope {
  const runtimeConfig = readAiRuntimeConfig(input.env);
  const execution = resolveAiRuntimeExecutionPlan(runtimeConfig, {
    requested_tier: "creative_large",
  });

  return {
    task_id: input.task_id,
    story_id: input.story_id,
    account_id: input.account_id,
    workflow_key: "story.chapter.generate",
    adapter_kind: "backend_runtime_server",
    target: input.target,
    story_title: input.story_title,
    context_bundle_id: input.context_bundle.bundle_id,
    persona_snapshot_id: input.persona.state_snapshot.snapshot_id,
    dispatched_at: new Date().toISOString(),
    execution,
    agent_roster: [...STORY_CHAPTER_AGENT_ROSTER],
    tool_scope: STORY_CHAPTER_TOOL_SCOPE.map((entry) => ({
      ...entry,
      tools: [...entry.tools],
    })),
    memory_map: {
      context_ref_ids: input.context_bundle.included_refs.map((item) => item.ref_id),
      scene_ref_ids: input.context_bundle.included_refs
        .filter((item) => item.ref_type === "scene_card_set" || item.ref_type === "outline_bundle")
        .map((item) => item.ref_id),
      promise_ref_ids: input.context_bundle.included_refs
        .filter((item) => item.ref_type === "promise" || item.ref_type === "reader_review")
        .map((item) => item.ref_id),
      guarded_ref_ids: [...input.context_bundle.continuity_policy.guarded_canon_ids],
      persona_reason_ref_ids: input.persona.state_snapshot.reason_refs.map((item) => item.ref_id),
      persona_state_code: input.persona.state_snapshot.state_code,
    },
  };
}

export async function runChapterGenerationViaServerAdapter(input: {
  dispatch: BackendRuntimeDispatchEnvelope;
  context_bundle: ContextBundleResponse;
  persona: PersonaStateDetailResponse;
}): Promise<BackendRuntimeAdapterResult> {
  const chapter_id = randomUUID();
  const created_at = new Date().toISOString();
  const body_text = buildChapterDraftBody({
    story_title: input.dispatch.story_title,
    target: input.dispatch.target,
    context_bundle: input.context_bundle,
    persona: input.persona,
  });
  const artifact_refs: RuntimeTaskArtifactRefView[] = [
    buildRuntimeTaskArtifactRef({
      artifact_type: "chapter_draft",
      story_id: input.dispatch.story_id,
      chapter_id,
      object_key: toChapterDraftObjectKey(input.dispatch.story_id, chapter_id),
      created_at,
    }),
  ];

  return {
    workflow_key: input.dispatch.workflow_key,
    adapter_kind: input.dispatch.adapter_kind,
    execution: input.dispatch.execution,
    agent_roster: [...input.dispatch.agent_roster],
    tool_scope: input.dispatch.tool_scope.map((entry) => ({
      ...entry,
      tools: [...entry.tools],
    })),
    context_bundle_id: input.dispatch.context_bundle_id,
    persona_snapshot_id: input.dispatch.persona_snapshot_id,
    callback: {
      status: "applied",
      chapter: {
        chapter_id,
        chapter_no: 1,
        title: `第一章 · ${input.dispatch.story_title}`,
        summary: `${input.dispatch.story_title} 的章节草稿已根据上下文与房间状态生成。`,
        body_text,
      },
      notification: {
        title: `${input.dispatch.story_title} 第一章已送达`,
        body: "这一章已经写好，可以直接打开阅读器继续往下看。",
      },
      room_events: ["chapter_drafted", "persona_shifted"],
      artifact_refs,
    },
  };
}
