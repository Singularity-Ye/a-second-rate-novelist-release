import { request as httpRequest } from "node:http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 32_000_000;
const MAX_RESPONSE_BYTES = 24_000_000;
const PROXY_TIMEOUT_MS = 190_000;

function forward(body: Buffer, request: Request): Promise<{ status: number; contentType: string; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const upstream = httpRequest({
      agent: false,
      hostname: "127.0.0.1",
      port: 4000,
      path: "/vnext/world-lab/images/generate",
      method: "POST",
      headers: {
        accept: "application/json",
        connection: "close",
        "content-length": String(body.byteLength),
        "content-type": "application/json",
        origin: request.headers.get("origin") ?? "http://127.0.0.1:3000",
        ...(request.headers.get("cookie") ? { cookie: request.headers.get("cookie")! } : {}),
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
      response.on("end", () => resolve({
        status: response.statusCode ?? 503,
        contentType: String(response.headers["content-type"] ?? "application/json; charset=utf-8"),
        body: Buffer.concat(chunks),
      }));
    });
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
    const result = await forward(body, request);
    return new Response(result.body.toString("utf8"), {
      status: result.status,
      headers: { "cache-control": "no-store", "content-type": result.contentType },
    });
  } catch (error) {
    const code = error instanceof Error && error.message === "proxy_timeout" ? "provider_timeout" : "provider_connection_reset";
    return Response.json({ code }, { status: code === "provider_timeout" ? 504 : 503 });
  }
}
