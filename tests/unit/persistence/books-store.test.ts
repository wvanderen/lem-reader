// tests/unit/persistence/books-store.test.ts
// Plan 12-03 Task 1 — the booksStore seam truths:
//   - saveBook + listBooks round-trip with Zod validation; corrupt books
//     rows are DROPPED by listBooks (the safeParse path, T-12-11)
//   - saveBook atomicity: an injected throwing put mid-transaction (Dexie
//     creating-hook on db.articles) leaves NEITHER the book NOR any chapter
//     article persisted
//   - removeBook leaves ZERO rows across books/articles/highlights/notes/
//     location after seeding a book + 2 chapters + a highlight + a note +
//     a location (T-12-12 — no stranded annotations)
//   - setBookTags round-trip (D12-04 — tags live on the Book record)
//   - the v4→v5 upgrade path: a v4-shaped DB (articles without the bookId
//     index, no books store) upgraded by the v5 declaration reads its
//     legacy rows back — additive index/store proof at unit level (the
//     08-02 e2e precedent)
//
// Harness mirrors tests/unit/portability/atomic-import.test.ts:
// fake-indexeddb via Dexie.dependencies at module top-level, wipeDatabase
// beforeEach, lazy module imports. Dexie creating hooks FIRE INSIDE the
// transaction and a throw rolls it back — the hook is deregistered in
// afterEach (hooks persist across tests; cross-test bleed would poison
// sibling specs).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ArticleSchema,
  BookSchema,
  HighlightRecordSchema,
  LocationRecordSchema,
  NoteRecordSchema,
} from "../../../src/content/schema";
import type {
  Book,
  CanonicalArticle,
  HighlightRecord,
  LocationRecord,
  NoteRecord,
} from "../../../src/content/schema";
import fakeIndexedDB, { IDBKeyRange } from "fake-indexeddb";
import { Dexie } from "dexie";

// Dexie 4 captures `indexedDB` + `IDBKeyRange` on `Dexie.dependencies` at
// dexie-module-load time. Install BOTH onto `Dexie.dependencies` (the
// Dexie-internal read path) AND `globalThis` (the direct-read path Dexie
// uses for deleteDatabase) at this module's top-level — the documented
// Dexie + Node test pattern (mirrors tests/unit/ingestion-client.test.ts).
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
// fake-indexeddb install so their module-body top-level sees a populated
// Dexie.dependencies.
async function loadBooksStore() {
  return await import("../../../src/persistence/booksStore");
}
async function loadDb() {
  return await import("../../../src/persistence/db");
}

// ── Sample builders (schema-validated at construction) ──────────────────────

type BookInputArg = Parameters<typeof BookSchema.parse>[0];

function sampleBook(overrides: Partial<BookInputArg> = {}) {
  return BookSchema.parse({
    id: "epub-abc123def456",
    title: "A Sample Book",
    authors: ["An Author"],
    language: "en",
    chapterArticleIds: ["epub-abc123def456-c00", "epub-abc123def456-c01"],
    skippedChapterCount: 0,
    source: "epub-upload",
    originalFileHash: "sha256:" + "b".repeat(64),
    addedAt: "2026-08-18T00:00:00.000Z",
    ...overrides,
  });
}

/** A chapter article carrying the epub-chapter ingestionMeta (bookId +
 * chapterIndex), ArticleSchema-parsed. */
function sampleChapter(
  overrides: Partial<Parameters<typeof ArticleSchema.parse>[0]> = {},
): CanonicalArticle {
  return ArticleSchema.parse({
    id: "epub-abc123def456-c00",
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: undefined,
      title: "Chapter One",
      retrievedAt: "2026-08-18T00:00:00.000Z",
      originalHtmlHash: "sha256:" + "c".repeat(64),
    },
    blocks: [
      {
        kind: "paragraph",
        content: [{ text: "Chapter body text.", marks: [] }],
      },
    ],
    footnotes: [],
    ingestionMeta: {
      source: "epub-chapter",
      origin: "upload",
      originalHtmlHash: "sha256:" + "c".repeat(64),
      extractionConfidence: "high",
      extractionWarnings: [],
      bookId: "epub-abc123def456",
      chapterIndex: 0,
    },
    ...overrides,
  });
}

function sampleHighlight(overrides: Partial<Parameters<typeof HighlightRecordSchema.parse>[0]> = {}): HighlightRecord {
  return HighlightRecordSchema.parse({
    schemaVersion: 1,
    id: "hl-chapter",
    articleId: "epub-abc123def456-c00",
    revision: 1,
    position: { start: 0, end: 8 },
    quote: { prefix: "", exact: "Chapter", suffix: "" },
    createdAt: "2026-08-18T00:00:00.000Z",
    ...overrides,
  });
}

