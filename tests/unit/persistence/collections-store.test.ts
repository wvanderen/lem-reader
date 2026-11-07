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

describe("collectionsStore editing (issue #243)", () => {
  beforeEach(wipeDatabase);

  // A seeded three-entry collection (bypassing the add seam — the ORDER
  // under test is arbitrary, not append-built; raw put is the tamper-free
  // seeding discipline). Returns the collection WITH its entry ids.
  async function seedOrderedCollection() {
    const { db } = await loadDb();
    const { CollectionSchema } = await import("../../../src/content/schema");
    const raw = {
      schemaVersion: 1,
      id: "ordered-plan",
      name: "Ordered plan",
      entries: ["first-entry", "second-entry", "third-entry"].map((entryId, i) => ({
        id: entryId,
        target: { kind: "article", articleId: `getting-started-${i + 1}` },
        addedAt: "2026-10-01T00:00:0" + i + ".000Z",
      })),
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    };
    const collection = CollectionSchema.parse(raw);
    await db.collections.put(collection);
    return collection;
  }

  it("moveCollectionEntry reorders by stable entry id and preserves every entry's identity", async () => {
    const { moveCollectionEntry, getCollection } = await loadStore();
    const seeded = await seedOrderedCollection();

    // Move the SECOND entry to the front (the up-control's toIndex).
    const result = await moveCollectionEntry(seeded.id, "second-entry", 0);
    expect(result.outcome).toBe("moved");
    if (result.outcome !== "moved") return;
    expect(result.collection.entries.map((e) => e.id)).toEqual([
      "second-entry",
      "first-entry",
      "third-entry",
    ]);
    // Entry identity is UNTOUCHED: same id, same target, same addedAt —
    // only array position changed (the reorder must not mint new entries
    // or re-target them — issue #243 AC "entry/target identities stable").
    expect(result.collection.entries[0]).toEqual(seeded.entries[1]);
    expect(result.collection.entries[1]).toEqual(seeded.entries[0]);
    expect(result.collection.entries[2]).toEqual(seeded.entries[2]);
    // updatedAt bumped (the collections-list recency sort reads it).
    expect(result.collection.updatedAt > seeded.updatedAt).toBe(true);

    // The new order persists across a fresh read.
    const reread = await getCollection(seeded.id);
    expect(reread?.entries.map((e) => e.id)).toEqual([
      "second-entry",
      "first-entry",
      "third-entry",
    ]);
  });

  it("moveCollectionEntry moves last→first and clamps out-of-range requests to the nearest boundary", async () => {
    const { moveCollectionEntry } = await loadStore();
    const seeded = await seedOrderedCollection();

    // The LAST entry asked far past the end clamps onto the last place —
    // a boundary control or a drag past the ends can never throw an entry
    // off-list (issue #243 AC "first/last-entry movement").
    const toEnd = await moveCollectionEntry(seeded.id, "first-entry", 99);
    expect(toEnd.outcome).toBe("moved");
    if (toEnd.outcome !== "moved") return;
    expect(toEnd.collection.entries.map((e) => e.id)).toEqual([
      "second-entry",
      "third-entry",
      "first-entry",
    ]);

    // And back to the very front from the last place (last-entry movement).
    const toFront = await moveCollectionEntry(seeded.id, "first-entry", -5);
    expect(toFront.outcome).toBe("moved");
    if (toFront.outcome !== "moved") return;
    expect(toFront.collection.entries.map((e) => e.id)).toEqual([
      "first-entry",
      "second-entry",
      "third-entry",
    ]);
  });

  it("moveCollectionEntry refuses a no-move honestly and reports missing collections/entries", async () => {
    const { moveCollectionEntry, getCollection } = await loadStore();
    const seeded = await seedOrderedCollection();

    // The entry asked onto its own place (a clamped boundary press the
    // disabled control should have stopped): an honest no, not a fake
    // success — nothing writes, updatedAt stays put.
    const noMove = await moveCollectionEntry(seeded.id, "first-entry", 0);
    expect(noMove.outcome).toBe("no-move");
    const afterNoMove = await getCollection(seeded.id);
    expect(afterNoMove?.updatedAt).toBe(seeded.updatedAt);

    // Unknown collection and unknown entry are distinct honest nos.
    expect((await moveCollectionEntry("no-such-plan", "first-entry", 0)).outcome).toBe(
      "collection-missing",
    );
    expect((await moveCollectionEntry(seeded.id, "no-such-entry", 0)).outcome).toBe(
      "entry-missing",
    );
  });

  it("removeCollectionEntry removes exactly one entry and leaves every other store untouched", async () => {
    const { removeCollectionEntry, getCollection } = await loadStore();
    const { db } = await loadDb();
    const { ArticleSchema, BookSchema, HighlightRecordSchema } =
      await import("../../../src/content/schema");
    const seeded = await seedOrderedCollection();

    // Rows in every store membership MUST NOT touch (ADR 0011 — a
    // collection references, never owns; the deletion-adjacent write can
    // never cascade). One article + one book + one highlight + one
    // location + one note, each with a known count asserted after.
    const article = ArticleSchema.parse({
      id: "removal-target",
      revision: 1,
      lang: "en",
      provenance: {
        title: "Removal target",
        retrievedAt: "2026-10-01T00:00:00.000Z",
        originalHtmlHash: `sha256:${"7".repeat(64)}`,
      },
      blocks: [{ kind: "paragraph", content: [{ text: "Body.", marks: [] }] }],
      ingestionMeta: {
        source: "paste",
        origin: "paste",
        originalHtmlHash: `sha256:${"7".repeat(64)}`,
        ingestedAt: "2026-10-01T00:00:00.000Z",
        extractionConfidence: "high",
      },
      addedAt: "2026-10-01T00:00:00.000Z",
    });
    await db.articles.put(article);
    const book = BookSchema.parse({
      id: "epub-aaaaaaaaaaaa",
      title: "Collected Works",
      authors: ["A. Author"],
      language: "en",
      chapterArticleIds: [],
      source: "epub-upload",
      originalFileHash: `sha256:${"8".repeat(64)}`,
      addedAt: "2026-10-01T00:00:00.000Z",
    });
    await db.books.put(book);
    const highlight = HighlightRecordSchema.parse({
      schemaVersion: 1,
      id: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a",
      articleId: article.id,
      revision: 1,
      position: { start: 3, end: 8 },
      quote: { prefix: "", exact: "Body.", suffix: "" },
      createdAt: "2026-10-01T00:00:00.000Z",
    });
    await db.highlights.put(highlight);
    await db.location.put({
      schemaVersion: 1,
      articleId: article.id,
      revision: 1,
      graphemeOffset: 12,
      savedAt: "2026-10-02T00:00:00.000Z",
    });

    // Remove the MIDDLE entry.
    const result = await removeCollectionEntry(seeded.id, "second-entry");
    expect(result.outcome).toBe("removed");
    if (result.outcome !== "removed") return;
    expect(result.collection.entries.map((e) => e.id)).toEqual(["first-entry", "third-entry"]);
    // The remaining entries keep their identity (removal splices — it
    // never rebuilds neighbors).
    expect(result.collection.entries[0]).toEqual(seeded.entries[0]);
    expect(result.collection.entries[1]).toEqual(seeded.entries[2]);

    // THE OWNERSHIP GUARANTEE (issue #243 AC): every library row that was
    // there before is still there, byte-for-byte.
    expect(await db.articles.get(article.id)).toEqual(article);
    expect(await db.books.get(book.id)).toEqual(book);
    expect(await db.highlights.get(highlight.id)).toEqual(highlight);
    expect(await db.location.get([article.id, 1])).toEqual({
      schemaVersion: 1,
      articleId: article.id,
      revision: 1,
      graphemeOffset: 12,
      savedAt: "2026-10-02T00:00:00.000Z",
    });

    // And the removal persists across a fresh read.
    const reread = await getCollection(seeded.id);
    expect(reread?.entries.map((e) => e.id)).toEqual(["first-entry", "third-entry"]);
  });

  it("removeCollectionEntry refuses missing collections/entries and aborts corrupt rows", async () => {
    const { removeCollectionEntry, CollectionCorruptError, CollectionMissingError } =
      await loadStore();
    const { db } = await loadDb();
    const seeded = await seedOrderedCollection();

    expect((await removeCollectionEntry("no-such-plan", "first-entry")).outcome).toBe(
      "collection-missing",
    );
    expect((await removeCollectionEntry(seeded.id, "no-such-entry")).outcome).toBe("entry-missing");

    // A corrupt row aborts the removal (T-242a — never write onto garbage;
    // a visible throw, never a silent success).
    await db.collections.put({ id: "broken-plan", entries: [] } as unknown as Collection);
    await expect(removeCollectionEntry("broken-plan", "first-entry")).rejects.toBeInstanceOf(
      CollectionCorruptError,
    );
    // The corrupt row itself is untouched.
    expect(await db.collections.get("broken-plan")).not.toBeNull();
    void CollectionMissingError;
  });

  it("a storage failure mid-move or mid-remove rolls the transaction back — order and membership survive", async () => {
    const { moveCollectionEntry, removeCollectionEntry, getCollection } = await loadStore();
    const { db } = await loadDb();
    const seeded = await seedOrderedCollection();
    const hook = () => {
      throw new Error("injected put failure");
    };
    db.collections.hook("updating", hook);
    try {
      await expect(moveCollectionEntry(seeded.id, "second-entry", 0)).rejects.toThrow(
        "injected put failure",
      );
      await expect(removeCollectionEntry(seeded.id, "second-entry")).rejects.toThrow(
        "injected put failure",
      );
    } finally {
      db.collections.hook("updating").unsubscribe(hook);
    }
    // Both writes landed nowhere: the seeded order survives intact.
    const reread = await getCollection(seeded.id);
    expect(reread?.entries.map((e) => e.id)).toEqual([
      "first-entry",
      "second-entry",
      "third-entry",
    ]);
  });

  it("deleteCollection removes ONLY the collection row — every library row survives byte-for-byte", async () => {
    const { deleteCollection, createCollection, getCollection, CollectionMissingError } =
      await loadStore();
    const { db } = await loadDb();
    const { ArticleSchema, BookSchema, HighlightRecordSchema } =
      await import("../../../src/content/schema");
    const doomed = await createCollection("Doomed plan");
    const survivor = await createCollection("Survivor plan");

    // A populated library the doomed collection points INTO (the exact
    // shape issue #243 forbids cascading: readings, annotations, shared
    // positions, and the other collection referencing the same reading).
    const article = ArticleSchema.parse({
      id: "delete-survivor",
      revision: 1,
      lang: "en",
      provenance: {
        title: "Delete survivor",
        retrievedAt: "2026-10-01T00:00:00.000Z",
        originalHtmlHash: `sha256:${"9".repeat(64)}`,
      },
      blocks: [{ kind: "paragraph", content: [{ text: "Body.", marks: [] }] }],
      ingestionMeta: {
        source: "paste",
        origin: "paste",
        originalHtmlHash: `sha256:${"9".repeat(64)}`,
        ingestedAt: "2026-10-01T00:00:00.000Z",
        extractionConfidence: "high",
      },
      addedAt: "2026-10-01T00:00:00.000Z",
    });
    await db.articles.put(article);
    const book = BookSchema.parse({
      id: "epub-aaaaaaaaaaaa",
      title: "Collected Works",
      authors: ["A. Author"],
      language: "en",
      chapterArticleIds: [],
      source: "epub-upload",
      originalFileHash: `sha256:${"a".repeat(64)}`,
      addedAt: "2026-10-01T00:00:00.000Z",
    });
    await db.books.put(book);
    const highlight = HighlightRecordSchema.parse({
      schemaVersion: 1,
      id: "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b",
      articleId: article.id,
      revision: 1,
      position: { start: 3, end: 8 },
      quote: { prefix: "", exact: "Body.", suffix: "" },
      createdAt: "2026-10-01T00:00:00.000Z",
    });
    await db.highlights.put(highlight);
    await db.location.put({
      schemaVersion: 1,
      articleId: article.id,
      revision: 1,
      graphemeOffset: 12,
      savedAt: "2026-10-02T00:00:00.000Z",
    });
    const { addCollectionEntry } = await loadStore();
    await addCollectionEntry(doomed.id, { kind: "article", articleId: article.id });
    await addCollectionEntry(doomed.id, { kind: "book", bookId: book.id });
    // MANY-TO-MANY preservation: the same reading in the OTHER collection
    // must be unaffected by the doomed one's deletion.
    await addCollectionEntry(survivor.id, { kind: "article", articleId: article.id });

    await deleteCollection(doomed.id);

    // The ONE row is gone.
    expect(await getCollection(doomed.id)).toBeNull();
    // EVERY library row survives byte-for-byte (deleting a collection is
    // never an owning book-deletion operation — ADR 0011).
    expect(await db.articles.get(article.id)).toEqual(article);
    expect(await db.books.get(book.id)).toEqual(book);
    expect(await db.highlights.get(highlight.id)).toEqual(highlight);
    expect(await db.location.get([article.id, 1])).toMatchObject({ graphemeOffset: 12 });
    // The other collection keeps its membership (and the survivor row).
    const survivorReread = await getCollection(survivor.id);
    expect(survivorReread?.entries.map((e) => e.target)).toEqual([
      { kind: "article", articleId: article.id },
    ]);

    // Deleting an ABSENT id is a typed missing error — a delete of nothing
    // is a failure, never a silent success (the renameCollection contract).
    await expect(deleteCollection(doomed.id)).rejects.toBeInstanceOf(CollectionMissingError);
  });

  it("a storage failure mid-delete leaves the collection row in place", async () => {
    const { deleteCollection, createCollection, getCollection } = await loadStore();
    const { db } = await loadDb();
    const created = await createCollection("Rollback delete");
    const hook = () => {
      throw new Error("injected delete failure");
    };
    db.collections.hook("deleting", hook);
    try {
      await expect(deleteCollection(created.id)).rejects.toThrow("injected delete failure");
    } finally {
      db.collections.hook("deleting").unsubscribe(hook);
    }
    expect(await getCollection(created.id)).not.toBeNull();
  });
});
