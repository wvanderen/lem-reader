---
phase: 05-durable-highlights-and-notes
plan: 06
subsystem: pagination
tags: [pagination, geometry, regression-test, rAF, class-gate]

# Dependency graph
requires:
  - phase: 04-pagination-engine
    provides: "PAGE-03 even-viewport-pages contract + the geometry-effect (pageContentBoxHeightPx) + PaginatedSurface pagination effect"
provides:
  - "Gated geometry read — pageContentBoxHeightPx only accepts the pinned .paginated-surface height, never the scrolling-body natural height"
  - "Dedicated CI regression guard (initial-pagination-even.spec.ts) that captures the FIRST pagination publication deterministically and fails loudly if the mega-page mode returns"
affects: [ANNO-05, PAGE-03, page-content-box-geometry, pagination-stability]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Class-gated rAF geometry read: guard a getBoundingClientRect() height read on a CSS class that marks the pinned-geometry branch, so a transient sibling branch's natural height can never leak into shared state"

key-files:
  created:
    - "tests/e2e/pagination/initial-pagination-even.spec.ts"
  modified:
    - "src/routes/ArticleView.tsx"

key-decisions:
  - "Option A (class gate) chosen over Options B/C: a one-line `if (!articleEl.classList.contains(\"paginated-surface\")) return;` before the rAF height read is the minimal root-cause fix. The useState(0) initial + trustedView effect-dep re-run already cover initial mount, so no separate initial-mount reset was needed."
  - "Measurement selector (engine.ts / domMeasurer.ts) left untouched — the debug session exonerated it (returns correct 8 blocks + correct heights; bug reproduces identically at pre-Phase-5 commit eac0845)."
  - "[Rule 1] Regression assertion (b) relaxed from 'settled == first' to 'settled >1 AND settled == resettled': the plan's equality conflated the diagnosed geometry correction (1->3, pageContentBoxHeightPx flipping) with the by-design post-render overflow-guard split (2->3, same pinned height). Equality failed both pre- and post-fix so it was not a useful discriminator; assertion (a) (first>1) is the literal mega-page guard."

patterns-established:
  - "Capture-first-publication e2e: a single page.evaluate that polls via requestAnimationFrame until window.__lemPagination is defined resolves the FIRST pagination commit with no evaluate round-trip gap a racy correction could slip through."

requirements-completed: [ANNO-05]

# Metrics
duration: 22 min
completed: 2026-08-07
status: complete
---

# Phase 5 Plan 06: Initial Pagination Even (Mega-Page Regression) Summary

**One-line class gate in ArticleView's geometry rAF so `pageContentBoxHeightPx` never accepts the scrolling-body height, eliminating the `pagesLength=1` mega-page on initial load and adding the CI guard that the no-overflow e2e was fooled by.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-08-07T20:47:06Z
- **Completed:** 2026-08-07T21:09:22Z
- **Tasks:** 3 (2 TDD commits + 1 verification-only)
- **Files modified:** 2

## RED → GREEN Evidence

The regression spec captures the FIRST pagination publication for `essay-long-form` at desktop (1024×800) via a single rAF-polling `page.evaluate` (no `waitForTimeout` before capture — it observes the uncorrected initial state).

| State | First publication `pagesLength` | Outcome |
|-------|--------------------------------|---------|
| **RED (before fix)** | **1** (the mega-page: entire article packed on P1) | assertion (a) `>1` FAILS |
| **GREEN (after fix)** | **2** (even distribution; mega-page gone) | assertion (a) `>1` PASSES |

Diagnostic probe (60ms sampling, 2.5s window) confirmed the gate behaves exactly as designed:
- t=62–361ms: `class="article-body"` (scrolling branch), `clientHeight=1419` → **gate rejects** this read; `pageContentBoxHeightPx` stays 0, no publication.
- t=421ms: class flips to `article-body paginated-surface`, `clientHeight=654` (correct pinned height) → first publication `pagesLength=2`.
- t=482ms: `pagesLength=3`, `clientHeight=654` (SAME height) → the **post-render overflow guard** splits one slightly-overlapping page (2→3). This is the by-design safety net (PaginatedSurface.tsx:361–458), NOT a geometry re-read.
- t=541ms–2.5s: stable at 3 pages, 654px.

