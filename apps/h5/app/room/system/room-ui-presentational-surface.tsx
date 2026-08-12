"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type {
  RoomUiActionView,
  RoomUiChatMessage,
  RoomUiPresentationalSurfaceProps,
} from "./room-ui-adapter";
import {
  ROOM_UI_SURFACE_GEOMETRY_V6,
  type RoomUiPresentationalLayoutOverride,
  roomUiBackdropStyle,
  roomUiInternalVisualStyle,
  roomUiSuggestionTypographyStyle,
  type RoomUiSuggestionCardLayerId,
  roomUiNestedVisualStyle,
  roomUiSurfaceStyle,
  roomUiVisualSlotStyle,
} from "./room-ui-presentational-layout";
import styles from "./room-ui-presentational-surface.module.css";
import { RoomUiPresentationalVariantTable } from "./room-ui-presentational-variant-table";
import { RoomGuideLibrary } from "./room-guide-library";

const ASSET_ROOT = "/assets/ui/room-presentational-v6";

const progressSteps = [
  { id: "understanding", label: "理解", dotLayer: "progress-observe-dot", textLayer: "progress-observe-text" },
  { id: "writing", label: "落笔", dotLayer: "progress-breakdown-dot", textLayer: "progress-breakdown-text" },
  { id: "revising", label: "返修", dotLayer: "progress-draft-dot", textLayer: "progress-draft-text" },
  { id: "draft_ready", label: "回看", dotLayer: "progress-review-dot", textLayer: "progress-review-text" },
] as const;

const progressOrder = ["idle", "understanding", "writing", "variant_review", "revising", "draft_ready", "accepted"] as const;
const suggestionCardLayerIds: readonly RoomUiSuggestionCardLayerId[] = [
  "suggestion-card-life-now",
  "suggestion-card-life-break",
  "suggestion-card-creative-spark",
  "suggestion-card-creative-writing",
];

type SuggestionCardView = Readonly<{
  kind: "composer_preset" | "projection_action";
  group: "life" | "creative";
  key: string;
  label: string;
  detail: string;
  illustration: string;
  composerText?: string;
  action?: RoomUiActionView | null;
}>;

const lifeSuggestionCards: readonly SuggestionCardView[] = [
  {
    kind: "composer_preset",
    group: "life",
    key: "chat-about-now",
    label: "聊聊近况",
    detail: "把近况话题填入聊天框",
    composerText: "聊聊你现在的状态，以及最想继续做的事。",
    illustration: "suggestion-illustration-magnifier-manuscript-v6-alpha.webp",
  },
  {
    kind: "composer_preset",
    group: "life",
    key: "coffee-break",
    label: "歇一会儿",
    detail: "把休息意图填入聊天框，不进入正式写作",
    composerText: "我想先歇一会儿，喝杯咖啡，再决定接下来做什么。",
    illustration: "suggestion-illustration-moon-tea-v6-alpha.webp",
  },
] as const;

const storySparkCard: SuggestionCardView = {
  kind: "composer_preset",
  group: "creative",
  key: "share-story-spark",
  label: "说个灵感",
  detail: "先聊主题和人物，不自动创建写作任务",
  composerText: "我有一个故事灵感，想先和你聊聊。",
  illustration: "suggestion-illustration-feather-letter-v6-alpha.webp",
};

function writingActionFor(
  actions: readonly RoomUiActionView[],
  draftReady: boolean,
): RoomUiActionView | null {
  if (draftReady) return actions.find((action) => action.code === "open_draft") ?? null;
  return actions.find((action) => (
    action.code === "submit_intent" || action.code === "correct_understanding"
  )) ?? null;
}

function asset(name: string) {
  return `${ASSET_ROOT}/${name}`;
}

function streamLabel(phase: string) {
  switch (phase) {
    case "streaming":
      return "正在回复";
    case "submitted_ack":
      return "已接单 · 后台处理中";
    case "recovering":
      return "正在恢复";
    case "blocked":
      return "当前受限";
    default:
      return "等待你说话";
  }
}

function progressIndex(value: string | null) {
  if (value === null) return -1;
  return progressOrder.indexOf(value as (typeof progressOrder)[number]);
}

function actionList(model: RoomUiPresentationalSurfaceProps["model"]): readonly RoomUiActionView[] {
  if (model.recovery !== null) return [];
  const projection = model.task.projection;
  if (projection === null) return [];
  return [projection.primaryAction, ...projection.secondaryActions].filter(
    (action): action is RoomUiActionView => action !== null,
  );
}

const unwiredProjectionActionCodes = [
  "request_revision",
  "accept_current",
  "accept_and_continue",
  "reject_and_rebrief",
] as const;

