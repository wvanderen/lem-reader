// Issue #254 — the e2e report summarizer must expose per-engine outcomes,
// unexpected/flaky/interrupted/launch failures where identifiable, and
// actionable failure details — traversing every root and nested suite — so
// one engine's passes cannot conceal another engine's failures. The existing
// timing summaries (first-attempt vs retry worker time, wall vs worker) are
// preserved and pinned here too.
//
// The fixtures mirror Playwright's JSON-reporter shape (playwright's
// testReporter.d.ts: JSONReport / JSONReportSuite / JSONReportTest /
// JSONReportTestResult). Expectations are literal worked examples — never
// recomputed the way the summarizer computes them.
import { describe, expect, it } from "vitest";
import { summarizeReport } from "../../scripts/summarize-e2e.mjs";
import type {
  JSONReport,
  JSONReportTest,
  JSONReportTestResult,
} from "playwright/types/testReporter";

type Report = JSONReport;

function attempt(
  status: JSONReportTestResult["status"],
  duration: number,
  error?: { message: string },
  retry = 0,
): JSONReportTestResult {
  return {
    workerIndex: 0,
    parallelIndex: 0,
    status,
    duration,
    error,
    errors: error ? [error] : [],
    stdout: [],
    stderr: [],
    annotations: [],
    retry,
    startTime: "2026-01-01T00:00:00Z",
    attachments: [],
  };
}

/** A minimal passed-test entry for the given project. */
function passed(projectName: string, duration = 100): JSONReportTest {
  return {
    timeout: 30_000,
    annotations: [],
    expectedStatus: "passed",
    projectName,
    projectId: projectName,
    results: [attempt("passed", duration)],
    status: "expected",
  };
}

function spec(
  title: string,
  tests: JSONReportTest[],
  file = "a.spec.ts",
): Report["suites"][number]["specs"][number] {
  return {
    tags: [],
    title,
    ok: tests.every((t) => t.status === "expected"),
    tests,
    id: title,
    file,
    line: 1,
    column: 1,
  };
}

function suite(
  title: string,
  specs: Report["suites"][number]["specs"],
  suites: Report["suites"][number]["suites"] = [],
  file = "a.spec.ts",
): Report["suites"][number] {
  return { title, file, column: 1, line: 1, specs, suites };
}

function stats(
  duration: number,
  counts: { expected: number; unexpected: number; flaky: number; skipped: number },
): Report["stats"] {
  return { startTime: "2026-01-01T00:00:00Z", duration, ...counts };
}

/** The report envelope. The summarizer never reads config; the full-config
 * shape is playwright's concern — one honest cast keeps the rest of the
 * fixture honestly typed. */
function report(
  suites: Report["suites"],
  s: Report["stats"],
  errors: Report["errors"] = [],
): Report {
  return { config: {} as Report["config"], suites, errors, stats: s };
}

describe("summarizeReport — per-engine outcomes", () => {
  it("rolls outcomes up per engine so one engine's passes cannot conceal another's failures", () => {
    const failing = passed("webkit", 2_500);
    failing.status = "unexpected";
    failing.results = [attempt("failed", 2_500, { message: "Expected text but found nothing" })];
    const summary = summarizeReport(
      report(
        [
          suite("one", [spec("passes on chromium", [passed("chromium")])]),
          suite("two", [spec("fails on webkit", [failing])]),
        ],
        stats(60_000, { expected: 1, unexpected: 1, flaky: 0, skipped: 0 }),
      ),
    );
    const chromium = summary.engines.find((e) => e.project === "chromium");
    const webkit = summary.engines.find((e) => e.project === "webkit");
    expect(chromium).toMatchObject({ expected: 1, unexpected: 0 });
    expect(webkit).toMatchObject({ expected: 0, unexpected: 1, flaky: 0 });
    // The failure itself is surfaced with its engine and an actionable message.
    expect(summary.failures).toHaveLength(1);
    expect(summary.failures[0]).toMatchObject({
      project: "webkit",
      status: "unexpected",
    });
    expect(summary.failures[0]!.message).toContain("Expected text but found nothing");
  });

  it("counts interrupted attempts per engine where identifiable", () => {
    const interrupted = passed("firefox");
    interrupted.status = "unexpected";
    interrupted.results = [attempt("interrupted", 900)];
    const summary = summarizeReport(
      report(
        [suite("one", [spec("interrupted mid-run", [interrupted])])],
        stats(10_000, { expected: 0, unexpected: 1, flaky: 0, skipped: 0 }),
      ),
    );
    expect(summary.engines.find((e) => e.project === "firefox")).toMatchObject({
      unexpected: 1,
      interrupted: 1,
    });
    expect(summary.failures[0]!.message).toContain("interrupted");
  });
});

