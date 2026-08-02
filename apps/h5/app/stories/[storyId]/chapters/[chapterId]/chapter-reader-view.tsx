"use client";

import React from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import type { ChapterView } from "@erliu/shared-contracts";
import { createBranch } from "../../../../lib/branch-api";
import {
  acceptChapter,
  createChapterRevision,
  fetchChapter,
} from "../../../../lib/chapter-api";
import { useAccountSurfaceSession } from "../../../../lib/account-surface-session";
import { withSessionContext } from "../../../../lib/navigation";
import { withLaunchTracking } from "../../../../lib/launch-tracking";
import { buildReportHref } from "../../../../lib/reporting-case-links";
import {
  FRONTSTAGE_ENTRY_ERROR,
  FRONTSTAGE_LOADING,
  toFrontstageErrorCopy,
} from "../../../../lib/frontstage-copy";

const branchTypeCards = [
  {
    value: "alt_ending",
    title: "换个版本看看",
    description: "把这一步拐向另一边，看看主线会不会因此改命。",
    impact: "预计影响：结局与情绪走向",
  },
  {
    value: "alt_pov",
    title: "换一个视角重走",
    description: "让另一个人来讲这一段，把关系张力拉到前面。",
    impact: "预计影响：视角与关系信息",
  },
  {
    value: "repair_line",
    title: "修掉这条意难平",
    description: "保留核心设定，但修补你最想改的那条线。",
    impact: "预计影响：冲突节奏与支线方向",
  },
];

const branchRightsCards = [
  {
    value: "private_sandbox",
    title: "只留在私人沙盒",
    description: "适合高风险或还不想公开的试错版本。",
  },
  {
    value: "original_adaptation",
    title: "保留后续转译出口",
    description: "可继续打磨成可导出的原创转译版本。",
  },
  {
    value: "export_blocked",
    title: "先禁用导出",
    description: "允许收藏和对比，但明确阻断公开流程。",
  },
];

const branchStatusLabels: Record<string, string> = {
  branch_ready: "支线已经准备好",
  blocked: "这次分线先被拦住了",
};

