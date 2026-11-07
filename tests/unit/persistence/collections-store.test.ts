// tests/unit/persistence/collections-store.test.ts
// Issue #242 — the collectionsStore seam truths (the booksStore.test.ts
// harness: fake-indexeddb via Dexie.dependencies at module top-level,
// wipeDatabase beforeEach, lazy module imports):
//
//   - createCollection + listCollections round-trip: a created collection
//     comes back Zod-validated with EMPTY entries (a collection is born
//     empty — membership is added explicitly), schemaVersion 1, and ISO
//     stamps; the list sorts most-recently-updated first.
//   - An empty/whitespace-only name is REFUSED (rejected before any write —
//     an unnamed collection is unrepresentable, the readerTitle min(1)
//     discipline) and persists nothing.
//   - A corrupt persisted row is DROPPED calmly by listCollections (the
//     STATE-04 safeParse discipline — one malformed row never blocks the
//     surface, and never masquerades as a collection).
//   - addCollectionEntry appends ORDERED entries with stable ids and
//     refuses the exact same target twice within ONE collection (the
//     non-repetition rule) while the SAME target in ANOTHER collection
//     stays allowed (many-to-many membership).
//   - Target references are VALIDATED against the composite library at
//     write time: an unknown article/book id is refused (no dangling
//     reference) — fixture articles and Dexie rows both count as existing.
//   - A storage failure mid-add (Dexie creating-hook throw) rolls the
//     transaction back — the entry lands NOWHERE and the rejection
//     surfaces (an honest failed write, never a silent half-save).
//   - renameCollection round-trips and refuses empty names + unknown ids.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fakeIndexedDB, { IDBKeyRange } from "fake-indexeddb";
import { Dexie } from "dexie";
import type { Collection } from "../../../src/content/schema";

// Dexie 4 captures `indexedDB` + `IDBKeyRange` on `Dexie.dependencies` at
// dexie-module-load time. Install BOTH onto `Dexie.dependencies` (the
// Dexie-internal read path) AND `globalThis` (the direct-read path Dexie
// uses for deleteDatabase) — the books-store.test.ts harness verbatim.
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
// Dexie.dependencies (the books-store.test.ts discipline).
async function loadStore() {
  return await import("../../../src/persistence/collectionsStore");
}
async function loadDb() {
  return await import("../../../src/persistence/db");
}

