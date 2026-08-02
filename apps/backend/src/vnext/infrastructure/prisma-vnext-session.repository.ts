import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import {
  Prisma,
  PrismaClient,
  VnextAgeVerificationStatus,
  VnextAudienceMode,
  VnextComplianceStatus,
  VnextExperienceAuthState,
  VnextInputPolicy,
  VnextPrincipalKind,
} from "@prisma/client";
import {
  VnextIdempotencyConflictError,
  type CreateVnextGuestSessionRecord,
  type VnextSessionRecord,
  type VnextSessionRepository,
  type VnextSessionResolution,
} from "../domain/vnext-session.repository.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/;
const LAST_SEEN_WRITE_INTERVAL_MS = 60_000;
const DEFAULT_CONTINUOUS_USE_IDLE_RESET_MS = 30 * 60 * 1_000;
const CREATE_TRANSACTION_ATTEMPTS = 3;

export function readContinuousUseIdleResetPolicy(
  env: Record<string, string | undefined> = process.env,
) {
  const raw = env.VNEXT_CONTINUOUS_USE_IDLE_RESET_SECONDS?.trim() ?? "";
  const seconds = Number(raw);
  const configured =
    raw.length > 0 &&
    Number.isSafeInteger(seconds) &&
    seconds >= 60 &&
    seconds <= 3_600;
  return {
    configured,
    idleResetMs: configured
      ? seconds * 1_000
      : DEFAULT_CONTINUOUS_USE_IDLE_RESET_MS,
  };
}

function sameDigest(left: string, right: string) {
  return (
    TOKEN_HASH_PATTERN.test(left) &&
    TOKEN_HASH_PATTERN.test(right) &&
    timingSafeEqual(Buffer.from(left, "ascii"), Buffer.from(right, "ascii"))
  );
}

type SessionWithRelations = Prisma.VnextExperienceSessionGetPayload<{
  include: { principal: true; complianceSession: true };
}>;

export type VnextSessionTransactionWritePoint =
  | "after_principal"
  | "after_session"
  | "after_compliance";

export interface VnextSessionTransactionProbe {
  afterWrite(point: VnextSessionTransactionWritePoint): void | Promise<void>;
}

@Injectable()
export class VnextPrismaService extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy() {
    await this.$disconnect();
  }
}

function principalKind(kind: VnextPrincipalKind) {
  return kind === VnextPrincipalKind.ACCOUNT ? ("account" as const) : ("guest" as const);
}

function authState(state: VnextExperienceAuthState) {
  switch (state) {
    case VnextExperienceAuthState.BINDING:
      return "binding" as const;
    case VnextExperienceAuthState.ACCOUNT_ACTIVE:
      return "account_active" as const;
    case VnextExperienceAuthState.EXPIRED:
      return "expired" as const;
    default:
      return "guest_active" as const;
  }
}

function audienceMode(mode: VnextAudienceMode) {
  return mode === VnextAudienceMode.VERIFIED_ADULT_EXTERNAL
    ? ("verified_adult_external" as const)
    : ("internal" as const);
}

function inputPolicy(policy: VnextInputPolicy) {
  return policy === VnextInputPolicy.REAL_INPUT
    ? ("real_input" as const)
    : ("synthetic_only" as const);
}

function complianceStatus(status: VnextComplianceStatus) {
  return status.toLowerCase() as VnextSessionRecord["compliance"]["status"];
}

function ageVerificationStatus(status: VnextAgeVerificationStatus) {
  return status.toLowerCase() as VnextSessionRecord["compliance"]["ageVerificationStatus"];
}

function mapRecord(record: SessionWithRelations): VnextSessionRecord {
  if (!record.complianceSession) {
    throw new Error("vNext session has no compliance truth");
  }
  return {
    principal: {
      id: record.principal.id,
      kind: principalKind(record.principal.kind),
    },
    session: {
      id: record.id,
      principalId: record.principalId,
      clientRequestId: record.clientRequestId,
      projectionVersionId: record.projectionVersionId,
      authState: authState(record.authState),
      guestExpiresAt: record.guestExpiresAt,
      expiresAt: record.expiresAt,
      revokedAt: record.revokedAt,
      lastSeenAt: record.lastSeenAt,
    },
    compliance: {
      id: record.complianceSession.id,
      ownerPrincipalId: record.complianceSession.ownerPrincipalId,
      experienceSessionId: record.complianceSession.experienceSessionId,
      audienceMode: audienceMode(record.complianceSession.audienceMode),
      inputPolicy: inputPolicy(record.complianceSession.inputPolicy),
      status: complianceStatus(record.complianceSession.status),
      admissionPolicyVersion: record.complianceSession.admissionPolicyVersion,
      aiIdentityNoticeVersion: record.complianceSession.aiIdentityNoticeVersion,
      serviceTermsVersion: record.complianceSession.serviceTermsVersion,
      privacyNoticeVersion: record.complianceSession.privacyNoticeVersion,
      ageVerificationStatus: ageVerificationStatus(
        record.complianceSession.ageVerificationStatus,
      ),
    },
  };
}

