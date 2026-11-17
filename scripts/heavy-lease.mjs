#!/usr/bin/env node
// scripts/heavy-lease.mjs — the heavy-test lease CLI (issue #255; shared
// host lease for the factory plane in issue #280).
//
// The reference Mac runs CI's reference jobs AND local agent sessions. This
// lease makes heavy-test contention explicit and visible instead of silent
// load inflation:
//
//   node scripts/heavy-lease.mjs status [--json]
//   node scripts/heavy-lease.mjs run --owner "you@host:purpose" -- npm run test:e2e:pr
//   node scripts/heavy-lease.mjs run --override --owner "you@host:purpose" -- <cmd>
//   node scripts/heavy-lease.mjs acquire --hold --owner "factory/<job>" --wait-seconds 600
//   node scripts/heavy-lease.mjs release --owner NAME --token TOKEN
//
// Ownership lives in a per-user, cross-checkout cache file by default; when
// the host-owned shared lease dir exists (provisioned on Lemcentre, see
// docs/specs/lemcentre-host-lease.md) every participant — local sessions and
// the factory plane (lemci via the root-owned factory-validate-inner
// wrapper) — defaults to the ONE file inside it. LEM_HEAVY_LEASE_FILE
// overrides. CI's reference jobs hold this lease too — see
// .github/workflows/ci.yml + evidence.yml. The lease never kills; contenders
// fail visibly with the holder's identity. `run` retains ownership until its
// command group has stopped, including interruption cleanup; stale owners
// (dead pid AND command group, expired foreign holder, corrupt file) recover
// automatically.
//
// Exit codes (the contract for scripted participants — see
// docs/specs/lemcentre-host-lease.md):
//   0   success (including a holder releasing after its shutdown signal)
//   1   operational failure (I/O error, unreadable lease file, spawn failure)
//   3   contention — refused while a live owner holds the lease, no wait
//       budget spent (the existing fail-fast code)
//   4   usage error
//   5   bounded admission wait EXPIRED — a wait budget was spent queueing
//       and the holder is still live (the distinct, visible timeout failure
//       added in issue #280; previously this also exited 3)
//   128+n  `run` was interrupted by signal n (after its command group stopped)
import {
  acquireLeaseWithWait,
  defaultLeaseFile,
  holdAcquiredLease,
  leaseStatus,
  machineIdentity,
  releaseLease,
  runWithLease,
} from "./lib/heavy-lease.mjs";

const USAGE = `usage: heavy-lease.mjs <subcommand> [options]

  status [--json]                       print lease ownership + machine identity/load
  release (--owner NAME --token TOKEN) | --force
                                       deliberately clear a lease (kills nothing)
  run --owner NAME [--ttl-minutes N] [--override] [--wait-seconds N] -- <command...>
                                       acquire, run the command, release on exit
  acquire --hold --owner NAME [--ttl-minutes N] [--wait-seconds N] [--json]
                                       acquire for a scripted participant, print the
                                       lease record (JSON with --json), then hold
                                       until stdin EOF or SIGINT/SIGTERM/SIGHUP and
                                       release (the factory wrapper's pattern)

  --file PATH        lease file (default: the shared host lease dir when
                     present, else $LEM_HEAVY_LEASE_FILE or the user cache dir)
  --override         deliberately replace a live holder (recorded in the new lease)
  --force            release a lease you do not own (removes the file; kills nothing)
  --wait-seconds N   queue on contention up to N seconds instead of failing fast
  --json             machine-readable output: status prints the full status object,
                     acquire prints the lease record (one JSON line on stdout)`;

function fail(message, code = 4) {
  console.error(`✗ ${message}\n\n${USAGE}`);
  process.exit(code);
}

const argv = process.argv.slice(2);
const subcommand = argv[0];
const args = argv.slice(1);

let file = defaultLeaseFile();
let owner = "";
let ttlMinutes;
let waitSeconds = 0;
let override = false;
let force = false;
let json = false;
let hold = false;
let token = "";
const command = [];
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === undefined) break;
  if (command.length > 0 || arg === "--") {
    const rest = arg === "--" ? [] : [arg];
    command.push(...rest, ...args.slice(i + 1));
    break;
  }
  if (arg === "--file") file = requireValue(args, ++i, arg);
  else if (arg === "--owner") owner = requireValue(args, ++i, arg);
  else if (arg === "--token") token = requireValue(args, ++i, arg);
  else if (arg === "--ttl-minutes") ttlMinutes = Number(requireValue(args, ++i, arg));
  else if (arg === "--wait-seconds") waitSeconds = Number(requireValue(args, ++i, arg));
  else if (arg === "--override") override = true;
  else if (arg === "--force") force = true;
  else if (arg === "--json") json = true;
  else if (arg === "--hold") hold = true;
  else fail(`unknown option "${arg}"`);
}

