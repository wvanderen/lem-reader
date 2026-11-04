// scripts/lib/heavy-lease.mjs
// Issue #255 — the explicit heavy-test lease for the shared reference Mac.
//
// CONTEXT: CI's reference jobs already serialize with each other
// (job-level concurrency group `reference-mac-functional`), but nothing
// coordinates INDEPENDENT local heavy sessions (T3 agent sessions running
// Playwright suites, calibrate, perf) against those jobs or each other on
// the same box. This lease is that coordination: an explicit, visible,
// portable file lock — never a way to preempt another session.
//
// DESIGN BOUNDARIES:
//   - Contenders NEVER terminate another session. They fail fast (exit 3)
//     with the holder's identity and deliberate-override instructions.
//     An interrupted run signals only its own command's process group.
//   - Visible owner: every acquire records owner, host, pid, timestamps,
//     and (when superseding/recovering) what came before.
//   - Stale-owner recovery: a same-host holder whose pid AND command group
//     are gone, a corrupt file, or an EXPIRED foreign-host lease is reclaimable.
//     A live same-host owner/workload stays held past expiry — expiry bounds owners we
//     cannot reach (other hosts), not ones we can see are alive. A wedged
//     live holder is what the documented override is for.
//   - Cleanup on exit AND interruption: `run` holds the lease until its
//     command's process group has stopped, including delayed signal cleanup.
//   - Portable on macOS/Linux: JSON metadata in a per-user cache dir, with
//     mutations serialized by an atomically published nonempty lock directory.
//     Atomic file replacement alone is NOT mutual exclusion during recovery.
//
// This module does NOT change worker caps, shard policy, or CI's existing
// workflow serialization — it sits beside them as the cross-system layer.

import { spawn, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as os from "node:os";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

export const LEASE_SCHEMA_VERSION = 1;

/** Default TTL: exceeds the exhaustive reference job's 90-minute ceiling and
 * every documented local budget (15 min); expiry only ever matters for
 * holders on hosts we cannot probe (see module note). */
export const DEFAULT_TTL_MINUTES = 120;

/** Thrown when a live owner holds the lease. `holder` carries everything a
 * contender (or a human reading a log) needs to decide: wait, or override. */
export class LeaseHeldError extends Error {
  /** @param {{owner: string, host: string, pid: number, ageMs: number, expiresInMs: number, live: boolean, file: string}} holder */
  constructor(holder) {
    super(
      `heavy-test lease held by ${holder.owner} (host ${holder.host}, pid ${holder.pid}, ` +
        `held ${Math.round(holder.ageMs / 1000)}s, live owner/workload: ${holder.live}) — ${holder.file}`,
    );
    this.name = "LeaseHeldError";
    this.holder = holder;
  }
}

/**
 * The per-user, cross-checkout lease file. `LEM_HEAVY_LEASE_FILE` overrides
 * (tests, unusual setups); otherwise the platform cache dir:
 * ~/Library/Caches (macOS) or $XDG_CACHE_HOME/~/.cache elsewhere.
 */
export function defaultLeaseFile() {
  if (process.env.LEM_HEAVY_LEASE_FILE) return process.env.LEM_HEAVY_LEASE_FILE;
  const home = process.env.HOME ?? process.env.USERPROFILE ?? ".";
  const cacheBase =
    process.platform === "darwin"
      ? join(home, "Library", "Caches")
      : (process.env.XDG_CACHE_HOME ?? join(home, ".cache"));
  return join(cacheBase, "lem-reader", "heavy-test.lease.json");
}

/** This machine's identity for lease records and status output — the answer
 * to "is this load the reference Mac's or the dev box's?". */
export function machineIdentity() {
  return {
    host: os.hostname(),
    platform: process.platform,
    cpus: os.cpus().length,
    loadavg: os.loadavg(),
  };
}

/**
 * Read + parse a lease file. Never throws for I/O or parse problems.
 *
 * @returns {{lease: object | null, corrupt: boolean}} corrupt=true means a
 *   file exists but is unusable (recoverable, not an owner).
 */
export function readLeaseFile(file) {
  let raw;
  try {
    raw = readFileSync(file, "utf-8");
  } catch {
    return { lease: null, corrupt: false };
  }
  try {
    const lease = JSON.parse(raw);
    if (
      typeof lease?.owner !== "string" ||
      typeof lease?.host !== "string" ||
      typeof lease?.pid !== "number" ||
      typeof lease?.acquiredAt !== "number" ||
      typeof lease?.expiresAt !== "number"
    ) {
      return { lease: null, corrupt: true };
    }
    return { lease, corrupt: false };
  } catch {
    return { lease: null, corrupt: true };
  }
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    // Signal 0: the standard liveness probe — throws ESRCH when gone,
    // EPERM when alive but not ours (still alive for our purposes).
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === "EPERM";
  }
}

