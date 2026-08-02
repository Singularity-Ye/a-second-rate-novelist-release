import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import type { ChapterGenerateRequest } from "@erliu/shared-contracts";
import { successEnvelope } from "../../common/http-envelope.js";
import {
  getChapterById,
  getCurrentChapterByStoryId,
  getLatestReadableChapterByStoryId,
  requestChapterGeneration,
} from "./chapter-runtime.service.js";

@Controller()
export class ChapterRuntimeController {
  @Post("/stories/:storyId/chapters/generate")
  async generate(
    @Param("storyId") storyId: string,
    @Body() body: ChapterGenerateRequest,
  ) {
    return successEnvelope(
      await requestChapterGeneration({
        story_id: storyId,
        ...body,
      }),
    );
  }

  @Get("/stories/:storyId/chapters/current")
  async current(@Param("storyId") storyId: string) {
    const chapter = await getLatestReadableChapterByStoryId(storyId);

    if (!chapter) {
      return successEnvelope({
        chapter_id: null,
      });
    }

    return successEnvelope({
      chapter_id: chapter.chapter_id,
      chapter,
    });
  }

  @Get("/stories/:storyId/chapters/:chapterId")
  async detail(
    @Param("storyId") storyId: string,
    @Param("chapterId") chapterId: string,
  ) {
    return successEnvelope(await getChapterById(storyId, chapterId));
  }
}
