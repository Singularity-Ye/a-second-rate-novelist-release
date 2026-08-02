import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { PrismaClient } from "@prisma/client";
import {
  HandleUnderstanding,
  VnextCreativeCompletionRouter,
} from "../application/handle-understanding.js";
import { CheckInputSafety } from "../application/check-input-safety.js";
import { CheckOutputSafety } from "../application/check-output-safety.js";
import { HandleSafetyCase } from "../application/handle-safety-case.js";
import { WriteOpening } from "../application/write-opening.js";
import { readVnextSessionAdmissionPolicy } from "../application/create-guest-session.js";
import type { CreativeRuntimePort } from "../domain/creative-runtime.port.js";
import {
  CreativeRuntimeExecutionError,
  type CreativeTaskCompletionPort,
  type CreativeTaskInputLoader,
  type CreativeTaskLeasePort,
  type CreativeWorkerHeartbeatPort,
} from "../domain/creative-task.js";
import type { VnextUnderstandingCompletionUow } from "../domain/understanding-completion.uow.js";
import type { SafetyDispositionUnitOfWork } from "../domain/safety-disposition.uow.js";
import type { SafetyPolicyPort } from "../domain/safety-policy.port.js";
import {
  ConfiguredCreativeRuntimeAdapter,
  readConfiguredCreativeRuntimeConfigForTier,
} from "../infrastructure/configured-creative-runtime.adapter.js";
import {
  readSpoilerSafeMechanismRuntimeConfig,
  SpoilerSafeMechanismRuntime,
  writeSpoilerSafeMechanismAuditToStdout,
  type MechanismSelectionAuditSink,
  type SpoilerSafeMechanismRuntimeConfig,
} from "../infrastructure/spoiler-safe-mechanism-selector.js";
import { PrismaCreativeTaskRepository } from "../infrastructure/prisma-creative-task.repository.js";
import { PrismaUnderstandingCompletionUow } from "../infrastructure/prisma-understanding-completion.uow.js";
import { PrismaSafetyDispositionUow } from "../infrastructure/prisma-safety-disposition.uow.js";
import {
  readSyntheticSandboxSafetyPolicyConfig,
  SyntheticSandboxSafetyPolicy,
  type SyntheticSandboxSafetyPolicyConfig,
} from "../infrastructure/synthetic-sandbox-safety-policy.js";
import { CreativeTaskWorker } from "./creative-task-worker.js";

const RUNTIME_MODE = "runtime_worker_configured" as const;
const ROUTE = "creative_light";
const SUPPORTED_KINDS = ["understand", "write_opening"] as const;
const DEFAULT_LEASE_DURATION_MS = 60_000;
const COMPLETION_PERSISTENCE_MARGIN_MS = 30_000;
const DEFAULT_RETRY_DELAY_MS = 1_000;
const MAXIMUM_WORKER_ID_LENGTH = 200;

export type ConfiguredCreativeWorkerRepository = CreativeTaskLeasePort &
  CreativeTaskInputLoader &
  CreativeTaskCompletionPort &
  CreativeWorkerHeartbeatPort;

export interface ConfiguredCreativeWorkerDependencies {
  readonly createPrismaClient?: (
    env: Record<string, string | undefined>,
  ) => PrismaClient;
  readonly createRepository?: (
    client: PrismaClient,
  ) => ConfiguredCreativeWorkerRepository;
  readonly createUnderstandingCompletionUow?: (
    client: PrismaClient,
  ) => VnextUnderstandingCompletionUow;
  readonly createSafetyDispositionUow?: (
    client: PrismaClient,
  ) => SafetyDispositionUnitOfWork;
  readonly createSafetyPolicy?: (
    config: SyntheticSandboxSafetyPolicyConfig,
  ) => SafetyPolicyPort;
}

export interface CreateConfiguredCreativeWorkerOptions {
  readonly env?: Record<string, string | undefined>;
  readonly fetcher?: typeof fetch;
  readonly clock?: () => Date;
  readonly workerInstanceId?: string;
  readonly leaseDurationMs?: number;
  readonly retryDelayMs?: number;
  readonly mechanismAuditSink?: MechanismSelectionAuditSink;
  readonly dependencies?: ConfiguredCreativeWorkerDependencies;
}

