"use client";

import React from "react";
import { useEffect, useState } from "react";
import { fetchOpsBackups } from "../../lib/ops-api";

export function BackupsView() {
  const [backups, setBackups] = useState<Awaited<ReturnType<typeof fetchOpsBackups>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOpsBackups()
      .then(setBackups)
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : "Failed to load backups");
      });
  }, []);

  return (
    <main className="ops-main" data-testid="ops-backups-page">
      {error ? <p>{error}</p> : null}
      {!backups && !error ? <p>Loading backups...</p> : null}
      {backups ? (
        <>
          <section className="ops-card">
            <strong>Snapshots</strong>
            <ul className="ops-list">
              {backups.snapshots.map((item) => (
                <li key={item.snapshot_id} className="ops-item">
                  <p>{item.environment_key}</p>
                  <p>{item.snapshot_type}</p>
                  <p>{item.status}</p>
                </li>
              ))}
            </ul>
          </section>
          <section className="ops-card">
            <strong>Latest Restore Drill</strong>
            <p>{backups.latest_restore_drill?.result ?? "none"}</p>
            <p>{backups.latest_restore_drill?.notes ?? "No restore drill yet."}</p>
          </section>
        </>
      ) : null}
    </main>
  );
}
