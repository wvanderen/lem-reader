// tests/unit/library/library-snapshot.test.ts
// Issue #3 — the LibrarySnapshot module truths. ONE load returns a
// consistent snapshot (standalone articles, chapters by book, the
// latest-location fold, the grapheme-total fold, tags) and ONE call
// invalidates it after writes. This suite pins the folds at the module
// seam — including the savedAt-tie discipline — over the real store
// reads (fake-indexeddb), so the LibraryView/strip/BookRow consumers
// cannot drift from what the stores actually return.
//
// Issue #8 — the snapshot also carries EVERY persisted highlight + note
// (the review view's join input and the highlights export's payload), so
// those consumers cannot drift either.
//
// Harness mirrors tests/unit/library/library-source.test.ts:
// fake-indexeddb via Dexie.dependencies at module top-level,
// wipeDatabase beforeEach, lazy module imports after the install.
import { beforeEach, describe, expect, it } from "vitest";
import {
  ArticleSchema,
  BookSchema,
  HighlightRecordSchema,
  LocationRecordSchema,
  NoteRecordSchema,
  ReadingSessionRecordSchema,
} from "../../../src/content/schema";
import type {
  Book,
  CanonicalArticle,
  HighlightRecord,
  LocationRecord,
  NoteRecord,
  ReadingSessionRecord,
} from "../../../src/content/schema";
import fakeIndexedDB, { IDBKeyRange } from "fake-indexeddb";
import { Dexie } from "dexie";

// Dexie 4 captures `indexedDB` + `IDBKeyRange` on `Dexie.dependencies` at
// dexie-module-load time. Install BOTH onto `Dexie.dependencies` (the
// Dexie-internal read path) AND `globalThis` (the direct-read path Dexie
// uses for deleteDatabase) — the documented Dexie + Node test pattern.
Dexie.dependencies.indexedDB = fakeIndexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;
(globalThis as { indexedDB?: typeof fakeIndexedDB }).indexedDB = fakeIndexedDB;
(globalThis as { IDBKeyRange?: typeof IDBKeyRange }).IDBKeyRange = IDBKeyRange;

