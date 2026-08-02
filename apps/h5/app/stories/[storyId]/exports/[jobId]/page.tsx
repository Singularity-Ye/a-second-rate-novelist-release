import { Suspense } from "react";
import { ExportResultView } from "./export-result-view";

export default function ExportResultPage() {
  return (
    <Suspense fallback={<main data-testid="export-result-page">Loading export result...</main>}>
      <ExportResultView />
    </Suspense>
  );
}
