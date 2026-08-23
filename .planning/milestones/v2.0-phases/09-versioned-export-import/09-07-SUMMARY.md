---
phase: 09-versioned-export-import
plan: 07
subsystem: testing
tags: [playwright, css-grid, pagination, e2e, honest-suite, gap-closure]

# Dependency graph
requires:
  - phase: 08-markdown-pipeline-and-personal-library
    provides: deferred-items.md ledger of 24 pre-existing e2e failures + the honest-suite gate that surfaced them
  - phase: 09-versioned-export-import (09-01..09-06)
    provides: green portability work this plan's full-suite gate must not destabilize
provides:
  - The 24-cell (grown to 39 affected cells) pre-existing e2e deficit closed with a root-cause production fix
  - 09-07-OUTPUT.md — the permanent honest-suite record (exit 0, per-engine counts, root-cause diagnosis)
  - Phase 08 deferred-items.md closure note
  - A page-viewport geometry guarantee: the reading page always keeps >= 75% of the pinned paginated surface
affects: [v2.0 milestone close-out, any future plan touching paginated-surface geometry or the article header]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "minmax(auto, N%) capped grid row + scroll-container header: guarantee a minimum content viewport when aux chrome grows beyond a layout's original assumption"
    - "In-page module replay via Vite dev-server imports (import('/src/...ts') in page.evaluate) to exonerate or convict production modules before changing anything"

key-files:
  created:
    - .planning/phases/09-versioned-export-import/09-07-OUTPUT.md
  modified:
    - src/app.css
    - tests/e2e/library/browse-open.spec.ts
    - tests/e2e/section-announce.spec.ts
    - .planning/phases/08-markdown-pipeline-and-personal-library/deferred-items.md

key-decisions:
  - "Header cap at 25% (page >= 75%) over larger caps: reading dominance is the product's core value; 25% passed all 168 matrix cells empirically and leaves engine-threshold headroom"
  - "Scrollable header over clipped/hidden/collapsed header: keeps TagEntry + Export highlights reachable at narrow widths (no a11y regression for interactive controls)"
  - "dexie-migration needed zero changes: the aria-labelledby accessible name resolves against the byte-stable LibraryRow; the recorded 08-05 failure did not reproduce (green x 3 engines, x2 repeats)"
  - "09-06-deferred stacked-modal focus item stays OPEN: Rule 4-adjacent product decision (all three candidate resolutions reverse or complicate deliberate 09-05 decisions); not in this plan's scope and not required by the honest gate"

patterns-established:
  - "Honest-gate debt closure: reproduce -> in-page module replay to test the recorded hypothesis -> fix the real seam -> record both failing and passing runs verbatim"

requirements-completed: [PAGE-03, PAGE-04, ANNO-01, STATE-04]

# Metrics
duration: 34min
completed: 2026-08-15
status: complete
---

# Phase 9 Plan 07: Pre-existing Failure Debt Closure + Honest Full-Suite Gate Summary

**Root-caused the 24-cell pagination/capture/migration deficit to Phase 8/9 header growth collapsing the paginated page viewport (one CSS geometry fix), de-flaked 2 webkit load races, and recorded the full `npm run test` exit-0 honest record (1674 passed / 0 failed / 13 intentional skips).**

## Performance

- **Duration:** 34 min
- **Started:** 2026-08-15T19:29:28Z
- **Completed:** 2026-08-15T20:04:26Z
- **Tasks:** 3
- **Files modified:** 5 (1 production CSS, 2 test specs, 2 planning records)

## Accomplishments
- **Diagnosed and fixed the real root cause** of the pagination regression: the provenance header (Phase 8-04 TagEntry ~155px + Phase 9-05 Export button 44px at 360px width) outgrew the pinned paginated article's `grid-template-rows: auto minmax(0,1fr)` assumption, collapsing `.page-viewport` to 67px (bogus `oversized-block` fallback at 360x640) and to 0px at ≤320x420 (pagination never ran; the DEV hook never published; the pathological specs timed out). Fix: `minmax(auto, 25%)` capped header row + scrollable header — the reading page always keeps ≥75% of the surface.
- **Disproved the recorded Vite 8/Rolldown microtask-timing hypothesis** via in-page module replay: `measureAllBlocks` + `paginateDocument` returned ok at every swept height (380–560px) against the live body — the measurement/pagination modules were never broken. The deficit had also silently grown from 18 to 33 pagination cells (the 09-05 button pulled more fixtures under the broken geometry).
- **Closed all six capture/migration cells**: the figure-caption capture cells shared the same geometry root cause (verified by reverting the fix in-place — they fail with old geometry, pass with the fix); the dexie-migration v3→v4 cells were never stale against LibraryView's row shape (aria-labelledby resolves; failure did not reproduce) — zero spec and zero production changes there.
- **Honest full-suite gate green**: `npm run test` in ONE invocation exits 0 — unit 851 passed / 0 failed / 7 skipped; e2e 823 passed / 0 failed / 6 skipped (2 documented SSRF residuals per engine) across chromium/firefox/webkit + the throttled perf profile. Both the failing first run (exit 1, 2 webkit load races) and the clean second run are recorded verbatim in 09-07-OUTPUT.md.

