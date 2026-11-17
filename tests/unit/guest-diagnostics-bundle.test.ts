// @vitest-environment node
// Issue #279 — adversarial checks for the browser-diagnostics bundle
// verifier (ops/lemcentre-runner/browser-guest/verify-diagnostics-bundle.py).
//
// The verifier is the last trust boundary before a guest-produced bundle is
// uploaded to GitHub: it must refuse traversal names, absolute paths,
// symlink/hardlink/directory entries, size/count cap violations, digest and
// receipt lies, and unexpected staged files — exiting non-zero with findings,
// and clean only on an exact contract match. Fixtures are committed bytes
// under tests/unit/fixtures/guest-diagnostics/ (the good bundle was produced
// by the lemfleet packer itself, so the two implementations are exercised
// against the same wire format).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../..");
const verifier = resolve(
  repoRoot,
  "ops/lemcentre-runner/browser-guest/verify-diagnostics-bundle.py",
);
const fixtures = resolve(repoRoot, "tests/unit/fixtures/guest-diagnostics");

// The unit-check environments (ubuntu-latest CI job, the factory's Ubuntu
// guest, the dev Linux box) all provide python3; the verifier is host-side
// operations tooling in the same trust shape as verify-environment-receipt.py
// (stdlib only). A missing python3 is an environment gap to surface loudly,
// never a silent skip of the adversarial checks.
const python = "python3";

function verify(caseName: string) {
  return spawnSync(python, ["-B", verifier, "--bundle-dir", resolve(fixtures, caseName)], {
    encoding: "utf-8",
    timeout: 30_000,
  });
}

beforeAll(() => {
  expect(existsSync(verifier), "verifier script must exist in ops/").toBe(true);
  const probe = spawnSync(python, ["--version"], { encoding: "utf-8" });
  expect(
    probe.status,
    "verify-diagnostics-bundle.py requires python3 on PATH; the unit-check " +
      "environments provide it (ubuntu-latest, factory Ubuntu guest, dev box)",
  ).toBe(0);
});

describe("guest diagnostics bundle verifier", () => {
  test("accepts the well-formed bundle the lemfleet packer produced", () => {
    const result = verify("good");
    expect(result.stderr).toBe("");
    expect(result.status, result.stderr).toBe(0);
  });

  test("refuses a missing bundle directory calmly", () => {
    const result = verify("does-not-exist");
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/cannot (be )?read|missing/i);
  });

  const adversarial: ReadonlyArray<[string, RegExp]> = [
    ["traversal-entry", /unsafe entry path/i],
    ["absolute-entry", /unsafe entry path/i],
    ["symlink-entry", /non-regular archive entry/i],
    ["dir-entry", /non-regular archive entry/i],
    ["manifest-digest-lie", /sha256 mismatch/i],
    ["per-file-oversize", /per-file/i],
    ["count-overflow", /over cap/i],
    ["receipt-digest-lie", /sha256/i],
    ["receipt-size-lie", /bytes/i],
    ["no-detail-manifest", /first entry|detail manifest/i],
    ["extra-staged-file", /unexpected staged file/i],
    ["manifest-ghost-entry", /missing/i],
  ];

  test.each(adversarial)("refuses %s with a specific finding", (caseName, finding) => {
    const result = verify(caseName);
    expect(result.status, `expected refusal for ${caseName}`).toBe(1);
    expect(result.stderr + result.stdout).toMatch(finding);
  });

  test("refuses when the staged bundle replaces a file with a symlink", () => {
    // Same adversarial class as the channel contract, applied to the staged
    // directory itself: the wrapper stages plain files, so a symlinked
    // artifacts.tar must never be accepted for upload.
    const staged = resolve(fixtures, "good");
    const prepare = spawnSync(
      python,
      [
        "-B",
        "-c",
        `import os, shutil, tempfile
root = tempfile.mkdtemp(prefix="lem-diag-symlink-")
shutil.copy(os.path.join(${JSON.stringify(staged)}, "bundle-receipt.json"), root)
os.symlink(os.path.join(${JSON.stringify(staged)}, "artifacts.tar"), os.path.join(root, "artifacts.tar"))
print(root)`,
      ],
      { encoding: "utf-8" },
    );
    expect(prepare.status, prepare.stderr).toBe(0);
    const root = prepare.stdout.trim();
    const result = spawnSync(python, ["-B", verifier, "--bundle-dir", root], {
      encoding: "utf-8",
      timeout: 30_000,
    });
    expect(result.status, "a symlinked artifacts.tar must be refused").toBe(1);
    expect(result.stderr + result.stdout).toMatch(/regular|symlink/i);
  });
});

describe("ops wrapper lifecycle constants (#279)", () => {
  test("the stale-claim sweep matches the wrapper whole-wait deadline, not the old 7200s", () => {
    const driverProcess = readFileSync(
      resolve(repoRoot, "ops/lemcentre-runner/driver-process"),
      "utf-8",
    );
    const factoryValidate = readFileSync(
      resolve(repoRoot, "ops/lemcentre-runner/factory-validate"),
      "utf-8",
    );
    expect(factoryValidate).toMatch(/DEADLINE_SECONDS=5580/);
    expect(driverProcess).toMatch(/STALE_SECONDS=5580/);
    expect(driverProcess).not.toMatch(/STALE_SECONDS=7200/);
    // The rationale must travel with the constant so nobody "fixes" it back.
    expect(driverProcess).toMatch(/wrapper['’]s whole-wait deadline|whole-wait deadline/i);
  });
});
