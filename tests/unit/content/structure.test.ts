// Issue #236 — the pure work-structure seam (src/content/structure.ts).
//
// Derivation turns the canonical article into stable chapter/reading-part
// destinations; validation accepts a persisted snapshot only when its
// revision and ranges match the row's canonical content exactly; resolution
// maps a canonical offset onto its chapter/part. These are the honesty
// guarantees the reader orientation (and, later, Collections chapter
// targets) stand on: destinations are source ranges — never page indices or
// title uniqueness — and generated reading parts never masquerade as
// author-written chapters.

import { describe, expect, it } from "vitest";
import type { Block, CanonicalArticle } from "../../../src/content/types";
import {
  deriveWorkStructure,
  resolveWorkPosition,
  structureLeaves,
  validateWorkStructure,
  PART_TARGET_GRAPHEMES,
} from "../../../src/content/structure";
import { articleGraphemeIndex } from "../../../src/content/normalizeText";

const paragraph = (text: string): Block => ({
  kind: "paragraph",
  content: [{ text, marks: [] }],
});

const heading = (level: 2 | 3 | 4 | 5 | 6, text: string): Block => ({
  kind: "heading",
  level,
  content: [{ text, marks: [] }],
});

const makeArticle = (blocks: Block[], overrides: Partial<CanonicalArticle> = {}): CanonicalArticle => ({
  id: "structure-article",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/structure",
    title: "Structure Article",
    retrievedAt: "2026-08-07T00:00:00Z",
    originalHtmlHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  blocks,
  footnotes: [],
  ...overrides,
});

