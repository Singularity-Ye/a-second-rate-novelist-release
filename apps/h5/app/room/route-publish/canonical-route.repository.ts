import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  EDITOR_SCENE_IDS,
  deserializeEditorDraft,
  serializeEditorDraft,
  type EditorDraft,
  type EditorSceneId,
} from "../geometry-test/route-editor.model";
import {
  isFormalRouteSnapshot,
  type CanonicalRouteRevision,
  type FormalRouteSnapshot,
} from "./contract";
import { buildFormalRouteSnapshot } from "./route-draft.adapter";
import { validateFormalRouteSnapshot } from "./route-parity-validator";

function digest(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

async function canonicalRoot(): Promise<string> {
  const configured = process.env.ERLIU_CANONICAL_ROUTE_ROOT;
  if (configured) return path.resolve(configured);
  const candidates = [
    path.join(process.cwd(), "app", "room", "route-publish"),
    path.join(process.cwd(), "apps", "h5", "app", "room", "route-publish"),
  ];
  for (const candidate of candidates) {
    try {
      await access(path.join(candidate, "contract.ts"));
      return candidate;
    } catch {
      // Try the other supported workspace launch directory.
    }
  }
  throw new Error("canonical_route_publish_root_not_found");
}

function assertSceneId(value: string): asserts value is EditorSceneId {
  if (!EDITOR_SCENE_IDS.includes(value as EditorSceneId)) {
    throw new Error(`unsupported_route_scene:${value}`);
  }
}

async function atomicWrite(filePath: string, payload: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, payload, "utf8");
  await rename(temporaryPath, filePath);
}

async function canonicalPaths(sceneId: EditorSceneId) {
  const root = await canonicalRoot();
  return {
    source: path.join(root, "sources", `${sceneId}.route-editor.json`),
    snapshot: path.join(root, "published", `${sceneId}.formal-route-snapshot.v1.json`),
  };
}

function comparableSnapshot(snapshot: FormalRouteSnapshot): string {
  const { publishedAt: _publishedAt, ...content } = snapshot;
  return JSON.stringify(content);
}

function snapshotPlaybackOptions(snapshot: FormalRouteSnapshot): {
  speedMultiplier: number;
  pixelsPerSecondAtOneX: number;
} | null {
  const routes = Object.values(snapshot.routes);
  const firstPlayback = routes[0]?.playback;
  if (!firstPlayback) return null;
  if (!Number.isFinite(firstPlayback.speedMultiplier) || firstPlayback.speedMultiplier <= 0) return null;
  if (!Number.isFinite(firstPlayback.pixelsPerSecondAtOneX) || firstPlayback.pixelsPerSecondAtOneX <= 0) return null;
  if (routes.some((route) => (
    route.playback.speedMultiplier !== firstPlayback.speedMultiplier
    || route.playback.pixelsPerSecondAtOneX !== firstPlayback.pixelsPerSecondAtOneX
  ))) return null;
  return {
    speedMultiplier: firstPlayback.speedMultiplier,
    pixelsPerSecondAtOneX: firstPlayback.pixelsPerSecondAtOneX,
  };
}

function snapshotMatchesDraft(draft: EditorDraft, snapshot: FormalRouteSnapshot): boolean {
  const playback = snapshotPlaybackOptions(snapshot);
  if (!playback) return false;
  const rebuilt = buildFormalRouteSnapshot(draft, {
    publishedAt: snapshot.publishedAt,
    ...playback,
  });
  return comparableSnapshot(rebuilt) === comparableSnapshot(snapshot);
}

function sourceMatchesSnapshot(sourceRaw: string, snapshot: FormalRouteSnapshot): boolean {
  try {
    const sourceDraft = deserializeEditorDraft(JSON.parse(sourceRaw));
    return sourceDraft ? snapshotMatchesDraft(sourceDraft, snapshot) : false;
  } catch {
    return false;
  }
}

/**
 * Explicitly promote one editor draft. Only the canonical latest source and
 * the snapshot consumed by 3000 are written; no hidden v1/v2 history is made.
 */
export async function publishCanonicalRouteSnapshot(
  draft: EditorDraft,
  snapshot: FormalRouteSnapshot,
): Promise<CanonicalRouteRevision> {
  assertSceneId(snapshot.scene.sceneId);
  if (draft.sceneId !== snapshot.scene.sceneId || snapshot.source.sceneId !== snapshot.scene.sceneId) {
    throw new Error("route_publish_scene_mismatch");
  }
  const blockingIssues = validateFormalRouteSnapshot(snapshot).filter((issue) => issue.severity === "error");
  if (blockingIssues.length > 0) throw new Error("route_publish_snapshot_invalid");
  if (!snapshotMatchesDraft(draft, snapshot)) {
    throw new Error("route_publish_source_snapshot_mismatch");
  }

  const paths = await canonicalPaths(snapshot.scene.sceneId);
  const sourcePayload = `${JSON.stringify(serializeEditorDraft(draft), null, 2)}\n`;
  const snapshotPayload = `${JSON.stringify(snapshot, null, 2)}\n`;
  const sourceHash = digest(sourcePayload);
  const contentHash = digest(snapshotPayload);
  const revisionId = `${snapshot.publishedAt.replace(/[-:.TZ]/g, "")}-${contentHash.slice(0, 12)}`;

  // Source first, runtime snapshot second: if the second write fails, 3000
  // keeps its last valid route rather than observing an unvalidated partial.
  await atomicWrite(paths.source, sourcePayload);
  await atomicWrite(paths.snapshot, snapshotPayload);
  return {
    sceneId: snapshot.scene.sceneId,
    revisionId,
    contentHash,
    sourceHash,
    publishedAt: snapshot.publishedAt,
  };
}

export async function readCanonicalRouteSnapshot(sceneIdValue: string): Promise<{
  snapshot: FormalRouteSnapshot;
  revision: CanonicalRouteRevision;
} | null> {
  assertSceneId(sceneIdValue);
  const paths = await canonicalPaths(sceneIdValue);
  try {
    const [snapshotRaw, sourceRaw] = await Promise.all([
      readFile(paths.snapshot, "utf8"),
      readFile(paths.source, "utf8"),
    ]);
    const snapshot: unknown = JSON.parse(snapshotRaw);
    if (!isFormalRouteSnapshot(snapshot) || snapshot.scene.sceneId !== sceneIdValue) return null;
    const issues = validateFormalRouteSnapshot(snapshot);
    if (issues.some((issue) => issue.severity === "error")) return null;
    if (!sourceMatchesSnapshot(sourceRaw, snapshot)) return null;
    const contentHash = digest(snapshotRaw);
    return {
      snapshot,
      revision: {
        sceneId: sceneIdValue,
        revisionId: `${snapshot.publishedAt.replace(/[-:.TZ]/g, "")}-${contentHash.slice(0, 12)}`,
        contentHash,
        sourceHash: digest(sourceRaw),
        publishedAt: snapshot.publishedAt,
      },
    };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
    if (code === "ENOENT") return null;
    throw error;
  }
}
