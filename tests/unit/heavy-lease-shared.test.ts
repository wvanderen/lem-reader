// tests/unit/heavy-lease-shared.test.ts
// Issue #280 — the ONE physical-host heavy-test lease shared by factory
// guests (acquired by the trusted factory-validate-inner wrapper, running
// as lemci through the root-owned control plane) and local heavy commands
// (run as the desktop user). The per-user cache file cannot be shared
// across identities, so the lib grows a shared-path protocol while keeping
// the single-user default byte-compatible:
//   - the lease record carries physical-host loadavg + uid at acquisition
//     (the contention evidence the migration spec requires beside runs);
//   - cross-user liveness: a pid owned by another user answers EPERM to
//     kill(pid, 0) — that is a LIVE owner, never an error;
//   - published files get explicit shared-group modes (0664 file, 0775
//     lock dir) so a restrictive umask (the factory plane runs UMask=0077)
//     cannot strand the other identity;
//   - scripted participants get `acquire --hold` (stdin EOF or signal
//     releases), token-scoped `release`, `--json`, and a DISTINCT exit
//     code for bounded-wait expiry so admission timeouts are visible.
import { describe, expect, it, afterAll } from "vitest";
import { chmodSync, existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import {
  acquireLease,
  defaultLeaseFile,
  evaluateLease,
  machineIdentity,
  readLeaseFile,
  releaseLease,
} from "../../scripts/lib/heavy-lease.mjs";

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const CLI = join(REPO_ROOT, "scripts", "heavy-lease.mjs");
const children: ReturnType<typeof spawn>[] = [];
const tempDirs: string[] = [];

function tempLeaseFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "heavy-lease-shared-"));
  tempDirs.push(dir);
  return join(dir, "lease.json");
}

/** Spawn the CLI with captured (line-buffered) output; pipes stay open so
 * the child can never block on write. stdin is a pipe the TEST keeps open —
 * exactly how factory-validate-inner drives `acquire --hold` (end it to
 * release the holder). */
function spawnCliCaptured(args: string[]) {
  const child = spawn(process.execPath, [CLI, ...args]);
  const stdout: string[] = [];
  const stderr: string[] = [];
  child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk.toString()));
  children.push(child);
  return {
    child,
    stdoutText: () => stdout.join(""),
    stderrText: () => stderr.join(""),
  };
}

const exited = (child: ReturnType<typeof spawn>) =>
  new Promise<{ code: number | null; signal: string | null }>((resolve) =>
    child.once("exit", (code, signal) => resolve({ code, signal })),
  );

/** Spawn a shell command (used to run the CLI under a restrictive umask). */
function spawnShellCaptured(command: string) {
  const child = spawn("/bin/sh", ["-c", command]);
  const stdout: string[] = [];
  const stderr: string[] = [];
  child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk.toString()));
  children.push(child);
  return { child, stdoutText: () => stdout.join(""), stderrText: () => stderr.join("") };
}

