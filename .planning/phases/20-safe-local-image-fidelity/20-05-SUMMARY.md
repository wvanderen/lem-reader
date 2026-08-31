---
phase: 20-safe-local-image-fidelity
plan: 05
subsystem: portability
tags: [zip, fflate, sha256, dexie, indexeddb, blob, react, playwright]

# Dependency graph
requires:
  - phase: 20-safe-local-image-fidelity plan 03
    provides: Dexie v6 assets store ([articleId+assetId]), AssetRecordSchema, loadAllAssets, upsert-replacement cascade discipline
  - phase: 20-safe-local-image-fidelity plan 04
    provides: AssetProvider object-URL rendering (naturalWidth proof target), figure asset: ref contract
provides:
  - Bundle v4 asset round-trip (schema union widening, manifest assets block, writer zip entries, import gates, D9-14 ride, applyImport asset puts)
  - The two UI-SPEC verbatim import-preview dangling-asset warning strings (reader-facing honesty surface for the no-broken-refs gate)
  - e2e harness asset-seeding arm (browser-side Blob construction, buildBundleZip assetEntries crafting vector)
affects: [20-safe-local-image-fidelity plans 06-08, portability, import preview UI]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fourth union-widening application: schemaVersion 1|2|3|4 union + optional assets array; peek threshold > 4 forward-refuses v5+ (the 12-07/17-04 discipline)"
    - "Manifest assets block hashes JSON.stringify(bundle.assets ?? []) on BOTH compute sides — deterministic verification extended, writer/verifier share the one block"
    - "Assets ride article records: ResolvedImportPlan.assetsToWrite consumed by the puts-only applyImport closure after per-article range-deletes — NO new ConflictKind, conflicts inherit D9-14 resolution"
    - "Stamp-before-transaction extended to imported asset rows: Blob construction outside the closure; seven-table readonly-ARRAY transaction overload on both branches"
    - "Engine-boundary honesty: documented test.skip when the engine cannot represent the production data shape (Playwright WebKit + IDB Blob values)"

key-files:
  created:
    - tests/unit/portability/bundle-v4.spec.ts
    - .planning/phases/20-safe-local-image-fidelity/deferred-items.md
  modified:
    - src/portability/bundle.ts
    - src/portability/manifest.ts
    - src/portability/ExportImportService.ts
    - src/portability/conflicts.ts
    - src/reader/ImportPreviewDialog.tsx
    - tests/unit/portability/import-preview-dialog.test.tsx
    - tests/e2e/portability/_portability.ts
    - tests/e2e/portability/core-flow-spine.spec.ts
    - tests/e2e/portability/round-trip.spec.ts
    - tests/e2e/portability/import-preview.spec.ts

key-decisions:
  - "Bundle filename stays lem-reader-bundle-v1.zip while the envelope ships schemaVersion 4 — the filename is not a version contract (plan-locked)"
  - "Dangling-asset skips surface ONLY as import-preview warning entries riding the existing list — assets inherit their article's D9-14 resolution; no new ConflictKind/row/choice"
  - "WebKit Playwright cannot store ANY Blob value in IndexedDB (probe-verified: UnknownError on view/ArrayBuffer/string/fetch-body constructions; raw Uint8Array/ArrayBuffer put fine) — the two new asset cells carry documented engine-conditional skips; chromium+firefox prove the round-trip; switching AssetRecordRow.data away from Blob is a Rule 4 human decision recorded in deferred-items.md, not auto-applied"
  - "Writer-emit assertion flips v3→v4 at four e2e sites (round-trip ×3, core-flow-spine ×1) — the sanctioned 12-07/17-04 version-bump assertion-update precedent"
  - "seedRows/buildBundleZip strengthen-only extension: assets arm builds Blobs browser-side (Playwright's JSON-only argument channel), assetEntries param crafts the missing-entry vector"

patterns-established:
  - "Missing-entry e2e vector: declare the asset in bundle.assets meta but omit the raw zip entry via buildBundleZip's assetEntries — the honest-refusal probe shape for any future bundle-content gate"
  - "Browser-side blob byte-equality: Blobs never cross the evaluate channel; read bytes inside the page and compare as number arrays (the 09-06 raw-row precedent, now the asset form)"

requirements-completed: [IMG-04]

# Metrics
duration: 11min resume session (plus prior interrupted session)
completed: 2026-08-31
status: complete
---

# Phase 20 Plan 05: Bundle v4 Asset Round-Trip Summary

**Bundle v4 ships images as first-class zip citizens — schema union widening, manifest-verified per-asset sha256, bomb/integrity/no-broken-refs import gates, D9-14 conflict ride — with byte-equal cross-machine asset round-trip proven in chromium + firefox e2e and the two verbatim preview warnings landed.**

## Performance

