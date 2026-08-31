---
phase: 19-cross-block-highlights
plan: 04
subsystem: annotations
tags: [highlights, paginated, spans, lists, nested-recursion, figure-captions, code-blocks, first-slice-id, grapheme-offsets, entry-local-coordinates, react, vitest, playwright]

# Dependency graph
requires:
  - phase: 19-cross-block-highlights
    provides: 19-01 endpoint-composed span capture (D5-08 slice-attribute composition) + 19-03 HighlightSlice.isFirst / ListItemSlices / caption + code mark paths (the scrolling twins this plan mirrors)
  - phase: 05-annotations
    provides: the 05-07 blockquote entry-local threading precedent + sliceRunsForHighlights/sliceHighlightsForEntry consumed unchanged
  - phase: 04-pagination-mvp
    provides: sliceList/sliceChildBlocks items substrate + splittingBlockGraphemeLength coordinate + one-PageFragmentView-at-a-time mounting
provides:
  - Per-page first-occurrence id pass (claimSlices/claimItemSlices/claimCodeSegments + seenHighlightIds Set) — exactly one id="hl-<id>" per highlight per mounted page, across every slice shape (T-19-10 closed)
  - Entry-local per-item list threading (computeEntryListItemSlices) with D19-15 nested-list recursion inside page fragments — paginated parity with 19-03
  - Entry-local caption forwarding (Pitfall 1 symmetric offset) + code-segment forwarding for figure/code-block entries — explicit routing, no silent paginated bypass
  - 5 unit cells + 3 e2e cells (3 engines) incl. the typography-repagination page-crossing cell with the Pitfall 2 count===1 assertion
affects: [19-05 eligibility matrix + phase gate, review-jump focus targets (D10-03), verifier UAT]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-mounted-document firstness: a per-render Set == per-page firstness because exactly ONE PageFragmentView mounts at a time; the pass OWNS isFirst in paginated mode and always overrides entry-local slicer flags"
    - "Claim-by-mutation: slice structures are freshly created per render by the pure slicers, so the pass flips isFirst in place in document (render) order — no re-allocation, no second slicing pass"
    - "Caller-computed prop forwarding is the explicit routing contract for figure/code entries: BlockView renders, the fragment renderer computes entry-local slices (same shapes ArticleBody computes for scrolling)"

key-files:
  created: []
  modified:
    - src/pagination/fragmentRenderer.tsx
    - tests/unit/annotations/cross-fragment-slicing.test.ts
    - tests/e2e/annotations/cross-fragment-render.spec.ts

key-decisions:
  - "CAPTION/CODE ROUTING DECISION (plan-required record): ENTRY-LOCAL FORWARDING, not BlockView delegation. Every entry renders through the shared BlockView (PageFragmentView maps entries to <BlockView>), but BlockView's captionHighlightSlices/codeSegments props are CALLER-computed — there is no BlockView-internal computation path to delegate to (the scrolling twin computes them in ArticleBody's map). grep-cites: fragmentRenderer.tsx figure branch computes captionHighlightSlices with the Pitfall 1 symmetric offset (alt graphemes + BLOCK_SEPARATOR via graphemeClusters); code-block branch calls sliceCodeForHighlights(resolved.source, 0, entrySlices, lang). Pinned by e2e cell (d)"
  - "The per-page pass mutates slice.isFirst in place — sliceRunsForHighlights/sliceCodeForHighlights/createEntryListItemSlices create fresh objects per render, so the claim walk needs no copies; document order == the order structures are claimed (blockquote children, list items depth-first, caption/code arrays)"
  - "Cell (a) determinism strategy: select the FULL mounted-page content (first char of first eligible block → last char of last eligible block) so a 18→24 font-size increase (every line taller, same viewport) cannot fit the span on one page again — pagesCarrying>=2 asserted, proving the crossing case rather than hoping for it"
  - "Atomic-entry coordinate note recorded in code: figures/code-blocks are D4-02 atomic (whole-block entries by engine contract), so entry-local offset 0 == block-local 0 for caption/code forwarding"
  - "requirements-completed: [ANNO-09, ANNO-10] — closes both. ANNO-09's scrolling legs shipped at 19-01/19-03 with the paginated leg + id co-claim deferred here (19-03 key-decisions precedent); ANNO-10's remaining repagination leg (marks re-derive from the global range on every page turn) is cell (a) — mode-change/typography/reopen/export-import/review-jump legs shipped in phases 05/09/10"

