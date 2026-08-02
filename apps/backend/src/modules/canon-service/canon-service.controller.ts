import { Body, Controller, Get, Param, Post, Res } from "@nestjs/common";
import { successEnvelope } from "../../common/http-envelope.js";
import { applyCanonPatch, getCanonView, getContinuityIssues } from "./canon-service.service.js";

@Controller()
export class CanonServiceController {
  @Get("/stories/:storyId/canon")
  async canon(@Param("storyId") storyId: string) {
    return successEnvelope(
      await getCanonView({
        story_id: storyId,
      }),
    );
  }

  @Post("/stories/:storyId/canon/patches")
  patch(
    @Param("storyId") storyId: string,
    @Body() body: {
      target_item_id: string;
      patch_document: Record<string, unknown>;
      reason: string;
      client_request_id: string;
      expected_version_no?: number;
    },
    @Res({ passthrough: true }) response: { status: (code: number) => void },
  ) {
    return this.patchAsync(storyId, body, response);
  }

  private async patchAsync(
    storyId: string,
    body: {
      target_item_id: string;
      patch_document: Record<string, unknown>;
      reason: string;
      client_request_id: string;
      expected_version_no?: number;
    },
    response: { status: (code: number) => void },
  ) {
    const result = await applyCanonPatch({
      story_id: storyId,
      ...body,
    });

    if (result.status === "conflicted") {
      response.status(409);
    }

    return successEnvelope(result);
  }

  @Get("/stories/:storyId/continuity-issues")
  async continuity(@Param("storyId") storyId: string) {
    return successEnvelope(
      await getContinuityIssues({
        story_id: storyId,
      }),
    );
  }
}
