import { Suspense } from "react";
import { EnvironmentsView } from "./environments-view";

export default function OpsEnvironmentsPage() {
  return (
    <Suspense fallback={<main data-testid="ops-environments-page">Loading environments...</main>}>
      <EnvironmentsView />
    </Suspense>
  );
}
