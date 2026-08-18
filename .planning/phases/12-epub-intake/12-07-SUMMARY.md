---
phase: 12-epub-intake
plan: 07
subsystem: portability
tags: [portability, bundle-v2, books, conflicts, atomic-import, round-trip, epub, playwright]

# Dependency graph
requires:
  - phase: 12-epub-intake (Plan 03)
    provides: Dexie v5 books store + articles bookId index, the booksStore seam (listBooks), saveBook's top-level bookId denormalization
  - phase: 12-epub-intake (Plan 04)
    provides: the epub-fixtures generator builders (validBookEpub3) the round-trip e2e uploads
  - phase: 09-cross-device-portability
    provides: the export/import loop this plan rides (bundle.ts, ExportImportService.ts, conflicts.ts with MemoizedArticleText + two-explicit-arity db.transaction puts-only closure, the two-browser-context A/B surrogate, D9-04/D9-14 semantics)
provides:
  - ExportBundleSchema schemaVersion 1|2 union read + optional books array (writers emit 2, always carrying the field); the validateBundle newer-version peek threshold at > 2 (v2 parses, v3+ refuses newer-schema-version)
  - The book-id conflict kind in the D9-14 table (skip-by-default; identical-hash duplicate = calm no-op; overwrite = incoming put; keep-both behaves as skip)
  - ImportPreviewData/ResolvedImportPlan book counts + booksToWrite; orphan-tolerant chapter classification (a chapter whose book is absent or skipped still rides articlesToWrite)
  - applyImport's db.books transaction widening (books + chapters + annotations in ONE Dexie transaction; six-table settings branch on Dexie's readonly-array overload) + the imported-chapter top-level bookId stamp (v5 index uniformity)
  - Portability unit extensions (bundle-schema, export-service, validate-bundle, conflicts, atomic-import, import-preview-dialog fixture) + the round-trip e2e book flow + v1-compat gate
