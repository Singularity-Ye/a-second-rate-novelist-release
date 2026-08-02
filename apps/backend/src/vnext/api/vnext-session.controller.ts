import { createHash } from "node:crypto";
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  Inject,
  Injectable,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  createExperiencePublicError,
  vnextSessionAdmissionManifestSchema,
  type VnextSessionAdmissionManifest,
} from "@erliu/shared-contracts/vnext-experience";
import {
  CreateGuestSession,
  createVnextGuestSessionRequestSchema,
  VNEXT_SESSION_POLICY,
  type VnextSessionAdmissionPolicy,
} from "../application/create-guest-session.js";
import {
  VNEXT_CLOCK,
  VNEXT_SESSION_AUDIT,
  VNEXT_SESSION_RATE_LIMITER,
  type VnextClock,
  type VnextSessionAuditPort,
  type VnextSessionRateLimitPort,
} from "../domain/vnext-session.repository.js";
import { SessionCookieService } from "../infrastructure/session-cookie.js";
import { VnextOriginGuard } from "./vnext-origin.guard.js";

interface VnextResponse {
  setHeader(name: string, value: string | readonly string[]): void;
}

interface VnextNetworkRequest {
  ip?: string;
  socket?: { remoteAddress?: string };
}

@Injectable()
export class InMemoryVnextSessionRateLimiter implements VnextSessionRateLimitPort {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly maximum: number,
    private readonly windowMs: number,
    private readonly maximumTrackedKeys = 10_000,
  ) {}

  consume(input: { origin: string; networkKey: string }) {
    if (this.maximum <= 0 || this.windowMs <= 0) {
      return false;
    }
    const now = Date.now();
    const key = createHash("sha256")
      .update(`${input.origin}\u0000${input.networkKey}`)
      .digest("hex");
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      if (!bucket && this.buckets.size >= this.maximumTrackedKeys) {
        for (const [trackedKey, trackedBucket] of this.buckets) {
          if (trackedBucket.resetAt <= now) {
            this.buckets.delete(trackedKey);
          }
        }
        if (this.buckets.size >= this.maximumTrackedKeys) {
          return false;
        }
      }
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (bucket.count >= this.maximum) {
      return false;
    }
    bucket.count += 1;
    return true;
  }
}

@Controller("vnext/sessions")
@UseGuards(VnextOriginGuard)
export class VnextSessionController {
  constructor(
    @Inject(CreateGuestSession)
    private readonly createGuestSession: CreateGuestSession,
    @Inject(SessionCookieService)
    private readonly cookies: SessionCookieService,
    @Inject(VNEXT_SESSION_POLICY)
    private readonly policy: VnextSessionAdmissionPolicy,
    @Inject(VNEXT_CLOCK)
    private readonly clock: VnextClock,
    @Inject(VNEXT_SESSION_RATE_LIMITER)
    private readonly rateLimiter: VnextSessionRateLimitPort,
    @Inject(VNEXT_SESSION_AUDIT)
    private readonly audit: VnextSessionAuditPort,
  ) {}

  @Get("admission-manifest")
  readAdmissionManifest(
    @Res({ passthrough: true }) response: VnextResponse,
  ): VnextSessionAdmissionManifest {
    response.setHeader("Cache-Control", "no-store");
    const parsed = vnextSessionAdmissionManifestSchema.safeParse({
      audienceMode: "internal",
      inputPolicy: "synthetic_only",
      admissionPolicyVersion: this.policy.admissionPolicyVersion,
      aiIdentityNoticeVersion: this.policy.aiIdentityNoticeVersion,
      serviceTermsVersion: this.policy.serviceTermsVersion,
      privacyNoticeVersion: this.policy.privacyNoticeVersion,
    });
    if (!this.policy.configured || !parsed.success) {
      throw new HttpException(
        createExperiencePublicError(
          "temporarily_unavailable",
          "return_later",
        ),
        503,
      );
    }
    return parsed.data;
  }

  @Post("guest")
  @HttpCode(201)
  async create(
    @Body() body: unknown,
    @Headers("cookie") cookieHeader: string | undefined,
    @Headers("origin") origin: string | undefined,
    @Req() request: VnextNetworkRequest,
    @Res({ passthrough: true }) response: VnextResponse,
  ) {
    response.setHeader("Cache-Control", "no-store");
    const parsed = createVnextGuestSessionRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpException(parsed.error, 400);
    }
    const networkKey = request.ip ?? request.socket?.remoteAddress ?? "unknown";
    const allowed = await this.rateLimiter.consume({
      origin: origin ?? "",
      networkKey,
    });
    if (!allowed) {
      this.audit.record({
        event: "guest_session_create",
        outcome: "rate_limited",
        audienceMode: parsed.data.audienceMode,
        inputPolicy: parsed.data.inputPolicy,
      });
      throw new HttpException(
        createExperiencePublicError("temporarily_unavailable", "return_later"),
        429,
      );
    }
    const parsedCookie = this.cookies.parse(cookieHeader, this.policy.secureCookies);
    const result = await this.createGuestSession.execute(parsed.data, parsedCookie);
    if (!result.ok) {
      if (result.clearSessionCookie) {
        response.setHeader("Set-Cookie", this.cookies.serializeClear(this.policy.secureCookies));
      }
      throw new HttpException(result.error, result.httpStatus);
    }
    if (result.sessionToken !== undefined) {
      response.setHeader(
        "Set-Cookie",
        this.cookies.serialize(
          result.sessionToken,
          result.expiresAt,
          this.policy.secureCookies,
          this.clock.now(),
        ),
      );
    }
    return { status: result.status };
  }
}