describe("deriveWorkStructure — derivation from canonical content", () => {
  it("derives a single generated part for a short headingless work", () => {
    const article = makeArticle([paragraph("Calm prose."), paragraph("More calm prose.")]);
    const structure = deriveWorkStructure(article)!;
    expect(structure.destinations).toHaveLength(1);
    const [only] = structure.destinations;
    expect(only?.kind).toBe("part");
    expect(only?.titleSource).toBe("generated");
    expect(only?.title).toBe("Part 1");
    expect(only?.parentChapterId).toBeUndefined();
    // Exact canonical coverage.
    expect(only?.startOffset).toBe(0);
    expect(only?.endOffset).toBe(articleGraphemeIndex(article).totalGraphemes);
  });

  it("derives chapters from the shallowest heading level", () => {
    const article = makeArticle([
      heading(2, "First chapter"),
      paragraph("Body one."),
      heading(3, "A subsection stays inside"),
      paragraph("Body two."),
      heading(2, "Second chapter"),
      paragraph("Body three."),
    ]);
    const structure = deriveWorkStructure(article)!;
    const chapters = structure.destinations.filter((d) => d.kind === "chapter");
    expect(chapters.map((c) => c.title)).toEqual(["First chapter", "Second chapter"]);
    expect(chapters.map((c) => c.titleSource)).toEqual(["heading", "heading"]);
    // The h3 is NOT a chapter boundary: it stays inside the first chapter.
    expect(chapters).toHaveLength(2);
    // No parts: both chapters are small.
    expect(structure.destinations).toHaveLength(2);
  });

  it("subdivides a long chapter into honest generated reading parts", () => {
    const filler = (n: number) => `Sentence ${n} carries the running prose of a genuinely long chapter.`;
    const long = Array.from({ length: 700 }, (_, i) => paragraph(filler(i)));
    const article = makeArticle([heading(2, "One long chapter"), ...long]);
    const structure = deriveWorkStructure(article)!;
    const parts = structure.destinations.filter((d) => d.kind === "part");
    expect(parts.length).toBeGreaterThanOrEqual(2);
    for (const part of parts) {
      expect(part.titleSource).toBe("generated");
      expect(part.title).toBe(`Part ${structure.destinations.filter((d) => d.kind === "part").indexOf(part) + 1}`);
      expect(part.parentChapterId).toBe(structure.destinations[0]?.id);
    }
    // Parts keep each destination near the target, except the last remainder.
    for (const part of parts.slice(0, -1)) {
      const length = part.endOffset - part.startOffset;
      expect(length).toBeGreaterThanOrEqual(PART_TARGET_GRAPHEMES * 0.5);
    }
  });

  it("keeps duplicate headings distinct destinations", () => {
    const article = makeArticle([
      heading(2, "Reflections"),
      paragraph("First reflections."),
      heading(2, "Reflections"),
      paragraph("Second reflections."),
    ]);
    const structure = deriveWorkStructure(article)!;
    const chapters = structure.destinations.filter((d) => d.kind === "chapter");
    expect(chapters).toHaveLength(2);
    // Distinct source ranges, not title-derived identity.
    expect(chapters[0]?.startBlock).not.toBe(chapters[1]?.startBlock);
    expect(chapters[0]?.id).not.toBe(chapters[1]?.id);
    expect(chapters[1]?.startOffset).toBeGreaterThan(chapters[0]!.endOffset - 1);
  });

  it("covers leading text, zero-text visual blocks, and trailing text", () => {
    const article = makeArticle([
      paragraph("Lead-in prose before any heading."),
      { kind: "figure", alt: "A chart", caption: [] },
      heading(2, "Only chapter"),
      paragraph("Body."),
      { kind: "figure", alt: "Trailing image", caption: [] },
      paragraph("Trailing prose."),
    ]);
    const structure = deriveWorkStructure(article)!;
    const index = articleGraphemeIndex(article);
    expect(structure.destinations[0]?.startOffset).toBe(0);
    expect(structure.destinations.at(-1)?.endOffset).toBe(index.totalGraphemes);
    // Chapter boundary sits AT the heading block's offset: the chapter owns
    // the leading text before it (its range starts at the work start), and
    // the heading offset maps inside the chapter range.
    const chapter = structure.destinations.find((d) => d.kind === "chapter");
    expect(chapter?.startBlock).toBe(0);
    expect(chapter?.startOffset).toBe(0);
    const headingOffset = index.blockStartOffsets[2]!;
    expect(chapter!.startOffset <= headingOffset && headingOffset < chapter!.endOffset).toBe(true);
  });

  it("keeps footnote bodies covered by the final destination", () => {
    const article = makeArticle([heading(2, "Chapter"), paragraph("Body text.")], {
      footnotes: [{ id: "fn-1", content: [{ text: "A footnote body.", marks: [] }] }],
    });
    const structure = deriveWorkStructure(article)!;
    const index = articleGraphemeIndex(article);
    expect(index.footnoteRows.length).toBe(1);
    const last = structure.destinations.at(-1)!;
    expect(last.endOffset).toBe(index.totalGraphemes);
    expect(last.endOffset).toBeGreaterThan(index.blockStartOffsets[article.blocks.length]!);
  });

  it("is deterministic: same content derives byte-identical structures", () => {
    const blocks = [
      heading(2, "One"),
      paragraph("Prose."),
      heading(2, "Two"),
      paragraph("More prose."),
    ];
    const a = deriveWorkStructure(makeArticle(blocks))!;
    const b = deriveWorkStructure(makeArticle(blocks, { id: "another-id", revision: 3 }))!;
    // Range identity is content-derived: same ranges (ids differ only by
    // nothing — ids encode ranges; revision rides the structure record).
    expect(b.destinations.map((d) => [d.id, d.startOffset, d.endOffset])).toEqual(
      a.destinations.map((d) => [d.id, d.startOffset, d.endOffset]),
    );
    expect(b.revision).toBe(3);
    expect(a.revision).toBe(1);
  });
});

describe("deriveWorkStructure — publisher outline evidence", () => {
  it("prefers publisher evidence matched in source order", () => {
    const article = makeArticle([
      heading(3, "Preface"), // shallowest-level noise: not a publisher chapter
      paragraph("Front matter."),
      heading(2, "The Stalin School"), // publisher chapter 1 — evidence wins over h3 depth logic
      paragraph("Body."),
      heading(2, "Falsification"),
      paragraph("Body."),
      heading(3, "Study"),
      paragraph("Body."),
      heading(2, "Trotsky"),
      paragraph("Body."),
    ]);
    // Without evidence the shallowest level (h3) would divide; with it the
    // publisher's h2 chapters are the honest divisions.
    const structure = deriveWorkStructure(article, [
      "The Stalin School",
      "Falsification",
      "Trotsky",
    ])!;
    const chapters = structure.destinations.filter((d) => d.kind === "chapter");
    expect(chapters.map((c) => c.title)).toEqual(["The Stalin School", "Falsification", "Trotsky"]);
    expect(chapters.map((c) => c.titleSource)).toEqual(["publisher", "publisher", "publisher"]);
    // Chapter 1 owns the preface (leading text).
    expect(chapters[0]?.startOffset).toBe(0);
  });

  it("falls back to heading-derived sections when evidence does not reconcile", () => {
    const article = makeArticle([
      heading(2, "One"),
      paragraph("A."),
      heading(2, "Two"),
      paragraph("B."),
    ]);
    // A missing chapter: the index lists a title the body never carries.
    const structure = deriveWorkStructure(article, ["One", "Never Published"])!;
    const chapters = structure.destinations.filter((d) => d.kind === "chapter");
    expect(chapters.map((c) => c.titleSource)).toEqual(["heading", "heading"]);
    expect(chapters.map((c) => c.title)).toEqual(["One", "Two"]);
  });

  it("refuses single-entry evidence (one chapter divides nothing)", () => {
    const article = makeArticle([
      heading(2, "One"),
      paragraph("A."),
      heading(2, "Two"),
      paragraph("B."),
    ]);
    const withEvidence = deriveWorkStructure(article, ["One"]);
    const withoutEvidence = deriveWorkStructure(article);
    expect(withEvidence).toEqual(withoutEvidence);
  });
});

