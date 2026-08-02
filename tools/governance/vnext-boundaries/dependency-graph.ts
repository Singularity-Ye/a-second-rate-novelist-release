import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { scanBrowserControls } from "./browser-controls";
import { scanCssDependencyGraph } from "./css-dependencies";
import { scanExecutionAndCommonJs } from "./execution-loaders";
import { inspectSharedContractPackage } from "./package-exports";
import {
  BACKEND_ROOT,
  EXPERIENCE_API,
  externalDependencyViolation,
  forbiddenDependencyMatch,
  H5_APP_ROOT,
  isAllowedLocalEdge,
  normalizeSlashes,
  SHARED_CONTRACT_SPECIFIER,
  SHARED_CONTRACTS_ROOT,
  SOURCE_EXTENSION_SET,
} from "./policy";
import {
  collectDirectoryEntries,
  collectSharedContractEntries,
  createBoundaryContext,
  describeBoundary,
  discoverCanonicalVnextRouteRoots,
  isAuditableProductionSource,
  realpathStaysInBoundary,
  resolveSourceFile,
  scriptKind,
} from "./source-layout";
import {
  createStaticStringResolver,
  memberAccessParts,
} from "./static-strings";
import type { VnextBoundaryRule, VnextBoundaryViolation } from "./types";

interface GraphItem {
  lexicalPath: string;
  browserContext: boolean;
}

const LEGACY_PRISMA_DELEGATES = new Set([
  "appStateSnapshot",
  "storyIntakeSession",
  "storyProposal",
  "storyWorkspace",
  "runtimeTask",
  "chapter",
  "chapterRevision",
]);
const PRISMA_RAW_QUERY_MEMBERS = new Set([
  "$executeRaw",
  "$executeRawUnsafe",
  "$queryRaw",
  "$queryRawUnsafe",
]);
const AUDITED_CREATIVE_TASK_FENCE_FILE =
  "apps/backend/src/vnext/infrastructure/prisma-creative-task-mutation-fence.ts";
const AUDITED_CREATIVE_TASK_FENCE_SQL =
  'LOCK TABLE "vnext_creative_tasks" IN SHARE ROW EXCLUSIVE MODE';

function literalText(node: ts.Node | undefined) {
  return node !== undefined && ts.isStringLiteralLike(node) ? node.text : undefined;
}

function collectNodes(sourceFile: ts.SourceFile) {
  const nodes: ts.Node[] = [];
  const collect = (node: ts.Node): void => {
    nodes.push(node);
    ts.forEachChild(node, collect);
  };
  collect(sourceFile);
  return nodes;
}

function bindingElementPropertyName(
  element: ts.BindingElement,
  staticStrings: ReturnType<typeof createStaticStringResolver>,
) {
  const propertyName = element.propertyName ?? element.name;
  if (ts.isIdentifier(propertyName) || ts.isStringLiteralLike(propertyName)) {
    return propertyName.text;
  }
  if (ts.isComputedPropertyName(propertyName)) {
    return staticStrings.evaluate(propertyName.expression);
  }
  return undefined;
}

function hasCanonicalPrismaImport(sourceFile: ts.SourceFile) {
  return sourceFile.statements.some((statement) => {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteralLike(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "@prisma/client" ||
      statement.importClause?.namedBindings === undefined ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      return false;
    }
    return statement.importClause.namedBindings.elements.some(
      (element) =>
        element.name.text === "Prisma" &&
        (element.propertyName?.text ?? element.name.text) === "Prisma",
    );
  });
}

function isAuditedCreativeTaskMutationFence(
  node: ts.PropertyAccessExpression | ts.ElementAccessExpression,
  lexicalPath: string,
  root: string,
  sourceFile: ts.SourceFile,
  staticStrings: ReturnType<typeof createStaticStringResolver>,
) {
  const rawAccess = memberAccessParts(node, staticStrings);
  if (
    normalizeSlashes(path.relative(root, lexicalPath)) !==
      AUDITED_CREATIVE_TASK_FENCE_FILE ||
    !hasCanonicalPrismaImport(sourceFile) ||
    !ts.isPropertyAccessExpression(node) ||
    rawAccess?.name !== "$executeRaw" ||
    !ts.isIdentifier(rawAccess.object) ||
    rawAccess.object.text !== "transaction" ||
    !ts.isCallExpression(node.parent) ||
    node.parent.expression !== node ||
    node.parent.arguments.length !== 1
  ) {
    return false;
  }
  const argument = node.parent.arguments[0];
  if (
    argument === undefined ||
    !ts.isTaggedTemplateExpression(argument) ||
    !ts.isNoSubstitutionTemplateLiteral(argument.template) ||
    argument.template.text !== AUDITED_CREATIVE_TASK_FENCE_SQL
  ) {
    return false;
  }
  const tag = memberAccessParts(argument.tag, staticStrings);
  return (
    tag?.name === "sql" &&
    ts.isIdentifier(tag.object) &&
    tag.object.text === "Prisma"
  );
}

