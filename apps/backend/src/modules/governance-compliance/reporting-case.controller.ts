import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import type { ReportCaseCreateRequest } from "@erliu/shared-contracts";
import { successEnvelope } from "../../common/http-envelope.js";
import { createReportCase, getTrustLegalSummary, listReportCases } from "./reporting-case.service.js";

@Controller()
export class ReportingCaseController {
  @Get("/trust/legal")
  async trustLegal() {
    return successEnvelope(await getTrustLegalSummary());
  }

  @Get("/reports/cases")
  async reportCases(@Query("account_token") account_token: string) {
    return successEnvelope(await listReportCases({ account_token }));
  }

  @Post("/reports/cases")
  async create(@Body() body: ReportCaseCreateRequest) {
    return successEnvelope(await createReportCase(body));
  }
}
