// tests/unit/persistence/collection-reference-cleanup.test.ts
// Issue #245 — the delete-time collection-reference cleanup truths (the
// collections-store/books-store test harness: fake-indexeddb via
// Dexie.dependencies at module top-level, wipeDatabase beforeEach, lazy
// module imports):
//
//   - entryReferencesDeletedWork — the ONE reference-of-deletion rule over
//     all four target kinds × both deletion shapes (article / book with its
//     chapter set).
//   - findCollectionsReferencingWork — only collections holding referencing
//     entries come back, most-recently-updated first; corrupt rows are
//     dropped (never masquerade as affected collections); zero references →
//     empty.
//   - deletedBookWork — the declared TOC ∪ live bookId carriers (live truth
//     wins — a partial import still describes the full deletion).
//   - removeReferencesToDeletedWork (inside a rw transaction listing
//     db.collections): strips every referencing entry, preserves surviving
//     entries' relative order, rewrites ONLY affected rows (untouched rows
//     keep their byte-exact updatedAt), keeps emptied collections alive,
//     and skips corrupt rows without writing onto them.
//   - THE TRANSACTIONAL BOUNDARY, through the real entry points:
//     DexieLibrarySource.remove(id) and booksStore.removeBook(id) strip the
//     references inside their own cascade transactions; an injected
//     mid-transaction failure rolls back BOTH halves — no half-deleted
//     content/membership (issue #245 AC). The converse non-ownership
//     guarantees (membership removal / collection deletion never touch the
//     library) are pinned by collections-store.test.ts ("deleteCollection
//     removes ONLY the collection row — every library row survives
//     byte-for-byte"; removeCollectionEntry "leaves every other store
//     untouched") and are not re-proved here.
//
// Rollback injection mirrors books-store.test.ts: Dexie table hooks persist
// across tests, so the SAME function reference registered via
// hook("deleting", fn) is unsubscribed in afterEach (cross-test-bleed
// guard). A throwing "deleting" hook fires INSIDE the transaction and the
// throw rolls the whole transaction back.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fakeIndexedDB, { IDBKeyRange } from "fake-indexeddb";
import { Dexie } from "dexie";
import { ArticleSchema, BookSchema, CollectionSchema } from "../../../src/content/schema";
import type {
  Book,
  CanonicalArticle,
  Collection,
  CollectionEntryTarget,
} from "../../../src/content/schema";

// Dexie 4 captures `indexedDB` + `IDBKeyRange` on `Dexie.dependencies` at
// dexie-module-load time. Install BOTH onto `Dexie.dependencies` AND
// `globalThis` — the books-store.test.ts harness verbatim.
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

// Lazy imports — modules under test load AFTER the fake-indexeddb install.
async function loadCleanup() {
  return await import("../../../src/persistence/collectionReferenceCleanup");
}
async function loadDb() {
  return await import("../../../src/persistence/db");
}

// ── Row builders (schema-valid by construction — CollectionSchema.parse) ────

const WORK_ID = "harbor-essays";
const OTHER_ID = "city-letters";
const BOOK_ID = "epub-tidebook0000";
const CHAPTER_ONE_ID = "tide-ch-01";
const CHAPTER_TWO_ID = "tide-ch-02";

const PROSE =
  "The keeper counts another steady entry of the harbor's small weather, long enough to clear any minimum.";

function makeArticle(id: string, title: string): CanonicalArticle {
  return ArticleSchema.parse({
    id,
    revision: 1,
    lang: "en",
    provenance: {
      title,
      retrievedAt: "2026-10-01T00:00:00.000Z",
      originalHtmlHash: `sha256:${"b".repeat(64)}`,
    },
    blocks: [{ kind: "paragraph", content: [{ text: PROSE, marks: [] }] }],
    ingestionMeta: {
      source: "paste",
      origin: "paste",
      originalHtmlHash: `sha256:${"b".repeat(64)}`,
      ingestedAt: "2026-10-01T00:00:00.000Z",
      extractionConfidence: "high",
    },
    addedAt: "2026-10-01T00:00:00.000Z",
  });
}

