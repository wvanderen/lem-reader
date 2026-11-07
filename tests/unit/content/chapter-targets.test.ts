// Issue #244 — the chapter-target algebra (src/content/chapterTargets.ts).
//
// The ONE resolution every chapter surface shares: the add-dialog picker,
// the store's write-seam validation, the collection detail view's row
// resolution, and the reader route's assignment resolution. These tests pin
// the honesty guarantees the AC names:
//   - targets resolve from the structure the reader resolves (the freeze
//     contract — saved snapshot first, else the deterministic derivation);
//   - generated reading parts are never chapter targets;
//   - a stale destination (a re-ingest moved the ranges) resolves to null;
//   - the route scope resolves to concrete canonical offset bounds, or
//     null (calm degradation to ordinary whole-work reading).

import { describe, expect, it } from "vitest";
import type { Block, CanonicalArticle } from "../../../src/content/types";
import { BookSchema, CollectionEntryTargetSchema } from "../../../src/content/schema";
import { deriveWorkStructure } from "../../../src/content/structure";
import { articleGraphemeIndex } from "../../../src/content/normalizeText";
import {
  assignmentContainsOffset,
  leafAtOrAfter,
  listWorkChapterTargets,
  resolveChapterAssignment,
  resolveWorkChapterTarget,
  resolveWorkStructure,
} from "../../../src/content/chapterTargets";

const paragraph = (text: string): Block => ({
  kind: "paragraph",
  content: [{ text, marks: [] }],
});

const heading = (level: 2 | 3, text: string): Block => ({
  kind: "heading",
  level,
  content: [{ text, marks: [] }],
});

const makeArticle = (
  id: string,
  blocks: Block[],
  overrides: Partial<CanonicalArticle> = {},
): CanonicalArticle => ({
  id,
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/work",
    title: "The Long Work",
    retrievedAt: "2026-08-07T00:00:00Z",
    originalHtmlHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  blocks,
  footnotes: [],
  ...overrides,
});

const twoChapterWork = (): CanonicalArticle =>
  makeArticle("long-work", [
    heading(2, "First chapter"),
    paragraph("Body one."),
    heading(2, "Second chapter"),
    paragraph("Body two."),
  ]);

describe("resolveWorkStructure — the shared freeze contract", () => {
  it("prefers a SAVED snapshot; falls back to the deterministic derivation", () => {
    const article = twoChapterWork();
    const derived = deriveWorkStructure(article)!;
    // Saved (valid) wins.
    expect(resolveWorkStructure({ ...article, structure: derived })).toEqual(derived);
    // No snapshot → the derivation, validated.
    expect(resolveWorkStructure(article)).toEqual(derived);
    // A snapshot that fails validation (wrong revision) is refused → derive.
    const stale = { ...derived, revision: 99 };
    expect(resolveWorkStructure({ ...article, structure: stale })).toEqual(derived);
  });

  it("returns null when no structure is derivable (no readable text)", () => {
    const empty = makeArticle("empty", []);
    expect(resolveWorkStructure(empty)).toBeNull();
  });
});

describe("listWorkChapterTargets — the picker's chapter rows", () => {
  it("lists chapter destinations in structure order with stable range ids", () => {
    const article = twoChapterWork();
    const chapters = listWorkChapterTargets(article);
    expect(chapters.map((c) => c.title)).toEqual(["First chapter", "Second chapter"]);
    for (const chapter of chapters) {
      expect(chapter.id).toMatch(/^ch-\d+\.(?:b|\d+)$/);
      expect(chapter.kind).toBe("chapter");
    }
  });

  it("NEVER lists generated reading parts", () => {
    // A chapterless work derives parts only — no chapter rows to offer.
    const partWork = makeArticle("part-work", [paragraph("Prose."), paragraph("More prose.")]);
    expect(listWorkChapterTargets(partWork)).toEqual([]);
  });
});

describe("resolveWorkChapterTarget — the store seam's validation", () => {
  it("resolves a chapter destination id to its destination", () => {
    const article = twoChapterWork();
    const [first] = listWorkChapterTargets(article);
    expect(resolveWorkChapterTarget(article, first!.id)).toEqual(first);
  });

  it("refuses a book member as a work-chapter target", () => {
    const article = twoChapterWork();
    const [first] = listWorkChapterTargets(article);
    const chaptered = {
      ...article,
      ingestionMeta: {
        source: "epub-chapter",
        origin: "upload",
        originalHtmlHash: "abc",
        extractionConfidence: "high",
        extractionWarnings: [],
        bookId: "epub-somewhere",
        chapterIndex: 0,
      },
    } as CanonicalArticle;
    expect(resolveWorkChapterTarget(chaptered, first!.id)).toBeNull();
  });

  it("refuses an unknown or stale destination id (null — never a guess)", () => {
    const article = twoChapterWork();
    expect(resolveWorkChapterTarget(article, "ch-999.b")).toBeNull();
    // A part id fails the shape upstream; even ch- grammar on a part-less
    // work with no chapters resolves to null.
    expect(
      resolveWorkChapterTarget(makeArticle("x", [paragraph("One paragraph.")]), "ch-0.b"),
    ).toBeNull();
  });
});

