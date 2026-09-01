---
phase: 21-integrated-refinement-and-acceptance
plan: 01
subsystem: settings
tags: [zod, playwright, measure-clamp, reader-settings, e2e, ssrf-boundary]

# Dependency graph
requires:
  - phase: 02-foundation
    provides: ReaderSettingsSchema, settingsStore safeParse seam, SettingsPanel stepped controls
  - phase: 09-portability
    provides: ExportBundleSchema preferences block, manifest determinism contract, validateBundle pipeline
  - phase: 13-polish
    provides: localStorage settings mirror + index.html paint-hint marker-comment sync-check discipline
provides:
  - clampLegacyMeasure + LEGACY_MEASURE (frozen single-entry {72:64} map) — the bounded pre-parse normalizer
  - Truthful five-step MEASURE_STEPS [40, 46, 52, 58, 64] with schema union evolved in the same commit
  - Calm legacy-72 loads at all three settings seams (Dexie row, mirror, import preferences) + paint hint — never WipeConfirm
  - Import-seam manifest legacy-value tolerance (v2.1-era claimed preferences hashes still verify)
  - Real-browser truthful-64 proof (ruler + aria + readout, both reading modes, 3 engines)
affects: [21-02 (POLISH-08 tag menu), 21-04 (POLISH-11 audit validates this corrected state), 21-05/21-06 (ACPT-07 spine + ACPT-08 matrix inherit the truthful range)]

# Tech tracking
tech-stack:
  added: [] # nothing installed — browser platform + in-repo modules only
  patterns:
    - "Pre-parse bounded legacy-value map at trust boundaries (D21-03): the clamp maps ONLY the enumerated legacy value ahead of safeParse; the union never widens (STATE-04/V5/T-21-02)"
    - "Manifest legacy-hash tolerance (computeManifest determinism contract + back-mapped export-era hash): schema-evolution without invalidating honestly-computed older claimed manifests"

key-files:
  created:
    - src/settings/legacyMeasure.ts
    - tests/unit/settings/measure-clamp.test.ts
  modified:
    - src/settings/tokens.ts
    - src/content/schema.ts
    - src/persistence/settingsStore.ts
    - src/settings/settingsMirror.ts
    - src/portability/ExportImportService.ts
    - src/measurement/types.ts
    - index.html
    - tests/e2e/typography-live-apply.spec.ts
    - tests/e2e/pagination/fixtures-matrix.ts
    - tests/e2e/calibration/fixtures-matrix.ts
    - tests/e2e/polish/cold-load-no-snap.spec.ts
    - tests/e2e/polish/first-paint-mode-surface.spec.ts
    - tests/unit/settingsSchema.test.ts
    - tests/unit/settings/mirror.test.ts
    - tests/unit/storageFallback.test.ts
    - tests/component/SettingsContext.test.tsx

key-decisions:
  - "D21-03 mechanism = pre-parse bounded map (clampLegacyMeasure) at the three settings-entry seams + the paint hint — never a widened union, never a post-parse coercion (T-21-02); garbage (71/string/null) still surfaces corrupt/null"
  - "Import seam needs manifest legacy-value tolerance: a v2.1-era claimed preferences hash was computed over the block WITH measure 72, so the recomputed (clamped) hash can never match — the seam accepts the back-mapped export-era hash for the preferences block only (Rule 1 deviation; every other block/modification still mismatches)"
  - "constraints schema + calibration measure axes derive from the settings union (MeasureStep = ReaderSettings[\"measure\"]) — the union change compiled-blocked three files outside the plan list; each follows the evolved union with a D21 citation (Rule 3)"
  - "Pinned cells move to 58 (unit/component/polish seeds — stays non-default) or 64 (pagination stress cell — keeps the max-measure wrap-math intent); the pathological below-range reject row moved 40 → 34"

patterns-established:
  - "Legacy-value map modules live beside their tokens (src/settings/legacyMeasure.ts) with an index.html inline copy pinned by a marker-comment sync-check (the FONT_STACKS discipline extended)"
  - "Truthful-token e2e: hidden zero-glyph ruler probe (\"0\".repeat(N), white-space:pre, absolute, hidden) vs surface box width within 1px — ch is the \"0\" advance, never prose-character counting (Pitfall 4)"

requirements-completed: [POLISH-09]

# Metrics
duration: 22min
completed: 2026-09-01
status: complete
---

# Phase 21 Plan 01: Truthful Reading Width Summary

**Truthful 64ch far-right endpoint: five-step [40–64] uniform-6 range with a bounded {72→64} legacy clamp at every settings seam (Dexie/mirror/import/paint-hint), manifest legacy-hash tolerance, and real-browser ruler proof on both reading surfaces across 3 engines**

## Performance

- **Duration:** 22 min
- **Started:** 2026-09-01T12:57:55Z
- **Completed:** 2026-09-01T13:20:34Z
- **Tasks:** 2 (Task 1 TDD: RED → GREEN)
- **Files modified:** 18 (2 created, 16 modified)

