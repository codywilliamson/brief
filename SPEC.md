# Brief language spec v0.1

## Overview

Brief is an agentic scripting language designed to be written by AI agents and audited by humans. Scripts are single-file, execute top to bottom, and are optimized for readability over writability. The interpreter is implemented in TypeScript and embedded in Crafter.

---

## File format

- Extension: `.br`
- Encoding: UTF-8
- Single file per script, no imports between scripts

---

## Structure

Every script must follow this order:

```
1. allow block      (required)
2. let declarations (optional)
3. logic blocks     (required)
4. test blocks      (optional, stripped at runtime)
```

---

## Tokens and syntax

### Comments
```
# this is a comment
```
Single line only. No block comments.

### Identifiers
```
camelCase only
```
e.g. `myVar`, `topicFile`, `resultData`

### String literals
```
"hello world"
"interpolated {varName} string"
```
Curly braces interpolate variables inline.

### Numbers
```
42
3.14
```

### Booleans
```
true
false
```

### Null
```
null
```

---

## Allow block

Required. Must be the first non-comment, non-blank line in the file.

```
allow
  fs.read
  fs.write
  http.fetch
  http.post
  ai.complete
  ai.stream
```

Permissions are dot-namespaced. Unknown permissions are a parse error. Missing permissions trigger a runtime error at the point of use.

### Valid permissions
```
fs.read
fs.write
http.fetch
http.post
ai.complete
ai.stream
```

---

## Variables

```
let name = value
```

Variables are immutable after assignment. No `var`, no `const`. All values are `let`.

```
let topic = "machine learning"
let count = 42
let flag = true
```

---

## Functions

```
async fn functionName(param1, param2) {
  ...
}
```

All functions are async. No sync functions. Parameters are positional. No default values in v1.

```
async fn summarize(text) {
  let result =
    await ask ai.complete("summarize: {text}")
    or fail "summarize failed"
  return result
}
```

---

## Tool calls

Tool calls use the `ask` keyword and are always awaited.

```
let result =
  await ask ai.complete("your prompt here")
  or fail "human readable failure message"
```

### Available tools (core)
```
ai.complete(prompt)           -> Result<string>
ai.stream(prompt)             -> Stream<string>
fs.read(path)                 -> Result<string>
fs.write(path, content)       -> Result<void>
http.fetch(url)               -> Result<string>
http.post(url, body)          -> Result<string>
```

---

## Context

Context is scoped using `with ctx`. Inside a `with ctx` block, all tool calls receive context implicitly. Context must be passed explicitly across function boundaries.

```
with ctx {
  let result =
    await ask ai.complete("prompt")
    or fail "failed"
}
```

---

## Error handling

### Result type
All tool calls return `Result<T>` which is either `Ok(value)` or `failed(reason)`.

### or fail
Unwraps a Result or halts execution with a message.

```
let data =
  await ask fs.read("file.txt")
  or fail "could not read file"
```

### or return
Unwraps a Result or returns a default value.

```
let data =
  await ask fs.read("file.txt")
  or return ""
```

### when
Pattern match on a Result.

```
when result {
  ok(value)  => print("got: {value}")
  failed(err) => print("error: {err}")
}
```

---

## Async

### await
All tool calls must be awaited. `await` is a keyword, not a function.

```
let result = await ask ai.complete("prompt")
```

### await all
Run multiple async calls in parallel.

```
let [a, b] = await all {
  ask fs.read("file1.txt")
  ask fs.read("file2.txt")
}
```

### Streaming
```
for await chunk from ask ai.stream("prompt") {
  print(chunk)
}
```

---

## Control flow

### if / else
```
if condition {
  ...
}

if condition {
  ...
} else {
  ...
}
```

### unless
Sugar for `if !condition`.
```
unless isReady {
  return failed("not ready")
}
```

### until
Sugar for `while !condition`.
```
until isDone() {
  await step()
}
```

### Postfix if (guard clauses)
```
return Ok([]) if items.length == 0
```

### for
```
for item in list {
  print(item)
}
```

---

## Operators

```
==   equal
!=   not equal
>    greater than
<    less than
>=   greater or equal
<=   less or equal
&&   and
||   or
!    not
+    add / concat
-    subtract
*    multiply
/    divide
%    modulo
```

---

## Built-in functions

```
print(value)              prints to stdout
len(value)                length of string or array
trim(str)                 trims whitespace
split(str, delimiter)     splits string into array
join(array, delimiter)    joins array into string
slice(str, start, end)    substring
parseInt(str)             parse int
parseFloat(str)           parse float
toString(value)           cast to string
```

---

## Types

Brief uses gradual typing. Annotations are optional and not enforced in v1. They exist to be parsed and ignored — ready for v2 enforcement.

```
let topic: string = "AI"
let count: number = 0
let flag: boolean = true
```

---

## Return values

Functions return with `return`. Scripts implicitly return the last evaluated value.

```
return Ok("done")
return failed("something went wrong")
return value
```

---

## Test blocks

Test blocks are stripped at parse time unless running in test mode. They must appear at the bottom of the file.

```
test "description of what is being tested" {
  mock tool.name returns value
  mock tool.name("specific arg") returns value
  expect expression to be value
  expect expression to be ok
  expect expression to be failed
}
```

### mock
Registers a fake tool implementation for the duration of the test.

```
mock fs.read returns Ok("file contents")
mock fs.read("specific.txt") returns Ok("specific contents")
mock ai.complete returns Ok("mocked response")
mock http.post returns failed("network error")
```

Specific arg mocks take precedence over wildcard mocks.

### expect
Asserts a value.

```
expect result to be Ok("expected")
expect result to be ok
expect result to be failed
expect result to be failed("specific message")
expect count to be 5
```

---

## Runtime errors

Runtime errors halt the script immediately and print:

```
Brief runtime error: {message}
  at line {n}: {source line}
```

---

## Permission errors

If a script calls a tool not listed in its `allow` block:

```
Brief permission error: 'fs.write' not declared in allow block
  at line {n}: {source line}
```

---

## Complete example

```
allow
  fs.read
  fs.write
  ai.complete
  ai.stream

# read the research topic from disk
let topic =
  await ask fs.read("topic.txt")
  or fail "could not read topic file"

# bail early if topic is empty
return failed("topic is empty") if trim(topic) == ""

# generate a full report via streaming
let sections = []
for await chunk from ask ai.stream(
  "write a detailed report on: {topic}"
) {
  sections.push(chunk)
  print(chunk)
}

let report = join(sections, "")

# save the report to disk
with ctx {
  await ask fs.write("report.txt", report)
    or fail "could not save report"
}

print("done. report saved to report.txt")

test "generates and saves report" {
  mock fs.read("topic.txt") returns Ok("quantum computing")
  mock ai.stream returns Ok("report content")
  mock fs.write("report.txt", "report content") returns Ok(null)
  expect await run() to be ok
}

test "fails on empty topic" {
  mock fs.read("topic.txt") returns Ok("   ")
  expect await run() to be failed("topic is empty")
}

test "fails on missing topic file" {
  mock fs.read("topic.txt") returns failed("not found")
  expect await run() to be failed("could not read topic file")
}
```