export class PrismaVnextSessionRepository implements VnextSessionRepository {
  constructor(
    private readonly client: PrismaClient,
    private readonly probe?: VnextSessionTransactionProbe,
    private readonly continuousUseIdleResetMs =
      DEFAULT_CONTINUOUS_USE_IDLE_RESET_MS,
  ) {
    if (
      !Number.isSafeInteger(continuousUseIdleResetMs) ||
      continuousUseIdleResetMs < 60_000 ||
      continuousUseIdleResetMs > 3_600_000
    ) {
      throw new Error("invalid continuous-use idle reset policy");
    }
  }

  private async replayByClientRequestId(input: CreateVnextGuestSessionRecord) {
    const existing = await this.client.vnextExperienceSession.findUnique({
      where: { clientRequestId: input.clientRequestId },
      include: { principal: true, complianceSession: true },
    });
    if (!existing?.complianceSession) {
      return null;
    }
    if (
      !sameDigest(existing.cookieTokenHash, input.tokenHash) ||
      !sameDigest(
        existing.bootstrapRecoverySecretHash,
        input.bootstrapRecoverySecretHash,
      ) ||
      existing.complianceSession.audienceMode !== VnextAudienceMode.INTERNAL ||
      existing.complianceSession.inputPolicy !== VnextInputPolicy.SYNTHETIC_ONLY ||
      existing.complianceSession.admissionPolicyVersion !== input.admissionPolicyVersion ||
      existing.complianceSession.aiIdentityNoticeVersion !== input.aiIdentityNoticeVersion ||
      existing.complianceSession.serviceTermsVersion !== input.serviceTermsVersion ||
      existing.complianceSession.privacyNoticeVersion !== input.privacyNoticeVersion
    ) {
      throw new VnextIdempotencyConflictError(
        "clientRequestId is already bound to different admission truth",
      );
    }
    return { ...mapRecord(existing), creationDisposition: "replayed" as const };
  }

