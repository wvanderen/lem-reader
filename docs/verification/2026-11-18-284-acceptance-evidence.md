# Migration acceptance evidence — issue #284 (spec #305, steps 4–5)

> **Status: TEMPLATE — NO EVIDENCE COLLECTED.** This is the presentation record
> `acceptance-collect.mjs` emits; nothing in it is evidence of anything except
> the protocol. Every value is an explicit UNCOLLECTED placeholder until the
> owner-gated acceptance sequence runs (`ops/lemcentre-runner/acceptance-checklist.md`).
> **Closing ticket #284 is NOT acceptance** — see `docs/specs/lemcentre-acceptance.md`.

## 1. Freeze identity (the candidate revision and its immutable identities)

| item                                      | value                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| repository                                | wvanderen/lem-reader                                                            |
| candidate SHA                             | **UNCOLLECTED — the candidate SHA argument was not resolved**                   |
| candidate tree                            | **UNCOLLECTED — candidate tree not resolved**                                   |
| environment pin (recorded at candidate)   | **UNCOLLECTED — the recorded environment pin at the candidate SHA**             |
| enforced lemfleet revision (at candidate) | **UNCOLLECTED — lemfleet-rev at the candidate SHA**                             |
| budget identity                           | **UNCOLLECTED — budget identity (git blob at the candidate SHA)**               |
| calibration identity                      | **UNCOLLECTED — calibration identity (git blob at the candidate SHA)**          |
| contention-threshold identity             | **UNCOLLECTED — contention-threshold identity (git blob at the candidate SHA)** |

Any change to the pin, the baselines or the threshold is a profile change:
it requires explicit owner approval and **restarts the acceptance sequence**
([lemcentre-ci-migration.md](../specs/lemcentre-ci-migration.md) §Browser contracts and performance).

## 2. Three consecutive full PR-suite runs (the candidate SHA)

Rule (as implemented by `acceptance-collect.mjs`): per check, the ordered
timeline of FULL suite executions on the candidate SHA — every check run
expanded with its workflow-run attempts, so re-run attempts are never
masked — must end in three consecutive `success` conclusions. Anything
else (failure, cancelled, timed_out, not-yet-concluded) interrupts the
window. Entries before the window are history, disclosed below.

### e2e-reference — Mac lem-reference (AUTHORITATIVE producer) (ci.yml)

**Verdict: NOT SATISFIED (0/3, shortfall 3)**

**UNCOLLECTED — no e2e-reference executions are recorded on the candidate SHA**

- no recorded executions of this check on the candidate SHA (needs 3 consecutive successes)

### e2e-linux-shadow — Lemcentre browser guest (shadow producer) (e2e-linux-shadow.yml)

**Verdict: NOT SATISFIED (0/3, shortfall 3)**

**UNCOLLECTED — no e2e-linux-shadow executions are recorded on the candidate SHA**

- no recorded executions of this check on the candidate SHA (needs 3 consecutive successes)

## 3. Nightly-equivalent run (the `nightly` ref)

Revision identity: **UNCOLLECTED — the nightly ref was not validated against the candidate**

Run: **UNCOLLECTED — no nightly-linux-shadow check run on the nightly ref**

**Acceptance grade: uncollected**

- no nightly-linux-shadow check run on the nightly ref — the lane has not run on this revision

**UNCOLLECTED — the nightly evidence members were not readable (artifact not fetched)**

## 4. Environment identity (receipts)

The pinned identity files are recorded in §1. The receipt each run actually
verified against the enforced pin is rendered in that run's step summary
(follow the run links in §2/§3): a green lane conclusion entails the
receipt-vs-pin pre-step passed (a mismatch is exit 33, honest red). The
receipt's recorded base-image digest is owner evidence:

<!-- OWNER:receipt:start -->

UNCOLLECTED — attach the guest environment receipt (`/usr/local/libexec/factory-ci/browser-guest-env.json` as read during a counted run) including the exact base-image source + sha256 digest, and the receipt-vs-pin verdict links from each counted run's summary.
<!-- OWNER:receipt:end -->

## 5. Lifecycle / security / coordination / recovery proofs

