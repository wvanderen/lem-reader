# Reference CI migration to Lemcentre

Status: approved design; implementation and cutover pending.

This document records the user-confirmed migration decisions. It authorizes the design, not a claim that infrastructure has changed or validation has passed. Existing Mac reference instructions remain operational until cutover.

## Goal and scope

Make Lemcentre the sole normal authoritative CI host, independent of the travelling laptop registered as `lem-reference`. Linux becomes the reference platform; this does not provide macOS/Safari evidence. Retain Chromium, Firefox and WebKit coverage, PR gates, nightly exhaustive coverage, calibration and performance evidence.

Lemcentre remains an interactive machine. CI must start unattended after reboot without desktop login, recover services automatically, and remain awake while on mains power, while permitting deliberate shutdown and maintenance. Unavailability leaves required checks pending or failed; it never bypasses enforcement.

## Discovery baseline (reverify before implementation)

- Lemcentre is a Linux/X64 ThinkCentre with a Ryzen 5 PRO 4650G (6 physical cores / 12 logical CPUs) and roughly 30 GiB RAM.
- The existing `factory-validation` workflow invokes `/home/lem/.factory-ci/bin/factory-validate`, backed by the separate lemfleet checkout. Its disposable offline Ubuntu 24.04 guest currently runs unit tests with 2 vCPUs / 4 GiB RAM, not browser or measurement validation.
- Existing guest output is bounded text, not full browser artifact extraction. Factory execution does not currently acquire Lem Reader's host heavy-test lease.
- The runner currently runs as the desktop user. The existing guest protects adopted test execution, but PR-controlled workflow YAML can execute on the host. Guest confinement alone is therefore not a complete host security boundary.
- The wrapper records the clean lemfleet checkout's current commit; it does not enforce a fixed allowlisted commit. Trusted infrastructure provenance must be reviewed during implementation.
- Classic main protection requires `checks`, `e2e-reference` and `factory-validation`; a separate ruleset also requires `checks` and `e2e-reference`. Inspect both layers before cutover.

These are discovery snapshots, not permanent inventory or security guarantees.

## Execution environment and isolation

Extend the disposable Ubuntu VM approach with reproducibly provisioned, pinned Playwright browsers, Ubuntu dependencies, fonts and Node 22. Prefer a browser-ready VM over a container runtime nested inside it.

