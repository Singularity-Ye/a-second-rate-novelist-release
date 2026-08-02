import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";
import type { CreativeRuntimePort } from "../../apps/backend/src/vnext/domain/creative-runtime.port";
import { PrismaCreativeTaskRepository } from "../../apps/backend/src/vnext/infrastructure/prisma-creative-task.repository";
import { CreativeTaskWorker } from "../../apps/backend/src/vnext/worker/creative-task-worker";
import {
  installCreativeWorkerSignalHandlers,
  runCreativeWorkerProcess,
} from "../../apps/backend/src/vnext/worker/worker-entry";
import { requireDisposablePostgresDatabase } from "./disposable-postgres";

const CURRENT_ADMISSION_POLICY = {
  configured: true,
  admissionPolicyVersion: "tc164-internal-v1",
  aiIdentityNoticeVersion: "tc164-ai-v1",
  serviceTermsVersion: "tc164-terms-v1",
  privacyNoticeVersion: "tc164-privacy-v1",
} as const;

function requiredEnvironment(name: string) {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function syntheticDelayMs() {
  const value = process.env.TC164_SYNTHETIC_DELAY_MS ?? "0";
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 5_000) {
    throw new Error("TC164_SYNTHETIC_DELAY_MS must be an integer from 0 to 5000");
  }
  return parsed;
}

function syntheticRuntime(delayMs: number): CreativeRuntimePort {
  return {
    async understand() {
      throw new Error("synthetic child does not claim understand tasks in TC164 smoke");
    },
    async writeOpening() {
      const startedAt = new Date();
      if (delayMs > 0) {
        await delay(delayMs);
      }
      const body = "TC164 independent synthetic worker opening";
      const completedAt = new Date();
      return {
        output: { body },
        trace: {
          traceId: randomUUID(),
          provider: "synthetic-test",
          model: "synthetic-test",
          workflowVersion: "tc164-v1",
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          outputHash: createHash("sha256").update(body).digest("hex"),
        },
        fallbackApplied: false,
      };
    },
    async revise() {
      throw new Error("revise is not supported by TC164");
    },
    async continueStory() {
      throw new Error("continue_story is not supported by TC164");
    },
  };
}

async function main() {
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.TC164_SYNTHETIC_RUNTIME_LABEL !== "runtime_worker_synthetic"
  ) {
    throw new Error("TC164 synthetic worker is restricted to the explicit test gate");
  }
  const database = requireDisposablePostgresDatabase({
    databaseNameDescription: "erliu_tc164_worker_<24 lowercase hex>",
    databaseNamePattern: /^erliu_tc164_worker_[0-9a-f]{24}$/,
    envName: "DATABASE_URL",
  });
  const workerInstanceId = requiredEnvironment("TC164_WORKER_INSTANCE_ID");
  const client = new PrismaClient({
    datasources: { db: { url: database.url } },
  });
  const repository = new PrismaCreativeTaskRepository(client, {
    admissionPolicy: CURRENT_ADMISSION_POLICY,
  });
  const worker = new CreativeTaskWorker({
    workerInstanceId,
    runtimeMode: "runtime_worker_synthetic",
    route: "synthetic-test",
    runtime: syntheticRuntime(syntheticDelayMs()),
    leasePort: repository,
    inputLoader: repository,
    completionPort: repository,
    inputSafety: {
      async execute() {
        return { disposition: "support" as const };
      },
    },
    outputSafety: {
      async execute() {
        return { disposition: "support" as const };
      },
    },
    supportedKinds: ["write_opening"],
    leaseDurationMs: 2_000,
    retryDelayMs: 250,
  });
  const controller = new AbortController();
  const removeSignalHandlers = installCreativeWorkerSignalHandlers(controller);
  await client.$connect();
  process.stdout.write(
    `${JSON.stringify({
      event: "worker_started",
      evidenceLevel: "runtime_worker_synthetic",
      pid: process.pid,
      workerInstanceId,
    })}\n`,
  );
  try {
    const result = await runCreativeWorkerProcess({
      worker,
      heartbeatPort: repository,
      workerInstanceId,
      runtimeMode: "runtime_worker_synthetic",
      buildId: "tc164-test-child",
      processId: process.pid,
      pollIntervalMs: 50,
      heartbeatIntervalMs: 100,
      signal: controller.signal,
    });
    process.stdout.write(
      `${JSON.stringify({
        event: "worker_stopped",
        evidenceLevel: "runtime_worker_synthetic",
        completedTasks: result.completedTasks,
        pid: process.pid,
      })}\n`,
    );
  } finally {
    removeSignalHandlers();
    await client.$disconnect();
  }
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({
      event: "worker_failed",
      errorClass: error instanceof Error ? error.name : "unknown",
    })}\n`,
  );
  process.exitCode = 1;
});
