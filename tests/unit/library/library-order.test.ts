// tests/unit/library/library-order.test.ts
// Issue #114 — the Recently-added order truth table for libraryOrder.ts
// (ONE pure merged order over standalone articles + books; the store-seam
// discipline: no React, no Dexie — the reading-state.test.ts fixture
// discipline: schema-parse builders, boundary-named cases).
//
// Acceptance rows pinned here:
//   - Articles + books interleave in ONE descending addedAt order (every
//     reading-state view; chapters never enter the list — they stay inside
//     their BookRow).
//   - Equal dates keep stable relative order: within a kind, input order;
//     across kinds, articles before books (the merged input order).
//   - Undated rows (legacy articles + bundled fixtures) follow ALL dated
//     items in stable relative order; no historical date is invented (the
//     row keeps addedAt === undefined — the order is render-time, never a
//     write-back).
//   - Search/tag filters narrow the view without changing its order: the
//     filter composition (filterLibrary/filterBooks, both Array.filter-based
//     and therefore order-preserving) upstream of orderLibraryEntries yields
//     the same relative sequence as ordering first and filtering the merged
//     list.
import { describe, expect, it } from "vitest";
import { orderLibraryEntries } from "../../../src/ingestion/library/libraryOrder";
import { ArticleSchema, BookSchema } from "../../../src/content/schema";
import type { CanonicalArticle, Book } from "../../../src/content/schema";
import { filterBooks, filterLibrary } from "../../../src/ingestion/library/libraryFilter";

/** A minimal valid standalone article; addedAt added only when supplied. */
function makeArticle(
  id: string,
  addedAt?: string,
  overrides: Partial<Parameters<typeof ArticleSchema.parse>[0]> = {},
): CanonicalArticle {
  return ArticleSchema.parse({
    id,
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: `https://example.com/${id}`,
      title: `Article ${id}`,
      retrievedAt: "2026-09-01T00:00:00.000Z",
      originalHtmlHash: "sha256:" + "0".repeat(64),
    },
    blocks: [
      { kind: "paragraph", content: [{ text: `Body of ${id}.`, marks: [] }] },
    ],
    footnotes: [],
    ingestionMeta: {
      source: "url",
      origin: "url",
      sourceUrl: `https://example.com/${id}`,
      originalHtmlHash: "sha256:" + "0".repeat(64),
      fetchedAt: "2026-09-01T00:00:00.000Z",
      extractionConfidence: "high",
      extractionWarnings: [],
    },
    ...(addedAt !== undefined ? { addedAt } : {}),
    ...overrides,
  });
}

/** A minimal valid Book (addedAt REQUIRED by BookSchema). */
function makeBook(id: string, addedAt: string, chapterIds: string[] = [`${id}-c00`]): Book {
  return BookSchema.parse({
    id,
    title: `Book ${id}`,
    authors: ["An Author"],
    language: "en",
    chapterArticleIds: chapterIds,
    skippedChapterCount: 0,
    source: "epub-upload",
    originalFileHash: "sha256:" + "1".repeat(64),
    addedAt,
  });
}

/** Entry label for readable expectations: `a:<id>` / `b:<id>`. */
function label(entry: ReturnType<typeof orderLibraryEntries>[number]): string {
  return entry.kind === "article"
    ? `a:${entry.article.id}`
    : `b:${entry.book.id}`;
}
function labels(entries: ReturnType<typeof orderLibraryEntries>): string[] {
  return entries.map(label);
}

