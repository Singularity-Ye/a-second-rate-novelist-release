"use client";

import React from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type {
  ArchiveIntentItem,
  ChatRoutingView,
  QuickActionView,
} from "@erliu/shared-contracts";
import { buildFeedbackHref } from "../lib/beta-ops-links";
import { useAccountSurfaceSession } from "../lib/account-surface-session";
import {
  FRONTSTAGE_ENTRY_ERROR,
  FRONTSTAGE_LOADING,
  toFrontstageErrorCopy,
} from "../lib/frontstage-copy";
import { fetchReaderProfile, submitOnboardingStep } from "../lib/profile-api";
import type { ReaderProfileView } from "@erliu/shared-contracts";
import { fetchArchiveIntents } from "../lib/archive-intents-api";
import { fetchQuickActions, resolveChatContext, sendChatMessage } from "../lib/chat-routing-api";
import { withSessionContext } from "../lib/navigation";

const stepLabels = {
  reading_archive: "阅读自传",
  taste_archive: "口味结构",
  boundaries: "雷点边界",
  collaboration_mode: "参与偏好",
} as const;

type ChatSessionContext = {
  token: string | null;
  account_token: string;
};

export function ChatSessionView() {
  const searchParams = useSearchParams();
  const frontstageSession = useAccountSurfaceSession("/chat");
  const [session, setSession] = useState<ChatSessionContext | null>(null);
  const [profile, setProfile] = useState<ReaderProfileView | null>(null);
  const [routing, setRouting] = useState<ChatRoutingView | null>(null);
  const [quickActions, setQuickActions] = useState<QuickActionView[]>([]);
  const [threadItems, setThreadItems] = useState<ArchiveIntentItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draftMessage, setDraftMessage] = useState("");
  const [ackMessage, setAckMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [resolvingRoute, setResolvingRoute] = useState(false);

  const routeDecisionId = searchParams.get("routeDecisionId");
  const initialStoryId = searchParams.get("storyId");
  const rawCandidates = searchParams.get("candidates");

  useEffect(() => {
    if (!frontstageSession.accountToken) {
      setSession(null);
      if (frontstageSession.recoveryState !== "recovering") {
        setError(FRONTSTAGE_ENTRY_ERROR);
      }
      return;
    }

    setError(null);
    setSession({
      token: frontstageSession.token,
      account_token: frontstageSession.accountToken,
    });
  }, [frontstageSession.accountToken, frontstageSession.recoveryState, frontstageSession.token]);

  useEffect(() => {
    if (!routeDecisionId) {
      if (initialStoryId) {
        setRouting((current) =>
          current ?? {
            route_decision_id: "hydrated-story-context",
            status: "auto_resolved",
            route_mode: "auto",
            confidence_score: 0.8,
            confidence_band: "high",
            selected_story_id: initialStoryId,
            selected_story_title: null,
            candidates: [],
          },
        );
      }
      return;
    }

    const initialCandidates = parseCandidates(rawCandidates);

    setRouting({
      route_decision_id: routeDecisionId,
      status: initialCandidates.length > 0 ? "ambiguous" : "parked_to_recent",
      route_mode: "parked",
      confidence_score: 0.4,
      confidence_band: "low",
      selected_story_id: initialStoryId,
      selected_story_title: null,
      candidates: initialCandidates,
    });
  }, [initialStoryId, rawCandidates, routeDecisionId]);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      if (!frontstageSession.accountToken && frontstageSession.recoveryState !== "recovering") {
        setError(FRONTSTAGE_ENTRY_ERROR);
      }
      return;
    }

    fetchReaderProfile(session.account_token)
      .then((result) => {
        setProfile(normalizeReaderProfile(result));
      })
      .catch((reason) => {
        setError(toFrontstageErrorCopy(reason, "我这会儿还没把你的这一页整理出来。"));
      });
  }, [frontstageSession.recoveryState, session]);

  async function refreshThread(account_token: string) {
    const archiveIntents = await fetchArchiveIntents(account_token);
    const normalizedItems = Array.isArray(archiveIntents.items) ? archiveIntents.items : [];
    setThreadItems(normalizedItems);
    setAckMessage((current) => current ?? normalizedItems[0]?.ack_copy ?? null);
  }

  useEffect(() => {
    if (!session) {
      return;
    }

    refreshThread(session.account_token).catch((reason) => {
      setError(toFrontstageErrorCopy(reason, "这条私聊还没完全接稳，我再试一次。"));
    });
  }, [session]);

  useEffect(() => {
    const storyId = routing?.selected_story_id ?? initialStoryId ?? null;

    fetchQuickActions({
      story_id: storyId,
      chapter_id: null,
      surface: "chat",
    })
      .then((actions) => {
        setQuickActions(actions);
      })
      .catch((reason) => {
        setError(toFrontstageErrorCopy(reason, "这几个高频动作我还没替你摆出来。"));
      });
  }, [initialStoryId, routing?.selected_story_id]);

  async function handleResolveStory(selected_story_id: string) {
    if (!routeDecisionId || resolvingRoute || !session) {
      return;
    }

    setResolvingRoute(true);

    try {
      const resolved = await resolveChatContext({
        route_decision_id: routeDecisionId,
        selected_story_id,
      });

      setRouting(resolved.routing);
      setAckMessage(resolved.ack.ack_copy);
      setQuickActions(resolved.follow_up_actions);
      await refreshThread(session.account_token);
    } finally {
      setResolvingRoute(false);
    }
  }

  async function handleSendMessage() {
    if (!session || !draftMessage.trim() || sendingMessage) {
      return;
    }

    setSendingMessage(true);
    setSubmitting(true);
    setError(null);

    try {
      if (profile && profile.completion_status.pending_dimensions.length > 0 && profile.completion_status.state !== "confirmed") {
        const result = await submitOnboardingStep({
          account_token: session.account_token,
          answer_text: draftMessage.trim(),
        });

        setAckMessage(result.ack_copy);
        setProfile(result.profile);
        setDraftMessage("");
        return;
      }

      const response = await sendChatMessage({
        account_token: session.account_token,
        text: draftMessage.trim(),
        active_story_id: routing?.selected_story_id ?? initialStoryId ?? null,
      });

      setRouting(response.routing);
      setQuickActions(response.follow_up_actions);
      setAckMessage(response.ack.ack_copy);
      setDraftMessage("");
      await refreshThread(session.account_token);
    } catch (reason) {
      setError(toFrontstageErrorCopy(reason, "这句我还没接稳，你再发一次试试。"));
    } finally {
      setSendingMessage(false);
      setSubmitting(false);
    }
  }

  const completionStatus = profile ? getCompletionStatus(profile) : null;
  const profileConfirmed = completionStatus?.state === "confirmed";
  const nextPendingDimension = completionStatus?.pending_dimensions[0] ?? null;
  const activeStoryId = routing?.selected_story_id ?? initialStoryId ?? null;
  const onboardingCue = completionStatus && nextPendingDimension
    ? {
        title: stepLabels[nextPendingDimension],
        prompt: completionStatus.conversation_cue,
      }
    : null;
  const composeButtonLabel = profileConfirmed ? "发送这句" : submitting ? "记着呢..." : "让小韩先记住这句";
  const roomHref = withSessionContext("/room", {
    token: session?.token,
    accountToken: session?.account_token,
  });
  const storyStartHref = withSessionContext("/stories/new", {
    token: session?.token,
    accountToken: session?.account_token,
  });
  const profileSummaryHref = withSessionContext("/onboarding/confirm", {
    token: session?.token,
    accountToken: session?.account_token,
  });
  const recentIntentsHref = activeStoryId
    ? withSessionContext(`/stories/${encodeURIComponent(activeStoryId)}/intents/recent`, {
        token: session?.token,
        accountToken: session?.account_token,
      })
    : null;
  const feedbackHref = buildFeedbackHref({
    surface: "chat",
    account_token: session?.account_token,
    story_id: activeStoryId,
    target_type: "chat_thread",
    target_id: routing?.route_decision_id ?? "chat-thread",
    target_label: "主聊天线程",
    token: session?.token,
  });
  const supportLinks = [
    {
      href: roomHref,
      title: "回房间看进度",
      copy: "去看他现在停在哪一处，再决定要不要从章节或故事中枢继续。",
    },
    {
      href: storyStartHref,
      title: profileConfirmed ? "把这条立成故事" : "看第一轮方向",
      copy: profileConfirmed ? "当这条已经够清楚时，再把它正式立成一本故事。" : "等你想把这条继续往下写时，再去把方向立起来。",
    },
    {
      href: profileSummaryHref,
      title: profileConfirmed ? "回看读者档案" : "看我现在记到哪",
      copy: "确认我当前记住了哪些偏好、边界和参与方式。",
    },
    {
      href: feedbackHref,
      title: "反馈与求助",
      copy: "如果这条私聊的落点、回看或提示不对，就从这里告诉我们。",
    },
  ];
  const primarySupportLinks = supportLinks.slice(0, 2);
  const profileLink = supportLinks[2];
  const feedbackLink = supportLinks[3];

  return (
    <main data-testid="chat-page" className="surface chat-surface">
      <section className="page-intro page-intro--chat chat-hero">
        <p className="page-intro__eyebrow">和小韩说话</p>
        <h1 className="page-intro__title">
          {profileConfirmed ? "先把今晚这句交给我" : "先说一句，我边聊边把你认准"}
        </h1>
        <p className="page-intro__lede">
          {profileConfirmed
            ? "我会先按当前档案和这条私聊继续接，不把它丢成一次性的输入框。"
            : "不用先填表。你只管像私聊一样往下说，我先记下偏好和边界，再把第一轮方向接回房间。"}
        </p>
        <ul className="tag-row">
          <li>默认私密</li>
          <li>{profileConfirmed ? "按当前档案继续接" : "边聊边归纳偏好"}</li>
          <li>{activeStoryId ? "这条故事线已接上" : "还没立故事也能先聊"}</li>
        </ul>
        {error ? <p className="story-microcopy story-microcopy--danger">{error}</p> : null}
        {session ? (
          <p className="surface-meta">你先把这句交过来，后面的去处我先替你收在后面。</p>
        ) : (
          <p>{FRONTSTAGE_LOADING.chat}</p>
        )}
      </section>

      {session ? (
        <div className="chat-layout chat-layout--focus">
          <section className="chat-primary-stage">
            <section className="story-cell chat-compose-panel" data-testid="chat-compose-panel">
              <p className="story-section__eyebrow">继续这条私聊</p>
              <h2>把这一句直接交给小韩</h2>
              <p>这里先只做一件事：把这句稳稳接住。至于回房间、立故事还是回看档案，都退到后面再说。</p>
              <label>
                聊天输入框
                <textarea
                  aria-label="聊天输入框"
                  value={draftMessage}
                  disabled={sendingMessage}
                  onChange={(event) => {
                    setDraftMessage(event.target.value);
                  }}
                />
              </label>
              <button
                className="primary-cta"
                type="button"
                disabled={sendingMessage || !draftMessage.trim()}
                onClick={() => void handleSendMessage()}
              >
                {sendingMessage ? "发送中..." : composeButtonLabel}
              </button>
            </section>

            {routing?.status === "ambiguous" ? (
              <section className="story-cell chat-route-panel" data-testid="chat-route-disambiguation">
                <p className="story-section__eyebrow">先确认去处</p>
                <h2>这句更像是在说哪条故事线？</h2>
                <p>我已经先替你接住了。你点一下，我就把它并到正确的那本里。</p>
                <div className="chat-choice-grid">
                  {routing.candidates.map((candidate) => (
                    <button
                      key={candidate.story_id}
                      type="button"
                      disabled={resolvingRoute}
                      className="chat-choice-card"
                      onClick={() => void handleResolveStory(candidate.story_id)}
                    >
                      <strong>{candidate.story_title}</strong>
                      <span>确认这是你刚刚在说的那本</span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {ackMessage ? (
              <section className="story-cell chat-ack-panel">
                <p className="story-section__eyebrow">我先这样接住你</p>
                <p data-testid="chat-ack-copy">{ackMessage}</p>
              </section>
            ) : null}

            {profile ? (
              <section className="story-cell chat-onboarding-panel">
                <p className="story-section__eyebrow">{profileConfirmed ? "我现在按这些继续接" : "我现在先记住这些"}</p>
                <h2>{profileConfirmed ? "当前档案已经能继续接上" : "还差这一两步，我就能更稳地继续接"}</h2>
                <p>
                  {profileConfirmed
                    ? "这里展示的是当前已经确认过的偏好和边界，不是神秘的人设推断。后面继续聊时，我会先按这版接。"
                    : "我先按已经记住的偏好、边界和参与方式继续接这条私聊；缺的那部分再顺着聊天慢慢补。"}
                </p>
                <ul className="tag-row">
                  <li>
                    已记住：
                    {completionStatus?.captured_dimensions.map((step) => stepLabels[step]).join(" / ") || "先从你最想说的开始"}
                  </li>
                  <li>{collaborationModeLabels[profile.collaboration_mode]}</li>
                  <li>安全模式：{safetyModeLabels[profile.safety_mode]}</li>
                </ul>
                {completionStatus?.state !== "confirmed" ? (
                  <>
                    {onboardingCue ? (
                      <div className="chat-step-card" data-testid="chat-onboarding-progress">
                        <strong>{onboardingCue.title}</strong>
                        <span>{onboardingCue.prompt}</span>
                      </div>
                    ) : (
                      <Link
                        className="secondary-cta"
                        href={withSessionContext("/onboarding/confirm", {
                          token: session.token,
                          accountToken: session.account_token,
                        })}
                      >
                        看我现在记到哪
                      </Link>
                    )}
                  </>
                ) : (
                  <p>你的读者档案已经确认。</p>
                )}
              </section>
            ) : (
              <section className="story-cell">
                <p>{FRONTSTAGE_LOADING.profileConfirmation}</p>
              </section>
            )}
          </section>

          <aside className="chat-side-column">
            <section className="story-section chat-thread-panel" data-testid="chat-thread-panel">
              <p className="story-section__eyebrow">最近这条私聊里记下的东西</p>
              <h2>这不是一次性开场白，它会留下回看</h2>
              <p>先把最近几句收在这里，等故事线接稳后，再并回对应的故事或档案。</p>
              {threadItems.length > 0 ? (
                <div className="chat-thread-stack">
                  {threadItems.map((item) => (
                    <article key={item.intent_id} className="chat-thread-item story-thread-card" data-testid="chat-thread-item">
                      <strong>{item.message_text || item.ack_copy}</strong>
                      <p>{item.ack_copy}</p>
                      <ul className="tag-row">
                        <li>{item.target_object.object_label}</li>
                        <li>已经记下</li>
                        <li>随时可修</li>
                      </ul>
                    </article>
                  ))}
                </div>
              ) : (
                <p data-testid="chat-thread-empty">还没有最近记下，先发一句，我会把它接进这条线程。</p>
              )}
            </section>

            <section className="story-cell chat-support-panel">
              <p className="story-section__eyebrow">要换路线时，再看这里</p>
              <h2>想换个去处时，再从这里转</h2>
              <p>主动作还是先把这句聊完。要回房间、看最近记下或把它立成故事，再从这里接下去。</p>
              {quickActions.length > 0 ? (
                <div className="chat-inline-actions" data-testid="chat-quick-actions">
                  <strong>下一步大概率会去</strong>
                  <ul className="chip-list">
                    {quickActions.map((action) => (
                      <li key={action.action_key}>{action.label}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {recentIntentsHref ? (
                <Link className="chat-inline-link" href={recentIntentsHref}>
                  回看这本书里的最近记下
                </Link>
              ) : (
                <p className="story-microcopy">最近记下已经先收在当前线程里；等故事线立起来后，会并到对应故事里继续回看。</p>
              )}
              {profileLink ? (
                <Link className="chat-inline-link" href={profileLink.href}>
                  {profileLink.title}
                </Link>
              ) : null}
              <div className="story-shell-links chat-support-links">
                {primarySupportLinks.map((item) => (
                  <Link key={item.href} className="story-cell story-cell--link" href={item.href}>
                    <strong>{item.title}</strong>
                    <span>{item.copy}</span>
                  </Link>
                ))}
              </div>
              {feedbackLink ? (
                <div className="chat-support-meta">
                  <Link href={feedbackLink.href}>{feedbackLink.title}</Link>
                  <span>{feedbackLink.copy}</span>
                </div>
              ) : null}
            </section>
          </aside>
        </div>
      ) : null}
    </main>
  );
}

function getCompletionStatus(profile: ReaderProfileView) {
  const completionStatus = profile.completion_status;

  if (
    completionStatus &&
    Array.isArray((completionStatus as { captured_dimensions?: unknown }).captured_dimensions) &&
    Array.isArray((completionStatus as { pending_dimensions?: unknown }).pending_dimensions)
  ) {
    return completionStatus;
  }

  return deriveFallbackCompletionStatus(profile);
}

function normalizeReaderProfile(profile: ReaderProfileView): ReaderProfileView {
  return {
    ...profile,
    completion_status: getCompletionStatus(profile),
  };
}

function deriveFallbackCompletionStatus(profile: ReaderProfileView): ReaderProfileView["completion_status"] {
  const capturedDimensions = [] as ReaderProfileView["completion_status"]["captured_dimensions"];

  if (profile.reading_archive.favorite_books.length > 0) {
    capturedDimensions.push("reading_archive");
  }

  if (
    profile.taste_archive.relationship_preference.length > 0 ||
    profile.taste_archive.pace ||
    profile.taste_archive.emotion ||
    profile.taste_archive.ending
  ) {
    capturedDimensions.push("taste_archive");
  }

  if (profile.boundaries.red_lines.length > 0) {
    capturedDimensions.push("boundaries");
  }

  const collaborationCaptured = profile.collaboration_mode !== "read_only";
  if (collaborationCaptured) {
    capturedDimensions.push("collaboration_mode");
  }

  const pendingDimensions = (["reading_archive", "taste_archive", "boundaries", "collaboration_mode"] as const).filter(
    (step) => !capturedDimensions.includes(step),
  );

  return {
    state:
      profile.profile_status === "confirmed"
        ? "confirmed"
        : capturedDimensions.length === 0
          ? "collecting"
          : pendingDimensions.length > 0
            ? "resumable"
            : "confirm_pending",
    captured_dimensions: capturedDimensions,
    pending_dimensions: pendingDimensions,
    conversation_cue: pendingDimensions[0] ? fallbackStepPrompts[pendingDimensions[0]] : null,
  };
}

function parseCandidates(rawCandidates: string | null) {
  if (!rawCandidates) {
    return [];
  }

  try {
    const decoded = decodeURIComponent(rawCandidates);
    const parsed = JSON.parse(decoded) as Array<{
      story_id: string;
      story_title: string;
    }>;

    return parsed.map((candidate) => ({
      ...candidate,
      confidence_score: 0.4,
      reason_labels: ["deep_link_candidate"],
    }));
  } catch {
    return [];
  }
}

const collaborationModeLabels = {
  read_only: "以阅读为主",
  co_create: "适合一起共创",
  director: "你也想导演走向",
} as const;

const fallbackStepPrompts = {
  reading_archive: "默认私密。先告诉我，你读过哪些作品最留下痕迹？",
  taste_archive: "你更偏爱什么样的关系、节奏、情绪和结尾？",
  boundaries: "有什么明确不想看到的题材、桥段或尺度吗？",
  collaboration_mode: "你更想只读、一起共创，还是直接导演我改？",
} as const;

const safetyModeLabels = {
  default: "默认",
  minor_safe: "未成年人保护",
  strict: "严格",
} as const;
