// src/pagination/fragmentRenderer.tsx
// PageFragmentView renders ONE page fragment's worth of semantic blocks by
// REUSING BlockView (DOC-02 reading order, D-05 integrity, A11Y-03 single
// content tree — the same renderer the scrolling ArticleBody uses). The
// renderer never forks a parallel block-kind switch; its only job is to
// resolve the source block for each fragment entry and, when the entry
// carries a sub-block grapheme range, slice the block and feed the slice to
// BlockView.
//
// D4-01 (booklike line-boundary splitting — the load-bearing path): when a
// fragment entry carries a sub-block range (startGrapheme > 0 OR endGrapheme
// < blockLength), the renderer MUST slice the block and render only the
// intra-block slice. For paragraphs this means calling splitParagraphRuns to
// cut the InlineRun[] at the grapheme boundary; BOTH halves inherit
// boundary-run marks verbatim (Pitfall 4 — a link run split mid-text becomes
// two link runs with the same href). Rendering the whole block for a sub-
// range entry would violate PAGE-03 exactly-once (the text would appear on
// two pages) and PAGE-03 no-clipping (the whole block may not fit).
//
// Security (T-04-07 mitigation — identical to BlockRenderer.tsx L9-17): the
// fragment renderer emits ONLY React text children / JSX elements. The React
// raw-HTML injection prop is FORBIDDEN anywhere in this file; ESLint
// react/no-danger enforces statically. The renderer slices the same Block
// model the scrolling ArticleBody renders — no new injection surface.
//
// D4-02 atomic kinds (figure, heading, code-block, footnote-reference,
// unsupported) NEVER split — the engine always emits whole-block ranges for
// them. The renderer short-circuits these to a direct BlockView render.
// Splitting kinds (paragraph + blockquote + bulleted-list + numbered-list)
// carry the D4-01 slicing path; for paragraphs the slicer is splitParagraphRuns
// (the project's InlineRun primitive); for container kinds the renderer walks
// children/items recursively. The MVP engine assumes a 1:1 article.blocks ↔
// querySelectorAll mapping and currently trips a block-element-mismatch
// fallback for containers (they render extra selector matches), so the
// container slicing path is implemented but not yet exercised by the engine;
// Plan 05's corpus matrix lands container coverage and proves the recursive
// slicing path.
import type { Block, CanonicalArticle } from "../content/types";
import { BlockView } from "../content/render/BlockRenderer";
import type { ArticleBodyHighlight } from "../content/render/BlockRenderer";
import type { ListItemSlices } from "../content/render/BlockRenderer";
import { splitParagraphRuns } from "./splitBlock";
import { BLOCK_SEPARATOR, graphemeClusters } from "../content/normalizeText";
import { blockGraphemeLength } from "./anchor";
import { sliceRunsForHighlights } from "../annotations/highlightRanges";
import { sliceCodeForHighlights } from "../annotations/highlightRanges";
import type { HighlightSliceEntry } from "../annotations/highlightRanges";
import type { HighlightSlice } from "../annotations/highlightRanges";
import type { CodeSegment } from "../annotations/highlightRanges";
import type { PageFragment } from "./types";

/**
 * PageFragmentView — render one PageFragment as a semantic <section>.
 *
 * Maps each fragment.blocks entry to a BlockView via resolveBlockSlice. The
 * section carries an `aria-label={`Page ${pageIndex + 1}`}` so a screen-reader
 * user can identify the page boundary (the SectionAnnouncer live region
 * conveys structural progress; this label is a per-page anchor).
 *
 * D5-16 cross-fragment highlight slicing (Plan 05-04): the optional
 * `highlights` prop carries the article's resolved highlights (confident +
 * ambiguous/orphan). For each fragment entry the renderer computes the
 * entry's article-global visible range, intersects each highlight's range
 * with it, and — for any non-empty intersection — passes a per-entry slice
 * to BlockView/InlineList so the renderer wraps the visible slice in
 * `<mark data-highlight-id={id}>`. A single-block highlight whose block is
 * split across a page boundary therefore renders a `<mark>` slice on EACH
 * fragment containing part of its range — both fragments share the same
 * data-highlight-id (D5-16: no silent gaps at a page turn; the popover/note
 * is reachable from either page).
 *
 * Phase 19 Plan 19-04 (D5-16 extension over SPANS + the items-shape): the
 * per-entry threading now covers EVERY readable kind — list entries thread
 * per-item/per-child slices in entry-local coordinates (the paginated twin
 * of BlockRenderer's computeListItemSlices, nested-list recursion included),
 * figure entries forward caption slices (Pitfall 1 symmetric offset), and
 * code-block entries forward verbatim-source segments. Both reading modes
 * render identical span coverage.
 *
 * @param fragment   The PageFragment to render (entries are {blockIndex, startGrapheme, endGrapheme}).
 * @param pageIndex  0-based page ordinal — used for the aria-label (rendered as Page N+1).
 * @param article    The canonical article (source for resolving blockIndex → Block).
 * @param lang       BCP-47 locale — passed to splitParagraphRuns for Intl.Segmenter.
 * @param highlights Optional resolved highlights to render as cross-fragment
 *                  `<mark>` overlays. PaginatedSurface threads these from the
 *                  HighlightOverlay context; absent/empty → no marks (the
 *                  pre-Phase-5 path, byte-unchanged so existing tests regress
 *                  nothing).
 */
