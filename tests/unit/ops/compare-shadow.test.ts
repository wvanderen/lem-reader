// tests/unit/ops/compare-shadow.test.ts
// Issue #281 — the same-revision producer comparison contract for the
// Lemcentre Linux shadow lane: for one candidate SHA, compare the Mac's
// authoritative e2e-reference producer with the e2e-linux-shadow producer
// (check-run conclusions from gh api; per-engine outcomes from the JSON
// reports each lane uploads, wherever those artifacts remain reachable).
//
// The verdict vocabulary is frozen by docs/specs/lemcentre-linux-shadow.md:
//   match           exit 0 — both producers reached the same suite verdict
//                    and, where both reports are reachable, the same
//                    per-engine unexpected outcome sets
//   diverge         exit 1 — conclusions disagree, or the reachable
//                    per-engine outcomes disagree (engine failing on one
//                    side only, or an engine absent from one report)
//   missing-producer exit 2 — a producer's check run is absent for the SHA,
//                    or exists but has not concluded a comparable suite
//                    verdict (pending/cancelled) — comparison unavailable,
//                    never guessed
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { CheckRun } from "../../../ops/lemcentre-runner/compare-shadow.mjs";
import {
  MAC_PRODUCER,
  SHADOW_PRODUCER,
  compareProducers,
  engineRows,
  parseRunId,
  pickCheckRun,
  readArtifactReport,
  renderComparison,
} from "../../../ops/lemcentre-runner/compare-shadow.mjs";
import { summarizeReport } from "../../../scripts/summarize-e2e.mjs";

const python = "python3";

/** A minimal Playwright JSON-report shape for one engine's outcome set. */
function reportFixture(engines: Record<string, { expected: number; unexpected?: number }>) {
  const suites = Object.entries(engines).map(([project, counts], i) => ({
    title: `file-${i}`,
    specs: Array.from({ length: counts.expected + (counts.unexpected ?? 0) }, (_, s) => ({
      title: `spec-${s}`,
      file: `tests/e2e/area-${i}/case-${s}.spec.ts`,
      line: s * 2 + 1,
      column: 1,
      tests: [
        {
          projectName: project,
          status: s < counts.expected ? "expected" : "unexpected",
          results: [
            {
              status: s < counts.expected ? "passed" : "failed",
              duration: 10,
              errors: s < counts.expected ? [] : [{ message: `boom ${project}` }],
            },
          ],
        },
      ],
    })),
  }));
  return { config: {}, suites, errors: [] };
}

function checkRunsFixture(...runs: CheckRun[]) {
  return { total_count: runs.length, check_runs: runs };
}

function macCheckRun(overrides: Partial<CheckRun> = {}): CheckRun {
  return {
    name: "e2e-reference",
    status: "completed",
    conclusion: "success",
    started_at: "2026-11-18T01:00:00Z",
    html_url: "https://github.com/wvanderen/lem-reader/actions/runs/1",
    details_url: "https://github.com/wvanderen/lem-reader/./actions/runs/44000227126/job/1",
    ...overrides,
  };
}

function shadowCheckRun(overrides: Partial<CheckRun> = {}): CheckRun {
  return {
    name: "e2e-linux-shadow",
    status: "completed",
    conclusion: "success",
    started_at: "2026-11-18T01:10:00Z",
    html_url: "https://github.com/wvanderen/lem-reader/actions/runs/2",
    details_url: "https://github.com/wvanderen/lem-reader/./actions/runs/44000227999/job/2",
    ...overrides,
  };
}

/** Build a zip with python's zipfile (an implementation independent of the
 * fflate reader under test) and return its bytes. */
