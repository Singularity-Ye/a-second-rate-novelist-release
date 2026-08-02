import {
  createExperiencePublicError,
  type ExperiencePublicError,
} from "@erliu/shared-contracts/vnext-experience";
import type {
  VnextClock,
  VnextPrincipalContext,
  VnextSessionAuditPort,
  VnextSessionRepository,
} from "../domain/vnext-session.repository.js";
import {
  hashSessionToken,
  type SessionCookieService,
} from "../infrastructure/session-cookie.js";
import {
  isCurrentVnextSessionAdmission,
  isRefreshableStaleVnextSessionAdmission,
  type VnextSessionAdmissionPolicy,
} from "./create-guest-session.js";

export type ResolveActiveSessionResult =
  | { ok: true; principal: VnextPrincipalContext; sessionId: string }
  | {
      ok: false;
      error: ExperiencePublicError;
      httpStatus: number;
      clearSessionCookie?: true;
    };

export class ResolveActiveSession {
  constructor(
    private readonly repository: VnextSessionRepository,
    private readonly cookies: SessionCookieService,
    private readonly policy: VnextSessionAdmissionPolicy,
    private readonly clock: VnextClock,
    private readonly audit: VnextSessionAuditPort,
  ) {}

  async execute(cookieHeader: string | undefined): Promise<ResolveActiveSessionResult> {
    const cookie = this.cookies.parse(cookieHeader, this.policy.secureCookies);
    if (cookie.status !== "valid") {
      this.audit.record({ event: "session_resolve", outcome: "missing" });
      return {
        ok: false,
        error: createExperiencePublicError("authentication_required", "restore_session"),
        httpStatus: 401,
        ...(cookie.status === "invalid" ? { clearSessionCookie: true as const } : {}),
      };
    }
    try {
      const resolved = await this.repository.resolveByTokenHash(
        hashSessionToken(cookie.token),
        this.clock.now(),
      );
      if (resolved.status === "active") {
        if (!isCurrentVnextSessionAdmission(resolved.session, this.policy)) {
          if (isRefreshableStaleVnextSessionAdmission(resolved.session, this.policy)) {
            this.audit.record({ event: "session_resolve", outcome: "blocked" });
            return {
              ok: false,
              error: createExperiencePublicError("compliance_blocked", "refresh_admission"),
              httpStatus: 403,
              clearSessionCookie: true,
            };
          }
          this.audit.record({ event: "session_resolve", outcome: "blocked" });
          return {
            ok: false,
            error: createExperiencePublicError("compliance_blocked", "none"),
            httpStatus: 403,
          };
        }
        this.audit.record({ event: "session_resolve", outcome: "active" });
        return {
          ok: true,
          principal: resolved.session.principal,
          sessionId: resolved.session.session.id,
        };
      }
      if (resolved.status === "expired" || resolved.status === "revoked") {
        this.audit.record({ event: "session_resolve", outcome: resolved.status });
        return {
          ok: false,
          error: createExperiencePublicError("session_expired", "restore_session"),
          httpStatus: 401,
          clearSessionCookie: true,
        };
      }
      if (resolved.status === "restricted") {
        this.audit.record({ event: "session_resolve", outcome: "restricted" });
        return {
          ok: false,
          error: createExperiencePublicError("compliance_blocked", "none"),
          httpStatus: 403,
        };
      }
      this.audit.record({ event: "session_resolve", outcome: "missing" });
      return {
        ok: false,
        error: createExperiencePublicError("authentication_required", "restore_session"),
        httpStatus: 401,
        clearSessionCookie: true,
      };
    } catch {
      this.audit.record({ event: "session_resolve", outcome: "failed" });
      return {
        ok: false,
        error: createExperiencePublicError("temporarily_unavailable", "return_later"),
        httpStatus: 503,
      };
    }
  }
}