export function PageFragmentView({
  fragment,
  pageIndex,
  article,
  lang,
  highlights,
  style,
}: {
  fragment: PageFragment;
  pageIndex: number;
  article: CanonicalArticle;
  lang: string;
  highlights?: readonly ArticleBodyHighlight[];
  /**
   * Plan 13-04 (Option A): optional style pass-through. The surface sets
   * the page-1 fragment's flow height to calc(100% - firstPageReservedPx)
   * so the article-top metadata spot and page-1 content share .page-
   * viewport. Additive — absent for every legacy caller, which keep the
   * full .page-fragment height from app.css.
   */
  style?: React.CSSProperties;
}): React.ReactElement {
  // Plan 19-04 (Pitfall 2 / T-19-10 — per-page first-occurrence id pass):
  // ONE PageFragmentView is mounted at a time (PaginatedSurface), so a
  // per-render Set of highlight ids == per-MOUNTED-PAGE firstness. While
  // mapping entries in document order, the first slice encountered per
  // highlight id claims isFirst = true; every later slice for the same id
  // on THIS page is isFirst = false — OVERRIDING whatever the entry-local
  // slicer produced (entry-local coordinates cannot know document
  // firstness; see HighlightSlice.isFirst). This guarantees exactly one
  // id="hl-<highlightId>" per highlight per mounted page, and it precedes
  // sibling slices in document order so the D10-03 jump focus lands at the
  // page-local span start.
  const seenHighlightIds = new Set<string>();
  return (
    <section className="page-fragment" aria-label={`Page ${pageIndex + 1}`} style={style}>
      {fragment.blocks.map((entry, i) => {
        const sourceBlock = article.blocks[entry.blockIndex]!;
        const resolved = resolveBlockSlice(
          sourceBlock,
          entry.startGrapheme,
          entry.endGrapheme,
          lang,
        );
        // D5-16 cross-fragment slicing: compute this entry's article-global
        // visible range, intersect each highlight's range with it, and (for
        // any non-empty intersection) build a per-entry HighlightSliceEntry[]
        // in the SLICED block's coordinate (intra-entry offset 0 = entry
        // start). sliceRunsForHighlights then slices the resolved block's
        // runs at the intersection boundaries so InlineList wraps each
        // visible slice in <mark data-highlight-id={id}>. A split-block
        // highlight produces a slice on EACH containing fragment — both
        // fragments' <mark> elements share the same data-highlight-id.
        let highlightSlices: ReturnType<typeof sliceRunsForHighlights> | undefined;
        // Plan 05-07: per-child slices for a blockquote entry (undefined for
        // non-blockquote kinds + when no highlight intersects any child).
        let childHighlightSlices:
          | (ReturnType<typeof sliceRunsForHighlights> | undefined)[]
          | undefined;
        // Plan 19-04 (D19-13/D19-15): per-item slices for list entries
        // (undefined for non-list kinds + when no highlight intersects any
        // item child at any nesting depth).
        let itemHighlightSlices: ListItemSlices | undefined;
        // Plan 19-04 (D19-01 paginated parity): caption slices for figure
        // entries + verbatim-source segments for code-block entries.
        let captionHighlightSlices:
          | ReturnType<typeof sliceRunsForHighlights>
          | undefined;
        let codeSegments: CodeSegment[] | undefined;
        if (highlights && highlights.length > 0) {
          const entrySlices = sliceHighlightsForEntry(
            highlights,
            article,
            entry.blockIndex,
            entry.startGrapheme,
            entry.endGrapheme,
            lang,
          );
          if (entrySlices.length > 0) {
            // paragraph, heading, and blockquote (per-child) carry inline
            // mark overlays (the kinds InlineList serves directly or via a
            // child paragraph). resolveBlockSlice returns these kinds verbatim
            // for whole-block entries and as sliced blocks for sub-block
            // entries; paragraph/heading expose `.content`, blockquote exposes
            // `.children`. Lists thread per-item over the items-shape
            // (Plan 19-04 — the paginated twin of BlockRenderer's
            // computeListItemSlices); figure captions forward entry-local
            // slices into the shared BlockView figcaption InlineList and
            // code-blocks forward entry-local verbatim-source segments
            // (Plan 19-04 — D19-01 parity; the RENDER ROUTING is explicit:
            // every entry renders through the SHARED BlockView, whose
            // captionHighlightSlices/codeSegments props are CALLER-computed,
            // so this renderer forwards them itself — no silent bypass).
            // Footnote-reference/unsupported entries render no marks by
            // construction (D19-02).
            if (resolved.kind === "paragraph" || resolved.kind === "heading") {
              // The resolved block is already the intra-entry slice, so its
              // runs start at entry-relative offset 0. Pass blockGlobalStart
              // = 0 + entry-local slice positions so sliceRunsForHighlights
              // computes intra-entry intersections correctly.
              highlightSlices = sliceRunsForHighlights(
                resolved.content,
                0,
                entrySlices,
                lang,
              );
            } else if (resolved.kind === "blockquote") {
              // Per-child slice threading (Plan 05-07). Walk resolved.children
              // (already sliced by resolveBlockSlice -> sliceBlockquote ->
              // sliceChildBlocks) accumulating each child's ENTRY-LOCAL offset
              // (BLOCK_SEPARATOR between children — consistent with
              // sliceRunsForHighlights's internal raw-run-sum blockLen via
              // splittingBlockGraphemeLength). For each paragraph/heading
              // child, filter entrySlices to those whose entry-local position
              // intersects the child's entry-local range and — when non-empty —
              // call sliceRunsForHighlights(child.content, childIntraStart,
              // filtered, lang) so the slicer subtracts childIntraStart to
              // land in child-local coordinates.
              let childIntraStart = 0;
              const perChild: (
                ReturnType<typeof sliceRunsForHighlights>
                | undefined
              )[] = [];
              let anyChildSlices = false;
              for (const child of resolved.children) {
                const childLen = splittingBlockGraphemeLength(child, lang);
                let childSlices:
                  | ReturnType<typeof sliceRunsForHighlights>
                  | undefined;
                if (child.kind === "paragraph" || child.kind === "heading") {
                  const filtered = entrySlices.filter((e) => {
                    const intersectStart = Math.max(
                      e.position.start,
                      childIntraStart,
                    );
                    const intersectEnd = Math.min(
                      e.position.end,
                      childIntraStart + childLen,
                    );
                    return intersectStart < intersectEnd;
                  });
                  if (filtered.length > 0) {
                    childSlices = sliceRunsForHighlights(
                      child.content,
                      childIntraStart,
                      filtered,
                      lang,
                    );
                    anyChildSlices = true;
                  }
                }
                perChild.push(childSlices);
                childIntraStart += childLen + BLOCK_SEPARATOR.length;
              }
              if (anyChildSlices) {
                childHighlightSlices = perChild;
              }
            } else if (
              resolved.kind === "bulleted-list" ||
              resolved.kind === "numbered-list"
            ) {
              // Entry-local per-item threading (Plan 19-04 — D19-13/D19-15,
              // the paginated twin of BlockRenderer's computeListItemSlices).
              // resolved is the SLICED list (sliceList → sliceChildBlocks),
              // so resolved.items[i].content[j] is the threading substrate
              // and the accumulator walks ENTRY-LOCAL offsets with child
              // lengths from splittingBlockGraphemeLength (Pitfall 4).
              itemHighlightSlices =
                computeEntryListItemSlices(resolved, entrySlices, lang) ??
                undefined;
            } else if (resolved.kind === "figure") {
              // Caption marks (Plan 19-04 — D19-01 paginated parity). The
              // entry renders through the SHARED BlockView figure case
              // (figures are D4-02 atomic — resolved is the verbatim block),
              // and BlockView's figcaption InlineList consumes
              // captionHighlightSlices computed by the CALLER — so the
              // fragment renderer forwards entry-local slices itself (the
              // scrolling twin is ArticleBody's figure branch; there is no
              // BlockView-internal computation path to delegate to).
              // Atomic entries are whole-block by engine contract, so
              // entry-local offset 0 == figure-local 0. The caption's
              // entry-local start is the Pitfall 1 SYMMETRIC offset (alt
              // graphemes + BLOCK_SEPARATOR when alt is non-empty — the
              // blockText [alt, caption].filter(Boolean) join); the img/alt
              // surface renders no marks ever (D19-02 gap by construction).
              const captionRunLen = resolved.caption.reduce(
                (sum, r) => sum + graphemeClusters(r.text, lang).length,
                0,
              );
              if (captionRunLen > 0) {
                const captionIntraStart =
                  resolved.alt.length > 0
                    ? graphemeClusters(resolved.alt, lang).length +
                      BLOCK_SEPARATOR.length
                    : 0;
                const filtered = entrySlices.filter((e) => {
                  const intersectStart = Math.max(
                    e.position.start,
                    captionIntraStart,
                  );
                  const intersectEnd = Math.min(
                    e.position.end,
                    captionIntraStart + captionRunLen,
                  );
                  return intersectStart < intersectEnd;
                });
                if (filtered.length > 0) {
                  captionHighlightSlices = sliceRunsForHighlights(
                    resolved.caption,
                    captionIntraStart,
                    filtered,
                    lang,
                  );
                }
              }
            } else if (resolved.kind === "code-block") {
              // Code marks (Plan 19-04 — D19-01 paginated parity). Same
              // routing story as figures: the entry renders through the
              // shared BlockView code case, whose codeSegments are
              // caller-computed — the fragment renderer forwards them in
              // ENTRY-LOCAL coordinates. Atomic whole-block entry: the
              // verbatim source starts at entry-local 0 (raw == norm in
              // the D-05 substrate, so entry-local offsets address the
              // source directly — no whitespace-collapse alignment).
              codeSegments = sliceCodeForHighlights(
                resolved.source,
                0,
                entrySlices,
                lang,
              );
            }
          }
        }
        // Per-page first-occurrence pass (Plan 19-04): claim isFirst in
        // DOCUMENT order across every slice shape this entry produced —
        // blockquote children walk in render order, list items recurse
        // depth-first in render order, caption slices and code segments
        // walk their ordered arrays. Exactly one slice per highlight id
        // keeps the DOM id on this mounted page.
        if (childHighlightSlices) {
          for (const childSlices of childHighlightSlices) {
            if (childSlices) {
              claimSlicesFirstOccurrence(childSlices, seenHighlightIds);
            }
          }
        }
        if (highlightSlices) {
          claimSlicesFirstOccurrence(highlightSlices, seenHighlightIds);
        }
        if (itemHighlightSlices) {
          claimItemSlicesFirstOccurrence(itemHighlightSlices, seenHighlightIds);
        }
        if (captionHighlightSlices) {
          claimSlicesFirstOccurrence(captionHighlightSlices, seenHighlightIds);
        }
        if (codeSegments) {
          claimCodeSegmentsFirstOccurrence(codeSegments, seenHighlightIds);
        }
        return (
          <BlockView
            key={i}
            block={resolved}
            // D5-08 paginated-mode capture binding: emit data-block-index on
            // EVERY fragment entry so captureSelection's findBlockAncestor
            // resolves the visible page-fragment blocks (not just the
            // scrolling ArticleBody / hidden measurement body). For a sliced
            // entry, data-block-grapheme-start carries the slice's intra-
            // block start offset so capture can offset the intra-block range
            // (the slice's textContent is a substring of the full block;
            // without this offset the raw→norm map would misalign).
            data-block-index={entry.blockIndex}
            data-block-grapheme-start={entry.startGrapheme}
            highlightSlices={highlightSlices}
            childHighlightSlices={childHighlightSlices}
            itemHighlightSlices={itemHighlightSlices}
            captionHighlightSlices={captionHighlightSlices}
            codeSegments={codeSegments}
          />
        );
      })}
    </section>
  );
}

