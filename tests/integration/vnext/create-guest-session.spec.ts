import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CreateGuestSession,
  createVnextGuestSessionRequestSchema,
  readVnextSessionAdmissionPolicy,
  type VnextSessionAdmissionPolicy,
} from "../../../apps/backend/src/vnext/application/create-guest-session";
import type {
  VnextSessionAuditEvent,
  VnextSessionRepository,
} from "../../../apps/backend/src/vnext/domain/vnext-session.repository";
import {
  PrismaVnextSessionRepository,
  VnextPrismaService,
} from "../../../apps/backend/src/vnext/infrastructure/prisma-vnext-session.repository";
import {
  SessionCookieService,
  hashBootstrapRecoverySecret,
  hashSessionToken,
} from "../../../apps/backend/src/vnext/infrastructure/session-cookie";

const FIXED_NOW = new Date("2026-07-17T12:00:00.000Z");
const LIVE_DATABASE_URL = process.env.TC163_DATABASE_URL?.trim() || null;

const policy: VnextSessionAdmissionPolicy = {
  configured: true,
  allowedOrigins: new Set(["http://127.0.0.1:3000"]),
  secureCookies: false,
  sessionTokenSecret: "A".repeat(43),
  guestSessionTtlMs: 24 * 60 * 60 * 1_000,
  admissionPolicyVersion: "internal-synthetic-v1",
  aiIdentityNoticeVersion: "ai-notice-v1",
  serviceTermsVersion: "internal-terms-v1",
  privacyNoticeVersion: "internal-privacy-v1",
};

function validRequest() {
  return {
    clientRequestId: randomUUID(),
    bootstrapRecoverySecret: randomBytes(32).toString("base64url"),
    audienceMode: "internal",
    inputPolicy: "synthetic_only",
    admissionPolicyVersion: policy.admissionPolicyVersion,
    aiIdentityNoticeVersion: policy.aiIdentityNoticeVersion,
    serviceTermsVersion: policy.serviceTermsVersion,
    privacyNoticeVersion: policy.privacyNoticeVersion,
    aiIdentityAcknowledged: true,
    serviceTermsAccepted: true,
    privacyNoticeAcknowledged: true,
  } as const;
}

function createAuditRecorder() {
  const events: VnextSessionAuditEvent[] = [];
  return {
    events,
    port: {
      record(event: VnextSessionAuditEvent) {
        events.push(event);
      },
    },
  };
}

function createRepositoryDouble() {
  const createGuestSession = vi.fn(async (input: Parameters<VnextSessionRepository["createGuestSession"]>[0]) => ({
    principal: { id: randomUUID(), kind: "guest" as const },
    session: {
      id: randomUUID(),
      principalId: randomUUID(),
      clientRequestId: input.clientRequestId,
      projectionVersionId: randomUUID(),
      authState: "guest_active" as const,
      guestExpiresAt: input.expiresAt,
      expiresAt: input.expiresAt,
      revokedAt: null,
      lastSeenAt: input.now,
    },
    compliance: {
      id: randomUUID(),
      ownerPrincipalId: randomUUID(),
      experienceSessionId: randomUUID(),
      audienceMode: input.audienceMode,
      inputPolicy: input.inputPolicy,
      status: "eligible" as const,
      admissionPolicyVersion: input.admissionPolicyVersion,
      aiIdentityNoticeVersion: input.aiIdentityNoticeVersion,
      serviceTermsVersion: input.serviceTermsVersion,
      privacyNoticeVersion: input.privacyNoticeVersion,
      ageVerificationStatus: "pending" as const,
    },
    creationDisposition: "created" as const,
  }));
  const repository: VnextSessionRepository = {
    createGuestSession,
    resolveByTokenHash: vi.fn(async () => ({ status: "not_found" as const })),
    findOwnedSession: vi.fn(async () => null),
    revokeOwnedSession: vi.fn(async () => false),
  };
  return { repository, createGuestSession };
}

