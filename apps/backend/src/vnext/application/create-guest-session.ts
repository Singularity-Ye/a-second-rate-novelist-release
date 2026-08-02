import {
  createExperiencePublicError,
  type ExperiencePublicError,
} from "@erliu/shared-contracts/vnext-experience";
import {
  VnextIdempotencyConflictError,
  type VnextAudienceMode,
  type VnextClock,
  type VnextInputPolicy,
  type VnextSessionAuditPort,
  type VnextSessionRecord,
  type VnextSessionRepository,
} from "../domain/vnext-session.repository.js";
import type {
  ParsedSessionCookie,
  SessionCookieService,
} from "../infrastructure/session-cookie.js";
import {
  hashBootstrapRecoverySecret,
  hashSessionToken,
} from "../infrastructure/session-cookie.js";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TOKEN_SECRET_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;
const BOOTSTRAP_RECOVERY_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const REQUEST_FIELDS = new Set([
  "clientRequestId",
  "bootstrapRecoverySecret",
  "audienceMode",
  "inputPolicy",
  "admissionPolicyVersion",
  "aiIdentityNoticeVersion",
  "serviceTermsVersion",
  "privacyNoticeVersion",
  "aiIdentityAcknowledged",
  "serviceTermsAccepted",
  "privacyNoticeAcknowledged",
]);
const AUDIENCE_MODES = new Set<VnextAudienceMode>([
  "internal",
  "verified_adult_external",
]);
const INPUT_POLICIES = new Set<VnextInputPolicy>(["synthetic_only", "real_input"]);

export interface VnextGuestSessionRequest {
  clientRequestId: string;
  bootstrapRecoverySecret: string;
  audienceMode: VnextAudienceMode;
  inputPolicy: VnextInputPolicy;
  admissionPolicyVersion: string;
  aiIdentityNoticeVersion: string;
  serviceTermsVersion: string;
  privacyNoticeVersion: string;
  aiIdentityAcknowledged: boolean;
  serviceTermsAccepted: boolean;
  privacyNoticeAcknowledged: boolean;
}

export interface VnextSessionAdmissionPolicy {
  configured: boolean;
  allowedOrigins: ReadonlySet<string>;
  secureCookies: boolean;
  sessionTokenSecret: string;
  guestSessionTtlMs: number;
  admissionPolicyVersion: string;
  aiIdentityNoticeVersion: string;
  serviceTermsVersion: string;
  privacyNoticeVersion: string;
}

export const VNEXT_SESSION_POLICY = Symbol("VNEXT_SESSION_POLICY");

export type VnextGuestSessionRequestParseResult =
  | { success: true; data: VnextGuestSessionRequest }
  | { success: false; error: ExperiencePublicError };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ownDataValue(record: Record<string, unknown>, field: string) {
  const descriptor = Object.getOwnPropertyDescriptor(record, field);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function invalidRequest(): VnextGuestSessionRequestParseResult {
  return {
    success: false,
    error: createExperiencePublicError("invalid_request", "correct_request"),
  };
}

export const createVnextGuestSessionRequestSchema = {
  safeParse(input: unknown): VnextGuestSessionRequestParseResult {
    try {
      if (
        !isPlainRecord(input) ||
        Reflect.ownKeys(input).some(
          (field) => typeof field !== "string" || !REQUEST_FIELDS.has(field),
        ) ||
        Reflect.ownKeys(input).length !== REQUEST_FIELDS.size
      ) {
        return invalidRequest();
      }
      const clientRequestId = ownDataValue(input, "clientRequestId");
      const bootstrapRecoverySecret = ownDataValue(input, "bootstrapRecoverySecret");
      const audienceMode = ownDataValue(input, "audienceMode");
      const inputPolicy = ownDataValue(input, "inputPolicy");
      const admissionPolicyVersion = ownDataValue(input, "admissionPolicyVersion");
      const aiIdentityNoticeVersion = ownDataValue(input, "aiIdentityNoticeVersion");
      const serviceTermsVersion = ownDataValue(input, "serviceTermsVersion");
      const privacyNoticeVersion = ownDataValue(input, "privacyNoticeVersion");
      const aiIdentityAcknowledged = ownDataValue(input, "aiIdentityAcknowledged");
      const serviceTermsAccepted = ownDataValue(input, "serviceTermsAccepted");
      const privacyNoticeAcknowledged = ownDataValue(input, "privacyNoticeAcknowledged");
      if (
        typeof clientRequestId !== "string" ||
        !UUID_V4_PATTERN.test(clientRequestId) ||
        typeof bootstrapRecoverySecret !== "string" ||
        !BOOTSTRAP_RECOVERY_SECRET_PATTERN.test(bootstrapRecoverySecret) ||
        typeof audienceMode !== "string" ||
        !AUDIENCE_MODES.has(audienceMode as VnextAudienceMode) ||
        typeof inputPolicy !== "string" ||
        !INPUT_POLICIES.has(inputPolicy as VnextInputPolicy) ||
        typeof admissionPolicyVersion !== "string" ||
        !VERSION_PATTERN.test(admissionPolicyVersion) ||
        typeof aiIdentityNoticeVersion !== "string" ||
        !VERSION_PATTERN.test(aiIdentityNoticeVersion) ||
        typeof serviceTermsVersion !== "string" ||
        !VERSION_PATTERN.test(serviceTermsVersion) ||
        typeof privacyNoticeVersion !== "string" ||
        !VERSION_PATTERN.test(privacyNoticeVersion) ||
        typeof aiIdentityAcknowledged !== "boolean" ||
        typeof serviceTermsAccepted !== "boolean" ||
        typeof privacyNoticeAcknowledged !== "boolean"
      ) {
        return invalidRequest();
      }
      return {
        success: true,
        data: {
          clientRequestId,
          bootstrapRecoverySecret,
          audienceMode: audienceMode as VnextAudienceMode,
          inputPolicy: inputPolicy as VnextInputPolicy,
          admissionPolicyVersion,
          aiIdentityNoticeVersion,
          serviceTermsVersion,
          privacyNoticeVersion,
          aiIdentityAcknowledged,
          serviceTermsAccepted,
          privacyNoticeAcknowledged,
        },
      };
    } catch {
      return invalidRequest();
    }
  },
};

function configuredOrigin(value: string) {
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

function loopbackHttpOrigin(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" ||
        url.hostname === "localhost" ||
        url.hostname === "[::1]")
    );
  } catch {
    return false;
  }
}

