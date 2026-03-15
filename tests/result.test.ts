import { describe, it, expect } from "vitest";
import {
  Ok, failed, isOk, isFailed,
  unwrapOrFail, unwrapOrReturn,
  BriefRuntimeError, BriefPermissionError,
} from "../src/result.js";

describe("Result type", () => {
  it("creates Ok values", () => {
    const r = Ok("hello");
    expect(r.kind).toBe("ok");
    expect(isOk(r)).toBe(true);
    expect(isFailed(r)).toBe(false);
    if (isOk(r)) expect(r.value).toBe("hello");
  });

  it("creates failed values", () => {
    const r = failed("oops");
    expect(r.kind).toBe("failed");
    expect(isFailed(r)).toBe(true);
    expect(isOk(r)).toBe(false);
    if (isFailed(r)) expect(r.reason).toBe("oops");
  });

  it("Ok works with different types", () => {
    expect(isOk(Ok(42))).toBe(true);
    expect(isOk(Ok(null))).toBe(true);
    expect(isOk(Ok([1, 2]))).toBe(true);
    expect(isOk(Ok(true))).toBe(true);
  });

  it("unwrapOrFail returns value on Ok", () => {
    expect(unwrapOrFail(Ok("val"), "err")).toBe("val");
  });

  it("unwrapOrFail throws on failed", () => {
    expect(() => unwrapOrFail(failed("bad"), "custom msg")).toThrow(BriefRuntimeError);
    expect(() => unwrapOrFail(failed("bad"), "custom msg")).toThrow("custom msg");
  });

  it("unwrapOrReturn returns value on Ok", () => {
    expect(unwrapOrReturn(Ok("val"), "default")).toBe("val");
  });

  it("unwrapOrReturn returns default on failed", () => {
    expect(unwrapOrReturn(failed("bad"), "default")).toBe("default");
  });
});

describe("BriefRuntimeError", () => {
  it("formats without line info", () => {
    const e = new BriefRuntimeError("something broke");
    expect(e.format()).toBe("Brief runtime error: something broke");
  });

  it("formats with line info", () => {
    const e = new BriefRuntimeError("something broke", 5, 'let x = bad()');
    expect(e.format()).toContain("at line 5");
    expect(e.format()).toContain("let x = bad()");
  });
});

describe("BriefPermissionError", () => {
  it("formats permission error", () => {
    const e = new BriefPermissionError("fs.write", 10, 'await ask fs.write("f", "c")');
    expect(e.format()).toContain("Brief permission error");
    expect(e.format()).toContain("fs.write");
    expect(e.format()).toContain("not declared in allow block");
    expect(e.format()).toContain("at line 10");
  });
});
