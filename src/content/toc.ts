// src/content/toc.ts
// Pure table-of-contents derivation over the canonical article (Phase 18,
// ORNT-04 foundation — Plan 18-01).
//
// ONE derivation point for every Phase 18 orientation surface (TocPanel,
// aria-current mapping, EPUB chapters): the TOC structure derives from the
// canonical article at render time and is NEVER persisted (Pitfall 9 — no
// Dexie writes, no schema changes this phase).
//
// REUSE, DO NOT FORK: entry destinations read articleGraphemeIndex(article)
// .blockStartOffsets — the SAME D-05 grapheme substrate that findScrollTarget
// (restore), pageStartGlobalOffset (pagination), and resolveQuoteSelector
// (annotations) speak. The lookup below is the identical O(1) prefix-sum read
// pageStartGlobalOffset performs (anchor.ts L63-77, startGrapheme = 0). Any
// forked offset math here would desync TOC jumps from every other offset
// consumer and silently break ORNT-03 same-offset equivalence.
//
// Semantic honesty (ORNT-04 / D18-09..D18-11):
//   - D18-09: a synthetic "Top of article" entry comes first (offset 0) —
//     it restores the retired start-from-top affordance and targets the
//     article h1, which is why its blockIndex is the -1 sentinel.
//   - D18-10: skipped heading levels (h2→h5) deepen nesting depth WITHOUT
//     inventing intermediate entries — the jump itself is the structural
//     signal; the renderer derives ul nesting from depth transitions.
//   - D18-11: duplicate heading texts pass through AS-IS — no "(2 of 2)"
//     suffixes, no parent prefixes; list position disambiguates.
//   - h1 is excluded (ArticleView renders the title from provenance — one
//     h1 per page); a headingless article derives to exactly [Top]
//     (D18-13 foundation).
//
// Pure domain logic — no DOM, no React, no side effects. jsdom-safe to unit
// test with synthetic ArticleSchema.parse fixtures.

import type { CanonicalArticle } from "./types";
import { articleGraphemeIndex } from "./normalizeText";

/** A single derived TOC row. */
export interface TocEntry {
  /**
   * Heading text (content runs joined). Duplicates appear AS-IS — identical
   * headings are identical-text entries (D18-11).
   */
  text: string;
  /**
   * Article-global D-05 grapheme offset of the heading block's start — the
   * same currency as saved locations, highlights, and page anchors.
   */
  offset: number;
  /**
   * Top-level block index for [data-block-index] DOM resolution (the
   * destination-focus mechanism — no DOM ids are invented; schema carries
   * none). -1 ONLY on the synthetic Top entry: its destination is the
   * article h1, which is not a body block.
   */
  blockIndex: number;
  /** Source heading level, preserved verbatim — an h5 stays 5 (ORNT-04). */
  level: 2 | 3 | 4 | 5 | 6;
  /**
   * Nesting depth among entries (0 = shallowest). The Top entry is depth 0
   * and the first body entry is depth 0 among body entries; the renderer
   * derives ul nesting from depth transitions.
   */
  depth: number;
}

/** D18-09 copy for the synthetic first entry. */
const TOP_TEXT = "Top of article";

/**
 * Derive the TOC structure from a canonical article.
 *
 * Emits the synthetic Top entry (offset 0), then exactly one entry per
 * h2-h6 heading block in document order, each carrying its article-global
 * D-05 grapheme offset from the per-article index's blockStartOffsets
 * prefix sums.
 *
 * Depth rule: a heading that is a direct child of its nearest shallower
 * ancestor (h2→h3) nests one level deeper than that ancestor; a SKIPPED
 * level (h2→h5) deepens by one extra nesting level so the list structure
 * carries the jump — with NO invented intermediate entries (D18-10). The
 * entry's `level` field carries the true source level verbatim (ORNT-04).
 */
export function deriveToc(article: CanonicalArticle): TocEntry[] {
  const { blockStartOffsets } = articleGraphemeIndex(article);

  // D18-09: synthetic Top entry first. level 2 = shallowest body level so
  // the renderer treats it as a root sibling of the first body entry.
  const entries: TocEntry[] = [
    { text: TOP_TEXT, offset: 0, blockIndex: -1, level: 2, depth: 0 },
  ];

  // Open-ancestor stack of {level, depth}: popped when a heading of
  // shallower-or-equal level arrives (18-RESEARCH Pattern 3 computeDepth).
  const stack: { level: number; depth: number }[] = [];

  for (let blockIndex = 0; blockIndex < article.blocks.length; blockIndex++) {
    const block = article.blocks[blockIndex]!;
    // h1 is provenance-rendered by ArticleView — never a TOC entry.
    if (block.kind !== "heading" || block.level === 1) continue;

    while (
      stack.length > 0 &&
      stack[stack.length - 1]!.level >= block.level
    ) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    const depth =
      parent === undefined
        ? 0
        : // A skipped level (level > parent.level + 1) deepens by one EXTRA
          // nesting level — the jump is the signal, never an invented entry.
          parent.depth + (block.level > parent.level + 1 ? 2 : 1);

    entries.push({
      text: block.content.map((r) => r.text).join(""),
      // O(1) prefix-sum lookup — the same read pageStartGlobalOffset
      // performs (anchor.ts); never a manual grapheme accumulation loop.
      offset: blockStartOffsets[blockIndex]!,
      blockIndex,
      level: block.level,
      depth,
    });
    stack.push({ level: block.level, depth });
  }

  return entries;
}
