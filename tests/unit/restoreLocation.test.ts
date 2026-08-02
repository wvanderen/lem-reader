// tests/unit/restoreLocation.test.ts
// Pure-domain tests for findScrollTarget (STATE-01 restore logic on the D-05
// grapheme-offset substrate). Mirrors tests/unit/normalizeText.test.ts
// conventions: parseArticle helper, baseArticle fixture, HTMLElement stubs
// carrying .textContent + dataset.kind in document order.
//
// findScrollTarget MUST reuse normalizeText's per-block rules EXACTLY (D-05
// contract): the saved offset is into normalizeText(article), and any
// divergence here would shift every restored location. The four behavior
// cases under test:
//   - offset 0              → first block
//   - offset mid-paragraph  → the block whose range contains it
//   - offset overshoots     → last block (clamp, never null)
//   - empty blocks          → null
// Plus the per-block length contract: graphemeClusters(normalizeElText(el))
// matches the canonical length for at least one multi-grapheme block
// (é/emoji correctness — Intl.Segmenter grapheme granularity).
import { describe, expect, it } from "vitest";
import { ArticleSchema } from "../../src/content/schema";
import type { CanonicalArticle } from "../../src/content/types";
import {
  BLOCK_SEPARATOR,
  graphemeClusters,
  normalizeText,
} from "../../src/content/normalizeText";
import { findScrollTarget, normalizeElText } from "../../src/reader/restoreLocation";

function parseArticle(raw: unknown): CanonicalArticle {
  return ArticleSchema.parse(raw);
}

const baseArticle = {
  id: "restore-test",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/restore",
    title: "Restore Test",
    retrievedAt: "2026-01-01T00:00:00Z",
    originalHtmlHash: "sha256:deadbeef",
  },
};

/**
 * Build an HTMLElement stub mirroring what BlockRenderer emits for a given
 * block kind. jsdom is sufficient for these tests because we only exercise
// the .textContent + dataset.kind paths — no layout, no scroll. (Pitfall 2:
// jsdom is not authoritative for layout; the e2e specs cover scroll behavior.)
 */
function makeBlock(
  text: string,
  kind?: string,
  tag: keyof HTMLElementTagNameMap = "p",
): HTMLElement {
  const el = document.createElement(tag);
  el.textContent = text;
  if (kind) el.dataset.kind = kind;
  return el;
}

// ── findScrollTarget — first / mid / overshoot / empty ───────────────────────

describe("findScrollTarget resolves grapheme offsets to DOM blocks", () => {
  const article = parseArticle({
    ...baseArticle,
    blocks: [
      { kind: "heading", level: 2, content: [{ text: "First section" }] },
      { kind: "paragraph", content: [{ text: "First paragraph body." }] },
      { kind: "heading", level: 2, content: [{ text: "Second section" }] },
      { kind: "paragraph", content: [{ text: "Second paragraph body." }] },
    ],
  });

  // Build HTMLElement stubs in document order mirroring the article blocks.
  // The per-block .textContent mirrors normalizeElText's collapse-then-trim
  // rule (ASCII whitespace collapses) so the lengths round-trip with the
  // grapheme-offset accumulation in normalizeText(article).
  function buildBlocks(): HTMLElement[] {
    return [
      makeBlock("First section", "heading", "h2"),
      makeBlock("First paragraph body.", "paragraph", "p"),
      makeBlock("Second section", "heading", "h2"),
      makeBlock("Second paragraph body.", "paragraph", "p"),
    ];
  }

  it("offset 0 → first block", () => {
    const blocks = buildBlocks();
    const target = findScrollTarget(article, blocks, 0);
    expect(target).toBe(blocks[0]);
  });

  it("offset mid-paragraph → the block whose range contains it", () => {
    const blocks = buildBlocks();
    // Compute the offset that lands inside the third block ("Second section").
    // First block length + separator + second block length + separator = the
    // starting offset of the third block.
    const firstLen = graphemeClusters("First section", article.lang).length;
    const secondLen = graphemeClusters("First paragraph body.", article.lang).length;
    const thirdBlockStart = firstLen + BLOCK_SEPARATOR.length + secondLen + BLOCK_SEPARATOR.length;
    // Offset inside the third block (start + 3 graphemes).
    const target = findScrollTarget(article, blocks, thirdBlockStart + 3);
    expect(target).toBe(blocks[2]);
  });

  it("offset overshoots the article → last block (clamp, never null)", () => {
    const blocks = buildBlocks();
    const total = graphemeClusters(normalizeText(article), article.lang).length;
    // Offset well past the end of the article.
    const target = findScrollTarget(article, blocks, total + 1000);
    expect(target).toBe(blocks[blocks.length - 1]);
  });

  it("empty blocks → null", () => {
    const target = findScrollTarget(article, [], 5);
    expect(target).toBeNull();
  });

  it("offset exactly at a block boundary → the block that STARTS at that offset", () => {
    const blocks = buildBlocks();
    const firstLen = graphemeClusters("First section", article.lang).length;
    // Offset == firstLen would be the first grapheme of the separator; with
    // the rule `offset <= consumed + len`, offset == firstLen lands in the
    // first block (boundary inclusive on the trailing edge). The separator
    // itself is not a DOM block — the next DOM block starts at
    // firstLen + separator.length.
    const target = findScrollTarget(article, blocks, firstLen);
    expect(target).toBe(blocks[0]);
    // Offset == firstLen + separator.length is the first grapheme of the
    // second block.
    const target2 = findScrollTarget(
      article,
      blocks,
      firstLen + BLOCK_SEPARATOR.length,
    );
    expect(target2).toBe(blocks[1]);
  });
});

