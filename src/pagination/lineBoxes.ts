// src/pagination/lineBoxes.ts
// DOM read-phase for the pagination engine — the split-point primitive. Per
// the calibration fingerprint (calibration/fingerprint.json), paragraphs are
// NEVER Pretext-eligible (heightDriftP95 4.9–39.6px, breaksMatchRatio 0
// across all 2592 sampled cells). Only headings are Pretext-eligible, and
// D4-02 makes headings ATOMIC. Therefore Pretext's measureParagraphWithBreaks
// — which returns line-break positions — CANNOT be trusted for paragraph
// split points, and the engine MUST derive split points from DOM
// Range.getClientRects() line-box → source-offset mapping for EVERY
// splitting kind (paragraph, list-item contents, blockquote children).
//
// This module is the ONLY place the pagination engine touches DOM layout.
// Everything downstream (splitBlock, widowRules, fragment orchestrator) is
// pure arithmetic over offsets. Mirrors src/measurement/domMeasurer.ts
// discipline: batch every read before any caller write (Pitfall 2 — layout
// thrash), check signal.aborted per block, and throw AbortError on cancel.
//
// D-05 contract (Pitfall 3 — do NOT fork normalization): the per-block text
// used for offset math MUST be produced by the SAME rules as normalizeText.
// We import normalizeElText from ../reader/restoreLocation (which mirrors
// the per-block rules exactly) and graphemeClusters from
// ../content/normalizeText (the canonical Intl.Segmenter grapheme walker).
// Any divergence shifts every split point and breaks the D-05 round-trip.

import type { LineBox } from "./types";
import { graphemeClusters } from "../content/normalizeText";
import { normalizeElText } from "../reader/restoreLocation";
import { AbortError } from "../measurement/fontGate";

// The canonical block selector reused at 4 prior sites (Phase 1–3). The
// caller (fragment.ts orchestrator) owns selection — this module reads ONE
// element at a time. The string is documented here only so a future maintainer
// does not fork a 5th variant; the live selector lives at:
//   - src/measurement/domMeasurer.ts:34
//   - src/measurement/engine.ts:304
//   - src/reader/useScrollSave.ts:99
//   - src/routes/ArticleView.tsx:54
// and is `"h2, h3, h4, p, blockquote, li, pre, figure, sup, details"`.
// NEVER redeclare it as a live selector in src/pagination/ — selector drift
// between measurement/restore/pagination would read different elements.

/**
 * Convenience wrapper exposing the D-05 per-block text rule to the
 * pagination engine's caller. Delegates to normalizeElText so the DOM-text
 * contribution matches normalizeText(article) exactly (Pitfall 3 — no fork).
 * Call this to derive the `fullText` argument to readLineBoxes.
 */
export function blockNormalizedText(el: HTMLElement): string {
  return normalizeElText(el);
}

/**
 * Map a UTF-16 code-unit offset (the coordinate Range.setStart/setEnd
 * natively accepts) to a D-05 grapheme ordinal over the same text. Walks
 * grapheme clusters accumulating their UTF-16 length until the cluster
 * containing `charOffset` is found.
 *
 * For ASCII-only text the grapheme ordinal equals the UTF-16 offset. For
 * text with surrogate pairs (emoji) or combining marks, the grapheme
 * ordinal is the array index of the cluster spanning `charOffset`.
 *
 * Returns `clusters.length` when `charOffset` is at or past end-of-text
 * (the exclusive-end convention — a split at endGrapheme == blockLength
 * means "whole block").
 */
export function charOffsetToGrapheme(
  text: string,
  charOffset: number,
  locale: string,
): number {
  const clusters = graphemeClusters(text, locale);
  let consumed = 0;
  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i]!;
    if (charOffset < consumed + cluster.length) return i;
    consumed += cluster.length;
  }
  return clusters.length;
}

