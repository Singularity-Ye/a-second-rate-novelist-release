"use client";

import Link from "next/link";
import React from "react";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { RoomHotspotCode, RoomOverviewResponse } from "@erliu/shared-contracts";
import { emitTelemetryEvent } from "@erliu/telemetry";
import { fetchRoomOverview } from "../lib/room-api";
import { useAccountSurfaceSession } from "../lib/account-surface-session";
import { withSessionContext } from "../lib/navigation";
import { buildFeedbackHref } from "../lib/beta-ops-links";
import { buildReportHref } from "../lib/reporting-case-links";
import {
  FRONTSTAGE_ENTRY_ERROR,
  FRONTSTAGE_LOADING,
  toFrontstageErrorCopy,
  toPersonaStateLabel,
  toReasonCodeLabel,
} from "../lib/frontstage-copy";
import { GuestEntryPanel } from "../guest-entry-panel";

function toFallbackTarget(value: string | null): RoomHotspotCode | null {
  if (
    value === "desk" ||
    value === "computer" ||
    value === "bookshelf" ||
    value === "archive_profile" ||
    value === "sticky_wall" ||
    value === "mailbox"
  ) {
    return value;
  }

  return null;
}

const hotspotOrder: RoomHotspotCode[] = [
  "desk",
  "computer",
  "bookshelf",
  "archive_profile",
  "sticky_wall",
  "mailbox",
];

function getHotspotWeight(code: RoomHotspotCode) {
  switch (code) {
    case "desk":
    case "computer":
    case "bookshelf":
      return "primary";
    default:
      return "secondary";
  }
}

function getHotspotMeta(code: RoomHotspotCode) {
  switch (code) {
    case "desk":
      return { eyebrow: "书桌" };
    case "computer":
      return { eyebrow: "电脑" };
    case "bookshelf":
      return { eyebrow: "书架" };
    case "archive_profile":
      return { eyebrow: "档案柜" };
    case "sticky_wall":
      return { eyebrow: "便签墙" };
    case "mailbox":
      return { eyebrow: "邮箱" };
  }
}

function getHotspotStateLabel(state: RoomOverviewResponse["objects"][number]["state"]) {
  switch (state) {
    case "attention":
      return "需要处理";
    case "fallback":
      return "先去补齐";
    case "disabled":
      return "暂未开放";
    default:
      return "可进入";
  }
}

function getHotspotCaption(item: RoomOverviewResponse["objects"][number]) {
  switch (item.hotspot_code) {
    case "desk":
      return "去故事中枢";
    case "computer":
      return item.target_route.includes("/chapters/") ? "去当前章节" : "回故事中枢";
    case "bookshelf":
      return "去资料库";
    case "archive_profile":
      return "去我的 / 最近记下";
    case "sticky_wall":
      return item.state === "disabled" ? "留给伏笔和待补" : "回故事中枢";
    case "mailbox":
      if (item.target_route.includes("/notifications")) {
        return "去通知中心";
      }
      if (item.target_route.includes("/chapters/")) {
        return "继续当前章节";
      }
      return item.target_route === "/stories" ? "去书桌看看" : "回故事中枢";
  }
}

function getSceneHeadline(overview: RoomOverviewResponse) {
  if (overview.current_story_card?.chapter_deep_link) {
    return `他正在主导《${overview.current_story_card.title}》的下一章`;
  }

  if (overview.current_story_card) {
    return `他正在把《${overview.current_story_card.title}》往下写`;
  }

  if (overview.recent_notifications.length > 0) {
    return "他先把房间收成待命状态，等新的故事接上";
  }

  return "房间已经收好，等下一段故事进来";
}

function getSceneLede(overview: RoomOverviewResponse) {
  if (overview.current_story_card?.chapter_deep_link) {
    return "电脑和书桌都还亮着，先从最顺手的那一处继续，不用先背房间地图。";
  }

  if (overview.current_story_card) {
    return "故事还挂在这个房间里，先看哪一处还亮着，再决定从章节还是故事中枢继续。";
  }

  return "现在还没有活跃连载压在桌上，所以房间先把下一步留在书桌上。";
}

function getMailboxEmptyCopy(overview: RoomOverviewResponse) {
  if (overview.current_story_card?.chapter_deep_link) {
    return "这本书最近还没有新的房间回信。先去当前章节或故事中枢继续，新的章节、导出和风险结果会先落在这里。";
  }

  if (overview.current_story_card) {
    return "这本书最近还没有新的房间回信。先回故事中枢把第一章写出来或把下一步接上，新的章节、导出和风险结果会先落在这里。";
  }

  return "房间邮箱暂时还是空的。先去书桌把要写的那本摊开，新的章节、导出和风险结果会先落在这里。";
}

