import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { createExperiencePublicError } from "@erliu/shared-contracts/vnext-experience";
import {
  VNEXT_SESSION_POLICY,
  type VnextSessionAdmissionPolicy,
} from "../application/create-guest-session.js";
import {
  VNEXT_SESSION_AUDIT,
  type VnextSessionAuditPort,
} from "../domain/vnext-session.repository.js";

interface OriginRequest {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function exactOrigin(value: unknown): value is string {
  if (typeof value !== "string" || value === "null") {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === "" &&
      url.origin === value
    );
  } catch {
    return false;
  }
}

@Injectable()
export class VnextOriginGuard implements CanActivate {
  constructor(
    @Inject(VNEXT_SESSION_POLICY)
    private readonly policy: VnextSessionAdmissionPolicy,
    @Inject(VNEXT_SESSION_AUDIT)
    private readonly audit: VnextSessionAuditPort,
  ) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<OriginRequest>();
    const method = request.method?.toUpperCase() ?? "";
    if (SAFE_METHODS.has(method)) {
      return true;
    }
    const origin = request.headers?.origin;
    if (
      !exactOrigin(origin) ||
      this.policy.allowedOrigins.size === 0 ||
      !this.policy.allowedOrigins.has(origin)
    ) {
      this.audit.record({ event: "origin_check", outcome: "invalid_origin" });
      throw new HttpException(
        createExperiencePublicError("invalid_request", "correct_request"),
        403,
      );
    }
    this.audit.record({ event: "origin_check", outcome: "allowed_origin" });
    return true;
  }
}
