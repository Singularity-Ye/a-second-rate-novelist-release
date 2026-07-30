"use client";

import React from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { MembershipOrderListResponse } from "@erliu/shared-contracts";
import { fetchMembershipOrders, requestMembershipRefund } from "../../../lib/account-membership-api";
import { useAccountSurfaceSession } from "../../../lib/account-surface-session";
import {
  FRONTSTAGE_LOADING,
  toOrderStatusLabel,
  toFrontstageErrorCopy,
} from "../../../lib/frontstage-copy";
import { AccountRecoveryStateCard } from "../control-plane-kit";

const DEFAULT_REFUND_REASON = "希望停止当前会员并保留退款处理记录。";

function planLabel(planId: string) {
  return planId === "plan_plus" ? "故事 Plus" : "故事会员";
}

function billingCycleLabel(billingCycle: string) {
  return billingCycle === "monthly" ? "月付" : billingCycle;
}

function formatAmount(amount: number) {
  return `${(amount / 100).toFixed(2)} 元`;
}

function refundLabel(status: MembershipOrderListResponse["orders"][number]["refund_status"]) {
  switch (status) {
    case "not_requested":
      return "未申请";
    case "pending_review":
      return "审核中";
    case "resolved":
      return "已处理";
    case "rejected":
      return "未通过";
    default:
      return status;
  }
}

export function OrdersView() {
  const session = useAccountSurfaceSession("/profile/account/orders");
  const accountToken = session.accountToken;
  const membershipHref = session.queryString ? `/profile/account/membership?${session.queryString}` : "/profile/account/membership";
  const [orders, setOrders] = useState<MembershipOrderListResponse["orders"]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [submittingOrderId, setSubmittingOrderId] = useState<string | null>(null);

  async function loadOrders(accountToken: string) {
    const result = await fetchMembershipOrders(accountToken);
    setOrders(result.orders);
    setLoaded(true);
    return result;
  }

  useEffect(() => {
    if (!accountToken) {
      return;
    }

    void loadOrders(accountToken).catch((reason) => {
      setError(toFrontstageErrorCopy(reason, "订单记录这会儿还没打开。"));
      setLoaded(true);
    });
  }, [accountToken]);

  if (session.recoveryState !== "ready") {
    return (
      <main className="surface orders-surface" data-testid="orders-page">
        <AccountRecoveryStateCard
          state={session.recoveryState}
          retryHref={session.retryHref}
          roomHref={session.roomHref}
          homeHref={session.homeHref}
        />
      </main>
    );
  }

  async function handleRefund(orderId: string) {
    if (!accountToken || submittingOrderId) {
      return;
    }

    setSubmittingOrderId(orderId);
    setError(null);

    try {
      const result = await requestMembershipRefund({
        account_token: accountToken,
        order_id: orderId,
        reason: DEFAULT_REFUND_REASON,
      });
      setOrders((current) =>
        current.map((item) =>
          item.order_id === orderId
            ? {
                ...item,
                refund_status: result.refund_status,
                refund_case_id: result.case_id,
              }
            : item,
        ),
      );
    } catch (reason) {
      setError(toFrontstageErrorCopy(reason, "这次退款申请还没提交成功。"));
    } finally {
      setSubmittingOrderId(null);
    }
  }

  return (
    <main className="surface orders-surface" data-testid="orders-page">
      {error ? <p>{error}</p> : null}
      {!loaded && !error ? <p>{FRONTSTAGE_LOADING.profile}</p> : null}

      <div className="f9-layout">
        <div className="f9-main">
          <section className="hero-card f9-hero">
            <p className="hero-card__eyebrow">订单与发票</p>
            <h1>订单与发票</h1>
            <p>这里把会员成交记录、发票下载和退款申请放到同一处，避免你在会员、求助和订单之间来回跳。</p>
          </section>

          {orders.length ? (
            <section className="f9-summary-grid">
              {orders.map((order) => (
                <article className="panel-card f9-summary-card" key={order.order_id}>
                  <p className="panel-card__eyebrow">{planLabel(order.target_plan_id)}</p>
                  <h2>{order.order_id}</h2>
                  <p>
                    {billingCycleLabel(order.billing_cycle)} / {formatAmount(order.payable_amount)} / {toOrderStatusLabel(order.status)}
                  </p>
                  <p>下单时间：{order.created_at}</p>
                  <div className="f9-button-row">
                    <Link className="f9-link-button" href={order.invoice_download_url}>
                      下载发票
                    </Link>
                    <button
                      type="button"
                      disabled={submittingOrderId === order.order_id || order.refund_status !== "not_requested"}
                      onClick={() => void handleRefund(order.order_id)}
                    >
                      申请退款
                    </button>
                  </div>
                  <p data-testid={`refund-state-${order.order_id}`}>{refundLabel(order.refund_status)}</p>
                </article>
              ))}
            </section>
          ) : null}

          {loaded && !orders.length && !error ? (
            <section className="panel-card f9-actions-card">
              <p className="panel-card__eyebrow">当前没有订单</p>
              <h2>还没有会员订单</h2>
              <p>先去会员页完成一次购买，订单、发票和退款状态才会进入这张面板。</p>
            </section>
          ) : null}
        </div>

        <aside className="f9-sidebar">
          <section className="panel-card f9-sidebar-card">
            <p className="panel-card__eyebrow">接下来</p>
            <h2>相关入口</h2>
            <div className="f9-link-grid">
              <Link href={membershipHref}>返回会员与权益</Link>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