afterAll(async () => {
  await Promise.all(
    children.map((child) => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const done = new Promise<void>((resolve) => child.once("exit", () => resolve()));
      child.kill("SIGKILL");
      return done;
    }),
  );
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe("shared-lease record evidence (issue #280)", () => {
  it("records host loadavg and uid at acquisition", async () => {
    const file = tempLeaseFile();
    const { lease } = await acquireLease({ file, owner: "unit/shared-record" });
    expect(lease.loadavg).toHaveLength(3);
    for (const value of lease.loadavg ?? []) expect(value).toBeGreaterThanOrEqual(0);
    expect(lease.uid).toBe(process.getuid?.());
    await releaseLease({ file, owner: "unit/shared-record", token: lease.token });
  });

  it("defaults to the host-owned shared lease dir when it exists (opt-in by provisioning)", () => {
    const shared = mkdtempSync(join(tmpdir(), "heavy-lease-shared-dir-"));
    tempDirs.push(shared);
    const previousFile = process.env.LEM_HEAVY_LEASE_FILE;
    const previousDir = process.env.LEM_HEAVY_LEASE_SHARED_DIR;
    delete process.env.LEM_HEAVY_LEASE_FILE;
    process.env.LEM_HEAVY_LEASE_SHARED_DIR = shared;
    try {
      expect(defaultLeaseFile()).toBe(join(shared, "heavy-test.lease.json"));
      // A non-member of the shared group still gets an honest answer, not a
      // wrong "free" verdict: the unreadable file is surfaced as such.
      chmodSync(shared, 0o000);
      const { unreadable } = readLeaseFile(join(shared, "heavy-test.lease.json"));
      expect(unreadable).toBe(true);
    } finally {
      chmodSync(shared, 0o755);
      if (previousFile === undefined) delete process.env.LEM_HEAVY_LEASE_FILE;
      else process.env.LEM_HEAVY_LEASE_FILE = previousFile;
      if (previousDir === undefined) delete process.env.LEM_HEAVY_LEASE_SHARED_DIR;
      else process.env.LEM_HEAVY_LEASE_SHARED_DIR = previousDir;
    }
    // Without the shared dir, the per-user cache default is unchanged.
    const fallback = defaultLeaseFile();
    expect(fallback).toMatch(/lem-reader/);
    expect(fallback.endsWith("heavy-test.lease.json")).toBe(true);
  });

  it("publishes the lease file group-writable even under a restrictive umask (UMask=0077 plane)", async () => {
    const file = tempLeaseFile();
    const holder = spawnShellCaptured(
      `umask 077; exec "${process.execPath}" "${CLI}" acquire --hold --file "${file}" --owner unit/umask-holder`,
    );
    try {
      await expect
        .poll(() => readLeaseFile(file).lease?.owner, { timeout: 4000 })
        .toBe("unit/umask-holder");
      const mode = statSync(file).mode & 0o777;
      expect(mode).toBe(0o664);
    } finally {
      holder.child.stdin?.end();
      await exited(holder.child);
    }
  });
});

/** A factory-side holder: `acquire --hold` exactly as factory-validate-inner
 * drives it (stdin held open by the driving script; JSON record on stdout). */
function factoryHolder(file: string, owner: string) {
  const holder = spawnCliCaptured([
    "acquire",
    "--hold",
    "--json",
    "--file",
    file,
    "--owner",
    owner,
  ]);
  const record = new Promise<object>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("holder never printed its record")), 5000);
    holder.child.stdout?.on("data", (chunk: Buffer) => {
      const line = chunk.toString().split("\n")[0] ?? "";
      if (line.startsWith("{")) {
        clearTimeout(timer);
        resolve(JSON.parse(line));
      }
    });
  });
  return { ...holder, record };
}

async function waitForHolder(file: string, owner: string) {
  await expect.poll(() => readLeaseFile(file).lease?.owner, { timeout: 5000 }).toBe(owner);
}

