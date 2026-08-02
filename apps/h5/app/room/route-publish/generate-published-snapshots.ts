import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  deserializeEditorDraft,
  type EditorSceneId,
} from "../geometry-test/route-editor.model";
import { publishEditorDraft } from "./route-draft.adapter";

const sceneIds: readonly EditorSceneId[] = [
  "study",
  "bedroom",
  "dining-kitchen",
  "entrance",
  "terrace-greenery",
  "attic",
];

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.join(here, "sources");
const outputDir = path.join(here, "published");
const publishedAt = process.env.ROUTE_PUBLISH_TIMESTAMP ?? "2026-07-27T00:00:00.000Z";

async function publishScene(sceneId: EditorSceneId): Promise<void> {
  const sourcePath = path.join(sourceDir, `${sceneId}.route-editor.json`);
  const outputPath = path.join(outputDir, `${sceneId}.formal-route-snapshot.v1.json`);
  const source = JSON.parse(await readFile(sourcePath, "utf8")) as unknown;
  const draft = deserializeEditorDraft(source);
  if (!draft) throw new Error(`${sceneId}: source is not a supported route-editor export`);

  const result = publishEditorDraft(draft, { publishedAt });
  const errors = result.issues.filter((issue) => issue.severity === "error");
  if (!result.ok || errors.length > 0) {
    const detail = errors.map((issue) => `${issue.code} @ ${issue.path}: ${issue.message}`).join("\n");
    throw new Error(`${sceneId}: publish validation failed\n${detail}`);
  }

  await writeFile(outputPath, `${JSON.stringify(result.snapshot, null, 2)}\n`, "utf8");
  const warnings = result.issues.filter((issue) => issue.severity === "warning").length;
  console.log(`${sceneId}: ${Object.keys(result.snapshot.routes).length} routes, ${result.snapshot.points.length} points${warnings ? `, ${warnings} warnings` : ""}`);
}

await mkdir(outputDir, { recursive: true });
for (const sceneId of sceneIds) await publishScene(sceneId);
