import { Suspense } from "react";
import { ProfileRootView } from "./profile-root-view";
import { FRONTSTAGE_LOADING } from "../lib/frontstage-copy";

export default function ProfilePage() {
  return (
    <Suspense fallback={<main data-testid="profile-root-page">{FRONTSTAGE_LOADING.profile}</main>}>
      <ProfileRootView />
    </Suspense>
  );
}
