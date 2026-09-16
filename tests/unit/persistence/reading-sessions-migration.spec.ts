// tests/unit/persistence/reading-sessions-migration.spec.ts
// Issue #34 AC 4 — the Dexie v6 → v7 additive upgrade preserves EVERY
// existing row (articles, highlights, notes, locations, books, assets,
// settings) and the new `readingSessions` store starts empty and is
// immediately usable. NO .upgrade() callback — the v7 block only ADDS a
// store (the v3/v4/v5/v6 additive precedent, Pitfall 9), so the upgrade is
// Dexie's plain store-creation on next open.
//
// Own spec FILE (the books-store v4→v5 precedent): the legacy instance must
// open the same database name at a LOWER version than the app singleton —
// a dedicated module registry keeps that isolated from sibling specs.
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

describe("Dexie v6 → v7 additive upgrade (issue #34 AC 4, Pitfall 9)", () => {
  beforeEach(wipeDatabase);

  it("a v6-shaped DB upgraded by the v7 declaration keeps every legacy row; readingSessions starts empty and works", async () => {
    const { db } = await loadDb();
    // Close the singleton so the legacy instance can open the same name at
    // a LOWER version without a VersionError (the books-store v4→v5
    // precedent).
    db.close();

    // A v6-shaped database: the EXACT v6 store strings from db.ts history
    // (assets present, readingSessions absent).
    const legacy = new Dexie("lem-reader");
    legacy.version(6).stores({
      articles: "id, revision, source, addedAt, *tags, bookId",
      settings: "key",
      location: "[articleId+revision]",
      highlights: "id, [articleId+revision]",
      notes: "id, highlightId",
      books: "id, title, *tags",
      assets: "[articleId+assetId], articleId",
    });
    await legacy.open();

    // One representative row per legacy store (schema-validated shapes —
    // the same rows the v7 reader must still read honestly).
    const article = ArticleSchema.parse({
      id: "legacy-v6-article",
      revision: 1,
      lang: "en",
      provenance: {
        sourceUrl: "https://example.com/legacy",
        title: "Legacy Article",
        retrievedAt: "2026-09-01T00:00:00.000Z",
        originalHtmlHash: "sha256:" + "1".repeat(64),
      },
      blocks: [
        { kind: "paragraph", content: [{ text: "Legacy body.", marks: [] }] },
      ],
      footnotes: [],
      ingestionMeta: {
        source: "url",
        origin: "url",
        sourceUrl: "https://example.com/legacy",
        originalHtmlHash: "sha256:" + "1".repeat(64),
        fetchedAt: "2026-09-01T00:00:00.000Z",
        extractionConfidence: "high",
        extractionWarnings: [],
      },
    });
    const highlight = HighlightRecordSchema.parse({
      schemaVersion: 1,
      id: "legacy-h1",
      articleId: "legacy-v6-article",
      revision: 1,
      position: { start: 0, end: 6 },
      quote: { prefix: "", exact: "Legacy", suffix: " body." },
      createdAt: "2026-09-02T00:00:00.000Z",
    });
    const note = NoteRecordSchema.parse({
      schemaVersion: 1,
      id: "legacy-n1",
      highlightId: "legacy-h1",
      text: "a legacy note",
      updatedAt: "2026-09-02T00:00:00.000Z",
    });
    const location = LocationRecordSchema.parse({
      schemaVersion: 1,
      articleId: "legacy-v6-article",
      revision: 1,
      graphemeOffset: 42,
      savedAt: "2026-09-03T00:00:00.000Z",
    });
    const book = BookSchema.parse({
      id: "legacy-v6-book",
      title: "Legacy Book",
      authors: ["An Author"],
      language: "en",
      chapterArticleIds: [],
      skippedChapterCount: 0,
      source: "epub-upload",
      originalFileHash: "sha256:" + "3".repeat(64),
      addedAt: "2026-09-01T00:00:00.000Z",
    });
    // Plain Dexie exposes tables via .table(name) (no typed properties on
    // the base class — the legacy instance only needs the puts).
    await legacy.table("articles").put(article);
    await legacy.table("highlights").put(highlight);
    await legacy.table("notes").put(note);
    await legacy.table("location").put(location);
    await legacy.table("books").put(book);
    await legacy.table("settings").put({
      key: "reader-prefs",
      value: { theme: "sepia" },
    });
    await legacy.close();

    // Reopening the app singleton runs the v6→v7 upgrade: a NEW empty
    // store — NO .upgrade() callback, no row migration (Pitfall 9).
    await db.open();

    // Every legacy row survives byte-honest (re-validated through the same
    // Zod schemas the read paths use).
    expect(await db.articles.get("legacy-v6-article")).toBeDefined();
    expect(
      HighlightRecordSchema.safeParse(await db.highlights.get("legacy-h1")).success,
    ).toBe(true);
    expect(
      NoteRecordSchema.safeParse(await db.notes.get("legacy-n1")).success,
    ).toBe(true);
    const loc = await db.location.get(["legacy-v6-article", 1]);
    expect(
      LocationRecordSchema.safeParse(loc).success,
    ).toBe(true);
    expect(
      BookSchema.safeParse(await db.books.get("legacy-v6-book")).success,
    ).toBe(true);
    expect((await db.settings.get("reader-prefs"))?.value).toEqual({
      theme: "sepia",
    });
    expect(await db.articles.count()).toBe(1);
    expect(await db.highlights.count()).toBe(1);
    expect(await db.notes.count()).toBe(1);
    expect(await db.location.count()).toBe(1);
    expect(await db.books.count()).toBe(1);

    // The new store exists, starts EMPTY, and the v7 indexes are live
    // (the articleId index — the cascade-delete range — is queryable).
    expect(await db.readingSessions.count()).toBe(0);
    expect(
      await db.readingSessions.where("articleId").equals("legacy-v6-article").count(),
    ).toBe(0);
    await db.readingSessions.put({
      schemaVersion: 1,
      id: "post-upgrade-visit",
      articleId: "legacy-v6-article",
      startedAt: "2026-09-16T08:00:00.000Z",
      endedAt: "2026-09-16T08:04:00.000Z",
      startOffset: 42,
      endOffset: 900,
      activeSeconds: 200,
    });
    expect(await db.readingSessions.count()).toBe(1);
    expect(
      await db.readingSessions.where("articleId").equals("legacy-v6-article").count(),
    ).toBe(1);
  });
});
