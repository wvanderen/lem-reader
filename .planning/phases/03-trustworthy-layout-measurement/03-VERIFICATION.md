---
phase: 03-trustworthy-layout-measurement
verified: 2026-08-05T17:30:00Z
status: human_needed
score: 8/8 truths verified (1 manual-only UAT item per VALIDATION.md — visual continuity across a forced font swap)
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Force a late @font-face load and observe visual continuity across the font swap"
    expected: "Scrolling article body stays painted and reflows calmly while the engine's font gate (D3-06) waits for the new font to settle and recomputes; no blank frame, no jarring churn. Trusted view is retained (PAGE-06 contract); a late-epoch result is dropped, not painted over the old one (PAGE-07 contract)."
    why_human: "The e2e suite proves article content stays mounted + h1/first-paragraph remain visible across a resize cycle (last-valid-view.spec.ts) and that no pageerrors leak (stale-drop.spec.ts), but forcing a real late web-font load and judging the aesthetic 'calmness' of the swap moment is a visual/AT judgment that requires human eyes on a real browser. The current Phase 2 font stack is system-only so document.fonts.ready resolves near-instantly; the contract is exercised but its visible payoff under a genuine font-swap moment is human-only (03-VALIDATION.md §Manual-Only)."
---

# Phase 03: Trustworthy Layout Measurement — Verification Report

