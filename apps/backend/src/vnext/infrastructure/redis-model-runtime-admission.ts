import { createHash, randomBytes } from "node:crypto";
import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { createClient } from "redis";
import type {
  ModelRuntimeAdmissionDenialCode,
  ModelRuntimeAdmissionPort,
  ModelRuntimeAdmissionRequest,
  ModelRuntimeAdmissionResult,
  ModelRuntimeLease,
} from "../domain/model-runtime-admission.port.js";

export interface RedisModelRuntimeAdmissionConfig {
  readonly url: string;
  readonly namespace: string;
  readonly perPrincipal: number;
  readonly perProfile: number;
  readonly global: number;
  readonly retryAfterSeconds: number;
  readonly leaseTtlMs: number;
  readonly operationTimeoutMs: number;
}

export interface RedisModelRuntimeEvalOptions {
  readonly keys: readonly string[];
  readonly arguments: readonly string[];
}

/** Narrow command surface so tests never need a Redis process or broad mock. */
export interface RedisModelRuntimeAdmissionClient {
  eval(
    script: string,
    options: RedisModelRuntimeEvalOptions,
  ): Promise<unknown>;
  connect?(): Promise<unknown>;
  quit?(): Promise<unknown>;
  destroy?(): void;
  readonly isOpen?: boolean;
  readonly isReady?: boolean;
}

export type RedisModelRuntimeAdmissionErrorCode =
  | "invalid_configuration"
  | "invalid_request"
  | "operation_timeout"
  | "redis_command_failed"
  | "invalid_redis_reply";

export class RedisModelRuntimeAdmissionError extends Error {
  override readonly name = "RedisModelRuntimeAdmissionError";

  constructor(
    readonly code: RedisModelRuntimeAdmissionErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const DEFAULT_REDIS_MODEL_RUNTIME_ADMISSION_CONFIG = {
  perPrincipal: 1,
  perProfile: 2,
  global: 4,
  retryAfterSeconds: 2,
  leaseTtlMs: 5 * 60_000,
  operationTimeoutMs: 2_000,
} as const;

const DEFAULT_CREATIVE_TIMEOUT_MS = 45_000;
const LEASE_COMPLETION_MARGIN_MS = 30_000;

const CONFIG_LIMITS = {
  perPrincipal: { minimum: 1, maximum: 100 },
  perProfile: { minimum: 1, maximum: 1_000 },
  global: { minimum: 1, maximum: 10_000 },
  retryAfterSeconds: { minimum: 1, maximum: 3_600 },
  leaseTtlMs: { minimum: 1_000, maximum: 60 * 60_000 },
  operationTimeoutMs: { minimum: 25, maximum: 30_000 },
} as const;

const ACQUIRE_REPLY = {
  accepted: 1,
  duplicate_request: 2,
  principal_capacity: 3,
  profile_capacity: 4,
  global_capacity: 5,
} as const;

const DENIAL_BY_REPLY = new Map<number, ModelRuntimeAdmissionDenialCode>([
  [ACQUIRE_REPLY.duplicate_request, "duplicate_request"],
  [ACQUIRE_REPLY.principal_capacity, "principal_capacity"],
  [ACQUIRE_REPLY.profile_capacity, "profile_capacity"],
  [ACQUIRE_REPLY.global_capacity, "global_capacity"],
]);

const ACQUIRE_SCRIPT = `
-- VNEXT_MODEL_RUNTIME_ADMISSION_ACQUIRE_V1
local global_key = KEYS[1]
local principal_key = KEYS[2]
local profile_key = KEYS[3]
local request_key = KEYS[4]

local lease_token = ARGV[1]
local lease_ttl_ms = tonumber(ARGV[2])
local per_principal = tonumber(ARGV[3])
local per_profile = tonumber(ARGV[4])
local global_limit = tonumber(ARGV[5])

local redis_time = redis.call("TIME")
local now_ms = (tonumber(redis_time[1]) * 1000) + math.floor(tonumber(redis_time[2]) / 1000)
local expires_at_ms = now_ms + lease_ttl_ms

redis.call("ZREMRANGEBYSCORE", global_key, "-inf", now_ms)
redis.call("ZREMRANGEBYSCORE", principal_key, "-inf", now_ms)
redis.call("ZREMRANGEBYSCORE", profile_key, "-inf", now_ms)

if redis.call("GET", request_key) then
  return ${ACQUIRE_REPLY.duplicate_request}
end
if redis.call("ZCARD", principal_key) >= per_principal then
  return ${ACQUIRE_REPLY.principal_capacity}
end
if redis.call("ZCARD", profile_key) >= per_profile then
  return ${ACQUIRE_REPLY.profile_capacity}
end
if redis.call("ZCARD", global_key) >= global_limit then
  return ${ACQUIRE_REPLY.global_capacity}
end

redis.call("ZADD", global_key, expires_at_ms, lease_token)
redis.call("ZADD", principal_key, expires_at_ms, lease_token)
redis.call("ZADD", profile_key, expires_at_ms, lease_token)
redis.call("SET", request_key, lease_token, "PX", lease_ttl_ms)

redis.call("PEXPIRE", global_key, lease_ttl_ms)
redis.call("PEXPIRE", principal_key, lease_ttl_ms)
redis.call("PEXPIRE", profile_key, lease_ttl_ms)

return ${ACQUIRE_REPLY.accepted}
`;

const RELEASE_SCRIPT = `
-- VNEXT_MODEL_RUNTIME_ADMISSION_RELEASE_V1
local lease_token = ARGV[1]

if redis.call("GET", KEYS[4]) ~= lease_token then
  return 0
end

redis.call("DEL", KEYS[4])
redis.call("ZREM", KEYS[1], lease_token)
redis.call("ZREM", KEYS[2], lease_token)
redis.call("ZREM", KEYS[3], lease_token)
return 1
`;

type OwnedRedisClient = ReturnType<typeof createClient>;

function invalidConfiguration(field: string): never {
  throw new RedisModelRuntimeAdmissionError(
    "invalid_configuration",
    `Invalid Redis model runtime admission configuration: ${field}`,
  );
}

function validateInteger(
  value: unknown,
  field: keyof typeof CONFIG_LIMITS,
): number {
  const limits = CONFIG_LIMITS[field];
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < limits.minimum ||
    value > limits.maximum
  ) {
    return invalidConfiguration(field);
  }
  return value;
}

function validateRedisUrl(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    return invalidConfiguration("url");
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return invalidConfiguration("url");
  }
  if (
    (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") ||
    parsed.hostname.length === 0 ||
    parsed.hash.length > 0
  ) {
    return invalidConfiguration("url");
  }
  return value;
}

function validateNamespace(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,95}$/u.test(value)
  ) {
    return invalidConfiguration("namespace");
  }
  return value;
}

