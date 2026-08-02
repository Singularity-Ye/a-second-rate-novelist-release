import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { ConfiguredImageGenerationRuntimeAdapter } from "./configured-image-generation-runtime.adapter.js";
import type {
  GenerateImageInput,
  GenerateImageMask,
  GenerateImageReferenceMimeType,
  GenerateImageResult,
} from "./configured-image-generation-runtime.adapter.js";

const MAX_RESPONSE_BYTES = 24_000_000;
const DEFAULT_MAX_CONCURRENCY = 1;
const DEFAULT_REMOTE_FETCH_TIMEOUT_MS = 45_000;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export type ImageGenerationJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed";

export interface ImageGenerationJobView {
  readonly jobId: string;
  readonly requestId: string;
  readonly status: ImageGenerationJobStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly errorCode?: string;
  readonly trace?: GenerateImageResult["trace"];
  readonly statusUrl: string;
  readonly assetUrl?: string;
}

interface ImageGenerationJobRecord {
  readonly jobId: string;
  readonly requestId: string;
  readonly prompt: string;
  readonly size: GenerateImageInput["size"];
  readonly quality: GenerateImageInput["quality"];
  status: ImageGenerationJobStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  errorCode?: string;
  trace?: GenerateImageResult["trace"];
  assetFileName?: string;
  referenceImageFileName?: string;
  referenceImageUploadName?: string;
  referenceImageMimeType?: GenerateImageReferenceMimeType;
  maskFileName?: string;
  maskUploadName?: string;
  maskMimeType?: GenerateImageReferenceMimeType;
}

export interface ImageGenerationRuntime {
  generate(input: GenerateImageInput): Promise<GenerateImageResult>;
}

class LazyConfiguredImageGenerationRuntime implements ImageGenerationRuntime {
  private runtime?: ConfiguredImageGenerationRuntimeAdapter;

  constructor(private readonly env: Record<string, string | undefined>) {}

  async generate(input: GenerateImageInput) {
    this.runtime ??= new ConfiguredImageGenerationRuntimeAdapter({ env: this.env });
    return this.runtime.generate(input);
  }
}

export interface ConfiguredImageGenerationJobServiceOptions {
  readonly env?: Record<string, string | undefined>;
  readonly jobDirectory?: string;
  readonly runtime?: ImageGenerationRuntime;
  readonly maxConcurrency?: number;
}

function configuredPositiveInteger(value: string | undefined, fallback: number, maximum: number) {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : fallback;
}

function configuredJobDirectory(options: ConfiguredImageGenerationJobServiceOptions) {
  const configured = options.jobDirectory ?? options.env?.VNEXT_IMAGE_JOB_DIR ?? process.env.VNEXT_IMAGE_JOB_DIR;
  if (!configured) return resolve(process.cwd(), ".tmp", "world-lab-dev", "image-jobs");
  return isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJobStatus(value: unknown): value is ImageGenerationJobStatus {
  return value === "queued" || value === "running" || value === "succeeded" || value === "failed";
}

function isRestorableJob(value: unknown): value is ImageGenerationJobRecord {
  if (!isRecord(value)) return false;
  const referenceImageMimeType = value.referenceImageMimeType;
  const maskMimeType = value.maskMimeType;
  return (
    typeof value.jobId === "string" &&
    typeof value.requestId === "string" &&
    typeof value.prompt === "string" &&
    ["1024x1024", "1536x1024", "1024x1536"].includes(String(value.size)) &&
    ["low", "medium", "high"].includes(String(value.quality)) &&
    isJobStatus(value.status) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    (value.referenceImageFileName === undefined || typeof value.referenceImageFileName === "string") &&
    (value.referenceImageUploadName === undefined || typeof value.referenceImageUploadName === "string") &&
    (referenceImageMimeType === undefined || ["image/png", "image/jpeg", "image/webp"].includes(String(referenceImageMimeType))) &&
    (value.maskFileName === undefined || typeof value.maskFileName === "string") &&
    (value.maskUploadName === undefined || typeof value.maskUploadName === "string") &&
    (maskMimeType === undefined || ["image/png", "image/jpeg", "image/webp"].includes(String(maskMimeType)))
  );
}

function errorCode(error: unknown) {
  const code = error instanceof Error ? error.message : "provider_unavailable";
  return [
    "provider_timeout",
    "provider_unavailable",
    "invalid_runtime_output",
    "persistence_failed",
    "worker_restarted",
  ].includes(code)
    ? code
    : "provider_unavailable";
}

function isPng(value: Buffer) {
  return value.length >= PNG_SIGNATURE.length && PNG_SIGNATURE.every((byte, index) => value[index] === byte);
}

function dataUrlBytes(value: string) {
  const prefix = "data:image/png;base64,";
  if (!value.startsWith(prefix)) throw new Error("invalid_runtime_output");
  const bytes = Buffer.from(value.slice(prefix.length), "base64");
  if (bytes.length === 0 || bytes.length > MAX_RESPONSE_BYTES || !isPng(bytes)) throw new Error("invalid_runtime_output");
  return bytes;
}

async function remoteImageBytes(value: string) {
  if (!value.startsWith("https://")) throw new Error("invalid_runtime_output");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_REMOTE_FETCH_TIMEOUT_MS);
  timer.unref?.();
  try {
    const response = await fetch(value, { redirect: "error", signal: controller.signal });
    if (!response.ok) throw new Error("invalid_runtime_output");
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) throw new Error("invalid_runtime_output");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_RESPONSE_BYTES || !isPng(bytes)) throw new Error("invalid_runtime_output");
    return bytes;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("provider_timeout");
    if (error instanceof Error && ["invalid_runtime_output", "provider_timeout"].includes(error.message)) throw error;
    throw new Error("provider_unavailable");
  } finally {
    clearTimeout(timer);
  }
}