**Phase Goal:** Readers keep a valid, usable article view while responsive layout measurement settles and only the newest trustworthy result can take effect.
**Verified:** 2026-08-05T17:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth (ROADMAP SC) | Status | Evidence |
|---|---|---|---|
| SC1 | Reader can continue using the last valid article view while a changed viewport, typography setting, font state, or asset dimension is being measured | ✓ VERIFIED | `src/measurement/useMeasurement.ts:63` retains `trustedView` in React `useState<MeasurementResult \| null>(null)`; only overwritten by a handler that fires AFTER the engine's commit guard (engine.ts L164 `if (!this.epoch.isCurrent(captured) \|\| signal.aborted) return`). `src/routes/ArticleView.tsx:103` mounts `useMeasurement(article, articleRef)` unconditionally; `<ArticleBody>` remains the rendered surface during reflow. `tests/e2e/measurement/last-valid-view.spec.ts:35-101` proves across chromium/firefox/webkit that the `<article>` element's child count never decreases (L70-74 mid-flight, L88-91 after settle) and h1 + first `<p>` stay visible throughout a resize-triggered re-measure cycle. Trigger surface covered: ResizeObserver (triggers.ts L71-74), settings change (triggers.ts L101-103 `notifySettingsChange` + useMeasurement.ts L150-152 settings effect), font-set change (triggers.ts L92-95 `addEventListener("loadingdone")`), figure load (triggers.ts L77 capture-phase load listener). |
| SC2 | A late result computed for older constraints never replaces the newer valid layout the reader is using | ✓ VERIFIED | `src/measurement/engine.ts:164-172` commit guard: `if (!this.epoch.isCurrent(captured) \|\| signal.aborted) { diagnostics.emit({ kind: "late-epoch-drop", captured, current, ts }); return; }` — emits diagnostic and drops; trusted handler is NEVER invoked for a stale epoch. `src/measurement/epoch.ts:44-49` `bump()` aborts the prior `AbortController` + increments the monotonic counter; `isCurrent()` (L57-59) returns false for any earlier epoch. `tests/unit/measurement/epoch.test.ts` (80 lines) asserts the PAGE-07 invariant directly. `tests/e2e/measurement/stale-drop.spec.ts:60-115` reproduces a rapid-trigger race (3 viewport sizes + 3 typography slider ArrowUps inside the 400 ms debounce) and asserts the final committed `size === 24` and `viewportWidthPx > finalWidth − 200`; also asserts zero uncaught `pageerror` events (V7 — reader never sees a measurement throw). |
| SC3 | Across the supported engines, any enabled fast text-measurement path stays within documented tolerances of browser-rendered calibration fixtures | ✓ VERIFIED | `calibration/fingerprint.json` (9125 lines, schemaVersion=1) records per-(engine, fixture, variant, kind) eligibility + `heightDriftP95` + `breaksMatchRatio` across **chromium + firefox + webkit** × **6 fixtures** × **36 typography variants** (3 fonts × 2 sizes × 3 spacings × 2 measures — full font × spacing coverage per Pitfalls 5/6; size × measure sampled per RESEARCH §Calibration Matrix). `toleranceBound: { heightDriftPx: 1, breaksExact: true }` with empirical rationale. Measured outcome: headings eligible 216/216 chromium + 216/216 firefox + 156/216 webkit; paragraphs 0/216 across all engines (legitimately ineligible per Pitfalls 5 [sans/system-ui] + 6 [wordSpacing unmodeled under spacious] + rich-inline marks — exactly the per-kind gate's D3-01 purpose). `tests/e2e/calibration/calibration.harness.spec.ts` (258 lines) is the D3-08 Playwright driver; awaits `document.fonts.ready` per cell (L199 — D3-06). `tests/e2e/calibration/fingerprint.compare.ts:269` `process.exit(1)` is the D3-10 regression gate. `src/measurement/driftGuard.ts:124-129` emits `runtime-guard-downgrade` on runtime drift (D3-08). `src/measurement/fingerprint.ts:26` Vite-imports the committed fingerprint; `deriveEligibilityFromFingerprint` (L61-87) seeds engine eligibility (heading=true, paragraph=false at runtime). |

**Score:** 3/3 ROADMAP SC verified.

### Plan-Level Must-Have Truths

#### Plan 03-01 (PAGE-06, PAGE-07) — 4/4 verified

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1.1 | Reader's article view never blank-flashes when viewport, typography, or font state changes (previously-committed trusted view stays mounted until a newer trustworthy one supersedes it) | ✓ VERIFIED | `tests/e2e/measurement/last-valid-view.spec.ts:35-101` is the behavioral proof: child-count assertion at 3 points (before, mid-flight at L70, after at L87) + h1/first-paragraph `toBeVisible()` continuous. Engine contract: trusted handler only invoked after font gate + commit guard (engine.ts L183 inside the post-guard try block). Hook retains trustedView in state across re-measures (useMeasurement.ts L63). |
| 1.2 | A measurement result computed for older constraints is dropped at the commit guard, never written into the trusted view | ✓ VERIFIED | `engine.ts:164-172` — `late-epoch-drop` diagnostic emitted, function returns BEFORE invoking `trustedHandler`. Behavioral proof: `tests/unit/measurement/epoch.test.ts` proves `isCurrent` returns false for older epochs after a newer bump; `tests/e2e/measurement/stale-drop.spec.ts` proves the final committed constraints reflect the newest state under a rapid-trigger race. |
| 1.3 | No measurement result is accepted as trusted before `document.fonts.ready` resolves | ✓ VERIFIED | `fontGate.ts:43-55` `awaitFontsReady` uses `Promise.race([document.fonts.ready, abortPromise])` so the await cannot complete before fonts settle (and cannot hang on a never-resolving font promise if the signal aborts mid-flight). Engine awaits it before any commit (engine.ts L144). `tests/unit/measurement/fontGate.test.ts` (74 lines) asserts it resolves only after `.ready` and throws `AbortError` on already-aborted signal. Calibration harness awaits `.ready` per cell too (calibration.harness.spec.ts L199). |
| 1.4 | Rapid successive triggers (resize drag, typography slider) never let an older epoch's result win | ✓ VERIFIED | `triggers.ts:106-115` debounce coalesces a burst into one trigger; `epoch.bump()` (epoch.ts L44-49) aborts the prior `AbortController` on every fire; engine's commit guard (engine.ts L164) drops any result whose captured epoch is not current. Behavioral proof: `stale-drop.spec.ts` 3×3 rapid-trigger race passes across chromium/firefox/webkit (orchestrator-confirmed). |

#### Plan 03-02 (PAGE-08) — 4/4 verified

| # | Truth | Status | Evidence |
|---|---|---|---|
| 2.1 | Pretext-predicted block height and line-break positions match rendered DOM within the documented tolerance for every eligible kind across Chromium, Firefox, and WebKit | ✓ VERIFIED | `calibration/fingerprint.json` is the per-kind evidence: headings pass tolerance (`heightDriftP95 ≤ 1px` AND `breaksMatchRatio ≥ 1.0`) in 216/216 chromium + 216/216 firefox + 156/216 webkit cells. Paragraphs are 0/216 (legitimately ineligible — recorded as such; D3-01 per-kind gate working as designed). The fingerprint covers all 3 engines × 6 fixtures × 36 variants = 2592 samples (verified by direct JSON key count). |
| 2.2 | A block kind whose Pretext prediction drifts outside tolerance at runtime is downgraded to DOM measurement and emits a `runtime-guard-downgrade` diagnostic | ✓ VERIFIED | `src/measurement/driftGuard.ts:108-130` — `sample()` checks `Math.abs(dom.heightPx − prediction.heightPx) > tolerancePx`; on drift flips `eligibility[kind].pretextEligible = false` and emits `{ kind: "runtime-guard-downgrade", "kind-downgraded": kind, heightDriftPx: drift, ts }`. Wired: `engine.ts:154-162` invokes `this.samplePretextDrift(blocks)` between DOM measure and commit guard when any kind is eligible. Behavioral proof: `tests/unit/measurement/driftGuard.test.ts` (289 lines, 10 tests) asserts within-tolerance no-op, beyond-tolerance downgrade + diagnostic emission, per-kind independence, sample-size cap. |
| 2.3 | A previously-eligible kind that drifts outside tolerance in CI fails the build (the committed fingerprint regression is a real failure) | ✓ VERIFIED | `tests/e2e/calibration/fingerprint.compare.ts:245-270` — for each (engine, kind) previously eligible in the committed fingerprint, if the fresh run marks it ineligible, push to `regressions`; L269 `process.exit(1)`. Defensive: L210 `process.exit(2)` if temp results absent (refuses to overwrite committed baseline with placeholder — Deviation #4). Wired as `npm run calibrate` (package.json: `playwright test calibration.harness && node tests/e2e/calibration/fingerprint.compare.ts`). |
| 2.4 | Every font × spacing combination is covered by the calibration matrix (the documented drift drivers — Pitfalls 5 and 6) | ✓ VERIFIED | `tests/e2e/calibration/fixtures-matrix.ts:79-89` `SAMPLED_MATRIX` = 3 fonts × 2 sizes × 3 spacings × 2 measures = 36 variants — **full font × spacing coverage** (3 × 3 = 9 baseline cells). Fingerprint JSON confirms: chromium/firefox/webkit each have variants spanning fonts={serif,sans,dyslexic} × spacings={compact,comfortable,spacious}. `LEM_FULL_CALIBRATION=1` env var swaps to full 180-variant matrix (fixtures-matrix.ts L95-98). |

**Score:** 8/8 plan-level truths verified. 3/3 ROADMAP SC verified.

### Required Artifacts

#### Plan 03-01 artifacts — 9/9 ✓ VERIFIED

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/measurement/types.ts` | Zod schemas: Constraints, MeasurementResult, BlockMeasurement, EligibilityState, DiagnosticEvent (6-kind discriminated union) | ✓ VERIFIED | 136 lines. `ConstraintsSchema` L22, `BlockMeasurementSchema` L51, `MeasurementResultSchema` L63, `EligibilityStateSchema` L77, `DiagnosticEventSchema` L128 `z.discriminatedUnion("kind", [...])` with all 6 variants (drift-exceedance, dom-fallback, late-epoch-drop, calibration-failure, runtime-guard-downgrade, measurement-error). `type DiagnosticEvent = z.infer<typeof DiagnosticEventSchema>` L136. `import type` honored (L14 `import { z }` is the only value import). |
| `src/measurement/epoch.ts` | Monotonic Epoch class with AbortController cancellation | ✓ VERIFIED | 65 lines. `class Epoch` L35 with `private epochCount` L36, `private controller = new AbortController()` L37 (inline-initialized — not definite-assignment). Methods: `bump()` L44, `isCurrent(candidate)` L57, `current()` L62. Header documents PAGE-07 + the cancelled-flag ancestor at ArticleView L93-117. |
| `src/measurement/fontGate.ts` | `awaitFontsReady` + `AbortError` | ✓ VERIFIED | 56 lines. `class AbortError extends Error` L21 (prototype chain restored L26). `awaitFontsReady(signal)` L43 — fast-path abort check L45, `Promise.race([document.fonts.ready, abortPromise])` L46-55 with `{ once: true }` listener self-cleanup. Header cites D3-06 + Pitfall 3 + the `onloadingdone`-property anti-pattern. |
| `src/measurement/diagnostics.ts` | `DiagnosticBus` with emit + subscribe + ring buffer | ✓ VERIFIED | 72 lines. `class DiagnosticBus` L32 with `subscribers` Set L33, `ring` array L34 (cap 100 L24). `emit(event)` L42 — V5 boundary parse via `DiagnosticEventSchema.parse(event)` before forwarding + ring push. `subscribe(handler)` L58 returns unsubscribe closure. `recent()` L69 returns snapshot. Header cites D3-04 + D3-05 + V5. |
| `src/measurement/domMeasurer.ts` | `measureAllBlocks(articleEl, signal)` reusing exact block selector | ✓ VERIFIED | 105 lines. `BLOCK_SELECTOR` L34 = `"h2, h3, h4, p, blockquote, li, pre, figure, sup, details"` — byte-identical to `src/reader/useScrollSave.ts` L99. `measureAllBlocks` L83: querySelectorAll, batch reads (`getBoundingClientRect().height` fractional + `getClientRects().length` per-line), `signal.aborted` check L93 between blocks, `kindForElement` L41 maps tag → kind. No DOM writes (Pitfall 2 read-phase isolation). |
| `src/measurement/triggers.ts` | `TriggerCoalescer` + `DEBOUNCE_MS=400` | ✓ VERIFIED | 172 lines. `DEBOUNCE_MS = 400` L35. `class TriggerCoalescer` L52 wires 4 sources: ResizeObserver L71-74, figure `<img>` load capture L77, `document.fonts.addEventListener("loadingdone", ...)` L92-95 (jsdom-guarded), settings via `notifySettingsChange()` L101-103. `fire()` L118 builds Constraints snapshot + bumps epoch + calls `onTrigger`. `disconnect()` L157 idempotent cleanup of all 4 + timer + final epoch bump. |
| `src/measurement/engine.ts` | `MeasurementEngine`: run + onTrusted + cancel; commit-guard emits `late-epoch-drop` | ✓ VERIFIED | 367 lines. `class MeasurementEngine` L103. `run(constraints)` L141 — bump → awaitFontsReady → measureAllBlocks → optional drift sample → commit guard L164 (emits `late-epoch-drop` on stale) → MeasurementResult + trusted handler. `onTrusted(handler)` L284 returns unsubscribe. `cancel()` L294 bumps epoch. `chooseStrategy` L343 exhaustive switch with NO default (Pattern F); returns "pretext" for eligible paragraph/heading, "dom" for all others. V7 catch path L191-201 (AbortError silent; everything else → `measurement-error` diagnostic). |
| `src/measurement/useMeasurement.ts` | `useMeasurement(article, articleElRef)` hook; trustedView retained in state | ✓ VERIFIED | 155 lines. Hook signature L58. `useState<MeasurementResult \| null>(null)` L63 — the trustedView retention. Nullable-article no-op L84. Engine + coalescer constructed in mount effect L83-145; cleanup L136-141 calls `unsubTrusted() + coalescer.disconnect() + engine.cancel()`. Seeds eligibility from `deriveEligibilityFromFingerprint()` L93. Constructs `RuntimeDriftGuard` only when anyEligible L104-110. DEV-only `window.__lemLastTrustedConstraints` debug hook L122-125 (gated by `import.meta.env.DEV`). Settings effect L150-152 signals coalescer. |
| `src/routes/ArticleView.tsx` | Mounts `useMeasurement(article, articleRef)`; `<ArticleBody>` stays rendered; `.status` untouched | ✓ VERIFIED | `import { useMeasurement }` L30. Mount call L103 `useMeasurement(article, articleRef)` — directly after `useScrollSave` L92. Header comment L94-102 cites PAGE-06 + D3-04. Grep confirmed: trusted view is NOT referenced inside the `.status` region (status region receives only Phase 2 storage/restore copy). |

#### Plan 03-02 artifacts — 5/5 ✓ VERIFIED

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/measurement/textMeasurer.ts` | Sole `@chenglou/pretext` import; exports `measureParagraphHeight` + `measureParagraphWithBreaks` + `fontStringFor` + `HEADING_GEOMETRY` | ✓ VERIFIED | 175 lines. Sole import site (grep-verified: 1 match under `src/`). Imports `{ layout, layoutWithSegments, prepare, prepareWithSegments }` L43-48. `HEADING_GEOMETRY` L62-69 encodes Pitfall 7 literals (32px/1.2/600 h1; 22px/1.3/600 h2-h6). `fontStringFor(kind, level, settings)` L90 returns canvas font shorthand + lineHeightPx per kind. `measureParagraphHeight` L137 calls `prepare` + `layout`. `measureParagraphWithBreaks` L161 calls `prepareWithSegments` + `layoutWithLines`. Header cites Pitfalls 5/6/7 + V12. |
| `src/measurement/driftGuard.ts` | `RuntimeDriftGuard` with `sample(predictions, domReference, eligibility)` | ✓ VERIFIED | 134 lines. `class RuntimeDriftGuard` L53. `sample()` L77: length-mismatch guard L82-92 emits `measurement-error` + skips; per-kind worst-drift tracking L96-116; downgrade loop L118-130 sets `eligibility[kind].pretextEligible = false` + emits `runtime-guard-downgrade` with `"kind-downgraded"` (kebab-case — matches types.ts L117 schema; documented in SHAPE NOTE L25-29). |
| `calibration/fingerprint.json` | Committed per-engine per-kind tolerance fingerprint; CI baseline | ✓ VERIFIED | 9125 lines. `schemaVersion: 1` L2, `generatedAt` L3 ISO-8601, `toleranceBound: { heightDriftPx: 1, breaksExact: true }` L4-7, multi-line `rationale` L8 citing tolerance rule + Pitfalls 5/6 + 2592-sample derivation, `engines` object L9 with keys `chromium` + `firefox` + `webkit`. Per-(fixture, variant, kind) cells record `eligible` + `heightDriftP95` + `breaksMatchRatio` + `sampleCount`. |
| `tests/e2e/calibration/calibration.harness.spec.ts` | D3-08 Playwright harness across 6 fixtures × typography matrix × 3 engines | ✓ VERIFIED | 258 lines. Iterates `fixtures` (6) × `ACTIVE_MATRIX` (36 sampled / 180 full). `applyVariant` L66 mirrors `applyTheme` writes byte-for-byte. `predictBlockInBrowser` L97 dynamic-imports the app's textMeasurer inside `page.evaluate` (Pitfall 5 defense — Pretext's canvas sees real font metrics). Awaits `document.fonts.ready` per cell L199 (D3-06). `test.afterAll` L242 writes per-engine temp file to `.calibration-tmp/<engine>.json`. `test.setTimeout(300_000)` L191 (webkit headroom). (Renamed from `.harness.ts` per Deviation #3 — Playwright's testMatch requires `.spec`/`.test`.) |
| `tests/e2e/calibration/fingerprint.compare.ts` | D3-10 CI gate — diffs fresh vs committed; exits 1 on regression | ✓ VERIFIED | 278 lines. `aggregate()` L74 computes per-cell `eligible` from raw block results (tolerance heightDriftPx≤1 + breaksMatchRatio≥1.0). `engineKindEligibility()` L128 — kind engine-eligible iff ≥95% of cells pass. `main()` L197: refuses empty input (L210 `process.exit(2)`), writes fresh fingerprint L226-230, diffs previously-eligible (engine, kind) pairs L246-256, L269 `process.exit(1)` on regression. |

### Key Link Verification

#### Plan 03-01

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `src/measurement/triggers.ts` | `src/measurement/engine.ts` | `epoch.bump()` → engine.run consumes `{constraints, epoch, signal}` | ✓ WIRED | `triggers.ts:121` `const { epoch: epochNum, signal } = this.epoch.bump()`; `useMeasurement.ts:130-133` `onTrigger: (constraints) => { void engine.run(constraints); }`. Engine's own `run()` calls `this.epoch.bump()` L142 (engine owns its own Epoch for direct-invocation commit guards; coalescer's Epoch is the trigger-coalescing epoch). Pattern `epoch\.bump` present at triggers.ts:121 + engine.ts:142 + engine.ts:295. |
| `src/measurement/engine.ts` | `src/measurement/epoch.ts` | commit guard checks `epoch.isCurrent(captured)` | ✓ WIRED | engine.ts L164 `if (!this.epoch.isCurrent(captured) \|\| signal.aborted)`; pattern `epoch\.isCurrent` present at engine.ts:164. |
| `src/measurement/useMeasurement.ts` | `src/routes/ArticleView.tsx` | ArticleView mounts `useMeasurement(article, articleRef)`; trustedView in hook state | ✓ WIRED | ArticleView.tsx L30 import + L103 mount call. Pattern `useMeasurement\(` present. |

#### Plan 03-02

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `src/measurement/textMeasurer.ts` | `@chenglou/pretext` | sole import of `prepare/layout/prepareWithSegments/layoutWithLines` | ✓ WIRED | textMeasurer.ts L43-48. Repo-wide grep: exactly 1 match under `src/`. Pattern `from "@chenglou/pretext"` present. |
| `tests/e2e/calibration/calibration.harness.spec.ts` | `calibration/fingerprint.json` | harness writes per-engine temp; compare merges + writes committed | ✓ WIRED | harness.ts L242-255 `afterAll` writes `.calibration-tmp/<browserName>.json`; fingerprint.compare.ts L33 `FINGERPRINT_PATH = resolve(REPO_ROOT, "calibration", "fingerprint.json")` + L226-230 `writeFileSync`. Pattern `fingerprint\.json` present in both files. |
| `src/measurement/driftGuard.ts` | `src/measurement/diagnostics.ts` | downgrade emits `runtime-guard-downgrade` DiagnosticEvent | ✓ WIRED | driftGuard.ts L124-129 emits `{ kind: "runtime-guard-downgrade", "kind-downgraded": kind, heightDriftPx: drift, ts }` via the injected `DiagnosticBus`. Pattern `runtime-guard-downgrade` present at driftGuard.ts:125. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `useMeasurement` trustedView | `trustedView: MeasurementResult \| null` | `MeasurementEngine.run` → `onTrusted(setTrustedView)` after font gate + commit guard | ✓ Real (Zod-validated `MeasurementResult` with `constraints` from live settings + viewport, `blocks` from DOM `getBoundingClientRect`) | ✓ FLOWING |
| Engine blocks array | `blocks: BlockMeasurement[]` | `domMeasurer.measureAllBlocks(articleEl, signal)` — live `getBoundingClientRect` + `getClientRects` on rendered `<article>` children | ✓ Real (fractional heights + per-line counts from real layout) | ✓ FLOWING |
| Coalescer Constraints | `constraints: Constraints` | `TriggerCoalescer.fire()` reads `getSettings()` + `articleEl.getBoundingClientRect().width` + `articleEl.lang` | ✓ Real (live settings + live geometry) | ✓ FLOWING |
| Fingerprint-derived eligibility | `eligibility: EligibilityState` | `deriveEligibilityFromFingerprint(COMMITTED_FINGERPRINT)` reads committed JSON at module load | ✓ Real (heading=true, paragraph=false per measured 2592-sample fingerprint) | ✓ FLOWING |
| DiagnosticBus ring | `ring: DiagnosticEvent[]` | `engine.run` + `driftGuard.sample` emit real events on stale/drift/error paths | ✓ Real (events emitted on real trigger paths; e2e confirms zero `pageerror` leak) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full unit + component suite green | `npm run test:unit -- --run` (orchestrator) | **296 passed**, 0 failed (incl. `tests/unit/measurement/{epoch,fontGate,diagnostics,textMeasurer,driftGuard}.test.ts`) | ✓ PASS |
| TypeScript clean | `npx tsc --noEmit` (orchestrator) | exit 0 | ✓ PASS |
| ESLint clean | `npm run lint` (orchestrator) | exit 0 | ✓ PASS |
| E2E measurement suite green (PAGE-06/PAGE-07) | `npx playwright test tests/e2e/measurement/` (orchestrator) | **6/6 passed** across chromium + firefox + webkit (2 specs × 3 engines) | ✓ PASS |
| Calibration harness green (PAGE-08) | `npm run calibrate` (orchestrator) | **3/3 engines pass, 2592 samples, D3-10 gate PASSED** | ✓ PASS |
| Full e2e suite green (no Phase 1/2 regression) | `npx playwright test` (orchestrator) | **144/144 passed** across chromium + firefox + webkit | ✓ PASS |
| PAGE-07 epoch invariant (behavior-dependent) | `epoch.test.ts` (named test, orchestrator) | asserts `isCurrent` false for older epoch after newer bump; prior signal aborted | ✓ PASS (behaviorally proven) |
| PAGE-07 rapid-trigger race (behavior-dependent) | `stale-drop.spec.ts` (orchestrator) | final committed `size === 24`, `viewportWidthPx` near final viewport, zero `pageerror` | ✓ PASS (behaviorally proven) |
| PAGE-06 last-valid-view retention (behavior-dependent) | `last-valid-view.spec.ts` (orchestrator) | article child count never decreases through resize cycle; h1+first-paragraph stay visible; status region text unchanged (D3-04) | ✓ PASS (behaviorally proven) |
| D3-08 runtime drift downgrade (behavior-dependent) | `driftGuard.test.ts` (named tests, orchestrator) | beyond-tolerance → `eligibility[kind].pretextEligible = false` + exactly one `runtime-guard-downgrade` diagnostic with `kind-downgraded === "paragraph"` | ✓ PASS (behaviorally proven) |
| Sole `@chenglou/pretext` import site | `rg -c 'from "@chenglou/pretext"' src/` | 1 match (textMeasurer.ts) | ✓ PASS |
| `@chenglou/pretext` pinned exact 0.0.8 (V12) | `grep pretext package.json` | `"@chenglou/pretext": "0.0.8"` (no caret/tilde) | ✓ PASS |
| All 6 DiagnosticEvent kinds defined (D3-05) | node script over types.ts | drift-exceedance, dom-fallback, late-epoch-drop, calibration-failure, runtime-guard-downgrade, measurement-error all present as `z.literal(...)` | ✓ PASS |
| Fingerprint covers all 3 engines × font × spacing | node script over fingerprint.json | chromium+firefox+webkit each have 36 variants spanning fonts={serif,sans,dyslexic} × spacings={compact,comfortable,spacious} | ✓ PASS |
| D3-10 regression gate exit code path | grep `process.exit(1)` fingerprint.compare.ts | present at L269 with REGRESSION log message | ✓ PASS |

### Probe Execution

N/A — Phase 3 has no `scripts/*/tests/probe-*.sh` probes. The `npm run calibrate` npm script (a Playwright harness + Node compare chained command) is the analogous phase-gate; orchestrator-confirmed PASSED (3 engines, 2592 samples, D3-10 gate exit 0). Per verification contract, I trusted the orchestrator's calibrate run rather than re-running (the committed `calibration/fingerprint.json` is the durable evidence — 9125 lines with the documented 216/216 + 216/216 + 156/216 heading eligibility split that matches the SUMMARY's claimed outcome exactly).

