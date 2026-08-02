import { Suspense } from "react";
import { NonProductSurfaceBoundary } from "../non-product-surface-boundary";
import {
  shouldAllowNonProductSurface,
  toSearchParamsLike,
  type SearchParamRecord,
} from "../lib/non-product-surfaces";
import { DemoFlowView } from "./demo-flow-view";

export default async function DemoFlowPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamRecord>;
}) {
  const resolvedSearchParams = await searchParams;
  const forcedToken = Array.isArray(resolvedSearchParams.token)
    ? resolvedSearchParams.token[0]
    : resolvedSearchParams.token;
  const forcedAccountToken = Array.isArray(resolvedSearchParams.account_token)
    ? resolvedSearchParams.account_token[0]
    : resolvedSearchParams.account_token;

  if (!shouldAllowNonProductSurface("/demo-flow", toSearchParamsLike(resolvedSearchParams))) {
    return <NonProductSurfaceBoundary pathname="/demo-flow" searchParams={resolvedSearchParams} />;
  }

  return (
    <Suspense fallback={<main data-testid="demo-flow-page">Loading demo flow...</main>}>
      <DemoFlowView
        {...(forcedToken === undefined ? {} : { forcedToken })}
        {...(forcedAccountToken === undefined ? {} : { forcedAccountToken })}
      />
    </Suspense>
  );
}
