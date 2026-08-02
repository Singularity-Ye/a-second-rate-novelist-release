import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  isVnextModelProfileId,
  type VnextModelProfileId,
} from "@erliu/shared-contracts";
import {
  configuredModelProfileEnvironmentPrefix,
  readConfiguredModelProfileCatalog,
} from "./configured-model-profile-catalog.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4317;
const DEFAULT_TIMEOUT_MS = 110_000;
const MAX_BODY_BYTES = 1_000_000;
const MAX_IMAGE_REQUEST_BYTES = 24_000_000;
const MAX_IMAGE_RESPONSE_BYTES = 24_000_000;

export interface LocalTrustedRouteAdapterConfig {
  readonly host: "127.0.0.1" | "::1" | "0.0.0.0";
  readonly port: number;
  readonly upstreamEndpoint: string;
  readonly upstreamApiKey: string;
  readonly localBearerToken: string;
  readonly provider: string;
  readonly model: string;
  readonly allowedModels: readonly string[];
  readonly chatRoutes?: readonly LocalTrustedChatRoute[];
  readonly lightProvider?: string;
  readonly lightModel?: string;
  readonly lightUpstreamEndpoint?: string;
  readonly lightUpstreamApiKey?: string;
  readonly imageProvider?: string;
  readonly imageModel?: string;
  readonly imageEndpoint?: string;
  readonly imageEditsEndpoint?: string;
  readonly timeoutMs: number;
}

export interface LocalTrustedChatRoute {
  readonly profileId?: VnextModelProfileId;
  readonly provider: string;
  readonly model: string;
  readonly endpoint: string;
  readonly apiKey: string;
}

export interface LocalTrustedRouteAdapterOptions {
  readonly config: LocalTrustedRouteAdapterConfig;
  readonly fetcher?: typeof fetch;
}

function required(env: Record<string, string | undefined>, name: string) {
  const value = env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function integer(value: string | undefined, fallback: number, name: string) {
  const resolved = value?.trim().length ? Number(value) : fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }
  return resolved;
}

function timeout(value: string | undefined) {
  const resolved = value?.trim().length ? Number(value) : DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(resolved) || resolved < 100 || resolved > 300_000) {
    throw new Error(
      "VNEXT_LOCAL_ROUTE_ADAPTER_TIMEOUT_MS must be between 100 and 300000",
    );
  }
  return resolved;
}

function upstreamEndpoint(
  value: string,
  route: "chat" | "images" | "imageEdits" = "chat",
  allowInsecureHttp = false,
) {
  const url = new URL(value);
  if (
    (url.protocol !== "https:" && !(allowInsecureHttp && url.protocol === "http:")) ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new Error(
      "VNEXT_UPSTREAM_BASE_URL must be a credential-free HTTPS URL, or HTTP when VNEXT_ALLOW_INSECURE_HTTP_UPSTREAM=true",
    );
  }
  let basePath = url.pathname.replace(/\/+$/, "");
  basePath = basePath.replace(/\/(?:chat\/completions|images\/(?:generations|edits))$/, "");
  const suffix = route === "images" ? "/images/generations" : route === "imageEdits" ? "/images/edits" : "/chat/completions";
  url.pathname = basePath.endsWith("/v1") ? `${basePath}${suffix}` : `${basePath}/v1${suffix}`;
  return url.toString();
}

