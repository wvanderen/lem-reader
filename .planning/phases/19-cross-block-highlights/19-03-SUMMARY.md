---
phase: 19-cross-block-highlights
plan: 03
subsystem: annotations
tags: [highlights, rendering, lists, nested-recursion, figure-captions, code-blocks, first-slice-id, grapheme-offsets, react, vitest, playwright]

# Dependency graph
requires:
  - phase: 19-cross-block-highlights
    provides: 19-01 endpoint-composed span capture + the Pitfall 1 capture-side captionLocalStart alignment this plan mirrors on the render side
  - phase: 05-annotations
    provides: the 05-07 blockquote childHighlightSlices precedent (mirrored for lists), sliceRunsForHighlights + highlightsForBlock consumed unchanged
  - phase: 04-pagination-mvp
    provides: data-block-index mapping + the corpus/pagination e2e matrix the 7th fixture joins
provides:
  - HighlightSlice.isFirst?: boolean + slicer assignment — the first-slice-only DOM id carrier (Pitfall 2 / T-19-07)
  - InlineRenderer stamps id="hl-<id>" ONLY on slice.isFirst === true; data-highlight-id/tabIndex/aria-haspopup/aria-label/tri-state className stay on EVERY slice
  - computeListItemSlices + ListItemSlices BlockView prop — list per-item threading with D19-15 nested-list recursion (scrolling)
  - Caption marks: figure-case captionLocalStart render-side symmetric offset (alt graphemes + BLOCK_SEPARATOR when non-empty) feeding the figcaption InlineList
  - sliceCodeForHighlights(source, blockGlobalStart, highlights, lang) — verbatim-source segmentation; code interiors render disciplined <mark> segments
  - nested-list-paths fixture (7th corpus member: 3-level list recursion + link mid-item) registered in loader + FIXTURES
  - tests/unit/annotations/list-highlight-render.test.tsx — 15 render/slicer cells (Tasks 1-3)
affects: [19-04 paginated twin, 19-05 eligibility matrix + phase gate, review-jump focus targets]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "First-slice-only identity: the DOM id rides exactly one slice per highlight per document (slicer-computed h.position.start >= blockGlobalStart); every slice keeps data-highlight-id — activation targeting and jump focus decouple from id uniqueness"
    - "Self-contained recursion via props: nested list BlockViews receive their own precomputed ListItemSlices structure — no global-start plumbing leaks through the render tree"
    - "Verbatim-source segmentation: code text is raw == norm in the D-05 substrate, so grapheme offsets over the source address the global range directly — no whitespace-collapse alignment layer"
    - "Shared aria-label copy site: highlightAriaLabelForText(text, hasNote, status) exported from InlineRenderer — run slices and code segments derive the §Copywriting label from ONE function"

key-files:
  created:
    - src/fixtures/articles/nested-list-paths.canonical.json
    - tests/unit/annotations/list-highlight-render.test.tsx
  modified:
    - src/annotations/highlightRanges.ts
    - src/content/render/BlockRenderer.tsx
    - src/content/render/InlineRenderer.tsx
    - src/fixtures/index.ts
    - tests/e2e/pagination/fixtures-matrix.ts

key-decisions:
  - "Paginated interim sequencing (plan-discretion clause exercised): the slicer's isFirst comparison is entry-local-blind, so paginated callers (blockGlobalStart=0) keep ids on every mounted-page slice — behavior IDENTICAL to pre-19-03, spec-green; the residual duplicate-id case (multi-block span within one mounted page) is no worse than today and 19-04's per-page first-occurrence pass closes it. Chosen over pulling 19-04's pass forward because the suite stays green AND scrolling (the only mode with same-document multi-mark spans today) gets the full fix now"
  - "CodeSegment carries an additive isFirst?: boolean (plan sketch said {text, entry}) — computed inside sliceCodeForHighlights via the same rule, preserving one-rule symmetry without global-start plumbing into BlockView's code case"
  - "Empty-item separator accounting in computeListItemSlices: after the child loop, childLocalOffset already equals itemStart + itemLen + SEP for non-empty items (trailing per-child separator coincides with the inter-item separator); an empty item still consumes its separator — matches blockText's join exactly"
  - "Plain code segments render as keyed Fragments (no wrapper DOM node) — pre/code inner HTML stays text + mark only, keeping pre geometry byte-stable with ZERO app.css changes"
  - "requirements-completed is [] — ANNO-09's paginated leg + durability close at 19-04 (which co-claims the id), ANNO-12's tested matrix closes at 19-05 (04-02 PAGE-01 split precedent; 19-01's ANNO-12 deferral pattern)"

