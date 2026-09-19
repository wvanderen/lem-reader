// tests/unit/readaloud/chunks.test.ts
// Issue #40 — the sentence-chunking truth table (src/readaloud/chunks.ts),
// extended by issue #43 with the spoken-channel rules (O7). The chunks are
// the bridge between Web Speech utterances and the D-05 canonical grapheme
// substrate (spike 0009 F2/F5), so the tests pin:
//   1. Coverage — chunks partition the article's SPOKEN channel; every chunk
//      range is exact against the normalized cluster array (skipped blocks
//      simply belong to no chunk).
//   2. Sentence integrity — a normal paragraph's sentences stay whole
//      (Intl.Segmenter sentence granularity, article lang).
//   3. The budget — an un-punctuated over-long segment splits into pieces
//      ≤ MAX_CHUNK_GRAPHEMES at whitespace clusters (words stay whole).
//   4. The F5 map — utf16ToGrapheme translates UTF-16 code-unit indexes
//      (charIndex currency) to chunk grapheme ordinals, including astral
//      (non-BMP) clusters where the two currencies diverge.
//   5. The spoken channel (issue #43, O7) — link TEXT is spoken (never the
//      href); code-block and unsupported blocks are skipped silently (the
//      marker hops the gap); a figure is skipped but its caption reads;
//      footnote bodies read at document end; document order preserved.
//   6. The skip units — sentenceIndex/paragraphIndex count only speakable
//      units, so the #43 skip controls land on the next speakable text.
import { describe, expect, it } from "vitest";
import { ArticleSchema } from "../../../src/content/schema";
import type { CanonicalArticle } from "../../../src/content/types";
import {
  MAX_CHUNK_GRAPHEMES,
  chunkArticleForSpeech,
} from "../../../src/readaloud/chunks";
import { normalizeText, graphemeClusters } from "../../../src/content/normalizeText";

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

  it("covers the whole SPOKEN channel — every chunk range joins back to the normalized text", async () => {
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

  it("hard-cuts a whitespace-free run-on segment without losing ground", () => {
    // An unbroken (whitespace-free) over-budget span — the hard-cut path.
    const runOn = "x".repeat(MAX_CHUNK_GRAPHEMES * 2 + 10);
    const article = makeArticle([
      { kind: "paragraph", content: [{ text: runOn }] },
    ]);
    const chunks = chunkArticleForSpeech(article);
    expect(chunks.length).toBe(3); // 250 + 250 + 10
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]!.startGrapheme).toBe(chunks[i - 1]!.endGrapheme);
    }
    expect(
      chunks.reduce((sum, c) => sum + (c.endGrapheme - c.startGrapheme), 0),
    ).toBe(runOn.length);
  });
});

// ── Issue #43 (O7) — the spoken channel follows the document honestly ────────

describe("chunkArticleForSpeech — the spoken channel rules (issue #43, O7)", () => {
  it("skips code-block sources silently — they belong to no chunk", () => {
    const source = "const one = 1;\nconst two = 2;\nreturn one + two;";
    const article = makeArticle([
      { kind: "paragraph", content: [{ text: "Before the code." }] },
      { kind: "code-block", language: "js", source },
      { kind: "paragraph", content: [{ text: "After the code." }] },
    ]);
    const chunks = chunkArticleForSpeech(article);
    expect(chunks.map((c) => c.text)).toEqual([
      "Before the code.",
      "After the code.",
    ]);
    // The skipped range belongs to no chunk, but the surrounding ranges stay
    // EXACT against the normalized cluster array — the marker can hop the
    // gap without losing ground.
    const text = normalizeText(article);
    const chunksText = chunks
      .map((c) => text.slice(c.startGrapheme, c.endGrapheme))
      .join("");
    expect(chunksText).not.toContain("const one");
  });

  it("skips unsupported-block disclosures silently", () => {
    const article = makeArticle([
      { kind: "paragraph", content: [{ text: "Readable prose." }] },
      {
        kind: "unsupported",
        originalKind: "table",
        plainDescription: "A data table the reader can't use.",
      },
      { kind: "paragraph", content: [{ text: "More readable prose." }] },
    ]);
    const chunks = chunkArticleForSpeech(article);
    expect(chunks.map((c) => c.text)).toEqual([
      "Readable prose.",
      "More readable prose.",
    ]);
  });

  it("a figure is skipped but its caption reads (alt stays silent)", () => {
    const article = makeArticle([
      { kind: "paragraph", content: [{ text: "Intro sentence." }] },
      {
        kind: "figure",
        alt: "Adult male bee hummingbird perched on a branch",
        caption: [{ text: "The bee hummingbird, photographed in Cuba." }],
      },
      { kind: "paragraph", content: [{ text: "Outro sentence." }] },
    ]);
    const chunks = chunkArticleForSpeech(article);
    const spoken = chunks.map((c) => c.text);
    expect(spoken).toEqual([
      "Intro sentence.",
      "The bee hummingbird, photographed in Cuba.",
      "Outro sentence.",
    ]);
  });

  it("a figure with no caption contributes nothing to the spoken channel", () => {
    const article = makeArticle([
      {
        kind: "figure",
        alt: "A chart the alt text describes",
        caption: [],
      },
      { kind: "paragraph", content: [{ text: "After the figure." }] },
    ]);
    expect(chunkArticleForSpeech(article).map((c) => c.text)).toEqual([
      "After the figure.",
    ]);
  });

  it("a link's TEXT is spoken — never its href", () => {
    const article = makeArticle([
      {
        kind: "paragraph",
        content: [
          { text: "Read the", marks: [] },
          {
            text: "full specification",
            marks: [{ type: "link", href: "https://example.com/spec/draft-42" }],
          },
          { text: "before commenting.", marks: [] },
        ],
      },
    ]);
    const chunks = chunkArticleForSpeech(article);
    const spoken = chunks.map((c) => c.text).join(" ");
    expect(spoken).toContain("full specification");
    expect(spoken).not.toContain("https://");
    expect(spoken).not.toContain("example.com");
  });

  it("footnote bodies read at document end, after every body block", () => {
    const withFootnotes = ArticleSchema.parse({
      ...baseArticle,
      blocks: [
        {
          kind: "paragraph",
          content: [{ text: "A claim needs a source. Closing thought here." }],
        },
        { kind: "footnote-reference", footnoteId: "fn-1", marker: "[1]" },
      ],
      footnotes: [{ id: "fn-1", content: [{ text: "Smith 2020, page 12." }] }],
    }) as CanonicalArticle;
    const chunks = chunkArticleForSpeech(withFootnotes);
    const spoken = chunks.map((c) => c.text);
    // The footnote body's chunk comes after every body-block chunk.
    expect(spoken[spoken.length - 1]).toBe("Smith 2020, page 12.");
  });

  it("preserves document order across mixed skipped and spoken blocks", () => {
    const article = makeArticle([
      { kind: "heading", level: 2, content: [{ text: "The header" }] },
      { kind: "code-block", language: "txt", source: "skipped entirely" },
      { kind: "paragraph", content: [{ text: "First prose." }] },
      {
        kind: "unsupported",
        originalKind: "embed",
        plainDescription: "An embed the reader can't use.",
      },
      { kind: "paragraph", content: [{ text: "Second prose." }] },
    ]);
    const chunks = chunkArticleForSpeech(article);
    expect(chunks.map((c) => c.text)).toEqual([
      "The header",
      "First prose.",
      "Second prose.",
    ]);
    // Canonical ranges stay strictly ordered (document order preserved).
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]!.startGrapheme).toBeGreaterThan(chunks[i - 1]!.startGrapheme);
    }
  });

  it("the marker can hop a skipped block: no chunk claims the skipped range, neighbors stay exact", () => {
    const article = makeArticle([
      { kind: "paragraph", content: [{ text: "Before." }] },
      { kind: "code-block", language: "txt", source: "SECRET CODE SOURCE" },
      { kind: "paragraph", content: [{ text: "After." }] },
    ]);
    const chunks = chunkArticleForSpeech(article);
    const clusters = graphemeClusters(normalizeText(article), article.lang);
    const before = chunks[0]!;
    const after = chunks[1]!;
    // The skipped span (between the two speakable ranges) belongs to no chunk.
    const skippedText = clusters
      .slice(before.endGrapheme, after.startGrapheme)
      .join("");
    expect(skippedText).toContain("SECRET CODE SOURCE");
    // Both neighbors are exact against the substrate.
    expect(clusters.slice(before.startGrapheme, before.endGrapheme).join("")).toBe(before.text);
    expect(clusters.slice(after.startGrapheme, after.endGrapheme).join("")).toBe(after.text);
  });
});

