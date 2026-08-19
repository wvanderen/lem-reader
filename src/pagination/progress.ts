// src/pagination/progress.ts
// Offset-anchored paginated progress ratio (POLISH-02, Phase 13 Plan 02).
//
// Replaces the old page-count semantics (current/total) that made a one-page
// article read 100% on open and page 1 of a two-page article read 50% at the
// very start. Progress now reflects actual position in the text, matching the
// library rows' D8-11 ratio (graphemeOffset / grapheme total) and the restore
// coordinate system.
//
// D-05 coordinate contract: the ratio is DERIVED per layout from the same
// grapheme-offset substrate locations/highlights persist against — it is never
// itself persisted, and page numbers remain informational only.
//
// REUSE, DO NOT FORK (the 04-09 offset-drift class is the risk being avoided):
// this module composes ONLY the two shipped helpers — pageStartGlobalOffset
// (src/pagination/anchor.ts) and graphemeLength (src/content/normalizeText.ts)
// — and performs no new offset-accumulation walk over blocks.
//
// Pure domain module — no UI framework imports, no DOM globals, no side
// effects. jsdom-safe to unit test with hand-built PageFragment fixtures.

import type { CanonicalArticle } from "../content/types";
import { graphemeLength } from "../content/normalizeText";
import { pageStartGlobalOffset } from "./anchor";
import type { PageFragment } from "./types";

/**
 * Progress ratio [0, 1] for the page whose content starts at `fragment`.
 *
 * ratio = pageStartGlobalOffset(article, fragment) / graphemeLength(article)
 *
 * Boundary semantics (SC#2): the first page of any article — including a
 * one-page article — reads 0; each turn grows the ratio monotonically; the
 * last page reads strictly below 1 while it still has content. Defensive
 * bounds: an empty coordinate space yields 0; a stale offset overshooting
 * the article clamps to 1 (ProgressHairline clamps again downstream).
 */
export function paginatedProgressRatio(
  article: CanonicalArticle,
  fragment: PageFragment,
): number {
  const total = graphemeLength(article);
  if (total === 0) return 0;
  const start = pageStartGlobalOffset(article, fragment);
  return Math.min(1, Math.max(0, start / total));
}
