// src/content/normalizeText.ts
// D-05 grapheme-offset substrate. Lifted verbatim from 01-RESEARCH.md §Code
// Examples "Normalized Text + Grapheme Offsets" + "TextQuote Selector Helpers".
//
// This module implements the single most important contract in Phase 1: ONE
// deterministic normalized-text string per article revision, addressable by
// grapheme-cluster ordinals. Phase 2 (location restore) and Phase 5
// (annotations) persist offsets against this contract — it cannot change after
// release without corrupting every saved location and highlight.
import type { Block, CanonicalArticle, InlineRun } from "./types";

/** Separator between consecutive blocks (and between body and footnotes region). */
export const BLOCK_SEPARATOR = "\n";

/**
 * Collapse ASCII whitespace runs to a single space, then trim.
 *
 * Pitfall 2 rule: ONLY ASCII whitespace ([\t\n\f\r ]) is collapsed. Do NOT
 * touch Unicode whitespace (NBSP \u00A0, ZWJ \u200D, RTL marks) — these are
 * preserved verbatim because they are part of the readable text. Do NOT apply
 * Unicode normalization (no NFC/NFKC) — it would break Intl.Segmenter
 * reproducibility across revisions.
 */
export function normalizeRunText(text: string): string {
  return text.replace(/[\t\n\f\r ]+/g, " ").trim();
}

/** Render an inline run array to its normalized text contribution. */
function inlineText(runs: InlineRun[]): string {
  return runs.map((r) => normalizeRunText(r.text)).filter(Boolean).join(" ");
}

/**
 * Walk a single block; return its normalized text contribution.
 *
 * Code-block source is returned VERBATIM (whitespace NOT collapsed — it IS
 * readable text). Footnote references contribute their visible marker (e.g.
 * "[1]") at their reading-order body position; footnote BODIES participate
 * later via normalizeText (see Pitfall 3 note there).
 */
function blockText(block: Block): string {
  switch (block.kind) {
    case "heading":
    case "paragraph":
      return inlineText(block.content);
    case "blockquote":
      return block.children.map(blockText).join(BLOCK_SEPARATOR);
    case "bulleted-list":
    case "numbered-list":
      return block.items
        .map((item) => item.content.map(blockText).join(BLOCK_SEPARATOR))
        .join(BLOCK_SEPARATOR);
    case "figure":
      return [block.alt, inlineText(block.caption)].filter(Boolean).join(BLOCK_SEPARATOR);
    case "code-block":
      return block.source; // verbatim — do NOT collapse whitespace in code
    case "footnote-reference":
      return block.marker; // e.g. "[1]"
    case "unsupported":
      // Disclosure summary text contributes to the stream (D-05: reading-order position)
      return block.plainDescription;
  }
}

/**
 * Exported alias for `blockText` — Phase 4 Plan 04-04 anchor helpers
 * (src/pagination/anchor.ts) need per-block normalized text to compute
 * article-global grapheme offsets for the D4-10 mode-switch + D4-11
 * repagination anchors. Exporting the SAME function (rather than a parallel
 * implementation) honors Pattern 5 / Pitfall: never fork normalization —
 * any divergence would shift every passage anchor.
 */
export function blockNormalizedText(block: Block): string {
  return blockText(block);
}

/**
 * D-05 contract: ONE deterministic normalized-text string per article revision.
 *
 * Pitfall 3 rule: footnote BODY text participates AFTER the body blocks, in
 * footnotes-region order. The `[bodyText, footnoteText].filter(Boolean).join()`
 * form guarantees a footnote body's offset is always greater than its
 * reference marker's offset.
 */
export function normalizeText(article: CanonicalArticle): string {
  const bodyText = article.blocks.map(blockText).join(BLOCK_SEPARATOR);
  const footnoteText = article.footnotes
    .map((fn) => inlineText(fn.content))
    .filter(Boolean)
    .join(BLOCK_SEPARATOR);
  return [bodyText, footnoteText].filter(Boolean).join(BLOCK_SEPARATOR);
}

/**
 * Grapheme-offset substrate.
 *
 * CRITICAL (Pitfall 1): the canonical offset of the Nth grapheme cluster is N,
 * NOT segment.index (which is a UTF-16 code-unit offset into the source string).
 *
 * Returns: an array of grapheme cluster substrings in order, so callers can
 * derive offsets as array indices.
 */
export function graphemeClusters(text: string, locale: string): string[] {
  const segmenter = new Intl.Segmenter(locale, { granularity: "grapheme" });
  return Array.from(segmenter.segment(text), (s) => s.segment);
}

/** The canonical length of an article in grapheme clusters. */
export function graphemeLength(article: CanonicalArticle): number {
  return graphemeClusters(normalizeText(article), article.lang).length;
}

// ── W3C Web Annotation selectors (types + derive only in Phase 1) ───────────
// Source: w3.org/TR/annotation-model/#selectors

/** Grapheme offset range into normalizeText(article); start inclusive, end exclusive. */
export interface TextPositionSelector {
  start: number;
  end: number;
}

/** A TextQuote selector over the normalized grapheme text (prefix/exact/suffix). */
export interface TextQuoteSelector {
  prefix: string;
  exact: string;
  suffix: string;
}

/**
 * Derive a TextQuoteSelector from a TextPositionSelector (used when saving an
 * annotation). `exact` round-trips through graphemeClusters(normalizeText(article)).
 */
export function deriveQuoteSelector(
  article: CanonicalArticle,
  position: TextPositionSelector,
  contextRadius = 32, // grapheme clusters of prefix/suffix
): TextQuoteSelector {
  const clusters = graphemeClusters(normalizeText(article), article.lang);
  const exact = clusters.slice(position.start, position.end).join("");
  const prefix = clusters
    .slice(Math.max(0, position.start - contextRadius), position.start)
    .join("");
  const suffix = clusters
    .slice(position.end, Math.min(clusters.length, position.end + contextRadius))
    .join("");
  return { prefix, exact, suffix };
}

// DEFERRED to Phase 5 (feeds ANNO-07 orphan path):
//   resolveQuoteSelector(article, selector): TextPositionSelector | "ambiguous" | "orphan"
// Phase 1 ships types + derive() ONLY — resolve() is the re-anchoring step that
// belongs with annotation persistence (RESEARCH.md Open Question #4).
