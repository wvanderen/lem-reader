import { describe, expect, it } from "vitest";
import { ArticleSchema } from "../../src/content/schema";
import {
  deriveQuoteSelector,
  graphemeClusters,
  normalizeText,
} from "../../src/content/normalizeText";
import type { CanonicalArticle } from "../../src/content/types";

/**
 * TextQuoteSelector derivation (D-05). Phase 1 ships types + derive() only;
 * resolveQuoteSelector() is Phase 5 scope.
 */

function parseArticle(raw: unknown): CanonicalArticle {
  return ArticleSchema.parse(raw);
}

const baseArticle = {
  id: "selector-test",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/sel",
    title: "Selector Test",
    retrievedAt: "2026-01-01T00:00:00Z",
    originalHtmlHash: "sha256:cafecafe",
  },
};

// An article whose normalized text starts with "café" followed by enough text
// to exercise the context radius.
function caféArticle(): CanonicalArticle {
  return parseArticle({
    ...baseArticle,
    blocks: [
      {
        kind: "paragraph",
        content: [
          {
            text: "café " + "word ".repeat(40).trim(),
          },
        ],
      },
    ],
  });
}

describe("deriveQuoteSelector exact round-trips through grapheme array", () => {
  it("exact matches the grapheme slice for {start:0, end:4} on a café article", () => {
    const article = caféArticle();
    const sel = deriveQuoteSelector(article, { start: 0, end: 4 });
    expect(sel.exact).toBe("café");
    expect(sel.prefix).toBe("");
  });

  it("exact equals graphemeClusters(normalizeText).slice(start,end).join('')", () => {
    const article = caféArticle();
    const position = { start: 2, end: 9 };
    const clusters = graphemeClusters(normalizeText(article), article.lang);
    const expected = clusters.slice(2, 9).join("");
    expect(deriveQuoteSelector(article, position).exact).toBe(expected);
  });
});

describe("context radius (default 32 grapheme clusters)", () => {
  it("prefix and suffix each have at most 32 grapheme clusters by default", () => {
    const article = caféArticle();
    const clusters = graphemeClusters(normalizeText(article), article.lang);
    const mid = { start: 50, end: 55 };
    const sel = deriveQuoteSelector(article, mid);
    expect(graphemeClusters(sel.prefix, "en").length).toBeLessThanOrEqual(32);
    expect(graphemeClusters(sel.suffix, "en").length).toBeLessThanOrEqual(32);
    // sanity: exact is the 5-cluster slice
    expect(sel.exact).toBe(clusters.slice(50, 55).join(""));
  });

  it("honors a custom contextRadius", () => {
    const article = caféArticle();
    const sel = deriveQuoteSelector(article, { start: 10, end: 12 }, 5);
    expect(graphemeClusters(sel.prefix, "en").length).toBeLessThanOrEqual(5);
    expect(graphemeClusters(sel.suffix, "en").length).toBeLessThanOrEqual(5);
  });
});

describe("edge positions", () => {
  it("start=0 yields an empty prefix", () => {
    const article = caféArticle();
    const sel = deriveQuoteSelector(article, { start: 0, end: 3 });
    expect(sel.prefix).toBe("");
  });

  it("end=graphemeLength yields an empty suffix", () => {
    const article = caféArticle();
    const clusters = graphemeClusters(normalizeText(article), article.lang);
    const end = clusters.length;
    const sel = deriveQuoteSelector(article, { start: end - 3, end });
    expect(sel.suffix).toBe("");
  });
});
