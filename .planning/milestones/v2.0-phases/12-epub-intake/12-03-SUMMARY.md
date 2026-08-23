---
phase: 12-epub-intake
plan: 03
subsystem: persistence + ingestion
tags: [epub, dexie, books-store, ingestion-client, calm-copy, fake-indexeddb]

# Dependency graph
requires:
  - phase: 12-epub-intake
    provides: BookSchema + Book type, widened IngestionResponseSchema book ok-variant, EPUB_MAX_BYTES (12-01)
  - phase: 11-pdf-intake
    provides: extension-aware pre-read picker cap pattern (11-04 Pattern 7), mapReasonToCopy byte-pinning precedent
provides:
  - Dexie version(5) — books store ("id, title, *tags") + articles bookId index (APPEND-only, NO .upgrade())
  - src/persistence/booksStore.ts — listBooks (BooksLoadResult union, safeParse-per-row drop), getBook, hasBook, saveBook (ONE rw transaction, puts-only), removeBook (ONE cascade transaction over six stores), setBookTags
  - IngestionClient.ingestEpub(b64, filename?) — POST /api/ingest?format=epub, IngestionResponseSchema envelope parse + per-article ArticleSchema.parse loop, EpubIngestionSuccess {book, articles, skippedCount}
  - IngestControl .epub arm — isEpub branch before any read, EPUB_MAX_BYTES earliest cap, book-level dedupe-refuse + one-transaction save, D12-11 skip-disclosure success copy, four calm epub copy entries
  - saveBook's top-level bookId row denormalization — the v5 index contract for 12-06 grouping reads
affects: [12-04 server picker branch (consumes ?format=epub hint), 12-05 orchestrator e2e, 12-06 reader/library UX (listBooks/getBook/setBookTags + bookId grouping), 12-07 portability, 12-08 dist proof]

# Tech tracking
tech-stack:
  added: []
  patterns: ["top-level index-column denormalization written by the store seam (canonical stays ingestionMeta.bookId; ArticleSchema strips unknown keys on read)", "File stub with Object.defineProperty size patch for over-cap picker tests (no 10MB allocation)", "size-override File + arrayBuffer spy = no-read proof at the earliest enforcement point"]

key-files:
  created:
    - src/persistence/booksStore.ts
    - tests/unit/persistence/books-store.test.ts
    - tests/unit/epub-copy.test.ts
  modified:
    - src/persistence/db.ts
    - src/ingestion/IngestionClient.ts
    - src/ingestion/IngestControl.tsx
    - tests/unit/ingestion-client.test.ts

key-decisions:
  - "saveBook denormalizes a TOP-LEVEL bookId onto each stored chapter row — the plan's v5 articles index (\"...,*tags, bookId\") is a top-level index but CanonicalArticle carries bookId only inside ingestionMeta; without the stamp, where(\"bookId\") serves nothing. ArticleSchema's z.object strips the unknown key on read, so the canonical contract stays ingestionMeta.bookId and rows parse byte-identically through the Zod-at-boundary discipline"
  - "saveBook's parameter is BookInput = Omit<Book, \"addedAt\"> & {addedAt?: string} — the plan's \"stamp addedAt only when the caller passed none\" requires the parameter TYPE to permit none; full Book callers are structurally compatible"
  - "ingestEpub parses the FULL widened IngestionResponseSchema (T-12-10 layer 1 — the envelope parse validates the Book itself) and THEN runs the mandated per-article ArticleSchema.parse loop (layer 2); refusal check precedes the res.ok guard so a 413-with-typed-envelope still carries the cataloged reason"
  - "?format=epub is a COPY-ONLY hint for the middleware's pre-read 413 reason selection (12-RESEARCH Pitfall 2 planner resolution) — enforcement stays content-length-based and body-agnostic on the server"
  - "The .status live region gained a success render arm (the book path stays on the list — navigation is 12-06's); both single-article success paths now setMessage(null) so their navigating success renders stay quiet (behavior-preserving: they showed nothing on success before)"
  - "The over-cap picker proof lives in tests/unit/ingestion-client.test.ts as an RTL render (the plan's fallback — no 11-04 picker test exists in tests/component/IngestControl.test.tsx): patched-size File stub + arrayBuffer spy + zero-fetch assertion"
  - "ING-05 stays unchecked — this plan ships persistence + client primitives only; e2e proof lands with 12-04/12-05 (the 04-02 PAGE-01 / 09-01 PORT-01 / 10-01 RECV-01 / 12-01 split precedent)"

