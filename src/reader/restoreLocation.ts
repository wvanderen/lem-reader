// src/reader/restoreLocation.ts
// Grapheme-offset → DOM-block scroll-target resolution (STATE-01 on the D-05
// substrate). 02-RESEARCH.md Pattern 5 + the per-block normalization note:
//
//   "the per-element text-normalization MUST match normalizeText's block rules
//    exactly (collapse ASCII whitespace only; code-block source verbatim;
//    footnote markers as visible text). Reuse the same helpers, not a parallel
//    implementation, so offsets stay consistent with the D-05 contract."
//
// This module imports `normalizeRunText` and `graphemeClusters` directly from
// src/content/normalizeText and applies the SAME per-block text-contribution
// rules (collapse ASCII whitespace via normalizeRunText; code-block source
// verbatim; footnote markers as visible text). It does NOT reimplement
// normalization — the saved offset is into normalizeText(article), and any
// divergence here would shift every restored location.
//
// Pure domain logic — jsdom-safe to test with HTMLElement stubs carrying
// .textContent + a data-kind attribute. The DOM is queried by the caller
// (ArticleView), which passes the rendered block elements in document order.
import type { CanonicalArticle } from "../content/types";
import {
  BLOCK_SEPARATOR,
  graphemeClusters,
  normalizeRunText,
} from "../content/normalizeText";

/**
 * Normalize a single rendered DOM element's text contribution, mirroring
 * normalizeText's per-block rules EXACTLY (D-05 contract):
 *
 *   - heading / paragraph: collapse ASCII whitespace on .textContent, trim
 *   - code-block (<pre>): .textContent VERBATIM (whitespace is readable code)
 *   - footnote-reference (<sup><a>): the visible marker (e.g. "[1]")
 *   - figure caption / blockquote / list-item: collapse ASCII whitespace on
 *     the direct .textContent (these compound blocks contribute a single
 *     normalized run each under the simplified DOM-element model)
 *
 * The DOM renderer (BlockRenderer.tsx) maps each block kind to a distinct
 * semantic element. We key off the tagName + a `data-kind` hint when present
 * so code-block verbatim behavior is preserved (the load-bearing divergence
 * from normalizeText's whitespace-collapse rule).
 *
 * NOTE: this helper is intentionally a simplified projection — the rendered
 * DOM may carry nested elements (e.g. inline marks inside a paragraph). We
 * rely on HTMLElement.textContent to flatten those into the visible reading
 * text, which is the same thing a screen-reader announces. The block-level
 * granularity is sufficient for location restore (Pattern 5: best-effort
 * block-level target, not exact-character re-anchoring).
 */
export function normalizeElText(el: HTMLElement): string {
  const kind = el.dataset.kind;
  const tag = el.tagName.toLowerCase();
  // Code blocks: .textContent VERBATIM (whitespace is part of the code).
  // The renderer wraps code-block source in <pre><code>; .textContent on the
  // <pre> returns the raw source including internal whitespace and newlines.
  if (tag === "pre" || kind === "code-block") {
    return el.textContent ?? "";
  }
  // Everything else: collapse ASCII whitespace runs and trim, matching
  // normalizeText's normalizeRunText rule for inline-run blocks.
  return normalizeRunText(el.textContent ?? "");
}

/**
 * Resolve a saved grapheme offset to the DOM block whose normalized-text
 * range contains it. Walks `blocks` in document order, accumulating each
 * block's grapheme contribution plus one BLOCK_SEPARATOR between blocks
 * (matching normalizeText's `blocks.join(BLOCK_SEPARATOR)` rule).
 *
 * Returns:
 *   - the block whose [consumed, consumed + blockLen] range contains `offset`
 *   - the LAST block if `offset` overshoots the article (clamp — corpus
 *     changed since save; calm nearest-block fallback, never null)
 *   - null if `blocks` is empty (nothing to scroll to)
 *
 * The caller calls `element.scrollIntoView({ block: "start" })` on the
 * result. Under prefers-reduced-motion the global CSS gate sets
 * scroll-behavior: auto, so the restore is instant; otherwise a single calm
 * scroll lands the block at the viewport top.
 */
export function findScrollTarget(
  article: CanonicalArticle,
  blocks: HTMLElement[],
  offset: number,
): HTMLElement | null {
  if (blocks.length === 0) return null;
  let consumed = 0;
  let last: HTMLElement | null = null;
  for (const el of blocks) {
    last = el;
    const text = normalizeElText(el);
    const len = graphemeClusters(text, article.lang).length;
    // Offset falls in [consumed, consumed + len] → this block contains it.
    // (offset <= consumed + len handles the boundary case offset == consumed.)
    if (offset <= consumed + len) {
      return el;
    }
    consumed += len + BLOCK_SEPARATOR.length; // +1 for the "\n" separator
  }
  // Offset overshoots the article's total length — clamp to the last block.
  // This is the "corpus changed since save" fallback (D-06 revision mismatch
  // is normally caught by the [articleId+revision] key, but defensive clamp
  // keeps restore calm under any drift).
  return last;
}
