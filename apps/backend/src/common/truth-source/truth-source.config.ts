import path from "node:path";
import { fileURLToPath } from "node:url";

export type TruthSourceRequestedMode = "json_file" | "postgres_primary";

export interface TruthSourceConfig {
  requested_mode: TruthSourceRequestedMode;
  json_state_file: string;
  primary_db: {
    provider: "postgres";
    url: string | null;
    configured: boolean;
  };
  cache: {
    provider: "redis";
    url: string | null;
    configured: boolean;
  };
  object_storage: {
    provider: "s3";
    endpoint: string | null;
    bucket: string | null;
    configured: boolean;
  };
  slice_rollout: {
    story_intake: {
      mode: "disabled" | "shadow_mirror" | "primary";
      driver: "disabled" | "postgres_prisma";
      enabled: boolean;
    };
    export_artifacts: {
      mode: "disabled" | "shadow_mirror" | "primary";
      driver: "disabled" | "s3_object_storage";
      enabled: boolean;
    };
    creative_artifacts: {
      mode: "disabled" | "shadow_mirror" | "primary";
      driver: "disabled" | "s3_object_storage";
      enabled: boolean;
    };
    projection_snapshots: {
      mode: "disabled" | "shadow_mirror" | "primary";
      driver: "disabled" | "s3_object_storage";
      enabled: boolean;
    };
    runtime_tasks: {
      mode: "disabled" | "shadow_mirror" | "primary";
      driver: "disabled" | "redis_queue";
      enabled: boolean;
    };
  };
}

export interface TruthSourceHealthSnapshot extends TruthSourceConfig {
  active_driver_kind: "json_file" | "postgres_prisma";
  compatibility_fallback_applied: boolean;
  json_role: "primary_truth_source" | "seed_or_mock_only";
}

function normalizeOptional(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function resolveJsonStateFile(env: Record<string, string | undefined> = process.env) {
  const configured = normalizeOptional(env.APP_DATA_FILE);
  if (configured) {
    return configured;
  }

  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(moduleDir, "../../../../../infra/m1-local-state.json");
}

export function readTruthSourceConfig(
  env: Record<string, string | undefined> = process.env,
): TruthSourceConfig {
  const databaseUrl = normalizeOptional(env.DATABASE_URL) ?? normalizeOptional(env.POSTGRES_URL);
  const redisUrl = normalizeOptional(env.REDIS_URL);
  const s3Endpoint = normalizeOptional(env.S3_ENDPOINT) ?? normalizeOptional(env.AWS_ENDPOINT_URL_S3);
  const s3Bucket = normalizeOptional(env.S3_BUCKET) ?? normalizeOptional(env.AWS_S3_BUCKET);

  return {
    requested_mode: databaseUrl ? "postgres_primary" : "json_file",
    json_state_file: resolveJsonStateFile(env),
    primary_db: {
      provider: "postgres",
      url: databaseUrl,
      configured: Boolean(databaseUrl),
    },
    cache: {
      provider: "redis",
      url: redisUrl,
      configured: Boolean(redisUrl),
    },
    object_storage: {
      provider: "s3",
      endpoint: s3Endpoint,
      bucket: s3Bucket,
      configured: Boolean(s3Endpoint && s3Bucket),
    },
    slice_rollout: {
      story_intake: databaseUrl
        ? {
            mode: "primary",
            driver: "postgres_prisma",
            enabled: true,
          }
        : {
            mode: "disabled",
            driver: "disabled",
            enabled: false,
          },
      export_artifacts: s3Endpoint && s3Bucket
        ? {
            mode: "primary",
            driver: "s3_object_storage",
            enabled: true,
          }
        : {
            mode: "disabled",
            driver: "disabled",
            enabled: false,
          },
      creative_artifacts: s3Endpoint && s3Bucket
        ? {
            mode: "primary",
            driver: "s3_object_storage",
            enabled: true,
          }
        : {
            mode: "disabled",
            driver: "disabled",
            enabled: false,
          },
      projection_snapshots: s3Endpoint && s3Bucket
        ? {
            mode: "primary",
            driver: "s3_object_storage",
            enabled: true,
          }
        : {
            mode: "disabled",
            driver: "disabled",
            enabled: false,
          },
      runtime_tasks: redisUrl
        ? {
            mode: "primary",
            driver: "redis_queue",
            enabled: true,
          }
        : {
            mode: "disabled",
            driver: "disabled",
            enabled: false,
          },
    },
  };
}

export function getTruthSourceHealthSnapshot(
  env: Record<string, string | undefined> = process.env,
): TruthSourceHealthSnapshot {
  const config = readTruthSourceConfig(env);

  return {
    ...config,
    active_driver_kind: config.requested_mode === "postgres_primary" ? "postgres_prisma" : "json_file",
    compatibility_fallback_applied: false,
    json_role: config.requested_mode === "json_file" ? "primary_truth_source" : "seed_or_mock_only",
  };
}
