import { describe, it, expect, vi } from "vitest";
import { parse } from "../src/parser.js";
import { resolve } from "../src/resolver.js";
import { Interpreter } from "../src/interpreter.js";
import { BriefRuntimeError, BriefPermissionError } from "../src/result.js";
import type { BriefValue, BriefResult } from "../src/stdlib/core.js";

async function run(src: string, opts: {
  tools?: Record<string, (...args: any[]) => Promise<BriefResult>>;
  printFn?: (...args: BriefValue[]) => void;
} = {}) {
  const program = parse(src);
  const resolved = resolve(program);
  if (resolved.errors.length > 0) throw resolved.errors[0];

  const toolHandler = async (tool: string, args: BriefValue[]): Promise<BriefResult> => {
    if (opts.tools && tool in opts.tools) return opts.tools[tool](...args);
    return { kind: "failed", reason: `no handler for '${tool}'` };
  };

  const interp = new Interpreter({
    permissions: resolved.permissions,
    toolHandler,
    printFn: opts.printFn ?? (() => {}),
    sourceLines: src.split("\n"),
  });

  return interp.run(program);
}

describe("interpreter", () => {
  describe("literals and variables", () => {
    it("evaluates number literals", async () => {
      const result = await run("allow\n  fs.read\nlet x = 42\nprint(x)");
      // returns null (last expr is print)
    });

    it("evaluates string literals", async () => {
      const prints: BriefValue[] = [];
      await run('allow\n  fs.read\nprint("hello")', { printFn: (...a) => prints.push(...a) });
      expect(prints).toEqual(["hello"]);
    });

    it("evaluates boolean literals", async () => {
      const prints: BriefValue[] = [];
      await run("allow\n  fs.read\nprint(true)", { printFn: (...a) => prints.push(...a) });
      expect(prints).toEqual([true]);
    });

    it("evaluates null", async () => {
      const prints: BriefValue[] = [];
      await run("allow\n  fs.read\nprint(null)", { printFn: (...a) => prints.push(...a) });
      expect(prints).toEqual([null]);
    });

    it("evaluates interpolated strings", async () => {
      const prints: BriefValue[] = [];
      await run('allow\n  fs.read\nlet name = "world"\nprint("hello {name}")', {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual(["hello world"]);
    });
  });

  describe("arithmetic", () => {
    it("evaluates basic math", async () => {
      const prints: BriefValue[] = [];
      await run("allow\n  fs.read\nprint(2 + 3)", { printFn: (...a) => prints.push(...a) });
      expect(prints).toEqual([5]);
    });

    it("evaluates operator precedence", async () => {
      const prints: BriefValue[] = [];
      await run("allow\n  fs.read\nprint(2 + 3 * 4)", { printFn: (...a) => prints.push(...a) });
      expect(prints).toEqual([14]);
    });

    it("evaluates string concatenation", async () => {
      const prints: BriefValue[] = [];
      await run('allow\n  fs.read\nprint("a" + "b")', { printFn: (...a) => prints.push(...a) });
      expect(prints).toEqual(["ab"]);
    });

    it("evaluates comparison operators", async () => {
      const prints: BriefValue[] = [];
      await run("allow\n  fs.read\nprint(5 > 3)\nprint(2 == 2)\nprint(1 != 2)", {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual([true, true, true]);
    });

    it("evaluates unary operators", async () => {
      const prints: BriefValue[] = [];
      await run("allow\n  fs.read\nprint(!true)\nprint(-5)", {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual([false, -5]);
    });
  });

  describe("control flow", () => {
    it("evaluates if/else", async () => {
      const prints: BriefValue[] = [];
      await run('allow\n  fs.read\nif true {\n  print("yes")\n} else {\n  print("no")\n}', {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual(["yes"]);
    });

    it("evaluates else branch", async () => {
      const prints: BriefValue[] = [];
      await run('allow\n  fs.read\nif false {\n  print("yes")\n} else {\n  print("no")\n}', {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual(["no"]);
    });

    it("evaluates unless", async () => {
      const prints: BriefValue[] = [];
      await run('allow\n  fs.read\nunless false {\n  print("ran")\n}', {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual(["ran"]);
    });

    it("evaluates for loop", async () => {
      const prints: BriefValue[] = [];
      await run("allow\n  fs.read\nlet items = [1, 2, 3]\nfor item in items {\n  print(item)\n}", {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual([1, 2, 3]);
    });

    it("evaluates postfix if", async () => {
      const result = await run('allow\n  fs.read\nreturn "early" if true');
      expect(result).toBe("early");
    });

    it("skips postfix if when false", async () => {
      const result = await run('allow\n  fs.read\nreturn "early" if false\nreturn "late"');
      expect(result).toBe("late");
    });
  });

  describe("functions", () => {
    it("calls user-defined functions", async () => {
      const prints: BriefValue[] = [];
      await run("allow\n  fs.read\nasync fn add(a, b) {\n  return a + b\n}\nprint(add(2, 3))", {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual([5]);
    });

    it("supports recursion", async () => {
      const prints: BriefValue[] = [];
      await run(`allow
  fs.read
async fn factorial(n) {
  if n <= 1 {
    return 1
  }
  return n * factorial(n - 1)
}
print(factorial(5))`, { printFn: (...a) => prints.push(...a) });
      expect(prints).toEqual([120]);
    });
  });

  describe("stdlib", () => {
    it("len() works on strings", async () => {
      const prints: BriefValue[] = [];
      await run('allow\n  fs.read\nprint(len("hello"))', { printFn: (...a) => prints.push(...a) });
      expect(prints).toEqual([5]);
    });

    it("len() works on arrays", async () => {
      const prints: BriefValue[] = [];
      await run("allow\n  fs.read\nprint(len([1, 2, 3]))", { printFn: (...a) => prints.push(...a) });
      expect(prints).toEqual([3]);
    });

    it("trim() works", async () => {
      const prints: BriefValue[] = [];
      await run('allow\n  fs.read\nprint(trim("  hi  "))', { printFn: (...a) => prints.push(...a) });
      expect(prints).toEqual(["hi"]);
    });

    it("split() works", async () => {
      const prints: BriefValue[] = [];
      await run('allow\n  fs.read\nlet parts = split("a,b,c", ",")\nprint(len(parts))', {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual([3]);
    });

    it("join() works", async () => {
      const prints: BriefValue[] = [];
      await run('allow\n  fs.read\nlet arr = ["a", "b"]\nprint(join(arr, "-"))', {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual(["a-b"]);
    });

    it("Ok() and failed() constructors", async () => {
      const prints: BriefValue[] = [];
      await run('allow\n  fs.read\nlet r = Ok("done")\nprint(r)', {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints[0]).toEqual({ kind: "ok", value: "done" });
    });
  });

  describe("tool calls", () => {
    it("calls tools with or fail", async () => {
      const prints: BriefValue[] = [];
      await run(
        'allow\n  fs.read\nlet data =\n  await ask fs.read("file.txt")\n  or fail "could not read"\nprint(data)',
        {
          tools: {
            "fs.read": async () => ({ kind: "ok", value: "contents" }),
          },
          printFn: (...a) => prints.push(...a),
        },
      );
      expect(prints).toEqual(["contents"]);
    });

    it("or fail halts on failure", async () => {
      await expect(run(
        'allow\n  fs.read\nlet data =\n  await ask fs.read("file.txt")\n  or fail "could not read"',
        {
          tools: { "fs.read": async () => ({ kind: "failed", reason: "not found" }) },
        },
      )).rejects.toThrow("could not read");
    });

    it("or return provides default", async () => {
      const prints: BriefValue[] = [];
      await run(
        'allow\n  fs.read\nasync fn readOrDefault() {\n  let data =\n    await ask fs.read("f")\n    or return "default"\n  return data\n}\nprint(readOrDefault())',
        {
          tools: { "fs.read": async () => ({ kind: "failed", reason: "nope" }) },
          printFn: (...a) => prints.push(...a),
        },
      );
      expect(prints).toEqual(["default"]);
    });

    it("checks permissions", async () => {
      await expect(run(
        'allow\n  fs.read\nlet r =\n  await ask fs.write("f", "c")\n  or fail "err"',
      )).rejects.toThrow(BriefPermissionError);
    });
  });

  describe("when expression", () => {
    it("matches ok branch", async () => {
      const prints: BriefValue[] = [];
      await run('allow\n  fs.read\nlet r = Ok("value")\nwhen r {\n  ok(v) => print(v)\n  failed(e) => print(e)\n}', {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual(["value"]);
    });

    it("matches failed branch", async () => {
      const prints: BriefValue[] = [];
      await run('allow\n  fs.read\nlet r = failed("oops")\nwhen r {\n  ok(v) => print(v)\n  failed(e) => print(e)\n}', {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual(["oops"]);
    });
  });

  describe("await all", () => {
    it("runs parallel tool calls", async () => {
      const prints: BriefValue[] = [];
      await run(
        `allow
  fs.read
let results = await all {
  ask fs.read("a.txt")
  ask fs.read("b.txt")
}
print(results)`,
        {
          tools: {
            "fs.read": async (path: BriefValue) => ({
              kind: "ok" as const,
              value: `content of ${path}`,
            }),
          },
          printFn: (...a) => prints.push(...a),
        },
      );
      expect(prints[0]).toEqual([
        { kind: "ok", value: "content of a.txt" },
        { kind: "ok", value: "content of b.txt" },
      ]);
    });
  });

  describe("member access", () => {
    it("accesses array length", async () => {
      const prints: BriefValue[] = [];
      await run("allow\n  fs.read\nlet arr = [1, 2, 3]\nprint(arr.length)", {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual([3]);
    });

    it("accesses string length", async () => {
      const prints: BriefValue[] = [];
      await run('allow\n  fs.read\nlet s = "hello"\nprint(s.length)', {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual([5]);
    });
  });

  describe("return", () => {
    it("returns from top level", async () => {
      const result = await run("allow\n  fs.read\nreturn 42");
      expect(result).toBe(42);
    });

    it("returns Ok result", async () => {
      const result = await run('allow\n  fs.read\nreturn Ok("done")');
      expect(result).toEqual({ kind: "ok", value: "done" });
    });

    it("returns failed result", async () => {
      const result = await run('allow\n  fs.read\nreturn failed("nope")');
      expect(result).toEqual({ kind: "failed", reason: "nope" });
    });
  });

  describe("until loop", () => {
    it("loops until condition is true", async () => {
      const prints: BriefValue[] = [];
      await run(`allow
  fs.read
let count = 0
until count == 3 {
  let count = count + 1
  print(count)
}`, { printFn: (...a) => prints.push(...a) });
      expect(prints).toEqual([1, 2, 3]);
    });
  });
});
