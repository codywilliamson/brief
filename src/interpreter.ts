// brief interpreter - tree-walk evaluator

import type { Node, Program, FnDecl, WhenBranch } from "./ast.js";
import { BriefRuntimeError, BriefPermissionError } from "./result.js";
import { BriefStream } from "./stream.js";
import {
  type BriefValue, type BriefResult,
  briefPrint, briefToString,
  STDLIB_FUNCTIONS,
} from "./stdlib/core.js";

// sentinel for return statements
class ReturnSignal {
  constructor(public value: BriefValue) {}
}

// sentinel for or-return unwrap
class OrReturnSignal {
  constructor(public value: BriefValue) {}
}

export type ToolHandler = (tool: string, args: BriefValue[]) => Promise<BriefResult>;
export type StreamToolHandler = (tool: string, args: BriefValue[]) => Promise<BriefStream<string>>;

export interface InterpreterOptions {
  permissions: Set<string>;
  toolHandler?: ToolHandler;
  streamHandler?: StreamToolHandler;
  printFn?: (...args: BriefValue[]) => void;
  sourceLines?: string[];
  scriptArgs?: string[];
}

export class Environment {
  private values = new Map<string, BriefValue>();

  constructor(public parent: Environment | null = null) {}

  get(name: string): BriefValue {
    if (this.values.has(name)) return this.values.get(name)!;
    if (this.parent) return this.parent.get(name);
    throw new BriefRuntimeError(`undefined variable '${name}'`);
  }

  set(name: string, value: BriefValue): void {
    this.values.set(name, value);
  }

  // update an existing variable in the scope chain where it was defined
  update(name: string, value: BriefValue): void {
    if (this.values.has(name)) {
      this.values.set(name, value);
      return;
    }
    if (this.parent) {
      this.parent.update(name, value);
      return;
    }
    throw new BriefRuntimeError(`cannot set undefined variable '${name}'`);
  }

  has(name: string): boolean {
    if (this.values.has(name)) return true;
    if (this.parent) return this.parent.has(name);
    return false;
  }
}

export class Interpreter {
  private globalEnv: Environment;
  private functions = new Map<string, FnDecl>();
  private permissions: Set<string>;
  private toolHandler: ToolHandler;
  private streamHandler: StreamToolHandler;
  private printFn: (...args: BriefValue[]) => void;
  private sourceLines: string[];

  constructor(options: InterpreterOptions) {
    this.permissions = options.permissions;
    this.globalEnv = new Environment();
    this.printFn = options.printFn ?? briefPrint;
    this.sourceLines = options.sourceLines ?? [];

    this.toolHandler = options.toolHandler ?? (async (tool) => {
      return { kind: "failed", reason: `no handler for tool '${tool}'` };
    });
    this.streamHandler = options.streamHandler ?? (async (tool) => {
      const stream = new BriefStream<string>();
      stream.end();
      return stream;
    });

    // register stdlib
    for (const [name, fn] of Object.entries(STDLIB_FUNCTIONS)) {
      this.globalEnv.set(name, name as any); // marker, handled in callFunction
    }
    this.globalEnv.set("print", "print" as any);
    this.globalEnv.set("Ok", "Ok" as any);
    this.globalEnv.set("failed", "failed" as any);

    // inject script args as a global array
    this.globalEnv.set("args", (options.scriptArgs ?? []) as BriefValue);
  }

  async run(program: Program): Promise<BriefValue> {
    // collect functions
    for (const node of program.body) {
      if (node.kind === "FnDecl") {
        this.functions.set(node.name, node);
        this.globalEnv.set(node.name, node.name as any);
      }
    }

    let lastValue: BriefValue = null;
    for (const node of program.body) {
      if (node.kind === "FnDecl") continue; // already collected
      try {
        lastValue = await this.execute(node, this.globalEnv);
      } catch (e) {
        if (e instanceof ReturnSignal) return e.value;
        throw e;
      }
    }
    return lastValue;
  }

