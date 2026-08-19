---
phase: 13-polish-and-acceptance
plan: "09"
subsystem: ui
tags: [chrome-polish, pagination, react, playwright, first-paint, a11y]

requires:
  - phase: 13-04
    provides: Option A firstPageReservedPx reserve contract + articleStartChrome single-owner mounting the geometry gate rewrite must preserve
  - phase: 13-01
    provides: cold-load navigation-start recorder discipline (plain-JS init script, about:blank hop, mirror seeding)
  - phase: 04-08
    provides: the hidden .article-body-measurement clone that the pending branch re-uses as its measurement source
provides:
  - G4 closed at the user bar — zero jumping on paginated first load: the pinned paginated frame + a calm role=status placeholder is the first stable paint, never scroll-then-swap
  - paginatedPending render branch in ArticleView (measurement clone + placeholder viewport, zero new CSS)
  - isPaginated-gated article/main/hairline classes so the frame and its locks are present from the first paint through the pending window
  - geometry-effect gate rewritten to isPaginated + trustedView-committed (trustedView now owns the read ordering; height + spot reserve still land in the same rAF batch)
  - tests/e2e/polish/first-paint-mode-surface.spec.ts — the strengthened POLISH-01/02 mode-surface contract (2 tests × 3 engines, navigation-start recorder, frame-stability clauses)
affects: [future article-surface work, pagination consumers, any spec asserting on first-paint surfaces or the footnote round-trip]

tech-stack:
  added: []
  patterns:
    - "Effective-mode class gating: frame classes (paginated-surface / paginated-main) follow the EFFECTIVE mode, not the settled state, so the frame is byte-stable from first paint; render branches still gate on the settled state"
    - "Pending-branch placeholder: the pre-settle window renders the measurement clone + a polite role=status paragraph inside the real .page-viewport — no new CSS, no spinner, unwedgeable via the dom-fallback session flip"
    - "Read-ordering by commit, not by class: when a class arrives earlier than the data it used to order, gate the read on the commit that produces the data (trustedView) so batched publications stay atomic"

key-files:
  created:
    - tests/e2e/polish/first-paint-mode-surface.spec.ts
  modified:
    - src/routes/ArticleView.tsx
    - tests/e2e/open-every-fixture.spec.ts
    - tests/component/ArticleView.test.tsx
    - tests/e2e/library/upload-queue.spec.ts

key-decisions:
  - "paginatedPending = isPaginated && !paginatedActive drives a third render branch carrying the same hidden measurement clone as the active branch (the engine measures the full block set during pending — identical to the active-state 04-08 mechanism) plus .page-viewport > p.meta[role=status] with copy 'Preparing pages…' — zero new CSS"
  - "Geometry gate: the .paginated-surface class-presence check can no longer order the .page-viewport height read (the class now arrives with the pending frame, before the reserve exists — an early reserve-less first publication would be the 13-04 regression); the isPaginated && trustedView !== null early return preserves the same-rAF-batch contract (05-06 mega-page + 13-04 measure-once, proven by initial-pagination-even green)"
  - "The recorder distinguishes the loading state's status region (a DIV, 'Opening article…') from the pending placeholder by tag + location: the placeholder is a P[role=status] inside .page-viewport; __mainLockedFirst reads the main ancestor of the FIRST .article-body (the loading main never bears the article)"
  - "Footnote round-trip + ArticleView component tests pinned to scrolling mode — both implicitly rode the removed pending-window scrolling paint; the interactions they test (native fragment scrolling, DOC-03 spot content) are scrolling-flow concerns, and webkit needs prepareFreshPage's wait-for-mount before Dexie seeding (seeding concurrent with the first open loses the write)"

patterns-established:
  - "First-paint surface contracts are asserted from navigation start via a MutationObserver init script recording insertions/attribute-drops — post-hoc DOM inspection cannot see a transient wrong surface"
  - "Test seeding on webkit: always wait for app mount (prepareFreshPage) before raw IndexedDB seeding; a put racing Dexie's initial version-upgrade open silently loses the write"

