"use client";

import React from "react";
import { useEffect, useState } from "react";
import type { OpsCaseType } from "@erliu/shared-contracts";
import { fetchOpsReviewCases } from "../../lib/ops-api";

export function OpsCaseDeskView(input: {
  testId: string;
  title: string;
  eyebrow: string;
  description: string;
  caseType: OpsCaseType;
  queueLabel: string;
  checklist: string[];
}) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof fetchOpsReviewCases>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOpsReviewCases({
      case_type: input.caseType,
    })
      .then(setResult)
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : "Failed to load ops desk");
      });
  }, [input.caseType]);

  return (
    <main className="ops-main" data-testid={input.testId}>
      <section className="ops-card ops-hero-card">
        <p className="ops-muted">{input.eyebrow}</p>
        <h2>{input.title}</h2>
        <p>{input.description}</p>
      </section>
      {error ? <p>{error}</p> : null}
      {!result && !error ? <p>Loading ops desk...</p> : null}
      {result ? (
        <>
          <section className="ops-grid">
            <article className="ops-card">
              <strong>{input.queueLabel}</strong>
              <p>Open {result.counts.open}</p>
              <p>Pending Review {result.counts.pending_review}</p>
            </article>
            <article className="ops-card">
              <strong>SLA</strong>
              <p>Resolved {result.counts.resolved}</p>
              <p>Pending User {result.counts.pending_user}</p>
            </article>
          </section>
          <section className="ops-grid ops-secondary-grid">
            <article className="ops-card">
              <strong>Desk Checklist</strong>
              <ul className="ops-list">
                {input.checklist.map((item) => (
                  <li key={item} className="ops-item">
                    <p>{item}</p>
                  </li>
                ))}
              </ul>
            </article>
            <article className="ops-card">
              <strong>Queue Cases</strong>
              <ul className="ops-list">
                {result.items.length > 0 ? (
                  result.items.map((item) => (
                    <li key={item.case_id} className="ops-item">
                      <p>
                        {item.case_type} · {item.priority}
                      </p>
                      <p>{item.status}</p>
                      <p>{item.summary}</p>
                      <a className="ops-link" href={`/ops/reviews?case_type=${item.case_type}&status=${item.status}`}>
                        Open Queue
                      </a>
                    </li>
                  ))
                ) : (
                  <li className="ops-item">
                    <p>当前没有待处理 case，显示为空队列与 SLA 摘要。</p>
                  </li>
                )}
              </ul>
            </article>
          </section>
        </>
      ) : null}
    </main>
  );
}