export function validateRedisModelRuntimeAdmissionConfig(
  config: RedisModelRuntimeAdmissionConfig,
): RedisModelRuntimeAdmissionConfig {
  if (!config || typeof config !== "object") {
    return invalidConfiguration("config");
  }

  const validated: RedisModelRuntimeAdmissionConfig = {
    url: validateRedisUrl(config.url),
    namespace: validateNamespace(config.namespace),
    perPrincipal: validateInteger(config.perPrincipal, "perPrincipal"),
    perProfile: validateInteger(config.perProfile, "perProfile"),
    global: validateInteger(config.global, "global"),
    retryAfterSeconds: validateInteger(
      config.retryAfterSeconds,
      "retryAfterSeconds",
    ),
    leaseTtlMs: validateInteger(config.leaseTtlMs, "leaseTtlMs"),
    operationTimeoutMs: validateInteger(
      config.operationTimeoutMs,
      "operationTimeoutMs",
    ),
  };

  if (validated.operationTimeoutMs >= validated.leaseTtlMs) {
    return invalidConfiguration("operationTimeoutMs");
  }
  return validated;
}

function readConfiguredInteger(
  env: Record<string, string | undefined>,
  name: string,
  fallback: number,
): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) return invalidConfiguration(name);
  return parsed;
}

