// brief runtime - ties together parsing, resolving, interpreting

import { parse } from "./parser.js";
import { resolve, type ResolveResult } from "./resolver.js";
import { Interpreter, type ToolHandler, type StreamToolHandler } from "./interpreter.js";
import { BriefRuntimeError, BriefPermissionError } from "./result.js";
import { BriefStream } from "./stream.js";
import type { BriefValue, BriefResult } from "./stdlib/core.js";
import { briefToString } from "./stdlib/core.js";
import type { Program } from "./ast.js";
import { aiLoop, type ToolExecutor } from "./stdlib/ai.js";

export interface ToolRegistry {
  register(tool: string, handler: (...args: BriefValue[]) => Promise<BriefResult>): void;
  registerStream(tool: string, handler: (...args: BriefValue[]) => Promise<BriefStream<string>>): void;
  getHandler(tool: string): ((...args: BriefValue[]) => Promise<BriefResult>) | undefined;
  getStreamHandler(tool: string): ((...args: BriefValue[]) => Promise<BriefStream<string>>) | undefined;
}

export function createToolRegistry(): ToolRegistry {
  const handlers = new Map<string, (...args: BriefValue[]) => Promise<BriefResult>>();
  const streamHandlers = new Map<string, (...args: BriefValue[]) => Promise<BriefStream<string>>>();

  return {
    register(tool, handler) { handlers.set(tool, handler); },
    registerStream(tool, handler) { streamHandlers.set(tool, handler); },
    getHandler(tool) { return handlers.get(tool); },
    getStreamHandler(tool) { return streamHandlers.get(tool); },
  };
}

export interface MockEntry {
  tool: string;
  args: BriefValue[] | null; // null = wildcard
  returnValue: BriefValue;
}

export interface RuntimeOptions {
  source: string;
  registry?: ToolRegistry;
  mocks?: MockEntry[];
  printFn?: (...args: BriefValue[]) => void;
  testMode?: boolean;
}

export interface RuntimeResult {
  value: BriefValue;
  program: Program;
  resolved: ResolveResult;
}

export async function runBrief(options: RuntimeOptions): Promise<RuntimeResult> {
  const { source, registry, mocks, printFn, testMode } = options;

  const program = parse(source);
  const resolved = resolve(program);

  if (resolved.errors.length > 0) {
    throw resolved.errors[0];
  }

  // late-bound ref to interpreter for ai.loop callback support
  let interpRef: Interpreter | null = null;

  const toolHandler: ToolHandler = async (tool, args) => {
    // check mocks first
    if (mocks) {
      const mock = findMock(mocks, tool, args);
      if (mock) return mock.returnValue as BriefResult;
    }

    // ai.loop needs special handling - third arg is a function name for callbacks
    if (tool === "ai.loop" && interpRef) {
      const [prompt, tools, handlerName, config] = args;
      if (typeof handlerName !== "string") {
        return { kind: "failed", reason: "ai.loop third arg must be a function name (string)" };
      }
      const executor: ToolExecutor = async (toolName, toolInput) => {
        return interpRef!.callBriefFunction(handlerName, [toolName, toolInput]);
      };
      return aiLoop(prompt, tools, executor, config);
    }

    // then registry
    if (registry) {
      const handler = registry.getHandler(tool);
      if (handler) return handler(...args);
    }

    return { kind: "failed", reason: `no handler registered for '${tool}'` };
  };

  const streamHandler: StreamToolHandler = async (tool, args) => {
    // check mocks for streaming tools
    if (mocks) {
      const mock = findMock(mocks, tool, args);
      if (mock) {
        const stream = new BriefStream<string>();
        const val = mock.returnValue;
        if (val && typeof val === "object" && "kind" in val && (val as BriefResult).kind === "ok") {
          const content = (val as any).value;
          if (typeof content === "string") {
            stream.push(content);
          }
        }
        stream.end();
        return stream;
      }
    }

    if (registry) {
      const handler = registry.getStreamHandler(tool);
      if (handler) return handler(...args);
    }

    const stream = new BriefStream<string>();
    stream.end();
    return stream;
  };

  const interp = new Interpreter({
    permissions: resolved.permissions,
    toolHandler,
    streamHandler,
    printFn: printFn ?? (testMode ? () => {} : undefined),
    sourceLines: source.split("\n"),
  });
  interpRef = interp;

  const value = await interp.run(program);
  return { value, program, resolved };
}

function findMock(mocks: MockEntry[], tool: string, args: BriefValue[]): MockEntry | undefined {
  // specific arg mocks take precedence
  const specific = mocks.find(m =>
    m.tool === tool && m.args !== null && argsMatch(m.args, args),
  );
  if (specific) return specific;

  // then wildcard
  return mocks.find(m => m.tool === tool && m.args === null);
}

function argsMatch(mockArgs: BriefValue[], callArgs: BriefValue[]): boolean {
  if (mockArgs.length !== callArgs.length) return false;
  return mockArgs.every((a, i) => briefDeepEqual(a, callArgs[i]));
}

function briefDeepEqual(a: BriefValue, b: BriefValue): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => briefDeepEqual(v, b[i]));
  }
  return false;
}
