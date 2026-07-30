import { Suspense } from "react";
import { BetaLandingView } from "./beta-landing-view";
import { FRONTSTAGE_LOADING } from "../lib/frontstage-copy";

export default function BetaPage() {
  return (
    <Suspense fallback={<main data-testid="beta-landing-page">{FRONTSTAGE_LOADING.report}</main>}>
      <BetaLandingView />
    </Suspense>
  );
}
