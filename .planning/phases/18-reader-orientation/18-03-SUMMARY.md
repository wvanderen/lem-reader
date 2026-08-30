---
phase: 18-reader-orientation
plan: "03"
subsystem: ui
tags: [restoration-marker, location-persistence, paginated-restore, save-on-turn, passive-cue, reduced-motion, banner-retirement, accessibility]

# Dependency graph
requires:
  - phase: 18-reader-orientation
    provides: "18-02 — the ArticleView TOC seams + confirmation the 18-03 seams (restore effect, ResumeBanner wiring, app.css blocks) were untouched"
  - phase: 02-reading-experience
    provides: "STATE-01 restore effect + useScrollSave debounced/dual-flush discipline + findScrollTarget/computeTopVisibleOffset (restoreLocation.ts)"
  - phase: 04-reading-experience
    provides: "D5-11 tail (fragmentContainingOffset → turnToPage), PaginatedSurfaceHandle, the deep-link readiness-gate template (RETRY_CAP_MS 5000), the hidden .article-body-measurement clone discipline (Pitfall 7)"
provides:
  - Paginated location persistence — handleAnchorChange feeds per-turn offsets through useScrollSave's returned scheduleLocationSave scheduler (same debounce + dual flush + LocationRecord shape; call-site family stays singular)
  - Readiness-gated paginated reopen-restore — bounded rAF retry until the first pagination commit, then fragmentContainingOffset → turnToPage (the deferred "option (b)" gap closed)
  - RestorationMarker.tsx — the passive transient cue (4px accent bar at the restored block/page + verbatim polite announce), reopen-restore ONLY, 3400ms fade / 4000ms unmount, CSS-transition-only
  - The full ResumeBanner retirement (D18-06) — component deleted, wiring swapped, both CSS blocks removed, both e2e assertion sites re-targeted, grep gate clean
affects: [18-reader-orientation (Plan 18-04 extends restoration-cue.spec with paginated + matrix cells), reader restore surface, library progress (paginated readers now persist locations)]

