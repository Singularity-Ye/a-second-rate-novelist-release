import { builtinModules } from "node:module";
import path from "node:path";
import type { BoundaryKind } from "./types";

export const BACKEND_ROOT = "apps/backend/src/vnext";
export const H5_APP_ROOT = "apps/h5/app";
export const EXPERIENCE_API = "apps/h5/app/lib/experience-api.ts";
export const SHARED_CONTRACTS_ROOT = "packages/shared-contracts";
export const SHARED_CONTRACT_PACKAGE_JSON = `${SHARED_CONTRACTS_ROOT}/package.json`;
export const SHARED_CONTRACT_INDEX = `${SHARED_CONTRACTS_ROOT}/index.ts`;
export const SHARED_CONTRACT_SOURCE = `${SHARED_CONTRACTS_ROOT}/vnext-experience.ts`;
export const SHARED_CONTRACT_SPECIFIER = "@erliu/shared-contracts/vnext-experience";

export const SOURCE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
] as const;

export const SOURCE_EXTENSION_SET = new Set<string>(SOURCE_EXTENSIONS);
export const ROUTE_GROUP_SEGMENT = /^\([^/]+\)$/;
export const MODULE_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;

const NODE_BUILTINS = new Set(
  builtinModules.map((specifier) => specifier.replace(/^node:/, "")),
);

const BACKEND_EXTERNALS = new Set(["@nestjs/common", "@prisma/client"]);
const H5_EXTERNALS = new Set([
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "next",
  "next/link",
  "next/navigation",
]);
const NO_EXTERNALS = new Set<string>();

const EXTERNALS_BY_KIND: Readonly<Record<BoundaryKind, ReadonlySet<string>>> = {
  backend: BACKEND_EXTERNALS,
  h5: H5_EXTERNALS,
  "experience-api": H5_EXTERNALS,
  "shared-contract": NO_EXTERNALS,
};

const KNOWN_EXTERNALS = new Set([...BACKEND_EXTERNALS, ...H5_EXTERNALS]);

const ALLOWED_LOCAL_EDGES: Readonly<Record<BoundaryKind, ReadonlySet<BoundaryKind>>> = {
  backend: new Set(["backend", "shared-contract"]),
  h5: new Set(["h5", "experience-api", "shared-contract"]),
  "experience-api": new Set(["h5", "experience-api", "shared-contract"]),
  "shared-contract": new Set(["shared-contract"]),
};

const FORBIDDEN_DEPENDENCY_PARTS = [
  "common/store",
  "common/repositories",
  "story-intake",
  "runtime-tasks",
  "chapter-runtime",
  "opencode-runtime",
  "rules-first",
  "fallback",
] as const;

export function normalizeSlashes(value: string) {
  return value.split(path.sep).join("/");
}

export function isWithin(candidate: string, parent: string) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function isAllowedLocalEdge(source: BoundaryKind, target: BoundaryKind) {
  return ALLOWED_LOCAL_EDGES[source].has(target);
}

export function forbiddenDependencyMatch(
  specifier: string,
  sourceFile: string,
  repoRoot: string,
) {
  const normalized =
    specifier.startsWith(".") || path.isAbsolute(specifier)
      ? normalizeSlashes(
          path.relative(repoRoot, path.resolve(path.dirname(sourceFile), specifier)),
        )
      : path.posix.normalize(specifier.replaceAll("\\", "/"));
  return FORBIDDEN_DEPENDENCY_PARTS.find((part) => normalized.includes(part));
}

export function externalDependencyViolation(
  kind: BoundaryKind,
  specifier: string,
): string | undefined {
  if (MODULE_SCHEME.test(specifier)) {
    if (!specifier.startsWith("node:")) {
      return "forbidden module scheme";
    }
    const builtin = specifier.slice("node:".length);
    if (!NODE_BUILTINS.has(builtin)) {
      return "unknown node builtin";
    }
    return kind === "backend" ? undefined : `external dependency not allowed for ${kind}`;
  }
  if (EXTERNALS_BY_KIND[kind].has(specifier)) {
    return undefined;
  }
  return KNOWN_EXTERNALS.has(specifier)
    ? `external dependency not allowed for ${kind}`
    : "unknown external dependency";
}
