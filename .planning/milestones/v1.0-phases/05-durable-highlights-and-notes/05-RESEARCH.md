# Phase 5: Durable Highlights and Notes - Research

**Researched:** 2026-08-07
**Domain:** Durable text annotations over a normalized-text grapheme-offset substrate (W3C Web Annotation selectors); persistence via Dexie/IndexedDB; semantic-DOM overlay rendering across dual reading modes; selection capture and re-anchoring.
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (D5-01 through D5-16 — do NOT re-ask)

**Anchor Encoding & Re-attachment Confidence (ANNO-05/06/07):**
- **D5-01:** Cross-revision re-attachment — highlights looked up by `articleId` regardless of revision; stored `TextQuoteSelector` re-resolved against the CURRENT revision's normalized text. The `[articleId+revision]` compound key is the partition for orphan detection, not a same-revision-only lock.
- **D5-02:** Resolution rules — exact-first, then prefix/suffix disambiguation, then orphan. `resolveQuoteSelector`: (1) exact-substring matches of `exact`; (2) unique exact → **confident**; (3) N>1 exact → prefix+suffix window to narrow → still N>1 → **ambiguous**; (4) zero exact → prefix+suffix-only fallback → unique → confident (low-certainty) / else → **orphan**. Stored `TextPositionSelector` is a **nearness hint**. Never silently re-attach to a wrong spot.
- **D5-03:** Persist BOTH position and quote. `TextPositionSelector` (grapheme start/end, start-inclusive/end-exclusive) AND `TextQuoteSelector` (prefix/exact/suffix). Default context radius = 32 grapheme clusters.
- **D5-04:** Ambiguous/orphan = inline marker + list entry, no silent loss. Unresolved highlights render as a distinct inline marker (at stored position hint for orphan / first candidate for ambiguous) AND as a flagged drawer entry. Delete is always available. Full re-attach/repair is v2.

**Highlight Creation & Selection Scope (ANNO-01):**
- **D5-05:** Native selection + floating toolbar. Select text → toolbar appears → "Highlight" / "Highlight + note". Reduced-motion-safe, keyboard-reachable.
- **D5-06:** Single contiguous run within ONE normalized-text block. Multi-block/cross-page selections rejected with a hint.
- **D5-07:** Broad eligible set — "if you can read it, you can highlight it": paragraph, heading, blockquote children, list-item children, figure CAPTION, code-block source, footnote-reference marker. Inline marks (link/code/strong/em) ride along inside the grapheme range.
- **D5-08:** Paginated-mode selection binds to the visible `PageFragmentView` blocks via `data-block-index` → `article.blocks` → `normalizeText` offset. The always-mounted hidden measurement `ArticleBody` gets `user-select: none`.

**Notes + View/Edit/Navigate Surface (ANNO-02/03/04):**
- **D5-09:** Inline popover on the highlight + a header-mounted list drawer (native `<dialog>` slide-over). No new route.
- **D5-10:** Inline editable note field in the popover. "Highlight + note" creates + opens the popover with a focused empty textarea; "Highlight" creates bare. Debounced save (D2-03 pattern).
- **D5-11:** Navigate-back closes drawer, resolves grapheme offset to block via `data-block-index` (D4-10/D4-11 machinery in reverse), turns to page (paginated) or `scrollIntoView` (scrolling), focuses the highlight. Ambiguous/orphan entries are non-navigating.
- **D5-12:** Confirm-to-delete (two-step, non-destructive default focus — mirrors WipeConfirm) + concise `.status` announce on create/save/delete.

**Overlap Policy & Inline Rendering:**
- **D5-13:** Disjoint ranges only — reject overlapping new selections.
- **D5-14:** Single calm color (`--highlight` token) + note glyph (dotted underline), NOT a second color. Multi-color is v2.
- **D5-15:** Inline highlight = `<mark>` + `tabindex=0` + ARIA + forced-colors restyle. Renders INTO existing BlockRenderer/InlineRenderer (no fork).
- **D5-16:** Render on every page fragment containing part of the range. Cross-fragment: each fragment gets its own `<mark>` for the visible slice, all sharing the same highlight id.

### the agent's Discretion

- **Exact numeric confidence thresholds (D5-02)** — how many candidates before "ambiguous"; whether prefix/suffix-only fallback returns a distinct 4th state. Empirical — validate against the 6-fixture corpus under simulated edits.
- **Context radius tuning (D5-03)** — 32-grapheme default ships from Phase 1; tunable against the corpus.
- **Floating-toolbar positioning + lifecycle** — where the toolbar appears, how it dismisses, coexistence with swipe/zoom/page-turn controls. UI-SPEC resolves this (§Interaction 25).
- **Exact `--highlight` token value + note-glyph design + drawer copy/lifecycle/empty-state** — UI-SPEC resolves this (§Color + §Interaction 27/30).
- **Annotation Zod schema field names + Dexie version strategy** — `db.ts` already reserves stores in v1; planner confirms whether a version bump is needed. (Research finding: **NO version bump needed** — see §Persistence Schema.)
- **`resolveQuoteSelector` implementation internals** — the contract + return shape are locked; matching algorithm internals are the planner's.
- **When resolution runs** — eager batch-resolve on open vs. lazy resolve on render/navigate. Planner's call.
- **Performance under many highlights** — per-article count expectations + drawer virtualization. Not an MVP budget gate.
- **Annotation drawer ordering/filtering** — reading-order default locked; sort/filter is UI-SPEC (resolved: NONE for MVP).

### Deferred Ideas (OUT OF SCOPE)

- Dedicated annotation review panel (RECV-01) and explicit anchor-repair tool (RECV-02) → **v2**.
- Multi-color highlight palette → **v2**.
- Multi-block / cross-page selections → **v2**.
- Highlight overlap / nesting → **v2**.
- Export/import of highlights & notes (PORT-01/02) → **v2**.
- Heading navigator and line-focus aid (ORNT-01/02) → **v2**.
- Formal cold/warm repagination performance budgets (ACPT-04) → **Phase 6**.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ANNO-01 | Reader can select supported article text and create a highlight in either reading mode. | §Architecture Patterns — Selection Capture (selection→grapheme offset mapping); §Architecture Patterns — Floating Toolbar; D5-05/D5-06/D5-07/D5-08. |
| ANNO-02 | Reader can attach a text note to a highlight. | §Architecture Patterns — Note Popover + Persistence; D5-10. `NoteRecord` Zod schema in schema.ts; debounced save mirroring SettingsContext. |
| ANNO-03 | Reader can view, edit, and delete their locally stored notes and highlights. | §Architecture Patterns — Inline Popover + Annotations Drawer + Delete Confirm; D5-09/D5-10/D5-12. `highlightsStore`/`notesStore` persistence seams. |
| ANNO-04 | Reader can navigate from a saved annotation back to its logical passage. | §Architecture Patterns — Navigate-back (D4-10/D4-11 anchor machinery in reverse); D5-11. `src/pagination/anchor.ts` reuse. |
| ANNO-05 | Highlights and notes remain attached to the same normalized text across repagination, mode changes, typography changes, and reopening. | §Architecture Patterns — D5-03 dual-selector persistence + D5-01 cross-revision re-anchoring. Highlights are offset-based (never DOM-based), so they survive every relayout by construction. |
| ANNO-06 | Annotation anchors store canonical position plus quoted context rather than page numbers, pixels, DOM paths, or serialized live ranges. | §Architecture Patterns — Anchor Encoding. `TextPositionSelector` + `TextQuoteSelector` over `normalizeText(article)` grapheme offsets. STACK.md FORBIDS DOM Range/XPath/page-number/pixel anchors. |
| ANNO-07 | Reader is shown an explicit ambiguous or orphaned state when an annotation cannot be resolved confidently. | §Architecture Patterns — D5-02 Resolution Rules + D5-04 Ambiguous/Orphan Surfacing. `resolveQuoteSelector` tri-state contract (stubbed in Phase 1, implemented this phase). |
| STATE-03 | Reader's highlights and notes persist locally across sessions. | §Architecture Patterns — Persistence Schema. `highlights`/`notes` Dexie stores already reserved in v1; populated this phase. STATE-04 Zod validation on read/write. |
</phase_requirements>

## Summary

Phase 5 is architecturally the **easiest durable-annotation phase possible** because Phases 1–4 already shipped every load-bearing substrate: the D-05 grapheme-offset coordinate system (`normalizeText.ts`), the `TextPositionSelector`/`TextQuoteSelector` types + `deriveQuoteSelector()` (Phase 1), the reserved Dexie `highlights`/`notes` stores with compound keys (Phase 1 `db.ts`), the source-offset `PageFragment` model + `data-block-index` 1:1 block↔element mapping (Phase 4), and the D4-10/D4-11 anchor machinery that converts between article-global offsets and page positions (Phase 4). The Zod-at-boundary + debounced-save + STATE-05 error-classification patterns are all proven by the settings/location stores (Phase 2). What remains is the **annotation domain layer** that populates and renders against this substrate.

The three genuinely novel implementation challenges — each with provably-correct approaches documented below — are: (1) **selection capture** (mapping an ephemeral browser `Selection`/`Range` to a durable `TextPositionSelector` over the normalized text, accounting for the whitespace-collapse divergence between DOM `textContent` and `normalizeText`); (2) **`resolveQuoteSelector`** (the D5-02 exact-first/prefix-suffix-disambiguate/orphan-fallback re-anchoring algorithm, implementing the already-shipped tri-state contract stub); and (3) **`<mark>` overlay rendering INTO the existing semantic renderer** without forking `BlockRenderer`/`InlineRenderer` (reusing `splitParagraphRuns` to slice runs at highlight boundaries and wrap the highlighted slice in `<mark>`). All three are well-bounded, have existing codebase analogues (`restoreLocation.ts` for offset mapping, `splitBlock.ts` for run slicing, `fragmentRenderer.tsx` for fragment-aware rendering), and need no new dependencies.

