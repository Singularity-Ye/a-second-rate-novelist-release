import { stat, readFile } from "node:fs/promises";
import { parseLocalDistillationProgress } from "../../../../../lib/local-distillation-progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PROGRESS_FILE_BYTES = 512_000;

function noStoreJson(body: object, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function GET() {
  if (process.env.NODE_ENV === "production") return noStoreJson({ code: "not_found" }, 404);
  const progressFile = String(process.env.VNEXT_LOCAL_DISTILLATION_PROGRESS_FILE ?? "").trim();
  if (!progressFile) return noStoreJson({ code: "not_configured" }, 404);

  try {
    const file = await stat(progressFile);
    if (!file.isFile() || file.size <= 0 || file.size > MAX_PROGRESS_FILE_BYTES) {
      return noStoreJson({ code: "progress_file_invalid" }, 502);
    }
    let document: unknown;
    try {
      document = JSON.parse(await readFile(progressFile, "utf8"));
    } catch (error) {
      if (error instanceof SyntaxError) return noStoreJson({ code: "progress_payload_invalid" }, 502);
      throw error;
    }
    const progress = parseLocalDistillationProgress(document);
    if (!progress) return noStoreJson({ code: "progress_payload_invalid" }, 502);
    return noStoreJson({ progress });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    return noStoreJson({ code: code === "ENOENT" ? "progress_file_missing" : "progress_file_unavailable" }, 503);
  }
}
