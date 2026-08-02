"use client";

import React from "react";
import { useEffect, useState } from "react";
import { fetchOpsOverview, fetchOpsReviewCases, fetchOpsUsers } from "../../lib/ops-api";

export function MembershipsView() {
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof fetchOpsOverview>> | null>(null);
  const [users, setUsers] = useState<Awaited<ReturnType<typeof fetchOpsUsers>> | null>(null);
  const [cases, setCases] = useState<Awaited<ReturnType<typeof fetchOpsReviewCases>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchOpsOverview(),
      fetchOpsUsers({
        membership_tier: "plus",
      }),
      fetchOpsReviewCases({
        case_type: "membership_exception",
      }),
    ])
      .then(([nextOverview, nextUsers, nextCases]) => {
        setOverview(nextOverview);
        setUsers(nextUsers);
        setCases(nextCases);
      })
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : "Failed to load memberships desk");
      });
  }, []);

  return (
    <main className="ops-main" data-testid="ops-memberships-page">
      <section className="ops-card ops-hero-card">
        <p className="ops-muted">Memberships</p>
        <h2>会员与支付后台</h2>
        <p>把故事 Plus、增值包、支付异常和会员工单放到同一个运营视角里，避免 revenue 和 support 断开。</p>
      </section>
      {error ? <p>{error}</p> : null}
      {!overview && !users && !cases && !error ? <p>Loading memberships...</p> : null}
      {overview && users && cases ? (
        <>
          <section className="ops-grid">
            <article className="ops-card">
              <strong>Revenue Snapshot</strong>
              <p>Paid Orders {overview.revenue_summary.paid_order_count}</p>
              <p>Paid Amount {overview.revenue_summary.paid_amount_total}</p>
            </article>
            <article className="ops-card">
              <strong>Active Members</strong>
              <p>Active Subscriptions {overview.revenue_summary.active_subscription_count}</p>
              <p>Plus Users {users.items.length}</p>
            </article>
            <article className="ops-card">
              <strong>Payment Exceptions</strong>
              <p>Open {cases.counts.open}</p>
              <p>Pending Review {cases.counts.pending_review}</p>
            </article>
          </section>
          <section className="ops-grid ops-secondary-grid">
            <article className="ops-card">
              <strong>Primary Lanes</strong>
              <ul className="ops-list">
                <li className="ops-item">
                  <p>会员订单与方案变更</p>
                  <a className="ops-link" href="/ops/users?membership_tier=plus">
                    Open Plus Users
                  </a>
                </li>
                <li className="ops-item">
                  <p>支付异常与工单</p>
                  <a className="ops-link" href="/ops/reviews?case_type=membership_exception&status=open">
                    Open Exceptions
                  </a>
                </li>
              </ul>
            </article>
            <article className="ops-card">
              <strong>Recent Plus Accounts</strong>
              <ul className="ops-list">
                {users.items.length > 0 ? (
                  users.items.slice(0, 3).map((item) => (
                    <li key={item.user_id} className="ops-item">
                      <p>{item.display_name}</p>
                      <p>{item.primary_channel}</p>
                      <a className="ops-link" href={`/ops/users/${item.user_id}`}>
                        View 360
                      </a>
                    </li>
                  ))
                ) : (
                  <li className="ops-item">
                    <p>当前没有 Plus 用户样本，后续由 shared-dev/staging 数据补齐。</p>
                  </li>
                )}
              </ul>
            </article>
          </section>
        </>
      ) : null}
    </main>
  );
}