**Primary recommendation:** Implement Phase 5 as vertical MVP slices that each prove an end-to-end annotation round-trip (capture → persist → re-render → survive-relayout). Do NOT introduce a Dexie version bump — the v1 store declarations are sufficient. Implement `resolveQuoteSelector` as a pure function with the D5-02 contract. Build the `<mark>` overlay as a highlight-aware rendering pass that wraps run slices, not a DOM-manipulation overlay. Validate selector round-trip fidelity, re-anchoring robustness, and cross-fragment rendering in Playwright across the 6-fixture corpus × theme × mode matrix.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Selection capture (DOM Range → grapheme offset) | Browser / Client (DOM event layer) | Content model (`normalizeText`) | Selection is a browser-native API; conversion to grapheme offsets MUST go through the D-05 normalized-text substrate (the single canonical coordinate). Never persisted as DOM state. |
| Selector derivation (`deriveQuoteSelector`) | Content model (pure logic) | — | Already implemented in Phase 1; pure function over `CanonicalArticle` + `TextPositionSelector`. |
| Selector resolution (`resolveQuoteSelector`) | Content model (pure logic) | — | Pure substring-matching algorithm over `normalizeText(article)`. No DOM, no React, no I/O. Phase 5 implements the stubbed contract. |
| Highlight/note persistence | Database / Storage (IndexedDB via Dexie) | — | Local-first; Dexie stores already reserved. Zod validation at the read/write boundary (STATE-04). |
| `<mark>` overlay rendering | Browser / Client (React renderer) | Content model (run slicing) | React owns the DOM; the overlay MUST render during the React commit (not as post-render DOM manipulation). Uses `splitParagraphRuns` to slice runs at highlight boundaries. |
| Cross-fragment highlight slicing | Frontend (pagination renderer) | Content model (source-offset math) | In paginated mode, each `PageFragment` carries per-fragment grapheme ranges; the renderer intersects the highlight range with the fragment range to produce visible `<mark>` slices (D5-16). |
| Floating toolbar | Browser / Client (transient positioned element) | — | `position: fixed`; tracks live selection state; never persisted, never modal. |
| Note popover | Browser / Client (Popover API) | — | `popover="manual"`; top-layer rendering near the highlight; debounced persistence. |
| Annotations drawer | Browser / Client (native `<dialog>`) | — | Reuses the D2-01 `.settings-panel` slide-over pattern; focus-trap + Esc + trigger-restore are free. |
| Navigate-back | Frontend (anchor coordination) | Pagination engine (page turn) | Resolves grapheme offset → block → page (paginated) or `scrollIntoView` (scrolling). Reuses D4-10/D4-11 machinery in reverse. |
| Ambiguous/orphan surfacing | Browser / Client (rendering + drawer) | Content model (resolution result) | Resolution returns a tri-state; the renderer + drawer flag unresolved highlights distinctly (D5-04). |

## Standard Stack

### Core

No new packages. Phase 5 is built entirely on the existing locked stack (STACK.md) + the substrate shipped by Phases 1–4. Every dependency is already installed and version-locked in `package.json`.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React + React DOM | 19.2.8 | Highlight overlay, popover, drawer, toolbar, selection listener | Already the UI substrate; React owns the DOM. No state library (STACK.md forbids Redux/Zustand). [VERIFIED: codebase — package.json] |
| TypeScript | 7.0.2 | Selector contracts, persistence schemas, exhaustive block-kind switches | Already locked. Annotation types are discriminated unions + Zod schemas. [VERIFIED: codebase] |
| Zod | 4.4.3 | `HighlightRecordSchema` + `NoteRecordSchema` boundary validation | Already the single source of truth for every persisted record (STATE-04). [VERIFIED: codebase] |
| Dexie | 4.4.4 | IndexedDB transactions for `highlights` + `notes` stores | Stores already reserved in `db.ts` v1. [VERIFIED: codebase] |
| Browser Selection/Range APIs | Platform | Capture ephemeral selections into durable selectors | STACK.md locks this. [CITED: STACK.md] |
| Browser Popover API | Platform | Note popover (`popover="manual"`) | Ships in all target engines (current Chromium/Firefox/WebKit). [VERIFIED: codebase — 05-UI-SPEC.md §Design System rationale] |
| `Intl.Segmenter` | Platform | Grapheme-offset conversion during capture + resolution | Already used by `normalizeText.ts`. [VERIFIED: codebase] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Playwright Test | 1.61.1 | Real-browser validation of selection, highlight rendering, cross-fragment slicing, forced-colors | All annotation layout/accessibility truth MUST run in real browsers (STACK.md forbids DOM emulators for layout truth). [VERIFIED: codebase] |
| `@axe-core/playwright` | 4.12.1 | Automated a11y checks on popover, drawer, toolbar, highlight states | Run on every new annotation surface. [VERIFIED: codebase] |
| React Testing Library | 16.3.2 | Component tests for selection capture logic, popover lifecycle, drawer ordering | Query by role/label for the annotation chrome. [VERIFIED: codebase] |
| Vitest | 4.1.10 | Unit tests for `resolveQuoteSelector`, capture offset mapping, persistence schemas | Pure-logic tests (jsdom-safe — no layout). [VERIFIED: codebase] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Project-owned `<mark>` overlay via `splitParagraphRuns` | `dom-anchor-text-quote` / hypothes.is anchor library | STACK.md defers selector helpers until the internal contract is proven. The internal contract IS proven (Phase 1 shipped it). Adding a library now would not remove the capture/render/resolution work — it only changes the re-anchoring internals, which are the simplest part. [CITED: STACK.md "Alternatives Considered"] |
| Popover API (`popover="manual"`) | `<dialog>`/`showModal` for the note popover | UI-SPEC §Design System rationale settles this: `<dialog>` is too heavy (centered + backdrop); the popover needs top-layer + no light-dismiss + no backdrop. [VERIFIED: codebase — 05-UI-SPEC.md] |
| Dexie compound-index range query for cross-revision lookup | A new `articleId` plain index (would require Dexie version 3) | The existing `[articleId+revision]` compound index supports prefix range queries. Adding a plain index is a store-shape change (Pitfall 9). NOT worth the version bump for MVP highlight counts. [VERIFIED: codebase — see §Persistence Schema] |

**Installation:**
```bash
# No installation needed. All dependencies are already in package.json.
```

**Version verification:** All packages confirmed against `package.json` (read this session). No new packages introduced.

## Package Legitimacy Audit

> No new packages are installed this phase. The audit is therefore a no-op.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| *(none new)* | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none (no new packages).
**Packages flagged as suspicious [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
                          ┌─────────────────────────────────────────────┐
                          │            READER INTERACTION               │
                          │                                             │
                          │  Select text (mouse/touch/Shift+arrows)     │
                          │  Press H (highlight) or N (highlight+note)  │
                          └──────────────────┬──────────────────────────┘
                                             │
                                             ▼
                          ┌──────────────────────────────────────────────┐
                          │         SELECTION CAPTURE LAYER               │
                          │  (src/annotations/capture.ts — NEW)           │
                          │                                              │
                          │  window.getSelection() → DOM Range            │
                          │        │                                     │
                          │        ▼                                     │
                          │  Walk to [data-block-index] ancestor           │
                          │        │                                     │
                          │        ▼                                     │
                          │  Map DOM char offsets → grapheme offsets      │
                          │  (whitespace-collapse correction via           │
                          │   normalizeRunText alignment)                  │
                          │        │                                     │
                          │        ▼                                     │
                          │  TextPositionSelector { start, end }          │
                          │  (article-global D-05 grapheme range)         │
                          └──────────────────┬──────────────────────────┘
                                             │
                                             ▼
                          ┌──────────────────────────────────────────────┐
                          │       SELECTOR DERIVATION (Phase 1)           │
                          │  deriveQuoteSelector(article, position)        │
                          │        │                                     │
                          │        ▼                                     │
                          │  TextQuoteSelector { prefix, exact, suffix }  │
                          └──────────────────┬──────────────────────────┘
                                             │
                                             ▼
                          ┌──────────────────────────────────────────────┐
                          │     PERSISTENCE LAYER (Dexie/IndexedDB)       │
                          │  (src/persistence/highlightsStore.ts — NEW)   │
                          │  (src/persistence/notesStore.ts — NEW)        │
                          │                                              │
                          │  HighlightRecord { id, articleId, revision,   │
                          │    position: TextPositionSelector,            │
                          │    quote: TextQuoteSelector, ... }            │
                          │        │                                     │
                          │        │  NoteRecord { id, highlightId, text } │
                          │        │   (optional, 1:1 via highlightId)     │
                          │        ▼                                     │
                          │  Zod safeParse on READ (STATE-04)              │
                          │  classifyStorageError on failure (STATE-05)    │
                          └──────────────────┬──────────────────────────┘
                                             │
                   ┌─────────────────────────┼─────────────────────────┐
                   │                         │                         │
                   ▼                         ▼                         ▼
    ┌──────────────────────┐  ┌──────────────────────────┐  ┌─────────────────────┐
    │  RESOLUTION (on open) │  │  RENDERING (every paint) │  │  NAVIGATE-BACK      │
    │  resolveQuoteSelector │  │                          │  │  (drawer entry tap) │
    │  (src/content/        │  │  <mark> overlay INTO     │  │                     │
    │   normalizeText.ts)   │  │  BlockRenderer/          │  │  grapheme offset →  │
    │                       │  │  InlineRenderer output   │  │  block → page/scroll│
    │  exact → confident    │  │                          │  │  (D4-10/D4-11       │
    │  N>1 → ambiguous      │  │  splitParagraphRuns at   │  │   in reverse)       │
    │  0 → orphan           │  │  highlight boundaries     │  │                     │
    │                       │  │                          │  │  focus the <mark>   │
    │  Tri-state drives:    │  │  Cross-fragment slicing: │  │                     │
    │  - normal <mark>      │  │  intersect range with    │  └─────────────────────┘
    │  - unresolved marker  │  │  PageFragment ranges      │
    │  - drawer flag        │  │  (D5-16)                  │
    └──────────────────────┘  └──────────────────────────┘
```

### Recommended Project Structure

```
src/
├── annotations/                    # NEW — annotation domain layer
│   ├── capture.ts                  # Selection → TextPositionSelector (DOM offset → grapheme offset mapping)
│   ├── resolution.ts               # resolveQuoteSelector implementation (D5-02 algorithm)
│   ├── overlap.ts                  # Disjoint-range check (D5-13)
│   └── highlightRanges.ts          # Compute which highlight ranges apply to a given block + slice them for rendering
├── content/
│   ├── normalizeText.ts            # EXISTING — add resolveQuoteSelector (was stubbed L149-152)
│   └── schema.ts                   # EXISTING — add HighlightRecordSchema + NoteRecordSchema
├── content/render/
│   ├── BlockRenderer.tsx           # EXISTING — ArticleBody passes resolved highlights to InlineList
│   └── InlineRenderer.tsx          # EXISTING — InlineList wraps highlighted run slices in <mark>
├── persistence/
│   ├── db.ts                       # EXISTING — fix Table type annotations; NO version bump
│   ├── highlightsStore.ts          # NEW — load/save/delete highlights (mirrors locationStore.ts)
│   └── notesStore.ts               # NEW — load/save/delete notes (mirrors locationStore.ts)
├── reader/
│   ├── annotations/                # NEW — annotation UI components
│   │   ├── SelectionToolbar.tsx    # Floating toolbar (position: fixed, tracks selection)
│   │   ├── NotePopover.tsx         # Popover API note editor (popover="manual")
│   │   ├── AnnotationsDrawer.tsx   # Native <dialog> slide-over list (reuses .settings-panel pattern)
│   │   ├── HighlightOverlay.tsx    # Context provider that resolves + distributes highlight state
│   │   └── useAnnotationState.ts   # Hook: load highlights, resolve, CRUD, debounced note save
│   ├── Header.tsx                  # EXISTING — add annotations-trigger button to .header-controls
│   └── WipeConfirm.tsx             # EXISTING — pattern reference for delete-confirm
├── pagination/
│   ├── anchor.ts                   # EXISTING — reused by navigate-back (D5-11)
│   ├── fragmentRenderer.tsx        # EXISTING — PageFragmentView passes highlights to BlockView for cross-fragment slicing
│   └── splitBlock.ts               # EXISTING — splitParagraphRuns reused for highlight run slicing
├── routes/
│   └── ArticleView.tsx             # EXISTING — wire selection listener, H/N shortcuts, popover/drawer coordination, user-select:none on measurement body
└── app.css                         # EXISTING — add --highlight token, mark.highlight styles, toolbar/popover/drawer styles, forced-colors overrides
```

### Pattern 1: Selection Capture — DOM Range → TextPositionSelector

**What:** Convert an ephemeral browser `Selection` into a durable `TextPositionSelector` (article-global grapheme offsets) at the moment of highlight creation.
**When to use:** Every time the reader activates "Highlight" / "Highlight + note" (or presses H/N).
**The core challenge:** DOM `textContent` and `normalizeText(article)` can DIFFER in whitespace. `normalizeRunText` collapses `[\t\n\f\r ]+` to a single space and trims; `inlineText` joins runs with `" "`. The DOM renders adjacent runs without separators. So a raw DOM character offset does NOT directly map to a grapheme offset in the normalized text.

**Recommended approach (mirrors `restoreLocation.ts` discipline — never fork normalization):**

```typescript
// src/annotations/capture.ts
// Source: codebase pattern from src/reader/restoreLocation.ts (normalizeElText) +
// src/content/normalizeText.ts (normalizeRunText, graphemeClusters, blockNormalizedText)

import type { CanonicalArticle } from "../content/types";
import {
  BLOCK_SEPARATOR,
  blockNormalizedText,
  graphemeClusters,
  normalizeRunText,
} from "../content/normalizeText";
import { blockGraphemeLength } from "../pagination/anchor";
import type { TextPositionSelector } from "../content/normalizeText";

/**
 * The result of attempting to capture a selection. INVALID selections
 * (multi-block, cross-page, empty, outside eligible blocks) return a
 * discriminated reason so the toolbar can show the right hint (D5-06/D5-13).
 */
export type CaptureResult =
  | { ok: true; blockIndex: number; position: TextPositionSelector }
  | { ok: false; reason: "empty" | "multi-block" | "ineligible" | "measurement-body" };

/**
 * Capture the current window.getSelection() as a TextPositionSelector.
 *
 * The caller (ArticleView) passes the article + the visible reading-surface
 * root (scrolling .article-body OR the visible .page-fragment). The hidden
 * .article-body-measurement is excluded by user-select:none (D5-08) so the
 * browser never produces a selection inside it.
 */
export function captureSelection(
  article: CanonicalArticle,
  readingRoot: HTMLElement,
): CaptureResult {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return { ok: false, reason: "empty" };
  }
  const range = selection.getRangeAt(0);

  // 1. Find the [data-block-index] ancestor of BOTH endpoints.
  //    If they differ → multi-block (D5-06 rejects).
  const startBlock = findBlockAncestor(range.startContainer, readingRoot);
  const endBlock = findBlockAncestor(range.endContainer, readingRoot);
  if (!startBlock || !endBlock) {
    return { ok: false, reason: "ineligible" };
  }
  if (startBlock !== endBlock) {
    return { ok: false, reason: "multi-block" };
  }
  const blockIndexAttr = startBlock.getAttribute("data-block-index");
  if (blockIndexAttr === null) {
    return { ok: false, reason: "ineligible" };
  }
  const blockIndex = Number(blockIndexAttr);
  const block = article.blocks[blockIndex];
  if (!block || !isEligibleBlock(block)) {
    return { ok: false, reason: "ineligible" };
  }

  // 2. Map the DOM Range to intra-block grapheme offsets.
  //    Build a DOM-text-offset → normalized-grapheme-offset map for this block.
  const intraRange = domRangeToIntraBlockGraphemeRange(
    startBlock,
    range,
    article.lang,
    block,
  );

  // 3. Add the block's article-global start offset.
  const blockGlobalStart = computeBlockGlobalStart(article, blockIndex);
  const position: TextPositionSelector = {
    start: blockGlobalStart + intraRange.start,
    end: blockGlobalStart + intraRange.end,
  };
  return { ok: true, blockIndex, position };
}
```

**The whitespace-collapse mapping (the load-bearing detail):**

```typescript
// Source: derived from src/content/normalizeText.ts normalizeRunText rules +
// src/reader/restoreLocation.ts normalizeElText (the reverse direction).

