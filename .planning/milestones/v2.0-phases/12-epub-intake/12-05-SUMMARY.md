---
phase: 12-epub-intake
plan: 05
subsystem: ui + ingestion
tags: [epub, library, bookrow, aria-expanded, continue-reading, dexie-cascade, playwright, rtl]

# Dependency graph
requires:
  - phase: 12-epub-intake (Plan 03)
    provides: booksStore seam (listBooks/setBookTags/removeBook one-transaction cascade), saveBook's top-level bookId denormalization, the .epub picker arm with book-level dedupe-refuse + D12-11 success copy
  - phase: 12-epub-intake (Plan 04)
    provides: the server chain (ingest({epub}) → per-chapter stages → {ok, book, articles, skippedCount}) the e2e drives through, format-aware middleware, the epub-fixtures builders (validBookEpub3/mixedAdmissionBook)
  - phase: 08-markdown-pipeline-and-personal-library
    provides: the library surface this plan widens (LibraryView/LibraryRow/ContinueReadingStrip/libraryFilter/RemoveConfirm anatomy + the 08-05 direct-child + page.reload + seeded-finished-location e2e precedents)
provides:
  - bookProgress.ts — deriveBookProgress (D12-03 chapters-finished ratio over the exported FINISHED_THRESHOLD), resolveResumeChapterId (D12-07 max-savedAt), chapterOrdinal (D12-06 book-TOC numbering)
  - BookRow.tsx — the expandable book row: native disclosure (real chevron button + aria-expanded/aria-controls, row-click never toggles), book hairline + Finished mark, Resume link, chapter sub-list (LibraryRow anatomy at headingLevel 3, declared-TOC order + appended extras), D12-11 skip disclosure, book TagEntry, Remove book trigger
  - BookRemoveConfirm.tsx — the book-scoped destructive confirm (structural RemoveConfirm clone, OWN dialog classes, sole removeBook call site in its Proceed onClick)
  - LibraryRow headingLevel 2|3 prop; LibraryView book/article partition + book filtering + book-tag chip union; ContinueReadingStrip ONE "BookTitle — Chapter N of M" entry per in-progress book; libraryFilter filterBooks (book title/authors/CHAPTER titles + book.tags)
  - tests/e2e/epub-intake.spec.ts — SC#1 e2e (7 cases × 3 engines): upload → grouping → expand → disclose → tag/search → continue-reading → progress → remove cascade → dedupe-refuse
affects: [12-06 reader/library UX (ArticleView context line + end-of-chapter link + library refresh after save), 12-07 portability (books ride the bundle), 12-08 dist proof]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Native disclosure pairing: real <button aria-expanded aria-controls> + an always-mounted region toggled via hidden — row-click never toggles (two gestures, two targets; T-12-15)"
    - "Structural clone class discipline: a second destructive dialog gets OWN top-level classes (dialog.book-remove-confirm) because both dialogs mount simultaneously and shared classes break strict-mode e2e locators — the 09-05 ImportPreviewDialog precedent"
    - "TagEntry saveTags override prop: optional persistence callback keeps the default setArticleTags path byte-identical while book rows route commits to setBookTags (D12-04)"
    - "One-screen-chapter e2e honesty: window scroll can never carry a chapter past the 98% offset at default viewport — finished state seeded graphemeOffset=total (08-05 precedent), mid-article resume proven at a shrunk 360x480 viewport"

key-files:
  created:
    - src/ingestion/library/bookProgress.ts
    - src/ingestion/library/BookRow.tsx
    - src/ingestion/library/BookRemoveConfirm.tsx
    - tests/unit/library/book-progress.test.ts
    - tests/unit/library/book-filter.test.ts
    - tests/unit/library/book-row.test.tsx
    - tests/e2e/epub-intake.spec.ts
  modified:
    - src/ingestion/library/LibraryRow.tsx
    - src/ingestion/library/LibraryView.tsx
    - src/ingestion/library/ContinueReadingStrip.tsx
    - src/ingestion/library/libraryFilter.ts
    - src/reader/TagEntry.tsx
    - src/app.css

