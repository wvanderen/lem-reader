// tests/unit/ingestion-tags.test.ts
// Plan 08-02 Task 2 — Unit tests for the tag persistence surface (LIB-04).
// Covers:
//   - Denormalize: save an article with tags → loadAllTags returns them sorted
//   - Auto-prune (D8-08 / Pitfall 8-3): removing the last occurrence of a tag
//     causes loadAllTags to no longer return it
//   - Multi-article dedup: two articles carrying the same tag → returned once
//   - Empty library: loadAllTags on a fresh DB returns []
//   - Corrupt-row drop (STATE-04): a malformed row does not throw; valid rows'
//     tags still returned
//   - setArticleTags on a non-existent id is a no-op (Dexie update returns 0)
//
// Harness mirrors tests/unit/ingestion-client.test.ts L14-90: fake-indexeddb
// via Dexie.dependencies, wipeDatabase beforeEach, lazy-import of the module
// under test so it picks up the fake DB.
import { beforeEach, describe, expect, it } from "vitest";
import { ArticleSchema } from "../../src/content/schema";
import type { CanonicalArticle } from "../../src/content/types";
import fakeIndexedDB, { IDBKeyRange } from "fake-indexeddb";
import { Dexie } from "dexie";

// Dexie 4 captures `indexedDB` + `IDBKeyRange` on `Dexie.dependencies` at
// dexie-module-load time. Install BOTH onto `Dexie.dependencies` (the
// Dexie-internal read path) AND `globalThis` (the direct-read path Dexie
// uses for deleteDatabase) at this module's top-level — the documented
// Dexie + Node test pattern (mirrors tests/unit/ingestion-client.test.ts).
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

// Lazy imports — the modules under test are imported AFTER the fake-indexeddb
// install so their module-body top-level sees a populated Dexie.dependencies.
async function loadTagsStore() {
  return await import("../../src/ingestion/library/tagsStore");
}
async function loadLibrarySource() {
  return await import("../../src/ingestion/LibrarySource");
}

// A schema-valid article used as the DexieLibrarySource.save argument. Built
// to pass ArticleSchema.parse. The `tags` override exercises the D8-05 field.
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
        kind: "heading",
        level: 2,
        content: [{ text: "A Heading", marks: [] }],
      },
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

describe("tagsStore (08-02 Task 2)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("loadAllTags returns tags from a single article, sorted", async () => {
    const { loadAllTags } = await loadTagsStore();
    const { DexieLibrarySource } = await loadLibrarySource();
    const source = new DexieLibrarySource();
    await source.save(
      sampleArticle({ id: "a", tags: ["philosophy", "essay"] }),
    );

    const tags = await loadAllTags();
    // localeCompare sort: "essay" < "philosophy"
    expect(tags).toEqual(["essay", "philosophy"]);
  });

  it("loadAllTags returns [] on an empty library (fresh DB)", async () => {
    const { loadAllTags } = await loadTagsStore();
    const tags = await loadAllTags();
    expect(tags).toEqual([]);
  });

  it("loadAllTags dedupes a tag carried by multiple articles (Set)", async () => {
    const { loadAllTags } = await loadTagsStore();
    const { DexieLibrarySource } = await loadLibrarySource();
    const source = new DexieLibrarySource();
    await source.save(sampleArticle({ id: "a", tags: ["shared"] }));
    await source.save(sampleArticle({ id: "b", tags: ["shared", "unique"] }));

    const tags = await loadAllTags();
    // "shared" appears once (Set dedupes); "unique" once.
    expect(tags).toEqual(["shared", "unique"]);
  });

  it("auto-prune (D8-08): removing the last occurrence of a tag drops it", async () => {
    const { loadAllTags, setArticleTags } = await loadTagsStore();
    const { DexieLibrarySource } = await loadLibrarySource();
    const source = new DexieLibrarySource();
    await source.save(sampleArticle({ id: "a", tags: ["x"] }));
    await source.save(sampleArticle({ id: "b", tags: ["x", "y"] }));

    // Initially both tags present.
    expect(await loadAllTags()).toEqual(["x", "y"]);

    // B loses both tags → "y" has no carrier, "x" still carried by A.
    await setArticleTags("b", []);
    expect(await loadAllTags()).toEqual(["x"]);

    // A loses its tag → "x" has no carrier → empty chip strip.
    await setArticleTags("a", []);
    expect(await loadAllTags()).toEqual([]);
  });

  it("setArticleTags writes tags visible on the next loadAllTags call", async () => {
    const { loadAllTags, setArticleTags } = await loadTagsStore();
    const { DexieLibrarySource } = await loadLibrarySource();
    const source = new DexieLibrarySource();
    await source.save(sampleArticle({ id: "a", tags: [] }));

    expect(await loadAllTags()).toEqual([]);

    await setArticleTags("a", ["new-tag", "another"]);
    expect(await loadAllTags()).toEqual(["another", "new-tag"]);
  });

  it("setArticleTags filters empty-string tags defensively", async () => {
    const { loadAllTags, setArticleTags } = await loadTagsStore();
    const { DexieLibrarySource } = await loadLibrarySource();
    const source = new DexieLibrarySource();
    await source.save(sampleArticle({ id: "a", tags: [] }));

    await setArticleTags("a", ["keep", "", "also-keep"]);
    // Empty string filtered out (mirrors z.string().min(1)).
    const tags = await loadAllTags();
    expect(tags).toEqual(["also-keep", "keep"]);
  });

  it("setArticleTags on a non-existent id is a no-op (no throw)", async () => {
    const { setArticleTags, loadAllTags } = await loadTagsStore();
    // Should not throw; the library stays empty.
    await expect(setArticleTags("does-not-exist", ["tag"])).resolves.toBeUndefined();
    expect(await loadAllTags()).toEqual([]);
  });

  it("loadAllTags drops corrupt rows silently (STATE-04)", async () => {
    const { loadAllTags } = await loadTagsStore();
    const { DexieLibrarySource } = await loadLibrarySource();
    const { db } = await import("../../src/persistence/db");
    const source = new DexieLibrarySource();

    // Save a valid article with a tag.
    await source.save(sampleArticle({ id: "valid", tags: ["from-valid"] }));

    // Manually insert a row that fails ArticleSchema.safeParse (missing
    // required provenance.title + invalid lang shape). This row is corrupt;
    // loadAllTags must NOT throw and must still return the valid row's tags.
    await db.articles.put({
      id: "corrupt",
      revision: 1,
      lang: "x", // too short (min 2)
      provenance: {}, // missing required fields
      blocks: [],
      footnotes: [],
      tags: ["from-corrupt"],
    });

    const tags = await loadAllTags();
    // Only the valid row's tag survives; the corrupt row is dropped silently.
    expect(tags).toEqual(["from-valid"]);
  });
});