## Accomplishments
- The slider's far-right endpoint now MEANS 64: `MEASURE_STEPS = [40, 46, 52, 58, 64]`, the schema union drops `z.literal(72)` and gains 40/46, and SettingsPanel needs zero changes (min/max/step/aria all derive from array ends — verified untouched).
- A stored legacy-72 setting loads calmly at 64 through every entry seam — Dexie row (`loadSettings`), localStorage mirror (`readSettingsMirror`), import preferences block (`validateBundle`) — with every other field intact; genuine garbage (71, string, null) still fails parse and surfaces the corrupt/null contract (STATE-04 never-silently-coerce, unit-asserted at every seam).
- v2.1-era exported bundles carrying `preferences.measure: 72` re-import calmly (manifest legacy-hash tolerance), while tampered manifests still refuse `corrupted` and garbage still refuses `invalid`.
- First paint matches hydration: the index.html paint-hint script carries the inline `LEGACY_MEASURE` copy (marker sync-checked) so the `--measure` write never paints a dead 72ch width.
- 64 means 64 proven in real browsers: a 64-"0" ruler probe equals the surface content width within 1px in scrolling AND paginated mode (mode toggle driven), with `aria-valuemax=64` / `aria-valuenow=64` / readout "Reading width 64 ch" agreement, plus the 40ch far-left floor cell — chromium/firefox/webkit.

## Task Commits

Each task was committed atomically:

1. **Task 1: Truthful steps + bounded legacy clamp at every settings seam** — TDD:
   - RED `142a2c8` (test): measure-clamp suite — bounded-map proofs, three seam proofs, paint-hint sync-check
   - GREEN `8bdb4bf` (feat): legacyMeasure module + tokens/schema/seams/paint-hint + pinned unit/component cells + compile-blocker fixes
2. **Task 2: Truthful-64 e2e proof + legitimately-updating pinned e2e cells** — `f7a4834` (test): truthful-measure describe + polish seed updates

**Plan metadata:** (see final docs commit)

_TDD gate: RED (`test(21-01)`) precedes GREEN (`feat(21-01)`) in git log; no refactor pass needed (implementation minimal by design)._

## Files Created/Modified
- `src/settings/legacyMeasure.ts` (NEW) — frozen single-entry `{72: 64}` map + `clampLegacyMeasure` pre-parse normalizer
- `src/settings/tokens.ts` — `MEASURE_STEPS` evolved to the five-step uniform-6 range
- `src/content/schema.ts` — measure union: 40/46 added, 72 removed (same commit as the seam clamps — Pitfall 1 atomicity)
- `src/persistence/settingsStore.ts` — `safeParse(clampLegacyMeasure(raw.value))` (seam 1)
- `src/settings/settingsMirror.ts` — mirror read clamps before safeParse (seam 2)
- `src/portability/ExportImportService.ts` — import seam clamp on the raw preferences block (seam 3) + manifest legacy-value tolerance
- `src/measurement/types.ts` — ConstraintsSchema measure union follows the settings union (compile-blocker, Rule 3)
- `index.html` — inline `LEGACY_MEASURE` marker-commented copy + `--measure` write routed through it (seam 4)
- `tests/unit/settings/measure-clamp.test.ts` (NEW) — three-seam clamp proofs + paint-hint sync-check
- `tests/unit/settingsSchema.test.ts` — accept table gains 40/46, 72 becomes a reject row; below-range reject 40→34; applyTheme cell 72→58
- `tests/unit/settings/mirror.test.ts`, `tests/unit/storageFallback.test.ts`, `tests/component/SettingsContext.test.tsx` — pinned cells → 58 with D21 citations
- `tests/e2e/typography-live-apply.spec.ts` — truthful-measure describe (ruler both modes + aria + readout + 40ch floor)
- `tests/e2e/pagination/fixtures-matrix.ts` — stress typography cell 72→64 (kept in the Task 1 commit: compile blocker)
- `tests/e2e/calibration/fixtures-matrix.ts` — MEASURES_FULL/SAMPLED follow the union (compile blocker, Rule 3)
- `tests/e2e/polish/cold-load-no-snap.spec.ts`, `tests/e2e/polish/first-paint-mode-surface.spec.ts` — PERSISTED seeds 72→58 with D21 citations

