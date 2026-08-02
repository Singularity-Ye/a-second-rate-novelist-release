import { Suspense } from "react";
import { BranchDetailView } from "./branch-detail-view";

export default function BranchDetailPage() {
  return (
    <Suspense fallback={<main data-testid="branch-detail-page">Loading branch...</main>}>
      <BranchDetailView />
    </Suspense>
  );
}