/**
 * Map a DOM Range's character offsets (into the block element's raw
 * textContent) to grapheme offsets in blockNormalizedText(block).
 *
 * KEY INSIGHT: normalizeRunText collapses [\t\n\f\r ]+ to a single space
 * and trims. inlineText joins runs with " ". The DOM renders adjacent runs
 * WITHOUT separators. So raw textContent and normalized text have the same
 * non-whitespace characters in the same order, but whitespace may differ.
 *
 * APPROACH: walk the block's text nodes in document order (TreeWalker
 * SHOW_TEXT), building a cumulative raw-char offset. Simultaneously walk
 * the normalized text's grapheme clusters. Align them by matching
 * non-whitespace characters. When the raw text has whitespace that the
 * normalized text collapsed/trimmed, advance the raw pointer without
 * advancing the normalized pointer.
 *
 * This is browser-independent (no reliance on selection.toString()'s
 * whitespace serialization, which varies by engine).
 */
function domRangeToIntraBlockGraphemeRange(
  blockEl: HTMLElement,
  range: Range,
  lang: string,
  block: Block,
): { start: number; end: number } {
  // ... walks text nodes, aligns raw offsets to normalized grapheme offsets
  // via the whitespace-collapse rules in normalizeRunText.
}
```

**Anti-pattern (DO NOT):** Persist the DOM `Range`, `XPath`, or selection text alone. STACK.md forbids it. `selection.toString()` whitespace serialization varies by browser engine — it is NOT a reliable anchor. [CITED: STACK.md "What NOT to Use"]

### Pattern 2: resolveQuoteSelector — the D5-02 Re-anchoring Algorithm

**What:** Re-resolve a stored `TextQuoteSelector` against the current revision's normalized text to produce a `TextPositionSelector` (or an explicit ambiguous/orphan state).
**When to use:** On article open (D5-01 cross-revision re-attachment), the stored quote selector is re-resolved against the CURRENT revision's `normalizeText(article)`.

**The contract is already locked** — Phase 1 shipped the return type:
```typescript
// src/content/normalizeText.ts L149-152 (STUBBED — Phase 5 implements)
// resolveQuoteSelector(article, selector): TextPositionSelector | "ambiguous" | "orphan"
```

**D5-02 algorithm (exact-first, then prefix/suffix disambiguate, then orphan):**

```typescript
// Source: D5-02 in 05-CONTEXT.md (locked decision). Algorithm pattern
// informed by W3C Web Annotation Text Position Selector re-anchoring
// [CITED: w3.org/TR annotation-model/#selectors] and hypothes.is
// open-source anchor resolution [ASSUMED — training knowledge of
// hypothes.is client re-anchoring approach].

export function resolveQuoteSelector(
  article: CanonicalArticle,
  selector: TextQuoteSelector,
  positionHint?: TextPositionSelector, // D5-02: nearness hint to prefer closest candidate
): TextPositionSelector | "ambiguous" | "orphan" {
  const text = normalizeText(article);

  // Step 1: find ALL exact-substring matches of selector.exact.
  const exactMatches = findAllOccurrences(text, selector.exact);

  // Step 2: unique exact → confident (return position).
  if (exactMatches.length === 1) {
    return { start: exactMatches[0], end: exactMatches[0] + selector.exact.length };
  }

  // Step 3: N>1 exact → use prefix+suffix window to narrow to a unique
  // surrounding match. For each candidate, check that the text immediately
  // before it matches selector.prefix AND the text immediately after matches
  // selector.suffix (allowing for context-radius trimming).
  if (exactMatches.length > 1) {
    const disambiguated = exactMatches.filter((start) =>
      matchesContext(text, start, selector.exact.length, selector.prefix, selector.suffix),
    );
    if (disambiguated.length === 1) {
      return { start: disambiguated[0], end: disambiguated[0] + selector.exact.length };
    }
    // Still ambiguous → return "ambiguous" (positionHint breaks ties
    // for DISPLAY purposes only, but the state is still ambiguous —
    // D5-04: ambiguous highlights are non-navigating).
    return "ambiguous";
  }

  // Step 4: zero exact matches → fall back to prefix+suffix-only window match.
  // Search for a position where prefix precedes AND suffix follows,
  // even though the exact text changed.
  const prefixMatches = findAllOccurrences(text, selector.prefix);
  for (const prefixStart of prefixMatches) {
    const candidateExactStart = prefixStart + selector.prefix.length;
    const suffixStart = candidateExactStart; // unknown exact length
    // Check if selector.suffix appears shortly after the prefix
    // (within a small window — the exact text changed but context remains).
    // ... positionHint prefers the closest candidate.
  }
  // If exactly one confident prefix+suffix match → confident (low-certainty).
  // If zero → orphan.
  // If N>1 → orphan (cannot disambiguate without the exact text).
  return "orphan";
}
```

**Key properties:**
- Pure function — no DOM, no React, no I/O. jsdom-safe for unit testing.
- The `positionHint` (stored `TextPositionSelector`) is a TIE-BREAKER for display position, NOT a silent re-attachment mechanism. If the exact text matches uniquely, the hint is ignored (the text IS the anchor). The hint only matters when the exact text is absent and the prefix+suffix fallback finds multiple candidates near the original position. [VERIFIED: D5-02 in CONTEXT.md]
- Within a single revision, `normalizeText(article)` is byte-identical, so `exact` always matches at least once → the fast confident path. Ambiguous/orphan are only genuinely reachable cross-revision (an edited passage → orphan; a duplicated passage → ambiguous). [VERIFIED: D5-01 in CONTEXT.md]

### Pattern 3: Persistence Schema (Dexie — NO version bump)

**What:** Zod-validated `HighlightRecord` and `NoteRecord` schemas + persistence seams mirroring the proven `locationStore.ts` pattern.
**When to use:** Every highlight create/read/update/delete; every note create/edit/delete.

**The Dexie version question (Pitfall 9 analysis):**

The `db.ts` v1 declaration already reserves:
```typescript
// db.ts L58-61 (Phase 1 — shipped, byte-unchanged)
highlights: "id, [articleId+revision]",  // primary key: id; compound index: [articleId, revision]
notes: "id, highlightId",                // primary key: id; index: highlightId
```

**Finding: NO version bump is needed.** The v1 store declarations provide:
- `highlights`: primary key `id` (for direct get/delete) + compound index `[articleId+revision]` (for querying all highlights of an article across revisions — D5-01 cross-revision lookup via `db.highlights.where("[articleId+revision]").between([id, 0], [id, Infinity]))` or simply filtering by `articleId`).
- `notes`: primary key `id` + index `highlightId` (for cascade-delete: delete all notes where `highlightId === X` — D5-12).

The v2 block (added in Phase 2) re-declares ONLY `articles`/`settings`/`location` — it does NOT touch `highlights`/`notes`. Phase 5 does NOT add a v3 block. The stores are already declared with sufficient indexes. [VERIFIED: db.ts L51-75]

**⚠️ Type annotation fix required:** The Phase 1 `Table<>` property annotations in `db.ts` L43-47 are PLACEHOLDERS that Phase 5 must replace with the real row types:
```typescript
// CURRENT (placeholder — Phase 1):
highlights!: Table<{ id: string; "[articleId+revision]": string }, string>;
notes!: Table<{ id: string; highlightId: string }, string>;

