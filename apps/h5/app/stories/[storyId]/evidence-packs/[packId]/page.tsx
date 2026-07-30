import { Suspense } from "react";
import { EvidencePackView } from "./evidence-pack-view";

export default function EvidencePackPage() {
  return (
    <Suspense fallback={<main data-testid="evidence-pack-page">Loading evidence pack...</main>}>
      <EvidencePackView />
    </Suspense>
  );
}
