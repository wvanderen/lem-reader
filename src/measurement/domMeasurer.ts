// src/measurement/domMeasurer.ts
// DOM-measurement strategy shared by every block kind in Plan 01 (Plan 02
// adds the calibrated Pretext fast path for paragraph + heading kinds).
//
// Plan 04-06: measureAllBlocks now queries `[data-block-index]` (emitted by
// BlockRenderer's ArticleBody top-level map) instead of the legacy flat
// BLOCK_SELECTOR. This guarantees a 1:1 mapping between the returned elements
// and article.blocks — container blocks (blockquote / lists) no longer
// double-count their nested children. The same single pass captures both
// height/lineCount AND per-block LineBox[] (Pitfall 2 — no second DOM walk),
// so the pagination engine can consume pre-captured line boxes instead of
// re-reading live DOM (PaginatedSurface replaces the full ArticleBody before
// the engine runs — the pre-captured boxes are the only source).
//
// RESEARCH §State of the Art + §Common Pitfalls 2 (layout thrash):
//   - Read FRACTIONAL pixels via getBoundingClientRect().height — integer
//     offsetHeight/scrollHeight hides sub-pixel drift that breaks
//     calibration (RESEARCH §Common Pitfalls 4 — stale-result-wins is
//     downstream of a measurement the engine couldn't tell was wrong).
//   - Per-line count via Element.getClientRects().length (MDN: one DOMRect
//     per CSS line box). New usage in the codebase (grep-verified in
//     03-PATTERNS.md — no existing getClientRects call).
//   - BATCH every read before ANY state write (Pitfall 2 — read-phase
//     isolation). This function never mutates the DOM.
//   - Check signal.aborted between blocks and throw AbortError if a newer
//     trigger cancelled this pass (composes with the epoch guard).
//
// Tag-name → kind map mirrors src/content/render/BlockRenderer.tsx output:
//   h1..h6 → "heading", p → "paragraph", blockquote → "blockquote",
//   li (parent ul) → "bulleted-list", li (parent ol) → "numbered-list",
//   figure → "figure", pre → "code-block", sup → "footnote-reference",
//   details → "unsupported".

import type { BlockMeasurement } from "./types";
import { AbortError } from "./fontGate";
import { readLineBoxes, blockNormalizedText } from "../pagination/lineBoxes";

/**
 * Map a rendered element's tag name to its measurement kind string. Mirrors
 * BlockRenderer's emitted elements (h1..h6/p/blockquote/li/figure/pre/sup/
 * details). `li` disambiguates bulleted vs numbered via its parent list.
 */
function kindForElement(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();
  switch (tag) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return "heading";
    case "p":
      return "paragraph";
    case "blockquote":
      return "blockquote";
    case "li": {
      const parent = el.parentElement;
      if (parent?.tagName.toLowerCase() === "ol") return "numbered-list";
      return "bulleted-list";
    }
    case "figure":
      return "figure";
    case "pre":
      return "code-block";
    case "sup":
      return "footnote-reference";
    case "details":
      return "unsupported";
    default:
      return tag;
  }
}

/**
 * Measure every top-level rendered block in a single read-phase. Returns
 * fractional heights + per-line counts + per-block LineBox[] (Plan 04-06).
 * Aborts mid-pass (via AbortError) if `signal` fires — the engine treats
 * AbortError as a silent cancel.
 *
 * Plan 04-06: queries `[data-block-index]` (1:1 with article.blocks by
 * BlockRenderer construction) instead of the legacy flat BLOCK_SELECTOR.
 * Container blocks (blockquote / lists) used to double-count their nested
 * children under BLOCK_SELECTOR, breaking the engine's 1:1 contract — the
 * attribute selector eliminates that mismatch by construction.
 *
 * @param articleEl The rendered <article> element (from ArticleView's
 *   callback-ref seam). Must contain top-level blocks emitted by ArticleBody
 *   (each carrying data-block-index).
 * @param signal The current epoch's AbortSignal; checked between blocks AND
 *   between text-node iterations inside readLineBoxes so a newer trigger
 *   cancels a long measurement.
 */
export function measureAllBlocks(
  articleEl: HTMLElement,
  signal: AbortSignal,
): BlockMeasurement[] {
  // queryBlocks — single DOM read at pass start (Pitfall 2: batch reads).
  // [data-block-index] is 1:1 with article.blocks by BlockRenderer contract.
  // Plan 05-05: the page-fragment's blocks ALSO carry data-block-index now
  // (D5-08 capture binding), so exclude .page-fragment descendants — the
  // measurement body (.article-body-measurement, paginated) or the live
  // .article-body (scrolling) is the authoritative full-article source; the
  // fragment is a per-page slice that would double-count + trip the engine's
  // blocks.length !== article.blocks.length defense.
  const elements = Array.from(
    articleEl.querySelectorAll<HTMLElement>(
      "[data-block-index]:not(.page-fragment [data-block-index])",
    ),
  );
  const out: BlockMeasurement[] = [];
  for (const el of elements) {
    if (signal.aborted) throw new AbortError();
    // Per-block: read rect (fractional height) + line boxes (DOMRect count)
    // AND capture LineBox[] in ONE tight read-phase loop (Pitfall 2 — no
    // second walk). readLineBoxes itself walks descendant text nodes for
    // container blocks; the line-box capture is complete before the next
    // element's reads begin.
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const marginBlockStartPx = Number.parseFloat(style.marginBlockStart) || 0;
    const marginBlockEndPx = Number.parseFloat(style.marginBlockEnd) || 0;
    const lineCount = el.getClientRects().length;
    const fullText = blockNormalizedText(el);
    const lineBoxes = readLineBoxes(el, fullText, signal);
    out.push({
      kind: kindForElement(el),
      heightPx: rect.height,
      marginBlockStartPx,
      marginBlockEndPx,
      lineCount,
      lineBoxes,
    });
  }
  return out;
}