export interface ConfiguredCreativeWorkerComposition {
  readonly worker: CreativeTaskWorker;
  readonly heartbeatPort: CreativeWorkerHeartbeatPort;
  readonly workerInstanceId: string;
  readonly runtimeMode: typeof RUNTIME_MODE;
  readonly route: typeof ROUTE;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

function positiveInteger(value: number | undefined, fallback: number, name: string) {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return resolved;
}

function configuredLeaseDuration(
  value: number | undefined,
  providerTimeoutMs: number,
) {
  const minimum = providerTimeoutMs + COMPLETION_PERSISTENCE_MARGIN_MS;
  const resolved = positiveInteger(
    value,
    Math.max(DEFAULT_LEASE_DURATION_MS, minimum),
    "leaseDurationMs",
  );
  if (resolved < minimum) {
    throw new CreativeRuntimeExecutionError("worker_lease_too_short", false);
  }
  return resolved;
}

function configuredWorkerInstanceId(value: string | undefined) {
  const generated = `vnext-creative-${hostname()}-${process.pid}-${randomUUID()}`;
  const resolved = value?.trim() || generated;
  if (resolved.length > MAXIMUM_WORKER_ID_LENGTH) {
    throw new Error("configured creative worker instance id is too long");
  }
  return resolved;
}

function createDefaultPrismaClient(
  env: Record<string, string | undefined>,
) {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    return new PrismaClient();
  }
  return new PrismaClient({ datasources: { db: { url: databaseUrl } } });
}

function configuredRuntime(
  config: ReturnType<typeof readConfiguredCreativeRuntimeConfigForTier>["config"],
  mechanismConfig: SpoilerSafeMechanismRuntimeConfig,
  options: CreateConfiguredCreativeWorkerOptions,
): CreativeRuntimePort {
  const mechanismRuntime = new SpoilerSafeMechanismRuntime({
    config: mechanismConfig,
    auditSink:
      options.mechanismAuditSink ?? writeSpoilerSafeMechanismAuditToStdout,
  });
  return new ConfiguredCreativeRuntimeAdapter({
    config,
    mechanismRuntime,
    ...(options.fetcher === undefined ? {} : { fetcher: options.fetcher }),
    ...(options.clock === undefined ? {} : { clock: options.clock }),
  });
}

export function createConfiguredCreativeWorker(
  options: CreateConfiguredCreativeWorkerOptions = {},
): ConfiguredCreativeWorkerComposition {
  const env = options.env ?? process.env;

  // Provider preflight is deliberately first: no Prisma construction, connection,
  // heartbeat, or task claim is allowed when the production runtime is unconfigured.
  const runtimeRoute = readConfiguredCreativeRuntimeConfigForTier("light", env);
  if (runtimeRoute.routeFallbackApplied) {
    throw new CreativeRuntimeExecutionError("provider_unavailable", false);
  }
  const runtimeConfig = runtimeRoute.config;
  const mechanismConfig = readSpoilerSafeMechanismRuntimeConfig(env);
  const safetyPolicyConfig = readSyntheticSandboxSafetyPolicyConfig(env);
  const admissionPolicy = readVnextSessionAdmissionPolicy(env);
  const leaseDurationMs = configuredLeaseDuration(
    options.leaseDurationMs,
    runtimeConfig.timeoutMs,
  );
  const retryDelayMs = positiveInteger(
    options.retryDelayMs,
    DEFAULT_RETRY_DELAY_MS,
    "retryDelayMs",
  );
  const workerInstanceId = configuredWorkerInstanceId(options.workerInstanceId);

  const dependencies = options.dependencies ?? {};
  const client =
    dependencies.createPrismaClient?.(env) ?? createDefaultPrismaClient(env);
  const repository =
    dependencies.createRepository?.(client) ??
    new PrismaCreativeTaskRepository(client, {
      admissionPolicy,
      ...(options.clock === undefined ? {} : { clock: options.clock }),
    });
  const understandingUow =
    dependencies.createUnderstandingCompletionUow?.(client) ??
    new PrismaUnderstandingCompletionUow(
      client,
      undefined,
      options.clock,
      admissionPolicy,
    );
  const runtime = configuredRuntime(runtimeConfig, mechanismConfig, options);
  const safetyDispositionUow =
    dependencies.createSafetyDispositionUow?.(client) ??
    new PrismaSafetyDispositionUow(client, undefined, options.clock);
  const safetyPolicy =
    dependencies.createSafetyPolicy?.(safetyPolicyConfig) ??
    new SyntheticSandboxSafetyPolicy(safetyPolicyConfig);
  const handleSafetyCase = new HandleSafetyCase(safetyDispositionUow);
  const completionPort = new VnextCreativeCompletionRouter(
    new HandleUnderstanding(understandingUow),
    new WriteOpening(repository),
  );
  const worker = new CreativeTaskWorker({
    workerInstanceId,
    runtimeMode: RUNTIME_MODE,
    route: ROUTE,
    runtime,
    leasePort: repository,
    inputLoader: repository,
    completionPort,
    inputSafety: new CheckInputSafety(safetyPolicy, handleSafetyCase),
    outputSafety: new CheckOutputSafety(safetyPolicy, handleSafetyCase),
    supportedKinds: SUPPORTED_KINDS,
    leaseDurationMs,
    retryDelayMs,
  });

  return {
    worker,
    heartbeatPort: repository,
    workerInstanceId,
    runtimeMode: RUNTIME_MODE,
    route: ROUTE,
    connect: () => client.$connect(),
    disconnect: () => client.$disconnect(),
  };
}