### Requirements Coverage

| Req | Source Plan(s) | Description | Status | Code Evidence | Test Evidence |
|-----|---------------|-------------|--------|---------------|---------------|
| PAGE-06 | 03-01 | Reader can continue using the last valid view while a newer pagination result is being computed | ✓ SATISFIED | `useMeasurement.ts:63` trustedView state + `engine.ts:164` commit guard; `ArticleView.tsx:103` mounts the hook | `tests/e2e/measurement/last-valid-view.spec.ts` (chromium + firefox + webkit); `tests/unit/measurement/epoch.test.ts` |
| PAGE-07 | 03-01 | Stale pagination work cannot replace a result produced for newer constraints | ✓ SATISFIED | `engine.ts:164-172` late-epoch-drop commit guard; `epoch.ts:44-59` monotonic counter + AbortController | `tests/unit/measurement/epoch.test.ts` (unit invariant); `tests/e2e/measurement/stale-drop.spec.ts` (e2e race × 3 engines) |
| PAGE-08 | 03-02 | The measurement layer is calibrated against browser-rendered fixtures across supported engines before any Pretext.js fast path is enabled | ✓ SATISFIED | `calibration/fingerprint.json` committed 2592-sample baseline; `textMeasurer.ts` sole Pretext import; `driftGuard.ts` runtime downgrade; `fingerprint.compare.ts:269` CI gate | `tests/e2e/calibration/calibration.harness.spec.ts` (D3-08 harness); `tests/e2e/calibration/fingerprint.compare.ts` (D3-10 gate); `tests/unit/measurement/{textMeasurer,driftGuard}.test.ts` |

