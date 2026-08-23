---
phase: 10-annotation-review-panel
plan: 06
subsystem: annotations
tags: [playwright, e2e, review-panel, browser-history, axe, forced-colors, reduced-motion, keyboard, accessibility, honest-suite]

# Dependency graph
requires:
  - phase: 10-annotation-review-panel (Plan 10-02)
    provides: the shipped ReviewView surface (row jump button accessible name/structure, filter comboboxes, one-h1 + grouped-ul anatomy asserted by the axe/edge gates)
  - phase: 10-annotation-review-panel (Plan 10-03)
    provides: the deep-link jump machinery (expectFocusedArrival assertion trio) + the two e2e-harness fixes (schema-declaring reload; seed-then-reload) reused in every new seed
  - phase: 10-annotation-review-panel (Plan 10-04)
    provides: the seeded-corpus spec shape + strengthen-only discipline over the 10-03 tests
  - phase: 10-annotation-review-panel (Plan 10-05)
    provides: the sibling-affordance row anatomy the loop tests click around (curation buttons as siblings of the jump button)
  - phase: 09-versioned-export-import (Plan 09-07)
    provides: the honest-suite OUTPUT record format + the webkit load-race de-flake precedent
provides:
  - RECV-01.c closing half — the click-from-row loop (panel row button → focused-mark arrival → browser Back to #/review) in BOTH reading modes × chromium/firefox/webkit (RECV-01 flips Complete)
  - #/review axe case (zero serious/critical WCAG 2.2 AA + heading-order/list guards) on a seeded non-empty panel
  - #/review cases in forced-colors (legibility + operability), reduced-motion (no-animation + operability), panel-keyboard (Tab/focus/Enter/Back reachability) — strengthen-only, zero removed assertions
  - 10-06-OUTPUT.md — the permanent full-suite record (1796 passed / 0 failed / 13 intentional skips, exit 0)
  - The WebKit Tab constraint documented for all future keyboard specs (Playwright's bundled WebKit keeps Safari's form-controls-only sequential focus)
affects: [phase verifier (/gsd-verify-work — two manual-only rows in 10-VALIDATION.md), any future phase touching #/review or Tab-driven e2e]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Engine-honest keyboard subsets (the 09-06 stacked-modal precedent, generalized): when an engine's sequential-focus default makes a literal Tab contract impossible (Playwright WebKit = Safari form-controls-only Tab), assert the engine-true subset via Tab + the universal contract via programmatic focus — never weaken the universal assertions"
    - "Honest-suite gate lineage (04-11 → 09-07 → 10-06): executor runs npm run test in ONE invocation, records BOTH invocation exit codes honestly, de-flakes load-race cells with test.setTimeout(60_000) only, re-runs clean"

key-files:
  created:
    - .planning/phases/10-annotation-review-panel/10-06-OUTPUT.md
  modified:
    - tests/e2e/review-panel/jump-bidirectional.spec.ts
    - tests/e2e/a11y.spec.ts
    - tests/e2e/forced-colors.spec.ts
    - tests/e2e/reduced-motion.spec.ts
    - tests/e2e/panel-keyboard.spec.ts
    - tests/e2e/typography-live-apply.spec.ts

key-decisions:
  - "RECV-01 flips Complete here (the 04-02/09-01 split precedent): the full SC#2 loop is proven through the real UI path — confident row-button click (role + accessible name, a real reader click) pushes the deep link, arrival focuses the mark with the /h/ suffix stripped, page.goBack() returns to the #/review h1 — in BOTH reading modes across all three engines (21/21 cells incl. the five byte-stable 10-03 tests)"
  - "Post-Back assertion is panel OPERABILITY (article filter combobox visible/enabled + the row button programmatically focusable), never origin-row focus — engine-variable, and the manual-only feel check stays in 10-VALIDATION.md; Pitfall 9 honored (Back remounts the panel scrolled to top — the accepted documented limitation, no scroll assertions)"
  - "Playwright's bundled WebKit keeps Safari's sequential-focus default: Tab reaches FORM CONTROLS ONLY (selects/inputs) — buttons and links are not Tab-participants (verified on #/review AND the library route; chromium/firefox walk them normally). The keyboard spec therefore asserts the selects-only Tab subset on webkit + the full Tab walk on chromium/firefox + a programmatic-focus contract and Enter activation on ALL engines — the 09-06 engine-honest precedent, with the constraint documented in the spec for future keyboard work"
  - "The a11y #/review case seeds article + confident highlight + NOTE so axe samples the real row structure (quote + note preview + curation cluster), and waits for the seeded row to render before analyze() — an empty panel would silently weaken the gate"
  - "forced-colors #/review case seeds an orphan row (articleId with no matching article) so the orphan tail + its 'Article missing' badge render under emulation — the badge conveys state as TEXT, and row/badge colors are asserted non-transparent rather than engine-specific values"
  - "Typography READ-02 de-flake (the gate's one stabilization) follows the 09-07 precedent exactly: test.setTimeout(60_000) for a webkit first-fetch starvation under full-suite parallel load, assertions byte-unchanged — no jump-bidirectional stabilization was needed"

patterns-established:
  - "Row-click loop e2e shape: goto #/review → getByRole(/^Go to highlight:/).click() → expectFocusedArrival → goBack → #/review h1 + operability (the template for any future panel-level navigation test)"
  - "Per-spec local review-panel seeding with the 10-03 two-fix discipline (schema-declaring reload + fixture-row-visible signal), reusing _portability.ts helpers wholesale — no forked seeding"

requirements-completed: [RECV-01]

# Metrics
duration: 25 min
completed: 2026-08-16
status: complete
---

# Phase 10 Plan 06: Bidirectional Loop + a11y/Edge Gates + Honest Full-Suite Gate Summary

**RECV-01 closed end-to-end: the panel-row click loop (row button → focused mark → browser Back to #/review) proven in both reading modes × 3 engines, #/review held to the axe/forced-colors/reduced-motion/keyboard bars with zero removed assertions, and the full suite green in one honest invocation (1796/0/13, exit 0, 10-06-OUTPUT.md record)**

## Performance

- **Duration:** 25 min
- **Started:** 2026-08-16T01:35:41Z
- **Completed:** 2026-08-16T02:01:06Z
- **Tasks:** 3
- **Files modified:** 7 (5 e2e specs strengthened + 1 e2e spec de-flaked + 1 planning record created)

## Accomplishments

- `tests/e2e/review-panel/jump-bidirectional.spec.ts` — two loop tests appended (strengthen-only; the five 10-03 tests byte-stable): paginated + scrolling row-click loops driving the jump from the confident row's button itself (role + accessible name — the assertion 10-03 could not make), asserting focused arrival + stripped URL, then `page.goBack()` back to the #/review h1 with panel operability (filter combobox + row button) — never origin-row focus (engine-variable; manual-only feel check in 10-VALIDATION.md). 21/21 cells green.
- `tests/e2e/a11y.spec.ts` — the #/review axe case on a seeded non-empty panel (article + confident highlight + note): zero serious/critical WCAG 2.2 AA violations with the Pitfall-8 heading-order + list guards, cloned from the fixture-list case's filter shape.
- `tests/e2e/forced-colors.spec.ts` — #/review under emulation: matchMedia confirms forced-colors active; quote/note-preview/badge keep non-transparent forced colors; the orphan badge conveys state as text ("Article missing"); the confident row's jump click still opens the article.
- `tests/e2e/reduced-motion.spec.ts` — #/review renders + operates under reduce: no element declares an animation name (the spec's own whole-tree idiom), and the row jump click works.
- `tests/e2e/panel-keyboard.spec.ts` — #/review keyboard reachability: Tab reaches article → confidence → sort → row jump button in order (chromium/firefox), the selects-only subset on webkit (Safari form-controls-only Tab default — verified engine-global, documented in the spec), a programmatic-focus contract over all four controls + Enter activation + Back return on ALL engines.
- `npm run test` — ONE invocation, exit 0: unit 871/0/7 + e2e 925/0/6 across chromium/firefox/webkit + the throttled perf cell = **1796 passed / 0 failed / 13 intentional skips** (exactly the 09-07 baseline set; no new skips). Run 1's single webkit load-race failure (typography READ-02) recorded honestly, de-flaked per the 09-07 precedent, re-run clean. `10-06-OUTPUT.md` is the permanent record.

## Task Commits

Each task was committed atomically:

1. **Task 1: Bidirectional loop from the panel row (both reading modes)** — `350df56` (test)
2. **Task 2: a11y gate on #/review + edge-spec route coverage (strengthen-only)** — `77b14f6` (test)
3. **Task 3: Honest full-suite phase gate + OUTPUT record** — `3d2b650` (test, de-flake) + `dc8d38e` (docs, the OUTPUT record)

**Plan metadata:** recorded below.

## Files Created/Modified

- `tests/e2e/review-panel/jump-bidirectional.spec.ts` — +2 loop tests (RECV-01.c closing half)
- `tests/e2e/a11y.spec.ts` — +#/review axe case with heading-order/list guards (RECV-01.i)
- `tests/e2e/forced-colors.spec.ts` — +#/review legibility + operability case
- `tests/e2e/reduced-motion.spec.ts` — +#/review no-animation + operability case
- `tests/e2e/panel-keyboard.spec.ts` — +#/review Tab/focus/Enter/Back reachability case
- `tests/e2e/typography-live-apply.spec.ts` — test.setTimeout(60_000) de-flake (assertions unchanged)
- `.planning/phases/10-annotation-review-panel/10-06-OUTPUT.md` — the permanent full-suite record (new)

## Decisions Made

- **RECV-01 flips Complete** — every sub-behavior now has green executor evidence in real browsers: .a (10-02), .b/.d/.e/.g (10-04), .f (10-05), .c/.i closed here through the real UI path in both reading modes. The 04-02/09-01 split precedent resolves to this plan.
- **Operability over origin-row focus after Back** — the plan's own instruction (engine-variable focus; manual-only feel check in 10-VALIDATION.md); Pitfall 9's scrolled-to-top remount is the accepted limitation, so no scroll-restoration assertions.
- **Engine-honest keyboard subsets over impossible literal contracts** — Playwright's WebKit does not include buttons/links in sequential Tab navigation (verified empirically on two routes; the repo's own forced-colors spec already warned "WebKit's Tab handling is independently buggy"). Rather than faking Tab reachability, the test asserts the engine-true subset + a universal programmatic-focus/Enter contract, with the constraint documented for future specs (the 09-06 stacked-modal precedent generalized).
- **Seed a note + an orphan row for the a11y/forced-colors gates** — non-empty real row structure (quote, note preview, curation cluster) and a text-conveyed badge state, so the gates cannot pass vacuously on an empty panel.
- **Typography de-flake as the gate's only stabilization** — 60s budget per the 09-07 precedent; the plan's anticipated jump-bidirectional stabilization was not needed (recorded in the OUTPUT §5).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] WebKit excludes buttons/links from Tab — the literal "Tab reaches rows" contract was impossible on webkit**
- **Found during:** Task 2 (panel-keyboard #/review case — 1 webkit failure; walk cycled only the three selects)
- **Issue:** The plan's keyboard contract ("Tab reaches filter controls → sort select → rows") assumes buttons are Tab-participants. Playwright's bundled WebKit keeps Safari's default where sequential Tab focus reaches form controls only — skip link, header buttons, and row buttons are excluded (verified engine-global on the library route too; chromium/firefox behave normally). Not an app bug — an engine reality the plan could not anticipate.
- **Fix:** Restructured the test per the 09-06 engine-divergence precedent: webkit asserts the selects-only Tab subset; chromium/firefox assert the full walk including the row button; ALL engines get the programmatic-focus contract (each control accepts focus in DOM order) + Enter activation + Back return. Constraint documented in the spec comment.
- **Files modified:** tests/e2e/panel-keyboard.spec.ts
- **Verification:** 102/102 cells green across the four specs × 3 engines; full suite exit 0.
- **Committed in:** 77b14f6 (Task 2 commit)

**2. [Rule 3 - Blocking] Full-suite run 1 failed on one webkit load-race cell (typography READ-02)**
- **Found during:** Task 3 (the honest gate itself)
- **Issue:** beforeEach `page.goto` burned the default 30s test budget while webkit's first module fetch was starved by sibling workers under full-suite parallel load (passes in isolation at 835ms) — the exact 09-07 load-race class, which Task 3 explicitly anticipated ("load-race fixes follow the 09-07 precedent").
- **Fix:** `test.setTimeout(60_000)` in typography-live-apply.spec.ts (the 09-07/calibration/perf precedent); assertions byte-unchanged. Full suite re-run clean in ONE invocation.
- **Files modified:** tests/e2e/typography-live-apply.spec.ts
- **Verification:** Cell green in isolation and in the exit-0 full-suite re-run; both invocation exit codes recorded in 10-06-OUTPUT.md.
- **Committed in:** 3d2b650 (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 bug — engine-reality adaptation, 1 blocking — anticipated load-race de-flake)
**Impact on plan:** Both fixes keep the gates honest without weakening anything: zero assertions removed across all touched specs; the keyboard contract is now documented per-engine rather than silently unpassable on webkit. No scope creep.

## Issues Encountered

- First full-suite invocation exited 1 (single webkit load-race failure) — triaged, fixed, and re-run clean per §4 of the OUTPUT record. Nothing else surfaced: the a11y/forced-colors/reduced-motion #/review cases and both loop tests passed all engines on their first runs.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 10 execution is complete (6/6 plans + summaries); STATE status is ready_for_verification. RECV-01 is marked Complete in REQUIREMENTS.md.
- The two manual-only rows in 10-VALIDATION.md (SR announcement quality of tri-state badges; focus-restore feel on panel return) remain queued for /gsd-verify-work — deliberately NOT automated here.
- The WebKit Tab constraint (buttons/links outside sequential Tab in Playwright's bundled WebKit) is documented in panel-keyboard.spec.ts — any future Tab-driven spec must account for it.
- No blockers.

## Verification Evidence

| Check | Result |
|-------|--------|
| `npx playwright test tests/e2e/review-panel/jump-bidirectional.spec.ts` | 21/21 passed (7 tests × chromium/firefox/webkit; 10-03 tests byte-stable, +2 loop tests) |
| `npx playwright test tests/e2e/a11y.spec.ts tests/e2e/forced-colors.spec.ts tests/e2e/reduced-motion.spec.ts tests/e2e/panel-keyboard.spec.ts` | 102/102 passed (34 tests × 3 engines) |
| `npm run test` (run 1, recorded honestly) | unit 871/0/7; e2e 924 passed / 1 failed (webkit typography load-race) — exit 1 |
| `npm run test` (run 2, after 3d2b650) | unit 871/0/7 + e2e 925/0/6 — **1796/0/13, exit 0** (10-06-OUTPUT.md) |
| Skipped cells (13) | 7 unit intentional + 6 e2e ssrf-matrix documented residuals (2/engine) — exactly the 09-07 baseline, no new skips |
| `git diff` (strengthen-only) | 0 removed lines across jump-bidirectional + the four gate specs; typography change is +5 lines (setTimeout + comment) |
| `npx tsc --noEmit` | exit 0 |
| `npx eslint` over all five touched spec files | exit 0 |

## Self-Check: PASSED

- All key-files exist on disk (jump-bidirectional.spec.ts, a11y.spec.ts, forced-colors.spec.ts, reduced-motion.spec.ts, panel-keyboard.spec.ts, typography-live-apply.spec.ts, 10-06-OUTPUT.md)
- All task commits present in git log (`350df56`, `77b14f6`, `3d2b650`, `dc8d38e`)
- All acceptance criteria re-run and passing (see Verification Evidence)

---
*Phase: 10-annotation-review-panel*
*Completed: 2026-08-16*
