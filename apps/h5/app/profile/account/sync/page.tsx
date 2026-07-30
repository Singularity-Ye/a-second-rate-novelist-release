import { Suspense } from "react";
import { SyncStatusView } from "./sync-status-view";

export default function SyncStatusPage() {
  return (
    <Suspense fallback={<main data-testid="sync-status-page">Loading sync status...</main>}>
      <SyncStatusView />
    </Suspense>
  );
}