function makeChapter(id: string, index: number): CanonicalArticle {
  return ArticleSchema.parse({
    id,
    revision: 1,
    lang: "en",
    provenance: {
      title: `Chapter ${index}`,
      retrievedAt: "2026-10-01T00:00:00.000Z",
      originalHtmlHash: `sha256:${"c".repeat(64)}`,
    },
    blocks: [{ kind: "paragraph", content: [{ text: PROSE, marks: [] }] }],
    ingestionMeta: {
      source: "epub-chapter",
      origin: "upload",
      bookId: BOOK_ID,
      chapterIndex: index,
      originalHtmlHash: `sha256:${"c".repeat(64)}`,
      ingestedAt: "2026-10-01T00:00:00.000Z",
      extractionConfidence: "high",
    },
    addedAt: "2026-10-01T00:00:00.000Z",
  });
}

/** A persisted chapter row carries the TOP-LEVEL bookId the saveBook stamp
 * writes (the `bookId` index on db.articles reads that field —
 * ingestionMeta.bookId is not the indexed one). */
function makeChapterRow(id: string, index: number): CanonicalArticle & { bookId: string } {
  return { ...makeChapter(id, index), bookId: BOOK_ID };
}

function makeBook(declaredChapterIds: string[]): Book {
  return BookSchema.parse({
    id: BOOK_ID,
    title: "The Tide Book",
    authors: ["A. Keeper"],
    language: "en",
    chapterArticleIds: declaredChapterIds,
    skippedChapterCount: 0,
    source: "epub-upload",
    originalFileHash: `sha256:${"d".repeat(64)}`,
    addedAt: "2026-10-01T00:00:00.000Z",
  });
}

/** A schema-valid collection row with the given ordered entry targets. */
function makeCollection(
  id: string,
  name: string,
  targets: CollectionEntryTarget[],
  updatedAt: string,
): Collection {
  return CollectionSchema.parse({
    schemaVersion: 1,
    id,
    name,
    entries: targets.map((target, i) => ({
      id: `${id}-e${i + 1}`,
      target,
      addedAt: "2026-10-01T00:00:00.000Z",
    })),
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt,
  });
}

/** Seed a wide collection surface covering every target kind. Entry ids are
 * deterministic (`<collectionId>-e<n>`) so surviving-order assertions can
 * name them. Corrupt rows ride the same seam (cast — cleanup must skip
 * them, not typecheck them). */
async function seedCollections(dbRow: unknown[]): Promise<void> {
  const { db } = await loadDb();
  await db.collections.bulkPut(dbRow as Collection[]);
}