export function readRedisModelRuntimeAdmissionConfig(
  env: Record<string, string | undefined> = process.env,
): RedisModelRuntimeAdmissionConfig {
  const config = validateRedisModelRuntimeAdmissionConfig({
    url:
      env.VNEXT_MODEL_ADMISSION_REDIS_URL ?? env.REDIS_URL ?? "",
    namespace: env.VNEXT_MODEL_ADMISSION_NAMESPACE ?? "",
    perPrincipal: readConfiguredInteger(
      env,
      "VNEXT_MODEL_STREAMS_PER_PRINCIPAL",
      DEFAULT_REDIS_MODEL_RUNTIME_ADMISSION_CONFIG.perPrincipal,
    ),
    perProfile: readConfiguredInteger(
      env,
      "VNEXT_MODEL_STREAMS_PER_PROFILE",
      DEFAULT_REDIS_MODEL_RUNTIME_ADMISSION_CONFIG.perProfile,
    ),
    global: readConfiguredInteger(
      env,
      "VNEXT_MODEL_STREAMS_GLOBAL",
      DEFAULT_REDIS_MODEL_RUNTIME_ADMISSION_CONFIG.global,
    ),
    retryAfterSeconds: readConfiguredInteger(
      env,
      "VNEXT_MODEL_STREAM_RETRY_AFTER_SECONDS",
      DEFAULT_REDIS_MODEL_RUNTIME_ADMISSION_CONFIG.retryAfterSeconds,
    ),
    leaseTtlMs: readConfiguredInteger(
      env,
      "VNEXT_MODEL_ADMISSION_LEASE_TTL_MS",
      DEFAULT_REDIS_MODEL_RUNTIME_ADMISSION_CONFIG.leaseTtlMs,
    ),
    operationTimeoutMs: readConfiguredInteger(
      env,
      "VNEXT_MODEL_ADMISSION_OPERATION_TIMEOUT_MS",
      DEFAULT_REDIS_MODEL_RUNTIME_ADMISSION_CONFIG.operationTimeoutMs,
    ),
  });
  const creativeTimeoutMs = readConfiguredInteger(
    env,
    "VNEXT_CREATIVE_TIMEOUT_MS",
    DEFAULT_CREATIVE_TIMEOUT_MS,
  );
  if (
    creativeTimeoutMs < 100 ||
    creativeTimeoutMs > 180_000 ||
    config.leaseTtlMs < creativeTimeoutMs + LEASE_COMPLETION_MARGIN_MS
  ) {
    return invalidConfiguration("VNEXT_MODEL_ADMISSION_LEASE_TTL_MS");
  }
  return config;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function validateRequestText(value: unknown, field: string): asserts value is string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    Buffer.byteLength(value, "utf8") > 4_096
  ) {
    throw new RedisModelRuntimeAdmissionError(
      "invalid_request",
      `Invalid model runtime admission request: ${field}`,
    );
  }
}

function numericReply(value: unknown): number {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "bigint") {
    const converted = Number(value);
    if (Number.isSafeInteger(converted)) return converted;
  }
  if (typeof value === "string" && /^-?\d+$/u.test(value)) {
    const converted = Number(value);
    if (Number.isSafeInteger(converted)) return converted;
  }
  if (Buffer.isBuffer(value)) {
    return numericReply(value.toString("utf8"));
  }
  throw new RedisModelRuntimeAdmissionError(
    "invalid_redis_reply",
    "Redis model runtime admission returned an invalid reply",
  );
}

function operationWithTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(
      () =>
        reject(
          new RedisModelRuntimeAdmissionError(
            "operation_timeout",
            "Redis model runtime admission operation timed out",
          ),
        ),
      timeoutMs,
    );
    Promise.resolve()
      .then(operation)
      .then(
        (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timeout);
          reject(error);
        },
      );
  });
}

/**
 * Cluster-wide model admission backed by one Redis atomic truth.
 *
 * All EVAL keys share one namespace-specific hash tag. Owner, request and
 * profile identifiers are represented only by SHA-256 digests in Redis keys;
 * lease values contain only an opaque random token.
 */
