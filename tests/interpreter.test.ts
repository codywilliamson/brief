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

  describe("bracket indexing", () => {
    it("accesses array element by literal index", async () => {
      const prints: BriefValue[] = [];
      await run("allow\n  fs.read\nlet arr = [1, 2, 3]\nprint(arr[0])", {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual([1]);
    });

    it("accesses array element by variable index", async () => {
      const prints: BriefValue[] = [];
      await run("allow\n  fs.read\nlet arr = [10, 20, 30]\nlet i = 1\nprint(arr[i])", {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual([20]);
    });

    it("accesses string character by index", async () => {
      const prints: BriefValue[] = [];
      await run('allow\n  fs.read\nprint("hello"[0])', {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual(["h"]);
    });

    it("returns null for out of bounds index", async () => {
      const prints: BriefValue[] = [];
      await run("allow\n  fs.read\nlet arr = [1, 2, 3]\nprint(arr[5])", {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual([null]);
    });

    it("supports nested array indexing", async () => {
      const prints: BriefValue[] = [];
      await run("allow\n  fs.read\nlet arr = [[1, 2], [3, 4]]\nprint(arr[0][1])", {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual([2]);
    });

    it("supports indexing in expressions", async () => {
      const prints: BriefValue[] = [];
      await run("allow\n  fs.read\nlet arr = [10, 20, 30]\nprint(arr[0] + arr[1])", {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual([30]);
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

  describe("break and continue", () => {
    it("break exits for loop early", async () => {
      const prints: BriefValue[] = [];
      await run(`allow
  fs.read
for item in [1, 2, 3, 4, 5] {
  if item == 3 {
    break
  }
  print(item)
}`, { printFn: (...a) => prints.push(...a) });
      expect(prints).toEqual([1, 2]);
    });

    it("break exits until loop early", async () => {
      const prints: BriefValue[] = [];
      await run(`allow
  fs.read
let i = 0
until i == 10 {
  set i = i + 1
  if i == 3 {
    break
  }
  print(i)
}`, { printFn: (...a) => prints.push(...a) });
      expect(prints).toEqual([1, 2]);
    });

    it("continue skips to next iteration in for loop", async () => {
      const prints: BriefValue[] = [];
      await run(`allow
  fs.read
for item in [1, 2, 3, 4, 5] {
  if item == 3 {
    continue
  }
  print(item)
}`, { printFn: (...a) => prints.push(...a) });
      expect(prints).toEqual([1, 2, 4, 5]);
    });

    it("continue skips to next iteration in until loop", async () => {
      const prints: BriefValue[] = [];
      await run(`allow
  fs.read
let i = 0
until i == 5 {
  set i = i + 1
  if i == 3 {
    continue
  }
  print(i)
}`, { printFn: (...a) => prints.push(...a) });
      expect(prints).toEqual([1, 2, 4, 5]);
    });

    it("break inside nested loop only breaks inner loop", async () => {
      const prints: BriefValue[] = [];
      await run(`allow
  fs.read
for outer in [1, 2, 3] {
  for inner in [10, 20, 30] {
    if inner == 20 {
      break
    }
    print(inner)
  }
  print(outer)
}`, { printFn: (...a) => prints.push(...a) });
      expect(prints).toEqual([10, 1, 10, 2, 10, 3]);
    });
  });

  describe("set statement", () => {
    it("mutates a variable", async () => {
      const prints: BriefValue[] = [];
      await run(`allow
  fs.read
let x = 1
set x = 2
print(x)`, { printFn: (...a) => prints.push(...a) });
      expect(prints).toEqual([2]);
    });

    it("mutates in a loop", async () => {
      const prints: BriefValue[] = [];
      await run(`allow
  fs.read
let total = 0
for item in [1, 2, 3, 4, 5] {
  set total = total + item
}
print(total)`, { printFn: (...a) => prints.push(...a) });
      expect(prints).toEqual([15]);
    });

    it("builds up an array", async () => {
      const prints: BriefValue[] = [];
      await run(`allow
  fs.read
let items = []
set items = push(items, "a")
set items = push(items, "b")
set items = push(items, "c")
print(len(items))`, { printFn: (...a) => prints.push(...a) });
      expect(prints).toEqual([3]);
    });

    it("errors on undefined variable", async () => {
      await expect(run(`allow
  fs.read
set x = 42`)).rejects.toThrow("cannot set undefined variable");
    });
  });

  describe("let destructuring", () => {
    it("destructures array into variables", async () => {
      const prints: BriefValue[] = [];
      await run("allow\n  fs.read\nlet [a, b] = [1, 2]\nprint(a)\nprint(b)", {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual([1, 2]);
    });

    it("destructures three element array", async () => {
      const prints: BriefValue[] = [];
      await run("allow\n  fs.read\nlet [x, y, z] = [10, 20, 30]\nprint(x)\nprint(y)\nprint(z)", {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual([10, 20, 30]);
    });

    it("errors if value is not an array", async () => {
      await expect(run('allow\n  fs.read\nlet [a, b] = 42')).rejects.toThrow(
        "destructuring requires an array value",
      );
    });

    it("assigns null for missing elements", async () => {
      const prints: BriefValue[] = [];
      await run("allow\n  fs.read\nlet [a, b, c] = [1]\nprint(a)\nprint(b)\nprint(c)", {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual([1, null, null]);
    });

    it("ignores extra elements", async () => {
      const prints: BriefValue[] = [];
      await run("allow\n  fs.read\nlet [a, b] = [1, 2, 3, 4]\nprint(a)\nprint(b)", {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual([1, 2]);
    });

    it("works with expression values", async () => {
      const prints: BriefValue[] = [];
      await run(`allow
  fs.read
async fn getPair() {
  return [100, 200]
}
let [a, b] = getPair()
print(a)
print(b)`, {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual([100, 200]);
    });
  });

  describe("expanded stdlib", () => {
    it("contains() works on strings", async () => {
      const prints: BriefValue[] = [];
      await run('allow\n  fs.read\nprint(contains("hello world", "world"))', {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual([true]);
    });

    it("contains() works on arrays", async () => {
      const prints: BriefValue[] = [];
      await run('allow\n  fs.read\nprint(contains([1, 2, 3], 2))', {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual([true]);
    });

    it("startsWith() and endsWith()", async () => {
      const prints: BriefValue[] = [];
      await run('allow\n  fs.read\nprint(startsWith("hello", "hel"))\nprint(endsWith("hello", "llo"))', {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual([true, true]);
    });

    it("replace() works", async () => {
      const prints: BriefValue[] = [];
      await run('allow\n  fs.read\nprint(replace("hello world", "world", "brief"))', {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual(["hello brief"]);
    });

    it("toUpper() and toLower()", async () => {
      const prints: BriefValue[] = [];
      await run('allow\n  fs.read\nprint(toUpper("hello"))\nprint(toLower("HELLO"))', {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual(["HELLO", "hello"]);
    });

    it("push() returns new array", async () => {
      const prints: BriefValue[] = [];
      await run('allow\n  fs.read\nlet arr = push([1, 2], 3)\nprint(arr)', {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual([[1, 2, 3]]);
    });

    it("concat() merges arrays", async () => {
      const prints: BriefValue[] = [];
      await run('allow\n  fs.read\nlet arr = concat([1, 2], [3, 4])\nprint(arr)', {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual([[1, 2, 3, 4]]);
    });

    it("range() generates sequence", async () => {
      const prints: BriefValue[] = [];
      await run('allow\n  fs.read\nlet nums = range(0, 5)\nprint(nums)', {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual([[0, 1, 2, 3, 4]]);
    });

    it("slice() works on arrays", async () => {
      const prints: BriefValue[] = [];
      await run('allow\n  fs.read\nprint(slice([1, 2, 3, 4], 1, 3))', {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual([[2, 3]]);
    });

    it("flat() flattens one level", async () => {
      const prints: BriefValue[] = [];
      await run('allow\n  fs.read\nprint(flat([[1, 2], [3, 4]]))', {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual([[1, 2, 3, 4]]);
    });

    it("reverse() reverses array", async () => {
      const prints: BriefValue[] = [];
      await run('allow\n  fs.read\nprint(reverse([1, 2, 3]))', {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual([[3, 2, 1]]);
    });

    it("sort() sorts numbers numerically", async () => {
      const prints: BriefValue[] = [];
      await run('allow\n  fs.read\nprint(sort([3, 1, 2]))', {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual([[1, 2, 3]]);
    });

    it("sort() sorts strings alphabetically", async () => {
      const prints: BriefValue[] = [];
      await run('allow\n  fs.read\nprint(sort(["banana", "apple", "cherry"]))', {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual([["apple", "banana", "cherry"]]);
    });

    it("unique() deduplicates", async () => {
      const prints: BriefValue[] = [];
      await run('allow\n  fs.read\nprint(unique([1, 2, 2, 3, 1]))', {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual([[1, 2, 3]]);
    });

    it("indexOf() returns index", async () => {
      const prints: BriefValue[] = [];
      await run('allow\n  fs.read\nprint(indexOf([10, 20, 30], 20))\nprint(indexOf([10, 20, 30], 99))', {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual([1, -1]);
    });

    it("typeOf() returns type strings", async () => {
      const prints: BriefValue[] = [];
      await run('allow\n  fs.read\nprint(typeOf("hi"))\nprint(typeOf(42))\nprint(typeOf(true))\nprint(typeOf(null))\nprint(typeOf([1]))', {
        printFn: (...a) => prints.push(...a),
      });
      expect(prints).toEqual(["string", "number", "boolean", "null", "array"]);
    });
  });
});
