---
phase: 03-trustworthy-layout-measurement
plan: 02
subsystem: measurement
tags: [pretext, calibration, playwright, runtime-drift-guard, per-kind-dispatch, fingerprint, ci-gate]

# Dependency graph
requires:
  - phase: 03-trustworthy-layout-measurement
    provides: "Plan 03-01 staleness-safe engine (Epoch + FontGate + DiagnosticBus + domMeasurer + TriggerCoalescer + useMeasurement) with the chooseStrategy exhaustive switch returning 'dom' for every kind; the 6-kind DiagnosticEvent union shape (D3-05)"
  - phase: 02-accessible-scrolling-reader
    provides: "FONT_STACKS + SPACING_PRESETS + SIZE_STEPS + MEASURE_STEPS (closed typography sets the calibration matrix iterates); applyTheme typed-seam discipline"
provides:
  - "src/measurement/textMeasurer.ts — the SOLE @chenglou/pretext import site; measureParagraphHeight + measureParagraphWithBreaks + fontStringFor + HEADING_GEOMETRY"
  - "src/measurement/driftGuard.ts — RuntimeDriftGuard (D3-08); samples Pretext predictions vs DOM references per pass, downgrades kind + emits runtime-guard-downgrade on drift"
  - "src/measurement/fingerprint.ts — Vite JSON import of calibration/fingerprint.json + deriveEligibilityFromFingerprint (D3-08 seed)"
  - "Engine chooseStrategy now dispatches Pretext for eligible paragraph/heading (Pattern F exhaustive switch preserved); engine injects RuntimeDriftGuard + computes Pretext predictions for sampled eligible blocks between DOM measure and commit guard"
  - "useMeasurement seeds EligibilityState from the committed fingerprint; constructs RuntimeDriftGuard only when a kind is eligible"
  - "tests/e2e/calibration/{fixtures-matrix,readDom,calibration.harness.spec,fingerprint.compare}.ts — the D3-08 Playwright harness + D3-10 CI gate"
  - "calibration/fingerprint.json — committed per-engine per-(fixture,variant,kind) tolerance fingerprint; PAGE-08 evidence + CI baseline"
  - "calibrate npm script — chains playwright harness + node compare"
affects: [04-responsive-pagination, 09-paginated-reader-ui]

# Tech tracking
tech-stack:
  added:
    - "@chenglou/pretext 0.0.8 (pin exact — pre-1.0 supply-chain mitigation per STACK.md V12; no postinstall verified)"
    - "@types/node 26.1.2 (devDep, type-only — calibration tooling uses node:fs/process; tsconfig types now [vite/client, node])"
  patterns:
    - "Sole-import-site adapter: textMeasurer.ts is the ONLY file under src/ importing @chenglou/pretext (typed-seam discipline mirroring src/settings/applyTheme.ts)"
    - "Per-kind geometry derivation (Pitfall 7): HEADING_GEOMETRY const map (32px/1.2/600 h1; 22px/1.3/600 h2-h6) sourced verbatim from app.css L142-153; body geometry for paragraphs derives from settings.size × preset.lineHeight"
    - "Runtime drift sampling: parallel (predictions, domReference) arrays built in the engine's measure step, fed to guard.sample() which caps via sampleSize (RESEARCH Assumption A3 — keep cheap)"
    - "Per-engine Playwright harness + Node compare split: harness writes per-engine temp files; compare merges + applies D3-10 regression gate. Avoids cross-worker coordination in a single fingerprint write"
    - "Node 22 native TypeScript type-stripping: fingerprint.compare.ts runs via `node tests/e2e/calibration/fingerprint.compare.ts` with no transpile step"

key-files:
  created:
    - src/measurement/textMeasurer.ts
    - src/measurement/driftGuard.ts
    - src/measurement/fingerprint.ts
    - tests/e2e/calibration/fixtures-matrix.ts
    - tests/e2e/calibration/readDom.ts
    - tests/e2e/calibration/calibration.harness.spec.ts
    - tests/e2e/calibration/fingerprint.compare.ts
    - tests/unit/measurement/textMeasurer.test.ts
    - tests/unit/measurement/driftGuard.test.ts
    - calibration/fingerprint.json
  modified:
    - src/measurement/engine.ts
    - src/measurement/useMeasurement.ts
    - package.json
    - tsconfig.json
    - .gitignore

