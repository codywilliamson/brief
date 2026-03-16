import { describe, it, expect, vi } from "vitest";
import {
  briefPathJoin,
  briefPathDirname,
  briefPathBasename,
  briefPathExtname,
  briefJsonParse,
  briefJsonStringify,
  briefFloor,
  briefCeil,
  briefRound,
  briefAbs,
  briefIndexOf,
  briefDateNow,
  briefDateParse,
  briefDateDiff,
} from "../src/stdlib/core.js";

describe("path functions", () => {
  describe("pathJoin", () => {
    it("joins two segments", () => {
      expect(briefPathJoin("home", "user")).toBe("home/user");
    });
    it("joins three segments", () => {
      expect(briefPathJoin("home", "user", "notes")).toBe("home/user/notes");
    });
    it("preserves leading slash", () => {
      expect(briefPathJoin("/home", "user")).toBe("/home/user");
    });
    it("throws on non-string args", () => {
      expect(() => briefPathJoin(42 as any)).toThrow("pathJoin() expects strings");
    });
  });

  describe("pathDirname", () => {
    it("returns directory of absolute path", () => {
      expect(briefPathDirname("/home/user/file.md")).toBe("/home/user");
    });
    it("returns directory of relative path", () => {
      expect(briefPathDirname("notes/file.md")).toBe("notes");
    });
    it("throws on non-string", () => {
      expect(() => briefPathDirname(42 as any)).toThrow("pathDirname() expects string");
    });
  });

  describe("pathBasename", () => {
    it("returns filename", () => {
      expect(briefPathBasename("/home/user/file.md")).toBe("file.md");
    });
    it("returns filename without directory", () => {
      expect(briefPathBasename("file.md")).toBe("file.md");
    });
    it("throws on non-string", () => {
      expect(() => briefPathBasename(42 as any)).toThrow("pathBasename() expects string");
    });
  });

  describe("pathExtname", () => {
    it("returns .md extension", () => {
      expect(briefPathExtname("file.md")).toBe(".md");
    });
    it("returns .ts extension", () => {
      expect(briefPathExtname("/home/user/index.ts")).toBe(".ts");
    });
    it("returns empty string for no extension", () => {
      expect(briefPathExtname("Makefile")).toBe("");
    });
    it("throws on non-string", () => {
      expect(() => briefPathExtname(42 as any)).toThrow("pathExtname() expects string");
    });
  });
});

describe("json functions", () => {
  describe("jsonParse", () => {
    it("parses object to flat kv array", () => {
      expect(briefJsonParse('{"name": "alice", "age": 30}')).toEqual(["name", "alice", "age", 30]);
    });
    it("parses nested object recursively", () => {
      expect(briefJsonParse('{"a": {"b": 1}}')).toEqual(["a", ["b", 1]]);
    });
    it("passes arrays through", () => {
      expect(briefJsonParse("[1, 2, 3]")).toEqual([1, 2, 3]);
    });
    it("passes primitives through", () => {
      expect(briefJsonParse("42")).toBe(42);
      expect(briefJsonParse('"hello"')).toBe("hello");
      expect(briefJsonParse("true")).toBe(true);
      expect(briefJsonParse("null")).toBe(null);
    });
    it("throws on invalid JSON", () => {
      expect(() => briefJsonParse("{bad}")).toThrow("jsonParse() failed");
    });
    it("throws on non-string input", () => {
      expect(() => briefJsonParse(42 as any)).toThrow("jsonParse() expects string");
    });
  });

  describe("jsonStringify", () => {
    it("converts kv array with string keys to JSON object", () => {
      expect(briefJsonStringify(["name", "alice", "age", 30])).toBe('{"name":"alice","age":30}');
    });
    it("converts nested kv arrays recursively", () => {
      expect(briefJsonStringify(["a", ["b", 1]])).toBe('{"a":{"b":1}}');
    });
    it("passes regular arrays through", () => {
      expect(briefJsonStringify([1, 2, 3])).toBe("[1,2,3]");
    });
    it("does not convert odd-length arrays to objects", () => {
      expect(briefJsonStringify(["a", "b", "c"])).toBe('["a","b","c"]');
    });
    it("does not convert arrays with non-string keys to objects", () => {
      expect(briefJsonStringify([1, 2, 3, 4])).toBe("[1,2,3,4]");
    });
    it("stringifies primitives", () => {
      expect(briefJsonStringify(42)).toBe("42");
      expect(briefJsonStringify("hello")).toBe('"hello"');
      expect(briefJsonStringify(true)).toBe("true");
      expect(briefJsonStringify(null)).toBe("null");
    });
  });
});

describe("indexOf (string support)", () => {
  it("finds substring index", () => {
    expect(briefIndexOf("hello world", "world")).toBe(6);
  });
  it("returns -1 when substring not found", () => {
    expect(briefIndexOf("hello", "xyz")).toBe(-1);
  });
  it("finds first occurrence", () => {
    expect(briefIndexOf("abcabc", "bc")).toBe(1);
  });
  it("still works on arrays", () => {
    expect(briefIndexOf(["a", "b", "c"], "b")).toBe(1);
  });
});

