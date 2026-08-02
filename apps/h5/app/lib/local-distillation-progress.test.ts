import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchLocalDistillationProgress,
  LocalDistillationProgressRequestError,
  parseLocalDistillationProgress,
} from "./local-distillation-progress";

const rawProgress = {
  protocol: "narrative-mechanism-progress.v1",
  status: "running",
  inputDirectory: "C:\\private\\source",
  sourceSha256: "secret-hash",
  updatedAt: "2026-07-28T03:37:18.702Z",
  expectedUnitCount: 590,
  completedUnitCount: 59,
  remainingUnitCount: 531,
  progressPercent: 10,
  mechanismCount: 204,
  unresolvedFailureCount: 0,
  retryReasons: { invalid_model_json: 8, upstream_503: 2 },
  throughput: { recentWindowMinutes: 30, recentCompletedUnits: 54, recentUnitsPerMinute: 1.905, etaMinutes: 279 },
  shards: [{
    shard: "shard-0",
    status: "running",
    expectedUnits: 197,
    completedUnits: 18,
    pendingUnits: 179,
    activeWorkers: 2,
    mechanismCount: 65,
    unresolvedFailures: 0,
    lastBatchId: "batch-26-part-2",
    lastActivityAt: "2026-07-28T03:36:56.558Z",
    inactiveMinutes: 0.4,
    stale: false,
  }],
};

afterEach(() => vi.unstubAllGlobals());

describe("local distillation progress", () => {
  it("keeps operational progress while dropping paths and source identities", () => {
    const parsed = parseLocalDistillationProgress(rawProgress);
    expect(parsed).toMatchObject({
      completedUnitCount: 59,
      expectedUnitCount: 590,
      progressPercent: 10,
      mechanismCount: 204,
      retryReasons: { invalid_model_json: 8, upstream_503: 2 },
    });
    expect(parsed).not.toHaveProperty("inputDirectory");
    expect(parsed).not.toHaveProperty("sourceSha256");
  });

  it("rejects malformed or empty progress documents", () => {
    expect(parseLocalDistillationProgress({ ...rawProgress, protocol: "other" })).toBeNull();
    expect(parseLocalDistillationProgress({ ...rawProgress, expectedUnitCount: 0 })).toBeNull();
  });

  it("treats an unconfigured endpoint as hidden and reports configured endpoint failures", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "not_configured" }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "progress_file_unavailable" }), { status: 503 }));
    vi.stubGlobal("fetch", fetcher);

    await expect(fetchLocalDistillationProgress()).resolves.toBeNull();
    await expect(fetchLocalDistillationProgress()).rejects.toEqual(new LocalDistillationProgressRequestError("progress_file_unavailable"));
  });
});