export function readLocalTrustedRouteAdapterConfig(
  env: Record<string, string | undefined> = process.env,
): LocalTrustedRouteAdapterConfig {
  const host = env.VNEXT_LOCAL_ROUTE_ADAPTER_HOST?.trim() || DEFAULT_HOST;
  const containerNetworkEnabled =
    env.VNEXT_LOCAL_ROUTE_ADAPTER_ALLOW_CONTAINER_NETWORK?.trim().toLowerCase() ===
    "true";
  if (
    host !== "127.0.0.1" &&
    host !== "::1" &&
    !(host === "0.0.0.0" && containerNetworkEnabled)
  ) {
    throw new Error(
      "VNEXT_LOCAL_ROUTE_ADAPTER_HOST must be loopback, or 0.0.0.0 with explicit container-network opt-in",
    );
  }
  const provider = required(env, "MODEL_ROUTE_CREATIVE_LARGE_PROVIDER");
  const model = required(env, "MODEL_ROUTE_CREATIVE_LARGE_MODEL");
  const lightModel = env.MODEL_ROUTE_CREATIVE_LIGHT_MODEL?.trim();
  const lightProvider = env.MODEL_ROUTE_CREATIVE_LIGHT_PROVIDER?.trim() || provider;
  const lightBaseUrl = env.VNEXT_UPSTREAM_LIGHT_BASE_URL?.trim();
  const lightApiKey = env.VNEXT_UPSTREAM_LIGHT_API_KEY?.trim();
  if (Boolean(lightBaseUrl) !== Boolean(lightApiKey)) {
    throw new Error("VNEXT_UPSTREAM_LIGHT_BASE_URL and VNEXT_UPSTREAM_LIGHT_API_KEY must be configured together");
  }
  if ((lightBaseUrl || lightApiKey) && !lightModel) {
    throw new Error("MODEL_ROUTE_CREATIVE_LIGHT_MODEL is required for an isolated light upstream");
  }
  const imageModel = env.MODEL_ROUTE_IMAGE_MODEL?.trim() || undefined;
  const imageProvider = env.MODEL_ROUTE_IMAGE_PROVIDER?.trim() || provider;
  const allowInsecureHttp = env.VNEXT_ALLOW_INSECURE_HTTP_UPSTREAM?.trim().toLowerCase() === "true";
  const primaryEndpoint = upstreamEndpoint(
    required(env, "VNEXT_UPSTREAM_BASE_URL"),
    "chat",
    allowInsecureHttp,
  );
  const primaryApiKey = required(env, "VNEXT_UPSTREAM_API_KEY");
  const isolatedLightEndpoint = lightBaseUrl
    ? upstreamEndpoint(lightBaseUrl, "chat", allowInsecureHttp)
    : undefined;
  const catalog = readConfiguredModelProfileCatalog(env);
  const chatRoutes: LocalTrustedChatRoute[] = [];
  for (const profile of catalog.profiles) {
    if (
      profile.status !== "available" ||
      profile.provider === null ||
      profile.model === null ||
      profile.source === null
    ) {
      continue;
    }
    let endpoint = primaryEndpoint;
    let apiKey = primaryApiKey;
    if (
      profile.source === "legacy_light" &&
      isolatedLightEndpoint !== undefined &&
      lightApiKey
    ) {
      endpoint = isolatedLightEndpoint;
      apiKey = lightApiKey;
    } else if (profile.source === "explicit") {
      const prefix = configuredModelProfileEnvironmentPrefix(profile.id);
      endpoint = upstreamEndpoint(
        required(env, `${prefix}_BASE_URL`),
        "chat",
        allowInsecureHttp,
      );
      apiKey = required(env, `${prefix}_API_KEY`);
    }
    chatRoutes.push({
      profileId: profile.id,
      provider: profile.provider,
      model: profile.model,
      endpoint,
      apiKey,
    });
  }
  if (!chatRoutes.some((route) => route.model === model)) {
    chatRoutes.push({
      provider,
      model,
      endpoint: primaryEndpoint,
      apiKey: primaryApiKey,
    });
  }
  if (lightModel && !chatRoutes.some((route) => route.model === lightModel)) {
    chatRoutes.push({
      provider: lightProvider,
      model: lightModel,
      endpoint: isolatedLightEndpoint ?? primaryEndpoint,
      apiKey: lightApiKey ?? primaryApiKey,
    });
  }
  const allowedModels = Array.from(
    new Set(chatRoutes.map((route) => route.model)),
  );
  if ([provider, lightProvider, imageProvider].some((value) => [...value].length > 100) || allowedModels.some((value) => [...value].length > 200) || (imageModel !== undefined && [...imageModel].length > 200)) {
    throw new Error("configured provider or model exceeds the vNext trace limits");
  }
  return {
    host,
    port: integer(
      env.VNEXT_LOCAL_ROUTE_ADAPTER_PORT,
      DEFAULT_PORT,
      "VNEXT_LOCAL_ROUTE_ADAPTER_PORT",
    ),
    upstreamEndpoint: primaryEndpoint,
    upstreamApiKey: primaryApiKey,
    localBearerToken: required(env, "VNEXT_LOCAL_ROUTE_ADAPTER_TOKEN"),
    provider,
    model,
    allowedModels,
    chatRoutes,
    ...(lightModel ? { lightModel, lightProvider } : {}),
    ...(lightModel && lightBaseUrl && lightApiKey ? {
      lightUpstreamEndpoint: isolatedLightEndpoint!,
      lightUpstreamApiKey: lightApiKey,
    } : {}),
    ...(imageModel ? {
      imageProvider,
      imageModel,
      imageEndpoint: upstreamEndpoint(required(env, "VNEXT_UPSTREAM_BASE_URL"), "images", allowInsecureHttp),
      imageEditsEndpoint: upstreamEndpoint(required(env, "VNEXT_UPSTREAM_BASE_URL"), "imageEdits", allowInsecureHttp),
    } : {}),
    timeoutMs: timeout(env.VNEXT_LOCAL_ROUTE_ADAPTER_TIMEOUT_MS),
  };
}

