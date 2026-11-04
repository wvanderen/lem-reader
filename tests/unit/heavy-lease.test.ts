// tests/unit/heavy-lease.test.ts
// Issue #255 — the heavy-test lease contract for the shared reference Mac:
// two participating heavy commands cannot unintentionally overlap (visible
// owner, contention refusal), stale owners (dead pid / expired foreign
// holder / corrupt file) recover, holders clean up on exit AND interruption,
// and status reports machine identity + load alongside lease ownership so
// Linux development load is never mistaken for reference-Mac load. The lease
// never kills anything: lightweight work stays possible beside a holder.
import { describe, expect, it, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import {
  LeaseHeldError,
  acquireLease,
  defaultLeaseFile,
  evaluateLease,
  leaseStatus,
  machineIdentity,
  readLeaseFile,
  releaseLease,
} from "../../scripts/lib/heavy-lease.mjs";

const sleep = promisify(setTimeout);
const REPO_ROOT = join(import.meta.dirname, "..", "..");
const CLI = join(REPO_ROOT, "scripts", "heavy-lease.mjs");
const children: ReturnType<typeof spawn>[] = [];

function tempLeaseFile(): string {
  return join(mkdtempSync(join(tmpdir(), "heavy-lease-")), "lease.json");
}

/** Spawn a lease CLI child with drained stdio pipes (a piped child under a
 * test runner can otherwise block on write and never exit). */
function spawnCli(args: string[]) {
  const child = spawn(process.execPath, [CLI, ...args]);
  child.stdout?.on("data", () => {});
  child.stderr?.on("data", () => {});
  children.push(child);
  return child;
}

function runHolder(file: string, owner: string, ms = 8000) {
  const child = spawn(process.execPath, [
    CLI,
    "run",
    "--file",
    file,
    "--owner",
    owner,
    "--",
    process.execPath,
    "-e",
    `setTimeout(() => process.exit(7), ${ms})`,
  ]);
  children.push(child);
  return child;
}

async function waitForLease(file: string, owner: string, timeoutMs = 6000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { lease } = readLeaseFile(file);
    if (lease?.owner === owner) return;
    await sleep(50);
  }
  throw new Error(`holder lease for "${owner}" never appeared in ${file}`);
}

afterAll(() => {
  for (const child of children) {
    if (child.exitCode === null) child.kill("SIGKILL");
  }
});

describe("heavy-test lease acquisition (issue #255)", () => {
  it("creates a lease with visible owner, host, pid, and expiry", async () => {
    const file = tempLeaseFile();
    const { lease } = await acquireLease({ file, owner: "unit/acquire", ttlMinutes: 30 });
    expect(lease.owner).toBe("unit/acquire");
    expect(lease.host).toBe(machineIdentity().host);
    expect(lease.pid).toBe(process.pid);
    expect(lease.acquiredAt).toBeGreaterThan(0);
    expect(lease.expiresAt - lease.acquiredAt).toBe(30 * 60_000);
    expect(existsSync(file)).toBe(true);
    await releaseLease({ file, owner: "unit/acquire" });
  });

  it("the default lease file lives in the user cache dir (shared across checkouts on one host)", () => {
    const file = defaultLeaseFile();
    expect(file).toMatch(/lem-reader/);
    expect(file.endsWith("heavy-test.lease.json")).toBe(true);
  });

  it("refuses while a live holder owns the lease, naming the owner (contention)", async () => {
    const file = tempLeaseFile();
    const child = runHolder(file, "unit/holder-a");
    await waitForLease(file, "unit/holder-a");
    await expect(acquireLease({ file, owner: "unit/blocked" })).rejects.toBeInstanceOf(
      LeaseHeldError,
    );
    await expect(acquireLease({ file, owner: "unit/blocked" })).rejects.toThrow(/unit\/holder-a/);
    // The contender never touches the holder: the child is still alive.
    expect(child.exitCode).toBe(null);
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    expect(child.exitCode).not.toBe(0);
  });

  it("releases on interruption, so the next session can acquire", async () => {
    const file = tempLeaseFile();
    const child = runHolder(file, "unit/interrupted");
    await waitForLease(file, "unit/interrupted");
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    await expect(existsSync(file)).toBe(false);
    const { lease } = await acquireLease({ file, owner: "unit/next" });
    expect(lease.owner).toBe("unit/next");
    await releaseLease({ file, owner: "unit/next" });
  });

  it("propagates the child's exit code and releases on normal exit", async () => {
    const file = tempLeaseFile();
    const child = runHolder(file, "unit/exits", 300);
    const code = await new Promise<number | null>((resolve) =>
      child.once("exit", (c) => resolve(c)),
    );
    expect(code).toBe(7);
    await expect(existsSync(file)).toBe(false);
  });
});

