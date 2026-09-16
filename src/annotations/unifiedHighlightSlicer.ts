// src/annotations/unifiedHighlightSlicer.ts
// THE unified highlight slicer (Spike 0007 promotion — issue #36).
//
// One recursive walk serves BOTH renderers byte-identically: the scrolling
// ArticleBody (article-global origin) and the paginated PageFragmentView
// (entry-local origin). The origin is a single root parameter — the recursion
// itself is origin-free (spike §2.1): after one root clip against
// [origin, origin + visibleLen), every node walks node-local offsets only.
//
// Spike F2 is RECONCILED, not parameterized: there is ONE child measure — the
// D-05 grapheme length of blockNormalizedText (the same coordinate highlight
// positions are stored in, and — since the same reconciliation — the same
// coordinate the pagination engine emits fragment ranges in). The spike's
// `measureChild` parameter is deliberately gone: keeping it would let the two
// renderers drift apart again. See docs/spikes/0007-unified-highlight-slicer.md
// §4 F2 + §5 Go/no-go item 1.
//
// The walk unifies only the TREE WALK. Leaf slicing reuses the production
// leaf slicers unchanged (sliceRunsForHighlights / sliceCodeForHighlights —
// spike §2.2), and first-occurrence id claiming stays RENDERER-owned (F3:
// per-mounted-page firstness is not derivable inside a single-entry slicer).
//
// `null` results mean "thread nothing" — byte-unchanged rendering for blocks
// no highlight intersects (the legacy anyChildSlices discipline).
//
// Pure domain logic — no DOM, no React, no side effects. jsdom-safe.
import type { Block } from "../content/types";
import { BLOCK_SEPARATOR, blockNormalizedText, graphemeClusters } from "../content/normalizeText";
import { sliceCodeForHighlights, sliceRunsForHighlights } from "./highlightRanges";
import { inlineStreamGraphemeLength } from "../pagination/splitBlock";
import type { CodeSegment, HighlightSlice, HighlightSliceEntry } from "./highlightRanges";
import type { ListItemSlices } from "../content/render/BlockRenderer";

/**
 * The D-05 grapheme length of a block (graphemeClusters of
 * blockNormalizedText) — the ONE child measure for the unified walk.
 * Mirrors pagination/anchor.ts blockGraphemeLength but stays local so the
 * annotations layer does not import from the pagination/reader graph.
 */
export function blockGraphemeLen(block: Block, lang: string): number {
  return graphemeClusters(blockNormalizedText(block), lang).length;
}

export type UnifiedBlockSlices =
  | { kind: "inline"; slices: HighlightSlice[] } // paragraph / heading
  | { kind: "children"; perChild: (HighlightSlice[] | undefined)[] } // blockquote
  | { kind: "items"; slices: ListItemSlices } // bulleted / numbered list
  | { kind: "caption"; slices: HighlightSlice[] } // figure caption
  | { kind: "code"; segments: CodeSegment[] }; // code-block verbatim source

export interface GraphemeRange {
  start: number;
  end: number;
}

/**
 * The one [start, end) intersection primitive — replaces the seven hand-rolled
 * clamp expressions the spike audited. Returns null when the intersection is
 * empty (end-exclusive: touching ranges do not overlap).
 */
export function clipRange(
  range: GraphemeRange,
  windowStart: number,
  windowEnd: number,
): GraphemeRange | null {
  const start = Math.max(range.start, windowStart);
  const end = Math.min(range.end, windowEnd);
  return start < end ? { start, end } : null;
}

export interface SliceBlockHighlightsInput {
  /** Whole block (scrolling) or resolved entry slice (paginated). */
  block: Block;
  /** THE explicit coordinate origin (article-global for scrolling, 0 for paginated entries). */
  origin: number;
  visibleLen: number;
  /** Highlights in the coordinate implied by origin. */
  highlights: readonly HighlightSliceEntry[];
  lang: string;
}

export function sliceBlockHighlights(input: SliceBlockHighlightsInput): UnifiedBlockSlices | null {
  const { block, origin, visibleLen, highlights, lang } = input;
  const active = highlights.filter(
    (h) => clipRange(h.position, origin, origin + visibleLen) !== null,
  );
  if (active.length === 0) return null;
  return walkNode(block, origin, active, lang);
}

function filterWindow(
  entries: readonly HighlightSliceEntry[],
  windowStart: number,
  windowLen: number,
): HighlightSliceEntry[] {
  return entries.filter(
    (e) => clipRange(e.position, windowStart, windowStart + windowLen) !== null,
  );
}