async function imageBytes(result: GenerateImageResult) {
  return result.imageUrl.startsWith("data:image/png;base64,")
    ? dataUrlBytes(result.imageUrl)
    : remoteImageBytes(result.imageUrl);
}

export class ConfiguredImageGenerationJobService {
  private readonly jobs = new Map<string, ImageGenerationJobRecord>();
  private readonly queue: string[] = [];
  private readonly jobDirectory: string;
  private readonly runtime: ImageGenerationRuntime;
  private readonly maxConcurrency: number;
  private active = 0;
  private readonly ready: Promise<void>;

  constructor(options: ConfiguredImageGenerationJobServiceOptions = {}) {
    const env = options.env ?? process.env;
    this.jobDirectory = configuredJobDirectory(options);
    // Image generation is an optional World Lab capability. Resolve its
    // provider lazily so an unconfigured image route cannot prevent the core
    // novelist backend from starting; submitted jobs still fail closed with
    // provider_unavailable and never receive a synthetic image fallback.
    this.runtime = options.runtime ?? new LazyConfiguredImageGenerationRuntime(env);
    this.maxConcurrency = options.maxConcurrency ?? configuredPositiveInteger(env.VNEXT_IMAGE_JOB_CONCURRENCY, DEFAULT_MAX_CONCURRENCY, 4);
    this.ready = this.restore();
  }

  async submit(input: GenerateImageInput) {
    await this.ready;
    const now = new Date().toISOString();
    const job: ImageGenerationJobRecord = {
      jobId: randomUUID(),
      requestId: input.requestId,
      prompt: input.prompt,
      size: input.size,
      quality: input.quality,
      status: "queued",
      createdAt: now,
      updatedAt: now,
      ...(input.referenceImage
        ? {
            referenceImageFileName: `${randomUUID()}.input`,
            referenceImageUploadName: input.referenceImage.fileName,
            referenceImageMimeType: input.referenceImage.mimeType,
          }
        : {}),
      ...(input.mask
        ? {
            maskFileName: `${randomUUID()}.mask`,
            maskUploadName: input.mask.fileName,
            maskMimeType: input.mask.mimeType,
          }
        : {}),
    };
    this.jobs.set(job.jobId, job);
    try {
      if (input.referenceImage && job.referenceImageFileName) {
        await this.writeReferenceImage(job.referenceImageFileName, input.referenceImage.bytes);
      }
      if (input.mask && job.maskFileName) {
        await this.writeReferenceImage(job.maskFileName, input.mask.bytes);
      }
      await this.persist(job);
    } catch (error) {
      this.jobs.delete(job.jobId);
      if (job.referenceImageFileName) await fs.rm(join(this.jobDirectory, job.referenceImageFileName), { force: true }).catch(() => undefined);
      if (job.maskFileName) await fs.rm(join(this.jobDirectory, job.maskFileName), { force: true }).catch(() => undefined);
      throw error;
    }
    this.queue.push(job.jobId);
    this.pump();
    return this.view(job);
  }

  async get(jobId: string) {
    await this.ready;
    const job = this.jobs.get(jobId);
    return job ? this.view(job) : null;
  }

  async readAsset(jobId: string) {
    await this.ready;
    const job = this.jobs.get(jobId);
    if (!job?.assetFileName || job.status !== "succeeded") return null;
    try {
      return await fs.readFile(join(this.jobDirectory, job.assetFileName));
    } catch {
      return null;
    }
  }

