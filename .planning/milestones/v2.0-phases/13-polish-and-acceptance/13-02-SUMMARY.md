---
phase: 13-polish-and-acceptance
plan: 02
subsystem: ui
tags: [progress-hairline, pagination, d05-grapheme-offsets, playwright, vitest, tdd]

# Dependency graph
requires:
  - phase: 04-pagination
    provides: pageStartGlobalOffset (anchor.ts D-05 coordinates), PaginatedSurface, PageFragment contract, ProgressHairline/PageIndicator chrome
  - phase: 08-library
    provides: LibraryRow D8-11 ratio precedent (graphemeOffset / grapheme total) + memoized-grapheme-total pattern
provides:
  - "src/pagination/progress.ts — pure paginatedProgressRatio(article, fragment): offset-anchored [0,1] ratio over the D-05 grapheme coordinate system"
  - "Ratio-only ProgressHairline (page prop removed) wired through PaginatedSurface with per-committed-page memoization"
  - "SC#2 boundary proof: 5 unit behaviors + 2 e2e cases × 3 engines (one-page open < 0.1; monotonic growth; last page < 1.0)"
affects: [13-04 chrome polish, phase-13 acceptance records, 13-VERIFICATION.md]

# Tech tracking
tech-stack:
  added: []  # zero installs (T-13-SC)
  patterns:
    - "paginatedProgressRatio composes ONLY pageStartGlobalOffset + graphemeLength (REUSE-DO-NOT-FORK — no new offset-accumulation walk; the 04-09 offset-drift class avoided)"
    - "waitForFunction as the value-capturing counterpart of expect.poll (poll until a browser-side end condition holds AND yield the observed number)"
    - "One-page e2e articles seeded via makeArticle + seedRows (portability harness) instead of new fixture files"

key-files:
  created:
    - src/pagination/progress.ts
    - tests/unit/pagination/progress-formula.test.ts
    - tests/e2e/polish/first-paint-progress.spec.ts
  modified:
    - src/reader/PaginatedSurface.tsx
    - src/reader/ProgressHairline.tsx

key-decisions:
  - "Ratio = pageStartGlobalOffset / graphemeLength clamped to [0,1], returning 0 on an empty coordinate space — the D8-11 LibraryRow formula transplanted to the paginated surface (POLISH-02)"
  - "ProgressHairline is ratio-only: the page-variant branch + page prop are deleted outright rather than deprecated; tsc --noEmit proves PaginatedSurface was the sole page-prop caller"
  - "PaginatedSurface memoizes the ratio per (article, pages, currentPageIdx) the way LibraryRow memoizes its grapheme total — the useMemo sits BEFORE the pages-null early return (hooks-order discipline)"
  - "PageIndicator N-of-M and the hairline's presentational contract (aria-hidden, zero motion, origin left) stay byte-unchanged — page numbers remain informational, never identity (D-05)"

patterns-established:
  - "Boundary-table unit tests encode the SC#2 semantics (first page 0, monotonic, last < 1, empty 0, overshoot clamps 1) as the regression net for any future ratio change"
  - "pollScaleXAbove: page.waitForFunction returning the observed value — the pattern for asserting growth against the PREVIOUS sample, not a constant"

requirements-completed: [POLISH-02]

# Metrics
duration: 7 min
completed: 2026-08-19
status: complete
---

# Phase 13 Plan 02: First-Paint Progress Summary

**Offset-anchored paginated progress hairline (paginatedProgressRatio over D-05 grapheme coordinates) replaces the 1/1-reads-100% page-count ratio, proven by 5 boundary unit tests + a 3-engine first-paint e2e**

## Performance

