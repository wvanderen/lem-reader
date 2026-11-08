// tests/unit/collections/collection-entries.test.ts
// Issue #242 — the entry → navigation derivation truths (the ONE
// collectionEntryHref definition):
//   - An ARTICLE entry opens the article's canonical reader route (the
//     reader's normal shared saved location — ADR 0001; no collection-
//     specific position exists), and an absent article resolves to null
//     (honest unlinked row, never a dead link).
//   - A BOOK entry follows the SAME pointer the library's BookRow uses
//     (D12-07): the resume chapter while one exists, else the first
//     DECLARED live chapter (unread book → its start), else null when the
//     book is absent or has zero live chapter rows.
//   - The same reading entry resolves identically no matter how many
//     collections hold it — the derivation reads ONLY shared library
//     folds, never membership context.
import { describe, expect, it } from "vitest";
import { ArticleSchema, BookSchema, LocationRecordSchema } from "../../../src/content/schema";
import type { CanonicalArticle } from "../../../src/content/types";
import type { CollectionEntry } from "../../../src/content/schema";
import { deriveWorkStructure } from "../../../src/content/structure";
import {
  collectionEntryHref,
  resolveCollectionEntry,
} from "../../../src/routes/collections/collectionEntries";
import type { CollectionEntryLookup } from "../../../src/routes/collections/collectionEntries";

function article(id: string, title: string): CanonicalArticle {
  return ArticleSchema.parse({
    id,
    revision: 1,
    lang: "en",
    provenance: {
      title,
      retrievedAt: "2026-10-01T00:00:00.000Z",
      originalHtmlHash: `sha256:${"8".repeat(64)}`,
    },
    blocks: [{ kind: "paragraph", content: [{ text: `${title} body.`, marks: [] }] }],
    ingestionMeta: {
      source: "paste",
      origin: "paste",
      originalHtmlHash: `sha256:${"8".repeat(64)}`,
      ingestedAt: "2026-10-01T00:00:00.000Z",
      extractionConfidence: "high",
    },
    addedAt: "2026-10-01T00:00:00.000Z",
  });
}

function chapter(id: string, bookId: string, index: number): CanonicalArticle {
  return ArticleSchema.parse({
    id,
    revision: 1,
    lang: "en",
    provenance: {
      title: `Chapter ${index + 1}`,
      retrievedAt: "2026-10-01T00:00:00.000Z",
      originalHtmlHash: `sha256:${"9".repeat(64)}`,
    },
    blocks: [{ kind: "paragraph", content: [{ text: "Chapter body.", marks: [] }] }],
    ingestionMeta: {
      source: "epub-chapter",
      origin: "upload",
      bookId,
      chapterIndex: index,
      originalHtmlHash: `sha256:${"9".repeat(64)}`,
      ingestedAt: "2026-10-01T00:00:00.000Z",
      extractionConfidence: "high",
    },
    addedAt: "2026-10-01T00:00:00.000Z",
  });
}

function book(id: string, chapterIds: string[]): import("../../../src/content/schema").Book {
  return BookSchema.parse({
    id,
    title: "Collected Works",
    authors: ["A. Author"],
    language: "en",
    chapterArticleIds: chapterIds,
    source: "epub-upload",
    originalFileHash: `sha256:${"a".repeat(64)}`,
    addedAt: "2026-10-01T00:00:00.000Z",
  });
}

function location(articleId: string, savedAt: string, offset = 0) {
  return LocationRecordSchema.parse({
    schemaVersion: 1,
    articleId,
    revision: 1,
    graphemeOffset: offset,
    savedAt,
  });
}

const articleEntry = (articleId: string): CollectionEntry => ({
  id: "entry-1",
  target: { kind: "article", articleId },
  addedAt: "2026-10-01T00:00:00.000Z",
});
const bookEntry = (bookId: string): CollectionEntry => ({
  id: "entry-2",
  target: { kind: "book", bookId },
  addedAt: "2026-10-01T00:00:00.000Z",
});
// Issue #244 — chapter target entries.
const bookChapterEntry = (bookId: string, articleId: string): CollectionEntry => ({
  id: "entry-3",
  target: { kind: "book-chapter", bookId, articleId },
  addedAt: "2026-10-01T00:00:00.000Z",
});
const workChapterEntry = (articleId: string, destinationId: string): CollectionEntry => ({
  id: "entry-4",
  target: { kind: "work-chapter", articleId, destinationId },
  addedAt: "2026-10-01T00:00:00.000Z",
});

