---
phase: 06-prototype-acceptance
plan: 05
subsystem: testing
tags: [playwright, e2e, accessibility, acpt-03, edge-conditions, forced-colors, reduced-motion, reflow, touch-targets, wcag-reflow]

# Dependency graph
requires:
  - phase: 06-prototype-acceptance
    provides: the shared D6-09 edge-condition invariant helper (tests/e2e/_edge-invariant.ts → assertEdgeInvariant) shipped by Plan 06-01
  - phase: 04-responsive-pagination-and-dual-mode-navigation
    provides: the [data-block-index] 1:1 block↔element mapping, the M shortcut mode toggle (D4-06), the always-mounted hidden .article-body-measurement (Plan 04-08)
  - phase: 05-durable-highlights-and-notes
    provides: the annotations/_fixtures.ts shared harness (openArticle/wipeDatabase/FIXTURES)
provides:
  - "ACPT-03 closed: all four existing edge specs (forced-colors, reduced-motion, reflow, touch-targets) audited against the shared D6-09 invariant and strengthened to apply assertEdgeInvariant uniformly across the 6-fixture corpus × 3 engines"
  - "Together with Plan 06-01 (NEW gap specs: high-zoom + font-failure), all SIX edge conditions now assert the SAME shared invariant (a)/(b)/(c) — ACPT-03 is complete"
affects: [06-prototype-acceptance, 06-06 (phase verification)]

# Tech tracking
tech-stack:
  added: []  # No new packages — reuses the locked @playwright/test 1.61.1
  patterns:
    - "Uniform invariant application — every ACPT-03 edge spec (NEW 06-01 + audited 06-05) imports assertEdgeInvariant from _edge-invariant.ts and applies it across the 6-fixture corpus; one D6-09 bar everywhere"
    - "Strengthen-only audit (D6-12) — existing per-substrate assertions kept verbatim; the invariant is ADDED alongside, never replacing the focused A11Y-05/06/04/07 checks"
    - "wipeDatabase added to every audited spec's beforeEach — deterministic first-run + image-stub consistency with the shared e2e harness discipline (06-PATTERNS §Shared Patterns); benign to existing CSS/aria/sizing assertions"

key-files:
  created: []
  modified:
    - "tests/e2e/forced-colors.spec.ts — audited: imports + applies assertEdgeInvariant across all 6 fixtures (condition 'forced-colors'); wipeDatabase added to beforeEach; all 4 existing A11Y-05 assertions kept"
    - "tests/e2e/reduced-motion.spec.ts — audited: imports + applies assertEdgeInvariant across all 6 fixtures (condition 'reduced-motion'); wipeDatabase added to beforeEach; all 3 existing A11Y-06 assertions kept"
    - "tests/e2e/reflow.spec.ts — audited: imports + applies assertEdgeInvariant across all 6 fixtures (condition 'reflow-320'); now asserts the COMPLETE invariant (a)/(b)/(c), not just overflow; the existing focused (c) overflow test stays (origin of the clause); wipeDatabase added to beforeEach"
    - "tests/e2e/touch-targets.spec.ts — audited: imports + applies assertEdgeInvariant across all 6 fixtures (condition 'touch-targets'); wipeDatabase beforeEach added; both existing A11Y-07 sizing assertions kept"