# Tech tracking
tech-stack:
  added: [] # zero installs (T-18-SC accept)
  patterns:
    - external offset-source scheduler returned from a side-effect hook — the paginated path shares the scroll path's debounce/dual-flush with latest-wins semantics (an initial page-1 offset-0 schedule is replaced by the restore turn's offset before the 1200ms timer fires)
    - async-resolution-time mode reads via ref (isPaginatedRef) — a closure capture would freeze the pre-hydration mode on cold loads
    - attach-target geometry computed once in useLayoutEffect relative to the article box (the marker's positioned anchor) — bar scrolls with content; zero rAF style writes (Pitfall 8)

key-files:
  created:
    - src/reader/RestorationMarker.tsx
    - tests/unit/RestorationMarker.test.tsx
    - tests/e2e/toc/restoration-cue.spec.ts
  modified:
    - src/reader/useScrollSave.ts
    - src/routes/ArticleView.tsx
    - src/app.css
    - tests/e2e/persistence.spec.ts
    - tests/e2e/chrome/mobile-first-page-chrome.spec.ts
    - tests/e2e/library/reading-views.spec.ts
    - tests/e2e/chrome/back-nav.spec.ts
  deleted:
    - src/reader/ResumeBanner.tsx

key-decisions:
  - "Scheduler export, not a fork: useScrollSave RETURNS scheduleLocationSave(offset) and its scroll listener now routes through the same function — ONE LocationRecord construction site, ONE saveLocation call-site family, no schema change (T-18-07)"
  - "The paginated restore branch reads the mode from isPaginatedRef at loadLocation-RESOLUTION time (never the effect closure): on cold loads settings hydrate asynchronously, so a captured isPaginated could route a scrolling-preferring reader into a paginated wait that never commits — the mid-retry mode-flip guard stops honestly (the D4-10 anchor already owns the passage)"
  - "Marker mount is gated on genuine restore-landing via a one-shot per-article ref (restorationMarkerArticleRef) — both restore branches set it; first-open-null, TOC jumps, and deep-link arrivals (jumpPendingRef) can never mount it (D18-08/rule 11)"
  - "The scrolling branch of the restore effect is byte-stable; the paginated branch reuses the deep-link readiness template VERBATIM in shape (RETRY_CAP_MS 5000, T-18-08 bounded degrade to page-1 with NO marker)"

patterns-established:
  - ".article-body is position:relative (layout-neutral) — the marker's absolute anchor in BOTH modes; geometry is article-relative so the bar scrolls with content"
  - "The paginated marker bounds honestly against the header line + viewport, not the article box — the page fragment's full box can extend a few px past the article's overflow:clip bottom (clipped visually)"

requirements-completed: [ORNT-06]

# Metrics
duration: 22min
completed: 2026-08-30
status: complete
---

# Phase 18 Plan 03: Restoration Honesty Summary

**Paginated save/restore gaps closed with existing machinery (debounced turn saves + readiness-gated reopen-restore), the passive transient RestorationMarker replaces the retired banner across all four surfaces — 39/39 restore cells + 1047/1047 unit green across 3 engines**

## Performance

- **Duration:** 22 min (started 2026-08-30T16:29:21Z, completed 2026-08-30T16:51:18Z)
- **Tasks:** 3 (Task 2 TDD: RED → GREEN; Tasks 1/3 auto + 1 Rule-1 adjacency fix)
- **Files:** 10 modified/created, 1 deleted

## Accomplishments
- **Paginated saves (Pitfall 2)** — `useScrollSave` returns a stable `scheduleLocationSave(offset)` scheduler sharing the SAME 1200ms debounce, visibilitychange-hidden + pagehide dual flush, and LocationRecord shape; `handleAnchorChange` feeds every per-turn offset through it. Latest-wins semantics keep a reopen-restore from overwriting the saved location with the initial page-1 commit's offset 0. The `saveLocation` call-site family stays singular (rg-verified); zero Dexie/schema changes.
- **Paginated reopen-restore (Pitfall 1)** — the restore effect's new branch (mode read from `isPaginatedRef` at async-resolution time) reuses the deep-link readiness template VERBATIM in shape: bounded rAF retry (RETRY_CAP_MS 5000) until the first pagination commit, then `fragmentContainingOffset(pages, loc.graphemeOffset, article)` → `surfaceRef.turnToPage(pageIdx)`. The jumpPendingRef guard (deep-link precedence) and the scrolling branch stay byte-stable. The retired "option (b)" deferral comment in persistence.spec is gone, replaced by two new cells: seeded deep offset → reopen lands past page 1, and two PageDown turns → reload reopens on page 3.
- **RestorationMarker (ORNT-06)** — 4px solid `--accent` bar (the ONE new sanctioned accent consumption), absolutely positioned + pointer-events none, geometry resolved at mount via `findScrollTarget` over visible blocks (scrolling; measurement clone excluded — Pitfall 7) or the visible `.page-fragment` (paginated). The announce region is the retiring banner's discipline VERBATIM: visually-hidden `role="status"` / `aria-live="polite"` / `aria-atomic="true"` with "Returned to where you left off." (D18-05). Lifecycle 3400ms `is-fading` + 4000ms self-unmount, CSS-transition-only (the global reduced-motion gate kills the fade — Pitfall 8; the unit suite asserts ZERO rAF calls). Marker mount is gated on genuine restore-landing (one-shot per-article ref) — never first-open-no-location, never TOC jumps, never deep-links (D18-08).
- **Banner retirement (D18-06)** — `ResumeBanner.tsx` deleted; ArticleView wiring (state flag, auto-dismiss listeners, both handlers, render mount, import) swapped in place; BOTH app.css rule blocks (base card + ≤639px bottom-sheet tuning) deleted whole with remaining hyphenated comment references reworded; the two phase-owned e2e assertion sites re-targeted to marker + announce with D18-06 citations (reading-views keeps the restore-beats-h1 invariant). Gate: `rg 'resume-banner|Resume reading|Start from top'` over src/ + tests/ returns ZERO hits; the announce string exists exactly once in src/ (inside RestorationMarker).
- **Verification** — persistence 27/27 + restoration-cue 12/12 across chromium/firefox/webkit; both banner-site specs 72/72; adjacency sweep (library/, chrome/, section-announce, touch-targets/reflow/high-zoom 417 cells; jump-bidirectional/a11y/last-valid-view/round-trip 78 cells) green after one Rule-1 fix; full unit project 1047/1047; zero package installs; zero Dexie changes.

## Task Commits

Each task was committed atomically:

1. **Task 1: Paginated location saves + readiness-gated paginated reopen-restore** — `d68d0ec` (feat)
2. **Task 2: RestorationMarker component + restore-effect swap + marker CSS + tests (TDD)** — `b55de8c` (test — RED: suite fails on the missing module) → `d34619a` (feat — GREEN: 5/5 unit + 12/12 e2e)
3. **Task 3: Banner retirement sweep across all four surfaces** — `f87f847` (feat)

## Files Created/Modified
- `src/reader/useScrollSave.ts` (MODIFIED) — exports `ScheduleLocationSave`; the scroll listener routes through the same scheduler (one record-construction site); returns it for the paginated path
- `src/routes/ArticleView.tsx` (MODIFIED) — scheduler capture + handleAnchorChange wiring; isPaginatedRef; the paginated restore branch; restorationMarker state + one-shot ref replacing ALL banner wiring; the marker mount inside `<article>`
- `src/reader/RestorationMarker.tsx` (NEW) — the passive transient cue (anatomy + attach resolution + lifecycle + announce)
- `src/app.css` (MODIFIED) — `.article-body` gains layout-neutral `position:relative`; FILE-END `.restoration-marker` block (4px accent bar, 600ms opacity fade, forced-colors CanvasText); both retired banner blocks deleted
- `src/reader/ResumeBanner.tsx` (DELETED) — announce discipline survives verbatim inside the marker
- `tests/unit/RestorationMarker.test.tsx` (NEW) — 5-case RTL suite (announce, passivity, 3400/4000ms lifecycle with fake timers, timer cleanup, zero-rAF guarantee)
- `tests/e2e/toc/restoration-cue.spec.ts` (NEW) — 4 scrolling cells: restore cue + announce near the restored block, transient presence-then-absence, first-open silence (rule 11), content-not-shifted (overlay-only)
- `tests/e2e/persistence.spec.ts` (MODIFIED) — deferral comment retired; paginated restore + save-on-turn cells (D18-06/UI-SPEC-#8 citations)
- `tests/e2e/chrome/mobile-first-page-chrome.spec.ts` (MODIFIED) — marker + announce assertions; geometry re-targeted to the marker box (D18-06 citation)
- `tests/e2e/library/reading-views.spec.ts` (MODIFIED) — marker + announce assertions; restore-beats-h1 invariant preserved (D18-06 citation)
- `tests/e2e/chrome/back-nav.spec.ts` (MODIFIED) — Rule-1 Tab-budget re-calibration (see Deviations)

## Verification Results
- `npx playwright test tests/e2e/persistence.spec.ts` — **27/27 pass** (3 engines; includes the 2 new paginated cells)
- `npx vitest run tests/unit/RestorationMarker.test.tsx` — **5/5 pass** (RED `b55de8c` → GREEN `d34619a`); `npx playwright test tests/e2e/toc/restoration-cue.spec.ts` — **12/12 pass** (3 engines)
- Retirement gate — `! rg -q 'resume-banner|Resume reading|Start from top' src tests` exits 0 (clean); announce string count in src/ = exactly 1
- `npx playwright test tests/e2e/chrome/mobile-first-page-chrome.spec.ts tests/e2e/library/reading-views.spec.ts` — **72/72 pass** (3 engines)
- Adjacency sweep — `tests/e2e/library/` + `tests/e2e/chrome/` + section-announce + touch-targets/reflow/high-zoom: **417/417** after the back-nav fix; `jump-bidirectional + a11y + last-valid-view + portability/round-trip`: **78/78**
- `npx vitest run --project unit` — **75 files, 1047/1047 green, 0 failed**
- `npx eslint` on all touched source files — clean; `npx tsc --noEmit` — only the pre-existing unrelated dexie-migration error (deferred-items.md, unchanged)

## Decisions Made
- **Scheduler over a second save path**: exporting a callback from `useScrollSave` (rather than calling saveLocation from ArticleView) keeps the write surface singular — T-18-07's "no new write surface" mitigation is structural, not conventional.
- **Mode-mirror ref for async resolution**: the restore branch decides scrolling-vs-paginated when `loadLocation` resolves, not when the effect schedules — cold-load settings hydration otherwise freezes the default-mode value in the closure and could strand a scrolling reader in a paginated wait (bounded, but a silently missing restore). Mid-retry mode flips stop honestly: the D4-10 anchor owns the passage and no marker claim is made.
- **Paginated marker bounds**: the page fragment's layout box can extend a few px past the article's `overflow:clip` bottom (visually clipped) — the honest e2e bounds are the header line above and the viewport below, with the article-top/bottom byte-equality assertions carrying the no-shift proof.
- **Marker geometry is article-relative inline style; the CSS class owns anatomy**: `top/height/insetInlineStart` computed once from live rects (scrolling: block box −16px gutter; paginated: fragment edge −4px) so the bar scrolls with content in both modes — a fixed-position bar would drift from the restored spot the moment the reader scrolls inside its 4s window.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] back-nav (d) Tab-walk budget stale after 18-02's 5th header button**
- **Found during:** post-Task-3 adjacency sweep (the cell failed on chromium + firefox)
- **Issue:** `tabWalkUntil(page, "button.back-to-library", 8)` was calibrated to the pre-18-02 four-button article-scoped header; D18-02's locked contents button (FIRST in the group) inserted one focusable, so DOM order to the back affordance is now 9 presses. Pre-existing from 18-02 (its verification matrix did not include back-nav) — surfaced by this plan's sweep, not caused by 18-03 changes.
- **Fix:** budget 8 → 9 with an in-spec citation comment; the assertion's contract (DOM-order Tab-reachability within a bounded walk) is unchanged.
- **Files modified:** tests/e2e/chrome/back-nav.spec.ts
- **Verification:** 18/18 green (3 engines)
- **Commit:** 09bbd7e

### Plan-text adaptations (no rule number — documented for the record)

**2. isPaginatedRef mode mirror** — the plan's restore-effect insertion point implied a closure read of `isPaginated`; the ref read at async-resolution time closes a real cold-load race (settings hydration vs article load) without touching the scrolling branch. Commit: d68d0ec.
**3. `.article-body { position: relative }` (layout-neutral)** — UI-SPEC places the scrolling bar at `inset-inline-start: calc(-1 * var(--space-md))`, which requires a positioned ancestor inside the article; relative-without-offsets moves nothing and the paginated modifier already declared it. Commit: d34619a.
**4. Marker geometry as article-relative inline values** — same anatomy as the plan (4px bar, gutter/edge placement, block/page height), computed from live rects so the bar scrolls with content; the class owns the static anatomy + fade + forced-colors. Commit: d34619a.
**5. e2e tolerance calibrations** — restoration-cue's scrollY equality relaxed to the repo's ≤1px convention (firefox rounded exactly 1px over the ~5s lifecycle wait); mobile-first's marker bound targets the viewport, not the article bottom (the fragment box outextends the clip). Commits: d34619a, f87f847.
**6. useScrollSave scroll listener DRY** — `onScroll` now calls the same `scheduleLocationSave(computeOffset())` (one LocationRecord construction site); behavior identical. Commit: d68d0ec.

**Total deviations:** 1 auto-fixed (Rule 1, pre-existing) + 5 documented adaptations. **Impact:** none on contracts — every locked decision (D18-01..15), the byte-stable surfaces (parseHash, fragment guard, announcer, 48px constants, scrolling restore branch), and the saveLocation call-site family are intact.

## Issues Encountered
None. (The pre-existing dexie-migration TS error remains parked in deferred-items.md — unchanged by this plan.)

## Threat Model Compliance
- **T-18-06 (dishonest cue): mitigated** — marker mount is gated on genuine restore-landing (saved record existed AND resolved this mount); first-open silence is e2e-asserted (rule 11 cell); deep-link arrivals are suppressed by the untouched jumpPendingRef guard; the paginated marker became reachable only after Task 1's REAL restore wiring landed
- **T-18-07 (record integrity): mitigated** — same LocationRecord shape through the existing Zod-validated store; the single call-site family is rg-verified; debounced + dual-flush prevents partial/rapid-turn corruption
- **T-18-08 (unbounded retry): mitigated** — RETRY_CAP_MS 5000 bounded rAF retry (the deep-link template); failure degrades to the page-1 landing with NO marker (honest absence)
- **T-18-09 (motion bypass): mitigated** — CSS transition only; the global prefers-reduced-motion gate kills it (instant step clear); the unit suite asserts ZERO requestAnimationFrame calls in the component lifecycle
- **T-18-SC (package installs): accepted** — zero installs performed

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 18-04 extends `restoration-cue.spec.ts` (strengthen-only) with the paginated marker cells + the 3-engine×mode matrix, and ships the toc-geometry corpus cells — the harness helpers (openScrollingReady/seedLocation, the DEV `__lemPagination` readiness/offset patterns from persistence.spec) are copyable shapes
- The paginated first-open save (offset 0 after 1200ms) now updates `savedAt` on every paginated open — aligned with D8-10's "recently-read = opened" library semantics; the library suites all pass (no count drift in the seeded corpora, which clear stores per test)
- No blockers; ORNT-06 closes with this plan (both modes proven: paginated via Task 1's cells + the marker cells here and in the retired-site specs; scrolling via restoration-cue)

## Self-Check: PASSED
- Files: src/reader/RestorationMarker.tsx, tests/unit/RestorationMarker.test.tsx, tests/e2e/toc/restoration-cue.spec.ts — all FOUND; src/reader/ResumeBanner.tsx confirmed ABSENT; all modified files tracked in the task commits
- Commits: d68d0ec, b55de8c, d34619a, f87f847, 09bbd7e — all FOUND in git log

---
*Phase: 18-reader-orientation*
*Completed: 2026-08-30*
