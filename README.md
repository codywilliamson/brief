# Brief

An agentic scripting language designed to be written by AI agents and audited by humans.

Brief scripts are single-file `.br` programs that execute top to bottom with a permission-gated tool system. The interpreter is TypeScript with direct Anthropic SDK integration.

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

## Agentic loops

The killer feature. Define tools and a handler function, Brief runs the full agentic loop: model calls tools, Brief executes them via your handler, feeds results back, repeats until the model is done.

```
allow
  ai.loop
  fs.read

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
  ["readFile", "read a file from disk", ["path", "string", "file path"]]
]

let result =
  await ask ai.loop("summarize config.json", tools, "handleTool")
  or fail "agent loop failed"

print(result)
```

## AI tools

All AI tools use the Anthropic SDK directly. Optional config via key-value arrays:

```
let config = ["model", "claude-opus-4-20250514", "temperature", 0.7, "system", "be concise"]
```

| Tool | Signature | Returns |
|------|-----------|---------|
| `ai.complete` | `(prompt, config?)` | `Result<string>` |
| `ai.stream` | `(prompt, config?)` | `Stream<string>` |
| `ai.converse` | `(messages, config?)` | `Result<string>` |
| `ai.toolUse` | `(prompt, tools, config?)` | `Result<array>` |
| `ai.loop` | `(prompt, tools, handler, config?)` | `Result<string>` |

**ai.converse** takes alternating role-content pairs: `["user", "hi", "assistant", "hello", "user", "how are you?"]`

**ai.toolUse** returns content blocks: `[["text", "..."], ["tool_use", "name", "id", ["key", "val"]]]`

**ai.loop** takes a Brief function name as handler — the function receives `(toolName, toolInput)` and returns the tool result.

## Language features

- **Permission system** — `allow` blocks declare what tools a script can use
- **Result types** — `or fail` / `or return` for unwrapping, `when` for pattern matching
- **Async first** — `await`, `await all` for parallel, `for await` for streaming
- **Built-in testing** — `test` blocks with `mock` and `expect`
- **Control flow** — `if`/`else`, `unless`, `until`, `for`..`in`, postfix `if`
- **Interpolation** — `"hello {name}"` in strings
- **Gradual typing** — optional type annotations (parsed, not enforced in v1)

## Available permissions

```
fs.read       read files
fs.write      write files
http.fetch    HTTP GET
http.post     HTTP POST
ai.complete   single LLM completion
ai.stream     streaming LLM completion
ai.converse   multi-turn conversation
ai.toolUse    structured tool calling
ai.loop       agentic tool-use loop
```

## Architecture

```
src/
  lexer.ts         tokenizer
  parser.ts        recursive descent parser
  ast.ts           AST node types
  resolver.ts      name resolution + permission validation
  interpreter.ts   tree-walk evaluator
  runtime.ts       tool registry, mock system, pipeline
  result.ts        Ok/failed Result type
  stream.ts        BriefStream<T> for async iteration
  stdlib/
    core.ts        print, len, trim, split, join, slice, parseInt, parseFloat, toString
    ai.ts          ai.complete, ai.stream, ai.converse, ai.toolUse, ai.loop (Anthropic SDK)
    fs.ts          fs.read, fs.write
    http.ts        http.fetch, http.post
  test-runner.ts   test block execution
  cli.ts           brief run | test | repl
```

## Testing

```bash
pnpm test        # 170 tests across 7 suites
```

## Spec

See [SPEC.md](SPEC.md) for the full language specification.

## License

MIT
