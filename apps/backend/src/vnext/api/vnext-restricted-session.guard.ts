import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { createExperiencePublicError } from "@erliu/shared-contracts/vnext-experience";
import { ResolveRestrictedSession } from "../application/resolve-restricted-session.js";
import { EvaluateContinuousUseReminder } from "../application/evaluate-continuous-use-reminder.js";
import {
  VNEXT_SESSION_POLICY,
  type VnextSessionAdmissionPolicy,
} from "../application/create-guest-session.js";
import { SessionCookieService } from "../infrastructure/session-cookie.js";
import {
  shouldSkipContinuousUseOffer,
  writeContinuousUseOfferHeaders,
} from "./vnext-continuous-use-offer.js";
import type { VnextAuthenticatedRequest } from "./vnext-session.guard.js";

export interface VnextRestrictedAuthenticatedRequest
  extends VnextAuthenticatedRequest {
  vnextRecoveryAccess?: "active" | "restricted";
}

interface VnextRestrictedResponse {
  setHeader(name: string, value: string): void;
}

/** Guard for explicitly recovery-safe controllers only. */
@Injectable()
export class VnextRestrictedSessionGuard implements CanActivate {
  constructor(
    @Inject(ResolveRestrictedSession)
    private readonly resolveRestrictedSession: ResolveRestrictedSession,
    @Inject(SessionCookieService)
    private readonly cookies: SessionCookieService,
    @Inject(VNEXT_SESSION_POLICY)
    private readonly policy: VnextSessionAdmissionPolicy,
    @Inject(EvaluateContinuousUseReminder)
    private readonly evaluateContinuousUseReminder: EvaluateContinuousUseReminder,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<VnextRestrictedAuthenticatedRequest>();
    const cookieHeader = request.headers?.cookie;
    const result = await this.resolveRestrictedSession.execute(
      typeof cookieHeader === "string" ? cookieHeader : undefined,
    );
    if (!result.ok) {
      if (result.clearSessionCookie) {
        context
          .switchToHttp()
          .getResponse<VnextRestrictedResponse>()
          .setHeader(
            "Set-Cookie",
            this.cookies.serializeClear(this.policy.secureCookies),
          );
      }
      throw new HttpException(result.error, result.httpStatus);
    }
    const skipContinuousUseOffer = shouldSkipContinuousUseOffer(context);
    if (result.access === "active" && !skipContinuousUseOffer) {
      try {
        const continuousUse = await this.evaluateContinuousUseReminder.execute({
          ownerPrincipalId: result.principal.id,
          experienceSessionId: result.sessionId,
        });
        request.vnextContinuousUse = continuousUse;
        writeContinuousUseOfferHeaders(
          context.switchToHttp().getResponse<VnextRestrictedResponse>(),
          continuousUse,
        );
      } catch {
        throw new HttpException(
          createExperiencePublicError(
            "temporarily_unavailable",
            "return_later",
          ),
          503,
        );
      }
    }
    request.vnextPrincipal = result.principal;
    request.vnextSessionId = result.sessionId;
    request.vnextRecoveryAccess = result.access;
    return true;
  }
}