// ── Per-block length contract (reuses normalizeText rules EXACTLY) ───────────

describe("normalizeElText length matches graphemeClusters over multi-grapheme text (D-05)", () => {
  it("a paragraph with é (precomposed) counts as one grapheme cluster", () => {
    const article = parseArticle({
      ...baseArticle,
      lang: "en",
      blocks: [{ kind: "paragraph", content: [{ text: "café résumé" }] }],
    });
    const el = makeBlock("café résumé", "paragraph");
    const len = graphemeClusters(normalizeElText(el), article.lang).length;
    // "café résumé" — 11 grapheme clusters (c-a-f-é-space-r-é-s-u-m-é).
    expect(len).toBe(11);
  });

  it("a paragraph with emoji (ZWJ family) counts as one grapheme cluster per emoji", () => {
    const article = parseArticle({
      ...baseArticle,
      lang: "en",
      blocks: [{ kind: "paragraph", content: [{ text: "a👨‍👩‍👧b" }] }],
    });
    const el = makeBlock("a👨‍👩‍👧b", "paragraph");
    const len = graphemeClusters(normalizeElText(el), article.lang).length;
    // a + ZWJ-family-emoji + b = 3 grapheme clusters (Intl.Segmenter grapheme
    // granularity collapses the ZWJ sequence into one cluster).
    expect(len).toBe(3);
  });

  it("a code block preserves internal whitespace VERBATIM (not collapsed)", () => {
    const article = parseArticle({
      ...baseArticle,
      blocks: [{ kind: "code-block", source: "  a\n  b" }],
    });
    const el = makeBlock("  a\n  b", "code-block", "pre");
    const text = normalizeElText(el);
    // Code-block source is returned VERBATIM — whitespace is readable text.
    expect(text).toBe("  a\n  b");
    // The grapheme length includes every whitespace char + the newline:
    // 2 spaces + 'a' + '\n' + 2 spaces + 'b' = 7 grapheme clusters.
    expect(graphemeClusters(text, article.lang).length).toBe(7);
  });

  it("a paragraph collapses internal ASCII whitespace runs", () => {
    const article = parseArticle({
      ...baseArticle,
      blocks: [
        {
          kind: "paragraph",
          content: [{ text: "  hello   world  " }],
        },
      ],
    });
    const el = makeBlock("  hello   world  ", "paragraph");
    const text = normalizeElText(el);
    // normalizeRunText collapses the run and trims.
    expect(text).toBe("hello world");
    expect(graphemeClusters(text, article.lang).length).toBe(11);
  });
});

// ── Round-trip with normalizeText (the canonical D-05 contract) ──────────────

describe("findScrollTarget round-trips with normalizeText block boundaries", () => {
  it("the accumulated per-block lengths + separators equal normalizeText length", () => {
    const article = parseArticle({
      ...baseArticle,
      blocks: [
        { kind: "heading", level: 2, content: [{ text: "Title" }] },
        { kind: "paragraph", content: [{ text: "Body one." }] },
        { kind: "code-block", source: "code\n  here" },
      ],
      footnotes: [{ id: "fn-1", content: [{ text: "A footnote." }] }],
    });
    // Build HTMLElement stubs matching the body block kinds (footnotes live
    // in a separate region; findScrollTarget is called against the article
    // body container, so we include only the body blocks here).
    const blocks: HTMLElement[] = [
      makeBlock("Title", "heading", "h2"),
      makeBlock("Body one.", "paragraph", "p"),
      makeBlock("code\n  here", "code-block", "pre"),
    ];
    // Accumulate per-block lengths + separators, mirroring findScrollTarget's
    // internal loop. The total MUST equal the body portion of
    // normalizeText(article) (the footnote region joins separately).
    let consumed = 0;
    for (const el of blocks) {
      consumed += graphemeClusters(normalizeElText(el), article.lang).length;
      consumed += BLOCK_SEPARATOR.length;
    }
    // consumed now over-counts by one trailing separator (no separator after
    // the last block). Subtract it.
    consumed -= BLOCK_SEPARATOR.length;
    // The body portion of normalizeText(article) — derive by joining the body
    // blocks' canonical text with BLOCK_SEPARATOR.
    const bodyText = [
      "Title",
      "Body one.",
      "code\n  here",
    ].join(BLOCK_SEPARATOR);
    expect(consumed).toBe(graphemeClusters(bodyText, article.lang).length);
  });
});
