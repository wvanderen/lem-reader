// tests/unit/grapheme-index-cache.test.ts
// Equivalence proofs for the 260819-tld caching change (quick task). The OLD
// uncached loops are replicated test-locally as ORACLES — the pre-change
// semantics are the source of truth, and every cached hot path must return
// byte-identical offsets to them:
//
//   Task 1: articleGraphemeIndex — clusters / blockStartOffsets /
//           totalGraphemes equivalence + WeakMap article-identity keying.
//   Task 2: pageStartGlobalOffset / fragmentContainingOffset equivalence vs
//           the old accumulation walk; findAllOccurrences vs a naive scan.
//   Task 3: elementGraphemeLength — cache-hit path + article-identity
//           invalidation in findScrollTarget / computeTopVisibleOffset.
//
// Conventions mirror tests/unit/restoreLocation.test.ts (ArticleSchema.parse
// fixture builder, baseArticle with id/revision/lang/provenance) and
// tests/unit/pagination/progress-formula.test.ts (hand-built PageFragment
// fixtures).
import { describe, expect, it } from "vitest";
import { ArticleSchema } from "../../src/content/schema";
import type { CanonicalArticle } from "../../src/content/types";
import {
  BLOCK_SEPARATOR,
  articleGraphemeIndex,
  blockNormalizedText,
  deriveQuoteSelector,
  graphemeClusters,
  graphemeLength,
  normalizeText,
} from "../../src/content/normalizeText";
import {
  fragmentContainingOffset,
  pageStartGlobalOffset,
} from "../../src/pagination/anchor";
import { findAllOccurrences } from "../../src/annotations/resolution";
import type { PageFragment } from "../../src/pagination/types";

function parseArticle(raw: unknown): CanonicalArticle {
  return ArticleSchema.parse(raw);
}

const baseArticle = {
  id: "grapheme-index-test",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/grapheme-index",
    title: "Grapheme Index Test",
    retrievedAt: "2026-01-01T00:00:00Z",
    originalHtmlHash: "sha256:abcd1234",
  },
};

/**
 * Multi-block fixture: paragraphs + code block (verbatim newlines — the
 * CRITICAL PITFALL case: code source can itself contain newline characters,
 * so separator positions in the joined string are not block boundaries) +
 * footnote reference + footnote body.
 */
function multiBlockArticle(): CanonicalArticle {
  return parseArticle({
    ...baseArticle,
    blocks: [
      { kind: "heading", level: 2, content: [{ text: "A calm heading" }] },
      { kind: "paragraph", content: [{ text: "First paragraph with words." }] },
      { kind: "code-block", source: "const x = 1;\n  // indented" },
      { kind: "paragraph", content: [{ text: "Second paragraph, café résumé." }] },
      { kind: "footnote-reference", footnoteId: "fn-1", marker: "[1]" },
    ],
    footnotes: [{ id: "fn-1", content: [{ text: "Footnote body text." }] }],
  });
}

/**
 * OLD pageStartGlobalOffset accumulation replica (pre-change oracle): walk
 * blocks j < blockIndex accumulating per-block grapheme length + one
 * BLOCK_SEPARATOR, capping at article.blocks.length (the sentinel path).
 */
function oldAccumulatedOffset(
  article: CanonicalArticle,
  blockIndex: number,
): number {
  let offset = 0;
  for (let j = 0; j < blockIndex && j < article.blocks.length; j++) {
    offset +=
      graphemeClusters(blockNormalizedText(article.blocks[j]!), article.lang)
        .length +
      BLOCK_SEPARATOR.length;
  }
  return offset;
}

// ── Task 1: articleGraphemeIndex equivalence ────────────────────────────────

describe("articleGraphemeIndex clusters equal a fresh graphemeClusters(normalizeText()) run", () => {
  it("deep-equals the uncached segmentation for a multi-block article with code + footnotes", () => {
    const article = multiBlockArticle();
    const index = articleGraphemeIndex(article);
    expect(index.clusters).toEqual(
      graphemeClusters(normalizeText(article), article.lang),
    );
    expect(index.normalizedText).toBe(normalizeText(article));
  });
});

describe("articleGraphemeIndex blockStartOffsets equal the OLD accumulation loop", () => {
  it("every entry i (including the sentinel at i = blocks.length) matches the per-block + separator walk", () => {
    const article = multiBlockArticle();
    const index = articleGraphemeIndex(article);
    // + 1 for the sentinel entry; every i must match the old capped loop.
    expect(index.blockStartOffsets).toHaveLength(article.blocks.length + 1);
    for (let i = 0; i <= article.blocks.length; i++) {
      expect(index.blockStartOffsets[i]).toBe(oldAccumulatedOffset(article, i));
    }
  });

  it("perBlockLengths derive from per-block segmentation (never from splitting the joined text on the separator)", () => {
    const article = multiBlockArticle();
    const index = articleGraphemeIndex(article);
    // The code block's source contains a literal newline; splitting the joined
    // normalizedText on "\n" would mis-derive its length. Per-block
    // segmentation is the only correct source.
    for (let i = 0; i < article.blocks.length; i++) {
      expect(index.perBlockLengths[i]).toBe(
        graphemeClusters(
          blockNormalizedText(article.blocks[i]!),
          article.lang,
        ).length,
      );
    }
  });
});

