# Phase 19: Cross-Block Highlights - Context

**Gathered:** 2026-08-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 19 is the **v2.1 cross-block-highlights phase** — readers capture and
manage ONE durable, honest annotation spanning multiple supported semantic
blocks:

1. **ANNO-08 — span capture.** A native selection spanning eligible mounted
   blocks creates one highlight (the D5-06 single-block rule is retired at
   the capture layer).
2. **ANNO-09 — one identity, global range.** A cross-block highlight
   persists as one article-global half-open grapheme range with one
   identity and one optional note (D5-10 NoteRecord 1:1 unchanged), while
   rendering as the required block-local fragments.
3. **ANNO-10 — attachment durability.** It stays attached through
   repagination, mode changes, typography changes, reopening,
   review-to-reader navigation, and export/import (the existing
   article-global selector substrate is the mechanism).
4. **ANNO-11 — atomic management.** Review, note edit, export, and delete
   operate on the whole highlight atomically — no leftover fragments, no
   guessed attachment.
5. **ANNO-12 — eligibility honesty.** Unsupported selection boundaries are
   rejected (not narrowed) with an explicit explanation, per a tested
   eligibility matrix covering paragraphs, headings, lists, quotations,
   code, captions, footnotes, and non-text gaps.

**Phase 19 does NOT ship** (later phases — do not fold in):
- **Local image fidelity (IMG-*)** — Phase 20. Figures stay as-is; the
  matrix only decides highlight behavior around them.
- **POLISH-08..11 + acceptance matrix (ACPT-07/08)** — Phase 21.
- **New annotation KINDS** (underlines, block-level bookmarks, annotation
  colors/styles) — out of scope; highlights + notes only.
- **Selection narrowing machinery** — rejected this phase (D19-05); a
  future "smart narrow" is a backlog candidate, not a hidden default.

**Load-bearing invariants (locked by prior phases — do NOT re-ask):**
- `HighlightRecordSchema.position` is ALREADY an article-global
  TextPositionSelector (D5-03) + `quote` TextQuoteSelector recovery — the
  storage model is cross-block-capable; expect NO schema/Dexie change for
  the range itself (Pitfall 9).
- D5-02 tri-state resolution (confident|ambiguous|orphan) with the
  ANNO-07 rendering-layer filter (`resolvedPosition !== null`) — never
  silent re-attach.
- D5-16 cross-fragment rendering — per-slice `<mark>` elements sharing one
  `data-highlight-id` (split-block precedent to extend across blocks).
- D5-13 no-overlap policy via `rangesOverlap` (end-exclusive touching OK).
- D5-07 per-kind eligibility switch in `capture.ts` — exhaustive, NO
  default (Pattern F).
- D5-08 measurement-body exclusion (user-select:none + defensive check);
  D4-10 mode-switch anchor; D5-11 `turnToPage`/`getPages`;
  `data-block-index` / `data-block-grapheme-start` slice attributes.
- 05-07 blockquote per-child highlighting shipped; list items were
  INTENTIONALLY deferred (items-shape) — this phase closes that debt.
- Honest full-suite gate (`npm run test` exit 0); byte-stable anchors +
  strengthen-only; calm DOC-06 copy; reduced-motion gates; 44px targets.

</domain>

<decisions>
## Implementation Decisions

### Eligibility matrix (ANNO-12)

- **D19-01: ALL readable kinds are spannable** — paragraph, heading,
  quotation, list, figure caption, code-block, footnote-reference. One
  mental model extends D5-07: "if you can read it, a highlight can span
  it." The matrix's job is testing each kind's crossing, not gating kinds.
- **D19-02: Non-text gaps are CROSSED CALMLY** — a span may cross a
  textless figure or unsupported block; the highlight continues on both
  sides as ONE identity, the gap itself renders unhighlighted. No
  rejection for interior gaps.
- **D19-03: Nested readable children COUNT as blocks** — a span may start
  or end inside a list item or a quotation's child, and run child →
  sibling-block → child as one range. Children already carry
  `data-block-index`; no second-class citizens.