export class RedisModelRuntimeAdmission
  implements ModelRuntimeAdmissionPort, OnModuleInit, OnModuleDestroy
{
  private readonly config: RedisModelRuntimeAdmissionConfig;
  private readonly client: RedisModelRuntimeAdmissionClient;
  private readonly ownedClient: OwnedRedisClient | undefined;
  private readonly keyPrefix: string;
  private connectPromise: Promise<void> | undefined;
  private connected = false;

  constructor(
    config: RedisModelRuntimeAdmissionConfig,
    client?: RedisModelRuntimeAdmissionClient,
  ) {
    this.config = validateRedisModelRuntimeAdmissionConfig(config);
    this.keyPrefix = `${this.config.namespace}:{${this.config.namespace}:model-runtime-admission}`;

    if (client) {
      this.client = client;
      this.ownedClient = undefined;
      return;
    }

    const ownedClient = createClient({
      url: this.config.url,
      disableOfflineQueue: true,
      socket: {
        connectTimeout: this.config.operationTimeoutMs,
      },
    });
    // node-redis requires an error listener. Command paths still throw and
    // fail closed; this listener intentionally does not print connection data.
    ownedClient.on("error", () => undefined);
    this.ownedClient = ownedClient;
    this.client = {
      get isOpen() {
        return ownedClient.isOpen;
      },
      get isReady() {
        return ownedClient.isReady;
      },
      connect: () => ownedClient.connect(),
      eval: (script, options) =>
        ownedClient.eval(script, {
          keys: [...options.keys],
          arguments: [...options.arguments],
        }),
      quit: () => ownedClient.quit(),
      destroy: () => ownedClient.destroy(),
    };
  }

  async onModuleInit(): Promise<void> {
    await this.ensureConnected();
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.ownedClient) return;
    if (this.connectPromise) {
      await this.connectPromise.catch(() => undefined);
    }
    if (!this.ownedClient.isOpen) return;

    try {
      await this.execute(async () => {
        await this.ownedClient?.quit();
      });
    } catch (error) {
      this.ownedClient.destroy();
      throw error;
    } finally {
      this.connected = false;
    }
  }

  async tryAcquire(
    request: ModelRuntimeAdmissionRequest,
  ): Promise<ModelRuntimeAdmissionResult> {
    validateRequestText(request.ownerPrincipalId, "ownerPrincipalId");
    validateRequestText(request.requestId, "requestId");
    validateRequestText(request.profileId, "profileId");

    const keys = this.keysFor(request);
    const leaseToken = randomBytes(32).toString("base64url");

    await this.ensureConnected();
    const reply = await this.execute(() =>
      this.client.eval(ACQUIRE_SCRIPT, {
        keys,
        arguments: [
          leaseToken,
          String(this.config.leaseTtlMs),
          String(this.config.perPrincipal),
          String(this.config.perProfile),
          String(this.config.global),
        ],
      }),
    );
    const replyCode = numericReply(reply);

    if (replyCode === ACQUIRE_REPLY.accepted) {
      return {
        accepted: true,
        lease: this.createLease(keys, leaseToken),
      };
    }

    const denialCode = DENIAL_BY_REPLY.get(replyCode);
    if (!denialCode) {
      throw new RedisModelRuntimeAdmissionError(
        "invalid_redis_reply",
        "Redis model runtime admission returned an unknown reply",
      );
    }
    return {
      accepted: false,
      code: denialCode,
      retryAfterSeconds: this.config.retryAfterSeconds,
    };
  }

  private keysFor(request: ModelRuntimeAdmissionRequest): readonly string[] {
    const principalDigest = sha256(request.ownerPrincipalId);
    const profileDigest = sha256(request.profileId);
    const requestDigest = sha256(
      `${request.ownerPrincipalId}\u0000${request.requestId}`,
    );
    return [
      `${this.keyPrefix}:global`,
      `${this.keyPrefix}:principal:${principalDigest}`,
      `${this.keyPrefix}:profile:${profileDigest}`,
      `${this.keyPrefix}:request:${requestDigest}`,
    ];
  }

  private createLease(
    keys: readonly string[],
    leaseToken: string,
  ): ModelRuntimeLease {
    let released = false;
    let releaseInFlight: Promise<void> | undefined;

    return {
      release: () => {
        if (released) return Promise.resolve();
        if (releaseInFlight) return releaseInFlight;

        releaseInFlight = this.releaseLease(keys, leaseToken)
          .then(() => {
            released = true;
          })
          .finally(() => {
            releaseInFlight = undefined;
          });
        return releaseInFlight;
      },
    };
  }

  private async releaseLease(
    keys: readonly string[],
    leaseToken: string,
  ): Promise<void> {
    await this.ensureConnected();
    const reply = await this.execute(() =>
      this.client.eval(RELEASE_SCRIPT, {
        keys,
        arguments: [leaseToken],
      }),
    );
    const replyCode = numericReply(reply);
    if (replyCode !== 0 && replyCode !== 1) {
      throw new RedisModelRuntimeAdmissionError(
        "invalid_redis_reply",
        "Redis model runtime admission release returned an unknown reply",
      );
    }
  }

  private async ensureConnected(): Promise<void> {
    if (!this.client.connect) return;
    if (this.client.isReady === true) {
      this.connected = true;
      return;
    }
    if (this.connected && this.client.isOpen !== false) return;
    if (this.client.isOpen === true) return;
    if (!this.connectPromise) {
      const connect = this.client.connect.bind(this.client);
      this.connectPromise = this.execute(async () => {
        await connect();
      })
        .then(() => {
          this.connected = true;
        })
        .finally(() => {
          this.connectPromise = undefined;
        });
    }
    await this.connectPromise;
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operationWithTimeout(
        operation,
        this.config.operationTimeoutMs,
      );
    } catch (error) {
      if (error instanceof RedisModelRuntimeAdmissionError) throw error;
      throw new RedisModelRuntimeAdmissionError(
        "redis_command_failed",
        "Redis model runtime admission command failed",
      );
    }
  }
}
