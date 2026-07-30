"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { StoryCenterDetailResponse } from "@erliu/shared-contracts";
import { useAccountSurfaceSession } from "../../lib/account-surface-session";
import { withH5Context } from "../../lib/navigation";
import { FRONTSTAGE_ACCOUNT_ERROR, FRONTSTAGE_LOADING, toFrontstageErrorCopy, toWorkspaceStatusLabel } from "../../lib/frontstage-copy";
import { fetchStoryCenterDetail } from "../../lib/story-center-api";

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

function toRiskLabel(value: StoryCenterDetailResponse["export_capability"]["latest_risk_result"]) {
  switch (value) {
    case "pass":
      return "当前可继续";
    case "warn":
      return "先确认风险";
    case "block":
      return "当前被阻断";
    default:
      return "尚未检查";
  }
}

function toExportStatusLabel(value: NonNullable<StoryCenterDetailResponse["latest_export"]>["status"]) {
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

export function StoryDetailView() {
  const params = useParams<{ storyId: string }>();
  const session = useAccountSurfaceSession(`/stories/${params.storyId}`);
  const [story, setStory] = useState<StoryCenterDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session.accountToken || !params.storyId) {
      setStory(null);
      if (session.recoveryState !== "recovering") {
        setError(FRONTSTAGE_ACCOUNT_ERROR);
      }
      return;
    }

    setError(null);
    fetchStoryCenterDetail({
      account_token: session.accountToken,
      story_id: params.storyId,
    })
      .then((result) => {
        setStory(result);
      })
      .catch((reason) => {
        setStory(null);
        setError(toFrontstageErrorCopy(reason, "这本书的故事中枢暂时还没整理好。"));
      });
  }, [params.storyId, session.accountToken, session.recoveryState]);

  return (
    <main className="surface story-hub-surface" data-testid="story-detail-page">
      <section className="page-intro story-hub-hero">
        <p className="page-intro__eyebrow">故事中枢</p>
        <h1 className="page-intro__title">{story?.title ?? "正在整理这本书的中枢……"}</h1>
        <p className="page-intro__lede">故事中枢负责承接书架后的第二步：先看这本书现在在哪一章、导出准备到了哪一步、最近有哪些真正相关的动静，再决定你要读、导还是回房间。</p>
        {error ? <p className="story-microcopy story-microcopy--danger">{error}</p> : null}
        {!story && !error ? <p className="story-microcopy">{FRONTSTAGE_LOADING.chapter}</p> : null}
      </section>

      {story ? (
        <>
          <section className="story-cell-list story-cell-list--three story-hub-summary">
            <article className="story-cell" data-testid="story-hub-reading-card">
              <p className="story-section__eyebrow">阅读入口</p>
              <strong>{story.current_chapter ? `第 ${story.current_chapter.chapter_no} 章 · ${story.current_chapter.title}` : "还没有亮起当前章节"}</strong>
              <p>{story.current_chapter?.summary ?? `${story.continuation_next_step ?? "这本书暂时还没有可直接续读的章节，先回房间继续推进。"}。`}</p>
              <Link
                href={withH5Context(
                  story.current_chapter?.route ?? `/stories/${story.story_id}/exports`,
                  session.contextSearchParams,
                )}
              >
                {story.current_chapter ? "继续阅读这本书" : "先看作品权利服务"}
              </Link>
            </article>

            <article className="story-cell" data-testid="story-hub-exports-card">
              <p className="story-section__eyebrow">作品权利服务</p>
              <strong>{toRiskLabel(story.export_capability.latest_risk_result)}</strong>
              <p>
                {story.latest_export
                  ? `最近一次导出发生在 ${formatTimeLabel(story.latest_export.created_at)}，当前进展：${toExportStatusLabel(story.latest_export.status)}。`
                  : "这本书还没有发起过导出；从这里开始整理风险、标识和证据包。"}
              </p>
              <Link href={withH5Context(`/stories/${story.story_id}/exports`, session.contextSearchParams)}>打开作品权利服务</Link>
            </article>

            <article className="story-cell" data-testid="story-hub-continuity-card">
              <p className="story-section__eyebrow">继续路线</p>
              <strong>{toWorkspaceStatusLabel(story.workspace_status)}</strong>
              <p>
                书架之后的固定路线就是先回故事中枢，再进入阅读、导出或回房间。
                {story.continuation_next_step ? ` 现在最自然的下一步是：${story.continuation_next_step}。` : ""}
              </p>
              <div className="story-shell-links">
                <Link className="story-cell story-cell--link" href={withH5Context("/stories", session.contextSearchParams)}>
                  <strong>回书架</strong>
                  <p>回到全部故事列表。</p>
                </Link>
                <Link
                  className="story-cell story-cell--link"
                  href={withH5Context(`/room?storyId=${encodeURIComponent(story.story_id)}`, session.contextSearchParams)}
                >
                  <strong>回房间</strong>
                  <p>从房间里的书桌、邮箱和档案柜继续接这本书。</p>
                </Link>
              </div>
            </article>
          </section>

          <section className="story-section story-hub-detail-grid">
            <div className="story-section__header">
              <p className="story-section__eyebrow">这本书现在的状态</p>
              <h2 className="story-section__title">把最近的阅读、导出和提醒收在同一个中枢里</h2>
              <p className="story-section__copy">如果书架只是列表，用户还是不知道点下一步。中枢的职责就是把“继续读 / 去导出 / 看提醒”收进同一层。</p>
            </div>
            <div className="story-cell-list story-cell-list--two">
              <article className="story-cell" data-testid="story-hub-metadata-card">
                <p className="story-section__eyebrow">故事档案</p>
                <strong>{story.title}</strong>
                <p>最近更新于 {formatTimeLabel(story.updated_at)}，当前处于“{toWorkspaceStatusLabel(story.workspace_status)}”。</p>
                <ul className="tag-row">
                  {story.keywords.map((keyword) => (
                    <li key={keyword}>{keyword}</li>
                  ))}
                </ul>
              </article>

              <article className="story-cell story-hub-notifications-card" data-testid="story-hub-notifications-card">
                <p className="story-section__eyebrow">最近动静</p>
                {story.recent_notifications.length ? (
                  <ul className="story-center-notification-list">
                    {story.recent_notifications.map((item) => (
                      <li key={item.notification_id}>
                        <Link href={withH5Context(item.target_route, session.contextSearchParams)}>
                          <strong>{item.title}</strong>
                          <p>{item.body}</p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>这本书最近没有新的房间邮箱提醒，所以你可以直接从阅读或作品权利服务继续。</p>
                )}
                <Link href={withH5Context(`/notifications?story_id=${encodeURIComponent(story.story_id)}`, session.contextSearchParams)}>
                  打开房间邮箱
                </Link>
              </article>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