/**
 * Compute the per-entry HighlightSliceEntry[] for D5-16 cross-fragment slicing.
 *
 * For each confident-or-unresolved highlight, intersect its article-global
 * `[start, end)` range with the entry's article-global visible range
 * `[blockGlobalStart + startGrapheme, blockGlobalStart + endGrapheme)`. If
 * the intersection is non-empty (intersectStart < intersectEnd), translate
 * it back to ENTRY-LOCAL coordinates (subtract the entry's start offset) and
 * emit a HighlightSliceEntry whose `position` is the entry-local range.
 *
 * The translation is what makes a split-block highlight render on BOTH
 * fragments: fragment A's entry covers [blockStart, splitPoint) and fragment
 * B's entry covers [splitPoint, blockEnd); a highlight at [blockStart+10,
 * blockEnd-10) intersects BOTH entries, producing one entry-local slice on
 * each fragment — both carrying the same `id` (and therefore the same
 * data-highlight-id once InlineList wraps them in <mark>).
 *
 * End-exclusive boundary: a highlight that touches the entry boundary
 * exactly (intersectStart === intersectEnd) produces NO slice — matches the
 * `sliceRunsForHighlights` end-exclusive contract.
 */
function sliceHighlightsForEntry(
  highlights: readonly ArticleBodyHighlight[],
  article: CanonicalArticle,
  blockIndex: number,
  entryStartGrapheme: number,
  entryEndGrapheme: number,
  lang: string,
): HighlightSliceEntry[] {
  // The block's article-global start offset (mirrors
  // pageStartGlobalOffset / computeBlockGlobalStart accumulation).
  let blockGlobalStart = 0;
  for (let i = 0; i < blockIndex && i < article.blocks.length; i++) {
    blockGlobalStart +=
      blockGraphemeLength(article.blocks[i]!, lang) + BLOCK_SEPARATOR.length;
  }
  const entryStart = blockGlobalStart + entryStartGrapheme;
  const entryEnd = blockGlobalStart + entryEndGrapheme;

  const out: HighlightSliceEntry[] = [];
  for (const h of highlights) {
    const intersectStart = Math.max(h.position.start, entryStart);
    const intersectEnd = Math.min(h.position.end, entryEnd);
    if (intersectStart < intersectEnd) {
      // Translate back to entry-local coordinates: the resolved block's
      // runs start at entry-relative offset 0 (resolveBlockSlice already
      // sliced to [entryStartGrapheme, entryEndGrapheme)). The slice
      // positions are therefore relative to entryStart.
      out.push({
        id: h.id,
        position: {
          start: intersectStart - entryStart,
          end: intersectEnd - entryStart,
        },
        hasNote: h.hasNote,
        status: h.status,
      });
    }
  }
  return out;
}

