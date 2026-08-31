---
phase: 20-safe-local-image-fidelity
plan: 03
subsystem: persistence
tags: [dexie, indexeddb, blob, zod, transactions, cascade, atomicity, compound-key]

# Dependency graph
requires:
  - phase: 20-safe-local-image-fidelity (Plan 01)
    provides: FigureBlock asset-ref model (asset:img-<12hex>), shared image caps
  - phase: 20-safe-local-image-fidelity (Plan 02)
    provides: IngestionSuccess.assets ValidatedAsset[] (transport re-validated), the envelope the save path consumes
  - phase: 12-epub-intake
    provides: saveBook/removeBook one-transaction cascade shapes extended here
provides:
  - Dexie v6 `assets` store — compound PK [articleId+assetId] + articleId index, additive append, no upgrade callback
  - assetsStore seam: AssetRecordSchema + putAssets / bulkGetAssets / loadAllAssets / deleteAssetsForArticle (Zod-at-boundary reads, calm corrupt-row drops)
  - Atomic lifecycle: save(article, assets?) / saveBook(book, articles, assets?) one-transaction upserts with old-row replacement; remove / removeBook asset cascades inside the existing single transactions
  - BookAsset flat list shape (ValidatedAsset & { articleId }) — the 20-06 book envelope consumption contract
