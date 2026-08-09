---
status: resolved
trigger: "After a page turn VoiceOver navigation gets stuck high on the page, and paginated mode can again scroll the text downward past the page bottom."
created: 2026-08-09
updated: 2026-08-09
---

# Debug Session: Paginated focus scroll seam

## Symptoms

- **Expected behavior:** Page turns preserve a stable viewport; VoiceOver starts on the first new block; paginated mode has no vertical document scrolling.
- **Actual behavior:** Navigation gets stuck high after a turn and scrolling past the bottom moves the page text downward.
- **Errors:** No runtime errors reported.
- **Timeline:** Observed after semantic first-block focus handoff was introduced.
- **Reproduction:** Turn to a later page, navigate with VoiceOver, or scroll downward at the page bottom.

## Current Focus

- hypothesis: Confirmed — paginated main geometry created a document scroll seam, and ordinary focus was permitted to scroll into it.
- test: Assert paginated document scroll range is zero and content-originated page turns preserve `window.scrollY` while focusing the first block.
- expecting: Current layout exposes about 32px of document overflow from a padding-budget mismatch.
- next_action: Manual Safari + VoiceOver confirmation.
- reasoning_checkpoint: Shared main padding is 64px per edge, but paginated article height reserves 48px per edge; header + main + article totals approximately viewport height + 32px.
- tdd_checkpoint: The WebKit regression measured 31px of unwanted root scroll before the fix; all six focused cases pass across Chromium, Firefox, and WebKit after the fix.

## Evidence

- `main#main` applies `padding-block: var(--space-3xl)` (64px per edge) in both modes.
- `.paginated-surface` height reserves `2 * var(--space-2xl)` (48px per edge).
- The existing browser test explicitly required a positive document scroll seam, codifying the unwanted behavior.
- First-block focus currently calls `.focus()` without `preventScroll`.
- WebKit measured a 31px document scroll range before the geometry fix.
- After the fix, all engines report zero document scroll range and forced `window.scrollTo` remains at `scrollY = 0`.

## Eliminated

- Internal page scrolling: `.page-viewport` already uses `overflow: clip` and `.paginated-surface` uses `overflow: hidden`.
- ArrowUp/ArrowDown page-turn interception: existing regression confirms these keys remain uncancelled.

## Resolution

- root_cause: Paginated mode inherited scrolling mode's 64px block padding on `<main>`, while `.paginated-surface` reserved only 48px per edge. Header + main padding + page surface therefore exceeded the viewport by about 31–32px. Root scrolling displaced the whole page, and focus handoff could participate because it did not opt out of scroll adjustment.
- fix: Give ready paginated `<main>` a mode-specific viewport-bound class with the same 48px block inset used by page geometry; lock root/main overflow and overscroll only while that class is present; focus the first semantic block with `{preventScroll: true}`.
- verification: Six focused focus/scroll regressions pass across Chromium, Firefox, and WebKit; the complete 72-test pagination matrix passes; 514 unit tests, lint, production build, and `git diff --check` pass.
- files_changed: `src/app.css`, `src/routes/ArticleView.tsx`, `src/reader/PageTurnControls.tsx`, `tests/e2e/pagination/page-turn-controls.spec.ts`
