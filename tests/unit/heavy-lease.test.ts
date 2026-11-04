// tests/unit/heavy-lease.test.ts
// Issue #255 — the heavy-test lease contract for the shared reference Mac:
// two participating heavy commands cannot unintentionally overlap (visible
// owner, contention refusal), stale owners (dead pid / expired foreign
// holder / corrupt file) recover, holders clean up on exit AND interruption,
// and status reports machine identity + load alongside lease ownership so
// Linux development load is never mistaken for reference-Mac load. The lease
// never kills anything: lightweight work stays possible beside a holder.
import { describe, expect, it, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, fork, spawnSync, execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
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
const tempDirs: string[] = [];

function tempLeaseFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "heavy-lease-"));
  tempDirs.push(dir);
  return join(dir, "lease.json");
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

async function waitForFile(file: string): Promise<void> {
  const deadline = Date.now() + 3000;
  while (!existsSync(file)) {
    if (Date.now() >= deadline) throw new Error(`file never appeared: ${file}`);
    await sleep(10);
  }
}

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
    await releaseLease({ file, owner: "unit/acquire", token: lease.token });
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
    await releaseLease({ file, owner: "unit/next", token: lease.token });
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

describe("heavy-test lease review regressions (PR #258)", () => {
  it.each(["stale", "corrupt", "abandoned metadata lock"])(
    "admits only one contender recovering a %s record",
    async (kind) => {
      const file = tempLeaseFile();
      writeFileSync(
        file,
        kind === "corrupt"
          ? "{not json"
          : JSON.stringify({
              owner: "old",
              host: "unreachable-host",
              pid: 999999,
              acquiredAt: 1,
              expiresAt: 2,
            }),
      );
      if (kind === "abandoned metadata lock") {
        mkdirSync(`${file}.lock`);
        writeFileSync(join(`${file}.lock`, "old-generation.json"), readFileSync(file));
      }
      const library = pathToFileURL(join(REPO_ROOT, "scripts/lib/heavy-lease.mjs")).href;
      const contenders: ReturnType<typeof fork>[] = [];
      const launch = (owner: string) => {
        const child = fork(
          join(REPO_ROOT, "tests/fixtures/heavy-lease/recovery-contender.mjs"),
          [file, owner, library],
          { silent: true },
        );
        child.stdout?.resume();
        child.stderr?.resume();
        children.push(child);
        contenders.push(child);
        return new Promise<{ outcome: string; owner: string }>((resolve) => {
          child.once("message", (message) =>
            resolve(message as { outcome: string; owner: string }),
          );
        });
      };
      try {
        const first = launch("A");
        await waitForFile(`${file}.A.read`);
        const second = launch("B");
        expect(await first).toEqual({ outcome: "acquired", owner: "A" });
        expect(await second).toEqual({ outcome: "LeaseHeldError", owner: "B" });
        expect(readLeaseFile(file).lease?.owner).toBe("A");
      } finally {
        for (const child of contenders) child.kill("SIGKILL");
      }
    },
  );

  it.each(["SIGINT", "SIGTERM", "SIGHUP"] as const)(
    "keeps the lease until descendants finish handling %s",
    async (signal) => {
      const file = tempLeaseFile();
      const ready = `${file}.worker`;
      const signalled = `${file}.signalled`;
      const finished = `${file}.finished`;
      const worker = `
        const fs = require('node:fs');
        process.on(${JSON.stringify(signal)}, () => {
          fs.writeFileSync(${JSON.stringify(signalled)}, 'handling signal');
          setTimeout(() => {
            fs.writeFileSync(${JSON.stringify(finished)}, 'finished');
            process.exit(0);
          }, 400);
        });
        fs.writeFileSync(${JSON.stringify(ready)}, String(process.pid));
        setInterval(() => {}, 1000);
      `;
      const command = `
        require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(worker)}], {stdio: 'ignore'});
        setInterval(() => {}, 1000);
      `;
      const holder = spawnCli([
        "run",
        "--file",
        file,
        "--owner",
        "unit/process-tree",
        "--",
        process.execPath,
        "-e",
        command,
      ]);
      const done = new Promise<number | null>((resolve) => holder.once("exit", resolve));
      let workerPid: number | undefined;
      try {
        await waitForFile(ready);
        workerPid = Number(readFileSync(ready, "utf-8"));
        holder.kill(signal);
        await waitForFile(signalled);
        expect(leaseStatus({ file }).held).toBe(true);
        await expect(acquireLease({ file, owner: "unit/too-soon" })).rejects.toBeInstanceOf(
          LeaseHeldError,
        );
        expect(await done).toBe(128 + { SIGINT: 2, SIGTERM: 15, SIGHUP: 1 }[signal]);
        expect(existsSync(finished)).toBe(true);
        expect(existsSync(file)).toBe(false);
      } finally {
        holder.kill("SIGKILL");
        if (workerPid) {
          try {
            process.kill(workerPid, "SIGKILL");
          } catch {
            /* already exited */
          }
        }
      }
    },
  );

  it("does not recover a dead wrapper while its command group is still working", async () => {
    const file = tempLeaseFile();
    const holder = runHolder(file, "unit/killed-wrapper");
    const done = new Promise<void>((resolve) => holder.once("exit", () => resolve()));
    let group: number | undefined;
    try {
      await expect
        .poll(() => readLeaseFile(file).lease?.processGroupId, { timeout: 3000 })
        .toBeGreaterThan(0);
      group = readLeaseFile(file).lease!.processGroupId!;
      holder.kill("SIGKILL");
      await done;
      expect(leaseStatus({ file }).held).toBe(true);
      await expect(
        acquireLease({ file, owner: "unit/too-soon-after-crash" }),
      ).rejects.toBeInstanceOf(LeaseHeldError);
      process.kill(-group, "SIGTERM");
      await expect.poll(() => leaseStatus({ file }).held, { timeout: 3000 }).toBe(false);
      const next = await acquireLease({ file, owner: "unit/after-group-exit" });
      await releaseLease({ file, owner: next.lease.owner, token: next.lease.token });
    } finally {
      if (group) {
        try {
          process.kill(-group, "SIGKILL");
        } catch {
          /* already exited */
        }
      }
      holder.kill("SIGKILL");
    }
  });

  it("escalates an interrupted command that ignores SIGTERM before releasing", async () => {
    const file = tempLeaseFile();
    const ready = `${file}.ready`;
    const holder = spawnCli([
      "run",
      "--file",
      file,
      "--owner",
      "unit/ignores-term",
      "--",
      process.execPath,
      "-e",
      `process.on('SIGTERM', () => {}); require('node:fs').writeFileSync(${JSON.stringify(ready)}, 'ready'); setInterval(() => {}, 1000);`,
    ]);
    const done = new Promise<number | null>((resolve) => holder.once("exit", resolve));
    try {
      await waitForFile(ready);
      holder.kill("SIGTERM");
      await expect(
        acquireLease({ file, owner: "unit/blocked-during-grace" }),
      ).rejects.toBeInstanceOf(LeaseHeldError);
      expect(await done).toBe(143);
      expect(existsSync(file)).toBe(false);
    } finally {
      const group = readLeaseFile(file).lease?.processGroupId;
      if (group) {
        try {
          process.kill(-group, "SIGKILL");
        } catch {
          /* already exited */
        }
      }
      holder.kill("SIGKILL");
    }
  }, 10_000);

  it("cleans up when the command cannot be spawned", async () => {
    const file = tempLeaseFile();
    const command = join(file, "missing-command");
    const child = spawnCli(["run", "--file", file, "--owner", "unit/spawn-error", "--", command]);
    const code = await new Promise<number | null>((resolve) => child.once("exit", resolve));
    expect(code).toBe(1);
    expect(existsSync(file)).toBe(false);
  });

  it("retains the lease while a normally exiting command leaves a descendant working", async () => {
    const file = tempLeaseFile();
    const ready = `${file}.worker`;
    const finish = `${file}.finish`;
    const worker = `
      const fs = require('node:fs');
      fs.writeFileSync(${JSON.stringify(ready)}, String(process.pid));
      const timer = setInterval(() => {
        if (fs.existsSync(${JSON.stringify(finish)})) { clearInterval(timer); process.exit(0); }
      }, 10);
    `;
    const command = `
      require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(worker)}], {stdio: 'ignore'}).unref();
    `;
    const child = spawnCli([
      "run",
      "--file",
      file,
      "--owner",
      "unit/background",
      "--",
      process.execPath,
      "-e",
      command,
    ]);
    const done = new Promise<number | null>((resolve) => child.once("exit", resolve));
    let pid: number | undefined;
    try {
      await waitForFile(ready);
      pid = Number(readFileSync(ready, "utf-8"));
      await expect(acquireLease({ file, owner: "unit/blocked-background" })).rejects.toBeInstanceOf(
        LeaseHeldError,
      );
      writeFileSync(finish, "finish");
      expect(await done).toBe(0);
      expect(existsSync(file)).toBe(false);
    } finally {
      child.kill("SIGKILL");
      if (pid) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          /* already exited */
        }
      }
    }
  });

  it("rejects standalone acquire rather than creating an immediately stale lease", () => {
    const file = tempLeaseFile();
    const result = spawnSync(
      process.execPath,
      [CLI, "acquire", "--file", file, "--owner", "unit/manual"],
      { encoding: "utf-8" },
    );
    expect(result.status).toBe(4);
    expect(result.stderr).toMatch(/run/);
    expect(existsSync(file)).toBe(false);
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
    await releaseLease({ file, owner: "unit/reclaimed", token: lease.token });
  });

  it("recovers a corrupt lease file instead of wedging forever", async () => {
    const file = tempLeaseFile();
    writeFileSync(file, "{not json");
    const { lease, recoveredFrom } = await acquireLease({ file, owner: "unit/from-corrupt" });
    expect(lease.owner).toBe("unit/from-corrupt");
    expect(recoveredFrom?.reason).toMatch(/corrupt/i);
    await releaseLease({ file, owner: "unit/from-corrupt", token: lease.token });
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
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    expect(readLeaseFile(file).lease?.token).toBe(lease.token);
    await releaseLease({ file, owner: "unit/overrider", token: lease.token });
  });

  it("does not let an old acquisition release a replacement with the same owner label", async () => {
    const file = tempLeaseFile();
    const first = await acquireLease({ file, owner: "unit/reused-label" });
    const second = await acquireLease({ file, owner: "unit/reused-label", override: true });
    expect(second.lease.token).not.toBe(first.lease.token);
    await expect(
      releaseLease({ file, owner: "unit/reused-label", token: first.lease.token }),
    ).rejects.toThrow(/acquisition token/);
    expect(readLeaseFile(file).lease?.token).toBe(second.lease.token);
    await releaseLease({ file, owner: "unit/reused-label", token: second.lease.token });
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
