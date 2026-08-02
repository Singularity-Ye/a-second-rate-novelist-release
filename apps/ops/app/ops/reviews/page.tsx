import { Suspense } from "react";
import { ReviewsView } from "./reviews-view";

export default function OpsReviewsPage() {
  return (
    <Suspense fallback={<main data-testid="ops-reviews-page">Loading reviews...</main>}>
      <ReviewsView />
    </Suspense>
  );
}
