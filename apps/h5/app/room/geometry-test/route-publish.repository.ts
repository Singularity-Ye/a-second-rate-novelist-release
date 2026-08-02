/** @deprecated Historical revision store. Canonical publishing keeps one current source and snapshot. */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FormalRouteSnapshot } from "./route-publish.contract";
import { isFormalRouteSnapshot } from "./route-publish.contract";

export type PublishedRouteRevision = {
  sceneId: string;
  revisionId: string;
  contentHash: string;
  publishedAt: string;
};

function safeSceneId(sceneId: string): string {
  return sceneId.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function repositoryRoot(): string {
  return process.env.ERLIU_ROUTE_PUBLISH_DIR
    ? path.resolve(process.env.ERLIU_ROUTE_PUBLISH_DIR)
    : path.join(process.cwd(), ".route-publish");
}

function latestPath(sceneId: string): string {
  return path.join(repositoryRoot(), "latest", `${safeSceneId(sceneId)}.json`);
}

function revisionPath(sceneId: string, revisionId: string): string {
  return path.join(repositoryRoot(), "revisions", safeSceneId(sceneId), `${revisionId}.json`);
}

async function atomicWrite(filePath: string, payload: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(tempPath, payload, "utf8");
  await rename(tempPath, filePath);
}

export async function publishFormalRouteSnapshot(
  snapshot: FormalRouteSnapshot,
): Promise<PublishedRouteRevision> {
  const payload = JSON.stringify(snapshot, null, 2);
  const contentHash = createHash("sha256").update(payload, "utf8").digest("hex");
  const publishedAt = new Date().toISOString();
  const revisionId = `${publishedAt.replace(/[-:.TZ]/g, "")}-${contentHash.slice(0, 12)}`;
  const revision = { sceneId: snapshot.sceneId, revisionId, contentHash, publishedAt };

  await atomicWrite(revisionPath(snapshot.sceneId, revisionId), payload);
  await atomicWrite(latestPath(snapshot.sceneId), JSON.stringify({ ...revision, snapshot }, null, 2));
  return revision;
}

export async function readLatestFormalRouteSnapshot(
  sceneId: string,
): Promise<{ snapshot: FormalRouteSnapshot; revision: PublishedRouteRevision } | null> {
  try {
    const raw = await readFile(latestPath(sceneId), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const candidate = parsed as { snapshot?: unknown; sceneId?: unknown; revisionId?: unknown; contentHash?: unknown; publishedAt?: unknown };
    if (!isFormalRouteSnapshot(candidate.snapshot)) return null;
    if (candidate.sceneId !== sceneId || typeof candidate.revisionId !== "string" || typeof candidate.contentHash !== "string" || typeof candidate.publishedAt !== "string") return null;
    return {
      snapshot: candidate.snapshot,
      revision: {
        sceneId,
        revisionId: candidate.revisionId,
        contentHash: candidate.contentHash,
        publishedAt: candidate.publishedAt,
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