**Requirements totals:** 3/3 SATISFIED with automated evidence. **No orphaned requirements** — REQUIREMENTS.md traceability table maps exactly PAGE-06/PAGE-07/PAGE-08 to Phase 3; PLAN frontmatters claim exactly these three IDs (Plan 01: PAGE-06, PAGE-07; Plan 02: PAGE-08). All three are also marked `[x]` complete in REQUIREMENTS.md L43-45.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | No `TBD`/`FIXME`/`XXX`/`HACK`/`PLACEHOLDER` markers in any Phase 3 source or test file (rg-verified across `src/measurement/`, `tests/unit/measurement/`, `tests/e2e/measurement/`, `tests/e2e/calibration/`) | ℹ️ Info | Clean |
| `src/measurement/useMeasurement.ts:89` | L89 | comment mentions "placeholder" describing the legitimate empty-fingerprint fallback scenario (NOT a stub marker — describes the safe DOM-only seed behavior) | ℹ️ Info | Informational, not a stub |
| `tests/e2e/calibration/fingerprint.compare.ts:181` | L181 | "Placeholder fingerprint" appears in the `buildRationale` template string for the empty-results branch (legitimate copy for the no-data state, not a stub) | ℹ️ Info | Informational, not a stub |

No empty handlers (`=> {}`), no console.log-only implementations, no `return null` stubs, no hardcoded empty data flows in any source artifact. The `trustedView` initial state `useState<MeasurementResult | null>(null)` (useMeasurement.ts L63) is correctly overwritten by real engine commits — not a stub.

