import ts from "typescript";
import {
  createStaticStringResolver,
  memberAccessParts,
  unwrapExpression,
  type LexicalBinding,
  type StaticStringResolver,
} from "./static-strings";

const STRUCTURED_CONTEXT_WORDS = new Set([
  "account",
  "body",
  "header",
  "headers",
  "params",
  "query",
  "storage",
]);
const STRUCTURED_KEY_METHODS = new Set([
  "append",
  "delete",
  "get",
  "getItem",
  "has",
  "removeItem",
  "set",
  "setItem",
]);

function semanticWords(value: string) {
  return value
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.toLowerCase());
}

function hasAdjacentWords(words: readonly string[], first: string, second: string) {
  return words.some((word, index) => word === first && words[index + 1] === second);
}

type SensitiveBrowserName = "credential" | "model" | "provider" | "trace";

function sensitiveBrowserName(value: string): SensitiveBrowserName | null {
  const words = semanticWords(value);
  if (
    words.includes("credential") ||
    words.includes("authorization") ||
    words.includes("bearer")
  ) {
    return "credential";
  }
  if (words.includes("trace")) {
    return "trace";
  }
  if (words.includes("provider")) {
    return "provider";
  }
  if (
    words.includes("model") &&
    !hasAdjacentWords(words, "view", "model") &&
    !(words.length === 2 && words[0] === "model" && words[1] === "training")
  ) {
    return "model";
  }
  return (
    hasAdjacentWords(words, "account", "token") ||
    hasAdjacentWords(words, "access", "token") ||
    hasAdjacentWords(words, "refresh", "token") ||
    hasAdjacentWords(words, "auth", "token") ||
    hasAdjacentWords(words, "session", "token") ||
    hasAdjacentWords(words, "bearer", "token") ||
    hasAdjacentWords(words, "client", "secret") ||
    hasAdjacentWords(words, "api", "key")
  )
    ? "credential"
    : null;
}

function isSensitiveBrowserName(value: string) {
  return sensitiveBrowserName(value) !== null;
}

function containsSemanticWord(value: string, expected: string) {
  return semanticWords(value).includes(expected);
}

function isSensitiveStructuredKey(value: string) {
  const words = semanticWords(value);
  return (
    isSensitiveBrowserName(value) ||
    (words.length === 1 && (words[0] === "token" || words[0] === "secret"))
  );
}

function propertyNameText(name: ts.PropertyName | ts.BindingName | undefined) {
  if (name === undefined) {
    return undefined;
  }
  return ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)
    ? name.text
    : undefined;
}

function bindingIdentifiers(name: ts.BindingName): ts.Identifier[] {
  if (ts.isIdentifier(name)) {
    return [name];
  }
  return name.elements.flatMap((element) =>
    ts.isOmittedExpression(element) ? [] : bindingIdentifiers(element.name),
  );
}

function hasStructuredContextName(value: string) {
  return semanticWords(value).some((word) => STRUCTURED_CONTEXT_WORDS.has(word));
}

function structuredObjectContextName(object: ts.ObjectLiteralExpression) {
  const parent = object.parent;
  if (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent)) {
    return propertyNameText(parent.name);
  }
  if (ts.isJsxExpression(parent) && ts.isJsxAttribute(parent.parent)) {
    return ts.isIdentifier(parent.parent.name)
      ? parent.parent.name.text
      : parent.parent.name.getText();
  }
  return undefined;
}

function declarationType(binding: LexicalBinding): ts.TypeNode | undefined {
  const declaration = binding.declaration?.parent;
  return declaration !== undefined &&
    (ts.isParameter(declaration) || ts.isVariableDeclaration(declaration))
    ? declaration.type
    : undefined;
}

function isPlainCollectionBinding(binding: LexicalBinding) {
  const type = declarationType(binding);
  if (type === undefined || !ts.isTypeReferenceNode(type)) {
    return false;
  }
  const name = type.typeName.getText();
  return (
    name === "Set" ||
    name === "ReadonlySet" ||
    name === "Map" ||
    name === "ReadonlyMap"
  );
}

