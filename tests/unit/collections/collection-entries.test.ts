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
import { collectionEntryHref } from "../../../src/routes/collections/collectionEntries";
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

describe("collectionEntryHref (issue #242)", () => {
  it("an article entry opens the canonical reader route; an absent article is unlinked", () => {
    const lookup: CollectionEntryLookup = {
      articlesById: new Map([["essay", article("essay", "An Essay")]]),
      booksById: new Map(),
      chaptersByBookId: new Map(),
      latestLocationByArticleId: new Map(),
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
    };
    expect(collectionEntryHref(bookEntry("epub-empty"), lookup)).toBeNull();
    expect(collectionEntryHref(bookEntry("epub-ghost"), lookup)).toBeNull();
  });
});