### Cross-Plan Integration

**Vertical slice connected across 2 plans — no orphaned seams:**

- **Plan 01 → 02 (engine refinement):** Plan 01 ships `chooseStrategy` returning `"dom"` for every kind with the exhaustive switch + DEFAULT_ELIGIBILITY both-false. Plan 02 refines the same switch to return `eligibility[kind].pretextEligible ? "pretext" : "dom"` for paragraph/heading (engine.ts L348-351) — same Pattern F discipline, no default fallthrough. ✓
- **Plan 01 → 02 (diagnostic substrate):** Plan 01 defines all 6 DiagnosticEvent kinds in the Zod union (types.ts L128-135). Plan 02 adds emission for `runtime-guard-downgrade` (driftGuard.ts L125). ✓ (See note below on 3 unequipped kinds.)
- **Plan 02 → Phase 4 (PAGE-09 consumer):** `DiagnosticBus.recent()` (diagnostics.ts L69) is the Phase 4 inspection seam; `trustedView` (useMeasurement.ts L63) is the Phase 4 paginated-render source. Both are produced + retained; Phase 4 will consume without retrofitting the engine. ✓
- **ArticleView integration:** Mounts both `useScrollSave` (Phase 2) and `useMeasurement` (Phase 3) side-by-side at L92 + L103; both hooks no-op during article loading; both clean up on article swap/unmount. ✓
- **D3-04 status-region discipline:** Grep confirmed — `trustedView` is NOT referenced inside the `.status` live region anywhere in ArticleView. Phase 2's storage/restore copy continues to own that region. ✓