describe("entryReferencesDeletedWork — the ONE reference rule (issue #245)", () => {
  const targets: Record<string, CollectionEntryTarget> = {
    article: { kind: "article", articleId: WORK_ID },
    otherArticle: { kind: "article", articleId: OTHER_ID },
    book: { kind: "book", bookId: BOOK_ID },
    otherBook: { kind: "book", bookId: "epub-anotherbook" },
    bookChapter: { kind: "book-chapter", bookId: BOOK_ID, articleId: CHAPTER_ONE_ID },
    bookChapterTwo: { kind: "book-chapter", bookId: BOOK_ID, articleId: CHAPTER_TWO_ID },
    otherBookChapter: { kind: "book-chapter", bookId: "epub-anotherbook", articleId: "x-c1" },
    workChapter: { kind: "work-chapter", articleId: WORK_ID, destinationId: "ch-0.b" },
    otherWorkChapter: { kind: "work-chapter", articleId: OTHER_ID, destinationId: "ch-3.12" },
  };

  it("an ARTICLE deletion matches its whole-work and work-chapter targets only", async () => {
    const { entryReferencesDeletedWork } = await loadCleanup();
    const deleted = { kind: "article" as const, articleId: WORK_ID };
    expect(entryReferencesDeletedWork(targets.article!, deleted)).toBe(true);
    expect(entryReferencesDeletedWork(targets.workChapter!, deleted)).toBe(true);
    expect(entryReferencesDeletedWork(targets.otherArticle!, deleted)).toBe(false);
    expect(entryReferencesDeletedWork(targets.otherWorkChapter!, deleted)).toBe(false);
    expect(entryReferencesDeletedWork(targets.book!, deleted)).toBe(false);
    expect(entryReferencesDeletedWork(targets.bookChapter!, deleted)).toBe(false);
    expect(entryReferencesDeletedWork(targets.otherBook!, deleted)).toBe(false);
  });

  it("a BOOK deletion matches its whole-book and every chapter target (by bookId OR chapter id)", async () => {
    const { entryReferencesDeletedWork } = await loadCleanup();
    const deleted = {
      kind: "book" as const,
      bookId: BOOK_ID,
      chapterArticleIds: [CHAPTER_ONE_ID, CHAPTER_TWO_ID],
    };
    expect(entryReferencesDeletedWork(targets.book!, deleted)).toBe(true);
    expect(entryReferencesDeletedWork(targets.bookChapter!, deleted)).toBe(true);
    expect(entryReferencesDeletedWork(targets.bookChapterTwo!, deleted)).toBe(true);
    expect(entryReferencesDeletedWork(targets.otherBook!, deleted)).toBe(false);
    expect(entryReferencesDeletedWork(targets.otherBookChapter!, deleted)).toBe(false);
    expect(entryReferencesDeletedWork(targets.article!, deleted)).toBe(false);
    expect(entryReferencesDeletedWork(targets.workChapter!, deleted)).toBe(false);
  });

  it("an ARTICLE deletion also removes a book-chapter entry whose chapter article is the deleted row", async () => {
    // Defense in depth: a chapter article deleted through remove(id) takes
    // its book-chapter references with it even though the owning cascade
    // (removeBook) is the normal chapter path.
    const { entryReferencesDeletedWork } = await loadCleanup();
    const deleted = { kind: "article" as const, articleId: CHAPTER_ONE_ID };
    expect(
      entryReferencesDeletedWork(
        { kind: "book-chapter", bookId: BOOK_ID, articleId: CHAPTER_ONE_ID },
        deleted,
      ),
    ).toBe(true);
    expect(
      entryReferencesDeletedWork(
        { kind: "book-chapter", bookId: BOOK_ID, articleId: CHAPTER_TWO_ID },
        deleted,
      ),
    ).toBe(false);
  });
});

