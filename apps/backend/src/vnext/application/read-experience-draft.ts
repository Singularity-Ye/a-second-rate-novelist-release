import {
  createExperiencePublicError,
  type ExperienceDraft,
  type ExperiencePublicError,
} from "@erliu/shared-contracts/vnext-experience";
import type { VnextExperienceDraftReader } from "../domain/experience-draft.reader.js";
import { assertVnextUuid } from "../domain/source-message.js";

export class VnextExperienceDraftNotFoundError extends Error {
  override readonly name = "VnextExperienceDraftNotFoundError";

  constructor() {
    super("owned draft for the active experience session was not found");
  }
}

export class ReadExperienceDraft {
  constructor(private readonly reader: VnextExperienceDraftReader) {}

  async execute(
    ownerPrincipalId: string,
    experienceSessionId: string,
  ): Promise<ExperienceDraft> {
    assertVnextUuid(ownerPrincipalId, "ownerPrincipalId");
    assertVnextUuid(experienceSessionId, "experienceSessionId");
    const draft = await this.reader.read(ownerPrincipalId, experienceSessionId);
    if (draft === null) {
      throw new VnextExperienceDraftNotFoundError();
    }
    return draft;
  }
}

export type ReadExperienceDraftErrorResponse = {
  readonly status: 404 | 503;
  readonly body: ExperiencePublicError;
};

export function readExperienceDraftErrorResponse(
  error: unknown,
): ReadExperienceDraftErrorResponse {
  if (error instanceof VnextExperienceDraftNotFoundError) {
    return {
      status: 404,
      body: createExperiencePublicError("not_found", "refresh_projection"),
    };
  }
  return {
    status: 503,
    body: createExperiencePublicError("temporarily_unavailable", "return_later"),
  };
}
