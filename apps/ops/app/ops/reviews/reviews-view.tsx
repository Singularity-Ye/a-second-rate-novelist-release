"use client";

import React from "react";
import { useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { decideOpsReviewCase, fetchOpsReviewCases } from "../../lib/ops-api";

export function ReviewsView() {
  const searchParams = useSearchParams();
  const [reviews, setReviews] = useState<Awaited<ReturnType<typeof fetchOpsReviewCases>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const case_type = searchParams.get("case_type") ?? undefined;
    const status = searchParams.get("status") ?? undefined;

    fetchOpsReviewCases({
      ...(case_type ? { case_type } : {}),
      ...(status ? { status } : {}),
    })
      .then(setReviews)
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : "Failed to load review queue");
      });
  }, [searchParams]);

  const resolveFirstCase = () => {
    const firstCase = reviews?.items[0];
    if (!firstCase) {
      return;
    }

    startTransition(async () => {
      const case_type = searchParams.get("case_type");
      const status = searchParams.get("status");

      await decideOpsReviewCase({
        case_id: firstCase.case_id,
        decision: "warn",
        note: "运营已确认继续保留提醒。",
        notify_user: true,
      });

      const refreshed = await fetchOpsReviewCases({
        ...(case_type ? { case_type } : {}),
        ...(status ? { status } : {}),
      });
      setReviews(refreshed);
    });
  };

  return (
    <main className="ops-main" data-testid="ops-reviews-page">
      {error ? <p>{error}</p> : null}
      {!reviews && !error ? <p>Loading review queue...</p> : null}
      {reviews ? (
        <>
          <section className="ops-card" data-testid="ops-review-counts">
            <strong>Queue Counts</strong>
            <p>{reviews.counts.open}</p>
            <p>{reviews.counts.pending_review}</p>
          </section>
          <section className="ops-card">
            <ul className="ops-list">
              {reviews.items.map((item) => (
                <li key={item.case_id} className="ops-item">
                  <p>{item.case_type}</p>
                  <p>{item.status}</p>
                  <p>{item.summary}</p>
                  <p>
                    {item.entity_type} · {item.entity_id}
                  </p>
                  <p>SLA {item.sla_due_at}</p>
                </li>
              ))}
            </ul>
            <button className="ops-button" onClick={resolveFirstCase} disabled={isPending || reviews.items.length === 0}>
              {isPending ? "Resolving..." : "Resolve First Case"}
            </button>
          </section>
        </>
      ) : null}
    </main>
  );
}
