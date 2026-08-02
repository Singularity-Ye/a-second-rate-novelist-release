"use client";

import React from "react";
import { useEffect, useState } from "react";
import { fetchOpsOverview } from "../../lib/ops-api";

export function OverviewView() {
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof fetchOpsOverview>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOpsOverview()
      .then(setOverview)
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : "Failed to load ops overview");
      });
  }, []);

  return (
    <main className="ops-main" data-testid="ops-overview-page">
      {error ? <p>{error}</p> : null}
      {!overview && !error ? <p>Loading overview...</p> : null}
      {overview ? (
        <>
          <section className="ops-grid">
            <article className="ops-card">
              <strong>North Star</strong>
              <p>{overview.north_star.metric_key}</p>
              <p>{overview.north_star.value}</p>
              <p>{overview.freshness_status}</p>
            </article>
            <article className="ops-card" data-testid="ops-overview-open-cases">
              <strong>Open Cases</strong>
              <p>{overview.open_case_counts.open}</p>
              <p>{overview.open_case_counts.pending_review}</p>
            </article>
            <article className="ops-card">
              <strong>Revenue</strong>
              <p>{overview.revenue_summary.paid_order_count}</p>
              <p>{overview.revenue_summary.paid_amount_total}</p>
            </article>
          </section>

          <section className="ops-card" data-testid="ops-overview-funnel-summary">
            <strong>Funnels</strong>
            <ul className="ops-list">
              {overview.funnel_summary.map((item) => (
                <li key={item.funnel_key} className="ops-item">
                  <p>{item.funnel_key}</p>
                  <p>{item.conversion_rate}</p>
                  <a className="ops-link" href={`/ops/funnels/${item.funnel_key}`}>
                    View Funnel
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </main>
  );
}
