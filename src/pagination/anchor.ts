// src/pagination/anchor.ts
// Pure passage-anchor helpers for Phase 4 Plan 04-04 dual-mode navigation.
//
// These helpers bridge the page-fragment world (PageFragment[], where each
// entry is an INTRA-block [startGrapheme, endGrapheme) slice over a single
// block) and the article-global D-05 grapheme-offset world (the substrate
// Phase 1's normalizeText + Phase 2's findScrollTarget/computeTopVisibleOffset
// speak). They are the load-bearing math behind:
//
//   - D4-10 mode-switch anchor (paginated↔scrolling passage preservation)
//   - D4-11 repagination anchor (page re-derivation keeps the top-of-view
//     passage stable across viewport/typography/font/asset changes)
//
// REUSE, DO NOT FORK (Pattern 5 / 04-RESEARCH §Common Pitfalls 7): per-block
// grapheme lengths derive from `blockNormalizedText` (the exported alias of
// normalizeText.ts's internal `blockText`) + `graphemeClusters` — the SAME
// pair useScrollSave/restoreLocation round-trip through. Any divergence here
// would shift every passage anchor and silently break PAGE-05.
//
// Pure domain logic — no DOM, no React, no side effects. jsdom-safe to unit
// test with synthetic PageFragment[] fixtures.

import type { CanonicalArticle } from "../content/types";
import {
  BLOCK_SEPARATOR,
  blockNormalizedText,
  graphemeClusters,
} from "../content/normalizeText";
import type { PageFragment } from "./types";

/**
 * Per-block grapheme length over the D-05 normalized-text contract.
 *
 * Mirrors the accumulation normalizeText(article) performs (blocks joined by
 * BLOCK_SEPARATOR). Used by pageStartGlobalOffset to walk article.blocks up
 * to a target blockIndex.
 */
export function blockGraphemeLength(
  block: CanonicalArticle["blocks"][number],
  lang: string,
): number {
  return graphemeClusters(blockNormalizedText(block), lang).length;
}

/**
 * Compute the article-global D-05 grapheme offset of a page fragment's START.
 *
 * Walks article.blocks accumulating per-block grapheme lengths + one
 * BLOCK_SEPARATOR between blocks up to the fragment's first entry's
 * blockIndex, then adds that entry's intra-block startGrapheme. The result
 * is in the SAME coordinate system as findScrollTarget / computeTopVisibleOffset
 * — callers can round-trip fragment → offset → DOM target (D4-10 paginated→
 * scrolling) and offset → fragment (D4-10 scrolling→paginated via
 * fragmentContainingOffset) without any coordinate translation.
 *
 * Returns 0 for an empty fragment (defensive — the engine never emits empty
 * fragments, but callers should not crash if one arrives).
 */
export function pageStartGlobalOffset(
  article: CanonicalArticle,
  fragment: PageFragment,
): number {
  if (fragment.blocks.length === 0) return 0;
  const first = fragment.blocks[0];
  if (!first) return 0;
  let offset = 0;
  for (let i = 0; i < first.blockIndex && i < article.blocks.length; i++) {
    offset += blockGraphemeLength(article.blocks[i]!, article.lang) +
      BLOCK_SEPARATOR.length;
  }
  return offset + first.startGrapheme;
}

/**
 * Find the index of the page whose article-global [start, end) range contains
 * the given D-05 grapheme offset. Used to anchor a freshly-derived (or
 * re-derived) page set to the reader's current passage:
 *
 *   - D4-10 scrolling→paginated: the top-visible offset (from
 *     computeTopVisibleOffset) maps to the page that should be mounted first.
 *   - D4-11 repagination: the current page's start offset (from
 *     pageStartGlobalOffset on the OLD pages) maps to a page index in the
 *     NEW pages so the reader stays at the same passage after a
 *     viewport/font/typography change.
 *
 * Pages cover [0, totalGraphemeLength) exactly-once with no gaps or overlaps
 * (PAGE-03 contract), so each page's range is [pageStartGlobalOffset(pages[i]),
 * pageStartGlobalOffset(pages[i+1])) and the last page's end is +∞ (clamp).
 * An offset that overshoots the last page clamps to the last page index
 * (calm nearest-page fallback — corpus changed since the offset was captured).
 *
 * Returns 0 for an empty pages array (defensive).
 */
export function fragmentContainingOffset(
  pages: PageFragment[],
  offset: number,
  article: CanonicalArticle,
): number {
  if (pages.length === 0) return 0;
  let best = 0;
  for (let i = 0; i < pages.length; i++) {
    const start = pageStartGlobalOffset(article, pages[i]!);
    const end =
      i + 1 < pages.length
        ? pageStartGlobalOffset(article, pages[i + 1]!)
        : Number.MAX_SAFE_INTEGER;
    if (offset >= start && offset < end) return i;
    best = i;
  }
  // Offset overshoots the article (corpus changed) — clamp to the last page.
  return best;
}
