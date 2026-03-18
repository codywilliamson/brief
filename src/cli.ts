#!/usr/bin/env node

// brief cli - brief run <file>, brief test <file>, brief repl

import * as fs from "node:fs";
import * as readline from "node:readline";
import { runBrief, createToolRegistry } from "./runtime.js";
import { runTests } from "./test-runner.js";
import { fsRead, fsWrite, fsExists, fsMkdir, fsList, fsStat, fsAppend, fsCopy, fsMove, fsDelete, fsGlob } from "./stdlib/fs.js";
import { httpFetch, httpPost } from "./stdlib/http.js";
import { aiComplete, aiStream, aiConverse, aiToolUse } from "./stdlib/ai.js";
import { BriefRuntimeError } from "./result.js";
import { parse } from "./parser.js";
import { resolve } from "./resolver.js";

const cliArgs = process.argv.slice(2);
const command = cliArgs[0];
const file = cliArgs[1];
const scriptArgs = cliArgs.slice(2); // args passed to the .br script
const COMMANDS = ["run", "test", "check", "repl"] as const;
type FileCommand = "run" | "test" | "check";

function createDefaultRegistry() {
  const reg = createToolRegistry();
  reg.register("fs.read", fsRead);
  reg.register("fs.write", fsWrite);
  reg.register("fs.exists", fsExists);
  reg.register("fs.mkdir", fsMkdir);
  reg.register("fs.list", fsList);
  reg.register("fs.stat", fsStat);
  reg.register("fs.append", fsAppend);
  reg.register("fs.copy", fsCopy);
  reg.register("fs.move", fsMove);
  reg.register("fs.delete", fsDelete);
  reg.register("fs.glob", fsGlob);
  reg.register("http.fetch", httpFetch);
  reg.register("http.post", httpPost);
  reg.register("ai.complete", aiComplete);
  reg.registerStream("ai.stream", aiStream);
  reg.register("ai.converse", aiConverse);
  reg.register("ai.toolUse", aiToolUse);
  return reg;
}

function readSourceInput(filePath: string, commandName: FileCommand): { source: string; label: string } {
  if (filePath === "-") {
    if (process.stdin.isTTY) {
      console.error(`error: brief ${commandName} expected script source on stdin when file path is '-'`);
      process.exit(1);
    }
    try {
      return { source: fs.readFileSync(0, "utf-8"), label: "stdin" };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`error: brief ${commandName} could not read stdin: ${message}`);
      process.exit(1);
    }
  }

  try {
    return { source: fs.readFileSync(filePath, "utf-8"), label: filePath };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`error: brief ${commandName} could not read '${filePath}': ${message}`);
    process.exit(1);
  }
}

function printHelp(): void {
  console.log("brief - the brief language interpreter\n");
  console.log("usage:");
  console.log("  brief run <file.br|-> [script args...]");
  console.log("  brief test <file.br|->");
  console.log("  brief check <file.br|->");
  console.log("  brief repl");
  console.log("\ncommands:");
  console.log("  run    execute a script");
  console.log("  test   run test blocks in a script");
  console.log("  check  parse and validate a script without executing tools");
  console.log("  repl   start the interactive repl");
  console.log("\nexamples:");
  console.log("  brief run script.br");
  console.log("  brief run script.br file.txt --verbose");
  console.log("  brief run - --flag < script.br");
  console.log("  brief test script.br");
  console.log("  brief check script.br");
  console.log("  brief check - < script.br");
  console.log("\nnotes:");
  console.log("  use '-' to read the script from stdin");
}

function printErrorAndExit(error: unknown): never {
  if (error instanceof BriefRuntimeError) {
    console.error(error.format());
  } else if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }
  process.exit(1);
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function suggestCommand(input: string): string | null {
  if (!input) return null;

  for (const candidate of COMMANDS) {
    if (candidate.startsWith(input) || input.startsWith(candidate)) return candidate;
  }

  let best: { command: string; distance: number } | null = null;
  for (const candidate of COMMANDS) {
    const distance = levenshtein(input, candidate);
    if (!best || distance < best.distance) {
      best = { command: candidate, distance };
    }
  }

  return best && best.distance <= 2 ? best.command : null;
}

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[a.length][b.length];
}

async function main() {
  if (!command || command === "--help" || command === "-h") {
    printHelp();
    process.exit(0);
  }

  if (command === "run") {
    if (!file) {
      console.error("error: brief run requires a file path");
      process.exit(1);
    }
    try {
      const { source } = readSourceInput(file, "run");
      const registry = createDefaultRegistry();
      const result = await runBrief({ source, registry, scriptArgs });
    } catch (e) {
      printErrorAndExit(e);
    }
    return;
  }

  if (command === "test") {
    if (!file) {
      console.error("error: brief test requires a file path");
      process.exit(1);
    }
    try {
      const { source, label } = readSourceInput(file, "test");
      const results = await runTests(source);
      if (results.length === 0) {
        console.log(`no tests found in ${label}`);
        return;
      }
      let passed = 0;
      let failed = 0;

      for (const r of results) {
        if (r.passed) {
          console.log(`  ✓ ${r.description}`);
          passed++;
        } else {
          console.log(`  ✗ ${r.description}`);
          console.log(`    ${r.error}`);
          failed++;
        }
      }

      console.log(`\n${passed} passed, ${failed} failed`);
      if (failed > 0) process.exit(1);
    } catch (e) {
      printErrorAndExit(e);
    }
    return;
  }

  if (command === "check") {
    if (!file) {
      console.error("error: brief check requires a file path");
      process.exit(1);
    }
    try {
      const { source, label } = readSourceInput(file, "check");
      const program = parse(source);
      const resolved = resolve(program);

      if (resolved.errors.length > 0) {
        throw resolved.errors[0];
      }

      console.log(`✓ ${label} is valid`);
      console.log(`  ${pluralize(program.allow.permissions.length, "permission")}`);
      console.log(`  ${pluralize(program.body.length, "top-level statement")}`);
      console.log(`  ${pluralize(program.tests.length, "test block")}`);
    } catch (e) {
      printErrorAndExit(e);
    }
    return;
  }

  if (command === "repl") {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "brief> ",
    });

    console.log("brief repl v0.1.0 - type 'exit' to quit");
    rl.prompt();

    let buffer = "";
    const registry = createDefaultRegistry();

    rl.on("line", async (line) => {
      if (line.trim() === "exit") {
        rl.close();
        return;
      }

      buffer += line + "\n";

      // simple heuristic: if buffer has allow block and balanced braces, try to run
      if (buffer.includes("allow") && isBalanced(buffer)) {
        try {
          const result = await runBrief({ source: buffer.trim(), registry });
          if (result.value !== null && result.value !== undefined) {
            console.log(result.value);
          }
        } catch (e) {
          if (e instanceof BriefRuntimeError) {
            console.error(e.format());
          } else {
            console.error(String(e));
          }
        }
        buffer = "";
      }

      rl.prompt();
    });

    rl.on("close", () => {
      console.log("\nbye");
      process.exit(0);
    });
    return;
  }

  const suggestion = suggestCommand(command);
  console.error(`unknown command '${command}'.`);
  if (suggestion) {
    console.error(`did you mean '${suggestion}'?`);
  }
  console.error("run 'brief --help' for usage.");
  process.exit(1);
}

function isBalanced(source: string): boolean {
  let depth = 0;
  for (const ch of source) {
    if (ch === "{") depth++;
    if (ch === "}") depth--;
  }
  return depth === 0;
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
