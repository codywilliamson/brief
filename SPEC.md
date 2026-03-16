# Brief language spec v0.1

## Overview

Brief is an agentic scripting language designed to be written by AI agents and audited by humans. Scripts are single-file, execute top to bottom, and are optimized for readability over writability. The interpreter is implemented in TypeScript, powered by the Claude Agent SDK — it authenticates through the user's Claude Code install.

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
ai.converse
ai.toolUse
ai.loop
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

---

## Variables

```
let name = value
```

Variables are immutable by default. Use `set` to mutate.

```
let topic = "machine learning"
let count = 42
let flag = true
```

### Mutation with `set`

`set` updates an existing variable in the scope where it was defined:

```
let total = 0
for item in [1, 2, 3] {
  set total = total + item
}
# total is 6

let items = []
set items = push(items, "a")
set items = push(items, "b")
# items is ["a", "b"]
```

`set` errors at runtime if the variable has not been declared with `let`.

### Script arguments

Scripts receive CLI arguments via the global `args` array:

```
# brief run script.br file.txt --verbose
let path = args[0]      # "file.txt"
let flag = args[1]      # "--verbose"
let count = len(args)   # 2
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
fs.read(path)                          -> Result<string>
fs.write(path, content)                -> Result<void>
http.fetch(url)                        -> Result<string>
http.post(url, body)                   -> Result<string>
ai.complete(prompt, config?)           -> Result<string>
ai.stream(prompt, config?)             -> Stream<string>
ai.converse(messages, config?)         -> Result<string>
ai.toolUse(prompt, tools, config?)     -> Result<array>
ai.loop(prompt, tools, handler, config?) -> Result<string>
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

### AI config

AI tools accept an optional config array of key-value pairs:

```
let config = ["model", "claude-opus-4-20250514", "temperature", 0.7, "system", "be concise", "maxTokens", 1024]

let result =
  await ask ai.complete("prompt", config)
  or fail "failed"
```

Available config keys:
```
model       string    model id (default: claude-sonnet-4-20250514)
maxTokens   number    max output tokens (default: 4096)
temperature number    sampling temperature
system      string    system prompt
```

### Multi-turn conversations (ai.converse)

Messages are passed as a flat array of alternating role-content pairs:

```
let messages = [
  "user", "what is rust?",
  "assistant", "Rust is a systems programming language.",
  "user", "how does it handle memory?"
]

let response =
  await ask ai.converse(messages)
  or fail "conversation failed"
```

Valid roles: `"user"`, `"assistant"`. First message must be from `"user"`.

### Structured tool use (ai.toolUse)

Tools are defined as arrays. Each tool is `[name, description, ...params]` where each param is `[name, type, description]`:

```
let tools = [
  ["getWeather", "get current weather", ["city", "string", "city name"]],
  ["searchFlights", "search flights", ["from", "string", "origin"], ["to", "string", "destination"]]
]

let result =
  await ask ai.toolUse("weather in SF?", tools)
  or fail "tool use failed"
```

Returns an array of content blocks. Each block is either:
- `["text", "response text"]` for text responses
- `["tool_use", "toolName", "callId", ["param1", "value1", ...]]` for tool calls

### Agentic tool-use loops (ai.loop)

Runs a full agentic loop: sends prompt with tools, model calls tools, Brief executes them via a handler function, feeds results back, repeats until the model stops calling tools (max 10 iterations).

The third argument is the name of a Brief function that handles tool calls:

```
async fn handleTool(toolName, toolInput) {
  if toolName == "readFile" {
    let content =
      await ask fs.read(toolInput)
      or return "file not found"
    return content
  }
  return "unknown tool"
}

let tools = [
  ["readFile", "read a file", ["path", "string", "file path"]]
]

let answer =
  await ask ai.loop("summarize config.json", tools, "handleTool")
  or fail "agent loop failed"
```

The handler function receives:
- `toolName` (string) — the name of the tool the model wants to call
- `toolInput` (array) — flat array of key-value pairs from the model's input, e.g. `["path", "config.json"]`

The handler's return value is sent back to the model as the tool result.

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

### Core
```
print(value)              prints to stdout
len(value)                length of string or array
at(array, index)          get element at index (or use arr[i] syntax)
typeOf(value)             returns "string", "number", "boolean", "null", "array", "result"
toString(value)           cast to string
parseInt(str)             parse int
parseFloat(str)           parse float
```

### Strings
```
trim(str)                 trims whitespace
split(str, delimiter)     splits string into array
join(array, delimiter)    joins array into string
slice(str, start, end)    substring
contains(str, search)     true if str contains search
startsWith(str, prefix)   true if str starts with prefix
endsWith(str, suffix)     true if str ends with suffix
replace(str, old, new)    replaces all occurrences
toUpper(str)              uppercase
toLower(str)              lowercase
```

### Arrays
```
at(array, index)          get element (returns null if out of bounds)
push(array, ...items)     returns new array with items appended
concat(arr1, arr2, ...)   returns new merged array
range(start, end)         returns [start, start+1, ..., end-1]
keys(array)               returns [0, 1, ..., len-1]
contains(array, value)    true if array contains value
```

### Path
```
pathJoin(parts...)            joins path segments
pathDirname(path)             directory name of path
pathBasename(path)            file name from path
pathExtname(path)             file extension (e.g. ".md")
```

### JSON
```
jsonParse(str)                parse JSON to Brief values (objects become flat kv arrays)
jsonStringify(value)          convert Brief values to JSON string (kv arrays become objects)
```

### Array/string indexing
```
let arr = [10, 20, 30]
arr[0]                    # 10
arr[1]                    # 20

let str = "hello"
str[0]                    # "h"

let nested = [[1, 2], [3, 4]]
nested[0][1]              # 2
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

## Complete examples

### Basic: file-based report generation

```
allow
  fs.read
  fs.write
  ai.complete

# read the research topic from disk
let topic =
  await ask fs.read("topic.txt")
  or fail "could not read topic file"

# bail early if topic is empty
return failed("topic is empty") if trim(topic) == ""

# generate a report
let report =
  await ask ai.complete("write a detailed report on: {topic}")
  or fail "ai failed"

# save the report to disk
await ask fs.write("report.txt", report)
  or fail "could not save report"

print("done. report saved to report.txt")

test "generates and saves report" {
  mock fs.read("topic.txt") returns Ok("quantum computing")
  mock ai.complete returns Ok("report content")
  mock fs.write returns Ok(null)
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

### Agentic: tool-use loop with file access

```
allow
  ai.loop
  fs.read

# define how to handle tool calls from the model
async fn handleTool(toolName, toolInput) {
  if toolName == "readFile" {
    let content =
      await ask fs.read(toolInput)
      or return "file not found"
    return content
  }
  return "unknown tool"
}

# define tools the model can use
let tools = [
  ["readFile", "read a file from disk", ["path", "string", "file path"]]
]

# run the agentic loop - model decides what to read, Brief executes
let config = ["system", "you are a code reviewer. read files and provide feedback."]
let review =
  await ask ai.loop("review the code in main.ts", tools, "handleTool", config)
  or fail "agent loop failed"

print(review)

test "agent loop completes" {
  mock ai.loop returns Ok("code looks good")
  expect await run() to be ok
}
```

### Streaming: real-time output

```
allow
  ai.stream

for await chunk from ask ai.stream("write a haiku about programming") {
  print(chunk)
}

print("done")

test "streaming works" {
  mock ai.stream returns Ok("code flows like water")
  expect await run() to be ok
}
```
