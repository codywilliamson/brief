import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { runTests } from "../src/test-runner.js";

const e2eDir = path.join(process.cwd(), "tests", "e2e");
const e2eFiles = (await fs.readdir(e2eDir))
  .filter(file => file.endsWith(".br"))
  .sort();

describe("e2e brief scripts", () => {
  for (const file of e2eFiles) {
    it(file, async () => {
      const source = await fs.readFile(path.join(e2eDir, file), "utf-8");
      const results = await runTests(source);
      const failures = results.filter(result => !result.passed);

      expect(failures).toEqual([]);
    });
  }
});
