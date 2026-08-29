---
phase: 16-organized-library-and-focused-add-flow
plan: 03
subsystem: ui
tags: [react, native-dialog, ingestion, playwright, accessibility, e2e-migration]

# Dependency graph
requires:
  - phase: 16-organized-library-and-focused-add-flow (Plans 01 + 02)
    provides: LibraryView header-row landing zone + no-matches/strip gates (16-01); the AddDialog component + ingestCopy module with the props contract open/onCancel/onBookAdded (16-02)
provides:
  - Integrated focused Add workflow — header-row "Add to Library" trigger (aria-haspopup/aria-expanded), AddDialog mounted from LibraryView with onBookAdded wired to a refreshKey bump (ADD-01, D16-02/D16-03/D16-12)
  - Add-section dissolution with the .status load live region surviving byte-stable (role/aria/copy) as main#main > .status after the list region (Pitfall 7)
  - EMPTY_COPY.all.body words-only pointer at the Add button (D16-04)
  - Retired surface — IngestControl.tsx + its component suite + the unrouted LegacyFixtureList.tsx pair deleted; .ingest-control CSS block retired; repo-wide grep gate returns zero (T-16-05)
  - CSS hooks dialog.add-dialog (+::backdrop) / .add-dialog-inner / .add-source-picker / .add-source-row / .library-add-button on POLISH-07 tokens (320px-safe, overflow:auto, zero motion properties)
  - tests/e2e/library/add-dialog.ts — shared openAddDialog (idempotent) + pickSource helper centralizing every accessible name
  - The eleven ingestion-driving e2e specs + library-tidy structural re-anchor migrated in the same atomic change (Pitfall 1); D16-12 book-success anchors re-homed to the row-appears-via-refreshKey signal
affects: [16-04, ingestion, library-organization, reader-choice, focused-add-e2e]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Idempotent dialog-opening e2e helper: openAddDialog skips the trigger click when dialog.add-dialog is already visible — refusal-ladder sequences (4 uploads in one test) never click a button the open modal made inert"
    - "Closed-dialog DOM assertions: a closed native <dialog> subtree is display:none and excluded from the accessibility tree — getByRole cannot resolve inside it; CSS locators + locator.evaluate read the always-mounted picker through the closed dialog"
    - "D16-12 success anchors: book success closes the dialog, so the durable e2e success signal is li.book-row appearing via refreshKey (the in-dialog success copy is transient by design)"
    - "Grep-gate comment discipline at scale: repo-wide prose rewording (never the literal retired symbol) so rg 'IngestControl|ingest-control' src tests returns zero — the 08-04/16-02 precedent applied to ~30 historical comments"

key-files:
  created:
    - tests/e2e/library/add-dialog.ts
  modified:
    - src/ingestion/library/LibraryView.tsx
    - src/app.css
    - src/ingestion/AddDialog.tsx
    - src/ingestion/ingestCopy.ts
    - src/ingestion/LibrarySource.ts
    - src/ingestion/IngestionClient.ts
    - src/ingestion/types.ts
    - src/persistence/booksStore.ts
    - src/reader/SettingsPanel.tsx
    - src/reader/TagEntry.tsx
    - src/ingestion/library/LibrarySearch.tsx
    - tests/unit/ingestion-client.test.ts
    - tests/e2e/chrome/library-tidy.spec.ts
    - tests/e2e/ingestion/happy-path.spec.ts
    - tests/e2e/pdf-intake.spec.ts
    - tests/e2e/epub-intake.spec.ts
    - tests/e2e/library/markdown-upload.spec.ts
    - tests/e2e/library/upload-queue.spec.ts
    - tests/e2e/library/browse-open.spec.ts
    - tests/e2e/library/remove-cascade.spec.ts
    - tests/e2e/library/search-tag-filter.spec.ts
    - tests/e2e/a11y.spec.ts
    - tests/e2e/portability/round-trip.spec.ts
    - tests/e2e/portability/core-flow-spine.spec.ts
    - tests/component/AddDialog.test.tsx
    - tests/unit/epub-copy.test.ts
    - tests/unit/library/book-row.test.tsx
  deleted:
    - src/ingestion/IngestControl.tsx
    - tests/component/IngestControl.test.tsx
    - src/routes/LegacyFixtureList.tsx
    - tests/component/LegacyFixtureList.test.tsx