function isUnwiredProjectionAction(action: RoomUiActionView | null | undefined) {
  return action !== null
    && action !== undefined
    && (unwiredProjectionActionCodes as readonly string[]).includes(action.code);
}

function messageLabel(message: RoomUiChatMessage) {
  return message.role === "user" ? "你" : "小说家";
}

const DESKTOP_COMPOSER_MAX_ROWS = 5;
const MOBILE_COMPOSER_MAX_ROWS = 4;

function numericStyle(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export type RoomUiPresentationalSurfaceVisualProps = Readonly<{
  /** UI-test only. Formal /room omits this and consumes the frozen layout. */
  visualLayout?: RoomUiPresentationalLayoutOverride;
  calibrationCamera?: "desktop" | "responsive";
  visualFixture?: string;
}>;

export function RoomUiPresentationalSurface({
  model,
  draftReader,
  onClose,
  variantReview,
  gatewayReady = true,
  onCloseDraftReader,
  onSendMessage,
  onStopStreaming,
  onRetry,
  onAdmissionAcknowledge,
  onGatewayReconnect,
  onFillComposer,
  onProjectionAction,
  onRequestDraftFeedback,
  onOpenDraft,
  onOpenVariantCandidate,
  onCloseVariantPreview,
  onSelectVariantCandidate,
  visualLayout,
  calibrationCamera,
  visualFixture,
}: RoomUiPresentationalSurfaceProps & RoomUiPresentationalSurfaceVisualProps) {
  const [composerDraft, setComposerDraft] = useState("");
  const [composerContentHeight, setComposerContentHeight] = useState("2.65rem");
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [composerOverflowing, setComposerOverflowing] = useState(false);
  const [composerMaxRows, setComposerMaxRows] = useState(DESKTOP_COMPOSER_MAX_ROWS);
  const [variantPortalReady, setVariantPortalReady] = useState(false);
  const [guideLibraryOpen, setGuideLibraryOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [dismissedDraftContentId, setDismissedDraftContentId] = useState<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const followLatestMessageRef = useRef(true);
  const actions = useMemo(() => actionList(model), [model]);
  const directProjectionActions = useMemo(
    () => actions.filter((action) => action.code !== "submit_intent" && action.code !== "correct_understanding"),
    [actions],
  );
  const recovery = model.recovery;
  const draftReady = recovery === null
    && model.progress.source === "persisted_story_truth"
    && model.progress.roomContextProgress === "draft_ready"
    && model.draftReady !== null
    && model.draftReady.status === "draft";
  const draftCardVisible = draftReady
    && model.draftReady !== null
    && dismissedDraftContentId !== model.draftReady.contentId;
  const activeProgressIndex = progressIndex(model.progress.roomContextProgress);
  const hasPersistedProgress = model.progress.source === "persisted_story_truth";
  const admissionPending = onAdmissionAcknowledge !== null && onAdmissionAcknowledge !== undefined;
  const reconnectPending = onGatewayReconnect !== null && onGatewayReconnect !== undefined;
  const gatewayActionPending = admissionPending || reconnectPending;
  // The draft is local UI state and must remain writable while the formal
  // gateway is bootstrapping, awaiting admission, reconnecting, or recovering.
  // Only the send/action path waits for those runtime gates.
  const composerInputDisabled = !model.chat.composer.enabled;
  const composerDisabled = !gatewayReady
    || !model.chat.composer.enabled
    || recovery !== null
    || gatewayActionPending;
  const sendButtonDisabled = model.chat.streamState.phase === "streaming"
    ? false
    : composerDisabled || composerDraft.trim().length === 0;
  const mood = model.life.mood;
  const storyHubHref = model.workspacePointer?.storyId
    ? `/stories/${encodeURIComponent(model.workspacePointer.storyId)}`
    : null;
  const writingAction = writingActionFor(actions, draftReady);
  const writingCard: SuggestionCardView = draftReady
    ? {
        kind: "projection_action",
        group: "creative",
        key: "continue-writing",
        label: "继续创作",
        detail: writingAction === null ? "当前没有可核验的读稿动作" : "打开当前正式草稿，继续推进",
        illustration: "suggestion-illustration-flowers-heart-v6-alpha.webp",
        action: writingAction,
      }
    : {
        kind: "projection_action",
        group: "creative",
        key: "start-writing",
        label: "开始写作",
        detail: writingAction === null ? "等待正式创作入口确认" : "沿用当前正式委托动作进入写作",
        illustration: "suggestion-illustration-flowers-heart-v6-alpha.webp",
        action: writingAction,
      };
  const suggestionCards: readonly SuggestionCardView[] = [
    ...lifeSuggestionCards,
    storySparkCard,
    writingCard,
  ];
  const conversationRuntime = model.modelRuntime?.conversation ?? null;
  const creativeJobRuntime = model.modelRuntime?.creativeJob ?? null;
  const showVariantReview = variantReview !== null
    && variantReview !== undefined
    && variantReview.candidates.length === 3
    && (variantReview.state === "ready" || variantReview.state === "selecting")
    && onOpenVariantCandidate !== null
    && onOpenVariantCandidate !== undefined
    && onCloseVariantPreview !== null
    && onCloseVariantPreview !== undefined
    && onSelectVariantCandidate !== null
    && onSelectVariantCandidate !== undefined;

  useEffect(() => {
    if (!rulesOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setRulesOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [rulesOpen]);

  const surfaceGeometry = visualLayout?.surface ?? ROOM_UI_SURFACE_GEOMETRY_V6;
  const composerVisualStyle = {
    ...roomUiNestedVisualStyle("composer", visualLayout),
    "--composer-content-height": composerContentHeight,
  } as CSSProperties;

  useLayoutEffect(() => {
    const textarea = composerRef.current;
    if (textarea === null) return;

    const measure = () => {
      const computed = window.getComputedStyle(textarea);
      const fontSize = numericStyle(computed.fontSize) || 16;
      const rawLineHeight = numericStyle(computed.lineHeight);
      const lineHeight = computed.lineHeight.endsWith("px")
        ? rawLineHeight
        : (rawLineHeight > 0 ? rawLineHeight * fontSize : fontSize * 1.35);
      const padding = numericStyle(computed.paddingTop) + numericStyle(computed.paddingBottom);
      const minimumHeight = lineHeight + padding;
      const maxRows = window.innerWidth <= 640 ? MOBILE_COMPOSER_MAX_ROWS : DESKTOP_COMPOSER_MAX_ROWS;
      const maximumHeight = lineHeight * maxRows + padding;

      textarea.style.height = "0px";
      const naturalHeight = composerDraft.length === 0
        ? minimumHeight
        : Math.max(textarea.scrollHeight, minimumHeight);
      const measuredHeight = Math.min(naturalHeight, maximumHeight);
      const nextHeight = `${Number(measuredHeight.toFixed(2))}px`;
      textarea.style.height = nextHeight;

      setComposerContentHeight(nextHeight);
      setComposerExpanded(measuredHeight > minimumHeight + 1);
      setComposerOverflowing(naturalHeight > maximumHeight + 1);
      setComposerMaxRows(maxRows);
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [composerDraft]);

  useEffect(() => {
    setVariantPortalReady(true);
  }, []);

  useEffect(() => {
    if (draftReader === null) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCloseDraftReader();
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [draftReader, onCloseDraftReader]);

  useLayoutEffect(() => {
    const messageList = messageListRef.current;
    if (messageList === null || !followLatestMessageRef.current) return;
    messageList.scrollTop = messageList.scrollHeight;
  }, [model.chat.messages]);

  const fillComposer = (text: string) => {
    setComposerDraft(text);
    onFillComposer(text);
    composerRef.current?.focus();
  };

  const submitComposer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = composerDraft.trim();
    if (!text || composerDisabled) return;
    onSendMessage(text);
    setComposerDraft("");
  };

  return (
    <div
      className={styles.surface}
      style={roomUiSurfaceStyle(visualLayout)}
      data-testid="room-v6-presentational-surface"
      data-runtime-component="RoomUiPresentationalSurface"
      data-visual-mode="formal-presentational"
      data-visual-fixture={visualFixture}
      data-calibration-camera={calibrationCamera}
      data-visual-layout="room-ui-v6-1536x1024"
      data-surface-layout="compiled-v6"
      data-surface-scale={surfaceGeometry.scale}
      data-draft-reader-open={draftReader !== null}
      data-variant-review-open={showVariantReview}
      data-recovery-kind={recovery?.kind ?? "none"}
      data-gateway-action={admissionPending ? "accept_admission" : reconnectPending ? "reconnect" : "none"}
      data-gateway-ready={gatewayReady}
      data-workspace-id={model.workspacePointer?.workspaceId ?? "none"}
      data-story-id={model.workspacePointer?.storyId ?? "none"}
      data-current-chapter-content-id={model.workspacePointer?.currentChapter?.contentId ?? "none"}
      data-current-chapter-version={model.workspacePointer?.currentChapter?.version ?? "none"}
    >
      <div
        className={styles.stageArtFrame}
        style={roomUiBackdropStyle(visualLayout)}
        data-testid="room-v6-stage-art"
        data-art-layer="room-backdrop-dom"
        data-background-container="formal-independent"
        hidden
        aria-hidden="true"
      />

      <header
        className={styles.titleContainer}
        data-testid="room-v6-title-bookmark"
        style={roomUiVisualSlotStyle("title", visualLayout)}
      >
        <div className={styles.titleShell}>
          <div className={styles.titleArtFrame}>
            <img
              className={styles.titleArt}
              data-art-layer="room-title-bookmark-v6-alpha"
              src={asset("room-title-bookmark-v6-alpha.webp")}
              alt=""
              aria-hidden="true"
            />
          </div>
        </div>
        <div className={styles.titleCopy}>
          <strong>二流小说家的房间</strong>
          <span>聊天主线 · 任务作为附件</span>
        </div>
      </header>

      <div className={styles.mainGrid}>
      <section
        className={styles.statusContainer}
        data-testid="room-v6-status-card"
        style={roomUiVisualSlotStyle("status", visualLayout)}
      >
        <div className={styles.statusCardFrame}>
          <img
            className={styles.statusArt}
            data-art-layer="novelist-status-v6-alpha"
            src={asset("novelist-status-v6-alpha.webp")}
            alt=""
            aria-hidden="true"
          />
          <span
            className={styles.avatar}
            style={roomUiInternalVisualStyle("status-avatar", visualLayout)}
            data-avatar-state={model.life.avatar?.state ?? "unknown"}
            data-visual-layer="status-avatar"
          >
            {model.life.avatar?.src ? <img src={model.life.avatar.src} alt="" /> : <span aria-hidden="true">小</span>}
          </span>
          <div
            className={styles.statusCopy}
            data-testid="room-v6-status-copy"
            style={roomUiNestedVisualStyle("status-copy", visualLayout)}
          >
            <div
              className={styles.statusIdentity}
              data-testid="room-v6-status-identity"
              style={roomUiInternalVisualStyle("status-identity", visualLayout)}
            >
              <span>
                <small>小说家状态</small>
                <strong>{model.life.activityLabel}</strong>
                {model.life.avatar?.label && <em>{model.life.avatar.label.replace(/^小说家：/, "")}</em>}
              </span>
            </div>
            <p
              className={styles.statusFooter}
              data-testid="room-v6-status-scene"
              style={roomUiInternalVisualStyle("status-scene", visualLayout)}
            >
              {model.life.sceneLabel}
            </p>
            <dl
              className={styles.needsGrid}
              data-testid="room-v6-status-needs-primary"
              style={roomUiInternalVisualStyle("status-needs-primary", visualLayout)}
            >
              <div><dt>专注</dt><dd>{model.life.needs.focus}%</dd></div>
              <div><dt>疲劳</dt><dd>{model.life.needs.fatigue}%</dd></div>
            </dl>
            <dl
              className={styles.needsGrid}
              data-testid="room-v6-status-needs-secondary"
              style={roomUiInternalVisualStyle("status-needs-secondary", visualLayout)}
            >
              <div><dt>灵感</dt><dd>{model.life.needs.inspiration}%</dd></div>
              <div><dt>负荷</dt><dd>{model.life.needs.emotionalLoad}%</dd></div>
            </dl>
            {mood !== null && mood !== undefined && (
              <p
                className={styles.moodCopy}
                data-testid="room-v6-status-mood"
                data-mood-source={mood.source}
                style={roomUiInternalVisualStyle("status-mood", visualLayout)}
              >
                {mood.label} · {mood.text}
              </p>
            )}
          </div>
        </div>
      </section>

      <section
        className={styles.chatContainer}
        data-testid="room-v6-chat-paper"
        style={roomUiVisualSlotStyle("chat", visualLayout)}
      >
        <div className={styles.chatPaperFrame}>
          <img
            className={styles.chatArt}
            data-art-layer="central-chat-template-stack-v10-alpha"
            src={asset("central-chat-template-stack-v10-alpha.webp")}
            alt=""
            aria-hidden="true"
          />
          <div className={styles.chatInner}>
          <div
            className={styles.conversationPanel}
            data-testid="room-v6-conversation-panel"
            style={roomUiNestedVisualStyle("conversation", visualLayout)}
          >
          <div className={styles.chatTopline}>
            <span>主系统 · 小说家</span>
            <span data-stream-state={model.chat.streamState.phase}>{streamLabel(model.chat.streamState.phase)}</span>
          </div>
          {conversationRuntime !== null && (
            <p
              className={styles.conversationRuntime}
              data-testid="room-v6-conversation-runtime"
              data-runtime-source={conversationRuntime.source}
              title={`${conversationRuntime.provider} / ${conversationRuntime.model}`}
            >
              已验证 · {conversationRuntime.provider} / {conversationRuntime.model}
            </p>
          )}

          {onAdmissionAcknowledge ? (
            <div
              className={styles.admissionCard}
              data-testid="room-v6-admission"
              role="dialog"
              aria-label="开始前确认"
            >
              <strong>开始前确认一下</strong>
              <p>这里的对话会交给写作服务处理；当前仍是内部体验环境，只能使用你有权处理的测试内容。</p>
              <button
                type="button"
                data-testid="room-v6-admission-acknowledge"
                onClick={onAdmissionAcknowledge}
              >
                我知道了，继续
              </button>
            </div>
          ) : recovery !== null ? (
            <div className={styles.recoveryCard} data-testid="room-v6-recovery" role="status">
              <strong>房间正在恢复</strong>
              <p>{recovery.message}</p>
              {recovery.code && <small>{recovery.code}</small>}
              {onGatewayReconnect ? (
                <button
                  type="button"
                  data-testid="room-v6-gateway-reconnect"
                  onClick={onGatewayReconnect}
                >
                  重新连接
                </button>
              ) : recovery.retryable && onRetry ? (
                <button type="button" onClick={onRetry}>重试上一句</button>
              ) : null}
            </div>
          ) : (
            <>
              {model.task.projection !== null && (
                <div className={styles.projectionCopy} data-testid="room-v6-projection">
                  <strong>{model.task.projection.headline}</strong>
                  <p>{model.task.projection.body}</p>
                  {directProjectionActions.length > 0 && (
                    <div className={styles.projectionActions} data-testid="room-v6-projection-actions">
                      {directProjectionActions.map((action) => (
                        <button
                          type="button"
                          key={`${action.code}-${action.basedOnVersionId ?? "none"}`}
                          data-testid={`room-v6-projection-action-${action.code}`}
                          data-action-code={action.code}
                          data-based-on-version-id={action.basedOnVersionId ?? ""}
                          data-action-availability={isUnwiredProjectionAction(action) ? "unwired" : "available"}
                          aria-disabled={isUnwiredProjectionAction(action)}
                          disabled={isUnwiredProjectionAction(action)}
                          title={isUnwiredProjectionAction(action) ? "尚未接入正式写作动作" : undefined}
                          onClick={() => {
                            if (!isUnwiredProjectionAction(action)) onProjectionAction(action);
                          }}
                        >
                          {action.label}
                          {isUnwiredProjectionAction(action) && (
                            <small className={styles.projectionActionUnavailable}>尚未接入正式写作动作</small>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div
                className={styles.messageList}
                data-testid="room-v6-messages"
                aria-live="polite"
                ref={messageListRef}
                onScroll={(event) => {
                  const list = event.currentTarget;
                  followLatestMessageRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 24;
                }}
              >
                {model.chat.messages.length === 0 ? (
                  <p className={styles.emptyMessage}>还没有对话，输入一句话开始聊。</p>
                ) : model.chat.messages.map((message) => (
                  <article
                    className={`${styles.message} ${message.role === "user" ? styles.userMessage : styles.assistantMessage}`}
                    data-message-kind={message.kind}
                    data-message-id={message.id}
                    key={message.id}
                  >
                    <small>{messageLabel(message)}</small>
                    {message.kind === "submitted_ack"
                      ? <p className={styles.ackCopy}>已接单，后台处理中；这不是正文。</p>
                      : <p>{message.text}</p>}
                  </article>
                ))}
              </div>
              {draftCardVisible && model.draftReady !== null && (
                <section className={styles.draftCard} data-testid="room-v6-draft-ready">
                  <div>
                    <small>服务端已确认 · {model.draftReady.contentId} · v{model.draftReady.version}</small>
                    <strong>让小说家汇报这稿</strong>
                    <p>{model.draftReady.preview}</p>
                  </div>
                  <div className={styles.draftActions}>
                    <button
                      type="button"
                      data-testid="room-v6-draft-card-close"
                      onClick={() => setDismissedDraftContentId(model.draftReady!.contentId)}
                    >
                      收起结果
                    </button>
                    <button type="button" onClick={onOpenDraft}>打开草稿</button>
                    <button
                      type="button"
                      onClick={onRequestDraftFeedback}
                      disabled={model.draftReady.feedbackState === "loading"}
                      data-testid="room-v6-draft-feedback"
                    >
                      {model.draftReady.feedbackState === "loading" ? "汇报中…" : "让他汇报"}
                    </button>
                  </div>
                  {model.draftReady.feedbackState !== "idle" && (
                    <p
                      className={styles.draftFeedbackStatus}
                      data-testid="room-v6-draft-feedback-status"
                      data-feedback-state={model.draftReady.feedbackState}
                      aria-live="polite"
                      role="status"
                    >
                      {model.draftReady.feedbackState === "loading"
                        ? "正在获取汇报…"
                        : model.draftReady.feedbackState === "ready"
                          ? "汇报已收到。"
                          : "这次未拿到汇报，草稿状态未改变。"}
                    </p>
                  )}
                  {model.draftReady.feedbackState === "ready" && model.draftReady.feedback !== null && (
                    <aside className={styles.feedbackCard} data-testid="room-v6-draft-feedback-result">
                      <strong>伴随反馈 · 不是正文</strong>
                      <p>{model.draftReady.feedback.summary}</p>
                      <p>{model.draftReady.feedback.nextStep}</p>
                      {model.draftReady.feedback.revisionSuggestion && <p>{model.draftReady.feedback.revisionSuggestion}</p>}
                    </aside>
                  )}
                </section>
              )}
            </>
          )}
          </div>

          <form
            className={styles.composer}
            onSubmit={submitComposer}
            style={composerVisualStyle}
            data-composer-visual="paper-dock"
            data-composer-expanded={composerExpanded}
            data-composer-overflow={composerOverflowing}
            data-testid="room-v6-composer-shell"
          >
            <div className={styles.composerControls}>
              <div className={styles.chatInputFrame} data-chat-input-container="independent">
                <textarea
                  ref={composerRef}
                  value={composerDraft}
                  disabled={composerInputDisabled}
                  rows={1}
                  maxLength={600}
                  placeholder={!gatewayReady
                    ? "可先输入，连接后发送…"
                    : admissionPending
                      ? "可先输入，确认连接后发送…"
                      : reconnectPending || recovery !== null
                        ? "可先输入，恢复后发送…"
                        : model.chat.composer.placeholder}
                  aria-label="和小说家说点什么"
                  data-testid="room-v6-composer"
                  data-chat-input-grow="downward"
                  data-composer-max-rows={composerMaxRows}
                  style={{ height: composerContentHeight }}
                  onChange={(event) => setComposerDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
              </div>
              <div className={styles.chatSendDock} data-chat-send-container="adjacent">
                <button
                  type={model.chat.streamState.phase === "streaming" ? "button" : "submit"}
                  disabled={sendButtonDisabled}
                  onClick={model.chat.streamState.phase === "streaming" ? onStopStreaming : undefined}
                  data-testid="room-v6-composer-submit"
                >
                  {model.chat.streamState.phase === "streaming" ? "停止" : "发送"}
                </button>
              </div>
            </div>
          </form>
          </div>
        </div>
      </section>

      <aside
        className={styles.suggestionsContainer}
        data-testid="room-v6-suggestions"
        style={roomUiVisualSlotStyle("suggestions", visualLayout)}
      >
        <img
          className={styles.suggestionsArt}
          data-art-layer="suggestion-rail-v6-alpha"
          src={asset("suggestion-rail-v6-alpha.webp")}
          alt=""
          aria-hidden="true"
        />
        <div
          className={styles.suggestionsCopy}
          data-testid="room-v6-suggestions-copy"
          style={roomUiNestedVisualStyle("suggestions-copy", visualLayout)}
          >
          <header>
            <span>建议栏</span>
            <small>{composerDisabled ? "生活 / 创作入口 · 恢复后可用" : "生活聊近况 · 创作按正式状态启用"}</small>
          </header>
          <div className={styles.suggestionList} data-testid="room-v6-suggestion-list">
            <button
              type="button"
              className={styles.suggestionGuideTrigger}
              data-testid="room-v6-suggestion-guide-library"
              style={roomUiInternalVisualStyle("suggestion-guide-library", visualLayout)}
              aria-label="打开指南库"
              aria-haspopup="dialog"
              aria-controls="room-v6-guide-library"
              onClick={() => setGuideLibraryOpen(true)}
            >
              指南库
            </button>
            {suggestionCards.map((card, index) => {
              const cardLayerId = suggestionCardLayerIds[index];
              if (cardLayerId === undefined) {
                throw new Error("suggestion card layout layer is missing");
              }
              const cardDisabled = composerDisabled
                || (card.kind === "projection_action" && (!card.action || isUnwiredProjectionAction(card.action)));
              const cardActionUnavailable = card.kind === "projection_action" && isUnwiredProjectionAction(card.action);
              const cardBody = (
                <span className={styles.suggestionCardArtStage}>
                  <img
                    className={styles.suggestionCardArt}
                    src={asset("suggestion-card-master-v8-opaque.webp")}
                    data-art-layer={`suggestion-card-${index + 1}`}
                    data-card-art="complete-master"
                    alt=""
                    aria-hidden="true"
                  />
                  <span className={styles.suggestionCardCopy}>
                    <span
                      className={styles.suggestionCardIconSlot}
                      data-card-slot="illustration"
                      data-testid={index === 0 ? "room-v6-suggestion-icon-slot" : undefined}
                      style={roomUiInternalVisualStyle("suggestion-icon", visualLayout)}
                    >
                      <img
                        className={styles.suggestionIllustration}
                        src={asset(card.illustration)}
                        data-art-layer={`suggestion-illustration-${index + 1}`}
                        alt=""
                        aria-hidden="true"
                      />
                    </span>
                    <span
                      className={styles.suggestionCardTitleSlot}
                      data-card-slot="title"
                      data-testid={index === 0 ? "room-v6-suggestion-title-slot" : undefined}
                      style={roomUiInternalVisualStyle("suggestion-title", visualLayout)}
                    >
                      <strong>{card.label}</strong>
                    </span>
                    <span
                      className={styles.suggestionCardDetailSlot}
                      data-card-slot="prompt-detail"
                      data-testid={index === 0 ? "room-v6-suggestion-detail-slot" : undefined}
                      style={roomUiInternalVisualStyle("suggestion-detail", visualLayout)}
                    >
                      <small>{card.detail}</small>
                    </span>
                  </span>
                </span>
              );

              return (
                <div className={styles.suggestionCardRow} key={card.key}>
                  <button
                    type="button"
                    className={styles.suggestionCard}
                    style={{
                      ...roomUiInternalVisualStyle(cardLayerId, visualLayout),
                      ...roomUiSuggestionTypographyStyle(cardLayerId, visualLayout),
                    }}
                    disabled={cardDisabled}
                    aria-disabled={cardDisabled}
                    data-testid={`room-v6-suggestion-${index + 1}`}
                    data-suggestion-kind={card.kind}
                    data-card-group={card.group}
                    data-preset-key={card.key}
                    data-action-code={card.action?.code}
                    data-based-on-version-id={card.action?.basedOnVersionId}
                    data-action-availability={cardActionUnavailable ? "unwired" : "available"}
                    data-card-layout-layer={cardLayerId}
                    title={cardActionUnavailable ? "尚未接入正式写作动作" : undefined}
                    onClick={() => {
                      if (card.kind === "projection_action") {
                        if (card.action !== null && card.action !== undefined && !isUnwiredProjectionAction(card.action)) {
                          onProjectionAction(card.action);
                        }
                        return;
                      }
                      if (card.composerText !== undefined) fillComposer(card.composerText);
                    }}
                  >
                    {cardBody}
                  </button>
                </div>
              );
            })}
          </div>
          {actions.length === 0 && recovery !== null && (
            <p className={styles.noSuggestion}>当前连接恢复后，生活入口可用；创作入口仍需正式状态确认。</p>
          )}
        </div>
      </aside>
      </div>

      {variantPortalReady && createPortal(
        <nav className={styles.utilityActions} aria-label="房间入口">
          <button
            type="button"
            className={styles.utilityAction}
            data-testid="room-v6-dialogue-rules"
            aria-expanded={rulesOpen}
            aria-controls="room-v6-dialogue-rules-panel"
            onClick={() => setRulesOpen((open) => !open)}
          >
            对话规则
          </button>
          {storyHubHref !== null ? (
            <a
              className={styles.utilityAction}
              data-testid="room-v6-story-hub-link"
              href={storyHubHref}
            >
              前往小说正文
            </a>
          ) : (
            <button
              type="button"
              className={styles.utilityAction}
              data-testid="room-v6-story-hub-link"
              disabled
              aria-disabled="true"
            >
              前往小说正文
            </button>
          )}
        </nav>,
        document.body,
      )}

      {rulesOpen && (
        <div className={styles.rulesBackdrop} data-testid="room-v6-dialogue-rules-backdrop">
          <section
            className={styles.rulesPanel}
            id="room-v6-dialogue-rules-panel"
            data-testid="room-v6-dialogue-rules-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="room-v6-dialogue-rules-title"
          >
            <header className={styles.rulesHeader}>
              <div>
                <strong id="room-v6-dialogue-rules-title">对话规则</strong>
                <small>这里说明边界，不会替你发送消息或创建作品。</small>
              </div>
              <button
                type="button"
                className={styles.rulesClose}
                data-testid="room-v6-dialogue-rules-close"
                onClick={() => setRulesOpen(false)}
                aria-label="关闭对话规则"
              >
                ×
              </button>
            </header>
            <ul className={styles.rulesList}>
              <li>聊天内容只显示已收到并校验的消息；接单提示不是正文。</li>
              <li>正式创作只认服务端确认的作品状态，不从聊天语气推断进度。</li>
              <li>发送、停止、重试和正式动作都保留在当前房间的可编辑界面内。</li>
            </ul>
          </section>
        </div>
      )}

      {variantPortalReady && guideLibraryOpen && createPortal(
        <RoomGuideLibrary onClose={() => setGuideLibraryOpen(false)} />,
        document.body,
      )}

      <footer
        className={styles.progressContainer}
        data-testid="room-v6-progress"
        style={roomUiVisualSlotStyle("progress", visualLayout)}
      >
        <img
          className={styles.progressArt}
          data-art-layer="creative-progress-v6-alpha"
          src={asset("creative-progress-v6-alpha.webp")}
          alt=""
          aria-hidden="true"
        />
        <div className={styles.progressCopy}>
          <div className={styles.progressHeader}>
            <span>创作进度</span>
            <small data-progress-source={model.progress.source}>
              {model.progress.roomContextProgress === "variant_review"
                ? "候选待选 · 请先选择"
                : model.progress.source === "persisted_story_truth" ? "服务端作品真值" : model.progress.source === "blocked" ? "受限" : "暂无作品真值"}
            </small>
          </div>
          <div className={styles.progressSteps} data-progress-verified={hasPersistedProgress}>
            {progressSteps.map((step) => (
              <div
                key={step.id}
                data-progress-step={step.id}
                data-active={hasPersistedProgress && activeProgressIndex >= progressIndex(step.id)}
              >
                <i
                  aria-hidden="true"
                  data-visual-layer={step.dotLayer}
                  style={roomUiInternalVisualStyle(step.dotLayer, visualLayout)}
                />
                <span
                  data-visual-layer={step.textLayer}
                  style={roomUiInternalVisualStyle(step.textLayer, visualLayout)}
                >
                  {step.id === "draft_ready" && model.progress.roomContextProgress === "variant_review" ? "候选待选" : step.label}
                </span>
              </div>
            ))}
          </div>
          {model.progress.creativeJob !== null && model.progress.source === "persisted_story_truth" && (
            <p className={styles.creativeJob} data-creative-job-status={model.progress.creativeJob.status}>
              任务状态：{model.progress.creativeJob.status} · {model.progress.creativeJob.progress}
              {creativeJobRuntime !== null && (
                <span
                  data-testid="room-v6-creative-job-runtime"
                  data-runtime-source={creativeJobRuntime.source}
                  title={`${creativeJobRuntime.provider} / ${creativeJobRuntime.model}`}
                >
                  {" · 创作路由 "}{creativeJobRuntime.provider} / {creativeJobRuntime.model}
                </span>
              )}
            </p>
          )}
        </div>
      </footer>

      {variantPortalReady && draftReader !== null && createPortal(
        <div className={styles.draftReaderOverlay} data-testid="room-v6-draft-reader-overlay">
          <section
            className={styles.draftReaderPanel}
            data-testid="room-v6-draft-reader"
            data-content-id={draftReader.contentId}
            data-version-id={draftReader.versionId}
            data-draft-kind={draftReader.kind}
            role="dialog"
            aria-modal="true"
            aria-labelledby="room-v6-draft-reader-title"
          >
            <header className={styles.draftReaderHeader}>
              <strong id="room-v6-draft-reader-title">当前草稿</strong>
              <button
                type="button"
                className={styles.draftReaderReturn}
                data-testid="room-v6-draft-reader-return"
                onClick={onClose}
              >
                返回房间
              </button>
              <button
                type="button"
                className={styles.draftReaderClose}
                data-testid="room-v6-draft-reader-close"
                onClick={onCloseDraftReader}
                aria-label="关闭草稿阅读器"
              >
                ×
              </button>
            </header>
            <article className={styles.draftReaderBody} tabIndex={0}>{draftReader.body}</article>
          </section>
        </div>,
        document.body,
      )}
      {variantPortalReady && showVariantReview && createPortal(
        <div
          className={styles.variantReviewOverlay}
          data-room-shortcut-scope="system-panel"
          data-testid="room-v6-variant-review-overlay"
          data-variant-review-state={variantReview.state}
        >
          <div className={styles.variantReviewFrame}>
            <RoomUiPresentationalVariantTable
              candidates={variantReview.candidates}
              selectedPreviewId={variantReview.selectedPreviewId}
              selectingCandidateId={variantReview.selectingCandidateId}
              onOpen={onOpenVariantCandidate}
              onClose={onCloseVariantPreview}
              onSelect={onSelectVariantCandidate}
            />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

export default RoomUiPresentationalSurface;
