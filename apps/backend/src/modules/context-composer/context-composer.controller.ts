import { Controller, Get, Param, Query, Res } from "@nestjs/common";
import { successEnvelope } from "../../common/http-envelope.js";
import { getLatestContextBundle } from "./context-composer.service.js";

@Controller()
export class ContextComposerController {
  @Get("/stories/:storyId/context-bundles/latest")
  latest(
    @Param("storyId") storyId: string,
    @Res({ passthrough: true }) response: { status: (code: number) => void },
    @Query("task_type") task_type?: "write" | "revise" | "compare_branch" | "summarize_asset",
    @Query("token_budget") token_budget?: string,
  ) {
    return this.latestAsync(storyId, response, task_type, token_budget);
  }

  private async latestAsync(
    storyId: string,
    response: { status: (code: number) => void },
    task_type?: "write" | "revise" | "compare_branch" | "summarize_asset",
    token_budget?: string,
  ) {
    const result = await getLatestContextBundle({
      story_id: storyId,
      task_type: task_type ?? "write",
      token_budget: token_budget ? Number(token_budget) : 180,
    });

    if (result.status === "trimmed") {
      response.status(202);
    }

    return successEnvelope(result);
  }
}
