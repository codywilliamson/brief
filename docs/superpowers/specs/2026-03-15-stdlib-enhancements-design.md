# Brief stdlib enhancements — design spec

## overview

Extend Brief's standard library with filesystem operations and utility functions needed for real-world scripting (vault automation, file organization, batch processing). All new tools follow existing patterns: async, permission-gated, return `BriefResult`.

## motivation

Brief currently has `fs.read` and `fs.write` — enough to read and create files, but not enough to build scripts that organize, move, copy, or discover files. Common scripting tasks like "find all markdown files and move them into folders" require `fs.list`, `fs.move`, `fs.glob`, etc.

Additionally, path manipulation and JSON parsing are common enough to warrant core (sync) built-in functions rather than requiring scripts to do string manipulation.

## new filesystem tools

All tools are async, permission-gated, and return `BriefResult`. They follow the exact pattern established by `fsRead`/`fsWrite` in `src/stdlib/fs.ts`.

### fs.list(path) -> Result<string[]>

List entries in a directory. Returns array of filenames (not full paths).

```
allow
  fs.list

let files =
  await ask fs.list("/home/user/notes")
  or fail "could not list directory"

for file in files {
  print(file)
}
```

- permission: `fs.list`
- uses: `node:fs/promises` `readdir`
- returns filenames only, including hidden files/dotfiles (caller joins with path using `pathJoin`)

### fs.exists(path) -> Result<boolean>

Check if a path exists. Returns `Ok(true)` or `Ok(false)` — never fails for a valid string input.

```
allow
  fs.exists

let exists =
  await ask fs.exists("/home/user/notes/file.md")
  or fail "check failed"

if exists {
  print("file exists")
}
```

- permission: `fs.exists`
- uses: `node:fs/promises` `access`
- catches `ENOENT` → returns `Ok(false)`, other errors → returns `failed`

### fs.stat(path) -> Result<array>

