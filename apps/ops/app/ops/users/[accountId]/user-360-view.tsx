"use client";

import React from "react";
import { useEffect, useState } from "react";
import { fetchOpsUser360 } from "../../../lib/ops-api";

export function User360View({ accountId }: { accountId: string }) {
  const [user360, setUser360] = useState<Awaited<ReturnType<typeof fetchOpsUser360>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOpsUser360(accountId)
      .then(setUser360)
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : "Failed to load user 360");
      });
  }, [accountId]);

  return (
    <main className="ops-main" data-testid="ops-user-360-page">
      {error ? <p>{error}</p> : null}
      {!user360 && !error ? <p>Loading user 360...</p> : null}
      {user360 ? (
        <>
          <section className="ops-card">
            <strong>{user360.account.display_name}</strong>
            <p>{user360.account.membership_tier}</p>
            <p>{user360.account.account_status}</p>
          </section>
          <section className="ops-grid">
            <article className="ops-card">
              <strong>Notifications</strong>
              <ul className="ops-list">
                {user360.notifications.map((item) => (
                  <li key={item.notification_id} className="ops-item">
                    <p>{item.source_type}</p>
                    <p>{item.title}</p>
                  </li>
                ))}
              </ul>
            </article>
            <article className="ops-card">
              <strong>Open Cases</strong>
              <ul className="ops-list">
                {user360.open_cases.map((item) => (
                  <li key={item.case_id} className="ops-item">
                    <p>{item.case_type}</p>
                    <p>{item.status}</p>
                  </li>
                ))}
              </ul>
            </article>
          </section>
        </>
      ) : null}
    </main>
  );
}
