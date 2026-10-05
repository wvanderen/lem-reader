// tests/unit/library/library-order.test.ts
// Issue #114 — the Recently-added order truth table for libraryOrder.ts
// (ONE pure merged order over standalone articles + books; the store-seam
// discipline: no React, no Dexie — the reading-state.test.ts fixture
// discipline: schema-parse builders, boundary-named cases).
//
// Issue #115 extends the truth table with the Title and Recently-opened
// orders (the dispatching orderLibraryEntries call; the two-argument call
// stays byte-stable).
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
//   - #115 Title: reader-visible effective titles ascending; override wins;
//     ties deterministic (addedAt descending, undated last, stable).
//   - #115 Recently opened: latest activity descending (article location /
//     book's latest chapter location); offset-zero counts as opened; the
//     never-opened tail rides the Recently-added order.
import { describe, expect, it } from "vitest";
import { orderLibraryEntries } from "../../../src/ingestion/library/libraryOrder";
import { ArticleSchema, BookSchema, LocationRecordSchema } from "../../../src/content/schema";
import type { CanonicalArticle, Book, LocationRecord } from "../../../src/content/schema";
import { filterBooks, filterLibrary } from "../../../src/ingestion/library/libraryFilter";
import { articleReadingState, bookReadingState } from "../../../src/ingestion/library/readingState";
import type { ReadingState } from "../../../src/ingestion/library/readingState";

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
    blocks: [{ kind: "paragraph", content: [{ text: `Body of ${id}.`, marks: [] }] }],
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
  return entry.kind === "article" ? `a:${entry.article.id}` : `b:${entry.book.id}`;
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
  ].map((a, i) => (i % 2 === 0 ? { ...a, tags: ["essay"] } : a));
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

describe("variable-precision fractions compare chronologically (issue #114)", () => {
  it("'.5Z' sorts NEWER than '.55Z' (raw strings would lie: Z > 5)", () => {
    const entries = orderLibraryEntries(
      [
        makeArticle("half", "2026-09-02T00:00:00.5Z"),
        makeArticle("fifty-five", "2026-09-02T00:00:00.55Z"),
      ],
      [],
    );
    // 0.5s < 0.55s, so descending = .55Z first, .5Z second.
    expect(labels(entries)).toEqual(["a:fifty-five", "a:half"]);
  });

  it("whole-second and .000Z stamps at the same instant tie — stable order, articles before books", () => {
    const entries = orderLibraryEntries(
      [makeArticle("whole", "2026-09-02T00:00:00Z")],
      [makeBook("mills", "2026-09-02T00:00:00.000Z")],
    );
    expect(labels(entries)).toEqual(["a:whole", "b:mills"]);
  });
});

