# Migration acceptance protocol (issue #284) — how to RUN and JUDGE sequence steps 4–5

Status: **PROTOCOL ONLY — NO EVIDENCE COLLECTED.** This checklist is
everything the owner needs to run the acceptance sequence once deployment
is approved and to judge its record. The actual collection is owner-gated
(deployment + real guest runs) and nothing in this repository claims,
simulates, or pre-fills it. The presentation contract — what the record
must contain and how acceptance is (and is not) obtained — is
[docs/specs/lemcentre-acceptance.md](../../docs/specs/lemcentre-acceptance.md);
the parent plan is
[docs/specs/lemcentre-ci-migration.md](../../docs/specs/lemcentre-ci-migration.md)
§Validation and cutover sequence steps 4–5.

**Closing ticket #284 is NOT acceptance.** The ticket delivered tooling and
protocol; acceptance is the owner's explicit decision recorded in the
evidence record's decision section, per the presentation contract.

## Non-negotiables (before, during, after)

- The Mac (`lem-reference`) stays the authoritative `e2e-reference`
  producer throughout acceptance; no required check is added, removed or
  re-routed; both enforcement layers stay untouched.
- The lanes stay dispatch-only; every command below is run BY THE OWNER.
  The collector (`acceptance-collect.mjs`) is read-only (`gh api` GETs +
  local git reads) and its only write is the record file.
- Failure blocks acceptance pending diagnosis. Never re-run to mask: the
  collector expands re-run attempts, so a failed attempt is always visible.

## Preconditions (owner-gated, in order)

1. lemfleet#21 has provisioned the browser guest and the trusted
   launchers (`browser-suite`, `browser-nightly`); the enforced pin and
   the receipt pre-steps are green (exit 33/34 refusals are gone).
2. The #283 recovery deployment is done (`provision.sh launcher` +
   `recovery`; `sudo bash ops/lemcentre-runner/verify-recovery.sh` exit 0).
3. The `boundary-probe` workflow has at least one completed run (the
   collector links the latest; dispatch one if none exists — owner only).
4. A quiet host window: no uncoordinated interactive heavy work during
   measurement phases (the lease covers controlled heavy work only).

## Freeze steps (before any counted run)