describe("collectionEntryHref (issue #242)", () => {
  it("an article entry opens the canonical reader route; an absent article is unlinked", () => {
    const lookup: CollectionEntryLookup = {
      articlesById: new Map([["essay", article("essay", "An Essay")]]),
      booksById: new Map(),
      chaptersByBookId: new Map(),
      latestLocationByArticleId: new Map(),
      completionByKey: new Map(),
      textLengthOf: () => undefined,
    };
    expect(collectionEntryHref(articleEntry("essay"), lookup)).toBe("#/article/essay");
    expect(collectionEntryHref(articleEntry("ghost-article"), lookup)).toBeNull();
  });

  it("an unread book entry opens its first DECLARED live chapter", () => {
    const bk = book("epub-1", ["ch-a", "ch-b"]);
    const lookup: CollectionEntryLookup = {
      articlesById: new Map([
        ["ch-a", chapter("ch-a", "epub-1", 0)],
        ["ch-b", chapter("ch-b", "epub-1", 1)],
      ]),
      booksById: new Map([["epub-1", bk]]),
      chaptersByBookId: new Map([["epub-1", [chapter("ch-a", "epub-1", 0)]]]),
      latestLocationByArticleId: new Map(),
      completionByKey: new Map(),
      textLengthOf: () => undefined,
    };
    expect(collectionEntryHref(bookEntry("epub-1"), lookup)).toBe("#/article/ch-a");
  });

  it("a mid-book entry resumes the D12-07 chapter — the shared saved position, not chapter one", () => {
    const bk = book("epub-1", ["ch-a", "ch-b", "ch-c"]);
    const lookup: CollectionEntryLookup = {
      articlesById: new Map([
        ["ch-a", chapter("ch-a", "epub-1", 0)],
        ["ch-b", chapter("ch-b", "epub-1", 1)],
        ["ch-c", chapter("ch-c", "epub-1", 2)],
      ]),
      booksById: new Map([["epub-1", bk]]),
      chaptersByBookId: new Map([
        ["epub-1", [chapter("ch-a", "epub-1", 0), chapter("ch-b", "epub-1", 1)]],
      ]),
      // The reader read INTO ch-b (newest savedAt) — the collection entry
      // must open exactly there (shared position; ADR 0001).
      latestLocationByArticleId: new Map([
        ["ch-a", location("ch-a", "2026-10-01T10:00:00.000Z", 500)],
        ["ch-b", location("ch-b", "2026-10-02T09:00:00.000Z", 120)],
      ]),
      completionByKey: new Map(),
      textLengthOf: () => undefined,
    };
    expect(collectionEntryHref(bookEntry("epub-1"), lookup)).toBe("#/article/ch-b");
  });

  it("a book entry with zero live chapter rows — or an absent book — is unlinked", () => {
    const emptyBook = book("epub-empty", []);
    const lookup: CollectionEntryLookup = {
      articlesById: new Map(),
      booksById: new Map([["epub-empty", emptyBook]]),
      chaptersByBookId: new Map(),
      latestLocationByArticleId: new Map(),
      completionByKey: new Map(),
      textLengthOf: () => undefined,
    };
    expect(collectionEntryHref(bookEntry("epub-empty"), lookup)).toBeNull();
    expect(collectionEntryHref(bookEntry("epub-ghost"), lookup)).toBeNull();
  });
});

