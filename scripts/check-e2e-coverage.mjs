import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

function discover(config) {
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/@playwright/test/cli.js",
      "test",
      `--config=${config}`,
      "--list",
      "--reporter=json",
    ],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  assert.equal(result.status, 0, result.stderr);
  const cases = new Map();
  function visit(suite, ancestors = []) {
    const titles = [...ancestors, suite.title];
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        const key = JSON.stringify([
          test.projectName,
          spec.file,
          spec.line,
          spec.column,
          ...titles,
          spec.title,
        ]);
        assert.ok(!cases.has(key), `Duplicate discovery identity: ${key}`);
        cases.set(key, { project: test.projectName, file: spec.file });
      }
    }
    for (const child of suite.suites ?? []) visit(child, titles);
  }
  for (const suite of JSON.parse(result.stdout).suites) visit(suite);
  return cases;
}

// The PR config and guard share one explicit map of reviewed opt-outs.
const full = discover("playwright.config.ts");
const pr = discover("playwright.pr.config.ts");
const { readFileSync } = await import("node:fs");
const optOuts = Object.keys(JSON.parse(readFileSync("tests/e2e/pr-coverage.json", "utf8")));
assert.ok(optOuts.length > 0, "No reviewed opt-outs found");
for (const path of optOuts) {
  assert.ok(
    [...full.values()].some((entry) => entry.file.endsWith(path)),
    `Stale opt-out: ${path}`,
  );
}
for (const [key, entry] of full) {
  const omitted = entry.project !== "chromium" && optOuts.some((path) => entry.file.endsWith(path));
  assert.equal(pr.has(key), !omitted, `Unexpected PR coverage: ${key}`);
}
for (const key of pr.keys()) assert.ok(full.has(key), `Unexpected extra PR case: ${key}`);
console.log(
  `E2e coverage verified: ${pr.size} PR cases; ${full.size} exhaustive cases; every Chromium case retained.`,
);
