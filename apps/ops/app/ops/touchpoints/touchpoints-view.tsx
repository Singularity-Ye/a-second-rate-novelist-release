"use client";

import React from "react";
import { useEffect, useState } from "react";
import { fetchOpsBetaAccessOverview, fetchOpsBetaSupportOverview, fetchOpsOverview } from "../../lib/ops-api";

const deliveryChannels = [
  {
    title: "In-app /notifications",
    description: "这是所有异步结果的真源，其他渠道只做投递，不做最终状态判断。",
  },
  {
    title: "微信 / IM",
    description: "适合更新提醒、导出完成与恢复通知，但必须回链到 `/notifications`。",
  },
  {
    title: "Push / App",
    description: "适合作为提醒副本，不能替代通知真源与用户确认页。",
  },
];

export function TouchpointsView() {
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof fetchOpsOverview>> | null>(null);
  const [betaOverview, setBetaOverview] = useState<Awaited<ReturnType<typeof fetchOpsBetaAccessOverview>> | null>(null);
  const [supportOverview, setSupportOverview] = useState<Awaited<ReturnType<typeof fetchOpsBetaSupportOverview>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchOpsOverview(), fetchOpsBetaAccessOverview(), fetchOpsBetaSupportOverview()])
      .then(([opsOverview, beta, support]) => {
        setOverview(opsOverview);
        setBetaOverview(beta);
        setSupportOverview(support);
      })
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : "Failed to load touchpoints");
      });
  }, []);

  return (
    <main className="ops-main" data-testid="ops-touchpoints-page">
      <section className="ops-card ops-hero-card">
        <p className="ops-muted">Touchpoints</p>
        <h2>Push 与触达后台</h2>
        <p>触达后台不是独立真源。它负责看投递节奏、渠道积压和静音窗口，但最终状态仍以 `/notifications` 为准。</p>
      </section>
      {error ? <p>{error}</p> : null}
      {!overview && !error ? <p>Loading touchpoints...</p> : null}
      {overview ? (
        <>
          <section className="ops-grid">
            <article className="ops-card">
              <strong>Notification Backlog</strong>
              <p>{overview.reliability_summary.notification_backlog_count}</p>
              <p>/notifications 真源仍然完整保留。</p>
            </article>
            <article className="ops-card">
              <strong>Freshness</strong>
              <p>{overview.freshness_status}</p>
              <p>若数据变 stale，不允许后台假装实时。</p>
            </article>
          </section>
          <section className="ops-grid ops-secondary-grid">
            {deliveryChannels.map((item) => (
              <article key={item.title} className="ops-card">
                <strong>{item.title}</strong>
                <p>{item.description}</p>
              </article>
            ))}
          </section>
          {betaOverview ? (
            <section className="ops-grid ops-secondary-grid">
              <article className="ops-card">
                <strong>Beta Invite</strong>
                <p>Redeemed {betaOverview.invites.redeemed}</p>
                <p>Available {betaOverview.invites.available}</p>
              </article>
              <article className="ops-card">
                <strong>Attribution</strong>
                <ul className="ops-list">
                  {betaOverview.source_breakdown.map((item) => (
                    <li key={`${item.source_channel}:${item.campaign_key}`} className="ops-item">
                      <p>
                        {item.source_label} · {item.redeemed_count}
                      </p>
                    </li>
                  ))}
                </ul>
              </article>
            </section>
          ) : null}
          {supportOverview ? (
            <section className="ops-grid ops-secondary-grid">
              <article className="ops-card">
                <strong>Beta Support</strong>
                <p>Open {supportOverview.queue.open}</p>
                <p>Follow-up Due {supportOverview.daily_digest.followup_due_today}</p>
                <a className="ops-link" href="/ops/support">
                  Open Support Desk
                </a>
              </article>
              <article className="ops-card">
                <strong>Active Incident</strong>
                {supportOverview.active_incidents.length > 0 ? (
                  <ul className="ops-list">
                    {supportOverview.active_incidents.map((item) => (
                      <li key={item.incident_id} className="ops-item">
                        <p>
                          {item.status} · {item.headline}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>当前没有活跃 incident broadcast。</p>
                )}
              </article>
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
