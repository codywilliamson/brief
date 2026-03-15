# Brief

An agentic scripting language designed to be written by AI agents and audited by humans.

Brief scripts are single-file, execute top to bottom, and are optimized for readability over writability. The interpreter is implemented in TypeScript.

## Quick start

```bash
pnpm install
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

## Language features

- **Permission system** - scripts declare required permissions upfront via `allow` blocks
- **Result types** - all tool calls return `Result<T>` with `or fail` / `or return` unwrapping
- **Async first** - all functions are async, with `await`, `await all`, and streaming support
- **Pattern matching** - `when` expressions for matching on `ok`/`failed` results
- **Built-in testing** - `test` blocks with `mock` and `expect` baked into the language
- **Context scoping** - `with ctx` blocks for implicit context passing to tool calls

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
    ai.ts          ai.complete, ai.stream (placeholder)
    fs.ts          fs.read, fs.write
    http.ts        http.fetch, http.post
  test-runner.ts   discovers and runs test blocks
  cli.ts           entrypoint: brief run, brief test, brief repl
```

## Testing

```bash
pnpm test          # run all vitest tests
pnpm test:watch    # watch mode
```

## Status

v0.1.0 - core language implemented:
- lexer, parser, resolver, interpreter
- all control flow (if/else, unless, until, for, for await, when, postfix if)
- functions, closures, recursion
- tool calls with permission gating
- Result type with or fail / or return
- await all for parallel execution
- streaming with for await
- test blocks with mock/expect
- core stdlib (print, len, trim, split, join, slice, parseInt, parseFloat, toString)
- CLI with run, test, and repl commands

## License

MIT
