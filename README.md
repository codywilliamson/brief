# Brief

An agentic scripting language designed to be written by AI agents and audited by humans.

Brief scripts are single-file, execute top to bottom, and are optimized for readability over writability. The interpreter is implemented in TypeScript with direct Anthropic SDK integration.

## Quick start

```bash
pnpm install
export ANTHROPIC_API_KEY=sk-...
pnpm brief run script.br
pnpm brief test script.br
pnpm brief repl
```

## Example

```
allow
  fs.read
  ai.complete

let topic =
  await ask fs.read("topic.txt")
  or fail "could not read topic file"

return failed("topic is empty") if trim(topic) == ""

let summary =
  await ask ai.complete("summarize: {topic}")
  or fail "ai failed"

print(summary)

test "fails on empty topic" {
  mock fs.read("topic.txt") returns Ok("   ")
  expect await run() to be failed("topic is empty")
}
```

## Agentic tool use

Brief integrates directly with the Anthropic SDK for structured tool calling and agentic loops.

### ai.complete - single completion

```
allow
  ai.complete

let response =
  await ask ai.complete("explain quantum computing")
  or fail "completion failed"

# with config
let config = ["model", "claude-opus-4-20250514", "temperature", 0.7, "system", "be concise"]
let tuned =
  await ask ai.complete("explain quantum computing", config)
  or fail "completion failed"
```

### ai.stream - streaming responses

```
allow
  ai.stream

for await chunk from ask ai.stream("write a story") {
  print(chunk)
}
```

### ai.converse - multi-turn conversations

```
allow
  ai.converse

let messages = [
  "user", "what is rust?",
  "assistant", "Rust is a systems programming language.",
  "user", "how does it handle memory?"
]

let response =
  await ask ai.converse(messages)
  or fail "conversation failed"
```

### ai.toolUse - structured tool calling

```
allow
  ai.toolUse

let tools = [
  ["getWeather", "get current weather", ["city", "string", "city name"]]
]

let result =
  await ask ai.toolUse("what's the weather in SF?", tools)
  or fail "tool use failed"

# result is array of content blocks: [["tool_use", "getWeather", "call_id", ["city", "SF"]]]
```

### ai.loop - agentic tool-use loops

The killer feature. Define tools and a handler function, and Brief runs the full agentic loop: model calls tools, Brief executes them, feeds results back, repeat until the model is done.

```
allow
  ai.loop
  fs.read

async fn handleTool(toolName, toolInput) {
  if toolName == "readFile" {
    let path = toolInput
    let content =
      await ask fs.read(path)
      or return "file not found"
    return content
  }
  return "unknown tool"
}

let tools = [
  ["readFile", "read a file from disk", ["path", "string", "file path"]]
]

let result =
  await ask ai.loop("summarize the contents of config.json", tools, "handleTool")
  or fail "agent loop failed"

print(result)
```

## Language features

- **Permission system** - scripts declare required permissions upfront via `allow` blocks
- **Result types** - all tool calls return `Result<T>` with `or fail` / `or return` unwrapping
- **Async first** - all functions are async, with `await`, `await all`, and streaming support
- **Pattern matching** - `when` expressions for matching on `ok`/`failed` results
- **Built-in testing** - `test` blocks with `mock` and `expect` baked into the language
- **Context scoping** - `with ctx` blocks for implicit context passing to tool calls
- **SDK integration** - direct Anthropic SDK for completions, streaming, multi-turn, tool use, and agentic loops

## Architecture

```
src/
  lexer.ts         tokenizes .br source
  parser.ts        produces AST from tokens
  ast.ts           AST node type definitions
  resolver.ts      resolves names and scopes
  interpreter.ts   tree-walk evaluator
  runtime.ts       async scheduler, tool registry, permission gate
  result.ts        Ok/failed Result type
  stream.ts        Stream<T> type for async iteration
  stdlib/
    core.ts        print, len, trim, split, join, slice, parseInt, parseFloat, toString
    ai.ts          ai.complete, ai.stream, ai.converse, ai.toolUse, ai.loop
    fs.ts          fs.read, fs.write
    http.ts        http.fetch, http.post
  test-runner.ts   discovers and runs test blocks
  cli.ts           entrypoint: brief run, brief test, brief repl
```

## Testing

```bash
pnpm test          # run all vitest tests (170 tests)
pnpm test:watch    # watch mode
```

## Available permissions

```
fs.read       read files from disk
fs.write      write files to disk
http.fetch    HTTP GET requests
http.post     HTTP POST requests
ai.complete   single LLM completion
ai.stream     streaming LLM completion
ai.converse   multi-turn conversation
ai.toolUse    structured tool calling
ai.loop       agentic tool-use loop
```

## License

MIT
