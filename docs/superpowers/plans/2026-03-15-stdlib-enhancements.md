# Brief Stdlib Enhancements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 9 new filesystem tools and 6 core utility functions to Brief's standard library.

**Architecture:** New fs tools follow the existing async/permission-gated/BriefResult pattern in `src/stdlib/fs.ts`. New core functions follow the sync pattern in `src/stdlib/core.ts`. All tools registered in `src/cli.ts`, permissions in `src/resolver.ts`.

**Tech Stack:** TypeScript, Node.js 22 (`node:fs/promises`, `node:path`), Vitest

**Spec:** `docs/superpowers/specs/2026-03-15-stdlib-enhancements-design.md`

---

## Chunk 1: Core Utility Functions

### Task 1: Path Functions

**Files:**
- Modify: `src/stdlib/core.ts:189-215` (add functions + register in STDLIB_FUNCTIONS)
- Modify: `src/resolver.ts:32-39` (add to BUILTINS)
- Create: `tests/core.test.ts`

- [ ] **Step 1: Write failing tests for path functions**

Create `tests/core.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/shockbirds/dev/brief && pnpm test -- tests/core.test.ts`
Expected: FAIL — functions not exported yet

- [ ] **Step 3: Implement path functions**

Add to `src/stdlib/core.ts` before `STDLIB_FUNCTIONS` (before line 189):

```typescript
import * as nodePath from "node:path";

export function briefPathJoin(...args: BriefValue[]): string {
  for (const a of args) {
    if (typeof a !== "string") throw new Error("pathJoin() expects strings");
  }
  return nodePath.join(...(args as string[]));
}

export function briefPathDirname(p: BriefValue): string {
  if (typeof p !== "string") throw new Error("pathDirname() expects string");
  return nodePath.dirname(p);
}

export function briefPathBasename(p: BriefValue): string {
  if (typeof p !== "string") throw new Error("pathBasename() expects string");
  return nodePath.basename(p);
}

export function briefPathExtname(p: BriefValue): string {
  if (typeof p !== "string") throw new Error("pathExtname() expects string");
  return nodePath.extname(p);
}
```

Add to `STDLIB_FUNCTIONS` map:

```typescript
  pathJoin: (...args) => briefPathJoin(...args),
  pathDirname: (p) => briefPathDirname(p),
  pathBasename: (p) => briefPathBasename(p),
  pathExtname: (p) => briefPathExtname(p),
```

Add to `BUILTINS` set in `src/resolver.ts:32-39`:

```typescript
  "pathJoin", "pathDirname", "pathBasename", "pathExtname",
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/shockbirds/dev/brief && pnpm test -- tests/core.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `cd /home/shockbirds/dev/brief && pnpm test`
Expected: All existing tests still pass

- [ ] **Step 6: Commit**

```bash
cd /home/shockbirds/dev/brief
git add src/stdlib/core.ts src/resolver.ts tests/core.test.ts
git commit -m "feat: add path utility functions (pathJoin, pathDirname, pathBasename, pathExtname)"
```

---

### Task 2: JSON Functions

**Files:**
- Modify: `src/stdlib/core.ts` (add functions + register)
- Modify: `src/resolver.ts` (add to BUILTINS)
- Modify: `tests/core.test.ts`

- [ ] **Step 1: Write failing tests for JSON functions**

Add to `tests/core.test.ts`:

```typescript
import {
  briefJsonParse,
  briefJsonStringify,
} from "../src/stdlib/core.js";

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/shockbirds/dev/brief && pnpm test -- tests/core.test.ts`
Expected: FAIL — functions not exported yet

- [ ] **Step 3: Implement JSON functions**

Add to `src/stdlib/core.ts` before `STDLIB_FUNCTIONS`:

```typescript
export function briefJsonParse(str: BriefValue): BriefValue {
  if (typeof str !== "string") throw new Error("jsonParse() expects string");
  try {
    const parsed = JSON.parse(str);
    return jsonToBrief(parsed);
  } catch {
    throw new Error(`jsonParse() failed to parse input`);
  }
}

function jsonToBrief(value: unknown): BriefValue {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(jsonToBrief);
  if (typeof value === "object") {
    const result: BriefValue[] = [];
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result.push(k, jsonToBrief(v));
    }
    return result;
  }
  return null;
}