patterns-established:
  - "Per-kind mark coverage extends by threading precomputed slices through kind-specific BlockView props — the renderer switch stays exhaustive, the slicer stays single"
  - "Every new mark site reuses the one tri-state className + aria discipline — no per-site forks of mark anatomy"

requirements-completed: []  # ANNO-09/ANNO-12 legs ship here; requirements close at 19-04/19-05 (split precedent, see key-decisions)

# Metrics
duration: 14 min
completed: 2026-08-30
status: complete
---

# Phase 19 Plan 03: Scrolling Render Coverage Summary

**List items (incl. 3-level nested lists), figure captions (Pitfall 1 symmetric offset), and code interiors now render span marks with one identity — exactly one DOM id per highlight per document (isFirst), gaps unmarked by construction, corpus grown strengthen-only to 7 fixtures**

## Performance

- **Duration:** 14 min
- **Started:** 2026-08-30T23:38:57Z
- **Completed:** 2026-08-30T23:52:57Z
- **Tasks:** 3
- **Files modified:** 7 (2 created, 5 modified)

## Accomplishments
- **First-slice-only DOM id (Pitfall 2 / T-19-07):** `HighlightSlice.isFirst` set by the slicer on the single contiguous intersection slice (`h.position.start >= blockGlobalStart`); InlineRenderer stamps `id="hl-<id>"` only when `slice.isFirst === true` while `data-highlight-id`, `tabIndex={0}`, `aria-haspopup="dialog"`, per-slice aria-label, and the tri-state className stay on EVERY slice byte-unchanged. The doc comment pins the Plan 19-04 paginated entry-local override caveat. ArticleView untouched — both `getElementById` consumers verified working (the id lives on the span-start slice, which IS the jump target)
- **List per-item threading (D19-13/14/15):** `computeListItemSlices` mirrors the 05-07 blockquote walk over the items-shape — list-local + item-local BLOCK_SEPARATOR accumulators exactly matching `blockText`'s join rule (empty-item separator accounted); paragraph/heading children reuse `highlightsForBlock` + `sliceRunsForHighlights` UNCHANGED; nested lists recurse producing the same nested shape; markers stay CSS chrome (no marker text element — D19-14); non-readable kinds produce no slices (D19-02 by construction)
- **Caption marks (D19-01):** the figure branch computes `captionLocalStart` (alt graphemes + BLOCK_SEPARATOR when alt non-empty, 0 via the filter(Boolean) join otherwise) — the render-side symmetric offset to 19-01's capture fix — gates on the run-sum discipline, and feeds the figcaption InlineList; img/alt never renders marks; the old alt-divergence comment updated (debt paid down on both sides)
- **Code marks (D19-01):** `sliceCodeForHighlights` segments the verbatim source (raw == norm in the D-05 substrate — noted in the header) into ordered `{text, entry, isFirst}` segments that concatenate to EXACTLY the source; the code case wraps highlighted segments in `<mark class="highlight">` with the full InlineRenderer discipline; plain segments are keyed Fragments — zero app.css changes, pre geometry byte-stable
- **Corpus grown strengthen-only:** `nested-list-paths` (7th member — bulleted > bulleted > numbered 3-level recursion, link run mid-item) registered in the loader + FIXTURES; PERF_FIXTURES untouched; every corpus consumer green with 7 fixtures

## Task Commits

Each task was committed atomically:

1. **Task 1: HighlightSlice.isFirst + first-slice-only DOM id** - `976d20f` (feat)
2. **Task 2: List per-item threading + nested-list fixture** - `cb94c4b` (feat)
3. **Task 3: Caption marks + code marks** - `a04b50c` (feat)

## Files Created/Modified
- `src/annotations/highlightRanges.ts` - isFirst field + slicer assignment; sliceCodeForHighlights + CodeSegment (pure, jsdom-safe)
- `src/content/render/InlineRenderer.tsx` - conditional id stamping; highlightAriaLabelForText exported as the shared §Copywriting derivation
- `src/content/render/BlockRenderer.tsx` - computeListItemSlices + ListItemSlices threading; caption offset + code segment paths; coverage comments updated
- `src/fixtures/articles/nested-list-paths.canonical.json` - NEW: D19-15 recursion fixture (schema-valid at load, proven by the corpus specs)
- `src/fixtures/index.ts` - 7th fixture registered (static import + array entry)
- `tests/e2e/pagination/fixtures-matrix.ts` - FIXTURES gains nested-list-paths (7 entries); count comments updated
- `tests/unit/annotations/list-highlight-render.test.tsx` - NEW: 15 cells across Tasks 1-3