- App server and browsers communicate over guest loopback.
- Guest execution has no external NIC, host filesystem mounts or host Docker socket.
- Close the PR-workflow path to desktop-account access before authoritative CI moves. Review the runner/control-plane boundary, credential exposure and trusted launcher provenance; a dedicated account alone does not establish the complete boundary.
- Start browser bring-up at **6 vCPUs / 12 GiB RAM**, retaining **three measurement workers**. This is not a claim of dedicated physical cores.
- Freeze the resource profile, image, browser/dependency/font versions and harness revision before acceptance. Record them with evidence.
- Export only explicitly selected, size-bounded artifacts through a reviewed safe mechanism. Preserve per-engine reports, failure traces/screenshots, and calibration/performance evidence. GitHub artifact retention remains seven days; local evidence/cache retention is separate.
  - Implemented for browser diagnostics (issue #279, sequence step 2): the reviewed mechanism is the bounded tar-over-channel transport specified in [lemcentre-browser-diagnostics.md](lemcentre-browser-diagnostics.md) with its lemfleet companion (lemfleet#22) — implemented and unit-tested on both sides; host provisioning (launcher, pin move, wrapper reinstall) is still owner-gated and pending, so no guest evidence exists yet. Calibration/performance artifact export remains open.

Security-boundary implementation and safe artifact transport are implementation prerequisites, not designs claimed complete here.

## Host workload coordination

All controlled Lem Reader heavy work, including factory unit guests, must acquire the same host-owned lease before guest launch. Include preparation-intensive phases. Guest-local leases and GitHub job concurrency are not substitutes for physical-host coordination.

Busy hosts defer admission for a bounded wait and fail visibly when that expires. The concrete mechanism is now specified and tested (issue #280): one host-owned lease at `/run/lem-heavy-lease`, acquired by the trusted `factory-validate-inner` wrapper before payload builds and guest launch, bounded admission wait 600 s with the distinct timeout failures documented in [lemcentre-host-lease.md](lemcentre-host-lease.md) (CLI exit 5; wrapper exit 6). Host deployment of the shared directory remains owner-gated provisioning. Avoid starting competing controlled heavy work during measurements.

Unrelated interactive work is monitored, not forcibly blocked. Capture physical-host load alongside guest evidence; guest load alone is insufficient. Contention-invalidated measurements are infrastructure failures, not product regressions. Cooperative leases do not guarantee an idle desktop. The policy is now concrete for the nightly-equivalent lane (issue #282): the owner-gated `ops/lemcentre-runner/contention-threshold.json` (loadavg 1m > 6 on the 12-logical-CPU host invalidates exactly the measurement phases; functional phases record but never invalidate), adjudicated by `ops/lemcentre-runner/record-contention.mjs` — see [lemcentre-nightly-linux.md](lemcentre-nightly-linux.md) §Contention policy.

## Browser contracts and performance

Linux becomes authoritative without implying Linux WebKit equals macOS WebKit. Investigate known focus-handoff and footnote differences. Resolve them through reviewed platform-correct assertions, preserving user-facing accessibility contracts. No silent engine exclusions, blanket expected failures or weakened assertions to obtain green results.

Keep existing performance budgets unchanged during initial validation. Measure under controlled load. If budgets fail, diagnose first; do not silently rebaseline. Any proposed budget or resource-profile change requires explicit user approval and supporting evidence. An approved profile or budget change restarts the acceptance sequence; do not combine evidence from different profiles.

## Validation and cutover sequence

1. **Environment proof:** demonstrate all three browser engines launch inside the confined guest; record exact versions, resources and trusted infrastructure revision. Integration contract and recorded pin: [lemcentre-browser-guest.md](lemcentre-browser-guest.md) (issue #278; provisioning owned by lemfleet#21).
2. **Boundary and lifecycle proof:** review workflow/control-plane isolation; demonstrate safe artifact extraction, host/guest heavy-work mutual exclusion, bounded admission, cancellation, timeout, guest teardown and stale-lease recovery. Verify unattended startup and recovery. (Artifact transport contract, implemented pending provisioning: [lemcentre-browser-diagnostics.md](lemcentre-browser-diagnostics.md), issue #279/lemfleet#22.) Recovery sources exist (issue #283): `ops/lemcentre-runner/` sweep timer + constants pairing + read-only `verify-recovery.sh`/`verify-enforcement.mjs`, offline drills in lemfleet#24 — deployment and the live reboot/suspend drills are pending the owner gate; the manual rollback runbook is [lemcentre-runner-rollback.md](lemcentre-runner-rollback.md).
3. **Shadow validation:** use a distinct temporary check name while the Mac remains authoritative. Compare old and new producers on identical candidate revisions. Preserve existing discovery/coverage checks and per-engine results. Implemented as the `e2e-linux-shadow` lane with its same-revision comparison tool (issue #281): lane contract, owner-gated activation and retirement protocol in [lemcentre-linux-shadow.md](lemcentre-linux-shadow.md) — dispatch-only and honestly red (exit 33/34) until the guest and launcher are provisioned; never a required check.
4. **Acceptance:** on a fixed candidate revision and frozen profile, obtain **three consecutive successful full PR-suite runs** and **one complete nightly-equivalent run**, including exhaustive three-engine functional coverage and valid calibration/performance evidence with unchanged budgets. Record host contention and exclude invalid measurements from acceptance. Implemented as the `nightly-linux-shadow` lane with its contention adjudicator and nightly-chain comparison tool (issue #282): lane contract, frozen launcher contract, exit taxonomy, budget-identity guarantees and activation/retirement protocol in [lemcentre-nightly-linux.md](lemcentre-nightly-linux.md) — dispatch-only on the existing `nightly` ref (the same SHA as the Mac chain, preserving #226 isolation) and honestly red (exit 33/34) until the launcher is provisioned; never a required check. Contention adjudication: `ops/lemcentre-runner/record-contention.mjs` against the owner-gated `ops/lemcentre-runner/contention-threshold.json` (loadavg 1m > 6 on the 12-CPU host invalidates the measurement phases only; threshold changes restart the acceptance sequence). Producer comparison: `ops/lemcentre-runner/compare-nightly-shadow.mjs` (match/diverge/missing-producer).
5. **Evidence approval:** present the results for acceptance. Failed acceptance blocks cutover pending diagnosis or an explicitly approved change and restarted validation.
6. **Routing:** retain the final required-check name **`e2e-reference`**. Preserve `factory-validation` as the separate unit-validation gate. Verify the final check is produced by the intended Linux guest job, not an old producer with the same name. Verify both protection layers remain effective.
7. **Retirement:** only after accepted evidence and successful routing verification, retire the laptop runner from normal CI. Update operational documentation to describe the actual Linux environment and remove superseded Mac-only instructions.

Preserve nightly isolation: exhaustive/calibration/performance conclusions belong to the separately dispatched `nightly` ref, not main's SHA.

## Failure and rollback policy

Before cutover, keep the Mac available while validating the replacement. Do not weaken required checks to make migration proceed.

After cutover, Lemcentre outages block merges until repaired. There is no automatic fallback to the laptop and no automatic removal of required checks. Preserve and review a manual rollback procedure covering runner availability, workflow routing and both branch-enforcement layers: [lemcentre-runner-rollback.md](lemcentre-runner-rollback.md) (issue #283; verified read-only by `ops/lemcentre-runner/verify-enforcement.mjs`, live rehearsal pending). Returning to the Mac requires an explicit decision; it is not a standing laptop dependency.

## Implementation handoff and evidence record

Implementation spans this repository and the external factory infrastructure. Specify exact image construction, isolation mechanism, lease ownership/access, admission timeout, artifact bounds and rollback commands before their respective validation steps. These details must satisfy the approved requirements above; changes to the requirements return to the user.

Acceptance evidence is **not yet collected**. Attach a verification record with candidate SHA, image/harness identity, VM profile, engine versions, unchanged budget identity, host-load evidence, run links, lifecycle/security proof, protection/routing checks and explicit acceptance/cutover approval. Do not mark migration complete from documentation alone.
