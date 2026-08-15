---
phase: 09-versioned-export-import
plan: 03
subsystem: portability
tags: [import, conflict-detection, dry-run, zod, dexie, fake-indexeddb, tdd]

# Dependency graph
requires:
  - phase: 09-versioned-export-import plan 01
    provides: ExportBundleSchema/ExportBundle envelope + fixtureIds rationale
  - phase: 09-versioned-export-import plan 02
    provides: loadAllHighlights/loadAllNotes whole-library bulk reads
  - phase: 05-durable-highlights-and-notes
    provides: resolveQuoteSelector tri-state + TextQuote/TextPosition selectors
  - phase: 02-local-first-persistence
    provides: Dexie v4 stores + settingsStore reader-prefs row
provides:
  - detectImportPreview — 5-kind D9-14 dry-run conflict pass + D9-13 eager tri-state re-resolution (zero writes)
  - resolveImportPlan — bulk per-kind override semantics producing the fully-computed ResolvedImportPlan (puts-only input for 09-04's applyImport)
  - ConflictKind / PerKindOverride / Overrides / ConflictSummary / ImportPreviewData / ResolvedImportPlan types
affects: [09-04 (applyImport transaction), 09-05 (ImportPreviewDialog), 09-06 (round-trip e2e)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pattern 8 three-source article lookup (bundle > local > fixtures) with seen-Set first-seen-wins precedence"
    - "Per-article normalizeText/graphemeClusters memoization via resolveQuoteSelectorInText (memoized resolveQuoteSelector)"
    - "Fully-computed plan object: id mints + FK rewrites BEFORE the transaction (RESEARCH Pattern 3 apply-step contract)"

key-files:
  created:
    - src/portability/conflicts.ts
    - tests/unit/portability/conflicts.test.ts
  modified: []

key-decisions:
  - "reader-prefs presence read directly (db.settings.get) — loadSettings cannot distinguish first-run defaults from a persisted row; behavior contract wins"
  - "Memoized re-resolution calls the exported resolveQuoteSelectorInText core with per-article memoized clusters — identical semantics to resolveQuoteSelector without per-highlight recompute"
  - "Identical duplicate article (same id+revision+hash) = calm no-op: skipped, never a conflict, not added (the re-import-on-same-device case)"
  - "highlight-id/note-id overwrite = same-id upsert (incoming put over local row); keep-both only mints for the id kinds"
  - "resolveImportPlan re-reads local PK sets (async variant) and ignores the preview for decisions — mismatch window accepted at prototype scale, documented"

patterns-established:
  - "Dry-run pass = pure reads through the STATE-04 Zod-validated loaders; zero writes enforced by row-count tests"
  - "ConflictSummary sampleIds capped at 5 for calm preview copy"

requirements-completed: []  # PORT-02 stays open — 09-03 ships the pure dry-run core; it closes at the end-to-end import plans (09-04 apply tx, 09-05 dialog, 09-06 e2e) per the 04-02/06-01/09-01 split precedent

# Metrics
duration: 10 min
completed: 2026-08-15
status: complete
---

# Phase 9 Plan 03: Import Dry-Run Conflicts + Override Resolution Summary

**5-kind D9-14 dry-run conflict detection with eager D9-13 tri-state re-resolution across bundle ∪ local ∪ fixture articles, plus a fully-computed puts-only ResolvedImportPlan — all zero-write pure logic on the fake-indexeddb harness (32 tests)**

## Performance

- **Duration:** 10 min
- **Started:** 2026-08-15T18:10:42Z
- **Completed:** 2026-08-15T18:20:51Z
- **Tasks:** 2 (TDD: 2 RED + 2 GREEN commits)
- **Files modified:** 2 (1 source, 1 test)

## Accomplishments
- `detectImportPreview` detects all five conflict kinds (article-revision, article-content-divergence, highlight-id, note-id, location) with added-count math and sampleIds capped at 5 — skip-by-default encoded, zero writes (row-count-locked)
- Every incoming highlight eagerly re-resolves via the shipped resolver machinery across the Pattern 8 three-source lookup (bundle.articles > local Dexie > bundled fixtures) with REQUIRED per-article cluster memoization; fixture-backed highlights report non-orphan while the fixture is present (Pitfall 4) and bundle articles shadow same-id fixtures (T-9-10)
- `resolveImportPlan` implements the full override matrix: keep-higher-revision (D-06), content overwrite, keep-both id minting with pre-plan note FK rewrites (Pitfall 7), savedAt last-write-wins for locations, and applyPreferences gating — the 09-04 transaction will contain Dexie puts only

## Task Commits

Each task was committed atomically (TDD RED → GREEN per task):

1. **Task 1: detectImportPreview — 5-kind dry-run + eager tri-state re-resolution** — `bf3fbd7` (test, RED) + `0c0361f` (feat, GREEN)
2. **Task 2: resolveImportPlan — bulk per-kind overrides to a fully-computed plan** — `4050b95` (test, RED) + `cc2b589` (feat, GREEN)

## Files Created/Modified
- `src/portability/conflicts.ts` — the PORT-02 dry-run core: types (ConflictKind, PerKindOverride, Overrides, ConflictSummary, ImportPreviewData, ResolvedImportPlan), buildArticleLookup (Pattern 8 precedence), detectImportPreview, resolveImportPlan
- `tests/unit/portability/conflicts.test.ts` — 32 tests: 5-kind detection + kind separation, added/incoming counts, sampleIds cap, tri-state matrix (confident/ambiguous/orphan), fixture-backed Pitfall 4 both ways, T-9-10 shadow precedence, local-tier lookup, applyPreferencesDefault both ways, zero-writes for both passes, and the full Task-2 override matrix incl. FK-rewrite proof

## Decisions Made
- **reader-prefs presence via direct read-only `db.settings.get("reader-prefs")`** — the plan's parenthetical ("ok ⇒ a row exists") is not implementable through loadSettings, which returns ok:true + DEFAULT_SETTINGS on first run identically to ok:true + parsed data for a persisted row. The behavior block ("true when no local reader-prefs row exists") is authoritative; the presence check is a read, never a write, and the KEY value is the locked D2 composite-record key.
- **Memoized resolution uses the exported `resolveQuoteSelectorInText` core** — the plan mandates BOTH "resolve via resolveQuoteSelector" AND required per-article memoization; the article-level wrapper recomputes normalizeText/graphemeClusters per call, so the memoized form calls the exported in-text core over per-article memoized clusters (derived via the canonical normalizeText/graphemeClusters — REUSE-DO-NOT-FORK held; semantics identical by construction).
- **Identical duplicate article = calm no-op** (skipped, never a conflict, not added) — the D9-14 table has no row for same id+revision+hash, but the case is guaranteed-real (re-importing a bundle on the exporting device).
- **highlight-id/note-id "overwrite" = same-id upsert** — the behavior block specifies skip + keep-only for id kinds; Overrides admits "overwrite" for every kind, which naturally means the incoming record replaces the local row under its own id.
- **`_preview` parameter naming** — resolveImportPlan's locked call shape keeps the preview parameter (09-05 passes the rendered preview) but decisions re-derive from freshly re-read local PK sets; underscore prefix satisfies noUnusedParameters, documented in JSDoc with the determinism note.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fresh-device preference detection mechanism**
- **Found during:** Task 1 (detectImportPreview implementation)
- **Issue:** Plan action said "prefs presence via the settingsStore load (ok ⇒ a reader-prefs row exists)" — loadSettings returns ok:true for BOTH first-run defaults and a persisted row, so the literal mechanism would always report "row exists" and applyPreferencesDefault could never be true
- **Fix:** Direct read-only presence check `db.settings.get("reader-prefs")` (the locked D2 key, mirrored from settingsStore KEY with an explanatory comment); behavior block + D9-12 fresh-device semantics implemented exactly; test-locked both ways
- **Files modified:** src/portability/conflicts.ts
- **Verification:** applyPreferencesDefault true on fresh DB / false with a seeded reader-prefs row — both tests pass
- **Committed in:** 0c0361f (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 mechanism-vs-behavior reconciliation)
**Impact on plan:** No scope creep — the behavior contract is implemented verbatim; only the unimplementable literal mechanism was replaced. All other adjustments (memoized resolver core, duplicate-article no-op, id-kind overwrite semantics, `_preview` naming) are edge-fill decisions documented above, each test-locked.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The fully-computed `ResolvedImportPlan` is ready for Plan 09-04's `applyImport` single Dexie transaction (puts only — id mints and FK rewrites already happened; RESEARCH Pattern 3 + Pitfall 11 #3 honored by construction)
- `ImportPreviewData` + `Overrides` are the data contracts for Plan 09-05's ImportPreviewDialog (bulk per-kind toggles, default Skip-all per D9-14)
- PORT-02 remains open pending 09-04/09-05/09-06 (end-to-end import proof) — mirrors the 09-01/09-02 requirements split precedent
- Threat register T-9-08 (skip-by-default, never-silently-overwrite), T-9-09 (FK rewrite pre-transaction), T-9-10 (lookup precedence) all mitigated and test-locked in this plan

---
*Phase: 09-versioned-export-import*
*Completed: 2026-08-15*

## Self-Check: PASSED

- Created files exist on disk: src/portability/conflicts.ts, tests/unit/portability/conflicts.test.ts, 09-03-SUMMARY.md ✓
- All 5 plan commits present (bf3fbd7, 0c0361f, 4050b95, cc2b589, 9ebd37d) ✓
- TDD gate: test→feat commit pairs in order for both tasks ✓
- Plan verification re-run: `npx vitest run tests/unit/portability` → 6 files / 96 tests / exit 0; `npm run build` → exit 0 ✓
