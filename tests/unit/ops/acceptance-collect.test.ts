// tests/unit/ops/acceptance-collect.test.ts
// Issue #284 — the acceptance-evidence collector contract: a read-only
// gh api collector for a FIXED candidate SHA that emits the presentation
// record from a template with explicit UNCOLLECTED placeholders and never
// fabricates values (docs/specs/lemcentre-acceptance.md is the contract;
// the run/judging protocol is ops/lemcentre-runner/acceptance-checklist.md).
//
// The pure seams under test:
//   - buildSuiteTimeline / adjudicateThreeConsecutive: what "three
//     consecutive successful full PR-suite runs" means operationally
//   - validateNightlyRevision: the nightly ref "pointing at that SHA" rule
//   - readAcceptanceEvidence: the nightly evidence-bundle members
//   - adjudicateNightlyRun: acceptance-grade / not-acceptance-grade /
//     invalid (exit-7 shape) / uncollected
//   - missingItems + renderRecord: the presentation record and its
//     missing list (never fabricated)
//   - carryOverOwnerSections: owner-filled blocks survive collector re-runs
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { format as prettierFormat } from "prettier";
import { describe, expect, test } from "vitest";
import type { CheckRun } from "../../../ops/lemcentre-runner/compare-shadow.mjs";
import type { TimelineEntry } from "../../../ops/lemcentre-runner/acceptance-collect.mjs";
import { summarizeReport } from "../../../scripts/summarize-e2e.mjs";
import {
  PR_SUITE_CHECKS,
  carryOverOwnerSections,
  missingItems,
  renderRecord,
} from "../../../ops/lemcentre-runner/acceptance-record.mjs";
import {
  adjudicateNightlyRun,
  adjudicateThreeConsecutive,
  buildSuiteTimeline,
  emptyCollectState,
  readAcceptanceEvidence,
  validateNightlyRevision,
} from "../../../ops/lemcentre-runner/acceptance-collect.mjs";

const python = "python3";

// ---------------------------------------------------------------- helpers --

/** An attempts-API payload for one workflow run (run_attempt n...). */
function attemptsPayload(...attempts: Array<{ n: number; conclusion: string | null; at: string }>) {
  return {
    total_count: attempts.length,
    workflow_runs: attempts.map((attempt) => ({
      id: 9900,
      run_attempt: attempt.n,
      status: "completed",
      conclusion: attempt.conclusion,
      run_started_at: attempt.at,
      html_url: "https://github.com/wvanderen/lem-reader/actions/runs/9900",
    })),
  };
}

function checkRunFixture(name: string, overrides: Partial<CheckRun> = {}): CheckRun {
  return {
    name,
    status: "completed",
    conclusion: "success",
    started_at: "2026-11-20T08:05:00Z",
    html_url: "https://github.com/wvanderen/lem-reader/actions/runs/1",
    details_url: "https://github.com/wvanderen/lem-reader/./actions/runs/9900/job/1",
    ...overrides,
  };
}

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

const GREEN_PHASES = {
  schemaVersion: 1,
  phases: [
    { phase: "functional", exit: 0, engines: { chromium: 0, firefox: 0, webkit: 0 } },
    { phase: "calibration", exit: 0 },
    { phase: "performance", exit: 0 },
  ],
};

const QUIET_HOST_LOAD = {
  schemaVersion: 1,
  host: "lemcentre",
  phases: [
    {
      phase: "functional",
      at: "2026-11-20T08:05:00Z",
      loadavg: { "1m": 2.1, "5m": 1.9, "15m": 1.7 },
      lease: { owner: "browser-nightly/abc1234/functional" },
    },
    {
      phase: "calibration",
      at: "2026-11-20T09:40:00Z",
      loadavg: { "1m": 2.0, "5m": 2.2, "15m": 2.5 },
      lease: { owner: "browser-nightly/abc1234/calibration" },
    },
    {
      phase: "performance",
      at: "2026-11-20T09:55:00Z",
      loadavg: { "1m": 2.4, "5m": 2.1, "15m": 1.9 },
      lease: { owner: "browser-nightly/abc1234/performance" },
    },
  ],
};

const QUIET_CONTENTION = {
  schemaVersion: 1,
  threshold: { source: "ops/lemcentre-runner/contention-threshold.json", loadavg1mMax: 6 },
  measurementInvalid: false,
  phases: [],
};