describe("deriveWorkStructure — title artifacts", () => {
  it("a first heading carrying the provenance title is not a fake chapter", () => {
    // Readability keeps the in-page title heading (promoted to h2) — it is
    // the work's name, never one of its chapters.
    const article = makeArticle(
      [
        heading(2, "No chapters here"),
        paragraph(fill(60000)),
        paragraph("tail"),
      ],
      { provenance: { ...makeArticle([]).provenance, title: "No chapters here" } },
    );
    const structure = deriveWorkStructure({ ...article, provenanceTitle: "No chapters here" })!;
    expect(structure.destinations.some((d) => d.kind === "chapter")).toBe(false);
    const parts = structure.destinations;
    expect(parts.length).toBeGreaterThanOrEqual(2);
    // A differently-named first heading stays a chapter.
    const withRealChapter = makeArticle([heading(2, "Actually a chapter"), paragraph("Body.")]);
    const s2 = deriveWorkStructure({ ...withRealChapter, provenanceTitle: "Something Else" })!;
    expect(s2.destinations.filter((d) => d.kind === "chapter")).toHaveLength(1);
  });
});

describe("deriveWorkStructure — giant blocks", () => {
  it("cuts parts inside one giant splittable block at safe boundaries", () => {
    // One paragraph far beyond the part target — the giant-prose shape
    // (issue #233). Parts must still tile the whole block.
    const sentence = "The enormous paragraph continues its argument without pause. ";
    const article = makeArticle([
      heading(2, "Giant chapter"),
      paragraph(sentence.repeat(1200)),
      paragraph("A closing note."),
    ]);
    const structure = deriveWorkStructure(article)!;
    const index = articleGraphemeIndex(article);
    const parts = structure.destinations.filter((d) => d.kind === "part");
    expect(parts.length).toBeGreaterThanOrEqual(2);
    // The derived structure passes its own validation gate.
    expect(validateWorkStructure(article, structure)).not.toBeNull();
    // Exact tiling of the work by the LEAF destinations (the chapter is the
    // union of its parts — leaves are the parts here).
    const leaves = structureLeaves(structure);
    let cursor = 0;
    for (const d of leaves) {
      expect(d.startOffset).toBe(cursor);
      cursor = d.endOffset;
    }
    expect(cursor).toBe(index.totalGraphemes);
    // Intra-block cuts stay inside the block's grapheme length.
    for (const part of parts) {
      if (part.endGrapheme !== undefined) {
        expect(part.endGrapheme).toBeLessThanOrEqual(index.perBlockLengths[part.endBlock - 1]!);
        expect(part.startBlock).toBeLessThanOrEqual(part.endBlock - 1);
      }
    }
  });
});