// Test-only export: the D5-16 intersection math is pure (no DOM, no React),
// so Plan 05-04 ships a pure-math unit test that calls this helper with
// synthetic article + PageFragment fixtures (jsdom-safe; the full paginated
// render proof is Plan 05-05's Playwright suite). The function is otherwise
// internal to PageFragmentView's render path.
export { sliceHighlightsForEntry as _test_sliceHighlightsForEntry };

// Test-only exports (Plan 19-04): the per-page first-occurrence claim
// primitives + the entry-local items-shape threading are pure (no DOM, no
// React), so cross-fragment-slicing.test.ts proves the flag arithmetic with
// synthetic slice arrays (jsdom-safe; the real multi-page render proof is
// the cross-fragment-render.spec.ts Playwright cells).
export { claimSlicesFirstOccurrence as _test_claimSlicesFirstOccurrence };
export {
  claimItemSlicesFirstOccurrence as _test_claimItemSlicesFirstOccurrence,
};
export {
  claimCodeSegmentsFirstOccurrence as _test_claimCodeSegmentsFirstOccurrence,
};
export {
  computeEntryListItemSlices as _test_computeEntryListItemSlices,
};

/**
 * Entry-local per-item highlight-slice computation for bulleted/numbered
 * LIST entries (Plan 19-04 — D19-13/D19-15, the paginated twin of
 * BlockRenderer's scrolling computeListItemSlices).
 *
 * Mirrors the shipped blockquote entry path over the items-shape (the only
 * structural difference): a list-local accumulator walks `resolved.items`
 * (items joined by BLOCK_SEPARATOR per the splitting-coordinate join rule —
 * sliceList/splittingBlockText); within each item an item-local accumulator
 * walks `item.content` (content blocks joined by BLOCK_SEPARATOR). Child
 * lengths come from splittingBlockGraphemeLength (Pitfall 4 — the pagination
 * splitting coordinate, NEVER the D-05 run text), and each leaf
 * paragraph/heading child filters the entry's already-computed slices via
 * the same intersectStart/intersectEnd clamp the blockquote path uses before
 * calling sliceRunsForHighlights(child.content, childIntraStart, filtered,
 * lang) — ENTRY-LOCAL coordinates throughout.
 *
 * Nested bulleted/numbered children RECURSE (D19-15) with `origin` set to
 * the child's entry-local content start, producing the same nested
 * ListItemSlices shape BlockView's list cases consume (self-contained
 * recursion via props — no coordinate plumbing leaks past this helper).
 * Kinds without readable inline content (figure/code/etc. inside items)
 * produce no slices — interior gaps render unmarked by construction
 * (D19-02). List markers stay CSS chrome and never enter the coordinates
 * (D19-14 — offsets run over item CONTENT only).
 *
 * Returns null when no child at any depth produced slices (the entry then
 * threads nothing — byte-unchanged rendering, the blockquote path's
 * anyChildSlices discipline).
 */