async function wipeDatabase(): Promise<void> {
  await new Promise<void>((resolve) => {
    const idb = (globalThis as { indexedDB?: typeof fakeIndexedDB }).indexedDB;
    if (!idb) return resolve();
    const req = idb.deleteDatabase("lem-reader");
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

// Lazy imports — the modules under test are imported AFTER the
// fake-indexeddb install so their module bodies see the populated
// Dexie.dependencies.
async function loadSnapshot() {
  return await import("../../../src/ingestion/library/librarySnapshot");
}
async function loadLibrarySource() {
  return await import("../../../src/ingestion/LibrarySource");
}
async function loadBooksStore() {
  return await import("../../../src/persistence/booksStore");
}
async function loadLocationStore() {
  return await import("../../../src/persistence/locationStore");
}
async function loadDb() {
  return await import("../../../src/persistence/db");
}
async function loadNormalizeText() {
  return await import("../../../src/content/normalizeText");
}
async function loadReadingPosition() {
  return await import("../../../src/reader/readingPosition");
}

// ── Sample builders (schema-validated at construction) ──────────────────────

type ArticleInput = Parameters<typeof ArticleSchema.parse>[0];

function sampleArticle(
  overrides: Partial<ArticleInput> = {},
): CanonicalArticle {
  return ArticleSchema.parse({
    id: "snapshot-article",
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: "https://example.com/article",
      title: "Sample Article",
      author: "An Author",
      retrievedAt: "2026-09-01T00:00:00.000Z",
      originalHtmlHash: "sha256:" + "0".repeat(64),
    },
    blocks: [
      { kind: "paragraph", content: [{ text: "Body text.", marks: [] }] },
    ],
    footnotes: [],
    ingestionMeta: {
      source: "url",
      origin: "url",
      sourceUrl: "https://example.com/article",
      originalHtmlHash: "sha256:" + "0".repeat(64),
      fetchedAt: "2026-09-01T00:00:00.000Z",
      extractionConfidence: "high",
      extractionWarnings: [],
    },
    ...overrides,
  });
}

function sampleChapter(
  id: string,
  bookId: string,
  overrides: Partial<ArticleInput> = {},
): CanonicalArticle {
  return sampleArticle({
    id,
    provenance: {
      sourceUrl: undefined,
      title: id,
      retrievedAt: "2026-09-01T00:00:00.000Z",
      originalHtmlHash: "sha256:" + "c".repeat(64),
    },
    ingestionMeta: {
      source: "epub-chapter",
      origin: "upload",
      originalHtmlHash: "sha256:" + "c".repeat(64),
      extractionConfidence: "high",
      extractionWarnings: [],
      bookId,
      chapterIndex: 0,
    },
    ...overrides,
  });
}

type BookInput = Parameters<typeof BookSchema.parse>[0];

function sampleBook(overrides: Partial<BookInput> = {}) {
  return BookSchema.parse({
    id: "epub-abc123def456",
    title: "A Sample Book",
    authors: ["An Author"],
    language: "en",
    chapterArticleIds: ["epub-abc123def456-c00", "epub-abc123def456-c01"],
    skippedChapterCount: 0,
    source: "epub-upload",
    originalFileHash: "sha256:" + "b".repeat(64),
    addedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  });
}

function sampleLocation(
  articleId: string,
  revision: number,
  graphemeOffset: number,
  savedAt: string,
): LocationRecord {
  return LocationRecordSchema.parse({
    schemaVersion: 1,
    articleId,
    revision,
    graphemeOffset,
    savedAt,
  });
}

function sampleHighlight(articleId: string, id = "hl-1"): HighlightRecord {
  return HighlightRecordSchema.parse({
    schemaVersion: 1,
    id,
    articleId,
    revision: 1,
    position: { start: 0, end: 4 },
    quote: { prefix: "", exact: "Body", suffix: " text." },
    createdAt: "2026-09-10T00:00:00.000Z",
  });
}

function sampleNote(highlightId: string, text = "A note."): NoteRecord {
  return NoteRecordSchema.parse({
    schemaVersion: 1,
    id: `note-${highlightId}`,
    highlightId,
    text,
    updatedAt: "2026-09-10T01:00:00.000Z",
  });
}

function sampleSession(
  id: string,
  articleId: string,
): ReadingSessionRecord {
  return ReadingSessionRecordSchema.parse({
    schemaVersion: 1,
    id,
    articleId,
    startedAt: "2026-09-15T10:00:00.000Z",
    endedAt: "2026-09-15T10:05:00.000Z",
    startOffset: 0,
    endOffset: 120,
    activeSeconds: 90,
  });
}

/** Seed one standalone article + one book with two chapters. */
async function seedStandaloneAndBook(): Promise<string> {
  const { dexieLibrarySource } = await loadLibrarySource();
  const { saveBook } = await loadBooksStore();
  const standaloneId = "snapshot-standalone";
  await dexieLibrarySource.save(sampleArticle({ id: standaloneId }));
  const book = sampleBook();
  await saveBook(book, [
    sampleChapter("epub-abc123def456-c00", book.id),
    sampleChapter("epub-abc123def456-c01", book.id, {
      ingestionMeta: {
        source: "epub-chapter",
        origin: "upload",
        originalHtmlHash: "sha256:" + "c".repeat(64),
        extractionConfidence: "high",
        extractionWarnings: [],
        bookId: book.id,
        chapterIndex: 1,
      },
    }),
  ]);
  return standaloneId;
}

describe("loadLibrarySnapshot — partition (Issue #3)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("partitions standalone articles from book chapters (chapters never standalone)", async () => {
    const standaloneId = await seedStandaloneAndBook();
    const { loadLibrarySnapshot } = await loadSnapshot();

    const snapshot = await loadLibrarySnapshot();

    expect(snapshot.standaloneArticles.map((a) => a.id)).toContain(standaloneId);
    for (const article of snapshot.standaloneArticles) {
      expect(article.ingestionMeta?.bookId).toBeUndefined();
    }
    const chapters = snapshot.chaptersByBook.get("epub-abc123def456");
    expect(chapters?.map((c) => c.id)).toEqual([
      "epub-abc123def456-c00",
      "epub-abc123def456-c01",
    ]);
    expect(snapshot.books.map((b) => b.id)).toEqual(["epub-abc123def456"]);
    // Every chapter member appears in exactly one partition arm.
    expect(snapshot.articles.length).toBe(
      snapshot.standaloneArticles.length +
        [...snapshot.chaptersByBook.values()].flat().length,
    );
  });
});

