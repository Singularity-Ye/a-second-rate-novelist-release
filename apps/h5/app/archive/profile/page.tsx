import { Suspense } from "react";
import { NonProductSurfaceBoundary } from "../../non-product-surface-boundary";
import {
  shouldAllowNonProductSurface,
  toSearchParamsLike,
  type SearchParamRecord,
} from "../../lib/non-product-surfaces";
import { ArchiveProfileView } from "./archive-profile-view";

export default async function ArchiveProfilePage({
  searchParams,
}: {
  searchParams: Promise<SearchParamRecord>;
}) {
  const resolvedSearchParams = await searchParams;
  const forcedToken = Array.isArray(resolvedSearchParams.token)
    ? resolvedSearchParams.token[0]
    : resolvedSearchParams.token;

  if (!shouldAllowNonProductSurface("/archive/profile", toSearchParamsLike(resolvedSearchParams))) {
    return (
      <NonProductSurfaceBoundary pathname="/archive/profile" searchParams={resolvedSearchParams} />
    );
  }

  return (
    <Suspense fallback={<main data-testid="archive-profile-page">Loading archive profile...</main>}>
      <ArchiveProfileView {...(forcedToken === undefined ? {} : { token: forcedToken })} />
    </Suspense>
  );
}
