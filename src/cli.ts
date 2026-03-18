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
const COMMANDS = ["run", "test", "check", "repl"] as const;
type FileCommand = "run" | "test" | "check";
type OutputMode = "text" | "json";
type CheckSummary = {
  ok: boolean;
  label: string;
  permissions: number;
  topLevelStatements: number;
  testBlocks: number;
};
type TestSummary = {
  ok: boolean;
  label: string;
  passed: number;
  failed: number;
  results: Array<{ description: string; passed: boolean; error?: string }>;
};

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

class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliError";
  }
}

function readSourceInput(filePath: string, commandName: FileCommand): { source: string; label: string } {
  if (filePath === "-") {
    if (process.stdin.isTTY) {
      throw new CliError(`error: brief ${commandName} expected script source on stdin when file path is '-'`);
    }
    try {
      return { source: fs.readFileSync(0, "utf-8"), label: "stdin" };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new CliError(`error: brief ${commandName} could not read stdin: ${message}`);
    }
  }

  try {
    return { source: fs.readFileSync(filePath, "utf-8"), label: filePath };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new CliError(`error: brief ${commandName} could not read '${filePath}': ${message}`);
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

function printRunHelp(): void {
  console.log("usage:");
  console.log("  brief run <file.br|-> [script args...]");
  console.log("\nexamples:");
  console.log("  brief run script.br");
  console.log("  brief run script.br file.txt --verbose");
  console.log("  brief run - --flag < script.br");
}

function printTestHelp(): void {
  console.log("usage:");
  console.log("  brief test <file.br|-> [--json]");
  console.log("\noptions:");
  console.log("  --json   emit machine-readable test results");
  console.log("\nexamples:");
  console.log("  brief test script.br");
  console.log("  brief test script.br --json");
  console.log("  brief test - --json < script.br");
}

function printCheckHelp(): void {
  console.log("usage:");
  console.log("  brief check <file.br|-> [--json]");
  console.log("\noptions:");
  console.log("  --json   emit machine-readable validation output");
  console.log("\nexamples:");
  console.log("  brief check script.br");
  console.log("  brief check script.br --json");
  console.log("  brief check - < script.br");
}

function printReplHelp(): void {
  console.log("usage:");
  console.log("  brief repl");
  console.log("\nStart an interactive Brief REPL session.");
  console.log("\nexamples:");
  console.log("  brief repl");
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

function parseTestOrCheckArgs(commandName: "test" | "check", args: string[]): {
  file: string | null;
  outputMode: OutputMode;
  help: boolean;
} {
  let outputMode: OutputMode = "text";
  let help = false;
  let file: string | null = null;

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg === "--json") {
      outputMode = "json";
      continue;
    }
    if (!file) {
      file = arg;
      continue;
    }
    throw new CliError(`error: brief ${commandName} received unexpected argument '${arg}'`);
  }

  return { file, outputMode, help };
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function emitJsonErrorAndExit(error: unknown, extra: Record<string, unknown> = {}): never {
  const message =
    error instanceof BriefRuntimeError ? error.format()
    : error instanceof Error ? error.message
    : String(error);
  printJson({ ok: false, error: message, ...extra });
  process.exit(1);
}

function summarizeCheck(label: string, source: string): CheckSummary {
  const program = parse(source);
  const resolved = resolve(program);

  if (resolved.errors.length > 0) {
    throw resolved.errors[0];
  }

  return {
    ok: true,
    label,
    permissions: program.allow.permissions.length,
    topLevelStatements: program.body.length,
    testBlocks: program.tests.length,
  };
}

async function summarizeTests(label: string, source: string): Promise<TestSummary> {
  const results = await runTests(source);
  const passed = results.filter(result => result.passed).length;
  const failed = results.length - passed;

  return {
    ok: failed === 0,
    label,
    passed,
    failed,
    results,
  };
}

async function main() {
  if (!command || command === "--help" || command === "-h") {
    printHelp();
    process.exit(0);
  }

  if (command === "run") {
    const file = cliArgs[1];
    const scriptArgs = cliArgs.slice(2);
    if (file === "--help" || file === "-h") {
      printRunHelp();
      return;
    }
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
    const { file, outputMode, help } = parseTestOrCheckArgs("test", cliArgs.slice(1));
    if (help) {
      printTestHelp();
      return;
    }
    if (!file) {
      console.error("error: brief test requires a file path");
      process.exit(1);
    }
    try {
      const { source, label } = readSourceInput(file, "test");
      const summary = await summarizeTests(label, source);

      if (outputMode === "json") {
        printJson(summary);
        if (!summary.ok) process.exit(1);
        return;
      }

      if (summary.results.length === 0) {
        console.log(`no tests found in ${label}`);
        return;
      }

      for (const r of summary.results) {
        if (r.passed) {
          console.log(`  ✓ ${r.description}`);
        } else {
          console.log(`  ✗ ${r.description}`);
          console.log(`    ${r.error}`);
        }
      }

      console.log(`\n${summary.passed} passed, ${summary.failed} failed`);
      if (!summary.ok) process.exit(1);
    } catch (e) {
      if (outputMode === "json") emitJsonErrorAndExit(e, { label: file === "-" ? "stdin" : file });
      printErrorAndExit(e);
    }
    return;
  }

  if (command === "check") {
    const { file, outputMode, help } = parseTestOrCheckArgs("check", cliArgs.slice(1));
    if (help) {
      printCheckHelp();
      return;
    }
    if (!file) {
      console.error("error: brief check requires a file path");
      process.exit(1);
    }
    try {
      const { source, label } = readSourceInput(file, "check");
      const summary = summarizeCheck(label, source);
      if (outputMode === "json") {
        printJson(summary);
        return;
      }

      console.log(`✓ ${summary.label} is valid`);
      console.log(`  ${pluralize(summary.permissions, "permission")}`);
      console.log(`  ${pluralize(summary.topLevelStatements, "top-level statement")}`);
      console.log(`  ${pluralize(summary.testBlocks, "test block")}`);
    } catch (e) {
      if (outputMode === "json") emitJsonErrorAndExit(e, { label: file === "-" ? "stdin" : file });
      printErrorAndExit(e);
    }
    return;
  }

  if (command === "repl") {
    if (cliArgs[1] === "--help" || cliArgs[1] === "-h") {
      printReplHelp();
      return;
    }
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