function getMailboxAction(overview: RoomOverviewResponse) {
  if (overview.recent_notifications.length > 0) {
    return {
      href: overview.current_story_card ? `/notifications?story_id=${overview.current_story_card.story_id}` : "/notifications",
      label: "打开通知中心",
    };
  }

  if (overview.current_story_card?.chapter_deep_link) {
    return {
      href: overview.current_story_card.chapter_deep_link,
      label: "继续当前章节",
    };
  }

  if (overview.current_story_card) {
    return {
      href: `/stories/${overview.current_story_card.story_id}`,
      label: "回故事中枢",
    };
  }

  return {
    href: "/stories",
    label: "去书桌看看",
  };
}

export function RoomSessionView({ token: forcedToken }: { token?: string } = {}) {
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const frontstageSession = useAccountSurfaceSession("/room");
  const [session, setSession] = useState<{ token: string | null; account_token: string } | null>(null);
  const [overview, setOverview] = useState<RoomOverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!frontstageSession.accountToken) {
      setSession(null);
      setOverview(null);
      setError(null);
      return;
    }

    setSession({
      token: forcedToken ?? frontstageSession.token,
      account_token: frontstageSession.accountToken,
    });
  }, [forcedToken, frontstageSession.accountToken, frontstageSession.token]);

  useEffect(() => {
    const nextSearchParams = new URLSearchParams(searchParamsString);
    const storyId = nextSearchParams.get("storyId");
    const fallbackTarget = toFallbackTarget(nextSearchParams.get("fallback"));

    if (!session?.account_token) {
      setOverview(null);
      if (frontstageSession.recoveryState === "recovery_failed") {
        setError(FRONTSTAGE_ENTRY_ERROR);
      }
      return;
    }

    setError(null);
    setOverview(null);

    fetchRoomOverview({
      account_token: session.account_token,
      ...(storyId ? { story_id: storyId } : {}),
      ...(fallbackTarget ? { fallback_target: fallbackTarget } : {}),
    })
      .then((snapshot) => {
        setOverview(snapshot);
      })
      .catch((reason) => {
        setError(toFrontstageErrorCopy(reason, FRONTSTAGE_ENTRY_ERROR));
      });
  }, [frontstageSession.recoveryState, searchParamsString, session?.account_token]);

  const hasSession = Boolean(session?.account_token);
  const showGuestEntry = !hasSession && frontstageSession.recoveryState === "missing_context";
  const token = session?.token;
  const visiblePendingActions =
    overview?.pending_actions
      .filter((item) => item.action_code !== "open_persona_panel")
      .filter((item) => item.route !== overview.fallback_context?.target_route) ?? [];
  const orderedObjects = overview
    ? [...overview.objects].sort(
        (left, right) => hotspotOrder.indexOf(left.hotspot_code) - hotspotOrder.indexOf(right.hotspot_code),
      )
    : [];
  const sceneHeadline = overview ? getSceneHeadline(overview) : null;
  const sceneLede = overview ? getSceneLede(overview) : null;
  const mailboxAction = overview ? getMailboxAction(overview) : null;
  const primaryPendingAction = visiblePendingActions[0] ?? null;
  const heroPrimaryAction = overview
    ? primaryPendingAction
      ? {
          href: primaryPendingAction.route,
          label: primaryPendingAction.label,
        }
      : overview.current_story_card?.chapter_deep_link
        ? {
            href: overview.current_story_card.chapter_deep_link,
            label: "继续当前章节",
          }
        : overview.current_story_card
          ? {
              href: `/stories/${overview.current_story_card.story_id}`,
              label: "回故事中枢",
            }
          : {
              href: "/stories",
              label: "去书桌看看",
            }
    : null;
  return (
    <main className="surface room-surface room-surface--stage" data-testid="room-page">
      {showGuestEntry ? (
        <GuestEntryPanel
          dataTestId="room-first-visit-panel"
          description="第一次来先从房间进门，这里会先接住你，再带你去书架和我的继续往下走。"
          title="先从房间开始"
        />
      ) : null}

      {!showGuestEntry ? (
        <section className="page-intro room-hero">
          <p className="page-intro__eyebrow">作家房间</p>
          <h1 className="page-intro__title">{sceneHeadline}</h1>
          <p className="page-intro__lede">{sceneLede}</p>
          {overview && heroPrimaryAction ? (
            <div className="page-intro__actions">
              <Link
                className="primary-cta"
                href={withSessionContext(heroPrimaryAction.href, {
                  token,
                  accountToken: session?.account_token,
                })}
              >
                {heroPrimaryAction.label}
              </Link>
            </div>
          ) : null}
          {error ? <p className="story-microcopy story-microcopy--danger">{error}</p> : null}
          {!error && !overview ? <p className="story-microcopy">{FRONTSTAGE_LOADING.room}</p> : null}
        </section>
      ) : null}

      {hasSession && overview ? (
        <div className="room-stage-layout">
          <div className="room-stage-main">
            <section className="room-object-panel story-cell" data-testid="room-object-panel">
              <div className="story-section__header">
                <p className="story-section__eyebrow">先往亮着的地方走</p>
                <h2 className="story-section__title">不用先背房间地图</h2>
                <p className="story-section__copy">
                  {overview.current_story_card
                    ? "故事还挂在这个房间里，直接点你现在最想碰的一处。别的门我先收在后面。"
                    : "房间先把能继续的一处亮给你，别的入口先都退到后面。"}
                </p>
              </div>
              <section className="room-object-grid room-scene" data-testid="room-objects">
                {orderedObjects.map((item) => {
                  const meta = getHotspotMeta(item.hotspot_code);
                  const labelId = `room-object-${item.hotspot_code}-label`;
                  const descriptionId = `room-object-${item.hotspot_code}-description`;
                  const stateId = `room-object-${item.hotspot_code}-state`;

                  return (
                    <article
                      key={item.hotspot_code}
                      className="room-object-card"
                      data-hotspot={item.hotspot_code}
                      data-state={item.state}
                      data-weight={getHotspotWeight(item.hotspot_code)}
                      data-testid={`room-object-${item.hotspot_code}`}
                    >
                      <p className="room-object-card__eyebrow">{meta.eyebrow}</p>
                      {item.state === "disabled" ? (
                        <div className="room-object-card__body">
                          <strong id={labelId}>{item.label}</strong>
                          <small>{getHotspotCaption(item)}</small>
                          <p id={descriptionId}>{item.description}</p>
                          <span id={stateId}>{getHotspotStateLabel(item.state)}</span>
                        </div>
                      ) : (
                        <Link
                          aria-describedby={`${descriptionId} ${stateId}`}
                          aria-labelledby={labelId}
                          className="room-object-card__body"
                          href={withSessionContext(item.target_route, {
                            token,
                            accountToken: session?.account_token,
                          })}
                          onClick={() => {
                            if (!session) {
                              return;
                            }

                            void emitTelemetryEvent({
                              account_token: session.account_token,
                              event_name: "room_hotspot_clicked",
                              payload: {
                                hotspot_code: item.hotspot_code,
                                entry_story_id: item.entry_story_id,
                              },
                            });
                          }}
                        >
                          <strong id={labelId}>{item.label}</strong>
                          <small>{getHotspotCaption(item)}</small>
                          <p id={descriptionId}>{item.description}</p>
                          <span id={stateId}>{getHotspotStateLabel(item.state)}</span>
                        </Link>
                      )}
                    </article>
                  );
                })}
              </section>
            </section>

            {overview.current_story_card ? (
              <section className="room-story-card story-cell" data-testid="room-current-story-card">
                <p className="story-section__eyebrow">当前连载</p>
                <h2>{overview.current_story_card.title}</h2>
                <p>先顺着这本书继续。章节、导出和最近动静都已经收回故事中枢，不用在房间里来回找。</p>
                <div className="room-inline-links">
                  <Link
                    href={withSessionContext(`/stories/${overview.current_story_card.story_id}`, {
                      token,
                      accountToken: session?.account_token,
                    })}
                  >
                    <strong>打开故事中枢</strong>
                    <p>把章节、导出和最近动静收回同一个地方。</p>
                  </Link>
                </div>
              </section>
            ) : (
              <section className="room-story-card story-cell" data-testid="room-current-story-card-empty">
                <p className="story-section__eyebrow">当前连载</p>
                <strong>桌面先空出来了</strong>
                <p>当前还没有活跃故事，所以房间把书桌留成一个可以重新开场的位置。</p>
                <Link href={withSessionContext("/stories", { token, accountToken: session?.account_token })}>
                  去书桌看看
                </Link>
              </section>
            )}

            <details className="room-secondary-panel story-cell" data-testid="room-secondary-paths">
              <summary>回信、最近记下和更多入口</summary>
              <div className="room-secondary-stack">
                <section className="room-persona-panel room-secondary-item" data-testid="room-persona-state">
                  <p className="story-section__eyebrow">想知道他今晚为什么这样</p>
                  <h2>{overview.persona_state.label}</h2>
                  <p>这一刻他先按 <strong>{toPersonaStateLabel(overview.persona_state.state)}</strong> 接你。想看完整状态，再进去这页。</p>
                  <ul className="tag-row" data-testid="room-persona-moods">
                    {overview.persona_state.mood_tags.map((tag) => (
                      <li key={tag}>{tag}</li>
                    ))}
                  </ul>
                  <div className="room-panel-link">
                    <Link
                      href={withSessionContext(
                        overview.pending_actions.find((item) => item.action_code === "open_persona_panel")?.route ??
                          "/room/persona",
                        {
                          token,
                          accountToken: session?.account_token,
                        },
                      )}
                    >
                      查看作家状态
                    </Link>
                  </div>
                </section>

                <section className="room-reason-panel room-secondary-item" data-testid="room-persona-reasons">
                  <h3>这一步为什么还亮着</h3>
                  <ul className="room-detail-list room-detail-list--compact">
                    {overview.persona_state.reason_refs.slice(0, 2).map((item) => (
                      <li key={`${item.ref_type}-${item.ref_id}`}>
                        {item.label}
                        {toReasonCodeLabel(item.reason_code) ? ` · ${toReasonCodeLabel(item.reason_code)}` : ""}
                      </li>
                    ))}
                  </ul>
                </section>

                {overview.current_story_card ? (
                  <section className="room-secondary-item" data-testid="room-story-center-entry">
                    <h3>我的和最近记下</h3>
                    <p>想回看账号边界、最近记下和这本书的纠错入口，再从这里慢慢切过去。</p>
                    <div className="room-inline-links">
                      <Link
                        href={withSessionContext(`/profile?story_id=${overview.current_story_card.story_id}`, {
                          token,
                          accountToken: session?.account_token,
                        })}
                      >
                        <strong>打开我的</strong>
                        <p>看账号、边界和最近记下的入口。</p>
                      </Link>
                      <Link
                        href={withSessionContext(`/stories/${overview.current_story_card.story_id}/intents/recent`, {
                          token,
                          accountToken: session?.account_token,
                        })}
                      >
                        <strong>最近记下</strong>
                        <p>直接回到这本书的最近记下与纠错入口。</p>
                      </Link>
                    </div>
                  </section>
                ) : null}

                <section className="room-secondary-item" data-testid="room-notifications">
                  <h3>房间邮箱</h3>
                  {overview.recent_notifications.length > 0 ? (
                    <ul className="room-detail-list">
                      {overview.recent_notifications.map((item) => (
                        <li key={item.notification_id}>
                          <Link
                            href={withSessionContext(item.target_route, {
                              token,
                              accountToken: session?.account_token,
                            })}
                          >
                            {item.title}
                          </Link>
                          <p>{item.body}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>{getMailboxEmptyCopy(overview)}</p>
                  )}
                  {mailboxAction ? (
                    <div className="room-panel-link">
                      <Link
                        href={withSessionContext(mailboxAction.href, {
                          token,
                          accountToken: session?.account_token,
                        })}
                      >
                        {mailboxAction.label}
                      </Link>
                    </div>
                  ) : null}
                </section>

                {overview.fallback_context ? (
                  <section className="room-secondary-item" data-testid="room-fallback-context">
                    <h3>{overview.fallback_context.title}</h3>
                    <p>{overview.fallback_context.message}</p>
                    <div className="room-panel-link">
                      <Link
                        href={withSessionContext(overview.fallback_context.target_route, {
                          token,
                          accountToken: session?.account_token,
                        })}
                        onClick={() => {
                          if (!session) {
                            return;
                          }

                          void emitTelemetryEvent({
                            account_token: session.account_token,
                            event_name: "room_hotspot_clicked",
                            payload: {
                              hotspot_code: "desk",
                              entry_story_id: overview.current_story_card?.story_id ?? null,
                            },
                          });
                        }}
                      >
                        {overview.fallback_context.cta_label}
                      </Link>
                    </div>
                  </section>
                ) : null}

                <section className="room-mailbox-panel room-secondary-item room-help-panel">
                  <h3>这一步真卡住了</h3>
                  <p>如果房间里的去处、提醒或当前对象明显不对，再从这里叫人工一起看。</p>
                  <div className="room-support-links">
                    <Link
                      href={buildReportHref({
                        surface: "room",
                        account_token: session?.account_token,
                        story_id: overview.current_story_card?.story_id ?? searchParams.get("storyId"),
                        target_type: "room_session",
                        target_id: overview.current_story_card?.story_id ?? "room-session",
                        target_label: "作家房间",
                        token,
                      })}
                    >
                      举报与求助
                    </Link>
                    <Link
                      href={buildFeedbackHref({
                        surface: "room",
                        account_token: session?.account_token,
                        story_id: overview.current_story_card?.story_id ?? searchParams.get("storyId"),
                        target_type: "room_session",
                        target_id: overview.current_story_card?.story_id ?? "room-session",
                        target_label: "作家房间",
                        token,
                      })}
                    >
                      反馈与求助
                    </Link>
                  </div>
                </section>
              </div>
            </details>
          </div>
        </div>
      ) : null}
    </main>
  );
}
