// tests/unit/library/library-source.test.ts
// Phase 20 Plan 20-03 Task 2 — the save-signature back-compat cell. The
// DexieLibrarySource.save(article, assets?) default parameter must keep
// every existing call site (the add dialog's url/paste/markdown/pdf paths —
// real asset wiring is 20-04 scope) compiling and behaving byte-identically:
// save(article) with the parameter omitted writes the article row and ZERO
// asset rows.
//
// Harness mirrors the DexieLibrarySource blocks of
// tests/unit/ingestion-client.test.ts (fake-indexeddb via
// Dexie.dependencies at module top-level, wipeDatabase beforeEach, lazy
// module imports). The atomic lifecycle cells (rollback, upsert
// replacement, cascades) live in tests/unit/persistence/assets-cascade.spec.ts.
import { beforeEach, describe, expect, it } from "vitest";
import { ArticleSchema } from "../../../src/content/schema";
import type { CanonicalArticle } from "../../../src/content/schema";
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

// Lazy imports — the modules under test are imported AFTER the
// fake-indexeddb install so their module-body top-level sees a populated
// Dexie.dependencies.
async function loadLibrarySource() {
  return await import("../../../src/ingestion/LibrarySource");
}
async function loadDb() {
  return await import("../../../src/persistence/db");
}

function sampleArticle(
  overrides: Partial<CanonicalArticle> = {},
): CanonicalArticle {
  return ArticleSchema.parse({
    id: "library-source-article",
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: "https://example.com/article",
      title: "Sample Article",
      author: "An Author",
      retrievedAt: "2026-08-31T00:00:00.000Z",
      originalHtmlHash: "sha256:" + "0".repeat(64),
    },
    blocks: [
      { kind: "paragraph", content: [{ text: "Body text.", marks: [] }] },
    ],
    footnotes: [],
    ingestionMeta: {
      source: "url",
      origin: "url",
      sourceUrl: "https://example.com/article",
      originalHtmlHash: "sha256:" + "0".repeat(64),
      fetchedAt: "2026-08-31T00:00:00.000Z",
      extractionConfidence: "high",
      extractionWarnings: [],
    },
    ...overrides,
  });
}

describe("DexieLibrarySource.save — assets default-parameter back-compat (20-03 Task 2)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("save(article) with the assets parameter omitted writes the article row and ZERO asset rows", async () => {
    const { db } = await loadDb();
    const { DexieLibrarySource } = await loadLibrarySource();
    const source = new DexieLibrarySource();
    const article = sampleArticle();

    await source.save(article);

    expect(await source.has(article.id)).toBe(true);
    expect((await source.open(article.id))?.id).toBe(article.id);
    expect(await db.assets.count()).toBe(0);
  });

  it("save(article, []) — explicit empty array behaves identically", async () => {
    const { db } = await loadDb();
    const { DexieLibrarySource } = await loadLibrarySource();
    const source = new DexieLibrarySource();
    const article = sampleArticle();

    // RED-gate scaffolding cast (removed in GREEN): the assets parameter
    // lands with this task's implementation; widen the call so tsc stays
    // clean at the RED commit (the 20-02 scaffolding-cast precedent).
    await (
      source.save as (
        a: CanonicalArticle,
        assets?: unknown[],
      ) => Promise<void>
    )(article, []);

    expect(await source.has(article.id)).toBe(true);
    expect(await db.assets.count()).toBe(0);
  });

  it("a parameterless save over a previously-assetful article drops the old rows (upsert semantics hold with the default)", async () => {
    const { db } = await loadDb();
    const { DexieLibrarySource } = await loadLibrarySource();
    const { putAssets } = await import("../../../src/persistence/assetsStore");
    const source = new DexieLibrarySource();
    const article = sampleArticle();
    const bytes = new Uint8Array(8);
    for (let i = 0; i < 8; i += 1) bytes[i] = i;
    await putAssets(article.id, [
      {
        assetId: "img-999900000000",
        contentType: "image/png",
        byteLength: 8,
        bytes,
      },
    ]);
    expect(await db.assets.count()).toBe(1);

    // The default-parameter re-save is the plain upsert — old rows go.
    await source.save(article);
    expect(await db.assets.count()).toBe(0);
  });
});