1. **Choose the candidate SHA.** A branch head with its PR open — never
   main (#226 dispatch discipline). Practical shape: the candidate must be
   the revision whose tree the `nightly` ref will carry after it lands on
   main (a fast-forwardable head, or re-freeze on the merge commit and run
   the whole matrix on THAT SHA — the collector enforces tree identity,
   not ancestry).
2. **Record the freeze identities** (the collector records them
   automatically; verify by hand at freeze time):
   - `git rev-parse <candidate-sha>` (the full SHA)
   - the environment pin at that SHA:
     `git show <sha>:ops/lemcentre-runner/browser-guest/environment-pin.json`
     (guest profile, Node, Playwright, browser builds, fonts, workers)
   - the enforced lemfleet revision: `git show <sha>:ops/lemcentre-runner/lemfleet-rev`
   - **budget identity**: `git rev-parse <sha>:tests/e2e/perf/budget.json`
   - **calibration identity**: `git rev-parse <sha>:calibration/fingerprint.json`
   - **contention-threshold identity**:
     `git rev-parse <sha>:ops/lemcentre-runner/contention-threshold.json`
3. **The live guest must match the frozen pin**: every counted Linux run's
   receipt-vs-pin pre-step must pass (a mismatch is exit 33 — an honest
   refusal that invalidates the run, never a retry-and-hope).
4. Announce the freeze (the record is self-describing; the announcement
   prevents "which SHA were we on" drift).

## Run matrix (on the frozen candidate SHA)

| #   | what                               | how (owner-dispatched)                                                                                                                                                   | counted when                                                    |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| 1–3 | full PR-suite, Linux guest         | `gh workflow run e2e-linux-shadow.yml --ref <candidate-branch>` — three separate dispatches                                                                              | each concludes `success` with a verified bundle                 |
| 1–3 | full PR-suite, Mac (authoritative) | re-run the candidate PR's `ci.yml` workflow run (each attempt is a full fresh suite execution) until three consecutive green on the SAME SHA                             | same rule, attempts expanded                                    |
| 4   | nightly-equivalent, Linux guest    | advance the nightly chain from the merged candidate (`nightly.yml` → `evidence.yml` on the `nightly` ref), then `gh workflow run nightly-linux-shadow.yml --ref nightly` | green, quiet host, verified evidence bundle (see invalid rules) |

Run the same-revision comparisons as you go (informational, never gating):
`node ops/lemcentre-runner/compare-shadow.mjs --sha <sha>` and
`node ops/lemcentre-runner/compare-nightly-shadow.mjs --sha <nightly-sha>`;
archive outputs (`--json`) with the record.

## Invalid measurements and invalid runs (never counted)

- **Exit 7** (contention-invalidated nightly): infrastructure failure —
  re-run on a quiet host; never diagnosed as product regression, never
  rebaselined from.
- **Exit 0 under contention** (`measurementInvalid: true`): green but
  **NOT acceptance-grade** — the sequence still needs a quiet-host
  nightly-equivalent run.
- **Wrong SHA**: a check run whose `head_sha` differs from the candidate,
  or a nightly ref whose tree differs from the candidate's tree.
- **Unfrozen profile**: pin, budget, calibration or threshold identity
  differing from the frozen values at any counted run.
- **Unverifiable evidence**: expired artifacts (7-day retention), missing
  bundle members, unreachable reports — the collector marks these, never
  guesses.
- **Pre-step refusals** (exit 33/34) are failures, not runs: they
  interrupt the consecutive window like any other non-success.

## What "three consecutive" means (operational, as implemented)

Per check (`e2e-reference` AND `e2e-linux-shadow`), on the FIXED candidate
SHA: the ordered timeline of FULL suite executions — every dispatch plus
every re-run attempt, expanded from the attempts API so nothing is masked
— must END in three consecutive `success` conclusions. Anything else
(failure, cancelled, timed_out, not-yet-concluded) interrupts the window.
Executions before the window are history: disclosed in the record, never
counted. So a failed attempt followed by two greens is 2-of-3 (the
failure interrupts), and three greens after one failure is satisfied
(the failure is disclosed history — after diagnosis).

## Collect and judge

1. Collect (read-only, repeatable):
   `node ops/lemcentre-runner/acceptance-collect.mjs --sha <full-sha> [--json <path>]`
   - exit 0: record complete (only possible after every owner section is
     filled too);
   - exit 1: incomplete — the missing list says exactly what (collector
     items = not found in today's state; owner items = your sections);
     the record is still written honestly;
   - exit 4: collection error — treat the record as UNVERIFIED, never as
     passing.
2. Fill the OWNER sections in
   `docs/verification/2026-11-18-284-acceptance-evidence.md` (receipt +
   image digest, isolation / artifact-safety / lease-coordination
   reviews, cancellation/timeout/cleanup proof, recovery + unattended
   receipts, enforcement verification output, and the decision). Re-running
   the collector preserves filled sections verbatim. Before committing the
   filled record, normalize it with `npx prettier --write <record>` —
   `format:check` enforces repo markdown style and the OWNER markers
   survive formatting.
3. Judge per the presentation contract: acceptance is requested by
   presenting the FILLED record plus
   [docs/specs/lemcentre-acceptance.md](../../docs/specs/lemcentre-acceptance.md);
   the decision is the owner's, recorded in the record — never inferred
   from green checks alone.

## Restart rules (recorded here and in the contract)

- Any **approved** profile, budget, calibration-baseline or
  contention-threshold change **restarts the acceptance sequence** from a
  fresh freeze; evidence from different profiles/thresholds is never
  combined.
- Failure blocks acceptance pending diagnosis; an approved change after
  diagnosis is a restart, not a patch-up.
- Routing (step 6) and retirement (step 7) happen only AFTER accepted
  evidence — never inside this sequence.