function chatRouteForModel(
  config: LocalTrustedRouteAdapterConfig,
  requestedModel: string,
  requestedProfileId: VnextModelProfileId | undefined,
) {
  const routes = config.chatRoutes ?? [];
  if (requestedProfileId !== undefined) {
    return routes.find(
      (route) =>
        route.profileId === requestedProfileId && route.model === requestedModel,
    ) ?? null;
  }
  const matches = routes.filter((route) => route.model === requestedModel);
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) return null;
  if (
    requestedModel === config.lightModel
    && config.lightUpstreamEndpoint
    && config.lightUpstreamApiKey
  ) {
    return {
      endpoint: config.lightUpstreamEndpoint,
      apiKey: config.lightUpstreamApiKey,
      provider: config.lightProvider ?? config.provider,
      model: requestedModel,
    };
  }
  return requestedModel === config.model ? {
    endpoint: config.upstreamEndpoint,
    apiKey: config.upstreamApiKey,
    provider: config.provider,
    model: requestedModel,
  } : null;
}

function sendJson(response: ServerResponse, status: number, message: string) {
  const body = JSON.stringify({ error: { message } });
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
    "content-type": "application/json; charset=utf-8",
  });
  response.end(body);
}

function authorized(value: string | undefined, expectedToken: string) {
  if (value === undefined || !value.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(value.slice("Bearer ".length));
  const expected = Buffer.from(expectedToken);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function requestBody(request: IncomingMessage, maximumBytes: number) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maximumBytes) throw new Error("request_too_large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function modelMatches(actual: unknown, expected: string) {
  if (typeof actual !== "string") return false;
  const left = actual.trim().toLowerCase();
  const right = expected.trim().toLowerCase();
  if (!left || !right) return false;
  // Third-party gateways often append a version/date suffix or remap aliases.
  // Keep the configured model as the product identity, but accept compatible
  // return names so OpenAI-compatible routers are not rejected as unavailable.
  return (
    left === right ||
    left.startsWith(`${right}-`) ||
    left.startsWith(`${right}/`) ||
    left.startsWith(`${right}:`) ||
    right.startsWith(`${left}-`) ||
    right.startsWith(`${left}/`) ||
    right.startsWith(`${left}:`)
  );
}

function pinnedModel(rawBody: string, allowedModels: ReadonlySet<string>) {
  let value: unknown;
  try {
    value = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (
    !isRecord(value) ||
    typeof value.model !== "string" ||
    !allowedModels.has(value.model) ||
    (value.stream !== false && value.stream !== true)
  ) {
    return null;
  }
  // Prefer strict JSON Schema when the caller requests it, but do not reject
  // prompt-only JSON requests. Product adapters may fall back for third-party
  // gateways that cannot carry large strict schemas.
  const responseFormat = value.response_format;
  if (responseFormat !== undefined) {
    if (!isRecord(responseFormat)) return null;
    if (responseFormat.type === "json_schema") {
      const jsonSchema = responseFormat.json_schema;
      if (!isRecord(jsonSchema) || jsonSchema.strict !== true) return null;
    } else if (responseFormat.type !== "json_object") {
      return null;
    }
  }
  return { model: value.model as string, stream: value.stream === true };
}

function pinnedImageModel(rawBody: string, imageModel: string | undefined) {
  if (!imageModel) return null;
  let value: unknown;
  try {
    value = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (!isRecord(value) || value.model !== imageModel || typeof value.prompt !== "string" || value.prompt.trim().length === 0 || [...value.prompt].length > 32_000 || value.stream === true || (value.n !== undefined && value.n !== 1)) {
    return null;
  }
  return imageModel;
}

function pinnedImageEditModel(rawBody: Buffer, contentType: string | undefined, imageModel: string | undefined) {
  if (!imageModel || !contentType?.toLowerCase().startsWith("multipart/form-data;")) return null;
  const text = rawBody.toString("latin1");
  if (!text.includes('name="model"') || !text.includes(`\r\n\r\n${imageModel}\r\n`) || !text.includes('name="prompt"') || !text.includes('name="image"')) {
    return null;
  }
  return imageModel;
}

function responseAttestsModel(rawBody: string, model: string) {
  let value: unknown;
  try {
    value = JSON.parse(rawBody);
  } catch {
    return false;
  }
  return (
    isRecord(value) &&
    modelMatches(value.model, model) &&
    typeof value.id === "string" &&
    value.id.trim().length > 0 &&
    Array.isArray(value.choices)
  );
}

function responseAttestsStreamFrame(frame: string, model: string) {
  const data = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!data || data === "[DONE]") return false;
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return false;
  }
  return (
    isRecord(value) &&
    modelMatches(value.model, model) &&
    typeof value.id === "string" &&
    value.id.trim().length > 0 &&
    Array.isArray(value.choices)
  );
}

async function relayVerifiedEventStream(
  upstream: Response,
  response: ServerResponse,
  model: string,
  provider: string,
  profileId: VnextModelProfileId | undefined,
) {
  if (!upstream.body) throw new Error("stream_unsupported");
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const prefixChunks: Buffer[] = [];
  let frameBuffer = "";
  let totalBytes = 0;
  let attested = false;

  // Do not send route-attestation headers until the upstream has emitted a
  // real model/id/choices packet. This prevents an arbitrary SSE endpoint
  // from being presented to the backend as a trusted model route.
  while (!attested) {
    const next = await reader.read();
    if (next.done) break;
    const chunk = Buffer.from(next.value);
    totalBytes += chunk.byteLength;
    if (totalBytes > MAX_BODY_BYTES) throw new Error("response_too_large");
    prefixChunks.push(chunk);
    frameBuffer += decoder.decode(chunk, { stream: true });
    frameBuffer = frameBuffer.replace(/\r\n/gu, "\n");
    let separator = frameBuffer.indexOf("\n\n");
    while (separator >= 0) {
      const frame = frameBuffer.slice(0, separator);
      frameBuffer = frameBuffer.slice(separator + 2);
      if (responseAttestsStreamFrame(frame, model)) {
        attested = true;
        break;
      }
      separator = frameBuffer.indexOf("\n\n");
    }
  }

  if (!attested) throw new Error("invalid_runtime_output");
  response.writeHead(200, {
    "cache-control": "no-store",
    "content-type": "text/event-stream; charset=utf-8",
    connection: "keep-alive",
    "x-accel-buffering": "no",
    "x-vnext-route-attestation": "v1",
    "x-vnext-actual-provider": provider,
    "x-vnext-actual-model": model,
    ...(profileId === undefined
      ? {}
      : { "x-vnext-actual-profile-id": profileId }),
    "x-vnext-fallback-applied": "false",
  });
  for (const chunk of prefixChunks) response.write(chunk);

  while (true) {
    const next = await reader.read();
    if (next.done) break;
    const chunk = Buffer.from(next.value);
    totalBytes += chunk.byteLength;
    if (totalBytes > MAX_BODY_BYTES) {
      response.destroy(new Error("response_too_large"));
      return;
    }
    response.write(chunk);
  }
  response.end();
}

async function boundedResponseText(response: Response, maximumBytes = MAX_BODY_BYTES) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("response_too_large");
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maximumBytes) throw new Error("response_too_large");
  return buffer.toString("utf8");
}