describe("findCollectionsReferencingWork + deletedBookWork (issue #245)", () => {
  beforeEach(wipeDatabase);

  it("returns only collections holding referencing entries, newest-updated first; corrupt rows are dropped", async () => {
    const { findCollectionsReferencingWork } = await loadCleanup();
    await seedCollections([
      makeCollection(
        "coll-morning",
        "Morning plans",
        [
          { kind: "article", articleId: WORK_ID },
          { kind: "article", articleId: OTHER_ID },
        ],
        "2026-10-03T00:00:00.000Z",
      ),
      makeCollection(
        "coll-evening",
        "Evening essays",
        [{ kind: "work-chapter", articleId: WORK_ID, destinationId: "ch-0.b" }],
        "2026-10-04T00:00:00.000Z",
      ),
      makeCollection(
        "coll-unaffected",
        "Unaffected",
        [{ kind: "article", articleId: OTHER_ID }],
        "2026-10-05T00:00:00.000Z",
      ),
      // A corrupt row (entries not an array) — dropped, never surfaced.
      { schemaVersion: 1, id: "coll-corrupt000", name: "?", entries: "garbage" },
    ]);

    const found = await findCollectionsReferencingWork({ kind: "article", articleId: WORK_ID });
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.collections.map((c) => c.id)).toEqual(["coll-evening", "coll-morning"]);
    // Newest-updated first, and the corrupt/unaffected rows never appear.
    expect(found.collections[0]!.name).toBe("Evening essays");
  });

  it("returns empty when nothing references the work", async () => {
    const { findCollectionsReferencingWork } = await loadCleanup();
    const { db } = await loadDb();
    await db.collections.put(
      makeCollection(
        "coll-solo",
        "Solo",
        [{ kind: "article", articleId: OTHER_ID }],
        "2026-10-01T00:00:00.000Z",
      ),
    );
    const found = await findCollectionsReferencingWork({ kind: "article", articleId: WORK_ID });
    expect(found).toEqual({ ok: true, collections: [] });
  });

  it("answers {ok:false} — never a silent empty — when the collections read fails", async () => {
    const { findCollectionsReferencingWork } = await loadCleanup();
    const { db } = await loadDb();
    await db.collections.put(
      makeCollection(
        "coll-solo",
        "Solo",
        [{ kind: "article", articleId: WORK_ID }],
        "2026-10-01T00:00:00.000Z",
      ),
    );

    // Inject the read failure at the Dexie boundary (restored in this test
    // — the spy never leaks into sibling tests).
    const toArraySpy = vi
      .spyOn(db.collections, "toArray")
      .mockRejectedValue(new Error("injected collections-read failure"));
    try {
      const found = await findCollectionsReferencingWork({ kind: "article", articleId: WORK_ID });
      expect(found).toEqual({ ok: false });
    } finally {
      toArraySpy.mockRestore();
    }
  });

  it("deletedBookWork unions the declared TOC with live bookId carriers (live truth wins)", async () => {
    const { deletedBookWork } = await loadCleanup();
    const { db } = await loadDb();
    // Declared TOC carries chapter one only; a partial import left chapter
    // two live in articles without being declared.
    await db.articles.bulkPut([
      makeChapterRow(CHAPTER_ONE_ID, 1),
      makeChapterRow(CHAPTER_TWO_ID, 2),
    ]);
    const deleted = await deletedBookWork(BOOK_ID, [CHAPTER_ONE_ID]);
    expect(deleted.kind).toBe("book");
    if (deleted.kind !== "book") return;
    expect([...deleted.chapterArticleIds].sort()).toEqual([CHAPTER_ONE_ID, CHAPTER_TWO_ID]);
  });

  it("deletedBookWork falls back to the DECLARED TOC when the live read fails (the confirm flow never dies silently)", async () => {
    const { deletedBookWork } = await loadCleanup();
    const { db } = await loadDb();
    await db.articles.bulkPut([makeChapterRow(CHAPTER_ONE_ID, 1)]);

    // Inject a live-read failure at the Dexie query boundary (restored in
    // this test — the spy never leaks into sibling tests).
    const whereSpy = vi.spyOn(db.articles, "where").mockImplementation(() => {
      throw new Error("injected live-read failure");
    });
    try {
      const deleted = await deletedBookWork(BOOK_ID, [CHAPTER_ONE_ID]);
      expect(deleted.kind).toBe("book");
      if (deleted.kind !== "book") return;
      expect([...deleted.chapterArticleIds]).toEqual([CHAPTER_ONE_ID]);
    } finally {
      whereSpy.mockRestore();
    }
  });
});

