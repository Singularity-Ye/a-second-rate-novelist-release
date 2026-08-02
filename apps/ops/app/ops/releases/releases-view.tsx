"use client";

import React from "react";
import { useEffect, useState } from "react";
import { fetchOpsReleases } from "../../lib/ops-api";

export function ReleasesView() {
  const [releases, setReleases] = useState<Awaited<ReturnType<typeof fetchOpsReleases>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOpsReleases()
      .then(setReleases)
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : "Failed to load releases");
      });
  }, []);

  return (
    <main className="ops-main" data-testid="ops-releases-page">
      {error ? <p>{error}</p> : null}
      {!releases && !error ? <p>Loading releases...</p> : null}
      {releases ? (
        <>
          <section className="ops-card">
            <strong>Release Candidates</strong>
            <ul className="ops-list">
              {releases.releases.map((item) => (
                <li key={item.release_id} className="ops-item">
                  <p>{item.release_id}</p>
                  <p>{item.target_environment}</p>
                  <p>{item.artifact_sha}</p>
                </li>
              ))}
            </ul>
          </section>
          <section className="ops-card">
            <strong>Deployments</strong>
            <ul className="ops-list">
              {releases.deployments.map((item) => (
                <li key={item.deployment_id} className="ops-item">
                  <p>{item.to_environment}</p>
                  <p>{item.status}</p>
                  <p>{item.verification_result}</p>
                  <p>{item.migration_status}</p>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </main>
  );
}
