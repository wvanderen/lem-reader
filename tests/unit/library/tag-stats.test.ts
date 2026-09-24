// tests/unit/library/tag-stats.test.ts
// Issue #75 (decision #71) — the count-returning tag fold:
//   - deriveTagStats: counts across article + book rows, most-used order,
//     alphabetical ties, empty-library → [] (pure, no persistence)
//   - loadTagStats: the persisted-rows-only store read (dexieLibrarySource
//     + booksStore) folded through the ONE deriveTagStats definition —
//     corrupt article rows dropped (STATE-04), books fail-quiet
//
// Harness mirrors tests/unit/ingestion-tags.test.ts: fake-indexeddb via
// Dexie.dependencies at module top-level, wipeDatabase beforeEach, lazy
// module imports.
import { beforeEach, describe, expect, it } from "vitest";
import { ArticleSchema, BookSchema } from "../../../src/content/schema";
import type { CanonicalArticle } from "../../../src/content/types";
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

async function loadTagsStore() {
  return await import("../../../src/ingestion/library/tagsStore");
}
async function loadLibrarySource() {
  return await import("../../../src/ingestion/LibrarySource");
}
async function loadBooksStore() {
  return await import("../../../src/persistence/booksStore");
}

function sampleArticle(overrides: Partial<CanonicalArticle> = {}): CanonicalArticle {
  return ArticleSchema.parse({
    id: "test-article-slug",
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: "https://example.com/article",
      title: "Sample Article",
      author: "An Author",
      retrievedAt: "2026-08-11T00:00:00.000Z",
      originalHtmlHash: "sha256:" + "0".repeat(64),
    },
    blocks: [
      {
        kind: "paragraph",
        content: [{ text: "Body text here.", marks: [] }],
      },
    ],
    footnotes: [],
    ingestionMeta: {
      source: "url",
      origin: "url",
      sourceUrl: "https://example.com/article",
      originalHtmlHash: "sha256:" + "0".repeat(64),
      fetchedAt: "2026-08-11T00:00:00.000Z",
      extractionConfidence: "high",
      extractionWarnings: [],
    },
    ...overrides,
  });
}

type BookInputArg = Parameters<typeof BookSchema.parse>[0];

function sampleBook(overrides: Partial<BookInputArg> = {}) {
  return BookSchema.parse({
    id: "epub-abc123def456",
    title: "A Sample Book",
    authors: ["An Author"],
    language: "en",
    chapterArticleIds: [],
    skippedChapterCount: 0,
    source: "epub-upload",
    originalFileHash: "sha256:" + "b".repeat(64),
    addedAt: "2026-08-18T00:00:00.000Z",
    ...overrides,
  });
}

describe("deriveTagStats (issue #75 — the ONE count fold)", () => {
  it("empty library folds to []", async () => {
    const { deriveTagStats } = await loadTagsStore();
    expect(deriveTagStats([], [])).toEqual([]);
  });

  it("counts a tag once per carrying row, articles and books alike (D12-04)", async () => {
    const { deriveTagStats } = await loadTagsStore();
    const stats = deriveTagStats(
      [
        sampleArticle({ id: "a", tags: ["essays"] }),
        sampleArticle({ id: "b", tags: ["essays", "slow"] }),
      ],
      [sampleBook({ tags: ["essays"] })],
    );
    expect(stats).toEqual([
      { tag: "essays", count: 3 },
      { tag: "slow", count: 1 },
    ]);
  });

  it("orders count-descending with alphabetical ties (Q3A)", async () => {
    const { deriveTagStats } = await loadTagsStore();
    const stats = deriveTagStats(
      [
        sampleArticle({ id: "a", tags: ["zebra", "alpha"] }),
        sampleArticle({ id: "b", tags: ["zebra", "beta"] }),
        sampleArticle({ id: "c", tags: ["zebra"] }),
      ],
      [],
    );
    expect(stats.map((s) => s.tag)).toEqual(["zebra", "alpha", "beta"]);
  });

  it("folds casing variants into ONE entry — counts merge, first-seen casing wins (Q7A)", async () => {
    const { deriveTagStats } = await loadTagsStore();
    const stats = deriveTagStats(
      [
        sampleArticle({ id: "a", tags: ["Essays"] }),
        sampleArticle({ id: "b", tags: ["essays", "Slow"] }),
      ],
      [sampleBook({ tags: ["ESSAYS"] })],
    );
    // "essays" variants count together (3); the suggestion order the
    // picker promises cannot be split by casing.
    expect(stats).toEqual([
      { tag: "Essays", count: 3 },
      { tag: "Slow", count: 1 },
    ]);
  });

  it("counts never ride into the tag name — the stat is {tag, count} only", async () => {
    const { deriveTagStats } = await loadTagsStore();
    const [stat] = deriveTagStats([sampleArticle({ id: "a", tags: ["one"] })], []);
    expect(stat).toEqual({ tag: "one", count: 1 });
    expect(Object.keys(stat ?? {}).sort()).toEqual(["count", "tag"]);
  });
});

describe("loadTagStats (the store-level suggestion read)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("returns [] on an empty library (fresh DB)", async () => {
    const { loadTagStats } = await loadTagsStore();
    await expect(loadTagStats()).resolves.toEqual([]);
  });

  it("folds persisted article rows AND book rows, most-used first", async () => {
    const { loadTagStats } = await loadTagsStore();
    const { DexieLibrarySource } = await loadLibrarySource();
    const { saveBook } = await loadBooksStore();
    const source = new DexieLibrarySource();
    await source.save(sampleArticle({ id: "a", tags: ["shared", "solo"] }));
    await source.save(sampleArticle({ id: "b", tags: ["shared"] }));
    await saveBook(sampleBook({ tags: ["shared", "bookish"] }), []);

    // "shared" = 3 (2 articles + 1 book); ties "bookish"/"solo" at 1 sort
    // alphabetically.
    await expect(loadTagStats()).resolves.toEqual([
      { tag: "shared", count: 3 },
      { tag: "bookish", count: 1 },
      { tag: "solo", count: 1 },
    ]);
  });

  it("corrupt article rows are dropped silently; valid rows still count (STATE-04)", async () => {
    const { loadTagStats } = await loadTagsStore();
    const { DexieLibrarySource } = await loadLibrarySource();
    const { db } = await import("../../../src/persistence/db");
    const source = new DexieLibrarySource();
    await source.save(sampleArticle({ id: "valid", tags: ["from-valid"] }));
    await db.articles.put({
      id: "corrupt",
      revision: 1,
      lang: "x", // too short (min 2)
      provenance: {}, // missing required fields
      blocks: [],
      footnotes: [],
      tags: ["from-corrupt"],
    });

    await expect(loadTagStats()).resolves.toEqual([{ tag: "from-valid", count: 1 }]);
  });

  it("auto-prune is implicit: the last carrier's removal drops the tag", async () => {
    const { loadTagStats, setArticleTags } = await loadTagsStore();
    const { DexieLibrarySource } = await loadLibrarySource();
    const source = new DexieLibrarySource();
    await source.save(sampleArticle({ id: "a", tags: ["doomed"] }));

    await expect(loadTagStats()).resolves.toEqual([{ tag: "doomed", count: 1 }]);
    await setArticleTags("a", []);
    await expect(loadTagStats()).resolves.toEqual([]);
  });
});
