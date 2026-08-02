"use client";

import React from "react";
import { useEffect, useState } from "react";
import { fetchOpsStory360 } from "../../../lib/ops-api";

export function Story360View({ storyId }: { storyId: string }) {
  const [story360, setStory360] = useState<Awaited<ReturnType<typeof fetchOpsStory360>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOpsStory360(storyId)
      .then(setStory360)
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : "Failed to load story 360");
      });
  }, [storyId]);

  return (
    <main className="ops-main" data-testid="ops-story-360-page">
      {error ? <p>{error}</p> : null}
      {!story360 && !error ? <p>Loading story 360...</p> : null}
      {story360 ? (
        <section className="ops-card">
          <strong>{story360.story.title}</strong>
          <p>{story360.export_summary.latest_job_status}</p>
          <p>{story360.export_summary.latest_risk_result}</p>
        </section>
      ) : null}
    </main>
  );
}