affects: [12-08 dist proof (v2 bundle bytes in the shipped build), Phase 13 perf harness (book-flood import measurement, T-12-19), future PORT work (books are now first-class bundle records)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bundle schema evolution: z.union([z.literal(1), z.literal(2)]) + optional array field (the ReaderSettingsSchema 04-02 precedent applied to the portability envelope — v1 hydrates, v3+ forward-rejects, writers emit 2)"
    - "Dexie transaction arity ceiling: the tuple overloads stop at FIVE tables (dexie.d.ts L859-863); a six-table set uses the readonly-array overload (L858) — same explicit-table-set discipline, the tsc-required arity form"
    - "Imported-row index uniformity: the import path re-stamps the top-level bookId denormalization saveBook owns, so the v5 index serves grouping/cascade reads identically for saved and imported chapters (canonical FK stays ingestionMeta.bookId; Zod strips the top-level key on read)"
    - "E2e determinism proof at manifest level: two exports of identical record content hash identically (per-block SHA-256 excludes exportedAt) — cross-machine equality asserted via deep-equal-minus-exportedAt + computeManifest equality"

key-files:
  created: []
  modified:
    - src/portability/bundle.ts
    - src/portability/ExportImportService.ts
    - src/portability/conflicts.ts
    - src/reader/ImportPreviewDialog.tsx
    - tests/unit/portability/bundle-schema.test.ts
    - tests/unit/portability/export-service.test.ts
    - tests/unit/portability/validate-bundle.test.ts
    - tests/unit/portability/conflicts.test.ts
    - tests/unit/portability/atomic-import.test.ts
    - tests/unit/portability/import-preview-dialog.test.tsx
    - tests/e2e/portability/round-trip.spec.ts

key-decisions:
  - "manifest.ts is deliberately untouched — the plan's 'manifest integrity unchanged' resolution: books are NOT a manifest block (the five Phase-9 blocks stay); T-12-17's mitigation is Zod-at-boundary (BookSchema inside ExportBundleSchema) + the puts-only transaction, and the D9-03 mechanism is byte-identical"
  - "listBooks !ok on export tolerates as books: [] (the D9-12-shaped precedent: records never hostage to one store read) — chapters still ride articles with ingestionMeta.bookId"
  - "The book conflict is same-id + DIFFERENT originalFileHash; identical-hash is a calm no-op skip (the 09-03 identical-duplicate precedent at book level); keep-both behaves as skip because a minted book id would strand every chapter FK (documented narrowing — the dialog offers keep-both only for highlight-id/note-id)"
  - "applyImport stamps the top-level bookId on chapter puts (Rule 2): without it, imported chapter rows lack the v5 index column saveBook writes — removeBook's live-truth arm and any where('bookId') read would silently miss imported chapters; the spread is synchronous data shaping inside the puts-only closure (the exact saveBook pattern)"
  - "The six-table applyPreferences transaction uses Dexie's readonly-array overload — the tuple overloads stop at five tables; the five-table branch keeps the explicit tuple form byte-identical"
  - "Orphan tolerance is by construction, not a check: chapters classify as articles regardless of their book — a book skipped as a conflict or absent from a partial export still yields standalone epub-chapter articles (unit-pinned both ways: absent book AND skipped book)"
  - "The dialog summary sentence does not mention books (preview SHAPE carries the counts, as the plan requires; copy is 12-06+/UI scope) — the e2e asserts the existing sentence shape with chapters counted among articles"
  - "BUNDLE_FILENAME stays lem-reader-bundle-v1.zip — the planner resolution: the zip FILENAME is not the version contract (the inner bundle.json schemaVersion is; D9-01's locked filename unchanged)"

patterns-established:
  - "Union-read bundle versioning: any future bundle widening repeats the 1|N union + optional-field + bumped-peek-threshold triple (v(N) parses, v(N+1)+ refuses loudly)"
  - "Cross-machine e2e equality: deep-equal minus exportedAt + manifest-block equality is the honest determinism bar (a whole-zip byte compare would false-positive on the timestamp)"

requirements-completed: []  # ING-05 already closed by 12-05; this plan serves PORT-01/02 extension (no new requirement id in the milestone table)

# Metrics
duration: 19 min
completed: 2026-08-18
status: complete
---

# Phase 12 Plan 07: Books in the Portability Loop Summary

**Bundle v2 ships compatibly: the schemaVersion 1|2 union reads Phase 9 bundles unchanged while writers emit 2 with an always-present books array, the D9-14 table gains the skip-by-default book-id kind with identical-hash calm no-ops, applyImport writes books + chapters + annotations in ONE Dexie transaction with orphan-tolerant chapters and index-uniform bookId stamps, and a two-browser-context e2e proves a real uploaded book travels machines with its chapter-2 highlight byte-equal, its traveled location surfacing as the 'Chapter 2 of 4' strip entry, and a deterministic re-export — all green across chromium/firefox/webkit**

## Performance

- **Duration:** 19 min
- **Started:** 2026-08-18T16:23:47Z
- **Completed:** 2026-08-18T16:43:27Z
- **Tasks:** 2 (both auto)
- **Files modified:** 11 (0 created, 11 modified)

## Accomplishments

- **Bundle v2 (Task 1)**: `ExportBundleSchema` widens additively per Pattern 6 — `schemaVersion: z.union([z.literal(1), z.literal(2)])` (the ReaderSettingsSchema precedent; v1 hydrates, v3+ forward-rejects per D9-04) and `books: z.array(BookSchema).optional()` (composed, never re-declared). `buildBundleBytes` joins `listBooks()` to the export `Promise.all` (Zod-validated read, STATE-04; `!ok` tolerates as `books: []`), writers emit `schemaVersion: 2` always carrying the books field (empty on book-free libraries), and the `validateBundle` newer-version peek moves `> 1` → `> 2` (v2 parses; v3+ refuses `newer-schema-version` with `bundleVersion` — older-reader honesty preserved). The manifest mechanism is byte-identical (books are not a manifest block). `BUNDLE_FILENAME` unchanged.
- **Book conflicts + atomic import (Task 2)**: `conflicts.ts` extends the D9-14 table with the `book` kind — same id + different `originalFileHash` conflicts skip-by-default; identical-hash is a calm no-op; overwrite puts the incoming book; keep-both behaves as skip (a minted book id would strand chapter FKs). `ImportPreviewData`/`ResolvedImportPlan` gain book counts/`booksToWrite`/`skipped.books`. Chapters classify as articles regardless of their book — orphan-tolerant by construction. `applyImport` widens the transaction with `db.books` (six-table settings branch on Dexie's readonly-array overload; the tuple overloads stop at five) and stamps the top-level `bookId` denormalization on chapter puts (saveBook's v5 index contract — imported rows stay index-uniform; canonical FK stays `ingestionMeta.bookId`).
- **Round-trip e2e (Task 2)**: the BOOK two-machine flow — machine A uploads `validBookEpub3()` through the real picker/middleware/pipeline, a Node-derived confident highlight + mid-article location seed onto chapter 2, export → machine B imports → the book row travels identity-intact (title/TOC/hash), all 4 chapters land carrying BOTH bookId forms, the highlight offsets are byte-equal AND render a visible mark, the library groups the book with 4 chapter sub-rows, the traveled location surfaces as the ONE "The Synthetic Book — Chapter 2 of 4" strip entry, and a re-export from B deep-equals A's export minus `exportedAt` with identical manifest blocks. Plus the v1-compat gate: a synthesized Phase 9 v1 bundle imports exactly as before with zero book writes.

## Task Commits

Each task was committed atomically:

1. **Task 1: Bundle schemaVersion 2 (union read) + books in export** — `bbd2f63` (feat)
2. **Task 2: Import apply + book conflicts + orphan tolerance + round-trip e2e** — `81936e9` (feat)

## Files Created/Modified

- `src/portability/bundle.ts` — 1|2 union + optional books + the filled-contract header note
- `src/portability/ExportImportService.ts` — listBooks in the export Promise.all, v2 write, peek > 2, db.books in both transaction branches, chapter bookId stamp
- `src/portability/conflicts.ts` — the book kind + preview/plan widening + book classification loops
- `src/reader/ImportPreviewDialog.tsx` — tsc-required Record widening (DEFAULT_OVERRIDES + KIND_LABELS book rows)
- `tests/unit/portability/bundle-schema.test.ts` — v1 regression, v2 with/without books, literal(3) rejects, malformed book rejects
- `tests/unit/portability/export-service.test.ts` — book library emits v2 + full record + chapters with ingestionMeta.bookId; books: []; determinism
- `tests/unit/portability/validate-bundle.test.ts` — peek fixture v2 → v3, new v2-accepts case, round-trip pins v2
- `tests/unit/portability/conflicts.test.ts` — 8 new book specs (conflict kind, no-op, overrides, preview counts, orphan tolerance ×2)
- `tests/unit/portability/atomic-import.test.ts` — 3 new specs (atomic books+chapters with both bookId forms, rollback covers books, v1 zero-book-writes)
- `tests/unit/portability/import-preview-dialog.test.tsx` — fixture gains book counts + DEFAULTS book row
- `tests/e2e/portability/round-trip.spec.ts` — base flow pins v2 + books: []; the book round-trip; the v1-compat gate

## Decisions Made

- See key-decisions above; all eight carry forward to STATE.md.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ImportPreviewDialog.tsx required the book Record entries (tsc)**
- **Found during:** Task 2 (widening `ConflictKind` with `"book"` makes `Record<ConflictKind, …>` literals incomplete — TS2739)
- **Issue:** `DEFAULT_OVERRIDES: Overrides` and `KIND_LABELS: Record<ConflictKind, …>` fail tsc without a `"book"` entry; the file is outside the plan's files_modified list
- **Fix:** Two additive entries (`book: "skip"` + `{ one: "book", other: "books" }`) — also what makes the extended D9-14 per-kind override actually reachable through the dialog (a book conflict renders "1 conflicting book" with a Skip/Overwrite select; keep-both not offered, mirroring the article kinds)
- **Files modified:** src/reader/ImportPreviewDialog.tsx
- **Verification:** tsc clean; import-preview-dialog suite green; round-trip e2e green
- **Committed in:** 81936e9

**2. [Rule 3 - Blocking] Pinned tests of the changed contract needed the new versions**
- **Found during:** Task 1 (first suite run)
- **Issue:** validate-bundle.test.ts peeked with `schemaVersion: 2` as the "newer" fixture and pinned `buildBundleBytes` output at v1; export-service.test.ts pinned v1 — all three are tests of exactly the behavior Task 1 changes
- **Fix:** Peek fixture v2 → v3 (+ a new v2-accepts-through-the-peek case), round-trip + export-service expectations 1 → 2; import-preview-dialog fixture gained the required `books` counts
- **Files modified:** tests/unit/portability/validate-bundle.test.ts, tests/unit/portability/export-service.test.ts, tests/unit/portability/import-preview-dialog.test.tsx
- **Verification:** full portability suite 150/150
- **Committed in:** bbd2f63 (validate-bundle, export-service) + 81936e9 (dialog fixture)

**3. [Rule 2 - Missing Critical] Imported chapter rows lacked the top-level bookId index stamp**
- **Found during:** Task 2 (designing applyImport's article puts)
- **Issue:** `dexieLibrarySource.list()` strips the top-level `bookId` (Zod z.object unknown-key strip), so chapters ride the bundle carrying only `ingestionMeta.bookId`; a plain `db.articles.put(article)` on import writes rows WITHOUT the v5 index column `saveBook` stamps — `removeBook`'s live-truth arm and any `where("bookId")` read would silently miss imported chapters (row shape would depend on ingestion path)
- **Fix:** applyImport stamps `{ ...article, bookId: ingestionMeta.bookId }` on chapter puts — the exact saveBook pattern (synchronous spread inside the puts-only closure); canonical FK unchanged; pinned by the atomic-import both-bookId-forms assertion and the e2e per-chapter row checks
- **Files modified:** src/portability/ExportImportService.ts
- **Verification:** atomic-import 46/46; e2e 9/9 cells
- **Committed in:** 81936e9

**4. [Rule 1 - Bug] The e2e re-export determinism assertion failed on firefox — the mode toggle persists readingMode**
- **Found during:** Task 2 verification (combined-suite run: firefox book round-trip red; isolated run green)
- **Issue:** My own new test toggled machine B paginated → scrolling to surface the highlight mark, but the M/toggle PERSISTS `readingMode` — B's re-export then honestly carried `"scrolling"` while A's export carried `"paginated"`, failing the deep-equal
- **Fix:** Toggle back to the traveled mode before re-exporting (restore the imported preference, assert aria-label returns to paginated) — the determinism proof stays whole-bundle, no field exclusions
- **Files modified:** tests/e2e/portability/round-trip.spec.ts
- **Verification:** 57/57 portability + epub-intake e2e cells across 3 engines
- **Committed in:** 81936e9 (folded into the Task 2 commit's test before commit — the fix preceded the commit)

---

**Total deviations:** 4 auto-fixed (2 blocking, 1 missing critical, 1 bug)
**Impact on plan:** All four are direct consequences of the plan's own contracts (the widened ConflictKind, the bumped versions, the v5 index contract 12-03 established, and the plan's determinism truth). No scope creep; every pinned outcome proven.

## Issues Encountered

- Dexie's `transaction` tuple overloads cap at five tables — the six-table applyPreferences branch uses the readonly-array overload (L858). Documented in-code and in key-decisions; not a deviation from the plan's "explicit-arity" intent (the array overload IS the tsc-required arity form for six tables).
- The dialog summary sentence intentionally does not name books — the plan requires the preview SHAPE to carry book counts (it does), and copy is UI scope outside this plan's files.

## Verification Evidence (plan-level)

- `npx vitest run tests/unit/portability/bundle-schema.test.ts tests/unit/portability/export-service.test.ts` (+ validate-bundle) — 34/34 green (Task 1 gate)
- `npx vitest run tests/unit/portability/conflicts.test.ts tests/unit/portability/atomic-import.test.ts` — 46/46 green (Task 2 gate)
- `npx playwright test tests/e2e/portability/round-trip.spec.ts` — **9/9 green across chromium + firefox + webkit** (base flow + book round-trip + v1-compat)
- `npx playwright test tests/e2e/portability/ tests/e2e/epub-intake.spec.ts` — 57/57 green (adjacent suites: import-preview, download-smoke, highlights-export, zip-slip-regression, a11y, epub-intake)
- **Full unit suite: 1127 passed / 0 failed / 10 intentional skips** (`npm run test:unit -- --run`)
- `npx tsc --noEmit` — exit 0 after every task
- Acceptance greps: `z.union([z.literal(1), z.literal(2)])` in bundle.ts ✓; `books: z.array(BookSchema).optional()` ✓; `BUNDLE_FILENAME` absent from the diff (unchanged) ✓; applyImport closure grep clean (no safeParse/crypto/fetch/randomUUID inside) ✓; `db.books` in both transaction branches ✓

## Threat Mitigation Proof (plan threat_model)

- **T-12-17 (forged book rows)**: books parse through BookSchema inside ExportBundleSchema — the malformed-book rejection (bundle-schema), the v2-accepts case (validate-bundle), and unknown-key stripping (z.object) prove the boundary; the transaction closure stays puts-only (grep-verified)
- **T-12-18 (silent book loss on version mismatch)**: the union read keeps v1 importable (v1-compat e2e + unit regressions) and the > 2 peek refuses loudly (validate-bundle v3 peek test with bundleVersion surfaced) — never a silent partial import (D9-04 preserved)
- **T-12-19 (book-flooded bundles)**: accepted as scoped — the existing bomb-cap/entry limits bound the archive; book count bounded by library scale; Phase 13 perf harness measures

## User Setup Required

None — no external service configuration required.

## Authentication Gates

None.

## Next Phase Readiness

- 12-08 (dist proof) can grep the shipped bundle for the v2 write path — `schemaVersion: 2` and the books array are in the production export path
- The book conflict kind renders in ImportPreviewDialog automatically (preview.conflicts-driven); if a later plan wants book counts in the dialog sentence/status copy, the preview shape already carries them
- Phase 13 perf harness should include a book-heavy import measurement (T-12-19's accepted disposition)

## Self-Check: PASSED

- All key-files exist on disk (`[ -f ]` verified for the 11 modified)
- Commits `bbd2f63` + `81936e9` present in `git log`; zero file deletions (`git diff --diff-filter=D` empty for both)
- All task acceptance criteria re-verified (greps + suite exits listed above)

---
*Phase: 12-epub-intake*
*Completed: 2026-08-18*
