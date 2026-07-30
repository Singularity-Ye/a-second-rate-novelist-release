import { Suspense } from "react";
import { BetaLandingView } from "../../beta/beta-landing-view";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ inviteCode: string }>;
}) {
  const { inviteCode } = await params;

  return (
    <Suspense fallback={<main data-testid="beta-landing-page">Loading beta invite...</main>}>
      <BetaLandingView initialInviteCode={inviteCode} />
    </Suspense>
  );
}