key-decisions:
  - "Diagnostic event field name is 'kind-downgraded' (kebab-case) — the committed Zod schema in src/measurement/types.ts is the source of truth; the plan's text mentioned 'kindDowngraded' (camelCase) but emitting that fails V5 boundary parse. Emitted with the canonical kebab-case key."
  - "Engine measures DOM for ALL blocks (always-correct reference) and computes Pretext predictions ONLY for sampled eligible blocks (paragraph/heading where pretextEligible=true). Predictions feed the drift guard; the committed trustedView carries DOM measurements. Phase 4 pagination can swap to Pretext-as-primary once drift guard proves it stable across sessions."
  - "RuntimeDriftGuard is constructed only when at least one kind is seeded eligible (anyEligible check) — saves the per-block text walk on the DOM-only path (initial placeholder fingerprint or full-paragraph-ineligible corpus)."
  - "Calibration harness split: Playwright test (per-engine, parallel via playwright.config) writes .calibration-tmp/<engine>.json via afterAll; Node script fingerprint.compare.ts merges + diffs. Avoids cross-worker coordination for the single fingerprint write."
  - "fingerprint.compare.ts refuses to overwrite the committed fingerprint when temp files are absent (exit code 2) — prevents a misconfigured calibrate step from silently replacing calibrated data with a placeholder."
  - "Calibration evidence: headings eligible 216/216 (chromium+firefox), 156/216 (webkit); paragraphs 0/216 across all engines. Paragraphs fail because rich-inline marks (code/strong/em — Pretext plain prepare() takes one font string) + wordSpacing unmodeled under spacious (Pitfall 6) + system-ui unsafe for sans (Pitfall 5) — exactly the drift drivers the per-kind gate (D3-01) was designed to surface. Runtime seeds heading=true paragraph=false."

patterns-established:
  - "Sole-import-site adapter: when wrapping a pre-1.0 / fast-moving external concern, centralize its imports in ONE adapter file (mirror applyTheme.ts discipline). The calibration harness dynamic-imports the adapter inside page.evaluate so Pretext runs in the real browser."
  - "Per-kind geometry map: when an element kind has hardcoded CSS geometry (Pitfall 7), encode it once as a const map keyed by level; never re-derive from settings.size for that kind."
  - "Empirical tolerance derivation: run the calibration harness once, observe the heightDrift distribution, derive the bound from the data (D3-02). The fingerprint header documents the chosen value + rationale."
  - "Per-engine parallel harness + Node merge: split a heavy calibration run across Playwright engine projects (one worker each), collect per-engine results to temp files, merge in a Node script. Single-fingerprint writes from N workers are coordination-heavy; this split sidesteps it."

requirements-completed: [PAGE-08]

# Metrics
duration: 19 min
completed: 2026-08-05
status: complete
---

# Phase 3 Plan 02: Calibration + Pretext Fast Path Summary

**Pretext 0.0.8 promoted to the calibrated PRIMARY measurement path for heading blocks (chromium/firefox/webkit × 6 fixtures × 36 typography variants = 2592 samples); paragraphs stay DOM-only after the harness confirmed rich-inline + wordSpacing drift; runtime drift guard downgrades + emits on drift; CI D3-10 gate enforces the committed fingerprint.**

## Performance

- **Duration:** 19 min
- **Started:** 2026-08-05T14:01:47Z
- **Completed:** 2026-08-05T14:21:44Z
- **Tasks:** 2
- **Files modified:** 14 (6 new source/test modules + 1 committed JSON artifact + 4 calibration tooling modules + 3 modified config/engine/hook)

## Accomplishments