export function briefJsonStringify(value: BriefValue): string {
  return JSON.stringify(briefToJson(value));
}

function isKvArray(arr: BriefValue[]): boolean {
  if (arr.length === 0 || arr.length % 2 !== 0) return false;
  for (let i = 0; i < arr.length; i += 2) {
    if (typeof arr[i] !== "string") return false;
  }
  return true;
}

function briefToJson(value: BriefValue): unknown {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    if (isKvArray(value)) {
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < value.length; i += 2) {
        obj[value[i] as string] = briefToJson(value[i + 1]);
      }
      return obj;
    }
    return value.map(briefToJson);
  }
  return null;
}
```

Add to `STDLIB_FUNCTIONS` map:

```typescript
  jsonParse: (s) => briefJsonParse(s),
  jsonStringify: (v) => briefJsonStringify(v),
```

Add to `BUILTINS` set in `src/resolver.ts`:

```typescript
  "jsonParse", "jsonStringify",
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/shockbirds/dev/brief && pnpm test -- tests/core.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `cd /home/shockbirds/dev/brief && pnpm test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
cd /home/shockbirds/dev/brief
git add src/stdlib/core.ts src/resolver.ts tests/core.test.ts
git commit -m "feat: add json utility functions (jsonParse, jsonStringify)"
```

---

## Chunk 2: Filesystem Tools — Basic Operations

### Task 3: fs.exists, fs.mkdir, fs.list

**Files:**
- Modify: `src/stdlib/fs.ts` (add tool functions)
- Modify: `src/resolver.ts:26-30` (add permissions)
- Modify: `src/cli.ts:19-30` (register tools)
- Create: `tests/fs.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/fs.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/shockbirds/dev/brief && pnpm test -- tests/fs.test.ts`
Expected: FAIL — functions not exported

- [ ] **Step 3: Implement fs.exists, fs.mkdir, fs.list**

Add to `src/stdlib/fs.ts`:

```typescript
export async function fsExists(path: BriefValue): Promise<BriefResult> {
  if (typeof path !== "string") return { kind: "failed", reason: "fs.exists path must be a string" };
  try {
    await nodeFs.access(path);
    return { kind: "ok", value: true };
  } catch (e: any) {
    if (e.code === "ENOENT") return { kind: "ok", value: false };
    return { kind: "failed", reason: e.message ?? String(e) };
  }
}

export async function fsMkdir(path: BriefValue): Promise<BriefResult> {
  if (typeof path !== "string") return { kind: "failed", reason: "fs.mkdir path must be a string" };
  try {
    await nodeFs.mkdir(path, { recursive: true });
    return { kind: "ok", value: null };
  } catch (e: any) {
    return { kind: "failed", reason: e.message ?? String(e) };
  }
}

export async function fsList(path: BriefValue): Promise<BriefResult> {
  if (typeof path !== "string") return { kind: "failed", reason: "fs.list path must be a string" };
  try {
    const entries = await nodeFs.readdir(path);
    return { kind: "ok", value: entries };
  } catch (e: any) {
    return { kind: "failed", reason: e.message ?? String(e) };
  }
}
```

- [ ] **Step 4: Register permissions and tools**

Add to `VALID_PERMISSIONS` in `src/resolver.ts:26-30`:

```typescript
  "fs.exists", "fs.mkdir", "fs.list",
```

Add imports and registrations to `src/cli.ts`:

Update import line:
```typescript
import { fsRead, fsWrite, fsExists, fsMkdir, fsList } from "./stdlib/fs.js";
```

Add registrations in `createDefaultRegistry()`:
```typescript
  reg.register("fs.exists", fsExists);
  reg.register("fs.mkdir", fsMkdir);
  reg.register("fs.list", fsList);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /home/shockbirds/dev/brief && pnpm test -- tests/fs.test.ts`
Expected: PASS

- [ ] **Step 6: Run full test suite**

Run: `cd /home/shockbirds/dev/brief && pnpm test`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
cd /home/shockbirds/dev/brief
git add src/stdlib/fs.ts src/resolver.ts src/cli.ts tests/fs.test.ts
git commit -m "feat: add fs.exists, fs.mkdir, fs.list tools"
```

---

### Task 4: fs.stat, fs.append

**Files:**
- Modify: `src/stdlib/fs.ts`
- Modify: `src/resolver.ts`
- Modify: `src/cli.ts`
- Modify: `tests/fs.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `tests/fs.test.ts`:

```typescript
import { fsStat, fsAppend } from "../src/stdlib/fs.js";

describe("fs.stat", () => {
  it("returns file stats as kv array", async () => {
    const file = nodePath.join(tmpDir, "test.txt");
    await nodeFs.writeFile(file, "hello");
    const result = await fsStat(file);
    expect(result.kind).toBe("ok");
    const arr = (result as any).value as any[];
    // kv array: ["size", n, "isFile", bool, "isDir", bool, "modified", str, "created", str]
    expect(arr.length).toBe(10);
    expect(arr[0]).toBe("size");
    expect(arr[1]).toBe(5); // "hello" = 5 bytes
    expect(arr[2]).toBe("isFile");
    expect(arr[3]).toBe(true);
    expect(arr[4]).toBe("isDir");
    expect(arr[5]).toBe(false);
    expect(arr[6]).toBe("modified");
    expect(typeof arr[7]).toBe("string"); // ISO date
    expect(arr[8]).toBe("created");
    expect(typeof arr[9]).toBe("string"); // ISO date
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/shockbirds/dev/brief && pnpm test -- tests/fs.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement fs.stat and fs.append**

Add to `src/stdlib/fs.ts`:

```typescript
export async function fsStat(path: BriefValue): Promise<BriefResult> {
  if (typeof path !== "string") return { kind: "failed", reason: "fs.stat path must be a string" };
  try {
    const stat = await nodeFs.stat(path);
    return {
      kind: "ok",
      value: [
        "size", stat.size,
        "isFile", stat.isFile(),
        "isDir", stat.isDirectory(),
        "modified", stat.mtime.toISOString(),
        "created", stat.birthtime.toISOString(),
      ],
    };
  } catch (e: any) {
    return { kind: "failed", reason: e.message ?? String(e) };
  }
}

export async function fsAppend(path: BriefValue, content: BriefValue): Promise<BriefResult> {
  if (typeof path !== "string") return { kind: "failed", reason: "fs.append path must be a string" };
  if (typeof content !== "string") return { kind: "failed", reason: "fs.append content must be a string" };
  try {
    await nodeFs.appendFile(path, content, "utf-8");
    return { kind: "ok", value: null };
  } catch (e: any) {
    return { kind: "failed", reason: e.message ?? String(e) };
  }
}
```

- [ ] **Step 4: Register permissions and tools**

Add to `VALID_PERMISSIONS` in `src/resolver.ts`:
```typescript
  "fs.stat", "fs.append",
```

Update import in `src/cli.ts`:
```typescript
import { fsRead, fsWrite, fsExists, fsMkdir, fsList, fsStat, fsAppend } from "./stdlib/fs.js";
```

Add registrations:
```typescript
  reg.register("fs.stat", fsStat);
  reg.register("fs.append", fsAppend);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /home/shockbirds/dev/brief && pnpm test -- tests/fs.test.ts`
Expected: PASS

- [ ] **Step 6: Run full test suite**

Run: `cd /home/shockbirds/dev/brief && pnpm test`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
cd /home/shockbirds/dev/brief
git add src/stdlib/fs.ts src/resolver.ts src/cli.ts tests/fs.test.ts
git commit -m "feat: add fs.stat, fs.append tools"
```

---

## Chunk 3: Filesystem Tools — File Operations

### Task 5: fs.copy, fs.move, fs.delete

**Files:**
- Modify: `src/stdlib/fs.ts`
- Modify: `src/resolver.ts`
- Modify: `src/cli.ts`
- Modify: `tests/fs.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `tests/fs.test.ts`:

```typescript
import { fsCopy, fsMove, fsDelete } from "../src/stdlib/fs.js";