function walkNode(
  block: Block,
  origin: number,
  active: readonly HighlightSliceEntry[],
  lang: string,
): UnifiedBlockSlices | null {
  switch (block.kind) {
    case "paragraph":
    case "heading":
      return {
        kind: "inline",
        slices: sliceRunsForHighlights(block.content, origin, active, lang),
      };
    case "blockquote": {
      let childOrigin = origin;
      const perChild: (HighlightSlice[] | undefined)[] = [];
      let anySlices = false;
      for (const child of block.children) {
        const childLen = blockGraphemeLen(child, lang);
        let childSlices: HighlightSlice[] | undefined;
        if (child.kind === "paragraph" || child.kind === "heading") {
          const filtered = filterWindow(active, childOrigin, childLen);
          if (filtered.length > 0) {
            childSlices = sliceRunsForHighlights(child.content, childOrigin, filtered, lang);
            anySlices = true;
          }
        }
        perChild.push(childSlices);
        childOrigin += childLen + BLOCK_SEPARATOR.length;
      }
      return anySlices ? { kind: "children", perChild } : null;
    }
    case "bulleted-list":
    case "numbered-list": {
      const slices = walkListItems(block, origin, active, lang);
      return slices === null ? null : { kind: "items", slices };
    }
    case "figure": {
      // The caption branch keeps its OWN window (spike F4): the figure's
      // caption coordinates start after alt + BLOCK_SEPARATOR when alt is
      // non-empty (the blockText [alt, inlineText(caption)].filter(Boolean)
      // join), and the gate length is the caption's D-05 stream length —
      // the SAME accounting sliceRunsForHighlights clamps against internally
      // (inlineStreamGraphemeLength), so the window and the leaf slicer can
      // never disagree. The root prefilter is an optimization, not a
      // semantic.
      const captionRunLen = inlineStreamGraphemeLength(block.caption, lang);
      if (captionRunLen === 0) return null;
      const captionOrigin =
        block.alt.length > 0
          ? origin + graphemeClusters(block.alt, lang).length + BLOCK_SEPARATOR.length
          : origin;
      const filtered = filterWindow(active, captionOrigin, captionRunLen);
      if (filtered.length === 0) return null;
      return {
        kind: "caption",
        slices: sliceRunsForHighlights(block.caption, captionOrigin, filtered, lang),
      };
    }
    case "code-block":
      return {
        kind: "code",
        segments: sliceCodeForHighlights(block.source, origin, active, lang),
      };
    default:
      // Footnote-reference + unsupported are D19-02 non-readable kinds —
      // thread nothing.
      return null;
  }
}

function walkListItems(
  block: Extract<Block, { kind: "bulleted-list" }> | Extract<Block, { kind: "numbered-list" }>,
  origin: number,
  active: readonly HighlightSliceEntry[],
  lang: string,
): ListItemSlices | null {
  let itemOrigin = origin;
  const perItem: (HighlightSlice[] | ListItemSlices | undefined)[][] = [];
  let anySlices = false;
  for (const item of block.items) {
    let childOrigin = itemOrigin;
    const perChild: (HighlightSlice[] | ListItemSlices | undefined)[] = [];
    for (const child of item.content) {
      const childLen = blockGraphemeLen(child, lang);
      if (child.kind === "paragraph" || child.kind === "heading") {
        const filtered = filterWindow(active, childOrigin, childLen);
        if (filtered.length > 0) {
          perChild.push(sliceRunsForHighlights(child.content, childOrigin, filtered, lang));
          anySlices = true;
        } else {
          perChild.push(undefined);
        }
      } else if (child.kind === "bulleted-list" || child.kind === "numbered-list") {
        const nested = walkListItems(child, childOrigin, active, lang);
        if (nested !== null) {
          perChild.push(nested);
          anySlices = true;
        } else {
          perChild.push(undefined);
        }
      } else {
        perChild.push(undefined);
      }
      childOrigin += childLen + BLOCK_SEPARATOR.length;
    }
    perItem.push(perChild);
    // After the child loop, childOrigin sits at itemStart + Σ(childLen)
    // + n·SEPARATOR — which equals itemStart + itemLen + SEP for n > 0
    // (the trailing per-child separator coincides with the inter-item
    // separator). An EMPTY item still consumes its inter-item separator.
    itemOrigin = childOrigin + (item.content.length === 0 ? BLOCK_SEPARATOR.length : 0);
  }
  return anySlices ? { perItem } : null;
}

export interface BlockViewSliceProps {
  highlightSlices?: HighlightSlice[];
  childHighlightSlices?: (HighlightSlice[] | undefined)[];
  itemHighlightSlices?: ListItemSlices;
  captionHighlightSlices?: HighlightSlice[];
  codeSegments?: CodeSegment[];
}

/**
 * Map the unified result onto the five existing BlockView slice props 1:1,
 * so the shared BlockView/InlineList rendering path is reused untouched.
 * Replaces five independently-optional, structurally-uncoupled props threaded
 * by hand per kind (spike F5 — the "which walk forgot to thread which prop"
 * failure mode).
 */
export function blockViewSlices(result: UnifiedBlockSlices | null): BlockViewSliceProps {
  if (result === null) return {};
  switch (result.kind) {
    case "inline":
      return { highlightSlices: result.slices };
    case "children":
      return { childHighlightSlices: result.perChild };
    case "items":
      return { itemHighlightSlices: result.slices };
    case "caption":
      return { captionHighlightSlices: result.slices };
    case "code":
      return { codeSegments: result.segments };
  }
}
