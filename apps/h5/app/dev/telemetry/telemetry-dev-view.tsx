"use client";

import React from "react";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { DeepLinkExchangeResponse } from "@erliu/shared-contracts";
import { fetchTelemetryFeed, fetchTelemetryFunnel } from "../../lib/telemetry-api";
import { exchangeSessionToken } from "../../lib/session-bridge";

export function TelemetryDevView({ token: forcedToken }: { token?: string } = {}) {
  const searchParams = useSearchParams();
  const [session, setSession] = useState<DeepLinkExchangeResponse | null>(null);
  const [funnel, setFunnel] = useState<Awaited<ReturnType<typeof fetchTelemetryFunnel>> | null>(null);
  const [feed, setFeed] = useState<Awaited<ReturnType<typeof fetchTelemetryFeed>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = forcedToken ?? searchParams.get("token");

    if (!token) {
      setError("Missing session token.");
      return;
    }

    setError(null);

    exchangeSessionToken(token)
      .then(async (result) => {
        setSession(result);
        const [funnelResult, feedResult] = await Promise.all([
          fetchTelemetryFunnel(result.account_token),
          fetchTelemetryFeed(result.account_token),
        ]);
        setFunnel(funnelResult);
        setFeed(feedResult);
      })
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : "Telemetry view failed");
      });
  }, [forcedToken, searchParams]);

  return (
    <main data-testid="telemetry-dev-page">
      <h1>Telemetry Dev</h1>
      {error ? <p>{error}</p> : null}
      {session ? <p>{session.account_token}</p> : <p>Loading telemetry session...</p>}

      {funnel ? (
        <section data-testid="telemetry-funnel-panel">
          <h2>Funnel</h2>
          <p>{funnel.totals.completed_step_count}</p>
          <ul>
            {funnel.steps.map((step) => (
              <li key={step.step_key}>
                <p>{step.event_name}</p>
                <p>{step.label}</p>
                <p>{step.count}</p>
                <p>{step.audit_count}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {feed ? (
        <>
          <section data-testid="telemetry-events-panel">
            <h2>Recent Events</h2>
            <ul>
              {feed.events.map((event, index) => (
                <li key={`${event.event_name}-${index}`}>
                  <p>{event.event_name}</p>
                  <p>{JSON.stringify(event.payload)}</p>
                </li>
              ))}
            </ul>
          </section>

          <section data-testid="telemetry-audit-panel">
            <h2>Audit Logs</h2>
            <ul>
              {feed.audit_logs.map((event, index) => (
                <li key={`${event.event_name}-${index}`}>
                  <p>{event.event_name}</p>
                  <p>{JSON.stringify(event.payload)}</p>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </main>
  );
}
