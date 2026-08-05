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
 * Read every CSS line box of a block's first text node as a LineBox[].
 *
 * Implementation (RESEARCH §Architecture Pattern 2): create one Range via
 * document.createRange, walk character offsets over the block's first text
 * node, and record a LineBox each time the last rect's rounded top changes.
 * The first non-empty rect establishes line 1 (charOffset 0); subsequent
 * distinct tops mark where later lines begin.
 *
 * LineBox.charOffset is a UTF-16 code-unit offset into the text node. Map
 * it to a D-05 grapheme ordinal via charOffsetToGrapheme before placing a
 * page boundary.
 *
 * @param el        The block's rendered HTMLElement (must contain a text node).
 * @param fullText  The block's normalized text (use blockNormalizedText(el)).
 * @param signal    Cancel signal; throws AbortError if aborted mid-walk.
 *
 * Aborts (via AbortError) if `signal` is or becomes aborted. Returns [] if
 * the element has no text node or Range.getClientRects yields no rects
 * (e.g. the block is display:none or empty — the caller treats this as a
 * zero-line block and moves it whole per D4-02 atomic fallback).
 */
export function readLineBoxes(
  el: HTMLElement,
  fullText: string,
  signal: AbortSignal,
): LineBox[] {
  if (signal.aborted) throw new AbortError();
  const textNode = el.firstChild;
  if (!textNode) return [];
  const range = document.createRange();
  const boxes: LineBox[] = [];
  let lastTop = Number.NaN;

  for (let i = 0; i <= fullText.length; i++) {
    // Check cancel between iterations — a long paragraph is O(textLen) DOM
    // reads, so a newer trigger must be able to cancel mid-walk.
    if (i > 0 && signal.aborted) throw new AbortError();
    range.setStart(textNode, 0);
    range.setEnd(textNode, i);
    const rects = range.getClientRects();
    if (rects.length === 0) continue;
    const lastRect = rects[rects.length - 1]!;
    const top = lastRect.top;
    if (Number.isNaN(lastTop) || Math.round(top) !== Math.round(lastTop)) {
      // New line detected. Line 1 always starts at charOffset 0; later
      // lines began at the char that triggered the wrap (i-1), since the
      // range [0, i-1] was on the previous line and [0, i] now spans both.
      const charOffset = boxes.length === 0 ? 0 : i - 1;
      boxes.push({ charOffset, topPx: top, bottomPx: lastRect.bottom });
      lastTop = top;
    }
  }
  return boxes;
}
