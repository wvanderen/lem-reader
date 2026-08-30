# Phase 19: Cross-Block Highlights - Research

**Researched:** 2026-08-30
**Domain:** Annotation capture/render/persistence extension over the D-05 grapheme substrate (internal codebase domain — no new external dependencies)
**Confidence:** HIGH (all findings verified against source in this session; line-cited)

## Summary

Phase 19 is a **codebase-archaeology phase, not a library-evaluation phase**. The article-global selector storage model (`HighlightRecordSchema.position` + `quote`, `src/content/schema.ts` L396-405) is already cross-block-capable — a spanning range needs **zero Dexie/schema changes** (verified: `TextPositionSelectorSchema` is an unbounded int range; `TextQuoteSelectorSchema.exact` has `.min(1)` and no max; the `[articleId+revision]` compound index and cascade-delete transaction are untouched). The real work surfaces are exactly three: (1) **capture** — replace the 3-line `"multi-block"` gate at `capture.ts` L338-340 with per-endpoint global-offset composition, (2) **rendering** — extend per-block mark threading to list items, figure captions, and code blocks (lists mirror the shipped 05-07 blockquote `childHighlightSlices` precedent; captions/code have NO mark rendering today), and (3) **excerpt/export surfaces** — first-fragment excerpts (D19-10) and multi-line Markdown handling (D19-12).

Three load-bearing discoveries emerged from source verification. **First**, the figure block has a silent mis-capture hazard TODAY: `blockNormalizedText(figure)` = `alt + "\n" + caption` but the DOM `textContent` of a `<figure>` element is caption-only (alt is an `<img>` attribute, not a text node) — so `buildRawToNormMap` mis-aligns by `alt.length + 1` whenever a capture endpoint sits inside a caption of a figure with non-empty alt. The figure-heavy fixture has BOTH figures with non-empty alt AND captions, so the eligibility matrix will hit this. **Second**, `InlineRenderer.tsx` L121 stamps `id={`hl-${slice.highlightId}`}` on EVERY `<mark>` slice — safe today (one mark per highlight in DOM at any time; paginated mode mounts one page at a time, verified `PaginatedSurface.tsx` L3/L660), but a cross-block span in scrolling mode renders N marks with N identical DOM ids in ONE document — invalid HTML, `getElementById` ambiguity for the review-jump focus target. **Third**, `quote.exact` for a span naturally contains `BLOCK_SEPARATOR` (`"\n"`) — the Markdown exporter (`markdown.ts` L159) embeds `exact` inside a single `> `-prefixed line, so a multi-line exact breaks out of the blockquote structure (a latent issue even today for code-block highlights whose verbatim source contains newlines — verified: technical-post fixture code blocks contain 2-8 newlines).

**Primary recommendation:** Extend the endpoint-based capture math (no DOM walking of intermediate blocks — the global range derives from endpoints alone), mirror the 05-07 child-threading pattern for lists, solve the figure alt-offset before caption endpoints are declared eligible, stamp `id="hl-<id>"` on the first slice only (`data-highlight-id` on all), and derive first-fragment excerpts + per-line Markdown escaping as pure helpers.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Eligibility matrix (ANNO-12)

- **D19-01: ALL readable kinds are spannable** — paragraph, heading, quotation, list, figure caption, code-block, footnote-reference. One mental model extends D5-07: "if you can read it, a highlight can span it." The matrix's job is testing each kind's crossing, not gating kinds.
- **D19-02: Non-text gaps are CROSSED CALMLY** — a span may cross a textless figure or unsupported block; the highlight continues on both sides as ONE identity, the gap itself renders unhighlighted. No rejection for interior gaps.
- **D19-03: Nested readable children COUNT as blocks** — a span may start or end inside a list item or a quotation's child, and run child → sibling-block → child as one range. Children already carry `data-block-index`; no second-class citizens.
- **D19-04: NO span cap** — no block-count or article-percentage limit. Trust the reader; the global no-overlap policy (D19-07) is the natural limiter. A whole-article highlight is honest, if unusual.

#### Unsupported boundaries — reject, don't narrow (ANNO-12)

- **D19-05: REJECT WHOLE on ineligible boundaries** — when a selection's endpoints sit inside or adjacent to ineligible content, the entire selection is refused calmly. No largest-eligible-sub-span machinery, no guessed shrinkage. The reader re-selects.
- **D19-06: The explanation surfaces in the EXISTING SELECTION TOOLBAR hint** — the same inline channel as today's multi-block/overlap hints (D5-06 precedent). Calm reason naming the problem ("selection includes unsupported content" — exact copy = planner). No new note surface.
- **D19-07: D5-13 generalizes to GLOBAL no-overlap** — a new span (single- OR cross-block) may not overlap ANY existing highlight's article-global range. One policy, one `rangesOverlap` check on global ranges; touching endpoints remain allowed. No per-block special cases.
- **D19-08: Eligibility is STRICTLY all-or-nothing per span** — every crossed block must be eligible (interior non-text gaps per D19-02 excepted). No kind-pair rules (no "prose+caption but never +code").

#### Capture + review + export surfaces (ANNO-08, ANNO-11)

- **D19-09: The selection toolbar is UNCHANGED for spans** — the Highlight button just works on multi-block selections; no new affordance, no span feedback, no block count. The refusal hint (D19-06) is the only new capture-adjacent copy.
- **D19-10: Review excerpt = FIRST FRAGMENT + calm ellipsis** — one cross-block highlight excerpts its opening text then "…" in the Highlights review panel. Rows stay compact and scannable; the full span is visible in the reader.
- **D19-11: NO multi-block indicator anywhere** — no "×4 blocks" badge on review rows, no special mark styling announcing span-ness. One highlight is one highlight; the rendered marks make the extent self-evident.
- **D19-12: Markdown export keeps block breaks in ONE entry** — a cross-block highlight exports as a single HighlightSection whose text preserves block-boundary line breaks (mirrors how it reads in the reader), never a single joined line.

#### List interiors (closes the 05-07 deferral)

- **D19-13: FULL per-item list support** — list items become individually highlightable, spannable children (the blockquote-children precedent). The 05-07 "different items-shape" deferral is paid down this phase.
- **D19-14: List markers are NEVER part of a highlight** — bullets and numbers are generated chrome outside the D-05 substrate; a highlight starting at an item's first character covers text only.
- **D19-15: Nested lists RECURSE** — sub-list items are readable children under the same per-item rule. No flattening special case in the matrix.

### the agent's Discretion

