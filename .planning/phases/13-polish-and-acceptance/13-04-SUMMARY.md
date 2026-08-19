---
phase: 13-polish-and-acceptance
plan: "04"
subsystem: ui
tags: [chrome-polish, pagination, react, playwright, a11y, css]

requires:
  - phase: 13-03
    provides: ProgressHairline offset-anchored ratio + PaginatedSurface ratio plumbing (POLISH-02) that the slimmed chrome composes with
provides:
  - BackToLibrary shared back affordance (history.back + #/ fallback) on article + review views (POLISH-05, D13-15)
  - App hasAppHistory flag (first post-mount in-app hashchange) threaded to both views
  - Slim pinned article header (BackToLibrary + h1 only) with no internal scrolling at 360×640 (POLISH-03, D13-13)
  - Article-top metadata spot (byline/source/book-context/TagEntry/Export) rendered EXACTLY ONCE — flow content in scrolling mode, page-1-only inside .page-viewport in paginated mode
  - Additive pagination-engine parameter firstPageReservedPx (Option A human decision 2026-08-18): page-1 content budget = viewport − reserve, floor-clamped; pages 2+ unchanged; default 0 byte-equivalent
  - tests/e2e/chrome/header-geometry.spec.ts + tests/e2e/chrome/back-nav.spec.ts (3-engine chrome gates)
affects: [14+ any future article chrome work, pagination engine consumers, review view]

tech-stack:
  added: []
  patterns:
    - "Single-owner chrome mounting: a parent-owned element passed as a child prop (articleStartChrome) so its mount state, the page-1 fragment height, and the page index share ONE component's render — parent-state chrome lags turns by one commit"
    - "Measure-once reserve threading: one measured value feeds BOTH the engine budget (firstPageReservedPx) and the rendered fragment height, in the same rAF batch as the viewport height, so the FIRST pagination publication is already correct"
    - "Honest budget floors: a floor above physically remaining space only manufactures guard-healed overflow — floors are anti-degenerate, never space-making"

key-files:
  created:
    - src/reader/BackToLibrary.tsx
    - tests/e2e/chrome/back-nav.spec.ts
    - tests/e2e/chrome/header-geometry.spec.ts
    - tests/unit/pagination/firstPageReserved.test.ts
  modified:
    - src/App.tsx
    - src/routes/ArticleView.tsx
    - src/routes/review/ReviewView.tsx
    - src/reader/PaginatedSurface.tsx
    - src/pagination/fragmentRenderer.tsx
    - src/pagination/fragment.ts
    - src/app.css

key-decisions:
  - "Option A (HUMAN DECISION 2026-08-18, resolving the Task-2 Rule 4 checkpoint): additive engine parameter firstPageReservedPx (default 0) — page-1 budget = viewport − reserve, floor-clamped; ArticleView measures the spot once at settle and threads it through PaginatedSurface; guard/DEV-hook/anchors stay reserve-unaware; stale reserve after mid-article typography change is a documented guard-covered edge"
  - "FIRST_PAGE_BUDGET_FLOOR = 0.25 (anti-degenerate): empirically a 0.5 floor budgets ABOVE the physically remaining space → placed overflow → guard re-split → dom-fallback collapse at 360×640 (the exact failure class the decision warned about); a modest floor + honest typed fallback for degenerate reserves is the safe shape"
  - "Atomic empty-page-1 placement escape REMOVED: placing a block that exceeds the reserved budget forces the guard into an empty-first-page correction, and fragmentContainingOffset SKIPS an empty page 1 (fresh anchor 0 lands page 2 — the spot would never show); the clean typed fallback is the honest degenerate outcome. Splitting-kind full-height split retry KEPT (guard-healed)"
  - "Spot mounting moved INTO PaginatedSurface (articleStartChrome prop): a pageState-gated spot in ArticleView renders page 2 for one commit inside page-1 geometry (fragment still shrunk) — the guard measures that transient, overflows, and flipped the session to scrolling (observed on every engine)"
  - "Compact spot geometry (Rule 3): the stacked spot measured 293–322px at 360×640 (~86% of the ~370px viewport) — no engine parameter can make physical space; the compact column (meta lines + ONE actions row, TagEntry beside Export, no-wrap flexible tag input) measures ~169px desktop / ~217–246px mobile and every corpus fixture's first block keeps a legal page-1 placement"
  - "Mobile slim-header title uses whole-pixel 26px/32px sizing: inherited unitless 1.2 line-height yields fractional 31.2px wrapped lines whose scrollHeight/clientHeight rounding read as 2–3px internal scroll on chromium/firefox"
  - "TagEntry acceptance-grep note: rg 'autoFocus|\\.focus\\(' matches 2 pre-existing PROSE lines (L8/L21 discipline comments, file byte-unchanged since 08-04) — the intent (no autoFocus attribute, no focus call) is proven by the green open-every-fixture initial-focus assertions"

patterns-established:
  - "articleStartChrome single-owner mounting: page-scoped chrome derives from the page-owner's state in the same render, never from a parent's lagging mirror"
  - "Measure-once reserve: one rAF batch produces viewport height + spot reserve so the first engine publication equals the settled state (page-turn-stability contract)"
  - "Text-rect-level overflow assertions: the borderless .page-fragment's first-child margin collapses through its border box, so the fragment BOX may cross the viewport edge while text stays inside — assert live Range text rects + fragment scrollHeight (the corpus-authoritative forms), not border-box bottoms"

requirements-completed: [POLISH-03, POLISH-05]

duration: 95min
completed: 2026-08-19
status: complete
---

# Phase 13 Plan 04: Slim Header + Metadata Spot + Back-to-Library Summary

**Slim article chrome shipped on both views: a deep-link-safe BackToLibrary affordance, a pinned header reduced to back + title with zero internal scrolling at 360×640, and a compact render-once article-top metadata spot seated on a new additive engine reserve (firstPageReservedPx) — full corpus, focus, and chrome gates green across chromium/firefox/webkit.**

## Performance

- **Duration:** ~95 min for Task 2 (continuation session; Task 1 was a prior session)
- **Tasks:** 2/2
- **Files modified:** 11 (4 created, 7 modified)
- **Commits:** 5d8790e (Task 1), 8f2ebb3, 4c7c16b, 12cf39d, 6c81e4f

## What Was Built

### Task 1 — BackToLibrary + App history flag + back-nav spec (`5d8790e`)

- `src/reader/BackToLibrary.tsx`: native quiet button; `history.back()` when `hasAppHistory`, else `location.hash = "#/"` (parseHash maps unknown deep links to the list — a fresh deep-link tab never exits the app; Pitfall 7).
- `src/App.tsx`: `hasAppHistory` flips true on the first post-mount in-app hashchange (initial load and reload do not count) and is passed to both views.
- Mounted at the article header start and the review header start — identical anatomy.
- `tests/e2e/chrome/back-nav.spec.ts`: in-app return, fresh deep-link no-exit (asserts the page stays on the app origin at `#/`), review panel, and keyboard (Tab reachable, role/name, Enter activation) — 15/15 across 3 engines.

### Task 2 — Header slim + metadata spot + geometry spec, per Option A

- **Engine (additive, `8f2ebb3` + `4c7c16b`):** `paginateDocument` gains optional `firstPageReservedPx` (default 0 = byte-equivalent; proven by 65 pre-existing engine unit tests green plus explicit omitted==0 deep-equal locks). Page-1 placement budget = `pageHeight − reserve` floor-clamped at 25%; pages 2+ keep the full viewport; oversize/page-ceiling/zero-progress guards, DEV hook, and anchors stay reserve-unaware per the decision. 8 boundary unit tests in `tests/unit/pagination/firstPageReserved.test.ts`.
- **Surface (`12cf39d`):** `PaginatedSurface` threads the reserve into the engine and renders the parent-owned spot (`articleStartChrome`) exactly when `currentPageIdx === 0` — plus during the pre-pagination window so the settle-time measurement finds it laid out. The page-1 fragment height becomes `calc(100% − reserve)` via an additive `style` prop on `PageFragmentView`; pages 2+ and legacy callers keep `height: 100%` byte-unchanged.
- **ArticleView (`12cf39d`):** measures the spot's margin-box height ONCE per article at settle (same rAF batch as the viewport height — the first publication already carries the reserve, holding first-publication==settled), resets on article swap, threads `firstPageReservedPx`. Slim pinned header = BackToLibrary + h1. Scrolling mode keeps the spot as ordinary flow above the body.
- **Compact spot CSS (`12cf39d`):** meta lines + one actions row (TagEntry beside Export, never-wrapping flexible tag input). TagEntry component byte-untouched.
- **`tests/e2e/chrome/header-geometry.spec.ts` (`6c81e4f`):** 9/9 across 3 engines — paginated header `scrollHeight ≤ clientHeight` at 360×640 (strict) with zero TagEntry in the pinned header; exactly one spot/TagEntry/Export instance; page-1 text coexists with the spot inside the viewport (corpus-authoritative text-rect forms); spot unmounts after the first turn, remounts on return, page count never changes; scrolling-mode header + flow-spot cell.

## Rule 4 Checkpoint — Resolved by Human Decision

Task 2's original plan mechanism (in-flow spot inside `.page-viewport`, unaccounted by the engine) empirically broke the pagination corpus: the spot displaced page-1 content past the viewport, the post-render guard re-split, and at 360×640 the walk collapsed to dom-fallback (the 04-06/04-08 class). Surfaced as a Rule 4 architectural checkpoint (engine-contract change required).

**User selected Option A (2026-08-18):** additive engine parameter `firstPageReservedPx` (default 0), page-1 budget = viewport − reserve floor-clamped for safety, ArticleView measures the spot once at settle and threads it through PaginatedSurface, pages 2+ full budget, guard/DEV-hook/anchors untouched, ~20–30 engine lines plus boundary tests, stale-reserve-on-typography-change accepted as a documented guard-covered edge. Option A supersedes the plan's spot mechanism; implemented exactly (plus the two empirical refinements below).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Floor-above-physics budgets collapsed the corpus**
- **Found during:** Task 2 corpus gate
- **Issue:** With the decision's floor read as 50%, page-1 budget exceeded the physically remaining space (spot ≈ 86% of the 370px viewport at 360×640) → placed overflow → guard re-split → `unsupported-case@360x640` / `footnote-academic@360x640` flipped to scrolling (dom-fallback), and `page-turn-stability` failed the sparse-page bar at desktop (473 chars on page 1 vs >500).
- **Fix:** Honest modest floor (0.25, anti-degenerate only) + compact spot CSS (see #3). A floor can cap degeneracy but never creates physical space.
- **Files:** src/pagination/fragment.ts, tests/unit/pagination/firstPageReserved.test.ts
- **Commit:** 4c7c16b

**2. [Rule 3 - Blocking] Parent-state spot mounting flipped sessions to scrolling on the first turn**
- **Issue:** The WIP gated the spot on ArticleView's `pageState`, which lags PaginatedSurface's own page index by one commit — page 2 rendered once inside page-1 geometry (fragment still shrunk by the reserve), the guard measured that transient, found massive overflow, and emitted dom-fallback → session flipped to scrolling (reproduced on all engines).
- **Fix:** Single-owner mounting — ArticleView owns the spot ELEMENT but PaginatedSurface MOUNTS it (`articleStartChrome` prop) from its own `currentPageIdx`, with the page-1 fragment height set in the same render; the spot also renders during the pre-pagination window so the settle-time measurement finds it.
- **Files:** src/reader/PaginatedSurface.tsx, src/pagination/fragmentRenderer.tsx, src/routes/ArticleView.tsx
- **Commit:** 12cf39d

**3. [Rule 2 - Correctness] Stacked spot starved page 1 (geometry, not engine)**
- **Issue:** TagEntry (155px) + Export (44px) stacked made the spot 293–322px at 360×640 — no budget arithmetic leaves room for content when chrome consumes ~86% of the viewport.
- **Fix:** Compact spot anatomy: meta lines + ONE actions row (TagEntry beside Export; no-wrap flexible tag input) → ~169px desktop / ~217–246px mobile. TagEntry component byte-untouched; compaction is CSS on the spot's wrappers only.
- **Files:** src/routes/ArticleView.tsx, src/app.css
- **Commit:** 12cf39d

**4. [Rule 1 - Bug] Fractional header line-heights read as internal scrolling**
- **Issue:** The inherited unitless 1.2 line-height on the 26px mobile title produces fractional 31.2px wrapped lines; scrollHeight/clientHeight integer rounding read 2–3px as "internal scroll" on chromium/firefox (the D13-13 bar is no internal scrolling at 360×640).
- **Fix:** Whole-pixel `line-height: 32px` on the mobile slim-title (ratio 1.23 display leading) — removes the rounding class entirely; paginated assertion stays strict (≤ clientHeight), scrolling cell keeps the corpus 2px tolerance.
- **Files:** src/app.css
- **Commit:** 12cf39d

**5. [Rule 3 - Test-integrity] Fragment border-box assertions vs margin collapse-through**
- **Issue:** The borderless `.page-fragment`'s first-child block margin collapses through its border box, so the fragment BOX can cross the viewport edge by ~10px while all text stays inside (the engine budgets the collapsed margin internally — text-correct).
- **Fix:** header-geometry asserts the corpus-authoritative forms (live Range text rects + fragment scrollHeight) instead of border-box bottoms.
- **Files:** tests/e2e/chrome/header-geometry.spec.ts
- **Commit:** 6c81e4f

## Verification

- `npx playwright test tests/e2e/chrome/back-nav.spec.ts tests/e2e/chrome/header-geometry.spec.ts` — 24/24 green (chromium/firefox/webkit)
- `npx playwright test tests/e2e/pagination/ tests/e2e/open-every-fixture.spec.ts tests/e2e/chrome/` — **276/276 green** (includes no-overflow-invariant full 18-cell corpus matrix, page-turn-stability, page-turn-controls, initial-pagination-even, coverage/termination/fallback, open-every-fixture initial-focus)
- `npx vitest run tests/unit tests/component` — 1197 passed / 0 failed (65 pre-existing engine tests green = default-0 byte-equivalence; 8 new firstPageReserved boundary tests)
- `npx tsc --noEmit` — clean
- 09-07 geometry cap rule byte-unchanged in the git diff; chapter-nav rules unchanged; effectiveMode/sessionModeOverride lines byte-unchanged; zero transition/animation properties in added CSS lines
- `rg -c 'autoFocus|\.focus\(' src/reader/TagEntry.tsx` returns 2 — both are the file's own pre-existing discipline PROSE (L8/L21, byte-unchanged since 08-04); the inert-at-mount intent is proven by the green open-every-fixture initial-focus assertions (see key-decisions note)

## Known Stubs

None.

## TDD Gate Compliance

N/A (plan type: execute; no tdd="true" tasks).

## Self-Check: PASSED

All 5 created files exist on disk; all 5 task commits (5d8790e, 8f2ebb3, 4c7c16b, 12cf39d, 6c81e4f) verified present in git log.