// Issue #244 — chapter entries resolve to the reader route CARRYING the
// chapter scope, validated against the live library records (the same
// resolution the store write seam and the reader apply).
describe("resolveCollectionEntry — chapter targets (issue #244)", () => {
  function structuredWork(id: string, title: string): CanonicalArticle {
    return ArticleSchema.parse({
      id,
      revision: 1,
      lang: "en",
      provenance: {
        title,
        retrievedAt: "2026-10-01T00:00:00.000Z",
        originalHtmlHash: `sha256:${"7".repeat(64)}`,
      },
      blocks: [
        { kind: "heading", level: 2, content: [{ text: "Opening", marks: [] }] },
        { kind: "paragraph", content: [{ text: "Opening body.", marks: [] }] },
        { kind: "heading", level: 2, content: [{ text: "Following", marks: [] }] },
        { kind: "paragraph", content: [{ text: "Following body.", marks: [] }] },
      ],
      ingestionMeta: {
        source: "paste",
        origin: "paste",
        originalHtmlHash: `sha256:${"7".repeat(64)}`,
        ingestedAt: "2026-10-01T00:00:00.000Z",
        extractionConfidence: "high",
      },
    });
  }

  it("a book-chapter entry opens the chapter article with the whole-article scope", () => {
    const bk = book("epub-1", ["ch-a", "ch-b"]);
    const lookup: CollectionEntryLookup = {
      articlesById: new Map([
        ["ch-a", chapter("ch-a", "epub-1", 0)],
        ["ch-b", chapter("ch-b", "epub-1", 1)],
      ]),
      booksById: new Map([["epub-1", bk]]),
      chaptersByBookId: new Map([["epub-1", [chapter("ch-a", "epub-1", 0)]]]),
      latestLocationByArticleId: new Map(),
      completionByKey: new Map(),
      textLengthOf: () => undefined,
    };
    expect(collectionEntryHref(bookChapterEntry("epub-1", "ch-a"), lookup)).toBe(
      "#/article/ch-a/c/chapter",
    );
  });

  it("a book-chapter entry whose membership mismatches the book is unlinked", () => {
    const bk = book("epub-1", ["ch-a"]);
    const lookup: CollectionEntryLookup = {
      // ch-x belongs to ANOTHER book — the cross-record membership the
      // schema cannot verify is checked here (the store validates at write
      // time; the view re-validates against the live snapshot).
      articlesById: new Map([["ch-x", chapter("ch-x", "epub-other", 0)]]),
      booksById: new Map([["epub-1", bk]]),
      chaptersByBookId: new Map(),
      latestLocationByArticleId: new Map(),
      completionByKey: new Map(),
      textLengthOf: () => undefined,
    };
    expect(collectionEntryHref(bookChapterEntry("epub-1", "ch-x"), lookup)).toBeNull();
  });

  it("a work-chapter entry opens the work's route carrying the destination scope", () => {
    const work = structuredWork("long-work", "The Long Work");
    const lookup: CollectionEntryLookup = {
      articlesById: new Map([["long-work", work]]),
      booksById: new Map(),
      chaptersByBookId: new Map(),
      latestLocationByArticleId: new Map(),
      completionByKey: new Map(),
      textLengthOf: () => undefined,
    };
    // The second destination's id: range-encoded from the derivation.
    const structure = deriveWorkStructure(work)!;
    const second = structure.destinations.filter((d) => d.kind === "chapter")[1]!;
    expect(collectionEntryHref(workChapterEntry("long-work", second.id), lookup)).toBe(
      `#/article/long-work/c/${second.id}`,
    );
  });

  it("a STALE work-chapter destination (a re-ingest moved the ranges) is honestly unlinked", () => {
    const work = structuredWork("long-work", "The Long Work");
    const lookup: CollectionEntryLookup = {
      articlesById: new Map([["long-work", work]]),
      booksById: new Map(),
      chaptersByBookId: new Map(),
      latestLocationByArticleId: new Map(),
      completionByKey: new Map(),
      textLengthOf: () => undefined,
    };
    expect(collectionEntryHref(workChapterEntry("long-work", "ch-999.b"), lookup)).toBeNull();
  });

  it("chapter titles and kind lines resolve with the parent named", () => {
    const work = structuredWork("long-work", "The Long Work");
    const bk = book("epub-1", ["ch-a"]);
    const lookup: CollectionEntryLookup = {
      articlesById: new Map([
        ["long-work", work],
        ["ch-a", chapter("ch-a", "epub-1", 0)],
      ]),
      booksById: new Map([["epub-1", bk]]),
      chaptersByBookId: new Map([["epub-1", [chapter("ch-a", "epub-1", 0)]]]),
      latestLocationByArticleId: new Map(),
      completionByKey: new Map(),
      textLengthOf: () => undefined,
    };
    const structure = deriveWorkStructure(work)!;
    const first = structure.destinations.filter((d) => d.kind === "chapter")[0]!;
    expect(resolveCollectionEntry(workChapterEntry("long-work", first.id), lookup)).toEqual({
      href: `#/article/long-work/c/${first.id}`,
      title: "Opening",
      kindLine: "Chapter · The Long Work",
      finished: false, // issue #246 — no completion record, no derivation
    });
    expect(resolveCollectionEntry(bookChapterEntry("epub-1", "ch-a"), lookup)).toEqual({
      href: "#/article/ch-a/c/chapter",
      title: "Chapter 1",
      kindLine: "Chapter · Collected Works",
      finished: false,
    });
  });
});

