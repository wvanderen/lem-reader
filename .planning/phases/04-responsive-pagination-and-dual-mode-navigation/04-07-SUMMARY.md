---
phase: 04-responsive-pagination-and-dual-mode-navigation
plan: 07
subsystem: pagination
tags: [pagination, overflow-guard, react-effects, playwright, page-03]

# Dependency graph
requires:
  - phase: 04-06
    provides: pre-capture pagination pipeline (Plan 04-06) that the guard runs as a SECOND pass behind
provides:
  - "src/pagination/overflowGuard.ts — refragmentOverflowingPage pure module (post-render overflow guard)"
  - "OverflowGuardResult Zod schema in src/pagination/types.ts"
  - "PaginatedSurface post-render guard effect that corrects overflowing pages against live DOM truth"
  - "54/54 PAGE-03b no-overflow cells green across chromium + firefox + webkit"
affects: [04-08, 04-09, 04-10, 04-11, pagination-e2e-suite, PAGE-03-verification]

# Tech tracking
tech-stack:
  added: []  # No new libraries (T-04-07-SC: no npm installs)
  patterns:
    - "Post-render overflow guard: rAF-deferred useEffect measures live .page-fragment.scrollHeight vs .article-body.clientHeight + tolerance, calls pure refragmentOverflowingPage module, setPages(corrected) with anchor capture-before-swap"
    - "Defensive empty-slice guard: when live DOM textContent disagrees with entry's range (React re-render race or multi-byte UTF-16 divergence), reject the split and fall back to move-whole or dom-fallback — never produce an empty PageFragment.blocks entry"
    - "Defensive coordination: pre-capture pipeline (Plan 04-06) is the FIRST pass; the guard is the SECOND pass — purely additive, no rewrite of fragment.ts logic"

key-files:
  created:
    - "src/pagination/overflowGuard.ts — refragmentOverflowingPage({article, pages, overflowingPageIndex, fragmentEl, pageContentBoxHeightPx, tolerance, diagnostics, signal}) → PageFragment[] | null"
    - "tests/unit/pagination/overflowGuard.test.ts — 14 unit tests covering all 5 behavior bullets + defensive empty-slice paths"
  modified:
    - "src/pagination/types.ts — added OverflowGuardResultSchema + OverflowGuardResult type"
    - "src/reader/PaginatedSurface.tsx — new useEffect runs the post-render guard; TOLERANCE_PX=2 constant; calls refragmentOverflowingPage on overflow, setPages(corrected) + D4-11 anchor capture + DEV window.__lemPagination update"

key-decisions:
  - "Guard is additive: Plan 04-06's pre-capture pipeline stays as the FIRST pass; the guard runs only as a post-render correction pass (STACK.md 'per-kind measurement + post-render overflow guard' contract)"
  - "Live DOM truth over pre-capture: the guard reads getBoundingClientRect + scrollHeight on the actual rendered .page-fragment, NOT the pre-captured LineBox[][]. Pre-capture's scrolling-geometry heights don't predict paginated-geometry heights (the root cause of the 4–82px overflows)"
  - "Iterative correction: each setPages triggers a re-fire; on the next pass the corrected page is measured again. Each iteration strictly reduces the overflowing page's source range, so termination is provable; PAGE_CEILING (300) is a defensive bound"
  - "Defensive empty-slice guard added (Rule 1 deviation): when live DOM textContent disagrees with entry's range (e.g. React hasn't re-rendered the sliced block yet, OR multi-byte UTF-16 graphemes diverge from line-box charOffsets), the guard rejects the split and falls back to move-whole or dom-fallback. This prevents ever producing an empty PageFragment.blocks entry that would violate PAGE-03a exactly-once coverage"
  - "blockNormalizedText(childEl) used as the sliceText for readLineBoxes' charOffset conversion — for paragraphs in clean ASCII this equals splittingBlockText (renderer's coordinate), so grapheme offsets round-trip through the renderer's slicing. For containers (lists/blockquotes) the BLOCK_SEPARATOR coordinate mismatch is caught by the defensive empty-slice guard, which routes to move-whole or fallback"

patterns-established:
  - "Pure post-render correction module: pure domain function (no React, no side effects beyond DiagnosticBus) consumed by a thin rAF-deferred useEffect in the renderer"
  - "Anchor capture-before-swap: when setPages replaces the page list, capture pageStartGlobalOffset on the OLD pages BEFORE setPages, then setCurrentPageIdx(fragmentContainingOffset(newPages, anchorOffset)) — Pitfall 7 honored"
  - "DEV helper freshness: when the guard refragments, update window.__lemPagination.{pages, currentPageIdx, pagesLength} so the e2e sees the corrected state on its next read (T-04-16: gated behind import.meta.env.DEV)"

