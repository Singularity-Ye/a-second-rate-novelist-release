import { Suspense } from "react";
import { StoryIntakeView } from "./story-intake-view";

export default function StoriesNewPage() {
  return (
    <Suspense fallback={<main data-testid="story-intake-page">Loading story intake...</main>}>
      <StoryIntakeView />
    </Suspense>
  );
}
