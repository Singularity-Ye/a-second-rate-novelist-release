import { Suspense } from "react";
import { AssetReviewView } from "./asset-review-view";

export default function AssetReviewPage() {
  return (
    <Suspense fallback={<main data-testid="asset-review-page">Loading asset review...</main>}>
      <AssetReviewView />
    </Suspense>
  );
}