requirements-completed: [POLISH-01, POLISH-02]

duration: 19min
completed: 2026-08-19
status: complete
---

# Phase 13 Plan 09: First-Paint Mode Surface (G4) Summary

**Paginated cold loads now paint the pinned paginated frame with a calm "Preparing pages…" placeholder from the very first insertion — the scrolling surface and its hairline never appear — enforced by a navigation-start 3-engine contract proving zero visible block insertions before the first page fragment and an immobile header across the placeholder→page-1 swap.**

## Performance

- **Duration:** ~19 min
- **Started:** 2026-08-19T21:14:27Z
- **Completed:** 2026-08-19T21:33:49Z
- **Tasks:** 2/2
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments
- G4 closed at the user's zero-jumping bar: the `paginatedPending` branch renders the hidden measurement clone + a polite placeholder viewport while measurement settles, so the first stable paint in paginated mode is the paginated frame itself — never scroll-then-swap
- Frame classes (`paginated-surface` on the article, `paginated-main` on main, and the html/body `:has` overflow locks they drive) gate on the effective mode, present from the first article insertion through the placeholder→page-1 transition; the scrolling hairline gate widened to `!isPaginated`
- The geometry effect's height read is now ordered by `trustedView` commit instead of class presence — the first publication still carries page height + `firstPageReservedPx` reserve together (initial-pagination-even green on all 3 engines; the 05-06/13-04 contracts hold with PaginatedSurface.tsx, fragment.ts, and firstPageReserved.test.ts byte-unchanged)
- The strengthened POLISH-01/02 contract: a plain-JS MutationObserver recorder proves first-article class, main lock, zero pre-fragment visible blocks (the G4 must-not), placeholder presence, no class drop, header immobility (≤1px), and viewport-height equality (≤2px); a scrolling twin proves no placeholder ever and a scrolling first paint

## Task Commits

Each task was committed atomically:

1. **Task 1: paginatedPending branch — stable placeholder frame** - `a2c6f19` (fix)
2. **Task 2: first-paint-mode-surface e2e contract** - `7a5d4f0` (test)

**Deviation fixes:** `c4dddbc` (Rule 3, pre-existing tsc break), `597cb31` (Rule 1, footnote e2e), `987003c` (Rule 1, component tests)

**Plan metadata:** recorded below in the docs commit.

## Files Created/Modified
- `src/routes/ArticleView.tsx` — paginatedPending derivation + branch, isPaginated-gated article/main/hairline classes, trustedView-ordered geometry gate with rewritten comment
- `tests/e2e/polish/first-paint-mode-surface.spec.ts` — the G4 contract (2 tests × 3 engines, navigation-start recorder, frame-stability clauses, zero fixed sleeps)
- `tests/e2e/open-every-fixture.spec.ts` — footnote round-trip pinned to scrolling mode (Rule 1 deviation)
- `tests/component/ArticleView.test.tsx` — component tests pinned to scrolling via the settings mirror (Rule 1 deviation)
- `tests/e2e/library/upload-queue.spec.ts` — input `.value` reads typed (Rule 3 deviation, pre-existing tsc break)