describe("removeReferencesToDeletedWork — transaction-scoped strip (issue #245)", () => {
  beforeEach(wipeDatabase);

  it("strips article + work-chapter references, preserves survivors' order, rewrites only affected rows, keeps emptied collections", async () => {
    const { removeReferencesToDeletedWork } = await loadCleanup();
    const { db } = await loadDb();
    const affected = makeCollection(
      "coll-affected",
      "Affected",
      [
        { kind: "article", articleId: OTHER_ID }, // survives, keeps position
        { kind: "article", articleId: WORK_ID }, // goes
        { kind: "work-chapter", articleId: WORK_ID, destinationId: "ch-0.b" }, // goes
        { kind: "book", bookId: BOOK_ID }, // survives (book not deleted here)
      ],
      "2026-10-02T00:00:00.000Z",
    );
    const emptied = makeCollection(
      "coll-emptied",
      "Emptied",
      [{ kind: "work-chapter", articleId: WORK_ID, destinationId: "ch-1.4" }],
      "2026-10-03T00:00:00.000Z",
    );
    const untouched = makeCollection(
      "coll-untouched",
      "Untouched",
      [{ kind: "article", articleId: OTHER_ID }],
      "2026-10-04T00:00:00.000Z",
    );
    await seedCollections([affected, emptied, untouched]);

    const rewritten = await db.transaction(
      "rw",
      [db.collections, db.articles],
      async () => await removeReferencesToDeletedWork({ kind: "article", articleId: WORK_ID }),
    );
    expect(rewritten).toBe(2);

    const rows = await db.collections.toArray();
    const affectedRow = rows.find((r) => r.id === "coll-affected");
    expect(affectedRow?.entries.map((e) => e.id)).toEqual(["coll-affected-e1", "coll-affected-e4"]);
    expect(affectedRow?.updatedAt).not.toBe("2026-10-02T00:00:00.000Z");

    // The emptied collection SURVIVES as an empty collection.
    const emptiedRow = rows.find((r) => r.id === "coll-emptied");
    expect(emptiedRow?.entries).toEqual([]);
    expect(emptiedRow?.updatedAt).not.toBe("2026-10-03T00:00:00.000Z");

    // The untouched row is byte-identical — no spurious updatedAt bump.
    const untouchedRow = rows.find((r) => r.id === "coll-untouched");
    expect(untouchedRow).toEqual(untouched);
  });

  it("strips book + book-chapter references (by bookId and by chapter-article id)", async () => {
    const { removeReferencesToDeletedWork } = await loadCleanup();
    const { db } = await loadDb();
    await db.collections.put(
      makeCollection(
        "coll-mixed",
        "Mixed",
        [
          { kind: "book", bookId: BOOK_ID }, // goes (bookId)
          { kind: "book-chapter", bookId: BOOK_ID, articleId: CHAPTER_ONE_ID }, // goes (chapter id)
          { kind: "book-chapter", bookId: BOOK_ID, articleId: CHAPTER_TWO_ID }, // goes (chapter id)
          { kind: "book", bookId: "epub-anotherbook" }, // survives
          { kind: "book-chapter", bookId: "epub-anotherbook", articleId: "x-c1" }, // survives
        ],
        "2026-10-02T00:00:00.000Z",
      ),
    );

    const rewritten = await db.transaction(
      "rw",
      [db.collections, db.books, db.articles],
      async () =>
        await removeReferencesToDeletedWork({
          kind: "book",
          bookId: BOOK_ID,
          chapterArticleIds: [CHAPTER_ONE_ID, CHAPTER_TWO_ID],
        }),
    );
    expect(rewritten).toBe(1);
    const row = await db.collections.get("coll-mixed");
    expect(row?.entries.map((e) => e.id)).toEqual(["coll-mixed-e4", "coll-mixed-e5"]);
  });

  it("skips corrupt rows without writing onto them (T-245a)", async () => {
    const { removeReferencesToDeletedWork } = await loadCleanup();
    const { db } = await loadDb();
    const corruptRow = {
      schemaVersion: 1,
      id: "coll-corrupt000",
      name: "Corrupt",
      entries: "garbage",
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    };
    await seedCollections([
      corruptRow,
      makeCollection(
        "coll-ok",
        "Ok",
        [{ kind: "article", articleId: WORK_ID }],
        "2026-10-01T00:00:00.000Z",
      ),
    ]);

    const rewritten = await db.transaction(
      "rw",
      [db.collections, db.articles],
      async () => await removeReferencesToDeletedWork({ kind: "article", articleId: WORK_ID }),
    );
    expect(rewritten).toBe(1);
    // The corrupt row is byte-identical — skipped, never rebuilt or deleted.
    expect(await db.collections.get("coll-corrupt000")).toEqual(corruptRow);
  });

  it("writes NOTHING when no collection references the work (stamps stay byte-identical)", async () => {
    const { removeReferencesToDeletedWork } = await loadCleanup();
    const { db } = await loadDb();
    const row = makeCollection(
      "coll-solo",
      "Solo",
      [{ kind: "article", articleId: OTHER_ID }],
      "2026-10-01T00:00:00.000Z",
    );
    await seedCollections([row]);

    const rewritten = await db.transaction(
      "rw",
      [db.collections, db.articles],
      async () => await removeReferencesToDeletedWork({ kind: "article", articleId: WORK_ID }),
    );
    expect(rewritten).toBe(0);
    expect(await db.collections.get("coll-solo")).toEqual(row);
  });
});