- **Duration:** ~11 min (resume session; Tasks 1-2 were committed by an earlier run interrupted by a usage limit — that session's time is not counted)
- **Started:** 2026-08-31T19:02:57Z (resume)
- **Completed:** 2026-08-31T19:13:40Z
- **Tasks:** 3 (2 TDD: RED+GREEN commits each; Task 3 single feat commit)
- **Files modified:** 12

## Accomplishments

- **Task 1 (committed prior session):** `schemaVersion` widened to the 1|2|3|4 union with `AssetExportMeta` (sha256 hex-64, entry `^assets/[^/]+/img-[a-z0-9]{12}$`); manifest `assets` block hashing `JSON.stringify(bundle.assets ?? [])` on both compute sides; writer joins `loadAllAssets()` and rides raw bytes in the SAME `zipSync` call (the Assumption A5 mixed-value proof); peek threshold `> 4` forward-refuses v5+.
- **Task 2 (committed prior session):** Import gates after unzip + union parse — per-asset entry presence, `isSafeEntryName`, byteLength + sha256 equality (mismatch → corrupted, never-throw), `MAX_ASSET_BYTES`/`MAX_ARTICLE_ASSET_BYTES` caps riding the existing filter-first bomb discipline; no-broken-refs gate skips dangling articles with the explicit `dangling-assets` reason (orphans drop inertly); `assetsToWrite` rides D9-14 resolution into the puts-only seven-table `applyImport` (rollback proven by injected creating-hook failure; ConflictKind union byte-unchanged).
- **Task 3 (this session):** The two 20-UI-SPEC §Copywriting verbatim warning strings in the existing `import-preview-warnings` list (anatomy byte-stable beyond the additive entries); SC#4 assets round-trip e2e (machine A export with asset → Node-side v4 envelope proof → machine B UI import → raw-row byte-equality → local `naturalWidth > 0` render); dangling-ref e2e cell (verbatim singular warning + partial import of the other article).

## Task Commits

Each task was committed atomically:

1. **Task 1: v4 schema + manifest assets block + writer asset entries** — `0457430` (test/RED) + `24a1338` (feat/GREEN)
2. **Task 2: Import gates — caps, sha256, no-broken-refs, conflict ride, apply** — `5dacaf1` (test/RED) + `73e3649` (feat/GREEN)
3. **Task 3: Preview warnings + round-trip e2e cells** — `f1c5067` (feat)

**Plan metadata:** final docs commit (this commit)

## Files Created/Modified

- `src/portability/bundle.ts` — v4 union + `AssetExportMeta` + optional `assets` array
- `src/portability/manifest.ts` — deterministic `assets` block on both compute sides
- `src/portability/ExportImportService.ts` — writer asset entries (`assets/<articleId>/<assetId>`), import validation gates, `assetsToWrite` puts after per-article range-deletes in the seven-table puts-only closure
- `src/portability/conflicts.ts` — `assetsToWrite` on `ResolvedImportPlan`; `danglingAssetArticles` preview field; ConflictKind union untouched
- `src/reader/ImportPreviewDialog.tsx` — the two verbatim dangling-asset warning entries (singular + plural honest count)
- `tests/unit/portability/bundle-v4.spec.ts` — NEW: A5 mixed-value zipSync proof, v4 write/manifest cells, v1/v2/v3 union-read, v5 refusal, bomb, sha256 mismatch, dangling skip + partial import, incoming-wins replacement rollback, identical no-op, orphan drop
- `tests/unit/portability/import-preview-dialog.test.tsx` — 3 warning-string dialog cells
- `tests/e2e/portability/_portability.ts` — strengthen-only: assets store in cleared/seeded stores, browser-side Blob seeding arm, `buildBundleZip` assetEntries
- `tests/e2e/portability/core-flow-spine.spec.ts` — writer-emit envelope assertion v3→v4
- `tests/e2e/portability/round-trip.spec.ts` — v3→v4 assertion flips + the SC#4 assets cell
- `tests/e2e/portability/import-preview.spec.ts` — the dangling-ref verbatim-warning cell

## Decisions Made

- **Resume protocol honored:** Tasks 1-2 verified against the plan (git show + spec re-runs: 47/47 bundle-v4 + validate-bundle) before finishing Task 3 from the prior run's uncommitted working-tree edits (reviewed and completed, not reverted). Prior-run throwaway probes (`_probe*.spec.ts`) deleted, never committed.
- **WebKit engine boundary recorded, not worked around:** probe evidence (every Blob construction variant fails IDB put with `UnknownError: Error preparing Blob/File data`; raw typed arrays put fine) means the two new cells cannot run on Playwright WebKit. Documented `test.skip` + `deferred-items.md`; changing the locked D20-15 `data: Blob` row shape is a Rule 4 architectural decision left to the human (real Safari supports IDB Blob storage — Safari 10+).
- **IMG-04 closes here** per the plan frontmatter (`requirements: [IMG-04]`): validation, limits, conflict ride, and no-broken-refs are proven end-to-end on chromium + firefox; the webkit residual is a test-engine representation limit documented for the 20-07 gate, not a product-behavior gap.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale test title still said "inside a v3 bundle" after the v4 assertion flip**
- **Found during:** Task 3 (3-engine verification run)
- **Issue:** The prior session flipped the overrides round-trip cell's assertion to `toBe(4)` but left the test *title* reading "v3 bundle" — a misleading name future readers would grep against
- **Fix:** Title updated to "inside a v4 bundle" (same cell, no assertion change)
- **Files modified:** tests/e2e/portability/round-trip.spec.ts
- **Verification:** full portability dir green on chromium/firefox/webkit
- **Committed in:** f1c5067 (Task 3 commit)

**2. [Rule 3 - Blocking/harness] Playwright WebKit cannot store Blob values in IndexedDB — the two new e2e cells failed on webkit at every Blob put**
- **Found during:** Task 3 (plan action requires "Run across chromium + firefox + webkit")
- **Issue:** `seedRows` (machine A) and `applyImport` itself (machine B) abort on webkit with `UnknownError: Error preparing Blob/File data to be stored in object store`. Probe matrix: ALL Blob constructions fail (view, ArrayBuffer, string, fetch-body); raw Uint8Array/ArrayBuffer values put fine — an engine/build limitation, not a code defect; no prior test ever put a Blob into IDB on webkit (20-04's asset cell was chromium-only by plan)
- **Fix:** documented engine-conditional `test.skip(browserName === "webkit", …)` on exactly the two Blob-put-dependent cells (the ssrf-matrix residual-skip precedent); chromium + firefox carry the full proof; the architectural alternative (store Uint8Array, wrap at read) recorded in `deferred-items.md` for human decision
- **Files modified:** tests/e2e/portability/round-trip.spec.ts, tests/e2e/portability/import-preview.spec.ts, .planning/phases/20-safe-local-image-fidelity/deferred-items.md
- **Verification:** portability e2e across 3 engines: 61 passed / 2 skipped (the documented pair) / 0 failed
- **Committed in:** f1c5067 (Task 3 commit; deferred-items in the docs commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking harness boundary)
**Impact on plan:** Both fixes keep the plan's honesty constraints intact (no silent garbage, no engine-skip without documentation). No scope creep; the locked D20-15 persistence design is unchanged.

## Issues Encountered

- **Interrupted prior session (usage limit):** Tasks 1-2 were complete-and-committed; Task 3 existed as coherent uncommitted edits. Resume verified the committed work (specs re-run green), finished Task 3 from the existing edits, and removed three throwaway probe files.
- **WebKit Blob-IDB boundary:** see deviation 2 — surfaced by this plan's 3-engine mandate; handed to 20-07 with evidence.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Bundle v4 asset round-trip is complete: writers emit v4 with asset entries + manifest-verified sha256; importers gate (caps/integrity/no-broken-refs), ride D9-14 conflicts, and apply atomically; the preview discloses dangling skips verbatim.
- For 20-06 (EPUB figures) and 20-08 (imagery matrix): any webkit cell that writes `data: Blob` rows through Dexie will hit the documented engine boundary — consult `deferred-items.md` before pinning webkit expectations there.
- 20-07 (full-suite gate) must count the 2 documented webkit skips in its residual set.

## Verification Evidence

- `npx vitest run tests/unit/portability/bundle-v4.spec.ts tests/unit/portability/validate-bundle.test.ts` → 47/47 ✓
- `npx vitest run tests/unit/portability/` → 219/219 ✓
- `npx vitest run` (full unit suite) → 1570 passed / 0 failed / 13 documented skips ✓
- `npx playwright test tests/e2e/portability/round-trip.spec.ts tests/e2e/portability/import-preview.spec.ts --project=chromium` → 13/13 ✓ (Task 3 gate)
- `npx playwright test tests/e2e/portability/ --project=chromium` → 21/21 ✓ (acceptance criterion)
- `npx playwright test tests/e2e/portability/ --project=chromium --project=firefox --project=webkit` → 61 passed / 2 documented webkit-boundary skips / 0 failed ✓
- `npx tsc --noEmit` → clean ✓
- Acceptance greps: `z.literal(4)` ✓, `AssetExportMeta` ✓, `assets/` entries ✓, peek `> 4` ✓, `assetsToWrite` both files ✓, ConflictKind union diff-untouched ✓, both verbatim warning strings byte-exact ✓

## Self-Check: PASSED

- All 11 key files exist on disk (FOUND ×11)
- All 5 task commits found in git history (0457430, 24a1338, 5dacaf1, 73e3649, f1c5067)
- Zero probe/diag files remain in tests/e2e/portability/
- requirements-completed mirrors the plan frontmatter: [IMG-04]

---
*Phase: 20-safe-local-image-fidelity*
*Completed: 2026-08-31*
