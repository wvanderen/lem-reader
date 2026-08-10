---
status: resolved
trigger: "VoiceOver Up/Down navigation through article text blocks on macOS no longer moves between blocks at all."
created: 2026-08-09
updated: 2026-08-09
---

# Debug Session: VoiceOver Up/Down no longer navigates blocks

## Symptoms

- **Expected behavior:** VoiceOver Up/Down moves sequentially through text blocks within the current article page without changing pagination.
- **Actual behavior:** VoiceOver Up/Down no longer appears to move through article blocks.
- **Errors:** No error message reported.
- **Timeline:** Observed after removing the unsafe document-scroll page-turn workaround.
- **Reproduction:** On macOS with VoiceOver active, enter a paginated article and use Up/Down while reading article text.

## Current Focus

- hypothesis: Programmatic page-turn focus restoration leaves VoiceOver anchored to a static paragraph that React reuses on later pages.
- test: Reproduce the retained paragraph `tabindex` across a page turn, then verify Up/Down remain uncancelled after focus restoration.
- expecting: A clean page remount and region-level focus target restore normal block navigation without mapping ArrowUp/ArrowDown to page turns.
- next_action: Manual VoiceOver confirmation on macOS.
- reasoning_checkpoint: No listener handles ArrowUp/ArrowDown. The failure followed an imperative paragraph mutation across a React-reused page subtree.
- tdd_checkpoint: The new regression failed in Chromium, Firefox, and WebKit before the fix because the next page retained `p[tabindex]`; it passes in all three engines after the fix.

## Evidence

- The page-turn key map handles PageUp/PageDown, Left/Right, and Space; it neither handles nor cancels ArrowUp/ArrowDown.
- The prior focus helper imperatively added `tabindex="-1"` to the first paragraph and focused it.
- `PageFragmentView` previously had no page-specific key, allowing React to reuse paragraph DOM nodes when the page index changed.
- A cross-browser regression reproduced the stale paragraph attribute on the next page in Chromium, Firefox, and WebKit.
- The macOS accessibility tree exposes the article paragraphs as distinct text containers; no extra ArrowUp/ArrowDown event interception was found.

## Eliminated

- ArrowUp/ArrowDown event cancellation: both events remain `defaultPrevented === false` before and after page-focus restoration.
- Document scrolling as a page-turn signal: the existing regression confirms document scroll and plain Down Arrow do not advance the page.
- Pagination overflow as the direct cause of this navigation failure: the full pagination browser matrix remains green.

## Resolution

- root_cause: Page-turn focus restoration made a static paragraph programmatically focusable. Because React reused the page fragment subtree between page indices, that imperative `tabindex` and VoiceOver anchor could persist into the next page, trapping block navigation in stale accessibility state.
- fix: Make the page region the declarative fallback focus target, remove legacy paragraph focus attributes, and key the page fragment by page index so every turn receives a clean DOM/accessibility subtree. Interactive descendants are still preferred when present.
- verification: 514 unit tests passed; 72 relevant pagination E2E tests passed across Chromium, Firefox, and WebKit; lint and production build passed; `git diff --check` passed. The new regression proves the next page focuses `.page-fragment`, contains no focus-mutated paragraphs, and leaves ArrowUp/ArrowDown uncancelled.
- files_changed: `src/pagination/fragmentRenderer.tsx`, `src/reader/PageTurnControls.tsx`, `src/reader/PaginatedSurface.tsx`, `tests/e2e/pagination/page-turn-controls.spec.ts`
