// brief resolver - name resolution, scope chain, permission scanning

import type { Node, Program, FnDecl } from "./ast.js";

export class ResolveError extends Error {
  constructor(
    message: string,
    public line: number,
  ) {
    super(`Resolve error at line ${line}: ${message}`);
    this.name = "ResolveError";
  }
}

export interface Scope {
  parent: Scope | null;
  names: Set<string>;
}

export interface ResolveResult {
  permissions: Set<string>;
  functions: Map<string, FnDecl>;
  errors: ResolveError[];
}

const VALID_PERMISSIONS = new Set([
  "fs.read", "fs.write",
  "http.fetch", "http.post",
  "ai.complete", "ai.stream", "ai.converse", "ai.toolUse", "ai.loop",
]);

const BUILTINS = new Set([
  "print", "len", "trim", "split", "join", "slice",
  "parseInt", "parseFloat", "toString",
  "Ok", "failed", "args", "at",
  "contains", "startsWith", "endsWith", "replace",
  "toUpper", "toLower", "concat", "push", "range", "typeOf", "keys",
  "flat", "reverse", "sort", "unique", "indexOf",
]);

export function resolve(program: Program): ResolveResult {
  const errors: ResolveError[] = [];
  const permissions = new Set<string>();
  const functions = new Map<string, FnDecl>();

  // validate permissions
  for (const perm of program.allow.permissions) {
    if (!VALID_PERMISSIONS.has(perm)) {
      errors.push(new ResolveError(`unknown permission '${perm}'`, program.allow.line));
    }
    permissions.add(perm);
  }

  // collect function declarations (first pass)
  for (const node of program.body) {
    if (node.kind === "FnDecl") {
      if (functions.has(node.name)) {
        errors.push(new ResolveError(`duplicate function '${node.name}'`, node.line));
      }
      functions.set(node.name, node);
    }
  }

  // resolve names (second pass)
  const globalScope: Scope = { parent: null, names: new Set() };

  // add builtins and functions to global scope
  for (const name of BUILTINS) globalScope.names.add(name);
  for (const name of functions.keys()) globalScope.names.add(name);

  for (const node of program.body) {
    resolveNode(node, globalScope, permissions, errors);
  }

  // resolve test blocks
  for (const test of program.tests) {
    const testScope: Scope = { parent: globalScope, names: new Set() };
    for (const node of test.body) {
      resolveNode(node, testScope, permissions, errors);
    }
  }

  return { permissions, functions, errors };
}