/**
 * The one liveness rule (documented in the module note): a lease is held
 * when its same-host owner or command group is alive, or its foreign host
 * is inside the TTL.
 *
 * @returns {{status: "held"|"stale", reason: string, live: boolean}}
 */
export function evaluateLease({ lease, now, host }) {
  if (lease.host === host) {
    const live = processAlive(lease.pid) || processGroupAlive(lease.processGroupId);
    return live
      ? {
          status: "held",
          reason: `live owner or command process group on this host (pid ${lease.pid})`,
          live,
        }
      : { status: "stale", reason: `pid ${lease.pid} no longer exists on this host`, live };
  }
  const expired = lease.expiresAt <= now;
  return expired
    ? {
        status: "stale",
        reason: `foreign host ${lease.host} expired ${Math.round((now - lease.expiresAt) / 1000)}s ago`,
        live: false,
      }
    : {
        status: "held",
        reason: `foreign host ${lease.host} (pid not probeable), ${Math.round((lease.expiresAt - now) / 1000)}s of TTL remain`,
        live: false,
      };
}

/**
 * Acquire the lease.
 *
 * @param {object} options
 * @param {string} options.file lease file path
 * @param {string} options.owner visible owner label (e.g. "ci/e2e-reference#123" or "lem@dev:local-e2e")
 * @param {number} [options.ttlMinutes] defaults to DEFAULT_TTL_MINUTES
 * @param {boolean} [options.override] deliberately replace a live holder (recorded in the new lease)
 * @returns {Promise<{lease: object, recoveredFrom: {owner?: string, reason: string, live?: boolean} | null}>}
 * @throws {LeaseHeldError} when a live owner holds the lease and override is false
 */
export async function acquireLease({
  file,
  owner,
  ttlMinutes = DEFAULT_TTL_MINUTES,
  override = false,
}) {
  return mutateLeaseFile(file, () => {
    const identity = machineIdentity();
    const now = Date.now();
    const { lease: existing, corrupt } = readLeaseFile(file);
    let recoveredFrom = null;
    if (corrupt) {
      recoveredFrom = { reason: "previous lease file was corrupt" };
    } else if (existing) {
      const verdict = evaluateLease({ lease: existing, now, host: identity.host });
      if (verdict.status === "held" && !override) {
        throw new LeaseHeldError(holderOf(existing, file, identity.host));
      }
      recoveredFrom = {
        owner: existing.owner,
        reason: verdict.status === "held" ? "deliberately overridden (--override)" : verdict.reason,
        live: verdict.live,
      };
    }
    const lease = {
      schemaVersion: LEASE_SCHEMA_VERSION,
      token: randomUUID(),
      owner,
      host: identity.host,
      pid: process.pid,
      acquiredAt: now,
      expiresAt: now + ttlMinutes * 60_000,
      platform: identity.platform,
      ...(recoveredFrom ? { recoveredFrom } : {}),
    };
    writeLeaseFile(file, lease);
    return { lease, recoveredFrom };
  });
}

/**
 * Release the lease. Refuses when someone else owns it (unless `force`),
 * because deleting another session's lease would silently unguard everyone.
 * Never kills the holder.
 */
export async function releaseLease({ file, owner, token, force = false }) {
  return mutateLeaseFile(file, () => {
    const { lease, corrupt } = readLeaseFile(file);
    if (!lease && !(force && corrupt)) return false;
    if (!force && (lease.owner !== owner || !token || lease.token !== token)) {
      throw new Error(
        `heavy-test lease ${file} is owned by ${lease.owner} (host ${lease.host}, pid ${lease.pid}); ` +
          `refusing to release for "${owner}" without its acquisition token — use --force to remove it deliberately`,
      );
    }
    unlinkSync(file);
    return true;
  });
}

/**
 * The status view: the lease, this host's verdict, and machine identity +
 * load (so log readers can tell reference-Mac contention from development
 * load before interpreting timings).
 */
