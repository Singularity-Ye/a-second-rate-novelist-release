import {
  VnextStoryTruthIdempotencyConflictError,
  VnextStoryTruthNotFoundError,
  VnextStoryTruthStaleVersionError,
  type VnextStoryTruthPublication,
  type VnextUnderstandingRepository,
} from "../domain/understanding-draft.js";
import {
  createExperiencePublicError,
  type ExperiencePublicError,
} from "@erliu/shared-contracts/vnext-experience";

export function requireOwnedStoryTruth<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new VnextStoryTruthNotFoundError();
  }
  return value;
}

// Public basedOnVersionId is the opaque immutable UnderstandingDraft id. The
// repository resolves its numeric version under owner scope before persistence.
export function understandingBasedOnVersionId(
  publication: VnextStoryTruthPublication,
) {
  return publication.understanding.id;
}

export async function resolveOwnedUnderstandingBasis(
  repository: Pick<VnextUnderstandingRepository, "findOwned">,
  ownerPrincipalId: string,
  basedOnVersionId: string,
) {
  const understanding = requireOwnedStoryTruth(
    await repository.findOwned(ownerPrincipalId, basedOnVersionId),
  );
  return {
    basedOnUnderstandingId: understanding.id,
    basedOnVersion: understanding.version,
  };
}

export type VnextStoryTruthErrorResponse = {
  readonly body: {
    readonly code: ExperiencePublicError["code"];
    readonly recovery: ExperiencePublicError["recovery"];
  };
  readonly status: 404 | 409 | 503;
};

function mapStoryTruthError(error: unknown): VnextStoryTruthErrorResponse {
  if (error instanceof VnextStoryTruthNotFoundError) {
    return { body: createExperiencePublicError("not_found", "none"), status: 404 };
  }
  if (error instanceof VnextStoryTruthStaleVersionError) {
    return {
      body: createExperiencePublicError("stale_version", "refresh_projection"),
      status: 409,
    };
  }
  if (error instanceof VnextStoryTruthIdempotencyConflictError) {
    return {
      body: createExperiencePublicError("conflict", "correct_request"),
      status: 409,
    };
  }
  return {
    body: createExperiencePublicError("temporarily_unavailable", "return_later"),
    status: 503,
  };
}

export async function storyTruthErrorResponse(
  operation: () => unknown | Promise<unknown>,
) {
  try {
    await operation();
  } catch (error) {
    return mapStoryTruthError(error);
  }
  throw new Error("storyTruthErrorResponse requires the operation to throw");
}