describe("orderLibraryEntries composes with the reading-state views (issue #114)", () => {
  // The LibraryView pipeline per view: articleReadingState/bookReadingState
  // membership → filterLibrary/filterBooks → orderLibraryEntries. This pins
  // the spec row "All, Unread, In progress, and Finished each show matching
  // articles and books in one descending added-date order" at the composition
  // level (the membership derivations themselves are the reading-state.test.ts
  // truth table).
  const DATED = {
    finished: "2026-09-05T00:00:00.000Z",
    bookUnread: "2026-09-04T00:00:00.000Z",
    inProgress: "2026-09-03T00:00:00.000Z",
    articleUnread: "2026-09-01T00:00:00.000Z",
  };

  function statefulArticle(id: string, addedAt: string): CanonicalArticle {
    return makeArticle(id, addedAt);
  }

  function loc(articleId: string, offset: number): LocationRecord {
    return LocationRecordSchema.parse({
      schemaVersion: 1,
      articleId,
      revision: 1,
      graphemeOffset: offset,
      savedAt: "2026-09-06T00:00:00.000Z",
    });
  }

  const finishedArticle = statefulArticle("vs-finished", DATED.finished);
  const inProgressArticle = statefulArticle("vs-progress", DATED.inProgress);
  const unreadArticle = statefulArticle("vs-unread", DATED.articleUnread);
  // A book whose single chapter has a 50% location → in-progress.
  const progressBook = makeBook("vs-book-progress", DATED.bookUnread);

  const locations: LocationRecord[] = [
    loc("vs-finished", 20), // offset == total → finished
    loc("vs-progress", 9), // 45% → in-progress
    loc("vs-book-progress-c00", 10), // 50% → book in-progress
  ];
  const latest = new Map(locations.map((l) => [l.articleId, l] as const));
  const totals = new Map<string, number>([
    ["vs-finished", 20],
    ["vs-progress", 20],
    ["vs-unread", 20],
    ["vs-book-progress-c00", 20],
  ]);
  const textLengthOf = (id: string): number | undefined => totals.get(id);
  const articleState = (a: CanonicalArticle): ReadingState =>
    articleReadingState(latest.get(a.id), totals.get(a.id) ?? 0);
  const bookState = (b: Book): ReadingState => bookReadingState(b, latest, textLengthOf);

  const allArticles = [finishedArticle, inProgressArticle, unreadArticle];
  const allBooks = [progressBook];

  it("Unread shows only the never-opened article (the book is started → in-progress)", () => {
    const viewArticles = allArticles.filter((a) => articleState(a) === "unread");
    const viewBooks = allBooks.filter((b) => bookState(b) === "unread");
    expect(labels(orderLibraryEntries(viewArticles, viewBooks))).toEqual(["a:vs-unread"]);
  });

  it("In progress shows the in-progress article + book in descending order", () => {
    const viewArticles = allArticles.filter((a) => articleState(a) === "in-progress");
    const viewBooks = allBooks.filter((b) => bookState(b) === "in-progress");
    expect(labels(orderLibraryEntries(viewArticles, viewBooks))).toEqual([
      "b:vs-book-progress",
      "a:vs-progress",
    ]);
  });

  it("Finished shows the finished article alone", () => {
    const viewArticles = allArticles.filter((a) => articleState(a) === "finished");
    const viewBooks = allBooks.filter((b) => bookState(b) === "finished");
    expect(labels(orderLibraryEntries(viewArticles, viewBooks))).toEqual(["a:vs-finished"]);
  });

  it("All interleaves every member in one descending order", () => {
    expect(labels(orderLibraryEntries(allArticles, allBooks))).toEqual([
      "a:vs-finished",
      "b:vs-book-progress",
      "a:vs-progress",
      "a:vs-unread",
    ]);
  });
});

// ── Issue #115 — the Title order ─────────────────────────────────────────────
// Reader-visible EFFECTIVE titles ascending (effectiveTitle — the reader-
// owned override wins, D17-09); deterministic ties fall through to the
// Recently-added comparator (addedAt descending, undated last), and full
// ties keep stable input order (articles before books). The dispatching
// call passes "title" as the third argument.

