import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import {
  SHARED_CONTRACT_INDEX,
  SHARED_CONTRACT_PACKAGE_JSON,
  SHARED_CONTRACT_SOURCE,
  SHARED_CONTRACT_SPECIFIER,
  isWithin,
} from "./policy";
import { resolveSourceFile } from "./source-layout";

export interface SharedContractPackageIssue {
  file: string;
  line: number;
  match: string;
}

export interface SharedContractPackageInspection {
  sourcePath: string;
  issues: readonly SharedContractPackageIssue[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectStringTargets(value: unknown, targets: string[]) {
  if (typeof value === "string") {
    targets.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectStringTargets(item, targets);
    }
    return;
  }
  if (isRecord(value)) {
    for (const child of Object.values(value)) {
      collectStringTargets(child, targets);
    }
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wildcardTargetCanExposeVnext(target: string) {
  if (!target.includes("*")) {
    return false;
  }
  const expression = new RegExp(
    `^${target.split("*").map(escapeRegExp).join("(.+)")}$`,
  );
  return [
    "./dist/vnext-experience.js",
    "./dist/vnext-experience.d.ts",
  ].some((candidate) => expression.test(candidate));
}

interface StaticModuleDependency {
  canonicalVnext?: true;
  specifier?: string;
  unsafe?: true;
}

function literalStaticDependency(value: string): StaticModuleDependency | undefined {
  if (value === SHARED_CONTRACT_SPECIFIER) {
    return { canonicalVnext: true };
  }
  return value.startsWith(".") ? { specifier: value } : undefined;
}

function staticModuleDependency(node: ts.Node): StaticModuleDependency | undefined {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier !== undefined &&
    ts.isStringLiteralLike(node.moduleSpecifier)
  ) {
    return literalStaticDependency(node.moduleSpecifier.text);
  }
  if (ts.isImportTypeNode(node)) {
    if (
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    ) {
      return literalStaticDependency(node.argument.literal.text);
    }
    return { unsafe: true };
  }
  if (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword
  ) {
    const argument = node.arguments[0];
    if (argument !== undefined && ts.isStringLiteralLike(argument)) {
      return literalStaticDependency(argument.text);
    }
    return { unsafe: true };
  }
  return undefined;
}

type StaticModuleResult = "clean" | "reaches-vnext" | "unsafe";

function inspectStaticModule(
  file: string,
  packageRoot: string,
  realPackageRoot: string,
  realVnextSource: string,
  visited: Set<string>,
): StaticModuleResult {
  let realFile: string;
  try {
    realFile = realpathSync(file);
  } catch {
    return "unsafe";
  }
  if (realFile === realVnextSource) {
    return "reaches-vnext";
  }
  if (visited.has(realFile)) {
    return "clean";
  }
  if (!isWithin(file, packageRoot) || !isWithin(realFile, realPackageRoot)) {
    return "unsafe";
  }
  visited.add(realFile);
  let source: string;
  try {
    source = readFileSync(realFile, "utf8");
  } catch {
    return "unsafe";
  }
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  let result: StaticModuleResult = "clean";
  const visit = (node: ts.Node): void => {
    if (result !== "clean") {
      return;
    }
    const dependency = staticModuleDependency(node);
    if (dependency?.canonicalVnext === true) {
      result = "reaches-vnext";
      return;
    }
    if (dependency?.unsafe === true) {
      result = "unsafe";
      return;
    }
    if (dependency?.specifier !== undefined) {
      const resolved = resolveSourceFile(
        path.resolve(path.dirname(file), dependency.specifier),
      );
      if (resolved === undefined) {
        result = "unsafe";
        return;
      }
      const childResult = inspectStaticModule(
          resolved,
          packageRoot,
          realPackageRoot,
          realVnextSource,
          visited,
        );
      if (childResult !== "clean") {
        result = childResult;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return result;
}

function inspectRootBarrel(repoRoot: string): SharedContractPackageIssue[] {
  const indexPath = path.join(repoRoot, SHARED_CONTRACT_INDEX);
  const packageRoot = path.dirname(indexPath);
  const vnextSource = path.join(repoRoot, SHARED_CONTRACT_SOURCE);
  if (!existsSync(indexPath) || !existsSync(vnextSource)) {
    return [];
  }
  const realPackageRoot = realpathSync(packageRoot);
  const realVnextSource = realpathSync(vnextSource);
  const source = readFileSync(indexPath, "utf8");
  const sourceFile = ts.createSourceFile(
    indexPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const issues: SharedContractPackageIssue[] = [];
  const visit = (node: ts.Node): void => {
    const dependency = staticModuleDependency(node);
    if (dependency?.canonicalVnext === true) {
      issues.push({
        file: indexPath,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
        match: "root barrel re-exports vnext-experience",
      });
      return;
    }
    if (dependency?.unsafe === true) {
      issues.push({
        file: indexPath,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
        match: "unsafe root barrel export graph",
      });
      return;
    }
    if (dependency?.specifier !== undefined) {
      const resolved = resolveSourceFile(
        path.resolve(path.dirname(indexPath), dependency.specifier),
      );
      const result =
        resolved === undefined
          ? "unsafe"
          : inspectStaticModule(
          resolved,
          packageRoot,
          realPackageRoot,
          realVnextSource,
          new Set(),
        );
      if (result !== "clean") {
        issues.push({
          file: indexPath,
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
          match:
            result === "reaches-vnext"
              ? "root barrel re-exports vnext-experience"
              : "unsafe root barrel export graph",
        });
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return issues;
}

export function inspectSharedContractPackage(
  repoRoot: string,
): SharedContractPackageInspection {
  const packageJsonPath = path.join(repoRoot, SHARED_CONTRACT_PACKAGE_JSON);
  const sourcePath = path.join(repoRoot, SHARED_CONTRACT_SOURCE);
  const packageIssue = (match: string): SharedContractPackageIssue => ({
    file: packageJsonPath,
    line: 1,
    match,
  });
  let packageJson: unknown;
  try {
    packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  } catch {
    return {
      sourcePath,
      issues: [packageIssue("invalid shared-contract package metadata")],
    };
  }
  if (!isRecord(packageJson) || !isRecord(packageJson.exports)) {
    return {
      sourcePath,
      issues: [packageIssue("invalid vnext-experience package export")],
    };
  }

  const issues: SharedContractPackageIssue[] = [];
  const exportsMap = packageJson.exports;
  for (const [exportKey, exportValue] of Object.entries(exportsMap)) {
    if (
      (exportKey.startsWith("./vnext") || exportKey.startsWith("./*")) &&
      exportKey !== "./vnext-experience"
    ) {
      issues.push(packageIssue("unsupported vNext package export"));
    }
    if (exportKey !== "./vnext-experience") {
      const targets: string[] = [];
      collectStringTargets(exportValue, targets);
      if (
        exportKey.includes("*") &&
        targets.some(wildcardTargetCanExposeVnext)
      ) {
        issues.push(packageIssue("wildcard package export exposes vnext-experience"));
      }
      if (
        targets.some((target) =>
          /(?:^|\/)vnext-experience\.(?:js|d\.ts)$/.test(target),
        )
      ) {
        issues.push(packageIssue("vNext artifact exposed outside ./vnext-experience"));
      }
    }
  }

  const vnextExport = exportsMap["./vnext-experience"];
  const vnextExportKeys = isRecord(vnextExport) ? Object.keys(vnextExport).sort() : [];
  if (
    !isRecord(vnextExport) ||
    vnextExportKeys.length !== 2 ||
    vnextExportKeys[0] !== "default" ||
    vnextExportKeys[1] !== "types" ||
    vnextExport.types !== "./dist/vnext-experience.d.ts" ||
    vnextExport.default !== "./dist/vnext-experience.js"
  ) {
    issues.push(packageIssue("invalid vnext-experience package export"));
  }

  issues.push(...inspectRootBarrel(repoRoot));
  return { sourcePath, issues };
}
