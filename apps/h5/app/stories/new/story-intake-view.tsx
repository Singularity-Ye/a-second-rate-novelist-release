"use client";

import React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type {
  StoryProposalCapabilityTruthView,
  StoryGenreBriefView,
  StoryProposalAcceptResponse,
  StoryProposalView,
} from "@erliu/shared-contracts";
import { exchangeSessionToken } from "../../lib/session-bridge";
import { useAccountSurfaceSession } from "../../lib/account-surface-session";
import { withSessionContext } from "../../lib/navigation";
import {
  acceptStoryProposal,
  createIntakeSession,
  generateStoryProposals,
} from "../../lib/story-intake-api";
import { FRONTSTAGE_ENTRY_ERROR, toFrontstageErrorCopy } from "../../lib/frontstage-copy";
import { withLaunchTracking } from "../../lib/launch-tracking";

const modeLabels = {
  has_setting: "我有设定",
  only_feeling: "我只有感觉",
  repair_line: "我想续写修复",
  pitch_me: "你来提案",
} as const;

const capabilityTruthCopy = {
  runtime_backed: {
    badge: "真实运行时",
    title: "这轮提案来自真实运行时",
    description: "这一轮已经走过真实运行时，不是演示拼图。",
  },
  runtime_degraded: {
    badge: "真实运行时，已降级",
    title: "这轮提案来自真实运行时，但已经退到备用路由",
    description: "这轮结果仍然来自真实运行时，只是当前不是最优路由。",
  },
  simulation_fallback: {
    badge: "仅流程 smoke",
    title: "当前只是流程 smoke",
    description: "这轮提案来自固定 fallback 蓝图，只用于打通流程，不代表真实模型创作能力已经通过。",
  },
} as const;

export function resolveCapabilityTruthCopy(capabilityTruth?: StoryProposalCapabilityTruthView | null) {
  if (!capabilityTruth) {
    return null;
  }

  return capabilityTruthCopy[capabilityTruth.state];
}