key-decisions:
  - "ING-05 CLOSES here — the upload→grouping journey is proven end-to-end in real browsers (21 e2e cells across chromium/firefox/webkit); 12-06/07/08 serve other requirements (the 12-01..04 split precedent resolves in this plan)"
  - "TagEntry gained an optional saveTags prop (Rule 3 — the plan requires book tags persisting via setBookTags, but TagEntry hard-coded setArticleTags, and db.articles.update(bookId, …) is a silent no-op); the default path is byte-identical for ArticleView"
  - "BookRemoveConfirm uses OWN .book-remove-confirm* classes, not the shared .library-remove-confirm (Rule 1 — both dialogs mount in LibraryView; a shared class makes remove-cascade.spec.ts's dialog locator match TWO elements = strict-mode violation + existing-suite regression); same authored shell chrome per the 09-05 import-preview precedent"
  - "Book-card source badge renders <p class='meta source-badge'>Book</p> in byte-parity with SourceBadge's badgeLabel('epub-chapter') plain-text variant — SourceBadge.tsx is outside this plan's files list and the chapter SUB-ROWS render the real component"
  - "Merged-list ordering: standalone articles keep the composite-library order (the locked 08-03 deviation — CanonicalArticle carries no addedAt); books render after them, addedAt-descending among themselves"
  - "Chapters derive from the loaded composite article list grouped by ingestionMeta.bookId (canonical, Zod-validated) rather than a raw where('bookId') index read — same live rows, no raw-row parsing in the view; removeBook keeps the index arm as live truth"
  - "E2E Continue-Reading case runs at 360x480: one-screen synthetic chapters have only 53px of scroll at the default viewport (offset stays 0), so the shrunk viewport is what makes 'resumes at the saved position' substantive; book-progress case seeds the finished location (graphemeOffset = total computed in Node by the SAME normalizeText + graphemeClusters) — the 08-05 determinism precedent"
  - "LibraryView unions book tags into the TagFilter chip strip (article tags ∪ book tags from listBooks) — without it the plan's 'tag the book → the tag filter surfaces the BOOK row' e2e case could not reach its chip through the UI"

patterns-established:
  - "Book-row grouping contract: chapter sub-rows live INSIDE the book <li> (.book-chapter-list), so .library-list > li counts never inflate (08-05 lesson held in practice — 69 existing library e2e cells green)"
  - "Book derivations are pure functions over (Book, LocationRecord[], textLengthOf) — components own reads, bookProgress.ts owns algebra; FINISHED_THRESHOLD stays exported from ContinueReadingStrip (never forked)"

requirements-completed: [ING-05]

# Metrics
duration: 18 min
completed: 2026-08-18
status: complete
---

# Phase 12 Plan 05: Book-Aware Library + SC#1 E2E Summary

**The library becomes book-aware: pure D12-03/D12-07 progress+resume derivations over existing LocationRecords, the expandable BookRow with native aria-expanded disclosure and nested chapter sub-rows, ONE 'BookTitle — Chapter N of M' Continue-Reading entry, book+chapter search with book-surface tag filtering, the calm skip disclosure, and the BookRemoveConfirm cascade gate — proven by a 7-case × 3-engine e2e driving real EPUB bytes through the whole intake pipeline**

## Performance

- **Duration:** 18 min
- **Started:** 2026-08-18T16:02:49Z
- **Completed:** 2026-08-18T16:20:57Z
- **Tasks:** 3 (all auto)
- **Files modified:** 13 (7 created, 6 modified)

## Accomplishments