// ── Issue #43 — the skip units (sentence/paragraph ordinals) ─────────────────

describe("chunkArticleForSpeech — sentenceIndex + paragraphIndex (the skip units)", () => {
  it("sentences count across the whole stream; paragraph units count speakable blocks", () => {
    const article = makeArticle([
      { kind: "heading", level: 2, content: [{ text: "A title" }] },
      {
        kind: "paragraph",
        content: [{ text: "One. Two. Three." }],
      },
      { kind: "code-block", language: "txt", source: "no unit for code" },
      { kind: "paragraph", content: [{ text: "Four." }] },
    ]);
    const chunks = chunkArticleForSpeech(article);
    expect(chunks.map((c) => c.text)).toEqual([
      "A title",
      "One.",
      "Two.",
      "Three.",
      "Four.",
    ]);
    // sentenceIndex: a running ordinal across the speakable stream.
    expect(chunks.map((c) => c.units.sentenceIndex)).toEqual([0, 1, 2, 3, 4]);
    // paragraphIndex: heading = unit 0; the 3-sentence paragraph = unit 1;
    // the code block owns NO unit; the final paragraph = unit 2 — so a
    // paragraph skip from unit 1 lands on unit 2 (the marker hops the code).
    expect(chunks.map((c) => c.units.paragraphIndex)).toEqual([0, 1, 1, 1, 2]);
  });

  it("all pieces of an over-budget split sentence share one sentenceIndex", () => {
    const words = Array.from({ length: 120 }, (_, i) => `word${i}`).join(" ");
    const article = makeArticle([
      { kind: "paragraph", content: [{ text: words }] },
    ]);
    const chunks = chunkArticleForSpeech(article);
    expect(chunks.length).toBeGreaterThan(1);
    expect(new Set(chunks.map((c) => c.units.sentenceIndex)).size).toBe(1);
    expect(new Set(chunks.map((c) => c.units.paragraphIndex)).size).toBe(1);
  });

  it("footnote bodies form their own paragraph units after the body blocks", () => {
    const withFootnotes = ArticleSchema.parse({
      ...baseArticle,
      blocks: [
        {
          kind: "paragraph",
          content: [{ text: "Body text here." }],
        },
      ],
      footnotes: [
        { id: "fn-1", content: [{ text: "First source." }] },
        { id: "fn-2", content: [{ text: "Second source." }] },
      ],
    }) as CanonicalArticle;
    const chunks = chunkArticleForSpeech(withFootnotes);
    expect(chunks.map((c) => c.text)).toEqual([
      "Body text here.",
      "First source.",
      "Second source.",
    ]);
    expect(chunks.map((c) => c.units.paragraphIndex)).toEqual([0, 1, 2]);
    expect(chunks[1]!.startGrapheme).toBeGreaterThan(chunks[0]!.endGrapheme);
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