function configuredVersion(value: string | undefined) {
  const normalized = value?.trim() ?? "";
  return VERSION_PATTERN.test(normalized) ? normalized : "";
}

export function readVnextSessionAdmissionPolicy(
  env: Record<string, string | undefined> = process.env,
): VnextSessionAdmissionPolicy {
  const explicitOriginConfig = env.VNEXT_ALLOWED_ORIGINS?.trim();
  const originCandidates = explicitOriginConfig
    ? explicitOriginConfig.split(",").map((origin) => origin.trim())
    : env.NODE_ENV === "production"
      ? []
      : ["http://127.0.0.1:3000", "http://localhost:3000"];
  const originsValid =
    originCandidates.length > 0 && originCandidates.every(configuredOrigin);
  const admissionPolicyVersion = configuredVersion(env.VNEXT_INTERNAL_ADMISSION_POLICY_VERSION);
  const aiIdentityNoticeVersion = configuredVersion(env.VNEXT_INTERNAL_AI_NOTICE_VERSION);
  const serviceTermsVersion = configuredVersion(env.VNEXT_INTERNAL_TERMS_VERSION);
  const privacyNoticeVersion = configuredVersion(env.VNEXT_INTERNAL_PRIVACY_VERSION);
  const ttlSecondsRaw = env.VNEXT_GUEST_SESSION_TTL_SECONDS?.trim();
  const ttlSeconds = ttlSecondsRaw ? Number(ttlSecondsRaw) : 86_400;
  const ttlValid = Number.isInteger(ttlSeconds) && ttlSeconds >= 300 && ttlSeconds <= 604_800;
  const secureCookieSetting = env.VNEXT_SESSION_COOKIE_SECURE?.trim();
  const cookieSecurityValid =
    secureCookieSetting === "true" || secureCookieSetting === "false";
  const insecurePrivatePreviewAllowed =
    env.NODE_ENV === "production" &&
    secureCookieSetting === "false" &&
    env.VNEXT_PRIVATE_PREVIEW_ALLOW_INSECURE_COOKIE?.trim() === "true" &&
    originsValid &&
    originCandidates.every(loopbackHttpOrigin);
  const secureCookies =
    secureCookieSetting === "true" ||
    (env.NODE_ENV === "production" && !insecurePrivatePreviewAllowed);
  const sessionTokenSecret = env.VNEXT_SESSION_TOKEN_SECRET?.trim() ?? "";
  return {
    configured:
      originsValid &&
      ttlValid &&
      cookieSecurityValid &&
      (env.NODE_ENV !== "production" ||
        secureCookieSetting === "true" ||
        insecurePrivatePreviewAllowed) &&
      TOKEN_SECRET_PATTERN.test(sessionTokenSecret) &&
      admissionPolicyVersion !== "" &&
      aiIdentityNoticeVersion !== "" &&
      serviceTermsVersion !== "" &&
      privacyNoticeVersion !== "",
    allowedOrigins: new Set(originCandidates.filter(configuredOrigin)),
    secureCookies,
    sessionTokenSecret,
    guestSessionTtlMs: ttlValid ? ttlSeconds * 1_000 : 0,
    admissionPolicyVersion,
    aiIdentityNoticeVersion,
    serviceTermsVersion,
    privacyNoticeVersion,
  };
}

