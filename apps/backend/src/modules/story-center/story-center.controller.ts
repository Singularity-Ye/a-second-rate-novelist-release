import { Controller, Get, Param, Query } from "@nestjs/common";
import { successEnvelope } from "../../common/http-envelope.js";
import { getStoryCenterDetail, listStoryCenter } from "./story-center.service.js";

@Controller()
export class StoryCenterController {
  @Get("/stories")
  async list(@Query("account_token") account_token: string) {
    return successEnvelope(
      await listStoryCenter({
        account_token,
      }),
    );
  }

  @Get("/stories/:storyId")
  async detail(@Param("storyId") storyId: string, @Query("account_token") account_token: string) {
    return successEnvelope(
      await getStoryCenterDetail({
        account_token,
        story_id: storyId,
      }),
    );
  }
}
