import { Suspense } from "react";
import { StoryExportsView } from "./story-exports-view";

export default function StoryExportsPage() {
  return (
    <Suspense fallback={<main data-testid="story-exports-page">Loading exports...</main>}>
      <StoryExportsView />
    </Suspense>
  );
}
