export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 1_000_000;
const MAX_STREAM_BYTES = 1_000_000;
const PROXY_TIMEOUT_MS = 190_000;
const UPSTREAM_URL = "http://127.0.0.1:4000/vnext/room/messages/stream";

export async function POST(request: Request) {
  const body = await request.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > MAX_REQUEST_BYTES) {
    return Response.json({ code: "invalid_request" }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
  timeout.unref?.();
  const abortUpstream = () => controller.abort();
  request.signal.addEventListener("abort", abortUpstream, { once: true });
  const cleanup = () => {
    clearTimeout(timeout);
    request.signal.removeEventListener("abort", abortUpstream);
  };

  try {
    const upstream = await fetch(UPSTREAM_URL, {
      method: "POST",
      headers: {
        accept: "text/event-stream",
        "content-type": "application/json",
        origin: request.headers.get("origin") ?? "http://127.0.0.1:3000",
        ...(request.headers.get("cookie")
          ? { cookie: request.headers.get("cookie")! }
          : {}),
      },
      body,
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });

    if (!upstream.body) {
      cleanup();
      return Response.json({ code: "provider_connection_reset" }, { status: 503 });
    }

    let size = 0;
    const guardedBody = upstream.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, streamController) {
        size += chunk.byteLength;
        if (size > MAX_STREAM_BYTES) {
          controller.abort();
          throw new Error("proxy_response_too_large");
        }
        streamController.enqueue(chunk);
      },
      flush() {
        cleanup();
      },
    }));

    return new Response(guardedBody, {
      status: upstream.status,
      headers: {
        "cache-control": "no-store, no-cache, must-revalidate, no-transform",
        "content-encoding": "identity",
        "content-type": upstream.headers.get("content-type") ?? "text/event-stream; charset=utf-8",
        "x-accel-buffering": "no",
        "x-erliu-sse-proxy": "byte-stream-v2",
        ...(upstream.headers.get("x-request-id")
          ? { "x-request-id": upstream.headers.get("x-request-id")! }
          : {}),
      },
    });
  } catch (error) {
    cleanup();
    const timedOut = controller.signal.aborted && !request.signal.aborted;
    return Response.json(
      { code: timedOut ? "provider_timeout" : "provider_connection_reset" },
      { status: timedOut ? 504 : 503 },
    );
  }
}
