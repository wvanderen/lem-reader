// src/annotations/resolution.ts
// Pure re-anchoring helpers for the D5-02 resolveQuoteSelector algorithm.
//
// Implements the locked re-attachment contract (05-CONTEXT.md D5-01/D5-02,
// 05-RESEARCH.md §Pattern 2):
//   1. find ALL exact-substring occurrences of selector.exact in
//      normalizeText(article) (grapheme-cluster slicing);
//   2. unique exact → confident (return the TextPositionSelector);
//   3. N>1 exact → narrow by prefix+suffix context → still N>1 → "ambiguous"
//      (the positionHint is a DISPLAY tie-breaker only — never a silent
//      re-attach — ANNO-07);
//   4. zero exact → prefix+suffix-only window fallback → unique candidate →
//      confident (low-certainty; renders as normal per Open Question #3);
//      zero candidates or N>1 → "orphan".
//
// REUSE-DO-NOT-FORK (Pattern 5): graphemeClusters + articleGraphemeIndex are
// imported from src/content/normalizeText.ts — the single canonical D-05
// coordinate. Any divergence shifts every anchor.
//
// Pure domain logic — no DOM, no React, no side effects. jsdom-safe to unit
// test with synthetic fixtures.
import {
  articleGraphemeIndex,
  graphemeClusters,
} from "../content/normalizeText";
import type { CanonicalArticle } from "../content/types";
import type {
  TextPositionSelector,
  TextQuoteSelector,
} from "../content/normalizeText";

/**
 * Find every grapheme-offset position where `needle` appears as a contiguous
 * run of clusters inside `haystack` (cluster array). Empty needle or a needle
 * longer than the haystack returns [].
 *
 * Returns grapheme-cluster ordinals (0-based) suitable for slicing back into
 * the cluster array.
 */
export function findAllOccurrences(
  haystack: readonly string[],
  needle: readonly string[],
): number[] {
  if (needle.length === 0 || haystack.length < needle.length) return [];
  const positions: number[] = [];
  const needleStr = needle.join("");
  // First-cluster guard (260819-tld): a position whose first cluster differs
  // from the needle's first cluster can never produce an equal joined string,
  // so skip it WITHOUT the slice+join comparison. On a ~100k-cluster article
  // this removes the per-position array-slice + string-join allocation; only
  // positions whose first cluster matches pay the join. Semantics identical.
  const firstCluster = needle[0]!;
  const limit = haystack.length - needle.length;
  for (let i = 0; i <= limit; i++) {
    if (haystack[i] !== firstCluster) continue;
    if (haystack.slice(i, i + needle.length).join("") === needleStr) {
      positions.push(i);
    }
  }
  return positions;
}

/**
 * Check whether the text surrounding a candidate position matches the stored
 * prefix/suffix context. Used to disambiguate N>1 exact matches (D5-02 step 3).
 *
 * The stored prefix (resp. suffix) is the text that immediately preceded
 * (resp. followed) the highlight at capture time. For a candidate at
 * `candidateStart`, the expected prefix is the `prefixClusters.length`-cluster
 * window ending at `candidateStart`; the expected suffix is the
 * `suffixClusters.length`-cluster window starting at `candidateEnd`.
 *
 * An empty prefix or suffix (stored because the capture was at the very
 * beginning/end of the text) is treated as a wildcard — it cannot help
 * disambiguate, so it never fails the check.
 */
export function matchesContext(
  clusters: readonly string[],
  candidateStart: number,
  exactLen: number,
  selector: TextQuoteSelector,
  lang: string,
): boolean {
  const prefix = selector.prefix;
  const suffix = selector.suffix;
  if (prefix.length > 0) {
    const prefixClusters = graphemeClusters(prefix, lang);
    const windowStart = Math.max(0, candidateStart - prefixClusters.length);
    // If the candidate is too close to the start to have the full stored prefix
    // before it, this candidate cannot match (the stored prefix was captured at
    // a position that had enough preceding text).
    if (candidateStart - windowStart < prefixClusters.length) return false;
    const window = clusters.slice(windowStart, candidateStart).join("");
    if (window !== prefix) return false;
  }
  if (suffix.length > 0) {
    const suffixClusters = graphemeClusters(suffix, lang);
    const candidateEnd = candidateStart + exactLen;
    const window = clusters
      .slice(candidateEnd, candidateEnd + suffixClusters.length)
      .join("");
    if (window !== suffix) return false;
  }
  return true;
}

/**
 * The zero-exact fallback window (D5-02 step 4). Search for passages where the
 * stored prefix precedes AND the stored suffix follows, even though the exact
 * text changed. Returns each candidate's [start, end) grapheme range.
 *
 * The search window after a prefix match is bounded so the fallback does not
 * scan the entire article for every prefix hit; the bound is `exactLen + suffix
 * length + a small slack`. Candidates whose suffix lies outside this window are
 * rejected (the passage drifted too far).
 *
 * `positionHint` (when provided) is a nearness hint: among multiple candidates,
 * the one whose start is closest to `positionHint.start` is preferred — but
 * only when there is a unique closest. A tie still yields "orphan" (ANNO-07 —
 * never silently re-attach when the text cannot be confidently relocated).
 */
