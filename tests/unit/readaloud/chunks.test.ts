// tests/unit/readaloud/chunks.test.ts
// Issue #40 — the sentence-chunking truth table (src/readaloud/chunks.ts).
// The chunks are the bridge between Web Speech utterances and the D-05
// canonical grapheme substrate (spike 0009 F2/F5), so the tests pin:
//   1. Coverage — chunks partition the article's normalized text; every
//      canonical offset is inside exactly one chunk range (modulo skipped
//      whitespace-only segments).
//   2. Sentence integrity — a normal paragraph's sentences stay whole
//      (Intl.Segmenter sentence granularity, article lang).
//   3. The budget — an un-punctuated over-long segment splits into pieces
//      ≤ MAX_CHUNK_GRAPHEMES at whitespace clusters (words stay whole; hard
//      cut only in a whitespace-free window).
//   4. The F5 map — utf16ToGrapheme translates UTF-16 code-unit indexes
//      (charIndex currency) to chunk grapheme ordinals, including astral
//      (non-BMP) clusters where the two currencies diverge.
import { describe, expect, it } from "vitest";
import { ArticleSchema } from "../../../src/content/schema";
import type { CanonicalArticle } from "../../../src/content/types";
import {
  MAX_CHUNK_GRAPHEMES,
  chunkArticleForSpeech,
} from "../../../src/readaloud/chunks";

// Blocks are typed at the PARSE-INPUT boundary (marks hydrates via .default)
// — the atomic-import sampleArticle precedent.
type ArticleInput = import("zod").input<typeof ArticleSchema>;

const baseArticle = {
  id: "readaloud-chunks-test",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/readaloud-chunks",
    title: "Read Aloud Chunks Test",
    retrievedAt: "2026-01-01T00:00:00Z",
    originalHtmlHash: "sha256:deadbeef",
  },
};

function makeArticle(blocks: ArticleInput["blocks"]): CanonicalArticle {
  return ArticleSchema.parse({ ...baseArticle, blocks });
}

describe("chunkArticleForSpeech — coverage + sentence integrity", () => {
  it("splits a two-sentence paragraph at the sentence boundary", () => {
    const article = makeArticle([
      {
        kind: "paragraph",
        content: [{ text: "First sentence here. Second sentence follows." }],
      },
    ]);
    const chunks = chunkArticleForSpeech(article);
    expect(chunks.length).toBe(2);
    expect(chunks[0]!.text).toBe("First sentence here.");
    expect(chunks[1]!.text).toBe("Second sentence follows.");
    // Ranges are ordered in canonical space; the trimmed separator space
    // between the sentences belongs to no chunk.
    expect(chunks[0]!.startGrapheme).toBe(0);
    expect(chunks[1]!.startGrapheme).toBeGreaterThanOrEqual(chunks[0]!.endGrapheme);
    expect(chunks[1]!.startGrapheme).toBeLessThanOrEqual(chunks[0]!.endGrapheme + 1);
    expect(chunks[1]!.endGrapheme).toBeGreaterThan(chunks[1]!.startGrapheme);
  });

  it("covers the whole article — every chunk range joins back to the normalized text", async () => {
    const { normalizeText } = await import("../../../src/content/normalizeText");
    const article = makeArticle([
      { kind: "heading", level: 2, content: [{ text: "A heading" }] },
      {
        kind: "paragraph",
        content: [{ text: "One sentence. Another one! A question?" }],
      },
      {
        kind: "paragraph",
        content: [{ text: "Closing thoughts arrive now." }],
      },
    ]);
    const chunks = chunkArticleForSpeech(article);
    expect(chunks.length).toBeGreaterThan(1);
    // Canonical ranges are monotonic and the spoken text of each chunk is
    // exactly the normalized text's cluster range it claims.
    const { graphemeClusters } = await import("../../../src/content/normalizeText");
    const clusters = graphemeClusters(normalizeText(article), article.lang);
    for (const chunk of chunks) {
      expect(chunk.endGrapheme).toBeGreaterThan(chunk.startGrapheme);
      expect(clusters.slice(chunk.startGrapheme, chunk.endGrapheme).join("")).toBe(
        chunk.text,
      );
    }
    // Whitespace-only segments are skipped — nothing empty is spoken.
    for (const chunk of chunks) {
      expect(chunk.text.trim().length).toBeGreaterThan(0);
    }
  });

  it("maps a play offset inside the second sentence to the second chunk", () => {
    const article = makeArticle([
      {
        kind: "paragraph",
        content: [{ text: "First sentence here. Second sentence follows." }],
      },
    ]);
    const chunks = chunkArticleForSpeech(article);
    const midFirst = 3; // inside chunk 0
    const midSecond = chunks[0]!.endGrapheme + 2; // inside chunk 1
    expect(chunks.findIndex((c) => c.endGrapheme > midFirst)).toBe(0);
    expect(chunks.findIndex((c) => c.endGrapheme > midSecond)).toBe(1);
  });
});

