---
phase: 09-versioned-export-import
plan: 04
subsystem: portability
tags: [zip, fflate, zod, dexie, indexeddb, sha256, export, import, atomic-transactions, zip-slip]

# Dependency graph
requires:
  - phase: 09-versioned-export-import (Plans 09-01..09-03)
    provides: ExportBundleSchema + resolveAppVersion (bundle.ts), isSafeEntryName (zipSlip.ts), computeManifest/Manifest (manifest.ts), loadAllHighlights/loadAllNotes/loadAllLocations bulk loaders, ResolvedImportPlan + detectImportPreview + resolveImportPlan (conflicts.ts)
provides:
  - buildBundleBytes — the PORT-01 whole-library zip producer (fixtures excluded by construction, preferences always present, manifest-hashed)
  - ImportRefusal + validateBundle — the six-refusal pre-write pipeline (bomb-capped unzip → Zip Slip gate on every entry → envelope peek → Zod safeParse → manifest recompute)
  - applyImport — the atomic 5-store Dexie transaction (puts only, settings gated by plan.applyPreferences, rollback proven by injected failure)
affects: [09-versioned-export-import (09-05 Settings UI, 09-06 e2e gates)]

# Tech tracking
tech-stack:
  added: []  # fflate 0.8.3 was installed by Plan 09-01; no new deps this plan
  patterns:
    - "Validate-before-write refusal pipeline: every hostile-input class returns a typed refusal BEFORE any transaction can start"
    - "Puts-only Dexie transaction closure consuming a fully-computed plan (no crypto/Zod/setTimeout inside — Pitfall 1)"
    - "Decompression-bomb cap via fflate unzip filter on declared originalSize (metadata-read, pre-inflation)"

key-files:
  created:
    - src/portability/ExportImportService.ts
    - tests/unit/portability/export-service.test.ts
    - tests/unit/portability/validate-bundle.test.ts
    - tests/unit/portability/atomic-import.test.ts
  modified: []

key-decisions:
  - "validateBundle never throws: an unparseable bundle.json routes to invalid(['bundle.json: not valid JSON']); an unusable manifest.json routes to corrupted with all five block names — the six-kind refusal contract and the never-throw-to-reader convention both hold on paths the RESEARCH example left unguarded"
  - "Bomb-cap semantics: fflate's filter skips over-cap entries BEFORE inflation; a capped REQUIRED entry surfaces honestly as missing-entry, a capped extra entry is inert — no allocation either way; the test crafts a >200MB DECLARED originalSize by patching the zip central-directory size field (exactly the metadata fflate's filter reads)"
  - "applyImport uses two explicit-arity db.transaction calls sharing one puts-only closure — tsc rejects spreading a union-of-tuples into Dexie's overloaded signature; db.settings joins the table set only under plan.applyPreferences"
  - "Dexie hook test pattern: register via hook('creating', fn), deregister via hook('creating').unsubscribe(fn) with the SAME reference in afterEach (typings return void; hooks persist across tests)"
  - "requirements-completed stays [] — PORT-01/PORT-02 close at the end-to-end proof plans (09-05 dialog/UI, 09-06 e2e gates) per the 09-01..09-03 split precedent"

patterns-established:
  - "Peek-before-parse version gate: raw schemaVersion is read before full Zod parse so a v2 bundle gets the calm newer-schema-version refusal even when it also carries schema damage"
  - "Injected-failure atomicity proof: a Dexie creating-hook throw mid-transaction is the rollback witness; before/after count maps across ALL five stores are the evidence"

requirements-completed: []  # PORT-01/PORT-02 stay open — 09-04 ships the service core; they close at the end-to-end proof plans (09-05 UI, 09-06 e2e) per the 04-02/06-01/09-01..09-03 split precedent

# Metrics
duration: 13 min
completed: 2026-08-15
status: complete
---

# Phase 9 Plan 04: Export/Import Service Core Summary