describe("shared-lease mutual exclusion (issue #280)", () => {
  it("a factory-side acquire blocks a local heavy command (exit 3, holder named, nothing preempted)", async () => {
    const file = tempLeaseFile();
    const holder = factoryHolder(file, "factory-validation/deadbeefcafe");
    await waitForHolder(file, "factory-validation/deadbeefcafe");
    const contender = spawnCliCaptured([
      "run",
      "--file",
      file,
      "--owner",
      "lem@local:local-e2e",
      "--",
      process.execPath,
      "-e",
      "process.exit(9)",
    ]);
    const { code } = await exited(contender.child);
    expect(code).toBe(3);
    expect(contender.stderrText()).toContain("factory-validation/deadbeefcafe");
    expect(contender.stderrText()).toContain("--override");
    // the holder was never touched
    expect(holder.child.exitCode).toBe(null);
    holder.child.stdin?.end();
    expect((await exited(holder.child)).code).toBe(0);
    expect(existsSync(file)).toBe(false);
  });

  it("a second factory holder is blocked exactly like a local one (the plane serializes too)", async () => {
    const file = tempLeaseFile();
    const holder = factoryHolder(file, "factory-validation/first");
    await waitForHolder(file, "factory-validation/first");
    const contender = spawnCliCaptured([
      "acquire",
      "--hold",
      "--file",
      file,
      "--owner",
      "factory-validation/second",
    ]);
    const { code } = await exited(contender.child);
    expect(code).toBe(3);
    expect(contender.stderrText()).toContain("factory-validation/first");
    holder.child.stdin?.end();
    await exited(holder.child);
  });

  it("bounded admission wait expires VISIBLY with the distinct exit code 5", async () => {
    const file = tempLeaseFile();
    const holder = factoryHolder(file, "factory-validation/stubborn");
    await waitForHolder(file, "factory-validation/stubborn");
    const contender = spawnCliCaptured([
      "run",
      "--file",
      file,
      "--owner",
      "lem@local:queued",
      "--wait-seconds",
      "1",
      "--",
      process.execPath,
      "-e",
      "process.exit(0)",
    ]);
    const { code } = await exited(contender.child);
    expect(code).toBe(5);
    expect(contender.stderrText()).toContain("Bounded admission wait expired");
    expect(contender.stderrText()).toContain("factory-validation/stubborn");
    expect(holder.child.exitCode).toBe(null);
    holder.child.stdin?.end();
    await exited(holder.child);
  }, 15_000);

  it("cancellation during the bounded wait releases cleanly and never disturbs the holder", async () => {
    const file = tempLeaseFile();
    const holder = factoryHolder(file, "factory-validation/busy");
    await waitForHolder(file, "factory-validation/busy");
    const contender = spawnCliCaptured([
      "run",
      "--file",
      file,
      "--owner",
      "lem@local:waiting",
      "--wait-seconds",
      "30",
      "--",
      process.execPath,
      "-e",
      "process.exit(0)",
    ]);
    // Wait until the contender is actually inside the queue loop.
    await expect.poll(() => contender.stderrText(), { timeout: 5000 }).toContain("queueing");
    contender.child.kill("SIGTERM");
    const { code } = await exited(contender.child);
    expect(code).toBe(143); // 128 + SIGTERM: cancelled, never a silent pass
    // The holder was untouched and still holds.
    expect(readLeaseFile(file).lease?.owner).toBe("factory-validation/busy");
    expect(holder.child.exitCode).toBe(null);
    holder.child.stdin?.end();
    await exited(holder.child);
    expect(existsSync(file)).toBe(false);
    const next = await acquireLease({ file, owner: "unit/after-cancel" });
    await releaseLease({ file, owner: "unit/after-cancel", token: next.lease.token });
  }, 15_000);

  it("recovers a stale owner (dead pid) into the next participant's record", async () => {
    const file = tempLeaseFile();
    const dead = spawn(process.execPath, ["-e", "process.exit(0)"]);
    await new Promise<void>((resolve) => dead.once("exit", () => resolve()));
    writeFileSync(
      file,
      JSON.stringify({
        schemaVersion: 1,
        owner: "factory-validation/crashed",
        host: machineIdentity().host,
        pid: dead.pid,
        acquiredAt: Date.now() - 60_000,
        expiresAt: Date.now() + 60 * 60_000,
      }),
    );
    const holder = factoryHolder(file, "lem@local:recovered");
    const record = (await holder.record) as { recoveredFrom?: { owner?: string } };
    expect(record.recoveredFrom?.owner).toBe("factory-validation/crashed");
    await waitForHolder(file, "lem@local:recovered");
    holder.child.stdin?.end();
    expect((await exited(holder.child)).code).toBe(0);
  });

  it("protects a still-live owner owned by ANOTHER USER (pid 1 → EPERM means alive)", async () => {
    const file = tempLeaseFile();
    writeFileSync(
      file,
      JSON.stringify({
        schemaVersion: 1,
        owner: "root@lemcentre:foreign-identity",
        host: machineIdentity().host,
        pid: 1, // init: root-owned, so kill(pid, 0) answers EPERM = alive
        acquiredAt: Date.now() - 5 * 60_000,
        expiresAt: Date.now() - 1000, // even past TTL: live owners stay held
      }),
    );
    const verdict = evaluateLease({
      lease: readLeaseFile(file).lease!,
      now: Date.now(),
      host: machineIdentity().host,
    });
    expect(verdict.status).toBe("held");
    expect(verdict.live).toBe(true);
    const contender = spawnCliCaptured([
      "acquire",
      "--hold",
      "--file",
      file,
      "--owner",
      "lem@local:blocked",
    ]);
    const { code } = await exited(contender.child);
    expect(code).toBe(3);
    expect(contender.stderrText()).toContain("root@lemcentre:foreign-identity");
    expect(existsSync(file)).toBe(true); // the foreign owner's record is untouched
  });

  it("a scripted participant releases via --owner/--token from a separate process", async () => {
    const file = tempLeaseFile();
    const holder = factoryHolder(file, "factory-validation/scripted");
    const record = (await holder.record) as { owner: string; token: string };
    await waitForHolder(file, "factory-validation/scripted");
    const releaser = spawnCliCaptured([
      "release",
      "--file",
      file,
      "--owner",
      record.owner,
      "--token",
      record.token,
    ]);
    expect((await exited(releaser.child)).code).toBe(0);
    expect(existsSync(file)).toBe(false);
    holder.child.stdin?.end();
    expect((await exited(holder.child)).code).toBe(0);
  });

  it("status --json reports the machine-readable contention/load record", async () => {
    const file = tempLeaseFile();
    const holder = factoryHolder(file, "factory-validation/status");
    await waitForHolder(file, "factory-validation/status");
    const statusRun = spawnCliCaptured(["status", "--json", "--file", file]);
    const { code } = await exited(statusRun.child);
    expect(code).toBe(0);
    const parsed = JSON.parse(statusRun.stdoutText());
    expect(parsed.machine.loadavg).toHaveLength(3);
    expect(parsed.lease.owner).toBe("factory-validation/status");
    expect(parsed.lease.loadavg).toHaveLength(3); // loadavg recorded at acquisition
    expect(typeof parsed.lease.uid).toBe("number");
    expect(parsed.held).toBe(true);
    holder.child.stdin?.end();
    await exited(holder.child);
  });
});