  async execute(node: Node, env: Environment): Promise<BriefValue> {
    switch (node.kind) {
      case "LetDecl": {
        const value = await this.evaluate(node.value, env);
        env.set(node.name, value);
        return null;
      }

      case "SetStmt": {
        const value = await this.evaluate(node.value, env);
        env.update(node.name, value);
        return null;
      }

      case "FnDecl":
        return null;

      case "ExprStmt":
        return await this.evaluate(node.expr, env);

      case "ReturnStmt": {
        const value = node.value ? await this.evaluate(node.value, env) : null;
        throw new ReturnSignal(value);
      }

      case "IfStmt": {
        const cond = await this.evaluate(node.condition, env);
        if (isTruthy(cond)) {
          const blockEnv = new Environment(env);
          return await this.executeBlock(node.body, blockEnv);
        } else if (node.elseBody) {
          const blockEnv = new Environment(env);
          return await this.executeBlock(node.elseBody, blockEnv);
        }
        return null;
      }

      case "UnlessStmt": {
        const cond = await this.evaluate(node.condition, env);
        if (!isTruthy(cond)) {
          const blockEnv = new Environment(env);
          return await this.executeBlock(node.body, blockEnv);
        }
        return null;
      }

      case "UntilStmt": {
        const blockEnv = new Environment(env);
        let iterations = 0;
        while (!isTruthy(await this.evaluate(node.condition, blockEnv))) {
          await this.executeBlock(node.body, blockEnv);
          iterations++;
          if (iterations > 10000) {
            throw new BriefRuntimeError("until loop exceeded max iterations (10000)", node.line);
          }
        }
        return null;
      }

      case "ForStmt": {
        const iterable = await this.evaluate(node.iterable, env);
        if (!Array.isArray(iterable)) {
          throw new BriefRuntimeError("for..in requires an array", node.line);
        }
        for (const item of iterable) {
          const blockEnv = new Environment(env);
          blockEnv.set(node.variable, item);
          await this.executeBlock(node.body, blockEnv);
        }
        return null;
      }

      case "ForAwaitStmt": {
        const source = await this.evaluate(node.source, env);
        if (source && typeof source === "object" && Symbol.asyncIterator in (source as any)) {
          const stream = source as AsyncIterable<BriefValue>;
          for await (const chunk of stream) {
            const blockEnv = new Environment(env);
            blockEnv.set(node.variable, chunk);
            await this.executeBlock(node.body, blockEnv);
          }
        } else {
          throw new BriefRuntimeError("for await requires a stream", node.line);
        }
        return null;
      }

      case "WithCtxBlock": {
        const blockEnv = new Environment(env);
        return await this.executeBlock(node.body, blockEnv);
      }

      case "WhenExpr": {
        const subject = await this.evaluate(node.subject, env);
        if (!isResult(subject)) {
          throw new BriefRuntimeError("when requires a Result value", node.line);
        }
        for (const branch of node.branches) {
          if (branch.pattern === "ok" && subject.kind === "ok") {
            const branchEnv = new Environment(env);
            branchEnv.set(branch.binding, subject.value);
            return await this.executeBlock(branch.body, branchEnv);
          }
          if (branch.pattern === "failed" && subject.kind === "failed") {
            const branchEnv = new Environment(env);
            branchEnv.set(branch.binding, subject.reason);
            return await this.executeBlock(branch.body, branchEnv);
          }
        }
        return null;
      }

      case "PostfixIf": {
        const cond = await this.evaluate(node.condition, env);
        if (isTruthy(cond)) {
          return await this.execute(node.statement, env);
        }
        return null;
      }

      default:
        return await this.evaluate(node, env);
    }
  }

