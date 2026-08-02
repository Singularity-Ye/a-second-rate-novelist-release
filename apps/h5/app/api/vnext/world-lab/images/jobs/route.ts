import {
  forwardImageJobRequest,
  imageJobProxyError,
  imageJobProxyResponse,
} from "./proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 32_000_000;

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return Response.json({ code: "not_found" }, { status: 404 });
  const body = Buffer.from(await request.arrayBuffer());
  if (body.byteLength === 0 || body.byteLength > MAX_REQUEST_BYTES) return Response.json({ code: "invalid_request" }, { status: 400 });
  try {
    return imageJobProxyResponse(await forwardImageJobRequest({ method: "POST", path: "/vnext/world-lab/images/jobs", body, request }));
  } catch (error) {
    return imageJobProxyError(error);
  }
}
