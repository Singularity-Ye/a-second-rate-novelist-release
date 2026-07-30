"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import type { AccountOverviewResponse } from "@erliu/shared-contracts";
import { fetchAccountOverview } from "../lib/account-membership-api";
import { useAccountSurfaceSession } from "../lib/account-surface-session";
import { AccountRecoveryStateCard, accountStatusLabel, planLabel, withAccountQuery } from "./account/control-plane-kit";

type ProfileActionEntry = {
  href: string;
  title: string;
  description: string;
  cta: string;
  meta: string;
};

type ProfileLinkEntry = {
  href: string;
  title: string;
  value?: string;
  description: string;
  meta: string;
};

function getProfileHeroTitle(overview: AccountOverviewResponse) {
  if (overview.sync_summary.pending_conflict_count > 0) {
    return "先把多端接力接稳";
  }

  if (overview.account.unread_notification_count > 0) {
    return "先收一下房间刚给你的回信";
  }

  if (overview.account.account_status !== "active") {
    return "先把你的进度稳稳留住";
  }

  if (overview.runtime_control.privacy.open_request_count > 0) {
    return "先看隐私和数据这边的进度";
  }

  return "你的故事和账号都在这里收着";
}

function getPrimaryProfileAction(overview: AccountOverviewResponse, queryString: string): ProfileActionEntry {
  if (overview.sync_summary.pending_conflict_count > 0) {
    return {
      href: withAccountQuery("/profile/account/sync", queryString),
      title: "先把多端接力接稳",
      description: "先把现在这点接力理顺，后面的换机和恢复才不会互相打架。",
      cta: "去处理接力",
      meta: "设置里继续往下走",
    };
  }

  if (overview.account.unread_notification_count > 0) {
    return {
      href: withAccountQuery("/notifications", queryString),
      title: "先收一下房间刚给你的回信",
      description: "先把刚来的消息收一收，再继续往下看别的入口。",
      cta: "去看回信",
      meta: "消息都在房间邮箱里",
    };
  }

  if (overview.account.account_status !== "active") {
    return {
      href: withAccountQuery("/profile/account", queryString),
      title: "先把你的进度稳稳留住",
      description: "先把现在这份进度接住，后面的保存和恢复就会顺一点。",
      cta: accountStatusLabel(overview.account.account_status),
      meta: "先去账号页接住进度",
    };
  }

  if (overview.runtime_control.privacy.open_request_count > 0) {
    return {
      href: withAccountQuery("/profile/account/privacy", queryString),
      title: "先看隐私和数据这边的进度",
      description: "有请求先放这里看，隐私和资料相关的事都会在这里收口。",
      cta: "去看进度",
      meta: "资料和请求都在这里看",
    };
  }

  return {
    href: withAccountQuery("/profile/account/membership", queryString),
    title: "你的故事和账号都在这里收着",
    description: "会员、权益和继续连载需要的内容，都先放在这里。",
    cta: planLabel(overview.entitlements.current_plan_id),
    meta: "想看权益就从这里进去",
  };
}

function getProfileSettingsEntries(overview: AccountOverviewResponse, queryString: string): ProfileLinkEntry[] {
  return [
    {
      href: withAccountQuery("/profile/account", queryString),
      title: "保住账号和进度",
      value: accountStatusLabel(overview.account.account_status),
      description: "把现在的账号、登录和进度先接稳。",
      meta: "继续用这里管住账号",
    },
    {
      href: withAccountQuery("/profile/account/membership", queryString),
      title: "看权益和会员",
      value: planLabel(overview.entitlements.current_plan_id),
      description: "看看你现在拿到了什么，想续什么也在这里看。",
      meta: "权益和方案都能继续看",
    },
    {
      href: withAccountQuery("/notifications", queryString),
      title: "看通知和房间邮箱",
      value: `${overview.account.unread_notification_count} 条待看`,
      description: "更新、提醒和需要你确认的事，都先回到这里。",
      meta: "消息和提醒都从这里进",
    },
    {
      href: withAccountQuery("/profile/account/sync", queryString),
      title: "换机和恢复",
      value: overview.sync_summary.pending_conflict_count > 0 ? "还有一点要接稳" : "已经接得住",
      description: "换手机、补回来、处理冲突，都从这里继续。",
      meta: "设备接力和恢复都在这里",
    },
    {
      href: withAccountQuery("/profile/account/privacy", queryString),
      title: "隐私与数据",
      value: overview.runtime_control.privacy.open_request_count > 0 ? "有请求在路上" : "资料都收得住",
      description: "想看资料、权限和请求进度，都来这里。",
      meta: "需要的时候就从这里看",
    },
  ];
}

function getProfileHelpEntries(overview: AccountOverviewResponse, queryString: string) {
  const feedbackParams = new URLSearchParams(queryString);
  feedbackParams.set("surface", "account");
  feedbackParams.set("target_type", "account_overview");
  feedbackParams.set("target_id", overview.account.account_id);
  feedbackParams.set("target_label", "个人中心");

  return [
    {
      href: withAccountQuery("/faq", queryString),
      title: "先看看怎么用",
      description: "不确定该点哪里时，先来这边翻一下。",
      meta: "先把路认清再继续",
    },
    {
      href: `/feedback?${feedbackParams.toString()}`,
      title: "卡住了来找我们",
      description: "真的过不去时，把这页的情况带过来就行。",
      meta: "会保留你现在的上下文",
    },
  ];
}

