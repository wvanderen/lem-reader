---
phase: 17-reader-owned-metadata
plan: 02
subsystem: ui
tags: [react, native-dialog, dexie, metadata-overrides, library, e2e, playwright]

requires:
  - phase: 17-reader-owned-metadata
    provides: ArticleSchema readerTitle/readerAuthor override fields + the one effectiveTitle/effectiveAuthor derivation module (Plan 17-01)
provides:
  - EditMetadataDialog — the native edit surface with calm validation, per-field Reset, and the single override write (db.articles.put, conditional-spread key omission)
  - LibraryRow onEdit optional prop + pencil EditIcon + the library-row-edit affordance (aria-label names the effective title)
  - LibraryView editTarget wiring with the ingestionMeta fixture gate (OQ1) and refreshKey re-derivation on save
  - The library-side effective-value swap — row heading/byline/remove capture, Continue Reading strip article entries, and the D17-07 override-only search haystack
  - CSS hook classes .library-row-edit + .edit-metadata* on existing tokens
  - The full edit lifecycle proof: 9-cell e2e spec green on chromium/firefox/webkit
affects: [17-03 reader/review/export surface swaps, 17-04 bundle v3 + metadata conflicts, 17-05 migration + cross-surface e2e]

tech-stack:
  added: []
  patterns:
    - "Override-write row build: destructure the old override keys OUT of the base spread before conditionally re-adding trimmed values — a bare {...article} re-carries existing overrides, so omission-based key deletion silently fails (the Rule 1 fix)"
    - "Blank-title validity (OQ4/D17-04): Save disabled while blank-after-trim AND !titleReset; Reset title is the one explicit clear affordance and re-enables Save with an empty field"
    - "Fixture gate (OQ1): onEdit wired only on top-level article rows with ingestionMeta !== undefined — bundled Sample rows and book/chapter rows never reach the write path"

key-files:
  created:
    - src/ingestion/library/EditMetadataDialog.tsx
    - tests/e2e/library/metadata-edit.spec.ts
  modified:
    - src/ingestion/library/LibraryRow.tsx
    - src/ingestion/library/LibraryView.tsx
    - src/ingestion/library/libraryFilter.ts
    - src/ingestion/library/ContinueReadingStrip.tsx
    - src/app.css
    - tests/unit/library-search.test.ts

key-decisions:
  - "Destructure-out row build: const { readerTitle: _previousTitle, readerAuthor: _previousAuthor, ...base } = article before the conditional spreads — the plan's spread sketch alone re-carries existing overrides from a reopened article (Rule 1 fix, e2e-caught)"
  - "Esc/focus e2e uses the focused-add keyboard-open precedent (focus + Enter + toBeFocused) — WebKit does not focus buttons on mouse click, so a click-opened dialog captures <body> as the trigger; the shipped suite asserts focus restore on the keyboard/AT path"
  - "e2e corpus carries the canonical author as <meta name=\"author\"> — htmlToBlocks extracts author ONLY from meta tags, never <address> body text"
  - "RemoveConfirm copy stays generic (articleTitle informational, the shipped contract); the D17-09 swap lands at the removeTarget capture seam so the one effective name is what flows into the dialog"
  - "META-02 stays open — this plan closes its library half only (row/strip/search); Reader/Highlights/export surfaces close in 17-03"

patterns-established:
  - "Quiet row-level affordance pair: edit (accent hover) beside remove (destructive hover), both 44px var(--touch) icon buttons with aria-label templates naming the effective title"
  - "Per-field reset-to-canonical control: quiet hairline button per field; title carries the titleReset flag, author's empty state IS the no-override state"

requirements-completed: [META-01, META-03]

duration: 11 min
completed: 2026-08-29
status: complete
---

# Phase 17 Plan 02: Library Edit Affordance + EditMetadataDialog Summary

**EditMetadataDialog (native-dialog structural clone with per-field Reset, blank-title refusal, and the single conditional-spread override write) + the library-side effective-value swap across row/remove-capture/strip/search — the full edit lifecycle proven in 27 e2e cells across chromium, firefox, and webkit**

## Performance

- **Duration:** 11 min
- **Started:** 2026-08-29T23:40:18Z
- **Completed:** 2026-08-29T23:51:39Z
- **Tasks:** 3
- **Files modified:** 7 (2 created, 5 modified)

