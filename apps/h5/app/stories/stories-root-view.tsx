"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { withH5Context } from "../lib/navigation";
import type { StoryCenterListResponse } from "@erliu/shared-contracts";
import { useAccountSurfaceSession } from "../lib/account-surface-session";
import { FRONTSTAGE_ACCOUNT_ERROR, FRONTSTAGE_LOADING, toFrontstageErrorCopy, toWorkspaceStatusLabel } from "../lib/frontstage-copy";
import { fetchStoryCenter } from "../lib/story-center-api";

function formatTimeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function toExportPurposeLabel(value: string) {
  switch (value) {
    case "personal_reading":
      return "自己阅读";
    case "sharing":
      return "分享";
    case "submission":
      return "投稿";
    case "commercial_evaluation":
      return "商业评估";
    case "registration_assist":
      return "登记辅助";
    default:
      return "作品权利服务";
  }
}

function toExportStatusLabel(value: NonNullable<StoryCenterListResponse["items"][number]["latest_export"]>["status"]) {
  switch (value) {
    case "blocked":
      return "已阻断";
    case "queued":
      return "已进入队列";
    case "generating":
      return "正在处理";
    case "partial_failed":
      return "部分成功";
    case "succeeded":
      return "已完成";
    default:
      return "处理中";
  }
}

