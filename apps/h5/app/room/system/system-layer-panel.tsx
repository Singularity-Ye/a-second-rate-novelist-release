"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ExperienceProjection, VnextSessionAdmissionManifest } from "@erliu/shared-contracts/vnext-experience";
import type {
  VnextModelProfileId,
  VnextModelProfileSettings,
  VnextModelPurpose,
} from "@erliu/shared-contracts";
import {
  acceptExperienceAdmission,
  bootstrapExperienceSession,
  readExperienceDraft,
  readExperienceProjection,
} from "../../lib/experience-api";
import {
  readRoomStoryContext,
  RoomStoryApiError,
  streamRoomDraftFeedback,
  type RoomDraftFeedback,
  type RoomStoryContext,
  type RoomStoryContextResponse,
} from "../../lib/room-story-api";
import { getFormalSceneRoute } from "../novelist/scene-manifest";
import { getLifeActivity } from "../novelist/life-activities";
import { createNovelistPersona, novelistOpeningLine, resolveNovelistReply } from "../novelist/novelist-persona";
import { NovelistChatRequestError, streamNovelistChat, type NovelistChatChannel } from "./novelist-chat-api";
import {
  readModelProfileSettings,
  setModelPreference,
} from "./model-profile-api";
import {
  applyCreativeSupportDecision,
  createPreviewSystemBinding,
  loadSystemBinding,
  submitCreativeEvidence,
  updateCreativeSupportTask,
  updateNovelistRelationship,
  updateSubsystemConversation,
  updateSystemConversation,
  type CreativeSupportTaskStatus,
  type SystemConversationMessage,
  type SystemBindingSnapshot,
} from "./system-layer";
import styles from "./system-layer-panel.module.css";

export interface SystemLayerObservation {
  sceneLabel: string;
  activityLabel: string;
  focus: number;
  fatigue: number;
  inspiration: number;
  emotionalLoad: number;
}

interface SystemLayerPanelProps {
  observation: SystemLayerObservation;
  activeChannel?: NovelistChatChannel | null;
  onRequestChannel?: (channel: NovelistChatChannel | null) => void;
}

const taskStatusLabels: Readonly<Record<CreativeSupportTaskStatus, string>> = {
  offered: "等你一句话",
  accepted: "已记录，未排产",
  deferred: "休息中",
  scoped: "已记录小任务",
};

const evidenceStatusLabels = {
  awaiting: "还没交稿",
  submitted: "已交稿",
  accepted: "已通过",
  "needs-revision": "正在重写",
} as const;

const relationshipLabels = {
  guarded: "还没完全服你",
  testing: "正在试探你",
  working: "开始有默契",
  trusted: "很信任你",
} as const;

type ChatStatus = "local" | "connecting" | "online" | "queued" | "error" | "restricted" | "idle";

const chatStatusLabels: Readonly<Record<ChatStatus, string>> = {
  local: "开发预览",
  connecting: "连接中",
  online: "在线流式",
  queued: "已交给他",
  error: "连接中断",
  restricted: "合规限制",
  idle: "等待你说话",
};

type GatewayState = "checking" | "admission" | "active" | "error";

type ExperienceHandoffStatus = "submitted" | Exclude<ExperienceProjection["status"], "available">;

const experienceHandoffLabels: Readonly<Record<ExperienceHandoffStatus, string>> = {
  submitted: "已提交",
  listening: "理解中",
  writing: "写作中",
  revising: "返修中",
  draft_ready: "稿件可读",
  unavailable: "暂不可用",
};

const experienceHandoffSteps: readonly ExperienceHandoffStatus[] = [
  "submitted",
  "listening",
  "writing",
  "draft_ready",
];

function handoffStatusForProjection(projection: ExperienceProjection): Exclude<ExperienceProjection["status"], "available"> | null {
  return projection.status === "available" ? null : projection.status;
}

const roomStoryProgressLabels: Readonly<Record<RoomStoryContext["progress"], string>> = {
  idle: "尚未建立作品进度",
  understanding: "理解中",
  writing: "正式写作中",
  revising: "正式返修中",
  draft_ready: "草稿已就绪",
  accepted: "已有已接受内容",
  blocked: "作品上下文受限",
};

function handoffStatusForRoomStoryContext(
  context: RoomStoryContext,
): Exclude<ExperienceProjection["status"], "available"> | null {
  if (context.access === "blocked" || context.progress === "blocked") return "unavailable";
  if (context.progress === "understanding") return "listening";
  if (context.progress === "writing") return "writing";
  if (context.progress === "revising") return "revising";
  if (context.progress === "draft_ready" || context.progress === "accepted") return "draft_ready";
  return null;
}

function experienceHandoffDescription(
  status: ExperienceHandoffStatus,
  projection: ExperienceProjection | null,
) {
  if (status === "submitted") return "原话已交给正式创作入口，正在保留同一房间会话。";
  if (status === "listening") return projection?.understanding?.clarificationQuestion ?? "创作入口正在确认你的意思，聊天回复不会被当作正文。";
  if (status === "writing") return "正式创作正在独立链路中进行；完成后只回传可核验的稿件状态。";
  if (status === "revising") return "返修已经进入正式入口，旧稿仍保留，不会被静默覆盖。";
  if (status === "draft_ready") return "稿件已经可以在正式创作台阅读；这条聊天回复不等于作品证据。";
  return "正式创作链路当前没有开放；原话仍保留，普通聊天不受影响。";
}

type ComposerMode = "persona" | "raw";
type HostIntentKey = "care" | "nudge" | "rest" | "stuck";

interface HostMessageDraft {
  readonly key: HostIntentKey;
  readonly rawIntent: string;
  readonly renderedHostMessage: string;
}

type HostIntentTone = "warm" | "teasing" | "firm" | "observant";

interface HostIntentVoiceCopy {
  readonly line: string;
  readonly message: string;
}

const hostIntentSuggestions: ReadonlyArray<HostMessageDraft & { readonly label: string }> = [
  {
    key: "care",
    label: "关心一下",
    rawIntent: "关心：先问问小说家现在卡在哪里，不先催稿。",
    renderedHostMessage: "先不催，问问你现在卡在哪一句；今天如果只想说说，也可以。",
  },
  {
    key: "nudge",
    label: "催稿一下",
    rawIntent: "催稿：邀请小说家先完成一个具体动作，不把任务扩大。",
    renderedHostMessage: "继续写吧，先只完成一个具体动作，写完给我看；不用一口气铺开。",
  },
  {
    key: "rest",
    label: "允许休息",
    rawIntent: "休息：允许小说家今天停笔，不把暂停解释成失败。",
    renderedHostMessage: "今天先休息，别把暂停理解成失败；明天再决定要不要缩小任务。",
  },
  {
    key: "stuck",
    label: "询问卡点",
    rawIntent: "卡点：请小说家说出现在最难下笔的那一处，暂不要求交稿。",
    renderedHostMessage: "你现在最难下笔的是哪一处？先把卡点说清，不急着交稿。",
  },
];

function hostIntentSuggestion(key: HostIntentKey) {
  return hostIntentSuggestions.find((suggestion) => suggestion.key === key) ?? hostIntentSuggestions[0]!;
}

const hostIntentVoiceCopy: Readonly<Record<HostIntentTone, Readonly<Record<HostIntentKey, HostIntentVoiceCopy>>>> = {
  teasing: {
    nudge: {
      line: "先别铺天盖地，写一小格。",
      message: "继续写吧，别一上来就想封神；先只完成一个具体动作，写完给我看。",
    },
    care: {
      line: "别装没事，交代一下。",
      message: "先不催，别装没事，告诉我现在卡在哪一句；今天只想说说也行。",
    },
    rest: {
      line: "先歇着，别把暂停包装成失踪。",
      message: "先休息，别把暂停包装成失踪；明天再把任务缩小了补回来。",
    },
    stuck: {
      line: "先报卡点，不急着交卷。",
      message: "先报卡点，别和空白页互相装不认识；说清最难下笔的那一处。",
    },
  },
  firm: {
    nudge: {
      line: "现在只做一个动作。",
      message: "现在只做一个具体动作：先写一小段，写完给我看，别把任务扩成整本书。",
    },
    care: {
      line: "先确认状态，再谈交稿。",
      message: "先确认你现在的状态；如果已经累了就直说，不用靠硬撑证明能交稿。",
    },
    rest: {
      line: "准你停笔，但要留下下一步。",
      message: "今天可以停笔，但请把明天的最小一步留下，别让暂停变成失联。",
    },
    stuck: {
      line: "把卡点说清，再决定怎么推。",
      message: "把最难下笔的那一处说清楚；先定位问题，再决定是不是要交稿。",
    },
  },
  warm: {
    nudge: {
      line: "陪你先写一小段。",
      message: "我们先完成一个具体动作，写一小段就好；不用一口气铺开。",
    },
    care: {
      line: "我在，先说说卡在哪。",
      message: "先不催，跟我说说你现在卡在哪一句；今天只想聊聊也可以。",
    },
    rest: {
      line: "今天停笔，也算往前走。",
      message: "今天先休息，暂停不等于失败；明天再一起把任务缩小。",
    },
    stuck: {
      line: "把卡点摊开，我陪你拆。",
      message: "你现在最难下笔的是哪一处？把卡点摊开，我们一起拆，不急着交稿。",
    },
  },
  observant: {
    nudge: {
      line: "先完成一个具体动作。",
      message: "继续写吧，先只完成一个具体动作，写完给我看；不用一口气铺开。",
    },
    care: {
      line: "先确认你现在还好吗。",
      message: "先不催，问问你现在卡在哪一句；今天如果只想说说，也可以。",
    },
    rest: {
      line: "先休息，别把暂停算失败。",
      message: "今天先休息，别把暂停理解成失败；明天再决定要不要缩小任务。",
    },
    stuck: {
      line: "先说最难下笔的那一处。",
      message: "你现在最难下笔的是哪一处？先把卡点说清，不急着交稿。",
    },
  },
};