function sampleNote(overrides: Partial<Parameters<typeof NoteRecordSchema.parse>[0]> = {}): NoteRecord {
  return NoteRecordSchema.parse({
    schemaVersion: 1,
    id: "note-chapter",
    highlightId: "hl-chapter",
    text: "a reader note",
    updatedAt: "2026-08-18T00:00:00.000Z",
    ...overrides,
  });
}

function sampleLocation(overrides: Partial<Parameters<typeof LocationRecordSchema.parse>[0]> = {}): LocationRecord {
  return LocationRecordSchema.parse({
    schemaVersion: 1,
    articleId: "epub-abc123def456-c00",
    revision: 1,
    graphemeOffset: 3,
    savedAt: "2026-08-18T00:00:00.000Z",
    ...overrides,
  });
}

/** Seed the full cascade surface: book + 2 chapters + a highlight on
 * chapter 0 + a note on that highlight + a location on chapter 1. */
async function seedBookSurface(): Promise<void> {
  const { db } = await loadDb();
  const { saveBook } = await loadBooksStore();
  const book = sampleBook();
  const chapters = [
    sampleChapter(),
    sampleChapter({
      id: "epub-abc123def456-c01",
      provenance: {
        sourceUrl: undefined,
        title: "Chapter Two",
        retrievedAt: "2026-08-18T00:00:00.000Z",
        originalHtmlHash: "sha256:" + "d".repeat(64),
      },
      ingestionMeta: {
        source: "epub-chapter",
        origin: "upload",
        originalHtmlHash: "sha256:" + "d".repeat(64),
        extractionConfidence: "high",
        extractionWarnings: [],
        bookId: "epub-abc123def456",
        chapterIndex: 1,
      },
    }),
  ];
  await saveBook(book, chapters);
  await db.highlights.put(sampleHighlight());
  await db.notes.put(sampleNote());
  await db.location.put(
    sampleLocation({ articleId: "epub-abc123def456-c01" }),
  );
}

/** Count rows in every store — the zero-rows proof's after map (all six
 * v5 stores; settings is asserted at its never-seeded 0). */
async function countAllStores(): Promise<Record<string, number>> {
  const { db } = await loadDb();
  return {
    articles: await db.articles.count(),
    highlights: await db.highlights.count(),
    notes: await db.notes.count(),
    location: await db.location.count(),
    settings: await db.settings.count(),
    books: await db.books.count(),
  };
}

// Dexie creating hooks persist across tests — the SAME function reference
// is registered via hook("creating", fn) and deregistered via
// hook("creating").unsubscribe(fn) in afterEach (cross-test bleed guard).
let injectedCreatingHook:
  | ((primKey: unknown, obj: { id?: string }) => void)
  | null = null;

// ── saveBook + listBooks + getBook + hasBook ─────────────────────────────────

