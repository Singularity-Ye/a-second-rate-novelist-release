"use client";

import React from "react";
import { useEffect, useState } from "react";
import { fetchOpsFunnel } from "../../../lib/ops-api";

export function FunnelView({ funnelKey }: { funnelKey: string }) {
  const [funnel, setFunnel] = useState<Awaited<ReturnType<typeof fetchOpsFunnel>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOpsFunnel(funnelKey)
      .then(setFunnel)
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : "Failed to load funnel");
      });
  }, [funnelKey]);

  return (
    <main className="ops-main" data-testid="ops-funnel-page">
      {error ? <p>{error}</p> : null}
      {!funnel && !error ? <p>Loading funnel...</p> : null}
      {funnel ? (
        <>
          <section className="ops-card">
            <strong>{funnel.funnel_key}</strong>
            <p>{funnel.freshness_status}</p>
            <p>{funnel.sample_size}</p>
          </section>
          <section className="ops-card">
            <ul className="ops-list">
              {funnel.steps.map((step) => (
                <li key={step.step_key} className="ops-item">
                  <p>{step.step_key}</p>
                  <p>{step.user_count}</p>
                  <p>{step.conversion_rate}</p>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </main>
  );
}
