import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  OPENING_SLICE_SERVER_ACTIONS,
  createVnextExperienceRequestSchema,
  type VnextExperienceRequest,
} from "@erliu/shared-contracts/vnext-experience";
import {
  CorrectUnderstanding,
  correctUnderstandingErrorResponse,
} from "../application/correct-understanding.js";
import {
  ReadExperienceDraft,
  readExperienceDraftErrorResponse,
} from "../application/read-experience-draft.js";
import {
  SubmitSourceMessage,
  submitSourceMessageErrorResponse,
} from "../application/submit-source-message.js";
import {
  ReadExperienceProjection,
  readExperienceProjectionErrorResponse,
} from "../application/read-experience-projection.js";
import {
  RetryCurrentTask,
  retryCurrentTaskErrorResponse,
} from "../application/retry-current-task.js";
import type { VnextPrincipalContext } from "../domain/vnext-session.repository.js";
import { VnextOriginGuard } from "./vnext-origin.guard.js";
import { VnextPrincipal } from "./vnext-principal.decorator.js";
import { VnextRestrictedSessionGuard } from "./vnext-restricted-session.guard.js";
import {
  VnextSessionGuard,
  type VnextAuthenticatedRequest,
} from "./vnext-session.guard.js";

const messageActionSchema = createVnextExperienceRequestSchema(
  OPENING_SLICE_SERVER_ACTIONS,
);

interface VnextExperienceResponse {
  setHeader(name: string, value: string): void;
}

@Controller("vnext/experience")
export class VnextExperienceController {
  constructor(
    @Inject(SubmitSourceMessage)
    private readonly submitSourceMessage: SubmitSourceMessage,
    @Inject(CorrectUnderstanding)
    private readonly correctUnderstanding: CorrectUnderstanding,
    @Inject(ReadExperienceDraft)
    private readonly readExperienceDraft: ReadExperienceDraft,
    @Inject(ReadExperienceProjection)
    private readonly readExperienceProjection: ReadExperienceProjection,
    @Inject(RetryCurrentTask)
    private readonly retryCurrentTask: RetryCurrentTask,
  ) {}

  @Get("draft")
  @UseGuards(VnextOriginGuard, VnextRestrictedSessionGuard)
  async readDraft(
    @VnextPrincipal() principal: VnextPrincipalContext,
    @Req() request: VnextAuthenticatedRequest,
    @Res({ passthrough: true }) response: VnextExperienceResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    if (request.vnextSessionId === undefined) {
      throw new HttpException(
        { code: "authentication_required", recovery: "restore_session" },
        401,
      );
    }
    try {
      return await this.readExperienceDraft.execute(
        principal.id,
        request.vnextSessionId,
      );
    } catch (error) {
      const mapped = readExperienceDraftErrorResponse(error);
      throw new HttpException(mapped.body, mapped.status);
    }
  }

  @Get()
  @UseGuards(VnextOriginGuard, VnextRestrictedSessionGuard)
  async readProjection(
    @VnextPrincipal() principal: VnextPrincipalContext,
    @Req() request: VnextAuthenticatedRequest,
    @Res({ passthrough: true }) response: VnextExperienceResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    if (request.vnextSessionId === undefined) {
      throw new HttpException(
        { code: "authentication_required", recovery: "restore_session" },
        401,
      );
    }
    try {
      return await this.readExperienceProjection.execute(
        principal.id,
        request.vnextSessionId,
      );
    } catch (error) {
      const mapped = readExperienceProjectionErrorResponse(error);
      throw new HttpException(mapped.body, mapped.status);
    }
  }

  @Post("messages")
  @HttpCode(202)
  @UseGuards(VnextOriginGuard, VnextSessionGuard)
  async submitMessage(
    @Body() body: unknown,
    @VnextPrincipal() principal: VnextPrincipalContext,
    @Req() request: VnextAuthenticatedRequest,
    @Res({ passthrough: true }) response: VnextExperienceResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    const parsed = messageActionSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpException(parsed.error, 400);
    }
    if (request.vnextSessionId === undefined) {
      throw new HttpException(
        { code: "authentication_required", recovery: "restore_session" },
        401,
      );
    }
    try {
      const scope = {
        ownerPrincipalId: principal.id,
        experienceSessionId: request.vnextSessionId,
      };
      const result =
        parsed.data.action === "retry_current_task"
          ? await this.retryCurrentTask.execute({
              ...scope,
              request: parsed.data as VnextExperienceRequest<"retry_current_task">,
            })
          : parsed.data.action === "correct_understanding"
            ? await this.correctUnderstanding.execute({
                ...scope,
                request:
                  parsed.data as VnextExperienceRequest<"correct_understanding">,
              })
            : await this.submitSourceMessage.execute({
                ...scope,
                request: parsed.data as VnextExperienceRequest<"submit_intent">,
              });
      return result.projection;
    } catch (error) {
      const mapped =
        parsed.data.action === "retry_current_task"
          ? retryCurrentTaskErrorResponse(error)
          : parsed.data.action === "correct_understanding"
            ? correctUnderstandingErrorResponse(error)
          : submitSourceMessageErrorResponse(error);
      throw new HttpException(mapped.body, mapped.status);
    }
  }
}
