import { normalizeEditorDraft } from "../../../room/geometry-test/route-editor.model";
import {
  publishCanonicalRouteSnapshot,
  readCanonicalRouteSnapshot,
} from "../../../room/route-publish/canonical-route.repository";
import { publishEditorDraft as buildFormalRouteSnapshot } from "../../../room/route-publish/route-draft.adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 8_000_000;

export async function GET(request: Request) {
  const sceneId = new URL(request.url).searchParams.get("sceneId");
  if (!sceneId) return Response.json({ code: "missing_scene_id" }, { status: 400 });

  try {
    const published = await readCanonicalRouteSnapshot(sceneId);
    if (!published) return Response.json({ code: "snapshot_not_found", sceneId }, { status: 404 });
    return Response.json({ ok: true, ...published }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ code: "snapshot_read_failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production" && process.env.ERLIU_ALLOW_ROUTE_PUBLISH !== "1") {
    return Response.json({ code: "route_publish_disabled" }, { status: 404 });
  }

  const body = Buffer.from(await request.arrayBuffer());
  if (body.byteLength === 0 || body.byteLength > MAX_REQUEST_BYTES) {
    return Response.json({ code: "invalid_request" }, { status: 400 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString("utf8"));
  } catch {
    return Response.json({ code: "invalid_json" }, { status: 400 });
  }

  if (!parsed || typeof parsed !== "object") {
    return Response.json({ code: "invalid_payload" }, { status: 400 });
  }
  const payload = parsed as { draft?: unknown; speedMultiplier?: unknown };
  const draft = normalizeEditorDraft(payload.draft);
  if (!draft) {
    return Response.json({ code: "invalid_editor_draft" }, { status: 422 });
  }

  const result = buildFormalRouteSnapshot(draft, {
    publishedAt: new Date().toISOString(),
    ...(typeof payload.speedMultiplier === "number" ? { speedMultiplier: payload.speedMultiplier } : {}),
  });
  if (!result.ok || !result.snapshot) {
    return Response.json({ code: "route_publish_validation_failed", issues: result.issues }, { status: 422 });
  }

  try {
    const revision = await publishCanonicalRouteSnapshot(draft, result.snapshot);
    return Response.json(
      { ok: true, revision, snapshot: result.snapshot, issues: result.issues },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "route_publish_source_snapshot_mismatch") {
      return Response.json({
        code: "route_publish_source_snapshot_mismatch",
        issues: [{
          severity: "error",
          code: "source-snapshot-mismatch",
          path: "source",
          message: "编辑器源稿与正式快照无法重建为同一份路线；发布已阻止，请重新从当前草稿发布。",
        }],
      }, { status: 422 });
    }
    return Response.json({ code: "route_publish_write_failed" }, { status: 500 });
  }
}
