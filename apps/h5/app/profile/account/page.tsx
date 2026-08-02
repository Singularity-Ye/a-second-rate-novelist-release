import { Suspense } from "react";
import { AccountOverviewView } from "./account-overview-view";

export default function AccountOverviewPage() {
  return (
    <Suspense fallback={<main data-testid="account-overview-page">Loading account...</main>}>
      <AccountOverviewView />
    </Suspense>
  );
}