Get file metadata. Returns a flat key-value array (consistent with Brief's AI config pattern since Brief has no object literals).

```
allow
  fs.stat

let info =
  await ask fs.stat("/home/user/notes/file.md")
  or fail "stat failed"

# info = ["size", 1024, "isFile", true, "isDir", false, "modified", "2026-03-15T10:30:00.000Z", "created", "2026-03-10T08:00:00.000Z"]
```

- permission: `fs.stat`
- uses: `node:fs/promises` `stat`
- keys: `size` (number, bytes), `isFile` (boolean), `isDir` (boolean), `modified` (ISO string), `created` (ISO string)

### fs.mkdir(path) -> Result<null>

Create a directory. Recursive by default (creates parent dirs).

```
allow
  fs.mkdir

await ask fs.mkdir("/home/user/notes/_archive/inbox")
  or fail "could not create directory"
```

- permission: `fs.mkdir`
- uses: `node:fs/promises` `mkdir` with `{ recursive: true }`

### fs.move(src, dst) -> Result<null>

Move or rename a file or directory.

```
allow
  fs.move

await ask fs.move("/home/user/notes/old.md", "/home/user/notes/_archive/old.md")
  or fail "move failed"
```

- permission: `fs.move` (covers the EXDEV fallback — no additional permissions needed)
- uses: `node:fs/promises` `rename`
- if `rename` fails with `EXDEV` (cross-device), falls back to copy + delete
- each parameter validated separately: `"fs.move src must be a string"`, `"fs.move dst must be a string"`

### fs.copy(src, dst) -> Result<null>

Copy a file.

```
allow
  fs.copy

await ask fs.copy("/home/user/notes/template.md", "/home/user/notes/new-note.md")
  or fail "copy failed"
```

- permission: `fs.copy`
- uses: `node:fs/promises` `copyFile`
- overwrites destination if it exists (default `copyFile` behavior)
- each parameter validated separately

### fs.delete(path) -> Result<null>

Delete a file or directory (recursive for directories).

```
allow
  fs.delete

await ask fs.delete("/home/user/notes/temp")
  or fail "delete failed"
```

- permission: `fs.delete`
- uses: `node:fs/promises` `rm` with `{ recursive: true, force: true }`
- deleting a nonexistent path succeeds silently (due to `force: true`)

### fs.append(path, content) -> Result<null>

Append content to a file. Creates the file if it doesn't exist.

```
allow
  fs.append

await ask fs.append("log.txt", "processed file.md\n")
  or fail "append failed"
```

- permission: `fs.append`
- uses: `node:fs/promises` `appendFile`
- each parameter validated separately

### fs.glob(pattern) -> Result<string[]>

Find files matching a glob pattern. Returns full paths.

```
allow
  fs.glob

let mdFiles =
  await ask fs.glob("/home/user/notes/**/*.md")
  or fail "glob failed"

for file in mdFiles {
  print(file)
}
```

- permission: `fs.glob`
- uses: `node:fs/promises` `glob` (available in Node 22+) — returns async iterable, collected into array
- extracts directory prefix from pattern as `cwd`, resolves all results to absolute paths with `path.resolve()`
- patterns without a directory prefix search from process cwd
- returns sorted array of absolute paths

## new core functions (sync)

Added to `STDLIB_FUNCTIONS` in `core.ts`. No permissions required — these are pure utility functions like `trim`, `split`, etc.

### path functions

```
pathJoin("home", "user", "notes")     # "home/user/notes"
pathDirname("/home/user/notes/f.md")  # "/home/user/notes"
pathBasename("/home/user/notes/f.md") # "f.md"
pathExtname("/home/user/notes/f.md")  # ".md"
```

- uses: `node:path` `join`, `dirname`, `basename`, `extname`
- `pathJoin` accepts variable number of string args

### json functions

```
let obj = jsonParse('{"key": "value"}')   # ["key", "value"] (flat kv array)
let str = jsonStringify(["key", "value"])  # '{"key":"value"}'
```

- `jsonParse` converts JSON objects to flat key-value arrays (Brief convention), recursively — nested objects become nested kv arrays. arrays pass through as-is, primitives pass through. throws on invalid JSON (consistent with `parseInt`/`parseFloat` throwing on bad input)
- `jsonStringify` converts Brief values to JSON strings. flat kv arrays where even-indexed elements are strings are converted to JSON objects (recursively). regular arrays and primitives pass through as-is

## files changed

| file | change |
|------|--------|
| `src/stdlib/fs.ts` | add 9 new exported tool functions |
| `src/stdlib/core.ts` | add 6 new sync functions + register in `STDLIB_FUNCTIONS` |
| `src/resolver.ts` | add 9 new permissions to `VALID_PERMISSIONS`, add 6 new core function names to `BUILTINS` |
| `src/cli.ts` | register 9 new tools in `createDefaultRegistry()` |
| `tests/fs.test.ts` | new file — unit tests for all fs tools (real filesystem, temp dirs) |
| `tests/core.test.ts` | new or extended — unit tests for path/json functions |
| `tests/e2e/fs-tools.br` | e2e test script exercising all new fs tools with Brief `test` blocks |
| `SPEC.md` | document new tools and functions |

## testing strategy

### unit tests (`tests/fs.test.ts`)

Each fs tool gets its own `describe` block. Tests use real filesystem operations against a temp directory created in `beforeEach` and cleaned up in `afterEach`.

- `fs.list` — list empty dir, list dir with files, list nonexistent dir (fails)
- `fs.exists` — existing file, nonexistent file, existing directory
- `fs.stat` — file stats, directory stats, nonexistent path (fails)
- `fs.mkdir` — create single dir, create nested dirs, already exists (ok)
- `fs.move` — move file, rename file, move nonexistent (fails)
- `fs.copy` — copy file, copy nonexistent (fails)
- `fs.delete` — delete file, delete directory, delete nonexistent (ok, force)
- `fs.append` — append to existing, append to new file
- `fs.glob` — match pattern, no matches (empty array), nested dirs
- type validation — non-string args return `failed` for each tool

### unit tests (`tests/core.test.ts`)

- `pathJoin` — two segments, three segments, leading slash preserved
- `pathDirname` — absolute path, relative path
- `pathBasename` — with extension, without
- `pathExtname` — `.md`, `.ts`, no extension
- `jsonParse` — object, nested object, array, primitive, invalid JSON (throws)
- `jsonStringify` — kv array to object, regular array, primitive

### e2e test (`tests/e2e/fs-tools.br`)

A Brief script run with `pnpm brief test tests/e2e/fs-tools.br` that:

1. creates a temp directory with `fs.mkdir`
2. writes files with `fs.write`
3. appends to a file with `fs.append`
4. lists directory with `fs.list`
5. checks existence with `fs.exists`
6. gets stats with `fs.stat`
7. copies a file with `fs.copy`
8. moves a file with `fs.move`
9. globs for files with `fs.glob`
10. cleans up with `fs.delete`

each step is validated in `test` blocks with mocks. the script also runs end-to-end when executed with `pnpm brief run`.

## implementation order

1. core functions (path*, json*) — no permission changes needed, pure functions
2. fs tools in order: `fs.exists`, `fs.mkdir`, `fs.list`, `fs.stat`, `fs.append`, `fs.copy`, `fs.move`, `fs.delete`, `fs.glob`
3. register permissions and tools
4. unit tests
5. e2e Brief test script
6. SPEC.md updates
7. commit after each logical group
