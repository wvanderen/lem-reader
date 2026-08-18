// tests/unit/library/book-filter.test.ts
// Plan 12-05 Task 2 — Pure-function coverage for the mixed library filter
// (D12-04 + D12-01): filterLibrary (standalone articles — chapter members
// excluded) + filterBooks (book groups — title/author/CHAPTER-TITLE haystack
// + book.tags). NO Dexie, NO React — the library-search.test.ts discipline.
//
// Matrix pinned (12-05-PLAN Task 2 <action> item 4):
//   - book title match surfaces the book;
//   - book author match surfaces the book;
//   - CHAPTER title match surfaces the BOOK, never a standalone chapter row;
//   - a tag on the book surfaces the book only (chapters stay nested);
//   - a tag on a standalone article keeps the article behavior unchanged;
//   - chapter members are excluded from standalone results;
//   - the empty filter returns everything (books + standalone articles).
import { describe, expect, it } from "vitest";
import {
  filterLibrary,
  filterBooks,
} from "../../../src/ingestion/library/libraryFilter";
import type { LibraryFilter } from "../../../src/ingestion/library/libraryFilter";
import { ArticleSchema, BookSchema } from "../../../src/content/schema";
import type {
  Book,
  CanonicalArticle,
} from "../../../src/content/schema";

const BOOK_ID = "epub-book000222";

/** Build a minimal valid standalone or chapter CanonicalArticle. */
function makeArticle(overrides: Record<string, unknown>): CanonicalArticle {
  return ArticleSchema.parse({
    id: "test-id",
    revision: 1,
    lang: "en",
    provenance: {
      title: "Untitled",
      retrievedAt: "2026-01-01T00:00:00.000Z",
      originalHtmlHash:
        "0000000000000000000000000000000000000000000000000000000000000000",
    },
    blocks: [{ kind: "paragraph", content: [{ text: "body" }] }],
    ...overrides,
  });
}