describe("collectionsStore (issue #242)", () => {
  beforeEach(wipeDatabase);
  afterEach(() => {
    // Hook deregistration lives with the test that registers one (the
    // books-store.test.ts cross-test-bleed rule).
  });

  it("create + list round-trip: a new collection is born empty, validated, and listed newest-first", async () => {
    const { createCollection, listCollections } = await loadStore();

    const first = await createCollection("Morning essays");
    expect(first.name).toBe("Morning essays");
    expect(first.entries).toEqual([]);
    expect(first.schemaVersion).toBe(1);
    expect(first.id).toMatch(/^[a-z0-9-]+$/);
    expect(first.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(first.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // A second collection, created later, lists first (updatedAt desc).
    const second = await createCollection("Evening novels");
    const listed = await listCollections();
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.collections.map((c) => c.id)).toEqual([second.id, first.id]);
    expect(listed.collections[0]!.name).toBe("Evening novels");
  });

  it("refuses an empty or whitespace-only name before any write", async () => {
    const { createCollection, listCollections } = await loadStore();
    await expect(createCollection("   ")).rejects.toThrow();
    await expect(createCollection("")).rejects.toThrow();
    const listed = await listCollections();
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.collections).toEqual([]);
  });

  it("a corrupt persisted row is dropped calmly by listCollections", async () => {
    const { createCollection, listCollections } = await loadStore();
    const { db } = await loadDb();
    const good = await createCollection("Keep me");
    // A row that fails CollectionSchema (missing name) — seeded raw, the
    // way a tampered/partial write would leave it (the subscriptions-store
    // corrupt-row seeding cast).
    await db.collections.put({ id: "broken-row", entries: [] } as unknown as Collection);
    const listed = await listCollections();
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.collections.map((c) => c.id)).toEqual([good.id]);
  });

  it("addCollectionEntry appends ordered entries with stable ids and bumps updatedAt", async () => {
    const { createCollection, addCollectionEntry, getCollection } = await loadStore();
    const { db } = await loadDb();
    const { ArticleSchema } = await import("../../../src/content/schema");
    // One BUNDLED library member (libraryFixtures — the composite list) and
    // one INGESTED row: both are real library articles the picker offers.
    const ingested = ArticleSchema.parse({
      id: "ingested-second-target",
      revision: 1,
      lang: "en",
      provenance: {
        title: "Second target",
        retrievedAt: "2026-10-01T00:00:00.000Z",
        originalHtmlHash: `sha256:${"5".repeat(64)}`,
      },
      blocks: [{ kind: "paragraph", content: [{ text: "Body.", marks: [] }] }],
      ingestionMeta: {
        source: "paste",
        origin: "paste",
        originalHtmlHash: `sha256:${"5".repeat(64)}`,
        ingestedAt: "2026-10-01T00:00:00.000Z",
        extractionConfidence: "high",
      },
      addedAt: "2026-10-01T00:00:00.000Z",
    });
    await db.articles.put(ingested);
    const created = await createCollection("Winter queue");
    const first = await addCollectionEntry(created.id, {
      kind: "article",
      articleId: "getting-started",
    });
    expect(first.outcome).toBe("added");
    const second = await addCollectionEntry(created.id, {
      kind: "article",
      articleId: ingested.id,
    });
    if (second.outcome !== "added") throw new Error("second add refused");
    const entryIds = second.collection.entries.map((e) => e.id);
    // Array order IS the collection order; entry ids are stable identities.
    expect(entryIds).toHaveLength(2);
    expect(new Set(entryIds).size).toBe(2);
    // The FIRST add's entry is unchanged by the second (stable identity).
    expect(second.collection.entries[0]!.id).toBe(
      (first as { outcome: "added"; collection: { entries: { id: string }[] } }).collection
        .entries[0]!.id,
    );
    // Re-read through the seam: order + membership persist.
    const reread = await getCollection(created.id);
    expect(reread?.entries.map((e) => e.target)).toEqual([
      { kind: "article", articleId: "getting-started" },
      { kind: "article", articleId: ingested.id },
    ]);
    expect(reread && reread.updatedAt >= created.updatedAt).toBe(true);
  });

  it("refuses the exact same target twice in ONE collection, but allows it in ANOTHER", async () => {
    const { createCollection, addCollectionEntry } = await loadStore();
    const plan = await createCollection("Plan A");
    const firstAdd = await addCollectionEntry(plan.id, {
      kind: "article",
      articleId: "getting-started",
    });
    expect(firstAdd.outcome).toBe("added");
    // Same collection, same target → calm refusal, no second entry.
    const dup = await addCollectionEntry(plan.id, {
      kind: "article",
      articleId: "getting-started",
    });
    expect(dup.outcome).toBe("duplicate");
    // Many-to-many: the SAME target in a DIFFERENT collection is allowed.
    const other = await createCollection("Plan B");
    const crossAdd = await addCollectionEntry(other.id, {
      kind: "article",
      articleId: "getting-started",
    });
    expect(crossAdd.outcome).toBe("added");
  });

  it("validates targets against the composite library: unknown ids are refused, ingested rows accepted", async () => {
    const { createCollection, addCollectionEntry, getCollection } = await loadStore();
    const { db } = await loadDb();
    const { ArticleSchema, BookSchema } = await import("../../../src/content/schema");
    const created = await createCollection("Checked refs");

    // An unknown article id → missing-target, nothing persisted.
    const unknownArticle = await addCollectionEntry(created.id, {
      kind: "article",
      articleId: "not-a-real-article",
    });
    expect(unknownArticle.outcome).toBe("missing-target");
    // A schema-valid INGESTED article row (not a fixture) counts as existing.
    const ingested = ArticleSchema.parse({
      id: "ingested-collection-target",
      revision: 1,
      lang: "en",
      provenance: {
        title: "Ingested target",
        retrievedAt: "2026-10-01T00:00:00.000Z",
        originalHtmlHash: `sha256:${"3".repeat(64)}`,
      },
      blocks: [{ kind: "paragraph", content: [{ text: "Body.", marks: [] }] }],
      ingestionMeta: {
        source: "paste",
        origin: "paste",
        originalHtmlHash: `sha256:${"3".repeat(64)}`,
        ingestedAt: "2026-10-01T00:00:00.000Z",
        extractionConfidence: "high",
      },
      addedAt: "2026-10-01T00:00:00.000Z",
    });
    await db.articles.put(ingested);
    const ingestedAdd = await addCollectionEntry(created.id, {
      kind: "article",
      articleId: ingested.id,
    });
    expect(ingestedAdd.outcome).toBe("added");
    // A schema-valid BOOK row counts as existing; an unknown book id refuses.
    const book = BookSchema.parse({
      id: "epub-aaaaaaaaaaaa",
      title: "Collected Works",
      authors: ["A. Author"],
      language: "en",
      chapterArticleIds: [],
      source: "epub-upload",
      originalFileHash: `sha256:${"4".repeat(64)}`,
      addedAt: "2026-10-01T00:00:00.000Z",
    });
    await db.books.put(book);
    const bookAdd = await addCollectionEntry(created.id, { kind: "book", bookId: book.id });
    expect(bookAdd.outcome).toBe("added");
    const unknownBook = await addCollectionEntry(created.id, {
      kind: "book",
      bookId: "epub-bbbbbbbbbbbb",
    });
    expect(unknownBook.outcome).toBe("missing-target");
    // Only the two validated entries persisted — the refusals left nothing.
    const reread = await getCollection(created.id);
    expect(reread?.entries).toHaveLength(2);
  });

  it("refuses chapter articles at the write boundary, not just in the picker", async () => {
    const { createCollection, addCollectionEntry, getCollection } = await loadStore();
    const { db } = await loadDb();
    const { ArticleSchema } = await import("../../../src/content/schema");
    const chapter = ArticleSchema.parse({
      id: "collection-chapter-target",
      revision: 1,
      lang: "en",
      provenance: {
        title: "Chapter one",
        retrievedAt: "2026-10-01T00:00:00.000Z",
        originalHtmlHash: `sha256:${"3".repeat(64)}`,
      },
      blocks: [{ kind: "paragraph", content: [{ text: "Chapter body.", marks: [] }] }],
      ingestionMeta: {
        source: "epub-chapter",
        origin: "upload",
        bookId: "epub-aaaaaaaaaaaa",
        chapterIndex: 0,
        originalHtmlHash: `sha256:${"3".repeat(64)}`,
        ingestedAt: "2026-10-01T00:00:00.000Z",
        extractionConfidence: "high",
      },
    });
    await db.articles.put(chapter);
    const collection = await createCollection("Whole readings");
    const outcome = await addCollectionEntry(collection.id, {
      kind: "article",
      articleId: chapter.id,
    });
    expect(outcome.outcome).toBe("invalid-target");
    expect((await getCollection(collection.id))?.entries).toEqual([]);
  });

  it("a storage failure mid-add rolls the transaction back — no partial write survives", async () => {
    const { createCollection, addCollectionEntry, getCollection } = await loadStore();
    const { db } = await loadDb();
    const created = await createCollection("Rollback check");
    // Dexie UPDATING-hook throw INSIDE the transaction (the books-store
    // atomicity harness, adapted to the overwrite shape: the collection row
    // already exists, so the membership put fires `updating`, not
    // `creating`). Unsubscribed in finally — a hook that outlives its test
    // would poison sibling specs (the books-store cross-test-bleed rule).
    const hook = () => {
      throw new Error("injected put failure");
    };
    db.collections.hook("updating", hook);
    try {
      await expect(
        addCollectionEntry(created.id, { kind: "article", articleId: "getting-started" }),
      ).rejects.toThrow("injected put failure");
    } finally {
      db.collections.hook("updating").unsubscribe(hook);
    }
    // The collection row is untouched: zero entries, no phantom membership.
    const reread = await getCollection(created.id);
    expect(reread?.entries).toEqual([]);
  });

  it("renameCollection round-trips, bumps updatedAt, and refuses blank names + unknown ids", async () => {
    const { createCollection, renameCollection, getCollection, CollectionMissingError } =
      await loadStore();
    const created = await createCollection("Working title");
    const renamed = await renameCollection(created.id, "  Final title  ");
    expect(renamed.name).toBe("Final title"); // trimmed — never a blank-padded name
    const reread = await getCollection(created.id);
    expect(reread?.name).toBe("Final title");
    await expect(renameCollection(created.id, "   ")).rejects.toThrow();
    // An ABSENT id is a missing error — never the corrupt-row class (a
    // rename of nothing is not a rename onto garbage).
    await expect(renameCollection("no-such-collection", "Whatever")).rejects.toBeInstanceOf(
      CollectionMissingError,
    );
  });

  it("an invalid-shaped target is refused as invalid-target, not missing-target", async () => {
    const { createCollection, addCollectionEntry, getCollection } = await loadStore();
    const created = await createCollection("Shape check");
    // A target that fails CollectionEntryTargetSchema itself (missing the
    // id field): schema validation rejects it with its OWN refusal — never
    // the absent-target answer (the seam must not lie about which no it
    // said). Nothing persists.
    const invalid = await addCollectionEntry(created.id, {
      kind: "article",
    } as unknown as Parameters<typeof addCollectionEntry>[1]);
    expect(invalid.outcome).toBe("invalid-target");
    const reread = await getCollection(created.id);
    expect(reread?.entries).toEqual([]);
  });
});