// PHASE 5 (real row types — mirrors LocationRecordRow):
highlights!: Table<HighlightRecordRow, string>;
notes!: Table<NoteRecordRow, string>;
```
This is a LOW-risk type annotation change (mirrors the Phase 2 precedent — `02-PATTERNS.md` line 106 authorized `Table<>` definite-assignment annotations; runtime behavior is unaffected since Dexie resolves stores by name from the version declarations, not from the TS types). [VERIFIED: db.ts L33-47 comment + STATE.md Phase 02-02 decision]

**Zod schemas (added to `schema.ts` — single source of truth):**

```typescript
// src/content/schema.ts — Phase 5 additions

/** TextPositionSelector stored inside a HighlightRecord (D-05 grapheme range). */
export const TextPositionSelectorSchema = z.object({
  start: z.number().int().min(0),
  end: z.number().int().min(0),
}).refine(s => s.end > s.start, { message: "end must be > start" });

/** TextQuoteSelector stored inside a HighlightRecord (W3C re-anchoring substrate). */
export const TextQuoteSelectorSchema = z.object({
  prefix: z.string(),
  exact: z.string().min(1),
  suffix: z.string(),
});

/** HighlightRecord — one durable highlight. schemaVersion for STATE-04 migration. */
export const HighlightRecordSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),                          // UUID or nanoid — primary key
  articleId: z.string(),                   // matches ArticleSchema.id (D-06)
  revision: z.number().int().min(1),       // revision AT CREATION TIME (for orphan detection)
  position: TextPositionSelectorSchema,    // D5-03: grapheme range (primary anchor)
  quote: TextQuoteSelectorSchema,          // D5-03: prefix/exact/suffix (recovery substrate)
  createdAt: z.string().datetime(),        // ISO-8601
});
export type HighlightRecord = z.infer<typeof HighlightRecordSchema>;

/** NoteRecord — one note attached to a highlight (1:1 via highlightId). */
export const NoteRecordSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  highlightId: z.string(),                 // FK → HighlightRecord.id
  text: z.string(),                        // reader-authored; empty string = no note
  updatedAt: z.string().datetime(),
});
export type NoteRecord = z.infer<typeof NoteRecordSchema>;
```

**Persistence seam (mirrors `locationStore.ts` exactly):**

```typescript
// src/persistence/highlightsStore.ts — NEW
// Source: codebase pattern from src/persistence/locationStore.ts

export type HighlightsLoadResult =
  | { ok: true; highlights: HighlightRecord[] }
  | { ok: false; reason: "unavailable" | "corrupt" | "unupgradeable" };

/** Load ALL highlights for an articleId (across revisions — D5-01). Never throws. */
export async function loadHighlights(articleId: string): Promise<HighlightsLoadResult> {
  try {
    // Compound index range query: all rows where articleId matches.
    const rows = await db.highlights
      .where("[articleId+revision]")
      .between([articleId, 0], [articleId, Number.MAX_SAFE_INTEGER])
      .toArray();
    // Validate each row (STATE-04). Drop invalid rows (defensive — a single
    // corrupt row should not block all highlights).
    const valid: HighlightRecord[] = [];
    for (const row of rows) {
      const parsed = HighlightRecordSchema.safeParse(row);
      if (parsed.success) valid.push(parsed.data);
    }
    return { ok: true, highlights: valid };
  } catch (e) {
    return { ok: false, reason: classifyStorageError(e) };
  }
}

/** Save (upsert) a highlight. Throws propagate to caller → STATE-05 routing. */
export async function saveHighlight(h: HighlightRecord): Promise<void> {
  await db.highlights.put(h);
}

/** Delete a highlight + cascade-delete its note (D5-12). */
export async function deleteHighlight(highlightId: string): Promise<void> {
  await db.transaction("rw", db.highlights, db.notes, async () => {
    await db.highlights.delete(highlightId);
    await db.notes.where("highlightId").equals(highlightId).delete();
  });
}
```

**Transaction pattern for cascade-delete:** Dexie's `db.transaction("rw", db.highlights, db.notes, async () => { ... })` ensures the highlight + its note are deleted atomically. This is critical for D5-12 (a highlight and its note are removed together). [CITED: dexie.org/docs — Dexie transaction API]

### Pattern 4: `<mark>` Overlay Rendering — INTO the Existing Semantic Renderer

**What:** Render highlights as `<mark class="highlight">` elements layered INTO the existing `BlockRenderer`/`InlineRenderer` output. No parallel renderer, no post-render DOM manipulation.
**When to use:** Every render of an article block that contains a highlight range (both scrolling and paginated modes).

**The approach (reuses `splitParagraphRuns`):**

```typescript
// Source: codebase — src/pagination/splitBlock.ts splitParagraphRuns (marks
// preserved across splits) + src/content/render/InlineRenderer.tsx InlineList.
//
// A highlight at intra-block grapheme range [hlStart, hlEnd) splits a
// paragraph's InlineRun[] into three slices:
//   before: runs [0, hlStart)
//   highlighted: runs [hlStart, hlEnd)
//   after: runs [hlEnd, total)
// The highlighted slice wraps in <mark>. Both boundary-run marks survive
// (Pitfall 4 from Phase 4 — a link split by a highlight boundary becomes
// two link runs inside/outside the <mark>).

