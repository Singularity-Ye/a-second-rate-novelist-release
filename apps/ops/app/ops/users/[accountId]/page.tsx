import { Suspense } from "react";
import { User360View } from "./user-360-view";

export default async function OpsUser360Page(props: {
  params: Promise<{
    accountId: string;
  }>;
}) {
  const params = await props.params;

  return (
    <Suspense fallback={<main data-testid="ops-user-360-page">Loading user 360...</main>}>
      <User360View accountId={params.accountId} />
    </Suspense>
  );
}
