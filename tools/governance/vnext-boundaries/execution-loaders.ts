import ts from "typescript";
import {
  createStaticStringResolver,
  memberAccessParts,
  unwrapExpression,
  type LexicalBinding,
  type StaticStringResolver,
} from "./static-strings";
import type { VnextBoundaryRule } from "./types";

type CheckDependency = (
  node: ts.Node,
  specifierNode: ts.Node | undefined,
  nonLiteralMatch: string,
) => void;

type AddViolation = (
  node: ts.Node,
  rule: VnextBoundaryRule,
  match: string,
) => void;

type ReflectMethod = "apply" | "construct" | "get" | "getOwnPropertyDescriptor";

function literalText(node: ts.Node | undefined) {
  return node !== undefined && ts.isStringLiteralLike(node) ? node.text : undefined;
}

function addDeclaredBinding(
  identifier: ts.Identifier,
  bindings: Set<LexicalBinding>,
  resolver: StaticStringResolver,
) {
  const binding = resolver.bindingForDeclaration(identifier);
  if (binding === undefined || bindings.has(binding)) {
    return false;
  }
  bindings.add(binding);
  return true;
}

function identifierBinding(
  expression: ts.Expression | undefined,
  resolver: StaticStringResolver,
) {
  const unwrapped = expression === undefined ? undefined : unwrapExpression(expression);
  return unwrapped !== undefined && ts.isIdentifier(unwrapped)
    ? resolver.bindingForIdentifier(unwrapped)
    : undefined;
}

function isUnboundGlobal(
  expression: ts.Expression | undefined,
  name: string,
  resolver: StaticStringResolver,
) {
  const unwrapped = expression === undefined ? undefined : unwrapExpression(expression);
  return (
    unwrapped !== undefined &&
    ts.isIdentifier(unwrapped) &&
    unwrapped.text === name &&
    resolver.bindingForIdentifier(unwrapped) === undefined
  );
}

function isBindingAlias(
  expression: ts.Expression | undefined,
  bindings: ReadonlySet<LexicalBinding>,
  resolver: StaticStringResolver,
) {
  const binding = identifierBinding(expression, resolver);
  return binding !== undefined && bindings.has(binding);
}

function isGlobalObject(
  expression: ts.Expression | undefined,
  aliases: ReadonlySet<LexicalBinding>,
  resolver: StaticStringResolver,
) {
  return (
    isUnboundGlobal(expression, "globalThis", resolver) ||
    isUnboundGlobal(expression, "window", resolver) ||
    isUnboundGlobal(expression, "self", resolver) ||
    isBindingAlias(expression, aliases, resolver)
  );
}

function isReflectObject(
  expression: ts.Expression | undefined,
  aliases: ReadonlySet<LexicalBinding>,
  resolver: StaticStringResolver,
) {
  return (
    isUnboundGlobal(expression, "Reflect", resolver) ||
    isBindingAlias(expression, aliases, resolver)
  );
}

function isModuleObject(
  expression: ts.Expression | undefined,
  aliases: ReadonlySet<LexicalBinding>,
  resolver: StaticStringResolver,
) {
  return (
    isUnboundGlobal(expression, "module", resolver) ||
    isBindingAlias(expression, aliases, resolver)
  );
}

function isGlobalRequire(expression: ts.Expression | undefined, resolver: StaticStringResolver) {
  return isUnboundGlobal(expression, "require", resolver);
}

function isExportsSurface(
  expression: ts.Expression | undefined,
  aliases: ReadonlySet<LexicalBinding>,
  resolver: StaticStringResolver,
) {
  return (
    isUnboundGlobal(expression, "exports", resolver) ||
    isBindingAlias(expression, aliases, resolver)
  );
}

function isDynamicExecutor(
  expression: ts.Expression | undefined,
  dynamicBindings: ReadonlySet<LexicalBinding>,
  globalObjectAliases: ReadonlySet<LexicalBinding>,
  resolver: StaticStringResolver,
) {
  if (
    isUnboundGlobal(expression, "eval", resolver) ||
    isUnboundGlobal(expression, "Function", resolver) ||
    isBindingAlias(expression, dynamicBindings, resolver)
  ) {
    return true;
  }
  if (expression === undefined) {
    return false;
  }
  const member = memberAccessParts(unwrapExpression(expression), resolver);
  return (
    member !== undefined &&
    isGlobalObject(member.object, globalObjectAliases, resolver) &&
    (member.name === "eval" || member.name === "Function")
  );
}

