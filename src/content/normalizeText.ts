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

// ── Locale-keyed Intl.Segmenter cache (260819-tld) ───────────────────────────
// Constructing an Intl.Segmenter is expensive; the hot paths (scroll listeners,
// page turns, highlight resolution) used to pay it on EVERY graphemeClusters
// call. One instance per locale is constructed for the page lifetime. The
// exported signature and output of graphemeClusters are UNCHANGED.

/** Locale-keyed grapheme-granularity segmenter instances (one per locale). */
const segmenterCache = new Map<string, Intl.Segmenter>();

function segmenterFor(locale: string): Intl.Segmenter {
  let segmenter = segmenterCache.get(locale);
  if (!segmenter) {
    segmenter = new Intl.Segmenter(locale, { granularity: "grapheme" });
    segmenterCache.set(locale, segmenter);
  }
  return segmenter;
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
  return Array.from(segmenterFor(locale).segment(text), (s) => s.segment);
}

// ── Per-article grapheme index (260819-tld) ──────────────────────────────────
// Precomputed full-article segmentation + per-block prefix sums, so
// article-level consumers (graphemeLength, deriveQuoteSelector,
// pageStartGlobalOffset, resolveQuoteSelector) segment an article ONCE per
// parsed object instead of per call.
//
// D-05 guarantees ONE deterministic normalized-text string per article
// revision, and articles are immutable once parsed — so each parsed article
// object gets exactly one index, keyed on the article OBJECT in a WeakMap and
// garbage-collected with it. A different revision parses to a different
// object → a fresh index (never a stale one).

/** Precomputed grapheme index for one parsed article object. */
export interface ArticleGraphemeIndex {
  /** normalizeText(article) — the D-05 canonical string. */
  readonly normalizedText: string;
  /** Full-article grapheme clusters of normalizedText (footnotes included). */
  readonly clusters: readonly string[];
  /** Body-block grapheme lengths (per-block segmentation, in block order). */
  readonly perBlockLengths: readonly number[];
  /**
   * Prefix sums over perBlockLengths, length blocks.length + 1. Entry i =
   * sum over j < i of perBlockLengths[j] + BLOCK_SEPARATOR.length — the exact
   * quantity the pre-change pageStartGlobalOffset loop accumulated. The final
   * entry (i = blocks.length) is the SENTINEL: the capped accumulation an
   * out-of-range blockIndex used to produce.
   */
  readonly blockStartOffsets: readonly number[];
  /** clusters.length — the canonical article length in grapheme clusters. */
  readonly totalGraphemes: number;
}

const articleIndexCache = new WeakMap<CanonicalArticle, ArticleGraphemeIndex>();

/**
 * The per-article grapheme index (built once per article object, then cached).
 *
 * CRITICAL: perBlockLengths are derived by segmenting blockText(block) per
 * block. Do NOT split the joined normalizedText on BLOCK_SEPARATOR — code-block
 * sources are verbatim and can themselves contain newline characters, so
 * separator positions in the joined string are not reliable block boundaries.
 */
export function articleGraphemeIndex(
  article: CanonicalArticle,
): ArticleGraphemeIndex {
  let index = articleIndexCache.get(article);
  if (!index) {
    const normalizedText = normalizeText(article);
    const clusters = graphemeClusters(normalizedText, article.lang);
    const perBlockLengths = article.blocks.map(
      (block) => graphemeClusters(blockText(block), article.lang).length,
    );
    const blockStartOffsets: number[] = [];
    let accumulated = 0;
    for (const len of perBlockLengths) {
      blockStartOffsets.push(accumulated);
      accumulated += len + BLOCK_SEPARATOR.length;
    }
    // Sentinel entry: the capped accumulation for an out-of-range blockIndex.
    blockStartOffsets.push(accumulated);
    index = {
      normalizedText,
      clusters,
      perBlockLengths,
      blockStartOffsets,
      totalGraphemes: clusters.length,
    };
    articleIndexCache.set(article, index);
  }
  return index;
}

/** The canonical length of an article in grapheme clusters. */
export function graphemeLength(article: CanonicalArticle): number {
  return articleGraphemeIndex(article).totalGraphemes;
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
  // Served by the per-article index — one segmentation per article object,
  // not one per capture (260819-tld).
  const clusters = articleGraphemeIndex(article).clusters;
  const exact = clusters.slice(position.start, position.end).join("");
  const prefix = clusters
    .slice(Math.max(0, position.start - contextRadius), position.start)
    .join("");
  const suffix = clusters
    .slice(position.end, Math.min(clusters.length, position.end + contextRadius))
    .join("");
  return { prefix, exact, suffix };
}

// ── Phase 5: resolveQuoteSelector (D5-02 re-anchoring) ─────────────────────
// Source: D5-02 in 05-CONTEXT.md (locked decision). Algorithm delegated to
// src/annotations/resolution.ts so this module stays focused on the D-05
// substrate; the contract signature stays here per the Phase 1 stub site
// (05-PATTERNS.md §normalizeText.ts). The import creates a benign module
// cycle (resolution.ts imports graphemeClusters/normalizeText from here — both
// are hoisted function declarations used only at call-time, so there is no
// temporal-dead-zone hazard).
import { resolveQuoteSelector as resolveQuoteSelectorImpl } from "../annotations/resolution";

/**
 * Re-resolve a stored TextQuoteSelector against the current revision's
 * normalized text (D5-02). Returns:
 *   - a TextPositionSelector when the passage is found confidently;
 *   - "ambiguous" when the exact text appears N>1 times even after
 *     prefix/suffix disambiguation (ANNO-07 — the reader is shown the
 *     ambiguous state, never a silent re-attach);
 *   - "orphan" when zero exact matches AND no confident prefix/suffix fallback.
 *
 * Pure function — no DOM, no React, no side effects. jsdom-safe.
 *
 * `positionHint` (the stored TextPositionSelector) is a nearness hint for the
 * zero-exact fallback only; it is IGNORED when the exact text matches uniquely
 * (the text IS the anchor). Never silently re-attaches to a wrong spot.
 */
export function resolveQuoteSelector(
  article: CanonicalArticle,
  selector: TextQuoteSelector,
  positionHint?: TextPositionSelector,
): TextPositionSelector | "ambiguous" | "orphan" {
  return resolveQuoteSelectorImpl(article, selector, positionHint);
}
