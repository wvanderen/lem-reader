// tests/unit/persistence/structure-store.spec.ts
// Issue #236 AC — lazy structural persistence checks the matching revision
// and cannot overwrite concurrent reader metadata edits; failure is an
// honest outcome, never a thrown crash and never a blocked reader.
//
// The store writes the structure field through a PARTIAL Dexie update inside
// a transaction that re-reads the row — so a metadata edit (readerTitle and
// friends) that lands before or after the structure write survives byte-intact,
// and a stale write against a different revision is refused.
import { beforeEach, describe, expect, it } from "vitest";
import fakeIndexedDB, { IDBKeyRange } from "fake-indexeddb";
import { Dexie } from "dexie";
import {
  ArticleSchema,
  WorkStructureSchema,
  type CanonicalArticle,
} from "../../../src/content/schema";
import { deriveWorkStructure } from "../../../src/content/structure";

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

const article = (overrides: Partial<CanonicalArticle> = {}): CanonicalArticle =>
  ArticleSchema.parse({
    id: "structure-store-article",
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: "https://example.com/store",
      title: "Store Article",
      retrievedAt: "2026-08-07T00:00:00Z",
      originalHtmlHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    },
    blocks: [
      { kind: "heading", level: 2, content: [{ text: "One", marks: [] }] },
      { kind: "paragraph", content: [{ text: "Prose.", marks: [] }] },
    ],
    footnotes: [],
    ...overrides,
  });

async function seedArticle(row: CanonicalArticle): Promise<void> {
  const { db } = await loadDb();
  await db.articles.put(row);
}

describe("structureStore.saveWorkStructure (issue #236)", () => {
  beforeEach(async () => {
    await wipeDatabase();
    const { db } = await loadDb();
    // A prior test's close (the failure-disclosure case) must not poison
    // the shared singleton — Dexie reopens on demand.
    if (!db.isOpen()) await db.open();
  });

  it("persists the structure through a partial update that preserves sibling row fields", async () => {
    const { db } = await loadDb();
    const { saveWorkStructure } = await import("../../../src/persistence/structureStore");
    const row = article({ readerTitle: "Reader's own name" });
    await seedArticle(row);
    const structure = deriveWorkStructure(row)!;

    const outcome = await saveWorkStructure(row.id, row.revision, structure);
    expect(outcome).toEqual({ saved: true });

    const stored = await db.articles.get(row.id);
    expect(stored?.structure).toEqual(structure);
    expect(WorkStructureSchema.safeParse(stored?.structure).success).toBe(true);
    // The concurrent reader-metadata edit was never touched.
    expect(stored?.readerTitle).toBe("Reader's own name");
    expect(stored?.revision).toBe(1);
    // Canonical fields untouched.
    expect(stored?.blocks).toEqual(row.blocks);
  });

  it("refuses a stale write against a changed revision without touching the row", async () => {
    const { db } = await loadDb();
    const { saveWorkStructure } = await import("../../../src/persistence/structureStore");
    const row = article();
    await seedArticle(row);
    const structure = deriveWorkStructure(row)!;

    // The reader re-ingested (revision moved on) between derivation and save.
    await db.articles.put({ ...row, revision: 2 });
    const outcome = await saveWorkStructure(row.id, 1, structure);
    expect(outcome).toEqual({ saved: false, reason: "revision-changed" });

    const stored = await db.articles.get(row.id);
    expect(stored?.structure).toBeUndefined();
    expect(stored?.revision).toBe(2);
  });

  it("reports a missing row (bundled fixture or concurrent removal) without writing", async () => {
    const { db } = await loadDb();
    const { saveWorkStructure } = await import("../../../src/persistence/structureStore");
    const row = article();
    const structure = deriveWorkStructure(row)!;
    const outcome = await saveWorkStructure(row.id, row.revision, structure);
    expect(outcome).toEqual({ saved: false, reason: "missing-row" });
    expect(await db.articles.get(row.id)).toBeUndefined();
  });

  it("discloses a write failure instead of throwing", async () => {
    const { db } = await loadDb();
    const { saveWorkStructure } = await import("../../../src/persistence/structureStore");
    const row = article();
    await seedArticle(row);
    const structure = deriveWorkStructure(row)!;
    db.close(); // the store is unavailable — quota, private mode, open failure
    const outcome = await saveWorkStructure(row.id, row.revision, structure);
    expect(outcome).toEqual({ saved: false, reason: "write-failed" });
  });

  it("a metadata put that races AFTER the structure write keeps both fields", async () => {
    const { db } = await loadDb();
    const { saveWorkStructure } = await import("../../../src/persistence/structureStore");
    const row = article();
    await seedArticle(row);
    const structure = deriveWorkStructure(row)!;
    await saveWorkStructure(row.id, row.revision, structure);
    // The metadata editor's whole-row put carries the structure it read.
    await db.articles.put({ ...row, readerAuthor: "Later Editor", structure });
    const stored = await db.articles.get(row.id);
    expect(stored?.structure).toEqual(structure);
    expect(stored?.readerAuthor).toBe("Later Editor");
    expect(stored?.readerTitle).toBeUndefined();
  });
});
