# Lemcentre host-owned heavy-test lease

Status: **implemented in repository code and tests (issue #280); host
deployment is owner-gated and pending** — the `lem-heavy` group, the
`/run/lem-heavy-lease` directory, the tmpfiles.d rule, and the
control-plane lease CLI exist only after the owner runs
`ops/lemcentre-runner/provision.sh lease` on lemcentre. Nothing in this
document claims the host has been provisioned. Companion infrastructure
ticket: [wvanderen/lemfleet#23](https://github.com/wvanderen/lemfleet/issues/23);
parent plan: [lemcentre-ci-migration.md](lemcentre-ci-migration.md) §Host
workload coordination.

## Purpose

One physical-host lease, shared by every controlled heavy workload on
lemcentre, so that factory unit guests (and their preparation-intensive
payload builds) never overlap local heavy commands (Playwright suites,
calibrate, perf) and never silently inflate each other's load. The lease
never kills anything: contenders fail visibly, queue for a bounded
admission wait, or (as a last resort, human-decided) override
deliberately. Unrelated interactive work is **monitored, not blocked** —
the lease records host load and names holders, it does not police the
desktop.

The mechanism is the existing issue #255 lease (scripts/lib/heavy-lease.mjs)
extended for multi-user sharing. The protocol is unchanged for every
single-user installation (the reference Mac keeps its per-user cache file
byte-for-byte).

## Identities and access

| Identity          | Runs                                                                                                                                                                                 | Lease access                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `lem` (uid 1000)  | local heavy commands, npm scripts                                                                                                                                                    | member of `lem-heavy` after provisioning                                                         |
| `lemci` (uid 958) | the factory driver plane (`lemcentre-factory.service` → `factory-validate-inner` → `ci_validate.py` → `run.py`/QEMU), via the root-owned wrapper plane under `env -i` + `UMask=0077` | member of `lem-heavy` (membership applies to new processes; the factory unit is oneshot per job) |
| `root`            | provisioning only                                                                                                                                                                    | creates and owns the directory; acquires nothing                                                 |

The `lem-heavy` group grants exactly one thing: write access to the lease
directory. It owns nothing else, and the group is created only by
`provision.sh lease`. Root never participates as a lease holder. A user not
in the group who queries a shared lease gets an explicit **UNREADABLE**
answer (exit 1) — never a false "free".

## Neutral location decision

**`/run/lem-heavy-lease`, mode 2775, owner `root:lem-heavy` (setgid).**

- `/run` is tmpfs: lost on reboot. That is exactly right for leases — no
  process survives a reboot, so no lease should either. A `/var/lib/…`
  location would persist stale lease records across reboots for no
  benefit (they are recoverable, but the recovery evidence trail would be
  fiction).
- Because tmpfs is emptied at boot, `provision.sh lease` installs
  `/etc/tmpfiles.d/lem-heavy-lease.conf`
  (`d /run/lem-heavy-lease 2775 root lem-heavy -`) so the directory exists
  every boot; the phase also creates it immediately for the current boot.
- Mode 2775 = setgid + group rwx: every file created inside inherits the
  `lem-heavy` group regardless of which identity created it (so the other
  identity can read and mutate it); "others" get no write access. The
  sticky bit is deliberately absent — stale-owner recovery and override
  require cross-user unlink/rename, which sticky would forbid. 0777
  (world-writable) was rejected: any local account could then forge or jam
  factory admission.
- The lib publishes explicit modes that survive restrictive umasks (the
  factory plane runs `UMask=0077`; `run.py` sets `os.umask(0o077)`):
  lease file **0664**, mutation lock directory **0775**, lock marker
  **0664**. Without the explicit chmod, a 077 umask would publish 0600
  records the other identity cannot read or sweep.

The lease file is `/run/lem-heavy-lease/heavy-test.lease.json`. The lib's
default resolution: `LEM_HEAVY_LEASE_FILE` (explicit override, used by
tests and unusual setups) → the shared file **when the shared dir exists**
→ the per-user cache file (single-user default, unchanged — the reference
Mac). **Provisioning the directory is the opt-in switch**; every local
participant (`npm run lease:status`, `heavy-lease.mjs run …`) picks up the
shared path automatically, no script or env change needed.

### Local-participant migration (honest note)

When the directory appears, a local session's lease file _moves_ from
`~/.cache/lem-reader/heavy-test.lease.json` to the shared path. A lease
held under the old per-user file at that moment stops coordinating (both
files exist independently). Check the old file once
(`heavy-lease.mjs status --file ~/.cache/lem-reader/heavy-test.lease.json`)
and release it deliberately if held. The Mac is unaffected (no shared dir
is ever provisioned there).

## Mutual-exclusion protocol (unchanged, now multi-user)

All writers use `scripts/lib/heavy-lease.mjs` — the protocol document is
the module itself; the essentials:

- Lease record JSON: `{schemaVersion:1, token, owner, host, pid, uid,
loadavg, acquiredAt, expiresAt, platform, processGroupId?,
recoveredFrom?}`. `uid` and `loadavg` (at acquisition) are the
  contention evidence added by issue #280.
- Same-host holder is held while `kill(pid, 0)` succeeds **or answers
  EPERM** — EPERM means the pid is owned by another user and is alive:
  cross-user liveness, a live owner to protect, never an error — or while
  the recorded process group is alive (non-zombie). Foreign-host holders
  are held until TTL expiry (default 120 min).
- Mutation lock: a pre-filled nonempty directory `<file>.lock` published
  by rename (POSIX-atomic). Stale markers are swept safely; 10 s busy
  deadline. This works across identities precisely because every writer
  uses the lib and the published modes are group-writable.
- Stale-owner recovery: dead same-host pid **and** dead process group,
  expired foreign holder, or a corrupt file → next acquire recovers and
  records `recoveredFrom`. A **live** same-host owner stays held even past
  TTL — expiry bounds owners we cannot reach, not ones we can see are
  alive; a wedged live holder is what the deliberate, recorded
  `--override` is for. Contenders never kill.
- Scripted participants (the factory wrapper): `acquire --hold` prints the
  lease record as one JSON line, then holds until **stdin EOF** (the
  spawning script dying closes the pipe — reliable under SIGKILL) or
  SIGINT/SIGTERM/SIGHUP, then releases its own token. `release --owner
NAME --token TOKEN` releases from a separate process; `release --force`
  stays the deliberate human tool.

### Exit codes (the scripted contract)

| Code  | Meaning                                                                                                                                                                           |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | success (including a holder releasing after its shutdown signal)                                                                                                                  |
| 1     | operational failure — I/O error, unreadable lease file, spawn failure                                                                                                             |
| 3     | contention: refused while a live owner holds the lease, no wait budget spent                                                                                                      |
| 4     | usage error                                                                                                                                                                       |
| 5     | **bounded admission wait expired** — a wait budget was spent queueing and the holder is still live (distinct visible-timeout failure added in issue #280; previously also exit 3) |
| 128+n | `run` was interrupted by signal n after its command group stopped                                                                                                                 |

## Factory wiring (who acquires, and where)

**The acquisition lives in `factory-validate-inner`** (the root-owned,
pin-checked driver-side wrapper), not in lemfleet harness code and not in
PR-controlled checkout content:

1. Before `ci_validate.py` starts — so payload-set builds (npm cache,
   repo tarball: the preparation-intensive phases) **and** the guest boot
   both sit inside the held epoch — the wrapper runs the control-plane
   copy `/usr/local/libexec/factory-ci/heavy-lease.mjs`
   (`acquire --hold --json --wait-seconds 600 --ttl-minutes 120`, owner
   `factory-validation/<sha>`).
2. The holder's stdin is a FIFO whose write end the wrapper holds: any
   exit path — normal completion, `set -e` failure, trapped signals, or
   outright SIGKILL — closes it and the holder releases. A trap kills the
   holder explicitly for prompt release.
3. Admission failure is **exit 6** from the wrapper (visible red check),
   distinct from 2 harness red / 3 preparation failure / 4 boundary
   refusal / 5 wrapper deadline. The bounded wait is **600 s**:
   evidence.yml's tightest CI queue budget. Observed full validations run
   ≈8 min, so wait+run sits far inside the 93-minute wrapper deadline
   even doubled; in the combined pathological case (fully spent wait +
   max-length validation, 600 + 2400 build + 3000 guest bounds > 5580 s)
   the wrapper's own deadline still fails **visibly** (exit 5) — never
   silently. TTL 120 min exceeds the whole wrapper deadline.
4. The lease record (owner, host, pid, uid, **loadavg at acquisition**)
   lands in the scratch (`lease-record.json`) and is appended to
   `last-run.log`; ci_validate.py receives it **explicitly** via
   `--lease-file`/`--lease-record` argv (never ambient env — the wrapper
   scrubs the environment) and embeds it in the run evidence.

Why the wrapper and not ci_validate.py: one protocol implementation
(lem-reader's lib) and one acquirer; lemfleet stays implementation-free,
so the two repos cannot drift into two lease protocols, and PR-controlled
content can never supply the lease code. The lemfleet side (ticket #23)
adds only a read-only guard and evidence embedding — see
`proof/f4a/lease_guard.py`.

GitHub job concurrency (`factory-validation`) and guest-local locking are
**not substitutes**: the workflow-level group cannot see local heavy
commands at all, and guest-local locks start existing only after
admission, after the payload builds have already spent host CPU, I/O and
page cache.

## Contention recording

- Every lease record stores `loadavg` (1/5/15) and `uid` at acquisition;
  `status` (and `status --json`) reports the current machine identity +
  load beside the holder verdict.
- The factory run evidence carries the acquisition-time record
  (`host-lease.json` copied into the run's evidence directory +
  `lease-record.json` in the scratch), and `run.py` records host loadavg
  in each run's `launch.json`.
- Contention-invalidated measurements are infrastructure failures, not
  product regressions (parent plan); the recorded load is how that is
  adjudicated after the fact.

## Tests (the demonstrated contract)

`tests/unit/heavy-lease-shared.test.ts` (spawned processes, temp lease
files; no real second uid needed — the EPERM path uses pid 1):

- factory-side `acquire --hold` blocks a local `run` (exit 3, holder
  named) and a second factory holder alike;
- bounded wait expiry is **visible**: exit 5, holder named;
- cancellation (SIGTERM while queued) exits 143, never disturbs the
  holder, leaves no residue;
- stale owner (dead pid) recovered into the next participant's record;
- still-live foreign-uid owner (pid 1 → EPERM) protected, even past TTL;
- scripted `release --owner/--token` works from a separate process;
- lease files publish 0664 even under umask 077; the shared-dir default
  resolution and the UNREADABLE (non-member) answer are covered;
- `status --json` emits the machine-readable contention/load record.

The pre-existing `tests/unit/heavy-lease.test.ts` (issue #255) keeps
covering the single-user contract; one assertion changed with #280
(wait-budget expiry now exits 5 instead of 3).

## Provisioning and rollback (owner-gated)

`sudo bash ops/lemcentre-runner/provision.sh lease` (idempotent; included
in `all`): creates `lem-heavy`, adds `lemci` + `lem`, writes the
tmpfiles.d rule, creates `/run/lem-heavy-lease` (2775 root:lem-heavy),
installs the root-owned lease CLI into the control plane, and verifies
both identities can write the dir while the runner cannot write the tool.

Rollback: `sudo groupdel` after removing members, `sudo rm -- /run/lem-heavy-lease
/etc/tmpfiles.d/lem-heavy-lease.conf /usr/local/libexec/factory-ci/heavy-lease.mjs
/usr/local/libexec/factory-ci/lib/heavy-lease.mjs`. After rollback the
factory wrapper fails admission **visibly** (exit 6, "lease tool missing")
rather than running uncoordinated; local sessions fall back to the
per-user cache file automatically.

## Residual risks

- Cooperative, not enforced: an uncooperative local command can still
  double the load. The lease makes coordination explicit and visible; it
  does not (and should not) police the desktop.
- A `lem-heavy` member can, at worst, deny admission (hold/jam the lease
  file or lock dir). That is a visible DoS on CI admission, not code or
  credential exposure; the 10 s busy deadline and corrupt-file recovery
  bound the jamming shapes, and the override remains the human escape.
- The combined pathological case above can surface as wrapper exit 5
  (deadline) instead of admission exit 6; both are visible red.