key-decisions:
  - "openAddDialog is idempotent by construction (isVisible check before the click): after a refusal the dialog stays open and consecutive drives in one test — the epub refusal ladder, the upload-queue re-pick cycles — must not re-click a trigger the open modal made inert"
  - "Book-success e2e anchors re-homed to li.book-row visible (refreshKey): D16-12 closes the dialog on success, so the in-dialog 'Book added' copy never settles visible — the row IS the durable signal (uploadValidBook, seedBookLibrary, round-trip, mixed-admission)"
  - "upload-queue's closed-dialog G2 assertions use CSS locators (.add-file-form button[type='submit']) + locator.evaluate: a closed dialog's subtree is excluded from the accessibility tree, so getByRole cannot resolve inside it — toBeDisabled itself works on hidden elements"
  - "tests/unit/ingestion-client.test.ts epub-picker arm re-homed onto AddDialog (kept its real-Dexie/real-fetch seams): showModal/close prototype stubs + an Upload-file radio click; book success asserted at the save level (db counts via vi.waitFor) instead of the transient in-dialog copy"
  - "LegacyFixtureList.tsx + its test deleted with IngestControl: unrouted since 08-03 ('preserved for reference'), mounted the retiring control, and the grep gate requires zero references — the reference role ended when its unique child retired"
  - "main#main > .status scoped 1100px measure rule added: the re-homed status card lost the dissolved section's measure wrapper (G1 discipline preserved); the direct-child selector is exactly the position library-tidy pins"

patterns-established:
  - "Idempotent shared dialog driver (openAddDialog/pickSource) — the one-file home for every dialog accessible name; future copy changes are single-file edits"
  - "Refusal-keeps-dialog-open vs success-closes-it as the two e2e driving modes: status-copy assertions scope to dialog.add-dialog .status on refusal paths; success paths assert the post-close world (row/navigation)"

requirements-completed: [ADD-01, ADD-03, ADD-04]

# Metrics
duration: 23 min
completed: 2026-08-29
status: complete
---

# Phase 16 Plan 03: Focused Add Workflow Integration Summary

**Header-row Add button + add-section dissolution + AddDialog mounting + IngestControl retirement landed atomically with all eleven ingestion e2e specs migrated through a shared idempotent dialog helper — 345 cells green across chromium/firefox/webkit.**

## Performance

- **Duration:** 23 min
- **Started:** 2026-08-29T19:13:01Z
- **Completed:** 2026-08-29T19:36:04Z
- **Tasks:** 2
- **Files modified:** 30 (1 created, 25 modified, 4 deleted)