function renderParagraphWithHighlights(
  block: Extract<Block, { kind: "paragraph" }>,
  lang: string,
  highlights: ResolvedHighlight[],  // highlights whose range intersects THIS block
  blockGlobalStart: number,         // this block's article-global start offset
): React.ReactNode {
  if (highlights.length === 0) {
    return <InlineList runs={block.content} />;
  }
  // Sort highlight intersection ranges by start offset.
  // Walk the runs, splitting at each highlight boundary, wrapping
  // highlighted slices in <mark class="highlight" data-highlight-id="...">
  // with tabindex=0, aria-label, aria-haspopup.
  // ... (uses splitParagraphRuns at each boundary)
}
```

**Cross-fragment slicing (D5-16 — paginated mode):**

In paginated mode, `PageFragmentView` already slices each block at the fragment's `[startGrapheme, endGrapheme)` range via `resolveBlockSlice` (in `fragmentRenderer.tsx`). A highlight whose range intersects the fragment produces a visible `<mark>` for the intersection. The renderer:

1. Receives the fragment's blocks (each with `{ blockIndex, startGrapheme, endGrapheme }`)
2. For each block, computes the article-global range of what's visible on this page
3. Intersects each highlight's range with the visible range
4. Wraps the intersection in `<mark>` (all sharing the same `data-highlight-id`)

**Key rule:** a single-block highlight whose block is split across a page boundary renders on EACH page fragment containing part of its range. If the split falls inside the highlight, both pages show the partial mark. The popover/note is reachable from either. [VERIFIED: D5-16 in CONTEXT.md]

**Anti-pattern (DO NOT):** Fork a parallel highlight renderer that re-walks the Block model. This would duplicate the DOC-02 reading-order logic and risk D-05 offset drift. The overlay MUST layer into the existing `BlockView` output. [VERIFIED: 05-UI-SPEC.md §Phase Scope, 05-CONTEXT.md canonical_refs]

### Pattern 5: Native `<dialog>` Drawer + Popover API Popover + Fixed Toolbar

**What:** Three overlay mechanisms, each chosen for its interaction contract.

| Surface | Mechanism | Why |
|---------|-----------|-----|
| Annotations drawer (D5-09) | native `<dialog>` + `showModal()` | Reuses the `.settings-panel` pattern (D2-01): free focus-trap + Esc + trigger-restore + inert backdrop. Sibling of the settings panel. |
| Note popover (D5-10) | Popover API (`popover="manual"`) | Top-layer rendering without a backdrop. `manual` mode → typing doesn't light-dismiss. `<dialog>`/showModal is too heavy (centered + backdrop). All target engines ship it. |
| Floating toolbar (D5-05) | `position: fixed` element | Transient, non-modal 2-button affordance tied 1:1 to live selection state. `popover="auto"` would light-dismiss on the `mouseup` that finalizes the selection. |

[VERIFIED: 05-UI-SPEC.md §Design System rationale table — all three mechanisms + rationale locked]

**Drawer reuses D2-01 verbatim:**
```typescript
// <dialog class="annotations-drawer"> shown via showModal()
// Same geometry as .settings-panel (near-full-width <640px; ~400px ≥640px)
// Same focus-restore pattern (capture activeElement on open, .focus() on close)
// Same Esc/scrim-close behavior
```

**Popover lifecycle:**
```typescript
// <div popover="manual" class="highlight-popover" role="dialog">
// showPopover() on highlight activation (Enter/Space/click)
// hidePopover() on Done / Escape
// React state controls visibility; Popover API handles top-layer rendering
// No backdrop (the article stays visible + interactive behind the popover)
```

### Pattern 6: Debounced Note Save (mirrors SettingsContext D2-03)

**What:** The note textarea persists debounced (no Save button). The debounce window matches the settings cadence (~400–800ms). On `Done`/`Escape`, a final flush fires so no edit is lost.
**When to use:** Every keystroke in the note textarea.

```typescript
// Source: codebase — src/settings/SettingsContext.tsx scheduleSave (L113-129) +
// flushSave (L132-146) + dual-event flush (L154-165).
//
// The note save mirrors this EXACTLY:
// - scheduleNoteSave(nextText): debounced saveNote, stashes pendingRef
// - flushNoteSave(): immediate write on Done/Escape
// - Dual-event flush: visibilitychange-hidden + pagehide (bfcache-safe)
// - Empty textarea = no note (the NoteRecord is deleted or never created)
```

**Announce discipline (D5-12, A11Y-08):** "Note saved." announces ONCE after the debounce window commits (not on every keystroke — the announce is itself debounced so rapid typing doesn't chatter). [VERIFIED: 05-UI-SPEC.md §Copywriting + §Interaction 32]

### Anti-Patterns to Avoid

- **DO NOT persist DOM `Range`, XPath, page numbers, pixels, or React component paths.** STACK.md forbids it. These are ephemeral and change with every relayout. [CITED: STACK.md "What NOT to Use"]
- **DO NOT fork `normalizeText` or `blockNormalizedText`.** Any divergence shifts every anchor. The capture path, resolution path, and rendering path MUST all import from `src/content/normalizeText.ts`. [VERIFIED: normalizeText.ts L65-75 Pattern 5 note]
- **DO NOT fork `BlockRenderer`/`InlineRenderer`.** The `<mark>` overlay renders INTO the existing semantic output. A parallel renderer would duplicate DOC-02 reading-order logic and risk D-05 offset drift. [VERIFIED: 05-UI-SPEC.md §Phase Scope]
- **DO NOT use `jsdom`/`happy-dom` for layout truth.** Selection capture, `<mark>` rendering, cross-fragment slicing, and forced-colors MUST be validated in Playwright across Chromium/Firefox/WebKit. [CITED: STACK.md "What NOT to Use"]
- **DO NOT re-implement the confirm-the-destructive-action pattern.** Mirror `WipeConfirm.tsx` exactly: two-step confirm, `[data-initial-focus]` on the non-destructive button, `--destructive` border on the destructive button. [VERIFIED: WipeConfirm.tsx + STATE.md Phase 02-02 Pitfall 8]
- **DO NOT use `selection.toString()` as the anchor.** Its whitespace serialization varies by browser engine. Build an explicit DOM-offset → grapheme-offset map instead. [VERIFIED: cross-browser selection behavior — see §Common Pitfalls]
- **DO NOT silently re-attach to a wrong spot.** ANNO-07 requires an explicit ambiguous/orphan state. `resolveQuoteSelector` returns the tri-state; the renderer + drawer MUST surface it. [VERIFIED: D5-02/D5-04]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Grapheme-offset substrate | Custom text coordinate system | `normalizeText.ts` (Phase 1 — `normalizeText`, `graphemeClusters`, `blockNormalizedText`, `deriveQuoteSelector`) | Already the single canonical coordinate. Forking shifts every anchor. |
| Quote selector derivation | Custom prefix/exact/suffix computation | `deriveQuoteSelector(article, position, contextRadius=32)` (Phase 1 — shipped) | Already implemented + unit-tested. Default radius locked at 32. |
| Run slicing at boundaries | Custom InlineRun splitter | `splitParagraphRuns(runs, splitAtGrapheme, lang)` (Phase 4 — `splitBlock.ts`) | Already preserves marks across splits (Pitfall 4). The `<mark>` overlay reuses this to slice runs at highlight boundaries. |
| Article-global offset math | Custom block-offset accumulation | `blockGraphemeLength`, `pageStartGlobalOffset`, `fragmentContainingOffset` (Phase 4 — `anchor.ts`) | Already the D4-10/D4-11 anchor machinery. Navigate-back runs it in reverse. |
| Dexie schema + transactions | Raw IndexedDB | Dexie (already installed) | Migration, transaction, query, and error-handling ergonomics. Cascade-delete uses Dexie transactions. |
| Boundary validation | Hand-written type guards | Zod schemas (`HighlightRecordSchema`, `NoteRecordSchema`) | STATE-04 requires validated/versioned records. Zod is already the single source of truth. |
| Storage error classification | Custom error switch | `classifyStorageError(e)` (Phase 2 — `errors.ts`) | Already classifies Dexie errors into unavailable/corrupt/unupgradeable for STATE-05 routing. |
| Confirm-the-destructive-action | Custom confirm dialog | `WipeConfirm.tsx` pattern (two-step + `[data-initial-focus]` + `--destructive` border) | Pitfall 8 precedent. The delete confirm mirrors this exactly. |
| Slide-over panel | Custom modal/focus-trap | Native `<dialog>`/`showModal` (D2-01 pattern) | Free focus-trap + Esc + trigger-restore + inert backdrop. |
| Focus-visible / reduced-motion / forced-colors gates | Custom a11y handling | Existing `app.css` global gates | Already applied to every element. New annotation surfaces inherit them. |

**Key insight:** Phase 5 adds ZERO new infrastructure categories. Every pattern it needs (Zod-at-boundary, debounced save, Dexie transactions, native `<dialog>`, confirm-destructive, `.status` announce, source-offset pagination, grapheme-offset anchor) was proven by a prior phase. The work is domain logic that connects these existing seams.

## Runtime State Inventory

> This is a **greenfield feature phase** (adding highlights/notes to an existing reader), NOT a rename/refactor/migration phase. The Runtime State Inventory is therefore focused on **what persisted state Phase 5 introduces** and **what existing persisted state it must coexist with**.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data (Dexie/IndexedDB) | `highlights` and `notes` stores already RESERVED in `db.ts` v1 (L58-61) but contain ZERO records (no prior phase wrote to them). Phase 5 populates them. The `settings`, `location`, and `articles` stores are unaffected. | Populate the reserved stores. NO Dexie version bump (see §Persistence Schema). Fix the `Table<>` placeholder type annotations (LOW risk). |
| Live service config | None — Lem Reader is a client-only SPA with no backend services, no external APIs, no server-side state. | None. |
| OS-registered state | None — no service workers, no scheduled tasks, no OS-level registrations. | None. |
| Secrets/env vars | None — no secrets, no environment variables for annotation features. | None. |
| Build artifacts | None new — Phase 5 adds source files under `src/annotations/` and `src/reader/annotations/`. No compiled artifacts, no global installs. The `db.ts` type annotation fix does not affect the build (Dexie resolves stores by name). | None. |

**Coexistence with STATE-01 (reading location):** The `location` store (Phase 2) and the `highlights`/`notes` stores (Phase 5) are independent Dexie stores. No migration interaction. A reader's saved location and their highlights are separate records. [VERIFIED: db.ts]

**Coexistence with STATE-05 (storage failure):** Annotation persistence reuses the same `classifyStorageError` classifier. A storage failure during highlight save routes to the existing StorageBanner (not a new surface). Reading never depends on Dexie — if highlights fail to load, the article renders without them (calm degradation). [VERIFIED: settingsStore.ts/locationStore.ts + D2-13]

## Common Pitfalls

### Pitfall 1: DOM textContent ≠ normalizeText (whitespace collapse)

**What goes wrong:** A raw DOM character offset (from `Range.startOffset` into a text node) does NOT directly map to a grapheme offset in `normalizeText(article)`. `normalizeRunText` collapses `[\t\n\f\r ]+` to a single space and trims; `inlineText` joins runs with `" "`. The DOM renders adjacent runs without separators. A naive `textContent.indexOf()` or direct offset copy produces wrong anchors.
**Why it happens:** The DOM is a rendering of the Block model, not a 1:1 projection of the normalized text. Whitespace handling diverges at run boundaries and within runs with leading/trailing whitespace.
**How to avoid:** Build an explicit DOM-offset → normalized-grapheme-offset map in the capture layer. Walk the block's text nodes (TreeWalker SHOW_TEXT), align raw text to normalized text via the whitespace-collapse rules in `normalizeRunText`, and convert via `Intl.Segmenter`. Never assume `selection.toString()`'s whitespace matches the normalized text.
**Warning signs:** Highlights render at the wrong position after creation; highlights drift after a mode switch (the scrolling-mode DOM has different text-node structure than the paginated-mode fragment).

### Pitfall 2: `selection.toString()` whitespace varies by browser engine

**What goes wrong:** Chromium, Firefox, and WebKit serialize selections differently — some collapse internal whitespace, some preserve it, some trim boundaries. Using `selection.toString()` as the `exact` field or as a search key produces engine-dependent anchors.
**Why it happens:** The Selection API spec does not mandate a canonical whitespace serialization for `toString()`.
**How to avoid:** Derive `exact` from the `TextPositionSelector` via `deriveQuoteSelector` (which slices the grapheme array of `normalizeText`), NOT from `selection.toString()`. The capture layer produces the `TextPositionSelector` first; the quote selector derives from it deterministically.
**Warning signs:** A highlight created in Firefox doesn't re-anchor correctly in Chromium after a reopen.

### Pitfall 3: Forgetting `user-select: none` on the hidden measurement ArticleBody

**What goes wrong:** In paginated mode, the always-mounted hidden `.article-body-measurement` (Plan 04-08) contains a full copy of the article text. Without `user-select: none`, a reader can accidentally select invisible text → the capture layer maps the selection to a valid offset → a highlight is created on text the reader can't see.
**Why it happens:** The hidden ArticleBody is `aria-hidden` + `visibility: hidden` but `visibility: hidden` alone does NOT prevent text selection in all engines.
**How to avoid:** Add `user-select: none` to `.article-body-measurement` in `app.css` (D5-08). The capture layer also defensively checks that the selection is inside the VISIBLE reading root (not the measurement body).
**Warning signs:** Highlights appear at unexpected positions in paginated mode; the selection's block ancestor resolves to the hidden ArticleBody.

### Pitfall 4: Persisting derived page boundaries instead of grapheme offsets

**What goes wrong:** A highlight "on page 3" is stored with a page number or DOM path. After a repagination (viewport/font/typography change), the page count changes and the highlight lands on the wrong passage.
**Why it happens:** It's tempting to store "where the highlight is" as a page/DOM position because that's what the reader sees.
**How to avoid:** Persist ONLY `TextPositionSelector` (grapheme offsets) + `TextQuoteSelector`. The `<mark>` overlay is recomputed from the offset on EVERY render. Page boundaries are ephemeral (Phase 4 never persists them — `PageFragment` schemas carry `schemaVersion: z.literal(1)` and are described as "ephemeral compute result, never a persisted row"). [CITED: pagination/types.ts L17-22]
**Warning signs:** Highlights drift after changing font size or switching modes.

### Pitfall 5: Cross-fragment highlight gaps at page boundaries

**What goes wrong:** A single-block highlight whose block is split across a page boundary (D4-01) renders on only ONE page, leaving a silent gap on the other. The reader sees a "broken" highlight.
**Why it happens:** The naive approach renders the `<mark>` only on the page where the highlight's start offset falls.
**How to avoid:** D5-16 requires rendering on EVERY page fragment containing part of the grapheme range. The renderer intersects the highlight range with each fragment's source-offset range and produces a `<mark>` slice for each intersection. Both fragments share the same `data-highlight-id`.
**Warning signs:** A highlight that spans a page turn appears on one page but not the next; the popover is unreachable from one page.

### Pitfall 6: Dexie compound-key query syntax confusion

**What goes wrong:** The `[articleId+revision]` compound index is queried incorrectly. Dexie's compound index requires array-form range queries, not field-name queries. A `db.highlights.where("articleId").equals(id)` call FAILS because `articleId` is not a declared standalone index — only the compound `[articleId+revision]` is.
**Why it happens:** Dexie's compound index syntax is non-obvious. The Phase 2 location store hit this exact confusion (STATE.md: "Dexie [field+field] store syntax declares a COMPOUND PRIMARY KEY queried as array [val1, val2] — NOT a field named '[field+field]'").
**How to avoid:** Use `db.highlights.where("[articleId+revision]").between([articleId, 0], [articleId, Number.MAX_SAFE_INTEGER])` for cross-revision lookup (D5-01). Or, if the planner prefers a simpler `articleId` index, that WOULD require a Dexie version(3) store-shape change (Pitfall 9 — never edit a shipped version block; add a new one). For MVP, the compound-index range query is sufficient.
**Warning signs:** `QueryException` or empty results when loading highlights; Dexie throws "KeyPath [articleId+revision] not found on object."

### Pitfall 7: Silent re-attachment to a wrong spot (ANNO-07 violation)

**What goes wrong:** `resolveQuoteSelector` finds a "close enough" match and silently re-attaches the highlight there, without telling the reader the passage may have changed. This violates ANNO-07's "explicit ambiguous or orphaned state instead of silent reattachment."
**Why it happens:** It's tempting to always return a `TextPositionSelector` (never `"ambiguous"`/`"orphan"`) so highlights always render. But this hides content drift from the reader.
**How to avoid:** Implement the D5-02 algorithm EXACTLY: unique exact → confident; N>1 exact after prefix/suffix disambiguation → `"ambiguous"`; zero exact + no confident prefix/suffix fallback → `"orphan"`. The renderer + drawer MUST surface unresolved highlights distinctly (dashed-outline marker + flagged drawer entry). The `positionHint` is a display-position tie-breaker, NOT a silent re-attachment mechanism.
**Warning signs:** Highlights always render as normal marks, never as unresolved markers — even after simulated content edits.

### Pitfall 8: Note XSS via user-authored text

**What goes wrong:** Reader-authored note text is rendered unsafely (e.g., via `dangerouslySetInnerHTML` or template-literal HTML injection), allowing script injection.
**Why it happens:** The note is user input; if rendered as raw HTML, it's an XSS vector.
**How to avoid:** React escapes text children by default. Render note text as a React text child (`<span>{note.text}</span>`, `<textarea value={note.text} />`). The `react/no-danger` ESLint rule (enabled since Phase 1) statically forbids `dangerouslySetInnerHTML`. The `NoteRecordSchema.text` field is `z.string()` — no HTML parsing, no URL fields. [VERIFIED: schema.ts security boundaries + ESLint config]
**Warning signs:** (none expected — the defense is structural; verify via the ESLint rule firing + axe-core scan)

### Pitfall 9: Editing a shipped Dexie version block (Pitfall 9 from Phase 1)

**What goes wrong:** Phase 5 edits the `db.ts` v1 or v2 `version()` block to add/change store declarations. Any client that already opened v1/v2 has a broken upgrade chain — Dexie throws `VersionError` on the next open.
**Why it happens:** It seems natural to "just add the index I need" to the existing version block.
**How to avoid:** NEVER edit `db.ts` v1 or v2 blocks. The v1 declaration already reserves `highlights`/`notes` with sufficient indexes. If a genuinely new index is needed (e.g., a plain `articleId` index), add a `version(3).stores({...})` block that declares ONLY the changed stores. For MVP, NO version bump is needed. [VERIFIED: db.ts L6-10 comment + STATE.md Phase 02-01 Pitfall 9 decision]

### Pitfall 10: Forgetting to cascade-delete notes when deleting a highlight

**What goes wrong:** A highlight is deleted but its note remains orphaned in the `notes` store. The note references a `highlightId` that no longer exists.
**Why it happens:** The delete handler calls `db.highlights.delete(id)` but forgets to also delete the note.
**How to avoid:** `deleteHighlight` uses a Dexie transaction that deletes BOTH the highlight and its note atomically: `db.transaction("rw", db.highlights, db.notes, async () => { await db.highlights.delete(id); await db.notes.where("highlightId").equals(id).delete(); })`. D5-12: "A highlight and its note are removed together." [VERIFIED: Dexie transaction API]

## Code Examples

### Selector Round-Trip (the core invariant — ANNO-05/06)

```typescript
// Source: codebase — src/content/normalizeText.ts (Phase 1) +
// src/tests/unit/selectors.test.ts (Phase 1 patterns).
//
// The round-trip that Phase 5 MUST prove:
//   1. Capture selection → TextPositionSelector { start, end }
//   2. Derive quote: deriveQuoteSelector(article, position) → TextQuoteSelector
//   3. Persist both (HighlightRecord)
//   4. On reopen: resolveQuoteSelector(article, quote, position) → position'
//   5. position' === position (same revision → exact match → confident)