describe("orderLibraryEntries by title (issue #115)", () => {
  it("orders mixed articles + books by title ascending", () => {
    const entries = orderLibraryEntries(
      [
        makeArticle("mid", "2026-09-02T00:00:00.000Z", {
          provenance: {
            sourceUrl: "https://example.com/mid",
            title: "Middling essay",
            retrievedAt: "2026-09-01T00:00:00.000Z",
            originalHtmlHash: "sha256:" + "0".repeat(64),
          },
        }),
        makeArticle("first", "2026-09-04T00:00:00.000Z", {
          provenance: {
            sourceUrl: "https://example.com/first",
            title: "A first essay",
            retrievedAt: "2026-09-01T00:00:00.000Z",
            originalHtmlHash: "sha256:" + "0".repeat(64),
          },
        }),
      ],
      [
        makeBook("last-book", "2026-09-03T00:00:00.000Z"),
        makeBook("zebra-book", "2026-08-30T00:00:00.000Z"),
      ].map((b) =>
        b.id === "zebra-book"
          ? {
              ...b,
              title: "Zebra anthology",
            }
          : { ...b, title: "Later anthology" },
      ),
    );
    // Added order (Zebra, first/mid, Later) is irrelevant — title governs:
    // "A first essay" < "Later anthology" < "Middling essay" < "Zebra anthology".
    expect(labels(entries)).toEqual(["a:first", "b:last-book", "a:mid", "b:zebra-book"]);
  });

  it("sorts by the READER-VISIBLE effective title — the readerTitle override wins over the canonical title", () => {
    const entries = orderLibraryEntries(
      [
        // Canonical title "Article aaa" but renamed to "Zebra renamed" —
        // the row must sort under Z, never under its old name.
        makeArticle("renamed", "2026-09-01T00:00:00.000Z", {
          readerTitle: "Zebra renamed",
        }),
        makeArticle("plain", "2026-09-02T00:00:00.000Z", {
          provenance: {
            sourceUrl: "https://example.com/plain",
            title: "Article plain",
            retrievedAt: "2026-09-01T00:00:00.000Z",
            originalHtmlHash: "sha256:" + "0".repeat(64),
          },
        }),
      ],
      [],
    );
    expect(labels(entries)).toEqual(["a:plain", "a:renamed"]);
  });

  it("breaks title ties deterministically through addedAt descending (newer first)", () => {
    const entries = orderLibraryEntries(
      [
        makeArticle("same-older", "2026-09-01T00:00:00.000Z", {
          provenance: {
            sourceUrl: "https://example.com/same",
            title: "Twin titles",
            retrievedAt: "2026-09-01T00:00:00.000Z",
            originalHtmlHash: "sha256:" + "0".repeat(64),
          },
        }),
        makeArticle("same-newer", "2026-09-03T00:00:00.000Z", {
          provenance: {
            sourceUrl: "https://example.com/same",
            title: "Twin titles",
            retrievedAt: "2026-09-01T00:00:00.000Z",
            originalHtmlHash: "sha256:" + "0".repeat(64),
          },
        }),
      ],
      [],
    );
    expect(labels(entries)).toEqual(["a:same-newer", "a:same-older"]);
  });

  it("an undated article with a tied title follows the dated one (no invented date)", () => {
    const entries = orderLibraryEntries(
      [
        makeArticle("undated-twin", undefined, {
          provenance: {
            sourceUrl: "https://example.com/twin",
            title: "Twin titles",
            retrievedAt: "2026-09-01T00:00:00.000Z",
            originalHtmlHash: "sha256:" + "0".repeat(64),
          },
        }),
        makeArticle("dated-twin", "2026-09-01T00:00:00.000Z", {
          provenance: {
            sourceUrl: "https://example.com/twin",
            title: "Twin titles",
            retrievedAt: "2026-09-01T00:00:00.000Z",
            originalHtmlHash: "sha256:" + "0".repeat(64),
          },
        }),
      ],
      [],
    );
    expect(labels(entries)).toEqual(["a:dated-twin", "a:undated-twin"]);
  });

  it("full ties (equal title AND equal addedAt) stay stable: articles before books, input order within a kind", () => {
    const entries = orderLibraryEntries(
      [
        makeArticle("twin-b", "2026-09-02T00:00:00.000Z", {
          provenance: {
            sourceUrl: "https://example.com/twin",
            title: "Shared name",
            retrievedAt: "2026-09-01T00:00:00.000Z",
            originalHtmlHash: "sha256:" + "0".repeat(64),
          },
        }),
        makeArticle("twin-a", "2026-09-02T00:00:00.000Z", {
          provenance: {
            sourceUrl: "https://example.com/twin",
            title: "Shared name",
            retrievedAt: "2026-09-01T00:00:00.000Z",
            originalHtmlHash: "sha256:" + "0".repeat(64),
          },
        }),
      ],
      [makeBook("twin-book", "2026-09-02T00:00:00.000Z")].map((b) => ({
        ...b,
        title: "Shared name",
      })),
    );
    expect(labels(entries)).toEqual(["a:twin-b", "a:twin-a", "b:twin-book"]);
  });
});

