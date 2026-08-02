import type { ModelRuntimeAdmissionPort } from "../domain/model-runtime-admission.port.js";
import {
  InMemoryModelRuntimeAdmission,
  readInMemoryModelRuntimeAdmissionConfig,
} from "./in-memory-model-runtime-admission.js";
import {
  readRedisModelRuntimeAdmissionConfig,
  RedisModelRuntimeAdmission,
} from "./redis-model-runtime-admission.js";

export type ConfiguredModelRuntimeAdmissionBackend = "memory" | "redis";

export function readConfiguredModelRuntimeAdmissionBackend(
  env: Record<string, string | undefined> = process.env,
): ConfiguredModelRuntimeAdmissionBackend {
  const configured = env.VNEXT_MODEL_RUNTIME_ADMISSION_BACKEND?.trim();
  if (configured === undefined || configured === "" || configured === "memory") {
    return "memory";
  }
  if (configured === "redis") return "redis";
  throw new Error(
    "VNEXT_MODEL_RUNTIME_ADMISSION_BACKEND must be memory or redis",
  );
}

/**
 * Storage selection is explicit. Redis failures never fall back to per-process
 * memory counters, because that would silently split the cluster capacity truth.
 */
export function createConfiguredModelRuntimeAdmission(
  env: Record<string, string | undefined> = process.env,
): ModelRuntimeAdmissionPort {
  return readConfiguredModelRuntimeAdmissionBackend(env) === "redis"
    ? new RedisModelRuntimeAdmission(
        readRedisModelRuntimeAdmissionConfig(env),
      )
    : new InMemoryModelRuntimeAdmission(
        readInMemoryModelRuntimeAdmissionConfig(env),
      );
}
