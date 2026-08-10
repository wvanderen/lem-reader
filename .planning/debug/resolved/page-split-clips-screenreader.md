---
status: resolved
trigger: "Paragraphs are cut off below the page boundary; in screen-reader mode the reading cursor can continue vertically into content below the visible page and cannot reliably return."
created: 2026-08-08
updated: 2026-08-08
---

# Debug Session: Page split clips content and leaks to screen reader

## Symptoms

- **Expected behavior:** Each page ends at a complete rendered line; off-page content is not present in the mounted accessibility tree; page navigation preserves orientation.
- **Actual behavior:** A paragraph can be cut off at the bottom. A screen-reader cursor can continue below the visible page into clipped content and may not return to the page.
- **Errors:** None reported; browser console and page errors require inspection.
- **Timeline:** Observed after the prior margin-budget pagination fix; the original sparse-page issue is cleared.
- **Reproduction:** Read through paginated content, including with screen-reader vertical navigation, and reach a paragraph split near the bottom boundary.

## Current Focus

- hypothesis: Confirmed. The engine budget included the provenance header, and the post-render guard used both a masked scrollHeight signal and a margin-shifted fragment origin.
- test: Complete. Every page is now checked with live Range rectangles against the dedicated page viewport across the fixture/viewport/browser matrix.
- expecting: Resolved. No visible text rectangle extends beyond the current page boundary.
- next_action: Complete the debug session.
- reasoning_checkpoint: The defect was a disagreement among three coordinate spaces: the fixed article shell, the actual page viewport below its header, and a fragment box shifted by margin collapse.
- tdd_checkpoint: The hardened browser invariant failed across all 18 Chromium corpus cells before the fix and passes across all three browser engines after it. Unit regressions cover the page-origin split and the mobile code-block threshold.

## Evidence

- timestamp: 2026-08-08T12:00:00-05:00
  observation: The old scrollHeight invariant passed while live Range rects found text 37-173px below the page boundary in every Chromium corpus cell. The Playwright accessibility snapshot included the clipped paragraph text.
- timestamp: 2026-08-08T12:02:00-05:00
  observation: The article's visible provenance header consumed roughly 100-244px inside the fixed-height article, but pageContentBoxHeightPx used the article's full height. The engine therefore over-budgeted every page by the header height.
- timestamp: 2026-08-08T12:06:00-05:00
  observation: A remaining list line overflowed by 9.7px because the guard measured child bottoms from fragmentEl.top. A collapsed first-child margin shifted fragmentEl.top 18px below the actual .page-viewport origin, so the guard incorrectly reported 501/510px as fitting.
- timestamp: 2026-08-08T12:08:00-05:00
  observation: After using a dedicated page viewport, removing the scrollHeight short-circuit, and aligning the live guard to the viewport origin, all Chromium content/viewport cells fit. A 223px code block on a 282px mobile page required the code-specific 90% standalone-page ceiling instead of the general 75% atomic fallback threshold.

## Eliminated

## Resolution

- root_cause: Pagination received the entire fixed-height article as its page budget even though the provenance header occupied part of that height. The post-render safety guard then skipped correction when a fixed-height fragment reported a safe scrollHeight, and measured later corrections from a fragment origin shifted by collapsed margins. Split estimates also omitted structural block overhead.
- fix: Added a dedicated page viewport below the header and use its measured height consistently; always run the live post-render boundary guard; measure line and child bottoms from the viewport origin; account for structural split overhead; permit code blocks up to 90% of a standalone page; and assert live text-line containment on every rendered page.
- verification: 514 unit tests passed; 57 cross-browser boundary and page-turn stability tests passed; 99 cross-browser accessibility, keyboard, coverage, and section-announcement tests passed; lint and production build passed.
- files_changed: src/routes/ArticleView.tsx, src/app.css, src/reader/PaginatedSurface.tsx, src/pagination/overflowGuard.ts, src/pagination/fragment.ts, tests/e2e/pagination/no-overflow-invariant.spec.ts, tests/unit/pagination/overflowGuard.test.ts, tests/unit/pagination/termination.test.ts