describe("resolveChapterAssignment — the reader route's scope", () => {
  it("the literal 'chapter' scope assigns the whole article (EPUB book chapter)", () => {
    const article = twoChapterWork();
    const total = articleGraphemeIndex(article).totalGraphemes;
    const assignment = resolveChapterAssignment(article, null, "chapter");
    expect(assignment).not.toBeNull();
    expect(assignment!.kind).toBe("whole");
    expect(assignment!.startOffset).toBe(0);
    expect(assignment!.endOffset).toBe(total);
    expect(assignment!.title).toBe("The Long Work");
  });

  it("a destination scope resolves to the chapter's canonical bounds", () => {
    const article = twoChapterWork();
    const structure = resolveWorkStructure(article);
    const [first, second] = listWorkChapterTargets(article);
    const assignment = resolveChapterAssignment(article, structure, first!.id)!;
    expect(assignment.kind).toBe("destination");
    expect(assignment.destination).toEqual(first);
    expect(assignment.title).toBe("First chapter");
    expect(assignment.startOffset).toBe(first!.startOffset);
    expect(assignment.endOffset).toBe(first!.endOffset);
    // The first chapter owns the work's leading text: it starts at 0.
    expect(assignment.startOffset).toBe(0);
    expect(assignment.endOffset).toBe(second!.startOffset);
  });

  it("an unknown, stale, or garbage scope resolves null — calm whole-work degradation", () => {
    const article = twoChapterWork();
    const structure = resolveWorkStructure(article);
    expect(resolveChapterAssignment(article, structure, "ch-999.b")).toBeNull();
    expect(resolveChapterAssignment(article, structure, "pt-0.b")).toBeNull();
    expect(resolveChapterAssignment(article, structure, "../etc")).toBeNull();
    // A structure-less article cannot host a destination scope.
    expect(resolveChapterAssignment(article, null, "ch-0.b")).toBeNull();
  });

  it("a scope on an article with no readable text resolves null", () => {
    const empty = makeArticle("empty", []);
    expect(resolveChapterAssignment(empty, null, "chapter")).toBeNull();
  });
});

describe("assignmentContainsOffset — the resume gate", () => {
  const article = twoChapterWork();
  const structure = resolveWorkStructure(article);
  const [, second] = listWorkChapterTargets(article);
  const assignment = resolveChapterAssignment(article, structure, second!.id)!;

  it("the inclusive start and interior offsets are inside", () => {
    expect(assignmentContainsOffset(assignment, assignment.startOffset)).toBe(true);
    expect(assignmentContainsOffset(assignment, assignment.endOffset - 1)).toBe(true);
  });

  it("the exclusive end belongs to the NEXT chapter — not inside", () => {
    expect(assignmentContainsOffset(assignment, assignment.endOffset)).toBe(false);
    expect(assignmentContainsOffset(assignment, assignment.startOffset - 1)).toBe(false);
  });
});

describe("leafAtOrAfter — the continue-the-work landing heading", () => {
  it("finds the first leaf at-or-after the offset", () => {
    const article = twoChapterWork();
    const structure = resolveWorkStructure(article)!;
    const [, second] = listWorkChapterTargets(article);
    expect(leafAtOrAfter(structure, second!.startOffset)?.id).toBe(second!.id);
    expect(leafAtOrAfter(structure, second!.startOffset - 1)?.id).toBe(second!.id);
    expect(leafAtOrAfter(structure, 0)?.id).toBe(structureLeavesFirstId(structure));
    expect(leafAtOrAfter(structure, Number.MAX_SAFE_INTEGER)).toBeNull();
  });

  function structureLeavesFirstId(structure: ReturnType<typeof deriveWorkStructure>): string {
    const leaves = structure!.destinations.filter(
      (d) => d.kind === "chapter" || d.parentChapterId === undefined,
    );
    return leaves[0]!.id;
  }
});

describe("schema — the chapter target shapes (issue #244)", () => {
  it("book-chapter and work-chapter targets parse", () => {
    expect(
      CollectionEntryTargetSchema.safeParse({
        kind: "book-chapter",
        bookId: "epub-aaaaaaaaaaaa",
        articleId: "harbor-epub-c01",
      }).success,
    ).toBe(true);
    expect(
      CollectionEntryTargetSchema.safeParse({
        kind: "work-chapter",
        articleId: "long-work",
        destinationId: "ch-3.b",
      }).success,
    ).toBe(true);
    expect(
      CollectionEntryTargetSchema.safeParse({
        kind: "work-chapter",
        articleId: "long-work",
        destinationId: "ch-3.14",
      }).success,
    ).toBe(true);
  });

  it("generated reading parts (pt-*) are unrepresentable at the SHAPE level", () => {
    expect(
      CollectionEntryTargetSchema.safeParse({
        kind: "work-chapter",
        articleId: "long-work",
        destinationId: "pt-0.b",
      }).success,
    ).toBe(false);
    expect(
      CollectionEntryTargetSchema.safeParse({
        kind: "work-chapter",
        articleId: "long-work",
        destinationId: "../../passage",
      }).success,
    ).toBe(false);
  });

  it("v1 rows (whole-reading targets only) parse unchanged — additive union", () => {
    const book = BookSchema.parse({
      id: "epub-bbbbbbbbbbbb",
      title: "Harbor",
      authors: ["A"],
      language: "en",
      chapterArticleIds: ["harbor-epub-c01"],
      skippedChapterCount: 0,
      source: "epub-upload",
      originalFileHash: "hash",
      addedAt: "2026-10-01T00:00:00.000Z",
    });
    expect(book.id).toBe("epub-bbbbbbbbbbbb");
    expect(CollectionEntryTargetSchema.safeParse({ kind: "article", articleId: "x" }).success).toBe(
      true,
    );
    expect(CollectionEntryTargetSchema.safeParse({ kind: "book", bookId: "y" }).success).toBe(true);
  });
});
