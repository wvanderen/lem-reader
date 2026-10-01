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
//     review-row redesign): the ENTIRE stored span, with each block
//     boundary rendered as the same calm ellipsis marker so the reader
//     can see material was skipped between fragments. No length cap —
//     the highlight IS this surface's content.
//
// Excerpt honesty rule (19-UI-SPEC §Typography, locked): the ellipsis is
// the SINGLE character U+2026, appended ONLY when the highlight genuinely
// continues past the first fragment OR the excerpt is length-truncated.
// A complete single-fragment highlight NEVER gets an ellipsis — the
// excerpt must not lie about extent.
import { BLOCK_SEPARATOR } from "../content/normalizeText";

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

/**
 * Derive the FULL-span display text for the review row's center-stage
 * quote (the review-row redesign). Every stored fragment renders, in
 * order, with NO length cap; each BLOCK_SEPARATOR becomes one spaced
 * ellipsis marker (" … ") so a cross-block span visibly admits the
 * skipped material between its fragments (the honesty rule's display
 * half — the marker lies about nothing: it sits exactly where blocks
 * were jumped). A single-fragment span passes through byte-unchanged.
 */
export function fullQuoteDisplay(exact: string): string {
  return exact.split(BLOCK_SEPARATOR).join(` ${ELLIPSIS} `);
}
