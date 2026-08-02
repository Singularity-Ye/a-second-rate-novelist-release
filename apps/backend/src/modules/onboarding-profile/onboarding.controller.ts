import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  UnprocessableEntityException,
} from "@nestjs/common";
import { successEnvelope } from "../../common/http-envelope.js";
import {
  collectOnboardingStep,
  confirmReaderProfile,
  getReaderProfileByAccountToken,
} from "./reader-profile-service.js";

@Controller()
export class OnboardingProfileController {
  @Post("/internal/onboarding/steps")
  async submitStep(
    @Body()
    body: {
      account_token: string;
      step_key?: "reading_archive" | "taste_archive" | "boundaries" | "collaboration_mode";
      answer_text: string;
    },
  ) {
    return successEnvelope(await collectOnboardingStep(body));
  }

  @Get("/profile")
  async getProfile(@Query("account_token") account_token: string) {
    return successEnvelope(await getReaderProfileByAccountToken(account_token));
  }

  @Patch("/profile")
  async patchProfile(
    @Body()
    body: {
      account_token: string;
      confirm_profile?: boolean;
    },
  ) {
    try {
      if (body.confirm_profile) {
        return successEnvelope(await confirmReaderProfile({ account_token: body.account_token }));
      }

      return successEnvelope(await getReaderProfileByAccountToken(body.account_token));
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("ONB-001")) {
        throw new UnprocessableEntityException(error.message);
      }

      throw error;
    }
  }
}
