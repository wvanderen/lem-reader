// @vitest-environment node
// Issue #282 — the contention-policy adjudicator for the nightly-equivalent
// Linux lane (ops/lemcentre-runner/record-contention.mjs + the committed
// default threshold file ops/lemcentre-runner/contention-threshold.json).
//
// Migration rule under test (docs/specs/lemcentre-ci-migration.md §Host
// workload coordination): contention-invalidated measurements are
// INFRASTRUCTURE failures, not product regressions. The lane's conclude
// step consumes this tool's machine-readable verdict to reclassify
// measurement-phase failures (and refuse acceptance-grade green) when the
// recorded host load crossed the reviewed threshold — while functional
// phases under the same load are recorded but never invalidate (their
// verdicts are pass/fail facts about the code, not timings).
//
// Inputs are the host-load records the evidence bundles carry
// (identity/host-load.json: per-phase loadavg at lease acquisition plus
// the lease record). Threshold changes are OWNER decisions; the default
// (loadavg 1m > 6 on the 12-CPU lemcentre host, invalidating exactly the
// measurement phases) comes from docs/agents/test-discipline.md's shared-
// machine guidance.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import type {
  ContentionVerdict,
  HostLoadRecord,
  ThresholdConfig,
} from "../../../ops/lemcentre-runner/record-contention.mjs";
import {
  adjudicateContention,
  defaultThresholdPath,
  readRecords,
} from "../../../ops/lemcentre-runner/record-contention.mjs";

const repoRoot = resolve(import.meta.dirname, "../../..");
const tool = resolve(repoRoot, "ops/lemcentre-runner/record-contention.mjs");
const fixtures = resolve(repoRoot, "tests/unit/fixtures/contention");
const records = join(fixtures, "records");
const node = process.execPath;

type Sourced = Parameters<typeof adjudicateContention>[0][number];

function record(name: string): HostLoadRecord {
  return JSON.parse(readFileSync(join(records, name), "utf8")) as HostLoadRecord;
}

/** The adjudicator's input seam: {source, record} pairs (readRecords output). */
function sourced(name: string): Sourced {
  return { source: name, record: record(name) };
}

function run(args: string[]) {
  return spawnSync(node, [tool, ...args], { encoding: "utf8", timeout: 30_000 });
}

describe("the committed default threshold (an owner decision, guarded)", () => {
  test("defaults to loadavg 1m > 6 on the 12-CPU host, invalidating exactly the measurement phases", () => {
    const config = JSON.parse(
      readFileSync(join(repoRoot, "ops/lemcentre-runner/contention-threshold.json"), "utf8"),
    ) as ThresholdConfig;
    expect(config.schemaVersion).toBe(1);
    expect(config.thresholds.loadavg1mMax).toBe(6);
    expect(config.host?.cpus).toBe(12);
    expect(config.invalidates).toEqual(["calibration", "performance"]);
    // The change-control note must travel with the numbers so nobody
    // "tunes" the threshold in a PR.
    expect(config.changeControl).toMatch(/owner/i);
  });
});

