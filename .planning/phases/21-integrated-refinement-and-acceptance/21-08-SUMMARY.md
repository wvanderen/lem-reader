---
phase: 21-integrated-refinement-and-acceptance
plan: 08
subsystem: testing
tags: [playwright, webkit, e2e, focus-race, toc, dev-server, vite-watcher, acceptance-gate, starvation]

# Dependency graph
requires:
  - phase: 21-integrated-refinement-and-acceptance
    provides: UAT Test 7 gap + webkit-e2e-timeouts-toc-null.md root-cause diagnosis (two failure modes, one environmental trigger)
  - phase: 21-integrated-refinement-and-acceptance
    provides: 21-06 honest-gate ledger discipline + starvation classification protocol (20-07 bounded-workers control)
  - phase: 21-integrated-refinement-and-acceptance
    provides: 21-07 page-turn-focus-handoff regression spec (in-suite) + APPROVED VoiceOver+Safari checkpoint
provides:
  - Hardened openToc (open-focus witness) — the TocPanel open-focus race closed by construction, strengthen-only
  - The green fresh-server honest-gate ledger closing UAT Test 7 (lint 0 + unit 0-failed + e2e 0-failed at --workers=2)
  - Evidence-backed dev-server CPU findings: Vite 8.1.5 default-ignores test-results/**; ~190% accumulation = run-correlated serving, not a runaway watcher
affects: [verify-work ACPT-08 consolidation, future full-matrix honest gates, UAT re-run]

# Tech tracking
tech-stack:
  added: []  # zero new dependencies (T-21-08-SC: no installs)
  patterns:
    - "open-focus witness: one-shot page-side focusin listener armed before the trigger click — synchronizes with the panel's open-focus FIRING, not where activeElement rests"
    - "bounded dev-server CPU investigation: config-source reading + fresh-server idle/run sampling + in-repo-vs-external outputDir A/B + find -newer churn enumeration"
    - "fresh-server gate precondition: empty :5173 guarantees Playwright boots its own server (reuseExistingServer reuses only what exists)"

key-files:
  created: []
  modified:
    - tests/e2e/toc/toc-navigation.spec.ts

key-decisions:
  - "openToc settle witnesses the open-focus FIRING (focusin listener), not activeElement rest — on re-opens after a jump, the previous jump's D4-07 settle-guard tail can pin activeElement on the destination heading (observed 1-in-4 on webkit), which would hang a pure activeElement poll"
  - "No vite.config.ts watch.ignored mitigation: Vite 8.1.5's dev-server chokidar defaults ALREADY ignore **/test-results/** (resolveChokidarOptions, called from _createServer); the A/B experiment shows no measurable outputDir-location cost; the ~190% accumulation is run-correlated serving work on a long-lived server — the fresh-server gate protocol is the mitigation, an unevidenced config change would be speculative"
  - "ACPT-08 deliberately NOT flipped here — owned by verify-work per D13-06/D21-14 (21-06 'both runs zero blocker/major via verify-work' + 21-07 precedent); this plan closes UAT Test 7's automated truth (the green gate) and 21-07 closed the human VoiceOver+Safari half"

patterns-established:
  - "Read the installed framework source before landing config mitigations — Vite's default watcher ignore list settled the CPU hypothesis without touching a byte"

requirements-completed: []  # ACPT-08 flip owned by verify-work (D13-06/D21-14; 21-06/21-07 precedent) — see Decisions

# Metrics
duration: 34min (resumed session, Tasks 2-3) + prior session (Task 1, commits 8b9f145/7040050/a1e569d)
completed: 2026-09-07
status: complete
---

# Phase 21 Plan 08: Fresh-Server Honest Gate + openToc Race Hardening (UAT Test 7 Gap Closure) Summary

**UAT Test 7's truth restored: the full honest gate green in one recorded fresh-server invocation (lint 0 + unit 1605/0/13 + e2e 1733/0/20 at --workers=2) with the TocPanel open-focus race closed by a focusin witness in openToc, and the ~190% dev-server CPU mystery resolved as run-correlated serving — Vite 8.1.5 default-ignores test-results/**, so vite.config.ts stays byte-unchanged.**

## Performance

- **Duration:** 34 min (resumed session: Tasks 2-3 + this SUMMARY; started 2026-09-07T14:20:10Z) + prior executor session (Task 1, interrupted after its commits)
- **Completed:** 2026-09-07T14:53:58Z ( Tasks 2-3)
- **Tasks:** 3/3 complete
- **Files modified:** 1 (tests/e2e/toc/toc-navigation.spec.ts — prior session)

## Accomplishments
- **Task 1 (prior executor, credited):** openToc hardened against the diagnosed open-focus race — strengthen-only (cumulative diff vs the pre-task spec: 0 removed original lines). After two follow-up fixes the settle witnesses the open-focus FIRING via a one-shot page-side focusin listener on `.toc-panel` (armed before the trigger click) rather than where `document.activeElement` rests; all 15 toc-navigation cells green on webkit inside the full gate.
- **Task 2:** stale dev server confirmed gone (PID 1899 no longer existed; port :5173 free) and the ~190% CPU accumulation investigated with config-source + empirical evidence (below). `vite.config.ts` left byte-unchanged per the plan's evidence-gated conditional-artifact rule.
- **Task 3:** the D18/19-VALIDATION honest gate re-run on a FRESH dev server (empty :5173 → Playwright booted its own) — **exit 0 across the full sequence**, including 21-07's regression spec and the hardened toc cells, under a machine load of 13.44 at start. UAT Test 7's success criterion re-established: 1733 passed / 0 failed / 20 skipped = the previous 1715P/16S/7F matrix + 21-07's 15 new cells (11 pass + 4 by-design webkit-strict skips), with all seven previously-failing cells green inside the full matrix and zero assertions weakened.

## Task Commits

1. **Task 1: Harden openToc — await the panel's open-focus settle (strengthen-only)** — `8b9f145` (test) + follow-ups `7040050` (fix: witness the FIRING, not activeElement rest) and `a1e569d` (fix: type the focusin handler as Event) — prior executor session
2. **Task 2: Kill the stale dev server + investigate the ~190% CPU accumulation** — no commit by design: no file changed (the conditional vite.config.ts artifact was NOT triggered; findings recorded in §Dev-server CPU findings below)
3. **Task 3: Fresh-server honest acceptance gate** — no production files (files: []); the ledger IS this SUMMARY (21-06 Task 3 pattern)

**Plan metadata:** (this docs commit)

## Dev-server CPU Findings (Task 2)

**Stale server:** PID 1899 (7h11m CPU over 3h49m ≈190%) no longer existed at session start — port :5173 free, machine up 5d20h (no reboot), process died/was killed sometime after the diagnosis session. The kill precondition was satisfied; recorded honestly rather than re-performed.

**Config-level (source-read, decisive):** Vite 8.1.5's dev-server chokidar setup (`resolveChokidarOptions`, `node_modules/vite/dist/node/chunks/node.js` L13229-13237, invoked from `_createServer` L25787) default-ignores `**/.git/**`, `**/node_modules/**`, **`**/test-results/**`**, the cacheDir, and build outDirs. The plan's leading hypothesis — watcher churn from Playwright's `test-results/` writes — is **refuted at the source level**: `.gitignore` entries are irrelevant to Vite's watcher, and the primary churn dir is ignored regardless of any config we would add.

**Empirical (fresh server, 5s cputime sampler; representative subset = toc + focused-add, webkit):**

| Window | Vite CPU | Rate |
|---|---|---|
| Idle, steady state (300-file test-results/ present) | 1.74s flat over 20s+ | **~0.0%** (0.75% avg incl. boot settle) |
| Run A — in-repo outputDir, incl. 300-file prepopulated wipe storm (40 tests, 29.2s) | +5.2s | ≈17.4% |
| Run B — external `--output` (same 40 tests, 28.4s) | +4.8s | ≈16.0% |

- A−B ≈ 1 percentage point — within single-run noise at ambient load ~4; the outputDir location (and the wipe storm) is not a measurable contributor.
- `find . -newer <marker>` enumerated **zero** watcher-visible in-repo writes during either run outside `test-results/`; no `playwright-report/` is generated (default list reporter); the vite log contains **zero** `page reload`/`hmr update` lines.

**Conclusion (recorded honestly):** the ~190% accumulation is best explained as **cumulative run-correlated serving/transform work** on one long-lived server — the UAT/diagnosis/21-06/21-07 window ran repeated 16.5m full matrices (3 workers × 3 engines + throttled perf) against it, and a single webkit-only 40-cell subset pushes even a fresh server to ~17% (full matrices with cold caches and retries far higher). A fresh server idles at 0% — the runaway-watcher/idle-spin class is ruled out on this stack. **Mitigation = operational, already codified:** the fresh-server gate precondition (D18/19-VALIDATION; enforced again in Task 3) plus the `--workers=2` contention control. Per plan action (d), `vite.config.ts` stays byte-unchanged — an unevidenced `server.watch.ignored` addition would have been speculative config cargo-culting.

## Gate Ledger (Task 3 — the honest record, 21-06 format)

Preconditions at gate start: `:5173` empty (fresh-server guarantee — the first e2e invocation boots its own server); machine load 10.73→13.44 (decaying spike; the 20-07 red-run range) — the `--workers=2` control applied per plan; no re-runs were needed.

| # | Invocation | Exit | Result |
|---|---|---|---|
| 1 | `npm run lint` | **0** | clean |
| 2 | `npm run test:unit -- --run` | **0** | **1605 passed / 0 failed / 13 skipped** (19.6s; the documented intentional unit skip set) |
| 3 | `npm run test:e2e -- --workers=2` (fresh Playwright-booted dev server; started under load 13.44) | **0** | **1733 passed / 0 failed / 20 skipped** across chromium/firefox/webkit + chromium-throttled (24.9m) |

Skip accounting: 20 = 21-06's documented 16 + 21-07's four by-design webkit-strict cells. Cell accounting: 1733+20 = 1753 = the UAT run's 1738 (1715P/16S/7F) + 21-07's 15 — i.e. the six goto-timeout cells and toc (d) are green inside the full matrix, no cells lost, no assertions weakened.

Also recorded (Task 1/2 verification invocations, all exit 0):
- Task 1 (prior session): toc-navigation spec green — re-confirmed this session inside runs A/B (toc cells ✓) and the full gate.
- Task 2 investigation runs A/B: 40 passed each (webkit), plus verify line `test -z "$(lsof -ti :5173)" && npx tsc --noEmit && npx playwright test tests/e2e/toc/restoration-cue.spec.ts` → port free, tsc clean, **27 passed (42.2s)** on a Playwright-booted fresh server.
- Post-gate: Playwright shut its server down (port free, no vite processes).

## Files Created/Modified
- `tests/e2e/toc/toc-navigation.spec.ts` — (prior session) openToc hardened: WHY comment citing the debug-session reproduction + the focusin witness settle; zero removed original lines. `tests/e2e/toc/toc-geometry.spec.ts` byte-untouched (audited: drives no entry.focus()+Enter activation — no race to close). `vite.config.ts` byte-unchanged (evidence-gated artifact not triggered).

## Decisions Made
- Task 1's settle witnesses the open-focus FIRING, not activeElement rest (prior executor; see key-decisions) — the D4-07 settle-guard tail on re-opens would hang a pure activeElement poll ~1-in-4 on webkit.
- No vite.config.ts mitigation (see §Dev-server CPU Findings) — evidence pointed away from the watcher; the fresh-server protocol already covers the stale-server class.
- ACPT-08 stays Pending in REQUIREMENTS.md — flip owned by verify-work (D13-06/D21-14), consistent with 21-06 ("flips ONLY when BOTH runs land zero blocker/major — via verify-work, not in-plan") and 21-07 (instrument-ships-now precedent). This plan's green gate + 21-07's approved human checkpoint are the two halves verify-work consolidates.

## Deviations from Plan

None — plan executed exactly as written. The conditional vite.config.ts artifact correctly resolved to byte-stable (the plan's own action (d) path for refuted evidence), and Tasks 2/3 are ledger tasks by design (21-06 precedent), so the only production commit set is Task 1's.

## Issues Encountered
- The investigation's sample-log epoch markers were clobbered by the sampler's non-append fd offset (two writers, one file) — recovered by reading the CPU trace's unambiguous activity brackets (flat→climb→flat→climb→flat); run boundaries cross-checked against Playwright's reported durations. Cosmetic to the evidence; no re-run needed.
- Task 1's session was interrupted by an API failure after its commits (resumed cleanly this session — commits verified, spec inspected, no redo).

## Known Stubs
None — no placeholder logic shipped; the gate ran against real committed code.

## User Setup Required
None — no external service configuration.

## Next Phase Readiness
- Phase 21 plan 8 of 8 complete: UAT Test 7's truth restored; the honest gate ledger records the green fresh-server sequence.
- ACPT-08's flip (verify-work consolidation of the automated matrix + the approved VoiceOver+Safari checkpoint, and the NVDA+Firefox coverage boundary) is the remaining acceptance action for the milestone.
- Operational guardrail reaffirmed for any future full-matrix gate: fresh server (empty :5173) + `--workers=2` under load; webkit-only moving-tail failures get isolation re-runs before classification.

## Self-Check: PASSED

- Files: tests/e2e/toc/toc-navigation.spec.ts modified per Task 1 ✓ (witness present, cumulative diff 0 removed lines ✓); vite.config.ts byte-unchanged ✓; toc-geometry.spec.ts untouched ✓
- Commits: 8b9f145 ✓ 7040050 ✓ a1e569d ✓ (git log)
- Gate: lint exit 0 ✓; unit 1605/0/13 exit 0 ✓; e2e 1733/0/20 exit 0 ✓ — one recorded fresh-server sequence
- Port :5173 free before and after the gate; no vite processes left running ✓

---
*Phase: 21-integrated-refinement-and-acceptance*
*Completed: 2026-09-07*
