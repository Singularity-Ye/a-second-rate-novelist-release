import { request as httpRequest } from "node:http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 512_000;
const MAX_RESPONSE_BYTES = 2_000_000;
const PROXY_TIMEOUT_MS = 390_000;

interface ProxyResponse {
  status: number;
  contentType: string;
  body: Buffer;
  requestId?: string;
}

function forwardToLocalBackend(body: Buffer, request: Request): Promise<ProxyResponse> {
  return new Promise((resolve, reject) => {
    const upstream = httpRequest(
      {
        agent: false,
        hostname: "127.0.0.1",
        port: 4000,
        path: "/vnext/world-lab/forecasts/run",
        method: "POST",
        headers: {
          accept: "application/json",
          connection: "close",
          "content-length": String(body.byteLength),
          "content-type": "application/json",
          origin: request.headers.get("origin") ?? "http://127.0.0.1:3000",
          ...(request.headers.get("cookie") ? { cookie: request.headers.get("cookie")! } : {}),
        },
      },
      (response) => {
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
        response.on("end", () => resolve({
          status: response.statusCode ?? 503,
          contentType: String(response.headers["content-type"] ?? "application/json; charset=utf-8"),
          body: Buffer.concat(chunks),
          ...(typeof response.headers["x-request-id"] === "string" ? { requestId: response.headers["x-request-id"] } : {}),
        }));
      },
    );
    upstream.setTimeout(PROXY_TIMEOUT_MS, () => upstream.destroy(new Error("proxy_timeout")));
    upstream.once("error", reject);
    upstream.end(body);
  });
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return Response.json({ code: "not_found" }, { status: 404 });
  const body = Buffer.from(await request.arrayBuffer());
  if (body.byteLength === 0 || body.byteLength > MAX_REQUEST_BYTES) return Response.json({ code: "invalid_request" }, { status: 400 });
  try {
    const upstream = await forwardToLocalBackend(body, request);
    return new Response(upstream.body.toString("utf8"), {
      status: upstream.status,
      headers: {
        "cache-control": "no-store",
        "content-type": upstream.contentType,
        ...(upstream.requestId ? { "x-request-id": upstream.requestId } : {}),
      },
    });
  } catch (error) {
    const code = error instanceof Error && error.message === "proxy_timeout" ? "provider_timeout" : "provider_connection_reset";
    return Response.json({ code }, { status: code === "provider_timeout" ? 504 : 503 });
  }
}