describe("math functions", () => {
  describe("floor", () => {
    it("floors positive float", () => {
      expect(briefFloor(3.7)).toBe(3);
    });
    it("floors negative float", () => {
      expect(briefFloor(-2.3)).toBe(-3);
    });
    it("passes through integer", () => {
      expect(briefFloor(5)).toBe(5);
    });
    it("throws on non-number", () => {
      expect(() => briefFloor("3" as any)).toThrow("floor() expects number");
    });
  });

  describe("ceil", () => {
    it("ceils positive float", () => {
      expect(briefCeil(3.2)).toBe(4);
    });
    it("ceils negative float", () => {
      expect(briefCeil(-2.7)).toBe(-2);
    });
    it("passes through integer", () => {
      expect(briefCeil(5)).toBe(5);
    });
    it("throws on non-number", () => {
      expect(() => briefCeil("3" as any)).toThrow("ceil() expects number");
    });
  });

  describe("round", () => {
    it("rounds down at .4", () => {
      expect(briefRound(3.4)).toBe(3);
    });
    it("rounds up at .5", () => {
      expect(briefRound(3.5)).toBe(4);
    });
    it("throws on non-number", () => {
      expect(() => briefRound("3" as any)).toThrow("round() expects number");
    });
  });

  describe("abs", () => {
    it("passes through positive", () => {
      expect(briefAbs(5)).toBe(5);
    });
    it("converts negative to positive", () => {
      expect(briefAbs(-7)).toBe(7);
    });
    it("handles zero", () => {
      expect(briefAbs(0)).toBe(0);
    });
    it("throws on non-number", () => {
      expect(() => briefAbs("3" as any)).toThrow("abs() expects number");
    });
  });
});

describe("date functions", () => {
  describe("dateNow", () => {
    it("returns a string matching YYYY-MM-DD pattern", () => {
      const result = briefDateNow();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("returns today's date", () => {
      const expected = new Date().toISOString().split("T")[0];
      expect(briefDateNow()).toBe(expected);
    });
  });

  describe("dateParse", () => {
    it("parses a valid date", () => {
      const result = briefDateParse("2026-03-16");
      // result is a flat kv array
      expect(result).toContain("year");
      expect(result).toContain(2026);
      expect(result).toContain("month");
      expect(result).toContain(3);
      expect(result).toContain("day");
      expect(result).toContain(16);
    });

    it("returns correct dayOfWeek (Monday=1)", () => {
      // 2026-03-16 is a Monday
      const result = briefDateParse("2026-03-16") as any[];
      const dowIdx = result.indexOf("dayOfWeek");
      expect(result[dowIdx + 1]).toBe(1);

      // 2026-03-22 is a Sunday
      const result2 = briefDateParse("2026-03-22") as any[];
      const dowIdx2 = result2.indexOf("dayOfWeek");
      expect(result2[dowIdx2 + 1]).toBe(7);
    });

    it("returns correct isoWeek", () => {
      // 2026-03-16 is ISO week 12
      const result = briefDateParse("2026-03-16") as any[];
      const weekIdx = result.indexOf("isoWeek");
      expect(result[weekIdx + 1]).toBe(12);

      // 2026-01-01 is ISO week 1 (Thursday is Jan 1)
      const result2 = briefDateParse("2026-01-01") as any[];
      const weekIdx2 = result2.indexOf("isoWeek");
      expect(result2[weekIdx2 + 1]).toBe(1);
    });

    it("returns correct dayOfYear", () => {
      // 2026-03-16 is day 75 (31 + 28 + 16)
      const result = briefDateParse("2026-03-16") as any[];
      const doyIdx = result.indexOf("dayOfYear");
      expect(result[doyIdx + 1]).toBe(75);

      // 2026-01-01 is day 1
      const result2 = briefDateParse("2026-01-01") as any[];
      const doyIdx2 = result2.indexOf("dayOfYear");
      expect(result2[doyIdx2 + 1]).toBe(1);
    });

    it("returns a timestamp", () => {
      const result = briefDateParse("2026-03-16") as any[];
      const tsIdx = result.indexOf("timestamp");
      expect(typeof result[tsIdx + 1]).toBe("number");
      // timestamp should correspond to 2026-03-16T00:00:00.000Z
      expect(result[tsIdx + 1]).toBe(new Date("2026-03-16T00:00:00.000Z").getTime());
    });

    it("throws on invalid input", () => {
      expect(() => briefDateParse("not-a-date")).toThrow();
      expect(() => briefDateParse("2026-13-01")).toThrow();
    });

    it("throws on non-string", () => {
      expect(() => briefDateParse(42 as any)).toThrow("dateParse() expects string");
    });
  });

  describe("dateDiff", () => {
    it("returns days between two dates", () => {
      expect(briefDateDiff("2026-03-16", "2026-03-10", "days")).toBe(6);
    });

    it("returns weeks between two dates", () => {
      expect(briefDateDiff("2026-03-16", "2026-01-05", "weeks")).toBe(10);
    });

    it("returns absolute value (order doesn't matter)", () => {
      expect(briefDateDiff("2026-03-10", "2026-03-16", "days")).toBe(6);
      expect(briefDateDiff("2026-03-16", "2026-03-10", "days")).toBe(6);
    });

    it("same date returns 0", () => {
      expect(briefDateDiff("2026-03-16", "2026-03-16", "days")).toBe(0);
      expect(briefDateDiff("2026-03-16", "2026-03-16", "weeks")).toBe(0);
    });

    it("throws on invalid unit", () => {
      expect(() => briefDateDiff("2026-03-16", "2026-03-10", "months" as any)).toThrow("dateDiff() unit must be");
    });

    it("throws on non-string inputs", () => {
      expect(() => briefDateDiff(42 as any, "2026-03-10", "days")).toThrow("dateDiff() expects string");
      expect(() => briefDateDiff("2026-03-16", 42 as any, "days")).toThrow("dateDiff() expects string");
    });
  });
});
