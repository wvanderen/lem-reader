import { readFileSync } from "node:fs";

// Sum attempt durations, including retries: these are worker time, not wall
// time. Compare runs from the same machine and record load separately.
const paths = process.argv.slice(2);
if (!paths.length)
  throw new Error("Usage: node scripts/summarize-e2e.mjs <report.json> [report.json]");
for (const path of paths) {
  const report = JSON.parse(readFileSync(path, "utf8"));
  if (report.errors?.length) throw new Error(`${path}: report contains discovery/global errors`);
  const files = new Map();
  function visit(suite) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        const key = `${test.projectName} ${spec.file}`;
        const row = files.get(key) ?? { milliseconds: 0, attempts: 0, failures: 0 };
        for (const result of test.results ?? []) {
          row.milliseconds += result.duration;
          row.attempts++;
          if (["failed", "timedOut", "interrupted"].includes(result.status)) row.failures++;
        }
        files.set(key, row);
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  }
  for (const suite of report.suites) visit(suite);
  console.log(
    `\n${path}: wall ${(report.stats.duration / 1000).toFixed(1)}s; ${report.stats.unexpected} unexpected; ${report.stats.flaky} flaky`,
  );
  console.log("Worker seconds | attempts | failed attempts | project/spec");
  for (const [key, row] of [...files].sort((a, b) => b[1].milliseconds - a[1].milliseconds)) {
    console.log(
      `${(row.milliseconds / 1000).toFixed(1)} | ${row.attempts} | ${row.failures} | ${key}`,
    );
  }
}
