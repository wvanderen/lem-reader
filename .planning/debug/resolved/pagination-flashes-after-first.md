---
status: resolved
trigger: "Pagination is still quite broken. After the first page there's flashing on the progress bar and in the viewport. Pages after the first seem to only just be one paragraph. Something is not right"
created: 2026-08-07
updated: 2026-08-07T18:00:00-05:00
---

# Debug Session: Pagination flashes after first page

## Symptoms

- **Expected behavior:** Page turns reveal stable, viewport-filled pages and the progress hairline changes once per turn.
- **Actual behavior:** After page one, the viewport and progress hairline flash; later pages appear to contain only one paragraph.
- **Errors:** None reported; browser console and page errors still need inspection.
- **Timeline:** Not specified; repository history and current behavior will be used to narrow the regression.
- **Reproduction:** Open a representative long-form article in paginated mode and navigate forward from page one.

## Current Focus

- hypothesis: CONFIRMED — the raw page budget excluded CSS block margins, and the overflow guard inserted a sparse corrective page after first publication.
- test: Compare first publication, settled distribution, content occupancy, and page count across consecutive turns in Chromium, Firefox, and WebKit.
- expecting: The fixed first publication equals settled state, intermediate pages are not sparse, and navigation does not mutate page count.
- next_action: complete
- reasoning_checkpoint: Root cause and fix verified cross-browser.
- tdd_checkpoint: Regression coverage added at unit and Playwright levels.

## Evidence

- timestamp: 2026-08-07T17:55:00-05:00
  observation: At 1024x800 the settled essay pagination was 3 pages with block counts [3,1,5]. Page 2 contained only 164 characters in one 57.59px paragraph inside a 654px page.
- timestamp: 2026-08-07T17:56:00-05:00
  observation: DOMRect block heights excluded the CSS `margin-block: 1em`; the raw page budget therefore packed three paragraphs into page 1. The post-render guard moved the overflowing paragraph slice into a standalone inserted page, producing the sparse intermediate page and changing the progress denominator.
- timestamp: 2026-08-07T17:57:00-05:00
  observation: With computed block margins included using CSS margin-collapse arithmetic, the same fixture distributes as [3,4,2]; page 2 contains 1,373 visible characters and remains stable across turns.

## Eliminated

## Resolution

- root_cause: Pagination summed getBoundingClientRect().height values, which exclude block margins. The overflow guard corrected the over-packed first page by inserting a standalone page for the offending paragraph slice, creating a nearly empty page and visible progress/content churn.
- fix: Capture computed logical block margins and include collapsed margins in whole-block and split-fragment page budgets before the first pagination publication.
- verification: 512 unit tests passed; 60 focused pagination tests passed across Chromium, Firefox, and WebKit; final no-flash regression passed in all 3 engines; lint and production build passed.
- files_changed: src/measurement/types.ts, src/measurement/domMeasurer.ts, src/pagination/fragment.ts, tests/unit/pagination/fragmentOrder.test.ts, tests/e2e/pagination/page-turn-stability.spec.ts
