import type { SafetyOutboxRepository } from "../domain/crisis-escalation.port.js";
import type { SafetyOutboxDispatcher } from "./safety-outbox-dispatcher.js";

export interface RunSafetyWorkerOptions {
  readonly dispatcher: SafetyOutboxDispatcher;
  readonly repository: SafetyOutboxRepository;
  readonly workerInstanceId: string;
  readonly buildId: string;
  readonly processId: number;
  readonly pollIntervalMs: number;
  readonly signal?: AbortSignal;
}

function wait(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

export async function runSafetyWorker(options: RunSafetyWorkerOptions) {
  if (!Number.isSafeInteger(options.pollIntervalMs) || options.pollIntervalMs < 1) {
    throw new Error("safety worker pollIntervalMs must be positive");
  }
  await options.repository.startHeartbeat({
    workerInstanceId: options.workerInstanceId,
    buildId: options.buildId,
    processId: options.processId,
  });
  try {
    while (!options.signal?.aborted) {
      const result = await options.dispatcher.runOnce();
      await options.repository
        .refreshHeartbeat(options.workerInstanceId)
        .catch(() => undefined);
      if (result.status === "idle") {
        await wait(options.pollIntervalMs, options.signal);
      }
    }
    await options.repository.stopHeartbeat(options.workerInstanceId);
  } catch (error) {
    await options.repository
      .markHeartbeatError(options.workerInstanceId, "safety_worker_failed")
      .catch(() => undefined);
    throw error;
  }
}
