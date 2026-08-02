import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

export const allowedSourceAdjacentArtifacts = ["index.d.ts", "index.js", "index.js.map"];

export type SourceAdjacentArtifactSnapshot = Map<string, Buffer>;

function relative(repoRoot: string, filePath: string) {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function diagnosticHost(repoRoot: string): ts.FormatDiagnosticsHost {
  return {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => repoRoot,
    getNewLine: () => "\n",
  };
}

export function captureSourceAdjacentArtifacts(repoRoot: string): SourceAdjacentArtifactSnapshot {
  const sharedContractsRoot = path.join(repoRoot, "packages/shared-contracts");
  const artifactNames = readdirSync(sharedContractsRoot, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        (entry.name.endsWith(".d.ts") ||
          entry.name.endsWith(".js") ||
          entry.name.endsWith(".js.map")),
    )
    .map((entry) => entry.name)
    .sort();

  assert.deepEqual(
    artifactNames,
    [...allowedSourceAdjacentArtifacts].sort(),
    "shared-contracts source root contains unexpected compiler output",
  );

  return new Map(
    artifactNames.map(
      (artifactName) => [
        artifactName,
        readFileSync(path.join(sharedContractsRoot, artifactName)),
      ] as const,
    ),
  );
}

export function assertSourceAdjacentArtifactsUnchanged(
  repoRoot: string,
  before: SourceAdjacentArtifactSnapshot,
) {
  const after = captureSourceAdjacentArtifacts(repoRoot);
  assert.deepEqual([...after.keys()], [...before.keys()]);
  for (const [artifactName, contents] of before) {
    assert.deepEqual(
      after.get(artifactName),
      contents,
      `packages/shared-contracts/${artifactName} changed during build`,
    );
  }
}

function assertPackageCompilerBoundary(repoRoot: string, configRelativePath: string) {
  const configPath = path.join(repoRoot, configRelativePath);
  const packageRoot = path.dirname(configPath);
  const sharedContractsRoot = path.join(repoRoot, "packages/shared-contracts");
  const workspaceDependencyRoots = [
    sharedContractsRoot,
    path.join(repoRoot, "packages/telemetry"),
  ];
  const host = diagnosticHost(repoRoot);
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) {
    assert.fail(ts.formatDiagnostics([config.error], host));
  }

  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    path.dirname(configPath),
    undefined,
    configPath,
  );
  assert.equal(
    parsed.errors.length,
    0,
    ts.formatDiagnosticsWithColorAndContext(parsed.errors, host),
  );

  const emittedFiles: string[] = [];
  const compilerHost = ts.createCompilerHost(parsed.options);
  compilerHost.writeFile = (fileName) => emittedFiles.push(path.resolve(fileName));

  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    host: compilerHost,
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  const emitResult = program.emit();
  const allDiagnostics = [...diagnostics, ...emitResult.diagnostics];

  const crossPackageSources = program
    .getSourceFiles()
    .map((sourceFile) => path.resolve(sourceFile.fileName))
    .filter((fileName) =>
      workspaceDependencyRoots.some(
        (dependencyRoot) =>
          dependencyRoot !== packageRoot &&
          fileName.startsWith(`${dependencyRoot}${path.sep}`) &&
          !fileName.startsWith(`${path.join(dependencyRoot, "dist")}${path.sep}`),
      ),
    )
    .map((fileName) => relative(repoRoot, fileName));

  assert.deepEqual(
    crossPackageSources,
    [],
    `${configRelativePath} compiles workspace dependency source instead of package exports`,
  );

  const outDir = parsed.options.outDir;
  assert.ok(outDir, `${configRelativePath} must define outDir`);
  const escapedOutputs = emittedFiles
    .filter((fileName) => !fileName.startsWith(`${path.resolve(outDir)}${path.sep}`))
    .map((fileName) => relative(repoRoot, fileName));
  assert.deepEqual(
    escapedOutputs,
    [],
    `${configRelativePath} emits outside its package outDir`,
  );

  assert.equal(
    allDiagnostics.length,
    0,
    ts.formatDiagnosticsWithColorAndContext(allDiagnostics, host),
  );
}

export function assertWorkspaceCompilerBoundaries(repoRoot: string) {
  assertPackageCompilerBoundary(repoRoot, "packages/telemetry/tsconfig.json");
  assertPackageCompilerBoundary(repoRoot, "apps/backend/tsconfig.json");

  const telemetryPackage = JSON.parse(
    readFileSync(path.join(repoRoot, "packages/telemetry/package.json"), "utf8"),
  ) as { dependencies?: Record<string, string> };
  assert.equal(
    telemetryPackage.dependencies?.["@erliu/shared-contracts"],
    "workspace:*",
    "telemetry must declare shared-contracts so recursive builds are topologically ordered",
  );
}
