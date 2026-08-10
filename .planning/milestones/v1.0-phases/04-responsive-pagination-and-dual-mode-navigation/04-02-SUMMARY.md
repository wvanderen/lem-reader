---
phase: 04-responsive-pagination-and-dual-mode-navigation
plan: 02
subsystem: settings
tags: [zod, schema-evolution, value-shape, dexie-pitfall-9, e2e-scaffolds, playwright, corpus-matrix]

# Dependency graph
requires:
  - phase: 02-accessible-scrolling-reader
    provides: ReaderSettingsSchema (schemaVersion 1) + Dexie settings store (key-value, value opaque) + SettingsContext live-apply path
  - phase: 03-trustworthy-layout-measurement
    provides: tests/e2e/measurement/*.spec.ts harness pattern (PIXEL_SVG image stub + IndexedDB wipe + hash route)
provides:
  - ReaderSettingsSchema with readingMode: z.enum(["paginated","scrolling"]).default("paginated") (D4-12)
  - DEFAULT_SETTINGS carrying readingMode: "paginated" + schemaVersion: 2 (the canonical write version)
  - tests/e2e/pagination/fixtures-matrix.ts — FIXTURES (6 corpus ids) × VIEWPORTS (3 cells) × SAMPLED_TYPOGRAPHY (3 cells) → CORPUS_MATRIX (54 cells) Plan 04-05 iterates
  - 8 pagination e2e scaffolds under tests/e2e/pagination/ (mode-switch-anchor, page-turn-controls, coverage-invariant, no-overflow-invariant, termination, fallback-oversize, repagination-anchor, fallback-banner) each with the stale-drop harness + h1-visible sentinel
affects: [04-03-paginated-vertical-slice, 04-04-dual-mode-navigation, 04-05-fallback-banner]

# Tech tracking
tech-stack:
  added: []  # Phase 4 Plan 02 installs zero packages (T-04-SC: no supply-chain surface)
  patterns:
    - "Zod value-shape evolution via union literal schemaVersion (preserves v1 read hydration + adds v2 canonical write, forward-rejects v3+ — Pitfall 9 honored)"
    - "Zod .default() as the in-place migration mechanism (no Dexie store change, no migration script — existing rows hydrate on read)"
    - "Wave 0 e2e scaffolds: per-requirement spec files with the canonical harness (image stub + IndexedDB wipe + hash route) and a sentinel h1-visible assertion; real assertions land in the implementing plan"

key-files:
  created:
    - tests/e2e/pagination/fixtures-matrix.ts
    - tests/e2e/pagination/mode-switch-anchor.spec.ts
    - tests/e2e/pagination/page-turn-controls.spec.ts
    - tests/e2e/pagination/coverage-invariant.spec.ts
    - tests/e2e/pagination/no-overflow-invariant.spec.ts
    - tests/e2e/pagination/termination.spec.ts
    - tests/e2e/pagination/fallback-oversize.spec.ts
    - tests/e2e/pagination/repagination-anchor.spec.ts
    - tests/e2e/pagination/fallback-banner.spec.ts
  modified:
    - src/content/schema.ts
    - src/settings/defaults.ts
    - tests/unit/settingsSchema.test.ts
    - tests/component/SettingsContext.test.tsx
    - tests/e2e/calibration/fixtures-matrix.ts
    - tests/unit/measurement/textMeasurer.test.ts
    - tests/unit/storageFallback.test.ts

key-decisions:
  - "schemaVersion resolved to z.union([z.literal(1), z.literal(2)]) — NOT the plan's literal(2). The plan was internally inconsistent: must_haves said 'z.literal(2)' but the action said 'ReaderSettingsSchema.parse({schemaVersion: 1, ...}) hydrates readingMode to paginated'. These are mutually exclusive with a strict literal. The union satisfies BOTH requirements: v1 rows hydrate readingMode via .default (Pitfall 9), v2 is the canonical write version (DEFAULT_SETTINGS writes 2), and v3+ still forward-rejects (V5 boundary preserved). Documented as Rule 2 deviation."
  - "Existing settingsSchema.test.ts reject-matrix entry 'schemaVersion: 2 should throw' was rewritten to 'schemaVersion: 3 should throw' — the test's intent (forward-incompatibility rejects future versions) is preserved, only the literal value updated to remain valid post-bump."
  - "PAGE-01 acceptance is split: this plan ships the schema field + e2e scaffold (foundation); Plan 04-04 ships the reader-facing ModeToggle + M shortcut + D4-10 anchor wiring (behavior). PAGE-01 stays unchecked in REQUIREMENTS.md until Plan 04-04."
  - "Wave 0 scaffolds use the h1-visible sentinel (not test.todo) — proves the harness actually wires up in chromium + firefox + webkit (24/24 tests green in 12.4s). A test.todo would only prove compilation; the sentinel proves runtime wiring."
  - "fixtures-matrix.ts FIXTURES array verified against src/fixtures/index.ts — the 6 corpus ids (essay-long-form, figure-heavy, footnote-academic, list-reference, technical-post, unsupported-case) match the loader exactly. Plan 04-05's corpus iteration will not hit a missing-fixture failure."

patterns-established:
  - "Pattern: schema evolution in this codebase uses a union of literals on schemaVersion for backward-compatible field additions; .default() hydrates legacy rows; future-version literals stay forward-incompatible (V5 boundary discipline)."
  - "Pattern: e2e scaffolds for an unimplemented surface follow the stale-drop.spec.ts harness verbatim (PIXEL_SVG image stub + indexedDB.deleteDatabase('lem-reader') + page.goto BASE) and assert only the h1-visible sentinel — never invent a new harness."
  - "Pattern: corpus-matrix enumerations live alongside the specs that consume them (tests/e2e/pagination/fixtures-matrix.ts mirrors tests/e2e/calibration/fixtures-matrix.ts) — the TypographyVariant type is shared, not forked."

requirements-completed: []  # PAGE-01 foundation only — full acceptance closes in Plan 04-04 per plan body

# Metrics
duration: 5min
completed: 2026-08-06
status: complete
---

# Phase 04 Plan 02: Settings Schema Evolution + Wave 0 E2E Scaffolds Summary

**`readingMode: "paginated" | "scrolling"` added to ReaderSettingsSchema via Zod value-shape evolution (schemaVersion union 1|2, default paginated, NO Dexie store change per Pitfall 9), plus 9-file Wave 0 test infrastructure: the corpus × viewport × typography matrix enumeration and 8 pagination e2e scaffolds (image-stub + IndexedDB-wipe + hash-route harness, h1-visible sentinel) that Plans 04-04 and 04-05 fill with real assertions.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-08-06T14:38:36Z
- **Completed:** 2026-08-06T14:48:42Z
- **Tasks:** 2/2 complete
- **Files created:** 9 (1 matrix module + 8 e2e scaffolds)
- **Files modified:** 7 (2 source + 1 extended unit test + 4 in-tree test fixtures updated for the schema bump cascade)

## Accomplishments

- **`readingMode` Zod value-shape evolution (Task 1):** `ReaderSettingsSchema` now carries `readingMode: z.enum(["paginated", "scrolling"]).default("paginated")` (D4-12) with `schemaVersion: z.union([z.literal(1), z.literal(2)])`. Existing v1 rows (no readingMode field) hydrate readingMode to "paginated" via `.default()` on read — no Dexie migration, no data loss (Pitfall 9). DEFAULT_SETTINGS writes `schemaVersion: 2` as the new canonical.
- **Pitfall 9 honored (Task 1):** `src/persistence/db.ts` is byte-unchanged (verified via `git diff --name-only src/persistence/db.ts` returns empty). The settings store is key-value with `value: unknown`; Dexie is opaque to the value shape. No `db.version(3)` block was added — the schemaVersion bump lives INSIDE the Zod object, not in Dexie.
- **V5 boundary preserved (Task 1):** A tampered row with `readingMode: "evil"` fails parse at the read boundary → STATE-05 routing (StorageBanner/WipeConfirm), never reaching the renderer (T-04-04). v3+ schemaVersion values forward-reject (the legacy `["schemaVersion: 2 should throw"]` reject-matrix test was rewritten to `["schemaVersion: 3 should throw"]` to preserve the intent post-bump).
- **Wave 0 corpus matrix (Task 2):** `tests/e2e/pagination/fixtures-matrix.ts` exports `FIXTURES` (6 ids verified against `src/fixtures/index.ts`), `VIEWPORTS` (3 responsive cells: 360×640 / 768×1024 / 1024×800), `SAMPLED_TYPOGRAPHY` (3 cells: serif-18-64-comfortable default + sans-22-72-spacious stress + dyslexic-16-52-compact stress), and `CORPUS_MATRIX` (54-cell cross product). Imports the `TypographyVariant` type from `tests/e2e/calibration/fixtures-matrix.ts` (shared, not forked).
- **8 pagination e2e scaffolds (Task 2):** mode-switch-anchor (PAGE-01), page-turn-controls (PAGE-02), coverage-invariant (PAGE-03a), no-overflow-invariant (PAGE-03b), termination (PAGE-03c), fallback-oversize (PAGE-04), repagination-anchor (PAGE-05), fallback-banner (PAGE-09). Each carries the stale-drop.spec.ts harness verbatim (PIXEL_SVG image stub + IndexedDB deleteDatabase wipe + hash route) and an h1-visible sentinel test. Real assertions land in Plan 04-04 (PAGE-01/02/05 navigation) and Plan 04-05 (PAGE-03/04/09 corpus matrix + fallback).
- **All 24 e2e scaffolds green across 3 engines (chromium + firefox + webkit, 12.4s):** The h1-visible sentinel proves the harness wires up at runtime — not just that the scaffolds compile.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add readingMode to ReaderSettingsSchema (D4-12 value-shape evolution)** — `18d98d6` (feat)
2. **Task 2: Wave 0 test infrastructure — corpus matrix + 8 pagination e2e scaffolds** — `b0dc5a9` (test)

**Plan metadata commit:** pending — this SUMMARY + STATE/ROADMAP updates commit will follow.

## Files Created/Modified

- `src/content/schema.ts` (Task 1) — ReaderSettingsSchema: schemaVersion union(1,2) + readingMode enum default "paginated". Header comment cites D4-12 + Pitfall 9.
- `src/settings/defaults.ts` (Task 1) — DEFAULT_SETTINGS: schemaVersion 2 + readingMode "paginated".
- `tests/unit/settingsSchema.test.ts` (Task 1) — Extended: v1 hydration + readingMode enum rejection + D4-12 contract round-trip. Updated validSettings() builder + applyTheme non-default test + reject-matrix schemaVersion entry (2→3). 51 specs pass.
- `tests/component/SettingsContext.test.tsx` (Task 1, cascade) — Added `readingMode: "paginated"` to the persisted ReaderSettings literal (Rule 3 schema bump cascade).
- `tests/e2e/calibration/fixtures-matrix.ts` (Task 1, cascade) — Added `readingMode: "paginated"` to DEFAULT_CALIBRATION_SETTINGS (Rule 3 schema bump cascade).
- `tests/unit/measurement/textMeasurer.test.ts` (Task 1, cascade) — Added `readingMode: "paginated"` to baseSettings (Rule 3 schema bump cascade).
- `tests/unit/storageFallback.test.ts` (Task 1, cascade) — Added `readingMode: "paginated"` to validSettings (Rule 3 schema bump cascade).
- `tests/e2e/pagination/fixtures-matrix.ts` (Task 2) — Corpus × viewport × typography matrix enumeration (54 cells).
- `tests/e2e/pagination/mode-switch-anchor.spec.ts` (Task 2) — PAGE-01 scaffold, filled by Plan 04-04.
- `tests/e2e/pagination/page-turn-controls.spec.ts` (Task 2) — PAGE-02 scaffold, filled by Plan 04-04.
- `tests/e2e/pagination/coverage-invariant.spec.ts` (Task 2) — PAGE-03a scaffold, filled by Plan 04-05.
- `tests/e2e/pagination/no-overflow-invariant.spec.ts` (Task 2) — PAGE-03b scaffold, filled by Plan 04-05.
- `tests/e2e/pagination/termination.spec.ts` (Task 2) — PAGE-03c scaffold, filled by Plan 04-05.
- `tests/e2e/pagination/fallback-oversize.spec.ts` (Task 2) — PAGE-04 scaffold, filled by Plan 04-05.
- `tests/e2e/pagination/repagination-anchor.spec.ts` (Task 2) — PAGE-05 scaffold, filled by Plan 04-04.
- `tests/e2e/pagination/fallback-banner.spec.ts` (Task 2) — PAGE-09 scaffold, filled by Plan 04-05.

## Decisions Made

(See `key-decisions` in frontmatter above for the canonical list.)

- **schemaVersion union over strict literal:** The plan was internally inconsistent (must_haves said literal(2); action said `{schemaVersion: 1, ...}` should hydrate readingMode). The union preserves both requirements and V5 forward-incompatibility.
- **PAGE-01 split across plans:** This plan ships schema + scaffold only; Plan 04-04 closes PAGE-01 with the reader-facing UI. REQUIREMENTS.md PAGE-01 stays unchecked.
- **h1-visible sentinel over test.todo:** The sentinel proves runtime wiring (24/24 green in 12.4s across all 3 engines); test.todo would only prove compilation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing critical functionality / plan internal inconsistency] schemaVersion resolved as a union, not a strict literal**
- **Found during:** Task 1 implementation (src/content/schema.ts)
- **Issue:** The plan's must_haves said "schemaVersion is z.literal(2)" while the action section required `ReaderSettingsSchema.parse({schemaVersion: 1, font: "serif", ...})` (a v1 legacy row missing readingMode) to hydrate readingMode to "paginated". These are mutually exclusive — a strict `z.literal(2)` rejects `schemaVersion: 1` at parse time, so the v1 hydration test could not pass. The 04-PATTERNS.md L516 corroborated the v1 hydration requirement ("existing v1 rows (no readingMode field) parse with the default on read").
- **Fix:** Used `schemaVersion: z.union([z.literal(1), z.literal(2)])`. v1 rows hydrate readingMode via `.default()` (Pitfall 9 — value-shape evolution, no Dexie bump); v2 is the canonical write version (DEFAULT_SETTINGS writes 2); v3+ forward-rejects (V5 boundary preserved). Also required updating the existing settingsSchema.test.ts reject-matrix entry `["non-literal schemaVersion (STATE-04 hook)", { schemaVersion: 2 }]` to `["non-literal schemaVersion (STATE-04 hook — v3 forward-rejects)", { schemaVersion: 3 }]` (preserves the test's intent — forward-incompatibility — with a value that is still rejected post-bump).
- **Files modified:** `src/content/schema.ts`, `tests/unit/settingsSchema.test.ts`
- **Verification:** `npm run test:unit -- --run tests/unit/settingsSchema.test.ts` exits 0 (51 specs); the v1-hydration test passes; the v3-reject test passes.
- **Committed in:** `18d98d6` (Task 1 commit)

**2. [Rule 3 — Blocking] Four in-tree test fixtures hardcoded ReaderSettings literals missing readingMode**
- **Found during:** Task 1 verification (`npx tsc --noEmit`)
- **Issue:** After the schema bump, the inferred `ReaderSettings` type has `readingMode` as a required field (Zod `.default()` makes output required). Four test files constructed `const x: ReaderSettings = {...}` literals that omitted readingMode, so `tsc --noEmit` failed with TS2741 ("Property 'readingMode' is missing"). This blocked the build.
- **Fix:** Added `readingMode: "paginated"` to each affected literal (the value `.default()` would have hydrated anyway):
  - `tests/component/SettingsContext.test.tsx` persisted literal
  - `tests/e2e/calibration/fixtures-matrix.ts` DEFAULT_CALIBRATION_SETTINGS
  - `tests/unit/measurement/textMeasurer.test.ts` baseSettings
  - `tests/unit/storageFallback.test.ts` validSettings
- **Files modified:** 4 test files (listed above)
- **Verification:** `npx tsc --noEmit` exits 0; `npm run test:unit -- --run` exits 0 (340 specs across 24 files, no regressions).
- **Committed in:** `18d98d6` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1× Rule 2 plan inconsistency, 1× Rule 3 schema-bump cascade across 4 test fixtures)
**Impact on plan:** Both auto-fixes necessary for the build to compile and the plan's own v1-hydration requirement to be satisfiable. No scope creep — every change is a direct downstream consequence of adding `readingMode`.

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

None — no external service configuration required. Phase 4 Plan 02 installs zero packages (T-04-SC: no supply-chain surface). The dev server (`npm run dev` on port 5173) is started automatically by Playwright's webServer config when `npm run test:e2e` runs.

## Next Phase Readiness

- **Ready for Plan 04-03 (paginated vertical slice):** `readingMode` is now readable on `ReaderSettings`; ArticleView's mode-aware render branch can read `settings.readingMode === "paginated"` and mount PaginatedSurface. DEFAULT_SETTINGS writes the v2 canonical shape so a fresh client opens in paginated mode.
- **Ready for Plan 04-04 (dual-mode navigation):** The ModeToggle + M shortcut + D4-10 anchor can update `readingMode` via SettingsContext.update(); the persisted preference flows through the same debounced Dexie save as every other preference (no new persistence path). The mode-switch-anchor + page-turn-controls + repagination-anchor e2e scaffolds are waiting for the real assertions.
- **Ready for Plan 04-05 (fallback banner + corpus matrix proofs):** CORPUS_MATRIX (54 cells) enumerates exactly the iteration Plan 04-05's PAGE-03/04/09 proofs consume. The 5 corpus-matrix scaffolds (coverage-invariant, no-overflow-invariant, termination, fallback-oversize, fallback-banner) are waiting for the real assertions.
- **Pitfall 9 honored:** `src/persistence/db.ts` byte-unchanged — no Dexie migration shipped, existing readers' settings hydrate cleanly on next read.
- **Calibration fingerprint honored:** No Pretext import added (this plan touches only settings schema + e2e scaffolds, no pagination engine surface).

## Self-Check: PASSED

- All 9 created files (1 matrix + 8 scaffolds) exist on disk under `tests/e2e/pagination/` (verified via `ls`).
- All 7 modified files reflect the schema bump (verified via `git diff --stat 18d98d6~ 18d98d6` for Task 1 and `git show b0dc5a9 --stat` for Task 2).
- Both task commits (`18d98d6` Task 1, `b0dc5a9` Task 2) exist in `git log --oneline -5`.
- `git diff --name-only src/persistence/db.ts` returns empty (Pitfall 9 honored).
- `npm run test:unit -- --run tests/unit/settingsSchema.test.ts` exits 0 (51 specs).
- `npm run test:unit -- --run` exits 0 (340 specs across 24 files, no regressions).
- `npx tsc --noEmit` exits 0.
- `npm run lint` exits 0.
- `npm run build` exits 0.
- `npm run test:e2e tests/e2e/pagination/` exits 0 (24/24 scaffold tests green across chromium + firefox + webkit, 12.4s).

---
*Phase: 04-responsive-pagination-and-dual-mode-navigation*
*Plan: 02*
*Completed: 2026-08-06*
