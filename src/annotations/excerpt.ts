// src/annotations/excerpt.ts
// Excerpt derivations for highlight quote surfaces (D19-10).
//
// Pure domain logic — no DOM, no React, no side effects (the overlap.ts
// small-pure-module discipline). A cross-block highlight's stored
// quote.exact contains BLOCK_SEPARATOR newlines between block fragments;
// two derivations serve the two surface families:
//
//   - firstFragmentExcerpt — the compact excerpt (review aria-labels,
//     drawer, popover, delete-confirm): the span describes itself as its
//     FIRST FRAGMENT plus a calm ellipsis — never a truncated multi-block
//     blob. Names stay short and scannable.
//   - fullQuoteDisplay — the review row's center-stage quote (the
//     review-row redesign): the ENTIRE stored span, with each verified
//     block boundary rendered as the same calm ellipsis marker. Code
//     line breaks and quotes without a reliable article match stay verbatim.
//     No length cap — the highlight IS this surface's content.
//
// Excerpt honesty rule (19-UI-SPEC §Typography, locked): the ellipsis is
// the SINGLE character U+2026, appended ONLY when the highlight genuinely
// continues past the first fragment OR the excerpt is length-truncated.
// A complete single-fragment highlight NEVER gets an ellipsis — the
// excerpt must not lie about extent.
import {
  BLOCK_SEPARATOR,
  articleGraphemeIndex,
  blockNormalizedText,
} from "../content/normalizeText";
import type { TextPositionSelector } from "../content/normalizeText";
import type { Block, CanonicalArticle } from "../content/schema";

/** The calm ellipsis — exactly one U+2026 (never three dots). */
const ELLIPSIS = "\u2026";

/**
 * Derive a surface excerpt from a highlight's stored quote.exact.
 *
 * Composition (truncate-then-conditional-ellipsis — 19-RESEARCH §Code
 * Examples "First-fragment excerpt helper"; the honesty cases are each
 * distinguishable):
 *   1. complete single fragment within the cap → identical text, NO
 *      ellipsis;
 *   2. single fragment over the cap → capped text + ellipsis;
 *   3. genuine continuation (exact has fragments after the first) →
 *      first fragment + ellipsis — and when the fragment ALSO exceeds
 *      the cap, the cap and the continuation collapse to exactly ONE
 *      ellipsis, never two.
 *
 * Per-surface caps are parameterized (the helper does not unify them);
 * export NEVER truncates (the full span exports — ellipsis is a
 * review-surface behavior only).
 */
export function firstFragmentExcerpt(exact: string, maxChars: number): string {
  const separatorIndex = exact.indexOf(BLOCK_SEPARATOR);
  const firstFragment = separatorIndex === -1 ? exact : exact.slice(0, separatorIndex);
  // Case 2: the length cap itself appends the ellipsis when it shortens
  // the fragment.
  const truncated = firstFragment.length > maxChars;
  const capped = truncated ? firstFragment.slice(0, maxChars) + ELLIPSIS : firstFragment;
  // Case 3: a genuine continuation appends the ellipsis AFTER the cap —
  // but only when the cap did not already append one (exactly one
  // U+2026 in the over-cap continuation case).
  const continues = separatorIndex !== -1;
  return continues && !truncated ? capped + ELLIPSIS : capped;
}

/** Internal code newlines are content, not canonical block separators. */
const codeNewlinesCache = new WeakMap<CanonicalArticle, ReadonlySet<number>>();

function codeNewlines(article: CanonicalArticle): ReadonlySet<number> {
  const cached = codeNewlinesCache.get(article);
  if (cached) return cached;
  const offsets = new Set<number>();
  function walk(blocks: readonly Block[], start: number): number {
    let offset = start;
    for (const block of blocks) {
      if (block.kind === "code-block") {
        for (let i = 0; i < block.source.length; i++) {
          if (block.source[i] === BLOCK_SEPARATOR) offsets.add(offset + i);
        }
      } else if (block.kind === "blockquote") {
        walk(block.children, offset);
      } else if (block.kind === "bulleted-list" || block.kind === "numbered-list") {
        let itemOffset = offset;
        for (const item of block.items) {
          itemOffset = walk(item.content, itemOffset);
        }
      }
      offset += blockNormalizedText(block).length + BLOCK_SEPARATOR.length;
    }
    return offset;
  }
  walk(article.blocks, 0);
  codeNewlinesCache.set(article, offsets);
  return offsets;
}

/**
 * Show every stored character, replacing only verified structural separators.
 * A missing/uncertain anchor or a recovery range whose text has changed cannot
 * establish the stored quote's boundaries, so its text passes through unchanged.
 */
export function fullQuoteDisplay(
  exact: string,
  article?: CanonicalArticle,
  position?: TextPositionSelector,
): string {
  if (!article || !position) return exact;
  const index = articleGraphemeIndex(article);
  if (index.clusters.slice(position.start, position.end).join("") !== exact) return exact;
  const start = index.clusters.slice(0, position.start).join("").length;
  const internalNewlines = codeNewlines(article);
  return exact.replace(/\n/g, (newline, offset: number) =>
    internalNewlines.has(start + offset) ? newline : ` ${ELLIPSIS} `,
  );
}