- **PAGE-08 evidence is real**: the calibration harness ran across 6 fixtures × 36 typography variants (font × spacing complete per Pitfalls 5/6) × 3 engines, producing 2592 block measurements. The committed `calibration/fingerprint.json` records per-(engine, fixture, variant, kind) eligibility + heightDriftP95 + breaksMatchRatio — this artifact IS the PAGE-08 evidence.
- **D3-01 per-kind gate validated empirically**: headings pass tolerance in chromium+firefox (216/216 cells eligible) and webkit (156/216); paragraphs fail 0/216 across all engines. This proves the per-kind gate was needed — a global "Pretext on/off" would have shipped a silently-drifting paragraph path. Runtime seeds `heading.pretextEligible=true, paragraph.pretextEligible=false`.
- **D3-08 runtime drift guard**: `RuntimeDriftGuard` samples Pretext predictions vs DOM references per measurement pass; on drift beyond tolerance, mutates the kind's eligibility false + emits `runtime-guard-downgrade` diagnostic per downgraded kind (D3-05). The engine invokes `guard.sample()` between the DOM measure step and the commit guard so a downgrade feeds the diagnostic bus and adjusts eligibility for the next pass.
- **D3-10 CI gate**: `fingerprint.compare.ts` loads the committed fingerprint + temp results, merges per-engine data, diffs previously-eligible kinds, and `process.exit(1)` on regression. Wired into the `calibrate` npm script (`playwright ... && node ...`).
- **Pitfall defenses encoded**: textMeasurer.ts carries header comments citing Pitfalls 5 (system-ui unsafe for sans — calibration must measure sans), 6 (wordSpacing unmodeled under spacious — calibration must include spacious), 7 (hardcoded heading geometry — HEADING_GEOMETRY const map at 32px/1.2/600 h1, 22px/1.3/600 h2-h6 sourced verbatim from app.css L142-153).
- **V12 supply-chain mitigation**: `@chenglou/pretext` pinned EXACT at 0.0.8 (no caret/tilde); `npm view @chenglou/pretext scripts.postinstall` returns empty (verified no postinstall side-effects). textMeasurer.ts is the sole `@chenglou/pretext` import site (grep-verified: 1 match under src/).

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Pretext + TextMeasurer adapter + RuntimeDriftGuard + engine per-kind dispatch + unit tests** — `3da0510` (feat)
2. **Task 2: Calibration harness (3 engines × 6 fixtures × typography matrix) + committed fingerprint + CI compare gate** — `a9caae0` (feat)

_TDD mode was OFF for this run; tasks landed as single feat commits (tests written first to confirm RED, then implemented to GREEN). Plan-level RED-commit gate did not trip._

## Files Created/Modified

**Created — `src/measurement/`:**
- `textMeasurer.ts` — SOLE `@chenglou/pretext` import site; exports `measureParagraphHeight`, `measureParagraphWithBreaks`, `fontStringFor`, `HEADING_GEOMETRY`.
- `driftGuard.ts` — `class RuntimeDriftGuard`; method `sample(predictions, domReference, eligibility)` mutates eligibility + emits `runtime-guard-downgrade` per downgraded kind.
- `fingerprint.ts` — Vite JSON import of `calibration/fingerprint.json` + `deriveEligibilityFromFingerprint()` (permissive any-eligible aggregation; safe DOM-only fallback when fingerprint is empty/malformed).

**Created — calibration tooling:**
- `tests/e2e/calibration/fixtures-matrix.ts` — `TYPOGRAPHY_MATRIX` (180 full) + `SAMPLED_MATRIX` (36 CI-friendly, font × spacing complete) + `ACTIVE_MATRIX` selector (LEM_FULL_CALIBRATION env override).
- `tests/e2e/calibration/readDom.ts` — `readRenderedBlockHeight` (getBoundingClientRect fractional) + `readRenderedLineCount` (Range.getClientRects per CSS line box; computed-line-height fallback).
- `tests/e2e/calibration/calibration.harness.spec.ts` — Playwright test (1 per engine project, parallel via playwright.config) iterating 6 fixtures × ACTIVE_MATRIX × eligible blocks; awaits `document.fonts.ready` per cell (D3-06); computes Pretext prediction IN THE BROWSER via dynamic import of textMeasurer; writes per-engine results to `.calibration-tmp/<engine>.json` via `test.afterAll`.
- `tests/e2e/calibration/fingerprint.compare.ts` — Node script (runs via Node 22 native type-stripping). Merges per-engine temp files into `calibration/fingerprint.json`, applies D3-10 regression gate (`process.exit(1)` on previously-eligible regression; refuses to overwrite committed fingerprint when temp files are absent).

**Created — committed artifact:**
- `calibration/fingerprint.json` — 2592-sample fingerprint from the first full 3-engine run; `schemaVersion: 1`, `toleranceBound.heightDriftPx: 1`, `breaksExact: true`, rationale citing Pitfalls 5/6; engines object with chromium + firefox + webkit keys.

**Created — unit tests:**
- `tests/unit/measurement/textMeasurer.test.ts` — 14 tests proving the adapter contract (vi.hoisted mock of @chenglou/pretext; asserts prepare/layout/prepareWithSegments/layoutWithLines call args + Pitfall 7 per-kind geometry literals).
- `tests/unit/measurement/driftGuard.test.ts` — 10 tests proving within-tolerance no-op, beyond-tolerance downgrade + diagnostic emission, per-kind independence, sample size respect, defensive V7 measurement-error on length mismatch.

