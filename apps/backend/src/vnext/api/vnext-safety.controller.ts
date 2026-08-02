import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  VNEXT_CONTINUOUS_USE_RECEIPT_ID_HEADER,
  VNEXT_CONTINUOUS_USE_RECEIPT_VERSION_HEADER,
  VNEXT_CONTINUOUS_USE_REMINDER_HEADER,
  vnextAcknowledgeContinuousUseReceiptRequestSchema,
  vnextAppealSafetyDecisionRequestSchema,
  vnextContinuousUseAcknowledgementResponseSchema,
  vnextContinuousUseResponseSchema,
  vnextEvaluateContinuousUseRequestSchema,
  vnextExitExperienceRequestSchema,
  vnextSafetyAppealResponseSchema,
  vnextSafetyCaseListResponseSchema,
  vnextSafetyCaseResponseSchema,
  vnextSessionExitResponseSchema,
} from "@erliu/shared-contracts/vnext-experience";
import { AcknowledgeContinuousUseReceipt } from "../application/acknowledge-continuous-use-receipt.js";
import { AppealSafetyDecision } from "../application/appeal-safety-decision.js";
import { CancelSessionCreativeTasks } from "../application/cancel-session-creative-tasks.js";
import {
  VNEXT_SESSION_POLICY,
  type VnextSessionAdmissionPolicy,
} from "../application/create-guest-session.js";
import { EvaluateContinuousUseReminder } from "../application/evaluate-continuous-use-reminder.js";
import { ListOwnedSafetyCases } from "../application/list-owned-safety-cases.js";
import {
  VNEXT_COMPLIANCE_RECOVERY_REPOSITORY,
  type ComplianceRecoveryRepository,
} from "../domain/compliance-readiness.js";
import type { VnextPrincipalContext } from "../domain/vnext-session.repository.js";
import { SessionCookieService } from "../infrastructure/session-cookie.js";
import { VnextOriginGuard } from "./vnext-origin.guard.js";
import { VnextPrincipal } from "./vnext-principal.decorator.js";
import {
  SkipContinuousUseOffer,
  writeContinuousUseOfferHeaders,
} from "./vnext-continuous-use-offer.js";
import {
  VnextRestrictedSessionGuard,
  type VnextRestrictedAuthenticatedRequest,
} from "./vnext-restricted-session.guard.js";
import { vnextComplianceHttpException } from "./vnext-consent.controller.js";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
interface SafetyResponse {
  setHeader(name: string, value: string): void;
}

function requiredSessionId(request: VnextRestrictedAuthenticatedRequest) {
  if (request.vnextSessionId === undefined) {
    throw new TypeError("invalid session scope");
  }
  return request.vnextSessionId;
}

@Controller("vnext/safety")
@UseGuards(VnextOriginGuard, VnextRestrictedSessionGuard)
export class VnextSafetyController {
  constructor(
    @Inject(ListOwnedSafetyCases)
    private readonly listOwnedSafetyCases: ListOwnedSafetyCases,
    @Inject(AppealSafetyDecision)
    private readonly appealSafetyDecision: AppealSafetyDecision,
    @Inject(EvaluateContinuousUseReminder)
    private readonly evaluateContinuousUseReminder: EvaluateContinuousUseReminder,
    @Inject(AcknowledgeContinuousUseReceipt)
    private readonly acknowledgeContinuousUseReceipt: AcknowledgeContinuousUseReceipt,
    @Inject(CancelSessionCreativeTasks)
    private readonly cancelSessionCreativeTasks: CancelSessionCreativeTasks,
    @Inject(VNEXT_COMPLIANCE_RECOVERY_REPOSITORY)
    private readonly repository: ComplianceRecoveryRepository,
    @Inject(SessionCookieService)
    private readonly cookies: SessionCookieService,
    @Inject(VNEXT_SESSION_POLICY)
    private readonly policy: VnextSessionAdmissionPolicy,
  ) {}

  @Get("cases")
  async listCases(
    @VnextPrincipal() principal: VnextPrincipalContext,
    @Req() request: VnextRestrictedAuthenticatedRequest,
    @Res({ passthrough: true }) response: SafetyResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    try {
      const safetyCases = await this.listOwnedSafetyCases.execute({
        ownerPrincipalId: principal.id,
        experienceSessionId: requiredSessionId(request),
      });
      return vnextSafetyCaseListResponseSchema.parse(
        safetyCases.map((safetyCase) => ({
          safetyCaseId: safetyCase.safetyCaseId,
          status: safetyCase.status,
          disposition: safetyCase.disposition,
          severity: safetyCase.severity,
          version: safetyCase.version,
          openedAt: safetyCase.openedAt.toISOString(),
          appealedAt: safetyCase.appealedAt?.toISOString() ?? null,
          closedAt: safetyCase.closedAt?.toISOString() ?? null,
        })),
      );
    } catch (error) {
      throw vnextComplianceHttpException(error);
    }
  }

  @Get("cases/:caseId")
  async readCase(
    @Param("caseId") caseId: string,
    @VnextPrincipal() principal: VnextPrincipalContext,
    @Req() request: VnextRestrictedAuthenticatedRequest,
    @Res({ passthrough: true }) response: SafetyResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    if (!UUID_V4_PATTERN.test(caseId)) {
      throw vnextComplianceHttpException(new TypeError("invalid case id"));
    }
    try {
      const safetyCase = await this.repository.readOwnedSafetyCase({
        ownerPrincipalId: principal.id,
        experienceSessionId: requiredSessionId(request),
        safetyCaseId: caseId,
      });
      return vnextSafetyCaseResponseSchema.parse({
        safetyCaseId: safetyCase.safetyCaseId,
        status: safetyCase.status,
        disposition: safetyCase.disposition,
        severity: safetyCase.severity,
        version: safetyCase.version,
        openedAt: safetyCase.openedAt.toISOString(),
        appealedAt: safetyCase.appealedAt?.toISOString() ?? null,
        closedAt: safetyCase.closedAt?.toISOString() ?? null,
      });
    } catch (error) {
      throw vnextComplianceHttpException(error);
    }
  }

