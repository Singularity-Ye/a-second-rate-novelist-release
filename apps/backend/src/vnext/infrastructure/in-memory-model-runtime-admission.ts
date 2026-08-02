import type { VnextModelProfileId } from "@erliu/shared-contracts";
import type {
  ModelRuntimeAdmissionPort,
  ModelRuntimeAdmissionRequest,
  ModelRuntimeAdmissionResult,
  ModelRuntimeLease,
} from "../domain/model-runtime-admission.port.js";

export interface InMemoryModelRuntimeAdmissionConfig {
  readonly perPrincipal: number;
  readonly perProfile: number;
  readonly global: number;
  readonly retryAfterSeconds: number;
}

export const DEFAULT_MODEL_RUNTIME_ADMISSION_CONFIG = {
  perPrincipal: 1,
  perProfile: 2,
  global: 4,
  retryAfterSeconds: 2,
} as const satisfies InMemoryModelRuntimeAdmissionConfig;

const CONFIG_LIMITS = {
  perPrincipal: 100,
  perProfile: 1_000,
  global: 10_000,
  retryAfterSeconds: 3_600,
} as const;

function configuredPositiveInteger(
  value: string | undefined,
  fallback: number,
  maximum: number,
  name: string,
) {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}`);
  }
  return parsed;
}

export function readInMemoryModelRuntimeAdmissionConfig(
  env: Record<string, string | undefined> = process.env,
): InMemoryModelRuntimeAdmissionConfig {
  return {
    perPrincipal: configuredPositiveInteger(
      env.VNEXT_MODEL_STREAMS_PER_PRINCIPAL,
      DEFAULT_MODEL_RUNTIME_ADMISSION_CONFIG.perPrincipal,
      CONFIG_LIMITS.perPrincipal,
      "VNEXT_MODEL_STREAMS_PER_PRINCIPAL",
    ),
    perProfile: configuredPositiveInteger(
      env.VNEXT_MODEL_STREAMS_PER_PROFILE,
      DEFAULT_MODEL_RUNTIME_ADMISSION_CONFIG.perProfile,
      CONFIG_LIMITS.perProfile,
      "VNEXT_MODEL_STREAMS_PER_PROFILE",
    ),
    global: configuredPositiveInteger(
      env.VNEXT_MODEL_STREAMS_GLOBAL,
      DEFAULT_MODEL_RUNTIME_ADMISSION_CONFIG.global,
      CONFIG_LIMITS.global,
      "VNEXT_MODEL_STREAMS_GLOBAL",
    ),
    retryAfterSeconds: configuredPositiveInteger(
      env.VNEXT_MODEL_STREAM_RETRY_AFTER_SECONDS,
      DEFAULT_MODEL_RUNTIME_ADMISSION_CONFIG.retryAfterSeconds,
      CONFIG_LIMITS.retryAfterSeconds,
      "VNEXT_MODEL_STREAM_RETRY_AFTER_SECONDS",
    ),
  };
}

function increment<Key>(map: Map<Key, number>, key: Key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function decrement<Key>(map: Map<Key, number>, key: Key) {
  const next = (map.get(key) ?? 0) - 1;
  if (next <= 0) map.delete(key);
  else map.set(key, next);
}

/**
 * Pilot-only, single-process admission control.
 *
 * The port deliberately keeps the controller independent from this storage
 * choice. Before running more than one backend replica, replace this provider
 * with an atomic Redis lease implementation; per-process counters are not a
 * cluster-wide capacity guarantee.
 */
export class InMemoryModelRuntimeAdmission
  implements ModelRuntimeAdmissionPort
{
  private readonly activeRequests = new Set<string>();
  private readonly activeByPrincipal = new Map<string, number>();
  private readonly activeByProfile = new Map<VnextModelProfileId, number>();
  private activeGlobal = 0;

  constructor(private readonly config: InMemoryModelRuntimeAdmissionConfig) {}

  async tryAcquire(
    request: ModelRuntimeAdmissionRequest,
  ): Promise<ModelRuntimeAdmissionResult> {
    const requestKey = `${request.ownerPrincipalId}\u0000${request.requestId}`;
    if (this.activeRequests.has(requestKey)) {
      return this.denied("duplicate_request");
    }
    if (
      (this.activeByPrincipal.get(request.ownerPrincipalId) ?? 0) >=
      this.config.perPrincipal
    ) {
      return this.denied("principal_capacity");
    }
    if (
      (this.activeByProfile.get(request.profileId) ?? 0) >=
      this.config.perProfile
    ) {
      return this.denied("profile_capacity");
    }
    if (this.activeGlobal >= this.config.global) {
      return this.denied("global_capacity");
    }

    this.activeRequests.add(requestKey);
    increment(this.activeByPrincipal, request.ownerPrincipalId);
    increment(this.activeByProfile, request.profileId);
    this.activeGlobal += 1;

    let released = false;
    const lease: ModelRuntimeLease = {
      release: async () => {
        if (released) return;
        released = true;
        this.activeRequests.delete(requestKey);
        decrement(this.activeByPrincipal, request.ownerPrincipalId);
        decrement(this.activeByProfile, request.profileId);
        this.activeGlobal = Math.max(0, this.activeGlobal - 1);
      },
    };
    return { accepted: true, lease };
  }

  private denied(
    code: Exclude<ModelRuntimeAdmissionResult, { accepted: true }>["code"],
  ): ModelRuntimeAdmissionResult {
    return {
      accepted: false,
      code,
      retryAfterSeconds: this.config.retryAfterSeconds,
    };
  }
}