export function StoryIntakeView({ token: forcedToken }: { token?: string } = {}) {
  const searchParams = useSearchParams();
  const queryToken = searchParams.get("token");
  const frontstageSession = useAccountSurfaceSession("/stories/new");
  const activeSessionKey =
    forcedToken ??
    queryToken ??
    frontstageSession.token ??
    frontstageSession.accountToken ??
    null;
  const [accountToken, setAccountToken] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<keyof typeof modeLabels | null>(null);
  const [briefText, setBriefText] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [genreBrief, setGenreBrief] = useState<StoryGenreBriefView | null>(null);
  const [capabilityTruth, setCapabilityTruth] = useState<StoryProposalCapabilityTruthView | null>(null);
  const [proposals, setProposals] = useState<StoryProposalView[]>([]);
  const [selectedProposal, setSelectedProposal] = useState<StoryProposalView | null>(null);
  const [createdStory, setCreatedStory] = useState<StoryProposalAcceptResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadedSessionKey, setLoadedSessionKey] = useState<string | null>(activeSessionKey);
  const loadedSessionKeyRef = useRef<string | null>(loadedSessionKey);

  useEffect(() => {
    loadedSessionKeyRef.current = loadedSessionKey;
  }, [loadedSessionKey]);

  useEffect(() => {
    const token = forcedToken ?? queryToken;
    let active = true;
    const previousLoadedSessionKey = loadedSessionKeyRef.current;
    const shouldResetSessionScopedState = previousLoadedSessionKey !== activeSessionKey;
    const shouldResetDraft = previousLoadedSessionKey !== null && previousLoadedSessionKey !== activeSessionKey;

    if (shouldResetSessionScopedState) {
      setAccountToken(null);
      setSessionId(null);
      setGenreBrief(null);
      setCapabilityTruth(null);
      setProposals([]);
      setSelectedProposal(null);
      setCreatedStory(null);
      setError(null);
    }

    if (shouldResetDraft) {
      setSelectedMode(null);
      setBriefText("");
    }

    if (token) {
      exchangeSessionToken(token)
        .then((session) => {
          if (!active) {
            return;
          }

          setAccountToken(session.account_token);
          setLoadedSessionKey(activeSessionKey);
          setError(null);
        })
        .catch((reason) => {
          if (!active) {
            return;
          }

          setLoadedSessionKey(activeSessionKey);
          setError(toFrontstageErrorCopy(reason, FRONTSTAGE_ENTRY_ERROR));
        });

      return () => {
        active = false;
      };
    }

    if (frontstageSession.accountToken) {
      setAccountToken(frontstageSession.accountToken);
      setLoadedSessionKey(activeSessionKey);
      setError(null);
      return () => {
        active = false;
      };
    }

    if (frontstageSession.recoveryState !== "recovering") {
      setLoadedSessionKey(null);
      setError(FRONTSTAGE_ENTRY_ERROR);
    }

    return () => {
      active = false;
    };
  }, [activeSessionKey, forcedToken, frontstageSession.accountToken, frontstageSession.recoveryState, queryToken]);

  async function handleGenerateProposals() {
    if (!currentAccountToken || !selectedMode || !briefText.trim() || submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const session =
        sessionId ??
        (
          await createIntakeSession({
            account_token: currentAccountToken,
            entry_surface: "chat",
            intake_mode: selectedMode,
            brief_payload: {
              seed_text: briefText.trim(),
            },
            client_request_id: `session-${Date.now()}`,
          })
        ).session_id;

      setSessionId(session);

      const generated = await generateStoryProposals({
        session_id: session,
        client_request_id: `proposals-${Date.now()}`,
      });

      setGenreBrief(generated.genre_brief);
      setCapabilityTruth(generated.capability_truth ?? null);
      setProposals(generated.proposals);
      setSelectedProposal(null);
      setCreatedStory(null);
    } catch (reason) {
      setError(toFrontstageErrorCopy(reason, "这轮故事方向我还没整理好，再试一次。"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAcceptProposal() {
    if (submitting || !selectedProposal) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const accepted = await acceptStoryProposal({
        proposal_id: selectedProposal.proposal_id,
        commission_adjustments: {
          tone_hint: "暧昧值再高一点，但不要太快在一起。",
        },
        launch_first_chapter: false,
        client_request_id: `accept-${Date.now()}`,
      });

      setCreatedStory(accepted);
    } catch (reason) {
      setError(toFrontstageErrorCopy(reason, "这份故事委托我还没接稳，再点一次。"));
    } finally {
      setSubmitting(false);
    }
  }

  const token = forcedToken ?? queryToken ?? frontstageSession.token;
  const isCurrentSessionLoaded = activeSessionKey === loadedSessionKey;
  const currentAccountToken = isCurrentSessionLoaded ? accountToken : null;
  const visibleError = isCurrentSessionLoaded ? error : null;
  const roomHref = createdStory
    ? withSessionContext(createdStory.deep_link, {
        token,
        accountToken: currentAccountToken,
      })
    : null;
  const demoStoriesHref = withLaunchTracking(
    withSessionContext("/demo-stories", {
      token,
      accountToken: currentAccountToken,
    }),
    searchParams,
  );
  const faqHref = withLaunchTracking(
    withSessionContext("/faq", {
      token,
      accountToken: currentAccountToken,
    }),
    searchParams,
  );
  const betaGuideHref = withLaunchTracking(
    withSessionContext("/beta", {
      token,
      accountToken: currentAccountToken,
    }),
    searchParams,
  );
  const resolvedCapabilityTruth = resolveCapabilityTruthCopy(capabilityTruth);

  return (
    <main data-testid="story-intake-page" className="surface story-intake-surface">
      <section className="story-section story-intake-hero">
        <p className="story-section__eyebrow">故事立项</p>
        <h1>开新坑</h1>
        <p>把你现在能说清的一点感觉交给我，我会先摊开几套故事提案，再让你确认一份可长期连载的委托书，把第一轮结果先交到你手里。这里是后续深化，不是首次会话的硬门槛。</p>
        <ul className="tag-row">
          <li>先给感觉也可以</li>
          <li>默认私密</li>
          <li>先提案，后确认委托，再继续动作</li>
        </ul>
        {visibleError ? <p>{visibleError}</p> : null}
      </section>

      <section className="story-section" data-testid="story-intake-support-links">
        <div className="story-section__header">
          <p className="story-section__eyebrow">辅助理解层</p>
          <h2 className="story-section__title">如果你还想先看看</h2>
          <p className="story-section__copy">示范故事、使用说明和邀请入口都保留，但它们不再打断你拿第一轮结果的主链。</p>
        </div>
        <div className="story-cell-list story-cell-list--three action-grid">
          <Link className="story-cell story-cell--link" href={demoStoriesHref}>
            <strong>先看示范故事</strong>
            <span>如果你还不确定自己适合哪条题材，先看几条现成故事线再开坑。</span>
          </Link>
          <Link className="story-cell story-cell--link" href={faqHref}>
            <strong>看使用说明</strong>
            <span>把默认私密、作品标识和反馈路径先看清楚。</span>
          </Link>
          <Link className="story-cell story-cell--link" href={betaGuideHref}>
            <strong>邀请入口说明</strong>
            <span>随时回到辅助入口，确认当前开放方式和继续路径。</span>
          </Link>
        </div>
      </section>

      <section className="story-section">
        <div className="story-section__header">
          <p className="story-section__eyebrow">立项模式</p>
          <h2 className="story-section__title">你想怎么把这本故事交给我</h2>
          <p className="story-section__copy">先选一个交互起点，再慢慢把它说完整。</p>
        </div>
        <div className="proposal-grid story-mode-grid">
          {Object.entries(modeLabels).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              disabled={submitting}
              className="proposal-card proposal-card--mode"
              data-selected={selectedMode === mode}
              onClick={() => {
                setSelectedMode(mode as keyof typeof modeLabels);
              }}
            >
              <strong>{label}</strong>
              <span>{modeDescriptions[mode as keyof typeof modeLabels]}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="story-section">
        <div className="story-section__header">
          <p className="story-section__eyebrow">种子描述</p>
          <h2 className="story-section__title">先说一句你现在最有感觉的话</h2>
          <p className="story-section__copy">我先接住这一句，再把它展开成提案。</p>
        </div>
        {selectedMode ? <p>{modePrompts[selectedMode]}</p> : <p>选一个立项模式后，我会给你对应的描述引导。</p>}
        <label>
          开坑描述输入框
          <textarea
            aria-label="开坑描述输入框"
            value={briefText}
            disabled={submitting}
            onChange={(event) => {
              setBriefText(event.target.value);
            }}
          />
        </label>
        <button
          type="button"
          disabled={submitting || !currentAccountToken || !selectedMode || !briefText.trim()}
          onClick={() => void handleGenerateProposals()}
        >
          生成 3 条提案
        </button>
      </section>

      {isCurrentSessionLoaded && proposals.length > 0 ? (
        <section className="story-section" data-testid="story-intake-proposals">
          <div className="story-section__header">
            <p className="story-section__eyebrow">提案对比</p>
            <h2 className="story-section__title">提案对比</h2>
            <p className="story-section__copy">你先不用一次选对，只要先挑一个最接近现在情绪的方向，我再把它整理成委托书。</p>
          </div>
          <div className="proposal-grid">
            {resolvedCapabilityTruth ? (
              <article className="proposal-card story-capability-truth" data-testid="story-intake-capability-truth">
                <p className="proposal-card__eyebrow">能力真相</p>
                <h3>{resolvedCapabilityTruth.badge}</h3>
                <p>{resolvedCapabilityTruth.title}</p>
                <p>{resolvedCapabilityTruth.description}</p>
              </article>
            ) : null}
            {genreBrief ? (
              <article className="proposal-card" data-testid="story-intake-genre-brief">
                <p className="proposal-card__eyebrow">题材判断</p>
                <h3>{genreBrief.genre_lane}</h3>
                <p>{genreBrief.core_promise}</p>
                <ul className="tag-row">
                  <li>{genreBrief.target_reader_segment}</li>
                  <li>{genreBrief.relationship_promise}</li>
                  <li>{genreBrief.front_ten_chapter_promise}</li>
                </ul>
              </article>
            ) : null}
            {proposals.map((proposal) => (
              <article
                key={proposal.proposal_id}
                className="proposal-card"
                data-selected={selectedProposal?.proposal_id === proposal.proposal_id}
              >
                <p className="proposal-card__eyebrow">提案 {proposal.proposal_no}</p>
                <h3>{proposal.title}</h3>
                <p>{proposal.summary}</p>
                <ul className="tag-row">
                  <li>{selectedMode ? modeLabels[selectedMode] : "立项提案"}</li>
                  <li>{resolveProposalGenreLane(proposal, genreBrief)}</li>
                  <li>{resolveProposalPromise(proposal, genreBrief)}</li>
                  <li>可继续混搭微调</li>
                </ul>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setSelectedProposal(proposal);
                  }}
                >
                  拿《{proposal.title}》做委托底稿
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {isCurrentSessionLoaded && selectedProposal ? (
        <section className="story-section" data-testid="story-intake-commission-preview">
          <div className="story-section__header">
            <p className="story-section__eyebrow">故事委托书</p>
            <h2 className="story-section__title">先确认这份委托，再替你把故事立起来</h2>
            <p className="story-section__copy">把第一轮方向再收口一次，再决定是否正式立项。</p>
          </div>
          <div className="story-intake-commission">
            <strong>{selectedProposal.title}</strong>
            <p>{selectedProposal.summary}</p>
            <ul className="room-detail-list">
              <li>情绪方向：暧昧拉扯、慢热推进，先保住你的情绪密度。</li>
              <li>题材判断：{resolveProposalGenreLane(selectedProposal, genreBrief)}</li>
              <li>前十章抓手：{resolveProposalPromise(selectedProposal, genreBrief)}</li>
              <li>创作边界：沿用读者档案里的默认私密与雷点保护。</li>
              <li>落地方式：先把故事立起来，再从房间继续推进首章。</li>
            </ul>
            <ul className="tag-row">
              <li>默认私密</li>
              <li>可继续微调</li>
              <li>确认后立项</li>
            </ul>
          </div>
          <div className="story-intake-commission-actions">
            <button type="button" disabled={submitting} onClick={() => void handleAcceptProposal()}>
              确认这份委托书
            </button>
            <button
              type="button"
              disabled={submitting}
              className="secondary-button"
              onClick={() => {
                setSelectedProposal(null);
              }}
            >
              换个提案
            </button>
          </div>
        </section>
      ) : null}

      {isCurrentSessionLoaded && createdStory ? (
        <section className="story-section" data-testid="story-intake-created">
          <div className="story-section__header">
            <p className="story-section__eyebrow">立项完成</p>
            <h2 className="story-section__title">第一轮结果已就位</h2>
            <p className="story-section__copy">这一步不是终点，只是把方向接到了可以继续写下去的地方。</p>
          </div>
          <p>{resolveCommissionTitle(createdStory)}</p>
          <p>{createdStory.story_id}</p>
          <div className="room-detail-list">
            <p>
              <strong>委托摘要</strong>
            </p>
            <p>{resolveCommissionSummary(createdStory)}</p>
            <p>{resolveToneHint(createdStory)}</p>
            <p>{genreBrief?.front_ten_chapter_promise ?? createdStory.outline_bundle.front_ten_chapter_promise}</p>
          </div>
          <div className="room-detail-list">
            <p>
              <strong>核心设定</strong>
            </p>
            <ul className="tag-row">
              {createdStory.canon_seed.items.map((item) => (
                <li key={item.item_id}>{item.title}</li>
              ))}
            </ul>
          </div>
          <div className="room-detail-list">
            <p>
              <strong>章纲起盘</strong>
            </p>
            <ul className="room-detail-list">
              {createdStory.outline_bundle.chapters.map((chapter) => (
                <li key={chapter.chapter_no}>
                  {chapter.chapter_no}. {chapter.title} · {chapter.goal}
                </li>
              ))}
            </ul>
          </div>
          <section className="story-section" data-testid="story-intake-next-actions">
            <div className="story-section__header">
              <p className="story-section__eyebrow">继续动作</p>
              <h3 className="story-section__title">把这次结果接到后面的表面</h3>
            </div>
            <div className="story-cell-list story-cell-list--two action-grid">
              {roomHref ? (
                <Link className="story-cell story-cell--link" href={roomHref}>
                  <strong>去房间继续推进</strong>
                  <span>先把这份委托送回房间，看当前状态、故事入口和下一步动作。</span>
                </Link>
              ) : null}
              <Link
                className="story-cell story-cell--link"
                href={withSessionContext("/chat", {
                  token,
                  accountToken,
                })}
              >
                <strong>回私聊继续补一句</strong>
                <span>如果你还想补一个情绪钩子，可以立刻回到私聊继续说。</span>
              </Link>
            </div>
          </section>
        </section>
      ) : null}
    </main>
  );
}

const modeDescriptions = {
  has_setting: "我已经有角色、世界或主线，你帮我把结构接稳。",
  only_feeling: "我只有氛围和情绪，你先替我摊开几种方向。",
  repair_line: "我想修补某条意难平、续写或回收某个遗憾。",
  pitch_me: "你先来提案，用几种完全不同的故事气味打动我。",
} as const;

const modePrompts = {
  has_setting: "可以给我一句人物、设定或冲突，我先替你拉开骨架。",
  only_feeling: "比如“雨夜重逢、暧昧拉扯、不要太快在一起”。",
  repair_line: "告诉我你想修哪条线、哪种遗憾或哪段关系没写够。",
  pitch_me: "告诉我你今天最想读到的情绪，我来负责提案。",
} as const;

function readCommissionField(response: StoryProposalAcceptResponse, key: string) {
  const value = response.commission_brief[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function resolveCommissionTitle(response: StoryProposalAcceptResponse) {
  return readCommissionField(response, "title") ?? response.selected_proposal.title;
}

function resolveCommissionSummary(response: StoryProposalAcceptResponse) {
  return readCommissionField(response, "summary") ?? response.selected_proposal.summary;
}

function resolveToneHint(response: StoryProposalAcceptResponse) {
  return readCommissionField(response, "tone_hint") ?? "保持慢热拉扯，但别太快确认关系。";
}

function resolveProposalGenreLane(
  proposal: StoryProposalView,
  genreBrief: StoryGenreBriefView | null,
) {
  const value = proposal.payload.genre_lane;

  return typeof value === "string" && value.trim().length > 0
    ? value
    : (genreBrief?.genre_lane ?? "题材待判断");
}

function resolveProposalPromise(
  proposal: StoryProposalView,
  genreBrief: StoryGenreBriefView | null,
) {
  const value = proposal.payload.front_ten_chapter_promise;

  return typeof value === "string" && value.trim().length > 0
    ? value
    : (genreBrief?.front_ten_chapter_promise ?? "前十章抓手待补齐");
}
