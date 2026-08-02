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
  createExperiencePublicError,
  vnextConsentListResponseSchema,
  vnextWithdrawConsentRequestSchema,
  vnextWithdrawConsentResponseSchema,
} from "@erliu/shared-contracts/vnext-experience";
import { ListOwnedConsents } from "../application/list-owned-consents.js";
import { WithdrawConsent } from "../application/withdraw-consent.js";
import {
  ComplianceOperationNotAllowedError,
  ComplianceResourceNotFoundError,
  ComplianceVersionConflictError,
} from "../domain/compliance-readiness.js";
import type { VnextPrincipalContext } from "../domain/vnext-session.repository.js";
import { VnextOriginGuard } from "./vnext-origin.guard.js";
import { VnextPrincipal } from "./vnext-principal.decorator.js";
import {
  VnextRestrictedSessionGuard,
  type VnextRestrictedAuthenticatedRequest,
} from "./vnext-restricted-session.guard.js";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
interface NoStoreResponse {
  setHeader(name: string, value: string): void;
}

export function vnextComplianceHttpException(error: unknown) {
  if (error instanceof TypeError) {
    return new HttpException(
      createExperiencePublicError("invalid_request", "correct_request"),
      400,
    );
  }
  if (error instanceof ComplianceResourceNotFoundError) {
    return new HttpException(
      createExperiencePublicError("not_found", "none"),
      404,
    );
  }
  if (error instanceof ComplianceVersionConflictError) {
    return new HttpException(
      createExperiencePublicError("stale_version", "refresh_projection"),
      409,
    );
  }
  if (error instanceof ComplianceOperationNotAllowedError) {
    return new HttpException(
      createExperiencePublicError("compliance_blocked", "none"),
      409,
    );
  }
  return new HttpException(
    createExperiencePublicError("temporarily_unavailable", "return_later"),
    503,
  );
}

@Controller("vnext/consents")
@UseGuards(VnextOriginGuard, VnextRestrictedSessionGuard)
export class VnextConsentController {
  constructor(
    @Inject(ListOwnedConsents)
    private readonly listOwnedConsents: ListOwnedConsents,
    @Inject(WithdrawConsent)
    private readonly withdrawConsent: WithdrawConsent,
  ) {}

  @Get()
  async list(
    @VnextPrincipal() principal: VnextPrincipalContext,
    @Req() request: VnextRestrictedAuthenticatedRequest,
    @Res({ passthrough: true }) response: NoStoreResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    if (request.vnextSessionId === undefined) {
      throw vnextComplianceHttpException(new TypeError("invalid session scope"));
    }
    try {
      const consents = await this.listOwnedConsents.execute({
        ownerPrincipalId: principal.id,
        experienceSessionId: request.vnextSessionId,
      });
      return vnextConsentListResponseSchema.parse(
        consents.map((consent) => ({
          id: consent.id,
          purpose: consent.purpose,
          kind: consent.kind,
          status: consent.status,
          version: consent.version,
          grantedAt: consent.grantedAt.toISOString(),
          withdrawnAt: consent.withdrawnAt?.toISOString() ?? null,
        })),
      );
    } catch (error) {
      throw vnextComplianceHttpException(error);
    }
  }

  @Post(":consentId/withdraw")
  @HttpCode(200)
  async withdraw(
    @Param("consentId") consentId: string,
    @Body() body: unknown,
    @VnextPrincipal() principal: VnextPrincipalContext,
    @Req() request: VnextRestrictedAuthenticatedRequest,
    @Res({ passthrough: true }) response: NoStoreResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    const parsed = vnextWithdrawConsentRequestSchema.safeParse(body);
    if (
      !UUID_V4_PATTERN.test(consentId) ||
      !parsed.success ||
      request.vnextSessionId === undefined
    ) {
      throw vnextComplianceHttpException(new TypeError("invalid request"));
    }
    try {
      const result = await this.withdrawConsent.execute({
        ownerPrincipalId: principal.id,
        experienceSessionId: request.vnextSessionId,
        consentRecordId: consentId,
        expectedVersion: parsed.data.basedOnVersion,
      });
      return vnextWithdrawConsentResponseSchema.parse({
        status: "withdrawn",
        version: result.recordVersion,
        purpose: result.purpose,
        complianceStatus: result.complianceStatus,
        cancelledTaskCount: result.cancelledTaskCount,
      });
    } catch (error) {
      throw vnextComplianceHttpException(error);
    }
  }
}
