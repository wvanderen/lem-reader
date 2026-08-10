---
phase: 03-trustworthy-layout-measurement
plan: 01
subsystem: measurement
tags: [staleness, epoch, abortcontroller, document-fonts-ready, zod, resizeobserver, react-hooks, playwright]

# Dependency graph
requires:
  - phase: 02-accessible-scrolling-reader
    provides: SettingsContext (live typography trigger source), useScrollSave (hook role-match analog), ArticleView callback-ref + state seam
provides:
  - "src/measurement/ staleness-safe measurement pipeline (Epoch + AbortController + font gate + DOM measurer + trigger coalescer + engine + hook)"
  - "DiagnosticEvent 6-kind versioned shape (D3-05) — Phase 4 PAGE-09 consumes without retrofitting"
  - "PAGE-06 last-valid-view retention hook (useMeasurement) mountable by ArticleView"
  - "PAGE-07 commit-guard drop with diagnostic emission (late-epoch-drop, measurement-error)"
affects: [03-02-calibration-and-pretext-fast-path, 04-responsive-pagination, 09-paginated-reader-ui]

# Tech tracking
tech-stack:
  added: []  # No new deps — Pretext is Plan 02's add
  patterns:
    - "Epoch class (monotonic counter + AbortController) — structured upgrade of ArticleView's cancelled-flag pattern"
    - "Font gate via Promise.race(fonts.ready, abort) — mid-flight cancel never hangs on a never-resolving font promise"
    - "DiagnosticBus pub-sub with V5 Zod validation at the emit boundary + in-memory ring buffer"
    - "TriggerCoalescer: ResizeObserver + addEventListener('loadingdone') + figure load capture + settings-change bridge"
    - "Exhaustive switch over block kinds with NO default (Pattern F) — TS flags missing cases at compile time"

key-files:
  created:
    - src/measurement/types.ts
    - src/measurement/epoch.ts
    - src/measurement/fontGate.ts
    - src/measurement/diagnostics.ts
    - src/measurement/domMeasurer.ts
    - src/measurement/triggers.ts
    - src/measurement/engine.ts
    - src/measurement/useMeasurement.ts
    - tests/unit/measurement/epoch.test.ts
    - tests/unit/measurement/fontGate.test.ts
    - tests/unit/measurement/diagnostics.test.ts
    - tests/e2e/measurement/stale-drop.spec.ts
    - tests/e2e/measurement/last-valid-view.spec.ts
  modified:
    - src/routes/ArticleView.tsx
    - tests/setup.ts
    - tests/component/ArticleView.test.tsx

key-decisions:
  - "Font trigger via addEventListener('loadingdone'), NOT a polling re-await loop — the loop hot-looped on already-resolved font promises and starved the event loop; the EVENT form is Baseline per MDN (the onloadingdone PROPERTY form is not). Engine's awaitFontsReady remains the authoritative D3-06 readiness gate."
  - "awaitFontsReady uses Promise.race(document.fonts.ready, abortPromise) — required so a never-resolving font promise still surfaces a mid-flight abort as AbortError instead of hanging."
  - "DEV-only window.__lemLastTrustedConstraints debug hook exposed under import.meta.env.DEV so the PAGE-07 e2e (stale-drop.spec.ts) can observe the latest committed Constraints without a production code path."
  - "ResizeObserver polyfill added to tests/setup.ts (mirrors the existing IntersectionObserver polyfill) — jsdom is not authoritative for layout; the real-browser e2e suite exercises the actual observer."
  - "fontsListenerAttached + document.fonts?.addEventListener guards in triggers.ts — jsdom does not implement document.fonts; without the guard, mounting ArticleView in a component test would crash."
  - "Epoch's private field is named epochCount (not current) so it can coexist with the public current() method without a TS duplicate-identifier error."

patterns-established:
  - "Epoch: a monotonic counter + AbortController is the structured staleness primitive for long-running measurement where multiple generations may race (cancelled-flag is the simpler form for short single-shot loads)."
  - "Commit-guard emit-and-drop: a late-epoch result emits a late-epoch-drop diagnostic and returns; the trusted view is retained (never silently swallowed)."
  - "V7 error classification in measurement: AbortError → silent cancel; everything else → measurement-error diagnostic; the reader is never blocked by a measurement failure."
  - "Exhaustive switch with NO default over Block kinds (Pattern F) — chooseStrategy returns dom for every kind in Plan 01; the Pretext branch lands in Plan 02."

requirements-completed: [PAGE-06, PAGE-07]

# Metrics
duration: 22 min
completed: 2026-08-05
status: complete
---

# Phase 3 Plan 01: Trustworthy Layout Measurement — Staleness-Safe Core Summary

