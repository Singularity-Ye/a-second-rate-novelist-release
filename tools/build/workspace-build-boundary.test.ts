import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertSourceAdjacentArtifactsUnchanged,
  assertWorkspaceCompilerBoundaries,
  captureSourceAdjacentArtifacts,
} from "./workspace-build-boundary.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceAdjacentBefore = captureSourceAdjacentArtifacts(repoRoot);

assertWorkspaceCompilerBoundaries(repoRoot);
assertSourceAdjacentArtifactsUnchanged(repoRoot, sourceAdjacentBefore);

console.log("workspace build boundary: pass");
