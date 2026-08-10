---
status: resolved
trigger: "Sometimes after the hidden page heading receives focus, VoiceOver cannot reach document content; focus can already be spatially below the visible article and remains broken until refresh."
created: 2026-08-09
updated: 2026-08-09
---

# Debug Session: VoiceOver hidden heading spatial trap

## Symptoms

- **Expected behavior:** The page-boundary heading is spatially located immediately before the first visible article block so Down navigation enters content.
- **Actual behavior:** The hidden heading can be spatially below the article; VoiceOver cannot navigate upward into content with Down and remains trapped until refresh.
- **Errors:** No runtime error reported.
- **Timeline:** Introduced with the visually hidden page-boundary heading.
- **Reproduction:** Turn pages repeatedly with VoiceOver, then navigate Down from the announced page boundary.

## Current Focus

- hypothesis: Confirmed — the hidden heading's unset inset coordinates placed its focus rectangle below the first visible block.
- test: Assert the focused boundary rectangle is inside the page viewport and ends no lower than the first visible block's top.
- expecting: Current boundary geometry is not explicitly anchored and violates the ordering contract in at least one engine/layout.
- next_action: Manual Safari + VoiceOver confirmation.
- reasoning_checkpoint: VoiceOver Quick Nav uses spatial relationships as well as AX order; a hidden focus target below the document makes Down unable to find content located above it.
- tdd_checkpoint: Before the fix, all engines placed the boundary top 16px below the first block; after explicit logical insets and margin reset, the geometry contract passes everywhere.

## Evidence

- `.page-start-heading` uses `.visually-hidden`, which declares `position:absolute`, width/height, clipping, and whitespace but no `top`, `left`, or logical inset.
- The heading is a sibling immediately before `.page-fragment`, so its CSS static position is browser/layout dependent.
- User reports the focus sometimes begins below on-screen document content and cannot recover without rebuilding the AX tree.

## Eliminated

- Root or article scrolling: both scroll owners are now non-scrollable and that bug is confirmed fixed.
- Mutable paragraph focus: current implementation focuses only the dedicated boundary.

## Resolution

- root_cause: `.visually-hidden` made the page-boundary heading absolute but intentionally left its inset coordinates as `auto`. Combined with inherited article heading margins, browsers placed its accessibility/focus rectangle at its static sibling position, 16px below the first visible block. VoiceOver's spatial Down navigation then searched from below the document and could not reach content above it, persisting until refresh rebuilt the AX tree.
- fix: Pin `.page-start-heading` to the page viewport's logical block-start and inline-start and reset its inherited margin. Keep it outside `.page-fragment` so it remains excluded from pagination measurement.
- verification: The new regression asserts the focused boundary is inside `.page-viewport` and spatially no lower than the first visible block. It passes across Chromium, Firefox, and WebKit. The full 72-test pagination matrix, 514 unit tests, lint, production build, and `git diff --check` pass.
- files_changed: `src/app.css`, `tests/e2e/pagination/page-turn-controls.spec.ts`
