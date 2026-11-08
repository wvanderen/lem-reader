// tests/unit/persistence/collection-active-entries-migration.spec.ts
// Issue #247 AC — the Dexie v12 → v13 additive upgrade preserves EVERY
// existing row and the new `collectionActiveEntries` store starts empty and
// is immediately usable. NO .upgrade() callback — the v13 block only ADDS a
// store (the v3..v11 additive precedent, Pitfall 9), so the upgrade is
// Dexie's plain store-creation on next open; the v11 → v12 completions
// migration proved the same discipline one version earlier.
//
// Own spec FILE (the reading-sessions v6→v7 / subscriptions v7→v8 /
// note-drafts v8→v9 / collections v10→v11 / completions v11→v12 precedent):
// the legacy instance must open the same database name at a LOWER version
// than the app singleton — the wipe + db.close() dance keeps that isolated.
import { beforeEach, describe, expect, it } from "vitest";
import { LocationRecordSchema, CollectionSchema } from "../../../src/content/schema";
import fakeIndexedDB, { IDBKeyRange } from "fake-indexeddb";
import { Dexie } from "dexie";

Dexie.dependencies.indexedDB = fakeIndexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;
(globalThis as { indexedDB?: typeof fakeIndexedDB }).indexedDB = fakeIndexedDB;
(globalThis as { IDBKeyRange?: typeof IDBKeyRange }).IDBKeyRange = IDBKeyRange;

async function wipeDatabase(): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = fakeIndexedDB.deleteDatabase("lem-reader");
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

describe("Dexie v12 → v13 additive upgrade (issue #247, Pitfall 9)", () => {
  beforeEach(wipeDatabase);

  it("a v12-shaped DB upgraded by the v13 declaration keeps every legacy row; collectionActiveEntries starts empty and works", async () => {
    const { db } = await import("../../../src/persistence/db");
    db.close();

    // A v12-shaped database: the EXACT v12 store strings from db.ts history
    // (completions present, collectionActiveEntries absent).
    const legacy = new Dexie("lem-reader");
    legacy.version(12).stores({
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
      collections: "id, updatedAt",
      completions: "targetKey",
    });
    await legacy.open();

    const location = LocationRecordSchema.parse({
      schemaVersion: 1,
      articleId: "legacy-v12-article",
      revision: 1,
      graphemeOffset: 7,
      savedAt: "2026-10-01T00:00:00.000Z",
    });
    await legacy.table("location").put(location);
    const collection = CollectionSchema.parse({
      schemaVersion: 1,
      id: "legacy-collection",
      name: "Winter reading",
      entries: [],
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    });
    await legacy.table("collections").put(collection);
    await legacy.close();

    const { db: upgraded } = await import("../../../src/persistence/db");
    await upgraded.open();
    expect((await upgraded.location.get([location.articleId, 1]))?.graphemeOffset).toBe(7);
    expect((await upgraded.collections.get("legacy-collection"))?.name).toBe("Winter reading");

    // The new store starts EMPTY and is immediately usable — the upgrade
    // itself wrote nothing. (The seam's behavioral coverage lives in the
    // browser suite; this spec pins the physical layer through table reads,
    // which are deterministic in this harness.)
    expect(await upgraded.collectionActiveEntries.count()).toBe(0);
    await upgraded.collectionActiveEntries.put({
      schemaVersion: 1,
      collectionId: "legacy-collection",
      entryId: "entry-1",
      updatedAt: "2026-10-01T00:00:00.000Z",
    });
    const remembered = await upgraded.collectionActiveEntries.get("legacy-collection");
    expect(remembered?.entryId).toBe("entry-1");
  });
});
