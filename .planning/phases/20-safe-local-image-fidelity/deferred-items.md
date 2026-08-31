# Phase 20 Deferred Items

## Animated AVIF passes the animation gate (accepted residual — A4 / Pitfall 8)

**Recorded by:** 20-07 (phase gate), per the plan's T-20-29 mandate.

`is-animated@2.0.2` covers animated GIF / APNG / animated WebP only
[VERIFIED: official README, 20-RESEARCH §Pitfall 8]. An animated AVIF
sequence therefore passes the D20-09 animation gate and would enter the
reader as an accepted asset — violating D20-09's spirit (nothing in the calm
reader moves on its own), though its letter lists GIF/WebP/APNG.

**Why accepted (Assumption A4):** animated AVIF is rare in longform
publishing (the phase's representative corpus class); hand-rolling an AVIF
sequence sniffer is the Don't-Hand-Roll anti-pattern the research warns
against.

**Warning sign for reopening (Pitfall 8):** corpus containing animated AVIF.
If real-world ingestion starts admitting animated AVIFs, the options are a
hand-rolled AVIF-box sniffer or an upstream `is-animated` capability gain —
either way it is a deliberate follow-up, never a silent pass.

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
  matrix seeding via real saves) will hit the same boundary and must either
  engine-skip honestly or resolve this item first.
- **20-06 update (2026-08-31):** the boundary now also skips ONE epub-intake
  cell — the admitted-chapter-figure render cell (its saveBook writes the
  chapter's asset row in the D20-15 Blob shape; re-probed and re-confirmed
  during 20-06 Task 2: plain `new Blob(["hello"])` puts fail identically).
  The refused-figure cell needs NO skip (zero asset rows — green on webkit).
- **20-08 update (2026-08-31):** the boundary skips ONE imagery cell —
  offline-reopen's "ingested article + Dexie asset rows reopen" cell (its
  seeding writes Blob rows through raw IndexedDB). Everything else in
  tests/e2e/imagery/ is engine-complete: decode-matrix + the tall-geometry
  cell seed plain article rows under the registry-backed figure-heavy id so
  the AssetProvider resolves in-memory registry blobs (createObjectURL never
  touches IndexedDB), and the offline guarantee itself is proven on webkit by
  the fixture-corpus + legacy-remote cells.
- **20-07 gate update (2026-08-31):** the first honest 3-engine full-suite
  run since 20-04 (the interim gates ran chromium-only) surfaced the
  already-named 20-04 happy-path asset-envelope cell as failing on webkit —
  its `save(article, assets)` path writes the D20-15 Blob rows through Dexie,
  so the add never navigates (waitForURL timeout). Carried with the same
  documented `test.skip` pattern as 20-05/20-06/20-08; chromium + firefox
  prove the save-wiring chain. Residual count for the permanent record:
  **5 e2e skips** (2 from 20-05 + 1 from 20-06 + 1 from 20-08 + 1 from
  20-04 via this gate).
- The 20-07 full-suite gate counts these 5 e2e skips (2 from 20-05 + 1 from
  20-06 + 1 from 20-08 + 1 from 20-04 surfaced by the gate itself) in its
  documented residual set (never silently green).

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