describe("heavy-test lease stale-owner recovery (issue #255)", () => {
  it("recovers a same-host lease whose pid is dead", async () => {
    const file = tempLeaseFile();
    const dead = spawn(process.execPath, ["-e", "process.exit(0)"]);
    await new Promise<void>((resolve) => dead.once("exit", () => resolve()));
    writeFileSync(
      file,
      JSON.stringify({
        schemaVersion: 1,
        owner: "unit/crashed",
        host: machineIdentity().host,
        pid: dead.pid,
        acquiredAt: Date.now() - 60_000,
        expiresAt: Date.now() + 60 * 60_000,
      }),
    );
    const { lease, recoveredFrom } = await acquireLease({ file, owner: "unit/recovered" });
    expect(lease.owner).toBe("unit/recovered");
    expect(recoveredFrom?.owner).toBe("unit/crashed");
  });

  it("holds while a foreign host's lease is unexpired, recovers it after expiry", async () => {
    const file = tempLeaseFile();
    const base = {
      schemaVersion: 1,
      owner: "ci@other-mac",
      host: "other-mac",
      pid: 424242,
    };
    writeFileSync(
      file,
      JSON.stringify({ ...base, acquiredAt: Date.now(), expiresAt: Date.now() + 60_000 }),
    );
    await expect(acquireLease({ file, owner: "unit/blocked-foreign" })).rejects.toBeInstanceOf(
      LeaseHeldError,
    );
    writeFileSync(
      file,
      JSON.stringify({ ...base, acquiredAt: Date.now() - 10_000, expiresAt: Date.now() - 1000 }),
    );
    const { lease } = await acquireLease({ file, owner: "unit/reclaimed" });
    expect(lease.owner).toBe("unit/reclaimed");
    await releaseLease({ file, owner: "unit/reclaimed" });
  });

  it("recovers a corrupt lease file instead of wedging forever", async () => {
    const file = tempLeaseFile();
    writeFileSync(file, "{not json");
    const { lease, recoveredFrom } = await acquireLease({ file, owner: "unit/from-corrupt" });
    expect(lease.owner).toBe("unit/from-corrupt");
    expect(recoveredFrom?.reason).toMatch(/corrupt/i);
    await releaseLease({ file, owner: "unit/from-corrupt" });
  });

  it("treats a same-host LIVE pid as held even past expiry (expiry bounds unreachable owners, not live ones)", async () => {
    const file = tempLeaseFile();
    writeFileSync(
      file,
      JSON.stringify({
        schemaVersion: 1,
        owner: "unit/long-runner",
        host: machineIdentity().host,
        pid: process.pid, // this test process is definitionally alive
        acquiredAt: Date.now() - 5 * 60_000,
        expiresAt: Date.now() - 1000,
      }),
    );
    const verdict = evaluateLease({
      lease: readLeaseFile(file).lease!,
      now: Date.now(),
      host: machineIdentity().host,
    });
    expect(verdict.status).toBe("held");
  });
});

