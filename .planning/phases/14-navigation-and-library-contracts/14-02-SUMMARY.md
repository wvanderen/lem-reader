---
phase: 14-navigation-and-library-contracts
plan: 02
subsystem: library
tags: [hash-router, view-switcher, replaceState, aria-current, reading-state-views, focus-management]

# Dependency graph
requires:
  - phase: 14-navigation-and-library-contracts
    plan: 01
    provides: readingState.ts policy (articleReadingState/bookReadingState/countByState) + pageMeta.setDocumentTitle + latestLocationByArticle export
provides:
  - parseHash view-segment grammar (D14-12/D14-16) + exported LibraryViewName type
  - switchLibraryView replaceState wiring (D14-13) with direct setView — the App-owned switch handler
  - ViewSwitcher nav (aria-label "Library views", four real links, exactly one aria-current="page", counts at ready)
  - LibraryView per-view membership filtering + countByState counts + per-view empty states (D14-26) in one render body
  - Library title effect ("Saved articles — Lem Reader", constant across views) + h1 focus effects (mount warm-gated + view-switch keyed)
  - .view-switcher CSS (1100px measure, 44px links, weight+underline current-state)
affects: [14-03 (ArticleView/ReviewView title + focus layering reuses the warmMount/threading precedent), 14-04 (3-engine e2e validates every surface this plan shipped)]

# Tech tracking
tech-stack:
  added: []  # zero packages installed (T-14-SC accept)
  patterns:
    - "View switch = replaceState + DIRECT setView(parseHash()) — replaceState fires no hashchange; the direct router call is load-bearing (Pitfall 2)"
    - "Counts, membership, and empty states derive from ONE policy call-site set in the same render body — agreement is structural (D14-20/23/24)"
    - "Two focus effects per non-remounting view: mount (warm-gated) + [view]-keyed with first-run skip (Pitfall 3); no cleanup, no live region"

key-files:
  created: []
  modified:
    - src/App.tsx
    - src/ingestion/library/LibraryView.tsx
    - src/app.css
    - tests/component/App.test.tsx

key-decisions:
  - "NAV-04/LIB-07/LIB-08 NOT marked complete — 14-02 ships the full implementation (grammar, switcher, counts, empty states, focus/title), but the 3-engine real-browser proof is 14-04's documented scope; requirements-completed is [] (14-01 LIB-07 split precedent, 10-01 RECV-01)"
  - "All FIVE list-fallback assertion sites realigned (not three as planned): empty hash, bare '#/', unrecognized-route ×2, '/h/' trailing-slash, and '#/review/x' — same necessary realignment class, found via RED→GREEN runs (13-06 stale-expectation precedent; documented in both commit bodies)"
  - "stateCounts computed inline in the render body (not memoized): the in-render partition arrays (standaloneArticles) are fresh each render, so a memo would recompute anyway — totalsById carries the only expensive fold (memoized on items identity, the BookRow precedent)"
  - "LibraryViewName exported at its definition site (export type LibraryViewName = …) rather than the bottom export line — TS2484 double-export conflict; satisfies the acceptance grep and keeps the grammar surface together"

patterns-established:
  - "Modified-click guard on switcher links: defaultPrevented || button !== 0 || meta/ctrl/shift/alt → fall through to native fragment navigation (push + hashchange via the existing onHash path)"
  - "Empty states keyed on VIEW MEMBERSHIP (pre-filter), never filtered visibility — a filtered-out view renders the ul with zero children"

requirements-completed: []  # NAV-04/LIB-07/LIB-08 close at 14-04 (3-engine proof — see key-decisions)

# Metrics
duration: 8 min
completed: 2026-08-25
status: complete
---

# Phase 14 Plan 02: Navigation & Library Contracts — Reading-State Views Summary

**Real hash routes for All/Unread/In progress/Finished with a replaceState switch handler, a truthful aria-current switcher with policy-derived counts, per-view empty states, and the library title + uniform h1-focus rule**

## Performance

- **Duration:** 8 min
- **Started:** 2026-08-25T18:08:38Z
- **Completed:** 2026-08-25T18:17:09Z
- **Tasks:** 3 (Task 1 TDD: RED→GREEN)
- **Files modified:** 4