export function findVnextBoundaryViolations(repoRoot: string): VnextBoundaryViolation[] {
  const root = path.resolve(repoRoot);
  const h5Roots = discoverCanonicalVnextRouteRoots(path.join(root, H5_APP_ROOT));
  const context = createBoundaryContext(root, h5Roots);
  const sharedPackage = inspectSharedContractPackage(root);
  const directorySymlinks: string[] = [];
  const entries = [
    ...collectDirectoryEntries(path.join(root, BACKEND_ROOT), directorySymlinks),
    ...h5Roots.flatMap((h5Root) => collectDirectoryEntries(h5Root, directorySymlinks)),
    ...(existsSync(path.join(root, EXPERIENCE_API)) ? [path.join(root, EXPERIENCE_API)] : []),
    ...collectSharedContractEntries(path.join(root, SHARED_CONTRACTS_ROOT)),
  ];

  const violations = new Map<string, VnextBoundaryViolation>();
  const record = (file: string, line: number, rule: VnextBoundaryRule, match: string) => {
    const relativeFile = normalizeSlashes(path.relative(root, file));
    violations.set(`${relativeFile}:${line}:${rule}:${match}`, {
      file: relativeFile,
      line,
      rule,
      match,
    });
  };

  for (const issue of sharedPackage.issues) {
    record(issue.file, issue.line, "forbidden-import", issue.match);
  }
  if (!existsSync(sharedPackage.sourcePath)) {
    record(
      sharedPackage.sourcePath,
      1,
      "forbidden-import",
      "unresolved vnext-experience source mapping",
    );
  }
  if (h5Roots.length > 1) {
    for (const h5Root of h5Roots) {
      record(h5Root, 1, "forbidden-import", "duplicate canonical /vnext route root");
    }
  }
  if (entries.length === 0 && directorySymlinks.length === 0) {
    record(root, 1, "production-scan-empty", "no vNext production files");
  }
  for (const symlink of directorySymlinks) {
    record(symlink, 1, "forbidden-import", "symlink escapes vNext boundary");
  }

  const queue: GraphItem[] = entries.map((lexicalPath) => {
    const kind = describeBoundary(context, lexicalPath)?.kind;
    return {
      lexicalPath,
      browserContext:
        kind === "h5" || kind === "experience-api" || kind === "shared-contract",
    };
  });
  const visited = new Set<string>();

  while (queue.length > 0) {
    const item = queue.shift()!;
    const lexicalPath = path.resolve(item.lexicalPath);
    const descriptor = describeBoundary(context, lexicalPath);
    if (descriptor === null) {
      record(lexicalPath, 1, "forbidden-import", "local dependency escapes vNext boundary");
      continue;
    }
    const kind = descriptor.kind;

    let realFile: string;
    try {
      realFile = realpathSync(lexicalPath);
    } catch {
      record(lexicalPath, 1, "forbidden-import", "unresolved local dependency");
      continue;
    }
    if (!realpathStaysInBoundary(context, descriptor, realFile)) {
      record(lexicalPath, 1, "forbidden-import", "symlink escapes vNext boundary");
      continue;
    }
    if (!isAuditableProductionSource(lexicalPath) || !isAuditableProductionSource(realFile)) {
      record(lexicalPath, 1, "forbidden-import", "non-production local dependency");
      continue;
    }

    const visitKey = `${realFile}:${item.browserContext ? "browser" : "server"}`;
    if (visited.has(visitKey)) {
      continue;
    }
    visited.add(visitKey);

    const source = readFileSync(realFile, "utf8");
    const sourceFile = ts.createSourceFile(
      lexicalPath,
      source,
      ts.ScriptTarget.Latest,
      true,
      scriptKind(lexicalPath),
    );
    const lineFor = (node: ts.Node) =>
      sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    const addViolation = (node: ts.Node, rule: VnextBoundaryRule, match: string) => {
      record(lexicalPath, lineFor(node), rule, match);
    };
    const parseDiagnostics = (
      sourceFile as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }
    ).parseDiagnostics;
    if (parseDiagnostics !== undefined && parseDiagnostics.length > 0) {
      record(lexicalPath, 1, "forbidden-import", "unparseable production dependency");
    }

    const nodes = collectNodes(sourceFile);
    const staticStrings = createStaticStringResolver(sourceFile);
    const packageMappingInvalid = sharedPackage.issues.some((issue) =>
      issue.match.startsWith("invalid vnext-experience"),
    );

    const enqueueDependency = (line: number, specifier: string) => {
      const forbidden = forbiddenDependencyMatch(specifier, lexicalPath, root);
      if (forbidden !== undefined) {
        record(lexicalPath, line, "forbidden-import", forbidden);
        return;
      }

      const normalizedPackage = path.posix.normalize(specifier.replaceAll("\\", "/"));
      let localBase: string | undefined;
      if (specifier.startsWith("#")) {
        record(lexicalPath, line, "forbidden-import", "unresolved local dependency");
        return;
      }
      if (
        normalizedPackage === "@backend/vnext" ||
        normalizedPackage.startsWith("@backend/vnext/")
      ) {
        localBase = path.join(
          root,
          "apps/backend/src",
          normalizedPackage.slice("@backend/".length),
        );
      } else if (normalizedPackage.startsWith("@backend/")) {
        record(lexicalPath, line, "forbidden-import", "local alias outside vNext boundary");
        return;
      } else if (specifier === SHARED_CONTRACT_SPECIFIER) {
        if (packageMappingInvalid) {
          record(
            lexicalPath,
            line,
            "forbidden-import",
            "invalid vnext-experience package export",
          );
          return;
        }
        localBase = sharedPackage.sourcePath;
      } else if (specifier === "@erliu/shared-contracts") {
        record(
          lexicalPath,
          line,
          "forbidden-import",
          "@erliu/shared-contracts root barrel",
        );
        return;
      } else if (
        normalizedPackage === "@erliu/shared-contracts" ||
        normalizedPackage.startsWith("@erliu/shared-contracts/")
      ) {
        record(
          lexicalPath,
          line,
          "forbidden-import",
          "unsupported shared-contract subpath",
        );
        return;
      } else if (specifier.startsWith(".") || path.isAbsolute(specifier)) {
        localBase = path.resolve(path.dirname(lexicalPath), specifier);
        const targetRelative = normalizeSlashes(path.relative(root, localBase));
        if (targetRelative.startsWith(`${SHARED_CONTRACTS_ROOT}/`) && kind !== "shared-contract") {
          record(
            lexicalPath,
            line,
            "forbidden-import",
            "@erliu/shared-contracts root barrel",
          );
          return;
        }
      } else if (specifier.startsWith("@/") || specifier.startsWith("~/")) {
        record(lexicalPath, line, "forbidden-import", "unresolved local dependency");
        return;
      } else {
        const externalViolation = externalDependencyViolation(kind, specifier);
        if (externalViolation !== undefined) {
          record(lexicalPath, line, "forbidden-import", externalViolation);
        }
        return;
      }

      const dependencyExtension = path.extname(localBase).toLowerCase();
      if (dependencyExtension === ".json") {
        record(lexicalPath, line, "forbidden-import", "JSON dependency is forbidden");
        return;
      }
      if (dependencyExtension === ".css") {
        if (kind !== "h5" || !localBase.endsWith(".module.css")) {
          record(lexicalPath, line, "forbidden-import", "unsupported local asset");
          return;
        }
        scanCssDependencyGraph({
          entryPath: localBase,
          entryReferrer: { file: lexicalPath, line },
          lexicalRoot: descriptor.lexicalRoot,
          record,
        });
        return;
      }
      if (dependencyExtension !== "" && !SOURCE_EXTENSION_SET.has(dependencyExtension)) {
        record(lexicalPath, line, "forbidden-import", "unsupported local asset");
        return;
      }

      const resolved = resolveSourceFile(localBase);
      if (resolved === undefined) {
        record(lexicalPath, line, "forbidden-import", "unresolved local dependency");
        return;
      }
      if (!isAuditableProductionSource(resolved)) {
        record(lexicalPath, line, "forbidden-import", "non-production local dependency");
        return;
      }
      const targetDescriptor = describeBoundary(context, resolved);
      if (targetDescriptor === null) {
        record(lexicalPath, line, "forbidden-import", "local dependency escapes vNext boundary");
        return;
      }
      if (!isAllowedLocalEdge(kind, targetDescriptor.kind)) {
        record(
          lexicalPath,
          line,
          "forbidden-import",
          `forbidden local edge ${kind} -> ${targetDescriptor.kind}`,
        );
        return;
      }
      let targetRealPath: string;
      try {
        targetRealPath = realpathSync(resolved);
      } catch {
        record(lexicalPath, line, "forbidden-import", "unresolved local dependency");
        return;
      }
      if (!realpathStaysInBoundary(context, targetDescriptor, targetRealPath)) {
        record(lexicalPath, line, "forbidden-import", "symlink escapes vNext boundary");
        return;
      }
      queue.push({
        lexicalPath: resolved,
        browserContext:
          item.browserContext ||
          targetDescriptor.kind === "h5" ||
          targetDescriptor.kind === "experience-api" ||
          targetDescriptor.kind === "shared-contract",
      });
    };

    const checkDependency = (
      node: ts.Node,
      specifierNode: ts.Node | undefined,
      nonLiteralMatch: string,
    ) => {
      const specifier = literalText(specifierNode);
      if (specifier === undefined) {
        addViolation(node, "forbidden-import", nonLiteralMatch);
        return;
      }
      enqueueDependency(lineFor(node), specifier);
    };

    for (const node of nodes) {
      if (ts.isImportDeclaration(node)) {
        checkDependency(node, node.moduleSpecifier, "non-literal import");
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
        checkDependency(node, node.moduleSpecifier, "non-literal export");
      } else if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference)
      ) {
        checkDependency(node, node.moduleReference.expression, "non-literal require()");
      } else if (ts.isImportTypeNode(node)) {
        checkDependency(
          node,
          ts.isLiteralTypeNode(node.argument) ? node.argument.literal : node.argument,
          "non-literal import type",
        );
      } else if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword
      ) {
        checkDependency(node, node.arguments[0], "non-literal import()");
      }
    }

    for (const reference of sourceFile.referencedFiles) {
      const line = sourceFile.getLineAndCharacterOfPosition(reference.pos).line + 1;
      enqueueDependency(line, reference.fileName);
    }
    for (const reference of sourceFile.typeReferenceDirectives) {
      const line = sourceFile.getLineAndCharacterOfPosition(reference.pos).line + 1;
      enqueueDependency(line, reference.fileName);
    }
    for (const dependency of sourceFile.amdDependencies) {
      enqueueDependency(1, dependency.path);
    }

    scanExecutionAndCommonJs(nodes, sourceFile, checkDependency, addViolation);

    for (const node of nodes) {
      if (ts.isIdentifier(node) && node.text === "AppStateSnapshot") {
        addViolation(node, "forbidden-state-type", "AppStateSnapshot");
      }
      if (
        kind === "backend" &&
        (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
      ) {
        const member = memberAccessParts(node, staticStrings)?.name;
        if (member !== undefined && LEGACY_PRISMA_DELEGATES.has(member)) {
          addViolation(
            node,
            "forbidden-state-type",
            `legacy Prisma delegate ${member}`,
          );
        }
        if (
          member !== undefined &&
          PRISMA_RAW_QUERY_MEMBERS.has(member) &&
          !isAuditedCreativeTaskMutationFence(
            node,
            lexicalPath,
            root,
            sourceFile,
            staticStrings,
          )
        ) {
          addViolation(node, "forbidden-state-type", `Prisma raw query ${member}`);
        }
      }
      if (
        kind === "backend" &&
        ts.isBindingElement(node) &&
        ts.isObjectBindingPattern(node.parent)
      ) {
        const member = bindingElementPropertyName(node, staticStrings);
        if (member !== undefined && LEGACY_PRISMA_DELEGATES.has(member)) {
          addViolation(
            node,
            "forbidden-state-type",
            `legacy Prisma delegate ${member}`,
          );
        }
        if (member !== undefined && PRISMA_RAW_QUERY_MEMBERS.has(member)) {
          addViolation(node, "forbidden-state-type", `Prisma raw query ${member}`);
        }
      }
    }
    if (item.browserContext || kind === "shared-contract") {
      scanBrowserControls(
        sourceFile,
        (node, match) =>
          addViolation(node, "browser-server-control", match),
        { sharedContract: kind === "shared-contract" },
      );
    }
  }

  return [...violations.values()];
}
