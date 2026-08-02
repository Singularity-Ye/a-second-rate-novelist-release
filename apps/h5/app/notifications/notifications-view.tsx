"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import type { NotificationListResponse } from "@erliu/shared-contracts";
import { fetchNotifications, updateNotificationPreferences } from "../lib/account-membership-api";
import { useAccountSurfaceSession } from "../lib/account-surface-session";
import {
  FRONTSTAGE_LOADING,
  toFrontstageErrorCopy,
} from "../lib/frontstage-copy";
import { withH5Context } from "../lib/navigation";
import {
  AccountRecoveryStateCard,
  ControlActionRow,
  ControlSection,
  ControlStaticCell,
  ControlStrip,
} from "../profile/account/control-plane-kit";

function categoryLabel(category: NotificationListResponse["items"][number]["category"]) {
  switch (category) {
    case "chapter_update":
      return "章节更新";
    case "export":
      return "导出进度";
    case "risk":
      return "风险提醒";
    case "membership":
      return "会员消息";
    case "system":
      return "系统提醒";
    default:
      return category;
  }
}

function formatTimeLabel(value: string | undefined) {
  if (!value) {
    return "";
  }

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

function resolveNotificationTargetRoute(
  item: NotificationListResponse["items"][number],
  input: {
    storyId: string | null;
    roomHref: string;
  },
) {
  if (typeof item.target_route === "string" && item.target_route.length > 0) {
    if (input.storyId) {
      try {
        const parsed = new URL(item.target_route, "http://127.0.0.1");
        if (parsed.pathname === "/stories" && !parsed.searchParams.get("story_id") && !parsed.searchParams.get("storyId")) {
          const suffix = parsed.search ? parsed.search : "";
          return `/stories/${input.storyId}${suffix}`;
        }
      } catch {
        if (item.target_route === "/stories") {
          return `/stories/${input.storyId}`;
        }
      }
    }

    return item.target_route;
  }

  if (input.storyId) {
    return `/stories/${input.storyId}`;
  }

  return input.roomHref;
}

export function NotificationsView() {
  const session = useAccountSurfaceSession("/notifications", {
    issueTokenForLegacyAccount: true,
  });
  const [notifications, setNotifications] = useState<NotificationListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(true);
  const [preferenceState, setPreferenceState] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadNotifications(accountToken: string, storyId: string | null) {
    const result = await fetchNotifications({
      account_token: accountToken,
      category: null,
      unread_only: false,
      story_id: storyId,
    });
    setQuietHoursEnabled(result.preference_summary.quiet_hours_enabled);
    setNotifications(result);
    return result;
  }

  useEffect(() => {
    if (!session.accountToken) {
      return;
    }

    void loadNotifications(session.accountToken, session.storyId).catch((reason) => {
      setError(toFrontstageErrorCopy(reason, "房间邮箱这会儿还没整理出来。"));
    });
  }, [session.accountToken, session.storyId]);

  if (session.recoveryState !== "ready") {
    return (
      <main className="surface notifications-surface" data-testid="notifications-page">
        <AccountRecoveryStateCard
          state={session.recoveryState}
          retryHref={session.retryHref}
          roomHref={session.roomHref}
          homeHref={session.homeHref}
        />
      </main>
    );
  }

  async function handleUpdatePreferences() {
    const accountToken = session.accountToken;
    if (!accountToken || submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await updateNotificationPreferences({
        account_token: accountToken,
        in_app_enabled: true,
        push_enabled: false,
        im_enabled: false,
        quiet_hours_enabled: quietHoursEnabled,
        quiet_hours_start_local: "22:00",
        quiet_hours_end_local: "08:00",
        time_zone: "Asia/Shanghai",
        export_enabled: true,
        risk_enabled: true,
        membership_enabled: true,
        system_enabled: true,
      });
      setPreferenceState("房间邮箱偏好已保存。");
      await loadNotifications(accountToken, session.storyId);
    } catch (reason) {
      setError(toFrontstageErrorCopy(reason, "这次提醒节奏还没保存成功。"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="surface notifications-surface" data-testid="notifications-page">
      {error ? <p>{error}</p> : null}
      {!notifications && !error ? <p>{FRONTSTAGE_LOADING.notifications}</p> : null}

      {notifications ? (
        <>
          <section className="story-section control-hero">
            <p className="story-section__eyebrow">房间邮箱</p>
            <h1 className="story-section__title">通知中心只收可信提醒</h1>
            <p className="story-section__copy">
              更新、会员、导出和风险提醒都应该回到同一个房间邮箱里。你需要控制的是打扰节奏，而不是猜测消息去了哪里。
            </p>
            <ControlStrip
              items={[
                {
                  label: "待看提醒",
                  value: `${notifications.items.length} 条`,
                },
                {
                  label: "当前渠道",
                  value: notifications.preference_summary.in_app_enabled ? "房间邮箱" : "待恢复",
                },
                {
                  label: "静音窗口",
                  value: quietHoursEnabled
                    ? `${notifications.preference_summary.quiet_hours_start_local} - ${notifications.preference_summary.quiet_hours_end_local}`
                    : "未开启",
                },
                {
                  label: "渠道边界",
                  value: "站外提醒暂未开放",
                },
              ]}
            />
          </section>

          <div className="control-layout">
            <div className="control-main">
              <ControlSection
                eyebrow="打扰节奏"
                title="只配置当前真的会生效的邮箱能力"
                description="本轮只开放房间邮箱和静音时段；站外提醒与其他聊天渠道明确保留位，不再伪装成可用开关。"
                testId="notification-preference-form"
              >
                <div className="control-cell-list control-cell-list--tight">
                  <ControlStaticCell
                    title="房间邮箱"
                    description={
                      notifications.preference_summary.in_app_enabled
                        ? "这是当前唯一可信的提醒入口，先保持开启；要减少打扰请改静音时段。"
                        : "之前有过停用记录；保存本页会恢复开启，避免重要结果失联。"
                    }
                    status={notifications.preference_summary.in_app_enabled ? "固定开启" : "待恢复"}
                    tone={notifications.preference_summary.in_app_enabled ? "live" : "alert"}
                  />
                </div>
                <div className="control-toggle-grid">
                  <label className="control-toggle-card">
                    <input
                      type="checkbox"
                      checked={quietHoursEnabled}
                      disabled={submitting}
                      onChange={(event) => {
                        setQuietHoursEnabled(event.target.checked);
                      }}
                    />
                    <div>
                      <strong>静音时段</strong>
                      <span>
                        当前按 {notifications.preference_summary.quiet_hours_start_local} -{" "}
                        {notifications.preference_summary.quiet_hours_end_local} 生效，重要结果仍留痕。
                      </span>
                    </div>
                  </label>
                </div>
                <div className="control-cell-list control-cell-list--tight">
                  <ControlStaticCell
                    title="会员消息"
                    description="权益变更、购买成功、到期提醒。"
                    status="房间邮箱"
                    tone="live"
                  />
                  <ControlStaticCell
                    title="导出与风险"
                    description="导出完成、权利服务状态、风险检查结果。"
                    status="房间邮箱"
                    tone="live"
                  />
                  <ControlStaticCell
                    title="站外提醒"
                    description="站外提醒会在后续成熟后单独开放，本轮不提供伪开关。"
                    status="未开放"
                    tone="reserved"
                  />
                  <ControlStaticCell
                    title="其他聊天渠道"
                    description="其他聊天渠道回流暂未开放，提醒先统一回到房间邮箱。"
                    status="未开放"
                    tone="reserved"
                  />
                </div>
                <ControlActionRow>
                  <button type="button" disabled={submitting} onClick={() => void handleUpdatePreferences()}>
                    保存房间邮箱节奏
                  </button>
                </ControlActionRow>
                {preferenceState ? <p data-testid="notification-preference-state">{preferenceState}</p> : null}
              </ControlSection>

              <ControlSection eyebrow="最近提醒" title="房间邮箱里的最新消息">
                {notifications.items.length ? (
                  <ul className="control-list">
                    {notifications.items.map((item) => (
                      <li key={item.notification_id}>
                        <Link
                          href={withH5Context(
                            resolveNotificationTargetRoute(item, {
                              storyId: session.storyId,
                              roomHref: session.roomHref,
                            }),
                            session.contextSearchParams,
                          )}
                        >
                          <strong>
                            {categoryLabel(item.category)} · {item.title}
                          </strong>
                          <span>
                            {item.body}
                            {formatTimeLabel(item.created_at) ? ` · ${formatTimeLabel(item.created_at)}` : ""}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="control-cell-list" data-testid="notifications-empty-state">
                    <ControlStaticCell
                      title="邮箱暂时还没有新回信"
                      description={
                        session.storyId
                          ? "这本书最近还没有新的章节、导出或风险回信。先回故事中枢或房间继续推进，新的结果会先落在这里。"
                          : "最近还没有新的章节、导出或风险回信。先回房间看看，新的结果会先落在这里。"
                      }
                      status="先继续"
                      tone="reserved"
                    />
                  </div>
                )}
                <ControlActionRow>
                  {session.storyId ? (
                    <Link href={withH5Context(`/stories/${session.storyId}`, session.contextSearchParams)}>回到这本书的故事中枢</Link>
                  ) : null}
                  <Link href={session.roomHref}>回房间看看</Link>
                </ControlActionRow>
              </ControlSection>
            </div>

            <aside className="control-sidebar">
              <ControlSection
                eyebrow="通知口径"
                title="消息必须可信、可静音、可回看"
                description="通知中心是房间邮箱，不是噪音消息堆，也不是假装已经接通的外部入口。"
              >
                <div className="control-cell-list">
                  <ControlStaticCell
                    title="可信提醒"
                    description="不能把系统噪音和真正需要决策的提醒混在一起。"
                    status="硬规则"
                    tone="alert"
                  />
                  <ControlStaticCell
                    title="静音不丢事"
                    description="静音控制的是打扰时机，不影响结果留痕。"
                    status="硬规则"
                    tone="alert"
                  />
                </div>
              </ControlSection>
            </aside>
          </div>
        </>
      ) : null}
    </main>
  );
}