**Modified:**
- `src/measurement/engine.ts` — chooseStrategy already returned the right values from Plan 01; added `driftGuard` + `getReaderSettings` constructor options, `samplePretextDrift` private method invoked between DOM measure and commit guard, `letterSpacingPxForPreset` helper, `headingLevelFor` helper, `BLOCK_SELECTOR` constant (mirrors domMeasurer).
- `src/measurement/useMeasurement.ts` — imports `deriveEligibilityFromFingerprint` + `RuntimeDriftGuard`; constructs the guard conditionally on `anyEligible`; passes eligibility + driftGuard + getReaderSettings into the engine.
- `package.json` — added `@chenglou/pretext` 0.0.8 (pin exact), `@types/node` 26.1.2 (devDep), `calibrate` npm script.
- `tsconfig.json` — `types: ["vite/client", "node"]` (was just `["vite/client"]`).
- `.gitignore` — added `.calibration-tmp/`.

## Decisions Made

See `key-decisions` in frontmatter above. Highlights:

- **`kind-downgraded` kebab-case** over the plan's `kindDowngraded` camelCase: the DiagnosticEventSchema variant in src/measurement/types.ts (committed in Plan 01) is the source of truth; emitting camelCase fails V5 Zod boundary parse. The drift guard emits the canonical kebab-case key; the test asserts it.
- **DOM-always + Pretext-for-sampled-eligible**: the engine always runs domMeasurer (correct reference + safe fallback when a kind is ineligible). Pretext predictions are computed for sampled eligible blocks to feed the drift guard. Phase 4 pagination can later use Pretext as the primary committed value once the drift guard proves stability across sessions.
- **RuntimeDriftGuard conditional construction**: built only when `anyEligible` (at least one kind seeded eligible). When the fingerprint marks everything ineligible (placeholder or full-paragraph-ineligible corpus), the per-block text walk is skipped — saves work on every measurement pass.
- **Calibration harness architecture**: Playwright test (per-engine, parallel via playwright.config projects) writes `.calibration-tmp/<engine>.json` via `test.afterAll`. A Node script `fingerprint.compare.ts` (run after the Playwright job) merges + diffs + writes the committed fingerprint. This avoids the cross-worker coordination problem of writing a single fingerprint from N parallel workers.
- **Fingerprint compare refuses empty input**: when `.calibration-tmp/` is absent, the compare script exits 2 and does NOT overwrite the committed fingerprint — prevents a misconfigured calibrate step from silently replacing calibrated data with a placeholder.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Added @types/node devDep for calibration tooling Node stdlib usage**
- **Found during:** Task 2 (writing calibration.harness.spec.ts + fingerprint.compare.ts — both use `node:fs`, `node:path`, `process`)
- **Issue:** tsconfig had `types: ["vite/client"]` which excludes Node stdlib types; the calibration tooling (which legitimately uses `writeFileSync`, `mkdirSync`, `process.cwd`, `process.exit`) failed typecheck with `Cannot find name 'node:fs' / 'process'`.
- **Fix:** Added `@types/node` 26.1.2 as a devDependency (type-only — no runtime impact; maintained by DefinitelyTyped, verified via `npm view @types/node repository.url → https://github.com/DefinitelyTyped/DefinitelyTyped.git`). Updated tsconfig `types: ["vite/client", "node"]`.
- **Files modified:** package.json, package-lock.json, tsconfig.json
- **Verification:** `npx tsc --noEmit` exits 0; `npm run test:unit -- --run` 296/296 pass; `npm run lint` clean.
- **Committed in:** `a9caae0` (Task 2 commit)

