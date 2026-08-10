---
status: resolved
trigger: "After changing pages, VoiceOver's highlight remains at the physical position it occupied on the prior page."
created: 2026-08-09
updated: 2026-08-09
---

# Debug Session: VoiceOver retains stale node position

## Symptoms

- **Expected behavior:** Every page turn gives VoiceOver an unambiguous new-page boundary, followed by the first visible text block.
- **Actual behavior:** VoiceOver's highlight remains at the old paragraph's screen coordinates after the page content changes.
- **Errors:** No runtime error reported.
- **Timeline:** Introduced by preserving the first paragraph DOM/AX node across page turns.
- **Reproduction:** Navigate within page text using VoiceOver, turn the page, and observe the cursor rectangle.

## Current Focus

- hypothesis: Confirmed — reusing a focused paragraph preserved VoiceOver's cached AX object and stale bounds.
- test: Replace mutable paragraph focus with a newly keyed, visually hidden semantic page-boundary heading and verify every turn focuses a fresh heading before the first block; text blocks carry no focus attributes.
- expecting: Current node-continuity test encodes the now-observed stale-position failure.
- next_action: Manual Safari + VoiceOver confirmation.
- reasoning_checkpoint: The screenshot shows VoiceOver announcing a region while its rectangle remains at the prior page's mid-page coordinates after the reused paragraph update.
- tdd_checkpoint: The new WebKit test initially found no page-boundary heading; after implementation it verifies fresh boundary focus and zero focused article blocks across all engines.

## Evidence

- Preserving the paragraph node fixed AX-tree destruction but immediately caused VoiceOver to retain the old physical highlight position.
- Replacing the entire page subtree caused VoiceOver to fall back to the persistent article header.
- A dedicated semantic page-boundary node can be replaced and focused without mutating or reusing article text nodes.

## Eliminated

- Layout or internal scrolling: page content remains spatially fixed; only the VoiceOver highlight is stale.
- Hidden content leakage: live Safari AX inspection exposes only the current page.

## Resolution

- root_cause: Directly focusing mutable page text offered two incompatible failure modes: remounting paragraphs dropped VoiceOver to the persistent header, while reusing a focused paragraph retained VoiceOver's cached object and old screen coordinates. The visual cursor therefore stayed at its previous-page location.
- fix: Stop focusing article blocks. Render a newly keyed, visually hidden `h2` page boundary ("Page N begins") before the visible fragment in accessibility order and focus it after content-originated turns. Remove any legacy paragraph `tabindex` during handoff. The boundary is a sibling overlay outside `.page-fragment`, so it cannot affect pagination geometry; the next VoiceOver navigation step enters the first visible block.
- verification: The page-boundary handoff passes across Chromium, Firefox, and WebKit, including fresh heading focus, no focused mutable blocks, viewport stability, and uncancelled Up/Down. The full 72-test pagination matrix, 514 unit tests, lint, production build, and `git diff --check` pass.
- files_changed: `src/reader/PaginatedSurface.tsx`, `src/reader/PageTurnControls.tsx`, `src/pagination/fragmentRenderer.tsx`, `src/app.css`, `tests/e2e/pagination/page-turn-controls.spec.ts`
