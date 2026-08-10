---
status: resolved
trigger: "After changing pages, VoiceOver lands on the page region and the main text is not navigable with Up/Down until the user clicks into the article body."
created: 2026-08-09
updated: 2026-08-09
---

# Debug Session: VoiceOver page handoff lands on region

## Symptoms

- **Expected behavior:** After a page turn initiated from article content, VoiceOver should be positioned at the first semantic block on the new page and Up/Down should immediately continue through article blocks.
- **Actual behavior:** VoiceOver announces "You are currently on a region" and Up/Down does not advance through the text until the user clicks into the article body.
- **Errors:** No runtime error reported.
- **Timeline:** Appeared after replacing imperative paragraph focus with page-region focus to eliminate stale focus state across page turns.
- **Reproduction:** Navigate within article content using VoiceOver, turn the page, then use Up/Down without clicking.

## Current Focus

- hypothesis: Confirmed — focusing the labeled `.page-fragment` places VoiceOver at the region/container navigation level rather than on a readable text block.
- test: Change the regression to require focus on the first top-level semantic block after a content-originated turn, with a clean keyed remount and uncancelled Up/Down.
- expecting: VoiceOver receives a fresh semantic block as its navigation anchor rather than announcing the page region.
- next_action: Manual VoiceOver confirmation on macOS.
- reasoning_checkpoint: The screenshot visibly outlines the entire page fragment and VoiceOver explicitly reports that the current item is a region.
- tdd_checkpoint: The WebKit regression failed because the first block remained inactive, then passed across all three browser engines after the semantic-block handoff.

## Evidence

- `.page-fragment` currently has `aria-label` and `tabindex=-1`, exposing it as the programmatic focus target.
- `focusNewPageTop` falls back directly to `.page-fragment.focus()` when no interactive descendant exists.
- The page fragment is keyed by page index, so the stale DOM/accessibility-node reuse that caused the previous failure is already prevented.
- The supplied screenshot outlines the whole page fragment and VoiceOver announces "You are currently on a region."
- Before the fix, the new WebKit regression reported the first paragraph as inactive after a page turn.
- After the fix, the first top-level block is focused and is the only block carrying programmatic-only `tabindex=-1`.

## Eliminated

- Stale paragraph state across turns: the keyed fragment remount and existing cross-browser regression already prevent it.
- ArrowUp/ArrowDown cancellation: existing coverage proves both keys remain uncancelled.

## Resolution

- root_cause: The previous stale-focus fix moved DOM focus to the labeled page `<section>`. VoiceOver therefore entered the page at the region/container level instead of at a semantic text block, so Up/Down could not immediately continue block navigation.
- fix: Keep the keyed clean remount, remove focusability from the page region, declaratively mark only the first top-level semantic block as a programmatic-only page-entry anchor, and focus that block after content-originated page turns.
- verification: The new focused regression passes in Chromium, Firefox, and WebKit. The complete 72-test pagination matrix, 514 unit tests, lint, production build, and `git diff --check` all pass. ArrowUp/ArrowDown remain uncancelled.
- files_changed: `src/content/render/BlockRenderer.tsx`, `src/pagination/fragmentRenderer.tsx`, `src/reader/PageTurnControls.tsx`, `tests/e2e/pagination/page-turn-controls.spec.ts`
