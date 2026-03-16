import { describe, it, expect } from "vitest";
import {
  briefPathJoin,
  briefPathDirname,
  briefPathBasename,
  briefPathExtname,
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