describe("vNext guest-session request and admission", () => {
  it("keeps production admission disabled until exact origins and all versions are configured", () => {
    expect(readVnextSessionAdmissionPolicy({ NODE_ENV: "production" })).toMatchObject({
      configured: false,
      secureCookies: true,
      allowedOrigins: new Set(),
    });
    const configured = readVnextSessionAdmissionPolicy({
      NODE_ENV: "production",
      VNEXT_ALLOWED_ORIGINS: "https://preview.example.com",
      VNEXT_SESSION_COOKIE_SECURE: "true",
      VNEXT_SESSION_TOKEN_SECRET: policy.sessionTokenSecret,
      VNEXT_INTERNAL_ADMISSION_POLICY_VERSION: policy.admissionPolicyVersion,
      VNEXT_INTERNAL_AI_NOTICE_VERSION: policy.aiIdentityNoticeVersion,
      VNEXT_INTERNAL_TERMS_VERSION: policy.serviceTermsVersion,
      VNEXT_INTERNAL_PRIVACY_VERSION: policy.privacyNoticeVersion,
    });
    expect(configured).toMatchObject({
      configured: true,
      secureCookies: true,
      guestSessionTtlMs: 86_400_000,
    });
    expect(configured.allowedOrigins).toEqual(new Set(["https://preview.example.com"]));
    expect(
      readVnextSessionAdmissionPolicy({
        NODE_ENV: "production",
        VNEXT_ALLOWED_ORIGINS: "https://preview.example.com",
        VNEXT_SESSION_COOKIE_SECURE: "false",
        VNEXT_SESSION_TOKEN_SECRET: policy.sessionTokenSecret,
        VNEXT_INTERNAL_ADMISSION_POLICY_VERSION: policy.admissionPolicyVersion,
        VNEXT_INTERNAL_AI_NOTICE_VERSION: policy.aiIdentityNoticeVersion,
        VNEXT_INTERNAL_TERMS_VERSION: policy.serviceTermsVersion,
        VNEXT_INTERNAL_PRIVACY_VERSION: policy.privacyNoticeVersion,
      }).configured,
    ).toBe(false);

    const privateLoopbackPreview = readVnextSessionAdmissionPolicy({
      NODE_ENV: "production",
      VNEXT_ALLOWED_ORIGINS: "http://127.0.0.1:3330",
      VNEXT_SESSION_COOKIE_SECURE: "false",
      VNEXT_PRIVATE_PREVIEW_ALLOW_INSECURE_COOKIE: "true",
      VNEXT_SESSION_TOKEN_SECRET: policy.sessionTokenSecret,
      VNEXT_INTERNAL_ADMISSION_POLICY_VERSION: policy.admissionPolicyVersion,
      VNEXT_INTERNAL_AI_NOTICE_VERSION: policy.aiIdentityNoticeVersion,
      VNEXT_INTERNAL_TERMS_VERSION: policy.serviceTermsVersion,
      VNEXT_INTERNAL_PRIVACY_VERSION: policy.privacyNoticeVersion,
    });
    expect(privateLoopbackPreview).toMatchObject({
      configured: true,
      secureCookies: false,
      allowedOrigins: new Set(["http://127.0.0.1:3330"]),
    });
    for (const invalidPrivatePreviewOrigin of [
      "http://preview.example.com",
      "https://preview.example.com",
      "http://127.0.0.1.evil.example",
      "http://127.0.0.1:3330,http://preview.example.com",
    ]) {
      expect(
        readVnextSessionAdmissionPolicy({
          NODE_ENV: "production",
          VNEXT_ALLOWED_ORIGINS: invalidPrivatePreviewOrigin,
          VNEXT_SESSION_COOKIE_SECURE: "false",
          VNEXT_PRIVATE_PREVIEW_ALLOW_INSECURE_COOKIE: "true",
          VNEXT_SESSION_TOKEN_SECRET: policy.sessionTokenSecret,
          VNEXT_INTERNAL_ADMISSION_POLICY_VERSION: policy.admissionPolicyVersion,
          VNEXT_INTERNAL_AI_NOTICE_VERSION: policy.aiIdentityNoticeVersion,
          VNEXT_INTERNAL_TERMS_VERSION: policy.serviceTermsVersion,
          VNEXT_INTERNAL_PRIVACY_VERSION: policy.privacyNoticeVersion,
        }).configured,
      ).toBe(false);
    }
    expect(
      readVnextSessionAdmissionPolicy({
        ...Object.fromEntries(
          [
            ["VNEXT_INTERNAL_ADMISSION_POLICY_VERSION", policy.admissionPolicyVersion],
            ["VNEXT_INTERNAL_AI_NOTICE_VERSION", policy.aiIdentityNoticeVersion],
            ["VNEXT_INTERNAL_TERMS_VERSION", policy.serviceTermsVersion],
            ["VNEXT_INTERNAL_PRIVACY_VERSION", policy.privacyNoticeVersion],
          ] as const,
        ),
        NODE_ENV: "production",
        VNEXT_ALLOWED_ORIGINS: "https://preview.example.com.evil.test",
        VNEXT_SESSION_COOKIE_SECURE: "true",
        VNEXT_SESSION_TOKEN_SECRET: policy.sessionTokenSecret,
        VNEXT_GUEST_SESSION_TTL_SECONDS: "not-a-number",
      }).configured,
    ).toBe(false);
  });

  it("strictly parses the one canonical internal synthetic request", () => {
    expect(createVnextGuestSessionRequestSchema.safeParse(validRequest()).success).toBe(true);

    for (const invalid of [
      null,
      [],
      { ...validRequest(), ownerPrincipalId: randomUUID() },
      { ...validRequest(), accountToken: "legacy" },
      { ...validRequest(), provider: "fake" },
      { ...validRequest(), model: "fake" },
      { ...validRequest(), trace: {} },
      { ...validRequest(), audienceMode: "beta" },
      { ...validRequest(), inputPolicy: "fixture" },
      { ...validRequest(), clientRequestId: "not-a-uuid" },
      { ...validRequest(), clientRequestId: "123e4567-e89b-12d3-a456-426614174000" },
      { ...validRequest(), bootstrapRecoverySecret: "not-a-secret" },
      { ...validRequest(), aiIdentityAcknowledged: "true" },
    ]) {
      expect(createVnextGuestSessionRequestSchema.safeParse(invalid)).toEqual({
        success: false,
        error: { code: "invalid_request", recovery: "correct_request" },
      });
    }

    const accessor = Object.create(null) as Record<string, unknown>;
    for (const [key, value] of Object.entries(validRequest())) {
      Object.defineProperty(accessor, key, { configurable: true, enumerable: true, value });
    }
    Object.defineProperty(accessor, "audienceMode", {
      enumerable: true,
      get() {
        throw new Error("must not execute request accessors");
      },
    });
    expect(createVnextGuestSessionRequestSchema.safeParse(accessor).success).toBe(false);
  });

  it("creates only internal + synthetic_only and returns an active acknowledgement without credentials", async () => {
    const { repository, createGuestSession } = createRepositoryDouble();
    const audit = createAuditRecorder();
    const service = new CreateGuestSession(
      repository,
      new SessionCookieService(),
      policy,
      { now: () => FIXED_NOW },
      audit.port,
    );

    const result = await service.execute(validRequest(), { status: "missing" });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected successful guest session creation");
    }
    expect(createGuestSession).toHaveBeenCalledOnce();
    expect(result.status).toBe("active");
    const { sessionToken: _sessionToken, ...publicResult } = result;
    expect(JSON.stringify(publicResult)).not.toMatch(
      /cookie|token|digest|principal|compliance|provider|model|trace/i,
    );
    expect(result.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(audit.events)).not.toContain(result.sessionToken);
  });

  it.each([
    ["internal", "real_input"],
    ["verified_adult_external", "synthetic_only"],
    ["verified_adult_external", "real_input"],
  ] as const)("hard-blocks %s + %s before any write", async (audienceMode, inputPolicy) => {
    const { repository, createGuestSession } = createRepositoryDouble();
    const service = new CreateGuestSession(
      repository,
      new SessionCookieService(),
      policy,
      { now: () => FIXED_NOW },
      createAuditRecorder().port,
    );

    const result = await service.execute(
      { ...validRequest(), audienceMode, inputPolicy },
      { status: "missing" },
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "compliance_blocked", recovery: "none" },
      httpStatus: 403,
    });
    expect(createGuestSession).not.toHaveBeenCalled();
  });

  it("fails closed when server policy is missing, stale, or not explicitly acknowledged", async () => {
    const cases: Array<{ policy: VnextSessionAdmissionPolicy; request: ReturnType<typeof validRequest> }> = [
      { policy: { ...policy, configured: false }, request: validRequest() },
      {
        policy,
        request: { ...validRequest(), admissionPolicyVersion: "stale-policy" },
      },
      {
        policy,
        request: { ...validRequest(), privacyNoticeAcknowledged: false },
      },
    ];

    for (const current of cases) {
      const { repository, createGuestSession } = createRepositoryDouble();
      const service = new CreateGuestSession(
        repository,
        new SessionCookieService(),
        current.policy,
        { now: () => FIXED_NOW },
        createAuditRecorder().port,
      );
      const result = await service.execute(current.request, { status: "missing" });
      expect(result.ok).toBe(false);
      expect(result).toMatchObject({
        error: { code: "compliance_blocked", recovery: "none" },
      });
      expect(createGuestSession).not.toHaveBeenCalled();
    }
  });
});

