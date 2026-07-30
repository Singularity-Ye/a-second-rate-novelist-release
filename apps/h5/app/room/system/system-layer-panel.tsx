"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ExperienceProjection, VnextSessionAdmissionManifest } from "@erliu/shared-contracts/vnext-experience";
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
  const [chatStatus, setChatStatus] = useState<ChatStatus>("idle");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");
  const [artifactRef, setArtifactRef] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [gatewayState, setGatewayState] = useState<GatewayState>("checking");
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
  const abortRef = useRef<AbortController | null>(null);
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
    if (publicRoomDemo) {
      setProjection(publicRoomDemoProjection);
      setGatewayState("active");
      return undefined;
    }
    let cancelled = false;
    void bootstrapExperienceSession()
      .then((result) => {
        if (cancelled) return;
        if (result.status === "admission_required") {
          setAdmissionManifest(result.manifest);
          setGatewayState("admission");
          return;
        }
        setProjection(result.projection);
        setGatewayState("active");
      })
      .catch(() => {
        if (!cancelled) setGatewayState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const taskContractReady = useMemo(() => {
    const activity = getLifeActivity(binding.task.activityKey);
    const route = getFormalSceneRoute("study", binding.task.routeKey);
    return Boolean(activity && route);
  }, [binding.task.activityKey, binding.task.routeKey]);

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
      setFeedback(gatewayState === "admission"
        ? "这间房还没有取得你的使用确认；先确认后，我才会把话交给他。"
        : gatewayState === "checking"
          ? "正在确认这间房的连接，请稍等一秒。"
          : "小说后端暂时没有接通；这次没有伪造回复。 ");
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
        setBinding((previous) => {
          const updated = channelMessages(previous, channel).map((message) => message.id === assistantMessageId
            ? { ...message, text: received }
            : message);
          return updateChannelMessages(previous, channel, updated);
        });
      }, controller.signal);

      setProjection(result.route.projection);
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

  return (
    <aside
      ref={panelRef}
      className={styles.panel}
      data-testid="system-layer-panel"
      data-expanded={expanded}
      data-display-mode={displayMode}
      data-binding-status={binding.origin.bindingStatus}
      data-chat-mode={chatMode}
      aria-label={chatMode === "novelist" ? "和小说家说话" : "和子系统说话"}
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
          <strong>{chatMode === "novelist" ? "二流小说家" : "证据与边界子系统"}</strong>
          <small><i />{chatMode === "novelist" ? `${presence} · ${relationshipLabels[novelistPersona.relationshipStage]}` : "低权限陪检"} · {chatStatusLabels[chatStatus]}</small>
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
              >子系统 <kbd>B</kbd></button>
            </nav>
          </div>

          {gatewayState === "admission" && (
            <section className={styles.admissionCard} role="dialog" aria-label="开始前确认">
              <strong>开始前确认一下</strong>
              <p>这里的对话会交给写作服务处理；当前仍是内部体验环境，只能使用你有权处理的测试内容。</p>
              <button type="button" onClick={() => void acceptAdmission()}>我知道了，继续</button>
            </section>
          )}

          {gatewayState === "error" && (
            <section className={styles.gatewayNotice} role="status">
              <strong>房间暂时没连上</strong>
              <p>对话和作品状态都没有被伪造。后端恢复后再试即可。</p>
            </section>
          )}

          <section className={styles.todayCard} data-testid="system-task" data-task-status={binding.task.status}>
            <span>今天</span>
            <div>
              <strong>{projection?.headline ?? binding.task.title}</strong>
              <small>{projection?.body ?? `${taskStatusLabels[binding.task.status]} · ${evidenceStatusLabels[binding.task.evidence.status]}`}</small>
            </div>
            {projection?.status === "draft_ready" ? (
              <button type="button" onClick={() => void openDraft()}>读稿</button>
            ) : <b>{taskStatusLabels[binding.task.status]}</b>}
          </section>

          {draftBody !== null && (
            <section className={styles.draftReader} role="dialog" aria-label="候选稿">
              <header><strong>他刚写完的稿子</strong><button type="button" onClick={() => setDraftBody(null)}>×</button></header>
              <article>{draftBody}</article>
            </section>
          )}

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

          <div className={styles.pinnedStrip}>
            <span className={styles.pinnedPill}>📋 {observation.sceneLabel}</span>
            <span className={styles.pinnedPill}>✏️ {projection?.headline ?? binding.task.title}</span>
            <span className={styles.pinnedPill}>🧠 {relationshipLabels[novelistPersona.relationshipStage]}</span>
          </div>

          <div className={styles.quickReplies} aria-label="常用话术">
            {chatMode === "novelist" ? <>
              <button type="button" data-testid="system-task-accept" onClick={() => void sendMessage("继续写吧")}>继续写吧 <kbd>1</kbd></button>
              <button type="button" data-testid="system-task-scope" onClick={() => void sendMessage("今天少写一点")}>少写一点 <kbd>2</kbd></button>
              <button type="button" data-testid="system-task-defer" onClick={() => void sendMessage("今天先休息")}>今天休息 <kbd>3</kbd></button>
              <button type="button" data-testid="system-task-reject" onClick={() => void sendMessage("这版不行，打回重写")}>打回重写 <kbd>4</kbd></button>
            </> : <>
              <button type="button" onClick={() => void sendMessage("这项任务现在登记完整吗？")}>查任务</button>
              <button type="button" onClick={() => void sendMessage("我需要提供什么证据？")}>查证据</button>
              <button type="button" onClick={() => void sendMessage("路线和正史的边界是什么？")}>问边界</button>
            </>}
          </div>

          <div className={styles.chatStatus} data-chat-status={chatStatus}>
            <span>{chatStatusLabels[chatStatus]}</span>
            {streaming && <button type="button" onClick={stopStreaming}>停止</button>}
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
                    event.preventDefault();
                    sendMessage(messageDraft);
                  }
                }}
                placeholder={chatMode === "novelist" ? "对他说点什么……" : "问问边界、证据或登记状态……"}
              />
              <button type={streaming ? "button" : "submit"} onClick={streaming ? stopStreaming : undefined} data-testid="system-message-send" aria-label={streaming ? "停止回复" : "发送消息"}>
                {streaming ? "×" : "↵ Enter"}
              </button>
            </div>
            <div className={styles.composerFooter}>
              <span>Esc 收起 · ↑ 历史</span>
              <span>Enter 小说家 · Tab 生活 · B 子系统</span>
            </div>
          </form>

          {showShortcuts && <section className={styles.shortcutsHelp} role="dialog" aria-label="快捷键说明">
            <strong>快捷键</strong>
            <span><kbd>Enter</kbd> 小说家　<kbd>Tab</kbd> 生活　<kbd>B</kbd> 子系统</span>
            <span><kbd>M</kbd> 地图　<kbd>Esc</kbd> 收起　<kbd>↑</kbd> 历史</span>
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