  async evaluate(node: Node, env: Environment): Promise<BriefValue> {
    switch (node.kind) {
      case "NumberLit": return node.value;
      case "StringLit": return node.value;
      case "BoolLit": return node.value;
      case "NullLit": return null;

      case "IdentExpr":
        return env.get(node.name);

      case "InterpolatedString": {
        let result = "";
        for (const part of node.parts) {
          if (typeof part === "string") {
            result += part;
          } else {
            result += briefToString(await this.evaluate(part, env));
          }
        }
        return result;
      }

      case "ArrayLit": {
        const elements: BriefValue[] = [];
        for (const el of node.elements) {
          elements.push(await this.evaluate(el, env));
        }
        return elements;
      }

      case "BinaryExpr": {
        const left = await this.evaluate(node.left, env);
        const right = await this.evaluate(node.right, env);
        return evalBinary(node.op, left, right, node.line);
      }

      case "UnaryExpr": {
        const operand = await this.evaluate(node.operand, env);
        if (node.op === "!") return !isTruthy(operand);
        if (node.op === "-") {
          if (typeof operand !== "number") throw new BriefRuntimeError("unary - requires number", node.line);
          return -operand;
        }
        throw new BriefRuntimeError(`unknown unary op '${node.op}'`, node.line);
      }

      case "CallExpr": {
        const callee = await this.evaluate(node.callee, env);
        const args: BriefValue[] = [];
        for (const arg of node.args) {
          args.push(await this.evaluate(arg, env));
        }
        return await this.callFunction(callee, args, node.line, env);
      }

      case "IndexExpr": {
        const obj = await this.evaluate(node.object, env);
        const idx = await this.evaluate(node.index, env);
        if (typeof idx !== "number") {
          throw new BriefRuntimeError("index must be a number", node.line);
        }
        if (Array.isArray(obj)) {
          if (idx < 0 || idx >= obj.length) return null;
          return obj[idx];
        }
        if (typeof obj === "string") {
          if (idx < 0 || idx >= obj.length) return null;
          return obj[idx];
        }
        throw new BriefRuntimeError("indexing requires an array or string", node.line);
      }

      case "MemberExpr": {
        const obj = await this.evaluate(node.object, env);
        if (Array.isArray(obj)) {
          if (node.property === "length") return obj.length;
          if (node.property === "push") return `__array_push__${JSON.stringify(obj)}` as any;
        }
        if (typeof obj === "string") {
          if (node.property === "length") return obj.length;
        }
        throw new BriefRuntimeError(`cannot access property '${node.property}'`, node.line);
      }

      case "ToolCallExpr": {
        this.checkPermission(node.tool, node.line);
        const args: BriefValue[] = [];
        for (const arg of node.args) {
          args.push(await this.evaluate(arg, env));
        }
        // check if this is a streaming tool
        if (node.tool.endsWith(".stream")) {
          return await this.streamHandler(node.tool, args) as any;
        }
        return await this.toolHandler(node.tool, args);
      }

      case "OrFailExpr": {
        const result = await this.evaluate(node.expr, env);
        if (isResult(result)) {
          if (result.kind === "ok") return result.value;
          const message = await this.evaluate(node.message, env);
          throw new BriefRuntimeError(
            briefToString(message),
            node.line,
            this.sourceLines[node.line - 1],
          );
        }
        return result;
      }

      case "OrReturnExpr": {
        const result = await this.evaluate(node.expr, env);
        if (isResult(result)) {
          if (result.kind === "ok") return result.value;
          const defaultValue = await this.evaluate(node.defaultValue, env);
          throw new ReturnSignal(defaultValue);
        }
        return result;
      }

      case "AwaitAllExpr": {
        const promises = node.calls.map(call => this.evaluate(call, env));
        return await Promise.all(promises);
      }

      // statements that can appear as expressions in some contexts
      case "LetDecl":
      case "ReturnStmt":
      case "IfStmt":
      case "UnlessStmt":
      case "UntilStmt":
      case "ForStmt":
      case "ForAwaitStmt":
      case "WithCtxBlock":
      case "WhenExpr":
      case "PostfixIf":
      case "ExprStmt":
        return await this.execute(node, env);

      default:
        throw new BriefRuntimeError(`unexpected node kind '${(node as any).kind}'`, (node as any).line);
    }
  }