patterns-established:
  - "Paginated render coverage extends by mirroring the shipped entry-local blockquote discipline per kind — lengths from splittingBlockGraphemeLength, offsets from entry-local accumulators, intersect clamp before every slicer call (Pitfall 4)"
  - "Per-page identity passes own flags the slicer cannot know — the slicer stays coordinate-pure, the renderer owns document-order semantics"

requirements-completed: [ANNO-09, ANNO-10]

# Metrics
duration: 13 min
completed: 2026-08-31
status: complete
---

# Phase 19 Plan 04: Paginated Span Render Coverage Summary

**Paginated spans now mirror scrolling coverage exactly — per-item list threading (nested recursion included), caption + code marks inside page fragments, and a per-page first-occurrence pass that guarantees exactly one `id="hl-<id>"` per highlight per mounted page across typography-triggered repagination (3-engine proven)**

## Performance

- **Duration:** 13 min
- **Started:** 2026-08-30T23:54:19Z
- **Completed:** 2026-08-31T00:07:31Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- **Entry-local list threading (Task 1):** `computeEntryListItemSlices` mirrors the shipped blockquote entry path over the items-shape — per-item/per-child accumulators with `splittingBlockGraphemeLength` lengths and the BLOCK_SEPARATOR join rule (empty-item separator accounted, nested lists recurse via an `origin` offset — D19-15). Threaded into BlockView's existing `itemHighlightSlices` prop; `data-block-index`/`data-block-grapheme-start` emission byte-unchanged (capture round-trips intact)
- **Caption + code routing made EXPLICIT (Task 1):** the figure entry case forwards `captionHighlightSlices` (Pitfall 1 symmetric offset: alt graphemes + BLOCK_SEPARATOR when alt non-empty, run-sum gate length) and the code-block entry case forwards `codeSegments` via `sliceCodeForHighlights` — entry-local coordinates throughout; the img/alt surface renders no marks by construction (D19-02)
- **Per-page first-occurrence id pass (Task 2, T-19-10):** a `seenHighlightIds` Set per PageFragmentView render (== per mounted page) claims `isFirst` in document order across every slice shape — blockquote children, flat paragraph/heading slices, nested list items (depth-first), caption slices, code segments — always overriding the entry-local-blind slicer flags. Exactly one `id="hl-<id>"` per highlight per mounted document, preceding sibling slices so the D10-03 jump focus lands at the page-local span start
- **Multi-page span cells (Task 2):** unit cells prove the flag arithmetic (multi-entry single-id, split-block two-mounting, page-2-only fragment, items-shape extents + recursion, code-segment override); e2e cells prove real-browser behavior on 3 engines — (a) full-page span crosses onto page N+1 after 18→24 typography repagination with `[id="hl-…"]` count===1 per mounted page, (b) list-containing span marks `li` content on the mounted fragment, (d) caption-endpoint span marks the figcaption with zero img marks and one id
- **Boundary honesty preserved:** capture-rejects.spec.ts byte-unchanged and green (cross-page selection still refuses — ANNO-13 stays Future); zero changes to capture.ts, schema.ts, persistence, app.css

## Task Commits

Each task was committed atomically:

1. **Task 1: Entry-local list threading in page fragments** - `55ba149` (feat)
2. **Task 2: Per-page first-occurrence id pass + multi-page span cells** - `8cc1af7` (feat)

