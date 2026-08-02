import { Suspense } from "react";
import { AssetsHomeView } from "./assets-home-view";
import { FRONTSTAGE_LOADING } from "../lib/frontstage-copy";

export default function AssetsHomePage() {
  return (
    <Suspense fallback={<main data-testid="assets-home-page">{FRONTSTAGE_LOADING.assets}</main>}>
      <AssetsHomeView />
    </Suspense>
  );
}
