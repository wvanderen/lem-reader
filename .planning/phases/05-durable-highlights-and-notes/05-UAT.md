---
status: complete
phase: 05-durable-highlights-and-notes
source: [05-01-SUMMARY.md, 05-02-SUMMARY.md, 05-03-SUMMARY.md, 05-04-SUMMARY.md, 05-05-SUMMARY.md]
started: 2026-08-07T18:57:22Z
updated: 2026-08-07T19:48:06Z
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
result: issue
reported: "BLOCKED - regression in pagination logic; can't get a proper run. Two issues found: (1) the Thiel blockquote passage ('I no longer believe that freedom and democracy are compatible ...') cannot be saved as a highlight -- it registers on load but doesn't render an inline mark (suspects quote formatting); (2) pagination broken -- P1 holds nearly the entire article (intro + several paragraphs + the blockquote) while P2/P3/P4 hold only 1-2 sentences each. Per-page content pasted as evidence."
severity: blocker

### 12. Unresolved (ambiguous/orphan) highlight surfacing
expected: An unresolved highlight renders with a dashed outline instead of a fill; the drawer marks it with a flag + explanation + disabled jump but enabled delete; and on article open a one-time "N highlight(s) couldn't be relocated." status message appears. (May require seeded data -- say "skip" if you can't trigger it manually.)
result: skipped
reason: Requires seeded ambiguous/orphan HighlightRecords to trigger; not reproducible in a normal manual flow where passages resolve uniquely.

## Summary

total: 12
passed: 10
issues: 1
pending: 0
skipped: 1
blocked: 0

## Gaps

<!-- YAML format for plan-phase --gaps consumption -->
- truth: "Paginated mode produces even, viewport-sized page fragments with content distributed across pages (Phase 4 contract)."
  status: failed
  reason: "User reported: pagination broken -- page sizes wildly uneven. P1 contains nearly the entire article (header, intro, multiple paragraphs, and the Thiel blockquote), while P2 holds ~2 sentences, P3 holds ~1 sentence, P4 holds ~2 sentences. Looks like a regression in pagination logic. Phase 5 modified fragmentRenderer.tsx, capture.ts, domMeasurer.ts, engine.ts (Plan 05-05 Deviation #3 re-scoped the measurement query to [data-block-index]:not(.page-fragment [data-block-index])). User pasted the full per-page content as evidence."
  severity: blocker
  test: 11
  artifacts: []
  missing: []

- truth: "A highlight captured on a blockquote passage renders an inline <mark> on the quoted text (blockquote is in the eligible highlightable set per D5-07)."
  status: failed
  reason: "User reported: the Thiel blockquote passage ('I no longer believe that freedom and democracy are compatible ... Since 1920, the vast increase in welfare beneficiaries ... has rendered the notion of capitalist democracy into an oxymoron.') cannot be saved as a highlight -- it automatically registers as one on load but doesn't appear to be highlighted (no inline mark). Suspects the quote formatting."
  severity: major
  test: 11
  artifacts: []
  missing: []
