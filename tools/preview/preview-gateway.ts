import http from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface PreviewGatewayConfig {
  port: number;
  listenHost?: string;
  h5Port: number;
  opsPort: number;
  backendPort: number;
  label: string;
  h5Origin?: string;
  opsOrigin?: string;
  backendOrigin?: string;
  auth?: PreviewGatewayAuthConfig;
}

interface PreviewGatewayAuthConfig {
  mode: "basic";
  username: string;
  password: string;
  realm: string;
}

interface PreviewGatewayRequestLike {
  url?: string | null;
  headers: http.IncomingHttpHeaders;
}

function readNumberArg(flag: string, fallback: number) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return fallback;
  }

  const value = process.argv[index + 1];
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }

  return Number(value);
}

function readStringArg(flag: string, fallback: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return fallback;
  }

  return process.argv[index + 1] ?? fallback;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function resolveOrigin(explicitOrigin: string | undefined, fallbackPort: number) {
  return explicitOrigin?.trim() ? trimTrailingSlash(explicitOrigin) : `http://127.0.0.1:${fallbackPort}`;
}

export function readGatewayListenHost(env: Record<string, string | undefined> = process.env) {
  return env.PREVIEW_GATEWAY_LISTEN_HOST?.trim() || "127.0.0.1";
}

function createConfig(): PreviewGatewayConfig {
  const authUsername = process.env.PREVIEW_GATEWAY_BASIC_AUTH_USERNAME?.trim();
  const authPassword = process.env.PREVIEW_GATEWAY_BASIC_AUTH_PASSWORD?.trim();

  return {
    port: readNumberArg("--port", 3300),
    listenHost: readGatewayListenHost(),
    h5Port: readNumberArg("--h5-port", 3000),
    opsPort: readNumberArg("--ops-port", 3001),
    backendPort: readNumberArg("--backend-port", 4000),
    label: readStringArg("--label", "shared-dev"),
    h5Origin: process.env.PREVIEW_GATEWAY_H5_ORIGIN?.trim(),
    opsOrigin: process.env.PREVIEW_GATEWAY_OPS_ORIGIN?.trim(),
    backendOrigin: process.env.PREVIEW_GATEWAY_BACKEND_ORIGIN?.trim(),
    auth:
      authUsername && authPassword
        ? {
            mode: "basic",
            username: authUsername,
            password: authPassword,
            realm: process.env.PREVIEW_GATEWAY_BASIC_AUTH_REALM?.trim() || "preview",
          }
        : undefined,
  };
}

function shouldProxyToOpsAsset(urlPath: string, requestHeaders: http.IncomingHttpHeaders) {
  if (!(urlPath === "/favicon.ico" || urlPath.startsWith("/_next/"))) {
    return false;
  }

  const referer = requestHeaders.referer ?? requestHeaders.referrer;
  if (!referer) {
    return false;
  }

  try {
    const refererPath = new URL(referer).pathname;
    return refererPath === "/ops" || refererPath.startsWith("/ops/");
  } catch {
    return false;
  }
}

export function resolveTargetPath(urlPath: string, config: PreviewGatewayConfig, requestHeaders: http.IncomingHttpHeaders = {}) {
  const backendOrigin = resolveOrigin(config.backendOrigin, config.backendPort);
  const opsOrigin = resolveOrigin(config.opsOrigin, config.opsPort);
  const h5Origin = resolveOrigin(config.h5Origin, config.h5Port);

  if (urlPath === "/healthz") {
    return new URL("/healthz", backendOrigin);
  }

  if (urlPath === "/api" || urlPath.startsWith("/api/")) {
    const backendPath = urlPath === "/api" ? "/" : urlPath.slice(4);
    return new URL(backendPath, backendOrigin);
  }

  if (urlPath === "/ops" || urlPath.startsWith("/ops/")) {
    return new URL(urlPath, opsOrigin);
  }

  if (shouldProxyToOpsAsset(urlPath, requestHeaders)) {
    return new URL(urlPath, opsOrigin);
  }

  return new URL(urlPath, h5Origin);
}

export function resolveTargetForRequest(request: PreviewGatewayRequestLike, config: PreviewGatewayConfig) {
  return resolveTargetPath(request.url ?? "/", config, request.headers);
}

export function isAuthorizedPreviewRequest(request: PreviewGatewayRequestLike, config: PreviewGatewayConfig) {
  if (!config.auth) {
    return true;
  }

  const pathname = new URL(request.url ?? "/", "http://preview.local").pathname;
  if (pathname === "/healthz") {
    return true;
  }

  const authorizationHeader = request.headers.authorization;
  if (!authorizationHeader?.startsWith("Basic ")) {
    return false;
  }

  try {
    const decoded = Buffer.from(authorizationHeader.slice("Basic ".length).trim(), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator === -1) {
      return false;
    }

    return (
      decoded.slice(0, separator) === config.auth.username &&
      decoded.slice(separator + 1) === config.auth.password
    );
  } catch {
    return false;
  }
}

function startGateway(config: PreviewGatewayConfig) {
  const server = http.createServer((request, response) => {
    if (!isAuthorizedPreviewRequest(request, config)) {
      response.writeHead(401, {
        "content-type": "application/json",
        "www-authenticate": `Basic realm="${config.auth?.realm ?? "preview"}"`,
      });
      response.end(
        JSON.stringify({
          error: "preview_gateway_unauthorized",
          label: config.label,
        }),
      );
      return;
    }

    const targetUrl = resolveTargetForRequest(request, config);
    const transport = targetUrl.protocol === "https:" ? https : http;

    const proxyRequest = transport.request(
      targetUrl,
      {
        method: request.method,
        headers: {
          ...request.headers,
          host: targetUrl.host,
        },
      },
      (proxyResponse) => {
        response.writeHead(proxyResponse.statusCode ?? 502, proxyResponse.headers);
        proxyResponse.pipe(response);
      },
    );

    proxyRequest.on("error", (error) => {
      response.writeHead(502, {
        "content-type": "application/json",
      });
      response.end(
        JSON.stringify({
          error: "preview_gateway_proxy_failed",
          label: config.label,
          target: targetUrl.toString(),
          message: error.message,
        }),
      );
    });

    request.pipe(proxyRequest);
  });

  server.listen(config.port, config.listenHost ?? "127.0.0.1", () => {
    console.log(
      JSON.stringify({
        label: config.label,
        gateway_url: `http://${config.listenHost ?? "127.0.0.1"}:${config.port}`,
        h5_origin: resolveOrigin(config.h5Origin, config.h5Port),
        ops_origin: resolveOrigin(config.opsOrigin, config.opsPort),
        backend_origin: resolveOrigin(config.backendOrigin, config.backendPort),
        auth_mode: config.auth?.mode ?? "none",
      }),
    );
  });
}

function isDirectExecution() {
  const entrypoint = process.argv[1];
  if (!entrypoint) {
    return false;
  }

  return path.resolve(entrypoint) === fileURLToPath(import.meta.url);
}

if (isDirectExecution()) {
  startGateway(createConfig());
}