function zipFixture(members: Record<string, string>): Buffer {
  const dir = mkdtempSync(join(tmpdir(), "lem-compare-zip-"));
  const path = join(dir, "artifact.zip");
  const build = spawnSync(
    python,
    [
      "-B",
      "-c",
      `import zipfile\nwith zipfile.ZipFile(${JSON.stringify(path)}, "w") as z:\n${Object.keys(
        members,
      )
        .map((name) => `    z.writestr(${JSON.stringify(name)}, ${JSON.stringify(members[name])})`)
        .join("\n")}`,
    ],
    { encoding: "utf8" },
  );
  expect(build.status, build.stderr).toBe(0);
  const bytes = readFileSync(path);
  rmSync(dir, { recursive: true, force: true });
  return bytes;
}

describe("pickCheckRun", () => {
  test("picks the LATEST started run for a check name (reattempts supersede)", () => {
    const earlier = macCheckRun({ started_at: "2026-11-18T00:00:00Z", conclusion: "failure" });
    const latest = macCheckRun({ started_at: "2026-11-18T02:00:00Z" });
    const picked = pickCheckRun(checkRunsFixture(earlier, latest), "e2e-reference");
    expect(picked?.started_at).toBe("2026-11-18T02:00:00Z");
  });

  test("ignores other check names and returns null when absent", () => {
    expect(pickCheckRun(checkRunsFixture(macCheckRun()), "e2e-linux-shadow")).toBeNull();
    expect(pickCheckRun(checkRunsFixture(shadowCheckRun()), "e2e-reference")).toBeNull();
  });
});

describe("parseRunId", () => {
  test("extracts the workflow run id from a check run details_url", () => {
    expect(parseRunId(macCheckRun().details_url)).toBe(44000227126);
    expect(parseRunId("https://github.com/a/b/./actions/runs/99/job/5")).toBe(99);
  });

  test("returns null for shapes it cannot parse (never guesses)", () => {
    expect(parseRunId("https://example.com/elsewhere")).toBeNull();
    expect(parseRunId(undefined)).toBeNull();
  });
});

describe("readArtifactReport", () => {
  test("reads the configured member from an artifact zip", () => {
    const report = reportFixture({ chromium: { expected: 3 } });
    const zip = zipFixture({ ".test-reports/functional.json": JSON.stringify(report) });
    const parsed = readArtifactReport(zip, MAC_PRODUCER);
    expect(summarizeReport(parsed).engines).toHaveLength(1);
  });

  test("reads the shadow lane's report member", () => {
    const report = reportFixture({ chromium: { expected: 2 }, webkit: { expected: 1 } });
    const zip = zipFixture({ ".guest-reports/e2e-pr.json": JSON.stringify(report) });
    const parsed = readArtifactReport(zip, SHADOW_PRODUCER);
    expect(summarizeReport(parsed).engines.map((e) => e.project)).toEqual(["chromium", "webkit"]);
  });

  test("falls back to a unique basename match when the exact member differs", () => {
    const report = reportFixture({ chromium: { expected: 1 } });
    const zip = zipFixture({ "root/functional.json": JSON.stringify(report) });
    expect(readArtifactReport(zip, MAC_PRODUCER)).toBeTruthy();
  });

  test("refuses an ambiguous basename fallback", () => {
    const zip = zipFixture({
      "a/functional.json": JSON.stringify(reportFixture({ chromium: { expected: 1 } })),
      "b/functional.json": JSON.stringify(reportFixture({ chromium: { expected: 2 } })),
    });
    expect(() => readArtifactReport(zip, MAC_PRODUCER)).toThrow(/ambiguous/i);
  });

  test("refuses a zip without the report member, naming the producer", () => {
    const zip = zipFixture({ "other.txt": "hello" });
    expect(() => readArtifactReport(zip, SHADOW_PRODUCER)).toThrow(
      /e2e-linux-shadow.*e2e-pr\.json|no report member/i,
    );
  });
});