function hostIntentTone(persona: SystemBindingSnapshot["persona"]): HostIntentTone {
  if (persona.voice.humor >= 72 && persona.voice.distance >= 34) return "teasing";
  if (persona.interventionStyle === "pressure" || persona.voice.pressure >= 68) return "firm";
  if (persona.interventionStyle === "inspire" || persona.voice.warmth >= 68) return "warm";
  return "observant";
}

function hostIntentAddress(persona: SystemBindingSnapshot["persona"]) {
  return persona.addressStyle.match(/称宿主为“([^”]+)”/)?.[1] ?? "宿主";
}

function hostIntentLexicon(persona: SystemBindingSnapshot["persona"], preferred: readonly string[]) {
  return preferred.find((word) => persona.lexicon.includes(word)) ?? persona.lexicon[0] ?? "";
}

function hostIntentCardTitle(key: HostIntentKey) {
  switch (key) {
    case "nudge":
      return "催稿";
    case "care":
      return "关心";
    case "rest":
      return "休息";
    case "stuck":
      return "卡点";
  }
}

function hostIntentCardLine(key: HostIntentKey, persona: SystemBindingSnapshot["persona"]) {
  return hostIntentVoiceCopy[hostIntentTone(persona)][key].line;
}

function hostIntentRenderedMessage(key: HostIntentKey, persona: SystemBindingSnapshot["persona"]) {
  const tone = hostIntentTone(persona);
  const address = hostIntentAddress(persona);
  const baseMessage = hostIntentVoiceCopy[tone][key].message;
  const rewardLexicon = hostIntentLexicon(persona, ["完成即结算", "小礼法宝", "火花", "先写一小口"]);
  const boundaryLexicon = hostIntentLexicon(persona, ["先核对", "证据", "检测到", "拆解一下"]);

  switch (tone) {
    case "teasing":
      return `${address}，${baseMessage}${rewardLexicon ? ` ${rewardLexicon}先记账，空白页不会自己投降。` : ""}`;
    case "firm":
      return `${address}，${baseMessage}${boundaryLexicon ? ` ${boundaryLexicon}，只留可验收的一步。` : ""}`;
    case "warm":
      return `${address}，${baseMessage}${rewardLexicon ? ` ${rewardLexicon}也可以很小。` : ""}`;
    case "observant":
      return `${address}，${baseMessage}${boundaryLexicon ? ` ${boundaryLexicon}后再推。` : ""}`;
  }
}

function taskVisualFor(
  status: CreativeSupportTaskStatus,
  evidenceStatus: keyof typeof evidenceStatusLabels,
) {
  if (evidenceStatus === "needs-revision") {
    return { kind: "revision", icon: "icon-revision-v2.png", stamp: "返修" } as const;
  }
  if (status === "deferred") {
    return { kind: "rest", icon: "icon-teacup-v2.png", stamp: "休息" } as const;
  }
  if (status === "accepted" || status === "scoped") {
    return { kind: "progress", icon: "icon-quill-v2.png", stamp: "推进" } as const;
  }
  return { kind: "care", icon: "icon-heart-v2.png", stamp: "建议" } as const;
}

const projectionPollStatuses = new Set<ExperienceProjection["status"]>([
  "listening",
  "writing",
  "revising",
]);

const publicRoomDemo = process.env.NEXT_PUBLIC_PUBLIC_ROOM_DEMO === "true";

const novelistWritingAvatarSrc = "/assets/ecology/characters/novelist/avatars/novelist-avatar-writing-v1-normalized.webp";
const novelistBlockedAvatarSrc = "/assets/ecology/characters/novelist/avatars/novelist-avatar-blocked-v1-normalized.png";
const novelistTiredAvatarSrc = "/assets/ecology/characters/novelist/avatars/novelist-avatar-tired-v1-normalized.png";
const novelistRelievedAvatarSrc = "/assets/ecology/characters/novelist/avatars/novelist-avatar-relieved-v1-normalized.png";

type NovelistAvatarState = "writing" | "blocked" | "tired" | "relieved" | "eating" | "sleeping" | "daydreaming" | "away";

type NovelistAvatarView = {
  src: string;
  state: NovelistAvatarState;
  label: string;
  icon: string;
};

/**
 * Keep the identity portrait stable while the small DOM badge follows the
 * novelist's current life activity. Dedicated state portraits can replace
 * this later without changing the chat contract.
 */
function activityAvatarFor(activityLabel: string): NovelistAvatarView {
  if (/吃饭/u.test(activityLabel)) return { src: novelistWritingAvatarSrc, state: "eating", label: "小说家：吃饭中", icon: "♨" };
  if (/睡觉|休息/u.test(activityLabel)) return { src: novelistWritingAvatarSrc, state: "sleeping", label: "小说家：睡觉中", icon: "☾" };
  if (/发呆|唱片|采风/u.test(activityLabel)) return { src: novelistWritingAvatarSrc, state: "daydreaming", label: "小说家：发呆中", icon: "⌁" };
  if (/外出|路上/u.test(activityLabel)) return { src: novelistWritingAvatarSrc, state: "away", label: "小说家：外出中", icon: "↗" };
  return { src: novelistWritingAvatarSrc, state: "writing", label: "小说家：写作中", icon: "✎" };
}

function presenceForActivity(activityLabel: string): string | null {
  if (/吃饭/u.test(activityLabel)) return "正在吃饭";
  if (/睡觉|休息/u.test(activityLabel)) return "正在休息";
  if (/发呆|唱片|采风/u.test(activityLabel)) return "正在发呆";
  if (/外出|路上/u.test(activityLabel)) return "正在外出";
  return null;
}

const publicRoomDemoProjection = {
  versionId: "public-room-demo-v1",
  status: "available",
  headline: "先和他聊聊",
  body: "公开体验只开放房间对话；不会在服务器保存聊天，也不会把一句对话伪装成已经完成的作品。",
  understanding: null,
  primaryAction: null,
  secondaryActions: [],
} satisfies ExperienceProjection;

function clientRequestId() {
  const requestId = globalThis.crypto?.randomUUID?.();
  if (!requestId) throw new NovelistChatRequestError("provider_unavailable");
  return requestId;
}