describe("vNext session cookie", () => {
  it("stores only a one-way digest and emits local/production cookie attributes", () => {
    const cookies = new SessionCookieService();
    const issued = cookies.issue();
    const deterministic = cookies.issueForClientRequest(
      "123e4567-e89b-42d3-a456-426614174000",
      "B".repeat(43),
      policy.sessionTokenSecret,
    );
    const expiresAt = new Date(FIXED_NOW.getTime() + 60_000);

    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(issued.tokenHash).toBe(hashSessionToken(issued.token));
    expect(issued.tokenHash).toBe(createHash("sha256").update(issued.token).digest("hex"));
    expect(issued.tokenHash).not.toContain(issued.token);
    expect(
      cookies.issueForClientRequest(
        "123e4567-e89b-42d3-a456-426614174000",
        "B".repeat(43),
        policy.sessionTokenSecret,
      ),
    ).toEqual(deterministic);
    expect(
      cookies.issueForClientRequest(
        "123e4567-e89b-42d3-a456-426614174000",
        "C".repeat(43),
        policy.sessionTokenSecret,
      ),
    ).not.toEqual(deterministic);

    const local = cookies.serialize(issued.token, expiresAt, false, FIXED_NOW);
    expect(local).toContain("erliu_vnext_session=");
    expect(local).toContain("HttpOnly");
    expect(local).toContain("SameSite=Lax");
    expect(local).toContain("Path=/");
    expect(local).toContain("Max-Age=60");
    expect(local).not.toContain("Secure");
    expect(local).not.toContain("Domain=");

    const production = cookies.serialize(issued.token, expiresAt, true, FIXED_NOW);
    expect(production).toContain("__Host-erliu_vnext_session=");
    expect(production).toContain("Secure");
    expect(cookies.parse(`__Host-erliu_vnext_session=${issued.token}`, true)).toEqual({
      status: "valid",
      token: issued.token,
    });
    expect(cookies.serializeClear(true)).toBe(
      "__Host-erliu_vnext_session=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax; Secure",
    );
  });

  it("rejects malformed and duplicate session cookies", () => {
    const cookies = new SessionCookieService();
    const token = cookies.issue().token;
    expect(cookies.parse(undefined, false)).toEqual({ status: "missing" });
    expect(cookies.parse("erliu_vnext_session=short", false)).toEqual({ status: "invalid" });
    expect(
      cookies.parse(
        `erliu_vnext_session=${token}; erliu_vnext_session=${cookies.issue().token}`,
        false,
      ),
    ).toEqual({ status: "invalid" });
  });
});

