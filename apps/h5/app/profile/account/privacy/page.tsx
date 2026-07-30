import { Suspense } from "react";
import { PrivacyView } from "./privacy-view";

export default function PrivacyPage() {
  return (
    <Suspense fallback={<main data-testid="privacy-page">Loading privacy...</main>}>
      <PrivacyView />
    </Suspense>
  );
}
