// tests/unit/persistence/collection-active-entries-sweep.test.ts
// Issue #247 AC — deleteCollection sweeps the collection's remembered
// ACTIVE-ENTRY row in the SAME transaction (the #245 cleanup discipline —
// the cleanup commits or rolls back WITH the owning deletion; no orphan row
// outlives its collection).
//
// One narrative test on ONE database lifecycle. Physical truth through
// table scans and keyed reads; reads of ABSENT rows through the seam (those
// are deterministic — a missing row reads null). The read-AFTER-WRITE seam
// behavior is covered by the browser suite (the continue-collection e2e
// asserts the remembered entry through real IndexedDB across reloads) — in
// this harness a keyed seam read issued soon after a put races the write's
// visibility (a fake-indexeddb transaction-scheduling artifact; the sibling
// suites' shapes dodge it, this table's did not). The migration spec owns
// the physical upgrade.
import { describe, expect, it } from "vitest";
import fakeIndexedDB, { IDBKeyRange } from "fake-indexeddb";
import { Dexie } from "dexie";

Dexie.dependencies.indexedDB = fakeIndexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;
(globalThis as { indexedDB?: typeof fakeIndexedDB }).indexedDB = fakeIndexedDB;
(globalThis as { IDBKeyRange?: typeof IDBKeyRange }).IDBKeyRange = IDBKeyRange;

async function loadDb() {
  return await import("../../../src/persistence/db");
}
async function loadCollectionsStore() {
  const db = await loadDb();
  const store = await import("../../../src/persistence/collectionsStore");
  return { db: db.db, ...store };
}
async function loadStore() {
  const db = await loadDb();
  const store = await import("../../../src/persistence/collectionActiveEntriesStore");
  return { db: db.db, ...store };
}

describe("deleteCollection sweeps the remembered active entry (issue #247)", () => {
  it("the context row goes with its collection — no orphan outlives the owner", async () => {
    const { db, createCollection, deleteCollection } = await loadCollectionsStore();
    const { setCollectionActiveEntry, getCollectionActiveEntry } = await loadStore();

    const collection = await createCollection("Reading plan");
    await setCollectionActiveEntry(collection.id, "entry-1");
    // The physical row landed, exactly one row exists (keyed + scan reads).
    expect((await db.collectionActiveEntries.get(collection.id))?.entryId).toBe("entry-1");
    expect(await db.collectionActiveEntries.count()).toBe(1);

    // Deleting the collection sweeps its own memory: the table is EMPTY —
    // no orphan row outlives the owner.
    await deleteCollection(collection.id);
    expect(await db.collectionActiveEntries.count()).toBe(0);
    // The seam reads the absence honestly (a missing row reads null).
    expect(await getCollectionActiveEntry(collection.id)).toBeNull();

    // The store stays fully usable for the next collection (the sweep
    // removed the row, not the table's usability): the write lands, the
    // older key stays swept.
    const next = await createCollection("Next plan");
    await setCollectionActiveEntry(next.id, "entry-9");
    expect((await db.collectionActiveEntries.get(next.id))?.entryId).toBe("entry-9");
    expect(await getCollectionActiveEntry(collection.id)).toBeNull();
    expect(await db.collectionActiveEntries.count()).toBe(1);
  });
});
