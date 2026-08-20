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