/** Build a zip with python's zipfile (independent of the fflate reader). */
function zipFixture(members: Record<string, string>): Buffer {
  const dir = mkdtempSync(join(tmpdir(), "lem-acceptance-zip-"));
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

/** The full happy-path nightly evidence zip. */
function nightlyEvidenceZip(overrides: Record<string, string> = {}): Buffer {
  const members: Record<string, string> = {
    "reports/e2e-exhaustive-chromium.json": JSON.stringify(
      reportFixture({ chromium: { expected: 3 } }),
    ),
    "reports/e2e-exhaustive-firefox.json": JSON.stringify(
      reportFixture({ firefox: { expected: 3 } }),
    ),
    "reports/e2e-exhaustive-webkit.json": JSON.stringify(
      reportFixture({ webkit: { expected: 3 } }),
    ),
    "verdicts/phases.json": JSON.stringify(GREEN_PHASES),
    "verdicts/phases-contention.json": JSON.stringify(GREEN_PHASES),
    "identity/host-load.json": JSON.stringify(QUIET_HOST_LOAD),
    "verdicts/contention.json": JSON.stringify(QUIET_CONTENTION),
  };
  return zipFixture({ ...members, ...overrides });
}

// ------------------------------------------------------- three consecutive --

describe("buildSuiteTimeline", () => {
  test("expands each check run's re-run attempts into ordered timeline entries", () => {
    const run = checkRunFixture("e2e-linux-shadow", {
      started_at: "2026-11-20T10:05:00Z",
      details_url: "https://github.com/wvanderen/lem-reader/./actions/runs/9900/job/1",
    });
    const attempts = new Map([
      [
        9900,
        attemptsPayload(
          { n: 1, conclusion: "failure", at: "2026-11-20T09:00:00Z" },
          { n: 2, conclusion: "success", at: "2026-11-20T10:05:00Z" },
        ).workflow_runs,
      ],
    ]);
    const timeline = buildSuiteTimeline([run], attempts);
    expect(timeline).toHaveLength(2);
    expect(timeline[0]).toMatchObject({ runId: 9900, attempt: 1, conclusion: "failure" });
    expect(timeline[1]).toMatchObject({ runId: 9900, attempt: 2, conclusion: "success" });
  });

  test("orders entries by started time across runs, then run id, then attempt", () => {
    const runs = [
      checkRunFixture("e2e-reference", {
        details_url: "https://github.com/wvanderen/lem-reader/./actions/runs/22/job/1",
        started_at: "2026-11-20T11:00:00Z",
      }),
      checkRunFixture("e2e-reference", {
        details_url: "https://github.com/wvanderen/lem-reader/./actions/runs/11/job/1",
        started_at: "2026-11-20T08:00:00Z",
      }),
    ];
    const attempts = new Map([
      [
        11,
        attemptsPayload({ n: 1, conclusion: "success", at: "2026-11-20T08:00:00Z" }).workflow_runs,
      ],
      [
        22,
        attemptsPayload({ n: 1, conclusion: "success", at: "2026-11-20T11:00:00Z" }).workflow_runs,
      ],
    ]);
    const timeline = buildSuiteTimeline(runs, attempts);
    expect(timeline.map((entry) => entry.runId)).toEqual([11, 22]);
  });

  test("an unparseable details_url falls back to the check run's own conclusion, named honestly", () => {
    const run = checkRunFixture("e2e-linux-shadow", { details_url: "not-a-url" });
    const timeline = buildSuiteTimeline([run], new Map());
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({ runId: null, conclusion: "success" });
    expect(timeline[0]!.source).toBe("check-run");
  });
});

// ------------------------------------------------------ nightly revision --

describe("validateNightlyRevision", () => {
  const candidate = {
    sha: "c".repeat(40),
    commit: { tree: { sha: "tree-aaa" } },
  };

  test("ok when the nightly ref's commit carries exactly the candidate's tree", () => {
    const nightlySha = "n".repeat(40);
    const check = validateNightlyRevision(
      candidate,
      { object: { sha: nightlySha } },
      { sha: nightlySha, commit: { tree: { sha: "tree-aaa" } } },
    );
    expect(check.ok).toBe(true);
    expect(check.nightlySha).toBe(nightlySha);
    expect(check.reasons.join(" ")).toMatch(/same tree/i);
  });

  test("a nightly ref on a different tree is wrong-SHA evidence, excluded honestly", () => {
    const nightlySha = "n".repeat(40);
    const check = validateNightlyRevision(
      candidate,
      { object: { sha: nightlySha } },
      { sha: nightlySha, commit: { tree: { sha: "tree-bbb" } } },
    );
    expect(check.ok).toBe(false);
    expect(check.reasons.join(" ")).toMatch(/different tree/i);
  });

  test("a missing nightly ref or commit is named, never guessed", () => {
    expect(validateNightlyRevision(candidate, null, null).ok).toBe(false);
    const nightlySha = "n".repeat(40);
    expect(validateNightlyRevision(candidate, { object: { sha: nightlySha } }, null).ok).toBe(
      false,
    );
  });

  test("a candidate commit without a tree cannot be validated", () => {
    const check = validateNightlyRevision(
      { sha: "c".repeat(40), commit: {} },
      { object: { sha: "n".repeat(40) } },
      { sha: "n".repeat(40), commit: { tree: { sha: "tree-aaa" } } },
    );
    expect(check.ok).toBe(false);
    expect(check.reasons.join(" ")).toMatch(/tree/i);
  });
});

// ---------------------------------------------------- evidence-bundle reader

describe("readAcceptanceEvidence", () => {
  test("reads engines, phases, host-load and contention members from the reports artifact", () => {
    const evidence = readAcceptanceEvidence(nightlyEvidenceZip());
    for (const engine of ["chromium", "firefox", "webkit"]) {
      expect(evidence.reports[engine]).toBeDefined();
      expect(summarizeReport(evidence.reports[engine]!).engines[0]!.project).toBe(engine);
    }
    expect(evidence.phases?.phases).toHaveLength(3);
    expect(evidence.hostLoad?.phases.map((p) => p.phase)).toEqual([
      "functional",
      "calibration",
      "performance",
    ]);
    expect(evidence.hostLoad?.phases[0]?.lease?.owner).toMatch(/browser-nightly\//);
    expect(evidence.contention?.measurementInvalid).toBe(false);
  });

  test("every missing or malformed member is a named error, never a crash or a guess", () => {
    const evidence = readAcceptanceEvidence(
      zipFixture({
        "reports/e2e-exhaustive-chromium.json": JSON.stringify(
          reportFixture({ chromium: { expected: 1 } }),
        ),
        "verdicts/phases-contention.json": "{}",
        "identity/host-load.json": "not json",
      }),
    );
    expect(evidence.reports.firefox).toBeUndefined();
    expect(evidence.reportErrors.firefox).toMatch(/no report member/);
    expect(evidence.phases).toBeUndefined();
    expect(evidence.phasesError).toMatch(/shape/i);
    expect(evidence.hostLoad).toBeUndefined();
    expect(evidence.hostLoadError).toMatch(/not json|parse/i);
    expect(evidence.contention).toBeUndefined();
    expect(evidence.contentionError).toMatch(/no contention member/);
  });

  test("a host-load record without per-phase entries is a named shape error", () => {
    const evidence = readAcceptanceEvidence(
      nightlyEvidenceZip({ "identity/host-load.json": JSON.stringify({ schemaVersion: 1 }) }),
    );
    expect(evidence.hostLoad).toBeUndefined();
    expect(evidence.hostLoadError).toMatch(/shape/i);
  });
});

// -------------------------------------------------- nightly run adjudication

describe("adjudicateNightlyRun", () => {
  const greenRun = checkRunFixture("nightly-linux-shadow", { conclusion: "success" });

  test("green + clean evidence + zero unexpected on all engines = acceptance-grade", () => {
    const grade = adjudicateNightlyRun({
      checkRun: greenRun,
      evidence: readAcceptanceEvidence(nightlyEvidenceZip()),
    });
    expect(grade.grade).toBe("acceptance-grade");
  });

  test("green under contention is NOT acceptance-grade (quiet-host rerun required)", () => {
    const zip = nightlyEvidenceZip({
      "verdicts/contention.json": JSON.stringify({
        ...QUIET_CONTENTION,
        measurementInvalid: true,
      }),
    });
    const grade = adjudicateNightlyRun({
      checkRun: greenRun,
      evidence: readAcceptanceEvidence(zip),
    });
    expect(grade.grade).toBe("not-acceptance-grade");
    expect(grade.reasons.join(" ")).toMatch(/contention/i);
    expect(grade.reasons.join(" ")).toMatch(/NOT acceptance-grade/i);
  });

  test("red under contention is the exit-7 shape: infrastructure-invalid, never a product regression", () => {
    const zip = nightlyEvidenceZip({
      "verdicts/contention.json": JSON.stringify({
        ...QUIET_CONTENTION,
        measurementInvalid: true,
      }),
    });
    const grade = adjudicateNightlyRun({
      checkRun: checkRunFixture("nightly-linux-shadow", { conclusion: "failure" }),
      evidence: readAcceptanceEvidence(zip),
    });
    expect(grade.grade).toBe("invalid");
    expect(grade.reasons.join(" ")).toMatch(/infrastructure/i);
  });

  test("red without contention blocks acceptance pending diagnosis", () => {
    const grade = adjudicateNightlyRun({
      checkRun: checkRunFixture("nightly-linux-shadow", { conclusion: "failure" }),
      evidence: readAcceptanceEvidence(nightlyEvidenceZip()),
    });
    expect(grade.grade).toBe("invalid");
    expect(grade.reasons.join(" ")).toMatch(/diagnos/i);
  });

  test("green with unreachable evidence is unverifiable, not acceptance-grade", () => {
    const grade = adjudicateNightlyRun({
      checkRun: greenRun,
      evidenceError: "expired (7-day retention)",
    });
    expect(grade.grade).toBe("not-acceptance-grade");
    expect(grade.reasons.join(" ")).toMatch(/unreachable|unverifiable/i);
  });

  test("a missing engine report downgrades honestly", () => {
    const zip = nightlyEvidenceZip();
    const evidence = readAcceptanceEvidence(zip);
    delete evidence.reports.webkit;
    const grade = adjudicateNightlyRun({ checkRun: greenRun, evidence });
    expect(grade.grade).toBe("not-acceptance-grade");
    expect(grade.reasons.join(" ")).toMatch(/webkit/);
  });

  test("unexpected outcomes on an engine downgrades honestly", () => {
    const zip = nightlyEvidenceZip({
      "reports/e2e-exhaustive-firefox.json": JSON.stringify(
        reportFixture({ firefox: { expected: 2, unexpected: 1 } }),
      ),
    });
    const grade = adjudicateNightlyRun({
      checkRun: greenRun,
      evidence: readAcceptanceEvidence(zip),
    });
    expect(grade.grade).toBe("not-acceptance-grade");
    expect(grade.reasons.join(" ")).toMatch(/firefox/);
  });

  test("a nonzero phase exit or a contentionInvalid flag downgrades honestly", () => {
    const phases = {
      schemaVersion: 1,
      phases: [
        { phase: "functional", exit: 0, engines: { chromium: 0, firefox: 0, webkit: 0 } },
        { phase: "calibration", exit: 0 },
        { phase: "performance", exit: 8 },
      ],
    };
    const grade = adjudicateNightlyRun({
      checkRun: greenRun,
      evidence: readAcceptanceEvidence(
        nightlyEvidenceZip({
          "verdicts/phases-contention.json": JSON.stringify(phases),
        }),
      ),
    });
    expect(grade.grade).toBe("not-acceptance-grade");
    expect(grade.reasons.join(" ")).toMatch(/performance/);

    const contended = {
      schemaVersion: 1,
      phases: [
        { phase: "functional", exit: 0, engines: { chromium: 0, firefox: 0, webkit: 0 } },
        { phase: "calibration", exit: 0 },
        { phase: "performance", exit: 0, contentionInvalid: true },
      ],
    };
    const flagged = adjudicateNightlyRun({
      checkRun: greenRun,
      evidence: readAcceptanceEvidence(
        nightlyEvidenceZip({
          "verdicts/phases-contention.json": JSON.stringify(contended),
        }),
      ),
    });
    expect(flagged.grade).toBe("not-acceptance-grade");
    expect(flagged.reasons.join(" ")).toMatch(/contention/i);
  });

  test("a missing host-load record downgrades (contention unverifiable)", () => {
    const evidence = readAcceptanceEvidence(nightlyEvidenceZip());
    delete evidence.hostLoad;
    const grade = adjudicateNightlyRun({ checkRun: greenRun, evidence });
    expect(grade.grade).toBe("not-acceptance-grade");
    expect(grade.reasons.join(" ")).toMatch(/host-load/i);
  });

  test("no check run or no concluded verdict is uncollected, never guessed", () => {
    expect(adjudicateNightlyRun({ checkRun: null, evidence: undefined }).grade).toBe("uncollected");
    expect(
      adjudicateNightlyRun({
        checkRun: checkRunFixture("nightly-linux-shadow", {
          status: "in_progress",
          conclusion: null,
        }),
        evidence: undefined,
      }).grade,
    ).toBe("uncollected");
  });
});

// -------------------------------------------------- record assembly + render

describe("missingItems", () => {
  test("the empty state reports EVERYTHING missing — collector and owner items", () => {
    const missing = missingItems(emptyCollectState());
    const ids = missing.map((item) => item.id);
    expect(ids).toContain("candidate");
    for (const check of PR_SUITE_CHECKS) expect(ids).toContain(`pr-suite:${check.check}`);
    expect(ids).toContain("nightly:ref");
    expect(ids).toContain("nightly:run");
    expect(ids).toContain("boundary-probe");
    // owner-gated items are listed until their OWNER block is filled
    for (const id of [
      "owner:receipt",
      "owner:isolation",
      "owner:artifact-safety",
      "owner:lease-review",
      "owner:lifecycle",
      "owner:recovery",
      "owner:enforcement",
      "owner:decision",
    ]) {
      expect(ids).toContain(id);
      expect(missing.find((item) => item.id === id)!.who).toBe("owner");
    }
  });

  test("filled owner sections are no longer missing", () => {
    const missing = missingItems(emptyCollectState(), ["owner:decision", "owner:receipt"]);
    expect(missing.map((m) => m.id)).not.toContain("owner:decision");
    expect(missing.map((m) => m.id)).not.toContain("owner:receipt");
  });

  test("a satisfied pr-suite verdict removes that item but not its sibling", () => {
    const state = emptyCollectState();
    state.prSuite["e2e-reference"]!.verdict = adjudicateThreeConsecutive([
      { runId: 1, attempt: 1, startedAt: "a", conclusion: "success", source: "attempt" },
      { runId: 1, attempt: 2, startedAt: "b", conclusion: "success", source: "attempt" },
      { runId: 1, attempt: 3, startedAt: "c", conclusion: "success", source: "attempt" },
    ]);
    const ids = missingItems(state).map((m) => m.id);
    expect(ids).not.toContain("pr-suite:e2e-reference");
    expect(ids).toContain("pr-suite:e2e-linux-shadow");
  });

  test("a head_sha mismatch on a counted check run is wrong-SHA evidence", () => {
    const state = emptyCollectState();
    state.prSuite["e2e-linux-shadow"]!.shaMismatch = true;
    const item = missingItems(state).find((m) => m.id === "pr-suite:e2e-linux-shadow:sha");
    expect(item?.who).toBe("collector");
    expect(item?.why).toMatch(/head_sha/i);
  });
});

describe("renderRecord", () => {
  test("the empty-state render is an explicit TEMPLATE with UNCOLLECTED placeholders everywhere", () => {
    const text = renderRecord(emptyCollectState());
    expect(text).toMatch(/TEMPLATE — NO EVIDENCE COLLECTED/i);
    expect((text.match(/UNCOLLECTED/g) ?? []).length).toBeGreaterThanOrEqual(15);
    expect(text).not.toMatch(/satisfied: yes|acceptance-grade\s*$/m);
  });

  test("a populated state renders identities, timelines, grades and links", () => {
    const state = emptyCollectState();
    state.shaArg = "abcdef1234";
    state.resolvedSha = "abcdef1234567890abcdef1234567890abcdef12";
    state.collectedAt = "2026-11-24T10:00:00Z";
    state.identity.pin = {
      parsed: {
        guest: {
          form: "native-qemu-vm",
          os: "ubuntu-24.04-noble",
          vcpu: 6,
          ramGiB: 12,
          nic: "none",
        },
        node: "22.23.4",
        playwright: "1.61.1",
        browsers: { chromium: "1228", firefox: "1532", webkit: "2311" },
        measurementWorkers: 3,
      },
      source: "ops/lemcentre-runner/browser-guest/environment-pin.json @ candidate",
    };
    state.identity.lemfleetRev = "3c8682b732002b85ba126a2408ee9acb374df2a0";
    state.identity.blobs = {
      budget: { path: "tests/e2e/perf/budget.json", blob: "bb".repeat(20) },
      calibration: { path: "calibration/fingerprint.json", blob: "cc".repeat(20) },
      threshold: { path: "ops/lemcentre-runner/contention-threshold.json", blob: "dd".repeat(20) },
    };
    state.prSuite["e2e-reference"]!.timeline = [
      {
        runId: 42,
        runUrl: "https://example/runs/42",
        attempt: 1,
        startedAt: "t1",
        conclusion: "success",
        source: "attempt",
      },
      {
        runId: 42,
        runUrl: "https://example/runs/42",
        attempt: 2,
        startedAt: "t2",
        conclusion: "success",
        source: "attempt",
      },
      {
        runId: 42,
        runUrl: "https://example/runs/42",
        attempt: 3,
        startedAt: "t3",
        conclusion: "success",
        source: "attempt",
      },
    ];
    state.prSuite["e2e-reference"]!.verdict = adjudicateThreeConsecutive(
      state.prSuite["e2e-reference"]!.timeline,
    );
    state.nightly.revision = validateNightlyRevision(
      { sha: state.resolvedSha, commit: { tree: { sha: "tree-aaa" } } },
      { object: { sha: "n".repeat(40) } },
      { sha: "n".repeat(40), commit: { tree: { sha: "tree-aaa" } } },
    );
    const text = renderRecord(state);
    expect(text).toContain("abcdef1234567890abcdef1234567890abcdef12");
    expect(text).toContain("6 vCPU / 12 GiB");
    expect(text).toContain("ubuntu-24.04-noble");
    expect(text).toContain("https://example/runs/42");
    expect(text).toMatch(/three consecutive.*satisfied|SATISFIED/i);
    expect(text).toContain("tests/e2e/perf/budget.json");
  });

  test("the render never asserts acceptance — the decision stays an owner placeholder", () => {
    const state = emptyCollectState();
    state.resolvedSha = "f".repeat(40);
    state.prSuite["e2e-reference"]!.verdict = adjudicateThreeConsecutive([
      { runId: 1, attempt: 1, startedAt: "a", conclusion: "success", source: "attempt" },
      { runId: 1, attempt: 2, startedAt: "b", conclusion: "success", source: "attempt" },
      { runId: 1, attempt: 3, startedAt: "c", conclusion: "success", source: "attempt" },
    ]);
    const text = renderRecord(state);
    expect(text).toMatch(/OWNER:decision/);
    expect(text).toMatch(/UNCOLLECTED.*decision|decision.*UNCOLLECTED/is);
  });
});

// ------------------------------------------------------- owner carry-over

describe("carryOverOwnerSections", () => {
  const rendered = () => renderRecord(emptyCollectState());

  test("a filled owner block survives a collector re-run verbatim", () => {
    const existing = rendered().replace(
      /<!-- OWNER:decision:start -->\n[\s\S]*?<!-- OWNER:decision:end -->/,
      "<!-- OWNER:decision:start -->\nACCEPTED 2026-12-01, by the owner.\n<!-- OWNER:decision:end -->",
    );
    const { text, filledOwnerIds } = carryOverOwnerSections(existing, rendered());
    expect(text).toContain("ACCEPTED 2026-12-01, by the owner.");
    expect(filledOwnerIds).toContain("owner:decision");
    // every other owner block was regenerated as an unfilled placeholder
    expect(text).toMatch(/OWNER:receipt:start[\s\S]*?UNCOLLECTED/);
  });

  test("an unfilled block is regenerated, not carried", () => {
    const { text, filledOwnerIds } = carryOverOwnerSections(rendered(), rendered());
    expect(filledOwnerIds).toEqual([]);
    expect((text.match(/UNCOLLECTED/g) ?? []).length).toBe(
      (rendered().match(/UNCOLLECTED/g) ?? []).length,
    );
  });

  test("a missing existing file yields the fresh render untouched", () => {
    const fresh = rendered();
    const { text, filledOwnerIds } = carryOverOwnerSections(null, fresh);
    expect(text).toBe(fresh);
    expect(filledOwnerIds).toEqual([]);
  });
});

// ------------------------------------------- committed presentation record --

describe("the committed presentation record", () => {
  test("is exactly the tool's own template render (prettier-normalized) — provably not collected evidence", async () => {
    const committed = readFileSync(
      join("docs", "verification", "2026-11-18-284-acceptance-evidence.md"),
      "utf8",
    );
    const rendered = await prettierFormat(renderRecord(emptyCollectState()), {
      parser: "markdown",
    });
    expect(committed).toBe(rendered);
  });
});

describe("adjudicateThreeConsecutive", () => {
  const entry = (
    conclusion: string | null,
    startedAt: string,
    runId = 1,
    attempt = 1,
  ): TimelineEntry => ({ runId, attempt, startedAt, conclusion, source: "attempt" });

  test("satisfied when the trailing three suite executions are all successful", () => {
    const verdict = adjudicateThreeConsecutive([
      entry("failure", "08:00"),
      entry("success", "09:00"),
      entry("success", "10:00"),
      entry("success", "11:00"),
    ]);
    expect(verdict.satisfied).toBe(true);
    expect(verdict.counted).toHaveLength(3);
    expect(verdict.counted.map((e) => e.startedAt)).toEqual(["09:00", "10:00", "11:00"]);
    // the earlier failure is disclosed as history outside the counted window
    expect(verdict.historyOutsideWindow.map((e) => e.conclusion)).toEqual(["failure"]);
  });

  test("an interleaved failure breaks the window (2 of 3 counted, shortfall 1)", () => {
    const verdict = adjudicateThreeConsecutive([
      entry("success", "08:00"),
      entry("success", "09:00"),
      entry("failure", "10:00"),
      entry("success", "11:00"),
    ]);
    expect(verdict.satisfied).toBe(false);
    expect(verdict.counted).toHaveLength(1);
    expect(verdict.shortfall).toBe(2);
    expect(verdict.reasons.join(" ")).toMatch(/failure|interrupt/i);
  });

  test("cancelled, timed-out, in-progress and absent conclusions are not successes", () => {
    for (const conclusion of ["cancelled", "timed_out", null]) {
      const verdict = adjudicateThreeConsecutive([
        entry("success", "08:00"),
        entry("success", "09:00"),
        entry(conclusion, "10:00"),
      ]);
      expect(verdict.satisfied, `conclusion ${conclusion}`).toBe(false);
    }
  });

  test("fewer than three executions total is an honest shortfall, never satisfaction", () => {
    const verdict = adjudicateThreeConsecutive([
      entry("success", "08:00"),
      entry("success", "09:00"),
    ]);
    expect(verdict.satisfied).toBe(false);
    expect(verdict.shortfall).toBe(1);
  });

  test("an empty timeline reports zero executions", () => {
    const verdict = adjudicateThreeConsecutive([]);
    expect(verdict.satisfied).toBe(false);
    expect(verdict.counted).toHaveLength(0);
    expect(verdict.shortfall).toBe(3);
    expect(verdict.reasons.join(" ")).toMatch(/no recorded/i);
  });

  test("a re-run attempt sequence failure-then-success counts only the trailing success", () => {
    // the Mac's operational path: three executions of one ci.yml run via
    // re-run attempts — attempt 1 failed, attempts 2+3 green is NOT three.
    const verdict = adjudicateThreeConsecutive([
      entry("failure", "08:00", 42, 1),
      entry("success", "09:00", 42, 2),
      entry("success", "10:00", 42, 3),
    ]);
    expect(verdict.satisfied).toBe(false);
    expect(verdict.shortfall).toBe(1);
  });

  test("three green re-run attempts of one workflow run do satisfy the rule", () => {
    const verdict = adjudicateThreeConsecutive([
      entry("success", "08:00", 42, 1),
      entry("success", "09:00", 42, 2),
      entry("success", "10:00", 42, 3),
    ]);
    expect(verdict.satisfied).toBe(true);
  });

  test("a lone not-yet-concluded run is the blocker once, never double-reported as history", () => {
    const verdict = adjudicateThreeConsecutive([entry(null, "08:00")]);
    expect(verdict.satisfied).toBe(false);
    const text = verdict.reasons.join(" ");
    expect(text.match(/not-yet-concluded/g)?.length).toBe(1);
    expect(text).not.toMatch(/earlier non-success/);
  });

  test("extra successes beyond the window are disclosed as history, not counted", () => {
    const verdict = adjudicateThreeConsecutive([
      entry("success", "07:00"),
      entry("success", "08:00"),
      entry("success", "09:00"),
      entry("success", "10:00"),
    ]);
    expect(verdict.satisfied).toBe(true);
    expect(verdict.counted).toHaveLength(3);
    expect(verdict.reasons.join(" ")).toMatch(/additional successful|history/i);
  });
});
