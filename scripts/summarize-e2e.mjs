import { readFileSync } from "node:fs";

// Worker-time ranking for the uploaded functional.json reports. "first" sums
// each spec's first attempts (the ordinary-case cost); "retry" sums repeat
// attempts (the flake cost) — kept separate so a contended run's timeout
// retries are not misread as suite size. Totals include retries: these are
// worker time, not wall time. Compare runs from the same machine and record
// load separately.
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
        const row = files.get(key) ?? { firstMs: 0, retryMs: 0, attempts: 0, failures: 0 };
        const results = test.results ?? [];
        for (const [index, result] of results.entries()) {
          if (index === 0) row.firstMs += result.duration;
          else row.retryMs += result.duration;
          row.attempts++;
          if (["failed", "timedOut", "interrupted"].includes(result.status)) row.failures++;
        }
        files.set(key, row);
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  }
  for (const suite of report.suites) visit(suite);
  const firstTotal = [...files.values()].reduce((acc, r) => acc + r.firstMs, 0);
  const retryTotal = [...files.values()].reduce((acc, r) => acc + r.retryMs, 0);
  console.log(
    `\n${path}: wall ${(report.stats.duration / 1000).toFixed(1)}s; ${report.stats.unexpected} unexpected; ${report.stats.flaky} flaky`,
  );
  console.log(
    `Worker time: first attempts ${(firstTotal / 1000).toFixed(1)}s + retries ${(retryTotal / 1000).toFixed(1)}s = ${((firstTotal + retryTotal) / 1000).toFixed(1)}s total`,
  );
  console.log("First s | retry s | attempts | failed | project/spec (sorted by total worker time)");
  for (const [key, row] of [...files].sort(
    (a, b) => b[1].firstMs + b[1].retryMs - (a[1].firstMs + a[1].retryMs),
  )) {
    console.log(
      `${(row.firstMs / 1000).toFixed(1)} | ${(row.retryMs / 1000).toFixed(1)} | ${row.attempts} | ${row.failures} | ${key}`,
    );
  }
}