function declarationContractName(node: ts.Node): string | undefined {
  if (
    (ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node)) &&
    node.name !== undefined
  ) {
    return node.name.text;
  }
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    return node.name.text;
  }
  return undefined;
}

function isServerResponseContractContext(node: ts.Node) {
  let current: ts.Node | undefined = node;
  while (current !== undefined && !ts.isSourceFile(current)) {
    const name = declarationContractName(current);
    if (name !== undefined && semanticWords(name).includes("response")) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function isDependencyLiteral(node: ts.StringLiteralLike) {
  const parent = node.parent;
  if (
    (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) &&
    parent.moduleSpecifier === node
  ) {
    return true;
  }
  if (ts.isExternalModuleReference(parent) && parent.expression === node) {
    return true;
  }
  if (ts.isLiteralTypeNode(parent) && ts.isImportTypeNode(parent.parent)) {
    return true;
  }
  return (
    ts.isCallExpression(parent) &&
    parent.expression.kind === ts.SyntaxKind.ImportKeyword &&
    parent.arguments[0] === node
  );
}

type StructureStatus = "structured" | "plain" | "unknown";

function structureStatus(
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
  staticStrings: StaticStringResolver,
  structuredBindings: ReadonlySet<LexicalBinding>,
  depth = 0,
  resolving = new Set<LexicalBinding>(),
): StructureStatus {
  if (depth > 12) {
    return "unknown";
  }
  const current = unwrapExpression(expression);
  if (hasStructuredContextName(current.getText(sourceFile))) {
    return "structured";
  }
  if (ts.isIdentifier(current)) {
    const binding = staticStrings.bindingForIdentifier(current);
    if (binding !== undefined && structuredBindings.has(binding)) {
      return "structured";
    }
    if (binding !== undefined && isPlainCollectionBinding(binding)) {
      return "plain";
    }
    if (binding === undefined || binding.initializer === undefined || resolving.has(binding)) {
      return "unknown";
    }
    return structureStatus(
      binding.initializer,
      sourceFile,
      staticStrings,
      structuredBindings,
      depth + 1,
      new Set([...resolving, binding]),
    );
  }
  if (ts.isObjectLiteralExpression(current)) {
    return "plain";
  }
  return ts.isCallExpression(current) || ts.isAwaitExpression(current) ? "unknown" : "plain";
}

export function scanBrowserControls(
  sourceFile: ts.SourceFile,
  addViolation: (node: ts.Node, match: string) => void,
  options: { readonly sharedContract: boolean } = { sharedContract: false },
) {
  const nodes: ts.Node[] = [];
  const collect = (node: ts.Node): void => {
    nodes.push(node);
    ts.forEachChild(node, collect);
  };
  collect(sourceFile);
  const staticStrings = createStaticStringResolver(sourceFile);
  const structuredBindings = new Set<LexicalBinding>();
  let bindingsChanged = true;
  while (bindingsChanged) {
    bindingsChanged = false;
    for (const node of nodes) {
      if (
        !ts.isVariableDeclaration(node) ||
        !ts.isObjectBindingPattern(node.name) ||
        node.initializer === undefined
      ) {
        continue;
      }
      const initializerStructured =
        structureStatus(
          node.initializer,
          sourceFile,
          staticStrings,
          structuredBindings,
        ) === "structured";
      for (const element of node.name.elements) {
        const sourceName = element.propertyName ?? element.name;
        const key = ts.isComputedPropertyName(sourceName)
          ? staticStrings.evaluate(sourceName.expression)
          : propertyNameText(sourceName);
        if (!initializerStructured && (key === undefined || !hasStructuredContextName(key))) {
          continue;
        }
        for (const identifier of bindingIdentifiers(element.name)) {
          const binding = staticStrings.bindingForDeclaration(identifier);
          if (binding !== undefined && !structuredBindings.has(binding)) {
            structuredBindings.add(binding);
            bindingsChanged = true;
          }
        }
      }
    }
  }

  for (const node of nodes) {
    if (ts.isIdentifier(node) && isSensitiveBrowserName(node.text)) {
      const sensitivity = sensitiveBrowserName(node.text);
      if (
        !(
          options.sharedContract &&
          sensitivity === "provider" &&
          isServerResponseContractContext(node)
        )
      ) {
        addViolation(node, node.text);
      }
    } else if (
      ts.isStringLiteralLike(node) &&
      !isDependencyLiteral(node) &&
      isSensitiveBrowserName(node.text)
    ) {
      const sensitivity = sensitiveBrowserName(node.text);
      if (
        !(
          options.sharedContract &&
          sensitivity === "provider" &&
          isServerResponseContractContext(node)
        )
      ) {
        addViolation(node, node.text);
      }
    }

    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const access = memberAccessParts(node, staticStrings);
      if (access !== undefined) {
        const status = structureStatus(
          access.object,
          sourceFile,
          staticStrings,
          structuredBindings,
        );
        if (status === "structured" && ts.isElementAccessExpression(node)) {
          if (access.name === undefined) {
            addViolation(node, "non-static structured key");
          } else if (isSensitiveStructuredKey(access.name)) {
            const objectText = access.object.getText(sourceFile);
            addViolation(
              node,
              containsSemanticWord(objectText, "account") ? "account[token]" : access.name,
            );
          }
        } else if (
          status === "structured" &&
          access.name !== undefined &&
          isSensitiveStructuredKey(access.name)
        ) {
          const objectText = access.object.getText(sourceFile);
          addViolation(
            node,
            containsSemanticWord(objectText, "account") ? "account.token" : access.name,
          );
        }
      }
    }

    if (ts.isCallExpression(node)) {
      const access = memberAccessParts(node.expression, staticStrings);
      if (access?.name !== undefined && STRUCTURED_KEY_METHODS.has(access.name)) {
        const status = structureStatus(
          access.object,
          sourceFile,
          staticStrings,
          structuredBindings,
        );
        const key = staticStrings.evaluate(node.arguments[0]);
        if (status === "structured") {
          if (key === undefined) {
            addViolation(node, "non-static structured key");
          } else if (isSensitiveStructuredKey(key)) {
            addViolation(node.arguments[0] ?? node, key);
          }
        } else if (status === "unknown" && key === undefined) {
          addViolation(node, "unknown structured sink");
        }
      }
    }

    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name)) {
      const initializer = node.initializer;
      if (
        initializer !== undefined &&
        structureStatus(
          initializer,
          sourceFile,
          staticStrings,
          structuredBindings,
        ) === "structured"
      ) {
        for (const element of node.name.elements) {
          const sourceName = element.propertyName ?? element.name;
          const key = ts.isComputedPropertyName(sourceName)
            ? staticStrings.evaluate(sourceName.expression)
            : propertyNameText(sourceName);
          if (key === undefined) {
            addViolation(element, "computed structured property");
          } else if (isSensitiveStructuredKey(key)) {
            addViolation(element, key);
          }
        }
      }
    }

    if (ts.isObjectLiteralExpression(node)) {
      const parentName = structuredObjectContextName(node);
      const structuredContext =
        parentName !== undefined && hasStructuredContextName(parentName);
      const accountContext =
        parentName !== undefined && containsSemanticWord(parentName, "account");
      for (const property of node.properties) {
        if (ts.isSpreadAssignment(property)) {
          if (structuredContext) {
            addViolation(property, "spread structured property");
          }
          continue;
        }
        if (ts.isComputedPropertyName(property.name)) {
          const key = staticStrings.evaluate(property.name.expression);
          if (key === undefined) {
            addViolation(property.name, "computed structured property");
          } else if (isSensitiveStructuredKey(key)) {
            addViolation(property.name, accountContext ? "account{token}" : key);
          }
          continue;
        }
        const key = propertyNameText(property.name);
        if (structuredContext && key !== undefined && isSensitiveStructuredKey(key)) {
          addViolation(property.name, accountContext ? "account{token}" : key);
        }
      }
    }
  }
}
