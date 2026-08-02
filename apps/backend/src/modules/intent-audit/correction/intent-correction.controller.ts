import { Body, ConflictException, Controller, Get, Patch, Param, Query } from "@nestjs/common";
import type { IntentCorrectionRequest } from "@erliu/shared-contracts";
import { successEnvelope } from "../../../common/http-envelope.js";
import {
  correctArchiveIntent,
  listArchiveIntents,
} from "./intent-correction.service.js";

@Controller()
export class IntentCorrectionController {
  @Get("/archive/intents")
  async list(@Query("account_token") account_token: string) {
    return successEnvelope(await listArchiveIntents(account_token));
  }

  @Patch("/archive/intents/:intentId")
  async correct(
    @Param("intentId") intentId: string,
    @Body() body: Omit<IntentCorrectionRequest, "intent_id">,
  ) {
    try {
      const requestBody = {
        intent_id: intentId,
        new_target_type: body.new_target_type,
        patch_document: body.patch_document,
        client_request_id: body.client_request_id,
        ...(body.new_target_id !== undefined ? { new_target_id: body.new_target_id } : {}),
      } satisfies IntentCorrectionRequest;

      return successEnvelope(await correctArchiveIntent(requestBody));
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("AUD-001")) {
        throw new ConflictException(error.message);
      }

      throw error;
    }
  }
}