function resolveNode(
  node: Node,
  scope: Scope,
  permissions: Set<string>,
  errors: ResolveError[],
): void {
  switch (node.kind) {
    case "LetDecl": {
      resolveNode(node.value, scope, permissions, errors);
      scope.names.add(node.name);
      break;
    }
    case "LetDestructure": {
      resolveNode(node.value, scope, permissions, errors);
      for (const name of node.names) scope.names.add(name);
      break;
    }
    case "SetStmt": {
      resolveNode(node.value, scope, permissions, errors);
      break;
    }
    case "FnDecl": {
      const fnScope: Scope = { parent: scope, names: new Set() };
      for (const param of node.params) fnScope.names.add(param);
      for (const stmt of node.body) resolveNode(stmt, fnScope, permissions, errors);
      break;
    }
    case "ToolCallExpr": {
      if (!permissions.has(node.tool)) {
        // permission check is deferred to runtime, just note it here
      }
      for (const arg of node.args) resolveNode(arg, scope, permissions, errors);
      break;
    }
    case "IdentExpr": {
      if (!lookupName(node.name, scope)) {
        // soft warning - could be a forward reference or runtime value
      }
      break;
    }
    case "IfStmt": {
      resolveNode(node.condition, scope, permissions, errors);
      const ifScope: Scope = { parent: scope, names: new Set() };
      for (const stmt of node.body) resolveNode(stmt, ifScope, permissions, errors);
      if (node.elseBody) {
        const elseScope: Scope = { parent: scope, names: new Set() };
        for (const stmt of node.elseBody) resolveNode(stmt, elseScope, permissions, errors);
      }
      break;
    }
    case "UnlessStmt": {
      resolveNode(node.condition, scope, permissions, errors);
      const s: Scope = { parent: scope, names: new Set() };
      for (const stmt of node.body) resolveNode(stmt, s, permissions, errors);
      break;
    }
    case "UntilStmt": {
      resolveNode(node.condition, scope, permissions, errors);
      const s: Scope = { parent: scope, names: new Set() };
      for (const stmt of node.body) resolveNode(stmt, s, permissions, errors);
      break;
    }
    case "ForStmt": {
      resolveNode(node.iterable, scope, permissions, errors);
      const s: Scope = { parent: scope, names: new Set() };
      s.names.add(node.variable);
      for (const stmt of node.body) resolveNode(stmt, s, permissions, errors);
      break;
    }
    case "ForAwaitStmt": {
      resolveNode(node.source, scope, permissions, errors);
      const s: Scope = { parent: scope, names: new Set() };
      s.names.add(node.variable);
      for (const stmt of node.body) resolveNode(stmt, s, permissions, errors);
      break;
    }
    case "WithCtxBlock": {
      const s: Scope = { parent: scope, names: new Set() };
      for (const stmt of node.body) resolveNode(stmt, s, permissions, errors);
      break;
    }
    case "WhenExpr": {
      resolveNode(node.subject, scope, permissions, errors);
      for (const branch of node.branches) {
        const s: Scope = { parent: scope, names: new Set() };
        s.names.add(branch.binding);
        for (const stmt of branch.body) resolveNode(stmt, s, permissions, errors);
      }
      break;
    }
    case "ReturnStmt": {
      if (node.value) resolveNode(node.value, scope, permissions, errors);
      break;
    }
    case "ExprStmt": {
      resolveNode(node.expr, scope, permissions, errors);
      break;
    }
    case "PostfixIf": {
      resolveNode(node.statement, scope, permissions, errors);
      resolveNode(node.condition, scope, permissions, errors);
      break;
    }
    case "BinaryExpr": {
      resolveNode(node.left, scope, permissions, errors);
      resolveNode(node.right, scope, permissions, errors);
      break;
    }
    case "UnaryExpr": {
      resolveNode(node.operand, scope, permissions, errors);
      break;
    }
    case "CallExpr": {
      resolveNode(node.callee, scope, permissions, errors);
      for (const arg of node.args) resolveNode(arg, scope, permissions, errors);
      break;
    }
    case "MemberExpr": {
      resolveNode(node.object, scope, permissions, errors);
      break;
    }
    case "IndexExpr": {
      resolveNode(node.object, scope, permissions, errors);
      resolveNode(node.index, scope, permissions, errors);
      break;
    }
    case "OrFailExpr": {
      resolveNode(node.expr, scope, permissions, errors);
      resolveNode(node.message, scope, permissions, errors);
      break;
    }
    case "OrReturnExpr": {
      resolveNode(node.expr, scope, permissions, errors);
      resolveNode(node.defaultValue, scope, permissions, errors);
      break;
    }
    case "AwaitAllExpr": {
      for (const call of node.calls) resolveNode(call, scope, permissions, errors);
      break;
    }
    case "InterpolatedString": {
      for (const part of node.parts) {
        if (typeof part !== "string") resolveNode(part, scope, permissions, errors);
      }
      break;
    }
    case "ArrayLit": {
      for (const el of node.elements) resolveNode(el, scope, permissions, errors);
      break;
    }
    // literals and mocks/expects don't need resolution
    case "NumberLit":
    case "StringLit":
    case "BoolLit":
    case "NullLit":
    case "MockStmt":
    case "ExpectStmt":
      break;
  }
}

function lookupName(name: string, scope: Scope): boolean {
  let current: Scope | null = scope;
  while (current) {
    if (current.names.has(name)) return true;
    current = current.parent;
  }
  return false;
}