describe("graphemeLength is served by the index and is stable across calls", () => {
  it("equals clusters.length (including the footnotes region) and repeats identically", () => {
    const article = multiBlockArticle();
    const index = articleGraphemeIndex(article);
    expect(graphemeLength(article)).toBe(index.clusters.length);
    expect(graphemeLength(article)).toBe(graphemeLength(article));
    // totalGraphemes includes the footnotes region, so it exceeds the body
    // span (sentinel entry) by the footnote text + its leading separator.
    expect(index.totalGraphemes).toBeGreaterThan(
      index.blockStartOffsets[article.blocks.length]!,
    );
  });

  it("an article with no blocks and no footnotes yields totalGraphemes 0 and blockStartOffsets [0]", () => {
    // ArticleSchema requires blocks.min(1), so the truly-empty shape is
    // asserted through the CanonicalArticle TYPE (defensive edge the plan
    // pins explicitly); a schema-valid empty-TEXT article is covered below.
    const empty = {
      ...baseArticle,
      blocks: [],
      footnotes: [],
    } as unknown as CanonicalArticle;
    const index = articleGraphemeIndex(empty);
    expect(index.totalGraphemes).toBe(0);
    expect(index.blockStartOffsets).toEqual([0]);
    expect(graphemeLength(empty)).toBe(0);
  });

  it("a schema-valid article whose blocks normalize to empty text yields totalGraphemes 0", () => {
    // A code-block with empty source is schema-valid and normalizes to "".
    const article = parseArticle({
      ...baseArticle,
      blocks: [{ kind: "code-block", source: "" }],
    });
    expect(graphemeLength(article)).toBe(0);
    const index = articleGraphemeIndex(article);
    expect(index.blockStartOffsets).toEqual([0, BLOCK_SEPARATOR.length]);
  });
});

describe("deriveQuoteSelector is identical on first (build) and second (cache-hit) calls", () => {
  it("returns the same selector twice, equal to direct cluster-array slicing", () => {
    const article = multiBlockArticle();
    const position = { start: 5, end: 12 };
    const first = deriveQuoteSelector(article, position);
    const second = deriveQuoteSelector(article, position);
    expect(second).toEqual(first);
    // Direct slice of the index's cluster array is the oracle.
    const clusters = articleGraphemeIndex(article).clusters;
    expect(first.exact).toBe(clusters.slice(5, 12).join(""));
    expect(first.prefix).toBe(clusters.slice(Math.max(0, 5 - 32), 5).join(""));
    expect(first.suffix).toBe(
      clusters.slice(12, Math.min(clusters.length, 12 + 32)).join(""),
    );
  });
});

describe("WeakMap identity keying — each parsed article object gets its own index", () => {
  it("two ArticleSchema.parse calls of the same raw article are distinct objects with equal indexes", () => {
    const raw = {
      ...baseArticle,
      blocks: [{ kind: "paragraph", content: [{ text: "Alpha body text." }] }],
    };
    const a = parseArticle(raw);
    const b = parseArticle(raw);
    expect(a).not.toBe(b);
    expect(articleGraphemeIndex(b).normalizedText).toBe(
      articleGraphemeIndex(a).normalizedText,
    );
  });

  it("a different-content article never reuses another article's entry (no stale cross-article cache)", () => {
    const alpha = parseArticle({
      ...baseArticle,
      blocks: [{ kind: "paragraph", content: [{ text: "Alpha body text." }] }],
    });
    const beta = parseArticle({
      ...baseArticle,
      id: "grapheme-index-test-beta",
      blocks: [{ kind: "paragraph", content: [{ text: "Beta body text, longer." }] }],
    });
    // Build alpha's index first so a cross-article bug would have a victim.
    expect(articleGraphemeIndex(alpha).normalizedText).toBe("Alpha body text.");
    expect(articleGraphemeIndex(beta).normalizedText).toBe(
      "Beta body text, longer.",
    );
  });
});

// ── Task 2: O(1) page anchors + findAllOccurrences fast path ─────────────────

/** Hand-built PageFragment fixture (progress-formula.test.ts conventions). */
function fragment(
  pageIndex: number,
  blocks: Array<{ blockIndex: number; startGrapheme: number; endGrapheme: number }>,
): PageFragment {
  return { schemaVersion: 1, pageIndex, blocks };
}