describe("orderLibraryEntries (issue #114 — Recently added sorts articles and books together)", () => {
  it("interleaves articles and books in ONE descending addedAt order", () => {
    const entries = orderLibraryEntries(
      [
        makeArticle("old-article", "2026-09-01T00:00:00.000Z"),
        makeArticle("new-article", "2026-09-04T00:00:00.000Z"),
      ],
      [
        makeBook("mid-book", "2026-09-03T00:00:00.000Z"),
        makeBook("older-book", "2026-08-30T00:00:00.000Z"),
      ],
    );
    expect(labels(entries)).toEqual([
      "a:new-article",
      "b:mid-book",
      "a:old-article",
      "b:older-book",
    ]);
  });

  it("keeps stable relative order on EQUAL dates (input order within a kind, articles before books across kinds)", () => {
    const entries = orderLibraryEntries(
      [
        makeArticle("first-tied", "2026-09-02T00:00:00.000Z"),
        makeArticle("second-tied", "2026-09-02T00:00:00.000Z"),
      ],
      [makeBook("tied-book", "2026-09-02T00:00:00.000Z")],
    );
    expect(labels(entries)).toEqual(["a:first-tied", "a:second-tied", "b:tied-book"]);
  });

  it("places undated legacy articles AFTER all dated items in stable relative order", () => {
    const entries = orderLibraryEntries(
      [
        makeArticle("legacy-two"), // bundled fixture / pre-#114 row — no addedAt
        makeArticle("dated", "2026-09-01T00:00:00.000Z"),
        makeArticle("legacy-one"), // stable = input order preserved
      ],
      [makeBook("dated-book", "2026-08-31T00:00:00.000Z")],
    );
    expect(labels(entries)).toEqual(["a:dated", "b:dated-book", "a:legacy-two", "a:legacy-one"]);
  });

  it("never invents a date: undated rows keep addedAt undefined (render-time order, not a write-back)", () => {
    const [entry] = orderLibraryEntries([makeArticle("legacy")], []);
    expect(entry?.kind).toBe("article");
    if (entry?.kind === "article") {
      expect(entry.article.addedAt).toBeUndefined();
    }
  });

  it("does not mutate the input arrays", () => {
    const articles = [
      makeArticle("b", "2026-09-02T00:00:00.000Z"),
      makeArticle("a", "2026-09-03T00:00:00.000Z"),
    ];
    const books = [makeBook("book", "2026-09-01T00:00:00.000Z")];
    const articlesCopy = [...articles];
    const booksCopy = [...books];
    orderLibraryEntries(articles, books);
    expect(articles).toEqual(articlesCopy);
    expect(books).toEqual(booksCopy);
  });

  it("returns a fresh array even when nothing needs ordering", () => {
    const articles = [makeArticle("only", "2026-09-01T00:00:00.000Z")];
    const entries = orderLibraryEntries(articles, []);
    expect(entries).not.toBe(articles);
    expect(labels(entries)).toEqual(["a:only"]);
  });

  it("handles the empty library", () => {
    expect(orderLibraryEntries([], [])).toEqual([]);
  });
});

describe("filter composition preserves the Recently-added order (issue #114)", () => {
  // The LibraryView pipeline: state filter → filterLibrary/filterBooks →
  // orderLibraryEntries. Filtering each half first and then ordering must
  // produce the same relative sequence as ordering the whole view and
  // filtering the merged list — the "filters narrow without changing order"
  // acceptance row.
  const articles = [
    makeArticle("tagged-new", "2026-09-05T00:00:00.000Z"),
    makeArticle("plain-mid", "2026-09-03T00:00:00.000Z"),
    makeArticle("tagged-old", "2026-09-01T00:00:00.000Z"),
  ].map((a, i) =>
    i % 2 === 0 ? { ...a, tags: ["essay"] } : a,
  );
  const books = [
    makeBook("tagged-book", "2026-09-04T00:00:00.000Z"),
    makeBook("plain-book", "2026-08-30T00:00:00.000Z"),
  ].map((b, i) => (i === 0 ? { ...b, tags: ["essay"] } : b));

  it("narrowing by tag keeps the merged descending order", () => {
    // Filter halves first (the LibraryView pipeline)…
    const visibleArticles = filterLibrary(articles, { query: "", activeTag: "essay" });
    const visibleBooks = filterBooks(books, { query: "", activeTag: "essay" }, new Map());
    const filtered = orderLibraryEntries(visibleArticles, visibleBooks);
    // …equals ordering the whole view then keeping only tagged entries.
    const whole = orderLibraryEntries(articles, books).filter((entry) =>
      entry.kind === "article"
        ? (entry.article.tags ?? []).includes("essay")
        : (entry.book.tags ?? []).includes("essay"),
    );
    expect(labels(filtered)).toEqual(labels(whole));
    expect(labels(filtered)).toEqual(["a:tagged-new", "b:tagged-book", "a:tagged-old"]);
  });

  it("narrowing by query keeps the merged descending order", () => {
    // One shared query over BOTH halves (the real UI's single search box):
    // "tagged" matches two articles + one book, dropping the rest.
    const visibleArticles = filterLibrary(articles, { query: "tagged", activeTag: null });
    const visibleBooks = filterBooks(books, { query: "tagged", activeTag: null }, new Map());
    const filtered = orderLibraryEntries(visibleArticles, visibleBooks);
    expect(labels(filtered)).toEqual(["a:tagged-new", "b:tagged-book", "a:tagged-old"]);
  });
});
