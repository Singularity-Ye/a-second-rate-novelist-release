"use client";

import React from "react";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchOpsUsers } from "../../lib/ops-api";

export function UsersSearchView() {
  const searchParams = useSearchParams();
  const [result, setResult] = useState<Awaited<ReturnType<typeof fetchOpsUsers>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = searchParams.get("q") ?? undefined;
    const membership_tier = searchParams.get("membership_tier") ?? undefined;
    const has_open_case = searchParams.get("has_open_case");

    fetchOpsUsers({
      ...(q ? { q } : {}),
      ...(membership_tier ? { membership_tier } : {}),
      ...(has_open_case ? { has_open_case: has_open_case === "true" } : {}),
    })
      .then(setResult)
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : "Failed to load ops users");
      });
  }, [searchParams]);

  return (
    <main className="ops-main" data-testid="ops-users-page">
      {error ? <p>{error}</p> : null}
      {!result && !error ? <p>Loading users...</p> : null}
      {result ? (
        <section className="ops-card">
          <ul className="ops-list">
            {result.items.map((item) => (
              <li key={item.user_id} className="ops-item">
                <p>{item.display_name}</p>
                <p>{item.membership_tier}</p>
                <p>{String(item.pii_masked)}</p>
                <a className="ops-link" href={`/ops/users/${item.user_id}`}>
                  View 360
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
