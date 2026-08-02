"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type ChatStatus = "local" | "connecting" | "online" | "queued" | "error" | "idle";

const chatStatusLabels: Readonly<Record<ChatStatus, string>> = {
  local: "开发预览",
  connecting: "连接中",
  online: "在线流式",
  queued: "已交给他",
  error: "连接中断",
  idle: "等待你说话",
};

type GatewayState = "checking" | "admission" | "active" | "error";

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
  const [streaming, setStreaming] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");
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
  const [draftBody, setDraftBody] = useState<string | null>(null);
  const [lastFailedRequest, setLastFailedRequest] = useState<{
    channel: NovelistChatChannel;
    text: string;
    assistantMessageId: string;
    clientRequestId: string;
  } | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const previousActiveChannelRef = useRef(activeChannel);
  const abortRef = useRef<AbortController | null>(null);
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

  const runGatewayBootstrap = useCallback(async (reason: "initial" | "automatic" | "manual") => {
    if (publicRoomDemo) {
      setProjection(publicRoomDemoProjection);
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
      setGatewayState("active");
      if (reason !== "initial") setFeedback("房间已经重新接通。若上一句话尚未回复，可按 R 重试。 ");
    } catch {
      if (gatewayRunIdRef.current !== runId) return;
      gatewayRetryAttemptRef.current += 1;
      setProjection(null);
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
    : binding.task.status === "deferred"
      ? "今天休息"
      : observation.fatigue >= 75
        ? "有点累"
        : "现在有空";
  const novelistOpening = novelistOpeningLine(novelistPersona, {
    taskStatus: binding.task.status,
    isWriting: isActuallyWriting,
    fatigue: clamp(observation.fatigue),
  });

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
    setMessageDraft(`子系统给了一条建议：${binding.task.title}。最小交付是“${binding.task.deliverable}”，验收先看“${criteria}”。这只是建议，你觉得今天怎么推进？`);
    setSubsystemChatOpen(false);
    requestChannel("novelist");
    setFeedback("任务建议只装填进了对话草稿；尚未发布、接受，也没有生成作品证据。 ");
    window.setTimeout(() => messageInputRef.current?.focus(), 0);
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
  };

  const acceptAdmission = async () => {
    if (admissionManifest === null) return;
    setGatewayState("checking");
    setFeedback("正在为这间房建立连接……");
    try {
      const result = await acceptExperienceAdmission(admissionManifest);
      setProjection(result.projection);
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
      setChatStatus(gatewayState === "checking" ? "connecting" : "error");
      setLastFailedRequest({ channel, text, assistantMessageId, clientRequestId: requestId });
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
    setFeedback("正在把你的话交给他……");
    setChatStatus("connecting");
    setStreaming(true);
    setLastFailedRequest({ channel, text, assistantMessageId, clientRequestId: requestId });

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
      }, controller.signal);

      setProjection(result.route.projection);
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
          ? result.route.projection.body
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
          setChatStatus("error");
          setFeedback(code === "provider_unconfigured"
            ? "写作引擎尚未完成统一配置。这句话已留在对话里，但没有冒充在线回复；按 R 重试。"
            : "写作引擎暂时不可用。这句话已留在对话里，但没有冒充在线回复；按 R 重试。 ");
          setBinding((previous) => updateChannelMessages(previous, channel, channelMessages(previous, channel).map((message) => message.id === assistantMessageId
            ? { ...message, text: "（这次没有接通写作引擎，未生成回复）" }
            : message)));
        }
      } else {
        setChatStatus("error");
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
        const quickReplies = ["继续写吧", "今天少写一点", "今天先休息", "这版不行，打回重写"];
        const index = Number(event.key) - 1;
        const quickReply = quickReplies[index];
        if (quickReply) {
          event.preventDefault();
          void sendMessage(quickReply);
        }
      }
    };

    if (activeChannel !== undefined) return undefined;
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [activeChannel, chatMode, chatStatus, displayMode, focusComposer, lastFailedRequest, sendMessage, streaming]);

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
          <div className={styles.speakerHeader}>
            <span className={message.role === "system" ? styles.speakerDotCoral : chatMode === "novelist" ? styles.speakerDotGold : styles.speakerDotCyan} />
            <span className={styles.speakerName}>{message.role === "system" ? "你" : chatMode === "novelist" ? "小说家" : "子系统"}</span>
          </div>
          <p>{message.text || <span className={styles.typingDots} aria-label="正在回复">···</span>}</p>
        </div>
      ))}
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
        <div>
          <textarea
            ref={messageInputRef}
            aria-label={chatMode === "novelist" ? "对小说家说点什么" : "对子系统说点什么"}
            data-testid="system-message-input"
            value={messageDraft}
            maxLength={600}
            rows={1}
            onChange={(event) => setMessageDraft(event.target.value)}
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
        onClick={() => requestChannel(expanded ? null : chatMode)}
      >
        <span className={styles.novelistMark} aria-hidden="true">{chatMode === "novelist" ? "✎" : "◈"}</span>
        <span className={styles.panelTitle}>
          <strong>{chatMode === "novelist" ? "二流小说家" : "子系统任务台"}</strong>
          <small><i />{chatMode === "novelist" ? `${presence} · ${relationshipLabels[novelistPersona.relationshipStage]}` : "任务草案与边界校验"} · {chatStatusLabels[chatStatus]}</small>
        </span>
        <span className={styles.panelCaret} aria-hidden="true">{expanded ? "−" : "+"}</span>
      </button>

      {expanded && (
        <div className={styles.console} id="novelist-conversation">
          <div className={styles.chatHeaderBar}>
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
              <div className={styles.novelistMain}>
                {dialogueView}
                {composerView}
              </div>

              <section className={styles.systemTaskSuggestion} data-testid="system-task-suggestion" data-task-visual={taskVisual.kind}>
                <header>
                  <div><span>子系统建议</span><small>辅助材料，不替你发号施令</small></div>
                  <b>未发布</b>
                </header>
                <div className={styles.todayCard} data-testid="system-task" data-task-status={binding.task.status}>
                  <img
                    className={styles.taskCardIcon}
                    src={`/assets/ui/system-layer-materials-v2/${taskVisual.icon}`}
                    alt=""
                    aria-hidden="true"
                  />
                  <div>
                    <strong>{projection?.headline ?? binding.task.title}</strong>
                    <small>{projection?.body ?? binding.task.whyNow}</small>
                  </div>
                  {projection?.status === "draft_ready" ? (
                    <button type="button" onClick={() => void openDraft()}>读稿</button>
                  ) : <b>{taskVisual.stamp}</b>}
                </div>
                <div className={styles.quickReplies} aria-label="把建议说给小说家">
                  <button type="button" data-testid="system-task-accept" onClick={() => void sendMessage("继续写吧")}>继续推进 <kbd>1</kbd></button>
                  <button type="button" data-testid="system-task-scope" onClick={() => void sendMessage("今天少写一点")}>缩小任务 <kbd>2</kbd></button>
                  <button type="button" data-testid="system-task-defer" onClick={() => void sendMessage("今天先休息")}>今天休息 <kbd>3</kbd></button>
                  <button type="button" data-testid="system-task-reject" onClick={() => void sendMessage("这版不行，打回重写")}>说明返修 <kbd>4</kbd></button>
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
                    <button type="button" onClick={() => void sendMessage("这项任务现在登记完整吗？")}>查任务</button>
                    <button type="button" onClick={() => void sendMessage("我需要提供什么证据？")}>查证据</button>
                    <button type="button" onClick={() => void sendMessage("路线和正史的边界是什么？")}>问边界</button>
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
        </div>
      )}
    </aside>
  );
}
