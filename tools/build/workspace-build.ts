import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertSourceAdjacentArtifactsUnchanged,
  assertWorkspaceCompilerBoundaries,
  captureSourceAdjacentArtifacts,
} from "./workspace-build-boundary.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function runPnpm(args: string[]) {
  const result = spawnSync("pnpm", args, {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`pnpm ${args.join(" ")} failed with status ${String(result.status)}`);
  }
}

const sourceAdjacentBefore = captureSourceAdjacentArtifacts(repoRoot);
let buildFailure: unknown = null;

try {
  runPnpm(["--filter", "backend", "prisma:generate"]);
  runPnpm(["-r", "build"]);
  assertWorkspaceCompilerBoundaries(repoRoot);
} catch (error) {
  buildFailure = error;
}

let boundaryFailure: unknown = null;
try {
  assertSourceAdjacentArtifactsUnchanged(repoRoot, sourceAdjacentBefore);
} catch (error) {
  boundaryFailure = error;
}

if (buildFailure && boundaryFailure) {
  throw new AggregateError(
    [buildFailure, boundaryFailure],
    "workspace build and source-adjacent artifact boundary both failed",
  );
}
if (buildFailure) {
  throw buildFailure;
}
if (boundaryFailure) {
  throw boundaryFailure;
}

console.log("workspace build: pass");