describe("chunkArticleForSpeech — the MAX_CHUNK_GRAPHEMES budget", () => {
  it("splits an un-punctuated over-long segment at whitespace (words stay whole)", () => {
    const words = Array.from({ length: 120 }, (_, i) => `word${i}`).join(" ");
    // 120 words × ~7 graphemes ≈ 840 graphemes — well over the budget.
    const article = makeArticle([
      { kind: "paragraph", content: [{ text: words }] },
    ]);
    const chunks = chunkArticleForSpeech(article);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.endGrapheme - chunk.startGrapheme).toBeLessThanOrEqual(
        MAX_CHUNK_GRAPHEMES,
      );
      // Words stay whole: after the range trim every piece is whole
      // `wordN` tokens joined by single spaces — never a partial word.
      expect(chunk.text.startsWith("word")).toBe(true);
      expect(/^(word\d+)( (word\d+))*$/.test(chunk.text)).toBe(true);
    }
    // Ordering survives splitting (the dropped separator whitespace leaves
    // a 1-cluster gap at word-boundary cuts).
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]!.startGrapheme).toBeGreaterThanOrEqual(
        chunks[i - 1]!.endGrapheme,
      );
      expect(chunks[i]!.startGrapheme).toBeLessThanOrEqual(
        chunks[i - 1]!.endGrapheme + 1,
      );
    }
  });

  it("hard-cuts a whitespace-free window (verbatim code) without losing ground", () => {
    const source = "x".repeat(MAX_CHUNK_GRAPHEMES * 2 + 10);
    const article = makeArticle([
      { kind: "code-block", language: "txt", source },
    ]);
    const chunks = chunkArticleForSpeech(article);
    expect(chunks.length).toBe(3); // 250 + 250 + 10
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]!.startGrapheme).toBe(chunks[i - 1]!.endGrapheme);
    }
    expect(
      chunks.reduce((sum, c) => sum + (c.endGrapheme - c.startGrapheme), 0),
    ).toBe(source.length);
  });
});

describe("chunkArticleForSpeech — the F5 UTF-16 → grapheme map", () => {
  it("maps ASCII (1 unit per cluster) as the identity, with the past-the-end entry", () => {
    const article = makeArticle([
      { kind: "paragraph", content: [{ text: "Hello there." }] },
    ]);
    const chunks = chunkArticleForSpeech(article);
    const chunk = chunks[0]!;
    expect(chunk.utf16ToGrapheme.length).toBe(chunk.text.length + 1);
    for (let i = 0; i < chunk.text.length; i++) {
      expect(chunk.utf16ToGrapheme[i]).toBe(i);
    }
    expect(chunk.utf16ToGrapheme[chunk.text.length]).toBe(
      chunk.endGrapheme - chunk.startGrapheme,
    );
  });

  it("keeps astral clusters (2 UTF-16 units, 1 grapheme) aligned", () => {
    // "a😀b." — 5 UTF-16 code units, 4 grapheme clusters.
    const text = "a\u{1F600}b.";
    const article = makeArticle([
      { kind: "paragraph", content: [{ text }] },
    ]);
    const chunks = chunkArticleForSpeech(article);
    expect(chunks.length).toBe(1);
    const chunk = chunks[0]!;
    expect(chunk.text.length).toBe(5); // UTF-16 units
    expect(chunk.endGrapheme - chunk.startGrapheme).toBe(4); // a 😀 b .
    // charIndex 0 → grapheme 0; charIndex 1 and 2 (the surrogate pair of
    // 😀) → still grapheme 1; charIndex 3 (b) → 2; charIndex 4 (.) → 3;
    // past-the-end → 4.
    expect(chunk.utf16ToGrapheme[0]).toBe(0);
    expect(chunk.utf16ToGrapheme[1]).toBe(1);
    expect(chunk.utf16ToGrapheme[2]).toBe(1);
    expect(chunk.utf16ToGrapheme[3]).toBe(2);
    expect(chunk.utf16ToGrapheme[4]).toBe(3);
    expect(chunk.utf16ToGrapheme[5]).toBe(4);
  });
});

describe("chunkArticleForSpeech — edges", () => {
  it("returns [] for a whitespace-free article body", () => {
    // An article must have ≥1 block; a figure with no alt/caption
    // contributes nothing — the body separator is whitespace-only.
    const article = makeArticle([
      { kind: "figure", alt: "", caption: [] },
    ]);
    expect(chunkArticleForSpeech(article)).toEqual([]);
  });

  it("skips whitespace-only segments but keeps surrounding sentences", () => {
    const article = makeArticle([
      { kind: "paragraph", content: [{ text: "Before the gap." }] },
      { kind: "paragraph", content: [{ text: "After the gap." }] },
    ]);
    const chunks = chunkArticleForSpeech(article);
    for (const chunk of chunks) {
      expect(chunk.text.trim().length).toBeGreaterThan(0);
      expect(chunk.text).not.toContain("\n");
    }
  });
});
