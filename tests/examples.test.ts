import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { runTests } from "../src/test-runner.js";

const examplesDir = path.join(process.cwd(), "examples");
const exampleFiles = (await fs.readdir(examplesDir))
  .filter(file => file.endsWith(".br"))
  .sort();

describe("example scripts", () => {
  for (const file of exampleFiles) {
    it(file, async () => {
      const source = await fs.readFile(path.join(examplesDir, file), "utf-8");
      const results = await runTests(source);
      const failures = results.filter(result => !result.passed);

      expect(failures).toEqual([]);
    });
  }
});