// ── Issue #115 — the Recently-opened order ───────────────────────────────────
// Latest reading activity descending: an article's latest saved location,
// a book's latest CHAPTER location (max savedAt across chapters). PRESENCE
// is the opened predicate — an offset-zero location counts (D14-18 Unread
// parity). Never-opened items follow ALL opened ones in the Recently-added
// order. Equal stamps tie stably (articles before books).

describe("orderLibraryEntries by recently-opened (issue #115)", () => {
  function loc(articleId: string, offset: number, savedAt: string): LocationRecord {
    return LocationRecordSchema.parse({
      schemaVersion: 1,
      articleId,
      revision: 1,
      graphemeOffset: offset,
      savedAt,
    });
  }

  function ctx(...locations: LocationRecord[]): {
    latestLocationByArticleId: Map<string, LocationRecord>;
  } {
    return { latestLocationByArticleId: new Map(locations.map((l) => [l.articleId, l] as const)) };
  }

  it("orders fractional activity after whole seconds, including a book's latest chapter", () => {
    const entries = orderLibraryEntries(
      [makeArticle("whole"), makeArticle("middle")],
      [makeBook("book", "2026-09-01T00:00:00Z", ["whole-chapter", "later-chapter"])],
      "recently-opened",
      ctx(
        loc("whole", 0, "2026-09-06T00:00:00Z"),
        loc("middle", 0, "2026-09-06T00:00:00.00005Z"),
        loc("whole-chapter", 0, "2026-09-06T00:00:00Z"),
        loc("later-chapter", 0, "2026-09-06T00:00:00.0001Z"),
      ),
    );
    expect(labels(entries)).toEqual(["b:book", "a:middle", "a:whole"]);
  });

  it("keeps equal instants stable across absent and explicit fractions", () => {
    const entries = orderLibraryEntries(
      [makeArticle("fraction"), makeArticle("whole")],
      [makeBook("book", "2026-09-01T00:00:00Z")],
      "recently-opened",
      ctx(
        loc("fraction", 0, "2026-09-06T00:00:00.000Z"),
        loc("whole", 0, "2026-09-06T00:00:00Z"),
        loc("book-c00", 0, "2026-09-06T00:00:00Z"),
      ),
    );
    expect(labels(entries)).toEqual(["a:fraction", "a:whole", "b:book"]);
  });

  it("orders opened items by latest activity descending, articles and books interleaved", () => {
    const entries = orderLibraryEntries(
      [makeArticle("article-opened", "2026-09-01T00:00:00.000Z")],
      [makeBook("book-opened", "2026-09-04T00:00:00.000Z")],
      "recently-opened",
      ctx(
        loc("article-opened", 5, "2026-09-06T00:00:00.000Z"),
        loc("book-opened-c00", 2, "2026-09-05T00:00:00.000Z"),
      ),
    );
    // The ARTICLE opened most recently wins despite the book being added
    // later — activity, not addedAt, governs this order.
    expect(labels(entries)).toEqual(["a:article-opened", "b:book-opened"]);
  });

  it("a book's sort key is its LATEST chapter location (max savedAt across chapters)", () => {
    const book = makeBook("chatty", "2026-09-01T00:00:00.000Z", [
      "chatty-c00",
      "chatty-c01",
      "chatty-c02",
    ]);
    const entries = orderLibraryEntries(
      [makeArticle("rival", "2026-09-02T00:00:00.000Z")],
      [book],
      "recently-opened",
      ctx(
        loc("rival", 5, "2026-09-05T00:00:00.000Z"),
        loc("chatty-c00", 5, "2026-09-02T00:00:00.000Z"),
        loc("chatty-c02", 5, "2026-09-07T00:00:00.000Z"), // the latest
        loc("chatty-c01", 5, "2026-09-03T00:00:00.000Z"),
      ),
    );
    // The book's c02 activity (09-07) beats the rival article (09-05).
    expect(labels(entries)).toEqual(["b:chatty", "a:rival"]);
  });

  it("an offset-ZERO location counts as opened (D14-18 Unread parity)", () => {
    const entries = orderLibraryEntries(
      [
        makeArticle("zero-opened", "2026-09-01T00:00:00.000Z"),
        makeArticle("never", "2026-09-02T00:00:00.000Z"),
      ],
      [],
      "recently-opened",
      ctx(loc("zero-opened", 0, "2026-09-06T00:00:00.000Z")),
    );
    // Opened at offset 0 → sorted among the opened; the never-opened row
    // follows the tail even though its addedAt is NEWER.
    expect(labels(entries)).toEqual(["a:zero-opened", "a:never"]);
  });

  it("never-opened items follow ALL opened ones in the Recently-added order (addedAt descending)", () => {
    const entries = orderLibraryEntries(
      [
        makeArticle("new-never", "2026-09-08T00:00:00.000Z"),
        makeArticle("opened", "2026-09-02T00:00:00.000Z"),
        makeArticle("old-never", "2026-09-03T00:00:00.000Z"),
        makeArticle("legacy-never"), // undated — the tail's tail
      ],
      [makeBook("never-book", "2026-09-05T00:00:00.000Z")],
      "recently-opened",
      ctx(loc("opened", 4, "2026-09-06T00:00:00.000Z")),
    );
    // One opened item first, then the never-opened tail by descending
    // addedAt with the undated legacy row last.
    expect(labels(entries)).toEqual([
      "a:opened",
      "a:new-never",
      "b:never-book",
      "a:old-never",
      "a:legacy-never",
    ]);
  });

  it("a book whose chapters were never opened is never-opened (presence per chapter, not per book row)", () => {
    const entries = orderLibraryEntries(
      [],
      [makeBook("untouched", "2026-09-01T00:00:00.000Z")],
      "recently-opened",
      ctx(loc("some-other-article", 1, "2026-09-06T00:00:00.000Z")),
    );
    expect(labels(entries)).toEqual(["b:untouched"]);
  });

  it("equal activity stamps tie stably — articles before books, input order within a kind", () => {
    const entries = orderLibraryEntries(
      [
        makeArticle("tie-a", "2026-09-01T00:00:00.000Z"),
        makeArticle("tie-b", "2026-09-02T00:00:00.000Z"),
      ],
      [makeBook("tie-book", "2026-09-03T00:00:00.000Z")],
      "recently-opened",
      ctx(
        loc("tie-a", 1, "2026-09-06T00:00:00.000Z"),
        loc("tie-b", 1, "2026-09-06T00:00:00.000Z"),
        loc("tie-book-c00", 1, "2026-09-06T00:00:00.000Z"),
      ),
    );
    expect(labels(entries)).toEqual(["a:tie-a", "a:tie-b", "b:tie-book"]);
  });

  it("degrades to the Recently-added order when the context is absent (defensive, never a crash)", () => {
    const entries = orderLibraryEntries(
      [makeArticle("b", "2026-09-02T00:00:00.000Z")],
      [makeBook("a", "2026-09-03T00:00:00.000Z")],
      "recently-opened",
      undefined,
    );
    expect(labels(entries)).toEqual(["b:a", "a:b"]);
  });

  it("composes with the reading-state views: the Finished view shows recently-finished first", () => {
    // A finished view holding two finished items: the one whose location
    // savedAt is later leads regardless of addedAt.
    const olderAdded = makeArticle("fin-old", "2026-09-01T00:00:00.000Z");
    const newerAdded = makeArticle("fin-new", "2026-09-05T00:00:00.000Z");
    const view = [olderAdded, newerAdded];
    const entries = orderLibraryEntries(
      view,
      [],
      "recently-opened",
      ctx(
        loc("fin-old", 20, "2026-09-09T00:00:00.000Z"),
        loc("fin-new", 20, "2026-09-07T00:00:00.000Z"),
      ),
    );
    expect(labels(entries)).toEqual(["a:fin-old", "a:fin-new"]);
  });
});
