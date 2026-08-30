// src/annotations/excerpt.ts
// First-fragment excerpt derivation for highlight quote surfaces (D19-10).
//
// Pure domain logic — no DOM, no React, no side effects (the overlap.ts
// small-pure-module discipline). A cross-block highlight's stored
// quote.exact contains BLOCK_SEPARATOR newlines between block fragments;
// excerpt surfaces (review row + its aria-labels, drawer, popover,
// delete-confirm) describe the span as its FIRST FRAGMENT plus a calm
// ellipsis — never a truncated multi-block blob. Rows stay compact and
// scannable; the full span is visible in the reader.
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
  const firstFragment =
    separatorIndex === -1 ? exact : exact.slice(0, separatorIndex);
  // Case 2: the length cap itself appends the ellipsis when it shortens
  // the fragment.
  const truncated = firstFragment.length > maxChars;
  const capped = truncated
    ? firstFragment.slice(0, maxChars) + ELLIPSIS
    : firstFragment;
  // Case 3: a genuine continuation appends the ellipsis AFTER the cap —
  // but only when the cap did not already append one (exactly one
  // U+2026 in the over-cap continuation case).
  const continues = separatorIndex !== -1;
  return continues && !truncated ? capped + ELLIPSIS : capped;
}
