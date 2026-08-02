import {
  createExperiencePublicError,
  type ExperienceProjection,
} from "@erliu/shared-contracts/vnext-experience";
import type { VnextExperienceProjectionReader } from "../domain/experience-projection.reader.js";
import { assertVnextUuid } from "../domain/source-message.js";
import { projectExperience } from "./project-experience.js";

export class VnextExperienceProjectionNotFoundError extends Error {
  override readonly name = "VnextExperienceProjectionNotFoundError";

  constructor() {
    super("owned active experience session was not found");
  }
}

interface VnextProjectionReadiness {
  execute(): Promise<{ readonly status: "ready" | "not_ready" }>;
}

export class ReadExperienceProjection {
  constructor(
    private readonly reader: VnextExperienceProjectionReader,
    private readonly readiness: VnextProjectionReadiness,
  ) {}

  async execute(
    ownerPrincipalId: string,
    experienceSessionId: string,
  ): Promise<ExperienceProjection> {
    assertVnextUuid(ownerPrincipalId, "ownerPrincipalId");
    assertVnextUuid(experienceSessionId, "experienceSessionId");
    const snapshot = await this.reader.read(
      ownerPrincipalId,
      experienceSessionId,
    );
    if (snapshot === null) {
      throw new VnextExperienceProjectionNotFoundError();
    }
    const platformReadiness = await this.readiness.execute();
    return projectExperience({
      ...snapshot,
      readinessBlocked:
        snapshot.readinessBlocked || platformReadiness.status !== "ready",
    });
  }
}

export function readExperienceProjectionErrorResponse(error: unknown) {
  if (error instanceof VnextExperienceProjectionNotFoundError) {
    return {
      status: 401 as const,
      body: createExperiencePublicError("session_expired", "restore_session"),
    };
  }
  return {
    status: 503 as const,
    body: createExperiencePublicError("temporarily_unavailable", "return_later"),
  };
}
