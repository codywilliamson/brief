// brief test runner - discovers and runs test blocks

import { parse } from "./parser.js";
import { resolve } from "./resolver.js";
import { Interpreter } from "./interpreter.js";
import { BriefRuntimeError } from "./result.js";
import type { Program, TestBlock, MockStmt, ExpectStmt, Node } from "./ast.js";
import type { BriefValue, BriefResult } from "./stdlib/core.js";
import type { MockEntry } from "./runtime.js";
import { briefToString } from "./stdlib/core.js";

export interface TestResult {
  description: string;
  passed: boolean;
  error?: string;
}

export async function runTests(source: string): Promise<TestResult[]> {
  const program = parse(source);
  const resolved = resolve(program);
  if (resolved.errors.length > 0) {
    throw resolved.errors[0];
  }
  const results: TestResult[] = [];

  for (const test of program.tests) {
    const result = await runSingleTest(test, program, resolved.permissions);
    results.push(result);
  }

  return results;
}

async function runSingleTest(
  test: TestBlock,
  program: Program,
  permissions: Set<string>,
): Promise<TestResult> {
  try {
    // collect mocks and expects from test body
    const mocks: MockEntry[] = [];
    const expects: ExpectStmt[] = [];
    const setupStmts: Node[] = [];

    for (const node of test.body) {
      if (node.kind === "MockStmt") {
        const mock = node as MockStmt;
        const mockArgs = mock.args
          ? await evaluateMockArgs(mock.args)
          : null;
        const returnValue = await evaluateStaticValue(mock.returnValue);
        mocks.push({ tool: mock.tool, args: mockArgs, returnValue });
      } else if (node.kind === "ExpectStmt") {
        expects.push(node as ExpectStmt);
      } else {
        setupStmts.push(node);
      }
    }

    // build tool handler from mocks
    const toolHandler = async (tool: string, args: BriefValue[]): Promise<BriefResult> => {
      const mock = findMock(mocks, tool, args);
      if (mock) return mock.returnValue as BriefResult;
      return { kind: "failed", reason: `unmocked tool '${tool}'` };
    };

    // create interpreter and run program body with mocks
    let programResult: BriefValue = null;
    const interp = new Interpreter({
      permissions,
      toolHandler,
      hostFunctions: {
        run: async () => programResult,
      },
      printFn: () => {}, // suppress output in tests
      sourceLines: [],
    });

    // run program body
    // successful completion wraps as Ok, runtime errors wrap as failed
    // this enables the `expect await run() to be ok/failed` pattern
    try {
      const rawResult = await interp.run(program);
      // if the program explicitly returned a Result, use it directly
      if (rawResult !== null && typeof rawResult === "object" && !Array.isArray(rawResult) && "kind" in rawResult) {
        programResult = rawResult;
      } else {
        programResult = { kind: "ok", value: rawResult } as BriefResult;
      }
    } catch (e) {
      if (e instanceof BriefRuntimeError) {
        programResult = { kind: "failed", reason: e.message } as BriefResult;
      } else {
        throw e;
      }
    }

    const testEnv = interp.createChildEnvironment();
    for (const stmt of setupStmts) {
      await interp.execute(stmt, testEnv);
    }

    // evaluate expects
    for (const exp of expects) {
      await evaluateExpect(exp, interp, testEnv);
    }

    return { description: test.description, passed: true };
  } catch (e: any) {
    return {
      description: test.description,
      passed: false,
      error: e.message ?? String(e),
    };
  }
}

async function evaluateStaticValue(node: Node): Promise<BriefValue> {
  switch (node.kind) {
    case "StringLit": return node.value;
    case "NumberLit": return node.value;
    case "BoolLit": return node.value;
    case "NullLit": return null;
    case "CallExpr": {
      if (node.callee.kind === "IdentExpr") {
        if (node.callee.name === "Ok") {
          const val = node.args.length > 0 ? await evaluateStaticValue(node.args[0]) : null;
          return { kind: "ok", value: val } as BriefResult;
        }
        if (node.callee.name === "failed") {
          const reason = node.args.length > 0 ? await evaluateStaticValue(node.args[0]) : "";
          return { kind: "failed", reason: briefToString(reason) } as BriefResult;
        }
      }
      throw new Error(`cannot statically evaluate call expression`);
    }
    case "ArrayLit": {
      const elements: BriefValue[] = [];
      for (const el of node.elements) {
        elements.push(await evaluateStaticValue(el));
      }
      return elements;
    }
    default:
      throw new Error(`cannot statically evaluate node of kind '${node.kind}'`);
  }
}

async function evaluateMockArgs(args: Node[]): Promise<BriefValue[]> {
  const result: BriefValue[] = [];
  for (const arg of args) {
    result.push(await evaluateStaticValue(arg));
  }
  return result;
}

async function evaluateExpect(
  exp: ExpectStmt,
  interp: Interpreter,
  testEnv: ReturnType<Interpreter["createChildEnvironment"]>,
): Promise<void> {
  const subject = await interp.evaluate(exp.subject, testEnv);

  switch (exp.matcher) {
    case "beOk": {
      if (!isResult(subject) || subject.kind !== "ok") {
        throw new Error(`expected result to be ok, got ${briefToString(subject)}`);
      }
      if (exp.expected) {
        const expectedVal = await interp.evaluate(exp.expected, testEnv);
        if (!briefDeepEqual(subject.value, expectedVal)) {
          throw new Error(`expected Ok(${briefToString(expectedVal)}), got Ok(${briefToString(subject.value)})`);
        }
      }
      break;
    }
    case "beFailed": {
      if (!isResult(subject) || subject.kind !== "failed") {
        throw new Error(`expected result to be failed, got ${briefToString(subject)}`);
      }
      if (exp.expected) {
        const expectedVal = await interp.evaluate(exp.expected, testEnv);
        if (subject.reason !== briefToString(expectedVal)) {
          throw new Error(`expected failed("${briefToString(expectedVal)}"), got failed("${subject.reason}")`);
        }
      }
      break;
    }
    case "be": {
      if (!exp.expected) {
        throw new Error("expected assertion value");
      }
      const expectedVal = await interp.evaluate(exp.expected, testEnv);
      if (!briefDeepEqual(subject, expectedVal)) {
        throw new Error(`expected ${briefToString(expectedVal)}, got ${briefToString(subject)}`);
      }
      break;
    }
  }
}

function isResult(value: BriefValue): value is BriefResult {
  return value !== null && typeof value === "object" && !Array.isArray(value) && "kind" in value;
}

function briefDeepEqual(a: BriefValue, b: BriefValue): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((value, index) => briefDeepEqual(value, b[index]));
  }
  if (isResult(a) && isResult(b)) {
    if (a.kind !== b.kind) return false;
    if (a.kind === "ok" && b.kind === "ok") return briefDeepEqual(a.value, b.value);
    if (a.kind === "failed" && b.kind === "failed") return a.reason === b.reason;
  }
  return false;
}

function findMock(mocks: MockEntry[], tool: string, args: BriefValue[]): MockEntry | undefined {
  const specific = mocks.find(m =>
    m.tool === tool && m.args !== null && argsMatch(m.args, args),
  );
  if (specific) return specific;
  return mocks.find(m => m.tool === tool && m.args === null);
}

function argsMatch(mockArgs: BriefValue[], callArgs: BriefValue[]): boolean {
  if (mockArgs.length !== callArgs.length) return false;
  return mockArgs.every((arg, index) => briefDeepEqual(arg, callArgs[index]));
}