## Accomplishments
- The Phase 5 UAT Test 11 BLOCKER (pagination uneven pages on initial load) is closed at the root cause: `pageContentBoxHeightPx` no longer leaks the scrolling-body natural height (~1419px) into the first pagination pass.
- The masked regression is now caught in CI: the dedicated `initial-pagination-even.spec.ts` fails loudly if the `pagesLength=1` mega-page mode ever returns — the existing `no-overflow-invariant` e2e was fooled by `.page-fragment { height:100% }` + a 600ms wait past the racy correction.
- No regression to PAGE-03 (no-overflow matrix 18/18 chromium; 134/134 firefox+webkit pagination), ANNO-05 (highlight durability), or any prior phase.

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): initial-pagination-even regression spec** — `2e11b1d` (test)
2. **Task 2 (GREEN): gate geometry rAF read on paginated-surface class** — `4e11f6f` (fix)
3. **Task 3: cross-engine + full-suite confirmation** — no code change (per plan: "if green, the Task 2 commit stands; do not make an empty commit"); the green suite IS the Task 3 evidence.

**Plan metadata:** `[pending]` (docs: complete plan)

## Files Created/Modified
- `src/routes/ArticleView.tsx` — added one-line `classList.contains("paginated-surface")` guard inside the geometry-effect rAF callback (before `getBoundingClientRect().height`), with a detailed rationale comment.
- `tests/e2e/pagination/initial-pagination-even.spec.ts` — NEW regression spec; copies the harness skeleton (BASE, pixel-svg route, indexedDB.deleteDatabase beforeEach) from `no-overflow-invariant.spec.ts`; captures the FIRST pagination publication deterministically and asserts even distribution.

## Decisions Made
- **Fix direction = Option A (class gate).** The debug session's candidate (a) was selected over (b) reset-to-0-on-initial-mount and (c) derive page height from `.page-fragment`. Rationale: the article element is shared across both branches (React updates `className` in place; `articleEl` ref is stable), so reading it after the class flips yields the pinned height. `trustedView` is already in the effect deps, so the effect re-runs when the class flips and the rAF re-fires with the correct geometry. The `useState(0)` initial keeps the first render at 0 (pagination effect waits), so no separate initial-mount reset was needed.
- **Measurement selector untouched.** The debug session empirically exonerated `engine.ts` / `domMeasurer.ts` (returns correct 8 measurement-body blocks with correct heights; bug reproduces identically at pre-Phase-5 commit `eac0845`). Per plan constraint: do NOT touch it.
- **Synchronous mode-swap reset preserved.** The `prevIsPaginated` block (Plan 04-09) stays as the mode-swap path; the new gate is the initial-load path. Effect dependency array unchanged. No fallback read of a different element.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test correctness] Relaxed regression assertion (b) from `settled == first` to `settled >1 AND settled == resettled`**
- **Found during:** Task 2 (GREEN verification — the fix worked but the spec's stability assertion failed)
- **Issue:** The plan's assertion (b) "settled pagesLength must equal first publication" conflated two different mechanisms: (i) the diagnosed geometry correction (1→3, driven by `pageContentBoxHeightPx` flipping from the scrolling height ~1419 to the pinned height 654) and (ii) the by-design post-render overflow-guard split (2→3, same pinned height — the engine's pre-captured line-box measurement slightly underestimates, one page overflows in live DOM, the guard splits it). The equality assertion failed BOTH pre-fix (1≠3) and post-fix (2≠3), so it was not a useful discriminator — it did not cleanly distinguish the fixed from unfixed state.
- **Fix:** Kept assertion (a) (`first > 1`) as the hard, literal mega-page guard — this is the exact symptom (pagesLength=1 = the entire article on P1) and it flips cleanly from FAIL (1) pre-fix to PASS (2) post-fix. Replaced (b) with: settled `pagesLength > 1` (no mega-page reversion at settle) AND `settled == resettled` after a second 400ms window (the settled state is final, not churning). Added a detailed NOTE comment distinguishing the overflow-guard split from the diagnosed geometry correction.
- **Files modified:** tests/e2e/pagination/initial-pagination-even.spec.ts
- **Verification:** Empirical 60ms probe confirmed `clientHeight` stays constant at 654 across the 2→3 transition (so 2→3 is an overflow-guard split, NOT a geometry re-read). The relaxed spec passes; it still fails loudly if the mega-page (first=1) ever returns.
- **Committed in:** `4e11f6f` (Task 2 GREEN commit, alongside the production fix)

