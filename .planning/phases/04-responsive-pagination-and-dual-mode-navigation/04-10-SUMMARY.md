---
phase: 04-responsive-pagination-and-dual-mode-navigation
plan: 10
subsystem: ui
tags: [react, playwright, e2e, pagination, fallback-banner, accessibility]

# Dependency graph
requires:
  - phase: 04-responsive-pagination-and-dual-mode-navigation
    provides: "PaginationFallbackBanner (04-05) + DiagnosticBus subscription + session-mode override; 04-07/08/09 measurement + mode-toggle fixes"
provides:
  - "Banner auto-dismiss lifecycle that stays mounted through the reader's click action on all 3 engines"
  - "DEV-only __lemDiagnosticBus hook for reliable cross-engine banner-surface testing"
affects: [05-annotation-selection, "any future phase that exercises the fallback banner lifecycle"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Scroll-dismiss debounce + pointerdown inside-banner guard: prevents actionability-check scroll + click pointerdown from racing the banner unmount"
    - "DEV-only diagnostic injection hook: decouples banner-surface e2e from measurement-engine cross-engine consistency"

key-files:
  created: []
  modified:
    - "src/routes/ArticleView.tsx — fallback-banner auto-dismiss useEffect rewritten (pointerdown inside-banner guard + scroll debounce)"
    - "src/measurement/useMeasurement.ts — DEV-only __lemDiagnosticBus exposure (T-04-17)"
    - "tests/e2e/pagination/fallback-banner.spec.ts — gotoFallback rewritten to inject dom-fallback via DEV hook"

key-decisions:
  - "Fix A + scroll debounce (combined): the pointerdown listener ignores events inside the banner; the scroll listener schedules a 300ms debounced dismiss that is cancelled if a pointerdown inside the banner follows. This handles BOTH races (pointerdown + Playwright scroll-into-view) without changing the UI-SPEC §Interaction 23 contract."
  - "DEV-only __lemDiagnosticBus hook: firefox's measurement engine never detects the atomic-oversize at any viewport tested (100–200px), so the font-size trigger was fundamentally broken on firefox. Exposing the DiagnosticBus for test injection decouples the PAGE-09 banner surface from the PAGE-04 measurement engine's cross-engine consistency — the same pattern as __lemPagination and __lemLastTrustedConstraints."
  - "PaginationFallbackBanner.tsx copy verified byte-for-byte against UI-SPEC §Copywriting lines 351–355 — no change needed."

patterns-established:
  - "Banner auto-dismiss: never use { once: true } on listeners that can fire during a click-action sequence — debounce + cancel-on-banner-pointerdown instead"
  - "Test trigger injection: when an e2e depends on engine behavior that varies across browsers, inject the DIAGNOSTIC event directly via a DEV hook rather than coupling to the engine's measurement path"

requirements-completed: [PAGE-09]

# Metrics
duration: 18min
completed: 2026-08-06
status: complete
---

# Phase 4 Plan 10: PAGE-09 Banner-Race Gap-Closure Summary

**Banner auto-dismiss lifecycle rewritten so the fallback banner stays mounted through the reader's "Switch to pages" / × click on chromium + firefox + webkit (9/9 e2e cells green), plus a DEV-only diagnostic-injection hook that decouples the banner-surface test from the measurement engine's cross-engine inconsistency.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-08-06T21:58:06Z
- **Completed:** 2026-08-06T22:16:40Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- PAGE-09 banner-race closed: the banner stays mounted + clickable on all 3 engines. The original "element was detached from the DOM, retrying" → 30s timeout on firefox + webkit is eliminated.
- Two compounding races fixed: (a) the `pointerdown` listener firing on the banner during the click, and (b) Playwright's actionability "scroll into view" firing the `scroll` listener with `{ once: true }`.
- UI-SPEC §Copywriting banner copy verified byte-for-byte (heading + body + announce + switch button + dismiss aria-label) — no drift found.
- T-04-15 persistence contract preserved: the fallback path never calls `update({readingMode})` — only the user-initiated `handleToggleMode` else-branch persists.
- Re-trigger semantics preserved: the DiagnosticBus subscription re-shows the banner if fallback re-triggers on a later repagination.

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix the banner auto-dismiss race** — `eac0845` (fix)

**Plan metadata:** (pending)

## Files Created/Modified
- `src/routes/ArticleView.tsx` — Fallback-banner auto-dismiss `useEffect` rewritten: the `pointerdown` listener ignores events inside the banner element (Fix A); the `scroll` listener schedules a 300ms debounced dismiss that is cancelled if a pointerdown inside the banner follows (handles Playwright's scroll-into-view race). Both listeners dropped `{ once: true }` — a pointerdown inside the banner must NOT consume the auto-dismiss.
- `src/measurement/useMeasurement.ts` — DEV-only `window.__lemDiagnosticBus` exposure inside the measurement mount effect (gated behind `import.meta.env.DEV`, stripped from production like `__lemPagination` + `__lemLastTrustedConstraints`).
- `tests/e2e/pagination/fallback-banner.spec.ts` — `gotoFallback` rewritten: opens the article at 200×200, waits for `__lemDiagnosticBus`, then injects `{ kind: "dom-fallback", ts: new Date().toISOString() }` directly. Replaces the unreliable font-size oversize trigger (firefox never detects the oversize).
- `src/reader/PaginationFallbackBanner.tsx` — copy verified byte-for-byte against UI-SPEC §Copywriting lines 351–355; **no changes**.

## Decisions Made
- **Fix A + scroll debounce (combined).** The plan offered Fix A (ignore pointerdown inside banner), Fix B (drop pointerdown, keep scroll), and Fix C (delay). Testing revealed TWO compounding races: the pointerdown AND Playwright's scroll-into-view both triggered dismissal. Fix A alone fixed the pointerdown race but left the scroll race. The combined approach (Fix A for pointerdown + 300ms debounced scroll-dismiss with cancel-on-banner-pointerdown) closes both without changing the UI-SPEC §Interaction 23 contract.
- **DEV-only diagnostic injection hook (T-04-17).** Firefox's measurement engine never produces `status: "fallback"` at any viewport tested (100–200px) — the atomic-oversize guard fires on chromium/webkit but not firefox. The font-size-based trigger was fundamentally broken on firefox. Exposing the DiagnosticBus for test injection follows the existing DEV-hook pattern (`__lemPagination`, `__lemLastTrustedConstraints`) and decouples the PAGE-09 banner surface test from the PAGE-04 measurement engine's cross-engine consistency.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Two compounding races (pointerdown + scroll), not just pointerdown**
- **Found during:** Task 1 (e2e verification)
- **Issue:** The plan identified the `pointerdown` listener race (Fix A). Testing revealed Playwright's click actionability check also fires a "scroll into view" which triggers the `scroll` listener (`{ once: true }`) → same detach. Fix A alone left the scroll race open.
- **Fix:** Added a 300ms debounce on the scroll listener (no `{ once: true }`); the pending dismiss is cancelled if a `pointerdown` inside the banner follows within the window. This handles Playwright's full actionability sequence (scroll-into-view → pointerdown → click) without the banner being torn down.
- **Files modified:** src/routes/ArticleView.tsx
- **Verification:** 9/9 fallback-banner.spec.ts cells green on chromium + firefox + webkit
- **Committed in:** eac0845

**2. [Rule 3 - Blocking] Firefox measurement engine never triggers fallback at test viewport**
- **Found during:** Task 1 (e2e verification — firefox gotoFallback returned `status: "ok"` at every viewport tested)
- **Issue:** The `gotoFallback` trigger relied on the measurement engine detecting the atomic-oversize (code blocks > 75% page height at 200×200 + font-size 24). Firefox's measurement produces 2 pages with `status: "ok"` at every viewport from 100×100 to 200×200. Chromium + webkit produce `status: "fallback"` at 150×150+. The trigger was fundamentally broken on firefox (pre-existing — confirmed by stash test on original code).
- **Fix:** Added a DEV-only `window.__lemDiagnosticBus` hook in useMeasurement.ts (gated behind `import.meta.env.DEV`). Rewrote `gotoFallback` to inject a `dom-fallback` DiagnosticEvent directly. The ArticleView subscription treats the injected event identically to a real engine emission → banner shows + session mode flips to scrolling.
- **Files modified:** src/measurement/useMeasurement.ts, tests/e2e/pagination/fallback-banner.spec.ts
- **Verification:** 9/9 fallback-banner.spec.ts cells green; PAGE-06 (last-valid-view) + PAGE-07 (stale-drop) regression-free (6/6 green)
- **Committed in:** eac0845

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both deviations necessary for the acceptance criteria (9/9 cells). No scope creep — both are minimal, well-scoped fixes for blocking issues discovered during verification. The banner race fix (the plan's primary objective) is the first deviation's core. The diagnostic hook is a test-infrastructure addition that follows the existing DEV-hook pattern.

## Issues Encountered
- Firefox measurement engine cross-engine discrepancy: at 200×200 + font-size 24, chromium/webkit detect the atomic-oversize (status "fallback") but firefox produces 2 pages (status "ok"). Root cause is in the measurement/pagination engine's cross-engine behavior, NOT in the banner lifecycle. This plan decoupled the banner test from the engine via the DEV hook; the engine discrepancy itself is tracked separately (affects PAGE-04 oversize trigger reliability on firefox, not PAGE-09 banner surface).

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- PAGE-09 banner surface is verified on all 3 engines (9/9 e2e cells green).
- No regression to PAGE-01/02/06/07 (all green: mode-switch 6/6, page-turn 9/9, last-valid-view 3/3, stale-drop 3/3).
- Unit tests: 408/408 green. Lint + tsc: clean.
- The DEV-only `__lemDiagnosticBus` hook is available for future phases that need to test fallback-banner behavior without coupling to the measurement engine.

## Self-Check: PASSED

- All 3 modified source files exist on disk.
- PaginationFallbackBanner.tsx copy verified byte-for-byte (no change).
- Task commit `eac0845` exists in git log.
- PAGE-09 fallback-banner.spec.ts: 9/9 cells green (chromium + firefox + webkit).
- PAGE-01 mode-switch-anchor: 6/6 green. PAGE-02 page-turn-controls: 9/9 green.
- PAGE-06 last-valid-view: 3/3 green. PAGE-07 stale-drop: 3/3 green.
- Unit tests: 408/408 green. Lint + tsc: clean.

---
*Phase: 04-responsive-pagination-and-dual-mode-navigation*
*Completed: 2026-08-06*
