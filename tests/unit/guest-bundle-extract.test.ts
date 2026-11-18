// @vitest-environment node
// Issue #281 — the bundle member extractor used by the e2e-linux-shadow
// lane's report step (ops/lemcentre-runner/browser-guest/
// extract-bundle-member.py).
//
// The shadow lane's per-engine step summary is rendered host-side from the
// PR-suite JSON report, which travels through the SAME reviewed, verified
// guest→host bundle channel as the diagnostics (issue #279): the staged
// pair .guest-diagnostics/{artifacts.tar, bundle-receipt.json}. This
// extractor is the ONLY reviewed way a workflow step may read bundle bytes
// on the host: it re-verifies the archive against the receipt digest,
// accepts exactly ONE member that must be a manifest-listed regular file
// with a safe relative name, and writes only that member's bytes to the
// requested output path. It never unpacks anything else and never executes
// guest content — and everything it does happens AFTER the bundle already
// passed verify-diagnostics-bundle.py, so this is defense in depth, not
// the primary boundary.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../..");
const extractor = resolve(repoRoot, "ops/lemcentre-runner/browser-guest/extract-bundle-member.py");
const fixtures = resolve(repoRoot, "tests/unit/fixtures/guest-diagnostics");

// Same environment contract as the bundle-verifier suite: the unit-check
// environments provide python3; a missing python3 is surfaced loudly.
const python = "python3";

function extract(bundleDir: string, member: string, out: string) {
  return spawnSync(
    python,
    ["-B", extractor, "--bundle-dir", bundleDir, "--member", member, "--out", out],
    { encoding: "utf8", timeout: 30_000 },
  );
}

/** A writable copy of the good fixture (tests tamper it). */
function copyGood(name: string): string {
  const dir = join(tmpdir(), `lem-extract-${name}-${process.pid}`);
  const prepare = spawnSync(
    python,
    [
      "-B",
      "-c",
      `import shutil
shutil.copytree(${JSON.stringify(resolve(fixtures, "good"))}, ${JSON.stringify(dir)})`,
    ],
    { encoding: "utf8" },
  );
  expect(prepare.status, prepare.stderr).toBe(0);
  return dir;
}

beforeAll(() => {
  expect(existsSync(extractor), "extractor script must exist in ops/").toBe(true);
  const probe = spawnSync(python, ["--version"], { encoding: "utf8" });
  expect(probe.status, "extract-bundle-member.py requires python3 on PATH").toBe(0);
});