## Files Created/Modified
- `src/pagination/fragmentRenderer.tsx` - computeEntryListItemSlices (entry-local items threading + D19-15 recursion); figure caption + code-block segment forwarding; seenHighlightIds Set + three claim functions; 4 new _test exports
- `tests/unit/annotations/cross-fragment-slicing.test.ts` - 5 new cells (12 total): per-page pass flag arithmetic + items-shape threading
- `tests/e2e/annotations/cross-fragment-render.spec.ts` - 3 new cells (5 total) + 4 helpers (full-page span selection, cross-block-into-element selection, para→list / para→captioned-figure page walkers)

## Decisions Made
- **Caption/code routing: entry-local forwarding** (recorded above as required by the plan's acceptance criteria) — delegation was not available: BlockView's captionHighlightSlices/codeSegments props are caller-computed by design, so the fragment renderer forwards them itself, exactly as ArticleBody does for scrolling. Pinned by cell (d)
- **Claim-by-mutation for the first-occurrence pass** — the slicers create fresh objects per render; the pass flips `isFirst` in place in render order. No copies, no second slicing pass, no prop-shape changes
- **Cell (a) crossing determinism** — full-mounted-page span + font 18→24 guarantees the extent lands on ≥2 pages (line heights grow against a fixed viewport), so the cell asserts the crossing case rather than conditionally observing it
- **requirements-completed [ANNO-09, ANNO-10]** — both close here (19-03's co-claim split honored; ANNO-10's final repagination leg is cell (a))

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - all gates green on first invocation (unit 12/12; e2e 21/21 on chromium/firefox/webkit; full unit suite 1413 passed / 0 failed / 13 documented skips; whole annotations e2e directory 195/195; no stale dev server — :5173 checked clean before every Playwright run per the Phase 18 webkit-starvation lesson).

## User Setup Required
None - no external service configuration required.

## Threat Surface

| Threat | Disposition |
|--------|-------------|
| T-19-10 (Tampering: duplicate ids across page fragments) | MITIGATED — the per-page first-occurrence pass owns isFirst in paginated mode; e2e cell (a) asserts `[id="hl-…"]` count===1 on each mounted page for a page-crossing span (all 3 engines) |
| T-19-11 (Tampering: entry-local coordinate confusion) | ACCEPTED as planned — mirrors the shipped blockquote entry path; Pitfall 4 discipline locked by the items-shape unit cell (extents "AA"/"BBBBBBBB"/"CC" over hand-computed entry-local offsets) |
| T-19-12 (Elevation: cross-page selection escape) | ACCEPTED as planned — no capture changes; capture-rejects.spec.ts measurement-body/cross-page refusal byte-unchanged + green |

No security-relevant surface beyond the plan's threat model was introduced.

## Next Phase Readiness
- 19-05 (eligibility matrix) can exercise list/nested-list/caption/code span rendering through the real UI in BOTH modes — every readable kind now threads marks in paginated fragments with per-page id discipline
- The verifier's UAT can harvest the plan's must_haves truths directly from the shipped cells (page-crossing marks, one id per page, list/caption/code parity, refusal intact)
- No blockers; zero packages, zero schema changes, zero route changes, zero CSS changes

## Self-Check: PASSED

All 3 key-files modified exist on disk; both task commits (55ba149, 8cc1af7) found in git log. Plan-level verification re-confirmed on the final committed state: unit `cross-fragment-slicing.test.ts` 12/12; e2e `cross-fragment-render.spec.ts` + `capture-rejects.spec.ts` 21/21 across chromium/firefox/webkit; full unit suite 1413/0/13; annotations e2e directory 195/195; grep gates pass (seenHighlightIds Set at fragmentRenderer.tsx:123, items walk + nested recursion present, splittingBlockGraphemeLength in entry-local calls, attribute emission unchanged in diff); diff audit clean (capture.ts, schema.ts, persistence, app.css untouched since 0240f0c); no test.skip/test.fixme in the extended spec.

---
*Phase: 19-cross-block-highlights*
*Completed: 2026-08-31*