## Accomplishments

- `parseHash` grammar extended in place with match order preserved (article `/h/` regex → `#/review` → view-segment literal allowlist → All fallback); `LibraryViewName` exported; unknown `#/` segments fall back to All (D14-16); fragment guard + onHash listener byte-unchanged — 15/15 App.test.tsx green
- `switchLibraryView` (D14-13): calm same-view no-op → `history.replaceState(null, "", href)` with the four VIEW_HREFS template constants → IMMEDIATE direct `setView(parseHash())` (replaceState fires no hashchange — Pitfall 2); never touches `setHasAppHistory` (Pitfall 4, documented in-code); every existing `window.location.hash` assignment byte-unchanged (destinations keep push semantics)
- ViewSwitcher nav as first child of `section.library-section-list`: four real links, exactly one `aria-current="page"`, counts in accessible names only at `status === "ready"` (bare labels while loading — never a zero lie), modified-click guard falls through to native navigation; per-view membership (articleReadingState/bookReadingState) runs BEFORE the query/tag composition; `countByState` counts + All = standalone + book count in the SAME render body (structural agreement, D14-23/24)
- Per-view empty states keyed on membership not filtered visibility (D14-26; All copy byte-stable; a filtered-out view still renders the ul); library title effect + mount warm-gated h1 focus + `[view]`-keyed focus with first-run skip (D14-01/03/15, Pitfall 3/9 discipline); `.view-switcher` CSS with weight 600 + 2px underline current-state only (forced-colors safe)

## Task Commits

Each task was committed atomically (Task 1 TDD: RED → GREEN):

1. **Task 1 RED: view-segment failing tests** — `4bf6945` (test)
2. **Task 1 GREEN: parseHash view-segment grammar** — `0cb8cb1` (feat)
3. **Task 2: replaceState switch + ViewSwitcher + per-view filtering/counts/empty states + CSS** — `56bd54e` (feat)
4. **Task 3: library title + h1 focus effects** — `db878bf` (feat)

**Plan metadata:** see final docs commit below.

## Files Created/Modified

- `src/App.tsx` — NEW `export type LibraryViewName`; View list alternative gains `view`; NEW `VIEW_HREFS` constant table; NEW `switchLibraryView` (replaceState + direct setView, Pitfall 2/4 documented); LibraryView render call threads `view`/`onSwitchView`/`warmMount`; parseHash/onHash/fragment guard otherwise byte-unchanged
- `src/ingestion/library/LibraryView.tsx` — NEW props (`view`, `onSwitchView`, `warmMount`); NEW VIEW_LINKS/EMPTY_COPY tables; totalsById memo (BookRow precedent); per-view membership + counts via readingState in one render body; ViewSwitcher nav; membership-keyed empty states; h1 gains `tabIndex={-1}` + h1Ref; mount effect (setDocumentTitle + warmMount-gated focus) + `[view]` effect (first-run skip)
- `src/app.css` — NEW `.view-switcher` block (1100px shared measure, flex-wrap, `var(--space-sm)` gap) + link rules (`var(--touch)`, `var(--font-ui)`, 14px/1.45) + `a[aria-current="page"]` rule (weight 600 + 2px underline thickness ONLY); no color overrides, zero motion properties
- `tests/component/App.test.tsx` — parseHash describe extended (4 new view-segment cases incl. the `#/unknown-view` fallback); all 5 list-fallback assertion sites realigned to `{ name: "list", view: "all" }`; fragment-guard describe untouched (git-diff verified)

## Decisions Made