- **Duration:** 7 min
- **Started:** 2026-08-19T01:53:09Z
- **Completed:** 2026-08-19T01:59:47Z
- **Tasks:** 3
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments
- Pure `paginatedProgressRatio` helper composes ONLY the shipped `pageStartGlobalOffset` + `graphemeLength` — no forked offset walks; derived per layout, never persisted (D-05)
- ProgressHairline is ratio-only: the page-variant branch (the POLISH-02 bug: 1/1 → 100% on open, 1/2 → 50% at start) is deleted; the clamp→scaleX→origin-left path stays byte-identical, aria-hidden, zero-motion
- PaginatedSurface memoizes the per-committed-page ratio; the PageIndicator N-of-M call site is byte-unchanged
- SC#2 proven on the real paginated surface in chromium/firefox/webkit: one-page opens at scaleX < 0.1 (was 1.0); multi-page starts near 0, grows strictly on turn 2, stays monotonic to the last page, which remains strictly below 1.0

## Task Commits

Each task was committed atomically:

1. **Task 1: Pure offset-anchored ratio helper + boundary unit tests (TDD)** — `df22377` (test: RED) + `47d3cbe` (feat: GREEN)
2. **Task 2: PaginatedSurface ratio path + ProgressHairline page-prop removal** — `c63a26b` (feat)
3. **Task 3: First-paint progress boundary e2e (SC#2)** — `03f289d` (test)

_TDD gate: Task 1 followed RED (5 tests failing on the missing module) → GREEN (5/5 pass). No refactor needed._

## Files Created/Modified
- `src/pagination/progress.ts` — new pure module: `paginatedProgressRatio(article, fragment)`; composes anchor.ts + normalizeText.ts only
- `tests/unit/pagination/progress-formula.test.ts` — the five SC#2 boundary behaviors with hand-built canonical articles (fragmentOrder.test.ts construction patterns)
- `tests/e2e/polish/first-paint-progress.spec.ts` — Case A (seeded one-page article) + Case B (essay-long-form walk to last page), plain `test()` inheriting the 3-engine matrix
- `src/reader/PaginatedSurface.tsx` — imports paginatedProgressRatio; memoized ratio before the early return; `<ProgressHairline progress={progressRatio} />`; PageIndicator call unchanged
- `src/reader/ProgressHairline.tsx` — `page` prop + N/M branch removed from props type and component; ratio clamp path unchanged

## Decisions Made
- **Delete, don't deprecate, the page prop:** tsc is the proof no residual caller exists (plan-specified acceptance criterion); all other call sites (ArticleView scrolling, LibraryRow, BookRow, ContinueReadingStrip) already used the ratio path.
- **useMemo placement:** the memo must sit before the `pages`-null early return to respect hooks-order rules — the comment documents why the memo is above the guard.
- **pollScaleXAbove helper:** `expect.poll` cannot return the observed value needed to chain monotonic assertions, so the spec uses `page.waitForFunction` (floor predicate returning the value) — end-condition polling with value capture, zero fixed sleeps.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## Verification Results
- `npx vitest run tests/unit/pagination/progress-formula.test.ts` — 5/5 passed
- `npx vitest run` (full unit suite, Task 2 regression guard) — 1186 passed / 0 failed / 13 intentional skips
- `npx tsc --noEmit` — exit 0 (proves no residual page-prop caller)
- `npx playwright test tests/e2e/polish/first-paint-progress.spec.ts` — 6/6 passed (chromium, firefox, webkit)
- `npx playwright test tests/e2e/progress.spec.ts` (strengthen-only regression) — 15/15 passed, spec byte-unchanged
- Prohibitions: `rg -c 'react|document\.' src/pagination/progress.ts` → 0; `rg -c 'page\??:' src/reader/ProgressHairline.tsx` → 0; `rg -c waitForTimeout` on the new e2e → 0; `git diff` over the plan's commits shows `src/reader/PageIndicator.tsx`, `src/persistence/`, and `tests/e2e/progress.spec.ts` all untouched

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- POLISH-02 closed; the hairline semantics now match the library rows' D8-11 ratio and the D-05 restore coordinate system
- Ready for the remaining Phase 13 plans (13-03 acceptance records onward); no blockers

## Self-Check: PASSED

All 3 key files exist on disk; all 4 plan commits (df22377, 47d3cbe, c63a26b, 03f289d) present in git log.

---
*Phase: 13-polish-and-acceptance*
*Completed: 2026-08-19*
