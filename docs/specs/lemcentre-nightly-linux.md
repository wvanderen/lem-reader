# Lemcentre nightly-equivalent Linux lane: the nightly shadow producer

Status: lem-reader integration implemented (issue #282); **the trusted
`browser-nightly` launcher is not deployed** — its source landed with the
lemfleet companion ticket (browser guest provisioning,
[lemfleet#21](https://github.com/wvanderen/lemfleet/issues/21) +
[lemfleet#26](https://github.com/wvanderen/lemfleet/issues/26), same
owner gate as the smoke/diagnostics/suite lanes). Until the owner
provisions it, the lane stays visibly red (exit 33 receipt / exit 34
launcher), exactly like its siblings. Parent plan:
[lemcentre-ci-migration.md](lemcentre-ci-migration.md) §Validation and
cutover sequence **step 4 (acceptance)**; environment prerequisite:
[lemcentre-browser-guest.md](lemcentre-browser-guest.md) (#278); bundle
transport: [lemcentre-browser-diagnostics.md](lemcentre-browser-diagnostics.md)
§Bundle classes (#279 + this issue); lease prerequisite:
[lemcentre-host-lease.md](lemcentre-host-lease.md) (#280); PR-suite
shadow precedent: [lemcentre-linux-shadow.md](lemcentre-linux-shadow.md)
(#281). **Non-authoritative by design**: the Mac (`lem-reference`) stays
the nightly evidence producer until the #285 cutover.

## Purpose

The migration's acceptance step requires **one complete
nightly-equivalent run** — exhaustive three-engine functional coverage,
calibration sampling and performance sampling with unchanged budgets and
three measurement workers — produced on Lemcentre, with host contention
recorded and invalid measurements excluded from acceptance. This lane is
that producer: it runs the nightly measurement chain inside the same
secured, pinned browser guest as the PR shadow gate (#281), exports its
evidence through the reviewed bounded bundle channel (#279, evidence
class), adjudicates contention honestly, and can be compared per-SHA
against the Mac nightly chain. Nothing in this lane gates a merge or
weakens a required check.

## Ref isolation (the dispatch decision)

Nightly conclusions must not attach to main's SHA (#226), and the
comparison tool needs both chains on **one revision**. The lane is
therefore dispatched on the **existing `nightly` ref — the same SHA the
Mac evidence chain spoke on**:

- `nightly.yml` (#226) advances `nightly` to main HEAD **plus one empty
  commit** — a different SHA carrying main's exact tree — and dispatches
  `evidence.yml --ref nightly` against it. The Mac chain's check runs
  (`exhaustive-reference`, `e2e (engine)`) attach to that nightly SHA,
  never main's.
- Dispatching `nightly-linux-shadow.yml --ref nightly` puts the Linux
  lane's check run on the **same SHA**, so
  `compare-nightly-shadow.mjs` compares both chains per-revision with
  zero new infrastructure.
- A dedicated `nightly-linux` ref was rejected: it would require editing
  `nightly.yml` (main-surface churn) to advance a second ref, and
  nothing keeps the two refs on the same SHA — the comparison would
  silently compare different revisions.
- Never main: the job-level `if: github.ref_name != 'main'` guard skips
  an accidental main dispatch (the evidence.yml precedent — skipping
  costs nothing; the honest trigger is `nightly.yml`'s empty commit).

Dispatch form:

```
gh workflow run nightly-linux-shadow.yml --ref nightly
```

## Lane contract

Workflow `.github/workflows/nightly-linux-shadow.yml` —
`workflow_dispatch` only (owner-writable-only by default), producing the
check name **`nightly-linux-shadow`** (distinct from every gate and from
`e2e-reference`/`e2e-linux-shadow` by construction), `runs-on:
[self-hosted, lemcentre]`, job-level `if: github.ref_name != 'main'`,
job-level concurrency `nightly-linux-shadow` with `cancel-in-progress:
false` (a canceled nightly run is lost evidence), `permissions:
contents: read`, outer `timeout-minutes: 360` (a catch-all; the
launcher's own whole-wait deadline bounds the inner path and surfaces
its own visible timeout, exit 5).

The trust shape mirrors the smoke (#278), diagnostics (#279) and PR
shadow (#281) lanes exactly — repository-controlled workflow code runs
only read-only checkers and extractors; ALL repository-controlled test
execution happens inside the disposable offline guest:

1. **Receipt-vs-pin pre-step** (exit 33 until lemfleet#21 provisions the
   guest): `verify-environment-receipt.py` against the recorded
   `environment-pin.json` AND the root-owned enforced
   `/usr/local/libexec/factory-ci/lemfleet-rev`.
2. **Launcher-present pre-step** (exit 34 until the launcher exists):
   `/usr/local/libexec/factory-ci/browser-nightly` must be present and
   executable. Both refusals are honest red.
3. **Launcher invocation** (the frozen contract below).
4. **Evidence-bundle verification**: `verify-diagnostics-bundle.py
--class evidence` — the #282 bundle class of the reviewed #279
   transport (see
   [lemcentre-browser-diagnostics.md](lemcentre-browser-diagnostics.md)
   §Bundle classes for the caps, channel arithmetic and adversarial
   guarantees). The bundle is uploaded as bytes (7-day retention),
   never extracted wholesale on the host.
5. **Member extraction** (the only reviewed host-side reader):
   `extract-bundle-member.py` exports the fixed evidence members (see
   below) into `.guest-reports/` preserving their member paths. A
   cap-dropped member is recorded honestly; two members are contractual
   — a verified bundle without `identity/host-load.json` or
   `verdicts/phases.json` is a launcher contract violation (red).
6. **Contention adjudication**:
   `ops/lemcentre-runner/record-contention.mjs` reads the host-load
   record, applies the committed owner-gated threshold
   (`contention-threshold.json`) and writes the machine-readable verdict
   (`verdicts/contention.json`); the lane annotates the phase verdicts
   with `contentionInvalid` flags as a SEPARATE member
   (`verdicts/phases-contention.json`) before upload — the guest's own
   `verdicts/phases.json` stays byte-faithful — and the comparison tool's
   not-comparable signal).
7. **Uploads**: the verified bundle as `nightly-linux-shadow-evidence`
   and the extracted members as `nightly-linux-shadow-reports` (the
   comparison data source), both 7-day retention.
8. **Summary** (`$GITHUB_STEP_SUMMARY`): the nightly-ref SHA + ref +
   run/attempt, the environment identity (receipt fields + enforced
   lemfleet revision), the per-phase host load with the contention
   verdict, the phase-verdict table (exits, per-engine functional
   exits, contention flags), the per-engine exhaustive results
   (`summarize-e2e.mjs`, the one report reader), and the guest-side
   comparison outputs — or honest "unreachable" notes wherever a member
   was not exported.
9. **Phase-aware conclusion**: see the exit taxonomy.

### Selected evidence members (fixed names)

| Member                                 | Content                                                                                  | Source root in the guest                                    |
| -------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `reports/e2e-exhaustive-<engine>.json` | the per-engine exhaustive JSON report (one per engine)                                   | `.test-reports/` (the JSON reporter's per-engine output)    |
| `comparisons/fingerprint-compare.txt`  | the calibration comparison output (`fingerprint.compare.ts` stdout)                      | the calibrate phase                                         |
| `calibration/merged.json`              | the merged per-engine calibration JSON (the fingerprint set)                             | `.calibration-tmp/` merged as `fingerprint.compare.ts` does |
| `comparisons/budget-compare.txt`       | the performance comparison output (`budget.compare.ts` stdout)                           | the perf phase                                              |
| `perf/measured.json`                   | the measured table (per engine × profile wallClockMs)                                    | `.perf-tmp/`                                                |
| `status/harness-status.json`           | the guest harness status (done/exit)                                                     | the harness                                                 |
| `identity/browser-guest-env.json`      | a copy of the environment receipt (the pre-step's verified anchor)                       | `/usr/local/libexec/factory-ci/browser-guest-env.json`      |
| `identity/host-load.json`              | per-phase host loadavg at lease acquisition + the lease records                          | the launcher (host-side, at each phase's lease)             |
| `verdicts/phases.json`                 | machine-readable phase verdicts (`{phase, exit, engines}` per phase)                     | the launcher, from the guest phases                         |
| `verdicts/phases-contention.json`      | the lane-annotated copy (`contentionInvalid` flags) the comparison/acceptance tools read | the lane's adjudication step (host-side, after extraction)  |

The names are frozen in the fixture builder
(`tests/unit/fixtures/guest-evidence/build.py` — the reproducible source
of the wire format until the lemfleet evidence packer lands, then the
cross-check, exactly like #279), in the verifier's class table, in the
lane's extraction step, and in `compare-nightly-shadow.mjs`'s producer
definitions. The committed fixtures under
`tests/unit/fixtures/contention/` carry the same `identity/host-load.json`
record shape (`{schemaVersion, host, phases: [{phase, at, loadavg,
lease}]}`) the adjudicator validates.

## The frozen launcher contract (implemented by the later lemfleet ticket)

`/usr/local/libexec/factory-ci/browser-nightly <head-sha> <checkout>`
(root-owned 0755, the `factory-validate` trust shape: enforced-pin +
checkout-cleanliness re-check, exit 4 on divergence) runs, inside the
disposable offline guest, with `CI=true` and the pinned **three
measurement workers** (`playwright.measurements.config.ts`'s `workers:
3` — the browser-guest pin freezes `measurementWorkers: 3`):

1. **exhaustive-functional**: `npm run test:e2e` (the exhaustive
   three-engine suite), reporting per engine; the per-engine exits land
   in `verdicts/phases.json`.
2. **calibrate**: `npm run calibrate` (the calibration harness +
   `fingerprint.compare.ts`).
3. **perf**: `npm run perf` (the perf harness + `budget.compare.ts`).

The comparisons run **guest-side against the committed baselines**
(`tests/e2e/perf/budget.json`, `calibration/fingerprint.json`). The
baselines are **read-only in the guest**: regeneration is a FAILURE,
never an update — the guest never writes `budget.json` or
`fingerprint.json`. The launcher acquires the shared host heavy-test
lease **per phase** (owner prefix `browser-nightly/<short-sha>/<phase>`,
matching the Mac chain's per-step lease discipline with a bounded
admission wait), records the host loadavg at each acquisition into
`identity/host-load.json`, and stages the verified evidence bundle
through the #279 channel into `.guest-diagnostics/`.

Spool routing (#282 lane routing): each phase's envelope carries the
`lane: browser-nightly` key; the driver plane validates it fail-closed
against the reviewed lane set and routes it to the pinned browser entry
with exactly the launcher's `--direct` invocation, handing the evidence
bundle pointer to the spool sidecar. Because nightly phases legitimately
run for hours, the driver plane's stale-claim sweep is lane-aware:
nightly claims sweep at their own bound (paired against the launcher's
per-phase wait; `ops/lemcentre-runner/recovery-constants.json` `lanes`),
while every other lane keeps the unit pairing. See
[ops/lemcentre-runner/README.md](../../ops/lemcentre-runner/README.md)
§Lane routing.

Exit codes (frozen):

| Exit | Meaning                                                                                                |
| ---- | ------------------------------------------------------------------------------------------------------ |
| 0    | green: all phases concluded, comparisons passed                                                        |
| 2    | functional phase red (propagated)                                                                      |
| 3    | preparation failure                                                                                    |
| 4    | boundary/pin refusal                                                                                   |
| 5    | whole-wait timeout                                                                                     |
| 6    | shared host heavy-test lease admission refused (infrastructure)                                        |
| 7    | contention-invalidated (emitted by the lane's conclude step, never by the launcher itself)             |
| 8    | budget-or-calibration regression (THE measurement gate, `budget.compare`/`fingerprint.compare` exit 1) |

## Phase-aware conclusion and the exit taxonomy

The conclude step maps the launcher exit to the lane's verdict and names
the failing phase from `verdicts/phases.json` (the summary table carries
the detail):

- **Exit 33 / 34** — never launched (pre-step refusal): honest red until
  provisioning.
- **Exit 0** — green only with a **verified, uploaded evidence bundle**;
  a launcher 0 without its bundle is a contract violation (red, exit 1).
- **Exit 2** — functional red: the nightly verdict for the revision
  (per-engine exits in the summary).
- **Exit 8** — budget-or-calibration regression: THE measurement gate.
  Diagnose first; the baselines are only ever changed by an explicit
  owner-approved budget change that restarts the acceptance sequence
  (see below). **Never auto-rebaseline.**
- **Exit 8 under measured contention** (`measurementInvalid: true`) —
  **reclassified to exit 7**: the measurement phases ran under host load
  over the reviewed threshold, so the regression is an **infrastructure
  failure, not a product regression**; re-run when the host is quiet.
  Baselines are never rebaselined from a contended run.
- **Exit 0 under measured contention** — the verdict stays green
  (nothing failed) but is recorded in the summary and the conclusion as
  **NOT acceptance-grade**: the acceptance sequence needs a quiet-host
  nightly-equivalent run.
- **Exit 6** — lease admission refused: infrastructure, named as such.
- **Exits 3/4/5** — preparation, boundary, timeout: red with their names
  (the #281 wording).

## Contention policy

- The threshold file **`ops/lemcentre-runner/contention-threshold.json`
  is the authority**: `loadavg 1m > 6` on the 12-logical-CPU lemcentre
  host invalidates exactly the **measurement phases**
  (`invalidates: ["calibration", "performance"]`).
  - Source: `docs/agents/test-discipline.md` fixes ~6 as the contended
    line for this host family (the 10-core reference Mac note uses the
    same number; above it expect 2–3x e2e inflation and worse on
    measurements). 6 on 12 logical CPUs is deliberately conservative —
    half the threads; the lease already excludes other CONTROLLED heavy
    work, so a sample over 6 means uncoordinated interactive load the
    lease cannot see.
- **Functional phases record but never invalidate**: pass/fail verdicts
  are facts about the code, not timings.
- `record-contention.mjs` is read-only and fail-closed: a malformed
  record or threshold is exit 1 with findings, never a quiet verdict;
  stdout is always the machine-readable verdict (the conclude step's
  interface). Per-phase results merge across records to the worst
  observed load.
- **Threshold changes are owner decisions**, not PR-tunable constants:
  the number couples measurement acceptance to this host's physical
  capacity. Changing it requires recording the decision here and
  **restarting the acceptance sequence** — evidence from different
  thresholds is never combined (the migration plan's rule for profile
  changes applies to the contention threshold alike).

## Budget identity guarantees

- The committed baselines (`tests/e2e/perf/budget.json`,
  `calibration/fingerprint.json`) are **unchanged** during initial
  validation and read-only in the guest; the guest-side comparison
  scripts adjudicate against them and regeneration is a failure.
- **Exit 8 blocks acceptance** until diagnosed or an explicitly approved
  change lands; there is **no automatic rebaseline** anywhere in the
  lane (`budget.compare.ts`'s intentional-update procedure — edit,
  commit, re-run — remains a reviewed human action, taken by the owner).
- Any proposed budget or resource-profile change requires explicit user
  approval and supporting evidence; an approved change **restarts the
  acceptance sequence**; evidence from different profiles (or
  thresholds) is never combined. (Restating
  [lemcentre-ci-migration.md](lemcentre-ci-migration.md) §Browser
  contracts and performance as the lane-level guarantee.)

## Comparison workflow (identical nightly revisions)

`ops/lemcentre-runner/compare-nightly-shadow.mjs` is the read-only
per-SHA nightly-chain comparison tool (it reuses #281's
`compare-shadow.mjs` machinery and `summarize-e2e.mjs` as the one report
reader):

```
node ops/lemcentre-runner/compare-nightly-shadow.mjs --sha <nightly-sha> [--json <path>]
```

For the given nightly-ref SHA it fetches both chains' check runs (the
Mac `exhaustive-reference` job + the hosted `e2e (engine)` matrix + the
`nightly-linux-shadow` lane), then the Mac exhaustive artifact's
`.test-reports/functional.json` and the lane's
`nightly-linux-shadow-reports` members wherever the artifacts remain
within their 7-day retention, and produces per-engine and
per-measurement tables plus a verdict:

| Verdict          | Exit | Meaning                                                                                                |
| ---------------- | ---- | ------------------------------------------------------------------------------------------------------ |
| match            | 0    | both chains spoke, conclusions agree, and every comparable per-engine / per-measurement verdict agrees |
| diverge          | 1    | conclusions disagree, or a comparable engine or measurement verdict differs                            |
| missing-producer | 2    | a producer's check run is absent for the SHA, or has no comparable verdict (pending/cancelled)         |

- Contention-invalidated measurement phases (`contentionInvalid` in the
  lane's annotated `verdicts/phases-contention.json` — the annotation is
  written as a SEPARATE artifact member; the guest's own
  `verdicts/phases.json` stays byte-faithful) are **not comparable —
  infrastructure notes, never product divergence**.
- Flaky-count differences are notes, never divergence.
- Unreachable artifacts make the tables say so; the verdict rests on the
  check-run conclusions.
- Honest limit: the Mac's exhaustive job speaks with ONE conclusion for
  its functional + calibration + perf phases, so the Mac side of a
  measurement row is that job's conclusion; a Mac failure shows as a
  measurement-row disagreement, which at chain level it is.

Acceptance cadence: the owner archives the comparison output (and
`--json`) in the verification record; investigate every `diverge` with
the uploaded evidence bundle before proceeding. The comparison NEVER
gates a merge.

## Activation (owner-gated) and retirement

The lane ships **dispatch-only**. Scheduled operation is an explicit
owner decision with a mechanical constraint: a plain `schedule:` on this
workflow would dispatch against main and be skipped by the #226 guard.
The activation is therefore an extension of the existing dispatcher —
`nightly.yml`'s `dispatch-evidence` job adds, after its `evidence.yml`
dispatch (with the same 3-attempt/30 s retry shape):

```
gh workflow run nightly-linux-shadow.yml --ref nightly
```

The commented owner-activation block in the workflow records this. To
activate: (1) the lemfleet companion ticket provisions the
`browser-nightly` launcher through the reviewed pin/provision procedure;
(2) the owner confirms the lane's first real dispatches (receipt green,
phases concluded, evidence verified); (3) the owner records the decision
here and lands the dispatcher extension. Rollback is removing the
extension; nothing else changes (the lane was never required).

Retirement happens at the #285 cutover, when the authoritative nightly
chain itself runs on Lemcentre: delete the workflow (or fold it into the
authoritative lane), keep `compare-nightly-shadow.mjs`,
`record-contention.mjs`, `contention-threshold.json`, the fixtures and
this document as the phase's evidence trail, and update this Status line
with the retirement date.