export function ProfileRootView() {
  const session = useAccountSurfaceSession("/profile");
  const [overview, setOverview] = useState<AccountOverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session.accountToken) {
      return;
    }

    setError(null);
    void fetchAccountOverview(session.accountToken)
      .then((result) => {
        setOverview(result);
      })
      .catch((reason) => {
        setError(reason instanceof Error && reason.message ? "页面暂时打不开，请稍后再试。" : "页面暂时打不开，请稍后再试。");
      });
  }, [session.accountToken]);

  if (session.recoveryState !== "ready") {
    return (
      <main className="surface profile-root-surface" data-testid="profile-root-page">
        <AccountRecoveryStateCard
          state={session.recoveryState}
          retryHref={session.retryHref}
          roomHref={session.roomHref}
          homeHref={session.homeHref}
        />
      </main>
    );
  }

  const primaryProfileAction = overview ? getPrimaryProfileAction(overview, session.queryString) : null;
  const profileSettingsEntries = overview ? getProfileSettingsEntries(overview, session.queryString) : [];
  const profileHelpEntries = overview ? getProfileHelpEntries(overview, session.queryString) : [];
  const heroTitle = primaryProfileAction ? primaryProfileAction.title : overview ? getProfileHeroTitle(overview) : "你的故事和账号都在这里收着";
  const heroCopy = primaryProfileAction
    ? "先把最要紧的一件事放前面，别的设置和帮助我先收在下面。"
    : "账号、消息、进度和帮助都收在这里，先看最该先处理的那一步。";

  return (
    <main className="surface profile-root-surface" data-testid="profile-root-page">
      {error ? <p className="profile-root-message profile-root-message--error">{error}</p> : null}
      {!overview && !error ? <p className="profile-root-message">正在打开“我的”页面...</p> : null}

      {overview ? (
        <>
          <section className="profile-root-hero">
            <div className="profile-root-hero__copy">
              <p className="story-section__eyebrow">我的</p>
              <h1 className="story-section__title">{heroTitle}</h1>
              <p className="story-section__copy">{heroCopy}</p>
            </div>
          </section>

          {primaryProfileAction ? (
            <section className="profile-root-feature">
              <div className="story-section__header">
                <p className="story-section__eyebrow">继续处理</p>
                <h2 className="story-section__title">先把这件事处理好</h2>
                <p className="story-section__copy">这一步先接稳，设置和帮助都还在下面，不会丢。</p>
              </div>
              <Link
                aria-label={`继续处理：${primaryProfileAction.title}`}
                className="profile-root-primary-link"
                href={primaryProfileAction.href}
              >
                <strong>{primaryProfileAction.title}</strong>
                <p>{primaryProfileAction.description}</p>
                <span>{primaryProfileAction.cta}</span>
                <small>{primaryProfileAction.meta}</small>
              </Link>
            </section>
          ) : null}

          <div className="profile-root-grid">
            <section className="profile-root-panel">
              <div className="story-section__header">
                <p className="story-section__eyebrow">设置</p>
                <h2 className="story-section__title">再管别的</h2>
                <p className="story-section__copy">当前这件事接稳以后，再来这里管账号、会员、消息、换机和隐私。</p>
              </div>
              <div className="profile-root-link-list" data-testid="profile-root-settings">
                {profileSettingsEntries.map((entry) => (
                  <Link key={entry.title} aria-label={entry.title} className="profile-root-link" href={entry.href}>
                    <div className="profile-root-link__header">
                      <div className="profile-root-link__title-block">
                        <strong>{entry.title}</strong>
                        <p className="profile-root-link__value">{entry.value}</p>
                      </div>
                      <span className="profile-root-link__arrow" aria-hidden="true">
                        →
                      </span>
                    </div>
                    <p className="profile-root-link__copy">{entry.description}</p>
                    <small className="profile-root-link__meta">{entry.meta}</small>
                  </Link>
                ))}
              </div>
            </section>

            <section className="profile-root-panel">
              <div className="story-section__header">
                <p className="story-section__eyebrow">帮助</p>
                <h2 className="story-section__title">需要时再找</h2>
                <p className="story-section__copy">不用先看帮助；真的卡住了，再把这一页的上下文一起带过来。</p>
              </div>
              <div className="profile-root-link-list" data-testid="profile-root-help">
                {profileHelpEntries.map((entry) => (
                  <Link key={entry.title} aria-label={entry.title} className="profile-root-link" href={entry.href}>
                    <div className="profile-root-link__header">
                      <div className="profile-root-link__title-block">
                        <strong>{entry.title}</strong>
                        <p className="profile-root-link__value">{entry.meta}</p>
                      </div>
                      <span className="profile-root-link__arrow" aria-hidden="true">
                        →
                      </span>
                    </div>
                    <p className="profile-root-link__copy">{entry.description}</p>
                  </Link>
                ))}
              </div>
            </section>
          </div>

        </>
      ) : null}
    </main>
  );
}
