import { Suspense } from "react";
import { ArchiveIntentsView } from "../../../../archive/intents/archive-intents-view";

export default async function StoryRecentIntentsPage({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  const { storyId } = await params;

  return (
    <Suspense fallback={<main data-testid="archive-intents-page">Loading recent notes...</main>}>
      <ArchiveIntentsView
        allowAccountSurfaceFallback
        surfacePath={`/stories/${storyId}/intents/recent`}
      />
    </Suspense>
  );
}
