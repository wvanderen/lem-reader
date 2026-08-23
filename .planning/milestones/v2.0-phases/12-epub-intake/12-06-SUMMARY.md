---
phase: 12-epub-intake
plan: 06
subsystem: ui + testing
tags: [epub, chapter-nav, book-context, reading-identity, a11y, axe, keyboard, playwright, review-panel, pitfall-8]

# Dependency graph
requires:
  - phase: 12-epub-intake (Plan 05)
    provides: the book-aware library surfaces (BookRow grouping, bookProgress derivations, ContinueReadingStrip book entries, the epub-intake.spec.ts SC#1 harness this plan extends), getBook/booksStore seam
  - phase: 12-epub-intake (Plan 04)
    provides: the server chain (ingest({epub}) → per-chapter stages), the epub-fixtures builders (validBookEpub3/drmAdeptBook/corruptNotEpub/emptyBook), the calm refusal copy enum
  - phase: 04-pagination-mvp (Plan 04-03..04-09)
    provides: PaginatedSurface + onAnchorChange + the D4-10 anchor machinery + the DEV __lemPagination hook the e2e drives page state through
provides:
  - ArticleView chapter chrome — the D12-08 .book-context context line ("Book Title · Chapter N of M", U+00B7) + the D12-05 nav.chapter-nav end-of-chapter/previous links with mode-correct conditional rendering (scrolling: in flow before/after the body; paginated: fixed chrome band, Next on final page only / Previous on first page only)
  - app.css .chapter-nav + .book-context styles (muted link, 44px hit area, global focus ring, italic title span, nothing animated)
  - tests/e2e/epub-intake.spec.ts SC#2/SC#3 + the four-class refusal no-side-effect gates (12 cases × 3 engines total with SC#1)
  - tests/e2e/a11y.spec.ts book/chapter coverage: collapsed+expanded library scans, keyboard walkthrough, both-mode chapter scans, reduced-motion CSSOM guard
  - tests/unit/review-filter.test.ts Pitfall 8 chapter-bearing cases (strengthen-only, 0 deletions)
affects: [12-08 dist proof (no new client deps added), Phase 13 ACPT manual SR flows (the chapter surfaces' manual pass)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "pageState mirror: ArticleView derives first/last-page gating by reading surfaceRef.getState() inside the existing onAnchorChange callback (identity-stable functional setState) — no lifting of PaginatedSurface's page state, no new props"
    - "Geometrically stable paginated chrome: position:fixed in the bottom chrome band takes the chapter nav OUT of the article grid's flow, so mounting it on the final page can never change .page-viewport geometry and re-trigger pagination"
    - "Engine-honest keyboard-order proofs (the 09-06 precedent): DOM-order Tab walks on chromium+firefox from deterministic nearby starts; webkit (Safari form-controls-only sequential nav) gets focusability + Enter activation — order claim never faked"
    - "Axe vs disclosure animation: settle 350ms before scanning an animating region — axe resolves contrast from computed styles and mid-animation opacity blends false-fail color-contrast"

key-files:
  created: []
  modified:
    - src/routes/ArticleView.tsx
    - src/app.css
    - tests/e2e/epub-intake.spec.ts
    - tests/e2e/a11y.spec.ts
    - tests/unit/review-filter.test.ts

key-decisions:
  - "D12-05 paginated placement (Open Question 2 resolution executed): the nav is ArticleView-owned chrome AFTER the .page-viewport element, position:fixed in the bottom chrome band (the page-indicator/chevron layer) — out of the grid flow so mounting it never perturbs pagination geometry"
  - "pageState is mirrored from onAnchorChange via surfaceRef.getState() — the existing callback fires on every page/pages commit and the handle reads post-commit refs, so ArticleView reacts to turns without lifting page state or touching PaginatedSurface's props (zero changes outside the plan's file list)"
  - "The D4-10 anchor refs reset on article swap (Rule 1): chapter links are the FIRST article→article navigation that keeps ArticleView mounted — a stale currentAnchorOffsetRef fed PaginatedSurface's initialAnchorOffset and opened the next chapter at the PREVIOUS chapter's final page; resetting mirrors the fresh-mount behavior every library open gets"
  - "Neighbor chapter titles load through the same repository seam (openArticle) for the nav's lighter span; the Book record carries no TOC labels, so the bare 'Next chapter' text is the tolerant fallback"
  - ".chapter-nav-title is ITALIC, not opacity-lighter (Rule 1): 0.75 opacity blends the muted link to 3.83:1 — an axe color-contrast FAIL; the full --ink-soft token passes ~6.4:1 in every theme (the figcaption secondary register)"
  - "Paginated absent/present nav assertions run at 360x480 — synthetic chapters fit ONE page at the default 1280x720 viewport (page 1 IS the final page, making the absent-on-non-final assertion geometrically impossible); the shrunk viewport is the sanctioned harness control"
  - "The finished-book assertion pins the '● Finished' card mark (direct-child scope — finished chapter sub-rows carry their own marks), NOT a scaleX(1) hairline: the D8-12/D12 algebra hides the hairline at progress >= 1 by design"
  - "Physical Dexie counts in the refusal gate run AFTER reloadLibrary (the 10-03 discipline): the wipe can complete after the app's initial Dexie read, leaving Dexie closed until the remount re-queries — a raw indexedDB.open before that recreates a store-less v1 DB and blocks the v5 upgrade"

patterns-established:
  - "Chapter chrome contract: context line + nav render ONLY when ingestionMeta.source === 'epub-chapter' AND the Book record resolves through the tolerant getBook lookup — ordinary articles take zero new code paths; a missing/corrupt record renders neither, never an error state"
  - "Chapter links are plain hash anchors (the LibraryView precedent) — native Tab/Enter focusability, no shortcut registration, page-turn key handlers untouched"

requirements-completed: [ING-05]

# Metrics
duration: 38 min
completed: 2026-08-18
status: complete
---

# Phase 12 Plan 06: Reader Chapter Chrome + SC#2/SC#3 E2E Summary

**The D12-08 "Book Title · Chapter N of M" context line + the D12-05 end-of-chapter navigation (scrolling: in flow at chapter start/end; paginated: fixed chrome mounted only on the first/final page), proven by the SC#2 chapter-reading-identity and SC#3 cross-chapter/resume/progress e2e plus four refusal no-side-effect gates across chromium/firefox/webkit, an a11y extension (axe + keyboard + reduced-motion guard), and the Pitfall 8 review-panel chapter case**

## Performance

- **Duration:** 38 min
- **Started:** 2026-08-18T16:52:57Z
- **Completed:** 2026-08-18T17:31:23Z
- **Tasks:** 3 (all auto)
- **Files modified:** 5 (exactly the plan's files_modified list)

## Accomplishments

- **Context line (D12-08)**: `p.meta.book-context` under the provenance `.meta`, epub-chapter only — the book loads through the tolerant `booksStore.getBook` seam (missing/corrupt → no line, never an error state); N from `chapterOrdinal` over the book's own TOC with the callers-skip-0 contract (a chapter outside the declared TOC shows the title alone); M from `chapterArticleIds.length`; the separator is byte-verified U+00B7 with surrounding spaces.
- **End-of-chapter nav (D12-05)**: native focusable anchors `#/article/<id>` — scrolling mode Previous before the body / Next after the last block in flow; paginated mode ArticleView-owned chrome after the surface with Next mounted ONLY on the final page and Previous ONLY on the first (pageState mirrored from onAnchorChange; identity-stable; reset on mode flip + article swap); position:fixed in the chrome band so mounting never perturbs pagination geometry; no new keyboard listeners — page-turn keys untouched.
- **SC#2 chapter reading identity**: context line pinned byte-exact ×3 engines; scrolling mid-chapter save + real-selection highlight → reload restores within the persistence.spec tolerances AND the mark re-renders; paginated page count > 1 with the mark visible via a deterministic real-key page walk (webkit fragments mid-block differently than chromium); a second reload restores again — two-mode reading at chapter granularity via M.
- **SC#3 cross-chapter + resume + progress**: scrolling Next keyboard-focusable at flow end + Enter activation; paginated Next ABSENT on page 1 / PRESENT on the final page only; Previous reachable from chapter start in both modes and returns; the strip resumes chapter 3 at the saved offset then flips to a re-skimmed chapter 1 (last-savedAt wins, D12-07); 1/4 book hairline scaleX(0.25) and the all-finished "● Finished" state with the strip entry gone.
- **Refusal no-side-effect gates**: DRM/corrupt/empty calm copies with unchanged baseline rows, zero book rows, and physical zero-rows across articles+books; the over-cap pick surfaces the too-large copy with ZERO new /api/ingest requests (the 11-04 earliest-enforcement proof).
- **A11y extension**: library-with-book axe scans (collapsed + expanded, zero serious/critical + the heading-order/list guards), the keyboard walkthrough (Resume focusable, chevron aria-expanded via Enter, chapter links + Remove in DOM order, :focus-visible ring), both-mode chapter scans with the context line + nav in the tree, Next/Previous Tab-reachable + Enter-activatable, the context line proven a paragraph, and the reduced-motion CSSOM guard on the disclosure animation.
- **Pitfall 8 review-panel case**: chapter articles (ingestionMeta epub-chapter) flow through `deriveReviewSections` with sections growing by exactly the chapter count, pinned per-section entries, date-sort interleaving by genuine recency, and per-chapter tag/articleId filters — strengthen-only, zero deletions.

## Task Commits

Each task was committed atomically:

1. **Task 1: chapter context line + end-of-chapter navigation (D12-08 + D12-05)** — `d87e7e7` (feat)
2. **Task 2: SC#2 + SC#3 e2e + refusal gates + Rule 1 anchor reset** — `ac61dc0` (test)
3. **Task 3: a11y extension + Pitfall 8 case + Rule 1 contrast fix** — `bd76a6b` (test)
4. **Artifact-contract literal: SC#2 pins the persisted epub-chapter row** — `6e2b381` (test)

## Files Created/Modified

- `src/routes/ArticleView.tsx` — chapterContext/neighborTitles/pageState state, the tolerant book+neighbor load chain in the article-load effect, the anchor-ref swap reset, the context line in the header, the four nav mount points
- `src/app.css` — .book-context + .chapter-nav styles (muted link, 44px hit area, italic title span, fixed paginated chrome band)
- `tests/e2e/epub-intake.spec.ts` — SC#2/SC#3/refusal battery + helpers (1251 lines; the 12-05 SC#1 cases intact)
- `tests/e2e/a11y.spec.ts` — book/chapter surface coverage + tabWalkFrom engine discipline
- `tests/unit/review-filter.test.ts` — makeChapterArticle + the 4 chapter-bearing cases

## Decisions Made

- See key-decisions above; all placement/derivation choices follow the plan's resolutions of Open Question 2 and the D12-05/D12-08 decision text.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale D4-10 anchor opened the next chapter at its END**
- **Found during:** Task 2 (first chromium run of the cross-chapter nav case)
- **Issue:** Chapter links are the first article→article navigation that keeps ArticleView MOUNTED; `currentAnchorOffsetRef` retained the previous chapter's final-page offset and fed it to PaginatedSurface's `initialAnchorOffset` on its fresh mount — activating "Next chapter" landed on the NEXT chapter's final page (probe: CH2 final page → CH3 opened at idx 2 of 3), breaking "Previous reachable from chapter start" and the spatial model
- **Fix:** Reset `currentAnchorOffsetRef` + `lastPreciseAnchorRef` in the article-load effect on swap — byte-equivalent to the fresh-mount behavior every library open already gets
- **Files modified:** src/routes/ArticleView.tsx
- **Verification:** cross-chapter nav e2e green ×3 engines (chapter 3 opens on page 1, prev present); 336 adjacent e2e cells (persistence/pdf-intake/pagination/library) green after the change
- **Committed in:** ac61dc0

**2. [Rule 1 - Bug] .chapter-nav-title opacity dropped below the AA contrast floor**
- **Found during:** Task 3 (first chromium a11y run)
- **Issue:** The plan's "title span in a lighter tone" implemented as opacity 0.75 blended the muted link text to 3.83:1 — an axe color-contrast serious violation (WCAG 2.2 AA fails at < 4.5:1)
- **Fix:** Italic secondary register (the figcaption discipline) on the full `--ink-soft` token — passes ~6.4:1 in every theme; no opacity anywhere
- **Files modified:** src/app.css
- **Verification:** a11y spec 39/39 green ×3 engines (zero serious/critical)
- **Committed in:** bd76a6b

**3. [Rule 1 - Pre-existing flake surfaced] tag+search 12-05 test raced the fire-and-forget setBookTags write**
- **Found during:** Task 2 verification runs (failed once across three full chromium runs, unrelated to this plan's files)
- **Issue:** TagEntry renders the chip from its LOCAL mirror while the Dexie write is still in flight; the test reloaded immediately after the chip assertion and the remounted chip strip lost the tag
- **Fix:** 600ms settle before the reload (the persistence.spec debounced-write discipline) — no assertion weakened or removed
- **Files modified:** tests/e2e/epub-intake.spec.ts
- **Verification:** the 12-05 case green across all subsequent runs (36/36, 75/75)
- **Committed in:** ac61dc0

**4. [Rule 1 - Test-contract reconciliations] geometry/algebra realities the plan's assertions had to honor**
- **Found during:** Task 2/3 first runs
- **Issue + Fix (each pinned to a real constraint, none weaken a truth):** (a) paginated nav assertions run at 360x480 — one-screen chapters fit a single page at the default viewport so "absent on a non-final page" was geometrically impossible; (b) the finished-book assertion pins the "● Finished" card mark (direct-child scope) — the D8-12/D12 algebra hides the hairline at progress >= 1 by design, so scaleX(1) never exists; (c) the paginated mark walk starts deterministically from page 1 — the block-level D4-10 anchor can land on the page BEFORE a mid-block split and webkit fragments differently than chromium; (d) physical Dexie counts in the refusal gate run after reloadLibrary (the 10-03 raw-open discipline — a store-less v1 DB otherwise blocks the v5 upgrade); (e) axe settles 350ms after expanding the disclosure — mid-animation opacity blends false-fail contrast; (f) the a11y walkthrough seeds the Resume location via raw IndexedDB (deterministic) instead of the debounced scroll save
- **Files modified:** tests/e2e/epub-intake.spec.ts, tests/e2e/a11y.spec.ts
- **Verification:** 36/36 + 39/39 e2e cells green ×3 engines
- **Committed in:** ac61dc0, bd76a6b

---

**Total deviations:** 4 auto-fixed (3 bugs — one production, one CSS/AA, one pre-existing flake — plus one test-contract reconciliation cluster)
**Impact on plan:** All fixes are direct consequences of the plan's own contracts (chapter-start reachability, the AA bar, strengthen-only timing discipline). No scope creep; every pinned outcome proven.

## Issues Encountered

- WebKit sequential focus navigation skips links/buttons under Playwright (probe: Tab from a focused link lands body → INPUT → TEXTAREA) — the documented 09-06 engine divergence. Handled per its precedent: DOM-order Tab walks assert on chromium+firefox; webkit asserts focusability + Enter activation. Logged here for Phase 13's ACPT manual SR pass.
- The 12-05 summary's "live refresh is 12-06's library-UX concern" note: the book upload success path still does not bump LibraryView's refreshKey — this plan's surfaces all work through the sanctioned page.reload() remount; a live in-place refresh remains unbuilt (no plan text in 12-06 mandated it; the reloadLibrary precedent stands).

## User Setup Required

None - no external service configuration required.

## Authentication Gates

None.

## Verification Evidence (plan-level)

- `npx tsc --noEmit` — exit 0 after every task
- **Full unit suite: 1131 passed / 0 failed / 10 intentional skips** (`npm run test:unit -- --run`)
- `npx vitest run tests/unit/review-filter.test.ts` — 20/20 (16 existing + 4 chapter-bearing; 0 deleted lines)
- `npx playwright test tests/e2e/epub-intake.spec.ts` — **36/36 green across chromium + firefox + webkit** (12 cases × 3 engines: SC#1 from 12-05 intact + SC#2 + SC#3×3 + refusals)
- `npx playwright test tests/e2e/a11y.spec.ts` — **39/39 green ×3 engines** (13 cases: existing fixture/panel scans untouched + 3 new book/chapter cases)
- Adjacent regression sweep — **336/336 green** (persistence.spec, pdf-intake.spec, pagination/*, library/*)
- Artifact contract: epub-intake.spec.ts 1251 lines (≥250) containing "epub-chapter" ✓; review-filter.test.ts contains "epub-chapter" ✓; ArticleView contains "chapter-nav" ✓; key_links `getBook` + `chapterOrdinal` present ✓
- Threat register: T-12-15/T-12-16 accept dispositions honored — links are internal hash routes over Zod-validated ids (no external URLs, no raw HTML), and the context line renders reader-local library data only (zero network calls added)

## Next Phase Readiness

- 12-06 closes the reader-side half of EPUB intake; with 12-01..12-05 + 12-07 complete, only 12-08 (dist proof) remains in Phase 12
- The chapter surfaces' manual screen-reader flows stay Phase 13's ACPT gate (axe reports only automatable issues; the webkit sequential-nav note above is queued for that pass)
- No new dependencies, no schema changes, no store changes — dist size is unaffected by this plan

## Self-Check: PASSED

- All 5 modified files exist on disk (`[ -f ]` verified); zero files deleted by any commit
- Commits `d87e7e7` + `ac61dc0` + `bd76a6b` + `6e2b381` present in `git log`; `git diff --diff-filter=D` across the plan's commits is empty
- All task acceptance criteria re-verified (greps + suite exits listed above)

---
*Phase: 12-epub-intake*
*Completed: 2026-08-18*