describe("engineRows", () => {
  const macSummary = () =>
    summarizeReport(
      reportFixture({
        chromium: { expected: 10 },
        firefox: { expected: 8 },
        webkit: { expected: 8 },
      }),
    );
  const shadowSummary = () =>
    summarizeReport(
      reportFixture({
        chromium: { expected: 10 },
        firefox: { expected: 8 },
        webkit: { expected: 7, unexpected: 1 },
      }),
    );

  test("aligns per-engine outcome columns across producers", () => {
    const rows = engineRows(macSummary(), shadowSummary());
    expect(rows.map((r) => r.project)).toEqual(["chromium", "firefox", "webkit"]);
    const webkit = rows.find((r) => r.project === "webkit")!;
    expect(webkit.mac?.unexpected).toBe(0);
    expect(webkit.shadow?.unexpected).toBe(1);
    expect(webkit.agree).toBe(false);
  });

  test("marks an engine absent from one report as disagreeing coverage", () => {
    const partial = summarizeReport(reportFixture({ chromium: { expected: 10 } }));
    const rows = engineRows(macSummary(), partial);
    expect(rows.find((r) => r.project === "firefox")!.agree).toBe(false);
  });
});

describe("compareProducers", () => {
  test("missing producer → missing-producer verdict naming the side", () => {
    const comparison = compareProducers({
      mac: pickCheckRun(checkRunsFixture(macCheckRun()), "e2e-reference"),
      shadow: pickCheckRun(checkRunsFixture(macCheckRun()), "e2e-linux-shadow"),
    });
    expect(comparison.verdict).toBe("missing-producer");
    expect(comparison.reasons.join(" ")).toMatch(/e2e-linux-shadow/);
    expect(comparison.exitCode).toBe(2);
  });

  test("pending or cancelled producers are not comparable — never guessed", () => {
    for (const conclusion of [null, "cancelled"]) {
      const comparison = compareProducers({
        mac: pickCheckRun(
          checkRunsFixture(
            macCheckRun({ conclusion, status: conclusion ? "completed" : "in_progress" }),
          ),
          "e2e-reference",
        ),
        shadow: pickCheckRun(checkRunsFixture(shadowCheckRun()), "e2e-linux-shadow"),
      });
      expect(comparison.verdict).toBe("missing-producer");
      expect(comparison.reasons.join(" ")).toMatch(/no comparable suite verdict/i);
      expect(comparison.exitCode).toBe(2);
    }
  });

  test("both success, reports unreachable → match with an honest note", () => {
    const comparison = compareProducers({
      mac: pickCheckRun(checkRunsFixture(macCheckRun()), "e2e-reference"),
      shadow: pickCheckRun(checkRunsFixture(shadowCheckRun()), "e2e-linux-shadow"),
      macReportError: "artifact expired",
      shadowReportError: "artifact expired",
    });
    expect(comparison.verdict).toBe("match");
    expect(comparison.reasons.join(" ")).toMatch(/unreachable|expired/i);
    expect(comparison.engines).toEqual([]);
    expect(comparison.exitCode).toBe(0);
  });

  test("both success, identical per-engine outcomes → match", () => {
    const report = reportFixture({
      chromium: { expected: 10 },
      firefox: { expected: 8 },
      webkit: { expected: 8 },
    });
    const comparison = compareProducers({
      mac: pickCheckRun(checkRunsFixture(macCheckRun()), "e2e-reference"),
      shadow: pickCheckRun(checkRunsFixture(shadowCheckRun()), "e2e-linux-shadow"),
      macReport: report,
      shadowReport: report,
    });
    expect(comparison.verdict).toBe("match");
    expect(comparison.engines.every((row) => row.agree)).toBe(true);
    expect(comparison.exitCode).toBe(0);
  });

  test("one engine failing on one side only → diverge (exit 1)", () => {
    const comparison = compareProducers({
      mac: pickCheckRun(checkRunsFixture(macCheckRun()), "e2e-reference"),
      shadow: pickCheckRun(
        checkRunsFixture(shadowCheckRun({ conclusion: "failure" })),
        "e2e-linux-shadow",
      ),
      macReport: reportFixture({ chromium: { expected: 10 }, webkit: { expected: 8 } }),
      shadowReport: reportFixture({
        chromium: { expected: 10 },
        webkit: { expected: 7, unexpected: 1 },
      }),
    });
    expect(comparison.verdict).toBe("diverge");
    expect(comparison.reasons.join(" ")).toMatch(/webkit/);
    expect(comparison.exitCode).toBe(1);
  });

  test("conclusions disagree → diverge even without reachable reports", () => {
    const comparison = compareProducers({
      mac: pickCheckRun(checkRunsFixture(macCheckRun()), "e2e-reference"),
      shadow: pickCheckRun(
        checkRunsFixture(shadowCheckRun({ conclusion: "failure" })),
        "e2e-linux-shadow",
      ),
    });
    expect(comparison.verdict).toBe("diverge");
    expect(comparison.reasons.join(" ")).toMatch(/success.*failure|failure.*success/i);
    expect(comparison.exitCode).toBe(1);
  });

  test("both failing, different engines → diverge", () => {
    const comparison = compareProducers({
      mac: pickCheckRun(checkRunsFixture(macCheckRun({ conclusion: "failure" })), "e2e-reference"),
      shadow: pickCheckRun(
        checkRunsFixture(shadowCheckRun({ conclusion: "failure" })),
        "e2e-linux-shadow",
      ),
      macReport: reportFixture({
        chromium: { expected: 9, unexpected: 1 },
        firefox: { expected: 8 },
      }),
      shadowReport: reportFixture({
        chromium: { expected: 10 },
        firefox: { expected: 7, unexpected: 1 },
      }),
    });
    expect(comparison.verdict).toBe("diverge");
    expect(comparison.exitCode).toBe(1);
  });

  test("flaky differences are notes, not divergence (retry evidence, not verdicts)", () => {
    const mac = reportFixture({ chromium: { expected: 10 } });
    const flakyShadow = {
      ...reportFixture({ chromium: { expected: 10 } }),
      suites: [
        {
          title: "file",
          specs: [
            {
              title: "spec",
              file: "tests/e2e/area/case.spec.ts",
              line: 1,
              column: 1,
              tests: [
                {
                  projectName: "chromium",
                  status: "flaky",
                  results: [
                    { status: "failed", duration: 5, errors: [{ message: "x" }] },
                    { status: "passed", duration: 5, errors: [] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const comparison = compareProducers({
      mac: pickCheckRun(checkRunsFixture(macCheckRun()), "e2e-reference"),
      shadow: pickCheckRun(checkRunsFixture(shadowCheckRun()), "e2e-linux-shadow"),
      macReport: mac,
      shadowReport: flakyShadow,
    });
    expect(comparison.verdict).toBe("match");
    expect(comparison.reasons.join(" ")).toMatch(/flaky/);
  });
});

describe("renderComparison", () => {
  test("renders a per-engine table with verdict and producers", () => {
    const comparison = compareProducers({
      mac: pickCheckRun(checkRunsFixture(macCheckRun()), "e2e-reference"),
      shadow: pickCheckRun(
        checkRunsFixture(shadowCheckRun({ conclusion: "failure" })),
        "e2e-linux-shadow",
      ),
      macReport: reportFixture({ chromium: { expected: 10 }, webkit: { expected: 8 } }),
      shadowReport: reportFixture({
        chromium: { expected: 10 },
        webkit: { expected: 7, unexpected: 1 },
      }),
    });
    const text = renderComparison({ sha: "abc123", ...comparison });
    expect(text).toMatch(/e2e-reference.*success.*e2e-linux-shadow.*failure/s);
    expect(text).toMatch(/webkit.*0.*1/s);
    expect(text).toMatch(/diverge/i);
    expect(text).toContain("abc123");
  });
});

describe("fixture sanity (report shape)", () => {
  test("the reportFixture produces the summarize-e2e engine shape", () => {
    const summary = summarizeReport(reportFixture({ chromium: { expected: 2, unexpected: 1 } }));
    expect(summary.engines[0]).toMatchObject({ project: "chromium", expected: 2, unexpected: 1 });
  });
});
