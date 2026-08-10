---
status: resolved
trigger: "On macOS with a screen reader active, any Down Arrow navigation advances the page instead of moving to the next screen-reader block."
created: 2026-08-08
updated: 2026-08-08
---

# Debug Session: macOS down arrow turns page

## Symptoms

- **Expected behavior:** Down Arrow continues normal screen-reader block navigation within the current page. Explicit page-turn controls remain responsible for changing pages.
- **Actual behavior:** Any downward screen-reader navigation advances pagination immediately.
- **Errors:** No error message reported.
- **Timeline:** Began after adding the lower-document-boundary page-turn workaround.
- **Reproduction:** On macOS, enable the screen reader in a paginated article and press Down Arrow while positioned on a block that is not the end of the page.

## Current Focus

- hypothesis: Confirmed. The boundary workaround treated ordinary VoiceOver-induced document scrolling as an end-of-page signal, invoking the next-page action during downward block movement.
- test: Complete. Plain ArrowDown and scrolling to the outer document boundary both leave currentPageIdx unchanged across Chromium, Firefox, and WebKit.
- expecting: Resolved. Down Arrow remains on page 1; explicit page-turn inputs continue to work.
- next_action: Complete the debug session and request a manual macOS screen-reader confirmation.
- reasoning_checkpoint: The screenshot confirms VoiceOver is still on the first paragraph while the page has already reacted to navigation. A virtual cursor cannot be inferred safely from window.scrollY on macOS.
- tdd_checkpoint: The previous test encoded the incorrect assumption that lower document scroll meant end-of-page traversal. It was reversed to protect ordinary screen-reader navigation, with an explicit ArrowDown assertion added.

## Evidence

- timestamp: 2026-08-08T21:30:00-05:00
  observation: The regression began immediately after PageTurnControls added a passive window scroll listener that maps the document's lower scroll position to handleTurn("next", true).
- timestamp: 2026-08-08T21:34:00-05:00
  observation: After removing the listener, the full page-turn-controls suite passed 12/12 across Chromium, Firefox, and WebKit; the exact ArrowDown/scroll regression passed 3/3 across the same engines.

## Eliminated

## Resolution

- root_cause: The previous workaround inferred screen-reader page-boundary traversal from window.scrollY reaching the document bottom. On macOS, ordinary VoiceOver block navigation can scroll the outer document, making that signal indistinguishable from leaving the page and causing premature page turns.
- fix: Removed the passive document-scroll-to-next-page mapping entirely. Kept the independent correction that scopes post-turn focus restoration to the newly mounted .page-fragment. Reversed the browser regression so plain ArrowDown and arbitrary document scrolling must never change the page index.
- verification: Page-turn-controls passed 12/12 across Chromium, Firefox, and WebKit. The exact Down Arrow and document-scroll regression passed in all three engines. All 514 unit tests, lint, and the production build passed.
- files_changed: src/reader/PageTurnControls.tsx, tests/e2e/pagination/page-turn-controls.spec.ts, .planning/debug/resolved/sr-boundary-does-not-turn-page.md
