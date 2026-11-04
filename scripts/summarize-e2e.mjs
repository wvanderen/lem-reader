import { readFileSync } from "node:fs";

// Issue #254 — the ONE e2e report reader (no ad hoc report walkers). Two
// halves:
//
//   summarizeReport(report) — a pure function over Playwright's JSON-reporter
//     shape (playwright/types/testReporter.d.ts: JSONReport). Returns the
//     structured summary: per-engine outcomes, actionable failure details,
//     launch-failure classification, and the preserved first/retry worker-time
//     ranking. Unit-tested in tests/unit/summarize-e2e.test.ts.
//
//   CLI — the historical ranking printer, extended with the per-engine table,
//     failure details, and launch errors. "first" sums each spec's first
//     attempts (the ordinary-case cost); "retry" sums repeat attempts (the
//     flake cost) — kept separate so a contended run's timeout retries are not
//     misread as suite size. Totals include retries: these are worker time,
//     not wall time. Compare runs from the same machine and record load
//     separately.
//
// Traversal visits every root suite and every nested suite, and tolerates
// partial results (a test whose `results` array is empty — the run died
// before it started) so multi-root and interrupted reports still summarize.

/** Browser-launch failure signatures (best effort — "where identifiable"). */
const LAUNCH_FAILURE =
  /browserType\.launch|Executable doesn't exist|Failed to launch|browser has been closed|Target closed/i;

function newTraversal() {
  const files = new Map();
  const engines = new Map();
  const failures = [];
  const launchErrors = [];
  const visitSuite = (suite, titlePath) => {
    const path = suite.title ? [...titlePath, suite.title] : titlePath;
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        const key = `${test.projectName} ${spec.file}`;
        const engine = engines.get(test.projectName) ?? {
          project: test.projectName,
          expected: 0,
          unexpected: 0,
          flaky: 0,
          skipped: 0,
          interrupted: 0,
          firstMs: 0,
          retryMs: 0,
          attempts: 0,
          failures: 0,
        };
        engines.set(test.projectName, engine);
        const row = files.get(key) ?? { firstMs: 0, retryMs: 0, attempts: 0, failures: 0 };
        files.set(key, row);
        engine[rowKey(test.status)] += 1;
        let testInterrupted = false;
        let testFailed = false;
        for (const [index, result] of (test.results ?? []).entries()) {
          if (index === 0) {
            row.firstMs += result.duration ?? 0;
            engine.firstMs += result.duration ?? 0;
          } else {
            row.retryMs += result.duration ?? 0;
            engine.retryMs += result.duration ?? 0;
          }
          row.attempts++;
          engine.attempts++;
          if (["failed", "timedOut", "interrupted"].includes(result.status)) {
            row.failures++;
            engine.failures++;
            testFailed = true;
            if (result.status === "interrupted") testInterrupted = true;
            for (const entry of [result.error, ...(result.errors ?? [])]) {
              if (entry?.message && LAUNCH_FAILURE.test(entry.message)) {
                launchErrors.push({
                  project: test.projectName,
                  message: entry.message,
                  location: entry.location,
                  launch: true,
                });
              }
            }
          }
        }
        engine.interrupted += testInterrupted ? 1 : 0;
        if (testFailed || test.status === "unexpected") {
          // A successful retry has no assertion error. Keep the overall
          // verdict, but source actionable details from the failed attempt.
          const results = test.results ?? [];
          const detail =
            results.findLast((result) =>
              ["failed", "timedOut", "interrupted"].includes(result.status),
            ) ?? results.at(-1);
          failures.push({
            project: test.projectName,
            file: spec.file,
            line: spec.line,
            titlePath: [...path, spec.title],
            status: ["unexpected", "flaky"].includes(test.status)
              ? test.status
              : (detail?.status ?? test.status),
            durationMs: detail?.duration ?? 0,
            message: failureMessage(detail?.status === "interrupted", detail),
          });
        }
      }
    }
    for (const child of suite.suites ?? []) visitSuite(child, path);
  };
  return { files, engines, failures, launchErrors, visitSuite };
}

function rowKey(status) {
  if (status === "unexpected") return "unexpected";
  if (status === "flaky") return "flaky";
  if (status === "skipped") return "skipped";
  return "expected";
}

/** The actionable head of a failed attempt: the interruption marker or the
 * first lines of the error message (stack frames rarely name the cause). */
