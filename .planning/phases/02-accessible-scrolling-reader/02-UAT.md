---
status: complete
phase: 02-accessible-scrolling-reader
source: [02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md]
started: 2026-08-03T15:26:52Z
updated: 2026-08-04T17:22:15Z
resolved_by: [02-04-PLAN.md]
reverified: 2026-08-04T17:22:15Z
reverify_round: 2
note: "Tests 3 and 4 re-verified conversationally; both 02-04 fixes confirmed by user."
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test (empty local storage)
expected: Kill any dev server, clear site data (IndexedDB empty), `npm run dev`. App boots without console errors, defaults to Sepia theme, and an article fixture renders with headings, paragraphs, and provenance header.
result: pass

### 2. Open & read an article
expected: Navigate to an article. You see a calm scrolling surface: article title, provenance header, and well-formed body content (headings, paragraphs, quotes). A slim header bar with wordmark + gear button stays on top.
result: pass

### 3. Progress hairline tracks reading
expected: Scroll down the article. A thin 2px progress hairline under the header fills as you read, moving like a native scrollbar (left-to-right) with no visible animated transition.
result: pass
reverify: "02-04 fix — transform-origin corrected to `left`. User confirmed 2026-08-04."

### 4. Open settings & change typography live
expected: Click the gear. A modal settings panel opens over a dimmed backdrop with controls for font, text size, reading width, and line spacing. Change one (e.g. drag Text size or pick another font) — the article updates immediately, with no Save step.
result: pass
reverify: "02-04 fix — typography knobs routed through var() custom properties. User confirmed 2026-08-04."

### 5. Switch theme live
expected: In settings, change the theme to Dark (or Light/Sepia). The reading surface colors change immediately behind the panel.
result: pass

### 6. Close settings with Esc, focus returns to gear
expected: Press Esc. The panel closes and keyboard focus returns to the gear button.
result: pass

### 7. Settings persist across reload
expected: Reload the page. Your chosen font, text size, reading width, line spacing, and theme are all still applied.
result: pass

### 8. Resume reading position after reload
expected: Scroll partway down the article, then reload. The page silently scrolls back to roughly where you were, and a small dismissible "Resume" banner appears.
result: pass

### 9. Section announcement on scroll
expected: Scroll past a section heading (use a fixture with h2 headings, e.g. technical-post). The current section heading is announced politely via a live region (visible to a screen reader / in the accessibility tree) without interrupting.
result: pass

### 10. Keyboard-only settings flow
expected: Using only keyboard: focus the gear, press Enter/Space to open, Tab through the panel controls (focus never escapes to the page behind), then Esc closes and returns focus to the gear.
result: pass

### 11. 320px reflow
expected: Narrow the viewport to 320px width and open settings. The panel reflows with no horizontal scrolling; all controls remain visible and usable.
result: pass

### 12. Touch target sizes
expected: Every interactive control in the settings panel (radio labels, checkboxes, close, reset) measures at least 44x44px (inspect in DevTools or tap on a touch device).
result: pass

### 13. Reduced motion
expected: Enable OS "Reduce motion". Open/close settings and scroll the article — no transitions or animations occur on the panel or the progress hairline.
result: pass

### 14. Storage failure & reset-local-data safety
expected: If local storage becomes unavailable, a dismissible non-blocking banner appears. If storage is corrupt/unupgradeable, a focus-trapped "Reset local data?" confirmation opens, and wiping happens ONLY when you explicitly choose the destructive action (cancel is the safe default focus).
result: skipped
reason: Hard to trigger a corrupt/unavailable store manually in the browser; failure-path coverage exists in tests/unit/storageFallback.test.ts.

## Summary

total: 14
passed: 13
issues: 0
pending: 0
skipped: 1

## Gaps

