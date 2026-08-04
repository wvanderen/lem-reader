---
phase: 02-accessible-scrolling-reader
plan: 04
subsystem: ui
tags: [css-custom-properties, transform-origin, typography, live-apply, playwright, accessibility, gap-closure]

# Dependency graph
requires:
  - phase: 02-accessible-scrolling-reader (Plan 02-01)
    provides: ProgressHairline component + applyTheme live-apply writer + SettingsContext + SettingsPanel + app.css base typography rule + SettingsContext component test
  - phase: 02-accessible-scrolling-reader (Plan 02-03)
    provides: ProgressHairline mounted on ArticleView + progress.spec.ts e2e (4 prior tests)
provides:
  - ProgressHairline.tsx inline transformOrigin set to physical "left" (was invalid "inline-start" keyword)
  - app.css .progress-hairline-fill transform-origin: left (was invalid inline-start)
  - app.css SECOND body rule consumes --font-size / --line-height / --letter-spacing / --word-spacing via var() with literal first-paint fallbacks
  - applyTheme.ts routes font-size + line-height through --font-size / --line-height custom properties (no bare property writes); --letter-spacing / --word-spacing unchanged (now consumed)
  - tests/e2e/typography-live-apply.spec.ts NEW — real-browser proof the cascade reaches body text
  - tests/e2e/progress.spec.ts EXTENDED — computed transform-origin left-edge assertion
  - Updated component + unit test assertions to the corrected custom-property token names
affects: [Phase 3 (measurement — typography changes trigger re-measure), Phase 4 (pagination — body typography now controlled by custom properties), Phase 5 (annotations — body size changes affect selection geometry)]

# Tech tracking
tech-stack:
  added: [] # ZERO npm installs this plan (locked-stack gap closure)
  patterns:
    - CSS custom property cascade through var() with literal first-paint fallbacks (avoids FOUC before applyTheme runs)
    - transform-origin accepts only physical keywords (left|center|right|top|bottom) — no logical-keyword variants (inline-start / inline-end are NOT in its grammar)

key-files:
  created:
    - tests/e2e/typography-live-apply.spec.ts
  modified:
    - src/reader/ProgressHairline.tsx # inline transformOrigin: "left" + updated header rationale
    - src/settings/applyTheme.ts # routes font-size + line-height through --font-size / --line-height custom properties; header rationale
    - src/app.css # .progress-hairline-fill transform-origin: left; SECOND body rule consumes 4 typography custom properties via var()
    - tests/e2e/progress.spec.ts # added transform-origin left-edge computed-style test
    - tests/component/SettingsContext.test.tsx # readTokens + assertions moved to --font-size / --line-height custom-property names
    - tests/component/SettingsPanel.test.tsx # Reset-to-defaults assertion moved to --font-size
    - tests/unit/settingsSchema.test.ts # applyTheme assertions in BOTH it() blocks moved to --font-size / --line-height

key-decisions:
  - "transform-origin grammar excludes logical keywords: its keyword set is left|center|right|top|bottom plus lengths/percentages. The inline-start / inline-end values are NOT valid for transform-origin (they are valid for inset/margin/padding logical properties, which is the source of the confusion). Browsers silently ignore the unknown value and fall back to the initial 50% 50% (center) — that was why the hairline expanded from the middle."
  - "Physical `left` chosen for LTR English (UI-SPEC content language); a [dir=\"rtl\"] override to `right` is deferred to a future RTL support milestone. Do not rely on the unsupported inline-start keyword."
  - "Body rule var() fallbacks (18px / 1.6 / 0) are first-paint defaults: before applyTheme runs on SettingsProvider mount, the custom properties are unset and the body renders the D-07 warm-paper defaults. Once applyTheme runs (synchronously in the mount effect), var() substitution routes the live values through. No FOUC, no flash of wrong-sized text."
  - "Rule 1 deviation (auto-fixed): the plan only flagged tests/component/SettingsContext.test.tsx for the token-name move, but tests/component/SettingsPanel.test.tsx and tests/unit/settingsSchema.test.ts had the same bare-property assertions on applyTheme writes — both updated to the corrected custom-property token names."