## Decisions Made
- Clamp mechanism per the plan: pre-parse bounded map at the seams (not load-time migration, not union widening) — the 09-03 `.default()` read-hydration precedent.
- Manifest tolerance shape: accept the back-mapped export-era hash (`{...parsed.preferences, measure: 72}`) only when the raw block carried exactly 72 — keeps the determinism contract's parse-order basis instead of trusting file key order; the manifest remains a corruption-DETECTION surface (manifest.ts), so no security weakening (an attacker can already recompute any claimed manifest).
- Pinned-cell destinations: 58 where the cell's intent is "non-default" (unit/component/polish seeds), 64 where the intent is "maximum wrap-math stress" (pagination cell).
- Calibration sampled measures: `[46, 64]` (new floor + truthful max — widest spread across the evolved range).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Import-seam manifest legacy-value tolerance**
- **Found during:** Task 1 (GREEN, writing the import-seam test)
- **Issue:** The plan/PATTERNS sketch clamps the raw preferences block ahead of `ExportBundleSchema.safeParse`, but `computeManifest` hashes the Zod-PARSED block (determinism contract) — a v2.1-era claimed preferences hash (computed over the block WITH 72) can never equal the recomputed clamped hash, so the literal sketch would refuse exactly the calm-import scenario the must_haves demand (`corrupted` / failedBlocks: ["preferences"]).
- **Fix:** When the clamp actually mapped (raw preferences measure === 72) and the claimed hash mismatches the recomputed one, the seam recomputes the export-era hash from the parsed block with measure back-mapped to 72 and accepts it for the preferences block only. Every other block — and every other preferences modification — still mismatches (tamper test locks it).
- **Files modified:** src/portability/ExportImportService.ts, tests/unit/settings/measure-clamp.test.ts
- **Verification:** legacy bundle imports ok at 64; garbage 71 → `invalid`; tampered claimed hash → `corrupted` (all in measure-clamp.test.ts)
- **Committed in:** 8bdb4bf

**2. [Rule 3 - Blocking] Schema-union compile blockers outside the plan's file list**
- **Found during:** Task 1 (GREEN, `tsc --noEmit`)
- **Issue:** The measure type narrowed (`ReaderSettings["measure"]`) breaks compilation in files the 16-file plan does not enumerate: `src/measurement/types.ts` ConstraintsSchema (a hand-mirrored union whose header forbids drift from tokens), `tests/e2e/calibration/fixtures-matrix.ts` (MEASURES_FULL/MEASURES_SAMPLED), and `tests/e2e/pagination/fixtures-matrix.ts` L79 (the plan assigns that cell to Task 2, but the type break lands with Task 1).
- **Fix:** Each follows the evolved union with a D21-01/D21-02 citation; the pagination stress cell moved to 64 in the Task 1 commit (max-measure wrap-math intent preserved) and Task 2 re-verified the consumers.
- **Files modified:** src/measurement/types.ts, tests/e2e/calibration/fixtures-matrix.ts, tests/e2e/pagination/fixtures-matrix.ts
- **Verification:** `tsc --noEmit` exit 0; full unit suite 1605/0/13; pagination matrix 237/237 × 3 engines
- **Committed in:** 8bdb4bf

**3. [Rule 3 - Blocking] index.html marker placement**
- **Found during:** Task 1 (GREEN, first test run)
- **Issue:** The D21 explanatory comment inside the `tokens:LEGACY_MEASURE:start` marker broke the extraction discipline (the marked region must contain only the `var` declaration — the FONT_STACKS precedent).
- **Fix:** Comment moved above the start marker; marked region is exactly `var LEGACY_MEASURE = { 72: 64 };`.
- **Files modified:** index.html
- **Verification:** sync-check test green
- **Committed in:** 8bdb4bf

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** All three necessary for correctness/compilation of the locked decisions; no scope creep — the 5 webkit skip sites and zip-slip.test.ts verified byte-stable, SettingsPanel.tsx untouched (verify-only honored).

## Issues Encountered
None beyond the deviations above — both e2e runs (targeted specs + full pagination matrix) were green on the first invocation across all three engines (21/21 + 237/237).

## Verification Evidence

- Unit (plan gate): measure-clamp + settingsSchema + mirror + storageFallback — 108 passed; SettingsContext component — 20 passed; portability regression net — 219 passed.
- Full unit suite: **1605 passed / 0 failed / 13 documented skips** (one invocation).
- E2e (3 engines): targeted specs (typography-live-apply + both polish specs) **21/21**; pagination suite **237/237** — chromium, firefox, webkit, fresh dev server.
- `tsc --noEmit` exit 0; `eslint` clean on every changed file.
- Acceptance criteria greps: single-entry map, five-step tokens, no `literal(72)` in the union region, three seam call sites, `repeat(64)` + `toBeLessThanOrEqual(1)` on both surfaces, `measure: 72` count 0 in the three e2e files, skip sites byte-stable.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- POLISH-09 closed with end-to-end proof (ruler + aria + readout, both modes, 3 engines); the legacy reader path is calm and the corruption path is intact.
- Ready for 21-02 (POLISH-08 tag-menu anchoring) — independent of this plan's files except the shared e2e harness.
- The honest full-suite gate for the phase (npm run test + lint) remains the 21-06 concern; this plan's contribution is green as recorded above.

## Self-Check: PASSED

- Key files exist on disk: src/settings/legacyMeasure.ts, tests/unit/settings/measure-clamp.test.ts, and all 16 modified files verified via `git diff --name-only` (18 total).
- Commits exist: 142a2c8 (test), 8bdb4bf (feat), f7a4834 (test) in `git log`.
- Plan-level verification re-run: unit suites + 3-engine e2e green as recorded above.

---
*Phase: 21-integrated-refinement-and-acceptance*
*Completed: 2026-09-01*