// ── The transactional boundary through the REAL entry points ────────────────

describe("DexieLibrarySource.remove — collection references ride the cascade (issue #245)", () => {
  let injectedDeletingHook: ((primKey: unknown, obj: unknown, tx: unknown) => void) | null = null;

  beforeEach(wipeDatabase);

  afterEach(async () => {
    if (injectedDeletingHook !== null) {
      const { db } = await loadDb();
      db.articles.hook("deleting").unsubscribe(injectedDeletingHook);
      injectedDeletingHook = null;
    }
  });

  it("removes the article AND every collection entry referencing it or its chapters, atomically", async () => {
    const { db } = await loadDb();
    const { dexieLibrarySource } = await import("../../../src/ingestion/LibrarySource");
    await db.articles.put(makeArticle(WORK_ID, "Harbor Essays"));
    await db.highlights.put({
      schemaVersion: 1,
      id: "hl-245",
      articleId: WORK_ID,
      revision: 1,
      position: { start: 2, end: 9 },
      quote: { prefix: "", exact: PROSE.slice(2, 9), suffix: "" },
      createdAt: "2026-10-01T00:00:00.000Z",
    });
    await seedCollections([
      makeCollection(
        "coll-one",
        "One",
        [{ kind: "article", articleId: WORK_ID }],
        "2026-10-02T00:00:00.000Z",
      ),
      makeCollection(
        "coll-two",
        "Two",
        [
          { kind: "work-chapter", articleId: WORK_ID, destinationId: "ch-0.b" },
          { kind: "article", articleId: OTHER_ID },
          { kind: "article", articleId: WORK_ID },
        ],
        "2026-10-03T00:00:00.000Z",
      ),
      makeCollection(
        "coll-safe",
        "Safe",
        [{ kind: "article", articleId: OTHER_ID }],
        "2026-10-04T00:00:00.000Z",
      ),
    ]);

    await dexieLibrarySource.remove(WORK_ID);

    // Content half: article + highlight rows gone.
    expect(await db.articles.get(WORK_ID)).toBeUndefined();
    expect(await db.highlights.get("hl-245")).toBeUndefined();
    // Reference half: references stripped, survivors keep order + identity.
    expect(await db.collections.get("coll-one")).toMatchObject({ entries: [] });
    const two = await db.collections.get("coll-two");
    expect(two?.entries.map((e) => e.id)).toEqual(["coll-two-e2"]);
    // The unaffected collection is untouched, and BOTH affected collections
    // survive as (possibly empty) collections.
    expect(await db.collections.count()).toBe(3);
    const safe = await db.collections.get("coll-safe");
    expect(safe?.entries.map((e) => e.id)).toEqual(["coll-safe-e1"]);
    expect(safe?.updatedAt).toBe("2026-10-04T00:00:00.000Z");
  });

  it("an injected mid-transaction failure rolls the reference strip back WITH the content deletion", async () => {
    const { db } = await loadDb();
    const { dexieLibrarySource } = await import("../../../src/ingestion/LibrarySource");
    await db.articles.put(makeArticle(WORK_ID, "Harbor Essays"));
    await seedCollections([
      makeCollection(
        "coll-one",
        "One",
        [{ kind: "article", articleId: WORK_ID }],
        "2026-10-02T00:00:00.000Z",
      ),
    ]);

    // The strip runs FIRST; the article DELETE fires the hook later in the
    // same transaction. The throw must roll the strip back too — no
    // half-deleted content/membership either way.
    const deletingHook = (): void => {
      throw new Error("injected mid-transaction failure");
    };
    injectedDeletingHook = deletingHook;
    db.articles.hook("deleting", deletingHook);

    await expect(dexieLibrarySource.remove(WORK_ID)).rejects.toThrow(
      "injected mid-transaction failure",
    );

    // FULL rollback: the article survives AND the reference survives.
    expect(await db.articles.get(WORK_ID)).not.toBeUndefined();
    const one = await db.collections.get("coll-one");
    expect(one?.entries.map((e) => e.id)).toEqual(["coll-one-e1"]);
  });
});

