"use client";

import React from "react";
import { useEffect, useState } from "react";
import { fetchOpsEnvironments } from "../../lib/ops-api";

export function EnvironmentsView() {
  const [environments, setEnvironments] = useState<Awaited<ReturnType<typeof fetchOpsEnvironments>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOpsEnvironments()
      .then(setEnvironments)
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : "Failed to load environments");
      });
  }, []);

  return (
    <main className="ops-main" data-testid="ops-environments-page">
      {error ? <p>{error}</p> : null}
      {!environments && !error ? <p>Loading environments...</p> : null}
      {environments ? (
        <section className="ops-grid">
          {environments.items.map((item) => (
            <article key={item.environment_key} className="ops-card">
              <strong>{item.environment_key}</strong>
              <p>{item.domain}</p>
              <p>{item.release_version}</p>
              <p>{item.health_status}</p>
              {item.blockers.length > 0 ? (
                <ul className="ops-list">
                  {item.blockers.map((blocker) => (
                    <li key={blocker} className="ops-item">
                      <p>{blocker}</p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </section>
      ) : null}
    </main>
  );
}
