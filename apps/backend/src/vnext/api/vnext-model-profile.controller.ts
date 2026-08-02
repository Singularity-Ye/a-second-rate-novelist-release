import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Put,
  UseGuards,
} from "@nestjs/common";
import {
  isVnextModelProfileId,
  isVnextModelPurpose,
  type VnextModelPurpose,
} from "@erliu/shared-contracts";
import {
  ModelProfileSelectionError,
  ModelProfileSelectionService,
} from "../application/model-profile-selection.js";
import type { VnextPrincipalContext } from "../domain/vnext-session.repository.js";
import { VnextOriginGuard } from "./vnext-origin.guard.js";
import { VnextPrincipal } from "./vnext-principal.decorator.js";
import { VnextSessionGuard } from "./vnext-session.guard.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function publicFailure(error: unknown): never {
  if (error instanceof ModelProfileSelectionError) {
    throw new HttpException(
      {
        code: error.code,
        recovery:
          error.code === "model_preference_conflict"
            ? "reload_model_settings"
            : error.code === "provider_unconfigured"
              ? "configure_provider"
              : "choose_available_profile",
      },
      error.status,
    );
  }
  throw new HttpException(
    { code: "temporarily_unavailable", recovery: "return_later" },
    503,
  );
}

@Controller("vnext/model-profiles")
@UseGuards(VnextOriginGuard, VnextSessionGuard)
export class VnextModelProfileController {
  constructor(private readonly selections: ModelProfileSelectionService) {}

  @Get()
  async read(@VnextPrincipal() principal: VnextPrincipalContext) {
    try {
      return await this.selections.readSettings(principal.id);
    } catch (error) {
      return publicFailure(error);
    }
  }

  @Put("preferences/:purpose")
  async set(
    @Param("purpose") rawPurpose: string,
    @Body() body: unknown,
    @VnextPrincipal() principal: VnextPrincipalContext,
  ) {
    if (
      !isVnextModelPurpose(rawPurpose) ||
      !isRecord(body) ||
      !isVnextModelProfileId(body.profileId) ||
      typeof body.expectedRevision !== "number" ||
      !Number.isSafeInteger(body.expectedRevision) ||
      body.expectedRevision < 0 ||
      body.expectedRevision > 2_147_483_646 ||
      Object.keys(body).some(
        (key) => key !== "profileId" && key !== "expectedRevision",
      )
    ) {
      throw new HttpException(
        { code: "invalid_request", recovery: "correct_request" },
        400,
      );
    }
    try {
      return await this.selections.setPreference({
        ownerPrincipalId: principal.id,
        purpose: rawPurpose as VnextModelPurpose,
        profileId: body.profileId,
        expectedRevision: body.expectedRevision,
      });
    } catch (error) {
      return publicFailure(error);
    }
  }
}