**Note on 3 unequipped DiagnosticEvent kinds (informational, not a gap):** the 03-02 SUMMARY L252-253 states "New DiagnosticEvent kinds emitted (completing the D3-05 union from Plan 01): drift-exceedance, dom-fallback, calibration-failure, runtime-guard-downgrade (emission sites now exist...)". Repo grep confirms only `runtime-guard-downgrade` has an actual emission site (driftGuard.ts L125). `drift-exceedance`, `dom-fallback`, `calibration-failure` are **defined in the schema** (types.ts L94, L99, L111) but have **no emission site** anywhere in `src/` or `tests/`. This is a SUMMARY overstatement, NOT a must-have failure — the binding D3-05 contract (per Plan 01 L86-92 + Plan 02 L252) is "all six kinds are defined in the union now so Phase 4 extends emission, not the shape", and that contract holds (all 6 kinds are Zod-defined; DiagnosticBus validates any of them at the emit boundary). Phase 4 PAGE-09 will equip the remaining emission sites when it builds the surfacing UI.

### Human Verification Required

### 1. Visual continuity across a forced late font swap (PAGE-06)

**Test:** Load a fixture (e.g. `essay-long-form`). Force a late `@font-face` load (e.g. inject a `@font-face` rule with a delayed network response, or use DevTools to slow the network and reload with a real web font). Observe the article body across the swap moment while the engine's font gate (D3-06) waits for the new font to settle and recomputes.

