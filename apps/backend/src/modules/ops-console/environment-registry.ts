import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { OpsEnvironmentKey } from "@erliu/shared-contracts";

export interface EnvironmentRegistryCatalogEntry {
  environment_key: OpsEnvironmentKey;
  domain: string;
  artifact_channel: string;
  health_endpoint: string;
  provider: string;
  access_mode: string;
  access_username_env: string;
}

const DEFAULT_ENVIRONMENT_REGISTRY: EnvironmentRegistryCatalogEntry[] = [
  {
    environment_key: "shared-dev",
    domain: "shared-dev.erliu.local",
    artifact_channel: "shared-dev",
    health_endpoint: "http://127.0.0.1:4000/healthz",
    provider: "local",
    access_mode: "none",
    access_username_env: "LOCAL_SHARED_DEV_ACCESS_USERNAME",
  },
  {
    environment_key: "staging",
    domain: "staging.erliu.local",
    artifact_channel: "staging",
    health_endpoint: "http://127.0.0.1:4000/healthz",
    provider: "local",
    access_mode: "none",
    access_username_env: "LOCAL_STAGING_ACCESS_USERNAME",
  },
  {
    environment_key: "live",
    domain: "live.erliu.local",
    artifact_channel: "live",
    health_endpoint: "http://127.0.0.1:4000/healthz",
    provider: "local",
    access_mode: "none",
    access_username_env: "LOCAL_LIVE_ACCESS_USERNAME",
  },
];

function resolveCatalogFile() {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return process.env.ENVIRONMENT_REGISTRY_FILE ?? path.resolve(moduleDir, "../../../../../infra/observability/environment-registry.json");
}

export function readEnvironmentRegistryCatalog(): EnvironmentRegistryCatalogEntry[] {
  const catalogFile = resolveCatalogFile();
  if (!existsSync(catalogFile)) {
    return DEFAULT_ENVIRONMENT_REGISTRY;
  }

  try {
    const payload = JSON.parse(readFileSync(catalogFile, "utf8")) as {
      environments?: Array<Partial<EnvironmentRegistryCatalogEntry>>;
    };
    const items = payload.environments
      ?.filter(
        (item): item is EnvironmentRegistryCatalogEntry =>
          item.environment_key === "shared-dev" ||
          item.environment_key === "staging" ||
          item.environment_key === "live",
      )
      .map((item) => ({
        environment_key: item.environment_key,
        domain: item.domain ?? DEFAULT_ENVIRONMENT_REGISTRY.find((entry) => entry.environment_key === item.environment_key)!.domain,
        artifact_channel:
          item.artifact_channel ??
          DEFAULT_ENVIRONMENT_REGISTRY.find((entry) => entry.environment_key === item.environment_key)!.artifact_channel,
        health_endpoint:
          item.health_endpoint ??
          DEFAULT_ENVIRONMENT_REGISTRY.find((entry) => entry.environment_key === item.environment_key)!.health_endpoint,
        provider:
          item.provider ?? DEFAULT_ENVIRONMENT_REGISTRY.find((entry) => entry.environment_key === item.environment_key)!.provider,
        access_mode:
          item.access_mode ??
          DEFAULT_ENVIRONMENT_REGISTRY.find((entry) => entry.environment_key === item.environment_key)!.access_mode,
        access_username_env:
          item.access_username_env ??
          DEFAULT_ENVIRONMENT_REGISTRY.find((entry) => entry.environment_key === item.environment_key)!.access_username_env,
      }));

    return items && items.length > 0 ? items : DEFAULT_ENVIRONMENT_REGISTRY;
  } catch {
    return DEFAULT_ENVIRONMENT_REGISTRY;
  }
}