describe("booksStore — save/list round-trip (12-03 Task 1)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("saveBook persists book + chapters; listBooks/getBook/hasBook read them back Zod-validated", async () => {
    const { saveBook, listBooks, getBook, hasBook } = await loadBooksStore();
    const { db } = await loadDb();
    const book = sampleBook();
    const chapters = [sampleChapter()];

    expect(await hasBook(book.id)).toBe(false);
    await saveBook(book, chapters);

    // The book row + every chapter article row landed.
    expect(await hasBook(book.id)).toBe(true);
    expect((await db.articles.get(chapters[0]!.id))?.id).toBe(chapters[0]!.id);

    const list = await listBooks();
    expect(list).toEqual({ ok: true, books: [book] });
    expect(await getBook(book.id)).toEqual(book);
    expect(await getBook("no-such-book")).toBeNull();
  });

  it("saveBook stamps addedAt only when the caller passed none", async () => {
    const { saveBook } = await loadBooksStore();
    const { db } = await loadDb();

    // No addedAt → stamped with a real ISO datetime.
    const { addedAt: _omit, ...unstamped } = sampleBook();
    await saveBook(unstamped, [sampleChapter()]);
    const stampedRow = await db.books.get(unstamped.id);
    expect(stampedRow?.addedAt).toBeDefined();
    expect(() =>
      BookSchema.parse({ ...unstamped, addedAt: stampedRow?.addedAt }),
    ).not.toThrow();

    // Caller-supplied addedAt survives verbatim (no re-stamp).
    const book = sampleBook({
      id: "epub-fixedstamp000",
      addedAt: "2020-01-01T00:00:00.000Z",
    });
    await saveBook(book, [
      sampleChapter({
        id: "epub-fixedstamp000-c00",
        ingestionMeta: {
          source: "epub-chapter",
          origin: "upload",
          originalHtmlHash: "sha256:" + "e".repeat(64),
          extractionConfidence: "high",
          extractionWarnings: [],
          bookId: "epub-fixedstamp000",
          chapterIndex: 0,
        },
      }),
    ]);
    expect((await db.books.get(book.id))?.addedAt).toBe(
      "2020-01-01T00:00:00.000Z",
    );
  });

  it("listBooks DROPS a corrupt books row and returns the valid one (safeParse path, T-12-11)", async () => {
    const { db } = await loadDb();
    const { saveBook, listBooks } = await loadBooksStore();

    await saveBook(sampleBook(), [sampleChapter()]);
    // A corrupt row: title must be min(1) and source is a closed literal.
    // Cast through unknown — the row is INTENTIONALLY corrupt (the
    // safeParse-drop path under test), so it must not typecheck as a Book.
    await db.books.put({
      id: "epub-corrupt00000",
      title: "",
      language: "en",
      chapterArticleIds: [],
      source: "not-a-real-source",
      originalFileHash: "sha256:x",
      addedAt: "not-a-datetime",
    } as unknown as Book);

    const list = await listBooks();
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.books.map((b) => b.id)).toEqual(["epub-abc123def456"]);
    }
    // The corrupt row never masquerades as a readable book either.
    const { getBook } = await loadBooksStore();
    expect(await getBook("epub-corrupt00000")).toBeNull();
  });
});

// ── saveBook atomicity ───────────────────────────────────────────────────────

describe("booksStore — saveBook atomicity (12-03 Task 1)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  afterEach(async () => {
    if (injectedCreatingHook !== null) {
      const { db } = await loadDb();
      db.articles.hook("creating").unsubscribe(injectedCreatingHook);
      injectedCreatingHook = null;
    }
  });

  it("an injected mid-transaction failure persists NEITHER the book NOR any chapter article", async () => {
    const { db } = await loadDb();
    const { saveBook } = await loadBooksStore();
    const book = sampleBook();
    const chapters = [
      sampleChapter(), // would land first…
      sampleChapter({
        // …then this sentinel chapter throws inside the transaction.
        id: "epub-abc123def456-boom",
      }),
    ];

    const creatingHook = (
      _primKey: unknown,
      obj: { id?: string },
    ): void => {
      if (obj?.id === "epub-abc123def456-boom") {
        throw new Error("injected mid-transaction failure");
      }
    };
    injectedCreatingHook = creatingHook;
    db.articles.hook("creating", creatingHook);

    await expect(saveBook(book, chapters)).rejects.toThrow(
      "injected mid-transaction failure",
    );

    // FULL rollback: no book row, no chapter rows — a half-saved book is
    // impossible.
    expect(await db.books.count()).toBe(0);
    expect(await db.articles.count()).toBe(0);
  });
});

// ── removeBook cascade ───────────────────────────────────────────────────────

