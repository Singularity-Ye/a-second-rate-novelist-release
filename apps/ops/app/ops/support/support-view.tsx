"use client";

import React from "react";
import { useEffect, useState } from "react";
import { createOpsBetaIncident, fetchOpsBetaSupportOverview, resolveOpsBetaIncident } from "../../lib/ops-api";

export function SupportView() {
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof fetchOpsBetaSupportOverview>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionState, setActionState] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadOverview() {
    const result = await fetchOpsBetaSupportOverview();
    setOverview(result);
    return result;
  }

  useEffect(() => {
    loadOverview().catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Failed to load beta support overview");
    });
  }, []);

  function handleCreateIncident(status: "degraded" | "stop_service") {
    setBusy(true);
    createOpsBetaIncident({
      severity: status === "stop_service" ? "critical" : "warn",
      status,
      headline: status === "stop_service" ? "Beta 暂停接入中" : "微信回流出现积压",
      summary:
        status === "stop_service"
          ? "当前正在执行停服保护，新消息会暂时停在入口外。"
          : "当前微信 ClawBot 存在 5-10 分钟延迟，H5 仍可继续使用。",
      recommended_action:
        status === "stop_service" ? "先引导用户回到 H5 与 notifications 等待恢复通知。" : "优先引导用户切回 H5 /chat 与 /room。",
      program_key: "external_beta_phase0",
      affected_surfaces:
        status === "stop_service"
          ? ["chat", "room", "notifications", "export", "account"]
          : ["chat", "room", "notifications"],
    })
      .then(async (created) => {
        setActionState(`incident:${created.status}:${created.incident_id}`);
        await loadOverview();
      })
      .finally(() => {
        setBusy(false);
      });
  }

  function handleResolveIncident() {
    const incident = overview?.active_incidents[0];
    if (!incident) {
      return;
    }

    setBusy(true);
    resolveOpsBetaIncident(incident.incident_id)
      .then(async (resolved) => {
        setActionState(`incident:${resolved.status}:${resolved.incident_id}`);
        await loadOverview();
      })
      .finally(() => {
        setBusy(false);
      });
  }

  return (
    <main className="ops-main" data-testid="ops-support-page">
      <section className="ops-card ops-hero-card">
        <p className="ops-muted">Support</p>
        <h2>Beta Support Desk</h2>
        <p>这里接住 seed user 反馈、SLA 跟进、停服/降级广播和 Day 1-Day 14 每日 follow-up，不再靠口头同步。</p>
      </section>
      {error ? <p>{error}</p> : null}
      {!overview && !error ? <p>Loading beta support...</p> : null}
      {overview ? (
        <>
          <section className="ops-grid">
            <article className="ops-card">
              <strong>Open Queue</strong>
              <p>{overview.queue.open}</p>
              <p>Pending User {overview.queue.pending_user}</p>
            </article>
            <article className="ops-card">
              <strong>Daily Digest</strong>
              <p>{overview.daily_digest.active_beta_accounts}</p>
              <p>New Cases {overview.daily_digest.new_cases_today}</p>
              <p>Follow-up Due {overview.daily_digest.followup_due_today}</p>
            </article>
            <article className="ops-card">
              <strong>Top Categories</strong>
              <p>{overview.daily_digest.top_categories.join(" / ") || "none"}</p>
            </article>
          </section>

          <section className="ops-grid ops-secondary-grid">
            <article className="ops-card">
              <strong>Incident Broadcast</strong>
              <p>停服/降级通知必须回流到用户 notifications 与 feedback history。</p>
              <div className="f9-button-row">
                <button type="button" disabled={busy} onClick={() => handleCreateIncident("degraded")}>
                  发布降级通知
                </button>
                <button type="button" disabled={busy} onClick={() => handleCreateIncident("stop_service")}>
                  发布停服通知
                </button>
                <button type="button" disabled={busy || !overview.active_incidents.length} onClick={handleResolveIncident}>
                  标记已恢复
                </button>
              </div>
              {actionState ? <p data-testid="ops-support-action-state">{actionState}</p> : null}
            </article>

            <article className="ops-card">
              <strong>Recent Cases</strong>
              <ul className="ops-list">
                {overview.recent_cases.length > 0 ? (
                  overview.recent_cases.map((item) => (
                    <li key={item.case_id} className="ops-item">
                      <p>
                        {item.case_type} · {item.priority}
                      </p>
                      <p>{item.status}</p>
                      <p>{item.summary}</p>
                    </li>
                  ))
                ) : (
                  <li className="ops-item">
                    <p>当前没有待处理 feedback case。</p>
                  </li>
                )}
              </ul>
            </article>
          </section>

          {overview.active_incidents.length ? (
            <section className="ops-card">
              <strong>Active Incident</strong>
              <ul className="ops-list">
                {overview.active_incidents.map((item) => (
                  <li key={item.incident_id} className="ops-item">
                    <p>
                      {item.status} · {item.headline}
                    </p>
                    <p>{item.summary}</p>
                    <p>{item.recommended_action}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
