---
phase: 10-annotation-review-panel
plan: 02
subsystem: annotations
tags: [react, typescript, hash-router, review-panel, playwright, e2e, css-tokens, accessibility]

# Dependency graph
requires:
  - phase: 10-annotation-review-panel (Plan 10-01)
    provides: deriveReviewSections + ReviewFilters/ReviewSort/ConfidenceFilter/ReviewEntry/ReviewSection/ReviewDerivation contracts + the six Wave-0 e2e sentinels strengthened here
provides:
  - ReviewView component (src/routes/review/ReviewView.tsx) — the #/review route surface with grouped sections, orphan tail, badge discipline, filter/sort controls, honest empty states
  - Three-view hash router grammar in App.tsx — { name: review } alternative + /h/<highlightId> deep-link capture (jumpHighlightId) ready for Plan 10-03 consumption
  - "Review highlights" LibraryView entry button (the sole Phase-10 entry point, D10-02)
  - Additive tokens-only .review-* CSS block (zero motion properties)
  - Strengthened parseHash component matrix + real route-entry e2e (5 tests × 3 engines)
affects: [10-annotation-review-panel (plans 10-03, 10-04, 10-05, 10-06)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Route-view twin composition: ReviewView mounts the LibraryView load-effect + .status + filter-row shape over the 10-01 pure derivation — zero new data logic in the view"
    - "Ordered route grammar: /h/ suffix regex first, exact #/review equality second, byte-stable list fallback last (foreign-controlled highlightId captured as [^/]+ for lookup-only use)"
    - "Whole-row jump button with disabled-when-unresolved (AnnotationsDrawer precedent) + no-affordance static row for the orphan tail"

key-files:
  created:
    - src/routes/review/ReviewView.tsx
  modified:
    - src/App.tsx
    - src/ingestion/library/LibraryView.tsx
    - src/app.css
    - tests/component/App.test.tsx
    - tests/e2e/review-panel/route-entry.spec.ts
    - tests/e2e/review-panel/listing.spec.ts
    - tests/e2e/review-panel/jump-bidirectional.spec.ts
    - tests/e2e/review-panel/tri-state.spec.ts
    - tests/e2e/review-panel/curate.spec.ts
    - tests/e2e/review-panel/empty-states.spec.ts
    - tests/unit/review-filter.test.ts

key-decisions:
  - "RECV-01 stays unchecked — this plan ships the route + surface; the requirement closes at the plan proving end-to-end panel behavior (04-02 PAGE-01 / 10-01 split precedent)"
  - "LibraryView 'Review highlights' button reuses the .article-export-highlights class verbatim (the plan's 'reuse the class used by sibling header controls' directive — quiet hairline, 44px touch, accent hover; zero new CSS outside the .review-* block)"
  - "refreshKey state ships value-only (const [refreshKey] = useState(0)) — the setRefreshKey bump lands with Plan 10-05 curation; declaring an unused setter would trip tsc noUnusedLocals"
  - "Badge copy is status-mapped exactly as the plan suggests (ambiguous → 'Uncertain anchor', orphan → 'Article missing'); section rows whose article exists but whose quote no longer resolves share the orphan vocabulary — status-driven, never silent"
  - "The five non-route-entry Wave-0 sentinels were updated (Rule 1) rather than left failing: their assertions pinned the OLD two-view fallback (library h1 on #/review and /h/ forms) which this plan's router intentionally changed"

patterns-established:
  - "Deep-link grammar test matrix: /h/<hid> captures, /h/ trailing-slash falls to list (documents the [^/]+ failure), #/review exact, #/review/x unknown → list"
  - "Header gating pinned by contrast e2e: zero-count on #/review PLUS visible-on-article so the regex is provably non-vacuous (Header.tsx byte-stable)"

requirements-completed: []

# Metrics
duration: 14 min
completed: 2026-08-16
status: complete
---

# Phase 10 Plan 02: Review Panel Route + Surface Summary

**#/review three-view router (ordered /h/ + #/review + fallback grammar) rendering the ReviewView twin — grouped sections with confident-only jump rows, never-drop orphan tail, tri-state badges, filter/sort controls — plus the LibraryView entry button, all proven across chromium/firefox/webkit**

## Performance

- **Duration:** 14 min
- **Started:** 2026-08-16T00:31:22Z
- **Completed:** 2026-08-16T00:45:59Z
- **Tasks:** 2
- **Files modified:** 12 (1 source created + 3 source modified + 1 unit-test fixed + 7 test files)

## Accomplishments

- `src/routes/review/ReviewView.tsx` — the #/review surface as a pure composition: LibraryView-twin cancelled-flag `Promise.all([listArticles(), loadAllHighlights(), loadAllNotes(), loadAllTags()])` load effect, `deriveReviewSections` called directly in the render body (D10-09), grouped-by-article sections (title + subtle source-host suffix via `new URL(sourceUrl).hostname`), whole-row jump buttons enabled only for confident rows (D10-03), the "Highlights without an article" orphan tail with no jump affordance (D10-05), badges only on ambiguous/orphan rows + legend (D10-07), TagFilter + article/confidence/sort selects AND-composed with Date default (D10-08), and both honest D10-10 empty states through the `.status` live region.
- `src/App.tsx` — three-view router: View union gains `{ name: "review" }` + optional `jumpHighlightId`; parseHash matches the `/h/` suffix form first (`[^/]+` capture — lookup-only, T-10-02a), then exact `#/review`, then the byte-stable list fallback. The Gap 3 fragment guard is byte-unchanged; the `[view]` reset effect untouched; no `jumpHighlightId` prop threaded to ArticleView yet (Plan 10-03).
- `src/ingestion/library/LibraryView.tsx` — the D10-02 "Review highlights" header-cluster button (minimal diff, reuses the quiet-hairline `.article-export-highlights` styling tokens) navigating via plain hash assignment.
- `src/app.css` — one additive `.review-*` block (18 selectors), tokens-only (every color `var(--…)`), zero motion properties (grep-verified over the added lines).
- `tests/component/App.test.tsx` — 4 new parseHash cases; all pre-existing cases byte-stable and green (strengthen-only, 11/11).
- `tests/e2e/review-panel/route-entry.spec.ts` — sentinel replaced with 5 real tests × 3 engines (15/15): entry-button navigation + URL, deep link, browser-back history discipline, single main/h1 landmark check, and the articleMounted header-gating pin (count 0 on #/review + visible contrast leg on the article view; Header.tsx byte-stable).

## Task Commits

Each task was committed atomically:

1. **Task 1: ReviewView route component + additive app.css block** — `98de37d` (feat)
2. **Task 2: App.tsx three-view router + parseHash tests + LibraryView entry button + route-entry e2e** — `079f505` (feat)

## Files Created/Modified

- `src/routes/review/ReviewView.tsx` — the #/review route view (new, 387 lines)
- `src/App.tsx` — three-view View union + extended parseHash grammar + review swap branch
- `src/ingestion/library/LibraryView.tsx` — "Review highlights" entry button
- `src/app.css` — additive `.review-*` tokens-only block
- `tests/component/App.test.tsx` — parseHash grammar matrix extension
- `tests/e2e/review-panel/route-entry.spec.ts` — real route-entry assertions (sentinel replaced in place)
- `tests/e2e/review-panel/{listing,jump-bidirectional,tri-state,curate,empty-states}.spec.ts` — sentinel assertions updated to the three-view router reality
- `tests/unit/review-filter.test.ts` — unused NoteRecord import dropped (Rule 3 fix)

## Decisions Made

- **RECV-01 not marked complete** — the route + surface ship here; the requirement closes at the plan proving end-to-end panel behavior (mirrors the 04-02/06-01/09-01/10-01 split precedent; `requirements-completed: []`).
- **Entry-button class reuse** — `.article-export-highlights` reused verbatim per the plan's "reuse the class used by sibling header buttons" directive; identical quiet-hairline/touch/accent-hover tokens, zero CSS additions outside the `.review-*` block.
- **`refreshKey` value-only** — the load effect is keyed on `refreshKey` now; the `setRefreshKey` bump arrives with Plan 10-05's curation commits (an unused setter would fail tsc `noUnusedLocals`).
- **Section-orphan badge vocabulary** — article-present-but-unresolvable rows (the 10-01 fourth tri-state case) share the orphan badge text; the badge is status-driven so no unresolved row is ever badged as confident or left silent.
- **Sentinel updates scoped to assertions** — describe names + helper wiring kept; only the fallback-h1 expectation and header comments changed to the new-router reality.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Unused NoteRecord import broke `npm run build`**
- **Found during:** Task 1 (the plan's build gate)
- **Issue:** `tests/unit/review-filter.test.ts` (Plan 10-01, commit 74c6c62) imports `NoteRecord` without using it — 10-01 verified via vitest/playwright, never `tsc`, so TS6196 survived; this plan's `npm run build` gate exposed it.
- **Fix:** Dropped the unused type import (the fixture uses `NoteRecordSchema.parse` with inferred types).
- **Files modified:** tests/unit/review-filter.test.ts
- **Verification:** `npm run build` exits 0; 16/16 review-filter tests still pass.
- **Committed in:** 98de37d (Task 1 commit)

**2. [Rule 1 - Bug] Five Wave-0 sentinels pinned the old two-view fallback this plan removed**
- **Found during:** Task 2 (post-verification regression sweep)
- **Issue:** listing/jump-bidirectional/tri-state/curate/empty-states sentinels assert the library h1 after `goto #/review` / `goto #/article/<id>/h/<hid>` — routes that now resolve to ReviewView/ArticleView under the three-view router.
- **Fix:** Updated each sentinel's assertion to the now-real view h1 ("Review highlights" / the essay-long-form title) with comments noting the 10-02 router landed; file, describe naming, and helper wiring kept.
- **Files modified:** tests/e2e/review-panel/{listing,jump-bidirectional,tri-state,curate,empty-states}.spec.ts
- **Verification:** `npx playwright test tests/e2e/review-panel/` — 30/30 cells green (chromium/firefox/webkit).
- **Committed in:** 079f505 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes keep this plan's own gates green without scope creep — the pre-existing tsc error blocked the build criterion, and the sentinel updates are the direct, intended consequence of shipping the router.

## Issues Encountered

None beyond the deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- ReviewView mounts and derives; Plan 10-03 threads `jumpHighlightId` into ArticleView's on-mount jump pipeline (the `history.replaceState` suffix strip + three-settle wait per 10-PATTERNS).
- Plan 10-04 strengthens listing/jump/tri-state specs against the shipped surface (row anatomy, badge texts, and empty-state copy are now locked in ReviewView).
- Plan 10-05 adds curation affordances + the `setRefreshKey` bump to ReviewView.
- No blockers.

## Verification Evidence

| Check | Result |
|-------|--------|
| `npm run build` | exit 0 (tsc clean with the three-view union) |
| `npm run test:unit -- --run tests/component/App.test.tsx` | 11/11 passed (strengthen-only confirmed) |
| `npm run test:unit -- --run` (full unit) | 871 passed / 0 failed / 7 intentional skips (65 files) |
| `npx playwright test tests/e2e/review-panel/route-entry.spec.ts` | 15/15 passed (chromium + firefox + webkit) |
| `npx playwright test tests/e2e/review-panel/` (whole dir) | 30/30 passed (chromium + firefox + webkit) |
| `npx playwright test tests/e2e/library/` (shell-change regression sweep) | 81/81 passed |
| app.css added lines: `grep "transition\|animation"` | 0 matches; all 18 new selectors `.review-*`-prefixed; colors var(--) only |
| Gap 3 guard (`hash !== "" && !hash.startsWith("#/")`) | byte-unchanged (0 diff hunks touch it) |
| `npx eslint` over all touched files | exit 0 |

## Self-Check: PASSED

- key-files.created exists on disk (`src/routes/review/ReviewView.tsx` — 387 lines ≥ 200 min)
- Both task commits present in git log (`98de37d`, `079f505`)
- All acceptance criteria re-run and passing (see Verification Evidence)

---
*Phase: 10-annotation-review-panel*
*Completed: 2026-08-16*
