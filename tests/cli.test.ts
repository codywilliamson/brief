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

function runCli(args: string[]) {
  return spawnSync("pnpm", ["exec", "tsx", "src/cli.ts", ...args], {
    cwd: process.cwd(),
    encoding: "utf-8",
  });
}

describe("cli", () => {
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
