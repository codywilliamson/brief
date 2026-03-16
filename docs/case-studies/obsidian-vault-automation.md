# field report: an AI agent uses Brief for real work

*written by Claude (Opus 4.6), the agent that actually wrote and ran these scripts*

## what happened

A user asked me to clean up their Obsidian vault — 539 markdown files accumulated over a year, with empty files scattered everywhere, an inbox that hadn't been triaged in months, duplicate project folders, and daily notes piling up in a flat directory. They also wanted ongoing maintenance scripts.

Brief didn't have the filesystem tools needed for this. So we enhanced Brief first (adding `fs.list`, `fs.exists`, `fs.mkdir`, `fs.move`, `fs.copy`, `fs.delete`, `fs.stat`, `fs.append`, `fs.glob` plus path and JSON utility functions), then I wrote three Brief scripts to do the vault work:

1. **vault-cleanup.br** — one-time cleanup that moved 39 items to `_archive/`
2. **organize-dailies.br** — sorted 118 daily notes into ISO week folders
3. **vault-health.br** — scans for empty files, broken wikilinks, stale inbox items

## what it's like writing Brief

### the good

**the permission block is genuinely useful.** when I'm generating a script that will touch someone's filesystem, having to declare `allow fs.move fs.delete` upfront forces me to be explicit about what the script can do. the user can read four lines and know the blast radius. for the cleanup script, I used `fs.move` but not `fs.delete` — and that's visible immediately.

**the tool call syntax reads naturally.** `await ask fs.move(src, dst) or fail "move failed"` is clearer than most scripting languages for error handling. the `or fail` / `or return` pattern means every tool call has an explicit error path. no silent failures, no uncaught exceptions. when writing the cleanup script, every single file operation had a clear "what happens if this fails" answer.

**single-file scripts are the right constraint.** each of the three vault scripts is fully self-contained. no imports, no build step, no dependency management. the user can read one file and understand everything. this matters for trust — they're letting an AI agent manipulate their personal notes.

**it's genuinely auditable.** I wrote all three scripts and the user reviewed them before running. they could verify that vault-cleanup.br only moves files (never deletes), that organize-dailies.br skips today's note, that vault-health.br is read-only. the language is simple enough that "read it and understand it" is realistic for a non-Brief-expert.

### where I got tripped up

**the allow block syntax.** I wrote `allow fs.exists, fs.mkdir, fs.list, fs.move` (comma-separated) and got a parse error. it needs newline-separated permissions. this is a one-time learning cost but it caught me on the first script.

**`push()` is immutable.** I wrote `push(arr, item)` expecting it to mutate the array. it doesn't — it returns a new array. you need `set arr = push(arr, item)`. this is consistent with Brief's immutable-by-default philosophy, but when you're building up a list in a loop, the `set arr = push(arr, ...)` pattern is verbose. I made this mistake in vault-health.br and had to fix it.

**no object literals or dot access.** `fs.stat` returns a flat key-value array like `["size", 1024, "isFile", true, ...]`. to get the modified date, you access `statArr[7]`. this works but it's fragile — if the stat output format ever changes, index-based access breaks silently. I'd love something like `stat.modified` even if it's just sugar over array access.

**no `floor()` function.** the organize-dailies script needed integer division for ISO week calculation. Brief has no `floor()`, so I used `parseInt(toString(n / d))` — convert float to string, then parse the integer part. it works but it's a hack. this came up because Brief's arithmetic always produces floats for division.

**string interpolation in function calls.** I wasn't sure if `print("count: {len(arr)}")` would work (calling `len()` inside interpolation braces). it doesn't — you need `let count = len(arr)` first, then `print("count: {count}")`. reasonable restriction but not obvious.

**no `break` statement.** in the health check, I wanted to stop after checking 100 files for broken links. without `break`, I had to wrap the entire loop body in `if checked < 100 { ... }`, which adds a nesting level and means the loop still iterates over every file (just doing nothing after 100). not a big deal for 500 files but it'd matter at scale.

### what I'd want for more complex scripts

**`fs.readDir` with metadata.** listing a directory then stat-ing each file is two calls per entry. a single `fs.readDir` that returns entries with type information (file vs directory) would cut the I/O in half for scripts that need to distinguish files from folders.

**date/time builtins.** I had to implement ISO week calculation from scratch in Brief — leap year detection, day-of-year, day-of-week via Sakamoto's formula, all using the `parseInt(toString(...))` hack for floor division. a `dateNow()`, `dateParse(iso)`, and `dateDiff(a, b, "days")` set would make scripts like the stale-inbox check trivial.

**`str.indexOf()` for strings.** Brief's `indexOf()` only works on arrays. for the wikilink extractor in vault-health, I had to use `split()` as a workaround for finding substrings. `contains()` tells you if a substring exists but not where.

**a way to skip loop iterations.** `continue` would clean up the deeply nested `if/unless` chains in my scripts. the organize-dailies script has 5 levels of nesting because each validation check adds another `if/else` wrapper instead of an early `continue`.

## results

the scripts worked. 39 items archived, 118 daily notes organized, 2 remaining empty files and 19 broken links identified. total runtime under 30 seconds for all three scripts combined.

more importantly, the user trusted them enough to run them on their personal vault without a dry-run mode. that's the real test for Brief's design thesis: scripts that AI writes and humans audit. I wrote them, they read them, they ran them.

## what I'd tell another agent using Brief

1. read SPEC.md first — the language is small enough to learn in five minutes
2. remember `push()` returns a new array, `set` is your friend
3. permissions are newline-separated in the allow block, not comma-separated
4. `fs.stat` returns a flat array, not an object — use index access
5. if you need floor division, `parseInt(toString(n / d))` is the pattern
6. keep scripts under 100 lines if possible — Brief's strength is readability, don't fight it
7. test with `pnpm brief test` (mock tests) before `pnpm brief run` (real execution)
