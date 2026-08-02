import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { PrismaClient } from "@prisma/client";
import { PrismaSafetyOutboxRepository } from "../infrastructure/prisma-safety-outbox.repository.js";
import { SandboxCrisisEscalationAdapter } from "../infrastructure/sandbox-crisis-escalation.adapter.js";
import { readSyntheticSandboxSafetyPolicyConfig } from "../infrastructure/synthetic-sandbox-safety-policy.js";
import { SafetyOutboxDispatcher } from "./safety-outbox-dispatcher.js";
import { runSafetyWorker } from "./safety-worker-entry.js";

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = value?.trim() ? Number(value) : fallback;
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error("invalid safety worker numeric configuration");
  }
  return parsed;
}

async function main() {
  // Keep the dispatcher inside the same explicit synthetic-only safety
  // boundary as HTTP and creative workers. This preflight runs before Prisma.
  readSyntheticSandboxSafetyPolicyConfig(process.env);
  const client = new PrismaClient();
  const repository = new PrismaSafetyOutboxRepository(client);
  const workerInstanceId = `vnext-safety-${hostname()}-${process.pid}-${randomUUID()}`;
  const dispatcher = new SafetyOutboxDispatcher({
    workerInstanceId,
    repository,
    escalation: new SandboxCrisisEscalationAdapter(),
    leaseDurationMs: positiveInteger(
      process.env.VNEXT_SAFETY_LEASE_DURATION_MS,
      30_000,
    ),
    retryDelayMs: positiveInteger(process.env.VNEXT_SAFETY_RETRY_DELAY_MS, 1_000),
  });
  const abort = new AbortController();
  process.once("SIGINT", () => abort.abort());
  process.once("SIGTERM", () => abort.abort());
  await client.$connect();
  try {
    await runSafetyWorker({
      dispatcher,
      repository,
      workerInstanceId,
      buildId: process.env.VNEXT_WORKER_BUILD_ID?.trim() || "local-unversioned",
      processId: process.pid,
      pollIntervalMs: positiveInteger(
        process.env.VNEXT_SAFETY_POLL_INTERVAL_MS,
        250,
      ),
      signal: abort.signal,
    });
  } finally {
    await client.$disconnect();
  }
}

void main().catch(() => {
  process.exitCode = 1;
});
