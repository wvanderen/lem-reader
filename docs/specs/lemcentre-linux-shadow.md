# Lemcentre Linux shadow lane: the temporary second PR-browser-gate producer

Status: lem-reader integration implemented (issue #281); guest + launcher
provisioning pending
([wvanderen/lemfleet#21](https://github.com/wvanderen/lemfleet/issues/21),
same owner gate as the smoke/diagnostics lanes). Parent plan:
[lemcentre-ci-migration.md](lemcentre-ci-migration.md) §Validation and
cutover sequence **step 3 (shadow validation)**; environment prerequisite:
[lemcentre-browser-guest.md](lemcentre-browser-guest.md) (#278);
diagnostics transport prerequisite:
[lemcentre-browser-diagnostics.md](lemcentre-browser-diagnostics.md)
(#279); lease prerequisite: [lemcentre-host-lease.md](lemcentre-host-lease.md)
(#280). **Non-authoritative by design**: the Mac (`lem-reference`) stays
the `e2e-reference` producer; nothing in this document is a cutover.

## Purpose

Before the Lemcentre browser guest can become the authoritative
`e2e-reference` producer (#285 cutover), the migration must **compare old
and new producers on identical candidate revisions** — the Mac's
e2e-reference and a Linux guest run of the same PR browser suite — while
preserving existing discovery/coverage checks and per-engine results. That
comparison needs a producer whose check name is **distinct, temporary and
never required**: `e2e-linux-shadow`.

This document is the lane contract: what the shadow lane runs, how it is
activated and dispatched, how same-revision comparisons are produced, the
non-authoritative guarantees, and how the lane is retired at cutover.

## Lane contract

Workflow `.github/workflows/e2e-linux-shadow.yml` — `workflow_dispatch`
only (owner-writable-only by default; see Activation), producing the check
name **`e2e-linux-shadow`** (workflow and job name, distinct from
`e2e-reference` by construction), `runs-on: [self-hosted, lemcentre]`,
job-level `if: github.ref_name != 'main'` (issue #226 dispatch
discipline), job-level concurrency `e2e-linux-shadow` with
`cancel-in-progress: false`, `permissions: contents: read`, outer
`timeout-minutes: 150` (a catch-all; the wrapper's own whole-wait deadline
bounds the inner path and surfaces its own visible timeout).

The lane mirrors the smoke (#278) and diagnostics (#279) lanes' trust
shape exactly — repository-controlled workflow code only runs read-only
checkers and the root-owned launcher:

1. **Receipt-vs-pin pre-step** (exit 33 until lemfleet#21 provisions the
   guest): `verify-environment-receipt.py` against the recorded
   `environment-pin.json` AND the root-owned enforced
   `/usr/local/libexec/factory-ci/lemfleet-rev`, exactly like the smoke
   lane — the enforced pin, not the checkout copy, is the trust anchor.
2. **Launcher-present pre-step** (exit 34 until the launcher exists):
   `/usr/local/libexec/factory-ci/browser-suite` must be present and
   executable. Both refusals are honest red: the lane is never silently
   green.
3. **Launcher invocation**:
   `/usr/local/libexec/factory-ci/browser-suite <head-sha> <checkout-dir>`
   (root-owned 0755, same trust shape as `factory-validate` — enforced pin
   - checkout cleanliness re-check). Inside the disposable offline guest
     the launcher runs the FULL PR browser suite: offline `npm ci`, the
     discovery/coverage-checked suite
     (`playwright test --config=playwright.pr.config.ts`, CI=true, three
     engines), the `scripts/check-e2e-coverage.mjs` discovery gate, and the
     per-engine JSON report (`scripts/summarize-e2e.mjs` reads it; the
     report member is `reports/e2e-pr.json`), with the pinned three
     measurement workers wherever a measurement-adjacent config applies.
     **The launcher acquires the shared host heavy-test lease BEFORE
     launch** (owner prefix `factory-shadow/<short-sha>`; the
     `/run/lem-heavy-lease` mechanism from #280) — admission refusal
     surfaces as launcher **exit 6**, which the workflow names in its
     conclusion as an infrastructure-visible failure, not a product
     regression.
4. **Diagnostics + report staging** (exactly the #279 channel): the
   launcher stages the verified bundle pair under `.guest-diagnostics/`,
   verified by `verify-diagnostics-bundle.py` before upload (7-day
   retention). The suite JSON report travels as the bundle member
   `reports/e2e-pr.json`; `extract-bundle-member.py` (the only reviewed
   host-side reader of bundle bytes — it re-verifies the receipt digest and
   writes exactly one manifest-listed regular member) exports it, it is
   uploaded as its own artifact `e2e-linux-shadow-report`, and
   `scripts/summarize-e2e.mjs` renders the per-engine table into
   `$GITHUB_STEP_SUMMARY`. A cap-dropped or absent report member is
   recorded honestly ("per-engine results unreachable") — never guessed.
5. **Identity recording**: the step summary records the candidate SHA +
   ref + run/attempt and the environment identity (receipt fields + the
   enforced lemfleet revision), so every archived run is self-describing.
6. **Honest conclusion**: green only for launcher exit 0 **and** a
   verified uploaded bundle; any other exit is re-raised verbatim with its
   name — 2 suite red (the shadow verdict), 3 preparation failure, 4
   boundary/pin refusal, 5 wrapper timeout, 6 lease admission refused.

Exit-code summary: **0** green · **non-zero suite exits propagated** ·
**33** browser guest not provisioned · **34** diagnostics transport not
provisioned · **6** lease admission refused (named as infrastructure).

## Activation procedure (owner-gated)

The lane ships **dispatch-only**. The `pull_request:` trigger exists in
the workflow as a commented, marked block that ONLY the owner activates at
shadow-validation start:

1. lemfleet#21 provisions the browser guest + the `browser-suite`
   launcher through the reviewed pin/provision procedure
   ([ops/lemcentre-runner/README.md](../../ops/lemcentre-runner/README.md));
   the pin moves to the provisioning revision.
2. The owner dispatches `e2e-linux-shadow` against the migration's
   candidate revision branch (never main — issue #226) and confirms the
   lane's first real runs (receipt green, suite verdicts, report export).
3. The owner records the activation decision here and uncomments the
   `pull_request:` block — from then on every PR head SHA carries BOTH
   producers' check runs: `e2e-reference` (Mac, required) and
   `e2e-linux-shadow` (guest, informational).
4. Rollback of the activation is uncommenting the block again; nothing
   else changes (the check was never required).

## Comparison workflow (identical candidate revisions)

`ops/lemcentre-runner/compare-shadow.mjs` is the same-revision comparison
tool (read-only `gh api`):

```
node ops/lemcentre-runner/compare-shadow.mjs --sha <sha> [--json <path>]
```

For the given SHA it fetches both producers' check runs (latest attempt
wins), then each side's uploaded JSON report (`playwright-artifacts-reference`
→ `.test-reports/functional.json` for the Mac; `e2e-linux-shadow-report` →
`reports/e2e-pr.json`-exported member for the shadow) wherever the
artifacts remain within their 7-day retention, and produces a per-engine
outcome comparison table plus a verdict:

| Verdict          | Exit | Meaning                                                                                                            |
| ---------------- | ---- | ------------------------------------------------------------------------------------------------------------------ |
| match            | 0    | same suite verdict on both producers, and — where both reports are reachable — the same per-engine unexpected sets |
| diverge          | 1    | conclusions disagree, or a reachable engine fails on one side only / is absent from one report                     |
| missing-producer | 2    | a producer's check run is absent for the SHA, or exists without a comparable suite verdict (pending/cancelled)     |

Flaky-count differences are notes, never divergence (a flaky case
eventually passed — retry evidence). Where a report artifact is
unreachable the table says so and the verdict rests on the check-run
conclusions. `summarize-e2e.mjs` stays the one report reader (issue #254).

Shadow-validation cadence: on each candidate revision of the phase, run
the comparison and archive the output (and `--json`) in the verification
record; investigate every `diverge` with the diagnostics bundle before
proceeding. The comparison NEVER gates a merge.

## Non-authoritative guarantees

- The check name `e2e-linux-shadow` appears in **no** protection layer
  (classic branch protection requires `checks`, `e2e-reference`,
  `factory-validation`; ruleset "main guardrails" requires `checks` +
  `e2e-reference`) and must never be added to either — adding it would
  make the guest a second gate before acceptance, the exact silent
  authority transfer the migration forbids.
- The Mac stays the `e2e-reference` producer until the #285 cutover
  (which itself re-points that one name at the Linux guest job after
  accepted evidence).
- The lane never attaches check runs to main's SHA: dispatch-only today;
  after activation, the job-level `if: github.ref_name != 'main'` guard
  keeps main's check-run surface exactly the gates.
- Divergences are investigation inputs, not merge blockers.

## Teardown and retirement (at cutover)

When the #285 cutover routes `e2e-reference` to the Lemcentre guest job
and evidence is accepted:

1. The owner re-comments (or deletes) the `pull_request:` block — the
   shadow check stops attaching to PRs; in-flight dispatches finish.
2. Delete `.github/workflows/e2e-linux-shadow.yml`; the guest-side suite
   execution lives on unchanged inside the authoritative lane.
3. Keep `compare-shadow.mjs`, `extract-bundle-member.py`, the
   verification records and this document as the phase's evidence trail
   (the comparison tool's Mac-side artifacts expire after 7 days; archived
   `--json` outputs and the verification record preserve the comparisons).
4. Update this document's Status line to record the retirement date, and
   remove the shadow lane from any operational docs that mention it.