function projectionFeedback(projection: ExperienceProjection) {
  if (projection.status === "draft_ready") return "稿子回来了。你可以直接读稿。";
  if (projection.status === "listening") return projection.understanding?.clarificationQuestion ?? "他正在确认你真正想要什么。";
  if (projection.status === "writing") return "他已经动笔了，完成后会回到这里。";
  if (projection.status === "revising") return "他正在按你的意思修改，旧稿仍会保留。";
  if (projection.status === "unavailable") return "这次还没写成，原话仍保留着，稍后可以再试。";
  return projection.body;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function messageId(role: "system" | "novelist") {
  const suffix = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${role}-${suffix}`;
}

function channelMessages(binding: SystemBindingSnapshot, channel: NovelistChatChannel) {
  return channel === "novelist"
    ? [...(binding.conversation ?? [])]
    : [...(binding.subsystemConversation ?? [])];
}

function updateChannelMessages(
  binding: SystemBindingSnapshot,
  channel: NovelistChatChannel,
  messages: readonly SystemConversationMessage[],
) {
  return channel === "novelist"
    ? updateSystemConversation(binding, messages)
    : updateSubsystemConversation(binding, messages);
}

function localSubsystemReply(text: string, taskContractReady: boolean) {
  if (/证据|稿件|回传|登记|引用/u.test(text)) {
    return taskContractReady
      ? "边界检查通过：活动与路线已经登记。真正的稿件要等写作接口回传，不能把一句对话当成作品证据。"
      : "这项任务的活动或路线引用还没通过登记检查，我不会替你放行。";
  }
  if (/路线|场景|正史|系统|边界/u.test(text)) {
    return "我只负责证据和边界。路线、场景与正史各有自己的真值入口，不能因为一句聊天就被我悄悄改掉。";
  }
  return "我在。你可以问我任务是否登记、缺什么证据，或者哪一步还不能算作真正完成。";
}

function asApiMessages(messages: readonly SystemConversationMessage[]) {
  return messages.map((message) => ({
    role: message.role === "system" ? "user" as const : "assistant" as const,
    content: message.text,
  }));
}

function directMessageEffect(
  text: string,
  binding: SystemBindingSnapshot,
  observation: SystemLayerObservation,
  novelistPersona: ReturnType<typeof createNovelistPersona>,
) {
  const decision = resolveNovelistReply(novelistPersona, {
    text,
    focus: clamp(observation.focus),
    fatigue: clamp(observation.fatigue),
    inspiration: clamp(observation.inspiration),
    emotionalLoad: clamp(observation.emotionalLoad),
    hasDraft: binding.task.evidence.status !== "awaiting",
  });

  if (decision.disposition === "revision") {
    return {
      decision: "request-revision" as const,
      userInstruction: text,
      reply: decision.reply,
      relationshipDelta: decision.relationshipDelta,
      feedback: "已打回并登记返修；他会先自行找问题。",
    };
  }
  if (decision.disposition === "scoped") {
    return {
      decision: "scope" as const,
      deliverable: "完成一段 60—100 字的草稿，只要求让一个具体动作发生。",
      userInstruction: text,
      reply: decision.reply,
      relationshipDelta: decision.relationshipDelta,
      feedback: "他把任务缩小了，没有拿废话凑数。",
    };
  }
  if (decision.disposition === "accepted") {
    return {
      decision: "accept" as const,
      userInstruction: text,
      reply: decision.reply,
      relationshipDelta: decision.relationshipDelta,
      feedback: "已把任务交给小说家，等待实际开始。",
    };
  }
  return {
    decision: null,
    userInstruction: text,
    reply: decision.reply,
    relationshipDelta: decision.relationshipDelta,
    feedback: "已记入当前任务；他保留按作品需要处理的判断。",
  };
}

export function SystemLayerPanel({ observation, activeChannel, onRequestChannel }: SystemLayerPanelProps) {
  const [binding, setBinding] = useState<SystemBindingSnapshot>(() => createPreviewSystemBinding());
  const [localExpanded, setLocalExpanded] = useState(true);
  const [displayMode, setDisplayMode] = useState<"ambient" | "chat_focus" | "chat_history">("chat_focus");
  const [chatMode, setChatMode] = useState<NovelistChatChannel>("novelist");
  const [subsystemChatOpen, setSubsystemChatOpen] = useState(false);
  const [chatStatus, setChatStatus] = useState<ChatStatus>("idle");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [taskPanelOpen, setTaskPanelOpen] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");
  const [composerMode, setComposerMode] = useState<ComposerMode>("persona");
  const [pendingHostMessage, setPendingHostMessage] = useState<HostMessageDraft | null>(null);
  const [artifactRef, setArtifactRef] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [gatewayState, setGatewayState] = useState<GatewayState>("checking");
  const [runtimeAttestation, setRuntimeAttestation] = useState<{
    provider: string;
    model: string;
    profileId?: VnextModelProfileId;
  } | null>(null);
  const [modelSettings, setModelSettings] = useState<VnextModelProfileSettings | null>(null);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [savingModelPurpose, setSavingModelPurpose] = useState<VnextModelPurpose | null>(null);
  const [admissionManifest, setAdmissionManifest] = useState<VnextSessionAdmissionManifest | null>(null);
  const [projection, setProjection] = useState<ExperienceProjection | null>(null);
  const [experienceHandoffStatus, setExperienceHandoffStatus] = useState<ExperienceHandoffStatus | null>(null);
  const [draftBody, setDraftBody] = useState<string | null>(null);
  const [roomStorySnapshot, setRoomStorySnapshot] = useState<RoomStoryContextResponse | null>(null);
  const [roomStoryError, setRoomStoryError] = useState<string | null>(null);
  const [draftFeedback, setDraftFeedback] = useState<RoomDraftFeedback | null>(null);
  const [draftFeedbackState, setDraftFeedbackState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [draftFeedbackDraftId, setDraftFeedbackDraftId] = useState<string | null>(null);
  const [lastFailedRequest, setLastFailedRequest] = useState<{
    channel: NovelistChatChannel;
    text: string;
    assistantMessageId: string;
    clientRequestId: string;
    intentDraft?: HostMessageDraft;
  } | null>(null);
  const [lastRequestIssue, setLastRequestIssue] = useState<{
    code: string;
    requestId?: string;
    recovery?: string;
  } | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const previousActiveChannelRef = useRef(activeChannel);
  const abortRef = useRef<AbortController | null>(null);
  const draftFeedbackAbortRef = useRef<AbortController | null>(null);
  const gatewayRunIdRef = useRef(0);
  const gatewayRetryAttemptRef = useRef(0);
  const expanded = activeChannel !== undefined ? activeChannel !== null : localExpanded;

  const requestChannel = (channel: NovelistChatChannel | null) => {
    if (activeChannel === undefined) {
      setLocalExpanded(channel !== null);
      if (channel !== null) setChatMode(channel);
      return;
    }
    onRequestChannel?.(channel);
    if (channel !== null) setChatMode(channel);
  };

  useEffect(() => {
    const stored = loadSystemBinding();
    if (stored) setBinding(stored);
  }, []);

  useEffect(() => {
    if (activeChannel !== undefined && activeChannel !== null) setChatMode(activeChannel);
  }, [activeChannel]);

  useEffect(() => {
    const previousChannel = previousActiveChannelRef.current;
    previousActiveChannelRef.current = activeChannel;
    if (activeChannel === "novelist" && previousChannel !== "novelist") {
      messageInputRef.current?.focus();
    }
  }, [activeChannel]);

  const refreshRoomStoryContext = useCallback(async () => {
    try {
      const next = await readRoomStoryContext();
      setRoomStorySnapshot(next);
      setRoomStoryError(null);
    } catch (error) {
      if (error instanceof RoomStoryApiError && error.status === 401) {
        setRoomStorySnapshot(null);
      }
      setRoomStoryError(error instanceof RoomStoryApiError ? error.code : "room_story_unavailable");
    }
  }, []);

  const runGatewayBootstrap = useCallback(async (reason: "initial" | "automatic" | "manual") => {
    if (publicRoomDemo) {
      setProjection(publicRoomDemoProjection);
      setExperienceHandoffStatus(null);
      setRoomStorySnapshot(null);
      setRoomStoryError(null);
      setGatewayState("active");
      return;
    }

    const runId = gatewayRunIdRef.current + 1;
    gatewayRunIdRef.current = runId;
    setGatewayState("checking");
    if (reason === "manual") setFeedback("正在重新连接房间；你已经输入的原话不会丢。 ");

    try {
      const result = await bootstrapExperienceSession();
      if (gatewayRunIdRef.current !== runId) return;
      gatewayRetryAttemptRef.current = 0;
      if (result.status === "admission_required") {
        setAdmissionManifest(result.manifest);
        setGatewayState("admission");
        return;
      }
      setAdmissionManifest(null);
      setProjection(result.projection);
      setExperienceHandoffStatus(handoffStatusForProjection(result.projection));
      setGatewayState("active");
      if (reason !== "initial") setFeedback("房间已经重新接通。若上一句话尚未回复，可按 R 重试。 ");
    } catch {
      if (gatewayRunIdRef.current !== runId) return;
      gatewayRetryAttemptRef.current += 1;
      setProjection(null);
      setExperienceHandoffStatus(null);
      setRoomStorySnapshot(null);
      setGatewayState("error");
      if (reason === "manual") setFeedback("这次仍未接通；原话保留在本地，可以稍后再试。 ");
    }
  }, []);

  useEffect(() => {
    void runGatewayBootstrap("initial");
    return () => {
      gatewayRunIdRef.current += 1;
    };
  }, [runGatewayBootstrap]);

  useEffect(() => {
    if (publicRoomDemo || gatewayState !== "active") {
      if (publicRoomDemo) setRoomStorySnapshot(null);
      return undefined;
    }
    void refreshRoomStoryContext();
    const timer = window.setInterval(() => {
      void refreshRoomStoryContext();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [gatewayState, refreshRoomStoryContext]);

  useEffect(() => {
    const currentDraftId = roomStorySnapshot?.context.draft?.contentId ?? null;
    if (draftFeedbackDraftId !== null && currentDraftId !== draftFeedbackDraftId) {
      setDraftFeedback(null);
      setDraftFeedbackState("idle");
      setDraftFeedbackDraftId(null);
    }
  }, [draftFeedbackDraftId, roomStorySnapshot]);

  useEffect(() => () => {
    draftFeedbackAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (publicRoomDemo || gatewayState !== "error") return undefined;
    const delay = Math.min(1_500 * (2 ** Math.min(4, Math.max(0, gatewayRetryAttemptRef.current - 1))), 30_000);
    const timer = window.setTimeout(() => {
      void runGatewayBootstrap("automatic");
    }, delay);
    return () => window.clearTimeout(timer);
  }, [gatewayState, runGatewayBootstrap]);

  useEffect(() => {
    if (publicRoomDemo) return undefined;
    if (gatewayState !== "active" || projection === null || !projectionPollStatuses.has(projection.status)) return;
    const timer = window.setInterval(() => {
      void readExperienceProjection().then((next) => {
        setProjection(next);
        const nextHandoffStatus = handoffStatusForProjection(next);
        if (nextHandoffStatus !== null) setExperienceHandoffStatus(nextHandoffStatus);
        setFeedback(projectionFeedback(next));
        if (next.status === "draft_ready") setChatStatus("queued");
      }).catch(() => {
        // Keep the last server projection visible; the next poll may recover.
      });
    }, 2500);
    return () => window.clearInterval(timer);
  }, [gatewayState, projection]);

  useEffect(() => {
    if (publicRoomDemo || gatewayState !== "active") return undefined;
    const controller = new AbortController();
    void readModelProfileSettings(controller.signal)
      .then(setModelSettings)
      .catch(() => {
        setModelSettings(null);
      });
    return () => controller.abort();
  }, [gatewayState]);

  const chooseModel = async (
    purpose: VnextModelPurpose,
    profileId: VnextModelProfileId,
  ) => {
    const current = modelSettings?.preferences[purpose];
    if (!current || savingModelPurpose !== null) return;
    if (current.profileId === profileId && current.available) return;
    setSavingModelPurpose(purpose);
    try {
      const next = await setModelPreference({
        purpose,
        profileId,
        expectedRevision: current.revision,
      });
      setModelSettings(next);
      if (purpose === "conversation") setRuntimeAttestation(null);
      setFeedback(
        purpose === "conversation"
          ? "对话模型已切换；下一句话会重新核验实际返回模型。"
          : "分析模型偏好已保存；未接通的书源任务不会伪装成已经执行。",
      );
    } catch {
      try {
        setModelSettings(await readModelProfileSettings());
      } catch {
        // Keep the last validated catalog visible.
      }
      setFeedback("模型选择没有保存，目录已重新核对，请再试一次。 ");
    } finally {
      setSavingModelPurpose(null);
    }
  };

  const taskContractReady = useMemo(() => {
    const activity = getLifeActivity(binding.task.activityKey);
    const route = getFormalSceneRoute("study", binding.task.routeKey);
    return Boolean(activity && route);
  }, [binding.task.activityKey, binding.task.routeKey]);
  const taskVisual = taskVisualFor(binding.task.status, binding.task.evidence.status);
  const selectedConversationModel = modelSettings?.profiles.find(
    (profile) => profile.id === modelSettings.preferences.conversation.profileId,
  )?.model ?? "发送后核验";

  const visibleMessages = channelMessages(binding, chatMode);
  const displayedMessages = displayMode === "chat_focus"
    ? visibleMessages.slice(-3)
    : visibleMessages;
  const relationship = binding.novelistRelationship;
  const novelistPersona = useMemo(() => createNovelistPersona({
    relationshipTurns: relationship?.turns ?? Math.floor((binding.conversation?.length ?? 0) / 2),
    ...(relationship ? { trust: relationship.trust } : {}),
  }), [binding.conversation?.length, relationship?.trust, relationship?.turns]);
  const isActuallyWriting = observation.activityLabel === "书房写作" || observation.activityLabel === "study-writing";
  const presence = isActuallyWriting
    ? "正在写"
    : presenceForActivity(observation.activityLabel)
      ?? (binding.task.status === "deferred"
        ? "今天休息"
        : observation.fatigue >= 75
          ? "有点累"
          : "现在有空");
  const novelistOpening = novelistOpeningLine(novelistPersona, {
    taskStatus: binding.task.status,
    isWriting: isActuallyWriting,
    fatigue: clamp(observation.fatigue),
  });
  const activityAvatar = activityAvatarFor(observation.activityLabel);
  const novelistAvatar: NovelistAvatarView = observation.emotionalLoad >= 70
    ? { src: novelistBlockedAvatarSrc, state: "blocked", label: "小说家：卡住了", icon: "!" }
    : observation.fatigue >= 75
      ? { src: novelistTiredAvatarSrc, state: "tired", label: "小说家：有点疲惫", icon: "☾" }
      : observation.inspiration >= 72 && observation.fatigue < 40
        ? { src: novelistRelievedAvatarSrc, state: "relieved", label: "小说家：松了一口气", icon: "✦" }
      : activityAvatar;

  const openingMessage = chatMode === "novelist"
    ? novelistOpening
    : "边界检查已就位。你可以问我：这项任务现在算不算登记完整？";

  const focusComposer = (channel: NovelistChatChannel) => {
    requestChannel(channel);
    if (channel === "novelist" || subsystemChatOpen) {
      window.setTimeout(() => messageInputRef.current?.focus(), 0);
    }
  };

  const loadTaskSuggestionToNovelist = () => {
    const criteria = binding.task.acceptanceCriteria.slice(0, 2).join("；");
    setPendingHostMessage(null);
    setMessageDraft(`子系统给了一条建议：${binding.task.title}。最小交付是“${binding.task.deliverable}”，验收先看“${criteria}”。这只是建议，你觉得今天怎么推进？`);
    setSubsystemChatOpen(false);
    setTaskPanelOpen(false);
    requestChannel("novelist");
    setFeedback("任务建议只装填进了对话草稿；尚未发布、接受，也没有生成作品证据。 ");
    window.setTimeout(() => messageInputRef.current?.focus(), 0);
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
  };

  const updateComposerDraft = (value: string) => {
    setMessageDraft(value);
    setPendingHostMessage((previous) => previous
      ? composerMode === "raw"
        ? { ...previous, rawIntent: value }
        : { ...previous, renderedHostMessage: value }
      : previous);
  };

  const fillHostIntent = (key: HostIntentKey) => {
    const suggestion = {
      ...hostIntentSuggestion(key),
      renderedHostMessage: hostIntentRenderedMessage(key, binding.persona),
    };
    const draft = composerMode === "raw" ? suggestion.rawIntent : suggestion.renderedHostMessage;
    setPendingHostMessage(suggestion);
    setMessageDraft(draft);
    setFeedback(`已按“${binding.persona.interventionLabel}”装填“${suggestion.label}”意图草稿；你可以编辑后再发送。`);
    window.setTimeout(() => messageInputRef.current?.focus(), 0);
  };

  const fillComposerText = (text: string) => {
    setPendingHostMessage(null);
    setMessageDraft(text);
    setFeedback("已装填到输入框；你可以编辑后再发送。 ");
    window.setTimeout(() => messageInputRef.current?.focus(), 0);
  };

  const switchComposerMode = (mode: ComposerMode) => {
    setComposerMode(mode);
    if (pendingHostMessage) {
      setMessageDraft(mode === "raw"
        ? pendingHostMessage.rawIntent
        : pendingHostMessage.renderedHostMessage);
    }
  };

  const acceptAdmission = async () => {
    if (admissionManifest === null) return;
    setGatewayState("checking");
    setFeedback("正在为这间房建立连接……");
    try {
      const result = await acceptExperienceAdmission(admissionManifest);
      setProjection(result.projection);
      setExperienceHandoffStatus(handoffStatusForProjection(result.projection));
      setAdmissionManifest(null);
      setGatewayState("active");
      setFeedback("可以了。以后只管说人话，其他交给后台。 ");
    } catch {
      setGatewayState("admission");
      setFeedback("这次确认没有成功，没有发送任何创作内容。可以稍后再试。 ");
    }
  };

  const openDraft = async () => {
    try {
      const draft = await readExperienceDraft();
      setDraftBody(draft.body);
    } catch {
      setFeedback("稿子暂时没有取回来，稍后再试。 ");
    }
  };

  const requestDraftFeedback = async () => {
    if (draftFeedbackState === "loading") return;
    const snapshot = roomStorySnapshot;
    const draft = snapshot?.context.draft;
    if (
      snapshot === null ||
      snapshot.context.access !== "available" ||
      snapshot.context.source !== "persisted_story_truth" ||
      snapshot.context.progress !== "draft_ready" ||
      draft === null ||
      draft === undefined
    ) {
      setFeedback("当前没有服务端确认的 draft_ready；我不会让聊天模型猜测或伪造稿件进度。 ");
      return;
    }
    const controller = new AbortController();
    draftFeedbackAbortRef.current = controller;
    setDraftFeedbackState("loading");
    setDraftFeedback(null);
    try {
      const ready = await streamRoomDraftFeedback(
        {
          draftContentId: draft.contentId,
          basedOnProjectionVersionId: snapshot.projectionVersionId,
        },
        (event) => {
          setDraftFeedback(event.feedback);
          setRoomStorySnapshot({
            projectionVersionId: event.projectionVersionId,
            context: event.storyContext,
          });
        },
        controller.signal,
      );
      setDraftFeedback(ready.feedback);
      setDraftFeedbackDraftId(ready.draftContentId);
      setRoomStorySnapshot({
        projectionVersionId: ready.projectionVersionId,
        context: ready.storyContext,
      });
      setDraftFeedbackState("ready");
      setFeedback("小说家已经根据这份真实草稿汇报；这条反馈不是正文、Canon 或作品证据。 ");
    } catch (error) {
      if (controller.signal.aborted) return;
      setDraftFeedback(null);
      setDraftFeedbackState("error");
      setFeedback(error instanceof RoomStoryApiError
        ? `这次没有拿到真实稿件汇报（${error.code}）；原有作品状态保持不变。 `
        : "这次没有拿到真实稿件汇报；原有作品状态保持不变。 ");
    } finally {
      if (draftFeedbackAbortRef.current === controller) draftFeedbackAbortRef.current = null;
    }
  };

  const sendMessage = async (rawText: string, options: { retry?: boolean } = {}) => {
    if (streaming && !options.retry) {
      setFeedback("他还在回复，等这一段落地，或者按停止。 ");
      return;
    }

    const channel = options.retry && lastFailedRequest ? lastFailedRequest.channel : chatMode;
    const currentMessages = channelMessages(binding, channel);
    const retryMessages = options.retry && lastFailedRequest
      ? currentMessages.filter((message) => message.id !== lastFailedRequest.assistantMessageId)
      : currentMessages;
    const retryUser = options.retry ? retryMessages[retryMessages.length - 1] : undefined;
    const text = (options.retry && retryUser?.role === "system" ? retryUser.text : rawText).trim().slice(0, 600);
    const intentDraft = options.retry ? lastFailedRequest?.intentDraft : pendingHostMessage;
    if (!text) {
      setFeedback("随便说一句就好，不用写成任务书。 ");
      return;
    }
    if (gatewayState !== "active") {
      const createdAt = new Date().toISOString();
      const assistantMessageId = options.retry && lastFailedRequest
        ? lastFailedRequest.assistantMessageId
        : messageId("novelist");
      const requestId = options.retry && lastFailedRequest
        ? lastFailedRequest.clientRequestId
        : clientRequestId();
      const disconnectedMessages = options.retry
        ? [
            ...retryMessages,
            { id: assistantMessageId, role: "novelist" as const, text: "（连接尚未建立；原话已保留，恢复后可重试）", createdAt },
          ]
        : [
            ...currentMessages,
            { id: messageId("system"), role: "system" as const, text, createdAt },
            { id: assistantMessageId, role: "novelist" as const, text: "（连接尚未建立；原话已保留，恢复后可重试）", createdAt },
          ];
      setBinding((previous) => updateChannelMessages(previous, channel, disconnectedMessages));
      setMessageDraft("");
      setPendingHostMessage(null);
      setChatStatus(gatewayState === "checking" ? "connecting" : "error");
      setLastFailedRequest({
        channel,
        text,
        assistantMessageId,
        clientRequestId: requestId,
        ...(intentDraft ? { intentDraft } : {}),
      });
      setFeedback(gatewayState === "admission"
        ? "原话已留在对话里；完成使用确认后可以重试，当前没有伪造回复。"
        : gatewayState === "checking"
          ? "正在确认房间连接；原话已经留在本地，没有被吞掉。"
          : "小说后端暂时没有接通；原话已留在对话里，当前没有伪造回复。 ");
      return;
    }

    const history = options.retry ? retryMessages.slice(0, -1) : currentMessages;
    const effect = channel === "novelist" && !options.retry
      ? directMessageEffect(text, binding, observation, novelistPersona)
      : null;
    const baseBinding = binding;
    const requestId = options.retry && lastFailedRequest
      ? lastFailedRequest.clientRequestId
      : clientRequestId();

    const createdAt = new Date().toISOString();
    const assistantMessageId = messageId("novelist");
    const messagesForView = [
      ...((options.retry ? retryMessages : currentMessages).filter((message) => message.id !== lastFailedRequest?.assistantMessageId)),
      ...(options.retry ? [] : [{ id: messageId("system"), role: "system" as const, text, createdAt }]),
      { id: assistantMessageId, role: "novelist" as const, text: "", createdAt },
    ];
    const optimistic = updateChannelMessages(baseBinding, channel, messagesForView);
    setBinding(optimistic);
    setMessageDraft("");
    setPendingHostMessage(null);
    setFeedback("正在把你的话交给他……");
    setLastRequestIssue(null);
    setChatStatus("connecting");
    setStreaming(true);
    setLastFailedRequest({
      channel,
      text,
      assistantMessageId,
      clientRequestId: requestId,
      ...(intentDraft ? { intentDraft } : {}),
    });

    const controller = new AbortController();
    abortRef.current = controller;
    let received = "";
    try {
      const result = await streamNovelistChat({
        clientRequestId: requestId,
        channel,
        text,
        messages: asApiMessages(history),
        persona: {
          identityName: baseBinding.origin.identityName,
          personalityCode: baseBinding.origin.personalityCode,
          addressStyle: baseBinding.persona.addressStyle,
          interventionStyle: baseBinding.persona.interventionStyle,
          relationshipLabel: baseBinding.persona.relationshipLabel,
          lexicon: baseBinding.persona.lexicon,
          voice: baseBinding.persona.voice,
        },
        task: {
          status: baseBinding.task.status,
          title: baseBinding.task.title,
          deliverable: baseBinding.task.deliverable,
          ...(baseBinding.task.userInstruction ? { userInstruction: baseBinding.task.userInstruction } : {}),
          evidenceStatus: baseBinding.task.evidence.status,
        },
        observation: {
          sceneLabel: observation.sceneLabel,
          activityLabel: observation.activityLabel,
          focus: clamp(observation.focus),
          fatigue: clamp(observation.fatigue),
          inspiration: clamp(observation.inspiration),
          emotionalLoad: clamp(observation.emotionalLoad),
        },
      }, (chunk) => {
        received += chunk;
        setChatStatus("online");
        setBinding((previous) => {
          const updated = channelMessages(previous, channel).map((message) => message.id === assistantMessageId
            ? { ...message, text: received }
            : message);
          return updateChannelMessages(previous, channel, updated);
        });
      }, controller.signal, (route) => {
        setProjection(route.projection);
        if (route.storyContext !== undefined) {
          setRoomStorySnapshot({
            projectionVersionId: route.projection.versionId,
            context: route.storyContext,
          });
          setRoomStoryError(null);
        }
        if (route.handling === "submitted") {
          setExperienceHandoffStatus("submitted");
          setFeedback("创作委托已提交；正在进入正式创作链路。 ");
        } else {
          const routeHandoffStatus = handoffStatusForProjection(route.projection);
          if (routeHandoffStatus !== null) setExperienceHandoffStatus(routeHandoffStatus);
        }
      });

      setProjection(result.route.projection);
      if (result.storyContext !== undefined) {
        setRoomStorySnapshot({
          projectionVersionId: result.route.projection.versionId,
          context: result.storyContext,
        });
        setRoomStoryError(null);
      }
      const resultHandoffStatus = handoffStatusForProjection(result.route.projection);
      if (resultHandoffStatus !== null) setExperienceHandoffStatus(resultHandoffStatus);
      if (result.provider && result.model) {
        setRuntimeAttestation({
          provider: result.provider,
          model: result.model,
          ...(result.profileId === undefined
            ? {}
            : { profileId: result.profileId }),
        });
      }
      if (result.route.handling === "conversation") {
        if (!received) throw new NovelistChatRequestError("invalid_runtime_output");
        setChatStatus("online");
      } else {
        const routedReply = result.route.handling === "submitted"
          ? received || result.route.projection.body
          : "这一步现在还没接通；我没有假装已经改好。你的原话先留在这里。";
        setBinding((previous) => updateChannelMessages(previous, channel, channelMessages(previous, channel).map((message) => message.id === assistantMessageId
          ? { ...message, text: routedReply }
          : message)));
        setChatStatus(result.route.handling === "submitted" ? "queued" : "idle");
      }
      setLastFailedRequest(null);
      setFeedback(result.route.handling === "conversation"
        ? channel === "novelist"
          ? "他已经收到你的话；正式写作是否开始，只看下方真实状态。"
          : "子系统已回复；它只负责证据和边界。 "
        : projectionFeedback(result.route.projection));
    } catch (error) {
      const code = error instanceof NovelistChatRequestError ? error.code : "provider_unavailable";
      const requestError = error instanceof NovelistChatRequestError ? error : null;
      if (controller.signal.aborted) {
        setChatStatus("idle");
        setFeedback(received ? "已停止，当前已经收到的内容保留在这里。" : "已停止这次回复。 ");
        setLastFailedRequest(null);
        if (!received) {
          setBinding((previous) => updateChannelMessages(previous, channel, channelMessages(previous, channel).map((message) => message.id === assistantMessageId
            ? { ...message, text: "（这次回复已停止）" }
            : message)));
        }
      } else if (!received) {
        const allowLocalPreview = process.env.NEXT_PUBLIC_NOVELIST_CHAT_LOCAL_PREVIEW === "true";
        if (allowLocalPreview) {
          const localReply = effect?.reply ?? localSubsystemReply(text, taskContractReady);
          setChatStatus("local");
          setFeedback(effect?.feedback ?? "写作引擎没有接通；当前只是明确标注的开发预览，按 R 可以重试。 ");
          setBinding((previous) => {
            const taskBinding = effect
              ? effect.decision
                ? applyCreativeSupportDecision(previous, {
                    decision: effect.decision,
                    userInstruction: effect.userInstruction,
                    ...(effect.deliverable ? { deliverable: effect.deliverable } : {}),
                  })
                : updateCreativeSupportTask(previous, { userInstruction: effect.userInstruction })
              : previous;
            const previewBinding = effect
              ? updateNovelistRelationship(taskBinding, effect.relationshipDelta)
              : previous;
            return updateChannelMessages(
              previewBinding,
              channel,
              channelMessages(previewBinding, channel).map((message) => message.id === assistantMessageId
                ? { ...message, text: localReply }
                : message),
            );
          });
        } else {
          if (code === "compliance_blocked" && (requestError?.recovery === undefined || requestError.recovery === "none")) {
            setChatStatus("restricted");
            if (channel === "novelist") setExperienceHandoffStatus("unavailable");
            setLastFailedRequest(null);
            setLastRequestIssue(requestError
              ? {
                  code,
                  ...(requestError.requestId ? { requestId: requestError.requestId } : {}),
                  ...(requestError.recovery ? { recovery: requestError.recovery } : {}),
                }
              : { code });
            setFeedback("创作链路尚未启用：当前运行时缺少合规 worker；普通聊天可用");
            setBinding((previous) => updateChannelMessages(previous, channel, channelMessages(previous, channel).map((message) => message.id === assistantMessageId
              ? { ...message, text: "（原话已保留；当前没有生成正式创作结果）" }
              : message)));
          } else {
            setChatStatus("error");
            setLastRequestIssue(requestError
              ? {
                  code,
                  ...(requestError.requestId ? { requestId: requestError.requestId } : {}),
                  ...(requestError.recovery ? { recovery: requestError.recovery } : {}),
                }
              : null);
            setFeedback(code === "provider_unconfigured"
              ? "写作引擎尚未完成统一配置。这句话已留在对话里，但没有冒充在线回复；按 R 重试。"
              : "写作引擎暂时不可用。这句话已留在对话里，但没有冒充在线回复；按 R 重试。 ");
            setBinding((previous) => updateChannelMessages(previous, channel, channelMessages(previous, channel).map((message) => message.id === assistantMessageId
              ? { ...message, text: "（这次没有接通写作引擎，未生成回复）" }
              : message)));
          }
        }
      } else {
        setChatStatus("error");
        setLastRequestIssue(requestError
          ? {
              code,
              ...(requestError.requestId ? { requestId: requestError.requestId } : {}),
              ...(requestError.recovery ? { recovery: requestError.recovery } : {}),
            }
          : null);
        setFeedback("流式连接中断，已经收到的内容保留；按 R 重试。 ");
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setStreaming(false);
    }
  };

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const isEditable = Boolean(target && (
        target.tagName === "INPUT"
        || target.tagName === "TEXTAREA"
        || target.tagName === "SELECT"
        || target.isContentEditable
      ));
      if (isEditable || (target && panelRef.current?.contains(target))) return;

      if (event.key === "Tab" && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        focusComposer("novelist");
        return;
      }
      if (event.key.toLowerCase() === "b" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        focusComposer("subsystem");
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        if (streaming) stopStreaming();
        if (displayMode === "chat_history") {
          setDisplayMode("chat_focus");
        } else {
          requestChannel(null);
        }
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setDisplayMode("chat_history");
        return;
      }
      if (event.key === "?" || (event.shiftKey && event.key === "/")) {
        event.preventDefault();
        requestChannel(chatMode);
        setShowShortcuts((value) => !value);
        return;
      }
      if ((chatStatus === "error" || chatStatus === "local") && event.key.toLowerCase() === "r" && lastFailedRequest) {
        event.preventDefault();
        void sendMessage(lastFailedRequest.text, { retry: true });
        return;
      }
      if (chatMode === "novelist" && !streaming) {
        const quickReplies: readonly HostIntentKey[] = ["nudge", "care", "rest", "stuck"];
        const index = Number(event.key) - 1;
        const quickReply = quickReplies[index];
        if (quickReply) {
          event.preventDefault();
          fillHostIntent(quickReply);
        }
      }
    };

    if (activeChannel !== undefined) return undefined;
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [activeChannel, chatMode, chatStatus, displayMode, fillHostIntent, focusComposer, lastFailedRequest, sendMessage, streaming]);

  const submitEvidence = () => {
    const trimmed = artifactRef.trim();
    if (!trimmed) {
      setFeedback("这里是内部记录，不需要你手动填写；正式写作接口会自动回传稿件。 ");
      return;
    }
    if (binding.task.status !== "accepted" && binding.task.status !== "scoped") {
      setFeedback("任务还没有开始，暂时没有稿件可登记。 ");
      return;
    }
    const next = submitCreativeEvidence(binding, {
      artifactRef: trimmed,
      submittedAt: new Date().toISOString(),
      note: "已登记引用，等待验收；提交本身不等于作品已被正式接收。",
    });
    setBinding(next);
    setArtifactRef("");
    setFeedback("稿件已登记，等待验收。 ");
  };

  const evidenceText = binding.task.evidence.status === "awaiting"
    ? binding.task.evidence.note
    : binding.task.evidence.artifactRef
      ? `引用：${binding.task.evidence.artifactRef} · ${binding.task.evidence.note}`
      : binding.task.evidence.note;

  const dialogueView = (
    <section
      className={`${styles.conversation} ${displayMode === "chat_focus" ? styles.chatFocusMask : ""}`}
      data-testid="system-dialogue"
      data-event-type={chatMode === "novelist" ? "system_dialogue" : "subsystem_notice"}
      aria-live="polite"
    >
      {displayedMessages.length === 0 ? (
        <div className={styles.novelistBubble}>
          {chatMode === "novelist" && (
            <span className={styles.chatAvatar} data-avatar-state={novelistAvatar.state} aria-label={novelistAvatar.label}>
              <img className={styles.chatAvatarPortrait} src={novelistAvatar.src} alt="" />
              <img className={styles.chatAvatarFrame} src="/assets/ui/system-layer-materials-v4/avatar-frame-v4-alpha.png" alt="" />
              <span className={styles.chatAvatarLifeBadge} aria-hidden="true">{novelistAvatar.icon}</span>
            </span>
          )}
          <div className={styles.speakerHeader}>
            <span className={chatMode === "novelist" ? styles.speakerDotGold : styles.speakerDotCyan} />
            <span className={styles.speakerName}>{chatMode === "novelist" ? "小说家" : "子系统"}</span>
          </div>
          <p>{openingMessage}</p>
        </div>
      ) : displayedMessages.map((message) => (
        <div
          className={message.role === "system" ? styles.systemBubble : styles.novelistBubble}
          data-message-role={message.role}
          key={message.id}
        >
          {message.role !== "system" && chatMode === "novelist" && (
            <span className={styles.chatAvatar} data-avatar-state={novelistAvatar.state} aria-label={novelistAvatar.label}>
              <img className={styles.chatAvatarPortrait} src={novelistAvatar.src} alt="" />
              <img className={styles.chatAvatarFrame} src="/assets/ui/system-layer-materials-v4/avatar-frame-v4-alpha.png" alt="" />
              <span className={styles.chatAvatarLifeBadge} aria-hidden="true">{novelistAvatar.icon}</span>
            </span>
          )}
          <div className={styles.speakerHeader}>
            <span className={message.role === "system" ? styles.speakerDotCoral : chatMode === "novelist" ? styles.speakerDotGold : styles.speakerDotCyan} />
            <span className={styles.speakerName}>{message.role === "system" ? "主系统" : chatMode === "novelist" ? "小说家" : "子系统"}</span>
          </div>
          <p>{message.text || <span className={styles.typingDots} aria-label="正在回复">···</span>}</p>
        </div>
      ))}
    </section>
  );

  const roomStoryHandoffStatus = roomStorySnapshot === null
    ? null
    : handoffStatusForRoomStoryContext(roomStorySnapshot.context);
  const effectiveExperienceHandoffStatus = roomStoryHandoffStatus ?? experienceHandoffStatus;

  const experienceHandoffView = effectiveExperienceHandoffStatus === null ? null : (
    <section
      className={styles.experienceHandoff}
      data-art-layer="creative-progress-v6-alpha"
      data-testid="experience-handoff"
      data-experience-status={effectiveExperienceHandoffStatus}
      role="status"
      aria-live="polite"
    >
      <div className={styles.experienceHandoffCopy}>
        <div className={styles.experienceHandoffTitle}>
          <span>正式创作接续</span>
          <strong>{experienceHandoffLabels[effectiveExperienceHandoffStatus]}</strong>
        </div>
        <p>{experienceHandoffDescription(effectiveExperienceHandoffStatus, projection)}</p>
        <small>同一房间会话继续 · 聊天回复不会被当作正文或作品证据</small>
      </div>
      <div className={styles.experienceHandoffActions}>
        {effectiveExperienceHandoffStatus !== "unavailable" && (
          <ol className={styles.experienceHandoffSteps} aria-label="创作接续进度">
            {experienceHandoffSteps.map((step) => (
              <li key={step} data-active={experienceHandoffSteps.indexOf(step) <= experienceHandoffSteps.indexOf(effectiveExperienceHandoffStatus)}>
                <span aria-hidden="true" />
                <small>{experienceHandoffLabels[step]}</small>
              </li>
            ))}
          </ol>
        )}
        {effectiveExperienceHandoffStatus === "draft_ready" && roomStorySnapshot !== null && roomStorySnapshot.context.draft !== null && (
          <button
            type="button"
            className={styles.draftFeedbackButton}
            data-testid="room-draft-feedback"
            disabled={draftFeedbackState === "loading"}
            onClick={() => void requestDraftFeedback()}
          >
            {draftFeedbackState === "loading" ? "正在汇报…" : "让小说家汇报这稿"}
          </button>
        )}
        <Link className={styles.experienceHandoffLink} href="/vnext">
          {effectiveExperienceHandoffStatus === "draft_ready"
            ? "进入创作台读稿"
            : effectiveExperienceHandoffStatus === "unavailable"
              ? "查看创作链路"
              : "进入正式创作台"}
        </Link>
      </div>
    </section>
  );

  const storyContext = roomStorySnapshot?.context ?? null;
  const acceptedContent = storyContext?.acceptedContent ?? null;
  const storyDraft = storyContext?.draft ?? null;
  const storyContextView = roomStorySnapshot === null ? (
    roomStoryError === null ? null : (
      <section className={styles.roomStoryContext} data-testid="room-story-context-error" data-story-access="error">
        <strong>作品进度暂时未取回</strong>
        <small>当前没有显示猜测内容；稍后会自动重试。</small>
      </section>
    )
  ) : (
    <section
      className={styles.roomStoryContext}
      data-testid="room-story-context"
      data-story-access={storyContext?.access}
      data-story-source={storyContext?.source}
      data-story-progress={storyContext?.progress}
    >
      {storyContext?.access === "blocked" ? (
        <>
          <header>
            <div><span>作品上下文</span><strong>暂不可读取</strong></div>
            <b>受限</b>
          </header>
          <p>当前没有可用的 CORE_CREATIVE 作品依据；小说家不会编造小说标题、正文或进度。</p>
        </>
      ) : (
        <>
          <header>
            <div>
              <span>同一作品上下文</span>
              <strong>{storyContext?.workspace?.title ?? "未命名作品"}</strong>
            </div>
            <b>{storyContext ? roomStoryProgressLabels[storyContext.progress] : "未读取"}</b>
          </header>
          <dl>
            <div><dt>来源</dt><dd>{storyContext?.source === "persisted_story_truth" ? "服务端作品真源" : "暂无作品真源"}</dd></div>
            <div><dt>已接受</dt><dd>{acceptedContent === null ? "暂无" : `${acceptedContent.characterCount} 字`}</dd></div>
            <div><dt>草稿</dt><dd>{storyDraft === null ? "暂无" : `${storyDraft.characterCount} 字 · v${storyDraft.version}`}</dd></div>
          </dl>
          {storyDraft !== null && (
            <p className={styles.roomStoryPreview} data-testid="room-draft-preview">最新草稿预览：{storyDraft.preview}</p>
          )}
          {draftFeedbackState === "loading" && <small>正在让 DeepSeek 只依据这份已确认草稿汇报……</small>}
          {draftFeedback !== null && (
            <article className={styles.draftFeedbackResult} data-testid="room-draft-feedback-result">
              <strong>小说家汇报</strong>
              <p><b>当前判断：</b>{draftFeedback.summary}</p>
              <p><b>下一步：</b>{draftFeedback.nextStep}</p>
              {draftFeedback.revisionSuggestion !== null && <p><b>返修建议：</b>{draftFeedback.revisionSuggestion}</p>}
            </article>
          )}
          {draftFeedbackState === "error" && <small className={styles.roomStoryError}>这次汇报没有通过服务端校验，作品状态未被改动。</small>}
        </>
      )}
    </section>
  );

  const composerView = (
    <>
      <div className={styles.chatStatus} data-chat-status={chatStatus}>
        <span>{chatStatusLabels[chatStatus]}</span>
        <div>
          {lastFailedRequest && !streaming && (
            <button type="button" data-testid="system-message-retry" onClick={() => void sendMessage(lastFailedRequest.text, { retry: true })}>重试上一句</button>
          )}
          {streaming && <button type="button" onClick={stopStreaming}>停止</button>}
        </div>
      </div>

      <form
        className={styles.composer}
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage(messageDraft);
        }}
      >
        <div className={styles.composerModes} data-testid="system-composer-modes">
          <span>发送方式</span>
          <div className={styles.composerModeButtons}>
            <button
              type="button"
              data-active={composerMode === "persona"}
              aria-pressed={composerMode === "persona"}
              onClick={() => switchComposerMode("persona")}
            >人格润色</button>
            <button
              type="button"
              data-active={composerMode === "raw"}
              aria-pressed={composerMode === "raw"}
              onClick={() => switchComposerMode("raw")}
            >原文直发</button>
          </div>
          {pendingHostMessage && (
            <small data-testid="system-intent-draft">意图草稿：{hostIntentSuggestion(pendingHostMessage.key).label}（可编辑）</small>
          )}
        </div>
        <div className={styles.composerField} data-art-layer="writing-input-bar-v6-alpha">
          <textarea
            ref={messageInputRef}
            aria-label={chatMode === "novelist" ? "对小说家说点什么" : "对子系统说点什么"}
            data-testid="system-message-input"
            value={messageDraft}
            maxLength={600}
            rows={1}
            onChange={(event) => updateComposerDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                if (event.nativeEvent.isComposing) return;
                event.preventDefault();
                if (!messageDraft.trim()) {
                  if (chatMode === "subsystem") setSubsystemChatOpen(false);
                  else requestChannel(null);
                  event.currentTarget.blur();
                  return;
                }
                void sendMessage(messageDraft);
              }
            }}
            wrap="soft"
            placeholder={chatMode === "novelist" ? "直接和他说；任务建议只是参考……" : "只协商边界、证据与任务结构……"}
          />
          <button type={streaming ? "button" : "submit"} onClick={streaming ? stopStreaming : undefined} data-testid="system-message-send" aria-label={streaming ? "停止回复" : "发送消息"}>
            {streaming ? "停止" : "发送"}
          </button>
        </div>
        <div className={styles.composerFooter}>
          <span>Shift + Enter 换行</span>
          <span>{chatMode === "novelist" ? "空输入 Enter 返回世界" : "空输入 Enter 收起协商"}</span>
        </div>
      </form>
    </>
  );

  return (
    <aside
      ref={panelRef}
      className={styles.panel}
      data-testid="system-layer-panel"
      data-expanded={expanded}
      data-display-mode={displayMode}
      data-binding-status={binding.origin.bindingStatus}
      data-chat-mode={chatMode}
      data-room-shortcut-scope="system-panel"
      aria-label={chatMode === "novelist" ? "和小说家说话" : "子系统任务台"}
    >
      <button
        type="button"
        className={styles.panelToggle}
        aria-expanded={expanded}
        aria-controls="novelist-conversation"
        aria-label={expanded ? "收起小说家房间" : "打开小说家房间"}
        onClick={() => requestChannel(expanded ? null : chatMode)}
      >
        <span className={styles.novelistMark} data-avatar-state={chatMode === "novelist" ? novelistAvatar.state : "subsystem"} aria-hidden="true">{chatMode === "novelist" ? novelistAvatar.icon : "◈"}</span>
        <span className={styles.panelTitle}>
          <strong>{chatMode === "novelist" ? "二流小说家" : "子系统任务台"}</strong>
          <small><i />{chatMode === "novelist" ? `${presence} · ${relationshipLabels[novelistPersona.relationshipStage]}` : "任务草案与边界校验"} · {chatStatusLabels[chatStatus]}</small>
        </span>
        <span className={styles.panelCaret} aria-hidden="true">{expanded ? "−" : "+"}</span>
      </button>

      {expanded && (
        <div className={styles.console} id="novelist-conversation">
          {chatMode === "novelist" && (
            <div className={styles.roomFrontstage} data-testid="room-v6-frontstage">
              <div className={styles.roomTitleBookmark} data-testid="room-title-bookmark">
                <img
                  className={styles.roomTitleBookmarkArt}
                  src="/assets/ui/system-layer-materials-v6/room-title-bookmark-v6-alpha.png"
                  alt="二流小说家的房间"
                />
                <div className={styles.roomBookmarkCopy}>
                  <span>小说家频道</span>
                  <small>聊天主轴 · 任务作为附件</small>
                </div>
              </div>

              <section
                className={styles.novelistStatusCard}
                data-testid="novelist-status-card"
                data-avatar-state={novelistAvatar.state}
                aria-label="小说家当前状态"
              >
                <img
                  className={styles.novelistStatusArt}
                  src="/assets/ui/system-layer-materials-v6/novelist-status-v6-alpha.png"
                  alt=""
                  aria-hidden="true"
                />
                <div className={styles.novelistStatusIdentity}>
                  <span className={styles.novelistStatusPortrait} data-avatar-state={novelistAvatar.state}>
                    <img src={novelistAvatar.src} alt="" />
                    <b aria-hidden="true">{novelistAvatar.icon}</b>
                  </span>
                  <div className={styles.novelistStatusCopy}>
                    <span>小说家状态</span>
                    <strong>{presence}</strong>
                    <small>{novelistAvatar.label.replace(/^小说家：/, "")}</small>
                  </div>
                </div>
                <dl className={styles.novelistStatusMetrics}>
                  <div><dt>所在</dt><dd>{observation.sceneLabel}</dd></div>
                  <div><dt>专注</dt><dd>{clamp(observation.focus)}%</dd></div>
                  <div><dt>关系</dt><dd>{relationshipLabels[novelistPersona.relationshipStage]}</dd></div>
                </dl>
                <p className={styles.novelistStatusFootnote}>{observation.activityLabel}</p>
              </section>
            </div>
          )}

          <div className={styles.chatHeaderBar}>
            <div className={styles.chatIdentity} data-testid="system-chat-identity">
              <span className={styles.chatIdentitySeal}>主</span>
              <span>
                <strong>主系统</strong>
                <small>{chatMode === "novelist" ? "正在和小说家说话" : "正在和子系统协商"}</small>
              </span>
            </div>
            <div className={styles.chatHeaderControls}>
              {chatMode === "novelist" && (
                <button
                  type="button"
                  className={styles.taskPanelToggle}
                  data-testid="system-task"
                  data-task-status={binding.task.status}
                  aria-expanded={taskPanelOpen}
                  aria-controls="novelist-task-panel"
                  onClick={() => setTaskPanelOpen((open) => !open)}
                >
                  任务附件
                </button>
              )}
              <button
                type="button"
                className={styles.contextToggleBtn}
                onClick={() => setDisplayMode(displayMode === "chat_history" ? "chat_focus" : "chat_history")}
              >
                上下文 · {visibleMessages.length} {displayMode === "chat_history" ? "▲" : "▼"}
              </button>
              <nav className={styles.chatModes} aria-label="聊天对象">
                <button
                  type="button"
                  className={chatMode === "novelist" ? styles.chatModeActive : styles.chatMode}
                  aria-pressed={chatMode === "novelist"}
                  onClick={() => focusComposer("novelist")}
                >小说家 <kbd>Enter</kbd></button>
                <button
                  type="button"
                  className={chatMode === "subsystem" ? styles.chatModeActive : styles.chatMode}
                  aria-pressed={chatMode === "subsystem"}
                  onClick={() => focusComposer("subsystem")}
                >任务台 <kbd>B</kbd></button>
              </nav>
            </div>
          </div>

          <div className={styles.modelRuntimeBar}>
            <div
              className={styles.runtimeLine}
              data-testid="system-model-status"
              data-gateway-state={gatewayState}
              data-model={runtimeAttestation?.model ?? "unverified"}
              data-profile={runtimeAttestation?.profileId ?? "unverified"}
            >
              <span className={styles.runtimeSignal} />
              {runtimeAttestation
                ? `${runtimeAttestation.model} · 本次对话已验证`
                : gatewayState === "active"
                  ? "房间网关在线 · 发送首句后核验模型"
                  : gatewayState === "checking"
                    ? "正在连接房间网关"
                    : gatewayState === "admission"
                      ? "等待使用确认"
                      : "房间网关离线 · 原话仍会本地保留"}
            </div>
            {!publicRoomDemo && (
              <button
                type="button"
                className={styles.modelPickerToggle}
                data-testid="system-model-picker-toggle"
                aria-expanded={modelPickerOpen}
                disabled={gatewayState !== "active" || modelSettings === null}
                onClick={() => setModelPickerOpen((open) => !open)}
              >
                模型
              </button>
            )}
          </div>

          {modelPickerOpen && modelSettings !== null && (
            <section
              className={styles.modelPicker}
              data-testid="system-model-picker"
              aria-label="模型选择"
            >
              {(["conversation", "analysis"] as const).map((purpose) => {
                const selection = modelSettings.preferences[purpose];
                return (
                  <div className={styles.modelPurpose} key={purpose}>
                    <header>
                      <strong>{purpose === "conversation" ? "对话与轻写作" : "书源与长文分析"}</strong>
                      <small>{purpose === "conversation" ? "下一句立即生效并重新核验" : "供后续分析任务读取"}</small>
                    </header>
                    <div className={styles.modelOptions}>
                      {modelSettings.profiles.map((profile) => {
                        const available =
                          profile.status === "available" &&
                          profile.purposes.includes(purpose);
                        const selected = selection.profileId === profile.id;
                        return (
                          <button
                            type="button"
                            key={`${purpose}-${profile.id}`}
                            data-profile-id={profile.id}
                            data-selected={selected}
                            aria-pressed={selected}
                            disabled={selected || !available || savingModelPurpose !== null || (purpose === "conversation" && streaming)}
                            title={available ? `${profile.provider} / ${profile.model}` : "服务器尚未配置"}
                            onClick={() => void chooseModel(purpose, profile.id)}
                          >
                            <span>{profile.label}</span>
                            <small>{available ? profile.model : "未配置"}</small>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <div className={styles.modelRoleContract} data-testid="model-role-contract">
                <span>职责分流</span>
                <div>
                  <strong>房间聊天</strong>
                  <small>{selectedConversationModel} · 速度优先</small>
                </div>
                <div>
                  <strong>正式正文</strong>
                  <small>Grok 4.5 · 后端 Worker 已切换，正式运行时待验收</small>
                </div>
                <p>两条链路互不冒充：聊天回复不会直接成为正文，只有正式创作台回传的 DRAFT 才能进入后续验收。</p>
              </div>
              <p>这里只选择服务器批准的模型，不会把 API Key 交给浏览器，也不会在不可用时偷偷换成别家。</p>
            </section>
          )}

          {gatewayState === "admission" && (
            <section className={styles.admissionCard} role="dialog" aria-label="开始前确认">
              <strong>开始前确认一下</strong>
              <p>这里的对话会交给写作服务处理；当前仍是内部体验环境，只能使用你有权处理的测试内容。</p>
              <button type="button" data-testid="system-admission-accept" onClick={() => void acceptAdmission()}>我知道了，继续</button>
            </section>
          )}

          {gatewayState === "error" && (
            <section className={styles.gatewayNotice} role="status">
              <strong>房间暂时没连上</strong>
              <p>你仍可输入，原话会留在对话里；当前不会伪造模型回复或作品状态。</p>
              <button type="button" data-testid="system-gateway-retry" onClick={() => void runGatewayBootstrap("manual")}>重新连接</button>
            </section>
          )}

          {draftBody !== null && (
            <section className={styles.draftReader} role="dialog" aria-label="候选稿">
              <header><strong>他刚写完的稿子</strong><button type="button" onClick={() => setDraftBody(null)}>×</button></header>
              <article>{draftBody}</article>
            </section>
          )}

          {chatMode === "novelist" ? (
            <div className={styles.novelistWorkspace} data-testid="novelist-conversation-workspace">
              {taskPanelOpen && (
                <section
                  className={styles.taskPanel}
                  id="novelist-task-panel"
                  data-testid="system-task-panel"
                  data-task-status={binding.task.status}
                  data-evidence-status={binding.task.evidence.status}
                  aria-label="系统任务附件"
                >
                  <header className={styles.taskPanelHeader}>
                    <div>
                      <span>当前任务附件</span>
                      <strong>{projection?.headline ?? binding.task.title}</strong>
                    </div>
                    <button
                      type="button"
                      className={styles.taskPanelClose}
                      aria-label="收起任务附件"
                      onClick={() => setTaskPanelOpen(false)}
                    >
                      ×
                    </button>
                  </header>

                  <div className={styles.taskPanelMeta} data-testid="system-task-panel-meta">
                    <span
                      className={styles.taskPanelStatus}
                      data-task-status={binding.task.status}
                    >
                      <i aria-hidden="true" />
                      {taskStatusLabels[binding.task.status]}
                    </span>
                    <span
                      className={styles.taskPanelEvidence}
                      data-evidence-status={binding.task.evidence.status}
                    >
                      {evidenceStatusLabels[binding.task.evidence.status]}
                    </span>
                    <small>主系统草案 · 可编辑</small>
                  </div>

                  <div className={styles.taskPanelLead}>
                    <img
                      className={styles.taskPanelIcon}
                      src={`/assets/ui/system-layer-materials-v2/${taskVisual.icon}`}
                      alt=""
                      aria-hidden="true"
                    />
                    <div>
                      <small>为什么现在</small>
                      <p>{binding.task.whyNow}</p>
                    </div>
                  </div>

                  <div className={styles.taskPanelPrimary}>
                    <div>
                      <small>完成条件</small>
                      <p>{binding.task.deliverable}</p>
                    </div>
                    <div className={styles.taskPanelAction}>
                      <button type="button" onClick={loadTaskSuggestionToNovelist}>
                        装填至小说家对话
                      </button>
                      <small>只装填草稿，不自动发布或替他接受</small>
                    </div>
                  </div>

                  <details className={styles.taskPanelDetails}>
                    <summary>展开验收与边界</summary>
                    <dl>
                      <div>
                        <dt>验收标准</dt>
                        <dd>
                          <ul>
                            {binding.task.acceptanceCriteria.map((criterion) => <li key={criterion}>{criterion}</li>)}
                          </ul>
                        </dd>
                      </div>
                      <div>
                        <dt>当前状态</dt>
                        <dd>{evidenceStatusLabels[binding.task.evidence.status]} · {taskStatusLabels[binding.task.status]}</dd>
                      </div>
                    </dl>
                  </details>
                </section>
              )}

              <div className={styles.novelistMain} data-art-layer="central-chat-paper-v6-alpha">
                {dialogueView}
                {experienceHandoffView}
                {storyContextView}
                {composerView}
              </div>

              <section
                className={styles.systemTaskSuggestion}
                data-testid="system-task-suggestion"
                data-task-visual={taskVisual.kind}
                data-personality-code={binding.origin.personalityCode}
                data-persona-snapshot-id={binding.persona.personaSnapshotId}
              >
                <header>
                  <div><span>建议怎么说</span><small>按已选人格装填，可编辑</small></div>
                  <b>{hostIntentSuggestions.length} 种</b>
                </header>
                <div className={styles.suggestionHeading} data-testid="system-intent-suggestion">
                  <div>
                    <strong>意图建议</strong>
                    <small>点选只装填草稿，可编辑后发送</small>
                  </div>
                  <span>4 种</span>
                </div>
                <div className={styles.quickReplies} aria-label="装填主系统意图">
                  {(["nudge", "care", "rest", "stuck"] as const).map((key, index) => (
                    <button
                      key={key}
                      type="button"
                      data-testid={key === "nudge" ? "system-task-accept" : key === "care" ? "system-task-scope" : key === "rest" ? "system-task-defer" : "system-task-reject"}
                      data-intent-key={key}
                      data-hit-area="intent-card"
                      aria-label={`${hostIntentCardTitle(key)}：${hostIntentCardLine(key, binding.persona)}`}
                      onClick={() => fillHostIntent(key)}
                    >
                      <span className={styles.intentCardCopy}>
                        <strong>{hostIntentCardTitle(key)}</strong>
                        <small>{hostIntentCardLine(key, binding.persona)}</small>
                      </span>
                      <kbd>{index + 1}</kbd>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          ) : (
            <div className={styles.subsystemWorkspace}>
              <section className={styles.directiveWorkspace} data-testid="subsystem-directive-workspace">
                <header>
                  <div>
                    <span>SUBSYSTEM / TASK DRAFT</span>
                    <strong>{projection?.headline ?? binding.task.title}</strong>
                  </div>
                  <b>{taskStatusLabels[binding.task.status]}</b>
                </header>

                <div className={styles.directiveStatusRow}>
                  <span data-ready={taskContractReady}>{taskContractReady ? "活动与路线引用通过" : "引用尚未通过"}</span>
                  <span>{evidenceStatusLabels[binding.task.evidence.status]}</span>
                  <span>尚未发布</span>
                </div>

                <dl className={styles.directiveFacts}>
                  <div><dt>为什么现在</dt><dd>{binding.task.whyNow}</dd></div>
                  <div><dt>最小交付</dt><dd>{binding.task.deliverable}</dd></div>
                  <div><dt>验收标准</dt><dd><ul>{binding.task.acceptanceCriteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul></dd></div>
                </dl>

                <div className={styles.directiveActions}>
                  <button type="button" data-testid="subsystem-load-to-novelist" onClick={loadTaskSuggestionToNovelist}>装填至小说家对话</button>
                  <small>只写入草稿，不自动发布、不替小说家接受，也不生成作品证据。</small>
                </div>
              </section>

              <button
                type="button"
                className={styles.subsystemChatToggle}
                data-testid="subsystem-chat-toggle"
                aria-expanded={subsystemChatOpen}
                onClick={() => {
                  setSubsystemChatOpen((open) => {
                    if (!open) window.setTimeout(() => messageInputRef.current?.focus(), 0);
                    return !open;
                  });
                }}
              >
                <span>{subsystemChatOpen ? "收起协商窗口" : "和子系统协商"}</span>
                <small>任务结构、证据和边界有疑问时再打开</small>
              </button>

              {subsystemChatOpen && (
                <section className={styles.subsystemChat} data-testid="subsystem-chat-entry">
                  {dialogueView}
                  <div className={styles.quickReplies} aria-label="子系统查询">
                    <button type="button" onClick={() => fillComposerText("这项任务现在登记完整吗？")}>查任务</button>
                    <button type="button" onClick={() => fillComposerText("我需要提供什么证据？")}>查证据</button>
                    <button type="button" onClick={() => fillComposerText("路线和正史的边界是什么？")}>问边界</button>
                  </div>
                  {composerView}
                </section>
              )}
            </div>
          )}

          <div className={styles.pinnedStrip}>
            <span className={styles.pinnedPill}><b>场景</b>{observation.sceneLabel}</span>
            <span className={styles.pinnedPill}><b>任务</b>{projection?.headline ?? binding.task.title}</span>
            <span className={styles.pinnedPill}><b>关系</b>{relationshipLabels[novelistPersona.relationshipStage]}</span>
            <a href="/room/reincarnation" className={styles.pinnedPillLink} title="重选前身身份与转生快照">重走转生通道</a>
          </div>

          {showShortcuts && <section className={styles.shortcutsHelp} role="dialog" aria-label="快捷键说明">
            <strong>快捷键</strong>
            <span><kbd>Enter</kbd> 小说家 / 再按返回世界　<kbd>Tab</kbd> 生活</span>
            <span><kbd>B</kbd> 子系统任务台 / 再按返回世界　<kbd>M</kbd> 地图</span>
            <span><kbd>Esc</kbd> 逐层返回　<kbd>↑</kbd> 历史</span>
          </section>}

          <details className={styles.internalDetails}>
            <summary>内部记录与证据</summary>
            <div className={styles.internalContent}>
              <div className={styles.personaStrip} data-testid="system-persona-summary">
                <span aria-hidden="true">{binding.origin.identityIcon}</span>
                <p><strong>{binding.origin.identityName} · [{binding.origin.personalityCode}]</strong><small>{binding.persona.interventionLabel}</small></p>
                <code data-testid="persona-snapshot-id">{binding.persona.personaSnapshotId}</code>
              </div>

              <div className={styles.observationLine} data-testid="system-observation">
                {observation.activityLabel} · 专注 {clamp(observation.focus)} · 疲劳 {clamp(observation.fatigue)} · 灵感 {clamp(observation.inspiration)}
              </div>

              <section className={styles.subsystemBlock} data-testid="subsystem-notice" data-event-type="subsystem_notice">
                <strong>边界检查</strong>
                <p>{taskContractReady ? "活动与路线已登记；系统不会代写或自动结算。" : "任务引用未通过登记检查，不能发布。"}</p>
              </section>

              <dl className={styles.taskFacts}>
                <div><dt>为什么现在</dt><dd>{binding.task.whyNow}</dd></div>
                <div><dt>最小交付</dt><dd>{binding.task.deliverable}</dd></div>
                {binding.task.userInstruction && <div><dt>你的原话</dt><dd>{binding.task.userInstruction}</dd></div>}
                <div><dt>验收标准</dt><dd><ul>{binding.task.acceptanceCriteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul></dd></div>
              </dl>

              <section className={styles.evidenceBlock} data-testid="system-evidence" data-evidence-status={binding.task.evidence.status}>
                <strong>作品回传 · {evidenceStatusLabels[binding.task.evidence.status]}</strong>
                <p>{evidenceText}</p>
                {binding.task.evidence.status === "awaiting" && (
                  <div className={styles.evidenceForm}>
                    <label htmlFor="system-artifact-ref">真实稿件引用</label>
                    <div>
                      <input
                        id="system-artifact-ref"
                        value={artifactRef}
                        onChange={(event) => setArtifactRef(event.target.value)}
                        placeholder="由正式写作接口自动回传"
                      />
                      <button type="button" data-testid="system-evidence-submit" onClick={submitEvidence}>登记</button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </details>

          {feedback && <p className={styles.feedback} role="status">{feedback}</p>}
          {lastRequestIssue && (
            <small className={styles.requestIssue} data-testid="system-request-issue">
              诊断：{lastRequestIssue.code}
              {lastRequestIssue.recovery ? ` · recovery=${lastRequestIssue.recovery}` : ""}
              {lastRequestIssue.requestId ? ` · requestId=${lastRequestIssue.requestId}` : ""}
            </small>
          )}
        </div>
      )}
    </aside>
  );
}
