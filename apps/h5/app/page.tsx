import { Suspense } from "react";
import { HomeEntryView } from "./home-entry-view";
import { FRONTSTAGE_LOADING } from "./lib/frontstage-copy";

export default function HomePage() {
  return (
    <Suspense fallback={<main data-testid="home-entry-page">{FRONTSTAGE_LOADING.profile}</main>}>
      <HomeEntryView />
    </Suspense>
  );
}