- truth: "Progress hairline fills left-to-right like a scrollbar as you read"
  status: resolved
  reason: "User reported: Fills from center out, is this expected?"
  severity: minor
  test: 3
  resolved_at: 2026-08-04
  resolved_by: "02-04-PLAN.md Task 1 (commit 1b39bb8)"
  resolution: >
    Fixed in both locations: ProgressHairline.tsx inline `transformOrigin` and
    app.css `.progress-hairline-fill` rule swapped from the invalid
    `inline-start` keyword to the physical `left` keyword. Verified by new
    progress.spec.ts assertion (computed transform-origin first token = `0px`).
    Re-verified by gsd-verifier 2026-08-04 (commit 512904e).
  root_cause: >
    `transform-origin: inline-start` is not a supported value for the
    `transform-origin` property (its grammar is left|center|right|top|bottom
    plus lengths/percentages — no logical keywords). The browser ignores the
    declared value and falls back to the initial value `50% 50%` (center), so
    the inline `scaleX()` expands from the middle. Both the inline style in
    ProgressHairline.tsx AND the `.progress-hairline-fill` CSS rule
    (app.css line 716) use this invalid value, so both are ignored.
  artifacts:
    - path: "src/reader/ProgressHairline.tsx"
      issue: "transformOrigin: \"inline-start\" is not a valid transform-origin value; ignored → falls back to center"
    - path: "src/app.css"
      issue: ".progress-hairline-fill { transform-origin: inline-start } (line ~716) — same invalid value"
  missing:
    - "Change transform-origin to `left` (LTR) in both ProgressHairline.tsx inline style and app.css .progress-hairline-fill rule. If RTL support is required later, add a [dir=\"rtl\"] override to `right`; do not rely on the unsupported `inline-start` keyword."
- truth: "Changing text size and spacing updates the article immediately"
  status: resolved
  reason: "User reported: All settings work besides spacing and text-size (reading width works)"
  severity: major
  test: 4
  resolved_at: 2026-08-04
  resolved_by: "02-04-PLAN.md Task 2 (commit 9927a06)"
  resolution: >
    Fixed by routing all four typography knobs through custom properties the
    body rule consumes: applyTheme now writes `--font-size` / `--line-height`
    (replacing the bare property writes the body rule overrode); app.css
    second body rule consumes all four via var() with literal first-paint
    fallbacks. --font-body and --measure untouched. Verified by new
    typography-live-apply.spec.ts (body fontSize + wordSpacing respond live).
    Re-verified by gsd-verifier 2026-08-04 (commit 512904e).
  root_cause: >
    applyTheme writes `font-size` and `line-height` as bare properties on
    <html>, but app.css hardcodes `body { font-size: 18px; line-height: 1.6 }`
    (lines 128–129) which override the inherited <html> values — so size and
    the line-height half of spacing never reach the text. Additionally,
    `--letter-spacing` and `--word-spacing` custom properties ARE written to
    <html> but are never consumed by any CSS rule (no var() reference exists
    anywhere), so the spacing preset's letter/word-spacing are dead writes.
    By contrast `--font-body` (body { font-family: var(--font-body) }) and
    `--measure` (.article-body { max-width: var(--measure) }) work because
    they are consumed via var() with no hardcoded override.
  artifacts:
    - path: "src/settings/applyTheme.ts"
      issue: "Writes bare `font-size` and `line-height` on documentElement (overridden by body's hardcoded values); writes --letter-spacing/--word-spacing that nothing consumes"
    - path: "src/app.css"
      issue: "body rule (lines 127–131) hardcodes font-size:18px and line-height:1.6; no letter-spacing/word-spacing: var(...) consumers anywhere"
  missing:
    - "Route the four typography knobs through custom properties consumed by body: in applyTheme write `--font-size` and `--line-height` (custom props) instead of the bare `font-size`/`line-height` properties; in app.css set `font-size: var(--font-size, 18px); line-height: var(--line-height, 1.6); letter-spacing: var(--letter-spacing, 0); word-spacing: var(--word-spacing, 0);` on body (keeping 18px/1.6/0 as first-paint fallbacks). Keep --font-body and --measure as-is."
