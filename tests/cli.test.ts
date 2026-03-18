import { describe, it, expect, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
});

async function writeTempScript(filename: string, source: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "brief-cli-test-"));
  tempDirs.push(dir);
  const scriptPath = path.join(dir, filename);
  await fs.writeFile(scriptPath, source, "utf-8");
  return scriptPath;
}

function runCli(args: string[], input?: string) {
  return spawnSync("pnpm", ["exec", "tsx", "src/cli.ts", ...args], {
    cwd: process.cwd(),
    encoding: "utf-8",
    input,
  });
}

describe("cli", () => {
  it("prints helpful usage with examples", () => {
    const result = runCli(["--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("brief check <file.br|->");
    expect(result.stdout).toContain("brief run - --flag < script.br");
    expect(result.stdout).toContain("use '-' to read the script from stdin");
  });

  it("prints command-specific help for test", () => {
    const result = runCli(["test", "--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("brief test <file.br|-> [--json]");
    expect(result.stdout).toContain("--json   emit machine-readable test results");
  });

  it("prints command-specific help for check", () => {
    const result = runCli(["check", "--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("brief check <file.br|-> [--json]");
    expect(result.stdout).toContain("--json   emit machine-readable validation output");
  });

  it("prints command-specific help for run", () => {
    const result = runCli(["run", "--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("brief run <file.br|-> [script args...]");
  });

  it("prints command-specific help for repl", () => {
    const result = runCli(["repl", "--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("brief repl");
    expect(result.stdout).toContain("Start an interactive Brief REPL session.");
  });

  it("suggests a nearby command name for typos", () => {
    const result = runCli(["chcek"]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unknown command 'chcek'.");
    expect(result.stderr).toContain("did you mean 'check'?");
  });

  it("validates scripts with brief check", async () => {
    const scriptPath = await writeTempScript("valid.br", `allow
  fs.read
print("hi")

test "works" {
  expect 1 to be 1
}`);

    const result = runCli(["check", scriptPath]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`✓ ${scriptPath} is valid`);
    expect(result.stdout).toContain("1 permission");
    expect(result.stdout).toContain("1 top-level statement");
    expect(result.stdout).toContain("1 test block");
  });

  it("emits JSON for brief check", async () => {
    const scriptPath = await writeTempScript("valid-json.br", `allow
  fs.read
print("hi")`);

    const result = runCli(["check", scriptPath, "--json"]);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      label: scriptPath,
      permissions: 1,
      topLevelStatements: 1,
      testBlocks: 0,
    });
  });

  it("supports stdin input for brief check", () => {
    const result = runCli(["check", "-"], `allow
  fs.read
print("hi")`);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("✓ stdin is valid");
  });

  it("emits JSON errors for invalid brief check input", async () => {
    const scriptPath = await writeTempScript("invalid-json.br", `allow
print("hi")`);

    const result = runCli(["check", scriptPath, "--json"]);

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      label: scriptPath,
    });
  });

  it("formats missing file errors for brief run without a Node stack", () => {
    const missingPath = path.join(os.tmpdir(), "brief-cli-missing-run.br");
    const result = runCli(["run", missingPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`error: brief run could not read '${missingPath}':`);
    expect(result.stderr).not.toContain("at Module.readFileSync");
  });

  it("formats missing file errors for brief test without a Node stack", () => {
    const missingPath = path.join(os.tmpdir(), "brief-cli-missing-test.br");
    const result = runCli(["test", missingPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`error: brief test could not read '${missingPath}':`);
    expect(result.stderr).not.toContain("at Module.readFileSync");
  });

  it("prints a friendly message when no tests are present", async () => {
    const scriptPath = await writeTempScript("no-tests.br", `allow
  fs.read
print("hi")`);

    const result = runCli(["test", scriptPath]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`no tests found in ${scriptPath}`);
  });

  it("emits JSON for brief test", async () => {
    const scriptPath = await writeTempScript("tests-json.br", `allow
  fs.read

test "works" {
  expect 1 to be 1
}`);

    const result = runCli(["test", "--json", scriptPath]);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      label: scriptPath,
      passed: 1,
      failed: 0,
      results: [{ description: "works", passed: true }],
    });
  });

  it("emits JSON failures for brief test", async () => {
    const scriptPath = await writeTempScript("tests-json-fail.br", `allow
  fs.read

test "fails" {
  expect 1 to be 2
}`);

    const result = runCli(["test", scriptPath, "--json"]);

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      label: scriptPath,
      passed: 0,
      failed: 1,
      results: [{ description: "fails", passed: false }],
    });
  });

  it("formats runtime errors for brief run", async () => {
    const scriptPath = await writeTempScript("runtime-error.br", `allow
  fs.read
await ask fs.read("missing.txt") or fail "read failed"`);

    const result = runCli(["run", scriptPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Brief runtime error: read failed");
    expect(result.stderr).toContain('at line 3: await ask fs.read("missing.txt") or fail "read failed"');
  });

  it("formats permission errors for brief run", async () => {
    const scriptPath = await writeTempScript("permission-error.br", `allow
  fs.read
await ask fs.write("out.txt", "content")`);

    const result = runCli(["run", scriptPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Brief permission error: 'fs.write' not declared in allow block");
    expect(result.stderr).toContain('at line 3: await ask fs.write("out.txt", "content")');
  });
});