describe("loadLibrarySnapshot — latest-location fold (Issue #3)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("folds the max-savedAt row per article and agrees with latestLocationByArticle", async () => {
    const { dexieLibrarySource } = await loadLibrarySource();
    const { saveLocation } = await loadLocationStore();
    const { latestLocationByArticle } = await loadReadingPosition();
    const { loadLibrarySnapshot } = await loadSnapshot();

    const article = sampleArticle({ id: "located-article" });
    await dexieLibrarySource.save(article);
    // Two rows for one article — the [articleId+revision] compound key means
    // a cross-revision read carries several rows (the D-06 key contract).
    await saveLocation(sampleLocation(article.id, 1, 10, "2026-09-10T00:00:00.000Z"));
    await saveLocation(sampleLocation(article.id, 2, 20, "2026-09-11T00:00:00.000Z"));

    const snapshot = await loadLibrarySnapshot();

    expect(snapshot.latestLocationByArticleId.get(article.id)?.graphemeOffset).toBe(20);
    // Structural agreement with the ONE fold (readingPosition) over the same
    // rows — the module CALLS it; this pins that the indirection holds.
    expect(snapshot.latestLocationByArticleId.get(article.id)).toEqual(
      latestLocationByArticle(snapshot.locations).get(article.id),
    );
    // The raw rows stay available for BookRow/bookProgress derivations.
    expect(snapshot.locations).toHaveLength(2);
  });

  it("on a savedAt TIE the first row in iteration order wins (strict > keeps the incumbent)", async () => {
    const { dexieLibrarySource } = await loadLibrarySource();
    const { saveLocation } = await loadLocationStore();
    const { loadLibrarySnapshot } = await loadSnapshot();

    const article = sampleArticle({ id: "tied-article" });
    await dexieLibrarySource.save(article);
    // Same savedAt, two revisions (the [articleId+revision] compound key
    // orders rows articleId-then-revision, so revision 1 iterates first).
    await saveLocation(sampleLocation(article.id, 1, 11, "2026-09-10T00:00:00.000Z"));
    await saveLocation(sampleLocation(article.id, 2, 22, "2026-09-10T00:00:00.000Z"));

    const snapshot = await loadLibrarySnapshot();

    expect(snapshot.latestLocationByArticleId.get(article.id)?.revision).toBe(1);
    expect(snapshot.latestLocationByArticleId.get(article.id)?.graphemeOffset).toBe(11);
  });
});

describe("loadLibrarySnapshot — grapheme-total fold (Issue #3)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("computes one total per article, agreeing with graphemeClusters(normalizeText(article))", async () => {
    const { dexieLibrarySource } = await loadLibrarySource();
    const { graphemeClusters, normalizeText } = await loadNormalizeText();
    const { loadLibrarySnapshot } = await loadSnapshot();

    await dexieLibrarySource.save(
      sampleArticle({
        id: "counted-article",
        blocks: [
          {
            kind: "paragraph",
            content: [{ text: "Family: 👨‍👩‍👧‍👦 ends here.", marks: [] }],
          },
        ],
      }),
    );

    const snapshot = await loadLibrarySnapshot();
    const article = snapshot.articles.find((a) => a.id === "counted-article");
    expect(article).toBeDefined();
    const expected = graphemeClusters(normalizeText(article!), article!.lang).length;
    // The ZWJ family emoji is ONE grapheme — pins grapheme (not code-unit)
    // counting behind the module.
    expect(snapshot.totalsByArticleId.get("counted-article")).toBe(expected);
    expect(expected).toBeGreaterThan(0);
  });
});