function computeEntryListItemSlices(
  block:
    | Extract<Block, { kind: "bulleted-list" }>
    | Extract<Block, { kind: "numbered-list" }>,
  entrySlices: readonly HighlightSliceEntry[],
  lang: string,
  origin = 0,
): ListItemSlices | null {
  let itemIntraStart = origin; // list-local: items joined by BLOCK_SEPARATOR
  const perItem: (HighlightSlice[] | ListItemSlices | undefined)[][] = [];
  let anySlices = false;
  for (const item of block.items) {
    let childIntraStart = itemIntraStart; // item-local content accumulator
    const perChild: (HighlightSlice[] | ListItemSlices | undefined)[] = [];
    for (const child of item.content) {
      const childLen = splittingBlockGraphemeLength(child, lang);
      let childSlices: HighlightSlice[] | ListItemSlices | undefined;
      if (child.kind === "paragraph" || child.kind === "heading") {
        const filtered = entrySlices.filter((e) => {
          const intersectStart = Math.max(e.position.start, childIntraStart);
          const intersectEnd = Math.min(
            e.position.end,
            childIntraStart + childLen,
          );
          return intersectStart < intersectEnd;
        });
        if (filtered.length > 0) {
          childSlices = sliceRunsForHighlights(
            child.content,
            childIntraStart,
            filtered,
            lang,
          );
          anySlices = true;
        }
      } else if (
        child.kind === "bulleted-list" ||
        child.kind === "numbered-list"
      ) {
        // D19-15: recurse — sub-list items are readable children in the
        // same entry-local coordinate stream (origin = the nested list's
        // content start).
        const nested = computeEntryListItemSlices(
          child,
          entrySlices,
          lang,
          childIntraStart,
        );
        if (nested !== null) {
          childSlices = nested;
          anySlices = true;
        }
      }
      perChild.push(childSlices);
      childIntraStart += childLen + BLOCK_SEPARATOR.length;
    }
    perItem.push(perChild);
    // Empty-item separator accounting (mirrors the scrolling twin): after
    // the child loop childIntraStart sits at itemStart + itemLen + SEP for
    // non-empty items (the trailing per-child separator coincides with the
    // inter-item separator); an EMPTY item still consumes its separator.
    itemIntraStart =
      childIntraStart +
      (item.content.length === 0 ? BLOCK_SEPARATOR.length : 0);
  }
  return anySlices ? { perItem } : null;
}

