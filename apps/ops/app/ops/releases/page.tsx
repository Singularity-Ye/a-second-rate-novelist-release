import { Suspense } from "react";
import { ReleasesView } from "./releases-view";

export default function OpsReleasesPage() {
  return (
    <Suspense fallback={<main data-testid="ops-releases-page">Loading releases...</main>}>
      <ReleasesView />
    </Suspense>
  );
}
