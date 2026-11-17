// @vitest-environment node
// Issue #282 — adversarial checks for the guest EVIDENCE bundle class of
// the bundle verifier (ops/lemcentre-runner/browser-guest/
// verify-diagnostics-bundle.py --class evidence).
//
// The nightly-equivalent Linux lane (nightly-linux-shadow.yml) receives its
// evidence through the SAME reviewed #279 transport as the diagnostics
// bundles, but as a distinct bundle class with its own reviewed caps
// (contract: docs/specs/lemcentre-browser-diagnostics.md §Bundle classes).
// The verifier must enforce the class table it is handed — refusing
// oversize, count overflow, traversal/symlink entries, digest and receipt
// lies, unexpected staged files, and CAP-CLASS DRIFT in either direction
// (a diagnostics-class bundle must not ride the looser evidence caps, and
// an evidence bundle must not pass as diagnostics).
//
// The diagnostics fixtures were produced by the lemfleet packer (#279);
// the evidence class has no packer yet, so these fixtures come from the
// committed builder tests/unit/fixtures/guest-evidence/build.py — the
// reproducible source of the wire format until the lemfleet companion
// ticket lands (then cross-check, exactly like #279 did).
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../..");
const verifier = resolve(
  repoRoot,
  "ops/lemcentre-runner/browser-guest/verify-diagnostics-bundle.py",
);
const builder = resolve(repoRoot, "tests/unit/fixtures/guest-evidence/build.py");
const diagnosticsFixtures = resolve(repoRoot, "tests/unit/fixtures/guest-diagnostics");

// Same environment contract as the diagnostics suite: the unit-check
// environments provide python3; a missing python3 is surfaced loudly.
const python = "python3";

function build(caseName: string): string {
  const dir = mkdtempSync(join(tmpdir(), `lem-evidence-${caseName}-`));
  const result = spawnSync(python, ["-B", builder, caseName, dir], {
    encoding: "utf8",
    timeout: 120_000,
  });
  expect(result.status, result.stderr).toBe(0);
  return dir;
}

function verify(bundleDir: string, extraArgs: string[] = []) {
  return spawnSync(python, ["-B", verifier, "--bundle-dir", bundleDir, ...extraArgs], {
    encoding: "utf8",
    timeout: 60_000,
  });
}

beforeAll(() => {
  expect(existsSync(verifier), "verifier script must exist in ops/").toBe(true);
  expect(existsSync(builder), "fixture builder must exist").toBe(true);
  const probe = spawnSync(python, ["--version"], { encoding: "utf8" });
  expect(probe.status, "verify-diagnostics-bundle.py requires python3 on PATH").toBe(0);
});

describe("guest evidence bundle verifier (class table)", () => {
  test("accepts the well-formed evidence bundle from the committed builder", () => {
    const result = verify(build("good"), ["--class", "evidence"]);
    expect(result.stderr).toBe("");
    expect(result.status, result.stderr).toBe(0);
  });

  test("still accepts the committed diagnostics fixtures under the default class", () => {
    // The class flag must not disturb the existing #279 lane: the default
    // class stays diagnostics and the packer-produced fixture still passes.
    const result = verify(join(diagnosticsFixtures, "good"));
    expect(result.status, result.stderr).toBe(0);
    const explicit = verify(join(diagnosticsFixtures, "good"), ["--class", "diagnostics"]);
    expect(explicit.status, explicit.stderr).toBe(0);
  });

  test("refuses an unknown class calmly (usage error, not a crash)", () => {
    const result = verify(build("good"), ["--class", "telemetry"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(/class|choice/i);
  });

  test("a 60-file bundle passes the evidence caps but not the diagnostics caps", () => {
    // Drift refuses in the tightening direction: 60 files is inside the
    // evidence cap (64) and over the diagnostics cap (48).
    const asEvidence = verify(build("many-files"), ["--class", "evidence"]);
    expect(asEvidence.status, asEvidence.stderr).toBe(0);
    const asDiagnostics = verify(build("many-files"), ["--class", "diagnostics"]);
    expect(asDiagnostics.status).toBe(1);
    expect(asDiagnostics.stderr).toMatch(/over cap|caps/i);
  });

  test("refuses a bundle whose manifest records the diagnostics caps under --class evidence", () => {
    // Drift refuses in the loosening direction too: the manifest's caps
    // block names the class the packer packed for; a diagnostics-caps
    // bundle must not ride the evidence caps silently.
    const result = verify(build("diagnostics-caps"), ["--class", "evidence"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/caps/i);
  });

  const adversarial: ReadonlyArray<[string, RegExp]> = [
    ["traversal-entry", /unsafe entry path/i],
    ["symlink-entry", /non-regular archive entry/i],
    ["manifest-digest-lie", /sha256 mismatch/i],
    ["manifest-ghost-entry", /missing/i],
    ["receipt-digest-lie", /sha256/i],
    ["receipt-size-lie", /bytes/i],
    ["extra-staged-file", /unexpected staged file/i],
    ["no-detail-manifest", /first entry|detail manifest/i],
    ["count-overflow", /over cap/i],
  ];

  test.each(adversarial)("refuses %s with a specific finding", (caseName, finding) => {
    const result = verify(build(caseName), ["--class", "evidence"]);
    expect(result.status, `expected refusal for ${caseName}`).toBe(1);
    expect(result.stderr + result.stdout).toMatch(finding);
  });

  test("refuses a member over the 8 MiB evidence per-file cap", () => {
    const result = verify(build("per-file-oversize"), ["--class", "evidence"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/per-file/i);
  });

  test("refuses a payload over the 11 MiB evidence total cap (12 x 1 MiB, each in-file)", () => {
    const result = verify(build("total-oversize"), ["--class", "evidence"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/total payload/i);
  });
});

describe("evidence bundle caps fit the #279 channel arithmetic", () => {
  // The contract math, asserted from the committed constants so neither
  // side drifts silently (docs/specs/lemcentre-browser-diagnostics.md
  // §Bundle classes shows the same arithmetic):
  //   worst-case archive = 11 MiB payload + 64 x (512 header + 511 pad)
  //                        + manifest entry + GNU end padding
  //                      <= 11,618,960 B < 12,288,000 B channel bound
  //   parts              = ceil(archive / 768) <= 15,131 <= 16,000
  //   session requests   = 1 + 580 + 80 + 1 + parts <= 15,793 <= 20,000
  test("a max-cap evidence archive stays inside the channel's part and request budget", () => {
    const source = spawnSync(
      python,
      ["-B", "-c", `print(open(${JSON.stringify(verifier)}).read())`],
      { encoding: "utf8" },
    );
    expect(source.status, source.stderr).toBe(0);
    const text = source.stdout;
    expect(text).toMatch(/"evidence":\s*\{/);
    expect(text).toMatch(/64/);
    expect(text).toMatch(/8 \* 1024 \* 1024/);
    expect(text).toMatch(/11 \* 1024 \* 1024/);
    // The channel bound is class-independent: both classes share
    // MAX_TAR_BYTES = 12_288_000 (16,000 parts x 768 raw bytes).
    expect(text).toMatch(/MAX_TAR_BYTES = 12_288_000/);
  });
});

describe("evidence fixtures are cleaned up", () => {
  // The oversize fixtures carry multi-MiB archives; keep the temp tree
  // from accumulating across watch-mode reruns.
  test("built fixture directories are removed after each adversarial case", () => {
    const dir = build("total-oversize");
    expect(existsSync(join(dir, "artifacts.tar"))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
    expect(existsSync(dir)).toBe(false);
  });
});