**buildBundleBytes + validateBundle (six-refusal pre-write pipeline) + applyImport (atomic 5-store puts-only Dexie transaction) — the serialize → validate → atomic-apply service the 09-05 UI and 09-06 e2e gates consume**

## Performance

- **Duration:** 13 min
- **Started:** 2026-08-15T18:24:27Z
- **Completed:** 2026-08-15T18:37:50Z
- **Tasks:** 3 (each TDD: RED + GREEN commits)
- **Files modified:** 4 (1 src, 3 test)

## Accomplishments
- **Export truth (SC#1):** buildBundleBytes reads all five record sources through the Zod-validated loaders, derives fixtureIds from highlight/location/note-via-owning-highlight references (fixtures never serialize — ARCHITECTURE L615), self-checks via ExportBundleSchema.parse, and zips bundle.json (pretty) + manifest.json (minified). Preferences always present: stored row, else DEFAULT_SETTINGS (D9-12).
- **SC#4 data minimization test-locked:** a recursive key walk over the serialized bundle finds no key matching /page/i.
- **Validate-before-write (SC#2 / Pitfall 11 #2):** validateBundle implements the ordered pipeline — fflate filter capping declared originalSize at 200MB (T-9-02) → isSafeEntryName on EVERY entry (SC#2 hard gate) → required entries → schemaVersion peek BEFORE full parse (D9-04 calm refusal) → safeParse with ALL issues as a "path: message" list → per-block SHA-256 manifest recompute. All six refusal kinds asserted with payloads; zero writes on every path.
- **Atomicity (Pitfall 11 #3 / T-9-11):** applyImport runs one Dexie transaction across the touched stores (db.settings only under applyPreferences) with a puts-only closure; an injected creating-hook throw mid-transaction leaves ALL five stores at pre-apply counts — rollback proven, not asserted-by-convention. The keep-both FK rewrite survives the write (note row's highlightId equals the minted id).

## Task Commits

Each task was committed atomically (TDD: RED → GREEN per task):

1. **Task 1: buildBundleBytes — export side** — `19265a2` (test) + `41d0453` (feat)
2. **Task 2: validateBundle — the six-refusal pre-write pipeline** — `6ac788a` (test) + `826c040` (feat)
3. **Task 3: applyImport — the atomic 5-store transaction** — `4329078` (test) + `5d0b74e` (feat)

**Plan metadata:** (see final docs commit below)

## Files Created/Modified
- `src/portability/ExportImportService.ts` — buildBundleBytes / ImportRefusal / validateBundle / applyImport; fflate imports restricted to the four-name allowlist (zipSync, unzipSync, strToU8, strFromU8)
- `tests/unit/portability/export-service.test.ts` — export truth: entries set, fixtures-not-serialized, fixtureIds, sourceUrl verbatim, preferences fallback, no-page-key walk, manifest self-consistency
- `tests/unit/portability/validate-bundle.test.ts` — all six refusal kinds + peek ordering + multi-issue list + bomb cap + round trip against buildBundleBytes output
- `tests/unit/portability/atomic-import.test.ts` — happy-path write of new + keep-both-rewritten records, settings gating, injected-failure rollback across all stores

## Decisions Made
- **Guarded JSON.parse in validateBundle** (extends the RESEARCH example): an unparseable bundle.json → `invalid` with a single honest issue; an unusable manifest.json → `corrupted` with all five block names. The caller never sees a throw — consistent with the settingsStore/locationStore discriminated-result convention and the plan's "zero writes / calm refusal" posture.
- **Bomb-cap test construction:** the >200MB entry is crafted by patching the zip central-directory declared uncompressed-size field — the exact metadata fflate's filter consults — so the test proves the no-allocation refusal without materializing 200MB. With `bundle.json` as the capped entry the observed refusal is `missing-entry` (the plan's "not-a-zip path or filtered" latitude); capped extra entries are simply inert.
- **Explicit-arity transaction calls:** `db.transaction("rw", ...tables, cb)` with a union-of-tuples table list fails tsc (TS2556); the implementation branches into the 4-table and 5-table overloads sharing one puts-only closure — identical runtime semantics, and the table-set gating stays literal.
- **Unit-file count note:** the plan prose said "8 unit files (all 6 from 09-01..09-04)" — the actual tree has 9 portability spec files (09-02 shipped bulk-reads.test.ts as a separate deliverable). The verification criterion that matters (`npx vitest run tests/unit/portability` exits 0) holds: **9 files / 116 tests passed**.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TS 7 strictness errors in the new files (3 sub-issues)**
- **Found during:** Task 3 (`npm run build` gate; vitest transpiles without typechecking so the errors surfaced only under tsc)
- **Issue:** (a) `new File([u8])` requires ArrayBuffer-backed views — `Uint8Array<ArrayBufferLike>` is not a `BlobPart` (the 09-01 `sha256Hex` precedent); (b) spread of a union-of-tuples table list into `db.transaction`'s overloaded signature (TS2556); (c) `db.notes.hook("creating", fn)` returns `void` in the typings, so it cannot be assigned as an unsubscribe function.
- **Fix:** (a) re-back via `new Uint8Array(bytes)` at the two File construction sites; (b) explicit-arity transaction calls with one shared closure; (c) keep the fn reference and deregister via `hook("creating").unsubscribe(fn)` in afterEach (verified against Dexie's Events runtime — the callable form delegates to subscribe).
- **Files modified:** src/portability/ExportImportService.ts, tests/unit/portability/validate-bundle.test.ts, tests/unit/portability/atomic-import.test.ts
- **Verification:** `npm run build` exits 0; full unit suite 842 passed / 0 failed
- **Committed in:** 5d0b74e (Task 3 commit)

**2. [Rule 2 - Missing critical] Guarded the two JSON.parse calls the RESEARCH pipeline left unguarded**
- **Found during:** Task 2 implementation
- **Issue:** the research Code Example calls `JSON.parse` on bundle.json/manifest.json without a catch — a truncated or non-JSON entry would make validateBundle throw to the caller instead of refusing calmly, violating the never-throw-to-reader convention the refusal union exists for.
- **Fix:** bundle.json parse failure → `invalid` with `["bundle.json: not valid JSON"]`; manifest.json parse failure → `corrupted` with all five block names (every block fails verification). Both stay inside the six-kind contract.
- **Files modified:** src/portability/ExportImportService.ts
- **Verification:** all 10 validate-bundle tests pass; no throw path reachable from file content
- **Committed in:** 826c040 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both fixes are correctness/robustness requirements of the plan's own contracts (build gate, calm-refusal discipline). No scope creep.

## Issues Encountered
None beyond the deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The service surface 09-05 (Settings "Your data" cluster + ImportPreviewDialog) and 09-06 (e2e gates) consume is complete: `buildBundleBytes`, `validateBundle`, `applyImport`, `ImportRefusal`, plus 09-03's `detectImportPreview`/`resolveImportPlan`.
- All portability unit specs green (9 files / 116 tests); full unit suite green (63 files / 842 passed); `npm run build` exits 0; fflate import allowlist verified (`zipSync, unzipSync, strToU8, strFromU8` only).
- The 24 pre-existing e2e failures in unrelated specs remain out of scope (Plan 09-07 owns gap closure).

## Self-Check: PASSED

All 4 created files exist on disk; all 6 task commits (19265a2, 41d0453, 6ac788a, 826c040, 4329078, 5d0b74e) present in git log; `db.transaction` key-link pattern present in ExportImportService.ts (3 occurrences); plan `<verification>` re-run green: `npx vitest run tests/unit/portability` → 9 files / 116 tests exit 0, `npm run build` exit 0, `rg 'from "fflate"' src/` → only the four allowed named imports.

---
*Phase: 09-versioned-export-import*
*Completed: 2026-08-15*