describe("loadLibrarySnapshot — tags fold (Issue #3)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("unions article tags with book tags, localeCompare-sorted", async () => {
    await seedStandaloneAndBook();
    const { setArticleTags } = await import("../../../src/ingestion/library/tagsStore");
    const { setBookTags } = await loadBooksStore();
    const { loadLibrarySnapshot } = await loadSnapshot();

    await setArticleTags("snapshot-standalone", ["zebra", "essay"]);
    await setBookTags("epub-abc123def456", ["mango"]);

    const snapshot = await loadLibrarySnapshot();

    expect(snapshot.tags).toEqual(["essay", "mango", "zebra"]);
  });

  it("derives tags from persisted rows only — bundled fixtures add no chips", async () => {
    const { loadLibrarySnapshot } = await loadSnapshot();

    const snapshot = await loadLibrarySnapshot();

    // The composite article list includes the bundled fixture, but the chip
    // list (loadAllTags discipline) reads persisted rows only.
    expect(snapshot.articles.length).toBeGreaterThan(0);
    expect(snapshot.tags).toEqual([]);
  });
});

describe("loadLibrarySnapshot — annotation records (Issue #8)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("carries every persisted highlight and note (the review/export payload)", async () => {
    const standaloneId = await seedStandaloneAndBook();
    const { saveHighlight } = await import("../../../src/persistence/highlightsStore");
    const { saveNote } = await import("../../../src/persistence/notesStore");
    const { loadLibrarySnapshot } = await loadSnapshot();

    const hlA = sampleHighlight(standaloneId, "hl-a");
    const hlB = sampleHighlight("epub-abc123def456-c00", "hl-b");
    await saveHighlight(hlA);
    await saveHighlight(hlB);
    await saveNote(sampleNote("hl-a"));

    const snapshot = await loadLibrarySnapshot();

    expect(snapshot.highlights.map((h) => h.id)).toEqual(["hl-a", "hl-b"]);
    expect(snapshot.notes.map((n) => n.highlightId)).toEqual(["hl-a"]);
  });

  it("an annotation-free library yields empty arrays (EMPTY snapshot parity)", async () => {
    const { loadLibrarySnapshot } = await loadSnapshot();

    const snapshot = await loadLibrarySnapshot();

    expect(snapshot.highlights).toEqual([]);
    expect(snapshot.notes).toEqual([]);
  });
});

describe("loadLibrarySnapshot — highlight-count fold (issue #76)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("folds highlight rows per articleId, aggregated across revisions and chapters", async () => {
    const standaloneId = await seedStandaloneAndBook();
    const { saveHighlight } = await import("../../../src/persistence/highlightsStore");
    const { loadLibrarySnapshot } = await loadSnapshot();

    await saveHighlight(sampleHighlight(standaloneId, "hl-a1"));
    await saveHighlight(sampleHighlight(standaloneId, "hl-a2"));
    await saveHighlight(sampleHighlight("epub-abc123def456-c00", "hl-b1"));

    const snapshot = await loadLibrarySnapshot();

    expect(snapshot.highlightCountByArticleId.get(standaloneId)).toBe(2);
    expect(snapshot.highlightCountByArticleId.get("epub-abc123def456-c00")).toBe(1);
    // An article with no highlights is simply absent (≥ 1 gates the row entry).
    expect(
      snapshot.highlightCountByArticleId.has("epub-abc123def456-c01"),
    ).toBe(false);
  });

  it("an annotation-free library yields an empty fold", async () => {
    const { loadLibrarySnapshot } = await loadSnapshot();

    const snapshot = await loadLibrarySnapshot();

    expect(snapshot.highlightCountByArticleId.size).toBe(0);
  });
});

