# Lemcentre runner boundary: provisioning and operation (issues #277, #283)

Operational runbook for the runner/control-plane boundary that keeps
repository-controlled workflow code away from the desktop account on
lemcentre. The design, threat model and residual risks live in
[docs/specs/lemcentre-runner-boundary.md](../../docs/specs/lemcentre-runner-boundary.md);
companion infrastructure ticket: wvanderen/lemfleet#20.

Files in this directory are the **source of truth** for every installed
host artifact. Nothing on the host is hand-edited; provisioning installs
these files verbatim and `verify-boundary.sh` re-compares them.

| File                                                                                                               | Installed to                                                                          | Owner:mode          | Role                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `factory-validate`                                                                                                 | `/usr/local/libexec/factory-ci/factory-validate`                                      | root:root 0755      | Trusted launcher (runner-side): the only host step a workflow executes; checks the pin, enqueues a validation job, waits for the verdict, stages a validated diagnostics bundle into `.guest-diagnostics/` when a sidecar exists (#279)         |
| `factory-validate-inner`                                                                                           | `/usr/local/libexec/factory-ci/factory-validate-inner`                                | root:root 0755      | Driver-side half: re-checks the pin, runs the pinned harness with a scrubbed environment; `--diagnostics`/`--artifact-sink` hand the validated bundle pointer to the spool (#279)                                                               |
| `driver-process`                                                                                                   | `/usr/local/libexec/factory-ci/driver-process`                                        | root:root 0755      | Spool consumer: fail-closed envelope validation (incl. the optional `diagnostics` flag and artifacts sidecar, #279), serial execution, stale-claim recovery swept inside the wrapper's wait (issue #283 pairing, see `recovery-constants.json`) |
| `factory-driver.service` / `factory-driver.path`                                                                   | `/etc/systemd/system/lemcentre-factory.{service,path}`                                | root:root 0644      | The driver plane: minimal verified-safe hardening, triggered by the spool watch                                                                                                                                                                 |
| `../../scripts/heavy-lease.mjs` + `../../scripts/lib/heavy-lease.mjs` (repo files; installed by the `lease` phase) | `/usr/local/libexec/factory-ci/heavy-lease.mjs` + `…/lib/heavy-lease.mjs`             | root:root 0755/0644 | Trusted host heavy-test lease CLI (issue #280): `factory-validate-inner` acquires through this root-owned copy, never PR-controlled checkout code                                                                                               |
| `factory-driver-sweep.timer`                                                                                       | `/etc/systemd/system/lemcentre-factory-sweep.timer`                                   | root:root 0644      | Safety-net sweep (issue #283): re-arms the driver plane after failure/reboot without needing a new spool write; enabled by `provision.sh recovery`                                                                                              |
| `lemcentre-awake.service`                                                                                          | `/etc/systemd/system/lemcentre-awake.service`                                         | root:root 0644      | OPTIONAL idle-only inhibitor (issue #283); installed but deliberately NOT enabled — never blocks shutdown/suspend                                                                                                                               |
| `recovery-constants.json`                                                                                          | (not installed)                                                                       | —                   | The recovery timing pairing record: stale sweep + timer + accuracy ≤ wrapper deadline − poll (asserted by `verify-recovery.sh` and the lemfleet drill)                                                                                          |
| `lemfleet-rev`                                                                                                     | `/usr/local/libexec/factory-ci/lemfleet-rev`                                          | root:root 0644      | The enforced, reviewed lemfleet revision                                                                                                                                                                                                        |
| `lemcentre-runner.service`                                                                                         | `/etc/systemd/system/lemcentre-runner.service`                                        | root:root 0644      | Hardened system unit for the runner                                                                                                                                                                                                             |
| `browser-guest/environment-pin.json`                                                                               | (not installed)                                                                       | —                   | The frozen browser-ready-guest environment identity (issue #278); provisioning must satisfy it, receipts must reproduce it                                                                                                                      |
| `browser-guest/verify-environment-receipt.py`                                                                      | (executed by the smoke workflow)                                                      | —                   | Read-only checker: refuses a smoke run against a guest whose receipt diverges from the pin or the enforced lemfleet revision                                                                                                                    |
| `browser-guest/verify-diagnostics-bundle.py`                                                                       | (executed by the diagnostics workflow)                                                | —                   | Read-only checker (#279): verifies a staged guest diagnostics bundle against the bounded-transport contract before upload; refuses adversarial archives (traversal, symlinks, oversize, digest lies)                                            |
| `provision.sh`                                                                                                     | (not installed)                                                                       | —                   | Phased root provisioning (`launcher`, `lease`, `account`, `recovery`)                                                                                                                                                                           |
| `verify-recovery.sh`                                                                                               | (executed as root)                                                                    | —                   | Read-only post-reboot/desired-state check (issue #283): units, trusted plane, spool, GitHub registration, constants invariant                                                                                                                   |
| `verify-enforcement.mjs`                                                                                           | (executed as any user with gh)                                                        | —                   | Read-only BOTH-layer enforcement verifier (issue #283): classic protection + rulesets + check→producer mapping; `--expect-linux` post-cutover                                                                                                   |
| `boundary-probe.sh`                                                                                                | `/usr/local/libexec/factory-ci/boundary-probe.sh`                                     | root:root 0755      | Hostile probe; the workflow runs the reviewed checkout copy, verification runs the installed copy                                                                                                                                               |
| `verify-boundary.sh`                                                                                               | (executed as root)                                                                    | —                   | Full boundary invariant check + JSON receipt                                                                                                                                                                                                    |
| (lease phase artifacts)                                                                                            | `/run/lem-heavy-lease` (2775 root:lem-heavy) + `/etc/tmpfiles.d/lem-heavy-lease.conf` | root + shared group | The host-owned shared heavy-test lease dir (issue #280); tmpfiles.d recreates it every boot — see [docs/specs/lemcentre-host-lease.md](../../docs/specs/lemcentre-host-lease.md)                                                                |

## Layout after provisioning

- Runner account: `lemci` (system user, `nologin`, locked password, not in
  `wheel`), state under `/var/lib/lem-ci/` (runner, work folder, factory
  scratch). `/home` is unreachable to it at the kernel layer
  (`ProtectHome=true`), not merely by permissions.
- Trusted artifacts, all root-owned outside the runner's write path:
  wrapper + pin + inner wrapper + driver consumer
  (`/usr/local/libexec/factory-ci/`), lemfleet harness checkout
  (`/opt/factory/lemfleet`, detached at the pin), Node 22.23.4
  runtime (`/opt/factory/node`, GPG-verified download, same procedure as
  lemfleet's `acquire.py`).
- **Driver plane**: the guest/harness never runs inside the hardened
  runner unit — this systemd build's sandbox properties break the
  harness's reviewed bwrap sandbox (deterministically reproduced during
  #277; see the boundary spec). The wrapper enqueues a validated envelope
  into `/var/lib/lem-ci/factory-jobs` and waits; `lemcentre-factory.path`
  triggers `lemcentre-factory.service` (as `lemci`, with the largest
  verified-safe property set {NoNewPrivileges, ProtectHome, PrivateTmp}),
  which runs only the pinned harness with fail-closed envelope validation
  and returns the verdict through the spool. Serial by construction;
  overflow fails closed immediately (red verdict, exit 3), never silently
  drops.
- The factory scratch (payload sets, evidence, `last-run.log`) moved from
  `/home/lem/.factory-ci` to `/var/lib/lem-ci/factory-ci`; retention rules
  are unchanged (lemfleet `ci_validate.py` prunes it).

## Browser-ready guest (issue #278; provisioning pending lemfleet#21)

Migration sequence step 1 (environment proof) adds a browser-ready lane
next to the unit-validation path. The contract lives in
[docs/specs/lemcentre-browser-guest.md](../../docs/specs/lemcentre-browser-guest.md):
a frozen environment pin (`browser-guest/environment-pin.json`), a
root-owned receipt provisioning must emit
(`/usr/local/libexec/factory-ci/browser-guest-env.json`), a read-only
receipt verifier, the three-engine smoke spec, and the dispatch-only
`browser-guest-smoke` workflow (never a required check; visibly red via
exit 33 until provisioning lands). The trusted seam lemfleet#21 installs
is `/usr/local/libexec/factory-ci/browser-smoke` — same wrapper trust
shape as `factory-validate`, pin re-checked per run. Guest profile:
native Ubuntu 24.04 VM (no nested container runtime), 6 vCPU / 12 GiB,
NIC `none`, no host mounts, no Docker socket.

## Browser diagnostics transport (issue #279; launcher provisioning pending lemfleet#22/#21)

Migration sequence step 2's artifact half: a bounded, fail-closed channel
for per-engine reports, traces and screenshots from a deliberately
failing browser test inside the guest. The contract lives in
[docs/specs/lemcentre-browser-diagnostics.md](../../docs/specs/lemcentre-browser-diagnostics.md):
the lemfleet packer/streamer (proof/f4a, lemfleet#22), the optional spool
sidecar validated by the updated `driver-process`/
`factory-validate`/`factory-validate-inner` above, the upload verifier
(`browser-guest/verify-diagnostics-bundle.py`, exercised by
`tests/unit/guest-diagnostics-bundle.test.ts`), and the dispatch-only
`browser-guest-diagnostics` workflow (exit 34, "not provisioned", until
the trusted launcher `/usr/local/libexec/factory-ci/browser-diagnostics`
is installed). The verdict envelope stays `{"exit": N}`; nothing is
extracted on the host.

**Deployment order (owner-gated):** the updated wrappers call the pinned
harness's `proof/f4a/envelope.py` and pass `--diagnostics`, so the
lemfleet pin must move to ≥ the lemfleet#22 revision **before** these
wrapper copies are provisioned — until then the installed (Nov 10)
wrappers keep working unchanged, because every extension here is
backward compatible (absent flag, absent sidecar, absent sidecar
handling). The stale-claim bound in `driver-process` changes 7200 s →
4500 s — #283 tightened this ticket's interim 5580 s pairing so the sweep
lands inside the wrapper's wait (`recovery-constants.json` records the
invariant; reasoning in the wrapper and lemfleet ADR-0013).

## Provisioning (owner, sudo required)

Run in a quiet window — no in-flight `factory-validation` job
(`pgrep -f Runner.Worker` must be empty; `provision.sh` refuses otherwise).

```bash
cd <lem-reader checkout at the reviewed revision>
sudo bash ops/lemcentre-runner/provision.sh launcher   # no service touched
sudo bash ops/lemcentre-runner/provision.sh lease      # shared host lease dir + tool
# ... push/merge the boundary PR; its gate still runs on the old runner ...
sudo bash ops/lemcentre-runner/provision.sh account    # brief interruption
sudo bash ops/lemcentre-runner/verify-boundary.sh --receipt /tmp/boundary-receipt.json
```

`launcher` installs the trusted control plane without touching the running
desktop-user runner, so in-flight PRs keep working (old wrapper path still
present). `lease` (issue #280) creates the `lem-heavy` shared group (members:
`lemci`, `lem`), the tmpfiles.d-backed `/run/lem-heavy-lease` directory (2775
root:lem-heavy), and installs the root-owned lease CLI (`heavy-lease.mjs` +
`lib/heavy-lease.mjs`) into the control plane; it interrupts nothing — group
membership applies to new processes (the next factory job, new desktop
sessions). Contract and rollback: [docs/specs/lemcentre-host-lease.md](../../docs/specs/lemcentre-host-lease.md). `account` stops the desktop-user unit, moves the runner
registration (`.runner`/`.credentials` are file-based; the runner keeps its
identity and labels — `lemcentre`, `[self-hosted, lemcentre]` — so workflow
routing is unchanged), installs the hardened system unit and waits for the
runner to report online. The old runner directory is preserved at
`/home/lem/.factory-ci/runner.migrated-277` for rollback.

## Enforced trusted revision and update procedure

The pin (`lemfleet-rev`) currently records lemfleet
`3c8682b732002b85ba126a2408ee9acb374df2a0` (lemfleet#12, F5 — the revision
that took over `factory-validation`, lemfleet ADR-0012). **A clean checkout is not a
pin**: the wrapper compares the harness checkout's HEAD against the pin
file on every run and refuses mismatches (exit 4), so an outdated, advanced
or locally modified checkout cannot silently produce check runs.

To move the pin (owner; explicit review of the lemfleet diff required):

1. Review the lemfleet change (the harness code executes inside the guest
   launch path). Coordinate with the companion ticket (lemfleet#20).
2. Record the new SHA in `ops/lemcentre-runner/lemfleet-rev` in a lem-reader
   PR — the same reviewed PR is the provenance record.
3. Merge, then on lemcentre re-run `provision.sh launcher` from the merged
   checkout (it fetches `/opt/factory/lemfleet`, checks out the new pin,
   reinstalls wrapper + pin and re-verifies).
4. Re-run `verify-boundary.sh` and dispatch the `boundary-probe` workflow.

The runner software itself (`/var/lib/lem-ci/runner`) auto-updates from
actions/runner releases; ownership of that update is upstream (GitHub),
accepted in the threat model. The wrapper/pin/checkout/node set is exactly
what this repo reviews — nothing else feeds the guest-launch path.

## Unattended operation and recovery (issue #283)

The plane is designed to come back by itself — no desktop login, no
operator — and to fail visibly (never silently) when it cannot:

- **Post-reboot start**: `lemcentre-runner.service` (multi-user.target,
  enabled) and `lemcentre-factory.path` (enabled) start unattended;
  `lemcentre-factory-sweep.timer` (timers.target, enabled) picks up spool
  work that survived the shutdown within 5 minutes of boot (inotify is
  not persistent, so the pre-boot path event cannot re-fire).
- **Runner self-heal**: `Restart=always` + `RestartSec=10`. A crashed
  runner kills its job's cgroup (wrapper included) — that job's check
  fails on GitHub and is re-run; the driver plane still completes its
  envelope and the orphaned `.result` is flagged by `verify-recovery.sh`.
- **Driver-plane re-arm**: the spool watch is edge-triggered
  (`PathModified`), so a failed driver start with pending envelopes, or a
  stale `<id>.running` claim, would otherwise wait for a NEW spool write.
  `factory-driver-sweep.timer` re-runs the same static oneshot every 15
  minutes of inactivity (and 5 minutes after boot): pending envelopes are
  consumed, stale claims are swept. Because it targets the same unit as
  the path watch, systemd's single-flight start keeps execution serial.
  With the fixed `driver-process`, an empty queue is a clean no-op
  (exit 0) — the legacy installed copy's exit-2 noise is gone (deploy via
  `provision.sh launcher`; see `docs/specs/lemcentre-runner-boundary.md`
  and the #283 verification record).
- **Constants pairing** (`recovery-constants.json`):
  `STALE_SECONDS(4500) + sweep(900) + accuracy(60) ≤
DEADLINE_SECONDS(5580) − POLL_SECONDS(10)` — a mid-job crash is swept
  to its fail-closed verdict (exit 3) while the waiting wrapper is still
  polling, instead of the wrapper timing out (exit 5) and the claim
  lingering. `verify-recovery.sh` re-checks this from the INSTALLED
  artifacts; lemfleet's `controller/factory_recovery_drill.py` re-checks
  it from these sources (#279/#280 must keep it satisfied if they adjust
  the job time bounds).
- **Awake on mains**: lemcentre has no battery (empty
  `/sys/class/power_supply`) — "on mains power" is vacuously true, and
  power loss recovery IS the unattended start above. `logind` is at
  defaults (`IdleAction=ignore`), so nothing idles the machine to sleep
  today. The OPTIONAL `lemcentre-awake.service` adds defense-in-depth for
  the day that changes: it holds `systemd-inhibit --what=idle --mode=block`
  only — deliberate `poweroff`/`reboot`/`suspend` are NEVER blocked — and
  its lifetime follows the runner unit (`PartOf`), so maintenance stops
  release it. Enable deliberately:
  `sudo systemctl enable --now lemcentre-awake.service`.
- **Desired-state check**: `sudo bash ops/lemcentre-runner/
verify-recovery.sh` (read-only; units, pin/harness/Node, spool,
  runner-idle via gh api, constants invariant) — exit 0 is the
  post-reboot receipt. Its GitHub-side counterpart `verify-enforcement.mjs`
  verifies BOTH enforcement layers (classic protection + rulesets) and
  each required check's producing workflow/runner.
- **Unavailability policy**: with the runner down, required checks pend or
  fail — nothing reroutes to the laptop and nothing edits enforcement.
  Recovery is repair or the manual rollback runbook.

## Verification and evidence

- Host-side: `sudo bash ops/lemcentre-runner/verify-boundary.sh
--receipt <path>` — every static invariant plus the hostile probe run as
  `lemci`; nonzero exit on any divergence; JSON receipt for the evidence
  record.
- Workflow-side: dispatch the **`boundary-probe`** workflow (owner-only,
  `workflow_dispatch` on `main`). It is evidence, not a required check;
  its summary table is the PR-controlled-code demonstration.
- Re-run both after: any pin update, any runner auto-update major bump,
  any unit change, and before each migration acceptance step
  (docs/specs/lemcentre-ci-migration.md sequence).

## Rollback (explicit decision required — no automatic fallback)

Full runbook with preflight, enforcement-layer repair commands and
post-rollback verification:
[docs/specs/lemcentre-runner-rollback.md](../../docs/specs/lemcentre-runner-rollback.md).
Rolling back restores the lemfleet ADR-0012 arrangement (desktop-user
runner, accepted exposure); it is a deliberate owner decision, never
automatic:

```bash
# 1. stop the confined system unit and the driver plane (incl. the #283
#    sweep timer; the optional inhibitor too, if enabled)
sudo systemctl disable --now lemcentre-runner.service lemcentre-factory.path lemcentre-factory-sweep.timer
sudo systemctl stop lemcentre-factory.service
sudo systemctl disable --now lemcentre-awake.service 2>/dev/null || true
# 2. restore the desktop-user runner (registration was preserved)
sudo mv /home/lem/.factory-ci/runner.migrated-277 /home/lem/.factory-ci/runner
sudo chown -R lem:lem /home/lem/.factory-ci/runner
runuser -u lem -- env XDG_RUNTIME_DIR=/run/user/1000 \
  systemctl --user enable --now lemcentre-runner.service
# 3. revert the workflow wrapper path (factory-validation.yml) to
#    /home/lem/.factory-ci/bin/factory-validate, or leave the boundary PR
#    reverted; in-flight PRs need a factory-validation re-run.
```

Enforcement layers are NOT changed by rollback (required checks stay
`checks` + `e2e-reference` + `factory-validation` classic, `checks` +
`e2e-reference` ruleset); the runbook's phase C carries the exact repair
commands if an incident actually altered them, and phase E verifies with
`verify-enforcement.mjs` + a canary PR.

The trusted launcher (`/usr/local/libexec/factory-ci`, `/opt/factory`) is
inert once no workflow references it; remove with
`rm -rf /usr/local/libexec/factory-ci /opt/factory` if a full uninstall is
wanted. Runner unavailability of either shape leaves required checks
pending or failed — never bypassed (no laptop fallback; migration plan
failure policy).

## Historical note

`/home/lem/.factory-ci/bin/factory-validate` (lemfleet#12, F5) remains on
disk but is inert after cutover: the workflow calls the root-owned wrapper,
which now lives outside the desktop home. It is a decommission candidate
once the migration's acceptance evidence is approved.
