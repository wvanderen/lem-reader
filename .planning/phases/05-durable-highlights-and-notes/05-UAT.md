---
status: resolved
phase: 05-durable-highlights-and-notes
source: [05-01-SUMMARY.md, 05-02-SUMMARY.md, 05-03-SUMMARY.md, 05-04-SUMMARY.md, 05-05-SUMMARY.md, 05-06-SUMMARY.md, 05-07-SUMMARY.md]
started: 2026-08-07T18:57:22Z
updated: 2026-08-07T20:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Create a highlight via the selection toolbar
expected: Select body text -> floating toolbar appears with Highlight / Highlight+note buttons -> click Highlight -> text gets a yellow <mark> overlay and "Highlight saved." is announced.
result: pass

### 2. Create a highlight via keyboard (H)
expected: Select body text -> press H -> highlight is created and "Highlight saved." is announced. (No highlight created if selection is collapsed or focus is in a form field.)
result: pass

### 3. Invalid selection shows a calm hint
expected: Select text spanning two separate blocks/paragraphs (or make a collapsed/empty selection). The toolbar shows a calm hint instead of action buttons -- no Highlight button is offered to create a cross-block/empty highlight.
result: pass

### 4. Add and save a note
expected: With a highlight present, click (or press Enter on) the highlighted <mark>. A note popover opens with a focused textarea. Type a note; after a brief pause "Note saved." is announced and the highlight gains a dotted underline (note indicator).
result: pass

### 5. Create highlight + note together (N)
expected: Select body text -> press N -> highlight is created AND the note popover opens with an empty focused textarea ready for input.
result: pass

### 6. Open the annotations drawer
expected: Click the highlighter-glyph button in the header (inline-start of the mode toggle). A slide-over drawer opens listing highlights in reading order with a count badge; each entry shows the highlight excerpt. An empty state shows when there are no highlights.
result: pass

### 7. Jump back to a highlight from the drawer
expected: In the drawer, click a jump action on an entry. The view navigates to that highlight and focuses the <mark>. Works in BOTH modes: paginated turns to the containing page; scrolling scrolls it into view.
result: pass

### 8. Delete a highlight with two-step confirm
expected: Trigger delete on a highlight (drawer or popover). A confirm prompt appears with "Keep" as the default focused (non-destructive) action. Confirming the destructive action removes the highlight; the text is no longer marked and the highlight's note is removed too.
result: pass

### 9. Highlight + note survive reload
expected: After creating highlights and notes, reload the page. The highlights and notes reappear at the same passages (persisted in local IndexedDB).
result: pass

### 10. Highlight survives mode switch / relayout
expected: Switch between paginated and scrolling modes. The highlight stays attached to the same passage in both modes (re-anchored from the durable text selector on every relayout).
result: pass

### 11. Cross-fragment highlight in paginated mode
expected: With a highlight present, switch to paginated mode: the highlight renders on the correct page. If a highlighted block spans a page boundary, the mark appears on BOTH pages (no gap at a page turn) and activating it from either page works.
result: pass
resolved_by: [05-06, 05-07]
resolution: "Both Test 11 sub-issues closed by gap-closure plans. (1) BLOCKER pagination mega-page: 05-06 gated the geometry-effect rAF read on the `.paginated-surface` class so the scrolling-body height is never captured on initial load; new `initial-pagination-even` e2e captures the FIRST pagination publication and asserts >1 page + stable (RED pagesLength 1 → GREEN pagesLength 2). (2) MAJOR blockquote inline mark: 05-07 threads per-child `childHighlightSlices` through the blockquote case in BOTH render paths; 4-case component suite 16/16 green. Phase gate: full `npm run test` 1003 passed / 0 failed / 0 skipped."

