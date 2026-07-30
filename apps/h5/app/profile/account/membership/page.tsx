import { Suspense } from "react";
import { MembershipView } from "./membership-view";

export default function MembershipPage() {
  return (
    <Suspense fallback={<main data-testid="membership-page">Loading membership...</main>}>
      <MembershipView />
    </Suspense>
  );
}
