# Lemcentre migration acceptance: the presentation contract

Status: contract implemented (issue #284) — the harness
(`ops/lemcentre-runner/acceptance-collect.mjs`), the owner protocol
(`ops/lemcentre-runner/acceptance-checklist.md`) and the presentation
record template (`docs/verification/2026-11-18-284-acceptance-evidence.md`,
pinned by unit test to the tool's own render). **No evidence is
collected**: collection is owner-gated (deployment + real guest runs).
Parent plan:
[lemcentre-ci-migration.md](lemcentre-ci-migration.md) §Validation and
cutover sequence **steps 4 (acceptance) and 5 (evidence approval)**;
producer lanes: [lemcentre-linux-shadow.md](lemcentre-linux-shadow.md)
(#281) and [lemcentre-nightly-linux.md](lemcentre-nightly-linux.md)
(#282).

## Purpose

Step 5 of the migration plan says: _present the results for acceptance._
This document is the contract for that presentation: what the evidence
record must contain, how acceptance is requested, and — just as
deliberately — how acceptance is NOT obtained. It exists so that no
amount of green checks, merged documentation or closed tickets can be
mistaken for the owner's acceptance decision.

## The evidence record

The record is `docs/verification/2026-11-18-284-acceptance-evidence.md`,
emitted by the read-only collector from a template; every value the tool
cannot read stays an explicit `UNCOLLECTED` placeholder, and owner-only
sections are `<!-- OWNER:… -->` blocks the collector never fills (and
preserves verbatim across re-runs once filled). The committed file is the
tool's own template render — a presentation scaffold that cannot be
mistaken for collected evidence (its banner says so and a unit test pins
it to the render).

The record must contain, for the fixed candidate revision:

1. **Freeze identity** — candidate SHA (and tree), the recorded
   environment pin at that SHA (guest profile, Node, Playwright, browser
   builds, measurement workers), the enforced lemfleet revision, and the
   git blob identities of the performance budget, the calibration
   fingerprint and the contention threshold. These are the identities
   whose change restarts the sequence.
2. **Three consecutive full PR-suite runs** — for BOTH producers
   (`e2e-reference` on the Mac and `e2e-linux-shadow` on the guest): the
   execution timeline (dispatches + expanded re-run attempts, with run
   links), the three-consecutive adjudication, and per-engine outcomes
   for the counted runs where the uploaded reports remain reachable.
3. **The nightly-equivalent run** — the nightly ref's revision identity
   against the candidate (tree equality), the `nightly-linux-shadow` run
   link and conclusion, per-phase verdicts with contention flags,
   per-engine exhaustive results, the per-phase host-load and lease
   records, the contention verdict, and the acceptance-grade adjudication
   (green-under-contention is NOT acceptance-grade; contention-invalidated
   red is the exit-7 infrastructure shape and invalid).
4. **Environment identity** — the pinned identity files (in §1) plus the
   guest receipt and base-image digest the runs actually verified
   (owner-attached; run summaries carry the receipt-vs-pin verdicts).
5. **Lifecycle / security / coordination / recovery proofs** —
   boundary-probe run link (auto-collected when one exists), the
   enforcement verification output (`verify-enforcement.mjs --json`),
   isolation review, artifact-safety review, lease-coordination review,
   cancellation/timeout/cleanup proof, and stale-lease + unattended
   recovery receipts (owner-attached).
6. **The acceptance decision** — intentionally blank until the owner
   writes it. The collector never fills it; no tool does.
7. **The missing-items list** — tool-computed, distinguishing collector
   items (not found in today's state) from owner items (sections still
   uncollected). The collector exits non-zero while anything is missing.

## Collector guarantees

- **Read-only**: `gh api` GET requests and local git reads only; the
  record file is the only write. It never dispatches workflows, never
  creates check runs, never edits enforcement, never touches the Mac.
- **No fabrication**: a missing item is reported as missing (exit 1 with
  the list); a read failure is exit 4 — the record is UNVERIFIED, never
  passing.
- **No masking**: re-run attempts are expanded from the attempts API, so
  a failed attempt can never hide behind a green re-run of the same
  workflow run.
- **Wrong-SHA exclusion**: check runs must carry the candidate `head_sha`
  and the nightly ref must carry the candidate's exact tree; otherwise
  the evidence is excluded as wrong-SHA, recorded honestly.

## How acceptance is requested

Acceptance is requested by presenting, together: (1) the FILLED record
(every collector item collected, every owner section filled — including
the guest receipt, the reviews, the recovery receipts and the enforcement
verification), and (2) this spec. The owner reads the record against the
checklist's invalid-measurement rules and writes the explicit decision
(accepted / not accepted, date, conditions) into the record's decision
section. The collector exits 0 only when the record is complete in this
sense — which is only ever reachable after the owner acted.

## How acceptance is NOT obtained

- **Documentation alone.** Merged specs, closed tickets (including
  #284 itself), green tooling or the existence of a record file are not
  acceptance; the plan's own handoff section says so.
- **Green on the wrong profile.** Results produced under a different
  pin, budget, calibration baseline, contention threshold or unfrozen
  environment are not acceptance evidence; an approved change restarts
  the sequence rather than combining incompatible results.
- **Partial sequences.** Fewer than three consecutive full PR-suite runs
  on either producer, a missing or contention-invalidated
  nightly-equivalent run, unverifiable artifacts, or any interleaved
  failure left undiagnosed — each blocks acceptance.
- **Silent collection.** Nothing collects evidence outside the owner's
  dispatched runs; the collector observes, it never causes.
- **Authority transfer.** Acceptance does not route checks or retire the
  Mac; routing (step 6) and retirement (step 7) are separate, later,
  explicitly verified steps.
