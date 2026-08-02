import { Suspense } from "react";
import { FeedbackView } from "./feedback-view";
import { FRONTSTAGE_LOADING } from "../lib/frontstage-copy";

export default function FeedbackPage() {
  return (
    <Suspense fallback={<main data-testid="feedback-page">{FRONTSTAGE_LOADING.report}</main>}>
      <FeedbackView />
    </Suspense>
  );
}