function requireValue(list, index, flag) {
  const value = list[index];
  if (value === undefined) fail(`missing value for ${flag}`);
  return value;
}

switch (subcommand) {
  case "status": {
    const status = leaseStatus({ file });
    if (json) {
      console.log(JSON.stringify(status));
      if (status.unreadable) process.exit(1);
      break;
    }
    const load = status.machine.loadavg.map((n) => n.toFixed(2)).join(" ");
    console.log(`heavy-test lease: ${status.file}`);
    console.log(
      `machine: ${status.machine.host} (${status.machine.platform}, ${status.machine.cpus} cpus), ` +
        `load average: ${load}`,
    );
    if (status.unreadable) {
      console.log(`lease:   UNREADABLE — ${status.verdict}`);
      process.exit(1);
    }
    if (status.corrupt && !status.lease) {
      console.log("lease:   CORRUPT file — next acquire recovers it");
    } else if (!status.lease) {
      console.log("lease:   free");
    } else {
      const age = Math.round((Date.now() - status.lease.acquiredAt) / 1000);
      const ttl = Math.round((status.lease.expiresAt - Date.now()) / 1000);
      console.log(
        `lease:   ${status.held ? "HELD" : "STALE (recoverable)"} by ${status.lease.owner} ` +
          `(host ${status.lease.host}, pid ${status.lease.pid}, held ${age}s, ttl ${ttl}s)`,
      );
      console.log(`verdict: ${status.verdict ?? ""}`);
      if (status.lease.recoveredFrom) {
        console.log(`history: recovered from ${status.lease.recoveredFrom.owner ?? "<unknown>"}`);
      }
    }
    break;
  }
  case "acquire": {
    if (!owner) fail("--owner is required (a visible owner label, e.g. factory-validation/<sha>)");
    if (!hold)
      fail(
        "standalone acquire cannot hold a lease after exiting; " +
          "use run --owner NAME -- <command>, or acquire --hold for a scripted participant",
      );
    let result;
    try {
      result = await acquireLeaseWithWait({ file, owner, ttlMinutes, override, waitSeconds });
    } catch (err) {
      if (err?.name === "LeaseHeldError") {
        console.error(`✗ ${err.message}`);
        if (err.admissionExpired) {
          console.error(
            `  Bounded admission wait expired after ${waitSeconds}s — the holder is still live. ` +
              `Visible admission timeout; nothing was preempted.`,
          );
          process.exit(5);
        }
        process.exit(3);
      }
      console.error(
        `✗ heavy-lease acquire failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
    if (result.recoveredFrom) {
      console.error(
        `heavy-lease: recovered from ${result.recoveredFrom.owner ?? "<unknown>"} ` +
          `(${result.recoveredFrom.reason})`,
      );
    }
    const identity = machineIdentity();
    console.error(
      `heavy-lease: acquired by ${owner} on ${identity.host} (pid ${process.pid}, ` +
        `load ${identity.loadavg.map((n) => n.toFixed(2)).join(" ")}) → ${file}; ` +
        `holding until stdin EOF or signal`,
    );
    if (json) console.log(JSON.stringify(result.lease));
    else console.log(JSON.stringify(result.lease, null, 2));
    try {
      await holdAcquiredLease({ file, owner, token: result.lease.token });
    } catch (err) {
      console.error(
        `✗ heavy-lease holder release failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
    console.error(`heavy-lease: released by ${owner} (holder shutdown) → ${file}`);
    break;
  }
  case "release": {
    if (!force) {
      if (!owner || !token)
        fail(
          "run releases its own acquisition; scripted participants pass --owner NAME --token TOKEN; " +
            "use --force only for deliberate removal",
        );
      releaseLease({ file, owner, token })
        .then((released) => {
          console.log(
            released
              ? `heavy-lease: released ${file}`
              : `heavy-lease: nothing to release (${file})`,
          );
        })
        .catch((err) => {
          console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
          process.exit(3);
        });
      break;
    }
    releaseLease({ file, owner: owner || "<anonymous>", force })
      .then((released) => {
        console.log(
          released ? `heavy-lease: released ${file}` : `heavy-lease: nothing to release (${file})`,
        );
      })
      .catch((err) => {
        console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
        process.exit(3);
      });
    break;
  }
  case "run": {
    if (!owner) fail("--owner is required (a visible owner label, e.g. you@host:local-e2e)");
    if (command.length === 0) fail("run requires a command after --");
    await runWithLease({ file, owner, ttlMinutes, override, command, waitSeconds });
    break;
  }
  default:
    fail(subcommand ? `unknown subcommand "${subcommand}"` : "missing subcommand");
}