describe("removeBook — collection references ride the cascade (issue #245)", () => {
  let injectedDeletingHook: ((primKey: unknown, obj: unknown, tx: unknown) => void) | null = null;

  beforeEach(wipeDatabase);

  afterEach(async () => {
    if (injectedDeletingHook !== null) {
      const { db } = await loadDb();
      db.books.hook("deleting").unsubscribe(injectedDeletingHook);
      injectedDeletingHook = null;
    }
  });

  async function seedBookSurface(): Promise<void> {
    const { db } = await loadDb();
    await db.books.put(makeBook([CHAPTER_ONE_ID, CHAPTER_TWO_ID]));
    await db.articles.bulkPut([
      makeChapterRow(CHAPTER_ONE_ID, 1),
      makeChapterRow(CHAPTER_TWO_ID, 2),
      makeArticle(OTHER_ID, "City Letters"),
    ]);
    await seedCollections([
      makeCollection(
        "coll-plan",
        "Plan",
        [
          { kind: "book", bookId: BOOK_ID }, // goes
          { kind: "book-chapter", bookId: BOOK_ID, articleId: CHAPTER_ONE_ID }, // goes
          { kind: "book-chapter", bookId: BOOK_ID, articleId: CHAPTER_TWO_ID }, // goes
          { kind: "article", articleId: OTHER_ID }, // survives
        ],
        "2026-10-02T00:00:00.000Z",
      ),
      makeCollection(
        "coll-safe",
        "Safe",
        [{ kind: "book", bookId: "epub-anotherbook" }],
        "2026-10-03T00:00:00.000Z",
      ),
    ]);
  }

  it("removes the book AND every collection entry naming it or its chapters, atomically", async () => {
    const { db } = await loadDb();
    const { removeBook } = await import("../../../src/persistence/booksStore");
    await seedBookSurface();

    await removeBook(BOOK_ID);

    // Content half: book + chapter rows gone; the unrelated article stays.
    expect(await db.books.get(BOOK_ID)).toBeUndefined();
    expect(await db.articles.get(CHAPTER_ONE_ID)).toBeUndefined();
    expect(await db.articles.get(CHAPTER_TWO_ID)).toBeUndefined();
    expect(await db.articles.get(OTHER_ID)).not.toBeUndefined();
    // Reference half: the plan loses exactly its book references and keeps
    // its unrelated article entry in place; the safe collection survives.
    const plan = await db.collections.get("coll-plan");
    expect(plan?.entries.map((e) => e.id)).toEqual(["coll-plan-e4"]);
    expect(await db.collections.count()).toBe(2);
    const safe = await db.collections.get("coll-safe");
    expect(safe?.entries.map((e) => e.id)).toEqual(["coll-safe-e1"]);
    expect(safe?.updatedAt).toBe("2026-10-03T00:00:00.000Z");
  });

  it("an injected mid-transaction failure rolls the reference strip back WITH the book cascade", async () => {
    const { db } = await loadDb();
    const { removeBook } = await import("../../../src/persistence/booksStore");
    await seedBookSurface();

    // The strip runs FIRST; the final book-row DELETE fires the hook — the
    // throw rolls back the chapter deletes AND the strip.
    const deletingHook = (): void => {
      throw new Error("injected mid-transaction failure");
    };
    injectedDeletingHook = deletingHook;
    db.books.hook("deleting", deletingHook);

    await expect(removeBook(BOOK_ID)).rejects.toThrow("injected mid-transaction failure");

    // FULL rollback: book, chapters, and every reference all survive.
    expect(await db.books.get(BOOK_ID)).not.toBeUndefined();
    expect(await db.articles.get(CHAPTER_ONE_ID)).not.toBeUndefined();
    const plan = await db.collections.get("coll-plan");
    expect(plan?.entries.map((e) => e.id)).toEqual([
      "coll-plan-e1",
      "coll-plan-e2",
      "coll-plan-e3",
      "coll-plan-e4",
    ]);
  });
});