  @Post("cases/:caseId/appeal")
  @HttpCode(200)
  async appeal(
    @Param("caseId") caseId: string,
    @Body() body: unknown,
    @VnextPrincipal() principal: VnextPrincipalContext,
    @Req() request: VnextRestrictedAuthenticatedRequest,
    @Res({ passthrough: true }) response: SafetyResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    const parsed = vnextAppealSafetyDecisionRequestSchema.safeParse(body);
    if (!UUID_V4_PATTERN.test(caseId) || !parsed.success) {
      throw vnextComplianceHttpException(new TypeError("invalid appeal request"));
    }
    try {
      const result = await this.appealSafetyDecision.execute({
        ownerPrincipalId: principal.id,
        experienceSessionId: requiredSessionId(request),
        safetyCaseId: caseId,
        expectedVersion: parsed.data.basedOnVersion,
        reason: parsed.data.reason,
      });
      return vnextSafetyAppealResponseSchema.parse({
        safetyCaseId: result.safetyCaseId,
        status: result.status,
        version: result.version,
        appealedAt: result.appealedAt.toISOString(),
      });
    } catch (error) {
      throw vnextComplianceHttpException(error);
    }
  }

  @Post("continuous-use/evaluate")
  @HttpCode(200)
  @SkipContinuousUseOffer()
  async evaluateContinuousUse(
    @Body() body: unknown,
    @VnextPrincipal() principal: VnextPrincipalContext,
    @Req() request: VnextRestrictedAuthenticatedRequest,
    @Res({ passthrough: true }) response: SafetyResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    if (!vnextEvaluateContinuousUseRequestSchema.safeParse(body).success) {
      throw vnextComplianceHttpException(new TypeError("invalid reminder request"));
    }
    try {
      const result = await this.evaluateContinuousUseReminder.execute({
        ownerPrincipalId: principal.id,
        experienceSessionId: requiredSessionId(request),
      });
      const payload = vnextContinuousUseResponseSchema.parse(
        result.status === "pending"
          ? {
            status: "pending",
            receiptId: result.receiptId,
            receiptVersion: result.receiptVersion,
            emittedAt: result.emittedAt.toISOString(),
          }
          : {
            status: "not_due",
            nextReminderAt: result.nextReminderAt.toISOString(),
          },
      );
      writeContinuousUseOfferHeaders(response, result);
      return payload;
    } catch (error) {
      throw vnextComplianceHttpException(error);
    }
  }

  @Post("continuous-use/receipts/:receiptId/acknowledge")
  @HttpCode(200)
  @SkipContinuousUseOffer()
  async acknowledgeContinuousUse(
    @Param("receiptId") receiptId: string,
    @Body() body: unknown,
    @VnextPrincipal() principal: VnextPrincipalContext,
    @Req() request: VnextRestrictedAuthenticatedRequest,
    @Res({ passthrough: true }) response: SafetyResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    const parsed = vnextAcknowledgeContinuousUseReceiptRequestSchema.safeParse(body);
    if (!UUID_V4_PATTERN.test(receiptId) || !parsed.success) {
      throw vnextComplianceHttpException(
        new TypeError("invalid continuous-use acknowledgement"),
      );
    }
    try {
      const result = await this.acknowledgeContinuousUseReceipt.execute({
        ownerPrincipalId: principal.id,
        experienceSessionId: requiredSessionId(request),
        receiptId,
        expectedReceiptVersion: parsed.data.basedOnReceiptVersion,
      });
      const payload = vnextContinuousUseAcknowledgementResponseSchema.parse({
        receiptId: result.receiptId,
        status: result.status,
        receiptVersion: result.receiptVersion,
        acknowledgedAt: result.acknowledgedAt.toISOString(),
      });
      response.setHeader(VNEXT_CONTINUOUS_USE_REMINDER_HEADER, payload.status);
      response.setHeader(VNEXT_CONTINUOUS_USE_RECEIPT_ID_HEADER, payload.receiptId);
      response.setHeader(
        VNEXT_CONTINUOUS_USE_RECEIPT_VERSION_HEADER,
        String(payload.receiptVersion),
      );
      return payload;
    } catch (error) {
      throw vnextComplianceHttpException(error);
    }
  }

  @Post("session/exit")
  @HttpCode(200)
  @SkipContinuousUseOffer()
  async exit(
    @Body() body: unknown,
    @VnextPrincipal() principal: VnextPrincipalContext,
    @Req() request: VnextRestrictedAuthenticatedRequest,
    @Res({ passthrough: true }) response: SafetyResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    if (!vnextExitExperienceRequestSchema.safeParse(body).success) {
      throw vnextComplianceHttpException(new TypeError("invalid exit request"));
    }
    try {
      const result = await this.cancelSessionCreativeTasks.execute({
        ownerPrincipalId: principal.id,
        experienceSessionId: requiredSessionId(request),
      });
      const payload = vnextSessionExitResponseSchema.parse({
        status: "exited",
        cancelledTaskCount: result.cancelledTaskCount,
      });
      response.setHeader(
        "Set-Cookie",
        this.cookies.serializeClear(this.policy.secureCookies),
      );
      return payload;
    } catch (error) {
      throw vnextComplianceHttpException(error);
    }
  }
}