patterns-established:
  - "Typography cascade contract: applyTheme writes custom properties on <html>; the body rule consumes them via var() with literal first-paint fallbacks (mirrors the working --font-body + --measure pattern). Never write a bare property the body rule will override."
  - "transform-origin keyword set is physical only (left|center|right|top|bottom); for inline-start-edge growth in LTR, use `left`. Add a [dir=\"rtl\"] override to `right` only when RTL support is in scope."

requirements-completed: [READ-02, READ-05]

# Metrics
duration: 5 min
completed: 2026-08-04
status: complete
---

# Phase 2 Plan 4: Gap Closure Summary

**Two surgical CSS/token-plumbing fixes (no installs, no features): progress hairline now grows left-to-right via the physical `left` transform-origin keyword (Gap 1), and text-size + spacing settings now reach article text through `--font-size` / `--line-height` / `--letter-spacing` / `--word-spacing` custom properties consumed by the body rule via var() with literal first-paint fallbacks (Gap 2).**

## Performance

- **Duration:** ~5 min focused execution (2 task commits)
- **Started:** 2026-08-04T16:57:27Z
- **Completed:** 2026-08-04T17:02:16Z
- **Tasks:** 2/2
- **Files modified/created:** 7 (3 source edits, 1 new e2e spec, 3 existing test files extended/updated)

## Accomplishments