requirements-completed: [PAGE-03]

# Metrics
duration: 31min
completed: 2026-08-06
status: complete
---

# Phase 4 Plan 07: Post-render Overflow Guard Summary

**Pure `refragmentOverflowingPage` module + PaginatedSurface rAF-deferred post-render effect that corrects overflowing pages against live DOM truth — closes the PAGE-03b silent-clipping BLOCKER (54 e2e cells green across chromium + firefox + webkit).**

## Performance

- **Duration:** 31 min
- **Started:** 2026-08-06T20:18:58Z
- **Completed:** 2026-08-06T20:50:33Z
- **Tasks:** 2 (Task 1 TDD: red → green; Task 2: wire + verify)
- **Files modified:** 4 (1 new module, 1 new test file, 2 modified)

## Accomplishments
- **PAGE-03b silent-clipping BLOCKER closed.** All 54 corpus × viewport × engine cells of `no-overflow-invariant.spec.ts` pass. Page fragments no longer overflow their content-box by 4–82px.
- **Post-render guard wired as STACK.md's contractually-required safety net.** Plan 04-06's pre-capture pipeline stays as the FIRST pass (fast, slightly off); the guard runs as the SECOND pass against live DOM truth (slow, accurate). Purely additive — no rewrite of `fragment.ts`.
- **PAGE-03a exactly-once coverage preserved.** All 54 coverage-invariant cells pass — the guard never drops or duplicates block entries; corrections strictly subdivide the offending page's source range.
- **PAGE-03c termination preserved.** All 57 termination cells pass — PAGE_CEILING (300) + per-call single correction + abort signal guarantee no infinite loops.
- **PAGE-04 fallback preserved.** fallback-oversize 5/5 green — the guard's dom-fallback emission routes through the same DiagnosticBus→ArticleView subscription as the engine's.
- **PAGE-05 repagination anchor preserved.** repagination-anchor 4/4 green — D4-11 anchor capture-before-swap honored on every setPages.

## Task Commits

Each task was committed atomically:

1. **Task 1 (TDD red): add failing tests for post-render overflow guard** — `b0ebaf2` (test)
2. **Task 1 (TDD green): implement post-render overflow guard module** — `ae649b5` (feat)
3. **Task 2: wire guard into PaginatedSurface post-render + defensive empty-slice fix** — `9570e06` (fix)

