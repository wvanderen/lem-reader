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
// 260820-beo: readLineBoxes finds each line boundary via BINARY SEARCH over
// the rounded-top predicate — O(lines × log L) Range.getClientRects probes
// per text node instead of the former O(L) per-character prefix scan (a
// 500-char paragraph dropped from 501 probes to ~lines × 9). The overflow
// guard (overflowGuard.ts) calls readLineBoxes on the live fragment per
// correction iteration, so it inherits this speedup through the unchanged
// signature with zero edits — that call site is why this rewrite exists.
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
 * text. For each text node, finds each next line boundary by BINARY-SEARCHING
 * the minimal prefix offset whose probe's rounded last-rect top differs from
 * the current line's — and records a LineBox each time one is found — the
 * LineBox.charOffset is the GLOBAL offset into the concatenated text (the
 * coordinate charOffsetToGrapheme expects).
 *
 * 260820-beo: the former per-character prefix scan probed EVERY i in
 * 0..localLen (a 500-char paragraph = 501 Range.getClientRects queries;
 * ~100k+ rect queries per measurement pass on a long article, multiplied by
 * every overflow-guard correction). The binary search produces a
 * byte-identical LineBox[] at O(lines × log L) probe cost — equivalence is
 * pinned by tests/unit/pagination/lineBoxesBinarySearch.test.ts, which
 * replicates the OLD linear walk as a test-local oracle and deep-equals the
 * two across diverse schedules (plateau/container/surrogate).
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
    // 260820-beo binary-search line walk. Given the current line established
    // at local offset `cur` (initially 0) with recorded `lastTop` (NaN before
    // the first box), find the MINIMAL i in (cur, localLen] whose probe
    // [0, i) returns non-empty rects AND whose rounded last-rect top differs
    // from `lastTop` (a NaN lastTop matches any non-empty probe). The
    // predicate is monotone in i because rounded last-rect tops are
    // non-decreasing in top-to-bottom LTR flow (same value within a line,
    // larger on later lines — all three engines lay out lines this way;
    // the replica-oracle tests in lineBoxesBinarySearch.test.ts pin the
    // schedules, including the rounded-top plateau where two adjacent lines
    // merge). Binary search over a monotone predicate therefore finds the
    // same minimal i the former per-character linear scan found — the probe
    // count drops from O(L) to O(lines × log L) per text node.
    let cur = 0;
    for (;;) {
      if (cur >= localLen) break; // no offsets remain in this text node
      let lo = cur + 1;
      let hi = localLen;
      let boundary = -1;
      let boundaryRects: DOMRectList | null = null;
      while (lo <= hi) {
        // Check cancel before every probe — the probe count is now
        // ~lines × log L per node, so cancellation latency drops, but the
        // mid-walk AbortError contract is preserved. (The function-entry
        // check above covers the pre-aborted case; every binary-search
        // probe sits at globalBase + mid ≥ 1, matching the old walk's
        // abort-check condition.)
        if (signal.aborted) throw new AbortError();
        const mid = (lo + hi) >> 1;
        range.setStart(textNode, 0);
        range.setEnd(textNode, mid);
        const rects = range.getClientRects();
        if (rects.length > 0) {
          const lastRect = rects[rects.length - 1]!;
          if (
            Number.isNaN(lastTop) ||
            Math.round(lastRect.top) !== Math.round(lastTop)
          ) {
            // Predicate holds at mid — the boundary is at mid or earlier.
            boundary = mid;
            boundaryRects = rects;
            hi = mid - 1;
            continue;
          }
        }
        // Predicate fails at mid — the boundary (if any) is later.
        lo = mid + 1;
      }
      if (boundary < 0) break; // no further boundary in this text node
      // New line detected. Line 1 always starts at charOffset 0; later
      // lines began at the char that triggered the wrap (globalBase + i - 1),
      // since the range [0, i-1) within this text node was on the previous
      // line and [0, i) now spans both. The box is emitted from the BOUNDARY
      // probe's own last rect (topPx/bottomPx are exactly the values the
      // linear scan observed at that i — probes are deterministic within a
      // write-free read phase, Pitfall 2). globalBase advances the offset
      // across text node boundaries so containers report GLOBAL offsets.
      const lastRect = boundaryRects![boundaryRects!.length - 1]!;
      const top = lastRect.top;
      const isFirst = boxes.length === 0;
      const charOffset = isFirst ? 0 : globalBase + boundary - 1;
      boxes.push({ charOffset, topPx: top, bottomPx: lastRect.bottom });
      lastTop = top;
      cur = boundary;
    }
    globalBase += localLen;
  }
  return boxes;
}
