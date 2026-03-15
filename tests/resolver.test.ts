import { describe, it, expect } from "vitest";
import { parse } from "../src/parser.js";
import { resolve, ResolveError } from "../src/resolver.js";

function resolveSource(src: string) {
  return resolve(parse(src));
}

describe("resolver", () => {
  it("collects valid permissions", () => {
    const result = resolveSource("allow\n  fs.read\n  ai.complete\nprint(1)");
    expect(result.permissions).toEqual(new Set(["fs.read", "ai.complete"]));
    expect(result.errors).toHaveLength(0);
  });

  it("reports unknown permissions", () => {
    const result = resolveSource("allow\n  fs.read\n  db.query\nprint(1)");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain("unknown permission");
  });

  it("collects function declarations", () => {
    const result = resolveSource("allow\n  fs.read\nasync fn foo() {\n  return 1\n}\nprint(1)");
    expect(result.functions.has("foo")).toBe(true);
  });

  it("reports duplicate function names", () => {
    const result = resolveSource(
      "allow\n  fs.read\nasync fn foo() {\n  return 1\n}\nasync fn foo() {\n  return 2\n}\nprint(1)"
    );
    expect(result.errors.some(e => e.message.includes("duplicate function"))).toBe(true);
  });

  it("resolves let declarations in scope", () => {
    const result = resolveSource('allow\n  fs.read\nlet x = 42\nprint(x)');
    expect(result.errors).toHaveLength(0);
  });

  it("resolves function params in body scope", () => {
    const result = resolveSource("allow\n  fs.read\nasync fn add(a, b) {\n  return a + b\n}\nprint(1)");
    expect(result.errors).toHaveLength(0);
  });

  it("resolves for loop variable in body scope", () => {
    const result = resolveSource("allow\n  fs.read\nlet items = [1, 2]\nfor item in items {\n  print(item)\n}");
    expect(result.errors).toHaveLength(0);
  });

  it("resolves when branch bindings", () => {
    const result = resolveSource("allow\n  fs.read\nlet r = Ok(1)\nwhen r {\n  ok(v) => print(v)\n  failed(e) => print(e)\n}");
    expect(result.errors).toHaveLength(0);
  });

  it("resolves builtins without declaration", () => {
    const result = resolveSource('allow\n  fs.read\nprint(len("hi"))');
    expect(result.errors).toHaveLength(0);
  });
});
