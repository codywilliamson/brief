import { describe, it, expect } from "vitest";
import { runBrief, createToolRegistry } from "../src/runtime.js";
import type { BriefValue } from "../src/stdlib/core.js";

describe("runtime", () => {
  it("runs a simple program", async () => {
    const prints: BriefValue[] = [];
    await runBrief({
      source: 'allow\n  fs.read\nprint("hello")',
      printFn: (...a) => prints.push(...a),
    });
    expect(prints).toEqual(["hello"]);
  });

  it("uses tool registry", async () => {
    const reg = createToolRegistry();
    reg.register("fs.read", async (path) => ({
      kind: "ok",
      value: `content of ${path}`,
    }));

    const prints: BriefValue[] = [];
    await runBrief({
      source: 'allow\n  fs.read\nlet data =\n  await ask fs.read("file.txt")\n  or fail "err"\nprint(data)',
      registry: reg,
      printFn: (...a) => prints.push(...a),
    });
    expect(prints).toEqual(["content of file.txt"]);
  });

  it("uses mock entries", async () => {
    const prints: BriefValue[] = [];
    await runBrief({
      source: 'allow\n  fs.read\nlet data =\n  await ask fs.read("file.txt")\n  or fail "err"\nprint(data)',
      mocks: [
        { tool: "fs.read", args: ["file.txt"], returnValue: { kind: "ok", value: "mocked content" } },
      ],
      printFn: (...a) => prints.push(...a),
    });
    expect(prints).toEqual(["mocked content"]);
  });

  it("specific mocks take precedence over wildcards", async () => {
    const prints: BriefValue[] = [];
    await runBrief({
      source: 'allow\n  fs.read\nlet a =\n  await ask fs.read("a.txt")\n  or fail "err"\nlet b =\n  await ask fs.read("other.txt")\n  or fail "err"\nprint(a)\nprint(b)',
      mocks: [
        { tool: "fs.read", args: null, returnValue: { kind: "ok", value: "default" } },
        { tool: "fs.read", args: ["a.txt"], returnValue: { kind: "ok", value: "specific" } },
      ],
      printFn: (...a) => prints.push(...a),
    });
    expect(prints).toEqual(["specific", "default"]);
  });

  it("handles failed mocks", async () => {
    await expect(runBrief({
      source: 'allow\n  fs.read\nlet data =\n  await ask fs.read("f")\n  or fail "read error"',
      mocks: [
        { tool: "fs.read", args: null, returnValue: { kind: "failed", reason: "not found" } },
      ],
    })).rejects.toThrow("read error");
  });

  it("stream mocks work", async () => {
    const prints: BriefValue[] = [];
    await runBrief({
      source: `allow
  ai.stream
for await chunk from ask ai.stream("prompt") {
  print(chunk)
}`,
      mocks: [
        { tool: "ai.stream", args: null, returnValue: { kind: "ok", value: "streamed content" } },
      ],
      printFn: (...a) => prints.push(...a),
    });
    expect(prints).toEqual(["streamed content"]);
  });

  it("reports resolve errors", async () => {
    await expect(runBrief({
      source: "allow\n  db.query\nprint(1)",
    })).rejects.toThrow("unknown permission");
  });

  it("returns last value", async () => {
    const result = await runBrief({
      source: "allow\n  fs.read\n42",
    });
    expect(result.value).toBe(42);
  });
});