patterns-established:
  - "Top-level index denormalization discipline: stored-row index columns may exceed the Zod schema (strip-mode reads stay canonical) as long as the STORE SEAM owns the write"
  - "Over-cap File testing without allocation: Object.defineProperty(file, \"size\", {value: cap+1}) — the picker only reads .name/.size before refusing"

requirements-completed: []  # ING-05 closes at the end-to-end plans (12-05+); foundations + client halves only — the 12-01 split precedent

# Metrics
duration: 15 min
completed: 2026-08-18
status: complete
---

# Phase 12 Plan 03: EPUB Intake Client Half Summary

**Dexie v5 additive append (books store + articles bookId index, no .upgrade()), the booksStore seam with one-transaction atomic save and six-store cascade remove, the ingestEpub client wrapper with two-layer re-validation, and the .epub picker arm with the earliest cap, book-level dedupe-refuse, and four calm DOC-06 refusal strings**

## Performance

- **Duration:** 15 min
- **Started:** 2026-08-18T15:13:55Z
- **Completed:** 2026-08-18T15:28:44Z
- **Tasks:** 2 (both auto)
- **Files modified:** 7 (3 created, 4 modified)

## Accomplishments

- **Dexie v5 APPEND (Pitfall 9)**: `version(5).stores({ articles: "id, revision, source, addedAt, *tags, bookId", …, books: "id, title, *tags" })` — the diff shows v1-v4 byte-unchanged and NO `.upgrade()` callback (additive indexes + a store that starts empty, the v3/v4 precedent); `books!: Table<Book, string>` definite-assignment annotation; `bookId?: string` widened onto the articles Table type
- **booksStore seam** (252 lines): `listBooks` (BooksLoadResult discriminated union, BookSchema.safeParse per row, corrupt-row drop, classifyStorageError routing), `getBook`, `hasBook` (the dedupe-refuse primitive), `saveBook` (ONE `rw` transaction over books+articles, puts-only, addedAt stamped only when absent, top-level bookId denormalization), `removeBook` (ONE transaction over all six stores: TOC ∪ live bookId carriers, collect-highlight-ids-before-delete, compound-range highlight/location deletes, note cascade, bulk article delete, book row), `setBookTags` (D12-04, empty-string drop)
- **ingestEpub**: POST `{epub, filename?}` to `/api/ingest?format=epub`; envelope parsed through the widened IngestionResponseSchema (validates the Book itself), refusal-before-res.ok ordering preserved, per-article `ArticleSchema.parse` loop, returns `{book, articles, skippedCount}`
- **IngestControl .epub arm**: `isEpub` branches BEFORE any arrayBuffer read with the EPUB_MAX_BYTES earliest cap (T-12-09); book-level `hasBook(book.id)` dedupe-refuse preceding `saveBook`; success copy "Book added to your library." + D12-11 disclosure ("2 chapters could not be read." / "1 chapter could not be read."); four calm copy entries; `accept=".md,.html,.pdf,.epub"` + meta copy "Accepts .md, .html, PDF, and EPUB books"
- **Test coverage**: 9 books-store specs (round-trip, corrupt drop, mid-transaction atomicity via creating-hook, zero-rows cascade across six stores, live-truth carriers, calm no-op, tags round-trip, v4→v5 additive upgrade at unit level) + 6 client specs (URL/body/round-trip, malformed-article refusal, typed epub-protected refusal, zero-fetch no-read over-cap proof, book save with disclosure, book-level dedupe-refuse) + 3 epub-copy specs (four strings byte-for-byte, 20-reason exhaustive, case-insensitive no-jargon guard)

## Task Commits

Each task was committed atomically:

1. **Task 1: Dexie v5 append + booksStore seam (save/remove transactions)** — `c102171` (feat)
2. **Task 2: ingestEpub client wrapper + .epub picker arm + calm copy** — `b475789` (feat)

## Files Created/Modified

- `src/persistence/db.ts` — v5 append block (additive only), `books!` Table annotation, `bookId?` on the articles row type
- `src/persistence/booksStore.ts` — NEW: the six-function store seam
- `src/ingestion/IngestionClient.ts` — `ingestEpub` + `EpubIngestionSuccess`
- `src/ingestion/IngestControl.tsx` — picker arm, save path, four copy entries, accept/meta widening, success render arm
- `tests/unit/persistence/books-store.test.ts` — NEW: 9 specs
- `tests/unit/ingestion-client.test.ts` — extended: 6 new specs (ingestEpub × 3, picker arm × 3)
- `tests/unit/epub-copy.test.ts` — NEW: 3 specs pinning the four strings + jargon guard

