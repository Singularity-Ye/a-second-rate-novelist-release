import { Suspense } from "react";
import { BackupsView } from "./backups-view";

export default function OpsBackupsPage() {
  return (
    <Suspense fallback={<main data-testid="ops-backups-page">Loading backups...</main>}>
      <BackupsView />
    </Suspense>
  );
}