describe("fs.copy", () => {
  it("copies a file", async () => {
    const src = nodePath.join(tmpDir, "src.txt");
    const dst = nodePath.join(tmpDir, "dst.txt");
    await nodeFs.writeFile(src, "content");
    const result = await fsCopy(src, dst);
    expect(result).toEqual({ kind: "ok", value: null });
    expect(await nodeFs.readFile(dst, "utf-8")).toBe("content");
    // source still exists
    expect(await nodeFs.readFile(src, "utf-8")).toBe("content");
  });

  it("overwrites existing destination", async () => {
    const src = nodePath.join(tmpDir, "src.txt");
    const dst = nodePath.join(tmpDir, "dst.txt");
    await nodeFs.writeFile(src, "new");
    await nodeFs.writeFile(dst, "old");
    const result = await fsCopy(src, dst);
    expect(result).toEqual({ kind: "ok", value: null });
    expect(await nodeFs.readFile(dst, "utf-8")).toBe("new");
  });

  it("fails on nonexistent source", async () => {
    const result = await fsCopy(nodePath.join(tmpDir, "nope"), nodePath.join(tmpDir, "dst"));
    expect(result.kind).toBe("failed");
  });

  it("fails on non-string src", async () => {
    const result = await fsCopy(42 as any, "dst");
    expect(result).toEqual({ kind: "failed", reason: "fs.copy src must be a string" });
  });

  it("fails on non-string dst", async () => {
    const result = await fsCopy("src", 42 as any);
    expect(result).toEqual({ kind: "failed", reason: "fs.copy dst must be a string" });
  });
});

describe("fs.move", () => {
  it("moves a file", async () => {
    const src = nodePath.join(tmpDir, "src.txt");
    const dst = nodePath.join(tmpDir, "dst.txt");
    await nodeFs.writeFile(src, "content");
    const result = await fsMove(src, dst);
    expect(result).toEqual({ kind: "ok", value: null });
    expect(await nodeFs.readFile(dst, "utf-8")).toBe("content");
    // source is gone
    await expect(nodeFs.access(src)).rejects.toThrow();
  });

  it("renames a file", async () => {
    const src = nodePath.join(tmpDir, "old.txt");
    const dst = nodePath.join(tmpDir, "new.txt");
    await nodeFs.writeFile(src, "data");
    const result = await fsMove(src, dst);
    expect(result).toEqual({ kind: "ok", value: null });
    expect(await nodeFs.readFile(dst, "utf-8")).toBe("data");
  });

  it("fails on nonexistent source", async () => {
    const result = await fsMove(nodePath.join(tmpDir, "nope"), nodePath.join(tmpDir, "dst"));
    expect(result.kind).toBe("failed");
  });

  it("fails on non-string src", async () => {
    const result = await fsMove(42 as any, "dst");
    expect(result).toEqual({ kind: "failed", reason: "fs.move src must be a string" });
  });

  it("fails on non-string dst", async () => {
    const result = await fsMove("src", 42 as any);
    expect(result).toEqual({ kind: "failed", reason: "fs.move dst must be a string" });
  });
});

