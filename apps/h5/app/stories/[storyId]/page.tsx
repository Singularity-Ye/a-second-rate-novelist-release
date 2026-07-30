import { Suspense } from "react";
import { FRONTSTAGE_LOADING } from "../../lib/frontstage-copy";
import { StoryDetailView } from "./story-detail-view";

export default function StoryDetailPage() {
  return (
    <Suspense fallback={<main data-testid="story-detail-page">{FRONTSTAGE_LOADING.chapter}</main>}>
      <StoryDetailView />
    </Suspense>
  );
}