## Accomplishments
- Every library surface now derives display values from effectiveMetadata: row heading/byline, the remove-aria-label and removeTarget capture, Continue Reading strip article entries, and the D17-07 override-only search haystack (found by new name, not by old) — markup shape, heading ids, and template strings byte-stable (strengthen-only held)
- EditMetadataDialog ships as the RemoveConfirm/AddDialog structural clone: five-part dialog grammar, one prevented-submit form with labeled Title/Author inputs, canonical values visible ONLY as placeholders (No author fallback), per-field Reset title/Reset author, the pinned OQ4 blank-title refusal with the exact explanation copy, and the ONLY db.articles.put override write site repo-wide
- The edit affordance renders beside remove on Dexie-persisted top-level rows only (ingestionMeta gate — bundled Sample rows, book rows, and chapter sub-rows get none; proven by the fixture-gate e2e cell)
- 9-cell e2e spec proves save (META-01 row truth: provenance/id/revision untouched), reset-title key DELETION, absent-author restore, blank refusal, Esc/focus hygiene, fixture gate, reload persistence, override-only search, and strip consistency — 27/27 green on all three engines

## Task Commits

Each task was committed atomically:

1. **Task 1: Effective-value swap + override-only search haystack** - `ced8088` (test: RED — failing D17-07 cells) + `3e5de57` (feat: GREEN — the four surface swaps)
2. **Task 2: EditMetadataDialog + row affordance + wiring + styles** - `3825e65` (feat)
3. **Task 3: metadata-edit e2e lifecycle** - `293bf54` (fix: Rule 1 row-build fix surfaced by the spec run) + `17ac606` (test: the 9-cell spec)

**Plan metadata:** (final docs commit below)

## TDD Gate Compliance

Task 1 (`tdd="true"`) followed RED → GREEN with both gate commits in order:
- RED: `ced8088` `test(17-02):` — 2 failing cells (override-not-found-by-old-title, override-author match) + 1 passing regression cell; run exited FAIL as required
- GREEN: `3e5de57` `feat(17-02):` — 19/19 green + search-tag-filter e2e 9/9 chromium

Task 3 (`tdd="true"`) is the e2e-proof task over the Task 2 implementation (the 17-01 Task 2 precedent): its first run surfaced a REAL Rule 1 bug (cleared keys re-carried by the base spread), fixed in `293bf54`, after which all 27 cells pass. The failing-first run is the honest RED equivalent for this task shape.

## Files Created/Modified
- `src/ingestion/library/EditMetadataDialog.tsx` (NEW) — the edit surface: dialog grammar clone, field state with open-transition reset, saveBlocked rule, single write site
- `tests/e2e/library/metadata-edit.spec.ts` (NEW) — 9-cell lifecycle spec, readRow row-truth assertions, real-middleware seeding
- `src/ingestion/library/LibraryRow.tsx` — onEdit prop, library-row-edit button + EditIcon pencil glyph, effectiveTitle/effectiveAuthor display swap
- `src/ingestion/library/LibraryView.tsx` — editTarget state + dialog mount + ingestionMeta gate; removeTarget captures effectiveTitle
- `src/ingestion/library/libraryFilter.ts` — article haystack slots 1-2 → effectiveTitle/effectiveAuthor with the D17-07 comment; book haystack byte-unchanged
- `src/ingestion/library/ContinueReadingStrip.tsx` — article entry swap inside the truthy guard; book entries canonical
- `src/app.css` — .library-row-edit (accent hover) + .edit-metadata* geometry (tokens only, zero motion properties)
- `tests/unit/library-search.test.ts` — +3 D17-07 cells (pure additions)

## Decisions Made
- **Destructure-out row build (Rule 1 fix)** — `{...article, ...(trim ? {readerTitle} : {})}` cannot DELETE a key the captured article already carries; reopening an overridden row and pressing Reset silently kept the old override. The base spread now excludes both override keys; only trimmed values re-enter
- **Keyboard-open for the Esc/focus cell** — WebKit's click-does-not-focus-buttons behavior makes a click-opened dialog capture `<body>`; the shipped focused-add precedent (focus + Enter, assert toBeFocused) is the correct cross-engine discipline for the restore contract
- **Author extraction contract** — e2e corpus uses `<meta name="author">`; `<address>` body text is not an author source in htmlToBlocks
- **Strip consistency via reload** — the strip derives on LibraryView mount (the D8-03 contract; the remove flow likewise refreshes the list, not the live strip), so the cell asserts after page.reload
- **requirements-completed: [META-01, META-03]** — both proven end-to-end here (edit+save identity preservation; clear+restore incl. absent author). META-02 remains open: its library half shipped, Reader/Highlights/export halves close in 17-03

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Override keys re-carried by the base spread — Reset did not delete**
- **Found during:** Task 3 (metadata-edit e2e first run)
- **Issue:** The row build `{...article, ...(cond ? {readerTitle} : {})}` spreads the captured article's EXISTING overrides into the put, so a cleared field was never omitted and Reset kept the old value (violating the plan's "cleared fields are OMITTED so the whole-row put deletes the key" / META-03)
- **Fix:** Destructure `readerTitle`/`readerAuthor` out of the article before the base spread; only freshly trimmed values re-enter the row
- **Files modified:** src/ingestion/library/EditMetadataDialog.tsx
- **Verification:** Reset-title and absent-author e2e cells now assert key ABSENCE on the raw IndexedDB row; 27/27 green × 3 engines
- **Committed in:** 293bf54