- **Gap 1 closed (READ-05 minor → green).** The progress hairline fill now grows left-to-right as the reader scrolls. Both the inline `transformOrigin` value in `ProgressHairline.tsx` and the `.progress-hairline-fill` CSS rule in `app.css` were changed from the invalid `inline-start` keyword to the physical `left` keyword. `transform-origin` accepts only physical keywords (`left|center|right|top|bottom`) plus lengths/percentages — there are no logical-keyword variants, so the previously-declared `inline-start` was silently ignored and the browser fell back to the initial `50% 50%` (center), making the `scaleX()` transform expand from the middle. A new 5th progress.spec.ts test asserts the computed transform-origin first token is `0px` (the `left` keyword computes to `0px 50%`), proving the origin sits on the left edge. The no-transition contract (UI-SPEC §Interaction 12) is preserved.
- **Gap 2 closed (READ-02 major → green).** Text-size and spacing settings now take effect immediately with no Save step. The fix routes the four typography knobs through CSS custom properties consumed by the body rule: `applyTheme.ts` now writes `--font-size` and `--line-height` (it was writing the bare `font-size` / `line-height` properties, which body's hardcoded `font-size: 18px; line-height: 1.6` overrode via CSS specificity — the cascade never reached the text); the existing `--letter-spacing` / `--word-spacing` writes were already custom properties but had no consumer (dead writes), so the second body rule in `app.css` now declares `letter-spacing: var(--letter-spacing, 0)` and `word-spacing: var(--word-spacing, 0)` alongside the converted `font-size: var(--font-size, 18px)` and `line-height: var(--line-height, 1.6)`. The literal `18px` / `1.6` / `0` become first-paint fallbacks (before applyTheme runs on SettingsProvider mount, the custom properties are unset and the body renders the D-07 defaults — no FOUC). `--font-body`, `--measure`, the FIRST body rule, and `:root` are byte-unchanged.
- **Real-browser proof.** A new `tests/e2e/typography-live-apply.spec.ts` opens an article, drives the SettingsPanel controls, and asserts: (a) default body computed `fontSize` is `18px`; (b) after the Text size slider moves from 18 to 24 (3 ArrowUp presses via keyboard fallback), body `fontSize` becomes `24px`; (c) clicking the "Spacious" spacing radio produces a nonzero body `wordSpacing` (the previously-dead `--word-spacing` write now consumed); (d) clicking "Compact" returns `wordSpacing` to `0px`. jsdom cannot prove cascaded computed style (Pitfall 2), so this is the authoritative proof.
- **No regression.** Full unit/component suite (242 tests) and full chromium e2e suite (46 tests) green. tsc + lint clean. Font family, theme, and reading width continue to live-apply unchanged (the model `--font-body` and `--measure` paths are untouched).

## Task Commits

Each task was committed atomically:

1. **Task 1 (Gap 1): progress hairline transform-origin — physical `left` keyword** — `1b39bb8` (fix)
2. **Task 2 (Gap 2): route typography knobs through custom properties consumed by body** — `9927a06` (fix)

## Files Created/Modified

- `src/reader/ProgressHairline.tsx` — inline `transformOrigin: "left"` (was `"inline-start"`); header rationale updated to document the grammar constraint and the LTR-vs-deferred-RTL decision
- `src/settings/applyTheme.ts` — `font-size` setProperty call → `--font-size`; `line-height` setProperty call → `--line-height`; existing `--letter-spacing` / `--word-spacing` / `--font-body` / `--measure` writes unchanged (now consumed); header rationale documents the cascade fix
- `src/app.css` — `.progress-hairline-fill { transform-origin: left }` (was invalid `inline-start`); SECOND body rule (under "Base typography") declares `font-size: var(--font-size, 18px); line-height: var(--line-height, 1.6); letter-spacing: var(--letter-spacing, 0); word-spacing: var(--word-spacing, 0);` — `font-weight: 400` and the rule's brace structure unchanged; FIRST body rule, `:root`, `[data-theme=…]` blocks untouched
- `tests/e2e/progress.spec.ts` — added 5th test "the fill's computed transform-origin resolves to the left edge (not center) — fills left-to-right"
- `tests/e2e/typography-live-apply.spec.ts` — NEW: real-browser cascade proof for size + word-spacing (4 assertions across the SettingsPanel controls)
- `tests/component/SettingsContext.test.tsx` — `readTokens` helper field renamed `fontSize` → `fontSizeToken` reading `--font-size`; the 3 affected assertions (default tokens, update tokens, reset tokens) updated; inline rationale note
- `tests/component/SettingsPanel.test.tsx` — Reset-to-defaults assertion moved to `--font-size` custom property (Rule 1 deviation)
- `tests/unit/settingsSchema.test.ts` — `applyTheme writes :root tokens` describe block updated in BOTH `it()` blocks: `font-size` → `--font-size`, `line-height` → `--line-height`; describe-block header rationale note

## Decisions Made

- **Why `left` (not `inline-start`) for LTR English.** The `transform-origin` grammar accepts only the physical keywords `left | center | right | top | bottom` plus lengths/percentages — there are no logical-keyword variants. `inline-start` IS a valid value for `inset`/`margin`/`padding` logical properties (which is the source of the original confusion in Plan 02-03), but NOT for `transform-origin`. Browsers silently ignore the unknown value and fall back to the initial `50% 50%` (center). UI-SPEC content is LTR English, so the physical `left` is correct. A future `[dir="rtl"]` override to `right` can ship in a later RTL milestone; do not rely on the unsupported logical keyword.
- **Body rule `var()` fallbacks are first-paint defaults, NOT redundant with `:root`.** The plan explicitly forbade adding the four typography knobs to `:root` (the fallbacks live only inside the body rule's `var()` declarations). Before `applyTheme` runs on `SettingsProvider` mount, the custom properties are unset and the body renders the literal `18px / 1.6 / 0`. Once the mount effect fires (synchronously), `applyTheme` writes the live values and `var()` substitution routes them through. No FOUC, no flash of wrong-sized text, no redundant root declarations.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated two additional test files the plan did not flag for the token-name move**
- **Found during:** Task 2 verification (full unit suite first run)
- **Issue:** The plan only flagged `tests/component/SettingsContext.test.tsx` for the bare-property → custom-property token-name move. Two other files had the same assertion shape against applyTheme writes:
  - `tests/component/SettingsPanel.test.tsx` line 181 — the Reset-to-defaults test asserted `root.style.getPropertyValue("font-size")` equals `"18px"`
  - `tests/unit/settingsSchema.test.ts` lines 178-179 and 197-198 — the `applyTheme writes :root tokens` describe block asserted the bare `font-size` and `line-height` properties in BOTH `it()` blocks
  Because the fix intentionally stops writing the bare properties (the body rule overrides them — that was the regression), these assertions MUST move to the corrected `--font-size` / `--line-height` custom-property token names. The plan's per-task verify command (`npm run test:unit -- --run`) caught them.
- **Fix:** Updated both files to assert the corrected custom-property token names. Added inline rationale notes documenting the 02-04 gap 2 move.
- **Files modified:** tests/component/SettingsPanel.test.tsx, tests/unit/settingsSchema.test.ts
- **Verification:** Full unit/component suite (242 tests) green; tsc + lint clean.
- **Committed in:** 9927a06 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug — additional test files with the same assertion regression)

**Impact on plan:** All auto-fixes necessary for correctness — the verify command caught assertions the plan missed. No scope creep; the changes are strictly in service of the plan's stated goal (route the typography knobs through custom properties) and would have been impossible to skip.

## Issues Encountered

None beyond the auto-fixed deviation above.

## User Setup Required

None — no external service configuration required. Plan 02-04 installs ZERO npm packages (locked-stack gap closure); uses only authored CSS, the existing React token seam, and browser CSS custom properties.

## Next Phase Readiness

**Phase 2 is now fully closed (4/4 plans including gap closure).** Ready for phase verification / next phase planning:

- **READ-02** (typography controls live-apply): proven via `tests/e2e/typography-live-apply.spec.ts` — body computed fontSize + wordSpacing track the SettingsPanel controls immediately.
- **READ-05** (quiet progress): proven via `tests/e2e/progress.spec.ts` — hairline tracks scroll with NO transition AND grows from the left edge (Gap 1 closed).
- **First-paint defaults preserved.** Before applyTheme runs on mount, the body renders the D-07 warm-paper defaults (18px / 1.6 / zero letter- and word-spacing) via the var() literal fallbacks. No flash of unstyled text.
- **Font family, theme, and reading width regression-preserved.** The `--font-body` (FIRST body rule) and `--measure` (`.article-body max-width`) paths are untouched and continue to live-apply.

**No blockers.** 242 unit/component tests + 46 chromium e2e tests green. tsc + lint clean. Phase 3 (Trustworthy Layout Measurement) inherits a body whose typography is fully controlled via custom properties — repagination will re-measure cleanly when size/line-height/letter-spacing/word-spacing change.

## Self-Check: PASSED

- Created files exist on disk: 1/1 (`tests/e2e/typography-live-apply.spec.ts` — verified via `git status` after Task 2 commit)
- Modified files updated: 6/6 (ProgressHairline.tsx, applyTheme.ts, app.css, progress.spec.ts, SettingsContext.test.tsx, SettingsPanel.test.tsx, settingsSchema.test.ts — all in Task 1 + Task 2 commits)
- Per-task commit hashes exist in git log:
  - `1b39bb8` (Task 1: fix — Gap 1 hairline origin) — FOUND
  - `9927a06` (Task 2: fix — Gap 2 typography cascade) — FOUND
- Acceptance criteria verified:
  - `transformOrigin: "left"` in ProgressHairline.tsx: 1 match (>= 1 ✓)
  - `transform-origin: left` (non-comment) in app.css: 1 match (>= 1 ✓)
  - `.progress-hairline-fill` rule block still declares NO transition/animation: existing "transition resolves to none" progress.spec.ts test green ✓
  - `transformOrigin` referenced in progress.spec.ts: 1 match (>= 1 ✓)
  - applyTheme.ts writes `"--font-size"`: 1 match (>= 1 ✓) and `"--line-height"`: 1 match (>= 1 ✓)
  - applyTheme.ts does NOT write bare `setProperty("font-size"` or `setProperty("line-height"`: 0 matches each (✓)
  - app.css `var(--font-size, 18px)`: 1 match (>= 1 ✓); `var(--line-height, 1.6)`: 1 match (>= 1 ✓)
  - app.css FIRST body rule still has `font-family: var(--font-body)`: 1 match (✓)
  - SettingsContext.test.tsx asserts `"--font-size"` and `"--line-height"`: 1 match each (✓)
  - typography-live-apply.spec.ts asserts body fontSize changes to 24px AND wordSpacing nonzero under spacious: verified via `npx playwright test typography-live-apply.spec.ts --project=chromium` exit 0 ✓
- `npx playwright test progress.spec.ts typography-live-apply.spec.ts --project=chromium`: 6 tests pass ✓
- `npx playwright test --project=chromium` (broader regression): 46 tests pass ✓
- `npm run test:unit -- --run`: 242 tests pass ✓
- `npx tsc --noEmit`: clean ✓
- `npm run lint`: clean ✓

---

*Phase: 02-accessible-scrolling-reader*
*Completed: 2026-08-04*