## Task Commits

Each task was committed atomically:

1. **Task 1: Diagnose and fix the 18 (→33) pagination regression cells** - `de0b800` (fix)
2. **Task 2: Fix capture-highlight (3 cells) + dexie-migration (3 cells)** - no commit (zero changes required; Task 1's root-cause fix propagated green — verification evidence in 09-07-OUTPUT §5)
3. **Task 3: Honest full-suite gate + permanent record** - `9459da1` (test: 2 webkit de-flakes surfaced by the first full run) + `079b7e7` (docs: 09-07-OUTPUT.md + deferred-items closure note)

**Plan metadata:** committed with SUMMARY (docs commit follows)

## Files Created/Modified
- `src/app.css` - paginated-surface header row capped at 25%; header becomes a scroll container (min-height:0 + overflow-y:auto)
- `tests/e2e/library/browse-open.spec.ts` - baseline row count converted from a racy one-shot read to the sibling test's auto-retrying toHaveCount
- `tests/e2e/section-announce.spec.ts` - test.setTimeout(60_000) for full-suite load contention (assertions unchanged)
- `.planning/phases/09-versioned-export-import/09-07-OUTPUT.md` - permanent honest-suite record (mirrors 04-11-OUTPUT.md)
- `.planning/phases/08-markdown-pipeline-and-personal-library/deferred-items.md` - closure note for the 24-cell debt

## Decisions Made
- **Header cap 25% / page ≥75%** — reading dominance is the calm-booklike contract; 25% passed all 168 matrix cells with engine-threshold headroom (tallest atomic block 223px vs 0.9×370px threshold at 360x640).
- **Scrollable header rather than clipping or hiding** — tags/export remain reachable at narrow widths; title/byline/link always fit inside the cap; no interactive control becomes unreachable (WCAG-safe).
- **Strengthen-only discipline satisfied trivially** — the four pagination spec files are byte-unchanged; no assertion was touched because the engine contract ("ok" status at the matrix cells) is genuinely restored by the geometry fix.
- **09-06-deferred stacked-modal focus item left OPEN** — Rule 4-adjacent product decision; the honest gate does not require it (09-06 already asserts universal trap safety + operability on all engines). Owner: future plan / human choice.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Two webkit cells raced under full-suite parallel load (first honest-gate run exit 1)**
- **Found during:** Task 3 (honest full-suite gate)
- **Issue:** `browse-open` baseline count (one-shot `.count()` vs async library load → 0 of 6 rows) and `section-announce` beforeEach `page.goto` exceeding the 30s default budget under sibling-worker starvation. Both pass in isolation; both are pre-existing harness races surfaced by the suite's Phase 9 growth, now in scope per Task 3's "fix it and re-run until clean" mandate.
- **Fix:** Auto-retrying `toHaveCount` (the sibling LIB-01 pattern) + `test.setTimeout(60_000)` (calibration/perf harness precedent). Assertions unchanged.
- **Files modified:** tests/e2e/library/browse-open.spec.ts, tests/e2e/section-announce.spec.ts
- **Verification:** Both specs 27/27 green × 3 engines; the subsequent FULL invocation exited 0.
- **Committed in:** 9459da1

**2. [Rule 3 - Blocking] Deficit scope had grown beyond the recorded 24 cells**
- **Found during:** Task 1 (reproduction)
- **Issue:** The pagination deficit was 33 cells, not 18 — Phase 9-05's Export-highlights button added 44px more header height, pulling footnote-academic/list-reference (coverage) and essay-long-form/footnote-academic/list-reference (no-overflow) under the broken geometry.
- **Fix:** Same single root-cause fix covers the larger set; growth documented in 09-07-OUTPUT.md §2 so the record is honest about scope.
- **Files modified:** (none additional — covered by de0b800)
- **Verification:** 168/168 target-spec cells green; full pagination directory 210 green.
- **Committed in:** de0b800 (diagnosis note in commit message)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking scope discovery)
**Impact on plan:** Both fixes essential to the honest exit-0 gate. No scope creep — the second deviation was a scope DISCOVERY (larger deficit, same fix).

## Issues Encountered
- The dexie-migration failure recorded at Phase 08 did not reproduce (green × 3 engines, ×2 repeats on firefox/webkit, plus the full-suite runs). The deferred-items' "FixtureList→LibraryView rename casualty" hypothesis was wrong — the row shape is byte-stable by design and the aria-labelledby accessible name resolves correctly. Closed with zero changes and documented in 09-07-OUTPUT §5 rather than re-authoring a spec that already asserts the right semantics.
- The 09-06-deferred stacked-modal focus item (deferred-items.md in the Phase 09 directory) remains OPEN by design: it needs a human product decision among three structural options; none is auto-fixable without reversing deliberate 09-05 decisions.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 9 is complete: all 7 plans executed; the full suite is honestly green end-to-end including all portability work (851 unit + 823 e2e cells, exit 0).
- The v2.0 milestone close-out (`/gsd-complete-milestone`) can proceed on this record.
- The stacked-modal focus divergence (09-phase deferred-items.md) is the one open product decision carried forward.

---
*Phase: 09-versioned-export-import*
*Completed: 2026-08-15*
