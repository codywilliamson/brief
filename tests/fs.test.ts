import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as nodeFs from "node:fs/promises";
import * as nodePath from "node:path";
import * as os from "node:os";
import { fsExists, fsMkdir, fsList, fsStat, fsAppend } from "../src/stdlib/fs.js";

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

describe("fs.stat", () => {
  it("returns file stats as kv array", async () => {
    const file = nodePath.join(tmpDir, "test.txt");
    await nodeFs.writeFile(file, "hello");
    const result = await fsStat(file);
    expect(result.kind).toBe("ok");
    const arr = (result as any).value as any[];
    expect(arr.length).toBe(10);
    expect(arr[0]).toBe("size");
    expect(arr[1]).toBe(5);
    expect(arr[2]).toBe("isFile");
    expect(arr[3]).toBe(true);
    expect(arr[4]).toBe("isDir");
    expect(arr[5]).toBe(false);
    expect(arr[6]).toBe("modified");
    expect(typeof arr[7]).toBe("string");
    expect(arr[8]).toBe("created");
    expect(typeof arr[9]).toBe("string");
  });

  it("returns directory stats", async () => {
    const result = await fsStat(tmpDir);
    expect(result.kind).toBe("ok");
    const arr = (result as any).value as any[];
    expect(arr[2]).toBe("isFile");
    expect(arr[3]).toBe(false);
    expect(arr[4]).toBe("isDir");
    expect(arr[5]).toBe(true);
  });

  it("fails on nonexistent path", async () => {
    const result = await fsStat(nodePath.join(tmpDir, "nope"));
    expect(result.kind).toBe("failed");
  });

  it("fails on non-string input", async () => {
    const result = await fsStat(42 as any);
    expect(result).toEqual({ kind: "failed", reason: "fs.stat path must be a string" });
  });
});

describe("fs.append", () => {
  it("appends to existing file", async () => {
    const file = nodePath.join(tmpDir, "log.txt");
    await nodeFs.writeFile(file, "line1\n");
    const result = await fsAppend(file, "line2\n");
    expect(result).toEqual({ kind: "ok", value: null });
    const content = await nodeFs.readFile(file, "utf-8");
    expect(content).toBe("line1\nline2\n");
  });

  it("creates file if it does not exist", async () => {
    const file = nodePath.join(tmpDir, "new.txt");
    const result = await fsAppend(file, "first line\n");
    expect(result).toEqual({ kind: "ok", value: null });
    const content = await nodeFs.readFile(file, "utf-8");
    expect(content).toBe("first line\n");
  });

  it("fails on non-string path", async () => {
    const result = await fsAppend(42 as any, "content");
    expect(result).toEqual({ kind: "failed", reason: "fs.append path must be a string" });
  });

  it("fails on non-string content", async () => {
    const result = await fsAppend("file.txt", 42 as any);
    expect(result).toEqual({ kind: "failed", reason: "fs.append content must be a string" });
  });
});
