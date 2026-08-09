---
status: resolved
trigger: "In screen reader mode, arrowing down past the bottom of page 1 does not advance pagination; the view shifts to the next block while the page indicator remains on page 1 and navigation enters a weird state."
created: 2026-08-08
updated: 2026-08-08
---

# Debug Session: Screen-reader boundary does not turn page

## Symptoms

- **Expected behavior:** Moving the screen-reader reading cursor past the final content on the current page advances to the next page and restores reading context at its start.
- **Actual behavior:** The page indicator stays on page 1 while traversal shifts below the visible page into another block, leaving navigation in an unstable state.
- **Errors:** No error message reported.
- **Timeline:** Observed after the clipped-content pagination defect was fixed; page splitting itself now appears correct.
- **Reproduction:** Enable screen-reader navigation in paginated mode and arrow down beyond the final block on page 1.

## Current Focus

- hypothesis: Confirmed in a narrower form. Virtual-cursor movement is not observable directly, but Safari and Firefox scroll the short outer document when traversal leaves the current page region; that boundary scroll was ignored by pagination state.
- test: Complete. A browser regression drives the document to its lower boundary and asserts page advancement, scroll restoration, and focus inside the new page.
- expecting: Resolved. Boundary traversal now routes through the same turn, announce, and focus path as other navigation inputs.
- next_action: Complete the debug session and ask for a manual VoiceOver confirmation.
- reasoning_checkpoint: The safe observable seam is the outer document reaching its lower scroll boundary. The page content itself never scrolls after the overflow fix, so this signal identifies traversal leaving the paginated surface without trying to inspect a private screen-reader virtual cursor.
- tdd_checkpoint: The new Chromium regression failed with currentPageIdx 0 before the fix, then passed after the boundary listener and page-scoped focus correction. It also passes in Firefox and WebKit.

## Evidence

- timestamp: 2026-08-08T12:42:00-05:00
  observation: Chromium and WebKit accessibility snapshots contained only the current Page 1 region followed by Previous page, Next page, and status nodes. Non-current article pages were not mounted or exposed, eliminating duplicate content as the cause.
- timestamp: 2026-08-08T12:44:00-05:00
  observation: The paginated document was slightly taller than the browser viewport. Moving to its lower scroll boundary changed window.scrollY but left __lemPagination.currentPageIdx at 0; the new regression failed exactly on that unchanged state.
- timestamp: 2026-08-08T12:47:00-05:00
  observation: focusNewPageTop queried the entire article, so its focusable fallback could land on the provenance link above the page instead of inside the newly mounted .page-fragment.
- timestamp: 2026-08-08T12:48:00-05:00
  observation: After the fix, driving Safari to the document end changed its accessibility tree from Page 1 to Page 2 and exposed Page 2 content while retaining the same article shell.

## Eliminated

## Resolution

- root_cause: Screen-reader virtual-cursor traversal beyond the current page caused the browser to scroll the outer paginated document toward following accessibility nodes, but PageTurnControls listened only for explicit turn keys, horizontal swipe, and button clicks. Pagination therefore stayed on page 1. Its focus-restoration fallback was also scoped to the whole article rather than the current page fragment.
- fix: Added a passive paginated-mode boundary-scroll listener that recognizes the document's lower boundary, restores scroll position, and invokes the existing next-page turn with forced reading-context focus. Scoped focus restoration to .page-fragment and added a section fallback for pages without a heading, focusable element, or paragraph.
- verification: The new regression fails before and passes after the fix. 69 cross-browser pagination boundary/navigation/stability tests passed across Chromium, Firefox, and WebKit; 514 unit tests passed; lint and production build passed. Safari's live accessibility tree advanced from Page 1 to Page 2 when the lower boundary was exercised. Manual VoiceOver arrow/read-all confirmation remains appropriate because virtual-cursor output is not automatable reliably.
- files_changed: src/reader/PageTurnControls.tsx, tests/e2e/pagination/page-turn-controls.spec.ts

## Superseded

- timestamp: 2026-08-08T21:30:00-05:00
  note: The boundary-scroll page-turn mapping was removed after real macOS screen-reader testing showed that ordinary Down Arrow block navigation also moves the outer document and therefore advanced pages prematurely. Window scroll position is not a safe proxy for virtual-cursor page-boundary traversal. The page-scoped focus correction remains; explicit page-turn inputs remain the reliable pagination path. See resolved/macos-down-arrow-turns-page.md.
