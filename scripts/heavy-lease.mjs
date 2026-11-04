#!/usr/bin/env node
// scripts/heavy-lease.mjs — the heavy-test lease CLI (issue #255).
//
// The reference Mac runs CI's reference jobs AND local agent sessions. This
// lease makes heavy-test contention explicit and visible instead of silent
// load inflation:
//
//   node scripts/heavy-lease.mjs status
//   node scripts/heavy-lease.mjs run --owner "you@host:purpose" -- npm run test:e2e:pr
//   node scripts/heavy-lease.mjs run --override --owner "you@host:purpose" -- <cmd>
//
// Ownership lives in a per-user, cross-checkout cache file (see
// scripts/lib/heavy-lease.mjs; LEM_HEAVY_LEASE_FILE overrides). CI's
// reference jobs hold this lease too — see .github/workflows/ci.yml +
// evidence.yml. The lease never kills; contenders exit 3 with the holder's
// identity. `run` retains ownership until its command group has stopped,
// including interruption cleanup; stale owners (dead pid AND command group,
// expired foreign holder, corrupt file) recover automatically.
import { defaultLeaseFile, leaseStatus, releaseLease, runWithLease } from "./lib/heavy-lease.mjs";

const USAGE = `usage: heavy-lease.mjs <subcommand> [options]

  status                                print lease ownership + machine identity/load
  release --force                       deliberately clear a lease (kills nothing)
  run --owner NAME [--ttl-minutes N] [--override] [--wait-seconds N] -- <command...>
                                        acquire, run the command, release on exit

  --file PATH        lease file (default: $LEM_HEAVY_LEASE_FILE or the user cache dir)
  --override         deliberately replace a live holder (recorded in the new lease)
  --force            release a lease you do not own (removes the file; kills nothing)
  --wait-seconds N   queue on contention up to N seconds instead of failing fast`;

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
  else if (arg === "--ttl-minutes") ttlMinutes = Number(requireValue(args, ++i, arg));
  else if (arg === "--wait-seconds") waitSeconds = Number(requireValue(args, ++i, arg));
  else if (arg === "--override") override = true;
  else if (arg === "--force") force = true;
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
    const load = status.machine.loadavg.map((n) => n.toFixed(2)).join(" ");
    console.log(`heavy-test lease: ${status.file}`);
    console.log(
      `machine: ${status.machine.host} (${status.machine.platform}, ${status.machine.cpus} cpus), ` +
        `load average: ${load}`,
    );
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
  case "acquire":
    fail("standalone acquire cannot hold a lease after exiting; use run --owner NAME -- <command>");
    break;
  case "release": {
    if (!force)
      fail("run releases its own acquisition; use release --force only for deliberate removal");
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