export function ChapterReaderView() {
  const params = useParams<{ storyId: string; chapterId: string }>();
  const searchParams = useSearchParams();
  const frontstageSession = useAccountSurfaceSession(`/stories/${params.storyId}/chapters/${params.chapterId}`);
  const [session, setSession] = useState<{ token: string | null; account_token: string } | null>(null);
  const [chapter, setChapter] = useState<ChapterView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acceptState, setAcceptState] = useState<{
    status: string;
    continuityPatchSummary: string | null;
    acceptedObjectKey: string;
    readerReviewCopy: string | null;
  } | null>(null);
  const [revisionText, setRevisionText] = useState("");
  const [revisionResult, setRevisionResult] = useState<string | null>(null);
  const [revisionMeta, setRevisionMeta] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [branchGoal, setBranchGoal] = useState("如果这一章在这里走向另一条支线。");
  const [branchType, setBranchType] = useState("alt_ending");
  const [branchRightsMode, setBranchRightsMode] = useState<"private_sandbox" | "original_adaptation" | "export_blocked">(
    "private_sandbox",
  );
  const [branchResult, setBranchResult] = useState<{ branch_id: string; status: string; error_code?: string } | null>(
    null,
  );
  const [branchError, setBranchError] = useState<string | null>(null);
  useEffect(() => {
    if (!frontstageSession.accountToken) {
      setSession(null);
      if (frontstageSession.recoveryState !== "recovering") {
        setError(FRONTSTAGE_ENTRY_ERROR);
      }
      return;
    }

    setSession({
      token: frontstageSession.token,
      account_token: frontstageSession.accountToken,
    });
    setError(null);
  }, [frontstageSession.accountToken, frontstageSession.recoveryState, frontstageSession.token]);

  useEffect(() => {
    if (!params.storyId || !params.chapterId) {
      return;
    }

    fetchChapter(params.storyId, params.chapterId)
      .then((result) => {
        setChapter(result);
      })
      .catch((reason) => {
        setError(toFrontstageErrorCopy(reason, "这一章我还没顺利翻开。"));
      });
  }, [params.chapterId, params.storyId]);

  async function handleAccept() {
    if (!chapter || submitting) {
      return;
    }

    setSubmitting(true);

    try {
      const result = await acceptChapter(chapter.chapter_id);
      setAcceptState({
        status: result.status,
        continuityPatchSummary: result.continuity_patch_summary,
        acceptedObjectKey: result.accepted_object_key,
        readerReviewCopy: result.reader_review
          ? `建议${toReaderReviewRecommendationCopy(result.reader_review.acceptance_recommendation)}`
          : null,
      });
      setChapter({
        ...chapter,
        status: result.status,
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevision(revision_kind: "rewrite" | "light_edit") {
    if (!chapter || !revisionText.trim() || submitting) {
      return;
    }

    setSubmitting(true);

    try {
      const result = await createChapterRevision({
        chapter_id: chapter.chapter_id,
        revision_kind,
        instruction_text: revisionText,
        ...(revision_kind === "light_edit"
          ? {
              anchor_range: {
                start_paragraph: 2,
                end_paragraph: 2,
              },
            }
          : {}),
      });

      if (result.revision?.revised_text) {
        setRevisionResult(result.revision.revised_text);
      } else {
        setRevisionResult("已经排进改写队列。");
      }

      setRevisionMeta(
        `当前改稿集 ${result.revision_count} 版 · ${toRevisionTruthSourceCopy(result.truth_source_effect)}${
          result.reader_review ? ` · 建议${toReaderReviewRecommendationCopy(result.reader_review.acceptance_recommendation)}` : ""
        }`,
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateBranch() {
    if (!chapter || !branchGoal.trim() || submitting) {
      return;
    }

    setSubmitting(true);
    setBranchError(null);

    try {
      const result = await createBranch({
        story_id: params.storyId,
        anchor_ref: {
          chapter_id: chapter.chapter_id,
        },
        branch_type: branchType,
        goal: branchGoal.trim(),
        rights_mode: branchRightsMode,
        client_request_id: `branch-${Date.now()}`,
      });

      setBranchResult(result);
    } catch (reason) {
      setBranchError(toFrontstageErrorCopy(reason, "这条支线我还没分稳，再试一次。"));
    } finally {
      setSubmitting(false);
    }
  }

  const token = session?.token;
  const accountToken = session?.account_token ?? null;
  const branchHref = branchResult?.status === "branch_ready"
    ? `/stories/${params.storyId}/branches/${branchResult.branch_id}${
        frontstageSession.queryString ? `?${frontstageSession.queryString}` : ""
      }`
    : null;
  const roomHref = withSessionContext("/room", {
    token,
    accountToken,
  });
  const storyHubHref = withSessionContext(`/stories/${params.storyId}`, {
    token,
    accountToken,
  });
  const faqHref = withLaunchTracking(
    withSessionContext("/faq", {
      token,
      accountToken,
    }),
    searchParams,
  );
  const demoStoriesHref = withLaunchTracking(
    withSessionContext("/demo-stories", {
      token,
      accountToken,
    }),
    searchParams,
  );

  return (
    <main data-testid="chapter-reader-page" className="surface chapter-reader-surface">
      <section className="hero-card chapter-reader-hero">
        <p className="hero-card__eyebrow">沉浸阅读器</p>
        <h1>{chapter?.title ?? "正在翻开这一章……"}</h1>
        <p>先把这一章完整读完，再决定是接受、重写、轻改，还是从这里拉出另一条命运支线。</p>
        <div className="action-grid">
          <Link className="action-card" href={storyHubHref}>
            <strong>回故事中枢</strong>
            <span>先回到这本书的阅读 / 导出 / 最近动静中枢。</span>
          </Link>
          <Link className="action-card" href={roomHref}>
            <strong>回房间</strong>
            <span>去看房间里的状态、通知和当前连载入口。</span>
          </Link>
        </div>
        {error ? <p>{error}</p> : null}
        {session ? <p className="surface-meta">这一章已经和房间、书架接上了，你读完就能顺手继续。</p> : null}
      </section>

      {chapter ? (
        <>
          <section className="panel-card" data-testid="chapter-reader-support-links">
            <p className="panel-card__eyebrow">辅助理解层</p>
            <h2>需要时再回看规则与样例</h2>
            <p>使用说明、示范故事和举报入口都还在，但它们不再占住你继续推进这一章的主动作位。</p>
            <div className="action-grid">
              <Link className="action-card" href={faqHref}>
                <strong>看使用说明</strong>
                <span>默认私密、作品标识和反馈路径都能从这里快速回看。</span>
              </Link>
              <Link className="action-card" href={demoStoriesHref}>
                <strong>看示范故事</strong>
                <span>想切题材时，先看看别的故事线是怎么起势的。</span>
              </Link>
              <Link
                className="action-card"
                href={buildReportHref({
                  surface: "reader",
                  account_token: accountToken,
                  story_id: params.storyId,
                  target_type: "story_chapter",
                  target_id: params.chapterId,
                  target_label: chapter?.title ?? "当前章节",
                  token,
                })}
              >
                举报与求助
              </Link>
            </div>
          </section>

          <section className="panel-card chapter-reader-summary">
            <p className="panel-card__eyebrow">前情提要</p>
            <h2>先接住这一章的情绪入口</h2>
            <p>{chapter.summary}</p>
          </section>

          {chapter.scene_card_set ? (
            <section className="panel-card chapter-scene-card-set" data-testid="chapter-scene-card-set">
              <p className="panel-card__eyebrow">场景卡组</p>
              <h2>{chapter.scene_card_set.chapter_goal}</h2>
              <p>章末钩子：{chapter.scene_card_set.chapter_cliffhanger_goal}</p>
              <p>本章共 {chapter.scene_card_set.scene_count} 场，第一场先做：{chapter.scene_card_set.first_scene_goal}</p>
            </section>
          ) : null}

          {chapter.reader_review ? (
            <section className="panel-card chapter-reader-review" data-testid="chapter-reader-review">
              <p className="panel-card__eyebrow">读者回看</p>
              <h2>建议{toReaderReviewRecommendationCopy(chapter.reader_review.acceptance_recommendation)}</h2>
              <p>{chapter.reader_review.summary}</p>
              {chapter.reader_review.rewrite_targets.length > 0 ? (
                <p>优先补位：{chapter.reader_review.rewrite_targets.join(" / ")}</p>
              ) : null}
            </section>
          ) : null}

          <article className="panel-card chapter-reader-body" data-testid="chapter-reader-body">
            <p className="panel-card__eyebrow">这一章正文</p>
            {splitBodyText(chapter.body_text).map((paragraph, index) => (
              <p key={`${chapter.chapter_id}-${index}`}>{paragraph}</p>
            ))}
          </article>

          <section className="panel-card chapter-reader-actions">
            <p className="panel-card__eyebrow">读完想怎么动它</p>
            <h2>先用轻量动作改稿，不把你拉进重编辑器</h2>
            <ul className="chip-list" data-testid="chapter-revision-presets">
              {revisionPresets.map((preset) => (
                <li key={preset.label}>
                  <button
                    type="button"
                    className="chip-button"
                    disabled={submitting}
                    onClick={() => {
                      setRevisionText(preset.instruction);
                    }}
                  >
                    {preset.label}
                  </button>
                </li>
              ))}
            </ul>
            <label>
              改稿指令输入框
              <textarea
                aria-label="改稿指令输入框"
                value={revisionText}
                disabled={submitting}
                onChange={(event) => {
                  setRevisionText(event.target.value);
                }}
              />
            </label>
            <div className="chapter-reader-action-row">
              <button type="button" disabled={submitting || !chapter} onClick={() => void handleAccept()}>
                接受这一章
              </button>
              <button
                type="button"
                disabled={submitting || !chapter || !revisionText.trim()}
                onClick={() => void handleRevision("rewrite")}
              >
                整章重写
              </button>
              <button
                type="button"
                disabled={submitting || !chapter || !revisionText.trim()}
                onClick={() => void handleRevision("light_edit")}
              >
                轻改这一段
              </button>
            </div>
          </section>

          <section className="panel-card chapter-reader-branch" data-testid="chapter-branch-form">
            <p className="panel-card__eyebrow">分支宇宙</p>
            <h2>换个版本看看</h2>
            <p>先确认当前锚点，再选择分支类型和权利模式，让这条支线像导演决定镜头一样可解释、可回看。</p>
            <div className="chapter-branch-layout">
              <article className="chapter-branch-panel">
                <strong>当前锚点</strong>
                <p>
                  正从《{chapter.title}》这一章拉出支线。当前先以章节级锚点承接，后续再扩到段落和场景。
                </p>
                <label>
                  分支目标
                  <textarea
                    aria-label="分支目标"
                    value={branchGoal}
                    disabled={submitting}
                    onChange={(event) => {
                      setBranchGoal(event.target.value);
                    }}
                  />
                </label>
              </article>

              <article className="chapter-branch-panel">
                <strong>分支类型</strong>
                <div className="chapter-branch-choice-grid">
                  {branchTypeCards.map((item) => (
                    <button
                      key={item.value}
                      className="chapter-branch-choice"
                      data-selected={branchType === item.value}
                      type="button"
                      disabled={submitting}
                      onClick={() => {
                        setBranchType(item.value);
                      }}
                    >
                      <span>{item.title}</span>
                      <strong>{item.description}</strong>
                      <p>{item.impact}</p>
                    </button>
                  ))}
                </div>
              </article>

              <article className="chapter-branch-panel">
                <strong>权利模式</strong>
                <div className="chapter-branch-choice-grid">
                  {branchRightsCards.map((item) => (
                    <button
                      key={item.value}
                      className="chapter-branch-choice"
                      data-selected={branchRightsMode === item.value}
                      type="button"
                      disabled={submitting}
                      onClick={() => {
                        setBranchRightsMode(
                          item.value as "private_sandbox" | "original_adaptation" | "export_blocked",
                        );
                      }}
                    >
                      <span>{item.title}</span>
                      <strong>{item.description}</strong>
                    </button>
                  ))}
                </div>
              </article>
            </div>
            <button
              type="button"
              disabled={submitting || !chapter || !branchGoal.trim()}
              onClick={() => void handleCreateBranch()}
            >
              从这里分出另一条命运
            </button>
            {branchError ? <p data-testid="chapter-branch-error">{branchError}</p> : null}
            {branchResult ? (
              <div className="chapter-branch-result" data-testid="chapter-branch-result">
                <p>分支状态：{branchStatusLabels[branchResult.status] ?? "这条支线还在整理。"}</p>
                <p>
                  {branchResult.status === "branch_ready"
                    ? "支线已经从当前章节拉出，现在可以去看差异摘要和合并建议。"
                    : branchResult.status === "blocked"
                      ? "当前分支额度已用尽，需先清理或升级会员后再继续分线。"
                      : "当前锚点不可用，请换一个有效章节后再试。"}
                </p>
                {branchHref ? <Link href={branchHref}>查看分支详情</Link> : null}
              </div>
            ) : null}
          </section>

          {acceptState ? (
            <section data-testid="chapter-accept-state">
              <p>这一章已经先收进主线。</p>
              {acceptState.continuityPatchSummary ? <p>{acceptState.continuityPatchSummary}</p> : null}
              {acceptState.readerReviewCopy ? <p>{acceptState.readerReviewCopy}</p> : null}
            </section>
          ) : null}
          {revisionResult ? <section data-testid="chapter-revision-result">{revisionResult}</section> : null}
          {revisionMeta ? <section data-testid="chapter-revision-meta">{revisionMeta}</section> : null}
        </>
      ) : (
        <section className="panel-card">
          <p>{FRONTSTAGE_LOADING.chapter}</p>
        </section>
      )}
    </main>
  );
}

const revisionPresets = [
  {
    label: "把暧昧拉长一点",
    instruction: "把这一段的暧昧拉长一点，别这么快把话说透。",
  },
  {
    label: "让对话更克制",
    instruction: "把这段对话写得更克制一点，情绪留在台词缝里。",
  },
  {
    label: "把冲突再压一压",
    instruction: "先别把冲突顶满，把情绪压住一点，留后劲。",
  },
] as const;

function splitBodyText(bodyText: string) {
  return bodyText
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function toRevisionTruthSourceCopy(effect: "draft_only" | "revision_pending") {
  return effect === "draft_only" ? "只影响草稿" : "等待 rewrite 回写";
}

function toReaderReviewRecommendationCopy(
  recommendation: "accept" | "rewrite" | "tweak" | "continuity_patch",
) {
  switch (recommendation) {
    case "accept":
      return "接受";
    case "rewrite":
      return "重写";
    case "continuity_patch":
      return "补上前后照应";
    default:
      return "轻改";
  }
}
