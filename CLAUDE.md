# Brief Language Interpreter

## Project overview

Brief is an agentic scripting language interpreter implemented in TypeScript. Scripts use `.br` extension and execute top to bottom with a permission-gated tool call system.

## Tech stack

- TypeScript (strict mode, ES2022)
- Vitest for testing
- pnpm for package management
- @anthropic-ai/sdk for AI features
- Node.js built-ins for everything else

## Key commands

```bash
pnpm test              # run all tests
pnpm test -- tests/lexer.test.ts  # run specific test file
pnpm brief run <file>  # run a .br script
pnpm brief test <file> # run test blocks in a .br script
```

## Architecture

The interpreter pipeline is: source → lexer → parser → resolver → interpreter

- `src/lexer.ts` - tokenizer, produces Token[]
- `src/parser.ts` - recursive descent parser, produces AST (defined in `src/ast.ts`)
- `src/resolver.ts` - name resolution, permission validation
- `src/interpreter.ts` - tree-walk evaluator with async support
- `src/runtime.ts` - ties pipeline together, tool registry, mock system
- `src/result.ts` - Result<T> type (Ok/failed), error classes
- `src/stream.ts` - BriefStream<T> for async iteration
- `src/stdlib/` - built-in functions and tool implementations

## Conventions

- camelCase for all identifiers
- every source file has a corresponding test file in `tests/`
- tests use vitest describe/it/expect
- @anthropic-ai/sdk is the only external runtime dep
- lowercase informal commit messages