- **bookProgress.ts (D12-03/D12-07/D12-06)**: `deriveBookProgress` (count of chapters whose latest-savedAt location sits at >= FINISHED_THRESHOLD × chapter text length ÷ chapterArticleIds.length; missing text length or no location → unfinished; empty list → 0), `resolveResumeChapterId` (max-savedAt within the book — an earlier chapter re-skimmed later wins), `chapterOrdinal` (1-based over the book's own TOC). FINISHED_THRESHOLD imported from ContinueReadingStrip — no forked constant.
- **BookRow (D12-01/D12-06/D12-11 + T-12-15)**: collapsed card (h2 title, joined authors, Book badge, chapters-finished hairline mirroring the LibraryRow hairline/Finished algebra, Resume link while a resume chapter exists and progress < 1) + a real chevron button (`aria-expanded` + `aria-controls` → an always-mounted region toggled by `hidden`; row-click never toggles) containing the chapter sub-list (LibraryRow anatomy at headingLevel 3, declared-TOC order with extra live rows appended — partial-import tolerance), the skip disclosure ("1 chapter could not be read." / "N chapters could not be read."), the book TagEntry, and the Remove book trigger.
- **ContinueReadingStrip (D12-02)**: ONE book-level entry per in-progress book — "BookTitle — Chapter N of M" linking to the resume chapter with the chapters-finished hairline; chapter members filtered from the standalone fold; mixed savedAt-descending sort; cap 3 preserved.
- **libraryFilter (D12-04)**: `filterLibrary` now excludes chapter members; new `filterBooks` — haystack = title + authors + CHAPTER titles (caller-supplied Map keeps it pure), tag filter via `book.tags` surfacing the BOOK row only.
- **BookRemoveConfirm (T-12-12)**: structural RemoveConfirm clone — native dialog/showModal, `[data-initial-focus]` on Keep book, Esc routed through onCancel, chapter-count-naming copy, and the SOLE executable `removeBook` call site in its Proceed onClick.
- **SC#1 e2e (7 cases × chromium/firefox/webkit = 21 cells)**: upload through the real picker/middleware chain with in-test builder bytes — grouping (one row, 4 nested sub-rows, open + collapse), skip disclosure, tag+search surfacing, Continue-Reading resume-at-position, 1/4 hairline, six-store remove cascade with a real selection-flow highlight, dedupe-refuse.

## Task Commits

Each task was committed atomically:

1. **Task 1: bookProgress derivations + BookRow + LibraryView grouping** — `34fc7fe` (feat)
2. **Task 2: Continue-Reading book entries + book/chapter search + tag surfacing + BookRemoveConfirm** — `76a0133` (feat)
3. **Rule 1 fix: BookRemoveConfirm own dialog classes (strict-mode locators)** — `456aa42` (fix)
4. **Task 3: SC#1 e2e** — `7676468` (test)

## Files Created/Modified

- `src/ingestion/library/bookProgress.ts` — NEW: the three pure derivations
- `src/ingestion/library/BookRow.tsx` — NEW: the expandable book row
- `src/ingestion/library/BookRemoveConfirm.tsx` — NEW: the book-scoped destructive confirm
- `src/ingestion/library/LibraryRow.tsx` — optional headingLevel 2|3 (default 2 — byte-stable)
- `src/ingestion/library/LibraryView.tsx` — book/article partition, listBooks load, filterBooks composition, book-tag chip union, BookRemoveConfirm wiring
- `src/ingestion/library/ContinueReadingStrip.tsx` — mixed article+book entries
- `src/ingestion/library/libraryFilter.ts` — chapter-member exclusion + filterBooks
- `src/reader/TagEntry.tsx` — optional saveTags persistence override
- `src/app.css` — .book-* chrome + book-remove-confirm dialog + positively-gated disclosure animation
- `tests/unit/library/book-progress.test.ts` — NEW: 18 pure specs
- `tests/unit/library/book-row.test.tsx` — NEW: 12 RTL specs (mocked persistence seams)
- `tests/unit/library/book-filter.test.ts` — NEW: 12-spec pure matrix
- `tests/e2e/epub-intake.spec.ts` — NEW: the 7-case × 3-engine SC#1 gate

## Decisions Made

- See key-decisions above; ING-05 closes here per the phase split precedent.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TagEntry needed a persistence override to satisfy "persisting via setBookTags"**
- **Found during:** Task 1 (BookRow's book TagEntry)
- **Issue:** The plan mandates reusing src/reader/TagEntry with book tags persisting via setBookTags, but TagEntry hard-codes setArticleTags — and `db.articles.update(bookId, …)` is a silent no-op (no article carries a book id), so book tags would never persist
- **Fix:** Optional `saveTags?: (tags: string[]) => Promise<void>` prop; BookRow passes `(tags) => setBookTags(book.id, tags)`; the default path is byte-identical for ArticleView (no behavior change for any existing caller)
- **Files modified:** src/reader/TagEntry.tsx (outside the plan's files_modified list — minimal additive widening), src/ingestion/library/BookRow.tsx
- **Verification:** book-row.test.tsx TagEntry specs green; full unit suite 1102/0
- **Committed in:** 34fc7fe

**2. [Rule 1 - Bug] Sharing the .library-remove-confirm dialog class would break the existing remove-cascade e2e**
- **Found during:** Task 3 prep (strict-mode locator audit before writing the e2e)
- **Issue:** BookRemoveConfirm (a structural clone) initially reused the `library-remove-confirm` class — but both dialogs mount simultaneously in LibraryView, making remove-cascade.spec.ts's `dialog.library-remove-confirm` locator match TWO elements (strict-mode violation → existing-suite regression, violating the plan's "existing library e2e stays green")
- **Fix:** OWN `.book-remove-confirm*` classes with the same authored shell chrome — exactly the 09-05 ImportPreviewDialog precedent for simultaneous structural clones
- **Files modified:** src/ingestion/library/BookRemoveConfirm.tsx, src/app.css
- **Verification:** remove-cascade.spec.ts green (69 existing library e2e cells, 3 engines)
- **Committed in:** 456aa42

**3. [Rule 2 - Missing Critical] Book tags were invisible to the TagFilter chip strip**
- **Found during:** Task 2 (wiring the "tag the book → the tag filter surfaces the BOOK row" flow)
- **Issue:** loadAllTags derives chips from article rows only; a tag written via setBookTags would never render a chip, so the plan's D12-04 tag-filter truth was unreachable through the UI
- **Fix:** LibraryView unions book tags (from listBooks) into the chip list alongside loadAllTags, re-sorted with the same localeCompare discipline — tagsStore untouched
- **Files modified:** src/ingestion/library/LibraryView.tsx
- **Verification:** e2e tag+search case (essays chip surfaces the book row only) green × 3 engines
- **Committed in:** 76a0133

**4. [Rule 1 - Bug] The plan's scroll-to-end book-progress flow is impossible for one-screen chapters**
- **Found during:** Task 3 (first chromium run: the hairline never appeared)
- **Issue:** "finish chapter 1 (scroll to end / navigate to last page)" cannot work — synthetic chapters fit one viewport screen (773px body / 720px viewport → max 53px scroll → graphemeOffset stays 0), paginated turns save no location rows (the locked 11-05 deference), so window scroll can never cross the 98% threshold
- **Fix:** Seed the finished location via raw IndexedDB with graphemeOffset = total, `total` computed in Node by the SAME normalizeText + graphemeClusters the in-browser derivation uses — the 08-05 "seed graphemeOffset = total for deterministic Finished state" precedent; the Continue-Reading case similarly runs at a shrunk 360x480 viewport so its mid-article scroll (and nonzero saved offset) is real
- **Files modified:** tests/e2e/epub-intake.spec.ts
- **Verification:** 21/21 e2e cells green; the save→restore path additionally proven by the probe (saved 53px → restored 53px exactly)
- **Committed in:** 7676468

---

**Total deviations:** 4 auto-fixed (1 bug, 1 missing critical, 1 blocking, 1 bug/test-contract reconciliation)
**Impact on plan:** All four are direct consequences of the plan's own contracts (setBookTags persistence, structural-clone chrome, the tag-filter truth, the scroll-to-end flow). No scope creep; every pinned outcome proven.

## Issues Encountered

- The ContinueReadingStrip acceptance fallback applied as written: no strip component test exists, so the one-entry-per-book contract is asserted via the exported derivations (book-progress.test.ts) at unit level and pinned end-to-end by the e2e case (ONE "The Synthetic Book — Chapter 2 of 4" row, zero chapter entries).

## Verification Evidence (plan-level)

- `npx vitest run tests/unit/library/book-progress.test.ts tests/unit/library/book-row.test.tsx` — 27/27 green (Task 1 gate)
- `npx vitest run tests/unit/library/book-filter.test.ts` — 12/12 green (Task 2 gate)
- `npx tsc --noEmit` — exit 0 after every task
- `npx playwright test tests/e2e/epub-intake.spec.ts` — **21/21 green across chromium + firefox + webkit** (7 cases × 3 engines)
- Existing library e2e (browse-open, remove-cascade, search-tag-filter, v1-regression, progress-recent) — 69/69 green × 3 engines
- pdf-intake.spec.ts — 24/24 green (the library-surface widening regressed nothing)
- **Full unit suite: 1102 passed / 0 failed / 10 intentional skips** (`npm run test:unit -- --run`)
- Acceptance greps: bookProgress imports FINISHED_THRESHOLD from ./ContinueReadingStrip (zero local 0.98 literals) ✓; `removeBook(` has exactly ONE executable call site (BookRemoveConfirm Proceed onClick) ✓; data-initial-focus on Keep book ✓; `prefers-reduced-motion: no-preference` gate in app.css ✓; headingLevel default 2 ✓

## Threat Mitigation Proof (plan threat_model)

- **T-12-11 (corrupt book rows)**: every booksStore read re-validates via BookSchema.safeParse (12-03 seam, unchanged); BookRow only ever renders validated Book/Article records — the renderer touches Block JSON exclusively
- **T-12-12 (accidental destructive cascade)**: e2e proves the chapter-count copy, data-initial-focus on Keep book, and the six-store zero-rows outcome; repo grep proves the single removeBook call site
- **T-12-15 (disclosure state confusion)**: real button + aria-expanded/aria-controls pairing asserted collapsed AND expanded in both the unit test and the e2e; row-click proven not to toggle (a11y.spec extension lands in 12-06 as planned)

## User Setup Required

None - no external service configuration required.

## Authentication Gates

None.

## Next Phase Readiness

- 12-06 (reader/library UX) builds on this plan's surfaces: BookRow's grouping IS the D12-06 TOC; the D12-08 context line + D12-05 end-of-chapter link mount in ArticleView; the D12-11 disclosure copy here reuses 12-03's byte-pinned phrasing
- Known follow-through for 12-06: the book upload success path stays on #/ without bumping LibraryView's refreshKey — the e2e uses page.reload() (the sanctioned 08-05 precedent); a live refresh is 12-06's library-UX concern
- app.css book-block additions are scoped (co-owned with 12-06 per the 08-01 precedent)
- Chapters annotate + restore location identically to articles (e2e remove-cascade case creates a real selection-flow highlight) — the SC#1 substrate contract held

## Self-Check: PASSED

- All key-files exist on disk (`[ -f ]` verified for 7 created + 6 modified)
- Commits `34fc7fe` + `76a0133` + `456aa42` + `7676468` present in `git log`; zero file deletions
- All task acceptance criteria re-verified (greps + suite exits listed above)

---
*Phase: 12-epub-intake*
*Completed: 2026-08-18*