  async createGuestSession(input: CreateVnextGuestSessionRecord) {
    if (!TOKEN_HASH_PATTERN.test(input.tokenHash)) {
      throw new Error("tokenHash must be a SHA-256 hex digest");
    }
    if (!TOKEN_HASH_PATTERN.test(input.bootstrapRecoverySecretHash)) {
      throw new Error("bootstrapRecoverySecretHash must be a SHA-256 hex digest");
    }
    if (!UUID_PATTERN.test(input.clientRequestId)) {
      throw new Error("clientRequestId must be a UUID");
    }
    for (let attempt = 1; attempt <= CREATE_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.client.$transaction(
          async (transaction) => {
            const principal = await transaction.vnextPrincipal.create({
              data: { kind: VnextPrincipalKind.GUEST },
            });
            await this.probe?.afterWrite("after_principal");
            const session = await transaction.vnextExperienceSession.create({
              data: {
                principalId: principal.id,
                cookieTokenHash: input.tokenHash,
                clientRequestId: input.clientRequestId,
                bootstrapRecoverySecretHash: input.bootstrapRecoverySecretHash,
                authState: VnextExperienceAuthState.GUEST_ACTIVE,
                ageMode: VnextAgeVerificationStatus.PENDING,
                aiIdentityAcknowledgedAt: input.aiIdentityAcknowledgedAt,
                guestExpiresAt: input.expiresAt,
                expiresAt: input.expiresAt,
                lastSeenAt: input.now,
              },
            });
            await this.probe?.afterWrite("after_session");
            const compliance = await transaction.vnextComplianceSession.create({
              data: {
                ownerPrincipalId: principal.id,
                experienceSessionId: session.id,
                audienceMode: VnextAudienceMode.INTERNAL,
                inputPolicy: VnextInputPolicy.SYNTHETIC_ONLY,
                admissionPolicyVersion: input.admissionPolicyVersion,
                aiIdentityNoticeVersion: input.aiIdentityNoticeVersion,
                aiIdentityAcknowledgedAt: input.aiIdentityAcknowledgedAt,
                serviceTermsVersion: input.serviceTermsVersion,
                serviceTermsAcceptedAt: input.serviceTermsAcceptedAt,
                privacyNoticeVersion: input.privacyNoticeVersion,
                privacyNoticeAcknowledgedAt: input.privacyNoticeAcknowledgedAt,
                ageVerificationStatus: VnextAgeVerificationStatus.PENDING,
                continuousUseStartedAt: input.now,
                status: VnextComplianceStatus.ELIGIBLE,
              },
            });
            await this.probe?.afterWrite("after_compliance");
            return {
              ...mapRecord({ ...session, principal, complianceSession: compliance }),
              creationDisposition: "created" as const,
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          const replay = await this.replayByClientRequestId(input);
          if (replay) {
            return replay;
          }
          throw new VnextIdempotencyConflictError(
            "session token digest is already bound to another request",
          );
        }
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034" &&
          attempt < CREATE_TRANSACTION_ATTEMPTS
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new Error("vNext guest session transaction retry budget exhausted");
  }

  async resolveByTokenHash(tokenHash: string, now: Date): Promise<VnextSessionResolution> {
    if (!TOKEN_HASH_PATTERN.test(tokenHash)) {
      return { status: "not_found" };
    }
    const classify = (record: SessionWithRelations | null): VnextSessionResolution => {
      if (!record) {
        return { status: "not_found" };
      }
      if (record.revokedAt !== null) {
        return { status: "revoked" };
      }
      if (
        record.authState === VnextExperienceAuthState.EXPIRED ||
        record.guestExpiresAt.getTime() <= now.getTime() ||
        record.expiresAt.getTime() <= now.getTime()
      ) {
        return { status: "expired" };
      }
      if (
        record.authState !== VnextExperienceAuthState.GUEST_ACTIVE ||
        record.principal.kind !== VnextPrincipalKind.GUEST ||
        !record.complianceSession ||
        record.complianceSession.ownerPrincipalId !== record.principalId
      ) {
        return { status: "not_found" };
      }
      if (
        record.complianceSession.status !== VnextComplianceStatus.ELIGIBLE ||
        record.complianceSession.audienceMode !== VnextAudienceMode.INTERNAL ||
        record.complianceSession.inputPolicy !== VnextInputPolicy.SYNTHETIC_ONLY
      ) {
        return { status: "restricted", session: mapRecord(record) };
      }
      return { status: "active", session: mapRecord(record) };
    };

    const record = await this.client.vnextExperienceSession.findUnique({
      where: { cookieTokenHash: tokenHash },
      include: { principal: true, complianceSession: true },
    });
    const initial = classify(record);
    if (initial.status !== "active" || !record) {
      return initial;
    }
    const touchBefore = new Date(now.getTime() - LAST_SEEN_WRITE_INTERVAL_MS);
    if (record.lastSeenAt.getTime() > touchBefore.getTime()) {
      return initial;
    }
    const sessionWhere = {
      id: record.id,
      principalId: record.principalId,
      authState: VnextExperienceAuthState.GUEST_ACTIVE,
      revokedAt: null,
      guestExpiresAt: { gt: now },
      expiresAt: { gt: now },
      lastSeenAt: { lte: touchBefore },
    } as const;
    const continuousUseInterrupted =
      now.getTime() - record.lastSeenAt.getTime() >=
      this.continuousUseIdleResetMs;
    const touched = continuousUseInterrupted
      ? await this.client.$transaction(async (transaction) => {
          const sessionUpdate =
            await transaction.vnextExperienceSession.updateMany({
              where: sessionWhere,
              data: { lastSeenAt: now },
            });
          if (sessionUpdate.count !== 1) return sessionUpdate;
          const auditRefs = record.complianceSession?.auditRefs;
          if (
            !Array.isArray(auditRefs) ||
            !auditRefs.every((reference) => typeof reference === "string")
          ) {
            throw new Error("compliance audit refs are malformed");
          }
          const complianceUpdate =
            await transaction.vnextComplianceSession.updateMany({
              where: {
                id: record.complianceSession!.id,
                ownerPrincipalId: record.principalId,
                experienceSessionId: record.id,
                status: VnextComplianceStatus.ELIGIBLE,
                version: record.complianceSession!.version,
              },
              data: {
                continuousUseStartedAt: now,
                lastDurationReminderAt: null,
                auditRefs: [
                  ...auditRefs,
                  `continuous-use-resumed:${now.toISOString()}`,
                ],
                version: { increment: 1 },
              },
            });
          if (complianceUpdate.count !== 1) {
            throw new Error("continuous-use reset lost CAS");
          }
          return sessionUpdate;
        })
      : await this.client.vnextExperienceSession.updateMany({
          where: sessionWhere,
          data: { lastSeenAt: now },
        });
    if (touched.count === 1) {
      record.lastSeenAt = now;
      return { status: "active", session: mapRecord(record) };
    }
    const current = await this.client.vnextExperienceSession.findUnique({
      where: { id: record.id },
      include: { principal: true, complianceSession: true },
    });
    return classify(current);
  }

  async findOwnedSession(principalId: string, sessionId: string) {
    if (!principalId.trim()) {
      throw new Error("principalId is required");
    }
    if (!UUID_PATTERN.test(principalId) || !UUID_PATTERN.test(sessionId)) {
      return null;
    }
    const record = await this.client.vnextExperienceSession.findFirst({
      where: { id: sessionId, principalId },
      include: { principal: true, complianceSession: true },
    });
    return record?.complianceSession ? mapRecord(record) : null;
  }

  async revokeOwnedSession(principalId: string, sessionId: string, now: Date) {
    if (!principalId.trim()) {
      throw new Error("principalId is required");
    }
    if (!UUID_PATTERN.test(principalId) || !UUID_PATTERN.test(sessionId)) {
      return false;
    }
    const result = await this.client.vnextExperienceSession.updateMany({
      where: { id: sessionId, principalId, revokedAt: null },
      data: {
        revokedAt: now,
        authState: VnextExperienceAuthState.EXPIRED,
      },
    });
    return result.count === 1;
  }
}