describe("guest bundle member extractor", () => {
  test("extracts an existing manifest-listed member byte-for-byte", () => {
    const out = join(tmpdir(), `lem-extract-out-${process.pid}-html`);
    const result = extract(resolve(fixtures, "good"), "playwright-report/index.html", out);
    expect(result.stderr).toBe("");
    expect(result.status, result.stderr).toBe(0);
    // The extracted bytes must equal the member's tar payload — proven
    // against an independent reader (python tarfile), not a re-run of the
    // extractor's own logic.
    const roundTrip = spawnSync(
      python,
      [
        "-B",
        "-c",
        `import tarfile
with tarfile.open(${JSON.stringify(join(fixtures, "good", "artifacts.tar"))}) as t:
    import sys
    sys.stdout.buffer.write(t.extractfile("playwright-report/index.html").read())`,
      ],
      { encoding: null, maxBuffer: 16 * 1024 * 1024 },
    );
    expect(readFileSync(out).equals(Buffer.from(roundTrip.stdout))).toBe(true);
    rmSync(out, { force: true });
  });

  test("extracts a binary member byte-for-byte", () => {
    const member = "test-results/chromium/guest-diagnostics-fixture/a/trace.zip";
    const out = join(tmpdir(), `lem-extract-out-${process.pid}-zip`);
    const result = extract(resolve(fixtures, "good"), member, out);
    expect(result.stderr).toBe("");
    expect(result.status, result.stderr).toBe(0);
    const roundTrip = spawnSync(
      python,
      [
        "-B",
        "-c",
        `import tarfile, sys
with tarfile.open(${JSON.stringify(join(fixtures, "good", "artifacts.tar"))}) as t:
    sys.stdout.buffer.write(t.extractfile(${JSON.stringify(member)}).read())`,
      ],
      { encoding: null, maxBuffer: 16 * 1024 * 1024 },
    );
    expect(readFileSync(out).equals(Buffer.from(roundTrip.stdout))).toBe(true);
    rmSync(out, { force: true });
  });

  test("refuses a member the bundle does not contain, calmly", () => {
    const result = extract(resolve(fixtures, "good"), "reports/e2e-pr.json", "/tmp/unused-out");
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/not (?:a listed member|present)|no such member|missing/i);
  });

  test("refuses the detail manifest itself (single-purpose extraction)", () => {
    const result = extract(resolve(fixtures, "good"), "bundle-manifest.json", "/tmp/unused-out");
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/manifest-listed|listed member/i);
  });

  test("refuses traversal and absolute member requests", () => {
    for (const member of ["../../etc/passwd", "/etc/passwd", "../outside.txt"]) {
      const result = extract(resolve(fixtures, "good"), member, "/tmp/unused-out");
      expect(result.status, `member ${member} must be refused`).toBe(1);
      expect(result.stderr).toMatch(/unsafe member path/i);
    }
  });

  test("refuses an archive whose digest no longer matches the receipt", () => {
    const dir = copyGood("digest-lie");
    const archive = join(dir, "artifacts.tar");
    // Flip one byte in the middle of the payload (never the tar structure):
    // the receipt digest must disagree with the tampered archive.
    const flip = spawnSync(
      python,
      [
        "-B",
        "-c",
        `p = ${JSON.stringify(archive)}
data = bytearray(open(p, "rb").read())
data[len(data) // 2] ^= 0x01
open(p, "wb").write(data)`,
      ],
      { encoding: "utf8" },
    );
    expect(flip.status, flip.stderr).toBe(0);
    const result = extract(dir, "playwright-report/index.html", "/tmp/unused-out");
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/sha256 mismatch|digest/i);
    rmSync(dir, { recursive: true, force: true });
  });

  test("refuses a missing bundle directory calmly", () => {
    const result = extract(resolve(fixtures, "does-not-exist"), "a/b", "/tmp/unused-out");
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/cannot (be )?read|missing|not a directory/i);
  });

  test("refuses a bundle whose staged archive is a symlink", () => {
    const dir = copyGood("symlink-archive");
    const symlink = spawnSync(
      python,
      [
        "-B",
        "-c",
        `import os
p = ${JSON.stringify(join(dir, "artifacts.tar"))}
os.rename(p, p + ".real")
os.symlink(p + ".real", p)`,
      ],
      { encoding: "utf8" },
    );
    expect(symlink.status, symlink.stderr).toBe(0);
    const result = extract(dir, "playwright-report/index.html", "/tmp/unused-out");
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/not a regular file|regular/i);
    rmSync(dir, { recursive: true, force: true });
  });

  test("refuses a member that is not a regular file in the archive", () => {
    // Rebuild a small bundle whose only payload entry is a directory —
    // receipt and manifest are then regenerated to agree with it, so ONLY
    // the extractor's own non-regular-entry refusal can catch it.
    const dir = join(tmpdir(), `lem-extract-dir-entry-${process.pid}`);
    const out = "/tmp/unused-out";
    const build = spawnSync(
      python,
      [
        "-B",
        "-c",
        `import hashlib, io, json, os, tarfile
root = ${JSON.stringify(dir)}
os.makedirs(root, exist_ok=True)
info = tarfile.TarInfo("reports")
info.type = tarfile.DIRTYPE
info.mode = 0o755
archive = os.path.join(root, "artifacts.tar")
with tarfile.open(archive, "w") as t:
    manifest = tarfile.TarInfo("bundle-manifest.json")
    body = json.dumps({"version": 1, "files": [
        {"path": "reports", "bytes": 0, "sha256": hashlib.sha256(b"").hexdigest()}],
        "dropped": [], "caps": {}}).encode()
    manifest.size = len(body)
    t.addfile(manifest, io.BytesIO(body))
    t.addfile(info)
payload = open(archive, "rb").read()
digest = hashlib.sha256(payload).hexdigest()
open(os.path.join(root, "bundle-receipt.json"), "w").write(json.dumps({
    "v": 1, "bytes": len(payload), "sha256": digest, "files": 1,
    "label": "x", "commit": "c" * 40, "generation": "g"}))`,
      ],
      { encoding: "utf8" },
    );
    expect(build.status, build.stderr).toBe(0);
    const result = extract(dir, "reports", out);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/not a regular (?:archive )?(?:entry|file)/i);
    rmSync(dir, { recursive: true, force: true });
  });
});