/** Build a minimal valid Book. */
function makeBook(overrides: Record<string, unknown> = {}): Book {
  return BookSchema.parse({
    id: BOOK_ID,
    title: "The Synthetic Book",
    authors: ["Ada Author"],
    language: "en",
    chapterArticleIds: [`${BOOK_ID}-c00`, `${BOOK_ID}-c01`],
    skippedChapterCount: 0,
    source: "epub-upload",
    originalFileHash:
      "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    addedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });
}

/** The book's two chapter articles (bookId-carrying members). */
function chapterArticles(): CanonicalArticle[] {
  return [0, 1].flatMap((i) => [
    makeArticle({
      id: `${BOOK_ID}-c0${i}`,
      provenance: {
        title: `Chapter ${i + 1}. ${i === 0 ? "Loomings" : "The Gauntlet"}`,
        author: "Ada Author",
        retrievedAt: "2026-01-01T00:00:00.000Z",
        originalHtmlHash:
          "0000000000000000000000000000000000000000000000000000000000000000",
      },
      ingestionMeta: {
        source: "epub-chapter",
        originalHtmlHash:
          "sha256:0000000000000000000000000000000000000000000000000000000000000000",
        extractionConfidence: "high",
        bookId: BOOK_ID,
        chapterIndex: i,
      },
    }),
  ]);
}

/** The caller-supplied chapter-title map (LibraryView builds this from the
 * live chapter rows; the pure function takes it as a parameter). */
function chapterTitles(): Map<string, string[]> {
  return new Map([
    [
      BOOK_ID,
      chapterArticles().map((c) => c.provenance.title),
    ],
  ]);
}

// A standalone article sharing NOTHING with the book's haystack.
const standalone = makeArticle({
  id: "meditations",
  provenance: {
    title: "Meditations",
    author: "Marcus",
    retrievedAt: "2026-01-01T00:00:00.000Z",
    originalHtmlHash:
      "0000000000000000000000000000000000000000000000000000000000000000",
  },
});

const noFilter: LibraryFilter = { query: "", activeTag: null };

describe("filterLibrary — chapter members never surface standalone (D12-01)", () => {
  it("excludes chapter members even on the empty filter (they render only inside BookRow)", () => {
    const result = filterLibrary([standalone, ...chapterArticles()], noFilter);
    expect(result).toEqual([standalone]);
  });

  it("a query matching a CHAPTER title returns no standalone chapter row", () => {
    const result = filterLibrary([standalone, ...chapterArticles()], {
      query: "loomings",
      activeTag: null,
    });
    expect(result).toEqual([]);
  });
});

describe("filterBooks — book title + author + chapter-title haystack (D12-04)", () => {
  it("empty filter returns every book", () => {
    const other = makeBook({ id: "epub-other000333", title: "Another Book" });
    expect(filterBooks([makeBook(), other], noFilter, chapterTitles())).toEqual(
      [makeBook(), other],
    );
  });

  it("book TITLE match surfaces the book", () => {
    expect(
      filterBooks([makeBook()], { query: "synthetic", activeTag: null }, chapterTitles()),
    ).toEqual([makeBook()]);
    expect(
      filterBooks([makeBook()], { query: "zzz-no-match", activeTag: null }, chapterTitles()),
    ).toEqual([]);
  });

  it("book AUTHOR match surfaces the book", () => {
    expect(
      filterBooks([makeBook()], { query: "ada author", activeTag: null }, chapterTitles()),
    ).toEqual([makeBook()]);
  });

  it("CHAPTER title match surfaces the BOOK (never a chapter row)", () => {
    // "find the essay collection containing the essay" — the query matches
    // only a chapter's provenance title, and the surfaced unit is the book.
    expect(
      filterBooks([makeBook()], { query: "the gauntlet", activeTag: null }, chapterTitles()),
    ).toEqual([makeBook()]);
  });

  it("chapter titles absent from the map simply do not match (partial import tolerance)", () => {
    const empty = new Map<string, string[]>();
    expect(
      filterBooks([makeBook()], { query: "the gauntlet", activeTag: null }, empty),
    ).toEqual([]);
    // …but the book's own title still matches.
    expect(
      filterBooks([makeBook()], { query: "synthetic", activeTag: null }, empty),
    ).toEqual([makeBook()]);
  });
});

describe("tag filtering — book tags surface the BOOK row only (D12-04)", () => {
  it("a tag on the book surfaces the book via book.tags", () => {
    const tagged = makeBook({ tags: ["essays"] });
    expect(
      filterBooks([makeBook(), tagged], { query: "", activeTag: "essays" }, chapterTitles()),
    ).toEqual([tagged]);
  });

  it("an untagged book is filtered out under an active tag", () => {
    expect(
      filterBooks([makeBook()], { query: "", activeTag: "essays" }, chapterTitles()),
    ).toEqual([]);
  });

  it("standalone article tag behavior is unchanged (D8-07 regression)", () => {
    const taggedStandalone = makeArticle({
      id: "plato",
      provenance: {
        title: "Plato's Republic",
        retrievedAt: "2026-01-01T00:00:00.000Z",
        originalHtmlHash:
          "0000000000000000000000000000000000000000000000000000000000000000",
      },
      tags: ["essays"],
    });
    expect(
      filterLibrary([standalone, taggedStandalone], {
        query: "",
        activeTag: "essays",
      }),
    ).toEqual([taggedStandalone]);
  });
});

describe("the composed view — empty filter returns everything (books + standalone)", () => {
  it("books + standalone together, chapters partitioned away", () => {
    const articles = [standalone, ...chapterArticles()];
    const books = [makeBook()];
    expect(filterLibrary(articles, noFilter)).toEqual([standalone]);
    expect(filterBooks(books, noFilter, chapterTitles())).toEqual(books);
  });

  it("a chapter-title query surfaces the book AND excludes every article", () => {
    // The composed LibraryView result under query "loomings": the book row
    // only — no standalone rows, no chapter rows.
    const articles = [standalone, ...chapterArticles()];
    const books = [makeBook()];
    const filter = { query: "loomings", activeTag: null };
    expect(filterLibrary(articles, filter)).toEqual([]);
    expect(filterBooks(books, filter, chapterTitles())).toEqual(books);
  });
});