- **Multi-block capture internals** — how `captureSelection` extends from endpoint-block equality to span validation: walking intermediate blocks, gap classification (interior gap vs boundary-ineligible), slice-offset composition (D5-08 `data-block-grapheme-start` math at both endpoints), and the CaptureResult reason taxonomy (retire `"multi-block"`, add boundary/gap reasons).
- **Renderer path for spanning ranges** — how `sliceRunsForHighlights` intersection math + per-block `highlightsForBlock` consume one global range across blocks; the per-list-item threading shape (mirror 05-07's `childHighlightSlices` on BlockView for the items-shape); how interior gaps render unhighlighted by construction.
- **Quote-selector composition across blocks** — how `quote.exact` composes over multi-block normalized text (BLOCK_SEPARATOR inclusion), and how `resolveQuoteSelector` re-anchors spans (tri-state unchanged; researcher validates drift behavior for long spans).
- **Review jump target** — the review-to-reader deep-link lands at the span's start (D10-03 machinery; expected — confirm in plan).
- **Paginated multi-page marks** — D5-16 extension: a span crossing page boundaries renders marks on each page sharing one id (precedent covers split blocks; spans are the same rule over more blocks).
- **Matrix test shape** — the e2e/unit eligibility-matrix cells (kind × crossing × gap placement) across the 3-engine discipline; honest full-suite gate; which existing annotations specs legitimately update (multi-block refusal specs change honestly).
- **Refusal copy wording** — exact DOC-06-calm toolbar hint strings.
- **Schema surface check** — expected zero Dexie/schema changes; if the researcher finds one (e.g. quote length caps), surface it per Pitfall 9.

### Deferred Ideas (OUT OF SCOPE)

- **Smart narrowing** — shrink an ineligible selection to its largest eligible sub-span with explanation; rejected this phase (D19-05 chose reject-whole). Backlog candidate if re-selecting proves tedious in practice.
- **Span feedback during selection** — live "3 blocks selected" toolbar affordance; rejected (D19-09); revisit on concrete reader confusion.
- **Quiet span badge on review rows** — "×N blocks" extent hint; rejected (D19-11); revisit if long spans make rows ambiguous.
- **New annotation kinds (colors, underline styles)** — out of scope; highlights + notes only this phase.

Also out of scope per phase boundary: IMG-* (Phase 20), POLISH-08..11 + ACPT-07/08 (Phase 21), ANNO-13 (unmounted-page spans) and ANNO-14 (disjoint highlights) are Future Requirements.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ANNO-08 | Reader can create one highlight from a native selection spanning multiple supported semantic text blocks that are present in the mounted reading surface. | Capture endpoint math verified (`capture.ts` — replace L338-340 equality gate; per-endpoint `findBlockAncestor` + `domRangeToIntraBlockGraphemeRange` + `computeBlockGlobalStart` compose the global range; no intermediate walk needed). Mounted-surface constraint is inherent: paginated mode mounts one page at a time and the measurement body is `user-select:none` + guarded. |
| ANNO-09 | A cross-block highlight persists as one article-global half-open grapheme range with one identity and optional note, while rendering as the required block-local fragments. | Schema verified cross-block-capable with zero change; per-block intersection math (`highlightsForBlock`, `sliceHighlightsForEntry`) is boundary-agnostic; NoteRecord 1:1 unchanged; D5-16 per-slice `<mark data-highlight-id>` extends. |
| ANNO-10 | Cross-block highlights remain attached to the same text across repagination, mode changes, typography changes, reopening, export/import, and review-to-reader navigation. | Article-global range + TextQuoteSelector recovery is layout-independent by construction (D-05); `resolveQuoteSelector` long-needle behavior analyzed (first-cluster guard keeps cost bounded; same-revision path is the unique-exact fast path); D10-03 jump lands at `position.start` (verified `ArticleView.tsx` L1571). |
| ANNO-11 | Reader can review, edit the note for, export, and delete a cross-block highlight atomically without leaving partial fragments or silently guessing at an unresolved anchor. | `deleteHighlight` Dexie transaction already cascades highlight+note atomically; review rows/drawer are id-keyed (one row per record regardless of block count); export renders from `quote.exact` (needs multi-line handling per D19-12). |
| ANNO-12 | Unsupported selection boundaries are rejected or narrowed with an explicit explanation according to a tested eligibility matrix for paragraphs, headings, lists, quotations, code, captions, footnotes, and non-text gaps. | `isEligibleBlock` exhaustive switch (Pattern F) is the eligibility source; toolbar hint union (`CaptureResult.reason` + `"overlap"`) extends with boundary reasons; fixture corpus covers all 9 kinds across 6 fixtures (verified kind census) except nested lists (gap — see Validation Architecture). |
</phase_requirements>

## Project Constraints (from AGENTS.md)

- **Workflow enforcement:** phase work runs through GSD entry points (`/gsd-execute-phase` for planned work); no direct repo edits outside a GSD workflow.
- **Security:** the canonical document model is the security boundary — sanitize once at ingest; NEVER `dangerouslySetInnerHTML` (ESLint `react/no-danger` enforces; `lint:no-danger` script exists). Note/excerpt text renders as React text children only (verified in ReviewView/NotePopover/markdown.ts). No new HTML parsing, no new URL fields.
- **Honesty:** no silent garbage — unsupported content refuses calmly with reader-visible reasons; annotations never silently re-attach (D5-02 tri-state + ANNO-07 rendering filter are locked invariants).
- **Accessibility:** semantic HTML, keyboard navigation, visible focus, reduced motion, 44px targets are foundational. New marks must preserve the existing `<mark tabindex=0 aria-label>` discipline; forced-colors shape distinction (fill / has-note dotted / unresolved dashed) extends, not forks.
- **Reading modes:** both paginated and scrolling must work; page/DOM shapes are always derived, never stored.
- **Stack discipline (STACK.md):** no Redux/Zustand, no Tailwind/component suite, no DOM emulators for pagination truth (Playwright 3-engine), no annotation framework — W3C-inspired internal selectors only. This phase adds NO packages.
- **Test discipline:** byte-stable anchors + strengthen-only edits to existing specs (except the honestly-changing multi-block refusal specs, sanctioned by CONTEXT); honest full-suite gate (`npm run test` exit 0); no test.skip/test.fixme.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Span capture (DOM Selection → global range) | Browser/client (`src/annotations/capture.ts`) | — | Selection/Range APIs only exist client-side; pure offset math over the D-05 substrate |
| Eligibility decision (matrix) | Client domain logic (`isEligibleBlock` + endpoint rules) | — | Same exhaustive-switch site D5-07 established; Pattern F compile-time exhaustiveness |
| Span persistence (one record) | Client storage (`highlightsStore.ts` / Dexie) | — | Record shape already holds a global range; single `put`, single cascade-delete transaction |
| Span rendering (block-local fragments) | Client renderer (`BlockRenderer.tsx`, `fragmentRenderer.tsx`, `InlineRenderer.tsx`) | — | Marks render INTO the semantic tree (no parallel renderer — DOC-02); per-block threading |
| Re-anchoring (durability) | Client domain logic (`resolution.ts`) | — | Pure quote re-resolution over normalized text; layout-independent |
| Overlap policy (D19-07) | Client state layer (`HighlightOverlay.captureCurrentSelection`) | — | Already operates on global ranges via `rangesOverlap` — caller discipline only |
| Review/excerpt/export surfaces | Client routes (`ReviewView.tsx`, `markdown.ts`) | — | First-fragment excerpt + multi-line export are pure derivations from `quote.exact` |
| Refusal hint surface | Client UI (`SelectionToolbar.tsx` + `HighlightOverlay.tsx` reason union) | — | The existing inline hint channel (D19-06); no new surface |

## Standard Stack

### Core (existing internal modules — this phase EXTENDS, never forks)

| Module | Role in Phase 19 | Extension Point |
|--------|------------------|-----------------|
| `src/annotations/capture.ts` | Span capture | Retire the L338-340 `startBlock !== endBlock` gate; compose per-endpoint global offsets; extend `CaptureResult` reason union |
| `src/annotations/highlightRanges.ts` | Per-block run slicing | UNCHANGED math (intersection is boundary-agnostic); consumed by new list/caption/code paths |
| `src/content/render/BlockRenderer.tsx` | Scrolling renderer | Add list per-item `childHighlightSlices` threading (mirror 05-07 blockquote path); caption/code mark coverage decision |
| `src/pagination/fragmentRenderer.tsx` | Paginated renderer | `sliceHighlightsForEntry` already global-range-driven; extend per-child threading to the items-shape for list entries |
| `src/annotations/resolution.ts` | Re-anchoring | Zero algorithm change; validate long-span drift (analyzed below) |
| `src/reader/annotations/HighlightOverlay.tsx` | Capture+overlap seam | `captureCurrentSelection` overlap check generalizes with zero math change |
| `src/routes/review/ReviewView.tsx` + `src/portability/markdown.ts` | Review + export | First-fragment excerpt helper; per-line Markdown escaping for multi-line exact |

### Supporting (verified present — no installs)

| Module | Verified Fact |
|--------|---------------|
| `src/content/normalizeText.ts` | `BLOCK_SEPARATOR = "\n"` (L13); `articleGraphemeIndex` provides `blockStartOffsets` prefix sums (L167-195, WeakMap-cached per article object); `deriveQuoteSelector` contextRadius=32 (L225) |
| `src/annotations/overlap.ts` | `rangesOverlap` = strict 1-D interval test, touching OK (L23-28) — already global-range semantics |
| `src/persistence/highlightsStore.ts` | `[articleId+revision]` compound range query; cascade-delete transaction (L105-110); per-row Zod drop on read |
| `src/pagination/splitBlock.ts` | `splitParagraphRuns` (the ONLY run slicer — Pitfall 4); `sliceList`/`sliceChildBlocks` recursive container slicing exists for pagination |
| `tests/e2e/annotations/_fixtures.ts` | Harness: `selectRangeInBlock`, `findFirstBlockWithText`, `turnToPage`, `totalPages`, `wipeDatabase` — the matrix specs' reuse base |

**Installation:** NONE. Zero new packages; zero version bumps. [VERIFIED: package.json scripts/deps read this session]

## Package Legitimacy Audit

**Not applicable — this phase installs no external packages.** All work extends existing internal modules over the shipped stack (React 19.2.8 / TypeScript / Vite 8 / Dexie 4 / Zod 4 / Playwright 1.61.1 / @axe-core/playwright 4.12.1 — already locked in STACK.md with prior legitimacy evidence).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| — (none) | — | — | — | — | — | No new packages |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram (span lifecycle)

```
native Selection (multi-block)
        │
        ▼
selectionchange (ArticleView, rAF-coalesced) ──► captureCurrentSelection(readingRoot)
        │                                                │
        │                                    captureSelection(article, root)
        │                                                │
        │                    ┌───────────────────────────┤
        │                    ▼                           ▼
        │            endpoint A (start)          endpoint B (end)
        │            findBlockAncestor           findBlockAncestor
        │            → blockIndex_a              → blockIndex_b
        │            isEligible(block_a)?        isEligible(block_b)?
        │                    │                           │
        │            domRangeToIntraBlockGraphemeRange ×2 (whitespace-align map,
        │                + data-block-grapheme-start slice offset)
        │                    │                           │
        │            computeBlockGlobalStart(a)   computeBlockGlobalStart(b)
        │                    └───────────┬───────────────┘
        │                                ▼
        │                 ONE global TextPositionSelector [start, end)
        │                                │
        │              rangesOverlap vs ALL resolved highlights (D19-07)
        │                                │
        │              ok ──► toolbar buttons (D19-09 unchanged)
        │              boundary-ineligible ──► toolbar refusal hint (D19-06)
        │              overlap ──► existing overlap hint
        │                                │ createHighlight(position)
        │                                ▼
        │              deriveQuoteSelector → exact includes "\n" separators
        │              saveHighlight (ONE record; no schema change)
        │                                │
        ▼                                ▼
   RENDERING (per surface)         RESOLUTION (reopen/re-import)
   scrolling: ArticleBody          resolveQuoteSelector(article,
     per top-level block:             quote, positionHint)
     highlightsForBlock(global)        │
     → paragraph/heading: direct      ├─ unique exact → confident
     → blockquote: per-child          ├─ N>1 → ambiguous (dashed)
     → list: per-item (NEW,           └─ 0 → prefix/suffix → orphan
       mirrors blockquote path)              (never silent re-attach)
     → caption/code: (NEW paths)
     → figure/unsupported: unmarked gap (D19-02 by construction)
   paginated: PageFragmentView
     per entry: sliceHighlightsForEntry(global ∩ entry)
     → same per-kind threading, entry-local coords
     → multi-page span: mark per page, shared data-highlight-id (D5-16)
```

A reader traces: select across blocks → toolbar offers Highlight → one record stored → marks appear per block in both modes → review shows one row (first fragment + …) → jump lands at span start → delete removes record + note in one transaction → export emits one entry with line breaks.

### Recommended Project Structure (files this phase touches)

```
src/annotations/capture.ts            # span validation + reason taxonomy (core edit)
src/content/render/BlockRenderer.tsx  # list per-item threading; caption/code mark paths
src/pagination/fragmentRenderer.tsx   # list per-item threading (paginated twin)
src/content/render/InlineRenderer.tsx # first-slice-only id fix
src/reader/annotations/HighlightOverlay.tsx  # reason union extension
src/reader/annotations/SelectionToolbar.tsx  # refusal copy (retire multi-block hint)
src/routes/review/ReviewView.tsx      # first-fragment excerpt (shared helper)
src/reader/annotations/AnnotationsDrawer.tsx # excerpt helper reuse (planner call)
src/reader/annotations/NotePopover.tsx# excerpt helper reuse (planner call)
src/portability/markdown.ts           # multi-line exact rendering (D19-12)
tests/unit/annotations/               # capture span matrix (jsdom offset logic)
tests/e2e/annotations/                # span capture/render/durability/matrix specs
```

### Pattern 1: Endpoint-only span composition (no intermediate DOM walk)

**What:** The global range derives from the two endpoints alone. Each endpoint independently resolves: text node → `findBlockAncestor` → `data-block-index` → block eligibility → `domRangeToIntraBlockGraphemeRange` (with `data-block-grapheme-start` slice offset) → `+ computeBlockGlobalStart(blockIndex)`.

**When to use:** Always in `captureSelection`. Intermediate blocks never need DOM inspection — their text is interior to the global range by construction, and interior gaps cross calmly (D19-02).

**Why it's safe:** DOM Range normalizes start/end to document order (backwards drags included), so `startGlobal ≤ endGlobal` is guaranteed. The existing single-block path is the degenerate case `blockIndex_a === blockIndex_b` — keep it on the same code path.

```typescript
// Sketch (source: adaptation of capture.ts L332-399 structure)
const startBlock = findBlockAncestor(range.startContainer, readingRoot);
const endBlock = findBlockAncestor(range.endContainer, readingRoot);
if (!startBlock || !endBlock) return { ok: false, reason: "ineligible" };
// resolve index + eligibility PER endpoint, then compose:
//   global start = computeBlockGlobalStart(article, idx_a) + intra_a.start + sliceStart_a
//   global end   = computeBlockGlobalStart(article, idx_b) + intra_b.end + sliceStart_b
```

### Pattern 2: Per-child slice threading (the 05-07 precedent to mirror for lists)

**What:** A container block computes each readable child's article-global start (child texts joined by `BLOCK_SEPARATOR`), filters `highlightsForBlock` per child, and forwards `childHighlightSlices[i]` so each child's `InlineList` renders its own `<mark>`.

**When to use:** Blockquote children (shipped) and NOW list items. The items-shape adds one nesting level: `block.items[i].content[j]` — the item's content blocks are the readable children (verified fixture shape: items are `[paragraph]` today; nested lists recurse per D19-15).

```typescript
// Source: BlockRenderer.tsx L392-438 (blockquote path — the exact shape to mirror)
let childIntraStart = 0;
for (const child of block.children) {
  const childLen = blockGraphemeLen(child, article.lang);
  const childGlobalStart = blockGlobalStart + childIntraStart;
  // ... highlightsForBlock + sliceRunsForHighlights per paragraph/heading child ...
  childIntraStart += childLen + BLOCK_SEPARATOR.length;
}
```

**List-specific math (verified against `normalizeText.ts` L48-52):** `blockNormalizedText(list)` = items joined by `BLOCK_SEPARATOR`, where each item = its content blocks joined by `BLOCK_SEPARATOR`. DOM `textContent` of `<ul>` concatenates item texts WITHOUT separators — `buildRawToNormMap`'s separator-skip branch (L125-132) already handles this divergence for capture, the same way it handles blockquote children today.

### Pattern 3: Interior gaps render unhighlighted by construction

**What:** The renderer marks only kinds that carry `InlineList` slices. `figure` (img + figcaption without slices) and `unsupported` (`<details>`) render no marks — a global range spanning them simply produces no intersection slices there. No gap-detection code is needed.

**When to use:** D19-02/D19-08 — the highlight continues on both sides of a textless figure or unsupported block with zero special-casing. (Note: this changes the moment captions become mark-rendering — then a figure WITH a caption renders its caption slice while the img/alt portion stays unmarked. See Pitfall 1.)

### Anti-Patterns to Avoid

- **Walking intermediate blocks' DOM during capture** — unnecessary (endpoint math suffices) and fragile (containers re-render mid-selection). Offsets come from the article model, never the walked DOM.
- **Storing per-block fragments or a block count on the record** — ANNO-09 is ONE global range; fragments are always derived at render time. Any `blocks: [...]` field is a schema violation of the phase contract.
- **Forking the slicer for spans** — `sliceRunsForHighlights` + `splitParagraphRuns` are consumed UNCHANGED (Pitfall 4 / REUSE-DO-NOT-FORK). The span is "more blocks intersecting the same math."
- **Narrowing ineligible selections** — D19-05 explicitly rejects largest-eligible-sub-span machinery. Refuse whole, explain calmly, let the reader re-select.
- **A "span" badge/chrome anywhere** — D19-11: one highlight is one highlight. No review-row badges, no special mark styling.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Run slicing at highlight boundaries | Custom run splitting | `sliceRunsForHighlights` + `splitParagraphRuns` | Boundary-run marks (links) must survive splits; shipped + tested (Pitfall 4) |
| Container coordinate math | New prefix-sum walks | `articleGraphemeIndex().blockStartOffsets` / `computeBlockGlobalStart` | Parallel implementations drift and shift anchors (Pattern 5); index is WeakMap-cached (260819-tld perf) |
| Quote derivation for spans | Custom exact assembly | `deriveQuoteSelector(article, position)` | Already slices global clusters — "\n" separators included automatically |
| Re-anchoring | New matching | `resolveQuoteSelectorInText` | Tri-state contract locked (D5-02); first-cluster guard already optimizes long needles |
| Overlap policy | Per-block checks | `rangesOverlap` on global ranges | One 1-D interval test; touching endpoints OK (D19-07 caller discipline) |
| Atomic delete | Manual two deletes | `deleteHighlight` Dexie transaction | Highlight+note roll back as one unit (Pitfall 10) — the ANNO-11 mechanism, already shipped |

**Key insight:** every "new" capability in this phase is a composition of shipped primitives. The risk is not missing machinery; it is **coordinate-system divergence** (Pitfall 4 below) and **surface regressions** (duplicate ids, multi-line export).

## Common Pitfalls

### Pitfall 1: Figure alt-divergence silently mis-captures caption endpoints (LOAD-BEARING — exists TODAY)

**What goes wrong:** `blockNormalizedText(figure)` = `alt + "\n" + caption` (`normalizeText.ts` L53-54) but the rendered `<figure>` element's `textContent` = caption text ONLY (alt is an `<img>` attribute, not a text node). `buildRawToNormMap` aligns the caption's first raw cluster against the alt's first norm cluster — both non-whitespace, so they "align" at the same index — producing offsets silently wrong by `alt.length + BLOCK_SEPARATOR.length`. The BlockRenderer comment at L358-363 documents this divergence as the reason caption rendering was deferred; it equally corrupts CAPTURE.
**Why it happens:** The raw→norm map assumes both cluster arrays contain the same non-whitespace text in the same order. Figures violate that assumption.
**How to avoid:** When the resolved block is a `figure` (and endpoints sit in the caption), align the map against the CAPTION PORTION of the norm clusters — slice `fullNormClusters` past `graphemeClusters(alt).length + BLOCK_SEPARATOR.length` (the exact precedent: the D5-08 `data-block-grapheme-start` slice math at `capture.ts` L366-391 slices the norm array to the slice's portion). A symmetric offset is needed on the RENDER side for caption marks (figcaption slices start at alt+separator in figure-local coordinates).
**Warning signs:** A highlight created on a figure caption jumps to the wrong passage after reload (re-anchoring finds the true text elsewhere or goes orphan); matrix cells "span crossing figure-with-caption" fail with offset mismatches. Fixture exposure verified: BOTH figure-heavy figures have non-empty alt AND captions.
**Scope note:** The matrix (D19-01 makes captions spannable) makes this load-bearing. If the planner defers caption ENDPOINTS, the divergence still matters for figures as interior gaps ONLY if the figure's norm text were excluded — it is NOT (the global range includes the alt text; it simply renders unmarked). Interior-gap-only figures need no capture fix.

### Pitfall 2: Duplicate DOM `id="hl-<id>"` across a span's marks

**What goes wrong:** `InlineRenderer.tsx` L121 stamps `id={`hl-${slice.highlightId}`}` on EVERY highlighted slice. Today that is safe: single-block highlights produce one mark per view, and paginated mode mounts ONE `PageFragmentView` at a time (verified `PaginatedSurface.tsx` L3, L660-661), so a split-block highlight's two marks are never simultaneous. A cross-block span in SCROLLING mode renders N marks in ONE document with N identical ids — invalid HTML, `getElementById` returns an arbitrary-first match, and the D10-03 review-jump `focusMark` (`ArticleView.tsx` L1589-1593) targets `hl-<id>`.
**Why it happens:** The D5-16 per-slice id predates any same-view multi-mark case.
**How to avoid:** Stamp the DOM `id` on the FIRST rendered slice for a highlight only; keep `data-highlight-id` on every slice (activation/popover targeting already uses `closest("mark.highlight[data-highlight-id]")` — verified `ArticleView.tsx` L874). First-in-document-order = span start, which conveniently keeps the jump focus target at the span's start (D19 review-jump discretion confirmed). Implementation options: slice-index awareness in `InlineList` (first slice with a given id within one block) is insufficient across blocks — the cleanest is a renderer-level "first occurrence" pass or an `id` only when the slice's start equals the highlight's resolved start.
**Warning signs:** `getElementById` returning a mark mid-span; axe `duplicate-id` findings (axe gates filter to serious/critical [VERIFIED: `a11y.spec.ts` filters by impact] so the automated gate will NOT catch this — it must be a deliberate spec assertion, e.g. `page.locator('[id="hl-x"]')` count === 1).

### Pitfall 3: `quote.exact` contains `"\n"` — export/review surfaces assume single-line

**What goes wrong:** A span's `exact` includes BLOCK_SEPARATOR newlines (and code-block sources contain verbatim newlines — verified 2-8 per code block in technical-post). `markdown.ts` L159 embeds `exact` inside ONE `> `-prefixed line: a multi-line exact breaks out of the blockquote (subsequent lines render as bare text — structure injection-adjacent and ugly). `ReviewView`/`AnnotationsDrawer`/`NotePopover` excerpts truncate raw `exact` mid-separator (a `"\n"` inside a `<span>` renders as a space — acceptable visually but D19-10 wants first-fragment + "…", not a truncated multi-block blob).
**How to avoid:** D19-12: render multi-line exact as multiple `> `-continued blockquote lines, applying `escapeMarkdownLine` PER LINE (each line could begin with `#`/`-`/`1974.`). D19-10: derive the excerpt as `exact up to the first "\n"` + ellipsis in a shared pure helper; reuse across review row, aria-labels, drawer, popover, and delete-confirm (planner scopes which surfaces switch).
**Warning signs:** Export spec snapshots with un-escaped second lines; review rows whose visible text contains runs from 2+ blocks.

### Pitfall 4: THREE per-block coordinate systems coexist — do not mix them

**What goes wrong:** (a) **D-05 substrate** (`blockNormalizedText`): paragraphs = runs joined with `" "` after collapse+trim (capture/anchors/resolution live here); (b) **renderer run-sum** (`sliceRunsForHighlights` L84-87): blockLen = sum of raw `run.text` cluster counts, no separators; (c) **pagination splitting text** (`splittingBlockText`): runs concatenated WITHOUT separators (engine/fragment live here — STATE.md Phase 04-06 explicitly documents this as "distinct from the D-05 substrate"). For clean fixtures these agree; for messy whitespace they drift by a few graphemes.
**Why it matters for Phase 19:** Every new threading site (list items, captions, code) must pick the SAME coordinate system its consumer uses: global positions from (a); intra-block slice lengths from (b) when feeding `sliceRunsForHighlights`; entry-local from (c) when inside `resolveBlockSlice` output. Mixing (a) with (b) offsets in one call mis-slices silently.
**How to avoid:** Mirror the shipped call sites exactly — the blockquote path (BlockRenderer L392-438) already makes the right choice per call; copy its structure for lists. Add matrix unit cells with multi-run items (a link mid-item) to lock the alignment.
**Warning signs:** Marks shifted by exactly the whitespace delta; failures only on fixtures with inline links/em in lists.

### Pitfall 5: List markers must never enter the coordinate systems (D19-14)

**What goes wrong:** If markers were part of norm text or DOM text, a highlight "starting at an item's first character" would need marker-exclusion math.
**Why it's safe today:** `blockText` for lists (L48-52) joins item CONTENT only; `<li>` markers are CSS `::marker`/`start`-attribute chrome — NOT in `textContent` (structural fact). **Verified by construction — no work needed; the matrix must ASSERT it** (e.g., an item-start highlight's first marked character is the item's first text character).
**Warning signs:** Any new rendering path that emits marker text as DOM text (e.g., hand-rolled `<span class="marker">3.</span>`) would break this invariant — do not add one.

### Pitfall 6: Footnote BODIES are uncapturable (and that is correct matrix behavior)

**What goes wrong:** Assuming "footnotes" in ANNO-12 means footnote bodies. The footnotes region (`BlockRenderer.tsx` L457-479) renders `<li id="fn-N">` WITHOUT `data-block-index` — `findBlockAncestor` returns null → existing `"ineligible"` refusal. Footnote text participates in `normalizeText` AFTER body blocks (D-05 Pitfall 3), so a whole-article span's global range can legally extend into footnote-body offsets — which render unmarked (interior-gap-by-construction).
**How to avoid:** Matrix treats footnote-REFERENCE markers as the eligible "footnote" kind (D5-07 set); footnote bodies are an ineligible boundary (endpoint lands → reject whole per D19-05). Document in the matrix; add a spec cell selecting from body text into a footnote body → refusal.
**Warning signs:** A spec expecting capture inside footnote bodies.

### Pitfall 7: Honest spec churn — exactly three known spec surfaces change

**What goes wrong:** Blanket "strengthen-only" application would keep D5-06 refusal assertions that Phase 19 deliberately retires.
**The sanctioned changes (CONTEXT: "multi-block refusal specs change honestly"):**
1. `tests/e2e/annotations/capture-rejects.spec.ts` test 1 ("D5-06 multi-block selection surfaces the 'single block' hint") — the selection setup (page-walk + two-block range) becomes a SUCCESS cell (moves to the span-capture spec; the refusal file keeps overlap + measurement-body tests).
2. `tests/unit/annotations/capture-offset-mapping.test.ts` — "multi-block rejection (D5-06)" case flips to span-success with offset assertions.
3. `SelectionToolbar.tsx` L244-245 copy ("Select within a single block to highlight it.") retires with the reason string it maps.
**Unchanged (verify explicitly):** `capture-rejects.spec.ts` test 3 (cross-page selection into the hidden measurement body must STILL refuse — endpoints outside the mounted surface; ANNO-13 is Future). Overlap test unchanged. All toolbar focus/lifecycle specs unchanged (D19-09: toolbar behavior identical for spans).

### Pitfall 8: Whole-article spans and quote-context wildcards (D19-04)

**What goes wrong:** `deriveQuoteSelector` uses contextRadius=32 with empty prefix/suffix as wildcards. A span starting at article offset 0 and/or ending at totalGraphemes stores empty prefix/suffix — legal (verified `matchesContext` treats empty as wildcard) but reduces cross-revision disambiguation power. Also `exact` for a whole-article span ≈ the entire normalized text — the step-4 fallback's slack window (`max(16, exactLen)`, `resolution.ts` L135) becomes huge, making zero-exact fallback scans potentially O(article) per prefix hit.
**How to avoid:** Same-revision re-anchor never hits step 4 (exact matches uniquely at the stored location — the confident fast path, verified L200-204). Cross-revision drift of a giant span legitimately degrades to ambiguous/orphan — which is HONEST (ANNO-07). No cap per D19-04; optionally assert in a unit cell that a whole-article span round-trips within the same revision and reports orphan after a mid-span edit. No schema change (CONTEXT discretion: "if the researcher finds one (e.g. quote length caps), surface it per Pitfall 9" — no cap found or needed; `exact` is `z.string().min(1)` unbounded).

### Pitfall 9: Selection-direction and edge endpoints (validated safe — assert, don't code)

DOM Range normalizes start/end to document order regardless of drag direction, so `startGlobal ≤ endGlobal` holds without a swap step. Empty-after-composition spans (start === end) cannot arise from a non-collapsed Range but a defensive `start < end` check on the composed selector is cheap and matches `TextPositionSelectorSchema.refine(end > start)` (schema.ts L383). Backward selections should be a matrix cell (unit, jsdom Range suffices).

### Pitfall 10: Paginated-mode spans are single-page by construction

A native selection cannot extend past the mounted page (one `PageFragmentView` at a time; the hidden measurement body is `user-select:none` + triple-guarded). So in paginated mode, "multi-block" = multiple blocks WITHIN the current page fragment — endpoint blocks may both be page SLICES carrying `data-block-grapheme-start` (the existing per-endpoint slice math already composes; see Pattern 1). Cross-page spans remain ANNO-13 (Future) — do not add machinery. The D5-08 test (cross-page → no valid button) must stay green (Pitfall 7).

## Code Examples

### Span capture reason taxonomy (shape sketch — planner owns exact union)

```typescript
// Source: adaptation of capture.ts L49-54 + HighlightOverlay.tsx L64-87
export type CaptureResult =
  | { ok: true; blockIndex: number; position: TextPositionSelector } // keep for single-block compat
  | {
      ok: false;
      reason:
        | "empty"
        | "ineligible"        // existing: no block ancestor / outside root
        | "measurement-body"  // existing D5-08
        | "boundary-ineligible" // NEW (D19-05/D19-06): an endpoint resolved to an
                                // ineligible block (e.g. unsupported, footnote body)
        | "empty-span";       // NEW (defensive): composed start === end
    };
// "multi-block" RETIRES. ToolbarCaptureResult keeps "overlap" (added in Overlay).
// Toolbar copy (D19-06, planner wordsmiths): boundary-ineligible →
//   "This selection includes content that can't be highlighted."
```

Note: `blockIndex` on the ok-variant is single-block vocabulary; callers verified this session (`captureCurrentSelection`, `createHighlightFromSelection`) consume only `.ok` + `.position` — the field can stay (first endpoint's index) or the union can grow a span variant; planner chooses (grep `blockIndex` consumers before changing).

### List per-item threading (scrolling side — mirror of BlockRenderer L392-438)

```typescript
// Source: structure copied from the shipped blockquote path; items-shape nesting.
// blockGlobalStart = the list block's article-global start (from buildBlockHighlightIndex).
let intra = 0; // intra-list offset in D-05 coords (blockNormalizedText join rule)
const perChild: (HighlightSlice[] | undefined)[] = [];
for (const item of block.items) {
  let itemIntra = intra; // item's content blocks joined by BLOCK_SEPARATOR
  for (const child of item.content) {
    const childLen = blockGraphemeLen(child, article.lang);
    const childGlobalStart = blockGlobalStart + itemIntra;
    if (child.kind === "paragraph" || child.kind === "heading") {
      const entries = highlightsForBlock(effectiveHighlights, childGlobalStart, childLen);
      if (entries.length > 0) perChild.push(sliceRunsForHighlights(child.content, childGlobalStart, entries, article.lang));
      else perChild.push(undefined);
    } else if (child.kind === "bulleted-list" || child.kind === "numbered-list") {
      // D19-15: recurse (sub-list items are readable children)
    } else perChild.push(undefined);
    itemIntra += childLen + BLOCK_SEPARATOR.length;
  }
  intra += (itemIntra - intra) + /* item consumed */ 0; // accumulate per blockText item join
}
// BlockView list cases forward perChild to each item's content BlockView via a
// childHighlightSlices-shaped prop (the items-shape: items[i].content[j]).
```

(The exact accumulation bookkeeping is planner territory; the load-bearing rule is: child global starts MUST derive from `blockNormalizedText`'s join order — content blocks within an item joined by `BLOCK_SEPARATOR`, items joined by `BLOCK_SEPARATOR` — verified `normalizeText.ts` L48-52.)

### First-fragment excerpt helper (D19-10)

```typescript
// Pure derivation from quote.exact (BLOCK_SEPARATOR = "\n").
function firstFragmentExcerpt(exact: string, maxChars: number): string {
  const firstLine = exact.split("\n")[0] ?? "";
  return firstLine.length < exact.length
    ? truncate(firstLine, maxChars) + "…"   // calm ellipsis when a span continues
    : truncate(firstLine, maxChars);
}
```

### Multi-line Markdown export (D19-12)

```typescript
// Source: adaptation of markdown.ts blockLines L158-167.
// One entry, block-boundary breaks preserved as blockquote continuation lines.
const quoteLines = e.highlight.quote.exact.split("\n");
const lines = quoteLines.map((ln, i) =>
  `> ${i === 0 ? markerFor(e.status) : ""}${escapeMarkdownLine(ln)}`,
);
// escapeMarkdownLine applies PER LINE — a later block may begin with "#" or "1974."
```

## State of the Art

| Old Approach (≤ v2.0) | Current Approach (this phase) | When Changed | Impact |
|----------------------|-------------------------------|--------------|--------|
| D5-06 single-block capture rule (`"multi-block"` refusal) | Endpoint-composed global spans; rule retired at capture layer | Phase 19 | Toolbar copy, reason unions, and 3 spec surfaces change honestly |
| Marks on paragraph/heading + blockquote children only | + list items (per-item threading), caption/code coverage per matrix decision | Phase 19 | 05-07 items-shape deferral paid down (D19-13) |
| Per-slice `id="hl-<id>"` (safe: one mark in DOM) | First-slice-only id + `data-highlight-id` everywhere | Phase 19 | Keeps review-jump focus + valid HTML under multi-mark spans |
| Excerpt = truncated `quote.exact` | First-fragment + ellipsis for spans | Phase 19 | Review/drawer/popover excerpt derivation |

**Deprecated/outdated within this phase:** the `"multi-block"` reason string and its toolbar copy ("Select within a single block to highlight it.").

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | axe gates filter to serious/critical impacts, so a `duplicate-id` (minor) finding would NOT fail the automated gate — hence the deliberate count-===1 spec assertion proposed in Pitfall 2 | Pitfall 2 | Low: if axe DID flag it, the fix (first-slice id) is already the recommendation |
| A2 | `CaptureResult.blockIndex` has no consumer depending on span semantics beyond `.ok`/`.position` (verified for Overlay/ArticleView this session; a broader grep at plan time is cheap insurance) | Code Examples | Low: union reshaping is compile-time visible |
| A3 | Nested lists occur in real ingested content (htmlToBlocks supports them) even though no fixture has them — matrix coverage should include a synthetic nested-list case | Validation Architecture | Low: if unsupported, the D19-15 recursion cell is trivially green |
| A4 | Exact refusal copy wording is planner discretion (CONTEXT says "exact copy = planner") — research proposes placeholder strings only | Code Examples | None: wording is a locked-planner decision |

**All other claims were verified directly against source this session** (file + line cited inline).

## Open Questions (RESOLVED)

*All three were decided during Phase 19 planning; the deciding plan task is inline with each question.*

1. **Caption + code mark rendering coverage — matrix scope decision**
   **(RESOLVED → 19-01-T1 + 19-03-T3):** the recommendation was taken in full — Pitfall 1 capture alignment ships in 19-01-T1, caption marks (figcaption InlineList slices) AND the code-source slicer (`sliceCodeForHighlights`, verbatim-segment `<mark>` path) both land in 19-03-T3. No per-kind render fallback is shipped; D19-02 gap semantics apply only to textless figures/unsupported interiors. The paginated twin (entry-local forwarding where the fragment renderer bypasses BlockView) is pinned by 19-04-T1/T2.
   - What we know: capture-side eligibility for figure/code blocks already exists (D5-07); render-side marks do not (documented deferral, BlockRenderer L358-363). D19-01 makes captions/code spannable; success criterion 2 says the span "renders across blocks."
   - What's unclear: whether Phase 19 must RENDER marks inside captions/code (requiring the Pitfall 1 alt-offset fix + a code-source slicer) or whether the honest fallback is "eligible as endpoints/interior, marks render on the text kinds that carry InlineList today" with the matrix documenting per-kind RENDER coverage.
   - Recommendation: solve the Pitfall 1 capture alignment regardless (it corrupts stored offsets); land caption marks (figcaption already renders `InlineList` — adding slices is small once offsets are right); treat code-block interior rendering as the one judgment call to surface in PLAN (a `<pre><code>` mark path means splitting verbatim source into run-like segments — new render shape). Keep D19-02's gap semantics as the honest fallback for any kind left unmarked.

2. **Which excerpt surfaces switch to first-fragment derivation**
   **(RESOLVED → 19-02-T2):** helper adopted at ALL excerpt surfaces — ReviewView (visible + aria), AnnotationsDrawer, NotePopover, and the DeleteHighlightConfirm excerpt prop (derived once upstream); per-surface caps unchanged.
   - What we know: D19-10 names the review panel. Drawer (`AnnotationsDrawer` L181+), NotePopover (L92), and DeleteHighlightConfirm excerpts read `quote.exact` today.
   - What's unclear: whether they all adopt the helper.
   - Recommendation: one shared helper, adopted everywhere an excerpt renders (consistency is cheap; the aria-label truncations stay length-capped as today).

3. **`id="hl-<id>"` first-occurrence mechanism**
   **(RESOLVED → 19-03-T1 + 19-04-T2):** hybrid of the two pass options — the slicer sets `HighlightSlice.isFirst` from global coordinates (scrolling mode), and a per-page first-occurrence pass overrides it in entry-local paginated coordinates (one mounted page at a time). The `hl-` consumers (ArticleView focusMark getElementById sites) were re-verified untouched in 19-03-T1's read-first scope; the id is not dropped.
   - What we know: the id must exist exactly once per highlight per document; first-in-document-order equals span start.
   - What's unclear: cleanest implementation (renderer-level first-occurrence pass vs slice-start-equals-highlight-start check vs dropping the id and switching `focusMark` to `querySelector`).
   - Recommendation: planner picks with a grep of `hl-` consumers (verified consumers this session: ArticleView focusMark L1590; likely NotePopover anchor query — re-grep at plan time).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node 22 LTS | Vite 8 / scripts | ✓ | v22.22.3 | — |
| npm | installs (none needed) | ✓ | 10.9.8 | — |
| node_modules | build/test | ✓ | present | — |
| Playwright browsers (chromium/firefox/webkit) | e2e matrix | ✓ (configured, 3 projects + throttled-mobile) | 1.61.1 lockfile | — |
| jsdom (vitest env) | unit capture tests | ✓ | configured `vitest.config.ts` | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (unit, jsdom env) + Playwright Test 1.61.1 (e2e, chromium/firefox/webkit + chromium-throttled-mobile) |
| Config file | `vitest.config.ts`, `playwright.config.ts` (workers: 3) |
| Quick run command | `npx vitest run tests/unit/annotations` |
| Full suite command | `npm run test` (unit `--run` + e2e; the honest gate — exit 0 required) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ANNO-08 | Span capture across eligible mounted blocks (both modes; backwards drag; slice endpoints) | unit (jsdom Range) + e2e | `npx vitest run tests/unit/annotations/capture-offset-mapping.test.ts` / `npx playwright test tests/e2e/annotations/` | ✅ unit (extends) / ❌ e2e span spec — Wave 0 |
| ANNO-09 | One record, one global range, block-local fragments; no schema change | unit (schema round-trip) + render specs | `npx vitest run tests/unit/annotations/highlight-schema.test.ts` | ✅ schema / ❌ span render cells — Wave 0 |
| ANNO-10 | Durability: repagination, mode/typography change, reload, export/import, review jump | e2e (extends survive-relayout, persist-reload, cross-fragment-render + portability round-trip) | `npx playwright test tests/e2e/annotations/survive-relayout.spec.ts tests/e2e/annotations/persist-reload.spec.ts` | ✅ extend / add span cells |
| ANNO-11 | Atomic review/edit/export/delete; one review row per span; no leftover fragments | e2e (extends delete-confirm, drawer-view) + markdown unit | `npx vitest run tests/unit/portability` | ✅ extend / ❌ multi-line export cells — Wave 0 |
| ANNO-12 | Eligibility matrix (kind × crossing × gap placement) + explicit refusal | unit matrix (offset logic) + e2e matrix (real selection) + refusal copy | `npx playwright test tests/e2e/annotations/` | ❌ matrix spec — Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/annotations && npx playwright test tests/e2e/annotations/<touched-spec>`
- **Per wave merge:** `npm run test:unit -- --run && npx playwright test tests/e2e/annotations`
- **Phase gate:** full `npm run test` exit 0 (honest gate; no engine skips; webkit-starvation lesson from Phase 18 — check dev-server freshness before diagnosing "failures")

### Wave 0 Gaps
- [ ] `tests/e2e/annotations/span-capture.spec.ts` (or extension of capture-highlight.spec.ts) — ANNO-08 success cells incl. the retired-D5-06 two-block selection (reuse the page-walk setup from capture-rejects.spec.ts test 1)
- [ ] `tests/e2e/annotations/eligibility-matrix.spec.ts` — ANNO-12 cells: {para, heading, quotation-child, list-item, caption, code, footnote-ref} × {start-in, end-in, cross-two, cross-many} × {interior figure gap, interior unsupported gap, interior code} + refusal cells (unsupported boundary, footnote body, measurement-body cross-page stays rejected)
- [ ] Unit matrix extension in `tests/unit/annotations/capture-offset-mapping.test.ts` — jsdom span composition, backwards Range, slice-start endpoints, figure caption alt-offset alignment (Pitfall 1)
- [ ] Multi-line export unit cells in the portability markdown tests — D19-12 per-line escaping
- [ ] Fixture gap: NO nested list exists in the 6-fixture corpus (verified census) — D19-15 recursion needs a synthetic fixture addition (strengthen-only permits ADDING fixtures; do not mutate existing ones) OR a unit-only nested-list cell
- [ ] Duplicate-id guard assertion: `[id="hl-<id>"]` count === 1 for a multi-block span (Pitfall 2 — axe will not catch it)

## Security Domain

`security_enforcement: true` (ASVS L1, block_on: high) — this phase adds NO new input surface, NO new network/IO, NO schema fields. Analysis:

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | unchanged (local-first, no accounts) |
| V3 Session Management | no | unchanged |
| V4 Access Control | no | unchanged (no new routes/capabilities) |
| V5 Input Validation | yes (boundary discipline, unchanged mechanisms) | Stored records already Zod-validated on every Dexie read (`HighlightRecordSchema.safeParse`); new reason strings are closed-set union literals, not reader input; Markdown export escaping stays `escapeMarkdownLine` — MUST apply per line for multi-line exact (Pitfall 3) so a block beginning `1974.` or `#` cannot forge structure |
| V6 Cryptography | no | unchanged |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Structure injection via stored highlight text in Markdown export | Tampering | `escapeMarkdownLine` per line (extend to multi-line — this phase's one genuine security-adjacent change) |
| XSS via note/excerpt rendering | Tampering | React text children only; `react/no-danger` ESLint rule active; no new HTML parsing (verified all excerpt surfaces) |
| DOM clobbering via `id="hl-..."` | Tampering | ids derive from `crypto.randomUUID()` highlight ids — no reader-controlled text; duplicate-id fix REDUCES surface (Pitfall 2) |
| Anchor poisoning via imported bundles | Tampering | unchanged: STATE-04 per-row validation on read + D5-02 tri-state never silently re-attaches |

## Sources

### Primary (HIGH confidence — verified in-session against source)
- `src/annotations/capture.ts` (full read) — D5-06 gate L338-340; `buildRawToNormMap` separator-skip L125-132; slice math L366-391; `isEligibleBlock` L254-268; `computeBlockGlobalStart` L276-287
- `src/annotations/highlightRanges.ts` (full read) — `HighlightSliceEntry`/`HighlightSlice`, `sliceRunsForHighlights` intersection math L97-109, run-sum blockLen L84-87
- `src/annotations/overlap.ts`, `src/annotations/resolution.ts` (full read) — global overlap; tri-state algorithm, first-cluster guard L52-59, slack window L135
- `src/content/normalizeText.ts` (full read) — `BLOCK_SEPARATOR="\n"` L13; `blockText` per-kind joins L41-63; `articleGraphemeIndex` L167-195; `deriveQuoteSelector` L222-238
- `src/content/schema.ts` L357-417 — `HighlightRecordSchema` (position+quote, no caps), `NoteRecordSchema`, `TextPositionSelectorSchema.refine`
- `src/content/render/BlockRenderer.tsx` (full read) — blockquote threading L392-438; list render L131-154 (NO slices); figure/code render L155-172 (NO marks); alt-divergence comment L358-363; footnotes region L457-479 (no data-block-index); `buildBlockHighlightIndex` L224-237
- `src/pagination/fragmentRenderer.tsx` (full read) — `sliceHighlightsForEntry` L252-291; entry-local threading L143-205; `resolveBlockSlice`/`sliceList`/`sliceChildBlocks` L314-496; `splittingBlockGraphemeLength` L514-547
- `src/content/render/InlineRenderer.tsx` (full read) — per-slice `id="hl-"` L121, aria/className discipline
- `src/reader/annotations/HighlightOverlay.tsx`, `useAnnotationState.ts`, `SelectionToolbar.tsx` (full read) — reason unions, overlap check L182-201, toolbar copy L243-251, create/delete/note flows
- `src/routes/ArticleView.tsx` (targeted) — selectionchange wiring L1030-1119; H/N + saved-range restore L778-838; deep-link jump L1490-1603 (offset=position.start, focusMark `hl-`)
- `src/portability/markdown.ts` (full read) — `blockLines` L158-167, `escapeMarkdownLine` L71-86, `HighlightSection`
- `src/routes/review/ReviewView.tsx` L120-247 — excerpt/aria/jump hash; `src/persistence/highlightsStore.ts` (full read)
- `tests/e2e/annotations/*` (capture-rejects full read; suite census: 16 spec files, 60 tests); `tests/unit/annotations/` (9 files); `src/fixtures/articles/*.canonical.json` (kind census via node)
- `playwright.config.ts`, `vitest.config.ts`, `package.json`, `.planning/config.json`

### Secondary (MEDIUM confidence)
- W3C Web Annotation Data Model selectors — cited in-repo (`normalizeText.ts` L203); not re-fetched this session (no behavioral dependency beyond what's implemented)

### Tertiary (LOW confidence)
- None. No WebSearch/training-only claims load-bearing in this research.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all internal modules read at source level with line citations
- Architecture: HIGH — capture/render/persistence seams verified end-to-end; three integration hazards found and documented (Pitfalls 1-3)
- Pitfalls: HIGH — each verified against concrete source lines and fixture content this session

**Research date:** 2026-08-30
**Valid until:** 2026-09-29 (stable internal codebase; re-verify line numbers if Phase 18 gap-closure commits land first)
</content>