key-decisions:
  - "Strengthen-only per D6-12 — every existing assertion (forced-colors underlines/aria-expanded/focus-outlines/checked; reduced-motion transition/animation gates; reflow focused overflow + panel operability; touch-target 44×44 sizing) is preserved verbatim. The invariant is ADDED as a new per-fixture test, never replacing the focused substrate checks."
  - "reflow.spec.ts is the (c) overflow-clause ORIGIN — its body + article-body scrollWidth check was lifted verbatim into _edge-invariant.ts by Plan 06-01. The audit consumes the helper to ALSO assert (a)/(b), so reflow now asserts the COMPLETE invariant. The existing inline (c) test stays authoritative as a direct WCAG 1.4.10 proof (no duplication — the helper owns (c) in the new test)."
  - "wipeDatabase added to every audited spec's beforeEach (Rule 2 strengthening). The existing 4 specs predate the universal harness discipline (06-PATTERNS §Shared Patterns 'every e2e spec'). Adding the image-stub + IndexedDB-wipe makes the specs deterministic-first-run consistent with the 06-01 new specs + the whole annotation/pagination suite. Benign to existing assertions (CSS/aria/sizing are unaffected by DB state or image stubbing)."
  - "Each audited spec iterates all 6 FIXTURES for the invariant test (condition 'forced-colors' / 'reduced-motion' / 'reflow-320' / 'touch-targets'), matching high-zoom.spec.ts's corpus breadth — D6-09 applies the invariant UNIFORMLY across the corpus, not just the FIRST_FIXTURE the existing specs targeted. 6 fixtures × 3 engines = 18 new invariant cells per spec × 4 specs = 72 new cells."
  - "ACPT-03 is CLOSED by this plan. Together with Plan 06-01 (NEW high-zoom + font-failure gap specs), all six edge conditions now assert the same shared invariant. requirements-completed: [ACPT-03] (06-01 carried [] mirroring the 04-02 PAGE-01 split precedent; this plan is the closer)."

patterns-established:
  - "Pattern: the D6-09 audit-and-strengthen flow — import assertEdgeInvariant + the shared harness, add wipeDatabase to beforeEach, add a per-fixture invariant loop INSIDE the existing describe (inheriting the condition's emulateMedia/setViewportSize setup), keep all existing tests verbatim. Applies to any future edge spec added to the matrix."

requirements-completed: [ACPT-03]

# Metrics
duration: 7 min
completed: 2026-08-08
status: complete
---

# Phase 6 Plan 05: ACPT-03 Edge Spec Audit Summary

**All four existing edge specs (forced-colors, reduced-motion, reflow, touch-targets) audited against the shared D6-09 invariant and strengthened to apply assertEdgeInvariant uniformly across the 6-fixture corpus × 3 engines — closing ACPT-03 alongside Plan 06-01's new gap specs.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-08-08T16:30:31Z
- **Completed:** 2026-08-08T16:37:55Z
- **Tasks:** 2
- **Files modified:** 4 (all existing test-tier files; zero production code changed; zero new packages)

## Accomplishments
- Audited and strengthened **forced-colors.spec.ts** (A11Y-05) — the spec previously asserted only link underlines, gear aria-expanded, focus outlines, and radio checked state on a single fixture. It now also asserts the full D6-09 invariant (keyboard-reachable content in both modes + required functions + no overflow) across all 6 fixtures under `forcedColors:"active"`.
- Audited and strengthened **reduced-motion.spec.ts** (A11Y-06) — previously asserted only transition/animation gates. Now also asserts the full invariant across all 6 fixtures under `reducedMotion:"reduce"`, proving the mode toggle is instant + motion-safe and content/functions/no-overflow hold.
- Audited and strengthened **reflow.spec.ts** (A11Y-04) — the (c) overflow-clause ORIGIN. Its body + article-body scrollWidth check was lifted into `_edge-invariant.ts` by Plan 06-01; this audit consumes the helper so reflow now asserts the COMPLETE invariant (a)/(b)/(c), not just overflow, across all 6 fixtures at the 320px WCAG reflow target.
- Audited and strengthened **touch-targets.spec.ts** (A11Y-07) — previously asserted only 44×44px sizing. Now also asserts the full invariant across all 6 fixtures, adding the (a) content-reachable and (c) no-overflow clauses alongside the existing sizing substrate.
- **ACPT-03 is complete.** Together with Plan 06-01 (NEW high-zoom + font-failure gap specs), all SIX edge conditions (high-zoom, font-failure, forced-colors, reduced-motion, reflow, touch-targets) now assert the SAME shared invariant uniformly. No edge condition is left trusting the existing spec as-is (D6-12).