export function StoriesRootView() {
  const session = useAccountSurfaceSession("/stories");
  const [stories, setStories] = useState<StoryCenterListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session.accountToken) {
      setStories(null);
      if (session.recoveryState !== "recovering") {
        setError(FRONTSTAGE_ACCOUNT_ERROR);
      }
      return;
    }

    setError(null);
    fetchStoryCenter(session.accountToken)
      .then((result) => {
        setStories(result);
      })
      .catch((reason) => {
        setStories(null);
        setError(toFrontstageErrorCopy(reason, "这排书暂时还没整理出来。"));
      });
  }, [session.accountToken, session.recoveryState]);

  const featuredStory =
    stories?.items.find((item) => item.story_id === stories.active_story_id) ?? stories?.items[0] ?? null;

  return (
    <main className="surface story-center-surface" data-testid="stories-root-page">
      <section className="page-intro story-center-hero">
        <p className="page-intro__eyebrow">书架 / 故事中心</p>
        <h1 className="page-intro__title">先回到正在继续的那本书里</h1>
        <p className="page-intro__lede">书架不再只是一个占位入口。这里应该先告诉你哪本书还在继续、从哪里读、从哪里整理导出，而不是把你重新丢回空列表。</p>
        {error ? <p className="story-microcopy story-microcopy--danger">{error}</p> : null}
        {!stories && !error ? <p className="story-microcopy">{FRONTSTAGE_LOADING.assets}</p> : null}
      </section>

      <section className="story-cell story-center-feature" data-testid="story-center-featured">
        <p className="story-section__eyebrow">最近该先接的故事</p>
        {featuredStory ? (
          <>
            <strong>{featuredStory.title}</strong>
            <p>
              这本书现在处在“{toWorkspaceStatusLabel(featuredStory.workspace_status)}”这一步。
              {featuredStory.current_chapter
                ? ` 最近可直接续上第 ${featuredStory.current_chapter.chapter_no} 章。`
                : ` ${featuredStory.continuation_next_step ?? "先回故事中枢。"}。`}
            </p>
            <ul className="tag-row">
              <li>最近更新：{formatTimeLabel(featuredStory.updated_at)}</li>
              {featuredStory.latest_export ? (
                <li>
                  最近导出：{toExportPurposeLabel(featuredStory.latest_export.export_purpose)} ·{" "}
                  {toExportStatusLabel(featuredStory.latest_export.status)}
                </li>
              ) : null}
            </ul>
            <div className="story-shell-links">
              <Link className="story-cell story-cell--link" href={withH5Context(`/stories/${featuredStory.story_id}`, session.contextSearchParams)}>
                <strong>打开故事中枢</strong>
                <p>先看这本书现在的阅读、导出和最近动静。</p>
              </Link>
              {featuredStory.current_chapter ? (
                <Link
                  className="story-cell story-cell--link"
                  href={withH5Context(featuredStory.current_chapter.route, session.contextSearchParams)}
                >
                  <strong>继续阅读</strong>
                  <p>
                    从《{featuredStory.current_chapter.title}》接着读，而不是重新在书架里找入口。
                  </p>
                </Link>
              ) : (
                <Link className="story-cell story-cell--link" href={withH5Context(`/stories/${featuredStory.story_id}`, session.contextSearchParams)}>
                  <strong>先回故事中枢</strong>
                  <p>这本书暂时还没有亮起章节，先去中枢看它卡在哪一步。</p>
                </Link>
              )}
            </div>
          </>
        ) : (
          <>
            <strong>书架还没有摆上第一本故事</strong>
            <p>等你开出第一本书，这里会优先把“最近该继续哪一本”明确地摆在最前面。</p>
          </>
        )}
      </section>

      <section className="story-section story-center-list">
        <div className="story-section__header">
          <p className="story-section__eyebrow">继续中的故事</p>
          <h2 className="story-section__title">每一本都应该有清楚的第二落点</h2>
          <p className="story-section__copy">从书架进去以后，下一步应该是故事中枢，再进入阅读或作品权利服务，而不是把导出能力继续藏在深路由里。</p>
        </div>
        {stories?.items.length ? (
          <div className="story-cell-list story-center-grid">
            {stories.items.map((story) => (
              <article className="story-cell story-center-card" key={story.story_id} data-testid={`story-center-card-${story.story_id}`}>
                <p className="story-section__eyebrow">{toWorkspaceStatusLabel(story.workspace_status)}</p>
                <strong>{story.title}</strong>
                <p>
                  {story.current_chapter
                    ? `可直接续上第 ${story.current_chapter.chapter_no} 章《${story.current_chapter.title}》。`
                    : `${story.continuation_next_step ?? "先回故事中枢"}。`}
                </p>
                <ul className="tag-row">
                  {story.keywords.slice(0, 3).map((keyword) => (
                    <li key={keyword}>{keyword}</li>
                  ))}
                  <li>更新于 {formatTimeLabel(story.updated_at)}</li>
                </ul>
                <div className="story-shell-links">
                  <Link className="story-cell story-cell--link" href={withH5Context(`/stories/${story.story_id}`, session.contextSearchParams)}>
                    <strong>打开故事中枢</strong>
                    <p>先看阅读、导出和最近动静都落在哪。</p>
                  </Link>
                  {story.current_chapter ? (
                    <Link className="story-cell story-cell--link" href={withH5Context(story.current_chapter.route, session.contextSearchParams)}>
                      <strong>继续阅读</strong>
                      <p>{story.current_chapter.summary}</p>
                    </Link>
                  ) : null}
                  <Link className="story-cell story-cell--link" href={withH5Context(`/stories/${story.story_id}/exports`, session.contextSearchParams)}>
                    <strong>去作品权利服务</strong>
                    <p>
                      {story.latest_export
                        ? `最近一次是${toExportPurposeLabel(story.latest_export.export_purpose)}，当前进展：${toExportStatusLabel(story.latest_export.status)}。`
                        : "从这里主动整理导出、风险检查和证据包。"}
                    </p>
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <section className="story-cell" data-testid="story-center-empty-state">
            <strong>还没有可以继续的故事</strong>
            <p>你可以直接开新坑，或者先回房间看小韩现在适合怎么接你。</p>
          </section>
        )}
      </section>

      <section className="story-cell-list story-cell-list--two">
        <Link className="action-card" href={withH5Context("/stories/new", session.contextSearchParams)}>
          <strong>开新坑</strong>
          <span>把一个新感觉交给小韩，先听他怎么起势。</span>
        </Link>
        <Link className="action-card" href={withH5Context("/room", session.contextSearchParams)}>
          <strong>回房间</strong>
          <span>回到房间，从书桌、邮箱和档案柜继续接这本书。</span>
        </Link>
      </section>
    </main>
  );
}