- **D19-04: NO span cap** — no block-count or article-percentage limit.
  Trust the reader; the global no-overlap policy (D19-07) is the natural
  limiter. A whole-article highlight is honest, if unusual.

### Unsupported boundaries — reject, don't narrow (ANNO-12)

- **D19-05: REJECT WHOLE on ineligible boundaries** — when a selection's
  endpoints sit inside or adjacent to ineligible content, the entire
  selection is refused calmly. No largest-eligible-sub-span machinery, no
  guessed shrinkage. The reader re-selects.
- **D19-06: The explanation surfaces in the EXISTING SELECTION TOOLBAR
  hint** — the same inline channel as today's multi-block/overlap hints
  (D5-06 precedent). Calm reason naming the problem ("selection includes
  unsupported content" — exact copy = planner). No new note surface.
- **D19-07: D5-13 generalizes to GLOBAL no-overlap** — a new span
  (single- OR cross-block) may not overlap ANY existing highlight's
  article-global range. One policy, one `rangesOverlap` check on global
  ranges; touching endpoints remain allowed. No per-block special cases.
- **D19-08: Eligibility is STRICTLY all-or-nothing per span** — every
  crossed block must be eligible (interior non-text gaps per D19-02
  excepted). No kind-pair rules (no "prose+caption but never +code").

### Capture + review + export surfaces (ANNO-08, ANNO-11)

- **D19-09: The selection toolbar is UNCHANGED for spans** — the Highlight
  button just works on multi-block selections; no new affordance, no span
  feedback, no block count. The refusal hint (D19-06) is the only new
  capture-adjacent copy.
- **D19-10: Review excerpt = FIRST FRAGMENT + calm ellipsis** — one
  cross-block highlight excerpts its opening text then "…" in the
  Highlights review panel. Rows stay compact and scannable; the full span
  is visible in the reader.
- **D19-11: NO multi-block indicator anywhere** — no "×4 blocks" badge on
  review rows, no special mark styling announcing span-ness. One
  highlight is one highlight; the rendered marks make the extent
  self-evident.
- **D19-12: Markdown export keeps block breaks in ONE entry** — a
  cross-block highlight exports as a single HighlightSection whose text
  preserves block-boundary line breaks (mirrors how it reads in the
  reader), never a single joined line.

### List interiors (closes the 05-07 deferral)

- **D19-13: FULL per-item list support** — list items become individually
  highlightable, spannable children (the blockquote-children precedent).
  The 05-07 "different items-shape" deferral is paid down this phase.
- **D19-14: List markers are NEVER part of a highlight** — bullets and
  numbers are generated chrome outside the D-05 substrate; a highlight
  starting at an item's first character covers text only.
- **D19-15: Nested lists RECURSE** — sub-list items are readable children
  under the same per-item rule. No flattening special case in the matrix.

### the agent's Discretion

- **Multi-block capture internals** — how `captureSelection` extends from
  endpoint-block equality to span validation: walking intermediate blocks,
  gap classification (interior gap vs boundary-ineligible), slice-offset
  composition (D5-08 `data-block-grapheme-start` math at both endpoints),
  and the CaptureResult reason taxonomy (retire `"multi-block"`, add
  boundary/gap reasons).
- **Renderer path for spanning ranges** — how `sliceRunsForHighlights`
  intersection math + per-block `highlightsForBlock` consume one global
  range across blocks; the per-list-item threading shape (mirror 05-07's
  `childHighlightSlices` on BlockView for the items-shape); how interior
  gaps render unhighlighted by construction.
- **Quote-selector composition across blocks** — how `quote.exact` composes
  over multi-block normalized text (BLOCK_SEPARATOR inclusion), and how
  `resolveQuoteSelector` re-anchors spans (tri-state unchanged; researcher
  validates drift behavior for long spans).
- **Review jump target** — the review-to-reader deep-link lands at the
  span's start (D10-03 machinery; expected — confirm in plan).
- **Paginated multi-page marks** — D5-16 extension: a span crossing page
  boundaries renders marks on each page sharing one id (precedent covers
  split blocks; spans are the same rule over more blocks).
- **Matrix test shape** — the e2e/unit eligibility-matrix cells (kind ×
  crossing × gap placement) across the 3-engine discipline; honest
  full-suite gate; which existing annotations specs legitimately update
  (multi-block refusal specs change honestly).
- **Refusal copy wording** — exact DOC-06-calm toolbar hint strings.
- **Schema surface check** — expected zero Dexie/schema changes; if the
  researcher finds one (e.g. quote length caps), surface it per Pitfall 9.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project intent & requirements
- `.planning/ROADMAP.md` — §Phase 19 goal + 5 success criteria (span
  capture; one identity/global range/note; attachment durability; atomic
  management; tested eligibility matrix with explicit refusal). `**UI hint**: yes`.
- `.planning/REQUIREMENTS.md` — ANNO-08..12 (§Annotations); traceability
  table (Phase 19 rows); Future Requirements.
- `.planning/PROJECT.md` — Constraints (honesty: no silent garbage,
  annotations never silently re-attach; canonical document model is the
  security boundary; accessibility foundational).

### Prior-phase contracts this phase extends
- `.planning/phases/18-reader-orientation/18-CONTEXT.md` — canonical
  destination substrate (blockStartOffsets over D-05), mode-aware jump
  machinery, invariants list this phase inherits unchanged.
- v2.0/v1.0 annotation contracts via `.planning/STATE.md` decision index —
  D5-02 (tri-state), D5-03 (selectors), D5-06 (single-block rule being
  retired), D5-07 (eligibility), D5-08 (measurement-body), D5-10 (note
  1:1/empty policy), D5-11 (turnToPage), D5-13 (no-overlap), D5-16
  (cross-fragment slicing), 05-07 (blockquote children threading; lists
  deferral), ANNO-07 (rendering-layer filter).
- `.planning/phases/16-organized-library-and-focused-add-flow/16-CONTEXT.md`
  — D16-01 dialog discipline (review/edit surfaces stay structural
  clones), calm-copy vocabulary.

### Source code contracts (READ before implementing)
- `src/annotations/capture.ts` — `captureSelection` (the D5-06
  `"multi-block"` rejection at L339 is the code this phase replaces);
  `buildRawToNormMap`/`domRangeToIntraBlockGraphemeRange` whitespace
  alignment; `computeBlockGlobalStart`; `isEligibleBlock` exhaustive
  switch; D5-08 slice-offset handling.
- `src/annotations/highlightRanges.ts` — `HighlightSliceEntry` (status
  tri-state threading), `sliceRunsForHighlights` D5-16 intersection math
  the spanning renderer reuses.
- `src/annotations/overlap.ts` — `rangesOverlap` (D19-07's global check —
  already operates on global ranges; verify callers pass them).
- `src/annotations/resolution.ts` — `resolveQuoteSelector` tri-state;
  quote composition across blocks extends here.
- `src/content/schema.ts` — `HighlightRecordSchema` (L396-405: position +
  quote + revision), `NoteRecordSchema` (L410-417), `Block` union kinds.
- `src/content/normalizeText.ts` — `blockNormalizedText`,
  `BLOCK_SEPARATOR`, `graphemeClusters`, `TextPositionSelector` (the
  D-05 substrate — REUSE-DO-NOT-FORK).
- `src/content/render/BlockRenderer.tsx` — per-kind rendering + the 05-07
  `childHighlightSlices` blockquote path the list-items path mirrors;
  where item interiors mount.
- `src/routes/ArticleView.tsx` — capture wiring (L325 enriched capture
  result), readingRoot + measurement-body defense, review deep-link jump.
- `src/reader/annotations/SelectionToolbar.tsx` — the hint surface
  (D19-06): L244 multi-block copy to retire/replace.
- `src/reader/annotations/HighlightOverlay.tsx` — reason union (L83)
  shared with the toolbar.
- `src/reader/annotations/useAnnotationState.ts` — create/save flow the
  overlap check (D19-07) extends.
- `src/pagination/fragmentRenderer.tsx` — `resolveBlockSlice` +
  entry-local coordinate slicing (D5-16) for paginated multi-page marks.
- `src/pagination/splitBlock.ts` — `splitParagraphRuns` (the slicer
  consumed, never reimplemented).
- `src/routes/review/ReviewView.tsx`, `reviewFilter.ts`,
  `ReviewNoteDialog.tsx`, `DeleteHighlightConfirm.tsx` — the atomic
  review/edit/delete surfaces (D19-10 excerpt shape; guard-single-commit
  precedents).
- `src/portability/markdown.ts` — `HighlightSection` (D19-12 export
  shape), `escapeMarkdownLine` discipline.
- `src/persistence/highlightsStore.ts` + `src/persistence/db.ts` —
  save/load paths; compound index; Pitfall 9 expectation of no change.
- `tests/e2e/annotations/` — existing capture/render/review specs the
  matrix specs join; multi-block-refusal specs that change honestly.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Article-global selector storage** — `HighlightRecord.position` needs
  no migration to hold a spanning range; capture and rendering are the
  only real work surfaces.
- **`sliceRunsForHighlights` intersection math** — per-block intersection
  of global ranges is already boundary-agnostic; a spanning range mostly
  "just works" if each block queries it.
- **05-07 child-threading precedent** — blockquote children render
  highlight slices today; the list items-shape is a known, scoped
  extension of a shipped pattern.
- **`rangesOverlap`** — global disjointness check exists; D19-07 is a
  caller discipline, not new math.
- **Selection toolbar hint channel** — typed refusal reasons already
  render inline; new reasons slot into the existing union.

### Established Patterns
- One durable currency: article-global grapheme offsets; page/DOM shapes
  are always derived, never stored.
- Honest refusal over guessed repair (D19-05 echoes DOC-06/
  never-silently-guess across the project).
- Structural-clone dialogs; guard-single-commit destructive actions
  (deleteHighlight transaction = the atomic ANNO-11 mechanism).
- Byte-stable anchors + strengthen-only; honest full-suite gate across
  chromium/firefox/webkit.

### Integration Points
- `capture.ts` `CaptureResult` — new span/boundary reason taxonomy;
  retire `"multi-block"`.
- `BlockRenderer.tsx` — list-item children threading + interior-gap
  rendering.
- `fragmentRenderer.tsx` — paginated spanning marks (D5-16 extension).
- `SelectionToolbar.tsx`/`HighlightOverlay.tsx` — refusal hint copy.
- `useAnnotationState.ts` — global overlap check before save.
- `ReviewView.tsx` + `markdown.ts` — excerpt + export shapes.
- `tests/e2e/annotations/` — eligibility-matrix corpus/spec cells.

</code_context>

<specifics>
## Specific Ideas

- **"If you can read it, a highlight can span it"** — the D5-07 sentence,
  extended from blocks to spans (D19-01).
- **"A gap is not a boundary"** — interior non-text gaps are crossed
  calmly; only endpoint eligibility refuses (D19-02/D19-05).
- **"One highlight is one highlight"** — no span badges, no special
  chrome, one row, one note, one delete (D19-09..11).
- **"Markers are chrome, not text"** — bullets/numbers never highlight
  (D19-14).

</specifics>

<deferred>
## Deferred Ideas

- **Smart narrowing** — shrink an ineligible selection to its largest
  eligible sub-span with explanation; rejected this phase (D19-05
  chose reject-whole). Backlog candidate if re-selecting proves tedious
  in practice.
- **Span feedback during selection** — live "3 blocks selected" toolbar
  affordance; rejected (D19-09); revisit on concrete reader confusion.
- **Quiet span badge on review rows** — "×N blocks" extent hint;
  rejected (D19-11); revisit if long spans make rows ambiguous.
- **New annotation kinds (colors, underline styles)** — out of scope;
  highlights + notes only this phase.

</deferred>

---

*Phase: 19-cross-block-highlights*
*Context gathered: 2026-08-30*