describe.skipIf(LIVE_DATABASE_URL === null)("vNext guest-session PostgreSQL runtime", () => {
  let client: VnextPrismaService;

  beforeAll(() => {
    process.env.DATABASE_URL = LIVE_DATABASE_URL!;
    client = new VnextPrismaService();
  });

  beforeEach(async () => {
    process.env.DATABASE_URL = LIVE_DATABASE_URL!;
    await client.vnextComplianceSession.deleteMany();
    await client.vnextExperienceSession.deleteMany();
    await client.vnextPrincipal.deleteMany();
  });

  afterAll(async () => {
    await client?.$disconnect();
  });

  function repositoryInput(
    tokenHash = hashSessionToken(new SessionCookieService().issue().token),
    recoverySecret = randomBytes(32).toString("base64url"),
  ) {
    return {
      tokenHash,
      bootstrapRecoverySecretHash: hashBootstrapRecoverySecret(recoverySecret),
      clientRequestId: randomUUID(),
      now: FIXED_NOW,
      expiresAt: new Date(FIXED_NOW.getTime() + policy.guestSessionTtlMs),
      audienceMode: "internal" as const,
      inputPolicy: "synthetic_only" as const,
      admissionPolicyVersion: policy.admissionPolicyVersion,
      aiIdentityNoticeVersion: policy.aiIdentityNoticeVersion,
      serviceTermsVersion: policy.serviceTermsVersion,
      privacyNoticeVersion: policy.privacyNoticeVersion,
      aiIdentityAcknowledgedAt: FIXED_NOW,
      serviceTermsAcceptedAt: FIXED_NOW,
      privacyNoticeAcknowledgedAt: FIXED_NOW,
    };
  }

  it("atomically creates isolated principal/session/compliance truth and resolves the active owner", async () => {
    const repository = new PrismaVnextSessionRepository(client);
    const recoverySecret = randomBytes(32).toString("base64url");
    const input = repositoryInput(undefined, recoverySecret);
    const created = await repository.createGuestSession(input);

    expect(await client.vnextPrincipal.count()).toBe(1);
    expect(await client.vnextExperienceSession.count()).toBe(1);
    expect(await client.vnextComplianceSession.count()).toBe(1);
    expect(created.principal.kind).toBe("guest");
    expect(created.session.principalId).toBe(created.principal.id);
    expect(created.compliance.ownerPrincipalId).toBe(created.principal.id);
    expect(created.compliance.experienceSessionId).toBe(created.session.id);
    expect(created.compliance).toMatchObject({
      audienceMode: "internal",
      inputPolicy: "synthetic_only",
      status: "eligible",
      ageVerificationStatus: "pending",
    });

    const persisted = await client.vnextExperienceSession.findUniqueOrThrow({
      where: { id: created.session.id },
    });
    expect(persisted.cookieTokenHash).toBe(input.tokenHash);
    expect(persisted.bootstrapRecoverySecretHash).toBe(
      input.bootstrapRecoverySecretHash,
    );
    expect(JSON.stringify(persisted)).not.toMatch(/erliu_vnext_session|Bearer/i);
    expect(JSON.stringify(persisted)).not.toContain(recoverySecret);
    expect(await repository.resolveByTokenHash(input.tokenHash, FIXED_NOW)).toMatchObject({
      status: "active",
      session: { principal: { id: created.principal.id, kind: "guest" } },
    });
  });

  it.each(["after_principal", "after_session", "after_compliance"] as const)(
    "rolls back every object when failure is injected at %s",
    async (failurePoint) => {
      const repository = new PrismaVnextSessionRepository(client, {
        afterWrite(point) {
          if (point === failurePoint) {
            throw new Error(`injected-${point}`);
          }
        },
      });

      await expect(repository.createGuestSession(repositoryInput())).rejects.toThrow(
        `injected-${failurePoint}`,
      );
      expect(await client.vnextPrincipal.count()).toBe(0);
      expect(await client.vnextExperienceSession.count()).toBe(0);
      expect(await client.vnextComplianceSession.count()).toBe(0);
    },
  );

  it("enforces digest uniqueness and rolls back the losing transaction", async () => {
    const repository = new PrismaVnextSessionRepository(client);
    const tokenHash = hashSessionToken(new SessionCookieService().issue().token);
    await repository.createGuestSession(repositoryInput(tokenHash));

    await expect(repository.createGuestSession(repositoryInput(tokenHash))).rejects.toThrow();
    expect(await client.vnextPrincipal.count()).toBe(1);
    expect(await client.vnextExperienceSession.count()).toBe(1);
    expect(await client.vnextComplianceSession.count()).toBe(1);
  });

  it("commits one truth set for concurrent retries with the same clientRequestId", async () => {
    const repository = new PrismaVnextSessionRepository(client);
    const input = repositoryInput();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => repository.createGuestSession(input)),
    );

    expect(new Set(results.map((result) => result.session.id)).size).toBe(1);
    expect(
      results.filter((result) => result.creationDisposition === "created"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.creationDisposition === "replayed"),
    ).toHaveLength(7);
    expect(await client.vnextPrincipal.count()).toBe(1);
    expect(await client.vnextExperienceSession.count()).toBe(1);
    expect(await client.vnextComplianceSession.count()).toBe(1);
  });

  it("refuses a clientRequestId replay with a different recovery proof", async () => {
    const repository = new PrismaVnextSessionRepository(client);
    const input = repositoryInput();
    await repository.createGuestSession(input);

    await expect(
      repository.createGuestSession({
        ...input,
        tokenHash: hashSessionToken(new SessionCookieService().issue().token),
        bootstrapRecoverySecretHash: hashBootstrapRecoverySecret(
          randomBytes(32).toString("base64url"),
        ),
      }),
    ).rejects.toMatchObject({ name: "VnextIdempotencyConflictError" });
    expect(await client.vnextPrincipal.count()).toBe(1);
    expect(await client.vnextExperienceSession.count()).toBe(1);
    expect(await client.vnextComplianceSession.count()).toBe(1);
  });

  it("enforces database-level digest, owner-pair, version, and JSON-array constraints", async () => {
    const repository = new PrismaVnextSessionRepository(client);
    const first = await repository.createGuestSession(repositoryInput());
    const second = await repository.createGuestSession(repositoryInput());
    const constraints = await client.$queryRaw<Array<{ conname: string }>>`
      SELECT conname
      FROM pg_constraint
      WHERE conrelid IN (
        'vnext_experience_sessions'::regclass,
        'vnext_compliance_sessions'::regclass
      )
    `;
    expect(constraints.map((row) => row.conname)).toEqual(
      expect.arrayContaining([
        "vnext_experience_sessions_cookie_hash_check",
        "vnext_experience_sessions_guest_expiry_check",
        "vnext_experience_sessions_recovery_hash_check",
        "vnext_compliance_sessions_version_check",
        "vnext_compliance_sessions_processing_refs_check",
        "vnext_compliance_sessions_consent_refs_check",
        "vnext_compliance_sessions_safety_refs_check",
        "vnext_compliance_sessions_audit_refs_check",
        "vnext_compliance_sessions_experience_session_id_owner_prin_fkey",
      ]),
    );
    await expect(client.$executeRaw`
      UPDATE vnext_experience_sessions
      SET cookie_token_hash = 'not-a-digest'
      WHERE id = ${first.session.id}::uuid
    `).rejects.toThrow();
    await expect(client.$executeRaw`
      UPDATE vnext_experience_sessions
      SET bootstrap_recovery_secret_hash = 'not-a-digest'
      WHERE id = ${first.session.id}::uuid
    `).rejects.toThrow();
    await expect(client.$executeRaw`
      UPDATE vnext_compliance_sessions
      SET owner_principal_id = ${second.principal.id}::uuid
      WHERE id = ${first.compliance.id}::uuid
    `).rejects.toThrow();
    await expect(client.$executeRaw`
      UPDATE vnext_compliance_sessions
      SET consent_refs = '{}'::jsonb
      WHERE id = ${first.compliance.id}::uuid
    `).rejects.toThrow();
    await expect(client.$executeRaw`
      UPDATE vnext_compliance_sessions
      SET processing_basis_refs = '{}'::jsonb
      WHERE id = ${first.compliance.id}::uuid
    `).rejects.toThrow();
    await expect(client.$executeRaw`
      UPDATE vnext_compliance_sessions
      SET safety_case_refs = '{}'::jsonb
      WHERE id = ${first.compliance.id}::uuid
    `).rejects.toThrow();
    await expect(client.$executeRaw`
      UPDATE vnext_compliance_sessions
      SET audit_refs = '{}'::jsonb
      WHERE id = ${first.compliance.id}::uuid
    `).rejects.toThrow();
    await expect(client.$executeRaw`
      UPDATE vnext_compliance_sessions
      SET version = 0
      WHERE id = ${first.compliance.id}::uuid
    `).rejects.toThrow();
    await expect(client.$executeRaw`
      UPDATE vnext_experience_sessions
      SET guest_expires_at = expires_at + INTERVAL '1 second'
      WHERE id = ${first.session.id}::uuid
    `).rejects.toThrow();
  });

  it("makes owner scope mandatory and gives foreign-owner and missing resources the same null result", async () => {
    const repository = new PrismaVnextSessionRepository(client);
    const first = await repository.createGuestSession(repositoryInput());
    const second = await repository.createGuestSession(repositoryInput());

    await expect(repository.findOwnedSession("", first.session.id)).rejects.toThrow(
      "principalId is required",
    );
    expect(await repository.findOwnedSession(first.principal.id, first.session.id)).not.toBeNull();
    expect(await repository.findOwnedSession(second.principal.id, first.session.id)).toBeNull();
    expect(await repository.findOwnedSession(second.principal.id, randomUUID())).toBeNull();
  });

  it("rejects expired and revoked sessions without returning an active principal", async () => {
    const repository = new PrismaVnextSessionRepository(client);
    const expiredInput = repositoryInput();
    expiredInput.expiresAt = FIXED_NOW;
    await repository.createGuestSession(expiredInput);
    expect(await repository.resolveByTokenHash(expiredInput.tokenHash, FIXED_NOW)).toEqual({
      status: "expired",
    });

    const guestExpiredInput = repositoryInput();
    const guestExpired = await repository.createGuestSession(guestExpiredInput);
    await client.vnextExperienceSession.update({
      where: { id: guestExpired.session.id },
      data: {
        guestExpiresAt: FIXED_NOW,
        expiresAt: new Date(FIXED_NOW.getTime() + 60_000),
      },
    });
    expect(await repository.resolveByTokenHash(guestExpiredInput.tokenHash, FIXED_NOW)).toEqual({
      status: "expired",
    });

    const activeInput = repositoryInput();
    const active = await repository.createGuestSession(activeInput);
    expect(
      await repository.revokeOwnedSession(active.principal.id, active.session.id, FIXED_NOW),
    ).toBe(true);
    expect(await repository.resolveByTokenHash(activeInput.tokenHash, FIXED_NOW)).toEqual({
      status: "revoked",
    });
  });

  it("resolves concurrent requests without serializable failures or per-request writes", async () => {
    const repository = new PrismaVnextSessionRepository(client);
    const input = repositoryInput();
    const created = await repository.createGuestSession(input);
    await client.vnextExperienceSession.update({
      where: { id: created.session.id },
      data: { lastSeenAt: new Date(FIXED_NOW.getTime() - 120_000) },
    });

    const results = await Promise.all(
      Array.from({ length: 12 }, () => repository.resolveByTokenHash(input.tokenHash, FIXED_NOW)),
    );
    expect(results.every((result) => result.status === "active")).toBe(true);
    expect(
      await client.vnextExperienceSession.findUniqueOrThrow({
        where: { id: created.session.id },
        select: { lastSeenAt: true },
      }),
    ).toEqual({ lastSeenAt: FIXED_NOW });
  });
});
