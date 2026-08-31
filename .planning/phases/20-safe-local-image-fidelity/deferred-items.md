# Phase 20 Deferred Items

## WebKit engine boundary: IndexedDB refuses ALL Blob values (surfaced 20-05)

**Found during:** 20-05 Task 3 (3-engine run of the new asset e2e cells)

**Evidence (probe-verified 2026-08-31, Playwright 1.61.1 WebKit):**
- Every Blob construction variant fails the IDB put with
  `UnknownError: Error preparing Blob/File data to be stored in object store`:
  view-backed, ArrayBuffer-backed, `new Blob(["hello"])` (string), and
  fetch-body blobs.
- Raw structured-clone values put fine in the same store/transaction:
  plain objects, `Uint8Array`, `ArrayBuffer`.
- Chromium + Firefox store the identical rows without issue.

**Impact:**
- The two 20-05 asset cells (round-trip SC#4 assets; import-preview
  dangling-ref) carry a documented `test.skip(browserName === "webkit")`.
- Any future plan that stores a `data: Blob` row on webkit (20-08 imagery
  matrix seeding via real saves, EPUB chapter assets in 20-06) will hit the
  same boundary and must either engine-skip honestly or resolve this item
  first.
- The 20-07 full-suite gate MUST count these 2 skips in its documented
  residual set (never silently green).

**Open option (human decision — Rule 4 architectural, NOT auto-applied):**
switch `AssetRecordRow.data` from `Blob` to `Uint8Array`/`ArrayBuffer`
(wrapping in a Blob only at `createObjectURL` time). This would make the
row engine-agnostic in the Playwright matrix, but it changes the locked
D20-15 shape ("IndexedDB-native Blob, createObjectURL-direct"), touches
`AssetRecordSchema`, `putAssets`/`LibrarySource.save`/`saveBook`/
`applyImport`, and adds a per-read copy. Real Safari supports IDB Blob
storage (Safari 10+), so this is a Playwright-WebKit build limitation, not
a known production-Safari defect — re-verify against real Safari before
paying the migration.