- **Requirements stay open until 14-04** (frontmatter `requirements-completed: []`): 14-02 ships the complete implementation, but the phase's validation plan (14-04) owns the 3-engine matrix proof (URL↔DOM agreement across click/Back/reload/middle-click, focus timing, count agreement vs the imported policy). Mirrors the 14-01 LIB-07 and 10-01 RECV-01 split precedent.
- **Five list-fallback realignments, not three:** the plan named three, but the `/h/` trailing-slash and `#/review/x` cases assert the same list shape and were surfaced by the RED and GREEN runs respectively — all realigned in the same commit discipline with the rationale recorded in commit bodies.
- **Inline `stateCounts` (no useMemo):** the in-render partition produces fresh arrays each render, making a memo misleading; the expensive fold (grapheme totals) stays memoized in `totalsById`.
- **Export form:** `export type LibraryViewName` at the definition site (TS2484 conflict with a bottom re-export; matches the acceptance grep verbatim).
- **`eslint-disable-next-line react-hooks/exhaustive-deps`** on the mount effect — mount-only deps are the deliberate D14-03/D14-15 design (Pitfall 3); documented in-code.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Necessary test realignment] Two additional list-fallback cases required realignment beyond the plan's named three**
- **Found during:** Task 1 (RED and GREEN runs)
- **Issue:** The plan named "three list-fallback cases" for the `view: "all"` realignment, but five assertion sites exist — the `/h/` trailing-slash case failed at RED and the `#/review/x` unknown sub-route case failed at the first GREEN run (toEqual rejects the added `view` field).
- **Fix:** Realigned both in the same class (the 13-06 stale-expectation precedent); documented in the RED and GREEN commit bodies.
- **Files modified:** tests/component/App.test.tsx
- **Verification:** 15/15 green; fragment-guard describe untouched (git-diff verified, only the parseHash describe changed).
- **Committed in:** 4bf6945 (RED), 0cb8cb1 (GREEN)

---

**Total deviations:** 1 auto-fixed (necessary realignment of this plan's own new/extended test expectations)
**Impact on plan:** None — production behavior exactly as planned; the plan undercounted its own test-realignment surface.

## TDD Gate Compliance

| Task | RED | GREEN | Notes |
|------|-----|-------|-------|
| Task 1 (parseHash grammar) | ✓ `4bf6945` (8 failed / 7 passed — the extended shape absent) | ✓ `0cb8cb1` (15/15) | Fail-fast rule honored: every RED failure was the missing `view` field, not a broken test |

Task 2 and Task 3 were behavior-addition tasks gated by the unmodified e2e lock (happy-path, search-tag-filter, progress-recent all green unmodified) — no TDD cycle required by the plan.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification Evidence

- `npx vitest run tests/component/App.test.tsx` → exit 0 (15/15)
- `npx playwright test tests/e2e/ingestion/happy-path.spec.ts tests/e2e/library/search-tag-filter.spec.ts tests/e2e/library/progress-recent.spec.ts --project=chromium` → exit 0 (12/12), all three specs UNMODIFIED (git status clean over tests/)
- `rg -n "FINISHED_THRESHOLD" src/App.tsx src/ingestion/library/LibraryView.tsx` → zero matches (views never touch the threshold; only the policy module does)
- `rg -n 'location\.hash = "#/(unread|in-progress|finished)"' src/` → zero matches (the switcher never pushes view URLs)
- aria-live count in LibraryView.tsx unchanged at 1 (no new live region — D14-09)
- Regression sweep beyond the plan gate: full unit suite 1283 passed / 0 failed / 13 skipped (the documented intentional set); e2e chromium a11y + epub-intake + back-nav + review-panel/route-entry (29/29) and pdf-intake + portability/core-flow-spine + dexie-migration (11/11) — 52 e2e cells total, zero spec modifications
- `npx tsc --noEmit` → exit 0; targeted eslint on all touched files → exit 0

## Known Stubs

None — every surface this plan ships is complete and wired. The 3-engine focus/history/count proofs are Plan 14-04's documented scope (not a stub — a planned validation split; jsdom-invisible focus timing is explicitly deferred there per Pitfall 7).

## Next Phase Readiness

- 14-03 consumes the same warmMount/threading precedent for ArticleView/ReviewView titles + focus layering; `pageMeta.setDocumentTitle` + `truncateTitle` are ready for the article/EPUB-chapter/error/review title forms
- 14-04's e2e matrix can import `readingState.ts` directly for agreement assertions; the switcher links (`getByRole("link", { name: /^Unread \(\d+\)/ })`), the four view routes, and the empty-state copy are byte-stable anchors
- No blockers. Ready for 14-03.

## Self-Check: PASSED

All 4 modified files exist on disk; all 4 task commit hashes (4bf6945, 0cb8cb1, 56bd54e, db878bf) verified in git log; all task acceptance criteria and plan-level verification commands re-run green (see Verification Evidence).
