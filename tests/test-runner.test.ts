import { describe, it, expect } from "vitest";
import { runTests } from "../src/test-runner.js";

describe("test runner", () => {
  it("evaluates expect subjects instead of only the program result", async () => {
    const results = await runTests(`allow
  fs.read

print("hi")

test "evaluates inline expression" {
  expect 2 + 3 to be 5
}`);

    expect(results).toEqual([{ description: "evaluates inline expression", passed: true }]);
  });

  it("supports specific ok values for await run()", async () => {
    const results = await runTests(`allow
  fs.read

return "hello"

test "matches ok value" {
  expect await run() to be ok("hello")
}`);

    expect(results).toEqual([{ description: "matches ok value", passed: true }]);
  });

  it("runs setup statements inside test blocks before expects", async () => {
    const results = await runTests(`allow
  fs.read

print("hi")

test "uses test-local variables" {
  let total = 2 + 3
  expect total to be 5
}`);

    expect(results).toEqual([{ description: "uses test-local variables", passed: true }]);
  });
});