**Staleness-safe measurement pipeline (epoch + AbortController + font gate + DiagnosticBus + DOM measurer + trigger coalescer + engine + React hook) wired into ArticleView, proving PAGE-06 (last-valid-view retention) + PAGE-07 (stale-epoch drop) end-to-end across chromium / firefox / webkit with DOM measurement as the strategy.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-08-05T13:35:58Z
- **Completed:** 2026-08-05T13:58:23Z
- **Tasks:** 3
- **Files modified:** 16 (8 new source + 5 new tests + 3 modified)

## Accomplishments

- **PAGE-07 (stale-work can never win)** proven at two layers: a unit invariant (`epoch.test.ts` — `isCurrent` is false for any earlier epoch after a newer bump) and an e2e race (`stale-drop.spec.ts` — three rapid viewport changes + three rapid typography changes inside the 400 ms debounce window; the committed trusted view reflects the FINAL `size: 24` and the final viewport, never an intermediate value).
- **PAGE-06 (last-valid-view retention)** proven by `last-valid-view.spec.ts` across all three engines: the article h1 + first paragraph stay visible continuously through a resize-triggered re-measure cycle; the `<article>` element never loses its child content; the `role="status"` live region is unchanged by measurement activity (D3-04).
- **D3-05 (versioned diagnostic substrate)** landed in its full 6-kind shape so Phase 4 PAGE-09 extends emission rather than the schema. Plan 01 emits `late-epoch-drop` (commit-guard drop) + `measurement-error` (V7 classification). Plan 02 will emit `drift-exceedance`, `dom-fallback`, `calibration-failure`, `runtime-guard-downgrade`.
- **D3-06 (font-readiness gate)** enforced inside `MeasurementEngine.run`: every pass awaits `document.fonts.ready` via a Promise.race against the abort signal so a mid-flight cancel never hangs on a never-resolving font promise.
- **D3-07 (cancel in-flight + replace under rapid change)** implemented via `Epoch.bump()` aborting the prior `AbortController` and incrementing the monotonic counter; only the newest epoch ever wins at the commit guard.
- **D3-04 (invisible by default)** — measurement writes nothing reader-visible. The `useMeasurement` hook retains `trustedView` in React state but ArticleView still renders `<ArticleBody>` directly (the paginated payoff is Phase 4's). The `.status` live region is reserved for consequential fallback.

## Task Commits

Each task was committed atomically:

1. **Task 1: Zod types + Epoch + FontGate + DiagnosticBus + unit invariants** — `1e36cc6` (feat)
2. **Task 2: DomMeasurer + TriggerCoalescer + MeasurementEngine + useMeasurement hook** — `2262f84` (feat)
3. **Task 3: Wire useMeasurement into ArticleView + PAGE-06/PAGE-07 e2e** — `66d606b` (feat)

_TDD mode was OFF for this run, so tasks landed as single feat commits (tests written first to confirm RED, then implemented to GREEN). Plan-level RED-commit gate did not trip._

## Files Created/Modified

**Created — `src/measurement/` domain module:**
- `types.ts` — Zod source of truth (`ConstraintsSchema`, `BlockMeasurementSchema`, `MeasurementResultSchema`, `EligibilityStateSchema`, `DiagnosticEventSchema` 6-kind discriminated union + inferred types).
- `epoch.ts` — `class Epoch` (bump / isCurrent / current) — structured upgrade of ArticleView's cancelled-flag pattern.
- `fontGate.ts` — `awaitFontsReady(signal)` via Promise.race + `class AbortError`.
- `diagnostics.ts` — `class DiagnosticBus` (emit / subscribe / recent) with V5 boundary validation + in-memory ring buffer.
- `domMeasurer.ts` — `measureAllBlocks(articleEl, signal)` reusing the exact selector from useScrollSave L99; fractional heights + per-line counts; read-phase isolated (Pitfall 2).
- `triggers.ts` — `class TriggerCoalescer` + `DEBOUNCE_MS=400`; observes ResizeObserver + figure load capture + addEventListener('loadingdone') + settings-change bridge.
- `engine.ts` — `class MeasurementEngine` (run / onTrusted / cancel) with the PAGE-07 commit guard + V7 catch path; `chooseStrategy` exhaustive switch with NO default.
- `useMeasurement.ts` — React hook binding engine → trustedView state; nullable-article no-op; coalescer in a ref so the settings effect can signal it without recreation.

**Created — tests:**
- `tests/unit/measurement/{epoch,fontGate,diagnostics}.test.ts` — 30 unit tests covering PAGE-07, D3-06, D3-05.
- `tests/e2e/measurement/{stale-drop,last-valid-view}.spec.ts` — 2 e2e specs × 3 engines = 6 real-browser proofs.

**Modified:**
- `src/routes/ArticleView.tsx` — mounts `useMeasurement(article, articleRef)`; ArticleBody stays the rendered surface; status region untouched.
- `tests/setup.ts` — added ResizeObserver polyfill for jsdom.
- `tests/component/ArticleView.test.tsx` — wraps renderings in `<SettingsProvider>` because ArticleView now mounts useMeasurement (which calls useSettings).

## Decisions Made

See `key-decisions` in frontmatter above. Highlights:

- **Font watcher: event-driven, not poll-driven.** A naive "re-await `document.fonts.ready` in a loop" caused a hot-loop on already-resolved promises (microtasks never yielded to the browser, starving the event loop AND constantly resetting the 400 ms debounce timer so the engine's onTrigger never fired). Switched to `addEventListener('loadingdone')` — the EVENT form is Baseline per MDN (only the `onloadingdone` PROPERTY form is limited availability). The engine's `awaitFontsReady` inside `run()` remains the authoritative D3-06 readiness check.
- **awaitFontsReady uses Promise.race.** Required so a never-resolving font promise still surfaces a mid-flight abort as AbortError. Without the race, the test for "aborts during the await" would hang forever.
- **Epoch private field is `epochCount`, not `current`.** TS disallows a private field and public method with the same name (both land on the instance key). Renamed the field; the public API (`bump`, `isCurrent`, `current`) matches the plan spec exactly.
- **DEV-only debug hook on `window.__lemLastTrustedConstraints`.** Lets the PAGE-07 e2e observe the latest committed Constraints without exposing internal state to production readers. Gated by `import.meta.env.DEV`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Fonts watcher hot-looped on already-resolved font promises**
- **Found during:** Task 3 (e2e verification)
- **Issue:** The plan's literal instruction to "re-await `document.fonts.ready` in a loop" caused an infinite microtask spin when fonts were already loaded (the typical case). Each iteration cleared + reset the 400 ms debounce timer, so the coalescer's `onTrigger` never fired and the engine never committed a trusted view. Symptom: the DEV debug hook `window.__lemLastTrustedConstraints` stayed undefined; all 6 e2e tests failed on initial run.
- **Fix:** Switched the fonts watcher from a polling loop to `document.fonts.addEventListener("loadingdone", ...)`. The EVENT form is Baseline per MDN; only the `onloadingdone` PROPERTY form is limited availability (RESEARCH §Anti-Patterns honors this — we use addEventListener, not the property). The engine's `awaitFontsReady` (which re-awaits `.ready` inside `run()`) remains the authoritative D3-06 readiness gate, so the "re-await after every trigger" intent is preserved at the engine layer.
- **Files modified:** `src/measurement/triggers.ts`
- **Verification:** All 6 e2e tests pass; the DEV debug hook now reflects the latest committed Constraints.
- **Committed in:** `66d606b` (Task 3 commit)

**2. [Rule 3 — Blocking] jsdom lacks `ResizeObserver` and `document.fonts`**
- **Found during:** Task 3 (running the existing component test suite)
- **Issue:** `TriggerCoalescer` constructs a `ResizeObserver` and calls `document.fonts.addEventListener` in its constructor. jsdom implements neither, so every component test rendering ArticleView (which now mounts `useMeasurement`) crashed with `ReferenceError: ResizeObserver is not defined` and `TypeError: Cannot read properties of undefined (reading 'addEventListener')`.
- **Fix:** (a) Added a `ResizeObserver` polyfill to `tests/setup.ts` mirroring the existing `IntersectionObserver` polyfill (records observed elements, never fires callbacks — the real measurement behavior is proven by the e2e suite in real browsers per Pitfall 2). (b) Added `typeof document.fonts?.addEventListener === "function"` guards in `triggers.ts` so the listener registration is a no-op in jsdom but live in real browsers.
- **Files modified:** `tests/setup.ts`, `src/measurement/triggers.ts`
- **Verification:** All 272 unit tests (including the 10 previously-failing ArticleView/App component tests) pass.
- **Committed in:** `66d606b` (Task 3 commit)

**3. [Rule 3 — Blocking] ArticleView component tests must wrap in SettingsProvider**
- **Found during:** Task 3 (running the existing component test suite)
- **Issue:** `useMeasurement` calls `useSettings()`, which throws if mounted outside `<SettingsProvider>`. The existing `tests/component/ArticleView.test.tsx` rendered `<ArticleView />` directly (ArticleView previously had no provider dependency), so every test failed with "useSettings must be used inside <SettingsProvider>".
- **Fix:** Added a `renderWithProvider()` helper that wraps renderings in `<SettingsProvider>`; updated all 7 tests in `ArticleView.test.tsx` to use it. App.test.tsx was unaffected (App already wraps its tree in the provider).
- **Files modified:** `tests/component/ArticleView.test.tsx`
- **Verification:** All 7 ArticleView component tests pass.
- **Committed in:** `66d606b` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking infrastructure)
**Impact on plan:** All auto-fixes necessary for the plan's own success criteria to hold in the test harness. No scope creep. The font-watcher switch preserves the plan's D3-06 intent (font-readiness gate is still enforced; only the trigger-source observation mechanism changed from polling to event-driven).

## Issues Encountered

- Initial e2e run failed for ALL specs (including the pre-existing `typography-live-apply.spec.ts`) because the fonts-watcher hot-loop froze the page before React could paint the h1. Root-caused via an in-process Playwright debug script that exposed `window.__lemLastTrustedConstraints === undefined` and zero engine `onTrigger` log entries. Fixed as Deviation #1 above.

## Authentication Gates

None — no external service interaction in this plan.

## User Setup Required

None — no external service configuration required. Measurement is fully local; no Pretext dependency is introduced in Plan 01.

## Threat Flags

No new security-relevant surface beyond what the plan's threat model anticipated. The DEV-only `window.__lemLastTrustedConstraints` debug hook is gated by `import.meta.env.DEV` (stripped in production builds by Vite) and exposes only Zod-validated Constraints (no untrusted data flows to it). The `DiagnosticEvent` V5 boundary validation (Zod-validated at emit AND consume) was implemented as specified — no additional threat surface.

## Next Phase Readiness

- **Plan 03-02 (calibration + Pretext fast path)** is unblocked: the engine's `chooseStrategy` exhaustive switch is wired to return `"dom"` for every kind, and `EligibilityState` defaults both paragraph + heading to `pretextEligible: false`. Plan 02 swaps the eligibility defaults to fingerprint-seeded values and adds `textMeasurer.ts` as the SOLE `@chenglou/pretext` import site.
- **The diagnostic substrate is ready for Phase 4 PAGE-09** without retrofitting: all 6 kinds are defined in the discriminated union; Plan 02 will emit `drift-exceedance` / `dom-fallback` / `calibration-failure` / `runtime-guard-downgrade`; Phase 4 builds the surfacing UI.
- **Blockers/concerns:** None for Plan 02. The font-watcher event-driven approach relies on `addEventListener('loadingdone')` being Baseline across the supported engine matrix — this is the case per MDN's FontFaceSet support table (Baseline-widely-available). If a future engine implementation regresses this, the engine's font gate still catches font-readiness inside `run()`.

## Self-Check: PASSED

**Files verified to exist on disk:**
- `src/measurement/types.ts` ✓
- `src/measurement/epoch.ts` ✓
- `src/measurement/fontGate.ts` ✓
- `src/measurement/diagnostics.ts` ✓
- `src/measurement/domMeasurer.ts` ✓
- `src/measurement/triggers.ts` ✓
- `src/measurement/engine.ts` ✓
- `src/measurement/useMeasurement.ts` ✓
- `tests/unit/measurement/{epoch,fontGate,diagnostics}.test.ts` ✓
- `tests/e2e/measurement/{stale-drop,last-valid-view}.spec.ts` ✓

**Commits verified in git log:**
- `1e36cc6` (feat 03-01 — Task 1) ✓
- `2262f84` (feat 03-01 — Task 2) ✓
- `66d606b` (feat 03-01 — Task 3) ✓

**Verification commands re-run:**
- `npm run test:unit -- --run` → 272/272 passed ✓
- `npx tsc --noEmit` → exit 0 ✓
- `npx playwright test tests/e2e/measurement/` → 6/6 passed (chromium + firefox + webkit) ✓
- `npx playwright test` (full suite) → 144/144 passed (no Phase 1/2 regression) ✓

**Plan-level success criteria:**
- PAGE-06 (no blank flash) — proven by `last-valid-view.spec.ts` across 3 engines ✓
- PAGE-07 (late epoch dropped) — proven by `epoch.test.ts` + `stale-drop.spec.ts` ✓
- D3-04 (invisible) — status live region unchanged by measurement ✓
- D3-05 (versioned substrate) — 6-kind union defined + Zod-validated; `late-epoch-drop` + `measurement-error` emitted ✓
- D3-06 (font gate) — proven by `fontGate.test.ts` ✓
- D3-07 (cancel in-flight) — `Epoch.bump` aborts prior `AbortController` ✓

---
*Phase: 03-trustworthy-layout-measurement*
*Completed: 2026-08-05*