function reflectMethodForCallee(
  callee: ts.Expression,
  reflectAliases: ReadonlySet<LexicalBinding>,
  reflectMethodBindings: ReadonlyMap<LexicalBinding, ReflectMethod>,
  resolver: StaticStringResolver,
): ReflectMethod | undefined {
  const unwrapped = unwrapExpression(callee);
  if (ts.isIdentifier(unwrapped)) {
    const binding = resolver.bindingForIdentifier(unwrapped);
    return binding === undefined ? undefined : reflectMethodBindings.get(binding);
  }
  const member = memberAccessParts(unwrapped, resolver);
  if (
    member !== undefined &&
    isReflectObject(member.object, reflectAliases, resolver) &&
    (member.name === "apply" ||
      member.name === "construct" ||
      member.name === "get" ||
      member.name === "getOwnPropertyDescriptor")
  ) {
    return member.name;
  }
  return undefined;
}

export function scanExecutionAndCommonJs(
  nodes: readonly ts.Node[],
  sourceFile: ts.SourceFile,
  checkDependency: CheckDependency,
  addViolation: AddViolation,
) {
  const resolver = createStaticStringResolver(sourceFile);
  const moduleNamespaceBindings = new Set<LexicalBinding>();
  const moduleObjectAliases = new Set<LexicalBinding>();
  const globalObjectAliases = new Set<LexicalBinding>();
  const reflectAliases = new Set<LexicalBinding>();
  const createRequireBindings = new Set<LexicalBinding>();
  const loaderBindings = new Set<LexicalBinding>();
  const exportsSurfaceBindings = new Set<LexicalBinding>();
  const dynamicBindings = new Set<LexicalBinding>();
  const reflectMethodBindings = new Map<LexicalBinding, ReflectMethod>();

  for (const node of nodes) {
    if (
      !ts.isImportDeclaration(node) ||
      !ts.isStringLiteralLike(node.moduleSpecifier) ||
      (node.moduleSpecifier.text !== "node:module" && node.moduleSpecifier.text !== "module")
    ) {
      continue;
    }
    if (node.importClause?.name !== undefined) {
      addDeclaredBinding(node.importClause.name, moduleNamespaceBindings, resolver);
    }
    const bindings = node.importClause?.namedBindings;
    if (bindings !== undefined && ts.isNamespaceImport(bindings)) {
      addDeclaredBinding(bindings.name, moduleNamespaceBindings, resolver);
    } else if (bindings !== undefined && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        if ((element.propertyName ?? element.name).text === "createRequire") {
          addDeclaredBinding(element.name, createRequireBindings, resolver);
          addViolation(element, "forbidden-import", "createRequire");
        }
      }
    }
  }

  let aliasesChanged = true;
  while (aliasesChanged) {
    aliasesChanged = false;
    for (const node of nodes) {
      if (!ts.isVariableDeclaration(node) || node.initializer === undefined) {
        continue;
      }
      const initializer = unwrapExpression(node.initializer);
      if (ts.isObjectBindingPattern(node.name)) {
        const fromModuleNamespace = isBindingAlias(
          initializer,
          moduleNamespaceBindings,
          resolver,
        );
        const fromModuleObject = isModuleObject(initializer, moduleObjectAliases, resolver);
        const fromGlobalObject = isGlobalObject(initializer, globalObjectAliases, resolver);
        const fromReflect = isReflectObject(initializer, reflectAliases, resolver);
        for (const element of node.name.elements) {
          if (!ts.isIdentifier(element.name)) {
            continue;
          }
          const propertyName = element.propertyName;
          const sourceNode = propertyName ?? element.name;
          const sourceName =
            propertyName !== undefined && ts.isComputedPropertyName(propertyName)
              ? resolver.evaluate(propertyName.expression)
              : literalText(propertyName) ??
                (ts.isIdentifier(sourceNode) ? sourceNode.text : undefined);
          if (
            (fromModuleNamespace || fromModuleObject) &&
            propertyName !== undefined &&
            ts.isComputedPropertyName(propertyName) &&
            sourceName === undefined
          ) {
            addViolation(element, "forbidden-import", "non-static module loader key");
          }
          if (fromModuleNamespace && sourceName === "createRequire") {
            aliasesChanged =
              addDeclaredBinding(element.name, createRequireBindings, resolver) ||
              aliasesChanged;
            addViolation(element, "forbidden-import", "createRequire");
          } else if (fromModuleObject && sourceName === "exports") {
            aliasesChanged =
              addDeclaredBinding(element.name, exportsSurfaceBindings, resolver) ||
              aliasesChanged;
            addViolation(element, "forbidden-import", "CommonJS module surface");
          } else if (fromModuleObject && sourceName === "require") {
            aliasesChanged =
              addDeclaredBinding(element.name, loaderBindings, resolver) || aliasesChanged;
            addViolation(element, "forbidden-import", "aliased require");
          } else if (
            fromGlobalObject &&
            (sourceName === "eval" || sourceName === "Function")
          ) {
            aliasesChanged =
              addDeclaredBinding(element.name, dynamicBindings, resolver) || aliasesChanged;
            addViolation(element, "forbidden-import", "dynamic execution");
          } else if (
            fromReflect &&
            (sourceName === "apply" ||
              sourceName === "construct" ||
              sourceName === "get" ||
              sourceName === "getOwnPropertyDescriptor")
          ) {
            const binding = resolver.bindingForDeclaration(element.name);
            if (binding !== undefined && !reflectMethodBindings.has(binding)) {
              reflectMethodBindings.set(binding, sourceName);
              aliasesChanged = true;
            }
          }
        }
        continue;
      }
      if (!ts.isIdentifier(node.name)) {
        continue;
      }

      if (isModuleObject(initializer, moduleObjectAliases, resolver)) {
        aliasesChanged =
          addDeclaredBinding(node.name, moduleObjectAliases, resolver) || aliasesChanged;
      }
      if (isBindingAlias(initializer, moduleNamespaceBindings, resolver)) {
        aliasesChanged =
          addDeclaredBinding(node.name, moduleNamespaceBindings, resolver) || aliasesChanged;
      }
      if (isGlobalObject(initializer, globalObjectAliases, resolver)) {
        aliasesChanged =
          addDeclaredBinding(node.name, globalObjectAliases, resolver) || aliasesChanged;
      }
      if (isReflectObject(initializer, reflectAliases, resolver)) {
        aliasesChanged = addDeclaredBinding(node.name, reflectAliases, resolver) || aliasesChanged;
      }
      if (
        isGlobalRequire(initializer, resolver) ||
        isBindingAlias(initializer, loaderBindings, resolver)
      ) {
        aliasesChanged = addDeclaredBinding(node.name, loaderBindings, resolver) || aliasesChanged;
      }
      if (isExportsSurface(initializer, exportsSurfaceBindings, resolver)) {
        aliasesChanged =
          addDeclaredBinding(node.name, exportsSurfaceBindings, resolver) || aliasesChanged;
        addViolation(node, "forbidden-import", "CommonJS module surface");
      }
      if (isBindingAlias(initializer, createRequireBindings, resolver)) {
        aliasesChanged =
          addDeclaredBinding(node.name, createRequireBindings, resolver) || aliasesChanged;
      }
      if (
        isDynamicExecutor(initializer, dynamicBindings, globalObjectAliases, resolver)
      ) {
        aliasesChanged = addDeclaredBinding(node.name, dynamicBindings, resolver) || aliasesChanged;
      }

      const member = memberAccessParts(initializer, resolver);
      if (member?.name === "require" && isModuleObject(member.object, moduleObjectAliases, resolver)) {
        aliasesChanged = addDeclaredBinding(node.name, loaderBindings, resolver) || aliasesChanged;
      }
      if (
        member?.name === "exports" &&
        isModuleObject(member.object, moduleObjectAliases, resolver)
      ) {
        aliasesChanged =
          addDeclaredBinding(node.name, exportsSurfaceBindings, resolver) || aliasesChanged;
        addViolation(node, "forbidden-import", "CommonJS module surface");
      }
      if (
        member?.name === "createRequire" &&
        isBindingAlias(member.object, moduleNamespaceBindings, resolver)
      ) {
        aliasesChanged =
          addDeclaredBinding(node.name, createRequireBindings, resolver) || aliasesChanged;
      }
      const reflectedMethod = reflectMethodForCallee(
        initializer,
        reflectAliases,
        reflectMethodBindings,
        resolver,
      );
      if (reflectedMethod !== undefined) {
        const binding = resolver.bindingForDeclaration(node.name);
        if (binding !== undefined && !reflectMethodBindings.has(binding)) {
          reflectMethodBindings.set(binding, reflectedMethod);
          aliasesChanged = true;
        }
      }

      if (ts.isCallExpression(initializer)) {
        const callee = unwrapExpression(initializer.expression);
        if (
          isBindingAlias(callee, createRequireBindings, resolver) ||
          (() => {
            const calleeMember = memberAccessParts(callee, resolver);
            return (
              calleeMember?.name === "createRequire" &&
              isBindingAlias(calleeMember.object, moduleNamespaceBindings, resolver)
            );
          })()
        ) {
          aliasesChanged = addDeclaredBinding(node.name, loaderBindings, resolver) || aliasesChanged;
        }
      }
    }
  }

  for (const node of nodes) {
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      addViolation(node, "forbidden-import", "CommonJS loader");
    }

    if (
      ts.isNewExpression(node) &&
      isDynamicExecutor(node.expression, dynamicBindings, globalObjectAliases, resolver)
    ) {
      addViolation(node, "forbidden-import", "dynamic execution");
    }

    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const access = memberAccessParts(node, resolver);
      if (
        access?.name === "createRequire" &&
        isBindingAlias(access.object, moduleNamespaceBindings, resolver)
      ) {
        addViolation(node, "forbidden-import", "createRequire");
      }
      if (isModuleObject(access?.object, moduleObjectAliases, resolver)) {
        if (access?.name === undefined) {
          addViolation(node, "forbidden-import", "non-static module loader key");
        } else if (access.name === "require") {
          addViolation(node, "forbidden-import", "module.require");
          addViolation(node, "forbidden-import", "CommonJS loader");
        } else if (access.name === "exports") {
          addViolation(node, "forbidden-import", "CommonJS module surface");
        }
      }
      if (isExportsSurface(access?.object, exportsSurfaceBindings, resolver)) {
        addViolation(node, "forbidden-import", "CommonJS module surface");
      }
      if (isGlobalRequire(access?.object, resolver)) {
        addViolation(node, "forbidden-import", "CommonJS loader");
      }
    }

    if (!ts.isCallExpression(node)) {
      continue;
    }
    const callee = unwrapExpression(node.expression);
    const calleeMember = memberAccessParts(callee, resolver);
    if (isDynamicExecutor(callee, dynamicBindings, globalObjectAliases, resolver)) {
      addViolation(node, "forbidden-import", "dynamic execution");
    }

    const reflectMethod = reflectMethodForCallee(
      callee,
      reflectAliases,
      reflectMethodBindings,
      resolver,
    );
    if (
      (reflectMethod === "get" || reflectMethod === "getOwnPropertyDescriptor") &&
      isModuleObject(node.arguments[0], moduleObjectAliases, resolver)
    ) {
      const key = resolver.evaluate(node.arguments[1]);
      if (key === "require") {
        addViolation(node, "forbidden-import", "reflective module loader");
      } else if (key === undefined) {
        addViolation(node, "forbidden-import", "non-static module loader key");
      }
    } else if (reflectMethod === "apply") {
      const target = node.arguments[0] && unwrapExpression(node.arguments[0]);
      const targetMember = target && memberAccessParts(target, resolver);
      if (
        isDynamicExecutor(target, dynamicBindings, globalObjectAliases, resolver) ||
        isGlobalRequire(target, resolver) ||
        isBindingAlias(target, loaderBindings, resolver) ||
        (targetMember?.name === "require" &&
          isModuleObject(targetMember.object, moduleObjectAliases, resolver))
      ) {
        addViolation(
          node,
          "forbidden-import",
          isDynamicExecutor(target, dynamicBindings, globalObjectAliases, resolver)
            ? "dynamic execution"
            : "reflective module loader",
        );
      }
    } else if (
      reflectMethod === "construct" &&
      isDynamicExecutor(
        node.arguments[0],
        dynamicBindings,
        globalObjectAliases,
        resolver,
      )
    ) {
      addViolation(node, "forbidden-import", "dynamic execution");
    }

    if (isGlobalRequire(callee, resolver)) {
      addViolation(node, "forbidden-import", "CommonJS loader");
      checkDependency(node, node.arguments[0], "non-literal require()");
    } else if (isBindingAlias(callee, loaderBindings, resolver)) {
      addViolation(node, "forbidden-import", "CommonJS loader");
      addViolation(node, "forbidden-import", "aliased require");
      checkDependency(node, node.arguments[0], "non-literal aliased require()");
    } else if (
      calleeMember?.name === "require" &&
      isModuleObject(calleeMember.object, moduleObjectAliases, resolver)
    ) {
      addViolation(node, "forbidden-import", "module.require");
      addViolation(node, "forbidden-import", "CommonJS loader");
      checkDependency(node, node.arguments[0], "non-literal module.require()");
    } else if (
      calleeMember?.name === "createRequire" &&
      isBindingAlias(calleeMember.object, moduleNamespaceBindings, resolver)
    ) {
      addViolation(node, "forbidden-import", "createRequire");
    } else if (isBindingAlias(callee, createRequireBindings, resolver)) {
      addViolation(node, "forbidden-import", "createRequire");
    }
  }
}
