import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { createExperiencePublicError } from "@erliu/shared-contracts/vnext-experience";
import { ResolveActiveSession } from "../application/resolve-active-session.js";
import { EvaluateContinuousUseReminder } from "../application/evaluate-continuous-use-reminder.js";
import {
  VNEXT_SESSION_POLICY,
  type VnextSessionAdmissionPolicy,
} from "../application/create-guest-session.js";
import type { VnextPrincipalContext } from "../domain/vnext-session.repository.js";
import type { ContinuousUseEvaluation } from "../domain/compliance-readiness.js";
import { SessionCookieService } from "../infrastructure/session-cookie.js";
import {
  shouldSkipContinuousUseOffer,
  writeContinuousUseOfferHeaders,
} from "./vnext-continuous-use-offer.js";

export interface VnextAuthenticatedRequest {
  headers?: Record<string, string | string[] | undefined>;
  vnextPrincipal?: VnextPrincipalContext;
  vnextSessionId?: string;
  vnextContinuousUse?: ContinuousUseEvaluation;
}

interface VnextAuthenticatedResponse {
  setHeader(name: string, value: string): void;
}

@Injectable()
export class VnextSessionGuard implements CanActivate {
  constructor(
    @Inject(ResolveActiveSession)
    private readonly resolveActiveSession: ResolveActiveSession,
    @Inject(SessionCookieService)
    private readonly cookies: SessionCookieService,
    @Inject(VNEXT_SESSION_POLICY)
    private readonly policy: VnextSessionAdmissionPolicy,
    @Inject(EvaluateContinuousUseReminder)
    private readonly evaluateContinuousUseReminder: EvaluateContinuousUseReminder,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<VnextAuthenticatedRequest>();
    const cookieHeader = request.headers?.cookie;
    const result = await this.resolveActiveSession.execute(
      typeof cookieHeader === "string" ? cookieHeader : undefined,
    );
    if (!result.ok) {
      if (result.clearSessionCookie) {
        context
          .switchToHttp()
          .getResponse<VnextAuthenticatedResponse>()
          .setHeader("Set-Cookie", this.cookies.serializeClear(this.policy.secureCookies));
      }
      throw new HttpException(result.error, result.httpStatus);
    }
    const skipContinuousUseOffer = shouldSkipContinuousUseOffer(context);
    if (!skipContinuousUseOffer) {
      try {
        const continuousUse = await this.evaluateContinuousUseReminder.execute({
          ownerPrincipalId: result.principal.id,
          experienceSessionId: result.sessionId,
        });
        request.vnextContinuousUse = continuousUse;
        writeContinuousUseOfferHeaders(
          context
            .switchToHttp()
            .getResponse<VnextAuthenticatedResponse>(),
          continuousUse,
        );
      } catch {
        throw new HttpException(
          createExperiencePublicError("temporarily_unavailable", "return_later"),
          503,
        );
      }
    }
    request.vnextPrincipal = result.principal;
    request.vnextSessionId = result.sessionId;
    return true;
  }
}
