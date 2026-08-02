import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const workspaceRoot = process.cwd();
const appRoot = path.join(workspaceRoot, "app");
const bannedTermsSourcePath = path.join(appRoot, "lib", "frontstage-copy.ts");

const bannedTerms = await readBannedTerms(bannedTermsSourcePath);
const targetFiles = await collectTargetFiles(appRoot);
const findings = [];

for (const filePath of targetFiles) {
  const source = await fs.readFile(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  visit(sourceFile);

  function visit(node) {
    if (ts.isJsxText(node)) {
      recordMatches(node.getStart(sourceFile), node.getFullText(sourceFile));
    }

    if (ts.isStringLiteralLike(node) && shouldAuditStringLiteral(node, sourceFile)) {
      recordMatches(node.getStart(sourceFile), node.text);
    }

    if (ts.isTemplateExpression(node) && shouldAuditTemplateExpression(node, sourceFile)) {
      recordMatches(node.head.getStart(sourceFile), node.head.text);
      for (const span of node.templateSpans) {
        recordMatches(span.literal.getStart(sourceFile), span.literal.text);
      }
    }

    ts.forEachChild(node, visit);
  }

  function recordMatches(start, rawValue) {
    const value = rawValue.replace(/\s+/g, " ").trim();
    if (!value) {
      return;
    }

    for (const term of bannedTerms) {
      if (value.includes(term)) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(start);
        findings.push({
          filePath: path.relative(workspaceRoot, filePath),
          line: line + 1,
          term,
          value,
        });
      }
    }
  }
}

if (findings.length > 0) {
  console.error("Frontstage copy audit found banned terms:\n");
  for (const finding of findings) {
    console.error(`${finding.filePath}:${finding.line} -> ${finding.term}`);
    console.error(`  ${finding.value}`);
  }
  process.exit(1);
}

console.log(`Frontstage copy audit passed for ${targetFiles.length} files.`);

async function readBannedTerms(filePath) {
  const source = await fs.readFile(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === "FRONTSTAGE_BANNED_TERMS" && declaration.initializer) {
        const initializer = ts.isAsExpression(declaration.initializer)
          ? declaration.initializer.expression
          : declaration.initializer;

        if (!ts.isArrayLiteralExpression(initializer)) {
          continue;
        }

        return initializer.elements
          .filter((element) => ts.isStringLiteralLike(element))
          .map((element) => element.text);
      }
    }
  }

  throw new Error("Unable to read FRONTSTAGE_BANNED_TERMS.");
}

async function collectTargetFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "demo-flow" || entry.name === "dev" || entry.name === "lib") {
        continue;
      }
      files.push(...(await collectTargetFiles(entryPath)));
      continue;
    }

    if (!entry.name.endsWith(".tsx")) {
      continue;
    }
    if (entry.name.includes(".test.") || entry.name.includes(".spec.")) {
      continue;
    }

    files.push(entryPath);
  }

  return files.sort();
}

function isVisibleStringLiteral(node, sourceFile) {
  const parent = node.parent;

  if (
    ts.isArrayLiteralExpression(parent) ||
    ts.isBinaryExpression(parent) ||
    ts.isCallExpression(parent) ||
    ts.isImportDeclaration(parent) ||
    ts.isExportDeclaration(parent) ||
    ts.isExternalModuleReference(parent) ||
    ts.isLiteralTypeNode(parent) ||
    ts.isPropertyAssignment(parent)
  ) {
    return false;
  }

  return isVisibleNode(node, sourceFile);
}

function shouldAuditStringLiteral(node, sourceFile) {
  return (
    isVisibleStringLiteral(node, sourceFile) ||
    isModuleCopyLiteral(node, sourceFile) ||
    isFunctionReturnLiteral(node) ||
    isFrontstageErrorLiteral(node)
  );
}

function shouldAuditTemplateExpression(node, sourceFile) {
  return (
    isVisibleNode(node, sourceFile) ||
    isModuleCopyLiteral(node, sourceFile) ||
    isFunctionReturnLiteral(node) ||
    isFrontstageErrorLiteral(node)
  );
}

function isVisibleNode(node, sourceFile) {
  let current = node.parent;

  while (current) {
    if (ts.isJsxAttribute(current)) {
      const attributeName = current.name.getText(sourceFile);
      return !["className", "data-testid", "href", "id", "name", "type", "role"].includes(attributeName);
    }

    if (ts.isJsxExpression(current)) {
      if (ts.isJsxAttribute(current.parent)) {
        const attributeName = current.parent.name.getText(sourceFile);
        return !["className", "data-testid", "href", "id", "name", "type", "role"].includes(attributeName);
      }
      return true;
    }

    if (ts.isJsxElement(current) || ts.isJsxFragment(current) || ts.isJsxSelfClosingElement(current)) {
      return true;
    }

    current = current.parent;
  }

  return false;
}

function isModuleCopyLiteral(node, sourceFile) {
  let current = node.parent;

  while (current) {
    if (ts.isVariableStatement(current)) {
      return current.parent === sourceFile;
    }

    if (
      ts.isImportDeclaration(current) ||
      ts.isExportDeclaration(current) ||
      ts.isJsxElement(current) ||
      ts.isJsxFragment(current) ||
      ts.isJsxSelfClosingElement(current)
    ) {
      return false;
    }

    current = current.parent;
  }

  return false;
}

function isFunctionReturnLiteral(node) {
  let current = node.parent;

  while (current) {
    if (
      ts.isJsxElement(current) ||
      ts.isJsxFragment(current) ||
      ts.isJsxSelfClosingElement(current) ||
      ts.isJsxExpression(current) ||
      ts.isJsxAttribute(current)
    ) {
      return false;
    }

    if (ts.isReturnStatement(current)) {
      return true;
    }

    if (
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current)
    ) {
      return false;
    }

    current = current.parent;
  }

  return false;
}

function isFrontstageErrorLiteral(node) {
  let current = node.parent;

  while (current) {
    if (ts.isCallExpression(current)) {
      const callee = current.expression.getText();
      return callee === "setError" || callee === "toFrontstageErrorCopy";
    }

    if (
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current) ||
      ts.isVariableStatement(current)
    ) {
      return false;
    }

    current = current.parent;
  }

  return false;
}