## Accomplishments
- ADD-01 (D16-02/D16-03): the "Add to Library" button sits beside the h1 in the library header (gear-button aria shape: aria-haspopup="dialog" + aria-expanded mirror); the shell header is untouched (git diff empty — T-16-08); the three permanently-mounted forms are gone from the Library page and the control is deleted from the codebase
- The `.status` load live region survived the dissolution byte-stable (Pitfall 7 / T-16-06): identical classes, role="status", aria-live="polite", aria-atomic="true", and both copy branches ("Opening article…" / "Couldn't open this article."), re-homed as main#main > .status after the list region with a scoped 1100px measure rule
- ADD-04 wiring (D16-12): article success closes the dialog then navigates to #/article/<id> inside AddDialog; book success closes then bumps refreshKey via onBookAdded — the new book row appears with no reload (proven by re-anchored e2e waits on li.book-row)
- ADD-03 e2e layer: retry/re-pick (upload-queue's two refusal cycles), refusal visibility (pdf scanned/multi-column/corrupt, epub DRM/corrupt/empty/over-cap ladder), and both dedupe refusals all drive through the dialog and pass on the 3-engine matrix
- ADD-02 dialog styles: dialog.add-dialog geometry clone (margin:auto centering, 560px max-width, 320px-safe width, overflow:auto for high zoom) + picker/inner/button rules on POLISH-07 tokens — zero motion properties; the .ingest-control block retired in the same commit
- library-tidy re-anchored in the same commit as the DOM change (Pitfall 1): ordered regions (header → continue → list → status), main#main > .status scoping, header-row/Add-button wide/narrow geometry with the .status role/aria/copy contract byte-identical
- a11y strengthened: a second axe scan over the OPEN dialog region (include dialog.add-dialog) keeps the ingest-form WCAG coverage after the forms left the page surface

## Task Commits

Each task was committed atomically:

1. **Task 1: Header Add button, dissolution, AddDialog mount, dialog styles, retirement, library-tidy re-anchor** - `b60904e` (feat)
2. **Task 2: Shared openAddDialog/pickSource helper + migrate the 11 ingestion-driving specs** - `1aa9336` (test)

## Files Created/Modified
- `src/ingestion/library/LibraryView.tsx` - addOpen state, header Add button, add-section dissolution, .status re-homing, AddDialog mount with refreshKey wiring, EMPTY_COPY.all.body swap
- `src/app.css` - dialog.add-dialog family + .library-add-button added; .ingest-control block + .library-section-add retired; main#main > .status measure rule; tidy-sections comments updated
- `tests/e2e/library/add-dialog.ts` - NEW: the shared idempotent openAddDialog + pickSource helper (non-spec filename; centralizes every accessible name)
- `src/ingestion/IngestControl.tsx`, `tests/component/IngestControl.test.tsx` - DELETED (retired)
- `src/routes/LegacyFixtureList.tsx`, `tests/component/LegacyFixtureList.test.tsx` - DELETED (unrouted dead code mounting the retired control)
- `tests/unit/ingestion-client.test.ts` - epub-picker arm re-homed onto AddDialog (real Dexie/fetch seams kept; dialog stubs + radio step; success asserted at the save level)
- `tests/e2e/chrome/library-tidy.spec.ts` - post-dissolution structural anchors (order, status scoping, header geometry); .status contract byte-identical
- 11 ingestion-driving specs (happy-path, pdf-intake, epub-intake, markdown-upload, upload-queue, browse-open, remove-cascade, search-tag-filter, a11y, round-trip, core-flow-spine) - open/pick steps inserted; D16-12 book-success anchors re-homed; dialog-scoped status locators
- Comment-only: AddDialog.tsx, ingestCopy.ts, LibrarySource.ts, IngestionClient.ts, types.ts, booksStore.ts, SettingsPanel.tsx, TagEntry.tsx, LibrarySearch.tsx, AddDialog.test.tsx, epub-copy.test.ts, book-row.test.tsx - prose reworded for the zero-reference grep gate

## Decisions Made
- openAddDialog idempotence (isVisible check before clicking) — required by refusal sequences that stay inside the open modal; also makes inline insertion before every setInputFiles safe everywhere
- Book-success anchors moved to li.book-row (refreshKey) — the D16-12 close-first design makes in-dialog success copy transient, so the row is the only durable signal; upload-queue's G2 assertions read the closed dialog's always-mounted picker via CSS locators (role queries cannot see inside a closed dialog)
- The unit epub-arm block kept its real-Dexie/real-fetch integration value by rendering AddDialog instead of migrating to the fully-mocked AddDialog.test.tsx — assertions byte-stable except the book-success wait, which moved to the db level (one save-level waitFor)
- Scoped `main#main > .status` measure rule rather than editing the global .status card (many unrelated consumers)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Deleted unrouted LegacyFixtureList.tsx + its test**
- **Found during:** Task 1 (IngestControl retirement)
- **Issue:** src/routes/LegacyFixtureList.tsx imports and mounts IngestControl; it has been unrouted dead code since Plan 08-03 ("preserved for reference"), but deleting IngestControl breaks its import and the acceptance grep (`rg "IngestControl" src/` → zero) cannot pass while it exists
- **Fix:** Deleted both files (component + LegacyFixtureList.test.tsx). The byte-stable invariants they covered are owned by LibraryView + the v1.0 e2e suite (per the test file's own header)
- **Files modified:** src/routes/LegacyFixtureList.tsx, tests/component/LegacyFixtureList.test.tsx
- **Verification:** npx vitest run tests/component green (10 files, 138 tests); repo grep zero
- **Committed in:** b60904e (Task 1 commit)

**2. [Rule 3 - Blocking] Re-homed the tests/unit/ingestion-client.test.ts epub-picker arm onto AddDialog**
- **Found during:** Task 1 (IngestControl retirement)
- **Issue:** A describe block (3 tests) dynamically imports and renders IngestControl against real Dexie + real fetch — deleting the component breaks the unit suite; the plan's file list did not enumerate it
- **Fix:** Rewrote the block to render AddDialog (open prop + Upload-file radio click + showModal/close prototype stubs). The over-cap (zero fetch/no ArrayBuffer) and dedupe (no second write) assertions are byte-identical; the book-success test now asserts the one-transaction save at the db level (db.books/articles counts via vi.waitFor) because D16-12 closes the dialog before the transient copy settles
- **Files modified:** tests/unit/ingestion-client.test.ts
- **Verification:** npx vitest run tests/unit green (1165 passed); the 3 cells pass in-place
- **Committed in:** b60904e (Task 1 commit)

**3. [Rule 1 - Bug] upload-queue closed-dialog disabled assertion used a role query**
- **Found during:** Task 2 verification (1 failing cell)
- **Issue:** `getByRole("button", { name: /add file/i })` cannot resolve inside a CLOSED native dialog (display:none subtree excluded from the accessibility tree) — "element(s) not found" after book success closes the dialog
- **Fix:** Switched that single assertion to the CSS locator `.add-file-form button[type='submit']` (toBeDisabled works on hidden elements), matching the locator.evaluate discipline on the line above
- **Files modified:** tests/e2e/library/upload-queue.spec.ts
- **Verification:** upload-queue 3/3 chromium; full 105-cell battery green
- **Committed in:** 1aa9336 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 bug)
**Impact on plan:** All three were forced consequences of the plan's own decisions (the zero-reference grep gate + D16-12 close-first). No scope creep; assertions were preserved or strengthened, never relaxed.

### Documented anchor updates beyond the two the plan enumerated

The plan enumerated upload-queue scoping + library-tidy as the legitimate anchor changes. D16-12's close-on-book-success additionally forced re-anchoring every in-dialog book-success copy wait: epub-intake uploadValidBook + mixed-admission, upload-queue test 2, a11y seedBookLibrary, round-trip machine A — each now waits on `li.book-row` visible (the durable refreshKey signal the plan's own must_haves describe). Refusal-path copy assertions stay in-dialog (the dialog stays open on refusals) and are byte-identical.

