import { Suspense } from "react";
import { NonProductSurfaceBoundary } from "../../non-product-surface-boundary";
import {
  shouldAllowNonProductSurface,
  toSearchParamsLike,
  type SearchParamRecord,
} from "../../lib/non-product-surfaces";
import { ArchiveIntentsView } from "./archive-intents-view";

export default async function ArchiveIntentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamRecord>;
}) {
  const resolvedSearchParams = await searchParams;
  const forcedToken = Array.isArray(resolvedSearchParams.token)
    ? resolvedSearchParams.token[0]
    : resolvedSearchParams.token;

  if (!shouldAllowNonProductSurface("/archive/intents", toSearchParamsLike(resolvedSearchParams))) {
    return (
      <NonProductSurfaceBoundary pathname="/archive/intents" searchParams={resolvedSearchParams} />
    );
  }

  return (
    <Suspense fallback={<main data-testid="archive-intents-page">Loading recent notes...</main>}>
      <ArchiveIntentsView {...(forcedToken === undefined ? {} : { token: forcedToken })} />
    </Suspense>
  );
}