describe("summarizeReport — traversal", () => {
  it("visits every root suite and nested suite (multi-root reports)", () => {
    const summary = summarizeReport(
      report(
        [
          suite("root A", [spec("A1", [passed("chromium")], "a.spec.ts")]),
          suite(
            "root B",
            [spec("B outer", [passed("chromium", 200)], "b.spec.ts")],
            [
              suite(
                "nested B",
                [spec("B nested", [passed("webkit", 300)], "c.spec.ts")],
                [],
                "c.spec.ts",
              ),
            ],
            "b.spec.ts",
          ),
        ],
        stats(5_000, { expected: 3, unexpected: 0, flaky: 0, skipped: 0 }),
      ),
    );
    expect(summary.files).toHaveLength(3);
    expect(summary.engines.find((e) => e.project === "chromium")!.expected).toBe(2);
    expect(summary.engines.find((e) => e.project === "webkit")!.expected).toBe(1);
  });

  it("survives partial results: a test with no results array entries is counted, not dropped", () => {
    const neverRan = passed("chromium");
    neverRan.status = "skipped";
    neverRan.results = [];
    const summary = summarizeReport(
      report(
        [suite("one", [spec("never ran", [neverRan])])],
        stats(1_000, { expected: 0, unexpected: 0, flaky: 0, skipped: 1 }),
      ),
    );
    expect(summary.engines.find((e) => e.project === "chromium")).toMatchObject({ skipped: 1 });
    expect(summary.files).toHaveLength(1);
  });
});

describe("summarizeReport — launch failures", () => {
  it("identifies launch failures from root errors where identifiable", () => {
    const summary = summarizeReport(
      report([], stats(0, { expected: 0, unexpected: 0, flaky: 0, skipped: 0 }), [
        {
          message: "Error: browserType.launch: Executable doesn't exist at /usr/bin/webkit",
        },
      ]),
    );
    expect(summary.launchErrors).toHaveLength(1);
    expect(summary.launchErrors[0]!.launch).toBe(true);
    expect(summary.launchErrors[0]!.message).toContain("Executable doesn't exist");
  });

  it("does not classify an ordinary assertion error as a launch failure", () => {
    const summary = summarizeReport(
      report([], stats(0, { expected: 0, unexpected: 0, flaky: 0, skipped: 0 }), [
        { message: "Error: expect(received).toBe(expected)" },
      ]),
    );
    expect(summary.launchErrors[0]!.launch).toBe(false);
  });
});

describe("summarizeReport — timing summaries preserved", () => {
  it("keeps the first/retry worker-time split distinct from wall time", () => {
    const flaky: JSONReportTest = {
      timeout: 30_000,
      annotations: [],
      expectedStatus: "passed",
      projectName: "chromium",
      projectId: "chromium",
      results: [
        attempt("timedOut", 30_000, { message: "Timeout 30000ms exceeded" }),
        attempt("passed", 4_000, undefined, 1),
      ],
      status: "flaky",
    };
    const summary = summarizeReport(
      report(
        [suite("one", [spec("flaky once", [flaky])])],
        stats(45_000, { expected: 0, unexpected: 0, flaky: 1, skipped: 0 }),
      ),
    );
    // Wall time is the report's own duration field — worker time is the sum
    // of attempt durations. 34s of worker time must never read as 45s wall.
    expect(summary.stats!.duration).toBe(45_000);
    const row = summary.engines.find((e) => e.project === "chromium")!;
    expect(row.firstMs).toBe(30_000);
    expect(row.retryMs).toBe(4_000);
    expect(row.flaky).toBe(1);
    expect(summary.failures).toEqual([
      expect.objectContaining({
        project: "chromium",
        status: "flaky",
        durationMs: 30_000,
        message: "Timeout 30000ms exceeded",
      }),
    ]);
  });
});
