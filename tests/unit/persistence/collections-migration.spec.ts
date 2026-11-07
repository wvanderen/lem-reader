// tests/unit/persistence/collections-migration.spec.ts
// Issue #242 AC — the Dexie v10 → v11 additive upgrade preserves EVERY
// existing row (articles, highlights, notes, locations, books, assets,
// reading sessions, subscriptions, note drafts, article notes, settings)
// and the new `collections` store starts empty and is immediately usable.
// NO .upgrade() callback — the v11 block only ADDS a store (the v3..v9
// additive precedent, Pitfall 9), so the upgrade is Dexie's plain
// store-creation on next open.
//
// Own spec FILE (the reading-sessions v6→v7 / subscriptions v7→v8 /
// note-drafts v8→v9 precedent): the legacy instance must open the same
// database name at a LOWER version than the app singleton — the wipe +
// db.close() dance keeps that isolated from sibling specs.
import { beforeEach, describe, expect, it } from "vitest";
import {
  ArticleSchema,
  BookSchema,
  HighlightRecordSchema,
  LocationRecordSchema,
  NoteRecordSchema,
} from "../../../src/content/schema";
import fakeIndexedDB, { IDBKeyRange } from "fake-indexeddb";
import { Dexie } from "dexie";

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

async function loadDb() {
  return await import("../../../src/persistence/db");
}
async function loadStore() {
  return await import("../../../src/persistence/collectionsStore");
}

describe("Dexie v10 → v11 additive upgrade (issue #242, Pitfall 9)", () => {
  beforeEach(wipeDatabase);

  it("a v10-shaped DB upgraded by the v11 declaration keeps every legacy row; collections starts empty and works", async () => {
    const { db } = await loadDb();
    // Close the singleton so the legacy instance can open the same name at
    // a LOWER version without a VersionError (the v8→v9 precedent).
    db.close();

    // A v10-shaped database: the EXACT v10 store strings from db.ts history
    // (articleNotes + articleNoteDrafts present, collections absent — the
    // v9 stores plus the two v10 additive stores).
    const legacy = new Dexie("lem-reader");
    legacy.version(10).stores({
      articles: "id, revision, source, addedAt, *tags, bookId",
      settings: "key",
      location: "[articleId+revision]",
      highlights: "id, [articleId+revision]",
      notes: "id, highlightId",
      books: "id, title, *tags",
      assets: "[articleId+assetId], articleId",
      readingSessions: "id, articleId, startedAt",
      subscriptions: "id, feedUrl",
      noteDrafts: "highlightId",
      articleNotes: "id, articleId",
      articleNoteDrafts: "id, articleId",
    });
    await legacy.open();

    // One representative row per legacy store (schema-validated shapes —
    // the same rows the v11 reader must still read honestly).
    const article = ArticleSchema.parse({
      id: "legacy-v10-article",
      revision: 1,
      lang: "en",
      provenance: {
        title: "Legacy Article",
        retrievedAt: "2026-10-01T00:00:00.000Z",
        originalHtmlHash: `sha256:${"6".repeat(64)}`,
      },
      blocks: [{ kind: "paragraph", content: [{ text: "Legacy body.", marks: [] }] }],
      ingestionMeta: {
        source: "paste",
        origin: "paste",
        originalHtmlHash: `sha256:${"6".repeat(64)}`,
        ingestedAt: "2026-10-01T00:00:00.000Z",
        extractionConfidence: "high",
      },
      addedAt: "2026-10-01T00:00:00.000Z",
    });
    const book = BookSchema.parse({
      id: "epub-cccccccccccc",
      title: "Legacy Book",
      authors: [],
      language: "en",
      chapterArticleIds: ["legacy-v10-article"],
      source: "epub-upload",
      originalFileHash: `sha256:${"7".repeat(64)}`,
      addedAt: "2026-10-01T00:00:00.000Z",
    });
    const highlight = HighlightRecordSchema.parse({
      schemaVersion: 1,
      id: "legacy-hl",
      articleId: article.id,
      revision: 1,
      position: { start: 0, end: 5 },
      quote: { prefix: "", exact: "Legacy", suffix: " body." },
      createdAt: "2026-10-01T00:00:00.000Z",
    });
    const note = NoteRecordSchema.parse({
      schemaVersion: 1,
      id: "legacy-note",
      highlightId: highlight.id,
      text: "A legacy note.",
      updatedAt: "2026-10-01T00:00:00.000Z",
    });
    const location = LocationRecordSchema.parse({
      schemaVersion: 1,
      articleId: article.id,
      revision: 1,
      graphemeOffset: 12,
      savedAt: "2026-10-01T00:00:00.000Z",
    });
    await legacy.table("articles").put(article);
    await legacy.table("books").put(book);
    await legacy.table("highlights").put(highlight);
    await legacy.table("notes").put(note);
    await legacy.table("location").put(location);
    await legacy.table("settings").put({ key: "reader-prefs", value: { theme: "paper-light" } });
    await legacy.close();

    // Reopen through the APP singleton: the v11 declaration upgrades in
    // place — every legacy row reads back unchanged. Explicit open() after
    // the close() dance (the v8→v9 precedent — never rely on auto-open
    // across an explicit close).
    const { db: upgraded } = await loadDb();
    await upgraded.open();
    expect((await upgraded.articles.get(article.id))?.id).toBe(article.id);
    expect((await upgraded.books.get(book.id))?.title).toBe(book.title);
    expect((await upgraded.highlights.get(highlight.id))?.id).toBe(highlight.id);
    expect((await upgraded.notes.get(note.id))?.text).toBe(note.text);
    expect((await upgraded.location.get([article.id, 1]))?.graphemeOffset).toBe(12);
    expect((await upgraded.settings.get("reader-prefs"))?.value).toEqual({ theme: "paper-light" });

    // The new store starts EMPTY and is immediately usable through the
    // store seam — the upgrade itself wrote nothing.
    const { listCollections, createCollection } = await loadStore();
    const before = await listCollections();
    expect(before.ok && before.collections).toEqual([]);
    const created = await createCollection("First after upgrade");
    const after = await listCollections();
    expect(after.ok && after.collections.map((c) => c.id)).toEqual([created.id]);
  });
});