## Decisions Made
- **Paginated interim keeps today's id behavior** (plan's sequencing discretion) — the slicer comparison `h.position.start >= blockGlobalStart` is always-true under paginated entry-local coordinates, so paginated marks keep their ids exactly as before this plan; only one PageFragmentView is mounted at a time, the residual duplicate case (multi-block span within one page) is identical to pre-19-03 behavior, and no spec asserts ids in paginated mode. Scrolling — the only mode with same-document multi-mark spans — gets the complete fix now; 19-04 lands the per-page first-occurrence pass
- **`CodeSegment.isFirst` computed inside the segmentation** rather than at the render site — one rule, one computation site, BlockView stays free of global-start plumbing
- **`highlightAriaLabelForText` shared derivation** — the run-slice path and the code-segment path draw the aria copy from ONE exported function instead of forking the §Copywriting contract
- **requirements-completed: []** — ANNO-09 co-claimed by 19-04 (paginated twin + durability), ANNO-12 by 19-05 (tested matrix); this plan ships the scrolling render legs (04-02 PAGE-01 split precedent)

## Deviations from Plan

None - plan executed exactly as written.

(The paginated interim sequencing was an explicit in-plan discretion clause — "choose the sequencing that keeps the suite green and record it in the SUMMARY" — exercised and recorded under Decisions Made, not a deviation. One test-selector fix during Task 2 cell authoring — `ul > li` matched nested items; scoped to `:scope > li` on the outer list — is normal test-writing iteration, and one off-by-one in hand-computed cell-(d) offsets was corrected before commit.)

## Issues Encountered
None - no stale dev servers (checked :5173 before every Playwright run per the Phase 18 webkit-starvation lesson); all gates green on first invocation after the two in-flight test authoring corrections noted above.

## User Setup Required
None - no external service configuration required.

## Threat Surface

| Threat | Disposition |
|--------|-------------|
| T-19-07 (Tampering: DOM clobbering via duplicate mark ids) | MITIGATED for scrolling — first-slice-only id locked by rendered cells asserting exactly one `[id="hl-…"]` per multi-slice highlight; ids derive from crypto.randomUUID highlight ids. Paginated interim identical to pre-plan behavior; 19-04 closes it |
| T-19-08 (Tampering: code/caption rendering of persisted ranges) | MITIGATED as planned — React text children only; segments are string slices of the stored source; no dangerouslySetInnerHTML (react/no-danger verified firing) |
| T-19-09 (DoS: pathological highlight counts in per-item walks) | ACCEPTED as planned — buildBlockHighlightIndex consumed unchanged (one linear pass, null when no highlights); computeListItemSlices runs only under that gate |

No security-relevant surface beyond the plan's threat model was introduced.

## Next Phase Readiness
- 19-04 (paginated twin) consumes: the isFirst flag contract (its per-page first-occurrence pass overrides entry-local slices), the ListItemSlices/caption/code prop shapes, and the 7-fixture corpus — all shipped here
- 19-05's eligibility matrix can exercise list/nested-list/caption/code render coverage through the real UI on the nested-list-paths fixture
- No blockers; zero packages, zero schema changes, zero route changes, zero CSS changes

## Self-Check: PASSED

All 7 key-files exist on disk; all 3 task commits (976d20f, cb94c4b, a04b50c) found in git log. Plan-level verification re-confirmed on the final state: unit annotations 133/133, full unit suite 1408 passed / 0 failed / 13 documented skips, gated e2e 270/270 (annotations directory + coverage-invariant + core-reading-flow, chromium/firefox/webkit, 7-fixture corpus) + open-every-fixture 27/27, grep gates pass (isFirst + computeListItemSlices present; splitParagraphRuns defined only in splitBlock.ts; `git diff f38990e..HEAD` touches nothing under src/content/schema.ts or src/persistence/; `git diff src/app.css` empty).

---
*Phase: 19-cross-block-highlights*
*Completed: 2026-08-30*
