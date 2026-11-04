// scripts/lib/heavy-lease.mjs
// Issue #255 — the explicit heavy-test lease for the shared reference Mac.
//
// CONTEXT: CI's reference jobs already serialize with each other
// (job-level concurrency group `reference-mac-functional`), but nothing
// coordinates INDEPENDENT local heavy sessions (T3 agent sessions running
// Playwright suites, calibrate, perf) against those jobs or each other on
// the same box. This lease is that coordination: an explicit, visible,
// portable file lock — never a process killer.
//
// DESIGN BOUNDARIES:
//   - The lease NEVER terminates anything. Contenders fail fast (exit 3)
//     with the holder's identity and the deliberate-override instructions;
//     lightweight targeted work stays possible beside a holder.
//   - Visible owner: every acquire records owner, host, pid, timestamps,
//     and (when superseding/recovering) what came before.
//   - Stale-owner recovery: a same-host holder whose pid is dead, a corrupt
//     file, or an EXPIRED foreign-host lease is reclaimable. A live
//     same-host pid stays held even past expiry — expiry bounds owners we
//     cannot reach (other hosts), not ones we can see are alive. A wedged
//     live holder is what the documented override is for.
//   - Cleanup on exit AND interruption: the `run` subcommand releases on
//     child exit and on SIGINT/SIGTERM/SIGHUP.
//   - Portable: no flock (NFS-ish/macOS quirks), no kernel primitives — a
//     JSON file in a per-user cache dir shared across checkouts of one
//     host, created exclusively (O_EXCL) and replaced via atomic rename.
//
// This module does NOT change worker caps, shard policy, or CI's existing
// workflow serialization — it sits beside them as the cross-system layer.

import { spawn } from "node:child_process";
import * as os from "node:os";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
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
        `held ${Math.round(holder.ageMs / 1000)}s, live pid: ${holder.live}) — ${holder.file}`,
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
 * when its same-host pid is alive, or its foreign host is inside the TTL.
 *
 * @returns {{status: "held"|"stale", reason: string, live: boolean}}
 */