// Issue #246 — the entry resolution now carries the SHARED completion truth:
describe("resolveCollectionEntry — shared completion (issue #246)", () => {
  const total = 400;

  function structuredWorkLocal(id: string, title: string): CanonicalArticle {
    return ArticleSchema.parse({
      id,
      revision: 1,
      lang: "en",
      provenance: {
        title,
        retrievedAt: "2026-10-01T00:00:00.000Z",
        originalHtmlHash: `sha256:${"7".repeat(64)}`,
      },
      blocks: [
        { kind: "heading", level: 2, content: [{ text: "Opening", marks: [] }] },
        { kind: "paragraph", content: [{ text: "Opening body.", marks: [] }] },
        { kind: "heading", level: 2, content: [{ text: "Following", marks: [] }] },
        { kind: "paragraph", content: [{ text: "Following body.", marks: [] }] },
      ],
    });
  }

  function lookupWith(options: {
    locations?: [string, string, number][];
    completions?: { key: string; finished: boolean; updatedAt: string }[];
    chapterIds?: string[];
  }): CollectionEntryLookup {
    const completions = options.completions ?? [];
    return {
      articlesById: new Map([
        ["essay", article("essay", "An Essay")],
        ["ch-a", chapter("ch-a", "epub-1", 0)],
        ["long-work", structuredWorkLocal("long-work", "The Long Work")],
      ]),
      booksById: new Map([["epub-1", book("epub-1", options.chapterIds ?? ["ch-a"])]]),
      chaptersByBookId: new Map([["epub-1", [chapter("ch-a", "epub-1", 0)]]]),
      latestLocationByArticleId: new Map(
        (options.locations ?? []).map(([id, savedAt, offset]) => [
          id,
          location(id, savedAt, offset),
        ]),
      ),
      completionByKey: new Map(
        completions.map((c) => [
          c.key,
          {
            schemaVersion: 1,
            targetKey: c.key,
            target: { kind: "article", articleId: "x" },
            finished: c.finished,
            source: "reader",
            updatedAt: c.updatedAt,
          },
        ]),
      ),
      textLengthOf: (id) =>
        id === "long-work" || id === "essay" || id === "ch-a" ? total : undefined,
    };
  }

  it("an end-pinned article entry is finished — previously finished targets count when added", () => {
    const lookup = lookupWith({ locations: [["essay", "2026-10-01T00:00:00.000Z", total]] });
    expect(resolveCollectionEntry(articleEntry("essay"), lookup).finished).toBe(true);
  });

  it("a mid-work article entry is unfinished", () => {
    const lookup = lookupWith({ locations: [["essay", "2026-10-01T00:00:00.000Z", 120]] });
    expect(resolveCollectionEntry(articleEntry("essay"), lookup).finished).toBe(false);
  });

  it("a correction overrides the derived state while it is the newest signal", () => {
    const finished = lookupWith({
      locations: [["essay", "2026-10-01T00:00:00.000Z", total]],
      completions: [
        { key: "article:essay", finished: false, updatedAt: "2026-10-02T00:00:00.000Z" },
      ],
    });
    expect(resolveCollectionEntry(articleEntry("essay"), finished).finished).toBe(false);
  });

  it("a book-chapter entry finishes from its chapter article's own location", () => {
    const lookup = lookupWith({
      locations: [["ch-a", "2026-10-01T00:00:00.000Z", total]],
      chapterIds: ["ch-a"],
    });
    expect(resolveCollectionEntry(bookChapterEntry("epub-1", "ch-a"), lookup).finished).toBe(true);
  });

  it("a work-chapter entry reflects its own record, never the work's saved position", () => {
    const structure = deriveWorkStructure(structuredWorkLocal("long-work", "The Long Work"))!;
    const destination = structure.destinations.find((d) => d.kind === "chapter")!;
    const validEntry = workChapterEntry("long-work", destination.id);
    const endPinnedWork = lookupWith({
      locations: [["long-work", "2026-10-01T00:00:00.000Z", total]],
    });
    // The work is end-pinned — that position proves NOTHING about the chapter
    // (the anti-fabrication rule).
    expect(resolveCollectionEntry(validEntry, endPinnedWork).finished).toBe(false);
    const recorded = lookupWith({
      completions: [
        {
          key: `work-chapter:long-work/${destination.id}`,
          finished: true,
          updatedAt: "2026-10-02T00:00:00.000Z",
        },
      ],
    });
    expect(resolveCollectionEntry(validEntry, recorded).finished).toBe(true);
  });

  it("a book entry finishes only when EVERY declared chapter is finished", () => {
    const oneOfTwo = lookupWith({
      locations: [["ch-a", "2026-10-01T00:00:00.000Z", total]],
      chapterIds: ["ch-a", "ch-b"],
    });
    expect(resolveCollectionEntry(bookEntry("epub-1"), oneOfTwo).finished).toBe(false);
  });

  it("an unlinked entry is unfinished — absent targets count, never finish", () => {
    const lookup = lookupWith({});
    expect(resolveCollectionEntry(articleEntry("ghost-article"), lookup).finished).toBe(false);
  });
});
