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
  articleGraphemeIndex,
  blockNormalizedText,
  footnoteRowFor,
  footnoteRows,
  graphemeClusters,
} from "../content/normalizeText";
import { endPinOffset, isFinalPage } from "../reader/readingPosition";
import type { PageFragment } from "./types";

/**
 * Per-block grapheme length over the D-05 normalized-text contract.
 *
 * Mirrors the accumulation normalizeText(article) performs (blocks joined by
 * BLOCK_SEPARATOR). ArticleView's sameBlock mode-toggle helper still calls
 * this; with the 260819-tld segmenter cache it no longer pays the per-call
 * constructor cost. ARTICLE-OFFSET HOT PATHS (page turns, progress ratio)
 * must use articleGraphemeIndex(article) instead — never this per-block walk.
 *
 * Issue #233: canonical article blocks are immutable once parsed, so the
 * per-block segmentation is cached per block object — a giant-prose block's
 * whole-vs-tail checks during page projection must not re-segment 350k
 * graphemes per render (the same WeakMap discipline as
 * articleGraphemeIndex/runClusters).
 */
const blockLengthCache = new WeakMap<
  CanonicalArticle["blocks"][number],
  { lang: string; length: number }
>();

export function blockGraphemeLength(
  block: CanonicalArticle["blocks"][number],
  lang: string,
): number {
  const hit = blockLengthCache.get(block);
  if (hit && hit.lang === lang) return hit.length;
  const length = graphemeClusters(blockNormalizedText(block), lang).length;
  blockLengthCache.set(block, { lang, length });
  return length;
}

/**
 * Compute the article-global D-05 grapheme offset of a page fragment's START.
 *
 * O(1): reads the fragment's first entry's blockIndex from the per-article
 * index's blockStartOffsets prefix sums (260819-tld — previously a per-block
 * accumulation walk on every call). An out-of-range blockIndex falls to the
 * sentinel entry, reproducing the old loop's capped accumulation exactly. The
 * result is in the SAME coordinate system as findScrollTarget /
 * computeTopVisibleOffset — callers can round-trip fragment → offset → DOM
 * target (D4-10 paginated→scrolling) and offset → fragment (D4-10
 * scrolling→paginated via fragmentContainingOffset) without any coordinate
 * translation.
 *
 * Returns 0 for an empty fragment (defensive — the engine never emits empty
 * fragments, but callers should not crash if one arrives).
 */
export function pageStartGlobalOffset(article: CanonicalArticle, fragment: PageFragment): number {
  if (fragment.blocks.length === 0) return 0;
  const first = fragment.blocks[0];
  if (!first) return 0;
  // Issue #235 — a footnote entry speaks the SAME canonical currency through
  // the substrate's footnote rows; blockIndex is the past-body sentinel and
  // must never be read as a block coordinate.
  if (first.footnoteIndex !== undefined) {
    const row = footnoteRowFor(article, first.footnoteIndex);
    if (!row) return 0; // defensive — a scope-validated entry always resolves
    return row.start + first.startGrapheme;
  }
  // Out-of-range blockIndex clamps to the sentinel entry (index blocks.length)
  // — byte-identical to the old loop's `i < article.blocks.length` cap.
  const blockIndex = Math.min(first.blockIndex, article.blocks.length);
  return articleGraphemeIndex(article).blockStartOffsets[blockIndex]! + first.startGrapheme;
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
 * O(pages): each page's start is computed ONCE and carried forward as the
 * next iteration's end bound (260819-tld — previously two pageStartGlobalOffset
 * calls per page, each an O(blocks) walk).
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
  let start = pageStartGlobalOffset(article, pages[0]!);
  for (let i = 0; i < pages.length; i++) {
    const end =
      i + 1 < pages.length
        ? pageStartGlobalOffset(article, pages[i + 1]!)
        : Number.MAX_SAFE_INTEGER;
    if (offset >= start && offset < end) return i;
    best = i;
    start = end;
  }
  // Offset overshoots the article (corpus changed) — clamp to the last page.
  return best;
}

/**
 * The committed-page anchor: the anchor a reader persists while ON page
 * `pageIndex` — pageStartGlobalOffset, except the LAST page of a MULTI-page
 * set pins to the end-pin (endPinOffset — Issue #2's readingPosition
 * module) so a fully-turned article reads finished (260908-oht). A one-page
 * set keeps anchor 0 (POLISH-02 open-reads-0 boundary). Returns 0 for an
 * empty pages array or an out-of-range index (defensive).
 */
export function pageAnchorOffset(
  article: CanonicalArticle,
  pages: PageFragment[],
  pageIndex: number,
): number {
  if (pages.length === 0) return 0;
  if (pageIndex < 0 || pageIndex >= pages.length) return 0;
  const lastEntry = pages[pageIndex]!.blocks.at(-1);
  const index = articleGraphemeIndex(article);
  const rows = footnoteRows(article);
  // Issue #235 — "reaches work end" includes the footnotes region: a body
  // end is the work end ONLY when no footnote text exists (all bodies empty
  // or none at all). A footnoted work finishes when its LAST footnote row is
  // fully covered — a body-window end must never pin the work done while
  // footnote text remains unrepresented.
  const reachesWorkEnd =
    lastEntry?.footnoteIndex !== undefined
      ? (() => {
          const row = footnoteRowFor(article, lastEntry.footnoteIndex);
          return row !== undefined && lastEntry.endGrapheme === row.length && row === rows.at(-1);
        })()
      : lastEntry?.blockIndex === article.blocks.length - 1 &&
        lastEntry.endGrapheme === index.perBlockLengths[lastEntry.blockIndex] &&
        rows.length === 0;
  // A local window's final page is not the work's end. Conversely, a
  // one-page terminal window of a multi-window work can finish the work.
  const beginsMidWork = pageStartGlobalOffset(article, pages[0]!) > 0;
  if (
    reachesWorkEnd &&
    (isFinalPage(pageIndex, pages.length) || (beginsMidWork && pageIndex === pages.length - 1))
  ) {
    return endPinOffset(article);
  }
  return pageStartGlobalOffset(article, pages[pageIndex]!);
}
