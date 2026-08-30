import { describe, expect, it } from "vitest";
import { ArticleSchema } from "../../src/content/schema";
import { articleGraphemeIndex } from "../../src/content/normalizeText";
import { deriveToc } from "../../src/content/toc";
import type { TocEntry } from "../../src/content/toc";
import type { CanonicalArticle } from "../../src/content/types";

/**
 * deriveToc invariant suite (Phase 18 Plan 18-01, ORNT-04 foundation).
 *
 * Guards the D18-09/10/11 locked decisions:
 *   - D18-09: synthetic "Top of article" entry first (offset 0, depth 0)
 *   - D18-10: skipped levels nest deeper WITHOUT invented intermediate entries
 *   - D18-11: duplicate heading texts pass through AS-IS (no suffixes)
 *   - h1 is provenance-rendered (never a TOC entry); headingless → Top-only
 *     (D18-13 foundation); levels preserved verbatim (ORNT-04)
 *
 * Pure-module shape mirrors tests/unit/normalizeText.test.ts: ArticleSchema
 * .parse helper + one baseArticle literal (Zod-at-boundary — never trust a
 * hand-built fixture shape).
 */

function parseArticle(raw: unknown): CanonicalArticle {
  return ArticleSchema.parse(raw);
}

const baseArticle = {
  id: "toc-test",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/toc",
    title: "TOC Test",
    retrievedAt: "2026-01-01T00:00:00Z",
    originalHtmlHash: "sha256:deadbeef",
  },
};

const para = (text: string) => ({
  kind: "paragraph",
  content: [{ text }],
});

const heading = (level: number, text: string) => ({
  kind: "heading",
  level,
  content: [{ text }],
});

// ── D18-09: Top entry first + blockStartOffsets destinations ────────────────

describe("deriveToc: Top entry + per-heading entries", () => {
  const article = parseArticle({
    ...baseArticle,
    blocks: [
      para("Intro paragraph."),
      heading(2, "First section"),
      para("Body one."),
      heading(3, "Sub section"),
      para("Body two."),
      heading(2, "Second section"),
      para("Body three."),
    ],
  });
  const toc = deriveToc(article);

  it("returns Top first + exactly one entry per h2-h6 heading (4 total)", () => {
    expect(toc).toHaveLength(4);
  });

  it("the Top entry is synthetic: text 'Top of article', offset 0, depth 0, blockIndex -1", () => {
    const top = toc[0] as TocEntry;
    expect(top.text).toBe("Top of article");
    expect(top.offset).toBe(0);
    expect(top.depth).toBe(0);
    // Sentinel: the Top destination targets the article h1, not a body block.
    expect(top.blockIndex).toBe(-1);
  });

  it("heading entries carry their article-global blockStartOffsets destination (O(1) D-05 lookup)", () => {
    const { blockStartOffsets } = articleGraphemeIndex(article);
    const bodyEntries = toc.slice(1);
    // Heading blocks sit at block indices 1, 3, 5 (paragraphs interleave).
    expect(bodyEntries.map((e) => e.blockIndex)).toEqual([1, 3, 5]);
    expect(bodyEntries.map((e) => e.offset)).toEqual([
      blockStartOffsets[1]!,
      blockStartOffsets[3]!,
      blockStartOffsets[5]!,
    ]);
  });

  it("entry text is the heading runs joined, in block order", () => {
    expect(toc.slice(1).map((e) => e.text)).toEqual([
      "First section",
      "Sub section",
      "Second section",
    ]);
  });

  it("depth: first body entry 0, h3 under h2 nests to 1, sibling h2 returns to 0", () => {
    expect(toc.slice(1).map((e) => e.depth)).toEqual([0, 1, 0]);
  });
});

// ── D18-10: skipped levels nest deeper WITHOUT invention ────────────────────

describe("deriveToc: skipped heading levels", () => {
  const article = parseArticle({
    ...baseArticle,
    blocks: [
      heading(2, "Chapter"),
      heading(5, "Deep skip"),
    ],
  });
  const toc = deriveToc(article);

  it("h2 followed directly by h5 → Top + 2 entries (zero invented intermediates)", () => {
    expect(toc).toHaveLength(3);
    expect(toc.map((e) => e.text)).toEqual([
      "Top of article",
      "Chapter",
      "Deep skip",
    ]);
  });

  it("the h5 entry has depth 2 — the skip deepens nesting with no intermediate entry", () => {
    const h5 = toc[2] as TocEntry;
    expect(h5.depth).toBe(2);
    expect(h5.level).toBe(5);
  });
});

// ── D18-11: duplicates AS-IS ─────────────────────────────────────────────────

describe("deriveToc: duplicate heading texts", () => {
  const article = parseArticle({
    ...baseArticle,
    blocks: [
      heading(2, "Notes"),
      para("Some text."),
      heading(2, "Notes"),
    ],
  });
  const toc = deriveToc(article);

  it("two headings with identical text → two entries with identical text, no suffixes", () => {
    expect(toc).toHaveLength(3);
    expect(toc[1]!.text).toBe("Notes");
    expect(toc[2]!.text).toBe("Notes");
    expect(toc[1]!.text).toEqual(toc[2]!.text);
  });

  it("duplicate entries keep distinct destinations (blockIndex + offset differ)", () => {
    expect(toc[1]!.blockIndex).not.toBe(toc[2]!.blockIndex);
    expect(toc[1]!.offset).not.toBe(toc[2]!.offset);
  });
});

// ── h1 exclusion + headingless (D18-13 foundation) ──────────────────────────

describe.each([
  {
    case: "only heading is level 1",
    blocks: [heading(1, "The Title"), para("Body text.")],
  },
  {
    case: "zero heading blocks of any level",
    blocks: [para("First paragraph."), para("Second paragraph.")],
  },
])("deriveToc: $case", ({ blocks }) => {
  const article = parseArticle({ ...baseArticle, blocks });

  it("derives to exactly [Top] — the Top entry alone", () => {
    const toc = deriveToc(article);
    expect(toc).toHaveLength(1);
    expect(toc[0]!.text).toBe("Top of article");
    expect(toc[0]!.offset).toBe(0);
    expect(toc[0]!.depth).toBe(0);
  });
});

// ── ORNT-04: levels preserved verbatim; h5/h6 present ───────────────────────

describe("deriveToc: level preservation + h5/h6 presence", () => {
  const article = parseArticle({
    ...baseArticle,
    blocks: [
      heading(2, "Alpha"),
      heading(3, "Bravo"),
      heading(4, "Charlie"),
      heading(5, "Delta"),
      heading(6, "Echo"),
    ],
  });
  const toc = deriveToc(article);

  it("h2-h6 all appear as entries with levels preserved verbatim", () => {
    expect(toc).toHaveLength(6);
    expect(toc.slice(1).map((e) => e.level)).toEqual([2, 3, 4, 5, 6]);
  });

  it("a well-formed chain nests one depth per level (h6 reaches depth 4)", () => {
    expect(toc.slice(1).map((e) => e.depth)).toEqual([0, 1, 2, 3, 4]);
  });

  it("an h5 after an h3 (one skipped level) deepens by the skip: depth 3", () => {
    const skipped = deriveToc(
      parseArticle({
        ...baseArticle,
        blocks: [heading(2, "A"), heading(3, "B"), heading(5, "C")],
      }),
    );
    expect(skipped[2]!.depth).toBe(1); // h3 under h2
    expect(skipped[3]!.depth).toBe(3); // h5 under h3 with level 4 skipped
  });
});