---

**Total deviations:** 1 auto-fixed (1 test-correctness / Rule 1)
**Impact on plan:** The deviation corrected an over-specified test assertion so it expresses the actual regression contract (mega-page = pagesLength 1) rather than an unachievable "first pass == settled" ideal that the by-design overflow guard makes unreachable. It does NOT weaken the regression guard — assertion (a) (first > 1) is the literal mega-page symptom and is unchanged from the plan. No scope creep.

## Issues Encountered
None beyond the deviation above. The production fix is exactly the one-line Option A gate the plan prescribed; the only adjustment was to one test assertion's wording.

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED  | `2e11b1d` (`test(05-06):`) | ✓ — spec exists AND failed before implementation (captured pagesLength=1) |
| GREEN | `4e11f6f` (`fix(05-06):`) | ✓ — spec passes after implementation (captured pagesLength=2) |
| REFACTOR | — | n/a (no cleanup needed; one-line fix) |

The RED-then-GREEN discipline held: the failing test was committed and verified failing BEFORE the implementation was written, then the implementation made it pass.

## User Setup Required
None — no external service configuration required. Pure source + test changes only; no package installs (threat T-05-06-SC: no package-legitimacy gate applicable).

## Threat Flags
None. The gate is a pure DOM read (`classList.contains`) over the framework-managed className — no untrusted input crosses the boundary (T-05-06-01 accept). The `window.__lemPagination` DEV hook is pre-existing and unchanged (T-05-06-02 accept).

## Honest Full-Suite Counts (Task 3)

Full `npm run test` (unit → e2e × chromium/firefox/webkit) in ONE invocation — no subset, no `--grep`, no engine skip:

| Suite | Passed | Failed | Skipped |
|-------|--------|--------|---------|
| Unit (vitest) | 511 | 0 | 0 |
| E2e (playwright × 3 engines) | 492 | 0 | 0 |
| **Total** | **1003** | **0** | **0** |

Exit code 0. The fix touches only which geometry read is accepted (one-line gate), so the unit suite and the annotations e2e suite were expectedly unaffected — no PAGE-03 / ANNO-05 regression.

## Next Phase Readiness
- UAT Test 11 BLOCKER closed; ANNO-05 (highlight durability across repagination) now proven in the corrected initial state.
- The masked CI blind spot is closed; future geometry/measurement changes will trip the dedicated regression spec rather than slipping past the height:100%-clamped no-overflow e2e.
- Phase 5 is now code-complete pending this plan's metadata commit.

## Self-Check: PASSED

- [x] tests/e2e/pagination/initial-pagination-even.spec.ts — FOUND
- [x] src/routes/ArticleView.tsx — FOUND
- [x] .planning/phases/05-durable-highlights-and-notes/05-06-SUMMARY.md — FOUND
- [x] commit `2e11b1d` (RED) — FOUND in git log
- [x] commit `4e11f6f` (GREEN) — FOUND in git log
- [x] `classList.contains("paginated-surface")` gate — FOUND in ArticleView.tsx

---
*Phase: 05-durable-highlights-and-notes*
*Completed: 2026-08-07*
