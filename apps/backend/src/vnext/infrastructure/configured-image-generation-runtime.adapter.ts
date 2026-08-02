import { createHash } from "node:crypto";
import { VNEXT_GATEWAY_ROUTE_ATTESTATION_V1 } from "./configured-creative-runtime.adapter.js";

const DEFAULT_TIMEOUT_MS = 180_000;
const MAX_PROMPT_CODE_POINTS = 32_000;
const MAX_RESPONSE_BYTES = 24_000_000;
const MAX_REFERENCE_IMAGE_BYTES = 18_000_000;
const MAX_MASK_IMAGE_BYTES = 18_000_000;

export type GenerateImageReferenceMimeType = "image/png" | "image/jpeg" | "image/webp";

export interface GenerateImageReference {
  readonly fileName: string;
  readonly mimeType: GenerateImageReferenceMimeType;
  readonly bytes: Uint8Array;
}

export interface GenerateImageMask {
  readonly fileName: string;
  readonly mimeType: GenerateImageReferenceMimeType;
  readonly bytes: Uint8Array;
}

export interface GenerateImageInput {
  readonly requestId: string;
  readonly prompt: string;
  readonly size: "1024x1024" | "1536x1024" | "1024x1536";
  readonly quality: "low" | "medium" | "high";
  readonly referenceImage?: GenerateImageReference;
  readonly mask?: GenerateImageMask;
}

export interface GenerateImageResult {
  readonly imageUrl: string;
  readonly trace: {
    readonly traceId: string;
    readonly provider: string;
    readonly model: string;
    readonly workflowVersion: "vnext.image-generation.v1";
    readonly outputHash: string;
  };
  readonly fallbackApplied: false;
}

function required(value: string | undefined, name: string) {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`${name}_missing`);
  return trimmed;
}

function endpointFromBaseUrl(value: string, operation: "generations" | "edits" = "generations") {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("provider_unavailable");
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username || url.password || url.search || url.hash ||
    (url.protocol === "http:" && !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
  ) throw new Error("provider_unavailable");
  let basePath = url.pathname.replace(/\/+$/, "");
  basePath = basePath.replace(/\/images\/(?:generations|edits)$/, "");
  const suffix = `/images/${operation}`;
  url.pathname = basePath.endsWith("/v1") ? `${basePath}${suffix}` : `${basePath}/v1${suffix}`;
  return url.toString();
}

function configuredTimeout(value: string | undefined) {
  const parsed = value?.trim() ? Number(value) : DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(parsed) || parsed < 100 || parsed > 300_000) throw new Error("provider_unavailable");
  return parsed;
}

function parseImageResponse(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("invalid_runtime_output");
  const output = value as Record<string, unknown>;
  if (!Array.isArray(output.data) || output.data.length !== 1) throw new Error("invalid_runtime_output");
  const item = output.data[0];
  if (typeof item !== "object" || item === null || Array.isArray(item)) throw new Error("invalid_runtime_output");
  const data = item as Record<string, unknown>;
  if (typeof data.b64_json === "string" && data.b64_json.length > 0) return `data:image/png;base64,${data.b64_json}`;
  if (typeof data.url === "string" && data.url.startsWith("https://")) return data.url;
  throw new Error("invalid_runtime_output");
}

export class ConfiguredImageGenerationRuntimeAdapter {
  private readonly endpoint: string;
  private readonly editEndpoint: string;
  private readonly apiKey: string;
  private readonly provider: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetcher: typeof fetch;

  constructor(options: { readonly env?: Record<string, string | undefined>; readonly fetcher?: typeof fetch } = {}) {
    const env = options.env ?? process.env;
    this.endpoint = endpointFromBaseUrl(required(env.LITELLM_BASE_URL, "LITELLM_BASE_URL"));
    this.editEndpoint = endpointFromBaseUrl(required(env.LITELLM_BASE_URL, "LITELLM_BASE_URL"), "edits");
    this.apiKey = required(env.LITELLM_API_KEY, "LITELLM_API_KEY");
    this.provider = required(env.MODEL_ROUTE_IMAGE_PROVIDER ?? env.MODEL_ROUTE_CREATIVE_LARGE_PROVIDER, "MODEL_ROUTE_IMAGE_PROVIDER");
    this.model = required(env.MODEL_ROUTE_IMAGE_MODEL, "MODEL_ROUTE_IMAGE_MODEL");
    this.timeoutMs = configuredTimeout(env.VNEXT_IMAGE_TIMEOUT_MS ?? env.VNEXT_CREATIVE_TIMEOUT_MS);
    this.fetcher = options.fetcher ?? globalThis.fetch;
  }