export function leaseStatus({ file }) {
  const machine = machineIdentity();
  const { lease, corrupt } = readLeaseFile(file);
  if (!lease) {
    return { file, held: false, stale: corrupt, lease: null, corrupt, machine };
  }
  const verdict = evaluateLease({ lease, now: Date.now(), host: machine.host });
  return {
    file,
    held: verdict.status === "held",
    stale: verdict.status === "stale",
    verdict: verdict.reason,
    lease,
    corrupt,
    machine,
  };
}

/** Run a command in its own POSIX process group. The lease outlives the
 * immediate child when descendants are still working or handling a signal.
 * Commands must not daemonize/detach their work from this group. */
export async function runWithLease({
  file,
  owner,
  ttlMinutes,
  override,
  command,
  waitSeconds = 0,
}) {
  if (process.platform === "win32") throw new Error("heavy-lease run requires macOS or Linux");
  const identity = machineIdentity();
  const cancellation = new AbortController();
  let lease;
  let group;
  let interrupted;
  let escalation;
  const onSignal = (name) => {
    interrupted ??= name;
    cancellation.abort();
    if (group) {
      signalProcessGroup(group, name);
      // A descendant can ignore TERM/INT/HUP. Escalate only this run's group,
      // never another lease holder, and keep ownership throughout cleanup.
      escalation ??= setTimeout(() => signalProcessGroup(group, "SIGKILL"), 5000);
    }
  };
  const handlers = new Map(
    ["SIGINT", "SIGTERM", "SIGHUP"].map((name) => [name, () => onSignal(name)]),
  );
  for (const [name, handler] of handlers) process.on(name, handler);
  let exitCode = 1;
  try {
    const result = await acquireWithWait({
      file,
      owner,
      ttlMinutes,
      override,
      waitSeconds,
      signal: cancellation.signal,
    });
    lease = result.lease;
    if (result.recoveredFrom) {
      console.error(
        `heavy-lease: recovered from ${result.recoveredFrom.owner ?? "<unknown>"} (${result.recoveredFrom.reason})`,
      );
    }
    console.error(
      `heavy-lease: acquired by ${owner} on ${identity.host} (pid ${process.pid}, ` +
        `load ${identity.loadavg.map((n) => n.toFixed(2)).join(" ")}) → ${file}`,
    );
    if (!interrupted) {
      const child = spawn(command[0], command.slice(1), { stdio: "inherit", detached: true });
      group = child.pid;
      // Resolve (rather than reject) spawn errors immediately so a failed
      // spawn cannot become an unhandled rejection while metadata is saved.
      const done = new Promise((resolve) => {
        child.once("error", (error) => resolve({ error }));
        child.once("exit", (code, signal) => resolve({ code, signal }));
      });
      if (group) {
        await mutateLeaseFile(file, () => {
          const current = readLeaseFile(file).lease;
          if (current?.token === lease.token)
            writeLeaseFile(file, { ...current, processGroupId: group });
        });
      }
      const outcome = await done;
      // Even a normally exiting shell/npm process can leave work behind.
      // Wait for the whole group, not only the immediate child's exit event.
      while (processGroupAlive(group)) await new Promise((resolve) => setTimeout(resolve, 50));
      if (outcome.error) throw outcome.error;
      exitCode = outcome.signal ? signalExitCode(outcome.signal) : (outcome.code ?? 0);
    }
  } catch (err) {
    if (!interrupted) {
      if (err instanceof LeaseHeldError) {
        console.error(`✗ ${err.message}`);
        console.error(
          `  Wait for it to finish, or deliberately take it:\n    node scripts/heavy-lease.mjs run --override --owner "${owner}" -- <command>`,
        );
        exitCode = 3;
      } else {
        console.error(
          `✗ heavy-lease run failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    // An I/O error after spawn must not orphan a command and release early.
    if (group && processGroupAlive(group)) {
      signalProcessGroup(group, "SIGKILL");
      while (processGroupAlive(group)) await new Promise((resolve) => setTimeout(resolve, 50));
    }
  } finally {
    if (escalation) clearTimeout(escalation);
    if (lease) {
      try {
        await releaseLease({ file, owner, token: lease.token });
      } catch {
        console.error(
          `heavy-lease: cleanup could not release ${file} (ownership may have been overridden)`,
        );
      }
    }
    for (const [name, handler] of handlers) process.off(name, handler);
  }
  process.exit(interrupted ? signalExitCode(interrupted) : exitCode);
}

// ── internals ────────────────────────────────────────────────────────────────

/** acquireLease with a bounded queue on contention (1s poll). */
async function acquireWithWait({ file, owner, ttlMinutes, override, waitSeconds, signal }) {
  const deadline = Date.now() + waitSeconds * 1000;
  for (;;) {
    signal.throwIfAborted();
    try {
      return await acquireLease({ file, owner, ttlMinutes, override });
    } catch (err) {
      if (!(err instanceof LeaseHeldError) || Date.now() >= deadline) throw err;
      const remainS = Math.round((deadline - Date.now()) / 1000);
      console.error(
        `heavy-lease: held by ${err.holder.owner} — queueing (${remainS}s of wait budget left)`,
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

function holderOf(lease, file, host) {
  const now = Date.now();
  const verdict = evaluateLease({ lease, now, host });
  return {
    owner: lease.owner,
    host: lease.host,
    pid: lease.pid,
    ageMs: now - lease.acquiredAt,
    expiresInMs: lease.expiresAt - now,
    live: verdict.live,
    file,
  };
}

function writeLeaseFile(file, lease) {
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, `${JSON.stringify(lease, null, 2)}\n`, "utf-8");
    renameSync(temp, file);
  } finally {
    rmSync(temp, { force: true });
  }
}

function signalExitCode(name) {
  return 128 + (os.constants.signals[name] ?? 0);
}

function signalProcessGroup(group, name) {
  try {
    process.kill(-group, name);
  } catch (err) {
    if (err?.code !== "ESRCH") throw err;
  }
}

function processGroupAlive(group) {
  if (!Number.isInteger(group) || group <= 0) return false;
  try {
    process.kill(-group, 0);
  } catch (err) {
    return err?.code === "EPERM";
  }
  // Signal 0 also sees zombies, which cannot do work or handle a signal.
  // ps's POSIX fields are available on BOTH actual hosts (macOS/Linux).
  // Fail closed if inspection fails: do not silently free a running group.
  try {
    const rows = execFileSync("ps", ["-axo", "pgid=,stat="], { encoding: "utf-8" });
    return rows.split("\n").some((row) => {
      const [pgid, status] = row.trim().split(/\s+/);
      return Number(pgid) === group && status && !status.startsWith("Z");
    });
  } catch {
    return true;
  }
}

/** Serialize synchronous read/check/write AND release operations. Publishing
 * a PRE-FILLED directory by rename is exclusive: POSIX cannot replace a
 * nonempty directory. Unique marker names make stale-lock cleanup safe:
 * unlink ONLY the observed generation's marker, then nonrecursive rmdir.
 * If another contender publishes into the emptied slot, rmdir fails rather
 * than deleting its new lock. Never recursively delete the shared lock. */
async function mutateLeaseFile(file, mutate) {
  mkdirSync(dirname(file), { recursive: true });
  const lock = `${file}.lock`;
  const token = `${randomUUID()}.json`;
  const staged = `${lock}.${token}.tmp`;
  const now = Date.now();
  mkdirSync(staged);
  let locked = false;
  try {
    writeFileSync(
      join(staged, token),
      JSON.stringify({
        owner: "lease metadata mutation",
        host: os.hostname(),
        pid: process.pid,
        acquiredAt: now,
        expiresAt: now + 120_000,
      }),
    );
    for (;;) {
      try {
        renameSync(staged, lock);
        locked = true;
        break;
      } catch (err) {
        if (err?.code !== "EEXIST" && err?.code !== "ENOTEMPTY") throw err;
      }
      let markers;
      try {
        markers = readdirSync(lock);
      } catch (err) {
        if (err?.code === "ENOENT") continue;
        throw err;
      }
      for (const marker of markers) {
        const { lease: holder } = readLeaseFile(join(lock, marker));
        if (
          holder &&
          evaluateLease({ lease: holder, now: Date.now(), host: os.hostname() }).status === "stale"
        ) {
          removeMutationLock(lock, marker);
        }
      }
      if (Date.now() - now >= 10_000) throw new Error(`heavy-lease metadata lock busy: ${lock}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return mutate();
  } finally {
    if (locked) removeMutationLock(lock, token);
    rmSync(staged, { recursive: true, force: true });
  }
}

function removeMutationLock(lock, marker) {
  try {
    unlinkSync(join(lock, marker));
  } catch (err) {
    if (err?.code === "ENOENT") return;
    throw err;
  }
  try {
    rmdirSync(lock);
  } catch (err) {
    // A new nonempty generation may already occupy the emptied slot.
    if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(err?.code)) throw err;
  }
}
