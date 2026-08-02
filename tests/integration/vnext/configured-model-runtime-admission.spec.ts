import { describe, expect, it } from "vitest";
import {
  createConfiguredModelRuntimeAdmission,
  readConfiguredModelRuntimeAdmissionBackend,
} from "../../../apps/backend/src/vnext/infrastructure/configured-model-runtime-admission";
import { InMemoryModelRuntimeAdmission } from "../../../apps/backend/src/vnext/infrastructure/in-memory-model-runtime-admission";
import { RedisModelRuntimeAdmission } from "../../../apps/backend/src/vnext/infrastructure/redis-model-runtime-admission";

describe("configured model runtime admission", () => {
  it("keeps local and legacy single-process runtime on explicit/default memory", () => {
    expect(readConfiguredModelRuntimeAdmissionBackend({})).toBe("memory");
    expect(
      createConfiguredModelRuntimeAdmission({
        VNEXT_MODEL_RUNTIME_ADMISSION_BACKEND: "memory",
      }),
    ).toBeInstanceOf(InMemoryModelRuntimeAdmission);
  });

  it("constructs Redis only from an explicit backend and never falls back", () => {
    const admission = createConfiguredModelRuntimeAdmission({
      VNEXT_MODEL_RUNTIME_ADMISSION_BACKEND: "redis",
      REDIS_URL: "redis://127.0.0.1:6379/0",
      VNEXT_MODEL_ADMISSION_NAMESPACE: "shared-dev",
      VNEXT_CREATIVE_TIMEOUT_MS: "180000",
      VNEXT_MODEL_ADMISSION_LEASE_TTL_MS: "300000",
    });
    expect(admission).toBeInstanceOf(RedisModelRuntimeAdmission);

    expect(() =>
      createConfiguredModelRuntimeAdmission({
        VNEXT_MODEL_RUNTIME_ADMISSION_BACKEND: "redis",
      }),
    ).toThrow();
    expect(() =>
      readConfiguredModelRuntimeAdmissionBackend({
        VNEXT_MODEL_RUNTIME_ADMISSION_BACKEND: "automatic",
      }),
    ).toThrow(/must be memory or redis/u);
  });
});
