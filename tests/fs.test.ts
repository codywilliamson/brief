import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as nodeFs from "node:fs/promises";
import * as nodePath from "node:path";
import * as os from "node:os";
import { fsExists, fsMkdir, fsList } from "../src/stdlib/fs.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await nodeFs.mkdtemp(nodePath.join(os.tmpdir(), "brief-test-"));
});

afterEach(async () => {
  await nodeFs.rm(tmpDir, { recursive: true, force: true });
});

describe("fs.exists", () => {
  it("returns true for existing file", async () => {
    const file = nodePath.join(tmpDir, "test.txt");
    await nodeFs.writeFile(file, "hello");
    const result = await fsExists(file);
    expect(result).toEqual({ kind: "ok", value: true });
  });

  it("returns false for nonexistent file", async () => {
    const result = await fsExists(nodePath.join(tmpDir, "nope.txt"));
    expect(result).toEqual({ kind: "ok", value: false });
  });

  it("returns true for existing directory", async () => {
    const result = await fsExists(tmpDir);
    expect(result).toEqual({ kind: "ok", value: true });
  });

  it("fails on non-string input", async () => {
    const result = await fsExists(42 as any);
    expect(result).toEqual({ kind: "failed", reason: "fs.exists path must be a string" });
  });
});

describe("fs.mkdir", () => {
  it("creates a directory", async () => {
    const dir = nodePath.join(tmpDir, "newdir");
    const result = await fsMkdir(dir);
    expect(result).toEqual({ kind: "ok", value: null });
    const stat = await nodeFs.stat(dir);
    expect(stat.isDirectory()).toBe(true);
  });

  it("creates nested directories", async () => {
    const dir = nodePath.join(tmpDir, "a", "b", "c");
    const result = await fsMkdir(dir);
    expect(result).toEqual({ kind: "ok", value: null });
    const stat = await nodeFs.stat(dir);
    expect(stat.isDirectory()).toBe(true);
  });

  it("succeeds if directory already exists", async () => {
    const result = await fsMkdir(tmpDir);
    expect(result).toEqual({ kind: "ok", value: null });
  });

  it("fails on non-string input", async () => {
    const result = await fsMkdir(42 as any);
    expect(result).toEqual({ kind: "failed", reason: "fs.mkdir path must be a string" });
  });
});

describe("fs.list", () => {
  it("lists files in directory", async () => {
    await nodeFs.writeFile(nodePath.join(tmpDir, "a.txt"), "");
    await nodeFs.writeFile(nodePath.join(tmpDir, "b.txt"), "");
    const result = await fsList(tmpDir);
    expect(result.kind).toBe("ok");
    const files = (result as any).value as string[];
    expect(files.sort()).toEqual(["a.txt", "b.txt"]);
  });

  it("lists empty directory", async () => {
    const empty = nodePath.join(tmpDir, "empty");
    await nodeFs.mkdir(empty);
    const result = await fsList(empty);
    expect(result).toEqual({ kind: "ok", value: [] });
  });

  it("includes hidden files", async () => {
    await nodeFs.writeFile(nodePath.join(tmpDir, ".hidden"), "");
    await nodeFs.writeFile(nodePath.join(tmpDir, "visible.txt"), "");
    const result = await fsList(tmpDir);
    expect(result.kind).toBe("ok");
    const files = (result as any).value as string[];
    expect(files.sort()).toEqual([".hidden", "visible.txt"]);
  });

  it("fails on nonexistent directory", async () => {
    const result = await fsList(nodePath.join(tmpDir, "nope"));
    expect(result.kind).toBe("failed");
  });

  it("fails on non-string input", async () => {
    const result = await fsList(42 as any);
    expect(result).toEqual({ kind: "failed", reason: "fs.list path must be a string" });
  });
});