describe("pageStartGlobalOffset returns byte-identical offsets to the OLD accumulation loop", () => {
  const article = multiBlockArticle();

  it("fragment starting at block 0 (the O(1) base case)", () => {
    const frag = fragment(0, [{ blockIndex: 0, startGrapheme: 0, endGrapheme: 3 }]);
    expect(pageStartGlobalOffset(article, frag)).toBe(
      oldAccumulatedOffset(article, 0),
    );
  });

  it("fragment starting mid-way through a middle block (intra-block startGrapheme added)", () => {
    const frag = fragment(2, [{ blockIndex: 2, startGrapheme: 3, endGrapheme: 8 }]);
    expect(pageStartGlobalOffset(article, frag)).toBe(
      oldAccumulatedOffset(article, 2) + 3,
    );
  });

  it("fragment starting at the last block", () => {
    const last = article.blocks.length - 1;
    const frag = fragment(3, [
      { blockIndex: last, startGrapheme: 0, endGrapheme: 2 },
    ]);
    expect(pageStartGlobalOffset(article, frag)).toBe(
      oldAccumulatedOffset(article, last),
    );
  });

  it("out-of-range blockIndex falls to the sentinel entry (capped accumulation, old loop replica)", () => {
    const frag = fragment(4, [{ blockIndex: 99, startGrapheme: 0, endGrapheme: 2 }]);
    expect(pageStartGlobalOffset(article, frag)).toBe(
      oldAccumulatedOffset(article, 99),
    );
  });

  it("out-of-range blockIndex with an intra-block offset keeps the +startGrapheme term", () => {
    const frag = fragment(4, [{ blockIndex: 99, startGrapheme: 5, endGrapheme: 9 }]);
    expect(pageStartGlobalOffset(article, frag)).toBe(
      oldAccumulatedOffset(article, 99) + 5,
    );
  });

  it("empty fragment returns 0 (defensive)", () => {
    expect(pageStartGlobalOffset(article, fragment(0, []))).toBe(0);
  });

  it("every block start and intra-block offset round-trips the oracle (exhaustive over blocks)", () => {
    for (let i = 0; i <= article.blocks.length; i++) {
      const frag = fragment(0, [{ blockIndex: i, startGrapheme: 2, endGrapheme: 4 }]);
      expect(pageStartGlobalOffset(article, frag)).toBe(
        oldAccumulatedOffset(article, i) + 2,
      );
    }
  });
});

describe("fragmentContainingOffset returns the same page index as before (scan + clamp semantics)", () => {
  const article = multiBlockArticle();
  // One fragment per body block, startGrapheme 0 — page i's article-global
  // start is exactly oldAccumulatedOffset(article, i) (the oracle).
  const pages: PageFragment[] = article.blocks.map((block, i) => {
    const len = graphemeClusters(
      blockNormalizedText(block),
      article.lang,
    ).length;
    return fragment(i, [{ blockIndex: i, startGrapheme: 0, endGrapheme: len }]);
  });
  const starts = article.blocks.map((_, i) => oldAccumulatedOffset(article, i));

  it("offset 0 → page 0", () => {
    expect(fragmentContainingOffset(pages, 0, article)).toBe(0);
  });

  it("an offset exactly at each page start → that page", () => {
    starts.forEach((start, i) => {
      expect(fragmentContainingOffset(pages, start, article)).toBe(i);
    });
  });

  it("a mid-page offset → the page containing it", () => {
    starts.forEach((start, i) => {
      expect(fragmentContainingOffset(pages, start + 1, article)).toBe(i);
    });
  });

  it("an offset overshooting the last page clamps to the last index", () => {
    const overshoot = starts[starts.length - 1]! + 100_000;
    expect(fragmentContainingOffset(pages, overshoot, article)).toBe(
      pages.length - 1,
    );
  });

  it("empty pages array returns 0 (defensive)", () => {
    expect(fragmentContainingOffset([], 100, article)).toBe(0);
  });
});

describe("findAllOccurrences matches a naive reference implementation", () => {
  /** Naive cluster-by-cluster comparison — the pre-fast-path oracle. */
  function naiveOccurrences(
    haystack: readonly string[],
    needle: readonly string[],
  ): number[] {
    const positions: number[] = [];
    for (let i = 0; i + needle.length <= haystack.length; i++) {
      let match = true;
      for (let j = 0; j < needle.length; j++) {
        if (haystack[i + j] !== needle[j]) {
          match = false;
          break;
        }
      }
      if (match) positions.push(i);
    }
    return positions;
  }

  it("repeated first clusters (haystack a,b,a,b / needle a,b) finds every occurrence", () => {
    expect(findAllOccurrences(["a", "b", "a", "b"], ["a", "b"])).toEqual([0, 2]);
    expect(
      findAllOccurrences(["a", "b", "a", "b"], ["a", "b"]),
    ).toEqual(naiveOccurrences(["a", "b", "a", "b"], ["a", "b"]));
  });

  it("a needle at the last valid position is found", () => {
    expect(findAllOccurrences(["a", "b", "c"], ["b", "c"])).toEqual([1]);
  });

  it("an empty needle returns [] (guard unchanged)", () => {
    expect(findAllOccurrences(["a", "b"], [])).toEqual([]);
  });

  it("a needle longer than the haystack returns [] (guard unchanged)", () => {
    expect(findAllOccurrences(["a"], ["a", "b"])).toEqual([]);
  });

  it("real-article clusters with a sampled needle agree with the naive scan", () => {
    const clusters = articleGraphemeIndex(multiBlockArticle()).clusters;
    const needle = clusters.slice(10, 18);
    expect(findAllOccurrences(clusters, needle)).toEqual(
      naiveOccurrences(clusters, needle),
    );
  });
});