// ── Per-page first-occurrence id pass (Plan 19-04 — Pitfall 2 / T-19-10) ──────

/**
 * Claim isFirst over an ordered HighlightSlice[] for ONE mounted page.
 *
 * Mutates slice.isFirst in place: the first slice carrying a given
 * highlightId (in walk order = document order) claims isFirst = true; every
 * later slice for the same id on THIS mounted page is isFirst = false. The
 * slicer-produced flags are entry-local-blind (see HighlightSlice.isFirst)
 * and are ALWAYS overridden here — the pass, not the slicer, owns the flag
 * in paginated mode. Exactly one isFirst per id per page means exactly one
 * id="hl-<id>" element per mounted document (InlineRenderer stamps the id
 * only when isFirst === true; data-highlight-id stays on EVERY slice).
 */
function claimSlicesFirstOccurrence(
  slices: readonly HighlightSlice[],
  seen: Set<string>,
): void {
  for (const slice of slices) {
    if (slice.highlightId === null) continue;
    if (seen.has(slice.highlightId)) {
      slice.isFirst = false;
    } else {
      seen.add(slice.highlightId);
      slice.isFirst = true;
    }
  }
}

/**
 * Claim isFirst over a ListItemSlices structure — depth-first in RENDER
 * order (items in order, each item's content children in order, nested
 * lists recursing between surrounding siblings), sharing ONE seen-set with
 * the rest of the mounted page.
 */
function claimItemSlicesFirstOccurrence(
  item: ListItemSlices,
  seen: Set<string>,
): void {
  for (const perChild of item.perItem) {
    for (const child of perChild) {
      if (child == null) continue;
      if (Array.isArray(child)) {
        claimSlicesFirstOccurrence(child, seen);
      } else {
        claimItemSlicesFirstOccurrence(child, seen);
      }
    }
  }
}

/**
 * Claim isFirst over sliceCodeForHighlights output — the same first-
 * occurrence rule for code segments (CodeSegment.isFirst gates the
 * id="hl-<id>" stamp in BlockView's code case exactly as HighlightSlice
 * .isFirst gates InlineRenderer's).
 */
function claimCodeSegmentsFirstOccurrence(
  segments: readonly CodeSegment[],
  seen: Set<string>,
): void {
  for (const segment of segments) {
    if (segment.entry === null) continue;
    if (seen.has(segment.entry.id)) {
      segment.isFirst = false;
    } else {
      seen.add(segment.entry.id);
      segment.isFirst = true;
    }
  }
}

