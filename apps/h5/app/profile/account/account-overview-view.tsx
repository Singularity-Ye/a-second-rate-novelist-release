"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import type { AccountOverviewResponse } from "@erliu/shared-contracts";
import {
  createPrivacyDataRequest,
  fetchAccountOverview,
  guestUpgradeAccount,
} from "../../lib/account-membership-api";
import { buildFeedbackHref } from "../../lib/beta-ops-links";
import { useAccountSurfaceSession } from "../../lib/account-surface-session";
import {
  FRONTSTAGE_LOADING,
  toCheckoutStatusLabel,
  toEntryChannelLabel,
  toPrivacyRequestStatusLabel,
  toFrontstageErrorCopy,
} from "../../lib/frontstage-copy";
import {
  AccountRecoveryStateCard,
  accountStatusLabel,
  ControlActionRow,
  ControlLinkCell,
  ControlSection,
  ControlStaticCell,
  ControlStrip,
  planLabel,
  syncHealthLabel,
  withAccountQuery,
} from "./control-plane-kit";

export function AccountOverviewView() {
  const session = useAccountSurfaceSession("/profile/account");
  const [overview, setOverview] = useState<AccountOverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionState, setActionState] = useState<string | null>(null);
  const [privacyState, setPrivacyState] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadOverview(accountToken: string) {
    const result = await fetchAccountOverview(accountToken);
    setOverview(result);
    return result;
  }

  useEffect(() => {
    if (!session.accountToken) {
      return;
    }

    void loadOverview(session.accountToken).catch((reason) => {
      setError(toFrontstageErrorCopy(reason, "账户概览这会儿还没打开。"));
    });
  }, [session.accountToken]);

  if (session.recoveryState !== "ready") {
    return (
      <main className="surface account-overview-surface" data-testid="account-overview-page">
        <AccountRecoveryStateCard
          state={session.recoveryState}
          retryHref={session.retryHref}
          roomHref={session.roomHref}
          homeHref={session.homeHref}
        />
      </main>
    );
  }

  async function handleGuestUpgrade() {
    const accountToken = session.accountToken;
    if (!accountToken || submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await guestUpgradeAccount(accountToken);
      setActionState(result.status);
      await loadOverview(accountToken);
    } catch (reason) {
      setError(toFrontstageErrorCopy(reason, "这次保存关系还没成功。"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePrivacyRequest() {
    const accountToken = session.accountToken;
    if (!accountToken || submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await createPrivacyDataRequest({
        account_token: accountToken,
        request_type: "export",
        scope: "account",
        ...(session.storyId ? { story_id: session.storyId } : {}),
      });
      setPrivacyState(result.status);
    } catch (reason) {
      setError(toFrontstageErrorCopy(reason, "这次数据请求还没提交成功。"));
    } finally {
      setSubmitting(false);
    }
  }

  const syncHref = withAccountQuery("/profile/account/sync", session.queryString);
  const privacyHref = withAccountQuery("/profile/account/privacy", session.queryString);
  const membershipHref = withAccountQuery("/profile/account/membership", session.queryString);
  const ordersHref = withAccountQuery("/profile/account/orders", session.queryString);
  const notificationsHref = withAccountQuery("/notifications", session.queryString);
  const feedbackHref = buildFeedbackHref({
    surface: "account",
    account_token: session.accountToken,
    story_id: session.storyId,
    target_type: "account_overview",
    target_id: overview?.account.account_id ?? "account-overview",
    target_label: "账户总览",
    token: session.token,
  });

  return (
    <main className="surface account-overview-surface" data-testid="account-overview-page">
      {error ? <p>{error}</p> : null}
      {!overview && !error ? <p>{FRONTSTAGE_LOADING.profile}</p> : null}

      {overview ? (
        <>
          <section className="story-section control-hero" data-testid="account-summary">
            <p className="story-section__eyebrow">账户与保存</p>
            <h1 className="story-section__title">先把这段关系正式留在自己名下</h1>
            <p className="story-section__copy">
              这里负责游客转正、换机恢复、多端接力和数据可带走，不再把“保存”“同步”“导出”拆成互不相认的几块面板。
            </p>
            <ControlStrip
              items={[
                {
                  label: "当前状态",
                  value: accountStatusLabel(overview.account.account_status),
                },
                {
                  label: "主渠道",
                  value: toEntryChannelLabel(overview.account.primary_channel),
                },
                {
                  label: "同步健康",
                  value: syncHealthLabel(overview.sync_summary.sync_health),
                },
                {
                  label: "房间邮箱",
                  value: `${overview.account.unread_notification_count} 条待看`,
                },
              ]}
            />
          </section>

          <div className="control-layout">
            <div className="control-main">
              <ControlSection
                eyebrow="保存底座"
                title="先把保存、恢复和数据请求收口"
                description="你需要看到真实可用的入口，而不是一堆 quota 字段。"
                testId="account-actions"
              >
                <div className="control-cell-list" data-testid="account-entitlements">
                  <ControlStaticCell
                    title="游客转正"
                    value={accountStatusLabel(overview.account.account_status)}
                    description="如果还在游客态，先把这段关系正式留档，避免换设备后丢失故事。"
                    meta={`当前主入口 ${toEntryChannelLabel(overview.account.primary_channel)}`}
                    status={overview.account.account_status === "guest" ? "待处理" : "已完成"}
                    tone={overview.account.account_status === "guest" ? "alert" : "live"}
                  />
                  <ControlLinkCell
                    href={syncHref}
                    title="绑定与恢复"
                    value={`${overview.sync_summary.device_count} 台设备在接力`}
                    description="去处理换机、补绑和冲突分流，系统不会静默覆盖任何一端。"
                    meta={`待处理冲突 ${overview.sync_summary.pending_conflict_count} 个`}
                    status="已可用"
                    tone="live"
                  />
                  <ControlLinkCell
                    href={privacyHref}
                    title="隐私与数据"
                    value={`${overview.runtime_control.privacy.open_request_count} 个请求处理中`}
                    description="发起导出、删除或撤回同意请求，并保留最近记录。"
                    meta={`最近请求 ${overview.runtime_control.privacy.latest_request_id ?? "暂无"}`}
                    status="已可用"
                    tone="live"
                  />
                </div>
                <ControlActionRow>
                  <button type="button" disabled={submitting} onClick={() => void handleGuestUpgrade()}>
                    把游客进度正式保存下来
                  </button>
                  <Link className="control-link-button" href={syncHref}>
                    去处理绑定与恢复
                  </Link>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={submitting}
                    onClick={() => void handlePrivacyRequest()}
                  >
                    发起数据导出请求
                  </button>
                </ControlActionRow>
                {actionState ? <p data-testid="account-action-state">{toCheckoutStatusLabel(actionState)}</p> : null}
                {privacyState ? <p data-testid="privacy-request-state">{toPrivacyRequestStatusLabel(privacyState)}</p> : null}
              </ControlSection>

              <ControlSection
                eyebrow="权益透明"
                title="只展示和持续写作直接相关的权益"
                description="会员价值用故事槽位、分支额度、导出权益和资料容量说明，不再拿底层能力成本卖给用户。"
              >
                <div className="control-cell-list">
                  <ControlStaticCell
                    title="故事槽位"
                    value={`还可再养 ${overview.runtime_control.remaining.story_slots} 条故事`}
                    description="当前方案支持你维持持续连载，不必为了继续追更去理解底层模型成本。"
                    meta={`总槽位 ${overview.entitlements.story_slots} · 已在连载 ${overview.runtime_control.usage.active_story_count}`}
                    status="已可用"
                    tone="live"
                  />
                  <ControlStaticCell
                    title="分支额度"
                    value={`还可再开 ${overview.runtime_control.remaining.branch_quota} 条分支`}
                    description="把改稿、平行分支和冲突分流都看成创作动作，而不是技术操作。"
                    meta={`总分支额度 ${overview.entitlements.branch_quota}`}
                    status="已可用"
                    tone="live"
                  />
                  <ControlStaticCell
                    title="导出权益"
                    value={`本周期还可导出 ${overview.runtime_control.remaining.export_quota} 次`}
                    description="投稿、存档、交付前都能明确看到还剩多少导出权利。"
                    meta={`总导出权益 ${overview.entitlements.export_quota}`}
                    status="已可用"
                    tone="live"
                  />
                  <ControlStaticCell
                    title="资料容量"
                    value={`${overview.entitlements.asset_storage_mb} MB`}
                    description="参考资料和设定资产会跟随账户长期保存，不和作品导出混成一团。"
                    meta={`当前方案 ${planLabel(overview.entitlements.current_plan_id)}`}
                    status="已可用"
                    tone="live"
                  />
                </div>
              </ControlSection>

              <ControlSection
                eyebrow="边界说明"
                title="保留位明确挂出来，不再伪装成熟能力"
                description="这一页先把账号管理基础能力讲清楚；专业模型、自定义渠道和家庭共享都暂不开放。"
              >
                <div className="control-cell-list">
                  <ControlStaticCell
                    title="其他聊天渠道同步"
                    value="保留位"
                    description="通知仍统一回到房间邮箱；第三方消息渠道成熟前不会伪装成已接入。"
                    meta="当前主线暂不开放站外提醒同步"
                    status="未开放"
                    tone="reserved"
                  />
                  <ControlStaticCell
                    title="家庭 / 双人共享"
                    value="后续扩展"
                    description="当前账户控制只面向单用户长期关系，暂不处理共享席位和协同权限。"
                    meta="不在当前阶段范围内"
                    status="未开放"
                    tone="reserved"
                  />
                </div>
              </ControlSection>
            </div>

            <aside className="control-sidebar">
              <ControlSection
                eyebrow="接下来去哪"
                title="从账户总面去其它真实能力"
                description="每个入口都保留 query 上下文，避免回去时丢失 account/story 语境。"
              >
                <div className="control-cell-list">
                  <ControlLinkCell
                    href={membershipHref}
                    title="会员与权益"
                    description="继续看方案差异、下单入口和订单记录。"
                    status="已可用"
                    tone="live"
                  />
                  <ControlLinkCell
                    href={ordersHref}
                    title="订单、发票与退款"
                    description="查看已购服务和后续售后处理。"
                    status="已可用"
                    tone="live"
                  />
                  <ControlLinkCell
                    href={notificationsHref}
                    title="通知中心"
                    description="去调通知节奏，处理导出与风险提醒。"
                    status="已可用"
                    tone="live"
                  />
                  <ControlLinkCell
                    href={feedbackHref}
                    title="反馈与求助"
                    description="需要人工协助时，从这里回报当前账户上下文。"
                    status="已可用"
                    tone="live"
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