function findPrefixSuffixCandidates(
  clusters: readonly string[],
  selector: TextQuoteSelector,
  lang: string,
  exactLen: number,
): TextPositionSelector[] {
  const prefixClusters = graphemeClusters(selector.prefix, lang);
  const suffixClusters = graphemeClusters(selector.suffix, lang);
  if (prefixClusters.length === 0 || suffixClusters.length === 0) return [];
  const prefixPositions = findAllOccurrences(clusters, prefixClusters);
  const candidates: TextPositionSelector[] = [];
  // Slack window: the exact text may have grown or shrunk; allow some
  // distance between the prefix end and the suffix start.
  const slack = Math.max(16, exactLen);
  for (const prefixStart of prefixPositions) {
    const candidateStart = prefixStart + prefixClusters.length;
    const maxSuffixStart = Math.min(
      clusters.length - suffixClusters.length,
      candidateStart + exactLen + slack,
    );
    for (let s = candidateStart; s <= maxSuffixStart; s++) {
      const window = clusters.slice(s, s + suffixClusters.length).join("");
      if (window === selector.suffix) {
        // Found a [candidateStart, s) passage bounded by prefix and suffix.
        // Skip zero-length passages (degenerate — suffix abuts prefix).
        if (s > candidateStart) {
          candidates.push({ start: candidateStart, end: s });
        }
        break; // one suffix match per prefix hit is enough
      }
    }
  }
  return candidates;
}

/**
 * Pick the candidate closest to the positionHint. Returns null when there is a
 * tie for closest (caller treats a tie as "cannot disambiguate").
 */
function pickClosestCandidate(
  candidates: readonly TextPositionSelector[],
  hint: TextPositionSelector,
): TextPositionSelector | null {
  let best: TextPositionSelector | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  let tied = false;
  for (const c of candidates) {
    const dist = Math.abs(c.start - hint.start);
    if (dist < bestDist) {
      best = c;
      bestDist = dist;
      tied = false;
    } else if (dist === bestDist) {
      tied = true;
    }
  }
  return tied ? null : best;
}

/**
 * Core re-anchoring routine over a precomputed normalized-text cluster array.
 * Exposed for unit testing (the cluster array is the load-bearing input; the
 * article-level wrapper below is a thin adapter). Implements D5-02.
 */
export function resolveQuoteSelectorInText(
  clusters: readonly string[],
  selector: TextQuoteSelector,
  lang: string,
  positionHint?: TextPositionSelector,
): TextPositionSelector | "ambiguous" | "orphan" {
  const exactClusters = graphemeClusters(selector.exact, lang);

  // Step 1: find all exact-substring occurrences.
  const exactMatches = findAllOccurrences(clusters, exactClusters);

  // Step 2: unique exact → confident. The positionHint is IGNORED — the text
  // IS the anchor; using a stale hint here would risk silent re-attachment
  // (ANNO-07).
  if (exactMatches.length === 1) {
    const start = exactMatches[0]!;
    return { start, end: start + exactClusters.length };
  }

  // Step 3: N>1 exact → disambiguate by prefix/suffix context. Still N>1 →
  // "ambiguous" (the reader is shown the explicit ambiguous state — never
  // silently re-attached, even with a positionHint).
  if (exactMatches.length > 1) {
    const disambiguated = exactMatches.filter((start) =>
      matchesContext(clusters, start, exactClusters.length, selector, lang),
    );
    if (disambiguated.length === 1) {
      const start = disambiguated[0]!;
      return { start, end: start + exactClusters.length };
    }
    return "ambiguous";
  }

  // Step 4: zero exact → prefix+suffix-only fallback. D5-02 step 4.
  const candidates = findPrefixSuffixCandidates(
    clusters,
    selector,
    lang,
    exactClusters.length,
  );
  if (candidates.length === 0) return "orphan";
  if (candidates.length === 1) return candidates[0]!;
  // N>1 candidates: use positionHint as a nearness tie-breaker. A unique
  // closest candidate → confident (low-certainty); a tie → orphan.
  if (positionHint) {
    const closest = pickClosestCandidate(candidates, positionHint);
    if (closest) return closest;
  }
  return "orphan";
}

/**
 * ANNO-07 tri-state re-anchor: re-resolve a stored TextQuoteSelector against
 * the current revision's normalized text. This thin wrapper is re-exported
 * from src/content/normalizeText.ts so the contract signature stays at the
 * Phase 1 stub site (05-PATTERNS.md §normalizeText.ts).
 *
 * Within a single revision, normalizeText(article) is byte-identical to the
 * text at capture time, so `exact` always matches at least once → the fast
 * confident path. The "ambiguous" and "orphan" branches are only genuinely
 * reachable cross-revision (an edited passage → orphan; a duplicated passage
 * → ambiguous).
 */
export function resolveQuoteSelector(
  article: CanonicalArticle,
  selector: TextQuoteSelector,
  positionHint?: TextPositionSelector,
): TextPositionSelector | "ambiguous" | "orphan" {
  // Served by the per-article index (260819-tld): ONE segmentation per
  // article object regardless of highlight count — ArticleView's eager batch
  // on open used to re-run normalizeText + graphemeClusters per highlight.
  const clusters = articleGraphemeIndex(article).clusters;
  return resolveQuoteSelectorInText(clusters, selector, article.lang, positionHint);
}