/**
 * Resolve a fragment entry to the Block that should be rendered.
 *
 * Whole-block entries (startGrapheme === 0 AND endGrapheme === blockLength)
 * return the source block unchanged; intra-block entries return a sliced
 * block via the per-kind D4-01 path. Atomic kinds (D4-02) short-circuit to
 * the source block — the engine never splits them, so the renderer never
 * slices them either.
 *
 * Uses per-kind `if` branches rather than a switch so the rendering decision
 * stays owned by BlockView (no parallel switch here). The slicing decision
 * is orthogonal to rendering: this helper resolves WHAT Block to render;
 * BlockView decides HOW.
 */
function resolveBlockSlice(
  block: Block,
  startGrapheme: number,
  endGrapheme: number,
  lang: string,
): Block {
  // D4-02 atomic set — never splits. The engine always emits whole-block
  // ranges for these. Defensive: if an atomic block ever arrived with a
  // sub-range (engine bug or future schema drift), render it whole — never
  // partially. Atomic blocks have no D4-01 split semantic.
  if (
    block.kind === "figure" ||
    block.kind === "heading" ||
    block.kind === "code-block" ||
    block.kind === "footnote-reference" ||
    block.kind === "unsupported"
  ) {
    return block;
  }

  const blockLen = splittingBlockGraphemeLength(block, lang);
  const isWhole = startGrapheme === 0 && endGrapheme === blockLen;
  if (isWhole) return block;

  // INTRA-BLOCK sub-range — D4-01 booklike splitting.
  if (block.kind === "paragraph") {
    return sliceParagraph(block, startGrapheme, endGrapheme, lang);
  }
  if (block.kind === "blockquote") {
    return sliceBlockquote(block, startGrapheme, endGrapheme, lang);
  }
  // bulleted-list + numbered-list share an items[] shape.
  return sliceList(block, startGrapheme, endGrapheme, lang);
}

/**
 * Slice a paragraph's InlineRun[] at the intra-block [start, end) range.
 *
 * Two-pass: first cut off the leading portion (when start > 0) by calling
 * splitParagraphRuns and taking the `after` slice; then cut off the trailing
 * portion (when end < blockLen) by calling splitParagraphRuns on the
 * remaining runs with the span (end - start) and taking the `before` slice.
 * The result is the intra-block run slice for this fragment.
 *
 * BOTH boundary-run marks survive verbatim per Pitfall 4 — splitParagraphRuns
 * clones the boundary run and copies its marks array onto each half, so a
 * link run split mid-text becomes two link runs with the same href.
 */
function sliceParagraph(
  block: Block,
  startGrapheme: number,
  endGrapheme: number,
  lang: string,
): Block {
  // Caller verified block.kind === "paragraph" via resolveBlockSlice.
  const paragraphBlock = block as Extract<Block, { kind: "paragraph" }>;
  const originalLen = paragraphBlock.content.reduce(
    (sum, r) => sum + graphemeClusters(r.text, lang).length,
    0,
  );

  // First pass: cut off the leading portion (graphemes [0, startGrapheme))
  // by taking the `after` slice.
  let runs = paragraphBlock.content;
  if (startGrapheme > 0) {
    const lead = splitParagraphRuns(paragraphBlock.content, startGrapheme, lang);
    runs = lead.after;
  }

  // Second pass: cut off the trailing portion (graphemes [endGrapheme,
  // originalLen)) by slicing the post-lead runs at the span (endGrapheme -
  // startGrapheme) and taking the `before` slice.
  if (endGrapheme < originalLen) {
    const span = endGrapheme - startGrapheme;
    const trail = splitParagraphRuns(runs, span, lang);
    runs = trail.before;
  }

  return { kind: "paragraph", content: runs };
}

/**
 * Slice a blockquote's children at the intra-block range. Children
 * contribute their splittingBlockGraphemeLength plus a BLOCK_SEPARATOR
 * between adjacent children. Whole children inside the range pass through
 * unchanged; the boundary child (if any) recurses via resolveBlockSlice.
 */
function sliceBlockquote(
  block: Block,
  startGrapheme: number,
  endGrapheme: number,
  lang: string,
): Block {
  const blockquoteBlock = block as Extract<Block, { kind: "blockquote" }>;
  const slicedChildren = sliceChildBlocks(
    blockquoteBlock.children,
    startGrapheme,
    endGrapheme,
    lang,
  );
  return { kind: "blockquote", children: slicedChildren };
}

/**
 * Slice a list's items at the intra-block range. Each item contributes its
 * content blocks plus BLOCK_SEPARATOR between items (and between content
 * blocks inside an item). The list kind + start (for numbered-list) are
 * preserved on the constructed slice.
 */