## Task Commits

Each task was committed atomically:

1. **Task 1: Audit forced-colors + reduced-motion specs** — `a1f6499` (test)
2. **Task 2: Audit reflow + touch-targets specs** — `c4dcea1` (test)

**Plan metadata:** *(see final commit below)*

## Files Created/Modified
- `tests/e2e/forced-colors.spec.ts` — Imports `assertEdgeInvariant` + `FIXTURES, wipeDatabase, openArticle`. `wipeDatabase` added to `beforeEach` (after `emulateMedia({forcedColors:"active"})`). New `for (const fixture of FIXTURES)` loop inside the existing describe applies `assertEdgeInvariant(page, {fixture, condition:"forced-colors"})`. All 4 existing A11Y-05 tests kept verbatim.
- `tests/e2e/reduced-motion.spec.ts` — Imports `assertEdgeInvariant` + harness. `wipeDatabase` added to `beforeEach`. New invariant loop (condition `"reduced-motion"`). All 3 existing A11Y-06 tests kept verbatim.
- `tests/e2e/reflow.spec.ts` — Imports `assertEdgeInvariant` + harness. `wipeDatabase` added to `beforeEach`. New invariant loop (condition `"reflow-320"`) asserts the COMPLETE invariant (a)/(b)/(c). The existing focused (c) overflow test + panel-operability test kept verbatim (origin of the (c) clause; no duplication in the new test — the helper owns (c)).
- `tests/e2e/touch-targets.spec.ts` — Imports `assertEdgeInvariant` + harness. `wipeDatabase` `beforeEach` added (the spec previously had none). New invariant loop (condition `"touch-targets"`). Both existing A11Y-07 sizing tests kept verbatim.

## Decisions Made
- **Strengthen-only (D6-12) honored throughout.** No existing assertion was weakened or removed. The invariant is added as a NEW per-fixture test inside each spec's existing describe, inheriting the condition's `emulateMedia`/`setViewportSize` setup. The existing focused substrate checks (underlines, aria-expanded, focus outlines, transition gates, overflow, sizing) remain authoritative for their specific contracts.
- **reflow consumes the helper for (a)/(b); the existing inline (c) stays.** Per the plan: "Avoid double-asserting (c) — call the helper (which includes (c)) rather than duplicating the inline overflow check where the helper already covers it." The new invariant test lets the helper own (c); the existing focused (c) test is the WCAG 1.4.10 direct proof and stays as the clause's origin record.
- **wipeDatabase added to every beforeEach (Rule 2 strengthening).** The existing 4 specs predate the universal harness discipline (06-PATTERNS §Shared Patterns: "Image-stub + IndexedDB-wipe harness (every e2e spec)"). Adding it makes the audited specs deterministic-first-run consistent with the 06-01 new specs + the whole annotation/pagination suite. It is benign to existing CSS/aria/sizing assertions (none depend on DB state or real image loads).
- **All 6 fixtures iterated (not just FIRST_FIXTURE).** D6-09 applies the invariant UNIFORMLY across the corpus. The existing specs targeted only `essay-long-form`; the audit widens to all 6 (matching high-zoom.spec.ts) so acceptance means the same thing across the whole representative corpus.
- **ACPT-03 closed here.** Plan 06-01 carried `requirements-completed: []` (mirroring the 04-02 PAGE-01 split precedent); this plan is the closer — together the two plans deliver all six edge conditions asserting the same invariant.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added wipeDatabase to every audited spec's beforeEach**
- **Found during:** Task 1 (forced-colors + reduced-motion) + Task 2 (reflow + touch-targets)
- **Issue:** The four existing specs predate the universal e2e harness discipline (06-PATTERNS §Shared Patterns: "Image-stub + IndexedDB-wipe harness (every e2e spec)"). They used bare `page.goto(article)` without the image-stub route or IndexedDB wipe. The new invariant tests (and the shared harness `openArticle`/`assertEdgeInvariant` path) expect the deterministic-first-run baseline the rest of the suite relies on; without it, figure loads can race measurement/selection and leftover DB state can make runs non-deterministic.
- **Fix:** Added `await wipeDatabase(page)` to each spec's `beforeEach` (after the existing `emulateMedia`/`setViewportSize`). This registers the 1×1 SVG image-stub route + wipes IndexedDB for a deterministic first run — the same baseline the 06-01 new specs + the annotation/pagination suites use.
- **Files modified:** tests/e2e/forced-colors.spec.ts, tests/e2e/reduced-motion.spec.ts, tests/e2e/reflow.spec.ts, tests/e2e/touch-targets.spec.ts (each beforeEach)
- **Verification:** All existing assertions remain green (CSS/aria/sizing are unaffected by DB state or image stubbing); 132 combined edge-condition tests pass across chromium/firefox/webkit.
- **Committed in:** a1f6499 (forced-colors + reduced-motion), c4dcea1 (reflow + touch-targets)