**Expected:** The scrolling article body stays painted continuously (no blank frame); typography reflows calmly; the previously-rendered text remains visible until the post-swap re-measure commits. No jarring churn. (In scrolling mode the visible payoff is subtle — the contract's full payoff lands in Phase 4's paginated mode where the trusted view IS the rendered surface. Phase 3 proves the contract mechanically; this manual check is the aesthetic judgment.)

**Why human:** "Visual churn"/"calmness" is a design judgment, not automatable. The e2e suite proves the article element never loses children and h1/first-paragraph stay `toBeVisible()` across a resize cycle, and that no `pageerror` leaks — but forcing a real late web-font load and judging the aesthetic quality of the swap moment requires human eyes on a real browser. The current Phase 2 font stack is system-only (`document.fonts.ready` resolves near-instantly), so the contract is exercised mechanically but its visible font-swap manifestation is human-only. (03-VALIDATION.md §Manual-Only row 1.)

### Gaps Summary

**No code gaps.** All 3 ROADMAP Success Criteria verified. All 8 plan-level must-have truths verified (4 per plan). All 14 artifacts exist, are substantive (no stubs), and are wired (no orphaned seams). All 6 key links wired. All 3 requirements (PAGE-06/PAGE-07/PAGE-08) SATISFIED with code + test evidence. No blocker anti-patterns. All behavior-dependent truths have at least one passing behavioral test (unit or e2e).

