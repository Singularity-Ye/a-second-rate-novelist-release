import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import {
  BACKEND_ROOT,
  EXPERIENCE_API,
  isWithin,
  normalizeSlashes,
  ROUTE_GROUP_SEGMENT,
  SHARED_CONTRACTS_ROOT,
  SOURCE_EXTENSIONS,
  SOURCE_EXTENSION_SET,
} from "./policy";
import type { BoundaryContext, BoundaryDescriptor } from "./types";

export function isAuditableProductionSource(file: string) {
  const basename = path.basename(file);
  const segments = normalizeSlashes(path.resolve(file)).split("/");
  return (
    SOURCE_EXTENSION_SET.has(path.extname(file)) &&
    !/\.d\.(?:ts|mts|cts)$/.test(basename) &&
    !segments.includes("__tests__") &&
    !/\.(?:spec|test)\.[cm]?[jt]sx?$/.test(basename)
  );
}

export function collectDirectoryEntries(
  directory: string,
  directorySymlinks: string[],
): string[] {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.name === "__tests__") {
      return [];
    }
    if (entry.isDirectory()) {
      return collectDirectoryEntries(entryPath, directorySymlinks);
    }
    if (entry.isSymbolicLink()) {
      try {
        if (statSync(entryPath).isDirectory()) {
          directorySymlinks.push(entryPath);
          return [];
        }
      } catch {
        directorySymlinks.push(entryPath);
        return [];
      }
    }
    return isAuditableProductionSource(entryPath) ? [entryPath] : [];
  });
}

export function discoverCanonicalVnextRouteRoots(appRoot: string) {
  if (!existsSync(appRoot)) {
    return [] as string[];
  }
  const roots: string[] = [];
  const visitedDirectories = new Set<string>();
  const visitGroupLevel = (directory: string): void => {
    let realDirectory: string;
    try {
      realDirectory = realpathSync(directory);
    } catch {
      return;
    }
    if (visitedDirectories.has(realDirectory)) {
      return;
    }
    visitedDirectories.add(realDirectory);
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "__tests__") {
        continue;
      }
      const entryPath = path.join(directory, entry.name);
      let isDirectory = entry.isDirectory();
      if (entry.isSymbolicLink()) {
        try {
          isDirectory = statSync(entryPath).isDirectory();
        } catch {
          isDirectory = false;
        }
      }
      if (!isDirectory) {
        continue;
      }
      if (entry.name === "vnext") {
        roots.push(entryPath);
      } else if (ROUTE_GROUP_SEGMENT.test(entry.name)) {
        visitGroupLevel(entryPath);
      }
    }
  };
  visitGroupLevel(appRoot);
  return roots;
}

export function collectSharedContractEntries(sharedRoot: string) {
  if (!existsSync(sharedRoot)) {
    return [] as string[];
  }
  return readdirSync(sharedRoot, { withFileTypes: true })
    .filter(
      (entry) =>
        (entry.isFile() || entry.isSymbolicLink()) &&
        /^vnext-/.test(entry.name) &&
        isAuditableProductionSource(entry.name),
    )
    .map((entry) => path.join(sharedRoot, entry.name));
}

export function createBoundaryContext(
  repoRoot: string,
  h5Roots: readonly string[],
): BoundaryContext {
  const root = path.resolve(repoRoot);
  return {
    repoRoot: root,
    realRepoRoot: realpathSync(root),
    backendRoot: path.join(root, BACKEND_ROOT),
    h5Roots: h5Roots.map((h5Root) => path.resolve(h5Root)),
    experienceApi: path.join(root, EXPERIENCE_API),
    sharedContractRoot: path.join(root, SHARED_CONTRACTS_ROOT),
  };
}

export function describeBoundary(
  context: BoundaryContext,
  lexicalPath: string,
): BoundaryDescriptor | null {
  const candidate = path.resolve(lexicalPath);
  if (isWithin(candidate, context.backendRoot)) {
    return { kind: "backend", lexicalRoot: context.backendRoot };
  }
  const h5Root = [...context.h5Roots]
    .sort((left, right) => right.length - left.length)
    .find((root) => isWithin(candidate, root));
  if (h5Root !== undefined) {
    return { kind: "h5", lexicalRoot: h5Root };
  }
  if (candidate === context.experienceApi) {
    return { kind: "experience-api", lexicalRoot: context.experienceApi };
  }
  if (
    path.dirname(candidate) === context.sharedContractRoot &&
    /^vnext-/.test(path.basename(candidate)) &&
    isAuditableProductionSource(candidate)
  ) {
    return { kind: "shared-contract", lexicalRoot: context.sharedContractRoot };
  }
  return null;
}

export function realpathStaysInBoundary(
  context: BoundaryContext,
  descriptor: BoundaryDescriptor,
  realFile: string,
) {
  const expectedRealRoot = path.join(
    context.realRepoRoot,
    path.relative(context.repoRoot, descriptor.lexicalRoot),
  );
  return (
    isWithin(realFile, context.realRepoRoot) &&
    isWithin(realFile, expectedRealRoot) &&
    (descriptor.kind !== "shared-contract" ||
      (path.dirname(realFile) === expectedRealRoot && /^vnext-/.test(path.basename(realFile))))
  );
}

export function scriptKind(file: string) {
  switch (path.extname(file)) {
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".js":
    case ".mjs":
    case ".cjs":
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
}

function sourceCandidates(basePath: string) {
  const candidates: string[] = [];
  const extension = path.extname(basePath);
  try {
    if (existsSync(basePath) && statSync(basePath).isFile()) {
      candidates.push(basePath);
    }
  } catch {
    return candidates;
  }
  if (extension === "") {
    for (const sourceExtension of SOURCE_EXTENSIONS) {
      candidates.push(`${basePath}${sourceExtension}`);
    }
  } else {
    const stem = basePath.slice(0, -extension.length);
    const replacementExtensions =
      extension === ".js"
        ? [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx"]
        : extension === ".mjs"
          ? [".mts", ".mjs"]
          : extension === ".cjs"
            ? [".cts", ".cjs"]
            : extension === ".jsx"
              ? [".tsx", ".jsx"]
              : [];
    for (const sourceExtension of replacementExtensions) {
      candidates.push(`${stem}${sourceExtension}`);
    }
  }
  try {
    if (existsSync(basePath) && statSync(basePath).isDirectory()) {
      for (const sourceExtension of SOURCE_EXTENSIONS) {
        candidates.push(path.join(basePath, `index${sourceExtension}`));
      }
    }
  } catch {
    return [...new Set(candidates)];
  }
  return [...new Set(candidates)];
}

export function resolveSourceFile(basePath: string) {
  return sourceCandidates(basePath).find((candidate) => {
    try {
      return existsSync(candidate) && statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
}