_TDD note: Task 1 was marked `tdd="true"` in the plan. RED committed first (12 failing tests because module didn't exist), then GREEN (12 passing tests). MVP mode is ON but TDD is OFF at the workflow level — the plan's per-task `tdd` directive was honored anyway per the explicit PROJECT NOTES._

## Files Created/Modified
- `src/pagination/overflowGuard.ts` (new) — Pure post-render overflow guard module. `refragmentOverflowingPage` walks `fragmentEl.children` to find the first child whose `getBoundingClientRect().bottom` exceeds `pageContentBoxHeightPx + tolerance`. For atomic offenders, moves the offending block + trailing siblings to a new next page. For splitting offenders, re-reads live line boxes via `readLineBoxes`, chooses the largest widow-legal split via `applyLineWidowOrphan` + `charOffsetToGrapheme`. Single-block-too-tall / no widow-legal fit / PAGE_CEILING → emit dom-fallback + return `[]`.
- `src/pagination/types.ts` (modified) — Added `OverflowGuardResultSchema` + `OverflowGuardResult` Zod type (mirrors `FragmentationResultSchema`).
- `tests/unit/pagination/overflowGuard.test.ts` (new) — 14 unit tests covering no-overflow pass-through, atomic move, splitting re-split, dom-fallback, PAGE_CEILING, abort signal, PAGE-03 invariant, defensive empty-slice paths. Mocks `readLineBoxes` (jsdom doesn't implement `Range.getClientRects`); uses jsdom HTMLElement stubs with `getBoundingClientRect` + `data-block-index`.
- `src/reader/PaginatedSurface.tsx` (modified) — New `useEffect` runs as a rAF-deferred post-render guard. Deps: `[pages, currentPageIdx, pageContentBoxHeightPx, article, articleEl, diagnostics]`. Measures `.page-fragment.scrollHeight` vs `articleEl.clientHeight + TOLERANCE_PX (2)`. On overflow: captures anchor via `pageStartGlobalOffset` BEFORE `setPages`, calls `refragmentOverflowingPage`, `setPages(result)` + `setCurrentPageIdx(fragmentContainingOffset(...))`, updates DEV-only `window.__lemPagination` helper. Cleanup: `cancelled = true` + `controller.abort()` + `cancelAnimationFrame`. Pre-capture pagination effect (Plan 04-06) unchanged.

## Decisions Made
- **Guard is additive, not a rewrite.** Plan 04-06's pre-capture pipeline stays as the FIRST pass; the guard is the SECOND pass. This honors STACK.md's "per-kind measurement + post-render overflow guard" pattern and minimizes blast radius.
- **Defensive empty-slice guard (Rule 1 deviation).** During e2e validation under parallel test execution, I discovered a coordinate mismatch: when a container block (numbered-list) had been sliced by my guard in a prior iteration, the live DOM textContent sometimes disagreed with the entry's `[startGrapheme, endGrapheme)` range (likely React re-render race or UTF-16/grapheme divergence). The result was an empty `PageFragment.blocks` entry, violating PAGE-03a exactly-once coverage. Added a defensive check: if the chosen split lands at sliceLen boundary, reject the split and fall back to move-whole or dom-fallback. This is a Rule 1 bug fix — auto-fixed inline + tested.
- **`blockNormalizedText(childEl)` used as sliceText.** For paragraphs in clean ASCII this equals `splittingBlockText` (renderer's coordinate), so grapheme offsets round-trip. For containers the BLOCK_SEPARATOR coordinate mismatch is caught by the defensive empty-slice guard.
- **TOLERANCE_PX = 2 mirrors the e2e.** Matches the no-overflow-invariant spec's 2px slack for sub-pixel rounding.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Defensive empty-slice guard**
- **Found during:** Task 2 e2e validation (`coverage-invariant.spec.ts` flaky failures under parallel execution)
- **Issue:** When my guard re-split a container block (e.g. numbered-list in `unsupported-case@768`), the chosen line-box split point's `charOffset` could correspond to a grapheme offset ≥ sliceLen. This happened when the live DOM `textContent` disagreed with the entry's `[startGrapheme, endGrapheme)` range — most likely because the renderer's sliced block DOM hadn't yet reflected a guard-produced entry (React re-render race under parallel test load), or because of UTF-16/grapheme length divergence for text with smart quotes / em-dashes. The result: `clampedSplit === sliceLen` → before-slice = whole slice, after-slice = `[X, X)` (empty).
- **Fix:** Added a defensive check after computing `clampedSplit`: if it equals `0` OR `sliceLen`, fall back to the move-whole path (or emit dom-fallback if the offending block alone is too tall for a fresh page). This guarantees the guard NEVER produces an empty `PageFragment.blocks` entry.
- **Files modified:** `src/pagination/overflowGuard.ts`
- **Verification:** 2 new unit tests cover both paths (fallback when alone-too-tall; move-whole when entriesBefore is non-empty). 174 e2e cells pass across 3 engines.
- **Committed in:** `9570e06` (Task 2 commit)

**2. [Rule 3 — Blocking] Added `text` field to test stubs**
- **Found during:** Task 1 GREEN iteration (2 splitting tests failed because `blockNormalizedText(childEl)` returned empty for synthetic jsdom elements without textContent)
- **Issue:** The splitting-kind unit tests stubbed `getBoundingClientRect` but not `textContent`. `blockNormalizedText` calls `normalizeElText(el)` which reads `el.textContent` — empty for synthetic elements. The line-box mock returned charOffsets indexing into a non-empty text, but `charOffsetToGrapheme("", charOffset, lang)` returned 0, producing wrong splits.
- **Fix:** Added an optional `text` field to the test's `StubChild` interface; `makeFragmentEl` sets `child.textContent` when provided. Updated the 2 splitting tests to pass the paragraph text.
- **Files modified:** `tests/unit/pagination/overflowGuard.test.ts`
- **Verification:** All 14 unit tests pass.
- **Committed in:** `ae649b5` (Task 1 GREEN commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep. The defensive empty-slice guard is a robustness improvement that makes the guard safe under race conditions beyond the immediate bug.

## Issues Encountered
- **Flaky coverage failures under parallel execution.** Initial e2e run showed intermittent empty-slice failures in `coverage-invariant.spec.ts` (different block/fixture each run). Reproduced via temporary debug logging in the guard; identified the root cause as a coordinate mismatch when live DOM textContent disagreed with the entry's range. Fixed via the defensive empty-slice guard (see Deviation #1).
- **No package install failures.** No new dependencies added (T-04-07-SC ✓).

## Authentication Gates
None.

## User Setup Required
None — no external service configuration required.

## Threat Surface
No new security-relevant surface. The guard is a pure module operating on Zod-validated `PageFragment[]` + `CanonicalArticle`. No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. T-04-07-01 (Tampering): accept — pure module, no XSS surface (React escapes BlockView output). T-04-07-02 (DoS): mitigate — PAGE_CEILING (300) + per-call single correction + abort signal. T-04-07-SC (Tampering via npm installs): mitigate — no new packages installed.

## Next Phase Readiness
- **Plan 04-07 (this plan): COMPLETE.** PAGE-03b closed. PAGE-03a/c preserved.
- **Plans 04-08, 04-09, 04-10, 04-11 remain** (per gap-closure planning). Each addresses a separate verifier-found gap:
  - 04-08: PAGE-01 M-toggle round-trip + PAGE-02 keyboard/chevron (6 e2e failures)
  - 04-09: PAGE-09 fallback-banner auto-dismiss race (4 e2e failures)
  - 04-10: Phase 3 PAGE-06 last-valid-view regression (3 e2e failures)
  - 04-11: Phase 3 PAGE-07 stale-epoch-drop regression (3 e2e failures)
- **No blockers** introduced by this plan. The post-render guard is purely additive; subsequent plans can build on the stable pagination substrate.

---
*Phase: 04-responsive-pagination-and-dual-mode-navigation*
*Completed: 2026-08-06*

## Self-Check: PASSED

### Files exist on disk
- ✅ `src/pagination/overflowGuard.ts`
- ✅ `tests/unit/pagination/overflowGuard.test.ts`
- ✅ `src/reader/PaginatedSurface.tsx`
- ✅ `.planning/phases/04-responsive-pagination-and-dual-mode-navigation/04-07-SUMMARY.md`

### Commits exist in git log
- ✅ `b0ebaf2` — test(04-07): add failing tests for post-render overflow guard
- ✅ `ae649b5` — feat(04-07): implement post-render overflow guard module
- ✅ `9570e06` — fix(04-07): wire overflow guard into PaginatedSurface post-render

### Acceptance criteria (Task 1)
- ✅ `src/pagination/overflowGuard.ts` exports `refragmentOverflowingPage` with the documented signature
- ✅ `src/pagination/types.ts` exports `OverflowGuardResultSchema` + `OverflowGuardResult`
- ✅ `tests/unit/pagination/overflowGuard.test.ts` passes (14/14) covering all 5 behavior bullets + defensive empty-slice paths
- ✅ Module imports ONLY from `src/pagination/*`, `src/content/normalizeText`, `src/measurement/{diagnostics,fontGate}` — `rg "^import.*@chenglou/pretext" src/pagination/overflowGuard.ts` returns no matches (T-04-SC ✓)
- ✅ Module never re-implements normalization — helpers are imported, not redefined

### Acceptance criteria (Task 2)
- ✅ `src/reader/PaginatedSurface.tsx` has a new `useEffect` that calls `refragmentOverflowingPage` when `.page-fragment.scrollHeight` exceeds `.article-body.paginated-surface.clientHeight + 2px`
- ✅ Existing pre-capture pagination effect (Plan 04-06) unchanged in intent (the guard is purely additive)
- ✅ `npx playwright test tests/e2e/pagination/no-overflow-invariant.spec.ts` passes 54/54 cells across chromium + firefox + webkit (PAGE-03b closed)
- ✅ `npx playwright test tests/e2e/pagination/coverage-invariant.spec.ts tests/e2e/pagination/termination.spec.ts` passes on all 3 engines (no PAGE-03a/c regression)
- ✅ `npm run test:unit -- --run` exits 0 (405/405 pass)

### Plan-level verification
- ✅ `npm run test:unit -- --run` exits 0
- ✅ `npx playwright test tests/e2e/pagination/no-overflow-invariant.spec.ts` passes 54/54 cells across 3 engines
- ✅ `npx playwright test tests/e2e/pagination/coverage-invariant.spec.ts tests/e2e/pagination/termination.spec.ts` passes on 3 engines
- ✅ `npm run lint && npx tsc --noEmit` exit 0
