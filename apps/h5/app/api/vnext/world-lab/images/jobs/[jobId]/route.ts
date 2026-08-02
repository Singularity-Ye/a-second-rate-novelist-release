import {
  forwardImageJobRequest,
  imageJobProxyError,
  imageJobProxyResponse,
} from "../proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JOB_ID_PATTERN = /^[0-9a-f-]{36}$/i;

export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  if (process.env.NODE_ENV === "production") return Response.json({ code: "not_found" }, { status: 404 });
  const { jobId } = await context.params;
  if (!JOB_ID_PATTERN.test(jobId)) return Response.json({ code: "invalid_request" }, { status: 400 });
  try {
    return imageJobProxyResponse(await forwardImageJobRequest({
      method: "GET",
      path: `/vnext/world-lab/images/jobs/${encodeURIComponent(jobId)}`,
      request,
    }));
  } catch (error) {
    return imageJobProxyError(error);
  }
}