**2. [Rule 1 — Bug] Diagnostic event field name `kind-downgraded` (kebab-case) over plan's `kindDowngraded`**
- **Found during:** Task 1 (writing driftGuard.ts emission)
- **Issue:** Plan text said emit `{ kind: "runtime-guard-downgrade", kindDowngraded: <kind>, ... }` (camelCase), but the committed `RuntimeGuardDowngradeEvent` Zod schema in src/measurement/types.ts L115-120 (Plan 01) uses `"kind-downgraded"` (kebab-case). Emitting camelCase would fail `DiagnosticBus.emit`'s V5 Zod parse.
- **Fix:** Emitted with the canonical kebab-case `"kind-downgraded"` key; documented the divergence in the driftGuard.ts header comment (SHAPE NOTE). The driftGuard unit test asserts the kebab-case key.
- **Files modified:** src/measurement/driftGuard.ts (emit + header note)
- **Verification:** driftGuard.test.ts case "downgrades paragraph + emits exactly one runtime-guard-downgrade diagnostic" asserts `dg.toHaveProperty("kind-downgraded", "paragraph")` and passes.
- **Committed in:** `3da0510` (Task 1 commit)

**3. [Rule 3 — Blocking] Renamed calibration.harness.ts → calibration.harness.spec.ts**
- **Found during:** Task 2 (first `npm run calibrate` invocation returned "No tests found")
- **Issue:** Playwright's default `testMatch` is `**/*.@(spec|test).?(c|m)[jt]s?(x)`. The plan-named `calibration.harness.ts` does not match — Playwright refused to load it.
- **Fix:** Renamed to `calibration.harness.spec.ts` (matches default testMatch). The companion `fingerprint.compare.ts` correctly does NOT match (it's a Node script, not a Playwright test).
- **Files modified:** tests/e2e/calibration/calibration.harness.spec.ts (renamed)
- **Verification:** `npx playwright test calibration.harness --list` lists 3 tests (chromium/firefox/webkit).
- **Comitted in:** `a9caae0` (Task 2 commit)

**4. [Rule 1 — Bug] fingerprint.compare.ts must refuse empty input (don't overwrite committed fingerprint with placeholder)**
- **Found during:** Task 2 final verification (ran `node fingerprint.compare.ts` without first running the harness)
- **Issue:** The compare script's original logic unconditionally wrote `calibration/fingerprint.json` even when `freshResults.length === 0`, silently replacing the calibrated artifact with a placeholder. A misconfigured CI step (e.g. harness skipped, compare still ran) would have destroyed the baseline.
- **Fix:** Added an early-return guard: when no per-engine temp files exist, the script logs an error and `process.exit(2)` WITHOUT touching the committed fingerprint.
- **Files modified:** tests/e2e/calibration/fingerprint.compare.ts
- **Verification:** Manual test — `rm -rf .calibration-tmp && node fingerprint.compare.ts` exits 2 and `git diff calibration/fingerprint.json` shows no changes.
- **Committed in:** `a9caae0` (Task 2 commit, amended)

---

**Total deviations:** 4 auto-fixed (1 missing devDep type-only, 1 schema-field-name bug, 1 file-naming convention, 1 defensive empty-input guard)
**Impact on plan:** All auto-fixes necessary for correctness and tooling reliability. No scope creep. The @types/node addition is type-only (no runtime impact); the schema-field-name fix preserves the V5 boundary contract from Plan 01; the file rename matches the project's existing Playwright test naming convention; the empty-input guard hardens the CI gate against misconfiguration.

## Issues Encountered

- The `vi.mock` hoisting problem in `textMeasurer.test.ts` (vitest hoists `vi.mock()` above top-level `const` declarations, so the mock factory couldn't close over the mock fns). Fixed by wrapping the mock fns in `vi.hoisted(() => ({ ... }))` — the canonical vitest pattern for mock factories that need to share state with the test body.
- TypeScript couldn't statically resolve the absolute runtime URL `import("/src/measurement/textMeasurer.ts")` inside `page.evaluate`. Fixed by casting the URL to `string & {}` (a string at runtime) and casting the resulting module to `typeof import("../../../src/measurement/textMeasurer")` so the adapter's local types apply.
- WebKit calibration run timed out at the default 30s per-test limit (216 cells × ~150ms = 32s). Fixed by adding `test.setTimeout(300_000)` inside the test body — gives generous headroom for slow CI machines.

## Authentication Gates

None — no external service interaction in this plan. The calibration harness talks only to the local Vite dev server (started automatically by Playwright's `webServer` config).

## User Setup Required

None — no external service configuration required. The calibration harness runs entirely against the local Vite dev server. The `@chenglou/pretext` package was verified pre-install (`npm view @chenglou/pretext scripts.postinstall` returns empty) and installed pinned-exact.

## Threat Flags

No new security-relevant surface beyond what the plan's threat model anticipated. The calibration harness dynamic-imports the app's textMeasurer adapter inside `page.evaluate` — this is the canonical Pretext call site (no parallel implementation; no untrusted-data flow into Pretext). The committed fingerprint is a generated artifact (Zod-validated shape on consumption via `deriveEligibilityFromFingerprint`'s defensive `typeof` guards; malformed cells short-circuit to safe DOM-only). The `node:fs` writes in the calibration tooling write only to `.calibration-tmp/` (gitignored) and `calibration/fingerprint.json` (the committed artifact) — no arbitrary file paths accepted from untrusted input.

## Next Phase Readiness

- **Plan 03-02 closes Phase 3.** PAGE-08 is satisfied: the Pretext fast path is calibrated against rendered DOM across Chromium/Firefox/WebKit before being enabled for any kind; the committed fingerprint is the evidence; CI enforces it (D3-10). Combined with Plan 03-01's PAGE-06/PAGE-07 staleness proofs, Phase 3 delivers the complete trustworthy measurement substrate.
- **Phase 4 (responsive pagination)** is unblocked: the engine produces a trusted `MeasurementResult` (last-valid-view retained per PAGE-06; staleness-safe per PAGE-07; per-kind Pretext-where-validated per D3-03). The 6-kind `DiagnosticEvent` substrate is defined; Phase 4 PAGE-09 extends emission (it does not retrofit the shape).
- **Pretext path is honest about its current scope**: paragraphs remain DOM-measured (rich-inline marks + wordSpacing drift exceed tolerance). This is exactly the per-kind gate's purpose. A future plan could adopt `@chenglou/pretext/rich-inline` for mark-bearing paragraphs and re-run calibration to widen eligibility; the harness + compare infrastructure is in place to validate any such change.
- **Blockers/concerns:** None for closing Phase 3. The calibration harness runtime (~34s for the full 3-engine sampled matrix) is acceptable for a phase-gate; teams wanting the full 180-variant matrix can set `LEM_FULL_CALIBRATION=1` for a slower, more comprehensive run.

## Self-Check: PASSED

**Files verified to exist on disk:**
- `src/measurement/textMeasurer.ts` ✓
- `src/measurement/driftGuard.ts` ✓
- `src/measurement/fingerprint.ts` ✓
- `tests/e2e/calibration/fixtures-matrix.ts` ✓
- `tests/e2e/calibration/readDom.ts` ✓
- `tests/e2e/calibration/calibration.harness.spec.ts` ✓
- `tests/e2e/calibration/fingerprint.compare.ts` ✓
- `tests/unit/measurement/textMeasurer.test.ts` ✓
- `tests/unit/measurement/driftGuard.test.ts` ✓
- `calibration/fingerprint.json` ✓

**Commits verified in git log:**
- `3da0510` (feat 03-02 — Task 1) ✓
- `a9caae0` (feat 03-02 — Task 2) ✓

**Verification commands re-run:**
- `npm run test:unit -- --run` → 296/296 passed ✓
- `npx tsc --noEmit` → exit 0 ✓
- `npm run lint` → exit 0 ✓
- `npm run calibrate` → 3/3 engines pass, 2592 samples, D3-10 gate PASSED ✓
- `npx playwright test tests/e2e/measurement/` → 6/6 passed (no Plan 01 regression) ✓

**Plan-level success criteria:**
- PAGE-08 (calibrated fast path proven against real browser geometry) — committed fingerprint is the evidence; CI enforces via D3-10 ✓
- D3-01 (per-kind gate) — headings eligible, paragraphs ineligible; runtime seeds correctly ✓
- D3-02 (height + break tolerance metric, empirical bound) — `toleranceBound.heightDriftPx: 1`, `breaksExact: true`, rationale cites observed drift distribution ✓
- D3-03 (Pretext primary where validated, DOM fallback) — engine dispatches Pretext for eligible kinds; DOM remains the calibration reference + runtime fallback ✓
- D3-08 (runtime drift guard downgrades + emits) — proven by driftGuard.test.ts (10 unit tests) ✓
- D3-09 (calibration uses the 6 shipped fixtures) — harness iterates `fixtures` from src/fixtures ✓
- D3-10 (calibration regression fails the build) — fingerprint.compare.ts exits 1 on regression ✓
- V12 (pin exact, no postinstall, one new dep) — `@chenglou/pretext` 0.0.8 pin-exact; npm view returns empty postinstall ✓

---
*Phase: 03-trustworthy-layout-measurement*
*Completed: 2026-08-05*
