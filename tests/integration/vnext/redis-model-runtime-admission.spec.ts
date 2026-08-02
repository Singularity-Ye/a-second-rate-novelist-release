import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  readRedisModelRuntimeAdmissionConfig,
  RedisModelRuntimeAdmission,
  type RedisModelRuntimeAdmissionClient,
  type RedisModelRuntimeAdmissionConfig,
  type RedisModelRuntimeEvalOptions,
} from "../../../apps/backend/src/vnext/infrastructure/redis-model-runtime-admission";

const CONFIG = {
  url: "redis://127.0.0.1:6379/15",
  namespace: "test-model-admission",
  perPrincipal: 1,
  perProfile: 2,
  global: 2,
  retryAfterSeconds: 3,
  leaseTtlMs: 1_000,
  operationTimeoutMs: 100,
} as const satisfies RedisModelRuntimeAdmissionConfig;

interface EvalCall {
  readonly script: string;
  readonly options: RedisModelRuntimeEvalOptions;
}

type ScriptReply =
  | unknown
  | Error
  | (() => unknown | Promise<unknown>);

class RecordingRedisClient implements RedisModelRuntimeAdmissionClient {
  readonly calls: EvalCall[] = [];

  constructor(private readonly replies: ScriptReply[]) {}

  async eval(
    script: string,
    options: RedisModelRuntimeEvalOptions,
  ): Promise<unknown> {
    this.calls.push({
      script,
      options: {
        keys: [...options.keys],
        arguments: [...options.arguments],
      },
    });
    if (this.replies.length === 0) {
      throw new Error("unexpected fake Redis call");
    }
    const reply = this.replies.shift();
    if (reply instanceof Error) throw reply;
    return typeof reply === "function" ? await reply() : reply;
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function acceptedLease(
  admission: RedisModelRuntimeAdmission,
  input: {
    readonly ownerPrincipalId: string;
    readonly requestId: string;
    readonly profileId?: "deepseek" | "gpt" | "gemini" | "grok";
  },
) {
  const result = await admission.tryAcquire({
    ownerPrincipalId: input.ownerPrincipalId,
    requestId: input.requestId,
    profileId: input.profileId ?? "deepseek",
    purpose: "conversation",
  });
  expect(result.accepted).toBe(true);
  if (!result.accepted) throw new Error(`unexpected denial:${result.code}`);
  return result.lease;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("RedisModelRuntimeAdmission command contract", () => {
  it("calls one atomic Lua acquire with common-tagged hashed keys and bounded arguments", async () => {
    const client = new RecordingRedisClient([1]);
    const admission = new RedisModelRuntimeAdmission(CONFIG, client);
    const ownerPrincipalId = "owner-raw-value";
    const requestId = "request-raw-value";

    await acceptedLease(admission, { ownerPrincipalId, requestId });

    expect(client.calls).toHaveLength(1);
    const call = client.calls[0]!;
    expect(call.script).toContain("VNEXT_MODEL_RUNTIME_ADMISSION_ACQUIRE_V1");
    expect(call.options.keys).toHaveLength(4);
    expect(
      call.options.keys.every((key) =>
        key.includes("{test-model-admission:model-runtime-admission}"),
      ),
    ).toBe(true);
    expect(call.options.keys[1]).toContain(sha256(ownerPrincipalId));
    expect(call.options.keys[2]).toContain(sha256("deepseek"));
    expect(call.options.keys[3]).toContain(
      sha256(`${ownerPrincipalId}\u0000${requestId}`),
    );
    expect(call.options.keys.join("|")).not.toContain(ownerPrincipalId);
    expect(call.options.keys.join("|")).not.toContain(requestId);
    expect(call.options.arguments).toHaveLength(5);
    expect(call.options.arguments[0]).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(call.options.arguments.slice(1)).toEqual([
      "1000",
      "1",
      "2",
      "2",
    ]);
  });

  it.each([
    [2, "duplicate_request"],
    [3, "principal_capacity"],
    [4, "profile_capacity"],
    [5, "global_capacity"],
  ] as const)("maps Lua denial %i to %s", async (reply, code) => {
    const admission = new RedisModelRuntimeAdmission(
      CONFIG,
      new RecordingRedisClient([reply]),
    );

    await expect(
      admission.tryAcquire({
        ownerPrincipalId: "owner-a",
        requestId: "request-a",
        profileId: "deepseek",
        purpose: "conversation",
      }),
    ).resolves.toEqual({
      accepted: false,
      code,
      retryAfterSeconds: 3,
    });
  });

  it("coalesces concurrent async release calls and remains idempotent", async () => {
    const releaseReply = deferred<unknown>();
    const client = new RecordingRedisClient([1, () => releaseReply.promise]);
    const admission = new RedisModelRuntimeAdmission(CONFIG, client);
    const lease = await acceptedLease(admission, {
      ownerPrincipalId: "owner-a",
      requestId: "request-a",
    });

    const first = lease.release();
    const second = lease.release();
    await Promise.resolve();
    await Promise.resolve();
    expect(client.calls).toHaveLength(2);
    expect(client.calls[1]!.script).toContain(
      "VNEXT_MODEL_RUNTIME_ADMISSION_RELEASE_V1",
    );
    expect(client.calls[1]!.options.arguments).toEqual([
      client.calls[0]!.options.arguments[0],
    ]);

    releaseReply.resolve(1);
    await Promise.all([first, second]);
    await lease.release();
    expect(client.calls).toHaveLength(2);
  });

  it("rejects a failed release but keeps it retryable", async () => {
    const client = new RecordingRedisClient([
      1,
      new Error("simulated transport failure"),
      1,
    ]);
    const admission = new RedisModelRuntimeAdmission(CONFIG, client);
    const lease = await acceptedLease(admission, {
      ownerPrincipalId: "owner-a",
      requestId: "request-a",
    });

    await expect(lease.release()).rejects.toMatchObject({
      code: "redis_command_failed",
    });
    await expect(lease.release()).resolves.toBeUndefined();
    expect(client.calls).toHaveLength(3);
  });

  it("fails closed on command errors, timeouts and unknown Lua replies", async () => {
    const failed = new RedisModelRuntimeAdmission(
      CONFIG,
      new RecordingRedisClient([new Error("offline")]),
    );
    await expect(
      failed.tryAcquire({
        ownerPrincipalId: "owner-a",
        requestId: "request-a",
        profileId: "deepseek",
        purpose: "conversation",
      }),
    ).rejects.toMatchObject({ code: "redis_command_failed" });

    const timedOut = new RedisModelRuntimeAdmission(
      { ...CONFIG, operationTimeoutMs: 25 },
      new RecordingRedisClient([() => new Promise(() => undefined)]),
    );
    await expect(
      timedOut.tryAcquire({
        ownerPrincipalId: "owner-b",
        requestId: "request-b",
        profileId: "deepseek",
        purpose: "conversation",
      }),
    ).rejects.toMatchObject({ code: "operation_timeout" });

    const invalidReply = new RedisModelRuntimeAdmission(
      CONFIG,
      new RecordingRedisClient([99]),
    );
    await expect(
      invalidReply.tryAcquire({
        ownerPrincipalId: "owner-c",
        requestId: "request-c",
        profileId: "deepseek",
        purpose: "conversation",
      }),
    ).rejects.toMatchObject({ code: "invalid_redis_reply" });
  });
});

describe("RedisModelRuntimeAdmission configuration", () => {
  it.each([
    { ...CONFIG, url: "http://127.0.0.1:6379" },
    { ...CONFIG, url: "redis://" },
    { ...CONFIG, namespace: "bad{namespace}" },
    { ...CONFIG, perPrincipal: 0 },
    { ...CONFIG, perProfile: 1_001 },
    { ...CONFIG, global: Number.POSITIVE_INFINITY },
    { ...CONFIG, leaseTtlMs: 999 },
    { ...CONFIG, operationTimeoutMs: 0 },
    { ...CONFIG, operationTimeoutMs: 1_000 },
  ])("rejects invalid config without opening Redis", (config) => {
    expect(
      () =>
        new RedisModelRuntimeAdmission(
          config as RedisModelRuntimeAdmissionConfig,
          new RecordingRedisClient([]),
        ),
    ).toThrowError(expect.objectContaining({ code: "invalid_configuration" }));
  });

  it("requires an explicit namespace and accepts REDIS_URL without exposing it", () => {
    expect(() =>
      readRedisModelRuntimeAdmissionConfig({
        REDIS_URL: "redis://127.0.0.1:6379/0",
      }),
    ).toThrowError(expect.objectContaining({ code: "invalid_configuration" }));

    expect(
      readRedisModelRuntimeAdmissionConfig({
        REDIS_URL: "redis://127.0.0.1:6379/0",
        VNEXT_MODEL_ADMISSION_NAMESPACE: "shared-dev",
        VNEXT_MODEL_ADMISSION_LEASE_TTL_MS: "120000",
        VNEXT_MODEL_ADMISSION_OPERATION_TIMEOUT_MS: "1500",
      }),
    ).toMatchObject({
      namespace: "shared-dev",
      leaseTtlMs: 120_000,
      operationTimeoutMs: 1_500,
    });
  });

  it("rejects a lease TTL shorter than the provider timeout plus persistence margin", () => {
    expect(() =>
      readRedisModelRuntimeAdmissionConfig({
        REDIS_URL: "redis://127.0.0.1:6379/0",
        VNEXT_MODEL_ADMISSION_NAMESPACE: "shared-dev",
        VNEXT_CREATIVE_TIMEOUT_MS: "180000",
        VNEXT_MODEL_ADMISSION_LEASE_TTL_MS: "180000",
      }),
    ).toThrowError(expect.objectContaining({ code: "invalid_configuration" }));
  });
});

interface FakeRequestMapping {
  readonly token: string;
  readonly expiresAt: number;
}

class FakeAtomicRedisStore {
  private now = 10_000;
  private readonly zsets = new Map<string, Map<string, number>>();
  private readonly requests = new Map<string, FakeRequestMapping>();

  createClient(): RedisModelRuntimeAdmissionClient {
    return {
      eval: (script, options) => this.eval(script, options),
    };
  }

  advance(milliseconds: number): void {
    this.now += milliseconds;
  }

  private async eval(
    script: string,
    options: RedisModelRuntimeEvalOptions,
  ): Promise<unknown> {
    if (script.includes("VNEXT_MODEL_RUNTIME_ADMISSION_ACQUIRE_V1")) {
      return this.acquire(options);
    }
    if (script.includes("VNEXT_MODEL_RUNTIME_ADMISSION_RELEASE_V1")) {
      return this.release(options);
    }
    throw new Error("unknown fake Lua script");
  }

  private acquire(options: RedisModelRuntimeEvalOptions): number {
    const [globalKey, principalKey, profileKey, requestKey] = options.keys;
    const [token, ttlRaw, principalRaw, profileRaw, globalRaw] =
      options.arguments;
    if (
      !globalKey ||
      !principalKey ||
      !profileKey ||
      !requestKey ||
      !token ||
      !ttlRaw ||
      !principalRaw ||
      !profileRaw ||
      !globalRaw
    ) {
      throw new Error("invalid fake acquire command");
    }

    const ttl = Number(ttlRaw);
    const principalLimit = Number(principalRaw);
    const profileLimit = Number(profileRaw);
    const globalLimit = Number(globalRaw);
    const globalSet = this.cleanZset(globalKey);
    const principalSet = this.cleanZset(principalKey);
    const profileSet = this.cleanZset(profileKey);
    this.cleanRequest(requestKey);

    if (this.requests.has(requestKey)) return 2;
    if (principalSet.size >= principalLimit) return 3;
    if (profileSet.size >= profileLimit) return 4;
    if (globalSet.size >= globalLimit) return 5;

    const expiresAt = this.now + ttl;
    globalSet.set(token, expiresAt);
    principalSet.set(token, expiresAt);
    profileSet.set(token, expiresAt);
    this.requests.set(requestKey, { token, expiresAt });
    return 1;
  }

  private release(options: RedisModelRuntimeEvalOptions): number {
    const [globalKey, principalKey, profileKey, requestKey] = options.keys;
    const token = options.arguments[0];
    if (
      !globalKey ||
      !principalKey ||
      !profileKey ||
      !requestKey ||
      !token
    ) {
      throw new Error("invalid fake release command");
    }

    this.cleanRequest(requestKey);
    if (this.requests.get(requestKey)?.token !== token) return 0;
    this.requests.delete(requestKey);
    this.zsets.get(globalKey)?.delete(token);
    this.zsets.get(principalKey)?.delete(token);
    this.zsets.get(profileKey)?.delete(token);
    return 1;
  }

  private cleanZset(key: string): Map<string, number> {
    let zset = this.zsets.get(key);
    if (!zset) {
      zset = new Map();
      this.zsets.set(key, zset);
    }
    for (const [token, expiresAt] of zset) {
      if (expiresAt <= this.now) zset.delete(token);
    }
    return zset;
  }

  private cleanRequest(key: string): void {
    const mapping = this.requests.get(key);
    if (mapping && mapping.expiresAt <= this.now) this.requests.delete(key);
  }
}

describe("RedisModelRuntimeAdmission shared atomic store", () => {
  it("keeps principal, profile and global capacity consistent across backend instances", async () => {
    const store = new FakeAtomicRedisStore();
    const backendA = new RedisModelRuntimeAdmission(CONFIG, store.createClient());
    const backendB = new RedisModelRuntimeAdmission(CONFIG, store.createClient());
    const first = await acceptedLease(backendA, {
      ownerPrincipalId: "owner-a",
      requestId: "request-a",
    });

    await expect(
      backendB.tryAcquire({
        ownerPrincipalId: "owner-a",
        requestId: "request-b",
        profileId: "grok",
        purpose: "analysis",
      }),
    ).resolves.toMatchObject({
      accepted: false,
      code: "principal_capacity",
    });

    const second = await acceptedLease(backendB, {
      ownerPrincipalId: "owner-b",
      requestId: "request-b",
    });
    await expect(
      backendA.tryAcquire({
        ownerPrincipalId: "owner-c",
        requestId: "request-c",
        profileId: "grok",
        purpose: "analysis",
      }),
    ).resolves.toMatchObject({
      accepted: false,
      code: "global_capacity",
    });

    await first.release();
    const third = await acceptedLease(backendA, {
      ownerPrincipalId: "owner-c",
      requestId: "request-c",
      profileId: "grok",
    });
    await Promise.all([second.release(), third.release()]);
  });

  it("recovers expired leases and a late release cannot remove the replacement", async () => {
    const store = new FakeAtomicRedisStore();
    const strictConfig = {
      ...CONFIG,
      perProfile: 1,
      global: 1,
    };
    const backendA = new RedisModelRuntimeAdmission(
      strictConfig,
      store.createClient(),
    );
    const backendB = new RedisModelRuntimeAdmission(
      strictConfig,
      store.createClient(),
    );
    const expired = await acceptedLease(backendA, {
      ownerPrincipalId: "owner-a",
      requestId: "same-request",
    });

    store.advance(CONFIG.leaseTtlMs + 1);
    const replacement = await acceptedLease(backendB, {
      ownerPrincipalId: "owner-a",
      requestId: "same-request",
    });
    await expired.release();

    await expect(
      backendA.tryAcquire({
        ownerPrincipalId: "owner-a",
        requestId: "new-request",
        profileId: "grok",
        purpose: "analysis",
      }),
    ).resolves.toMatchObject({
      accepted: false,
      code: "principal_capacity",
    });

    await replacement.release();
    const recovered = await acceptedLease(backendA, {
      ownerPrincipalId: "owner-a",
      requestId: "new-request",
      profileId: "grok",
    });
    await recovered.release();
  });
});
