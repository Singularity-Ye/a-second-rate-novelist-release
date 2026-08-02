import { Suspense } from "react";
import { OverviewView } from "./overview-view";

export default function OpsOverviewPage() {
  return (
    <Suspense fallback={<main data-testid="ops-overview-page">Loading overview...</main>}>
      <OverviewView />
    </Suspense>
  );
}