describe("validateWorkStructure", () => {
  const article = makeArticle([
    heading(2, "One"),
    paragraph("Prose one."),
    heading(2, "Two"),
    paragraph("Prose two."),
  ]);
  const valid = deriveWorkStructure(article)!;

  it("accepts a freshly derived structure", () => {
    expect(validateWorkStructure(article, valid)).not.toBeNull();
  });

  it("rejects a revision mismatch", () => {
    expect(validateWorkStructure(article, { ...valid, revision: 2 })).toBeNull();
  });

  it("rejects gaps and overlaps in the tiling", () => {
    const gapped = {
      ...valid,
      destinations: valid.destinations.map((d, i) =>
        i === 1 ? { ...d, startOffset: d.startOffset + 3 } : d,
      ),
    };
    expect(validateWorkStructure(article, gapped)).toBeNull();
    const overlapping = {
      ...valid,
      destinations: valid.destinations.map((d, i) =>
        i === 1 ? { ...d, endOffset: d.endOffset + 3 } : d,
      ),
    };
    expect(validateWorkStructure(article, overlapping)).toBeNull();
  });

  it("rejects a destination whose offsets disagree with its block fields", () => {
    const shifted = {
      ...valid,
      destinations: valid.destinations.map((d, i) =>
        i === 1 ? { ...d, startBlock: d.startBlock + 1 } : d,
      ),
    };
    expect(validateWorkStructure(article, shifted)).toBeNull();
  });

  it("rejects a final destination that abandons the footnotes region", () => {
    const index = articleGraphemeIndex(article);
    const truncated = {
      ...valid,
      destinations: valid.destinations.map((d, i) =>
        i === valid.destinations.length - 1
          ? { ...d, endOffset: Math.max(1, index.totalGraphemes - 1) }
          : d,
      ),
    };
    expect(validateWorkStructure(article, truncated)).toBeNull();
  });

  it("rejects a part pointing at an unknown chapter", () => {
    const article2 = makeArticle([heading(2, "C"), paragraph(fill(30000))]);
    const structure = deriveWorkStructure(article2)!;
    const part = structure.destinations.find((d) => d.kind === "part");
    const broken = {
      ...structure,
      destinations: structure.destinations.map((d) =>
        d.id === part?.id ? { ...d, parentChapterId: "ch-999.b" } : d,
      ),
    };
    expect(validateWorkStructure(article2, broken)).toBeNull();
  });

  it("rejects garbage", () => {
    expect(validateWorkStructure(article, null)).toBeNull();
    expect(validateWorkStructure(article, { destinations: [] })).toBeNull();
  });
});

describe("resolveWorkPosition", () => {
  const article = makeArticle([
    heading(2, "One"),
    paragraph("Prose one."),
    heading(2, "Two"),
    paragraph("Prose two."),
  ]);
  const structure = deriveWorkStructure(article)!;
  const index = articleGraphemeIndex(article);

  it("resolves offsets inside each destination", () => {
    const first = resolveWorkPosition(article, structure, 0);
    expect(first?.destination.kind).toBe("chapter");
    expect(first?.chapterOrdinal).toBe(1);
    expect(first?.chapterTotal).toBe(2);
    const mid = resolveWorkPosition(article, structure, index.blockStartOffsets[2]! + 1);
    expect(mid?.destination.title).toBe("Two");
    expect(mid?.chapterOrdinal).toBe(2);
  });

  it("resolves footnote-region offsets to the final destination", () => {
    const footnoted = makeArticle([heading(2, "One"), paragraph("Body.")], {
      footnotes: [{ id: "fn-1", content: [{ text: "Note body.", marks: [] }] }],
    });
    const structure2 = deriveWorkStructure(footnoted)!;
    const index2 = articleGraphemeIndex(footnoted);
    const row = index2.footnoteRows[0]!;
    const at = resolveWorkPosition(footnoted, structure2, row.start + 1);
    expect(at?.destination).toBe(structure2.destinations.at(-1));
  });

  it("resolves chapterless parts by ordinal", () => {
    const long = makeArticle([paragraph(fill(60000)), paragraph("tail")]);
    const structure = deriveWorkStructure(long)!;
    const leaves = structureLeaves(structure);
    expect(leaves.length).toBeGreaterThanOrEqual(2);
    const second = resolveWorkPosition(long, structure, leaves[1]!.startOffset + 1);
    expect(second?.destination.kind).toBe("part");
    expect(second?.partOrdinal).toBe(2);
    expect(second?.chapter).toBeUndefined();
  });

  it("clamps out-of-range offsets", () => {
    expect(resolveWorkPosition(article, structure, 999_999)?.destination).toBe(
      structure.destinations.at(-1),
    );
    expect(resolveWorkPosition(article, structure, -5)?.destination).toBe(structure.destinations[0]);
  });
});

const fill = (graphemes: number): string => {
  const sentence = "The running argument keeps its measured pace. ";
  return sentence.repeat(Math.ceil(graphemes / sentence.length)).slice(0, graphemes);
};

describe("schema — ArticleSchema.structure", () => {
  it("round-trips an attached snapshot and hydrates absent fields", async () => {
    const { ArticleSchema } = await import("../../../src/content/schema");
    const article = makeArticle([
      heading(2, "One"),
      paragraph(fill(30000)),
      paragraph("tail"),
    ]);
    const structure = deriveWorkStructure(article)!;
    const parsed = ArticleSchema.parse({ ...article, structure });
    expect(parsed.structure).toEqual(structure);
    const legacy = ArticleSchema.parse(article);
    expect(legacy.structure).toBeUndefined();
  });
});
