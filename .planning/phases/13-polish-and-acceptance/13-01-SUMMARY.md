---
phase: 13-polish-and-acceptance
plan: 01
subsystem: settings
tags: [fouc, localstorage, settings-mirror, inline-script, playwright, vitest]

# Dependency graph
requires:
  - phase: 02-settings
    provides: ReaderSettingsSchema, SettingsContext debounced-save path, applyTheme token writes, STATE-05 recovery routing
provides:
  - "localStorage settings mirror seam (settingsMirror.ts) — read/write/clear of the full ReaderSettings record under 'lem-settings-mirror-v1'"
  - "Inline pre-React paint-hint script in index.html (D13-01) writing data-theme + 6 typography tokens before React mounts"
  - "SettingsContext mirror wiring: lazy-init, save-riding mirror writes, hydrate self-correct, wipe clear"
  - "SC#1 cold-load no-snap e2e (2 tests × 3 engines) + mirror unit suite (18 tests) + index.html↔tokens.ts sync drift guard"
affects: [13-02 first-paint-progress, 13-04 chrome polish, phase-13 acceptance records]

# Tech tracking
tech-stack:
  added: []  # zero new packages (plan prohibition)
  patterns:
    - "FOUC mirror remedy: pre-React inline script (token copies between extraction markers) + React lazy-init writing byte-identical values"
    - "addInitScript MutationObserver timeline recorder for first-paint regression testing (plain-JS content — serialized functions must not carry TS syntax)"
    - "about:blank hop to force a true cold-load navigation (hash-only goto is same-document; init scripts never run)"

key-files:
  created:
    - src/settings/settingsMirror.ts
    - tests/unit/settings/mirror.test.ts
    - tests/e2e/polish/cold-load-no-snap.spec.ts
  modified:
    - index.html
    - src/settings/SettingsContext.tsx
    - tests/component/SettingsContext.test.tsx

key-decisions:
  - "Mirror key 'lem-settings-mirror-v1' carries ALL settings in one record (D13-02); read is Zod-at-read null-on-doubt, write/clear are silent no-ops on any failure (Pitfall 4)"
  - "On STATE-05 storage failure the provider keeps whatever the lazy-init painted (mirror values if a valid mirror exists) — 13-RESEARCH Pitfall 3 sanctions 'keep what's painted, no second flash'; recovery UI still routes from loadSettings's reason only"
  - "Hydrate self-correct rewrites the mirror immediately on divergence (RESEARCH OQ2 resolution) — also seeds the mirror on first successful hydration, so a post-wipe reload converges to defaults in the mirror"
  - "Inline script gates every token through enum/number maps (THEMES/FONT_STACKS/SPACING_PRESETS membership + isFinite checks); unknown key skips that single write — worst case a default-looking token, never an arbitrary value (T-13-01/T-13-03)"

patterns-established:
  - "Inline token copies in index.html live between // tokens:<NAME>:start/end markers; tests/unit/settings/mirror.test.ts extracts and compares them to tokens.ts (A2 drift guard)"
  - "Prose in source/test files must not contain greppable forbidden tokens (innerHTML etc.) — comments reworded so acceptance greps return 0 (08-04 precedent)"

requirements-completed: [POLISH-01]

# Metrics
duration: 16 min
completed: 2026-08-19
status: complete
---

# Phase 13 Plan 01: Settings-Flash Mirror Summary

**localStorage settings mirror + inline pre-React paint-hint script + SettingsContext lazy-init kill the cold-load settings flash (POLISH-01), proven by a MutationObserver no-snap e2e on all 3 engines**

## Performance

- **Duration:** 16 min
- **Started:** 2026-08-19T01:34:56Z
- **Completed:** 2026-08-19T01:51:08Z
- **Tasks:** 3
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments
- Mirror seam (`settingsMirror.ts`): full-record mirror under `lem-settings-mirror-v1`, Zod-at-read with null-on-doubt, silent no-op writes/clears — never classified, never surfaced (Pitfall 4)
- Inline pre-React script in `index.html` writes the same tokens `applyTheme` writes (data-theme + 6 custom properties) before React mounts; fails silent to the CSS literal fallbacks
- SettingsContext: lazy-init from mirror (mount applyTheme is byte-identical to the inline script — Pitfall 2), mirror writes ride scheduleSave/flushSave, hydrate-diff self-correct, `resetLocalData` clears the mirror (Pitfall 1); `loadSettings`/`classifyStorageError` untouched (Pitfall 3)
- SC#1 proven in real browsers: first record carries persisted dark/22px, zero flip anywhere in the timeline, scrolling surface from the first article paint — 6/6 cells green on chromium/firefox/webkit; wipe leaves no zombie mirror

## Task Commits

Each task was committed atomically:

1. **Task 1: Mirror seam module + unit tests (TDD)** — `120a2d3` (test: RED) + `fe324a0` (feat: GREEN)
2. **Task 2: Inline pre-React script + SettingsContext seams + token sync test** — `760572e` (feat)
3. **Task 3: Cold-load no-snap e2e (SC#1)** — `173b38b` (test)

_TDD gate: Task 1 followed RED (13 behaviors failing on missing module) → GREEN (13/13 pass). No refactor needed._

## Files Created/Modified
- `src/settings/settingsMirror.ts` — the single localStorage seam: SETTINGS_MIRROR_KEY, readSettingsMirror, writeSettingsMirror, clearSettingsMirror
- `index.html` — inline pre-React paint-hint script (unnamed IIFE; marker-comment token copies; setProperty/dataset only)
- `src/settings/SettingsContext.tsx` — lazy-init initializer, mirror writes in scheduleSave/flushSave, hydrate self-correct, clearSettingsMirror in resetLocalData
- `tests/unit/settings/mirror.test.ts` — 6 seam behaviors (13 tests) + sync-check describe (5 tests: ordering, no-markup-APIs, key read, FONT_STACKS equality, SPACING_PRESETS equality)
- `tests/e2e/polish/cold-load-no-snap.spec.ts` — SC#1 no-snap + wipe no-zombie, 2 tests × 3 engines
- `tests/component/SettingsContext.test.tsx` — per-test localStorage isolation + new keep-mirror-on-STATE-05 contract test

## Decisions Made
- **Keep-mirror-on-STATE-05**: on a Dexie failure the provider keeps the mirror-painted settings instead of snapping to defaults (no second flash; research-sanctioned planner choice). Pinned by a new component test.
- **Hydrate self-correct seeds a missing mirror**: first successful hydration writes the mirror even when absent (convergence invariant); noted in the wipe e2e — post-wipe reload may re-seed defaults into the mirror, and the zombie check asserts the dead record never returns.
- **Token gating in the inline script**: full enum/number map membership checks; unknown key skips the single write (T-13-01 mitigation as planned).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SettingsContext component tests failed after the lazy-init change**
- **Found during:** Task 2 (full unit suite run)
- **Issue:** The hydrate test's new mirror self-correct write leaked into later STATE-05 tests via jsdom localStorage; assertions expected DEFAULT_SETTINGS but the lazy-init carried the leaked mirror record
- **Fix:** Added per-test `window.localStorage.clear()` to the file's beforeEach (test isolation), plus a new test pinning the intended keep-mirror-on-STATE-05 contract
- **Files modified:** tests/component/SettingsContext.test.tsx
- **Verification:** Full unit suite 1181 passed / 0 failed (13 intentional skips); tsc clean
- **Committed in:** 760572e (Task 2 commit)

**2. [Rule 1 - Bug] e2e init-script recorder silently never ran**
- **Found during:** Task 3 (first e2e run)
- **Issue:** (a) the serialized init-script function contained TypeScript casts → SyntaxError at browser evaluation; (b) `goto` from the library URL to a hash-only article URL is a same-document navigation — no page load, no init scripts, no cold load
- **Fix:** Recorder rewritten as plain-JS string content; `about:blank` hop before the article goto forces a true cold-load navigation
- **Files modified:** tests/e2e/polish/cold-load-no-snap.spec.ts
- **Verification:** 6/6 cells green on chromium/firefox/webkit
- **Committed in:** 173b38b (Task 3 commit)

**3. [Rule 3 - Blocking] Acceptance grep matched forbidden words in comments**
- **Found during:** Task 2 (acceptance verification)
- **Issue:** The plan's `grep -c 'innerHTML|insertAdjacentHTML|outerHTML' index.html` must return 0, but my security comment named the APIs in prose; same for `waitForTimeout` in the e2e header comment
- **Fix:** Reworded both comments (08-04 precedent — prose avoids the greppable token)
- **Files modified:** index.html, tests/e2e/polish/cold-load-no-snap.spec.ts
- **Verification:** both greps return 0
- **Committed in:** 760572e / 173b38b

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** All fixes necessary for green gates; no scope creep. Zero production-code behavior beyond the planned seams (the keep-mirror STATE-05 choice is the research-sanctioned option and is now test-pinned).

## Issues Encountered
None beyond the deviations above.

## Verification Results
- `npx vitest run tests/unit/settings/mirror.test.ts` — 18/18 passed
- `npx vitest run` (full unit suite) — 1181 passed / 0 failed / 13 intentional skips
- `npx tsc --noEmit` — clean
- `npx playwright test tests/e2e/polish/cold-load-no-snap.spec.ts` — 6/6 passed (chromium, firefox, webkit)
- `npx playwright test tests/e2e/typography-live-apply.spec.ts tests/e2e/persistence.spec.ts` — 24/24 passed (regression, 3 engines)
- Prohibitions: `grep -c 'innerHTML\|insertAdjacentHTML\|outerHTML' index.html` → 0; `rg -c waitForTimeout` on the new spec → 0; package.json/lock byte-unchanged across the plan's commits; `src/persistence/settingsStore.ts` + `src/settings/applyTheme.ts` byte-unchanged

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- POLISH-01 closed; the mirror seam + inline-script pattern is ready for 13-02 (first-paint progress) and 13-04 (chrome polish) to build on
- Note for later plans: the hydrate self-correct seeds a missing mirror on first successful hydration (defaults) — harmless, but specs asserting a null mirror must check immediately after a wipe, before reload+hydration (the wipe e2e documents this)

## Self-Check: PASSED

All 4 key files exist on disk; all 5 plan commits (120a2d3, fe324a0, 760572e, 173b38b, da34676) present in git log.

---
*Phase: 13-polish-and-acceptance*
*Completed: 2026-08-19*
