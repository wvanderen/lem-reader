# Unattended operation + recovery: verification record (issue #283)

Scope: the secured Lemcentre runner/control plane (issue #277, verified
2026-11-10) operated unattended — startup after reboot without desktop
login, automatic recovery after failure, availability on mains power
without blocking deliberate shutdown/maintenance, intended suspend
behavior, and runner unavailability leaving required checks pending/failed
(never bypassed, never laptop fallback) — plus the reviewed manual
rollback procedure. Companion: wvanderen/lemfleet#24 (drills + recovery
ADR). Design sources: `ops/lemcentre-runner/`
(`README.md` #283 section, `recovery-constants.json`,
`factory-driver-sweep.timer`, `lemcentre-awake.service`,
`verify-recovery.sh`, `verify-enforcement.mjs`, `provision.sh recovery`);
rollback runbook: [docs/specs/lemcentre-runner-rollback.md](../specs/lemcentre-runner-rollback.md).

**Status: NOT YET COLLECTED — awaits owner-gated deployment
(`sudo bash ops/lemcentre-runner/provision.sh launcher` re-run with the
fixed driver-process, then `provision.sh recovery`) and the reboot drill.
This ticket's changes are source + drills only; zero live host mutation
was performed.** Every evidence cell below is pending by construction and
must be filled by the owner-gated deployment session before the issue can
close.

## Acceptance criteria → evidence (all pending)

| Criterion (issue #283)                                                                                                              | Evidence (planned; to be collected)                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verify startup after reboot without desktop login and automatic service recovery after failure                                      | Pending: owner reboots lemcentre with no desktop login, then runs `sudo bash ops/lemcentre-runner/verify-recovery.sh` (exit 0 receipt: units enabled/active, pin == harness HEAD, spool empty, runner online via gh api, constants invariant). Automatic recovery receipts: `systemctl show -p NRestarts lemcentre-runner.service` > 0 after a deliberate `Restart=always` exercise, and the sweep timer consuming a staged envelope after a killed driver start. |
| Keep CI available while on mains power, without preventing deliberate shutdown or maintenance; verify intended suspend behavior     | Pending: record that `/sys/class/power_supply` is empty (no battery — "on mains" vacuously true), `logind.conf` remains `[Login]`-only with default `IdleAction=ignore`, optional `lemcentre-awake.service` (idle-only inhibitor) state as deployed, and a deliberate `systemctl poweroff`/`suspend` succeeds with the inhibitor active.                                                                                                                          |
| Runner unavailability leaves required checks pending or failed; no automatic bypass or laptop fallback                              | Pending: with the confined runner stopped, open a canary PR and record `factory-validation` (and post-cutover `e2e-reference`) staying pending/failed on GitHub until restored — no reroute, no protection change. `verify-enforcement.mjs` receipt before/after showing both layers unchanged.                                                                                                                                                                   |
| Document and review a concrete manual rollback procedure covering runner availability, workflow routing and both enforcement layers | Procedure WRITTEN and reviewed in [docs/specs/lemcentre-runner-rollback.md](../specs/lemcentre-runner-rollback.md) (preflight, phases A–E, exact gh api commands, Mac return = explicit owner decision). Live rehearsal receipt: pending (first execution records deltas).                                                                                                                                                                                        |
| Coordinate with external factory infrastructure and record recovery evidence                                                        | lemfleet#24: offline recovery drill (`controller/factory_recovery_drill.py`) receipts + ADR-0013 drafted. LIVE reboot/suspend drills on lemcentre: pending owner gate.                                                                                                                                                                                                                                                                                            |

## Deployment + drill sequence (owner-gated; the collection plan)

1. Quiet window (no in-flight factory-validation; `pgrep -f Runner.Worker`
   empty): `sudo bash ops/lemcentre-runner/provision.sh launcher` —
   installs the fixed driver-process (exit-2 noise gone) with
   STALE_SECONDS=4500.
2. `sudo bash ops/lemcentre-runner/provision.sh recovery` — installs +
   enables `lemcentre-factory-sweep.timer`; installs (does not enable)
   the optional `lemcentre-awake.service`.
3. `sudo bash ops/lemcentre-runner/verify-boundary.sh --receipt <path>`
   (existing #277 invariants still hold) and
   `sudo bash ops/lemcentre-runner/verify-recovery.sh` (new desired-state
   receipt, exit 0).
4. Reboot drill: reboot lemcentre, do NOT log into the desktop, run
   `verify-recovery.sh` again (must be exit 0), then confirm on GitHub
   that a canary PR's `factory-validation` runs green — the unattended
   start proof.
5. Suspend/shutdown drill: with the optional inhibitor enabled (owner
   choice), record that deliberate suspend and shutdown still work; after
   resume/reboot, repeat step 4's verification.
6. Attach all receipts + run links to this record and flip the status
   line above.

## Constants pairing (cross-ticket contract)

`ops/lemcentre-runner/recovery-constants.json`:
`staleSeconds(4500) + sweepTimerSeconds(900) + sweepAccuracySeconds(60)
≤ deadlineSeconds(5580) − pollSeconds(10)` — a crashed claim is swept to
its fail-closed verdict (exit 3) while the waiting wrapper is still
polling, instead of the wrapper expiring first (exit 5) and the claim
lingering for an unrelated spool write. lemfleet's
`controller/factory_recovery_drill.py` re-checks this invariant from
these same sources; #279/#280 must re-satisfy it if they adjust the job
time bounds.
