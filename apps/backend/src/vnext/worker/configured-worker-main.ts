import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CreativeRuntimeExecutionError } from "../domain/creative-task.js";
import {
  createConfiguredCreativeWorker,
  type CreateConfiguredCreativeWorkerOptions,
} from "./configured-worker.js";
import {
  installCreativeWorkerSignalHandlers,
  runCreativeWorkerProcess,
} from "./worker-entry.js";

const DEFAULT_BUILD_ID = "local-uncommitted";
const MAXIMUM_BUILD_ID_LENGTH = 200;

export interface RunConfiguredCreativeWorkerMainOptions
  extends CreateConfiguredCreativeWorkerOptions {
  readonly buildId?: string;
  readonly processId?: number;
  readonly pollIntervalMs?: number;
  readonly heartbeatIntervalMs?: number;
  readonly controller?: AbortController;
}

function configuredBuildId(
  explicit: string | undefined,
  env: Record<string, string | undefined>,
) {
  const resolved =
    explicit?.trim() ||
    env.VNEXT_WORKER_BUILD_ID?.trim() ||
    env.RENDER_GIT_COMMIT?.trim() ||
    env.GITHUB_SHA?.trim() ||
    DEFAULT_BUILD_ID;
  if (resolved.length > MAXIMUM_BUILD_ID_LENGTH) {
    throw new Error("configured creative worker build id is too long");
  }
  return resolved;
}

function configuredProcessId(value: number | undefined) {
  const resolved = value ?? process.pid;
  if (!Number.isSafeInteger(resolved) || resolved < 1) {
    throw new Error("configured creative worker process id is invalid");
  }
  return resolved;
}

export async function runConfiguredCreativeWorkerMain(
  options: RunConfiguredCreativeWorkerMainOptions = {},
) {
  const env = options.env ?? process.env;

  // Composition performs provider preflight before constructing its Prisma client.
  const composition = createConfiguredCreativeWorker(options);
  const controller = options.controller ?? new AbortController();
  const removeSignalHandlers = installCreativeWorkerSignalHandlers(controller);
  try {
    await composition.connect();
    return await runCreativeWorkerProcess({
      worker: composition.worker,
      heartbeatPort: composition.heartbeatPort,
      workerInstanceId: composition.workerInstanceId,
      runtimeMode: composition.runtimeMode,
      buildId: configuredBuildId(options.buildId, env),
      processId: configuredProcessId(options.processId),
      ...(options.pollIntervalMs === undefined
        ? {}
        : { pollIntervalMs: options.pollIntervalMs }),
      ...(options.heartbeatIntervalMs === undefined
        ? {}
        : { heartbeatIntervalMs: options.heartbeatIntervalMs }),
      signal: controller.signal,
    });
  } finally {
    removeSignalHandlers();
    await composition.disconnect();
  }
}

function isDirectExecution() {
  const entrypoint = process.argv[1];
  return (
    entrypoint !== undefined &&
    resolve(entrypoint) === resolve(fileURLToPath(import.meta.url))
  );
}

if (isDirectExecution()) {
  void runConfiguredCreativeWorkerMain().catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({
        event: "configured_worker_failed",
        errorClass: error instanceof Error ? error.name : "unknown",
        failureCode:
          error instanceof CreativeRuntimeExecutionError
            ? error.failureCode
            : "worker_start_failed",
      })}\n`,
    );
    process.exitCode = 1;
  });
}
