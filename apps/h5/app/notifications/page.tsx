import { Suspense } from "react";
import { NotificationsView } from "./notifications-view";
import { FRONTSTAGE_LOADING } from "../lib/frontstage-copy";

export default function NotificationsPage() {
  return (
    <Suspense fallback={<main data-testid="notifications-page">{FRONTSTAGE_LOADING.notifications}</main>}>
      <NotificationsView />
    </Suspense>
  );
}
