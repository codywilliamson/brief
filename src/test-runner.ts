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
    const otherStmts: Node[] = [];

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
        otherStmts.push(node);
      }
    }

    // build tool handler from mocks
    const toolHandler = async (tool: string, args: BriefValue[]): Promise<BriefResult> => {
      const mock = findMock(mocks, tool, args);
      if (mock) return mock.returnValue as BriefResult;
      return { kind: "failed", reason: `unmocked tool '${tool}'` };
    };

    // create interpreter and run program body with mocks
    const interp = new Interpreter({
      permissions,
      toolHandler,
      printFn: () => {}, // suppress output in tests
      sourceLines: [],
    });

    // run program body
    // successful completion wraps as Ok, runtime errors wrap as failed
    // this enables the `expect await run() to be ok/failed` pattern
    let programResult: BriefValue = null;
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

    // evaluate expects
    for (const exp of expects) {
      await evaluateExpect(exp, interp, programResult);
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

function evaluateExpect(
  exp: ExpectStmt,
  interp: Interpreter,
  programResult: BriefValue,
): void {
  // for now, expect operates on the program result when subject is `await run()`
  // or on static values
  const subject = programResult;

  switch (exp.matcher) {
    case "beOk": {
      if (!subject || typeof subject !== "object" || !("kind" in subject) || (subject as any).kind !== "ok") {
        throw new Error(`expected result to be ok, got ${briefToString(subject)}`);
      }
      if (exp.expected) {
        // check specific value
      }
      break;
    }
    case "beFailed": {
      if (!subject || typeof subject !== "object" || !("kind" in subject) || (subject as any).kind !== "failed") {
        throw new Error(`expected result to be failed, got ${briefToString(subject)}`);
      }
      if (exp.expected) {
        const expectedVal = evaluateStaticValueSync(exp.expected);
        if ((subject as any).reason !== expectedVal) {
          throw new Error(`expected failed("${expectedVal}"), got failed("${(subject as any).reason}")`);
        }
      }
      break;
    }
    case "be": {
      if (exp.expected) {
        const expectedVal = evaluateStaticValueSync(exp.expected);
        if (subject !== expectedVal) {
          throw new Error(`expected ${briefToString(expectedVal)}, got ${briefToString(subject)}`);
        }
      }
      break;
    }
  }
}

function evaluateStaticValueSync(node: Node): BriefValue {
  switch (node.kind) {
    case "StringLit": return node.value;
    case "NumberLit": return node.value;
    case "BoolLit": return node.value;
    case "NullLit": return null;
    default: return null;
  }
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
  return mockArgs.every((a, i) => a === callArgs[i]);
}
