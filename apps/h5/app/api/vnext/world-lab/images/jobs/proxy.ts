import { request as httpRequest } from "node:http";

const MAX_RESPONSE_BYTES = 24_000_000;
const PROXY_TIMEOUT_MS = 25_000;

export interface ImageJobProxyResult {
  readonly status: number;
  readonly contentType: string;
  readonly body: Buffer;
}

export function forwardImageJobRequest(input: {
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly body?: Buffer;
  readonly request: Request;
}): Promise<ImageJobProxyResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finishError = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const upstream = httpRequest({
      agent: false,
      hostname: "127.0.0.1",
      port: 4000,
      path: input.path,
      method: input.method,
      headers: {
        accept: input.path.endsWith("/asset") ? "image/png" : "application/json",
        connection: "close",
        ...(input.body ? {
          "content-length": String(input.body.byteLength),
          "content-type": "application/json",
        } : {}),
        origin: input.request.headers.get("origin") ?? "http://127.0.0.1:3000",
        ...(input.request.headers.get("cookie") ? { cookie: input.request.headers.get("cookie")! } : {}),
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.byteLength;
        if (size > MAX_RESPONSE_BYTES) {
          upstream.destroy(new Error("proxy_response_too_large"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        if (settled) return;
        settled = true;
        resolve({
          status: response.statusCode ?? 503,
          contentType: String(response.headers["content-type"] ?? "application/json; charset=utf-8"),
          body: Buffer.concat(chunks),
        });
      });
      response.on("error", finishError);
    });
    upstream.setTimeout(PROXY_TIMEOUT_MS, () => upstream.destroy(new Error("proxy_timeout")));
    upstream.once("error", finishError);
    if (input.body) upstream.end(input.body);
    else upstream.end();
  });
}

export function imageJobProxyError(error: unknown) {
  const code = error instanceof Error && error.message === "proxy_timeout" ? "provider_timeout" : "provider_connection_reset";
  return Response.json({ code }, { status: code === "provider_timeout" ? 504 : 503 });
}

export function imageJobProxyResponse(result: ImageJobProxyResult) {
  return new Response(new Uint8Array(result.body), {
    status: result.status,
    headers: {
      "cache-control": "no-store",
      "content-type": result.contentType,
    },
  });
}

export { MAX_RESPONSE_BYTES };