describe("booksStore — removeBook cascade (12-03 Task 1)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("removes the book + every chapter's articles/highlights/notes/locations — zero rows remain across all six stores", async () => {
    const { removeBook, hasBook } = await loadBooksStore();
    await seedBookSurface();

    // The seeded surface is really there (book + 2 chapters + hl + note + loc).
    const seeded = await countAllStores();
    expect(seeded).toEqual({
      articles: 2,
      highlights: 1,
      notes: 1,
      location: 1,
      settings: 0,
      books: 1,
    });

    await removeBook("epub-abc123def456");

    expect(await hasBook("epub-abc123def456")).toBe(false);
    expect(await countAllStores()).toEqual({
      articles: 0,
      highlights: 0,
      notes: 0,
      location: 0,
      settings: 0,
      books: 0,
    });
  });

  it("cascades live-truth chapters (bookId carriers not listed in chapterArticleIds) too", async () => {
    const { db } = await loadDb();
    const { removeBook, saveBook } = await loadBooksStore();
    // Partial-import shape: the book row lists only c00, but a live article
    // row carries bookId === book.id without being in the TOC list.
    const book = sampleBook({
      id: "epub-partial000001",
      chapterArticleIds: ["epub-partial000001-c00"],
    });
    await saveBook(book, [
      sampleChapter({
        id: "epub-partial000001-c00",
        ingestionMeta: {
          source: "epub-chapter",
          origin: "upload",
          originalHtmlHash: "sha256:" + "f".repeat(64),
          extractionConfidence: "high",
          extractionWarnings: [],
          bookId: "epub-partial000001",
          chapterIndex: 0,
        },
      }),
    ]);
    // Partial-import shape: the book row lists only c00, but a live article
    // row carries the denormalized top-level bookId without being in the
    // TOC list (exactly what a saveBook write of a stale-TOC book leaves).
    await db.articles.put({
      ...sampleChapter({
        id: "epub-partial000001-c99",
        ingestionMeta: {
          source: "epub-chapter",
          origin: "upload",
          originalHtmlHash: "sha256:" + "1".repeat(64),
          extractionConfidence: "high",
          extractionWarnings: [],
          bookId: "epub-partial000001",
          chapterIndex: 99,
        },
      }),
      bookId: "epub-partial000001", // the denormalized index column
    });
    expect(await db.articles.count()).toBe(2);

    await removeBook("epub-partial000001");

    expect(await db.articles.count()).toBe(0);
    expect(await db.books.count()).toBe(0);
  });

  it("removing an unknown book id is a calm no-op", async () => {
    const { removeBook } = await loadBooksStore();
    await seedBookSurface();
    await removeBook("epub-never-existed");
    const { db } = await loadDb();
    expect(await db.books.count()).toBe(1);
    expect(await db.articles.count()).toBe(2);
  });
});

// ── setBookTags ──────────────────────────────────────────────────────────────

describe("booksStore — setBookTags (12-03 Task 1)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("round-trips the tag array on the Book record (D12-04) and drops empty strings", async () => {
    const { saveBook, setBookTags, getBook } = await loadBooksStore();
    const book = sampleBook();
    await saveBook(book, [sampleChapter()]);

    await setBookTags(book.id, ["fiction", "essays"]);
    expect((await getBook(book.id))?.tags).toEqual(["fiction", "essays"]);

    // Defensive empty-string drop (the setArticleTags precedent).
    await setBookTags(book.id, ["fiction", ""]);
    expect((await getBook(book.id))?.tags).toEqual(["fiction"]);

    // Unknown id is a no-op (no throw, no row).
    await setBookTags("no-such-book", ["x"]);
  });
});

// ── Dexie v4→v5 additive upgrade ─────────────────────────────────────────────

describe("booksStore — Dexie v4→v5 additive upgrade (12-03 Task 1, Pitfall 9)", () => {
  it("a v4-shaped DB upgraded by the v5 declaration reads its legacy rows back; the books store starts empty", async () => {
    const { db } = await loadDb();
    // Close the singleton so the legacy instance can open the same name at
    // a LOWER version without a VersionError.
    db.close();
    await wipeDatabase();

    // A v4-shaped database: articles WITHOUT the bookId index, no books
    // store (the exact v4 store strings from db.ts history).
    const legacy = new Dexie("lem-reader");
    legacy.version(4).stores({
      articles: "id, revision, source, addedAt, *tags",
      settings: "key",
      location: "[articleId+revision]",
      highlights: "id, [articleId+revision]",
      notes: "id, highlightId",
    });
    await legacy.open();
    const legacyArticle = sampleChapter({
      id: "legacy-v4-article",
      ingestionMeta: {
        source: "url",
        origin: "url",
        sourceUrl: "https://example.com/legacy",
        originalHtmlHash: "sha256:" + "2".repeat(64),
        fetchedAt: "2026-08-01T00:00:00.000Z",
        extractionConfidence: "high",
        extractionWarnings: [],
      },
    });
    // Plain Dexie exposes tables via .table(name) (no typed properties on
    // the base class — the legacy instance only needs the put).
    await legacy.table<CanonicalArticle>("articles").put(legacyArticle);
    await legacy.close();

    // Reopening the app singleton runs the v4→v5 upgrade (additive index +
    // new empty store — NO .upgrade() callback, the v3/v4 precedent).
    await db.open();
    const row = await db.articles.get("legacy-v4-article");
    expect(row).toBeDefined();
    expect(row?.id).toBe("legacy-v4-article");

    // The new books store exists and starts EMPTY; the bookId index is
    // queryable (zero carriers).
    expect(await db.books.count()).toBe(0);
    expect(await db.articles.where("bookId").equals("epub-abc123def456").count()).toBe(0);
  });
});
