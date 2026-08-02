import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalDistillationProgress } from "./local-distillation-progress";

afterEach(() => vi.unstubAllGlobals());

describe("local distillation progress panel", () => {
  it("polls and renders the long-running mechanism distillation snapshot", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      progress: {
        protocol: "narrative-mechanism-progress.v1",
        status: "running",
        updatedAt: "2026-07-28T03:37:18.702Z",
        expectedUnitCount: 590,
        completedUnitCount: 59,
        mechanismCount: 204,
        unresolvedFailureCount: 0,
        retryReasons: { invalid_model_json: 8 },
        throughput: { etaMinutes: 279 },
        shards: [{ shard: "shard-0", status: "running", expectedUnits: 197, completedUnits: 18, pendingUnits: 179, activeWorkers: 2, mechanismCount: 65, unresolvedFailures: 0, stale: false }],
      },
    }), { status: 200, headers: { "content-type": "application/json" } })));

    render(<LocalDistillationProgress enabled />);

    expect(await screen.findByRole("region", { name: "本地全书精蒸进度" })).toBeTruthy();
    expect(screen.getByText("59/590")).toBeTruthy();
    expect(screen.getByText("204")).toBeTruthy();
    expect(screen.getByText(/预计 4 小时 39 分/)).toBeTruthy();
    expect(screen.getByText(/已自动重试 8 次/)).toBeTruthy();
  });

  it("does not request progress when the server did not enable the local feature", () => {
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetcher);
    render(<LocalDistillationProgress enabled={false} />);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