---

**Total deviations:** 1 auto-fixed (1 missing-critical: harness-baseline consistency)
**Impact on plan:** The auto-fix is a strict strengthening (deterministic-first-run) consistent with the project's established e2e harness discipline and the 06-01 precedent. No scope creep — no existing assertion was changed or removed; only the harness baseline was brought up to the shared standard.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. No new packages installed (reuses the locked `@playwright/test` 1.61.1).

## Next Phase Readiness
- **ACPT-03 is fully closed.** All six edge conditions (high-zoom + font-failure from Plan 06-01; forced-colors + reduced-motion + reflow + touch-targets audited here) now assert the SAME shared D6-09 invariant (a)/(b)/(c) uniformly across the 6-fixture corpus × 3 engines. The "reader loses nothing" bar holds everywhere.
- The full `npm run test` suite green-at-phase-verification is verified by Plan 06-06; this plan modified only existing test files (no production code, no new files) so no regression surface beyond the 4 audited specs was introduced.
- Plan 06-06 (phase verification) is the last plan in Phase 6; it records ACPT-01..04 results in `06-VERIFICATION.md` and runs the manual SR protocol (ACPT-02) + full-suite gate.
- No blockers.

## Self-Check: PASSED

- [x] `tests/e2e/forced-colors.spec.ts` modified + asserts assertEdgeInvariant (FOUND — grep count 2: import + call)
- [x] `tests/e2e/reduced-motion.spec.ts` modified + asserts assertEdgeInvariant (FOUND — grep count 2)
- [x] `tests/e2e/reflow.spec.ts` modified + asserts assertEdgeInvariant (FOUND — grep count 2)
- [x] `tests/e2e/touch-targets.spec.ts` modified + asserts assertEdgeInvariant (FOUND — grep count 2)
- [x] Task 1 commit `a1f6499` exists in git log (FOUND)
- [x] Task 2 commit `c4dcea1` exists in git log (FOUND)
- [x] `npx tsc --noEmit` exits 0 (PASS)
- [x] `npm run test:e2e -- --grep "forced-colors|reduced-motion"` exits 0 chromium/firefox/webkit (PASS — 63 passed)
- [x] `npm run test:e2e -- --grep "reflow|touch-targets"` exits 0 chromium/firefox/webkit (PASS — 69 passed)
- [x] `npm run test:e2e -- --grep "forced-colors|reduced-motion|reflow|touch-targets"` exits 0 chromium/firefox/webkit (PASS — 132 passed)
- [x] No existing assertion removed (strengthen-only per D6-12 — diff inspection confirms additions only, 0 deletions across all 4 files)

---
*Phase: 06-prototype-acceptance*
*Completed: 2026-08-08*
