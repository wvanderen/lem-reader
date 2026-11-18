// tests/unit/ops/compare-nightly-shadow.test.ts
// Issue #282 — the nightly-chain producer comparison contract: for one
// nightly-ref SHA, compare the Mac evidence chain's conclusions
// (evidence.yml: the exhaustive-reference job + the hosted e2e matrix)
// with the Lemcentre nightly-linux-shadow lane's per-engine and
// per-measurement verdicts (check-run conclusion + the evidence members
// the lane uploads: per-engine exhaustive reports and the machine-readable
// phase verdicts).
//
// Verdict vocabulary (frozen by docs/specs/lemcentre-nightly-linux.md,
// mirroring the #281 shadow vocabulary):
//   match            exit 0 — both nightly chains spoke, conclusions agree,
//                     and every comparable per-engine / per-measurement
//                     verdict agrees
//   diverge          exit 1 — conclusions disagree, or a comparable engine
//                     or measurement verdict differs
//   missing-producer exit 2 — a producer's check run is absent for the SHA
//                     or has no comparable verdict; comparison unavailable
//
// Contention-invalidated measurement phases (the lane-annotated
// phases-contention.json member carries the contentionInvalid flags)
// are infrastructure failures, not product divergence: they are reported
// as not-comparable notes and the verdict rests on the comparable surface,
// exactly like unreachable report artifacts.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { CheckRun } from "../../../ops/lemcentre-runner/compare-shadow.mjs";
import { summarizeReport } from "../../../scripts/summarize-e2e.mjs";
import {
  LINUX_NIGHTLY_PRODUCER,
  MAC_NIGHTLY_PRODUCERS,
  compareNightly,
  parsePhaseVerdicts,
  pickNightlyProducers,
  readShadowEvidence,
  renderNightlyComparison,
} from "../../../ops/lemcentre-runner/compare-nightly-shadow.mjs";

const python = "python3";

// ---------------------------------------------------------------- helpers --

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

function phasesFixture(phases: Array<Record<string, unknown>>) {
  return { schemaVersion: 1, phases };
}

const GREEN_PHASES = phasesFixture([
  { phase: "functional", exit: 0, engines: { chromium: 0, firefox: 0, webkit: 0 } },
  { phase: "calibration", exit: 0 },
  { phase: "performance", exit: 0 },
]);

function checkRunsFixture(...runs: CheckRun[]) {
  return { total_count: runs.length, check_runs: runs };
}

function exhaustiveCheckRun(overrides: Partial<CheckRun> = {}): CheckRun {
  return {
    name: "exhaustive-reference",
    status: "completed",
    conclusion: "success",
    started_at: "2026-11-20T08:05:00Z",
    html_url: "https://github.com/wvanderen/lem-reader/actions/runs/1",
    details_url: "https://github.com/wvanderen/lem-reader/./actions/runs/55000000001/job/1",
    ...overrides,
  };
}

function matrixCheckRun(engine: string, overrides: Partial<CheckRun> = {}): CheckRun {
  return {
    name: `e2e (${engine})`,
    status: "completed",
    conclusion: "success",
    started_at: "2026-11-20T08:05:00Z",
    html_url: "https://github.com/wvanderen/lem-reader/actions/runs/1",
    details_url: "https://github.com/wvanderen/lem-reader/./actions/runs/55000000001/job/2",
    ...overrides,
  };
}

function linuxCheckRun(overrides: Partial<CheckRun> = {}): CheckRun {
  return {
    name: "nightly-linux-shadow",
    status: "completed",
    conclusion: "success",
    started_at: "2026-11-20T10:05:00Z",
    html_url: "https://github.com/wvanderen/lem-reader/actions/runs/3",
    details_url: "https://github.com/wvanderen/lem-reader/./actions/runs/55000000003/job/3",
    ...overrides,
  };
}

