import type { Block } from "../../../src/content/types";
import {
  BLOCK_SEPARATOR,
  graphemeClusters,
} from "../../../src/content/normalizeText";
import {
  sliceCodeForHighlights,
  sliceRunsForHighlights,
} from "../../../src/annotations/highlightRanges";
import type {
  CodeSegment,
  HighlightSlice,
  HighlightSliceEntry,
} from "../../../src/annotations/highlightRanges";
import type { ListItemSlices } from "../../../src/content/render/BlockRenderer";

export type MeasureChild = (block: Block, lang: string) => number;

export type UnifiedBlockSlices =
  | { kind: "inline"; slices: HighlightSlice[] }
  | { kind: "children"; perChild: (HighlightSlice[] | undefined)[] }
  | { kind: "items"; slices: ListItemSlices }
  | { kind: "caption"; slices: HighlightSlice[] }
  | { kind: "code"; segments: CodeSegment[] };

export interface GraphemeRange {
  start: number;
  end: number;
}

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
  block: Block;
  origin: number;
  visibleLen: number;
  highlights: readonly HighlightSliceEntry[];
  measureChild: MeasureChild;
  lang: string;
}

export function sliceBlockHighlights(
  input: SliceBlockHighlightsInput,
): UnifiedBlockSlices | null {
  const { block, origin, visibleLen, highlights, measureChild, lang } = input;
  const active = highlights.filter(
    (h) => clipRange(h.position, origin, origin + visibleLen) !== null,
  );
  if (active.length === 0) return null;
  return walkNode(block, origin, active, measureChild, lang);
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
  measure: MeasureChild,
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
        const childLen = measure(child, lang);
        let childSlices: HighlightSlice[] | undefined;
        if (child.kind === "paragraph" || child.kind === "heading") {
          const filtered = filterWindow(active, childOrigin, childLen);
          if (filtered.length > 0) {
            childSlices = sliceRunsForHighlights(
              child.content,
              childOrigin,
              filtered,
              lang,
            );
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
      const slices = walkListItems(block, origin, active, measure, lang);
      return slices === null ? null : { kind: "items", slices };
    }
    case "figure": {
      const captionRunLen = block.caption.reduce(
        (sum, r) => sum + graphemeClusters(r.text, lang).length,
        0,
      );
      if (captionRunLen === 0) return null;
      const captionOrigin =
        block.alt.length > 0
          ? origin +
            graphemeClusters(block.alt, lang).length +
            BLOCK_SEPARATOR.length
          : origin;
      const filtered = filterWindow(active, captionOrigin, captionRunLen);
      if (filtered.length === 0) return null;
      return {
        kind: "caption",
        slices: sliceRunsForHighlights(
          block.caption,
          captionOrigin,
          filtered,
          lang,
        ),
      };
    }
    case "code-block":
      return {
        kind: "code",
        segments: sliceCodeForHighlights(block.source, origin, active, lang),
      };
    default:
      return null;
  }
}

function walkListItems(
  block:
    | Extract<Block, { kind: "bulleted-list" }>
    | Extract<Block, { kind: "numbered-list" }>,
  origin: number,
  active: readonly HighlightSliceEntry[],
  measure: MeasureChild,
  lang: string,
): ListItemSlices | null {
  let itemOrigin = origin;
  const perItem: (HighlightSlice[] | ListItemSlices | undefined)[][] = [];
  let anySlices = false;
  for (const item of block.items) {
    let childOrigin = itemOrigin;
    const perChild: (HighlightSlice[] | ListItemSlices | undefined)[] = [];
    for (const child of item.content) {
      const childLen = measure(child, lang);
      if (child.kind === "paragraph" || child.kind === "heading") {
        const filtered = filterWindow(active, childOrigin, childLen);
        if (filtered.length > 0) {
          perChild.push(
            sliceRunsForHighlights(child.content, childOrigin, filtered, lang),
          );
          anySlices = true;
        } else {
          perChild.push(undefined);
        }
      } else if (
        child.kind === "bulleted-list" ||
        child.kind === "numbered-list"
      ) {
        const nested = walkListItems(child, childOrigin, active, measure, lang);
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
    itemOrigin =
      childOrigin + (item.content.length === 0 ? BLOCK_SEPARATOR.length : 0);
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

export function blockViewSlices(
  result: UnifiedBlockSlices | null,
): BlockViewSliceProps {
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
