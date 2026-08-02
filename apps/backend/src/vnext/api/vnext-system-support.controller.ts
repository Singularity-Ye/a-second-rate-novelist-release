import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  vnextPublishSystemHostTaskRequestSchema,
  vnextRegisterSystemSourceRequestSchema,
} from "@erliu/shared-contracts";
import {
  SystemSupportApplication,
  systemSupportErrorResponse,
} from "../application/system-support.js";
import type { VnextPrincipalContext } from "../domain/vnext-session.repository.js";
import { VnextOriginGuard } from "./vnext-origin.guard.js";
import { VnextPrincipal } from "./vnext-principal.decorator.js";
import {
  VnextSessionGuard,
  type VnextAuthenticatedRequest,
} from "./vnext-session.guard.js";

interface VnextSystemSupportResponse {
  setHeader(name: string, value: string): void;
}

@Controller("vnext/system-support")
export class VnextSystemSupportController {
  constructor(
    @Inject(SystemSupportApplication)
    private readonly systemSupport: SystemSupportApplication,
  ) {}

  @Post("sources")
  @HttpCode(201)
  @UseGuards(VnextOriginGuard, VnextSessionGuard)
  async registerSource(
    @Body() body: unknown,
    @VnextPrincipal() principal: VnextPrincipalContext,
    @Req() request: VnextAuthenticatedRequest,
    @Res({ passthrough: true }) response: VnextSystemSupportResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    const parsed = vnextRegisterSystemSourceRequestSchema.safeParse(body);
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
      return await this.systemSupport.registerSource({
        ownerPrincipalId: principal.id,
        experienceSessionId: request.vnextSessionId,
        request: parsed.data,
      });
    } catch (error) {
      const mapped = systemSupportErrorResponse(error);
      throw new HttpException(mapped.body, mapped.status);
    }
  }

  @Get("cases/:caseId")
  @UseGuards(VnextOriginGuard, VnextSessionGuard)
  async readCase(
    @Param("caseId") caseId: string,
    @VnextPrincipal() principal: VnextPrincipalContext,
    @Req() request: VnextAuthenticatedRequest,
    @Res({ passthrough: true }) response: VnextSystemSupportResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    if (request.vnextSessionId === undefined) {
      throw new HttpException(
        { code: "authentication_required", recovery: "restore_session" },
        401,
      );
    }
    try {
      return await this.systemSupport.readCase({
        ownerPrincipalId: principal.id,
        experienceSessionId: request.vnextSessionId,
        caseId,
      });
    } catch (error) {
      const mapped = systemSupportErrorResponse(error);
      throw new HttpException(mapped.body, mapped.status);
    }
  }

  @Post("cases/:caseId/publish")
  @HttpCode(200)
  @UseGuards(VnextOriginGuard, VnextSessionGuard)
  async publishHostTask(
    @Param("caseId") caseId: string,
    @Body() body: unknown,
    @VnextPrincipal() principal: VnextPrincipalContext,
    @Req() request: VnextAuthenticatedRequest,
    @Res({ passthrough: true }) response: VnextSystemSupportResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    const parsed = vnextPublishSystemHostTaskRequestSchema.safeParse(body);
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
      return await this.systemSupport.publishHostTask({
        ownerPrincipalId: principal.id,
        experienceSessionId: request.vnextSessionId,
        caseId,
        request: parsed.data,
      });
    } catch (error) {
      const mapped = systemSupportErrorResponse(error);
      throw new HttpException(mapped.body, mapped.status);
    }
  }
}