- boundary-probe run: **UNCOLLECTED — no completed boundary-probe workflow run found by the read-only lookup**
- enforcement verification: run `node ops/lemcentre-runner/verify-enforcement.mjs --json <path>` (pre-cutover mode) and attach the JSON output — its shape is `{when, repo, expectLinux, mode, layers, mapping, findings, passed}` (exit 0 = both enforcement layers hold).
- recovery drill + desired state: `sudo bash ops/lemcentre-runner/verify-recovery.sh` receipt (exit 0) and the lemfleet recovery-drill summary (lemfleet#24).

<!-- OWNER:isolation:start -->

UNCOLLECTED — attach the isolation review for the acceptance runs (workflow/control-plane boundary: `ops/lemcentre-runner/verify-boundary.sh` receipt + the review note; see docs/specs/lemcentre-runner-boundary.md).
<!-- OWNER:isolation:end -->

<!-- OWNER:artifact-safety:start -->

UNCOLLECTED — attach the artifact-safety review (the bounded bundle transport the counted runs used: verified bundles on every counted Linux run + the review note; see docs/specs/lemcentre-browser-diagnostics.md).
<!-- OWNER:artifact-safety:end -->

<!-- OWNER:lease-review:start -->

UNCOLLECTED — attach the lease-coordination review (host-load + lease-owner records from §3 plus the host lease log for the counted window; see docs/specs/lemcentre-host-lease.md).
<!-- OWNER:lease-review:end -->

<!-- OWNER:lifecycle:start -->

UNCOLLECTED — attach the cancellation/timeout/cleanup proof (a deliberately cancelled or timed-out guest run showing visible teardown, no lingering lease or guest; see docs/specs/lemcentre-runner-rollback.md and the #283 record).
<!-- OWNER:lifecycle:end -->

<!-- OWNER:recovery:start -->

UNCOLLECTED — attach the stale-lease recovery + unattended-recovery receipts (verify-recovery.sh exit 0, sweep-timer drill, reboot drill; docs/verification/2026-11-17-283-unattended-recovery.md completion).
<!-- OWNER:recovery:end -->

<!-- OWNER:enforcement:start -->

UNCOLLECTED — paste the verify-enforcement.mjs JSON output (or attach it) showing both enforcement layers hold and no required-check routing changed during acceptance.
<!-- OWNER:enforcement:end -->

## 6. Acceptance decision (OWNER — intentionally blank)

<!-- OWNER:decision:start -->

UNCOLLECTED — the explicit owner decision goes here (requested per docs/specs/lemcentre-acceptance.md: the filled record + that spec). Accepted / not accepted, date, and any conditions. This section is NEVER filled by the collector.
<!-- OWNER:decision:end -->

## 7. Missing items (tool-computed)

| item                      | who       | why                                                                                          |
| ------------------------- | --------- | -------------------------------------------------------------------------------------------- |
| candidate                 | collector | the candidate SHA could not be resolved                                                      |
| identity:pin              | collector | the recorded environment pin at the candidate SHA is uncollected                             |
| identity:lemfleet-rev     | collector | the enforced lemfleet revision at the candidate SHA is uncollected                           |
| identity:budget           | collector | budget identity (git blob of tests/e2e/perf/budget.json) is uncollected                      |
| identity:calibration      | collector | calibration identity (git blob of calibration/fingerprint.json) is uncollected               |
| identity:threshold        | collector | contention-threshold identity (git blob) is uncollected                                      |
| pr-suite:e2e-reference    | collector | no recorded executions of this check on the candidate SHA (needs 3 consecutive successes)    |
| pr-suite:e2e-linux-shadow | collector | no recorded executions of this check on the candidate SHA (needs 3 consecutive successes)    |
| nightly:ref               | collector | the nightly ref was not validated                                                            |
| nightly:run               | collector | no nightly-linux-shadow check run on the nightly ref — the lane has not run on this revision |
| boundary-probe            | collector | no completed boundary-probe workflow run found (read-only lookup)                            |
| owner:receipt             | owner     | guest environment receipt + base-image digest — OWNER section still UNCOLLECTED              |
| owner:isolation           | owner     | isolation review (workflow/control-plane boundary) — OWNER section still UNCOLLECTED         |
| owner:artifact-safety     | owner     | artifact-safety review (bounded bundle transport) — OWNER section still UNCOLLECTED          |
| owner:lease-review        | owner     | lease-coordination review — OWNER section still UNCOLLECTED                                  |
| owner:lifecycle           | owner     | cancellation/timeout/cleanup proof — OWNER section still UNCOLLECTED                         |
| owner:recovery            | owner     | stale-lease + unattended recovery receipts — OWNER section still UNCOLLECTED                 |
| owner:enforcement         | owner     | verify-enforcement.mjs output — OWNER section still UNCOLLECTED                              |
| owner:decision            | owner     | the explicit acceptance decision — OWNER section still UNCOLLECTED                           |

---

Generated by `ops/lemcentre-runner/acceptance-collect.mjs` (read-only).
Contract: `docs/specs/lemcentre-acceptance.md`. Protocol: `ops/lemcentre-runner/acceptance-checklist.md`.
This record is a presentation of evidence, not authority: the Mac stays the
authoritative producer and no required check changes at acceptance time.
