import { setTimeout as delay } from "node:timers/promises";
import {
  type CreativeWorkerHeartbeatPort,
  type CreativeWorkerRuntimeMode,
} from "../domain/creative-task.js";
import {
  CreativeWorkerOperationalError,
  type CreativeTaskWorker,
} from "./creative-task-worker.js";

export interface CreativeWorkerProcessOptions {
  readonly worker: CreativeTaskWorker;
  readonly heartbeatPort: CreativeWorkerHeartbeatPort;
  readonly workerInstanceId: string;
  readonly runtimeMode: CreativeWorkerRuntimeMode;
  readonly buildId: string;
  readonly processId: number;
  readonly pollIntervalMs?: number;
  readonly heartbeatIntervalMs?: number;
  readonly signal: AbortSignal;
}

function positiveInterval(value: number | undefined, fallback: number) {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 10 || resolved > 60_000) {
    throw new Error("worker intervals must be integers from 10 to 60000ms");
  }
  return resolved;
}

export function installCreativeWorkerSignalHandlers(controller: AbortController) {
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  return () => {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  };
}

export async function runCreativeWorkerProcess(
  options: CreativeWorkerProcessOptions,
) {
  const pollIntervalMs = positiveInterval(options.pollIntervalMs, 250);
  const heartbeatIntervalMs = positiveInterval(
    options.heartbeatIntervalMs,
    1_000,
  );
  await options.heartbeatPort.startHeartbeat({
    workerInstanceId: options.workerInstanceId,
    runtimeMode: options.runtimeMode,
    buildId: options.buildId,
    processId: options.processId,
    supportedKinds: options.worker.supportedKinds,
  });
  const heartbeat = setInterval(() => {
    void options.heartbeatPort
      .refreshHeartbeat(options.workerInstanceId)
      .catch(() => undefined);
  }, heartbeatIntervalMs);
  heartbeat.unref();
  let completedTasks = 0;
  let fatalError = false;
  try {
    while (!options.signal.aborted) {
      let result: Awaited<ReturnType<CreativeTaskWorker["runOnce"]>>;
      try {
        result = await options.worker.runOnce(async () => {
          await options.heartbeatPort.refreshHeartbeat(
            options.workerInstanceId,
            "claimed",
          );
        });
      } catch (error) {
        if (error instanceof CreativeWorkerOperationalError) {
          await options.heartbeatPort
            .refreshHeartbeat(options.workerInstanceId, "failed")
            .catch(() => undefined);
          await delay(pollIntervalMs, undefined, { signal: options.signal }).catch(
            () => undefined,
          );
          continue;
        }
        fatalError = true;
        await options.heartbeatPort
          .markHeartbeatError(options.workerInstanceId, "worker_invariant_failure")
          .catch(() => undefined);
        throw error;
      }
      if (result.status === "idle") {
        await delay(pollIntervalMs, undefined, { signal: options.signal }).catch(
          () => undefined,
        );
        continue;
      }
      await options.heartbeatPort
        .refreshHeartbeat(
          options.workerInstanceId,
          result.status === "committed" ? "succeeded" : "failed",
        )
        .catch(() => undefined);
      if (result.status === "committed") {
        completedTasks += 1;
      }
    }
  } finally {
    clearInterval(heartbeat);
    if (!fatalError) {
      await options.heartbeatPort
        .stopHeartbeat(options.workerInstanceId)
        .catch(() => undefined);
    }
  }
  return { completedTasks };
}
