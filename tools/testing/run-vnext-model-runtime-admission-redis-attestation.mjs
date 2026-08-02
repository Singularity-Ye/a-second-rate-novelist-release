import { randomUUID } from "node:crypto";

const moduleUrl =
  process.env.VNEXT_ADMISSION_MODULE_URL ??
  "file:///app/apps/backend/dist/vnext/infrastructure/redis-model-runtime-admission.js";
const { RedisModelRuntimeAdmission } = await import(moduleUrl);

const redisUrl = process.env.REDIS_URL?.trim();
if (!redisUrl) throw new Error("redis_not_configured");

const summary = {
  atomicCrossInstance: false,
  duplicateDenied: false,
  principalDenied: false,
  globalDenied: false,
  ttlRecovered: false,
  lateReleaseSafe: false,
  concurrentAccepted: 0,
  concurrentAttempted: 40,
  unavailableFailedClosed: false,
};

function config(namespace, overrides = {}) {
  return {
    url: redisUrl,
    namespace,
    perPrincipal: 1,
    perProfile: 2,
    global: 2,
    retryAfterSeconds: 1,
    leaseTtlMs: 1_000,
    operationTimeoutMs: 500,
    ...overrides,
  };
}

async function accepted(admission, owner, request, profile = "deepseek") {
  const result = await admission.tryAcquire({
    ownerPrincipalId: owner,
    requestId: request,
    profileId: profile,
    purpose: profile === "grok" ? "analysis" : "conversation",
  });
  if (!result.accepted) throw new Error(`unexpected_denial:${result.code}`);
  return result.lease;
}

async function withAdmissions(admissions, operation) {
  try {
    await Promise.all(admissions.map((item) => item.onModuleInit()));
    return await operation();
  } finally {
    await Promise.all(
      admissions.map((item) => item.onModuleDestroy().catch(() => undefined)),
    );
  }
}

const runId = randomUUID().replaceAll("-", "");

// Keep the operation closures explicit so no principal/request values are ever
// printed. Only aggregate booleans leave this process.
{
  const namespace = `tc216-basic-${runId}`;
  const backendA = new RedisModelRuntimeAdmission(config(namespace));
  const backendB = new RedisModelRuntimeAdmission(config(namespace));
  await withAdmissions([backendA, backendB], async () => {
    const first = await accepted(backendA, "owner-a", "request-a");
    const duplicate = await backendB.tryAcquire({
      ownerPrincipalId: "owner-a",
      requestId: "request-a",
      profileId: "deepseek",
      purpose: "conversation",
    });
    summary.duplicateDenied =
      !duplicate.accepted && duplicate.code === "duplicate_request";

    const principal = await backendB.tryAcquire({
      ownerPrincipalId: "owner-a",
      requestId: "request-b",
      profileId: "grok",
      purpose: "analysis",
    });
    summary.principalDenied =
      !principal.accepted && principal.code === "principal_capacity";

    const second = await accepted(backendB, "owner-b", "request-b");
    const global = await backendA.tryAcquire({
      ownerPrincipalId: "owner-c",
      requestId: "request-c",
      profileId: "grok",
      purpose: "analysis",
    });
    summary.globalDenied =
      !global.accepted && global.code === "global_capacity";
    summary.atomicCrossInstance =
      summary.duplicateDenied && summary.principalDenied && summary.globalDenied;
    await Promise.all([first.release(), second.release()]);
  });
}

{
  const namespace = `tc216-ttl-${runId}`;
  const backendA = new RedisModelRuntimeAdmission(
    config(namespace, { perProfile: 1, global: 1 }),
  );
  const backendB = new RedisModelRuntimeAdmission(
    config(namespace, { perProfile: 1, global: 1 }),
  );
  await withAdmissions([backendA, backendB], async () => {
    const expired = await accepted(
      backendA,
      "owner-ttl",
      "same-request",
    );
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    const replacement = await accepted(
      backendB,
      "owner-ttl",
      "same-request",
    );
    summary.ttlRecovered = true;
    await expired.release();
    const stillHeld = await backendA.tryAcquire({
      ownerPrincipalId: "owner-ttl",
      requestId: "new-request",
      profileId: "grok",
      purpose: "analysis",
    });
    summary.lateReleaseSafe =
      !stillHeld.accepted && stillHeld.code === "principal_capacity";
    await replacement.release();
  });
}

{
  const namespace = `tc216-concurrency-${runId}`;
  const admissions = Array.from(
    { length: 4 },
    () =>
      new RedisModelRuntimeAdmission(
        config(namespace, {
          perPrincipal: 1,
          perProfile: 100,
          global: 8,
          leaseTtlMs: 5_000,
        }),
      ),
  );
  await withAdmissions(admissions, async () => {
    const results = await Promise.all(
      Array.from({ length: summary.concurrentAttempted }, (_, index) =>
        admissions[index % admissions.length].tryAcquire({
          ownerPrincipalId: `concurrent-owner-${index}`,
          requestId: `concurrent-request-${index}`,
          profileId: "deepseek",
          purpose: "conversation",
        }),
      ),
    );
    const leases = results.flatMap((result) =>
      result.accepted ? [result.lease] : [],
    );
    summary.concurrentAccepted = leases.length;
    await Promise.all(leases.map((lease) => lease.release()));
  });
}

{
  const unavailable = new RedisModelRuntimeAdmission({
    ...config(`tc216-unavailable-${runId}`),
    url: "redis://127.0.0.1:1/0",
    operationTimeoutMs: 100,
  });
  try {
    await unavailable.tryAcquire({
      ownerPrincipalId: "owner-unavailable",
      requestId: "request-unavailable",
      profileId: "deepseek",
      purpose: "conversation",
    });
  } catch (error) {
    summary.unavailableFailedClosed =
      error?.code === "operation_timeout" ||
      error?.code === "redis_command_failed";
  } finally {
    await unavailable.onModuleDestroy().catch(() => undefined);
  }
}

if (
  !summary.atomicCrossInstance ||
  !summary.ttlRecovered ||
  !summary.lateReleaseSafe ||
  summary.concurrentAccepted !== 8 ||
  !summary.unavailableFailedClosed
) {
  throw new Error(`attestation_failed:${JSON.stringify(summary)}`);
}

process.stdout.write(`${JSON.stringify(summary)}\n`);