/**
 * Read every CSS line box of a block's text as a LineBox[].
 *
 * Plan 04-06 generalization: walks ALL descendant text nodes in document
 * order (TreeWalker), maintaining a running UTF-16 char-offset accumulator
 * that maps each text node's local offset into the block's full normalized
 * text. For each text node, walks character offsets building a Range per
 * candidate boundary (reusing the rect-comparison logic from the prior
 * single-text-node implementation), and records a LineBox each time the
 * rounded top changes — the LineBox.charOffset is the GLOBAL offset into
 * the concatenated text (the coordinate charOffsetToGrapheme expects).
 *
 * For flat blocks (paragraph/heading with a single text node) the output is
 * byte-identical to the prior implementation. For container blocks
 * (blockquote / list), the walk covers every descendant paragraph/list-item
 * text node in document order so a single LineBox[] spans the entire
 * container — exactly what the engine needs to split containers at line
 * boundaries.
 *
 * The char-offset accumulator MUST sum text-node lengths in the SAME order
 * `normalizeElText(el)` traverses them (it calls `el.textContent` which is
 * the document-order concatenation of descendant text nodes). TreeWalker
 * with NodeFilter.SHOW_TEXT walks in document order; the accumulator stays
 * aligned with textContent. (Pitfall 3 — no normalization fork.)
 *
 * @param el        The block's rendered HTMLElement (must contain ≥1 text node
 *                    descendant, or [] is returned).
 * @param fullText  The block's normalized text (use blockNormalizedText(el)).
 * @param signal    Cancel signal; throws AbortError if aborted mid-walk.
 *
 * Aborts (via AbortError) if `signal` is or becomes aborted. Returns [] if
 * the element has no text node descendant or Range.getClientRects yields no
 * rects (e.g. the block is display:none or empty — the caller treats this as
 * a zero-line block and moves it whole per D4-02 atomic fallback).
 */
export function readLineBoxes(
  el: HTMLElement,
  fullText: string,
  signal: AbortSignal,
): LineBox[] {
  if (signal.aborted) throw new AbortError();
  // Early-return on empty normalized text — no text means no line boxes.
  // fullText is the canonical normalized text for this block; the offsets
  // the walk produces index into this string (the coordinate
  // charOffsetToGrapheme expects). The walk itself uses textContent via
  // TreeWalker (the source of truth) — fullText is the contract surface.
  if (fullText.length === 0) return [];

  // Collect descendant text nodes in document order. TreeWalker.SHOW_TEXT
  // walks the DOM tree pre-order, matching the order `el.textContent`
  // concatenates them — so the char-offset accumulator stays aligned with
  // `fullText` (which is derived from textContent via normalizeElText).
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let current: Node | null;
  while ((current = walker.nextNode()) !== null) {
    textNodes.push(current as Text);
  }
  if (textNodes.length === 0) return [];

  const range = document.createRange();
  const boxes: LineBox[] = [];
  let lastTop = Number.NaN;
  // Global char offset accumulator: the position of the current text node's
  // first char within the concatenated block text. Updated as we advance to
  // each subsequent text node. For a flat block (1 text node) this stays 0
  // for the whole walk — preserving byte-identical output to the prior
  // single-text-node implementation.
  let globalBase = 0;

  for (const textNode of textNodes) {
    const localLen = textNode.data.length;
    for (let i = 0; i <= localLen; i++) {
      // Check cancel between iterations — a long block is O(totalLen) DOM
      // reads, so a newer trigger must be able to cancel mid-walk.
      if ((globalBase + i) > 0 && signal.aborted) throw new AbortError();
      range.setStart(textNode, 0);
      range.setEnd(textNode, i);
      const rects = range.getClientRects();
      if (rects.length === 0) continue;
      const lastRect = rects[rects.length - 1]!;
      const top = lastRect.top;
      if (Number.isNaN(lastTop) || Math.round(top) !== Math.round(lastTop)) {
        // New line detected. Line 1 always starts at charOffset 0; later
        // lines began at the char that triggered the wrap (globalBase + i - 1),
        // since the range [0, i-1) within this text node was on the previous
        // line and [0, i) now spans both. globalBase advances the offset
        // across text node boundaries so containers report GLOBAL offsets.
        const isFirst = boxes.length === 0;
        const charOffset = isFirst ? 0 : globalBase + i - 1;
        boxes.push({ charOffset, topPx: top, bottomPx: lastRect.bottom });
        lastTop = top;
      }
    }
    globalBase += localLen;
  }
  return boxes;
}