### 12. Unresolved (ambiguous/orphan) highlight surfacing
expected: An unresolved highlight renders with a dashed outline instead of a fill; the drawer marks it with a flag + explanation + disabled jump but enabled delete; and on article open a one-time "N highlight(s) couldn't be relocated." status message appears. (May require seeded data -- say "skip" if you can't trigger it manually.)
result: skipped
reason: Requires seeded ambiguous/orphan HighlightRecords to trigger; not reproducible in a normal manual flow where passages resolve uniquely.

## Summary

total: 12
passed: 11
issues: 0
pending: 0
skipped: 1
blocked: 0

## Gaps

<!-- YAML format for plan-phase --gaps consumption -->
- truth: "Paginated mode produces even, viewport-sized page fragments with content distributed across pages (Phase 4 contract)."
  status: resolved
  resolved_by: "05-06"
  reason: "User reported: pagination broken -- page sizes wildly uneven. P1 contains nearly the entire article (header, intro, multiple paragraphs, and the Thiel blockquote), while P2 holds ~2 sentences, P3 holds ~1 sentence, P4 holds ~2 sentences. Looks like a regression in pagination logic. Phase 5 modified fragmentRenderer.tsx, capture.ts, domMeasurer.ts, engine.ts (Plan 05-05 Deviation #3 re-scoped the measurement query to [data-block-index]:not(.page-fragment [data-block-index])). User pasted the full per-page content as evidence."
  severity: blocker
  test: 11
  root_cause: "On initial article load in paginated mode (the default), pageContentBoxHeightPx is set to the SCROLLING-body's natural height (~1148-1313px) by ArticleView's geometry effect's first requestAnimationFrame, which fires while the scrolling branch is still mounted (trustedView is null on the first render, so <article class='article-body'> has no pinned height). The first pagination pass consumes that inflated height and packs the entire article onto P1. Only after trustedView commits does the branch flip to <article class='article-body paginated-surface'> (CSS height pinned to ~654px) and the geometry effect re-reads 654; a racy correction then redistributes to 2-3 pages. The Plan 04-09 synchronous reset (ArticleView.tsx:658-662) only fires on user MODE SWAPS (isPaginated !== prevIsPaginated), NOT on initial load where paginated is the default from the start. NOT a Phase 5 regression: reproduces identically at the last Phase 4 commit (eac0845); the Phase 5 measurement-selector change is exonerated (returns exactly the 8 measurement-body blocks with correct heights). The bug is latent since Phase 4, masked by the racy correction plus a fooled no-overflow e2e (.page-fragment{height:100%} clamps scrollHeight to clientHeight, and the test waits past the correction)."
  artifacts:
    - path: "src/routes/ArticleView.tsx"
      issue: "geometry effect (lines ~644-684) reads articleEl.getBoundingClientRect().height via rAF; first read captures the scrolling-body height because the scrolling branch mounts first (trustedView null)"
    - path: "src/routes/ArticleView.tsx"
      issue: "synchronous pageContentBoxHeightPx reset (lines ~658-662) only triggers on mode swaps, not initial load in paginated-default mode"
    - path: "src/reader/PaginatedSurface.tsx"
      issue: "pagination effect (lines ~228,262,331) consumes the inflated pageContentBoxHeightPx on the first pass"
    - path: "src/app.css + tests/e2e/pagination/no-overflow-invariant.spec.ts"
      issue: "masking factors (.page-fragment{height:100%} clamps scrollHeight; e2e waits past the racy correction) hid the regression from the gate"
  missing:
    - "Ensure pageContentBoxHeightPx reflects the paginated-surface height (or stays 0) BEFORE the first pagination pass"
    - "Option A: gate the geometry read on the 'paginated-surface' class being active so the scrolling-branch height is never captured"
    - "Option B: reset pageContentBoxHeightPx to 0 on initial mount in paginated mode (not only on mode swap) so the pagination effect waits for correct geometry"
    - "Option C: derive the page height from the .page-fragment's intended content box rather than the shared articleEl whose geometry differs between the two render branches"
    - "Fix the no-overflow e2e to assert against rendered per-block bottoms / the raw initial pagination (not the height:100%-clamped scrollHeight after a 600ms wait)"
  debug_session: ".planning/debug/pagination-uneven-pages.md"

- truth: "A highlight captured on a blockquote passage renders an inline <mark> on the quoted text (blockquote is in the eligible highlightable set per D5-07)."
  status: resolved
  resolved_by: "05-07"
  reason: "User reported: the Thiel blockquote passage ('I no longer believe that freedom and democracy are compatible ... Since 1920, the vast increase in welfare beneficiaries ... has rendered the notion of capitalist democracy into an oxymoron.') cannot be saved as a highlight -- it automatically registers as one on load but doesn't appear to be highlighted (no inline mark). Suspects the quote formatting."
  severity: major
  test: 11
  root_cause: "A kind-based gate in BOTH render paths limits inline <mark> overlay computation to paragraph + heading blocks only -- blockquote (a CONTAINER whose text lives in block.children) is excluded. BlockRenderer.ArticleBody computes highlightSlices only inside `if (block.kind === 'paragraph' || block.kind === 'heading')` (lines ~292-294); the paginated PageFragmentView applies the identical gate (lines ~125-136). Neither path computes per-child slices for a blockquote, and the blockquote BlockView recursion (lines ~93-100) does not forward highlightSlices to its child paragraphs. InlineList therefore receives no slices for the blockquote's child paragraph and renders plain runs with no <mark>. Capture + persistence + resolution all WORK (D5-07 marks blockquote eligible; blockNormalizedText includes the children's text), which is exactly why the symptom is 'registers on load but doesn't render'. The exclusion is intentional in code (comment at BlockRenderer.tsx:277-290 lists blockquote as a container kind without inline overlays) but was UNDER-DOCUMENTED in the phase SUMMARYs (which named only code-block + figure-caption as deferred)."
  artifacts:
    - path: "src/content/render/BlockRenderer.tsx"
      issue: "kind guard (lines ~292-294) excludes blockquote from highlightSlices computation; recursive blockquote case (lines ~93-100) does not forward slices to children"
    - path: "src/pagination/fragmentRenderer.tsx"
      issue: "paginated path applies the same exclusion (lines ~125-136) -- failure is mode-independent"
    - path: "src/content/render/InlineRenderer.tsx"
      issue: "terminal failure point (line ~83 -- no slices -> no <mark>); not itself buggy"
  missing:
    - "Add recursive per-child slice computation for container kinds (blockquote, and by extension lists)"
    - "For a blockquote block in ArticleBody, walk block.children accumulating each child's intra-blockquote grapheme offset (accounting for BLOCK_SEPARATOR between children -- mirrors the existing sliceChildBlocks pattern in fragmentRenderer.tsx), intersect each highlight's article-global range with each child's range, and forward per-child highlightSlices to the recursive <BlockView> call"
    - "blockquote BlockView case (lines ~93-100) must accept and forward slices per child"
    - "Apply the same per-child treatment in PageFragmentView (sliceRunsForHighlights can be reused as-is per child paragraph)"
  debug_session: ".planning/debug/blockquote-highlight-no-inline-mark.md"
