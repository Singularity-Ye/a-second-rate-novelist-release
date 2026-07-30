import { Suspense } from "react";
import { ReportNewView } from "./report-new-view";
import { FRONTSTAGE_LOADING } from "../../lib/frontstage-copy";

export default function ReportNewPage() {
  return (
    <Suspense fallback={<main data-testid="report-new-page">{FRONTSTAGE_LOADING.report}</main>}>
      <ReportNewView />
    </Suspense>
  );
}