**2. [Rule 3 - Blocking] e2e corpus author extraction**
- **Found during:** Task 3 (first run — provenance.author undefined)
- **Issue:** The paste corpus carried the author as `<p><address>` (the search-tag-filter pasteHtml shape), but htmlToBlocks extracts authors ONLY from `<meta name="author">`/`article:author` tags
- **Fix:** pasteHtml emits `<meta name="author">` in the head; omitted for the absent-author cell
- **Files modified:** tests/e2e/library/metadata-edit.spec.ts
- **Verification:** Save-flow cell asserts provenance.author round-trips untouched
- **Committed in:** 17ac606 (part of the Task 3 commit)

**3. [Rule 1 - Test-hygiene] Esc/focus cell WebKit divergence**
- **Found during:** Task 3 (firefox+webkit run — webkit only)
- **Issue:** The cell click-opened the dialog and asserted focus restore via activeElement aria-label; WebKit does not focus buttons on mouse click, so the trigger capture was `<body>` (browser behavior, not a product wedge — the shipped RemoveConfirm/AddDialog share it)
- **Fix:** Open via focus + Enter and assert `toBeFocused()` — the focused-add.spec.ts precedent for the keyboard/AT path
- **Files modified:** tests/e2e/library/metadata-edit.spec.ts
- **Verification:** Esc cell green on chromium, firefox, AND webkit
- **Committed in:** 17ac606 (part of the Task 3 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 1 blocking, 1 test-hygiene)
**Impact on plan:** The Rule 1 fix is load-bearing for META-03 (key deletion is the requirement's core guarantee); the other two are harness corrections. No scope creep — production behavior matches the plan's pinned contracts exactly.

## Issues Encountered
- Comment prose in EditMetadataDialog/LibraryView initially contained the literal string `db.articles.put`, inflating the single-write-site acceptance greps (4 matches in the dialog; LibraryView newly matching the repo-wide list). Reworded the comments per the 08-04 "prose must not trip acceptance greps" precedent before committing Task 2 — the code site is now the grep's only hit.

## Verification Results

| Gate | Command | Result |
|------|---------|--------|
| Task 1 unit gate | `npx vitest run tests/unit/library-search.test.ts` | 19/19 passed, exit 0 (RED run before: 2 failed as required) |
| Task 1 e2e gate | `npx playwright test tests/e2e/library/search-tag-filter.spec.ts --project=chromium` | 9/9 passed |
| Task 2 e2e gate | `npx playwright test tests/e2e/library/remove-cascade.spec.ts tests/e2e/library/browse-open.spec.ts --project=chromium` | 7/7 passed (re-run post-Rule-1-fix as part of the 16-cell gate: green) |
| Task 3 e2e gate | `npx playwright test tests/e2e/library/metadata-edit.spec.ts` | 27/27 passed across chromium, firefox, webkit |
| Full unit suite (honest gate) | `npm run test:unit -- --run` | 1318 passed / 0 failed / 13 intentional skips (92 files), exit 0 |
| Existing library specs (post-fix) | remove-cascade + browse-open + search-tag-filter, chromium | 16/16 passed |
| Single override write site | `rg -n 'db\.articles\.put' src/` | 1 in EditMetadataDialog (L174); other hits pre-existing (ExportImportService import-apply, LibrarySource.save, booksStore stamp) |
| Typecheck | `npx tsc` | exit 0 |
| Lint (changed files) | `npx eslint <7 changed files>` | exit 0 |
| Lint (whole repo) | `npm run lint` | not re-run — 3 pre-existing zipSlip.ts errors documented in 17-01-SUMMARY (out of scope, deferred-items.md) |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Library half of META-02 complete: row, remove capture, strip, and search all read the one effective name; the affordance + dialog + write path are shipped and engine-proven
- Ready for 17-03 (reader/review/export surface swaps — ArticleView/ReviewView/reviewFilter/markdown.ts sites mapped in 17-PATTERNS.md) and 17-04 (bundle v3 — overrides already ride ArticleSchema)
- Blockers: none. The deferred zipSlip.ts lint debt remains tracked in deferred-items.md.

---
*Phase: 17-reader-owned-metadata*
*Completed: 2026-08-29*

## Self-Check: PASSED

All 8 key-files exist on disk; all five task commits verified in git log (ced8088, 3e5de57, 3825e65, 293bf54, 17ac606); spec carries 9 test() cells; all acceptance criteria and plan-level verification gates recorded above with honest results.