export type CreateGuestSessionResult =
  | {
      ok: true;
      status: "active";
      sessionToken?: string;
      expiresAt: Date;
    }
  | {
      ok: false;
      error: ExperiencePublicError;
      httpStatus: number;
      clearSessionCookie?: true;
    };

function failure(
  code:
    | "invalid_request"
    | "authentication_required"
    | "session_expired"
    | "compliance_blocked"
    | "temporarily_unavailable",
  recovery:
    | "correct_request"
    | "restore_session"
    | "refresh_admission"
    | "none"
    | "return_later",
  httpStatus: number,
  clearSessionCookie = false,
): CreateGuestSessionResult {
  return {
    ok: false,
    error: createExperiencePublicError(code, recovery),
    httpStatus,
    ...(clearSessionCookie ? { clearSessionCookie: true as const } : {}),
  };
}

export function isCurrentVnextSessionAdmission(
  session: VnextSessionRecord,
  policy: VnextSessionAdmissionPolicy,
) {
  return (
    policy.configured &&
    session.compliance.status === "eligible" &&
    session.compliance.audienceMode === "internal" &&
    session.compliance.inputPolicy === "synthetic_only" &&
    session.compliance.admissionPolicyVersion === policy.admissionPolicyVersion &&
    session.compliance.aiIdentityNoticeVersion === policy.aiIdentityNoticeVersion &&
    session.compliance.serviceTermsVersion === policy.serviceTermsVersion &&
    session.compliance.privacyNoticeVersion === policy.privacyNoticeVersion
  );
}

export function isRefreshableStaleVnextSessionAdmission(
  session: VnextSessionRecord,
  policy: VnextSessionAdmissionPolicy,
) {
  return (
    policy.configured &&
    session.compliance.status === "eligible" &&
    session.compliance.audienceMode === "internal" &&
    session.compliance.inputPolicy === "synthetic_only" &&
    session.compliance.admissionPolicyVersion !== policy.admissionPolicyVersion &&
    session.compliance.aiIdentityNoticeVersion === policy.aiIdentityNoticeVersion &&
    session.compliance.serviceTermsVersion === policy.serviceTermsVersion &&
    session.compliance.privacyNoticeVersion === policy.privacyNoticeVersion
  );
}

export class CreateGuestSession {
  constructor(
    private readonly repository: VnextSessionRepository,
    private readonly cookies: SessionCookieService,
    private readonly policy: VnextSessionAdmissionPolicy,
    private readonly clock: VnextClock,
    private readonly audit: VnextSessionAuditPort,
  ) {}