## Issues Encountered
- One transient e2e failure during Task 2 (the closed-dialog role query above) — fixed and re-verified with the full battery; no flakiness observed across the two full chromium runs + the 3-engine run

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The focused Add workflow is fully integrated: one trigger, no permanent forms, D16-10 in-flight blocking and D16-12 success arms live in the app
- Ready for 16-04 (dialog focus/Esc/geometry proof + acceptance matrix): the focus-trap/Esc/restore/high-zoom claims are still jsdom-blind by design — 16-04 proves them in real browsers via the panel-keyboard precedent, and can reuse tests/e2e/library/add-dialog.ts directly
- requirements-completed closes ADD-01/ADD-03/ADD-04 (ADD-02 closed at the component layer by 16-02 per the split precedent; 16-04 owns the full-matrix proof)
- No blockers

## Self-Check: PASSED

- tests/e2e/library/add-dialog.ts exists on disk and exports openAddDialog + pickSource
- Both task commits present in git log (b60904e feat, 1aa9336 test)
- Plan-level verification: 345 passed / 0 failed / 6 documented skips across chromium + firefox + webkit (ingestion + library + portability + library-tidy + a11y); `rg "IngestControl|ingest-control" src tests` returns zero; `git diff HEAD~2 -- src/reader/Header.tsx src/App.tsx` empty (T-16-08)
- Component suite 138 + unit suite 1165 vitest cells green; tsc + eslint clean

---
*Phase: 16-organized-library-and-focused-add-flow*
*Completed: 2026-08-29*
