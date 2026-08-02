import ts from "typescript";

export interface LexicalBinding {
  initializer: ts.Expression | undefined;
  declaration: ts.Identifier | undefined;
}

interface LexicalScope {
  parent?: LexicalScope;
  functionBoundary: boolean;
  bindings: Map<string, LexicalBinding>;
}

export interface StaticStringResolver {
  evaluate(node: ts.Node | undefined): string | undefined;
  bindingForIdentifier(identifier: ts.Identifier): LexicalBinding | undefined;
  bindingForDeclaration(identifier: ts.Identifier): LexicalBinding | undefined;
}

function isFunctionScopeNode(node: ts.Node) {
  return (
    ts.isArrowFunction(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  );
}

function createsLexicalScope(node: ts.Node) {
  return (
    isFunctionScopeNode(node) ||
    ts.isBlock(node) ||
    ts.isCaseBlock(node) ||
    ts.isCatchClause(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node)
  );
}

function bindingIdentifiers(name: ts.BindingName): ts.Identifier[] {
  if (ts.isIdentifier(name)) {
    return [name];
  }
  return name.elements.flatMap((element) =>
    ts.isOmittedExpression(element) ? [] : bindingIdentifiers(element.name),
  );
}

export function createStaticStringResolver(
  sourceFile: ts.SourceFile,
): StaticStringResolver {
  const rootScope: LexicalScope = {
    functionBoundary: true,
    bindings: new Map(),
  };
  const scopeByNode = new WeakMap<ts.Node, LexicalScope>();
  const bindingByDeclaration = new WeakMap<ts.Identifier, LexicalBinding>();

  const assignScopes = (node: ts.Node, inheritedScope: LexicalScope): void => {
    const scope =
      node !== sourceFile && createsLexicalScope(node)
        ? {
            parent: inheritedScope,
            functionBoundary: isFunctionScopeNode(node),
            bindings: new Map<string, LexicalBinding>(),
          }
        : inheritedScope;
    scopeByNode.set(node, scope);
    ts.forEachChild(node, (child) => assignScopes(child, scope));
  };
  assignScopes(sourceFile, rootScope);

  const nearestFunctionScope = (scope: LexicalScope) => {
    let current = scope;
    while (!current.functionBoundary && current.parent !== undefined) {
      current = current.parent;
    }
    return current;
  };
  const register = (
    scope: LexicalScope,
    identifier: ts.Identifier,
    initializer?: ts.Expression,
  ) => {
    const existing = scope.bindings.get(identifier.text);
    if (existing !== undefined) {
      existing.initializer = undefined;
      existing.declaration = undefined;
      bindingByDeclaration.set(identifier, existing);
      return;
    }
    const binding: LexicalBinding = { initializer, declaration: identifier };
    scope.bindings.set(identifier.text, binding);
    bindingByDeclaration.set(identifier, binding);
  };

  const registerDeclarations = (node: ts.Node): void => {
    const nodeScope = scopeByNode.get(node) ?? rootScope;
    if (ts.isVariableDeclaration(node)) {
      if (ts.isVariableDeclarationList(node.parent)) {
        const isConst = (node.parent.flags & ts.NodeFlags.Const) !== 0;
        const isBlockScoped = (node.parent.flags & ts.NodeFlags.BlockScoped) !== 0;
        const targetScope = isBlockScoped ? nodeScope : nearestFunctionScope(nodeScope);
        if (ts.isIdentifier(node.name)) {
          register(targetScope, node.name, isConst ? node.initializer : undefined);
        } else {
          for (const identifier of bindingIdentifiers(node.name)) {
            register(targetScope, identifier);
          }
        }
      } else if (ts.isCatchClause(node.parent)) {
        for (const identifier of bindingIdentifiers(node.name)) {
          register(nodeScope, identifier);
        }
      }
    } else if (ts.isParameter(node)) {
      for (const identifier of bindingIdentifiers(node.name)) {
        register(nodeScope, identifier);
      }
    } else if (ts.isImportClause(node) && node.name !== undefined) {
      register(nodeScope, node.name);
    } else if (ts.isImportSpecifier(node) || ts.isNamespaceImport(node)) {
      register(nodeScope, node.name);
    } else if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
      node.name !== undefined
    ) {
      register(scopeByNode.get(node.parent) ?? rootScope, node.name);
    } else if (
      (ts.isFunctionExpression(node) || ts.isClassExpression(node)) &&
      node.name !== undefined
    ) {
      register(nodeScope, node.name);
    }
    ts.forEachChild(node, registerDeclarations);
  };
  registerDeclarations(sourceFile);

  const bindingAt = (node: ts.Node, name: string) => {
    let scope = scopeByNode.get(node);
    while (scope !== undefined) {
      const binding = scope.bindings.get(name);
      if (binding !== undefined) {
        return binding;
      }
      scope = scope.parent;
    }
    return undefined;
  };
  const evaluate = (
    node: ts.Node | undefined,
    depth = 0,
    resolving = new Set<LexicalBinding>(),
  ): string | undefined => {
    if (node === undefined || depth > 12) {
      return undefined;
    }
    let expression = node as ts.Expression;
    while (ts.isParenthesizedExpression(expression)) {
      expression = expression.expression;
    }
    if (ts.isStringLiteralLike(expression)) {
      return expression.text.length <= 512 ? expression.text : undefined;
    }
    if (ts.isIdentifier(expression)) {
      const binding = bindingAt(expression, expression.text);
      if (
        binding === undefined ||
        binding.initializer === undefined ||
        resolving.has(binding)
      ) {
        return undefined;
      }
      return evaluate(binding.initializer, depth + 1, new Set([...resolving, binding]));
    }
    if (
      ts.isBinaryExpression(expression) &&
      expression.operatorToken.kind === ts.SyntaxKind.PlusToken
    ) {
      const left = evaluate(expression.left, depth + 1, resolving);
      const right = evaluate(expression.right, depth + 1, resolving);
      if (left === undefined || right === undefined || left.length + right.length > 512) {
        return undefined;
      }
      return `${left}${right}`;
    }
    return undefined;
  };

  return {
    evaluate,
    bindingForIdentifier(identifier) {
      return bindingAt(identifier, identifier.text);
    },
    bindingForDeclaration(identifier) {
      return bindingByDeclaration.get(identifier);
    },
  };
}

export function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function literalElementName(expression: ts.ElementAccessExpression) {
  let argument = expression.argumentExpression;
  while (argument !== undefined && ts.isParenthesizedExpression(argument)) {
    argument = argument.expression;
  }
  return argument !== undefined && ts.isStringLiteralLike(argument)
    ? argument.text
    : undefined;
}

export function memberAccessParts(
  expression: ts.Expression,
  staticStrings?: StaticStringResolver,
) {
  const unwrapped = unwrapExpression(expression);
  if (ts.isPropertyAccessExpression(unwrapped)) {
    return { object: unwrapExpression(unwrapped.expression), name: unwrapped.name.text };
  }
  if (ts.isElementAccessExpression(unwrapped)) {
    return {
      object: unwrapExpression(unwrapped.expression),
      name:
        staticStrings === undefined
          ? literalElementName(unwrapped)
          : staticStrings.evaluate(unwrapped.argumentExpression),
    };
  }
  return undefined;
}
