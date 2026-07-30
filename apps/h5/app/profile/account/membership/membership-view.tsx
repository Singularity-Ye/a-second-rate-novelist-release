"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import type { AccountOverviewResponse } from "@erliu/shared-contracts";
import { createMembershipOrder, fetchAccountOverview } from "../../../lib/account-membership-api";
import { useAccountSurfaceSession } from "../../../lib/account-surface-session";
import {
  FRONTSTAGE_LOADING,
  toCheckoutStatusLabel,
  toFrontstageErrorCopy,
} from "../../../lib/frontstage-copy";
import {
  AccountRecoveryStateCard,
  ControlActionRow,
  ControlLinkCell,
  ControlSection,
  ControlStaticCell,
  ControlStrip,
  planLabel,
  withAccountQuery,
} from "../control-plane-kit";

export function MembershipView() {
  const session = useAccountSurfaceSession("/profile/account/membership");
  const [overview, setOverview] = useState<AccountOverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [purchaseState, setPurchaseState] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const ordersHref = withAccountQuery("/profile/account/orders", session.queryString);

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
      setError(toFrontstageErrorCopy(reason, "会员页这会儿还没打开。"));
    });
  }, [session.accountToken]);

  if (session.recoveryState !== "ready") {
    return (
      <main className="surface membership-surface" data-testid="membership-page">
        <AccountRecoveryStateCard
          state={session.recoveryState}
          retryHref={session.retryHref}
          roomHref={session.roomHref}
          homeHref={session.homeHref}
        />
      </main>
    );
  }

  async function handlePurchase() {
    const accountToken = session.accountToken;
    if (!accountToken || submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await createMembershipOrder(accountToken);
      setPurchaseState(result.checkout_status);
      await loadOverview(accountToken);
    } catch (reason) {
      setError(toFrontstageErrorCopy(reason, "这次开通还没成功，请稍后再试。"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="surface membership-surface" data-testid="membership-page">
      {error ? <p>{error}</p> : null}
      {!overview && !error ? <p>{FRONTSTAGE_LOADING.profile}</p> : null}

      {overview ? (
        <>
          <section className="story-section control-hero" data-testid="membership-summary">
            <p className="story-section__eyebrow">会员与权益</p>
            <h1 className="story-section__title">买的是继续连载的容量，不是技术面板</h1>
            <p className="story-section__copy">
              这里用故事槽位、分支能力、导出权益和资料容量解释会员价值，让用户知道是在给一段长期关系续费。
            </p>
            <ControlStrip
              items={[
                {
                  label: "当前方案",
                  value: planLabel(overview.entitlements.current_plan_id),
                },
                {
                  label: "故事槽位",
                  value: `还可再养 ${overview.runtime_control.remaining.story_slots} 条`,
                },
                {
                  label: "分支额度",
                  value: `还可再开 ${overview.runtime_control.remaining.branch_quota} 条`,
                },
                {
                  label: "导出权益",
                  value: `还可导出 ${overview.runtime_control.remaining.export_quota} 次`,
                },
              ]}
            />
          </section>

          <div className="control-layout">
            <div className="control-main">
              <ControlSection
                eyebrow="方案价值"
                title="先说你得到的故事能力"
                description="会员语言直接对应持续追更、改稿、导出和整理资料这些真实动作。"
                testId="membership-entitlements"
              >
                <div className="control-cell-list">
                  <ControlStaticCell
                    title={planLabel(overview.entitlements.current_plan_id)}
                    value="持续连载方案"
                    description="适合已经建立长期关系、希望稳定续写并持续整理私人宇宙的读者。"
                    meta="不售卖 token，不用底层模型成本做卖点"
                    status="已可用"
                    tone="live"
                  />
                  <ControlStaticCell
                    title="故事槽位"
                    value={`总槽位 ${overview.entitlements.story_slots}`}
                    description="当故事槽位接近上限时，你看到的是还能继续养多少条连载，而不是抽象额度。"
                    meta={`已在连载 ${overview.runtime_control.usage.active_story_count} 条`}
                    status="已可用"
                    tone="live"
                  />
                  <ControlStaticCell
                    title="分支与导出"
                    value={`分支 ${overview.entitlements.branch_quota} · 导出 ${overview.entitlements.export_quota}`}
                    description="分支额度对应改稿和多版本尝试，导出权益对应投稿、交付和长期存档。"
                    meta={`剩余分支 ${overview.runtime_control.remaining.branch_quota} · 剩余导出 ${overview.runtime_control.remaining.export_quota}`}
                    status="已可用"
                    tone="live"
                  />
                  <ControlStaticCell
                    title="资料容量"
                    value={`${overview.entitlements.asset_storage_mb} MB`}
                    description="参考资料和设定资产有独立容量，不会在会员说明里被混成技术资源表。"
                    meta="和资产库、导出服务分别计量"
                    status="已可用"
                    tone="live"
                  />
                </div>
              </ControlSection>

              <ControlSection
                eyebrow="购买入口"
                title="继续把这段关系养下去"
                description="开通后会立即刷新权益预览，但仍用同一套故事语言说明你得到的是什么。"
              >
                <ControlActionRow>
                  <button type="button" disabled={submitting} onClick={() => void handlePurchase()}>
                    开通故事 Plus
                  </button>
                  <Link className="control-link-button" href={ordersHref}>
                    查看订单、发票与退款
                  </Link>
                </ControlActionRow>
                {purchaseState ? <p data-testid="membership-purchase-state">{toCheckoutStatusLabel(purchaseState)}</p> : null}
              </ControlSection>
            </div>

            <aside className="control-sidebar">
              <ControlSection
                eyebrow="未开放边界"
                title="这些专业能力先明确保留位"
                description="更深层的专业扩展和家庭共享暂时都不在当前范围里；现在只把会员价值说清楚。"
              >
                <div className="control-cell-list">
                  <ControlStaticCell
                    title="专业能力扩展"
                    value="专业版预留"
                    description="后续若开放，会以单独说明页介绍，不会混进基础会员页里。"
                    status="未开放"
                    tone="reserved"
                  />
                  <ControlStaticCell
                    title="家庭 / 双人共享"
                    value="后续扩展"
                    description="当前仅服务单用户长期关系，暂不处理共享席位与共同资产权限。"
                    status="未开放"
                    tone="reserved"
                  />
                  <ControlLinkCell
                    href={ordersHref}
                    title="订单记录"
                    description="已经购买过的权益、发票和退款状态仍可在订单页查看。"
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
