import { Suspense } from "react";
import { DemoStoriesView } from "./demo-stories-view";

export default function DemoStoriesPage() {
  return (
    <Suspense fallback={<main data-testid="demo-stories-page">Loading demo stories...</main>}>
      <DemoStoriesView />
    </Suspense>
  );
}