function validImageResponse(rawBody: string) {
  let value: unknown;
  try {
    value = JSON.parse(rawBody);
  } catch {
    return false;
  }
  if (!isRecord(value) || !Array.isArray(value.data) || value.data.length !== 1) return false;
  const item = value.data[0];
  if (!isRecord(item)) return false;
  return (typeof item.b64_json === "string" && item.b64_json.length > 0) || (typeof item.url === "string" && item.url.startsWith("https://"));
}

export function createLocalTrustedRouteAdapter(
  options: LocalTrustedRouteAdapterOptions,
) {
  const { config } = options;
  const fetcher = options.fetcher ?? globalThis.fetch;
  return createServer(async (request, response) => {
    response.setHeader("cache-control", "no-store");
    if (request.method === "GET" && request.url === "/healthz") {
      const body = JSON.stringify({ status: "ok" });
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-length": Buffer.byteLength(body),
        "content-type": "application/json; charset=utf-8",
      });
      response.end(body);
      return;
    }
    const isChatRoute = request.method === "POST" && request.url === "/v1/chat/completions";
    const isImageGenerationRoute = request.method === "POST" && request.url === "/v1/images/generations";
    const isImageEditRoute = request.method === "POST" && request.url === "/v1/images/edits";
    const isImageRoute = isImageGenerationRoute || isImageEditRoute;
    if (!isChatRoute && !isImageRoute) {
      sendJson(response, 404, "route not found");
      return;
    }
    if (isImageRoute && (!config.imageModel || (isImageGenerationRoute ? !config.imageEndpoint : !config.imageEditsEndpoint))) {
      sendJson(response, 404, "image route not configured");
      return;
    }
    if (!authorized(request.headers.authorization, config.localBearerToken)) {
      sendJson(response, 401, "unauthorized");
      return;
    }

    let rawRequest: Buffer;
    try {
      rawRequest = await requestBody(request, isImageRoute ? MAX_IMAGE_REQUEST_BYTES : MAX_BODY_BYTES);
    } catch {
      sendJson(response, 413, "request body is too large");
      return;
    }
    const requested = isImageEditRoute
      ? pinnedImageEditModel(rawRequest, request.headers["content-type"], config.imageModel)
      : isImageGenerationRoute
      ? pinnedImageModel(rawRequest.toString("utf8"), config.imageModel)
      : pinnedModel(rawRequest.toString("utf8"), new Set(config.allowedModels));
    if (requested === null) {
      sendJson(response, 400, "request is not pinned to the configured strict route");
      return;
    }
    const requestedModel = typeof requested === "string" ? requested : requested.model;
    const streamRequested = isChatRoute && typeof requested !== "string" && requested.stream;
    const rawProfileHeader = request.headers["x-vnext-model-profile-id"];
    const requestedProfileId =
      typeof rawProfileHeader === "string" &&
      isVnextModelProfileId(rawProfileHeader)
        ? rawProfileHeader
        : undefined;
    if (
      isChatRoute &&
      rawProfileHeader !== undefined &&
      requestedProfileId === undefined
    ) {
      sendJson(response, 400, "model profile is not approved");
      return;
    }
    const chatRoute = isChatRoute
      ? chatRouteForModel(config, requestedModel, requestedProfileId)
      : null;
    if (isChatRoute && chatRoute === null) {
      sendJson(
        response,
        400,
        "request is not pinned to an approved model profile",
      );
      return;
    }
    const actualProvider = isImageRoute
      ? config.imageProvider ?? config.provider
      : chatRoute!.provider;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    timer.unref?.();
    request.once("aborted", () => controller.abort());
    let upstream: Response;
    let rawResponse: string;
    try {
      upstream = await fetcher(
        isImageEditRoute ? config.imageEditsEndpoint! : isImageGenerationRoute ? config.imageEndpoint! : chatRoute!.endpoint,
        {
        method: "POST",
        headers: {
          accept: streamRequested ? "text/event-stream" : "application/json",
          authorization: `Bearer ${isImageRoute ? config.upstreamApiKey : chatRoute!.apiKey}`,
          "content-type": isImageEditRoute ? request.headers["content-type"] ?? "" : "application/json",
        },
        body: rawRequest as unknown as BodyInit,
        redirect: "error",
        signal: controller.signal,
        },
      );
      if (streamRequested) {
        if (upstream.status !== 200) {
          sendJson(response, upstream.status, "upstream rejected the request");
          return;
        }
        if (!(upstream.headers.get("content-type") ?? "").toLowerCase().includes("text/event-stream")) {
          sendJson(response, 501, "upstream does not support streaming");
          return;
        }
        await relayVerifiedEventStream(
          upstream,
          response,
          requestedModel,
          actualProvider,
          requestedProfileId,
        );
        return;
      }
      rawResponse = await boundedResponseText(upstream, isImageRoute ? MAX_IMAGE_RESPONSE_BYTES : MAX_BODY_BYTES);
    } catch {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      sendJson(response, controller.signal.aborted ? 504 : 502, "upstream request failed");
      return;
    } finally {
      clearTimeout(timer);
    }

    if (upstream.status !== 200) {
      sendJson(response, upstream.status, "upstream rejected the request");
      return;
    }
    if ((!isImageRoute && !responseAttestsModel(rawResponse, requestedModel)) || (isImageRoute && !validImageResponse(rawResponse))) {
      sendJson(response, 502, "upstream response did not prove the configured model");
      return;
    }

    response.writeHead(200, {
      "cache-control": "no-store",
      "content-length": Buffer.byteLength(rawResponse),
      "content-type": "application/json; charset=utf-8",
      "x-vnext-route-attestation": "v1",
      "x-vnext-actual-provider": actualProvider,
      "x-vnext-actual-model": requestedModel,
      ...(requestedProfileId === undefined
        ? {}
        : { "x-vnext-actual-profile-id": requestedProfileId }),
      "x-vnext-fallback-applied": "false",
    });
    response.end(rawResponse);
  });
}