export function evaluateLease({ lease, now, host }) {
  if (lease.host === host) {
    const live = processAlive(lease.pid);
    return live
      ? { status: "held", reason: `live pid ${lease.pid} on this host`, live }
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
  const identity = machineIdentity();
  const now = Date.now();
  const { lease: existing, corrupt } = readLeaseFile(file);

  let recoveredFrom = null;
  if (corrupt) {
    recoveredFrom = { reason: "previous lease file was corrupt" };
  } else if (existing) {
    const verdict = evaluateLease({ lease: existing, now, host: identity.host });
    if (verdict.status === "held" && !override) {
      throw new LeaseHeldError({
        owner: existing.owner,
        host: existing.host,
        pid: existing.pid,
        ageMs: now - existing.acquiredAt,
        expiresInMs: existing.expiresAt - now,
        live: verdict.live,
        file,
      });
    }
    if (verdict.status === "held" && override) {
      recoveredFrom = {
        owner: existing.owner,
        reason: "deliberately overridden (--override)",
        live: verdict.live,
      };
    } else if (verdict.status === "stale") {
      recoveredFrom = { owner: existing.owner, reason: verdict.reason, live: false };
    }
  }

  const lease = {
    schemaVersion: LEASE_SCHEMA_VERSION,
    owner,
    host: identity.host,
    pid: process.pid,
    acquiredAt: now,
    expiresAt: now + ttlMinutes * 60_000,
    platform: identity.platform,
    ...(recoveredFrom ? { recoveredFrom } : {}),
  };

  if (!existing && !corrupt) {
    // Fast path: exclusive create. EEXIST falls through to the replace path.
    try {
      writeExclusive(file, lease);
      return { lease, recoveredFrom };
    } catch (err) {
      if (err?.code !== "EEXIST") throw err;
      // Lost the create race — re-evaluate below with the winner present.
      const retry = readLeaseFile(file);
      if (
        retry.lease &&
        evaluateLease({ lease: retry.lease, now: Date.now(), host: identity.host }).status ===
          "held"
      ) {
        throw new LeaseHeldError(holderOf(retry.lease, file, identity.host));
      }
    }
  }

  // Replace path (recovery/override/lost race): write a temp file beside the
  // lease, rename over it (atomic), then re-read to confirm we still own it.
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(lease, null, 2)}\n`, "utf-8");
  renameSync(temp, file);
  const confirmed = readLeaseFile(file).lease;
  if (!confirmed || confirmed.owner !== owner || confirmed.acquiredAt !== now) {
    // Another reclaimer replaced it after our rename — they win; we report held.
    if (confirmed) throw new LeaseHeldError(holderOf(confirmed, file, identity.host));
    throw new Error(`heavy-lease: lease file vanished during acquisition (${file})`);
  }
  return { lease, recoveredFrom };
}

/**
 * Release the lease. Refuses when someone else owns it (unless `force`),
 * because deleting another session's lease would silently unguard everyone.
 * Never kills the holder.
 */
export async function releaseLease({ file, owner, force = false }) {
  const { lease } = readLeaseFile(file);
  if (!lease) return false;
  if (!force && lease.owner !== owner) {
    throw new Error(
      `heavy-test lease ${file} is owned by ${lease.owner} (host ${lease.host}, pid ${lease.pid}); ` +
        `refusing to release for "${owner}" — use --force to remove it deliberately`,
    );
  }
  try {
    unlinkSync(file);
  } catch (err) {
    if (err?.code !== "ENOENT") throw err;
  }
  return true;
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

/** Run `command` holding the lease; release on exit + SIGINT/SIGTERM/SIGHUP;
 * propagate the child's exit code (exit 3 when the lease is held). */
export function runWithLease({ file, owner, ttlMinutes, override, command, waitSeconds = 0 }) {
  const identity = machineIdentity();
  let child = null;
  let released = false;
  let acquired = false;

  const release = async () => {
    if (released) return;
    released = true;
    if (!acquired) return;
    try {
      await releaseLease({ file, owner });
    } catch {
      // Best effort: a missing/unwritable lease file on cleanup is logged,
      // not fatal — stale-owner recovery covers the residue.
      console.error(`heavy-lease: cleanup could not release ${file} (stale-owner recovery will)`);
    }
  };

  for (const name of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(name, () => {
      // Forward the SAME signal to the child; release once it exits. A
      // signal before the acquire resolves (or before the spawn) exits via
      // the child-exit path when possible, else directly.
      if (child && child.exitCode === null) {
        child.kill(name);
        return;
      }
      void release().finally(() => process.exit(130));
    });
  }

  acquireWithWait({ file, owner, ttlMinutes, override, waitSeconds })
    .then((result) => {
      acquired = true;
      if (result.recoveredFrom) {
        console.error(
          `heavy-lease: recovered from ${result.recoveredFrom.owner ?? "<unknown>"} (${result.recoveredFrom.reason})`,
        );
      }
      console.error(
        `heavy-lease: acquired by ${owner} on ${identity.host} (pid ${process.pid}, ` +
          `load ${identity.loadavg.map((n) => n.toFixed(2)).join(" ")}) → ${file}`,
      );
      child = spawn(command[0], command.slice(1), { stdio: "inherit" });
      child.on("exit", async (code, signalName) => {
        await release();
        // Shell convention: 128+n when a signal took the child.
        process.exit(signalName ? 128 : (code ?? 0));
      });
      return child;
    })
    .catch((err) => {
      if (err instanceof LeaseHeldError) {
        console.error(`✗ ${err.message}`);
        console.error(
          `  Wait for it to finish, check progress with the owner, or deliberately take it:\n` +
            `    node scripts/heavy-lease.mjs run --override --owner "${owner}" -- <command>`,
        );
        process.exit(3);
      }
      console.error(
        `✗ heavy-lease acquire failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    });
}

// ── internals ────────────────────────────────────────────────────────────────

/** acquireLease with a bounded queue on contention (1s poll). */
async function acquireWithWait({ file, owner, ttlMinutes, override, waitSeconds }) {
  const deadline = Date.now() + waitSeconds * 1000;
  for (;;) {
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

function writeExclusive(file, lease) {
  mkdirSync(dirname(file), { recursive: true });
  const fd = openSync(file, "wx");
  try {
    writeFileSync(fd, `${JSON.stringify(lease, null, 2)}\n`, "utf-8");
  } finally {
    closeSync(fd);
  }
}
