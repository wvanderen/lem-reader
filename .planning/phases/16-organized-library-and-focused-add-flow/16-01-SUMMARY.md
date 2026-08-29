---
phase: 16-organized-library-and-focused-add-flow
plan: 01
subsystem: ui
tags: [react, playwright, library, filtering, accessibility]

# Dependency graph
requires:
  - phase: 14-navigation-and-library-contracts
    provides: View routes + membership policy (readingState.ts), D14-26 membership-empty states, D14-23 switcher counts
  - phase: 15-application-shell-and-destinations
    provides: librarySession restore seam (D15-11..14) that stays structurally unaffected, POLISH-07 token discipline
provides:
  - LibraryView no-matches render branch (D16-13) with Clear search and filters control resetting query + activeTag
  - All-only Continue Reading strip gate in LibraryView (D16-14; strip component byte-unchanged, D16-15)
  - CSS hooks .library-no-matches + .library-clear-filters on POLISH-07 tokens
  - e2e coverage locking LIB-09 feedback, D14-26 guard, LIB-10 placement, and D16-16 counts-purity across chromium/firefox/webkit
affects: [16-02, 16-03, 16-04, reader-choice, library-organization]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Filtered-to-zero feedback keyed on membership-non-empty + ready + post-filter zero — a render branch beside (never replacing) the membership-empty ternary arm"
    - "View gating by conditional mount (`view === \"all\" && <section>`) — absence from the DOM, not CSS hiding, is the assertable contract"

key-files:
  created: []
  modified:
    - src/ingestion/library/LibraryView.tsx
    - src/app.css
    - tests/e2e/library/search-tag-filter.spec.ts
    - tests/e2e/library/reading-views.spec.ts

key-decisions:
  - "No-matches condition requires ALL of status ready + membership non-empty (viewArticles/viewBooks) + post-filter zero (visibleItems/visibleBooks) — D14-26 holds by construction"
  - "Clear search and filters always resets BOTH query and tag (plan-specified: simpler and honest)"
  - "Quiet-button CSS treatment mirrors the .tag-chip secondary-chrome pattern (hairline border, --ink-soft, accent hover, 44px --touch) — no new tokens, zero motion properties"
  - "Tag-only filtered-to-zero proven on #/unread via a seeded mid-article location pushing the tag carrier out of the membership (ANY location ⇒ in-progress, D14-18)"

patterns-established:
  - "No-matches branch pattern: extends the list ternary's ELSE arm behind a fragment; membership-empty arm byte-stable"
  - "View-scoped conditional mounting for library regions (strip gate) — locators assert toHaveCount(0) absence"

requirements-completed: [LIB-09, LIB-10]

# Metrics
duration: 7 min
completed: 2026-08-29
status: complete
---

# Phase 16 Plan 01: No-Matches Feedback + All-Only Strip Summary

**Calm filtered-to-zero line with a working Clear search and filters control (distinct from membership empty states) plus the Continue Reading strip gated to the All view — locked by 93 green e2e cells across chromium, firefox, and webkit.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-08-29T18:52:49Z
- **Completed:** 2026-08-29T19:00:34Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- LIB-09 (D16-13): a membership-non-empty view filtered to zero rows now renders `Nothing in this view matches your filters.` + a `Clear search and filters` button that resets BOTH the query and the active tag — never masquerading as the membership empty state (D14-26 preserved byte-for-byte)
- LIB-10 (D16-14/D16-15): the continue-reading section renders on the All view only; ContinueReadingStrip.tsx is byte-unchanged — the gate lives entirely in LibraryView
- D16-16 verified: switcher accessible names stay membership-pure mid-search (counts derivation untouched; before/after name comparison + full expectSwitcherCounts lock)
- Both specs strengthened only (no existing assertion removed or relaxed): 4 new LIB-09 cases + 2 new LIB-09/LIB-10 cases, all green on the 3-engine matrix

## Task Commits

Each task was committed atomically:

1. **Task 1: No-matches branch + clear-filters + All-only strip gate in LibraryView** - `b1260b9` (feat)
2. **Task 2: Strengthen search-tag-filter + reading-views specs** - `d72ef31` (test)

## Files Created/Modified
- `src/ingestion/library/LibraryView.tsx` - No-matches render branch in the list ternary's ELSE arm (fragment-wrapped ul + p.library-no-matches with the clear-filters button); strip section gated on `view === "all"`
- `src/app.css` - `.library-no-matches` + `.library-clear-filters` rules on POLISH-07 tokens (quiet secondary-chrome pattern, 44px touch, inherited focus-visible ring, zero motion properties)
- `tests/e2e/library/search-tag-filter.spec.ts` - seedLocation helper (progress-recent clone) + 4 LIB-09 cases: query-only zero, tag-only zero (seeded in-progress carrier on #/unread), combined zero + clear-filters restore, membership-empty-under-query D14-26 guard
- `tests/e2e/library/reading-views.spec.ts` - strip gating (visible on #/, absent from the three state views) + counts-pure-mid-search (accessible-name before/after + expectSwitcherCounts)

## Decisions Made
- No-matches visibility condition: `status === "ready" && (viewArticles.length > 0 || viewBooks.length > 0) && visibleItems.length === 0 && visibleBooks.length === 0` — membership and post-filter sets kept explicitly distinct so the membership-empty arm stays untouched
- Tag-only filtered-to-zero e2e strategy: seeds a raw location (offset 10) AFTER the tag round-trip so the article-open visit cannot race the seed; ANY location flips the carrier to in-progress (D14-18), taking it out of #/unread membership while the chip strip still derives library-wide
- Button-inside-`<p>` markup (phrasing-content legal) keeps the calm line and affordance as one reading unit

## Deviations from Plan

None - plan executed exactly as written.

**TDD note (Task 2, tdd="true"):** the plan sequences the implementation (Task 1, `feat` commit) before the test task (Task 2, `test` commit), so a separately-committable RED phase was not available without reordering the plan. The new cases were written from the `<behavior>` block and validated directly against the implementation (93/93 green, 3 engines); commit shape is feat → test per the plan's own task order. The plan frontmatter is `type: execute`, so the plan-level TDD gate does not apply.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- LIB-09/LIB-10 closed; the no-matches layer and strip gate are locked by the strengthened specs
- Ready for 16-02 (focused Add dialog): LibraryView's header row is the Add button's landing zone; the `.status` live region and IngestControl remain byte-stable until that plan dissolves the add section
- No blockers

## Self-Check: PASSED

- All 4 modified files exist on disk (LibraryView.tsx, app.css, both specs)
- Both task commits present in git log (`b1260b9` feat, `d72ef31` test)
- Plan-level verification: 93/93 e2e green on chromium/firefox/webkit; ContinueReadingStrip.tsx diff empty; EMPTY_COPY byte-identical (D14-26 guard green)

---
*Phase: 16-organized-library-and-focused-add-flow*
*Completed: 2026-08-29*