/** Build a zip with python's zipfile (independent of the fflate reader). */
function zipFixture(members: Record<string, string>): Buffer {
  const dir = mkdtempSync(join(tmpdir(), "lem-nightly-zip-"));
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

function linuxEvidenceZip(phases: string = JSON.stringify(GREEN_PHASES)) {
  return zipFixture({
    "reports/e2e-exhaustive-chromium.json": JSON.stringify(
      reportFixture({ chromium: { expected: 3 } }),
    ),
    "reports/e2e-exhaustive-firefox.json": JSON.stringify(
      reportFixture({ firefox: { expected: 3 } }),
    ),
    "reports/e2e-exhaustive-webkit.json": JSON.stringify(
      reportFixture({ webkit: { expected: 3 } }),
    ),
    // the lane uploads BOTH: the guest's byte-faithful verdicts and the
    // lane-annotated copy the comparison consumes
    "verdicts/phases.json": phases,
    "verdicts/phases-contention.json": phases,
    "comparisons/fingerprint-compare.txt": "[calibration] D3-10 gate PASSED\n",
    "comparisons/budget-compare.txt": "[perf] D6-04 gate PASSED\n",
  });
}

const greenInput = {
  macExhaustive: exhaustiveCheckRun(),
  macMatrix: {
    chromium: matrixCheckRun("chromium"),
    firefox: matrixCheckRun("firefox"),
    webkit: matrixCheckRun("webkit"),
  },
  linux: linuxCheckRun(),
};

// ------------------------------------------------------------- pickers -----

describe("pickNightlyProducers", () => {
  test("picks the Mac exhaustive job, the hosted matrix per engine, and the Linux lane", () => {
    const picked = pickNightlyProducers(
      checkRunsFixture(
        exhaustiveCheckRun(),
        matrixCheckRun("chromium"),
        matrixCheckRun("firefox"),
        matrixCheckRun("webkit"),
        linuxCheckRun(),
      ),
    );
    expect(picked.mac.exhaustive?.name).toBe("exhaustive-reference");
    expect(picked.mac.matrix.firefox?.name).toBe("e2e (firefox)");
    expect(picked.linux?.name).toBe("nightly-linux-shadow");
  });

  test("missing producers come back null, never guessed", () => {
    const picked = pickNightlyProducers(checkRunsFixture(exhaustiveCheckRun()));
    expect(picked.linux).toBeNull();
    expect(picked.mac.matrix.chromium).toBeNull();
  });
});

// -------------------------------------------------------- evidence reader --

describe("readShadowEvidence", () => {
  test("reads the per-engine reports and the phase verdicts from the lane's artifact", () => {
    const evidence = readShadowEvidence(linuxEvidenceZip());
    expect(Object.keys(evidence.reports).sort()).toEqual(["chromium", "firefox", "webkit"]);
    for (const report of Object.values(evidence.reports)) {
      expect(summarizeReport(report).engines).toHaveLength(1);
    }
    expect(evidence.phases?.phases).toHaveLength(3);
    expect(evidence.phases?.phases[1]).toMatchObject({ phase: "calibration", exit: 0 });
  });

  test("a missing member is a named error, never a crash or a guess", () => {
    const evidence = readShadowEvidence(
      zipFixture({ "verdicts/phases-contention.json": "{}" }),
    );
    expect(evidence.reports.chromium).toBeUndefined();
    expect(evidence.reportErrors.chromium).toMatch(/no report member/);
    expect(evidence.phasesError).toMatch(/shape/);
  });
});

describe("parsePhaseVerdicts", () => {
  test("refuses a phases payload without the phases list", () => {
    expect(() => parsePhaseVerdicts({ schemaVersion: 1 })).toThrow(/shape/i);
    expect(() => parsePhaseVerdicts("nope" as unknown)).toThrow(/shape/i);
  });
});

// ------------------------------------------------------------ comparison ---

describe("compareNightly", () => {
  test("match: green chains with agreeing per-engine and per-measurement verdicts", () => {
    const comparison = compareNightly({
      ...greenInput,
      linuxEvidence: readShadowEvidence(linuxEvidenceZip()),
    });
    expect(comparison.verdict).toBe("match");
    expect(comparison.exitCode).toBe(0);
    expect(comparison.engines).toHaveLength(3);
    expect(comparison.measurements).toHaveLength(2);
  });

  test("missing-producer when the Mac exhaustive job is absent for the SHA", () => {
    const comparison = compareNightly({
      ...greenInput,
      macExhaustive: null,
      linuxEvidence: readShadowEvidence(linuxEvidenceZip()),
    });
    expect(comparison.verdict).toBe("missing-producer");
    expect(comparison.exitCode).toBe(2);
  });

  test("missing-producer when the Linux lane has not run on the SHA", () => {
    const comparison = compareNightly({ ...greenInput, linux: null });
    expect(comparison.verdict).toBe("missing-producer");
    expect(comparison.reasons.join(" ")).toMatch(/nightly-linux-shadow/);
  });

  test("missing-producer when a check run has not concluded (pending/cancelled)", () => {
    const comparison = compareNightly({
      ...greenInput,
      linux: linuxCheckRun({ status: "in_progress", conclusion: null }),
    });
    expect(comparison.verdict).toBe("missing-producer");
  });

  test("diverge when the chain conclusions disagree", () => {
    const comparison = compareNightly({
      ...greenInput,
      macExhaustive: exhaustiveCheckRun({ conclusion: "failure" }),
      linuxEvidence: readShadowEvidence(linuxEvidenceZip()),
    });
    expect(comparison.verdict).toBe("diverge");
    expect(comparison.exitCode).toBe(1);
    expect(comparison.reasons.join(" ")).toMatch(/conclusions disagree/);
  });

  test("diverge when a Linux engine report shows failures the Mac report does not", () => {
    const linuxZip = linuxEvidenceZip();
    const evidence = readShadowEvidence(linuxZip);
    evidence.reports.webkit = reportFixture({ webkit: { expected: 2, unexpected: 1 } });
    const macReport = reportFixture({
      chromium: { expected: 3 },
      firefox: { expected: 3 },
      webkit: { expected: 3 },
    });
    const comparison = compareNightly({
      ...greenInput,
      macReport,
      linuxEvidence: evidence,
    });
    expect(comparison.verdict).toBe("diverge");
    const webkitRow = comparison.engines.find((row) => row.project === "webkit");
    expect(webkitRow?.agree).toBe(false);
    expect(comparison.reasons.join(" ")).toMatch(/webkit/);
  });

  test("diverge when a measurement phase regressed on Linux while the Mac chain is green", () => {
    const phases = phasesFixture([
      { phase: "functional", exit: 0, engines: { chromium: 0, firefox: 0, webkit: 0 } },
      { phase: "calibration", exit: 0 },
      { phase: "performance", exit: 8 },
    ]);
    const comparison = compareNightly({
      ...greenInput,
      linuxEvidence: readShadowEvidence(linuxEvidenceZip(JSON.stringify(phases))),
    });
    expect(comparison.verdict).toBe("diverge");
    const perf = comparison.measurements.find((m) => m.phase === "performance");
    expect(perf?.agree).toBe(false);
    expect(comparison.reasons.join(" ")).toMatch(/performance/);
  });

  test("a contention-invalidated measurement phase is a not-comparable note, not divergence", () => {
    const phases = phasesFixture([
      { phase: "functional", exit: 0, engines: { chromium: 0, firefox: 0, webkit: 0 } },
      { phase: "calibration", exit: 0 },
      { phase: "performance", exit: 8, contentionInvalid: true },
    ]);
    const comparison = compareNightly({
      ...greenInput,
      linuxEvidence: readShadowEvidence(linuxEvidenceZip(JSON.stringify(phases))),
    });
    expect(comparison.verdict).toBe("match");
    expect(comparison.reasons.join(" ")).toMatch(/contention/i);
    expect(comparison.reasons.join(" ")).toMatch(/not comparable|not-comparable|infrastructure/i);
  });

  test("unreachable Linux evidence rests the verdict on the check conclusions", () => {
    const comparison = compareNightly({ ...greenInput });
    expect(comparison.verdict).toBe("match");
    expect(comparison.reasons.join(" ")).toMatch(/rests on the check conclusions/);
  });

  test("a flaky-count difference is a note, never divergence", () => {
    const evidence = readShadowEvidence(linuxEvidenceZip());
    const withFlaky = reportFixture({ chromium: { expected: 2, unexpected: 1 } });
    // chromium report with 1 unexpected + a flaky retry outcome (passed on retry)
    withFlaky.suites[0]!.specs[2]!.tests[0]!.status = "flaky";
    withFlaky.suites[0]!.specs[2]!.tests[0]!.results.push({
      status: "passed",
      duration: 5,
      errors: [],
    });
    evidence.reports.chromium = withFlaky;
    const macReport = reportFixture({
      chromium: { expected: 3 },
      firefox: { expected: 3 },
      webkit: { expected: 3 },
    });
    const comparison = compareNightly({ ...greenInput, macReport, linuxEvidence: evidence });
    expect(comparison.verdict).toBe("match");
    expect(comparison.reasons.join(" ")).toMatch(/flaky/);
  });
});

// -------------------------------------------------------------- rendering --

describe("renderNightlyComparison", () => {
  test("renders producer lines, engine and measurement tables, and the verdict", () => {
    const comparison = compareNightly({
      ...greenInput,
      linuxEvidence: readShadowEvidence(linuxEvidenceZip()),
    });
    const text = renderNightlyComparison({ sha: "abc123", ...comparison });
    expect(text).toContain("nightly comparison for abc123");
    expect(text).toContain("exhaustive-reference");
    expect(text).toContain("e2e (chromium)");
    expect(text).toContain("nightly-linux-shadow");
    expect(text).toMatch(/\| engine \|/);
    expect(text).toMatch(/\| measurement \|/);
    expect(text).toContain("verdict: match (exit 0)");
    expect(text).toContain("never gates a merge");
  });
});

// --------------------------------------------------------- producer names --

describe("producer definitions", () => {
  test("name the exact check runs and artifacts both chains upload", () => {
    expect(MAC_NIGHTLY_PRODUCERS.exhaustive.check).toBe("exhaustive-reference");
    expect(MAC_NIGHTLY_PRODUCERS.exhaustive.artifact).toBe("exhaustive-artifacts-reference");
    expect(MAC_NIGHTLY_PRODUCERS.exhaustive.member).toBe(".test-reports/functional.json");
    expect(MAC_NIGHTLY_PRODUCERS.matrixPrefix).toBe("e2e (");
    expect(LINUX_NIGHTLY_PRODUCER.check).toBe("nightly-linux-shadow");
    expect(LINUX_NIGHTLY_PRODUCER.artifact).toBe("nightly-linux-shadow-reports");
    expect(LINUX_NIGHTLY_PRODUCER.engineMember("webkit")).toBe(
      "reports/e2e-exhaustive-webkit.json",
    );
    // the comparison consumes the lane-ANNOTATED member; the guest's own
    // verdicts/phases.json stays byte-faithful beside it (uploaded too)
    expect(LINUX_NIGHTLY_PRODUCER.phasesMember).toBe("verdicts/phases-contention.json");
  });
});
