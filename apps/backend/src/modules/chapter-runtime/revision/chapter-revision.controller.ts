import { Body, Controller, Get, Param, Post, UnprocessableEntityException } from "@nestjs/common";
import type { ChapterRevisionRequest } from "@erliu/shared-contracts";
import { successEnvelope } from "../../../common/http-envelope.js";
import {
  acceptChapter,
  createChapterRevision,
  getRevisionCountByChapterId,
  getLatestRevisionByChapterId,
} from "./chapter-revision.service.js";

@Controller()
export class ChapterRevisionController {
  @Post("/chapters/:chapterId/accept")
  async accept(
    @Param("chapterId") chapterId: string,
    @Body() body: { client_request_id: string },
  ) {
    return successEnvelope(
      await acceptChapter({
        chapter_id: chapterId,
        client_request_id: body.client_request_id,
      }),
    );
  }

  @Post("/chapters/:chapterId/revisions")
  async createRevision(
    @Param("chapterId") chapterId: string,
    @Body() body: ChapterRevisionRequest,
  ) {
    try {
      return successEnvelope(
        await createChapterRevision({
          chapter_id: chapterId,
          ...body,
        }),
      );
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("STR-005")) {
        throw new UnprocessableEntityException(error.message);
      }

      throw error;
    }
  }

  @Get("/chapters/:chapterId/revisions/latest")
  async latest(@Param("chapterId") chapterId: string) {
    return successEnvelope({
      revision: await getLatestRevisionByChapterId(chapterId),
      revision_count: await getRevisionCountByChapterId(chapterId),
    });
  }
}