import {
  deriveQuoteSelector,
  resolveQuoteSelector,  // Phase 5 implements this
  normalizeText,
  graphemeClusters,
} from "../content/normalizeText";

// Within a single revision (the common case), resolution is the fast path:
const article = openFixture("essay-long-form");
const originalPosition = { start: 142, end: 168 };
const quote = deriveQuoteSelector(article, originalPosition);
const resolved = resolveQuoteSelector(article, quote, originalPosition);

// ANNO-05 invariant: same revision → resolved equals original.
assert(resolved !== "ambiguous" && resolved !== "orphan");
assert((resolved as TextPositionSelector).start === originalPosition.start);
assert((resolved as TextPositionSelector).end === originalPosition.end);

// Cross-revision (D5-01): if the passage was edited, the quote selector
// re-resolves against the NEW revision's text. If the exact text is gone →
// orphan. If it now appears twice → ambiguous.
```

### Cross-Fragment Highlight Slicing (D5-16)

```typescript
// Source: codebase — src/pagination/types.ts PageFragmentSchema +
// src/pagination/fragmentRenderer.tsx resolveBlockSlice +
// src/pagination/anchor.ts pageStartGlobalOffset.
//
// In paginated mode, a highlight at article-global [hlStart, hlEnd) may
// intersect multiple page fragments if its block is split. The renderer
// intersects the highlight range with each fragment's visible range.

