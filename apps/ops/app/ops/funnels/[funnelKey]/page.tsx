import { Suspense } from "react";
import { FunnelView } from "./funnel-view";

export default async function FunnelPage(props: {
  params: Promise<{
    funnelKey: string;
  }>;
}) {
  const params = await props.params;

  return (
    <Suspense fallback={<main data-testid="ops-funnel-page">Loading funnel...</main>}>
      <FunnelView funnelKey={params.funnelKey} />
    </Suspense>
  );
}
