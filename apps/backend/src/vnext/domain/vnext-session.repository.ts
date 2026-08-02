export type VnextPrincipalKind = "guest" | "account";
export type VnextExperienceAuthState =
  | "guest_active"
  | "binding"
  | "account_active"
  | "expired";
export type VnextAudienceMode = "internal" | "verified_adult_external";
export type VnextInputPolicy = "synthetic_only" | "real_input";
export type VnextComplianceStatus =
  | "pending"
  | "eligible"
  | "withdrawn"
  | "blocked"
  | "expired";
export type VnextAgeVerificationStatus =
  | "pending"
  | "verified_adult"
  | "rejected"
  | "expired";

export interface VnextPrincipalContext {
  id: string;
  kind: VnextPrincipalKind;
}

export interface VnextCurrentSessionAdmission {
  readonly configured: boolean;
  readonly admissionPolicyVersion: string;
  readonly aiIdentityNoticeVersion: string;
  readonly serviceTermsVersion: string;
  readonly privacyNoticeVersion: string;
}

export interface VnextSessionRecord {
  principal: VnextPrincipalContext;
  session: {
    id: string;
    principalId: string;
    clientRequestId: string;
    projectionVersionId: string;
    authState: VnextExperienceAuthState;
    guestExpiresAt: Date;
    expiresAt: Date;
    revokedAt: Date | null;
    lastSeenAt: Date;
  };
  compliance: {
    id: string;
    ownerPrincipalId: string;
    experienceSessionId: string;
    audienceMode: VnextAudienceMode;
    inputPolicy: VnextInputPolicy;
    status: VnextComplianceStatus;
    admissionPolicyVersion: string;
    aiIdentityNoticeVersion: string;
    serviceTermsVersion: string;
    privacyNoticeVersion: string;
    ageVerificationStatus: VnextAgeVerificationStatus;
  };
}

export type ActiveVnextSession = VnextSessionRecord;

export interface CreateVnextGuestSessionRecord {
  tokenHash: string;
  bootstrapRecoverySecretHash: string;
  clientRequestId: string;
  now: Date;
  expiresAt: Date;
  audienceMode: "internal";
  inputPolicy: "synthetic_only";
  admissionPolicyVersion: string;
  aiIdentityNoticeVersion: string;
  serviceTermsVersion: string;
  privacyNoticeVersion: string;
  aiIdentityAcknowledgedAt: Date;
  serviceTermsAcceptedAt: Date;
  privacyNoticeAcknowledgedAt: Date;
}

export class VnextIdempotencyConflictError extends Error {
  override readonly name = "VnextIdempotencyConflictError";
}

export type VnextGuestSessionCreation = VnextSessionRecord & {
  creationDisposition: "created" | "replayed";
};

export type VnextSessionResolution =
  | { status: "active"; session: ActiveVnextSession }
  | { status: "restricted"; session: VnextSessionRecord }
  | { status: "not_found" | "expired" | "revoked" };

export interface VnextSessionRepository {
  createGuestSession(input: CreateVnextGuestSessionRecord): Promise<VnextGuestSessionCreation>;
  resolveByTokenHash(tokenHash: string, now: Date): Promise<VnextSessionResolution>;
  findOwnedSession(principalId: string, sessionId: string): Promise<VnextSessionRecord | null>;
  revokeOwnedSession(principalId: string, sessionId: string, now: Date): Promise<boolean>;
}

export interface VnextClock {
  now(): Date;
}

export interface VnextSessionAuditEvent {
  event: "guest_session_create" | "session_resolve" | "origin_check";
  outcome:
    | "created"
    | "reused"
    | "blocked"
    | "failed"
    | "active"
    | "restricted"
    | "missing"
    | "expired"
    | "revoked"
    | "invalid_origin"
    | "allowed_origin"
    | "rate_limited";
  audienceMode?: VnextAudienceMode;
  inputPolicy?: VnextInputPolicy;
}

export interface VnextSessionAuditPort {
  record(event: VnextSessionAuditEvent): void;
}

export interface VnextSessionRateLimitPort {
  consume(input: { origin: string; networkKey: string }): Promise<boolean> | boolean;
}

export const VNEXT_SESSION_REPOSITORY = Symbol("VNEXT_SESSION_REPOSITORY");
export const VNEXT_CLOCK = Symbol("VNEXT_CLOCK");
export const VNEXT_SESSION_AUDIT = Symbol("VNEXT_SESSION_AUDIT");
export const VNEXT_SESSION_RATE_LIMITER = Symbol("VNEXT_SESSION_RATE_LIMITER");