function highlightIntersectsFragment(
  highlight: { start: number; end: number },  // article-global grapheme range
  fragment: PageFragment,
  article: CanonicalArticle,
): { visibleStart: number; visibleEnd: number } | null {
  const fragGlobalStart = pageStartGlobalOffset(article, fragment);
  // For each block in the fragment, compute its article-global range and
  // check intersection with the highlight range.
  for (const entry of fragment.blocks) {
    const blockGlobalStart = fragGlobalStart + /* per-entry offset math */;
    const entryStart = blockGlobalStart + entry.startGrapheme;
    const entryEnd = blockGlobalStart + entry.endGrapheme;
    const intersectStart = Math.max(highlight.start, entryStart);
    const intersectEnd = Math.min(highlight.end, entryEnd);
    if (intersectStart < intersectEnd) {
      return {
        visibleStart: intersectStart - entryStart, // intra-entry offset for <mark>
        visibleEnd: intersectEnd - entryStart,
      };
    }
  }
  return null; // highlight does not intersect this fragment
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Page-number/DOM-Range annotation anchors | W3C Web Annotation `TextPositionSelector` + `TextQuoteSelector` over normalized text | W3C Recommendation (2017); adopted by hypothes.is, Readwise | Anchors survive repagination, mode switch, and content revisions. This is now the industry standard for durable web annotations. [CITED: w3.org/TR/annotation-model] |
| Custom modal/focus-trap libraries for popovers | Browser Popover API (`popover` attribute) | Baseline 2024 (all major engines) | Top-layer rendering without a library. `popover="manual"` gives no-light-dismiss positioned editing. [VERIFIED: 05-UI-SPEC.md] |
| `dom-anchor-text-quote` / hypothes.is client library | Project-owned selectors over a normalized-text substrate | Phase 1 decision (STACK.md) | The project owns its anchor contract. A library can be added later for re-anchoring internals, but the normalized-text + offset model is foundational and must not depend on a library. [CITED: STACK.md "Alternatives Considered"] |

**Deprecated/outdated:**
- Persisting DOM `Range` / XPath / page-number / pixel anchors: explicitly FORBIDDEN by STACK.md. [CITED: STACK.md "What NOT to Use"]
- `dom-anchor-text-quote` as the primary anchor: deferred by STACK.md until the internal contract is proven (it now is — Phase 1 shipped it).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Dexie compound index `[articleId+revision]` supports cross-revision lookup via `between([id, 0], [id, MAX_SAFE_INTEGER])` without a version bump. | Persistence Schema | If Dexie does not support this range query form efficiently, a `version(3)` adding a plain `articleId` index is needed (LOW risk — standard Dexie migration). |
| A2 | The hypothes.is re-anchoring algorithm uses exact-first + prefix/suffix disambiguation (informed the D5-02 contract). | resolveQuoteSelector | If the hypothes.is approach differs significantly, it does not affect correctness — the D5-02 CONTRACT is locked regardless of the reference algorithm. |
| A3 | The Popover API (`popover="manual"`) is Baseline in all target engines (current Chromium/Firefox/WebKit). | Pattern 5 | If any target engine lacks it, fall back to a `position: fixed` element with manual focus management (like the toolbar). LOW risk — the 05-UI-SPEC.md already vetted this. |
| A4 | `visibility: hidden` on `.article-body-measurement` does NOT prevent text selection in all engines (hence `user-select: none` is needed). | Pitfall 3 | If it does prevent selection, `user-select: none` is a harmless belt-and-suspenders. No downside. |
| A5 | Dexie's `db.transaction("rw", storeA, storeB, fn)` atomically deletes from both stores (cascade-delete). | Pattern 3 / Pitfall 10 | If transactions are not atomic, a two-phase delete with retry is needed. LOW risk — Dexie transactions are well-documented as atomic. |

**If this table is empty:** N/A — 5 assumptions documented above, all LOW risk.

## Open Questions

1. **Eager vs. lazy resolution timing**
   - What we know: D5-01 says highlights are re-resolved on open. The resolution is a pure function over `normalizeText(article)` — fast for the same-revision common case (exact substring match).
   - What's unclear: For an article with many highlights (50+), should ALL be batch-resolved eagerly on open, or lazily on render/navigate? Eager adds a one-time cost on open; lazy adds per-highlight cost on first render.
   - Recommendation: **Eager batch-resolve on open.** The same-revision path is O(n × substring-search) where n = highlight count. For MVP counts (single reader, curated corpus), this is sub-millisecond. The cross-revision path is rarer (articles don't change revisions often). Lazy resolution complicates the rendering path (each block render would need to check/resolve). The planner's call per the discretion area.

2. **ID generation strategy for HighlightRecord.id and NoteRecord.id**
   - What we know: The primary keys are strings (`"id"` in the Dexie declaration). They need to be unique, stable, and generated client-side.
   - What's unclear: UUID v4, `crypto.randomUUID()`, nanoid, or a timestamp+random scheme?
   - Recommendation: **`crypto.randomUUID()`** — Baseline in all target engines (secure context), no dependency, 128-bit UUID. The planner confirms.

3. **Prefix/suffix-only fallback confidence state (D5-02 discretion)**
   - What we know: When zero exact matches exist, D5-02 falls back to prefix+suffix-only window match. If exactly one candidate matches, the contract says "confident (low-certainty)."
   - What's unclear: Should "low-certainty" be a distinct 4th render state (a lighter marker), or just a confident match that renders normally?
   - Recommendation: **Render as a normal highlight** (not a distinct state). The reader doesn't need to know the confidence was low — the passage was found uniquely, which is good enough. The ambiguous/orphan states are the only ones that need distinct rendering. The researcher validates this against the corpus under simulated edits.

4. **Drawer entry count / virtualization**
   - What we know: The drawer lists all highlights in reading order. ACPT-04 (formal performance budgets) is Phase 6.
   - What's unclear: At what highlight count does the drawer need virtualization?
   - Recommendation: **No virtualization for MVP.** A single reader on a curated corpus is unlikely to exceed ~100 highlights per article. The drawer is a simple `<ol>`. If performance becomes an issue, virtualization is a Phase 6 concern. Not an MVP gate.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 22 LTS | Vite 8 dev server + build | ✓ (STACK.md requires 20.19+ or 22.12+) | — | — |
| Browser Popover API | Note popover (`popover="manual"`) | ✓ (Baseline in target engines) | — | `position: fixed` element with manual focus management |
| Browser Selection/Range API | Selection capture | ✓ (all engines) | — | — |
| `Intl.Segmenter` | Grapheme-offset conversion | ✓ (all target engines) | — | — |
| IndexedDB (via Dexie) | Highlight/note persistence | ✓ (all target engines) | Dexie 4.4.4 | In-memory fallback (reading continues without persistence) |
| `crypto.randomUUID()` | Highlight/Note ID generation | ✓ (secure context — localhost + HTTPS) | — | Timestamp + random fallback |
| Playwright (chromium/firefox/webkit) | Cross-browser annotation validation | ✓ (installed, Phase 1-4 tests green) | 1.61.1 | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none — all dependencies are available.

## Validation Architecture

> Nyquist validation is ENABLED (`workflow.nyquist_validation: true` in config.json). This section drives Dimension 8 of plan verification.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (unit/component, jsdom) + Playwright Test 1.61.1 (e2e, chromium/firefox/webkit) |
| Config file | `vitest.config.ts` (unit/component); `playwright.config.ts` (e2e — inferred from existing tests) |
| Quick run command | `npm run test:unit -- --run` |
| Full suite command | `npm run test` (unit + e2e × 3 engines) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ANNO-01 | Select text → create highlight (both modes) | e2e | `npx playwright test tests/e2e/annotations/capture-highlight` | ❌ Wave 0 |
| ANNO-01 | Single-block rule (multi-block rejected) | e2e | `npx playwright test tests/e2e/annotations/capture-rejects-multi-block` | ❌ Wave 0 |
| ANNO-01 | Overlap rejection (D5-13) | e2e | `npx playwright test tests/e2e/annotations/capture-rejects-overlap` | ❌ Wave 0 |
| ANNO-01 | H/N keyboard shortcuts | e2e | `npx playwright test tests/e2e/annotations/keyboard-shortcuts` | ❌ Wave 0 |
| ANNO-01 | Eligible block set (paragraph, heading, caption, code, footnote) | e2e | `npx playwright test tests/e2e/annotations/eligible-blocks` | ❌ Wave 0 |
| ANNO-02 | Attach note to highlight | e2e | `npx playwright test tests/e2e/annotations/note-create-edit` | ❌ Wave 0 |
| ANNO-03 | View highlights in drawer | e2e | `npx playwright test tests/e2e/annotations/drawer-view` | ❌ Wave 0 |
| ANNO-03 | Edit note (debounced save) | e2e | `npx playwright test tests/e2e/annotations/note-edit` | ❌ Wave 0 |
| ANNO-03 | Delete highlight (two-step confirm) | e2e | `npx playwright test tests/e2e/annotations/delete-confirm` | ❌ Wave 0 |
| ANNO-04 | Navigate-back from drawer (paginated) | e2e | `npx playwright test tests/e2e/annotations/navigate-back-paginated` | ❌ Wave 0 |
| ANNO-04 | Navigate-back from drawer (scrolling) | e2e | `npx playwright test tests/e2e/annotations/navigate-back-scrolling` | ❌ Wave 0 |
| ANNO-05 | Highlight survives repagination (font/viewport change) | e2e | `npx playwright test tests/e2e/annotations/survive-repagination` | ❌ Wave 0 |
| ANNO-05 | Highlight survives mode switch | e2e | `npx playwright test tests/e2e/annotations/survive-mode-switch` | ❌ Wave 0 |
| ANNO-05 | Highlight survives article reopen | e2e | `npx playwright test tests/e2e/annotations/survive-reopen` | ❌ Wave 0 |
| ANNO-05 | Selector round-trip fidelity (offset → selector → offset) | unit | `npx vitest run tests/unit/annotations/selector-roundtrip.test.ts` | ❌ Wave 0 |
| ANNO-05 | Cross-fragment highlight renders on both pages (D5-16) | e2e | `npx playwright test tests/e2e/annotations/cross-fragment-render` | ❌ Wave 0 |
| ANNO-06 | Anchors are grapheme offsets (never DOM/page/pixel) | unit | `npx vitest run tests/unit/annotations/highlight-schema.test.ts` | ❌ Wave 0 |
| ANNO-07 | Ambiguous state surfaces explicitly | unit | `npx vitest run tests/unit/annotations/resolve-quote-ambiguous.test.ts` | ❌ Wave 0 |
| ANNO-07 | Orphan state surfaces explicitly | unit | `npx vitest run tests/unit/annotations/resolve-quote-orphan.test.ts` | ❌ Wave 0 |
| ANNO-07 | Ambiguous/orphan drawer entry + non-navigating | e2e | `npx playwright test tests/e2e/annotations/ambiguous-orphan-surface` | ❌ Wave 0 |
| STATE-03 | Highlights persist across sessions (reload) | e2e | `npx playwright test tests/e2e/annotations/persist-reload` | ❌ Wave 0 |
| STATE-04 | Zod validation on read (corrupt record rejected) | unit | `npx vitest run tests/unit/annotations/highlight-schema.test.ts` | ❌ Wave 0 |
| Cross-cutting | Forced-colors: 3 inline states distinguishable by shape | e2e | `npx playwright test tests/e2e/annotations/forced-colors-shapes` | ❌ Wave 0 |
| Cross-cutting | Selection capture offset mapping (whitespace collapse) | unit | `npx vitest run tests/unit/annotations/capture-offset-mapping.test.ts` | ❌ Wave 0 |
| Cross-cutting | Cross-browser selection parity (chromium/firefox/webkit) | e2e | `npx playwright test tests/e2e/annotations/cross-browser-selection` | ❌ Wave 0 |
| Cross-cutting | Storage failure during highlight save (STATE-05) | unit | `npx vitest run tests/unit/annotations/highlights-store-error.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm run test:unit -- --run` (unit + component, jsdom — fast feedback on selector/resolution/persistence logic)
- **Per wave merge:** `npm run test:e2e -- --grep annotations` (annotation e2e across 3 engines)
- **Phase gate:** Full `npm run test` suite green (753+ existing tests + all new annotation tests) across chromium/firefox/webkit before `/gsd-verify-work`. Mirrors the Phase 4 Plan 04-11 precedent (full suite, honest pass/fail counts, no subset/grep/engine-skip).

### Wave 0 Gaps

- [ ] `tests/unit/annotations/resolve-quote-selector.test.ts` — covers ANNO-07 (resolveQuoteSelector tri-state: confident/ambiguous/orphan across simulated content edits)
- [ ] `tests/unit/annotations/capture-offset-mapping.test.ts` — covers ANNO-01 (DOM Range → grapheme offset mapping with whitespace-collapse correction)
- [ ] `tests/unit/annotations/selector-roundtrip.test.ts` — covers ANNO-05 (offset → deriveQuoteSelector → resolveQuoteSelector → offset === original, same revision)
- [ ] `tests/unit/annotations/highlight-schema.test.ts` — covers ANNO-06/STATE-04 (HighlightRecordSchema/NoteRecordSchema validation; corrupt record rejection)
- [ ] `tests/unit/annotations/highlights-store-error.test.ts` — covers STATE-05 (classifyStorageError routing for highlight load/save/delete)
- [ ] `tests/unit/annotations/overlap.test.ts` — covers D5-13 (disjoint-range check rejects overlapping selections)
- [ ] `tests/e2e/annotations/*.spec.ts` — covers ANNO-01 through ANNO-07 + STATE-03 across the 6-fixture corpus × theme × mode matrix × 3 engines
- [ ] No new framework install needed — Vitest + Playwright are configured and green.

*(The existing test infrastructure — vitest.config.ts, tests/setup.ts polyfills, Playwright config, 6-fixture corpus, fixtures-matrix.ts — covers all phase requirements. Only new test files are needed.)*

### Validation Matrix (what MUST be measured)

| Validation Dimension | What to Prove | Test Surface |
|---------------------|---------------|--------------|
| **Selector round-trip fidelity** | `offset → deriveQuoteSelector → resolveQuoteSelector → offset` equals original (same revision) | Unit (jsdom-safe — pure function) |
| **Re-anchoring robustness** | After simulated content edits (passage changed/duplicated), resolveQuoteSelector returns correct ambiguous/orphan states | Unit (pure function over synthetic edited articles) |
| **Persistence migration safety** | HighlightRecord/NoteRecord Zod schemas reject corrupt/invalid records; Dexie transactions cascade-delete atomically | Unit (mock Dexie or fake-indexeddb) |
| **Cross-browser selection parity** | A highlight created in Chromium re-anchors identically in Firefox/WebKit (whitespace serialization independence) | Playwright × 3 engines |
| **Highlight survival across repagination** | Highlight stays anchored after font-size change, viewport resize, mode switch, and article reopen | Playwright (real layout) × 6 fixtures × theme × mode |
| **Cross-fragment rendering (D5-16)** | A split-block highlight renders on BOTH page fragments; no silent gap at page turn | Playwright (real pagination) |
| **Forced-colors shape distinction** | Normal / note-bearing / ambiguous-orphan highlights are distinguishable by SHAPE (fill / dotted underline / dashed outline), not color alone | Playwright (emulated forced-colors) |
| **Keyboard accessibility** | H/N shortcuts, Tab to `<mark>`, popover Tab cycle, drawer focus-trap, Esc dismiss, delete confirm non-destructive default | Playwright + axe-core |

## Security Domain

> `security_enforcement: true` + `security_asvs_level: 1` in config.json. ASVS Level 1 applies.

### Project Constraints (from AGENTS.md)

- **STACK.md is embedded in AGENTS.md** — all stack directives are binding: Selection/Range APIs capture immediately into durable selectors; W3C-inspired selectors over normalized text; persisting DOM Range/XPath/page-number/pixel anchors is FORBIDDEN; Zod-at-boundary validation; no Redux/Zustand; no Tailwind/component suites; Playwright for layout truth (not DOM emulators). [VERIFIED: AGENTS.md]
- **GSD Workflow Enforcement** — use GSD commands for work entry; no direct edits outside GSD workflow. [VERIFIED: AGENTS.md]
- **No new packages without legitimacy gate** — Phase 5 adds zero new packages, so the gate is N/A. [VERIFIED: this research]

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No authentication in this prototype (local-only, no accounts). |
| V3 Session Management | no | No sessions (local-only). |
| V4 Access Control | no | No access control (single-user local data). |
| V5 Input Validation | **yes** | Zod schemas (`HighlightRecordSchema`, `NoteRecordSchema`) validate every record at the read boundary. Note text is `z.string()` — no HTML parsing, no URL fields. `react/no-danger` ESLint rule forbids `dangerouslySetInnerHTML`. React escapes text children by default. [VERIFIED: schema.ts discipline + ESLint config] |
| V6 Cryptography | no | No crypto operations (IDs use `crypto.randomUUID()` — standard platform UUID, not a crypto operation on reader data). |
| V7 Error Handling | **yes** | `classifyStorageError` routes all Dexie failures to STATE-05 recovery surfaces (StorageBanner/WipeConfirm). Persistence seams never throw to the reader. [VERIFIED: errors.ts + locationStore.ts pattern] |
| V8 Data Protection | **yes (light)** | All data is local (IndexedDB). No data leaves the browser. No sync, no cloud, no telemetry. [VERIFIED: PROJECT.md "Out of Scope: Accounts, cloud sync, and collaboration"] |
| V13 API & Web Service | no | No API (client-only SPA). |

### Known Threat Patterns for the Annotation Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via note text | Tampering / Elevation | React text-child rendering (escapes by default); `react/no-danger` ESLint rule; `z.string()` validation (no HTML). No `dangerouslySetInnerHTML` anywhere. [VERIFIED: BlockRenderer.tsx L9-17 Pitfall 6 defense] |
| Stored XSS via highlight excerpt in aria-label | Tampering | Highlight excerpts derive from `ArticleSchema`-validated article text (already sanitized at fixture load). They are rendered as React attribute children (React escapes attribute values). No injection surface. [VERIFIED: schema.ts ArticleSchema] |
| DOM clobbering via highlight ID | Tampering | Highlight IDs are `crypto.randomUUID()` (UUID format) — no collision with `fn-N` footnote IDs or any DOM id. The `<mark id="hl-{id}">` uses a `hl-` prefix. [VERIFIED: schema.ts footnoteId regex + BlockRenderer.tsx id discipline] |
| Data loss on storage failure | Denial of Service | STATE-05: `classifyStorageError` routes to StorageBanner; reading continues with in-memory state; debounced save retries on next change. Dual-event flush (visibilitychange + pagehide) minimizes loss. [VERIFIED: SettingsContext.tsx flush pattern] |
| Accidental data deletion | Repudiation / DoS | Two-step confirm (D5-12, mirrors WipeConfirm); non-destructive default focus (`[data-initial-focus]` on Keep). An accidental Enter never deletes. [VERIFIED: WipeConfirm.tsx pattern] |
| Silent anchor re-attachment (wrong passage) | Tampering / Information | ANNO-07: `resolveQuoteSelector` returns explicit ambiguous/orphan states; renderer surfaces them distinctly. Never silent. [VERIFIED: D5-02/D5-04] |
| Cross-revision data corruption | Tampering | HighlightRecord carries `revision` at creation time + `articleId`; D5-01 re-resolves against current revision. A mismatched-revision highlight is re-anchored or flagged, never silently applied to wrong content. [VERIFIED: D5-01] |

## Sources

### Primary (HIGH confidence — codebase)

- `src/content/normalizeText.ts` — THE anchor substrate. `TextPositionSelector` (L117), `TextQuoteSelector` (L123), `deriveQuoteSelector` (L133, contextRadius=32), stubbed `resolveQuoteSelector` (L149-152). Read in full.
- `src/persistence/db.ts` — Reserved Dexie stores. `highlights: "id, [articleId+revision]"` (L59), `notes: "id, highlightId"` (L61). v1 byte-unchanged, v2 re-declares only 3 stores. Read in full.
- `src/content/schema.ts` — Block union, ArticleSchema, ReaderSettingsSchema, LocationRecordSchema. Zod-at-boundary discipline. Read in full.
- `src/content/render/BlockRenderer.tsx` — BlockView exhaustive switch + ArticleBody (`data-block-index` on each top-level block). Read in full.
- `src/content/render/InlineRenderer.tsx` — InlineList/Inline (link/code/strong/em mark wrapping). Read in full.
- `src/pagination/anchor.ts` — `pageStartGlobalOffset`, `fragmentContainingOffset`, `blockGraphemeLength`. Read in full.
- `src/pagination/types.ts` — `PageFragmentSchema` (intra-block grapheme ranges), `FragmentationResultSchema`. Read in full.
- `src/pagination/fragmentRenderer.tsx` — `PageFragmentView`, `resolveBlockSlice`, `sliceParagraph`. Read in full.
- `src/pagination/splitBlock.ts` — `splitParagraphRuns` (marks preserved across splits), `splittingBlockText`, `classifyBlock`. Read in full.
- `src/routes/ArticleView.tsx` — Mode-aware branch, hidden `.article-body-measurement`, M shortcut, `queryBlocks` via `[data-block-index]`, `isFormField` import. Read in full.
- `src/reader/PaginatedSurface.tsx` — Pages/currentPageIdx state, `commitTurn` imperative handle, `PageFragmentView` mounted one at a time. Read in full.
- `src/persistence/locationStore.ts` — Persistence seam pattern (Zod safeParse on read, discriminated LoadResult, classifyStorageError). Read in full.
- `src/persistence/settingsStore.ts` — Sibling persistence seam. Read in full.
- `src/settings/SettingsContext.tsx` — Debounced save + dual-event flush pattern (D2-03). Read in full.
- `src/reader/WipeConfirm.tsx` — Confirm-the-destructive-action pattern (Pitfall 8, `[data-initial-focus]`). Read in full.
- `src/reader/restoreLocation.ts` — `normalizeElText`, `findScrollTarget`, `computeTopVisibleOffset` (offset → DOM block mapping — the reverse of capture). Read in full.
- `src/reader/Header.tsx` — Slim header + `.header-controls` group. Read in full.
- `src/app.css` — `:root` tokens, theme overrides, global gates. Read `:root` + theme blocks.
- `tests/unit/selectors.test.ts` — Phase 1 selector test patterns. Read in full.
- `tests/setup.ts` — jsdom polyfills (IntersectionObserver, ResizeObserver, rAF). Read in full.
- `.planning/phases/05-durable-highlights-and-notes/05-CONTEXT.md` — D5-01 through D5-16 locked decisions. Read in full.
- `.planning/phases/05-durable-highlights-and-notes/05-UI-SPEC.md` — UI/interaction contract for all annotation surfaces. Read in full.
- `.planning/REQUIREMENTS.md` — ANNO-01 through ANNO-07, STATE-03. Read in full.
- `.planning/STATE.md` — Phase 1-4 decisions (D-04/D-05/D-06, Pitfall 9, D2-01/D2-03/D2-09/D2-13, D4-01 through D4-11). Read in full.
- `AGENTS.md` — STACK.md embedded, conventions, GSD workflow enforcement. Read in full.
- `package.json` — All dependencies version-locked. Read in full.

### Secondary (MEDIUM confidence — official documentation)

- W3C Web Annotation Data Model — `TextPositionSelector` + `TextQuoteSelector` selector concepts. [CITED: w3.org/TR/annotation-model/#selectors — referenced from STACK.md]
- Dexie documentation — transaction API, compound index queries, store versioning. [CITED: dexie.org/docs]
- MDN — Selection API, Range API, Popover API, `Intl.Segmenter`. [CITED: developer.mozilla.org]

### Tertiary (LOW confidence — training knowledge)

- hypothes.is client re-anchoring algorithm — exact-first + prefix/suffix disambiguation pattern. [ASSUMED — training knowledge; the D5-02 contract is locked regardless]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new packages; all substrate read in source this session.
- Architecture (selector model + persistence + rendering): HIGH — every pattern grounded in existing codebase code; D5-01 through D5-16 locked by CONTEXT.md; UI-SPEC resolves all discretion areas.
- Capture offset mapping (the one novel challenge): HIGH approach confidence, MEDIUM implementation-detail confidence — the whitespace-collapse mapping is well-understood (mirrors `restoreLocation.ts` reverse direction) but fiddly; Playwright validates correctness across engines.
- Pitfalls: HIGH — all grounded in codebase precedent (Pitfall 9 Dexie versioning, Pitfall 4 mark preservation, Pitfall 8 confirm-destructive) or well-known browser behavior (selection.toString() whitespace variance).
- Dexie version decision: HIGH — v1 declarations read and confirmed sufficient; compound index query approach documented.

**Research date:** 2026-08-07
**Valid until:** 2026-09-07 (30 days — stable stack, no external dependencies; the only fast-moving variable is Popover API engine support, which is already Baseline)

## RESEARCH COMPLETE

**Phase:** 5 - durable-highlights-and-notes
**Confidence:** HIGH

### Key Findings

- **The entire substrate already ships.** Phases 1–4 delivered the D-05 grapheme-offset coordinate, `TextPositionSelector`/`TextQuoteSelector` types + `deriveQuoteSelector()`, the reserved Dexie `highlights`/`notes` stores, the source-offset `PageFragment` model, `data-block-index` 1:1 mapping, and the D4-10/D4-11 anchor machinery. Phase 5 builds the annotation domain layer on top — zero new packages, zero new infrastructure categories.
- **NO Dexie version bump needed.** The v1 store declarations (`highlights: "id, [articleId+revision]"`, `notes: "id, highlightId"`) are sufficient. The only `db.ts` change is fixing the placeholder `Table<>` type annotations (LOW risk, runtime-unaffected, mirrors the Phase 02-02 precedent).
- **Three novel implementation challenges, all well-bounded:** (1) selection capture — DOM Range → grapheme offset mapping with whitespace-collapse correction (mirrors `restoreLocation.ts` in reverse); (2) `resolveQuoteSelector` — the D5-02 exact-first/disambiguate/orphan algorithm (implements the already-shipped tri-state contract stub); (3) `<mark>` overlay INTO the existing renderer — reuses `splitParagraphRuns` to slice runs at highlight boundaries.
- **The `<mark>` overlay MUST render during the React commit** (not as post-render DOM manipulation), layering INTO `BlockRenderer`/`InlineRenderer` output. Forking a parallel renderer is the #1 architectural anti-pattern (DOC-02 reading-order + D-05 offset integrity depend on reusing the same semantic output).
- **Validation is Playwright-heavy** — selection capture, `<mark>` rendering, cross-fragment slicing, and forced-colors shape distinction MUST run in real browsers (chromium/firefox/webkit) across the 6-fixture corpus × theme × mode matrix. Unit tests cover the pure logic (resolveQuoteSelector, offset mapping, schemas, persistence errors).

### File Created
`.planning/phases/05-durable-highlights-and-notes/05-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Zero new packages; all dependencies read in `package.json` this session. |
| Architecture | HIGH | Every pattern grounded in existing codebase code; D5-01–D5-16 locked; UI-SPEC resolves all discretion areas. |
| Capture offset mapping | HIGH (approach) / MEDIUM (implementation detail) | The whitespace-collapse mapping mirrors `restoreLocation.ts` reverse direction; fiddly but provably correct; Playwright validates. |
| Pitfalls | HIGH | All grounded in codebase precedent (Pitfall 4/8/9) or well-known browser behavior. |
| Dexie version decision | HIGH | v1 declarations read and confirmed sufficient. |
| Security | HIGH | No new attack surfaces; note text is React-escaped `z.string()`; existing `react/no-danger` + Zod-at-boundary discipline covers it. |

### Open Questions

1. Eager vs. lazy resolution timing (recommendation: eager batch-resolve on open).
2. ID generation strategy (recommendation: `crypto.randomUUID()`).
3. Prefix/suffix-only "low-certainty" state rendering (recommendation: render as normal, no distinct state).
4. Drawer virtualization threshold (recommendation: none for MVP).

### Ready for Planning

Research complete. The planner can now create PLAN.md files. All locked decisions (D5-01–D5-16), the UI-SPEC interaction contract, the persistence schema, the rendering approach, and the validation matrix are documented with HIGH confidence. The three novel implementation challenges have recommended approaches with codebase-grounded analogues. No blockers.