  private async callFunction(callee: BriefValue, args: BriefValue[], line: number, env: Environment): Promise<BriefValue> {
    if (typeof callee === "string") {
      // built-in functions
      if (callee === "print") {
        this.printFn(...args);
        return null;
      }
      if (callee === "Ok") {
        return { kind: "ok", value: args[0] ?? null } as BriefResult;
      }
      if (callee === "failed") {
        return { kind: "failed", reason: briefToString(args[0] ?? null) } as BriefResult;
      }
      if (callee in STDLIB_FUNCTIONS) {
        return STDLIB_FUNCTIONS[callee](...args);
      }
      // user-defined function
      if (this.functions.has(callee)) {
        const fn = this.functions.get(callee)!;
        const fnEnv = new Environment(this.globalEnv);
        for (let i = 0; i < fn.params.length; i++) {
          fnEnv.set(fn.params[i], args[i] ?? null);
        }
        try {
          let result: BriefValue = null;
          for (const stmt of fn.body) {
            result = await this.execute(stmt, fnEnv);
          }
          return result;
        } catch (e) {
          if (e instanceof ReturnSignal) return e.value;
          throw e;
        }
      }
      // array push hack
      if (typeof callee === "string" && (callee as string).startsWith("__array_push__")) {
        // this is a method call on an array that was captured via MemberExpr
        // we need a different approach for mutable array methods
        throw new BriefRuntimeError("array.push() not directly supported - use array concatenation", line);
      }
    }

    throw new BriefRuntimeError(`'${briefToString(callee)}' is not callable`, line);
  }

  // public method for calling Brief functions from external code (e.g. ai.loop callbacks)
  async callBriefFunction(name: string, args: BriefValue[]): Promise<BriefValue> {
    if (!this.functions.has(name)) {
      throw new BriefRuntimeError(`function '${name}' not found`);
    }
    return this.callFunction(name, args, 0, this.globalEnv);
  }

  private checkPermission(tool: string, line: number): void {
    if (!this.permissions.has(tool)) {
      throw new BriefPermissionError(tool, line, this.sourceLines[line - 1]);
    }
  }

  private async executeBlock(stmts: Node[], env: Environment): Promise<BriefValue> {
    let lastValue: BriefValue = null;
    for (const stmt of stmts) {
      lastValue = await this.execute(stmt, env);
    }
    return lastValue;
  }
}

function isTruthy(value: BriefValue): boolean {
  if (value === null) return false;
  if (value === false) return false;
  if (value === 0) return false;
  if (value === "") return false;
  return true;
}

function isResult(value: BriefValue): value is BriefResult {
  return value !== null && typeof value === "object" && !Array.isArray(value) && "kind" in value;
}

function evalBinary(op: string, left: BriefValue, right: BriefValue, line: number): BriefValue {
  switch (op) {
    case "+":
      if (typeof left === "number" && typeof right === "number") return left + right;
      if (typeof left === "string" || typeof right === "string") {
        return briefToString(left) + briefToString(right);
      }
      throw new BriefRuntimeError("+ requires numbers or strings", line);
    case "-":
      assertNumbers(left, right, "-", line);
      return (left as number) - (right as number);
    case "*":
      assertNumbers(left, right, "*", line);
      return (left as number) * (right as number);
    case "/":
      assertNumbers(left, right, "/", line);
      if (right === 0) throw new BriefRuntimeError("division by zero", line);
      return (left as number) / (right as number);
    case "%":
      assertNumbers(left, right, "%", line);
      return (left as number) % (right as number);
    case "==": return briefEquals(left, right);
    case "!=": return !briefEquals(left, right);
    case ">":
      assertNumbers(left, right, ">", line);
      return (left as number) > (right as number);
    case "<":
      assertNumbers(left, right, "<", line);
      return (left as number) < (right as number);
    case ">=":
      assertNumbers(left, right, ">=", line);
      return (left as number) >= (right as number);
    case "<=":
      assertNumbers(left, right, "<=", line);
      return (left as number) <= (right as number);
    case "&&": return isTruthy(left) ? right : left;
    case "||": return isTruthy(left) ? left : right;
    default:
      throw new BriefRuntimeError(`unknown operator '${op}'`, line);
  }
}

function assertNumbers(left: BriefValue, right: BriefValue, op: string, line: number): void {
  if (typeof left !== "number" || typeof right !== "number") {
    throw new BriefRuntimeError(`'${op}' requires numbers`, line);
  }
}

function briefEquals(a: BriefValue, b: BriefValue): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a === "string" || typeof a === "number" || typeof a === "boolean") return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => briefEquals(v, b[i]));
  }
  if (isResult(a) && isResult(b)) {
    if (a.kind !== b.kind) return false;
    if (a.kind === "ok" && b.kind === "ok") return briefEquals(a.value, b.value);
    if (a.kind === "failed" && b.kind === "failed") return a.reason === b.reason;
  }
  return false;
}

// re-export for use by other modules
export { isTruthy, isResult, briefEquals };