describe("fs.delete", () => {
  it("deletes a file", async () => {
    const file = nodePath.join(tmpDir, "test.txt");
    await nodeFs.writeFile(file, "hello");
    const result = await fsDelete(file);
    expect(result).toEqual({ kind: "ok", value: null });
    await expect(nodeFs.access(file)).rejects.toThrow();
  });

  it("deletes a directory recursively", async () => {
    const dir = nodePath.join(tmpDir, "subdir");
    await nodeFs.mkdir(dir);
    await nodeFs.writeFile(nodePath.join(dir, "file.txt"), "data");
    const result = await fsDelete(dir);
    expect(result).toEqual({ kind: "ok", value: null });
    await expect(nodeFs.access(dir)).rejects.toThrow();
  });

  it("succeeds silently on nonexistent path", async () => {
    const result = await fsDelete(nodePath.join(tmpDir, "nope"));
    expect(result).toEqual({ kind: "ok", value: null });
  });

  it("fails on non-string input", async () => {
    const result = await fsDelete(42 as any);
    expect(result).toEqual({ kind: "failed", reason: "fs.delete path must be a string" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/shockbirds/dev/brief && pnpm test -- tests/fs.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement fs.copy, fs.move, fs.delete**

Add to `src/stdlib/fs.ts`:

```typescript
export async function fsCopy(src: BriefValue, dst: BriefValue): Promise<BriefResult> {
  if (typeof src !== "string") return { kind: "failed", reason: "fs.copy src must be a string" };
  if (typeof dst !== "string") return { kind: "failed", reason: "fs.copy dst must be a string" };
  try {
    await nodeFs.copyFile(src, dst);
    return { kind: "ok", value: null };
  } catch (e: any) {
    return { kind: "failed", reason: e.message ?? String(e) };
  }
}

export async function fsMove(src: BriefValue, dst: BriefValue): Promise<BriefResult> {
  if (typeof src !== "string") return { kind: "failed", reason: "fs.move src must be a string" };
  if (typeof dst !== "string") return { kind: "failed", reason: "fs.move dst must be a string" };
  try {
    await nodeFs.rename(src, dst);
    return { kind: "ok", value: null };
  } catch (e: any) {
    if (e.code === "EXDEV") {
      // cross-device: copy then delete
      try {
        await nodeFs.copyFile(src, dst);
        await nodeFs.rm(src, { recursive: true, force: true });
        return { kind: "ok", value: null };
      } catch (e2: any) {
        return { kind: "failed", reason: e2.message ?? String(e2) };
      }
    }
    return { kind: "failed", reason: e.message ?? String(e) };
  }
}

export async function fsDelete(path: BriefValue): Promise<BriefResult> {
  if (typeof path !== "string") return { kind: "failed", reason: "fs.delete path must be a string" };
  try {
    await nodeFs.rm(path, { recursive: true, force: true });
    return { kind: "ok", value: null };
  } catch (e: any) {
    return { kind: "failed", reason: e.message ?? String(e) };
  }
}
```

- [ ] **Step 4: Register permissions and tools**

Add to `VALID_PERMISSIONS` in `src/resolver.ts`:
```typescript
  "fs.copy", "fs.move", "fs.delete",
```

Update import in `src/cli.ts`:
```typescript
import { fsRead, fsWrite, fsExists, fsMkdir, fsList, fsStat, fsAppend, fsCopy, fsMove, fsDelete } from "./stdlib/fs.js";
```

Add registrations:
```typescript
  reg.register("fs.copy", fsCopy);
  reg.register("fs.move", fsMove);
  reg.register("fs.delete", fsDelete);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /home/shockbirds/dev/brief && pnpm test -- tests/fs.test.ts`
Expected: PASS

- [ ] **Step 6: Run full test suite**

Run: `cd /home/shockbirds/dev/brief && pnpm test`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
cd /home/shockbirds/dev/brief
git add src/stdlib/fs.ts src/resolver.ts src/cli.ts tests/fs.test.ts
git commit -m "feat: add fs.copy, fs.move, fs.delete tools"
```

---

### Task 6: fs.glob

**Files:**
- Modify: `src/stdlib/fs.ts`
- Modify: `src/resolver.ts`
- Modify: `src/cli.ts`
- Modify: `tests/fs.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `tests/fs.test.ts`:

```typescript
import { fsGlob } from "../src/stdlib/fs.js";

describe("fs.glob", () => {
  it("matches files by pattern", async () => {
    await nodeFs.writeFile(nodePath.join(tmpDir, "a.md"), "");
    await nodeFs.writeFile(nodePath.join(tmpDir, "b.md"), "");
    await nodeFs.writeFile(nodePath.join(tmpDir, "c.txt"), "");
    const result = await fsGlob(nodePath.join(tmpDir, "*.md"));
    expect(result.kind).toBe("ok");
    const files = (result as any).value as string[];
    expect(files.length).toBe(2);
    expect(files.every((f: string) => f.endsWith(".md"))).toBe(true);
  });

  it("matches nested files with **", async () => {
    const sub = nodePath.join(tmpDir, "sub");
    await nodeFs.mkdir(sub);
    await nodeFs.writeFile(nodePath.join(tmpDir, "top.md"), "");
    await nodeFs.writeFile(nodePath.join(sub, "nested.md"), "");
    const result = await fsGlob(nodePath.join(tmpDir, "**/*.md"));
    expect(result.kind).toBe("ok");
    const files = (result as any).value as string[];
    expect(files.length).toBe(2);
  });

  it("returns empty array for no matches", async () => {
    const result = await fsGlob(nodePath.join(tmpDir, "*.xyz"));
    expect(result).toEqual({ kind: "ok", value: [] });
  });

  it("returns sorted absolute paths", async () => {
    await nodeFs.writeFile(nodePath.join(tmpDir, "b.md"), "");
    await nodeFs.writeFile(nodePath.join(tmpDir, "a.md"), "");
    const result = await fsGlob(nodePath.join(tmpDir, "*.md"));
    expect(result.kind).toBe("ok");
    const files = (result as any).value as string[];
    expect(files).toEqual([...files].sort());
    expect(nodePath.isAbsolute(files[0])).toBe(true);
  });

  it("fails on non-string input", async () => {
    const result = await fsGlob(42 as any);
    expect(result).toEqual({ kind: "failed", reason: "fs.glob pattern must be a string" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/shockbirds/dev/brief && pnpm test -- tests/fs.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement fs.glob**

Add `import * as nodePath from "node:path";` at the top of `src/stdlib/fs.ts` (after the existing `node:fs/promises` import).

Then add the function:

```typescript
export async function fsGlob(pattern: BriefValue): Promise<BriefResult> {
  if (typeof pattern !== "string") return { kind: "failed", reason: "fs.glob pattern must be a string" };
  try {
    const results: string[] = [];
    for await (const entry of nodeFs.glob(pattern)) {
      results.push(nodePath.resolve(entry));
    }
    results.sort();
    return { kind: "ok", value: results };
  } catch (e: any) {
    return { kind: "failed", reason: e.message ?? String(e) };
  }
}
```

Note: uses `nodeFs.glob` (the existing `import * as nodeFs` namespace) rather than a separate named import, to stay consistent with the existing import style.

- [ ] **Step 4: Register permission and tool**

Add to `VALID_PERMISSIONS` in `src/resolver.ts`:
```typescript
  "fs.glob",
```

Update import in `src/cli.ts`:
```typescript
import { fsRead, fsWrite, fsExists, fsMkdir, fsList, fsStat, fsAppend, fsCopy, fsMove, fsDelete, fsGlob } from "./stdlib/fs.js";
```

Add registration:
```typescript
  reg.register("fs.glob", fsGlob);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /home/shockbirds/dev/brief && pnpm test -- tests/fs.test.ts`
Expected: PASS

- [ ] **Step 6: Run full test suite**

Run: `cd /home/shockbirds/dev/brief && pnpm test`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
cd /home/shockbirds/dev/brief
git add src/stdlib/fs.ts src/resolver.ts src/cli.ts tests/fs.test.ts
git commit -m "feat: add fs.glob tool"
```

---

## Chunk 4: E2E Test & Documentation

### Task 7: Brief E2E Test Script

**Files:**
- Create: `tests/e2e/fs-tools.br`

- [ ] **Step 1: Write the e2e Brief test script**

Create `tests/e2e/fs-tools.br`:

```brief
allow
  fs.read
  fs.write
  fs.exists
  fs.mkdir
  fs.list
  fs.stat
  fs.copy
  fs.move
  fs.delete
  fs.append
  fs.glob

# e2e test for all fs tools
# run with: pnpm brief test tests/e2e/fs-tools.br

let base = "/tmp/brief-e2e-test"

# setup
await ask fs.mkdir(base)
  or fail "mkdir failed"

# write a file
await ask fs.write(pathJoin(base, "hello.md"), "hello world")
  or fail "write failed"

# append to file
await ask fs.append(pathJoin(base, "hello.md"), "\ngoodbye")
  or fail "append failed"

# read it back
let content =
  await ask fs.read(pathJoin(base, "hello.md"))
  or fail "read failed"

print(content)

# check existence
let exists =
  await ask fs.exists(pathJoin(base, "hello.md"))
  or fail "exists failed"

print(exists)

# list directory
let files =
  await ask fs.list(base)
  or fail "list failed"

print(files)

# stat file
let info =
  await ask fs.stat(pathJoin(base, "hello.md"))
  or fail "stat failed"

print(at(info, 0))
print(at(info, 2))

# copy file
await ask fs.copy(pathJoin(base, "hello.md"), pathJoin(base, "copy.md"))
  or fail "copy failed"

# move file
await ask fs.move(pathJoin(base, "copy.md"), pathJoin(base, "moved.md"))
  or fail "move failed"

# glob
let mdFiles =
  await ask fs.glob(pathJoin(base, "*.md"))
  or fail "glob failed"

print(len(mdFiles))

# cleanup
await ask fs.delete(base)
  or fail "delete failed"

print("all fs tools passed")

test "mkdir creates directory" {
  mock fs.mkdir returns Ok(null)
  mock fs.write returns Ok(null)
  mock fs.append returns Ok(null)
  mock fs.read returns Ok("hello world\ngoodbye")
  mock fs.exists returns Ok(true)
  mock fs.list returns Ok(["hello.md"])
  mock fs.stat returns Ok(["size", 19, "isFile", true, "isDir", false, "modified", "2026-03-15", "created", "2026-03-15"])
  mock fs.copy returns Ok(null)
  mock fs.move returns Ok(null)
  mock fs.glob returns Ok(["/tmp/brief-e2e-test/hello.md", "/tmp/brief-e2e-test/moved.md"])
  mock fs.delete returns Ok(null)
  expect await run() to be ok
}

test "fails gracefully on mkdir error" {
  mock fs.mkdir returns failed("permission denied")
  expect await run() to be failed("mkdir failed")
}

test "fails gracefully on write error" {
  mock fs.mkdir returns Ok(null)
  mock fs.write returns failed("disk full")
  expect await run() to be failed("write failed")
}
```

- [ ] **Step 2: Run e2e tests**

Run: `cd /home/shockbirds/dev/brief && pnpm brief test tests/e2e/fs-tools.br`
Expected: All tests pass

- [ ] **Step 3: Run the script for real (live e2e)**

Run: `cd /home/shockbirds/dev/brief && pnpm brief run tests/e2e/fs-tools.br`
Expected: Outputs content, existence, file lists, stats, and "all fs tools passed"

- [ ] **Step 4: Commit**

```bash
cd /home/shockbirds/dev/brief
git add tests/e2e/fs-tools.br
git commit -m "test: add e2e Brief test script for fs tools"
```

---

### Task 8: Update SPEC.md

**Files:**
- Modify: `SPEC.md`

- [ ] **Step 1: Add new tools to SPEC.md**

Add new fs tools to the "Available tools (core)" section (after line 188):

```markdown
fs.list(path)                          -> Result<string[]>
fs.exists(path)                        -> Result<boolean>
fs.stat(path)                          -> Result<array>
fs.mkdir(path)                         -> Result<null>
fs.move(src, dst)                      -> Result<null>
fs.copy(src, dst)                      -> Result<null>
fs.delete(path)                        -> Result<null>
fs.append(path, content)              -> Result<null>
fs.glob(pattern)                       -> Result<string[]>
```

Add new permissions to the "Valid permissions" section (after line 97):

```markdown
fs.list
fs.exists
fs.stat
fs.mkdir
fs.move
fs.copy
fs.delete
fs.append
fs.glob
```

Add new core functions to the "Built-in functions" section. Under a new "### Path" heading after Arrays (after line 460):

```markdown
### Path
\```
pathJoin(parts...)            joins path segments
pathDirname(path)             directory name of path
pathBasename(path)            file name from path
pathExtname(path)             file extension (e.g. ".md")
\```

### JSON
\```
jsonParse(str)                parse JSON to Brief values (objects become flat kv arrays)
jsonStringify(value)          convert Brief values to JSON string (kv arrays become objects)
\```
```

- [ ] **Step 2: Review the updated spec is consistent**

Read through the full SPEC.md to verify no inconsistencies.

- [ ] **Step 3: Commit**

```bash
cd /home/shockbirds/dev/brief
git add SPEC.md
git commit -m "docs: update spec with new fs tools and core functions"
```

---

### Task 9: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `cd /home/shockbirds/dev/brief && pnpm test`
Expected: All tests pass (existing + new)

- [ ] **Step 2: Run Brief e2e mock tests**

Run: `cd /home/shockbirds/dev/brief && pnpm brief test tests/e2e/fs-tools.br`
Expected: All Brief test blocks pass

- [ ] **Step 3: Run Brief e2e live**

Run: `cd /home/shockbirds/dev/brief && pnpm brief run tests/e2e/fs-tools.br`
Expected: Script runs successfully with real filesystem operations

- [ ] **Step 4: Push to remote**

```bash
cd /home/shockbirds/dev/brief && git push origin main
```
