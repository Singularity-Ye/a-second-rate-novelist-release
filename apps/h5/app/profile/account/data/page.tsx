import { Suspense } from "react";
import { DataRequestsView } from "./data-requests-view";

export default function DataRequestsPage() {
  return (
    <Suspense fallback={<main data-testid="data-requests-page">Loading data requests...</main>}>
      <DataRequestsView />
    </Suspense>
  );
}