  async execute(
    request: VnextGuestSessionRequest,
    currentCookie: ParsedSessionCookie,
  ): Promise<CreateGuestSessionResult> {
    const auditContext = {
      audienceMode: request.audienceMode,
      inputPolicy: request.inputPolicy,
    };
    if (currentCookie.status === "invalid") {
      this.audit.record({ event: "session_resolve", outcome: "missing" });
      return failure("authentication_required", "restore_session", 401, true);
    }
    if (currentCookie.status === "valid") {
      let resolved: Awaited<ReturnType<VnextSessionRepository["resolveByTokenHash"]>>;
      try {
        resolved = await this.repository.resolveByTokenHash(
          hashSessionToken(currentCookie.token),
          this.clock.now(),
        );
      } catch {
        this.audit.record({ event: "guest_session_create", outcome: "failed", ...auditContext });
        return failure("temporarily_unavailable", "return_later", 503);
      }
      if (resolved.status === "active") {
        if (isRefreshableStaleVnextSessionAdmission(resolved.session, this.policy)) {
          this.audit.record({
            event: "guest_session_create",
            outcome: "blocked",
            ...auditContext,
          });
          return failure("compliance_blocked", "refresh_admission", 403, true);
        }
        const sameAdmission =
          isCurrentVnextSessionAdmission(resolved.session, this.policy) &&
          request.audienceMode === resolved.session.compliance.audienceMode &&
          request.inputPolicy === resolved.session.compliance.inputPolicy &&
          request.admissionPolicyVersion ===
            resolved.session.compliance.admissionPolicyVersion &&
          request.aiIdentityNoticeVersion ===
            resolved.session.compliance.aiIdentityNoticeVersion &&
          request.serviceTermsVersion === resolved.session.compliance.serviceTermsVersion &&
          request.privacyNoticeVersion === resolved.session.compliance.privacyNoticeVersion &&
          request.aiIdentityAcknowledged &&
          request.serviceTermsAccepted &&
          request.privacyNoticeAcknowledged;
        if (!sameAdmission) {
          this.audit.record({
            event: "guest_session_create",
            outcome: "blocked",
            ...auditContext,
          });
          return failure("compliance_blocked", "none", 403);
        }
        this.audit.record({ event: "guest_session_create", outcome: "reused", ...auditContext });
        return {
          ok: true,
          status: "active",
          expiresAt: resolved.session.session.expiresAt,
        };
      }
      if (resolved.status === "expired" || resolved.status === "revoked") {
        this.audit.record({ event: "session_resolve", outcome: resolved.status });
        return failure("session_expired", "restore_session", 401, true);
      }
      if (resolved.status === "restricted") {
        this.audit.record({
          event: "guest_session_create",
          outcome: "blocked",
          ...auditContext,
        });
        return failure("compliance_blocked", "none", 403);
      }
      this.audit.record({ event: "session_resolve", outcome: "missing" });
      return failure("authentication_required", "restore_session", 401, true);
    }

    const admissionAllowed =
      this.policy.configured &&
      request.audienceMode === "internal" &&
      request.inputPolicy === "synthetic_only" &&
      request.admissionPolicyVersion === this.policy.admissionPolicyVersion &&
      request.aiIdentityNoticeVersion === this.policy.aiIdentityNoticeVersion &&
      request.serviceTermsVersion === this.policy.serviceTermsVersion &&
      request.privacyNoticeVersion === this.policy.privacyNoticeVersion &&
      request.aiIdentityAcknowledged &&
      request.serviceTermsAccepted &&
      request.privacyNoticeAcknowledged;
    if (!admissionAllowed) {
      this.audit.record({ event: "guest_session_create", outcome: "blocked", ...auditContext });
      return failure("compliance_blocked", "none", 403);
    }

    const issued = this.cookies.issueForClientRequest(
      request.clientRequestId,
      request.bootstrapRecoverySecret,
      this.policy.sessionTokenSecret,
    );
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + this.policy.guestSessionTtlMs);
    try {
      const created = await this.repository.createGuestSession({
        tokenHash: issued.tokenHash,
        bootstrapRecoverySecretHash: hashBootstrapRecoverySecret(
          request.bootstrapRecoverySecret,
        ),
        clientRequestId: request.clientRequestId,
        now,
        expiresAt,
        audienceMode: "internal",
        inputPolicy: "synthetic_only",
        admissionPolicyVersion: request.admissionPolicyVersion,
        aiIdentityNoticeVersion: request.aiIdentityNoticeVersion,
        serviceTermsVersion: request.serviceTermsVersion,
        privacyNoticeVersion: request.privacyNoticeVersion,
        aiIdentityAcknowledgedAt: now,
        serviceTermsAcceptedAt: now,
        privacyNoticeAcknowledgedAt: now,
      });
      if (
        created.creationDisposition === "replayed" &&
        (created.session.authState !== "guest_active" ||
          created.session.revokedAt !== null ||
          created.session.guestExpiresAt.getTime() <= now.getTime() ||
          created.session.expiresAt.getTime() <= now.getTime() ||
          !isCurrentVnextSessionAdmission(created, this.policy))
      ) {
        this.audit.record({ event: "guest_session_create", outcome: "blocked", ...auditContext });
        return failure("invalid_request", "correct_request", 409);
      }
      this.audit.record({
        event: "guest_session_create",
        outcome: created.creationDisposition === "created" ? "created" : "reused",
        ...auditContext,
      });
      return {
        ok: true,
        status: "active",
        sessionToken: issued.token,
        expiresAt: created.session.expiresAt,
      };
    } catch (error) {
      this.audit.record({ event: "guest_session_create", outcome: "failed", ...auditContext });
      if (error instanceof VnextIdempotencyConflictError) {
        return failure("invalid_request", "correct_request", 409);
      }
      return failure("temporarily_unavailable", "return_later", 503);
    }
  }
}