The 1 manual-only UAT item (visual continuity across a forced font swap) is the end-of-phase human verification that the GSD workflow routes through `verify-work`. It is intentionally manual per `03-VALIDATION.md` §Manual-Only and does NOT block the phase's automated contract — the staleness, font-gate, calibration, and CI-gate invariants are all mechanically proven.

### Phase 04 Readiness

**Phase 03 is technically complete** pending human ack of the 1 manual UAT item. All automated checks pass:

- **296/296** unit + component tests green (incl. 5 new measurement test files: epoch, fontGate, diagnostics, textMeasurer, driftGuard)
- **144/144** e2e tests green across chromium + firefox + webkit (incl. 2 new measurement specs × 3 engines)
- `npm run calibrate` PASSED — 3 engines, 2592 samples, D3-10 gate exit 0; committed `calibration/fingerprint.json` is the PAGE-08 evidence
- `npx tsc --noEmit` clean; `npm run lint` clean
- All 3 ROADMAP Phase 3 Success Criteria verified with code + behavioral evidence
- All 3 mapped requirements (PAGE-06/PAGE-07/PAGE-08) satisfied
- All D3-0x design decisions honored (D3-01 per-kind gate, D3-02 height+break tolerance, D3-03 Pretext-primary-where-validated with DOM fallback, D3-04 invisible, D3-05 6-kind substrate, D3-06 font gate, D3-07 cancel-in-flight, D3-08 runtime guard, D3-09 6-fixture corpus, D3-10 CI gate)
- V5 (Zod boundary validation), V7 (error classification), V12 (pin-exact + no postinstall) all hold
- The 6-kind `DiagnosticEvent` union is defined in full; Phase 4 PAGE-09 extends emission without retrofitting the shape
- `trustedView` (useMeasurement.ts L63) is produced + retained; Phase 4 paginated mode will consume it as its render source

**Recommended next step:** Human acknowledges the 1 manual UAT item (force a late font swap, confirm calm visual continuity). On human ack, advance to Phase 04 (Responsive Pagination and Dual-Mode Navigation), which consumes this trustworthy measurement substrate as its pagination engine's input.

---

_Verified: 2026-08-05T17:30:00Z_
_Verifier: the agent (gsd-verifier) — initial verification_
