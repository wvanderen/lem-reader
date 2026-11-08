// tests/unit/persistence/completions-migration.spec.ts
// Issue #246 AC — the Dexie v11 → v12 additive upgrade preserves EVERY
// existing row and the new `completions` store starts empty and is
// immediately usable. NO .upgrade() callback — the v12 block only ADDS a
// store (the v3..v10 additive precedent, Pitfall 9), so the upgrade is
// Dexie's plain store-creation on next open; the v10 → v11 collections
// migration proved the same discipline one version earlier.
//
// Own spec FILE (the reading-sessions v6→v7 / subscriptions v7→v8 /
// note-drafts v8→v9 / collections v10→v11 precedent): the legacy instance
// must open the same database name at a LOWER version than the app
// singleton — the wipe + db.close() dance keeps that isolated.
import { beforeEach, describe, expect, it } from "vitest";
import { LocationRecordSchema } from "../../../src/content/schema";
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

describe("Dexie v11 → v12 additive upgrade (issue #246, Pitfall 9)", () => {
  beforeEach(wipeDatabase);

  it("a v11-shaped DB upgraded by the v12 declaration keeps every legacy row; completions starts empty and works", async () => {
    const { db } = await import("../../../src/persistence/db");
    db.close();

    // A v11-shaped database: the EXACT v11 store strings from db.ts history
    // (collections present, completions absent).
    const legacy = new Dexie("lem-reader");
    legacy.version(11).stores({
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
    });
    await legacy.open();

    const location = LocationRecordSchema.parse({
      schemaVersion: 1,
      articleId: "legacy-v11-article",
      revision: 1,
      graphemeOffset: 7,
      savedAt: "2026-10-01T00:00:00.000Z",
    });
    await legacy.table("location").put(location);
    await legacy.table("collections").put({
      schemaVersion: 1,
      id: "legacy-collection",
      name: "Winter reading",
      entries: [],
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    });
    await legacy.close();

    const { db: upgraded } = await import("../../../src/persistence/db");
    await upgraded.open();
    expect((await upgraded.location.get([location.articleId, 1]))?.graphemeOffset).toBe(7);
    expect((await upgraded.collections.get("legacy-collection"))?.name).toBe("Winter reading");

    // The new store starts EMPTY and is immediately usable through the
    // store seam — the upgrade itself wrote nothing.
    const { loadAllCompletions, recordCompletion } =
      await import("../../../src/persistence/completionsStore");
    expect(await loadAllCompletions()).toEqual([]);
    await recordCompletion({ kind: "article", articleId: "legacy-v11-article" }, true, "reader");
    const all = await loadAllCompletions();
    expect(all).toHaveLength(1);
    expect(all[0]?.targetKey).toBe("article:legacy-v11-article");
  });
});
