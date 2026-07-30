"use client";

import React from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { BetaAccessStatusResponse, BetaInviteRedeemResponse, BetaInviteSummary } from "@erliu/shared-contracts";
import { LaunchTrackingStrip } from "../launch-tracking-strip";
import {
  BetaAccessApiError,
  fetchBetaAccessStatus,
  redeemBetaInvite,
  registerBetaAccessChannel,
} from "../lib/beta-access-api";
import {
  toBetaAccessStateLabel,
  toBetaInviteStatusLabel,
  toBetaOnboardingStatusLabel,
  toEntryChannelLabel,
  toFrontstageErrorCopy,
} from "../lib/frontstage-copy";
import {
  primeFrontstageSessionFromHref,
  readStoredFrontstageSession,
} from "../lib/account-surface-session";
import { readLaunchTracking, withLaunchTracking } from "../lib/launch-tracking";
import { normalizeInternalHref } from "../lib/navigation";

export function BetaLandingView({ initialInviteCode }: { initialInviteCode?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [inviteCode, setInviteCode] = useState(initialInviteCode ?? searchParams.get("invite_code") ?? "");
  const [status, setStatus] = useState<BetaAccessStatusResponse | null>(null);
  const [account, setAccount] = useState<BetaInviteRedeemResponse | null>(null);
  const [wechatId, setWechatId] = useState("");
  const [bindingState, setBindingState] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const normalizedInviteCode = inviteCode.trim();
  const accountToken =
    searchParams.get("account_token") ?? (normalizedInviteCode ? null : readStoredFrontstageSession().accountToken);
  const attributionExtras = activeAttribution(status, account);
  const trackingItems = readLaunchTracking(searchParams, attributionExtras);
  const faqHref = withLaunchTracking("/faq", searchParams, attributionExtras);
  const demoStoriesHref = withLaunchTracking("/demo-stories", searchParams, attributionExtras);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const queryAccountToken = searchParams.get("account_token");

    if (!queryAccountToken) {
      return;
    }

    primeFrontstageSessionFromHref(window.location.href);

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("account_token");

    const nextSearch = nextParams.toString();
    const nextHref = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
    const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (nextHref !== currentHref) {
      window.history.replaceState(window.history.state, "", nextHref);
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    if (!accountToken && !normalizedInviteCode) {
      setStatus(null);
      setLoadingStatus(false);
      return;
    }

    setLoadingStatus(true);
    fetchBetaAccessStatus({
      ...(accountToken ? { account_token: accountToken } : {}),
      ...(normalizedInviteCode ? { invite_code: normalizedInviteCode } : {}),
    })
      .then((result) => {
        if (!cancelled) {
          setStatus(result);
          setError(null);
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(toFrontstageErrorCopy(reason, "邀请入口说明这会儿还没整理出来。"));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingStatus(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accountToken, normalizedInviteCode]);

  async function handleRedeem() {
    if (!normalizedInviteCode || submitting || !invitePreview.canRedeem) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const redeemed = await redeemBetaInvite({
        invite_code: normalizedInviteCode,
        entry_channel: "h5",
      });
      setAccount(redeemed);
      setBindingState(null);
    } catch (reason) {
      if (reason instanceof BetaAccessApiError && normalizedInviteCode) {
        try {
          setStatus(
            await fetchBetaAccessStatus({
              invite_code: normalizedInviteCode,
            }),
          );
        } catch {
          // Keep the original redeem error as the user-facing fallback.
        }

        if (reason.errorCode === "invite_not_found" || reason.errorCode === "invite_exhausted") {
          setError(null);
        } else {
          setError(toFrontstageErrorCopy(reason, "这组邀请码还没兑换成功。"));
        }
      } else {
        setError(toFrontstageErrorCopy(reason, "这组邀请码还没兑换成功。"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBindWechat() {
    if (!account || !wechatId.trim() || submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const binding = await registerBetaAccessChannel({
        account_token: account.account_token,
        channel: "wechat",
        provider_user_id: wechatId.trim(),
        set_as_primary: true,
      });
      setBindingState(toBetaOnboardingStatusLabel(binding.onboarding_status));
      setAccount({
        ...account,
        onboarding_status: binding.onboarding_status,
        bound_channels: binding.bound_channels,
        next_step_copy: binding.next_step_copy,
      });
    } catch (reason) {
      setError(toFrontstageErrorCopy(reason, "微信入口还没绑上。"));
    } finally {
      setSubmitting(false);
    }
  }

  const invite = status?.invite ?? null;
  const activeAccount = account ?? status?.account ?? null;
  const invitePreview = describeInvitePreview({
    invite,
    inviteCode: normalizedInviteCode,
    loadingStatus,
  });

  return (
    <main className="surface" data-testid="beta-landing-page">
      <section className="page-intro">
        <p className="page-intro__eyebrow">邀请入口说明</p>
        <h1 className="page-intro__title">这里负责说明邀请码、入口和下一步，不抢主体验的位置。</h1>
        <p className="page-intro__lede">
          用邀请码进入后，你可以把常用入口接到同一段关系上；如果还没准备好，就先看使用说明和示范故事，主体验仍然从被接住和故事方向开始。
        </p>
        <div className="story-shell-links story-cell-list story-cell-list--two" data-testid="beta-launch-links">
          <Link className="story-cell story-cell--link" href={demoStoriesHref}>
            <strong>查看示范故事</strong>
            <span>先看四条示范故事，作为辅助理解，不把它们误当成主链本身。</span>
          </Link>
          <Link className="story-cell story-cell--link" href={faqHref}>
            <strong>查看使用说明</strong>
            <span>默认私密、作品标识、反馈路径和入口规则都在这里解释清楚，避免和主承诺混在一起。</span>
          </Link>
        </div>
        {error ? <p className="story-microcopy story-microcopy--danger">{error}</p> : null}
      </section>

      <LaunchTrackingStrip items={trackingItems} title="当前入口来源" />

      <section className="story-section">
        <div className="story-section__header">
          <p className="story-section__eyebrow">邀请码</p>
          <h2 className="story-section__title">先确认这组邀请码还能不能继续用</h2>
        </div>
        <label className="exports-textarea">
          邀请码
          <input
            aria-label="邀请码"
            value={inviteCode}
            disabled={submitting}
            onChange={(event) => {
              setInviteCode(event.target.value);
            }}
          />
        </label>
        <button
          className="primary-cta"
          type="button"
          disabled={submitting || !normalizedInviteCode || !invitePreview.canRedeem}
          onClick={() => void handleRedeem()}
        >
          兑换邀请码
        </button>
        {invite ? (
          <p data-testid="beta-invite-preview">
            {invite.source_label} · {invitePreview.label}
          </p>
        ) : (
          <p data-testid="beta-invite-preview">{invitePreview.label}</p>
        )}
        <p>{invitePreview.message}</p>
      </section>

      {activeAccount ? (
        <>
          <section className="story-cell">
            <p className="story-section__eyebrow">当前入口状态</p>
            <p>
              {toBetaAccessStateLabel(activeAccount.access_state)} · {toBetaOnboardingStatusLabel(activeAccount.onboarding_status)}
            </p>
            <p>{activeAccount.next_step_copy}</p>
            <p>
              这次入口来自 {activeAccount.attribution.source_label}
            </p>
            <p>
              已接入：{activeAccount.bound_channels.map(toEntryChannelLabel).join(" / ") || "暂未接入"} · 可继续使用：
              {activeAccount.allowed_channels.map(toEntryChannelLabel).join(" / ")}
            </p>
          </section>

          <section className="story-section">
            <div className="story-section__header">
              <p className="story-section__eyebrow">进入主链</p>
            </div>
            <div className="story-cell-list story-cell-list--four f9-link-grid">
              <button
                className="secondary-cta"
                type="button"
                onClick={() => {
                  if (activeAccount.entry_links.chat_url) {
                    primeFrontstageSessionFromHref(activeAccount.entry_links.chat_url);
                    router.push(normalizeInternalHref(activeAccount.entry_links.chat_url));
                  }
                }}
              >
                进入私聊
              </button>
              <Link
                className="story-cell story-cell--link"
                href={activeAccount.entry_links.room_url ? normalizeInternalHref(activeAccount.entry_links.room_url) : "/room"}
                onClick={() => {
                  if (activeAccount.entry_links.room_url) {
                    primeFrontstageSessionFromHref(activeAccount.entry_links.room_url);
                  }
                }}
              >
                <strong>进入房间</strong>
              </Link>
              <Link
                className="story-cell story-cell--link"
                href={normalizeInternalHref(activeAccount.entry_links.beta_url)}
                onClick={() => {
                  primeFrontstageSessionFromHref(activeAccount.entry_links.beta_url);
                }}
              >
                <strong>回到邀请入口说明</strong>
              </Link>
              <Link className="story-cell story-cell--link" href={faqHref}>
                <strong>看使用说明</strong>
              </Link>
            </div>
          </section>

          <section className="story-section">
            <div className="story-section__header">
              <p className="story-section__eyebrow">绑定常用入口</p>
            </div>
            <label className="exports-textarea">
              微信入口标识
              <input
                aria-label="微信入口标识"
                value={wechatId}
                disabled={submitting}
                onChange={(event) => {
                  setWechatId(event.target.value);
                }}
              />
            </label>
            <button className="secondary-cta" type="button" disabled={submitting || !wechatId.trim()} onClick={() => void handleBindWechat()}>
              绑定微信入口
            </button>
            {bindingState ? <p data-testid="beta-binding-state">{bindingState}</p> : null}
          </section>

          <section className="story-section" data-testid="beta-share-invites">
            <div className="story-section__header">
              <p className="story-section__eyebrow">可分享邀请码</p>
            </div>
            {activeAccount.share_invites.length > 0 ? (
              <ul className="f9-bullet-list">
                {activeAccount.share_invites.map((item) => (
                  <li key={item.invite_code}>
                    <strong>{item.invite_code}</strong>
                    <p>
                      {item.source_label} · {toBetaInviteStatusLabel(item.status)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p>当前还没有可继续传播的邀请码。</p>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}

function activeAttribution(status: BetaAccessStatusResponse | null, account: BetaInviteRedeemResponse | null) {
  if (account) {
    return {
      invite_code: account.invite_code,
      source_channel: account.attribution.source_channel,
      source_label: account.attribution.source_label,
      campaign_key: account.attribution.campaign_key,
    };
  }

  if (status?.invite) {
    return {
      invite_code: status.invite.invite_code,
      source_channel: status.invite.source_channel,
      source_label: status.invite.source_label,
      campaign_key: status.invite.campaign_key,
    };
  }

  return {};
}

function describeInvitePreview(input: {
  invite: BetaInviteSummary | null;
  inviteCode: string;
  loadingStatus: boolean;
}) {
  if (!input.inviteCode) {
    return {
      canRedeem: false,
      label: "待输入",
      message: "当前页面支持直接输入邀请码，也可以从邀请链接直接进入。",
    };
  }

  if (input.loadingStatus) {
    return {
      canRedeem: false,
      label: "检查中",
      message: "正在检查邀请码状态，请稍等。",
    };
  }

  if (!input.invite) {
    return {
      canRedeem: false,
      label: "暂时无效",
      message: "没有找到这个邀请码，请检查后再试。",
    };
  }

  const canRedeem = input.invite.status !== "exhausted" && input.invite.redeemed_count < input.invite.max_redemptions;
  if (!canRedeem) {
    return {
      canRedeem: false,
      label: "已经用完",
      message: "这个邀请码已经用完了，请换一个新的分享码或联系邀请人。",
    };
  }

  return {
    canRedeem: true,
    label: "可以继续",
    message: "邀请码可用，确认后即可进入私聊继续。",
  };
}