describe("heavy-test lease override + release semantics (issue #255)", () => {
  it("override deliberately replaces a live holder and records the supersession", async () => {
    const file = tempLeaseFile();
    const child = runHolder(file, "unit/overridden");
    await waitForLease(file, "unit/overridden");
    const { lease, recoveredFrom } = await acquireLease({
      file,
      owner: "unit/overrider",
      override: true,
    });
    expect(lease.owner).toBe("unit/overrider");
    expect(recoveredFrom?.owner).toBe("unit/overridden");
    expect(recoveredFrom?.live).toBe(true);
    expect(recoveredFrom?.reason).toMatch(/overrid/i);
    child.kill("SIGKILL");
    await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    await releaseLease({ file, owner: "unit/overrider" });
  });

  it("release by a non-owner refuses without force; force removes the file without killing anyone", async () => {
    const file = tempLeaseFile();
    writeFileSync(
      file,
      JSON.stringify({
        schemaVersion: 1,
        owner: "someone-else",
        host: "elsewhere",
        pid: 999999,
        acquiredAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      }),
    );
    await expect(releaseLease({ file, owner: "unit/not-mine" })).rejects.toThrow(/someone-else/);
    expect(existsSync(file)).toBe(true);
    await releaseLease({ file, owner: "unit/not-mine", force: true });
    expect(existsSync(file)).toBe(false);
  });
});

describe("heavy-test lease queueing (issue #255)", () => {
  it("run --wait-seconds queues behind a holder, then acquires when it frees", async () => {
    const file = tempLeaseFile();
    const holder = spawnCli([
      "run",
      "--file",
      file,
      "--owner",
      "unit/slow-holder",
      "--",
      process.execPath,
      "-e",
      "setTimeout(() => process.exit(7), 1800)",
    ]);
    const holderDone = new Promise<void>((resolve) => holder.once("exit", () => resolve()));
    await waitForLease(file, "unit/slow-holder");

    const contender = spawnCli([
      "run",
      "--file",
      file,
      "--owner",
      "unit/queued",
      "--wait-seconds",
      "20",
      "--",
      process.execPath,
      "-e",
      "process.exit(5)",
    ]);
    const code = await new Promise<number | null>((resolve) =>
      contender.once("exit", (c) => resolve(c)),
    );
    // The contender waited out the holder, then ran its own child.
    expect(code).toBe(5);
    expect(existsSync(file)).toBe(false);
    await holderDone;
  }, 15_000);

  it("run --wait-seconds still fails (exit 3) when the wait budget runs out", async () => {
    const file = tempLeaseFile();
    const holder = spawnCli([
      "run",
      "--file",
      file,
      "--owner",
      "unit/stubborn-holder",
      "--",
      process.execPath,
      "-e",
      "setTimeout(() => process.exit(7), 8000)",
    ]);
    await waitForLease(file, "unit/stubborn-holder");

    const contender = spawnCli([
      "run",
      "--file",
      file,
      "--owner",
      "unit/timed-out",
      "--wait-seconds",
      "1",
      "--",
      process.execPath,
      "-e",
      "process.exit(0)",
    ]);
    const code = await new Promise<number | null>((resolve) =>
      contender.once("exit", (c) => resolve(c)),
    );
    expect(code).toBe(3);
    expect(holder.exitCode).toBe(null); // the holder was never touched
    holder.kill("SIGTERM");
    await new Promise<void>((resolve) => holder.once("exit", () => resolve()));
  });
});

describe("heavy-test lease status reporting (issue #255)", () => {
  it("reports machine identity + load so Linux dev load is not mistaken for reference-Mac load", () => {
    const identity = machineIdentity();
    expect(identity.host.length).toBeGreaterThan(0);
    expect(["darwin", "linux"]).toContain(identity.platform);
    expect(identity.cpus).toBeGreaterThan(0);
    expect(identity.loadavg).toHaveLength(3);
  });

  it("status names the holder and this host's verdict", async () => {
    const file = tempLeaseFile();
    const child = runHolder(file, "unit/status-holder");
    await waitForLease(file, "unit/status-holder");
    const status = leaseStatus({ file });
    expect(status.held).toBe(true);
    expect(status.lease?.owner).toBe("unit/status-holder");
    expect(status.machine.host).toBe(machineIdentity().host);
    const stdout = execFileSync(process.execPath, [CLI, "status", "--file", file], {
      encoding: "utf-8",
    });
    expect(stdout).toContain("unit/status-holder");
    expect(stdout).toContain(machineIdentity().host);
    expect(stdout).toContain("load average");
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => child.once("exit", () => resolve()));
  });

  it("status on a free lease says so", () => {
    const file = tempLeaseFile();
    const status = leaseStatus({ file });
    expect(status.held).toBe(false);
    expect(status.lease).toBeNull();
  });
});