## Decisions Made

- See key-decisions above; all seven carry forward to STATE.md.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The v5 bookId index was inert without a row-level denormalization**
- **Found during:** Task 1 (the live-truth cascade test failed: 1 article remained after removeBook)
- **Issue:** The plan's articles index string (`"...,*tags, bookId"`) is a TOP-LEVEL Dexie index, but chapter articles carry bookId only inside `ingestionMeta` — `where("bookId")` returned nothing, so removeBook's live-truth arm (and 12-06's grouping reads) could never fire
- **Fix:** `saveBook` stamps `{ ...article, bookId: stamped.id }` on every chapter row it writes; ArticleSchema's strip-mode z.object drops the unknown top-level key on read, so the canonical contract stays `ingestionMeta.bookId` and every existing Zod-at-boundary read is unaffected (proven by the full-suite green run)
- **Files modified:** src/persistence/booksStore.ts, tests/unit/persistence/books-store.test.ts
- **Verification:** all 9 books-store specs green; full unit suite 1038/0
- **Committed in:** c102171 (Task 1 commit)

**2. [Rule 3 - Blocking] JSX in a .ts test file failed the transform**
- **Found during:** Task 2 (first vitest run: PARSE_ERROR at `render(<IngestControl />)`)
- **Issue:** The plan pins the filename `tests/unit/ingestion-client.test.ts` (.ts), but the picker-arm tests need to render the component
- **Fix:** `render(createElement(IngestControl))` via lazy `import("react")` — keeps the plan's filename, preserves the file's lazy-import discipline
- **Files modified:** tests/unit/ingestion-client.test.ts
- **Verification:** 22/22 green in the two-file run
- **Committed in:** b475789 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both are direct consequences of the plan's own contracts (the top-level index the plan specifies; the filename the plan pins). No scope creep.

## Issues Encountered

- **booksStore "all six stores" vocabulary**: the plan's zero-rows truth counts books/articles/highlights/notes/location (the five seeded kinds) with settings asserted at its never-seeded 0 — the test's `countAllStores` covers all six explicitly.
- **The 11-04 picker test does not exist** (`tests/component/IngestControl.test.tsx` has no file-upload case), so the plan's fallback branch applied — the over-cap proof (zero fetch calls + no ArrayBuffer read) lives in ingestion-client.test.ts as an RTL render with a patched-size File stub.

## Verification Evidence (plan-level)

- `npx vitest run tests/unit/persistence/books-store.test.ts` — 9/9 green
- `npx vitest run tests/unit/ingestion-client.test.ts tests/unit/epub-copy.test.ts` — 22/22 green
- `npx tsc --noEmit` — exit 0 (after both tasks)
- Adjacent suites (component ×12, pdf-copy, books-store) — 136/136 green
- **Full unit suite: 1038 passed / 0 failed / 10 intentional skips** (`npm run test:unit -- --run`)
- `git diff src/persistence/db.ts` — additions only; v1-v4 version blocks byte-unchanged; zero `.upgrade()` matches in the v5 block
- Acceptance greps: `version(5)` ✓, `books: "id, title, *tags"` ✓, six booksStore exports ✓ (saveBook/removeBook each exactly ONE `db.transaction`), `epub-protected` case ✓, `accept=".md,.html,.pdf,.epub"` ✓, `hasBook(result.book.id)` precedes `saveBook` ✓

## User Setup Required

None — no external service configuration required.

## Authentication Gates

None.

## Next Phase Readiness

- 12-04 (server picker branch) consumes the `?format=epub` hint its middleware reason-selection needs; the client half of the contract (`{epub, filename?}` body + typed refusal mapping) is pinned by the new specs
- 12-05 (orchestrator + e2e) exercises this plan's `hasBook`→`saveBook` path against the real server
- 12-06 (reader/library UX) builds on `listBooks`/`getBook`/`setBookTags` + the `bookId` grouping index (now fed by saveBook's denormalization)
- The four epub copy strings are byte-pinned at the live exported surface — 12-06's library disclosure must reuse the same "N chapters could not be read." phrasing (D12-11)

## Self-Check: PASSED

- All key-files exist on disk (`[ -f ]` verified for the 3 created + 4 modified)
- Commits `c102171` + `b475789` present in `git log`
- All task acceptance criteria re-verified (greps + suite exits listed above)

---
*Phase: 12-epub-intake*
*Completed: 2026-08-18*