function failureMessage(interrupted, result) {
  if (interrupted) return "interrupted (run or worker ended before a verdict)";
  const message = result?.error?.message ?? result?.errors?.find((e) => e.message)?.message;
  if (!message) return "no error message recorded (partial result)";
  return message.split("\n").slice(0, 8).join("\n").slice(0, 800);
}

export function summarizeReport(report) {
  const traversal = newTraversal();
  for (const suite of report.suites ?? []) traversal.visitSuite(suite, []);
  // Root-level errors carry discovery/global failures, including the
  // browser-launch failures that never reach a test.
  for (const error of report.errors ?? []) {
    traversal.launchErrors.push({
      project: null,
      message: error.message,
      location: error.location,
      launch: LAUNCH_FAILURE.test(error.message ?? ""),
    });
  }
  return {
    stats: report.stats,
    engines: [...traversal.engines.values()].sort((a, b) => a.project.localeCompare(b.project)),
    failures: traversal.failures,
    launchErrors: traversal.launchErrors,
    files: [...traversal.files.entries()].map(([key, row]) => ({ key, ...row })),
  };
}

function renderSummary(path, summary) {
  const lines = [];
  const stats = summary.stats ?? {};
  lines.push(
    `\n${path}: wall ${((stats.duration ?? 0) / 1000).toFixed(1)}s; ${stats.unexpected ?? 0} unexpected; ${stats.flaky ?? 0} flaky`,
  );
  const firstTotal = summary.files.reduce((acc, r) => acc + r.firstMs, 0);
  const retryTotal = summary.files.reduce((acc, r) => acc + r.retryMs, 0);
  lines.push(
    `Worker time: first attempts ${(firstTotal / 1000).toFixed(1)}s + retries ${(retryTotal / 1000).toFixed(1)}s = ${((firstTotal + retryTotal) / 1000).toFixed(1)}s total`,
  );
  lines.push("Per-engine outcomes (test verdicts; a pass on one engine never excuses another):");
  for (const engine of summary.engines) {
    lines.push(
      `  ${engine.project}: ${engine.expected} expected, ${engine.unexpected} unexpected, ${engine.flaky} flaky, ${engine.skipped} skipped` +
        (engine.interrupted ? `, ${engine.interrupted} interrupted` : "") +
        (engine.failures ? `  ← FAILING` : ""),
    );
  }
  const failing = summary.engines.filter((e) => e.unexpected > 0 || e.failures > 0);
  if (failing.length) lines.push(`Engines failing: ${failing.map((e) => e.project).join(", ")}`);
  if (summary.launchErrors.length) {
    lines.push("Launch/global errors:");
    for (const error of summary.launchErrors) {
      const at = error.location ? ` (${error.location.file}:${error.location.line ?? "?"})` : "";
      lines.push(
        `  ${error.project ? `[${error.project}] ` : ""}${error.launch ? "(launch failure) " : ""}${error.message.split("\n")[0]}${at}`,
      );
    }
  }
  if (summary.failures.length) {
    lines.push("Failure details:");
    for (const failure of summary.failures) {
      lines.push(
        `  [${failure.project}] ${failure.file}:${failure.line ?? "?"} — ${failure.titlePath.join(" > ")} (${failure.status}, ${(failure.durationMs / 1000).toFixed(1)}s)`,
      );
      for (const line of failure.message.split("\n")) lines.push(`    ${line}`);
    }
  }
  lines.push("First s | retry s | attempts | failed | project/spec (sorted by total worker time)");
  for (const row of summary.files
    .slice()
    .sort((a, b) => b.firstMs + b.retryMs - (a.firstMs + a.retryMs))) {
    lines.push(
      `${(row.firstMs / 1000).toFixed(1)} | ${(row.retryMs / 1000).toFixed(1)} | ${row.attempts} | ${row.failures} | ${row.key}`,
    );
  }
  return lines.join("\n");
}

const paths = process.argv.slice(2);
if (process.env.VITEST_WORKER_ID === undefined && !paths.length)
  throw new Error("Usage: node scripts/summarize-e2e.mjs <report.json> [report.json]");
for (const path of paths) {
  const report = JSON.parse(readFileSync(path, "utf8"));
  // Root `errors` are no longer a reason to refuse the report (the old
  // hard-throw hid exactly the launch/discovery failures issue #254 asks
  // this reader to expose) — they are classified and printed below.
  console.log(
    renderSummary(path, summarizeReport(report)),
    report.errors?.length ? `\n(${path}: ${report.errors.length} root-level error(s) present)` : "",
  );
}
