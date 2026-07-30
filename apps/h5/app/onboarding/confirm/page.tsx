import { Suspense } from "react";
import { ProfileConfirmationView } from "./profile-confirmation-view";
import { FRONTSTAGE_LOADING } from "../../lib/frontstage-copy";

export default function OnboardingConfirmPage() {
  return (
    <Suspense fallback={<main>{FRONTSTAGE_LOADING.profileConfirmation}</main>}>
      <ProfileConfirmationView />
    </Suspense>
  );
}