describe("adjudicateContention (pure policy)", () => {
  const threshold = JSON.parse(
    readFileSync(join(repoRoot, "ops/lemcentre-runner/contention-threshold.json"), "utf8"),
  ) as ThresholdConfig;

  test("quiet records: nothing invalid, every phase recorded with its load", () => {
    const verdict = adjudicateContention([sourced("quiet.json")], threshold);
    expect(verdict.measurementInvalid).toBe(false);
    expect(verdict.phases).toHaveLength(3);
    for (const phase of verdict.phases) {
      expect(phase.contended).toBe(false);
      expect(phase.invalidates).toBe(false);
    }
  });

  test("a measurement phase over the threshold invalidates the measurements", () => {
    const verdict = adjudicateContention([sourced("contended-measurement.json")], threshold);
    const calibration = verdict.phases.find((p) => p.phase === "calibration");
    const performance = verdict.phases.find((p) => p.phase === "performance");
    expect(calibration?.contended).toBe(true); // 7.2 > 6
    expect(calibration?.invalidates).toBe(true);
    expect(performance?.contended).toBe(false); // 5.4 <= 6 (the 5m/15m loads do not matter)
    expect(performance?.invalidates).toBe(false);
    expect(verdict.measurementInvalid).toBe(true);
  });

  test("a contended FUNCTIONAL phase is recorded but never invalidates (pass/fail is not a timing)", () => {
    const verdict = adjudicateContention([sourced("contended-functional.json")], threshold);
    const functional = verdict.phases.find((p) => p.phase === "functional");
    expect(functional?.loadavg1m).toBe(9.8);
    expect(functional?.contended).toBe(true);
    expect(functional?.invalidates).toBe(false);
    expect(verdict.measurementInvalid).toBe(false);
  });

  test("the same phase across several records merges to the worst observed load", () => {
    // One record per evidence bundle: the calibration phase appears in the
    // measurement bundle's own record and again in a later phase's record.
    const verdict = adjudicateContention(
      [sourced("contended-measurement.json"), sourced("split-calibration.json")],
      threshold,
    );
    const calibration = verdict.phases.find((p) => p.phase === "calibration");
    expect(calibration?.loadavg1m).toBe(7.2); // max(7.2, 6.4)
    expect(calibration?.sources).toHaveLength(2);
    expect(verdict.measurementInvalid).toBe(true);
  });

  test("an unrecognized phase name is recorded as non-measurement, never invalidating", () => {
    const verdict = adjudicateContention(
      [
        {
          source: "inline.json",
          record: {
            schemaVersion: 1,
            host: "lemcentre",
            phases: [
              {
                phase: "smoke",
                at: "2026-11-20T07:00:00Z",
                loadavg: { "1m": 11, "5m": 9, "15m": 7 },
                lease: { owner: "x" },
              },
            ],
          },
        },
      ],
      threshold,
    );
    expect(verdict.phases[0]?.phase).toBe("smoke");
    expect(verdict.phases[0]?.measurement).toBe(false);
    expect(verdict.phases[0]?.invalidates).toBe(false);
    expect(verdict.measurementInvalid).toBe(false);
  });

  test("the invalidates list is the policy: widening it is an owner-recorded change", () => {
    const widened = { ...threshold, invalidates: ["functional"] };
    const verdict = adjudicateContention([sourced("contended-functional.json")], widened);
    expect(verdict.phases.find((p) => p.phase === "functional")?.invalidates).toBe(true);
    expect(verdict.measurementInvalid).toBe(true);
  });
});

describe("readRecords (input validation, fail-closed)", () => {
  test("refuses a malformed record instead of guessing a quiet verdict", () => {
    expect(() => readRecords([join(fixtures, "malformed.json")])).toThrow(/loadavg/i);
  });

  test("refuses a missing file", () => {
    expect(() => readRecords([join(fixtures, "nope.json")])).toThrow(/read/i);
  });
});

describe("record-contention CLI (the conclude-step interface)", () => {
  test("emits a machine-readable verdict on stdout: exit 0 even when contended", () => {
    const result = run(["--records", join(records, "contended-measurement.json")]);
    expect(result.status, result.stderr).toBe(0);
    const verdict = JSON.parse(result.stdout) as ContentionVerdict;
    expect(verdict.measurementInvalid).toBe(true);
    expect(verdict.threshold.loadavg1mMax).toBe(6);
  });

  test("accepts a directory of records and the default threshold", () => {
    const result = run(["--records", records]);
    expect(result.status, result.stderr).toBe(0);
    const verdict = JSON.parse(result.stdout) as ContentionVerdict;
    // Directory input reads every *.json: the contended cases dominate the
    // merged per-phase maxima.
    expect(verdict.measurementInvalid).toBe(true);
  });

  test("a directory containing a malformed record fails closed (exit 1), never quiet", () => {
    const dir = mkdtempSync(join(tmpdir(), "lem-contention-dir-"));
    writeFileSync(join(dir, "good.json"), JSON.stringify(record("quiet.json")));
    writeFileSync(join(dir, "bad.json"), readFileSync(join(fixtures, "malformed.json")));
    const result = run(["--records", dir]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/bad\.json/);
    expect(result.stderr).toMatch(/loadavg/);
  });

  test("exit 1 on malformed input — an unreadable record is a finding, never quiet", () => {
    const result = run(["--records", join(fixtures, "malformed.json")]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/loadavg/i);
  });

  test("exit 1 when the threshold file is missing, naming the path", () => {
    const result = run([
      "--records",
      join(records, "quiet.json"),
      "--threshold",
      join(fixtures, "no-such-threshold.json"),
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/threshold/i);
  });

  test("exit 2 usage when no records are given", () => {
    const result = run([]);
    expect(result.status).toBe(2);
  });

  test("also writes the verdict to --out for the workflow to archive", () => {
    const out = join(mkdtempSync(join(tmpdir(), "lem-contention-")), "verdict.json");
    const result = run(["--records", join(records, "quiet.json"), "--out", out]);
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(out)).toBe(true);
    expect(JSON.parse(readFileSync(out, "utf8")).measurementInvalid).toBe(false);
  });
});

describe("default threshold resolution", () => {
  test("the default threshold is the committed file beside the tool", () => {
    expect(defaultThresholdPath()).toBe(
      join(repoRoot, "ops/lemcentre-runner/contention-threshold.json"),
    );
  });
});