function sliceList(
  block: Block,
  startGrapheme: number,
  endGrapheme: number,
  lang: string,
): Block {
  const listBlock = block as
    | Extract<Block, { kind: "bulleted-list" }>
    | Extract<Block, { kind: "numbered-list" }>;
  const slicedItems: { content: Block[] }[] = [];
  let consumed = 0;
  for (const item of listBlock.items) {
    const itemContentLen = item.content.reduce(
      (sum, c, j) =>
        sum +
        splittingBlockGraphemeLength(c, lang) +
        (j > 0 ? BLOCK_SEPARATOR.length : 0),
      0,
    );
    const itemEndWithSep = consumed + itemContentLen;
    if (itemEndWithSep <= startGrapheme) {
      // Entirely before the range — skip.
      consumed = itemEndWithSep + BLOCK_SEPARATOR.length;
      continue;
    }
    if (consumed >= endGrapheme) {
      // Entirely after the range — done.
      break;
    }
    // Item overlaps the range — slice its content blocks.
    const relStart = Math.max(0, startGrapheme - consumed);
    const relEnd = Math.min(itemContentLen, endGrapheme - consumed);
    const slicedContent = sliceChildBlocks(item.content, relStart, relEnd, lang);
    slicedItems.push({ content: slicedContent });
    consumed = itemEndWithSep + BLOCK_SEPARATOR.length;
  }
  if (listBlock.kind === "bulleted-list") {
    return { kind: "bulleted-list", items: slicedItems };
  }
  return { kind: "numbered-list", items: slicedItems, start: listBlock.start };
}

/**
 * Recursive walker: slice a list of child blocks at the intra-parent range.
 * Children contribute their splittingBlockGraphemeLength plus BLOCK_SEPARATOR
 * between adjacent children. Whole children inside the range pass through
 * unchanged; the boundary child (if any) recurses via resolveBlockSlice so
 * the D4-01 paragraph slicer applies to nested paragraphs.
 */
function sliceChildBlocks(
  children: Block[],
  startGrapheme: number,
  endGrapheme: number,
  lang: string,
): Block[] {
  const out: Block[] = [];
  let consumed = 0;
  for (const child of children) {
    const childLen = splittingBlockGraphemeLength(child, lang);
    const childEndWithSep = consumed + childLen;
    if (childEndWithSep <= startGrapheme) {
      consumed = childEndWithSep + BLOCK_SEPARATOR.length;
      continue;
    }
    if (consumed >= endGrapheme) {
      break;
    }
    const relStart = Math.max(0, startGrapheme - consumed);
    const relEnd = Math.min(childLen, endGrapheme - consumed);
    out.push(resolveBlockSlice(child, relStart, relEnd, lang));
    consumed = childEndWithSep + BLOCK_SEPARATOR.length;
  }
  return out;
}

/**
 * Compute a splitting-kind block's intra-block grapheme length.
 *
 * For paragraphs the length is the sum of `graphemeClusters(run.text, lang)
 * .length` across content runs. This matches splitParagraphRuns' internal
 * accounting so the whole-vs-subrange check agrees with the slicer (the
 * engine's per-block grapheme length derives from DOM textContent, which
 * for clean ASCII paragraphs is the same as the per-run sum).
 *
 * For container kinds (blockquote + bulleted-list + numbered-list) the
 * length is the recursive sum of child/content lengths joined by
 * BLOCK_SEPARATOR — mirroring normalizeText.ts blockText's join rule.
 *
 * Atomic kinds are handled by the resolveBlockSlice short-circuit and
 * never reach this helper.
 */
function splittingBlockGraphemeLength(block: Block, lang: string): number {
  if (block.kind === "paragraph" || block.kind === "heading") {
    return block.content.reduce(
      (sum, r) => sum + graphemeClusters(r.text, lang).length,
      0,
    );
  }
  if (block.kind === "blockquote") {
    return block.children.reduce(
      (sum, c, i) =>
        sum +
        splittingBlockGraphemeLength(c, lang) +
        (i > 0 ? BLOCK_SEPARATOR.length : 0),
      0,
    );
  }
  if (block.kind === "bulleted-list" || block.kind === "numbered-list") {
    return block.items.reduce((sum, item, i) => {
      const contentLen = item.content.reduce(
        (s, c, j) =>
          s +
          splittingBlockGraphemeLength(c, lang) +
          (j > 0 ? BLOCK_SEPARATOR.length : 0),
        0,
      );
      return sum + contentLen + (i > 0 ? BLOCK_SEPARATOR.length : 0);
    }, 0);
  }
  // Unreachable for splitting kinds (resolveBlockSlice short-circuits atomic
  // kinds before calling this helper). Defensive: return 0 so the whole-vs-
  // subrange check fails open (renders whole) for any future kind not yet
  // wired into the splitting set.
  return 0;
}
