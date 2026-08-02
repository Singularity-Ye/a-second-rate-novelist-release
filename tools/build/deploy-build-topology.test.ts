import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  assertSourceAdjacentArtifactsUnchanged,
  captureSourceAdjacentArtifacts,
} from "./workspace-build-boundary.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const snapshotEntries = [
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
  "render.yaml",
  "apps",
  "packages",
  "tools",
  "infra",
];
const buildOutputPaths = [
  "apps/backend/dist",
  "apps/h5/.next",
  "apps/h5/tsconfig.tsbuildinfo",
  "apps/ops/.next",
  "apps/ops/tsconfig.tsbuildinfo",
  "packages/shared-contracts/dist",
  "packages/telemetry/dist",
];

type DeployTarget = "backend" | "h5" | "ops";

function shouldCopy(sourcePath: string) {
  const segments = sourcePath.split(path.sep);
  if (segments.some((segment) => [".git", ".next", "dist", "node_modules"].includes(segment))) {
    return false;
  }
  return !sourcePath.endsWith(".tsbuildinfo");
}

function createSourceSnapshot() {
  const snapshotRoot = mkdtempSync(path.join(tmpdir(), "erliu-clean-build-"));
  for (const entry of snapshotEntries) {
    const source = path.join(repoRoot, entry);
    cpSync(source, path.join(snapshotRoot, entry), {
      recursive: true,
      filter: shouldCopy,
    });
  }
  return snapshotRoot;
}

function run(command: string, args: string[], cwd: string) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      CI: "1",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    maxBuffer: 32 * 1024 * 1024,
    timeout: 180_000,
  });

  if (result.status !== 0) {
    throw new Error(
      [
        `${command} ${args.join(" ")} failed with status ${String(result.status)}`,
        result.stdout,
        result.stderr,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
}

function resetBuildOutputs(snapshotRoot: string) {
  for (const outputPath of buildOutputPaths) {
    rmSync(path.join(snapshotRoot, outputPath), { force: true, recursive: true });
  }
}

function assertTargetOutputs(snapshotRoot: string, target: DeployTarget) {
  assert.ok(existsSync(path.join(snapshotRoot, "packages/shared-contracts/dist/index.d.ts")));
  assert.ok(existsSync(path.join(snapshotRoot, "packages/telemetry/dist/index.d.ts")));
  const targetOutput =
    target === "backend"
      ? "apps/backend/dist"
      : target === "h5"
        ? "apps/h5/.next/BUILD_ID"
        : "apps/ops/.next/BUILD_ID";
  assert.ok(existsSync(path.join(snapshotRoot, targetOutput)), `${target} output is missing`);
}

function readRenderTargetCommands(snapshotRoot: string) {
  const source = readFileSync(path.join(snapshotRoot, "render.yaml"), "utf8");
  const serviceBlocks = source.split(/\n(?=  - type:)/g);
  const entries: Array<{ serviceName: string; target: DeployTarget; command: string }> = [];

  for (const block of serviceBlocks) {
    const name = block.match(/^\s*name:\s*(\S+)/m)?.[1];
    const buildCommand = block.match(/^\s*buildCommand:\s*(.+)$/m)?.[1]?.trim();
    const target = name?.endsWith("-backend")
      ? "backend"
      : name?.endsWith("-h5")
        ? "h5"
        : name?.endsWith("-ops")
          ? "ops"
          : null;

    if (target && buildCommand && name) {
      const terminalCommand = buildCommand.split("&&").at(-1)?.trim();
      assert.ok(terminalCommand, `${name} has no terminal build command`);
      entries.push({
        serviceName: name,
        target,
        command: terminalCommand,
      });
    }
  }

  assert.equal(entries.length, 6, "shared-dev and staging must each define backend, h5, and ops");
  for (const target of ["backend", "h5", "ops"] as const) {
    assert.equal(entries.filter((entry) => entry.target === target).length, 2);
  }
  return entries;
}

function runShellWords(commandLine: string, cwd: string) {
  const words = commandLine.split(/\s+/g);
  const command = words.shift();
  assert.ok(command, "empty build command");
  run(command, words, cwd);
}

const snapshotRoot = createSourceSnapshot();
const failures: string[] = [];

function check(name: string, operation: () => void) {
  try {
    operation();
  } catch (error) {
    failures.push(`${name}:\n${error instanceof Error ? error.message : String(error)}`);
  }
}

try {
  assert.equal(existsSync(path.join(snapshotRoot, ".git")), false);
  resetBuildOutputs(snapshotRoot);
  run("pnpm", ["install", "--offline", "--frozen-lockfile", "--ignore-scripts"], snapshotRoot);

  check("boundary gate without git metadata", () => {
    resetBuildOutputs(snapshotRoot);
    run("pnpm", ["--filter", "backend", "prisma:generate"], snapshotRoot);
    run("pnpm", ["--filter", "backend...", "build"], snapshotRoot);
    run("pnpm", ["test:workspace-build-boundary"], snapshotRoot);
  });

  const renderEntries = readRenderTargetCommands(snapshotRoot);
  const renderCommands = new Map<DeployTarget, string>();
  for (const entry of renderEntries) {
    renderCommands.set(entry.target, entry.command);
  }
  for (const target of ["backend", "h5", "ops"] as const) {
    check(`Render ${target} clean build`, () => {
      resetBuildOutputs(snapshotRoot);
      const before = captureSourceAdjacentArtifacts(snapshotRoot);
      runShellWords(renderCommands.get(target)!, snapshotRoot);
      assertTargetOutputs(snapshotRoot, target);
      assertSourceAdjacentArtifactsUnchanged(snapshotRoot, before);
    });
  }

  check("root no-git clean build", () => {
    resetBuildOutputs(snapshotRoot);
    const before = captureSourceAdjacentArtifacts(snapshotRoot);
    run("pnpm", ["build"], snapshotRoot);
    for (const target of ["backend", "h5", "ops"] as const) {
      assertTargetOutputs(snapshotRoot, target);
    }
    assertSourceAdjacentArtifactsUnchanged(snapshotRoot, before);
  });

  check("deployment config uses topology-safe entrypoints", () => {
    for (const entry of renderEntries) {
      assert.equal(entry.command, `pnpm build:${entry.target}`, entry.serviceName);
    }

    const backendDockerfile = readFileSync(
      path.join(snapshotRoot, "infra/docker/backend.Dockerfile"),
      "utf8",
    );
    assert.match(backendDockerfile, /^RUN pnpm install --frozen-lockfile$/m);
    assert.match(backendDockerfile, /^RUN pnpm build:backend$/m);
    assert.doesNotMatch(
      backendDockerfile,
      /^RUN pnpm --filter (?:backend|@erliu\/telemetry|@erliu\/shared-contracts) build$/m,
    );

    const frontendDockerfile = readFileSync(
      path.join(snapshotRoot, "infra/docker/frontend.Dockerfile"),
      "utf8",
    );
    assert.match(frontendDockerfile, /^RUN pnpm install --frozen-lockfile$/m);
    assert.match(frontendDockerfile, /^RUN pnpm --filter "\$\{APP_NAME\}\.\.\." build$/m);
  });

  if (failures.length > 0) {
    throw new Error(failures.join("\n\n"));
  }

  console.log("deploy build topology: pass");
} finally {
  rmSync(snapshotRoot, { force: true, recursive: true });
}
