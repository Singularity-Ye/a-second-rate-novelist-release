import { Suspense } from "react";
import { StoriesRootView } from "./stories-root-view";
import { FRONTSTAGE_LOADING } from "../lib/frontstage-copy";

export default function StoriesPage() {
  return (
    <Suspense fallback={<main data-testid="stories-root-page">{FRONTSTAGE_LOADING.assets}</main>}>
      <StoriesRootView />
    </Suspense>
  );
}