  private async restore() {
    await fs.mkdir(this.jobDirectory, { recursive: true });
    const entries = await fs.readdir(this.jobDirectory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      try {
        const parsed: unknown = JSON.parse(await fs.readFile(join(this.jobDirectory, entry.name), "utf8"));
        if (!isRestorableJob(parsed)) continue;
        const job = parsed as ImageGenerationJobRecord;
        this.jobs.set(job.jobId, job);
        if ((job.referenceImageFileName && !(await this.exists(job.referenceImageFileName))) || (job.maskFileName && !(await this.exists(job.maskFileName)))) {
          job.status = "failed";
          job.errorCode = "persistence_failed";
          job.updatedAt = new Date().toISOString();
          job.completedAt = job.updatedAt;
          await this.persist(job);
        } else if (job.status === "running") {
          job.status = "failed";
          job.errorCode = "worker_restarted";
          job.updatedAt = new Date().toISOString();
          job.completedAt = job.updatedAt;
          await this.persist(job);
        } else if (job.status === "queued") {
          this.queue.push(job.jobId);
        } else if (job.status === "succeeded" && (!job.assetFileName || !(await this.exists(job.assetFileName)))) {
          job.status = "failed";
          job.errorCode = "persistence_failed";
          job.updatedAt = new Date().toISOString();
          job.completedAt = job.updatedAt;
          await this.persist(job);
        }
      } catch {
        // A corrupt historical manifest must not prevent the backend from starting.
      }
    }
    this.pump();
  }

  private async exists(fileName: string) {
    try {
      await fs.access(join(this.jobDirectory, fileName));
      return true;
    } catch {
      return false;
    }
  }

  private view(job: ImageGenerationJobRecord): ImageGenerationJobView {
    return {
      jobId: job.jobId,
      requestId: job.requestId,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      ...(job.startedAt ? { startedAt: job.startedAt } : {}),
      ...(job.completedAt ? { completedAt: job.completedAt } : {}),
      ...(job.errorCode ? { errorCode: job.errorCode } : {}),
      ...(job.trace ? { trace: job.trace } : {}),
      statusUrl: `/vnext/world-lab/images/jobs/${job.jobId}`,
      ...(job.status === "succeeded" ? { assetUrl: `/vnext/world-lab/images/jobs/${job.jobId}/asset` } : {}),
    };
  }

  private pump() {
    while (this.active < this.maxConcurrency && this.queue.length > 0) {
      const jobId = this.queue.shift();
      if (!jobId) continue;
      const job = this.jobs.get(jobId);
      if (!job || job.status !== "queued") continue;
      this.active += 1;
      void this.execute(jobId).finally(() => {
        this.active -= 1;
        this.pump();
      });
    }
  }

  private async execute(jobId: string) {
    const job = this.jobs.get(jobId);
    if (!job) return;
    const startedAt = new Date().toISOString();
    job.status = "running";
    job.startedAt = startedAt;
    job.updatedAt = startedAt;
    await this.persist(job).catch(() => undefined);
    try {
      const result = await this.runtime.generate({
        requestId: job.requestId,
        prompt: job.prompt,
        size: job.size,
        quality: job.quality,
        ...(job.referenceImageFileName
          ? {
              referenceImage: {
                fileName: job.referenceImageUploadName ?? "reference.png",
                mimeType: job.referenceImageMimeType ?? "image/png",
                bytes: await fs.readFile(join(this.jobDirectory, job.referenceImageFileName)),
              },
            }
          : {}),
        ...(job.maskFileName
          ? {
              mask: {
                fileName: job.maskUploadName ?? "mask.png",
                mimeType: job.maskMimeType ?? "image/png",
                bytes: await fs.readFile(join(this.jobDirectory, job.maskFileName)),
              } satisfies GenerateImageMask,
            }
          : {}),
      });
      const bytes = await imageBytes(result);
      const assetFileName = `${job.jobId}.png`;
      await this.writeAsset(assetFileName, bytes);
      const completedAt = new Date().toISOString();
      const completedJob: ImageGenerationJobRecord = {
        ...job,
        status: "succeeded",
        assetFileName,
        trace: result.trace,
        completedAt,
        updatedAt: completedAt,
      };
      await this.persist(completedJob);
      Object.assign(job, completedJob);
    } catch (error) {
      const completedAt = new Date().toISOString();
      job.status = "failed";
      job.errorCode = errorCode(error);
      job.completedAt = completedAt;
      job.updatedAt = completedAt;
      await this.persist(job).catch(() => undefined);
    }
  }

  private async writeAsset(fileName: string, bytes: Buffer) {
    const target = join(this.jobDirectory, fileName);
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, bytes, { flag: "wx" });
      await fs.rename(temporary, target);
    } catch {
      await fs.rm(temporary, { force: true }).catch(() => undefined);
      throw new Error("persistence_failed");
    }
  }

  private async writeReferenceImage(fileName: string, bytes: Uint8Array) {
    const target = join(this.jobDirectory, fileName);
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, bytes, { flag: "wx" });
      await fs.rename(temporary, target);
    } catch {
      await fs.rm(temporary, { force: true }).catch(() => undefined);
      throw new Error("persistence_failed");
    }
  }

  private async persist(job: ImageGenerationJobRecord) {
    const target = join(this.jobDirectory, `${job.jobId}.json`);
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, JSON.stringify(job, null, 2), { encoding: "utf8", flag: "wx" });
      await fs.rename(temporary, target);
    } catch {
      await fs.rm(temporary, { force: true }).catch(() => undefined);
      throw new Error("persistence_failed");
    }
  }
}