affects: [20-04 renderer + AssetProvider (bulkGetAssets), 20-05 portability (loadAllAssets + seven-table array-overload import), 20-06 epub book assets, 20-08 verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Article-owned asset rows: lifecycle = the owning article's — saved/replaced/deleted in the SAME transaction (D20-15), no refcount/GC machinery"
    - "Upsert replacement before puts: db.assets.where(\"articleId\").equals(id).delete() FIRST inside the save transaction — a refused figure leaves no orphan blob (D20-07)"
    - "readonly-ARRAY transaction overload standardized on saveBook/removeBook — tuple overloads stop at five; 20-05's seven-table import path follows (12-07 lesson)"
    - "Node-Blob test harness: fake-indexeddb clones via the global structuredClone (Node's V8 serializer), which degrades jsdom Blobs to plain objects — install Node's Blob as the spec global for faithful round-trips"

key-files:
  created:
    - src/persistence/assetsStore.ts
    - tests/unit/persistence/assets-cascade.spec.ts
    - tests/unit/library/library-source.test.ts
  modified:
    - src/persistence/db.ts
    - src/ingestion/LibrarySource.ts
    - src/persistence/booksStore.ts
    - vitest.config.ts

key-decisions:
  - "putAssets/deleteAssetsForArticle are never-throw discriminated-result seams; the transactional paths (save/saveBook/remove/removeBook) intentionally let throws propagate — a swallowed failure would break Dexie rollback and with it D20-04 atomicity"
  - "loadAllAssets returns the plain array (loadAllHighlights precedent — the export service owns errors upstream); bulkGetAssets carries the per-article AssetsLoadResult union (loadHighlights precedent — 20-04's provider routes ok:false)"
  - "saveBook takes the flat BookAsset list (ValidatedAsset & { articleId }) — consistent with the 20-06 book envelope where assets span chapter articles"
  - "save/remove keep the tuple transaction forms (3 and 5 tables — within the overload limit); saveBook/removeBook standardize the array form"

patterns-established:
  - "Stamp-before-transaction extended to asset rows: createdAt + Blob construction happen before db.transaction opens on every write path"
  - "RED-gate scaffolding casts (wider local call signatures so tsc stays clean at the RED commit, removed in GREEN) — second application of the 20-02 precedent"

requirements-completed: []  # IMG-03/IMG-04 persistence layer shipped, but both close at the end-to-end plans (20-04 imagery specs, 20-05 portability round-trip, 20-07 corpus re-check) — mirrors the 04-02 PAGE-01 / 20-01 / 20-02 split precedent

# Metrics
duration: 20min
completed: 2026-08-31
status: complete
---

# Phase 20 Plan 03: Dexie v6 Assets Store + Atomic Lifecycle Summary

**Additive v6 `assets` store (compound [articleId+assetId] PK + FK index, Pitfall 9 held with zero exceptions) with a Zod-at-boundary store seam and one-transaction save/upsert/cascade wiring across LibrarySource and booksStore — rollback-proven atomicity, no orphan blobs**

## Performance

- **Duration:** 20 min
- **Started:** 2026-08-31T15:18:35Z
- **Completed:** 2026-08-31T15:39:03Z
- **Tasks:** 2 (both TDD: RED→GREEN)
- **Files modified:** 7 (3 created, 4 modified)

## Accomplishments

- **Dexie v6 APPEND block**: `assets: "[articleId+assetId], articleId"` — compound primary key (the v1 location precedent) plus the `articleId` index that exists exactly for the one-transaction range deletes. v1..v5 blocks byte-unchanged (git diff hunks are pure insertions), zero `.upgrade()` callbacks (all four textual `.upgrade(` matches are the pre-existing "NO `.upgrade()`" comments — 3 at plan time + 1 new, 0 code calls)
- **The store seam 20-04/20-05 consume**: `AssetRecordSchema` (img-<12hex> assetId shared with the assetRef contract, closed five-type contentType enum, `z.instanceof(Blob)` data, ISO datetime createdAt), `putAssets` (stamp-before-transaction, never-throw), `bulkGetAssets` (compound-key read, discriminated result), `loadAllAssets` (plain-array whole-library read), `deleteAssetsForArticle` (index range delete wrapper)
- **Atomic article+asset save (D20-04/T-20-14)**: `save(article, assets = [])` runs upsert range-delete → article put → asset puts in ONE rw transaction; the injected creating-hook failure test proves the article put rolls back to zero rows
- **No orphan blobs (D20-07/T-20-13)**: re-ingest of the same id replaces the asset set wholesale (including the to-zero case); remove/removeBook delete every owned row inside the existing single transactions (five- and six-table respectively)
- **Back-compat proven**: every existing save/saveBook call site compiles unchanged via default params; the new library-source.test.ts locks save(article)-with-assets-omitted to zero asset rows; full unit suite 1519 passed / 0 failed / 13 documented skips (after removing a leftover diagnostic probe that briefly ran as a 16th new cell)

## Task Commits

Each task was committed atomically (TDD: RED test commit → GREEN feat commit):

1. **Task 1: Dexie v6 assets store + assetsStore seam** — `1617323` (test) + `e3b3d1b` (feat)
2. **Task 2: Atomic save/upsert + article/book deletion cascades** — `368e01a` (test) + `5e13666` (feat)

## TDD Gate Compliance

- Task 1: RED `1617323` (spec fails on the missing assetsStore module; vitest include arm added so it actually runs) → GREEN `e3b3d1b` (4/4) ✓
- Task 2: RED `368e01a` (7 failing cells — (a)/(b)/(c)/(c+)/(e)/(e+)/upsert-default; the (d) + absence-assertion cells were vacuously green pre-implementation, dependent on (a)'s writes) → GREEN `5e13666` (15/15) ✓

## Files Created/Modified

- `src/persistence/db.ts` — v6 APPEND block (assets store string, all v5 stores re-declared verbatim), `AssetRecordRow` interface, `assets!: Table<AssetRecordRow, [string, string]>` definite-assignment property (books! precedent)
- `src/persistence/assetsStore.ts` — NEW: the five-export seam (AssetRecordSchema, putAssets, bulkGetAssets, loadAllAssets, deleteAssetsForArticle) + AssetsLoadResult/AssetsWriteResult unions; classifyStorageError routing on never-throw paths
- `src/ingestion/LibrarySource.ts` — `save(article, assets: ValidatedAsset[] = [])` one-transaction atomic upsert (range-delete → put → puts, rows built before the transaction); `remove` gains db.assets (five-table transaction) + the one-line cascade
- `src/persistence/booksStore.ts` — `BookAsset` type (flat ValidatedAsset & { articleId }); `saveBook(book, articles, assets = [])` array-overload transaction with per-chapter range-delete + puts; `removeBook` six-table array transaction with per-chapter assets delete in the existing loop
- `tests/unit/persistence/assets-cascade.spec.ts` — NEW: 12 cells — seam round-trip + corrupt-row drops + empty-store, then (a) save-with-assets, (b) injected-failure rollback, (c/c+) upsert replacement, (d) remove cascade, (e/e+/e++) saveBook per-chapter rows + removeBook cascade + parameterless back-compat
- `tests/unit/library/library-source.test.ts` — NEW (per-concern home): 3 cells — default-param omission, explicit [], default re-save still drops old rows
- `vitest.config.ts` — unit project gains `tests/unit/**/*.spec.ts` include arm (see deviation 1)

## Decisions Made

- putAssets/deleteAssetsForArticle return discriminated never-throw results (the plan's "all public functions never-throw" read at the seam level), while the four transactional paths let throws propagate — the booksStore precedent (listBooks never throws, saveBook propagates) and a hard requirement of Dexie rollback semantics: swallowing an asset-put failure would commit a half-saved article, violating D20-04
- `loadAllAssets` returns the plain array (the loadAllHighlights precedent the artifacts name); `bulkGetAssets` carries the per-article discriminated union (the loadHighlights precedent 20-04's AssetProvider routes)
- saveBook's assets parameter is the flat `BookAsset` list (ValidatedAsset & { articleId }) — the plan's "flat ValidatedAsset-with-articleId shape consistent with the envelope"
- Transaction overload forms: tuple where within the five-table limit (save: 3 tables after… 2+assets; remove: 5), array where standardized (saveBook: 3, removeBook: 6 required) — per the plan's "standardize the array form here" for the book paths 20-05 extends to seven tables

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] New spec would silently never run — vitest include gap**
- **Found during:** Task 1 (before writing the RED spec)
- **Issue:** the workspace `unit` project includes only `tests/unit/**/*.test.ts|.test.tsx`; the plan-mandated `tests/unit/persistence/assets-cascade.spec.ts` (`.spec.ts`, outside `server/`) matched NEITHER project — the exact silent-never-runs trap vitest.config.ts's own 11-06 comment warns about
- **Fix:** added the `tests/unit/**/*.spec.ts` arm to the unit project's include (server/ still excluded wholesale), with a comment citing the precedent
- **Files modified:** vitest.config.ts
- **Verification:** the RED run executed and failed on the missing module (previously it would have reported "no test files found" or been skipped by `npm run test:unit` filters)
- **Committed in:** 1617323

**2. [Rule 1 - Bug/harness] jsdom Blobs degrade to plain objects through fake-indexeddb**
- **Found during:** Task 1 GREEN (first run: every row dropped as "corrupt")
- **Issue:** fake-indexeddb clones values with the GLOBAL structuredClone — Node's V8 serializer under vitest. jsdom's Blob is not a host object to it, so stored Blobs read back as plain Objects; `z.instanceof(Blob)` then (correctly) dropped every row — including the valid ones
- **Fix:** the spec installs Node's own Blob (`node:buffer`) as the file-scoped global before the lazy module imports — Node's Blob IS a host object and round-trips byte-identically (probe-verified), the faithful analogue of the production contract (browser Blobs are host objects to the browser's structured clone). Production code unchanged; the real-browser proof is 20-04's Playwright imagery specs
- **Files modified:** tests/unit/persistence/assets-cascade.spec.ts
- **Verification:** round-trip cell reads bytes back equal through `arrayBuffer()`; corrupt-row-drop cells still drop genuinely-corrupt rows
- **Committed in:** e3b3d1b

**3. [Rule 1 - Bug] TS7 BlobPart strictness on Uint8Array<ArrayBufferLike>**
- **Found during:** Task 1 GREEN (`tsc --noEmit`; vitest alone does not typecheck — the 20-01 lesson)
- **Issue:** `new Blob([asset.bytes])` fails TS2322 under TS 7 (jsdom BlobPart requires ArrayBuffer-backed views — the 09-01 BufferSource lesson)
- **Fix:** copy into a fresh ArrayBuffer-backed `new Uint8Array(asset.bytes)` at row-build time in all three write paths (assetsStore.putAssets, LibrarySource.save, booksStore.saveBook) — save-time copy, not hot; the Blob constructor copies bytes anyway
- **Files modified:** src/persistence/assetsStore.ts, src/ingestion/LibrarySource.ts, src/persistence/booksStore.ts
- **Verification:** `npx tsc --noEmit` clean
- **Committed in:** e3b3d1b (assetsStore) + 5e13666 (the two lifecycle paths)

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 bugs — one test-harness, one type-system)
**Impact on plan:** All three were correctness requirements for the spec to run faithfully and the code to compile; zero behavior changes beyond the plan's contract, no scope creep (vitest.config.ts is the only file outside the plan's list).

## Issues Encountered

- A temporary diagnostic probe spec (`_probe.spec.ts`) used to isolate deviation 2 was left on disk during one full-suite run (it passed, inflating that run's count by one); deleted immediately after discovery and the suites re-run clean (1519/0/13 without it)
- The Task-2 (d) remove-cascade cell was vacuously green at RED (it depends on (a)'s asset writes, which did not exist pre-implementation); its assertions became load-bearing in GREEN where remove must actually delete the two rows save wrote

## Threat Surface

All three threat-register mitigations landed as planned: T-20-12 (per-row safeParse, calm drops — never coerced), T-20-13 (upsert range-delete + article/book cascades all inside the same transaction as the article writes), T-20-14 (single rw transaction; asset-put failure rolls back the article put — creating-hook-proven). No new security-relevant surface beyond the plan's threat model.

## User Setup Required

None — no external services, no new packages (pure composition over Dexie/Zod, exactly as PATTERNS predicted).

## Next Phase Readiness

- 20-04 (renderer) consumes `bulkGetAssets` (discriminated per-article read) + the three FigureBlock states; `AssetRecordRow.data` is the createObjectURL-direct Blob
- 20-05 (portability) consumes `loadAllAssets` (plain-array export read) and follows the array-overload transaction form for its seven-table applyImport; the upsert-replacement discipline composes with the article conflict-ride semantics
- 20-06 (EPUB) consumes `saveBook(book, chapters, assets)` exactly — the BookAsset flat list is the book-envelope contract
- IMG-03/IMG-04 stay Pending in REQUIREMENTS.md by design — they close at the end-to-end/corpus plans, mirroring the 20-01/20-02 split precedent
- Honest-gate note: the full-unit gate ran here (1519/0/13); the full e2e gate belongs to the phase's final plans (20-01/20-02 precedent)

## Self-Check: PASSED

- Created files exist: src/persistence/assetsStore.ts ✓, tests/unit/persistence/assets-cascade.spec.ts ✓, tests/unit/library/library-source.test.ts ✓
- All four task commits present in git log: 1617323, e3b3d1b, 368e01a, 5e13666 ✓
- Verification commands re-run: `npx vitest run tests/unit/persistence/assets-cascade.spec.ts tests/unit/library/library-source.test.ts` → 15/15 ✓; `tests/unit/persistence/books-store.test.ts` → 10/10 ✓; full unit+server suite → 1520 passed / 0 failed / 13 documented skips (one transient diagnostic cell removed; the steady-state suite is 1519) ✓; `rg -c "version\(6\)" src/persistence/db.ts` → 1 ✓; `.upgrade(` in code → 0 (4 comment-only mentions) ✓; v1..v5 byte-unchanged → pure-insertion diff hunks ✓; `db.assets` present in LibrarySource (5 sites) + booksStore (5 sites) ✓; tsc + eslint clean ✓

---
*Phase: 20-safe-local-image-fidelity*
*Completed: 2026-08-31*