## Decisions Made
- Placeholder rides existing `.meta` typography inside the real `.page-viewport` — zero new CSS, zero motion, polite `role="status"` announcement; copy exactly `Preparing pages…` (U+2026)
- The pending branch mounts the SAME hidden measurement wrapper as the active branch, giving `useMeasurement` the full `[data-block-index]` set with valid geometry during pending — the 04-08 mechanism, just earlier
- Fallback interplay preserved without new machinery: dom-fallback → session override → scrolling flips `isPaginated` false, classes revert, scrolling body mounts with the honest banner (a disclosed mode change, not a jump)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pre-existing tsc failure in upload-queue.spec.ts**
- **Found during:** Task 1 (verification gate `npx tsc --noEmit`)
- **Issue:** 13-08's `fileInput.evaluate((el) => el.value)` reads `.value` on `HTMLElement | SVGElement` — the type gate failed before this plan's changes could be verified (Playwright transpiles without typecheck, which is why 13-08's e2e stayed green)
- **Fix:** cast to `HTMLInputElement` inside the evaluate callback at the 4 read sites; zero runtime change
- **Files modified:** tests/e2e/library/upload-queue.spec.ts
- **Verification:** `npx tsc --noEmit` clean
- **Committed in:** `c4dddbc` (separate commit so the Task-1 diff stays only ArticleView.tsx)

**2. [Rule 1 - Bug] footnote round-trip e2e relied on the removed pending-window scrolling paint**
- **Found during:** plan verification (`tests/e2e/open-every-fixture.spec.ts` failed on all 3 engines)
- **Issue:** the Gap-3 test clicked the footnote marker inside the pre-settle scrolling body — the exact surface G4 removed; in settled paginated mode the DOM-first marker lives in the hidden measurement clone (never visible) and footnote bodies sit on other pages
- **Fix:** pinned the test to scrolling mode via persisted settings in BOTH truths (Dexie row + mirror init script, DEFAULT_SETTINGS-derived record) with the about:blank cold-load hop; `prepareFreshPage` before seeding (a raw IndexedDB put racing Dexie's first open loses the write on webkit — observed, fixed by the wait-for-mount discipline)
- **Files modified:** tests/e2e/open-every-fixture.spec.ts
- **Verification:** 24/24 cells green across chromium/firefox/webkit
- **Committed in:** `597cb31`

**3. [Rule 1 - Bug] ArticleView component tests relied on the same removed window**
- **Found during:** plan verification (`npx vitest run`: 2 DOC-03 source-link tests failed)
- **Issue:** jsdom's layout-less measurement never settles, so under the paginated default the component now (correctly) stays in the pending branch where the metadata spot never mounts
- **Fix:** beforeEach seeds the POLISH-01 lazy-init mirror with scrolling settings; Dexie is unavailable in this env so hydration fails quiet and the mirror value holds deterministically
- **Files modified:** tests/component/ArticleView.test.tsx
- **Verification:** full unit suite 1200 passed / 13 skipped (the documented intentional set)
- **Committed in:** `987003c`

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 bug)
**Impact on plan:** All three fixes were required to execute the plan at all (type gate) and to keep the honest full-suite verification green after the user-directed behavior change. No scope creep; production surface touched only where the plan specified.

## Issues Encountered
- The webkit seeding race (deviation 2) was diagnosed with a temporary probe: the mirror came back rewritten to paginated defaults because hydration had read no Dexie row — the raw put was lost when it raced Dexie's initial version-upgrade open. Resolved by the prepareFreshPage wait-for-mount discipline; probe removed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- G4 closed; the placeholder→page-1 transition is pinned by a permanent 3-engine contract
- PaginatedSurface.tsx / fragment.ts / firstPageReserved.test.ts byte-unchanged (verified via git diff over the plan's commits)
- Plan 13-10 remains for the phase

---
*Phase: 13-polish-and-acceptance*
*Completed: 2026-08-19*

## Self-Check: PASSED

- SUMMARY.md exists on disk; all 5 plan commits (c4dddbc, a2c6f19, 7a5d4f0, 597cb31, 987003c) found in git log
- All Task acceptance criteria re-verified: `paginatedPending` branch + exact `Preparing pages…` copy present; article/main/hairline gate on `isPaginated`; geometry gate `!isPaginated || trustedView === null` before the read; Task-1 commit diff is only ArticleView.tsx; hard-wait helper search in the new spec returns 0
- Plan verification battery green: polish/ 18 passed; pagination/ + open-every-fixture 234 passed; chrome/header-geometry 9 passed; vitest 1200 passed / 13 skipped; tsc clean — all on the default 3-engine matrix with whole-file invocations
- Byte-freeze: git diff over the plan's commits touches none of src/reader/PaginatedSurface.tsx, src/pagination/fragment.ts, tests/unit/pagination/firstPageReserved.test.ts
