import { describe, it, expect } from "vitest";
import {
  briefPathJoin,
  briefPathDirname,
  briefPathBasename,
  briefPathExtname,
  briefJsonParse,
  briefJsonStringify,
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
