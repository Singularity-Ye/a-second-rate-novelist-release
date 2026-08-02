import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ConfiguredImageGenerationJobService } from "./configured-image-generation-job.service.js";

const ONE_PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function waitFor(check: () => Promise<boolean>, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("test_wait_timeout");
}

async function tempJobDirectory() {
  return mkdtemp(join(tmpdir(), "erliu-image-jobs-"));
}

describe("ConfiguredImageGenerationJobService", () => {
  it("returns immediately, persists the completed PNG, and restores its manifest", async () => {
    const directory = await tempJobDirectory();
    try {
      const runtime = {
        generate: vi.fn().mockResolvedValue({
          imageUrl: `data:image/png;base64,${ONE_PIXEL_PNG}`,
          trace: {
            traceId: "trace-test",
            provider: "test-provider",
            model: "gpt-image-2",
            workflowVersion: "vnext.image-generation.v1",
            outputHash: "hash-test",
          },
          fallbackApplied: false,
        }),
      };
      const service = new ConfiguredImageGenerationJobService({ runtime, jobDirectory: directory });
      const accepted = await service.submit({
        requestId: "request-test",
        prompt: "one small test image",
        size: "1024x1024",
        quality: "low",
      });

      await waitFor(async () => (await service.get(accepted.jobId))?.status === "succeeded");
      const completed = await service.get(accepted.jobId);
      expect(completed?.assetUrl).toContain(`/jobs/${accepted.jobId}/asset`);
      expect(completed?.trace?.model).toBe("gpt-image-2");
      expect((await service.readAsset(accepted.jobId))?.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

      const restored = new ConfiguredImageGenerationJobService({
        runtime: { generate: vi.fn() },
        jobDirectory: directory,
      });
      expect((await restored.get(accepted.jobId))?.status).toBe("succeeded");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("records provider failures for polling clients instead of losing them to the request timeout", async () => {
    const directory = await tempJobDirectory();
    try {
      const service = new ConfiguredImageGenerationJobService({
        runtime: { generate: vi.fn().mockRejectedValue(new Error("provider_timeout")) },
        jobDirectory: directory,
      });
      const accepted = await service.submit({
        requestId: "request-timeout",
        prompt: "short timeout test",
        size: "1024x1024",
        quality: "low",
      });
      await waitFor(async () => (await service.get(accepted.jobId))?.status === "failed");
      expect((await service.get(accepted.jobId))?.errorCode).toBe("provider_timeout");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("does not block backend construction when the optional image provider is unconfigured", async () => {
    const directory = await tempJobDirectory();
    try {
      const service = new ConfiguredImageGenerationJobService({
        env: {},
        jobDirectory: directory,
      });
      const accepted = await service.submit({
        requestId: "request-unconfigured-provider",
        prompt: "an image request that must fail closed",
        size: "1024x1024",
        quality: "low",
      });

      await waitFor(async () => (await service.get(accepted.jobId))?.status === "failed");
      expect((await service.get(accepted.jobId))?.errorCode).toBe("provider_unavailable");
      expect(await service.readAsset(accepted.jobId)).toBeNull();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("persists a reference image separately and forwards it to the edit runtime", async () => {
    const directory = await tempJobDirectory();
    try {
      const runtime = {
        generate: vi.fn().mockResolvedValue({
          imageUrl: `data:image/png;base64,${ONE_PIXEL_PNG}`,
          trace: {
            traceId: "trace-edit-test",
            provider: "test-provider",
            model: "gpt-image-2",
            workflowVersion: "vnext.image-generation.v1",
            outputHash: "hash-edit-test",
          },
          fallbackApplied: false,
        }),
      };
      const service = new ConfiguredImageGenerationJobService({ runtime, jobDirectory: directory });
      const referenceBytes = Buffer.from("reference-png");
      const maskBytes = Buffer.from("mask-png");
      const accepted = await service.submit({
        requestId: "request-edit",
        prompt: "edit this reference",
        size: "1536x1024",
        quality: "low",
        referenceImage: { fileName: "whole-house.png", mimeType: "image/png", bytes: referenceBytes },
        mask: { fileName: "writing-seat-mask.png", mimeType: "image/png", bytes: maskBytes },
      });

      await waitFor(async () => (await service.get(accepted.jobId))?.status === "succeeded");
      expect(runtime.generate).toHaveBeenCalledWith(expect.objectContaining({
        referenceImage: expect.objectContaining({
          fileName: "whole-house.png",
          mimeType: "image/png",
          bytes: referenceBytes,
        }),
        mask: expect.objectContaining({
          fileName: "writing-seat-mask.png",
          mimeType: "image/png",
          bytes: maskBytes,
        }),
      }));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
