#!/usr/bin/env node

// brief cli - brief run <file>, brief test <file>, brief repl

import * as fs from "node:fs";
import * as readline from "node:readline";
import { runBrief, createToolRegistry } from "./runtime.js";
import { runTests } from "./test-runner.js";
import { fsRead, fsWrite, fsExists, fsMkdir, fsList, fsStat, fsAppend, fsCopy, fsMove, fsDelete, fsGlob } from "./stdlib/fs.js";
import { httpFetch, httpPost } from "./stdlib/http.js";
import { aiComplete, aiStream, aiConverse, aiToolUse } from "./stdlib/ai.js";
import { BriefRuntimeError, BriefPermissionError } from "./result.js";

const cliArgs = process.argv.slice(2);
const command = cliArgs[0];
const file = cliArgs[1];
const scriptArgs = cliArgs.slice(2); // args passed to the .br script

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

async function main() {
  if (!command || command === "--help" || command === "-h") {
    console.log("brief - the brief language interpreter\n");
    console.log("usage:");
    console.log("  brief run <file.br>    run a brief script");
    console.log("  brief test <file.br>   run tests in a brief script");
    console.log("  brief repl             start interactive repl");
    process.exit(0);
  }

  if (command === "run") {
    if (!file) {
      console.error("error: brief run requires a file path");
      process.exit(1);
    }
    try {
      const source = fs.readFileSync(file, "utf-8");
      const registry = createDefaultRegistry();
      const result = await runBrief({ source, registry, scriptArgs });
    } catch (e) {
      if (e instanceof BriefRuntimeError) {
        console.error(e.format());
        process.exit(1);
      }
      throw e;
    }
    return;
  }

  if (command === "test") {
    if (!file) {
      console.error("error: brief test requires a file path");
      process.exit(1);
    }
    try {
      const source = fs.readFileSync(file, "utf-8");
      const results = await runTests(source);
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
      if (e instanceof BriefRuntimeError) {
        console.error(e.format());
        process.exit(1);
      }
      throw e;
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

  console.error(`unknown command '${command}'. run 'brief --help' for usage.`);
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
