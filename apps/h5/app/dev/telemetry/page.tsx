import { Suspense } from "react";
import { NonProductSurfaceBoundary } from "../../non-product-surface-boundary";
import {
  shouldAllowNonProductSurface,
  toSearchParamsLike,
  type SearchParamRecord,
} from "../../lib/non-product-surfaces";
import { TelemetryDevView } from "./telemetry-dev-view";

export default async function TelemetryDevPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamRecord>;
}) {
  const resolvedSearchParams = await searchParams;
  const forcedToken = Array.isArray(resolvedSearchParams.token)
    ? resolvedSearchParams.token[0]
    : resolvedSearchParams.token;

  if (!shouldAllowNonProductSurface("/dev/telemetry", toSearchParamsLike(resolvedSearchParams))) {
    return (
      <NonProductSurfaceBoundary pathname="/dev/telemetry" searchParams={resolvedSearchParams} />
    );
  }

  return (
    <Suspense fallback={<main data-testid="telemetry-dev-page">Loading telemetry session...</main>}>
      <TelemetryDevView {...(forcedToken === undefined ? {} : { token: forcedToken })} />
    </Suspense>
  );
}