describe("loadLibrarySnapshot — corrupt rows (STATE-04 agreement)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("drops corrupt location and book rows without blocking the snapshot", async () => {
    const standaloneId = await seedStandaloneAndBook();
    const { saveLocation } = await loadLocationStore();
    const { loadLibrarySnapshot } = await loadSnapshot();
    const { db } = await loadDb();

    await saveLocation(sampleLocation(standaloneId, 1, 5, "2026-09-10T00:00:00.000Z"));
    // Corrupt location row (missing savedAt) + corrupt book row (empty title)
    // bypass the write seams exactly like tampered storage would.
    await db.location.put({
      schemaVersion: 1,
      articleId: standaloneId,
      revision: 9,
      graphemeOffset: 99,
    } as unknown as LocationRecord);
    await db.books.put({
      id: "epub-corrupt00000",
      title: "",
      language: "en",
      chapterArticleIds: [],
      source: "epub-upload",
      originalFileHash: "sha256:" + "d".repeat(64),
      addedAt: "2026-09-01T00:00:00.000Z",
    } as unknown as Book);

    const snapshot = await loadLibrarySnapshot();

    expect(snapshot.locations).toHaveLength(1);
    expect(snapshot.books.map((b) => b.id)).toEqual(["epub-abc123def456"]);
    expect(snapshot.latestLocationByArticleId.get(standaloneId)?.graphemeOffset).toBe(5);
  });
});

describe("loadLibrarySnapshot — reading sessions (issue #38)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("carries every persisted reading session (the stats strip's payload)", async () => {
    const standaloneId = await seedStandaloneAndBook();
    const { putReadingSession } = await import(
      "../../../src/persistence/readingSessionsStore"
    );
    const { loadLibrarySnapshot } = await loadSnapshot();

    await putReadingSession(sampleSession("visit-1", standaloneId));
    await putReadingSession(sampleSession("visit-2", "epub-abc123def456-c00"));

    const snapshot = await loadLibrarySnapshot();

    expect(snapshot.readingSessions.map((s) => s.id)).toEqual([
      "visit-1",
      "visit-2",
    ]);
  });

  it("a session-free library yields an empty array (EMPTY snapshot parity)", async () => {
    const { loadLibrarySnapshot } = await loadSnapshot();

    const snapshot = await loadLibrarySnapshot();

    expect(snapshot.readingSessions).toEqual([]);
  });

  it("drops corrupt session rows without blocking the snapshot (STATE-04 agreement)", async () => {
    const standaloneId = await seedStandaloneAndBook();
    const { putReadingSession } = await import(
      "../../../src/persistence/readingSessionsStore"
    );
    const { loadLibrarySnapshot } = await loadSnapshot();
    const { db } = await loadDb();

    await putReadingSession(sampleSession("visit-1", standaloneId));
    // Corrupt row (negative activeSeconds) bypasses the write seam exactly
    // like tampered storage would — the store seam drops it on read.
    await db.readingSessions.put({
      schemaVersion: 1,
      id: "visit-corrupt",
      articleId: standaloneId,
      startedAt: "2026-09-15T10:00:00.000Z",
      endedAt: "2026-09-15T10:05:00.000Z",
      startOffset: 0,
      endOffset: 10,
      activeSeconds: -5,
    } as unknown as ReadingSessionRecord);

    const snapshot = await loadLibrarySnapshot();

    expect(snapshot.readingSessions.map((s) => s.id)).toEqual(["visit-1"]);
  });
});

describe("invalidateLibrarySnapshot — the one write-followup call (Issue #3)", () => {
  it("notifies subscribers exactly once until unsubscribed", async () => {
    const { invalidateLibrarySnapshot, onLibrarySnapshotInvalidated } =
      await loadSnapshot();

    let calls = 0;
    const unsubscribe = onLibrarySnapshotInvalidated(() => {
      calls += 1;
    });

    invalidateLibrarySnapshot();
    expect(calls).toBe(1);

    unsubscribe();
    invalidateLibrarySnapshot();
    expect(calls).toBe(1);
  });
});