  async generate(input: GenerateImageInput): Promise<GenerateImageResult> {
    if (!input.requestId.trim() || !input.prompt.trim() || [...input.prompt].length > MAX_PROMPT_CODE_POINTS) throw new Error("invalid_request");
    if (input.referenceImage && (input.referenceImage.bytes.byteLength === 0 || input.referenceImage.bytes.byteLength > MAX_REFERENCE_IMAGE_BYTES)) {
      throw new Error("invalid_request");
    }
    if (input.mask && (!input.referenceImage || input.mask.bytes.byteLength === 0 || input.mask.bytes.byteLength > MAX_MASK_IMAGE_BYTES)) {
      throw new Error("invalid_request");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    timeout.unref?.();
    let response: Response;
    let raw: string;
    try {
      const headers: Record<string, string> = {
        accept: "application/json",
        authorization: `Bearer ${this.apiKey}`,
      };
      let body: BodyInit;
      let endpoint = this.endpoint;
      if (input.referenceImage) {
        const form = new FormData();
        form.append("model", this.model);
        form.append("prompt", input.prompt);
        form.append("n", "1");
        form.append("size", input.size);
        form.append("quality", input.quality);
        form.append("output_format", "png");
        form.append(
          "image",
          new Blob([input.referenceImage.bytes as unknown as ArrayBuffer], { type: input.referenceImage.mimeType }),
          input.referenceImage.fileName,
        );
        if (input.mask) {
          form.append(
            "mask",
            new Blob([input.mask.bytes as unknown as ArrayBuffer], { type: input.mask.mimeType }),
            input.mask.fileName,
          );
        }
        body = form;
        endpoint = this.editEndpoint;
      } else {
        headers["content-type"] = "application/json";
        body = JSON.stringify({
          model: this.model,
          prompt: input.prompt,
          n: 1,
          size: input.size,
          quality: input.quality,
          output_format: "png",
          stream: false,
        });
      }
      response = await this.fetcher(endpoint, {
        method: "POST",
        headers,
        body,
        redirect: "error",
        signal: controller.signal,
      });
      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) throw new Error("invalid_runtime_output");
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0 || bytes.length > MAX_RESPONSE_BYTES) throw new Error("invalid_runtime_output");
      raw = bytes.toString("utf8");
    } catch (error) {
      if (controller.signal.aborted) throw new Error("provider_timeout");
      if (error instanceof Error && ["invalid_runtime_output", "provider_timeout"].includes(error.message)) throw error;
      throw new Error("provider_unavailable");
    } finally {
      clearTimeout(timeout);
    }
    if (response.status !== 200) throw new Error(response.status === 408 || response.status === 504 ? "provider_timeout" : "provider_unavailable");
    const marker = response.headers.get(VNEXT_GATEWAY_ROUTE_ATTESTATION_V1.markerHeader);
    const provider = response.headers.get(VNEXT_GATEWAY_ROUTE_ATTESTATION_V1.providerHeader);
    const model = response.headers.get(VNEXT_GATEWAY_ROUTE_ATTESTATION_V1.modelHeader);
    const fallback = response.headers.get(VNEXT_GATEWAY_ROUTE_ATTESTATION_V1.fallbackAppliedHeader);
    if (marker !== "v1" || provider !== this.provider || model !== this.model || fallback !== "false") throw new Error("invalid_runtime_output");
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error("invalid_runtime_output");
    }
    const imageUrl = parseImageResponse(value);
    return {
      imageUrl,
      trace: {
        traceId: response.headers.get("x-vnext-trace-id") ?? `image-${createHash("sha256").update(raw).digest("hex").slice(0, 24)}`,
        provider,
        model,
        workflowVersion: "vnext.image-generation.v1",
        outputHash: createHash("sha256").update(raw).digest("hex"),
      },
      fallbackApplied: false,
    };
  }
}
