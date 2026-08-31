// tests/unit/persistence/assets-cascade.spec.ts
// Phase 20 Plan 20-03 — the assets-store seam + atomic lifecycle truths:
//   Task 1 (store seam):
//     - putAssets → bulkGetAssets round-trip preserves assetId, contentType,
//       byteLength, and the blob bytes (Zod-validated reads)
//     - corrupt rows (bad assetId shape) are DROPPED from reads calmly —
//       never coerced (STATE-04 / T-20-12)
//     - loadAllAssets returns [] on an empty store (the loadAllHighlights
//       plain-array whole-library precedent) and drops corrupt rows
//   Task 2 (atomic lifecycle — describe blocks below):
//     - save(article, assets) writes article + rows in ONE transaction; an
//       injected asset-put failure rolls back the article put (D20-04 / T-20-14)
//     - re-ingest upsert replaces old rows — no orphan blobs (D20-07)
//     - remove(article) + removeBook cascade asset rows in the same single
//       transaction as the existing deletes (D20-15 / T-20-13)
//
// Harness mirrors tests/unit/persistence/books-store.test.ts: fake-indexeddb
// via Dexie.dependencies at module top-level, wipeDatabase beforeEach, lazy
// module imports. Dexie creating hooks FIRE INSIDE the transaction and a
// throw rolls it back — the hook is deregistered in afterEach (hooks persist
// across tests; cross-test bleed would poison sibling specs).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import { ArticleSchema, BookSchema } from "../../../src/content/schema";
import type { Book, CanonicalArticle } from "../../../src/content/schema";
import type { ValidatedAsset } from "../../../src/ingestion/IngestionClient";
import fakeIndexedDB, { IDBKeyRange } from "fake-indexeddb";
import { Dexie } from "dexie";

// Dexie 4 captures `indexedDB` + `IDBKeyRange` on `Dexie.dependencies` at
// dexie-module-load time. Install BOTH onto `Dexie.dependencies` (the
// Dexie-internal read path) AND `globalThis` (the direct-read path Dexie
// uses for deleteDatabase) at this module's top-level — the documented
// Dexie + Node test pattern (mirrors tests/unit/persistence/books-store.test.ts).
Dexie.dependencies.indexedDB = fakeIndexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;
(globalThis as { indexedDB?: typeof fakeIndexedDB }).indexedDB = fakeIndexedDB;
(globalThis as { IDBKeyRange?: typeof IDBKeyRange }).IDBKeyRange = IDBKeyRange;

// Blob-fidelity harness note (20-03): fake-indexeddb clones values with the
// GLOBAL structuredClone — Node's native V8 serializer under vitest. jsdom's
// Blob is NOT a host object to that serializer, so a jsdom Blob degrades to
// a plain Object on read and AssetRecordSchema's z.instanceof(Blob) would
// then (correctly!) drop every row as corrupt. Node's own Blob IS a host
// object and round-trips byte-identically through structuredClone — the
// faithful analogue of the production contract (browser Blobs are host
// objects to the browser's structured clone; the real-browser proof is
// 20-04's Playwright imagery specs). Install Node's Blob as this spec
// file's global BEFORE the lazy module imports so both the `new Blob(...)`
// row construction and the schema's instanceof capture see the
// round-trippable class.
(globalThis as { Blob?: unknown }).Blob = NodeBlob;

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
async function loadAssetsStore() {
  return await import("../../../src/persistence/assetsStore");
}
async function loadLibrarySource() {
  return await import("../../../src/ingestion/LibrarySource");
}
async function loadBooksStore() {
  return await import("../../../src/persistence/booksStore");
}
async function loadDb() {
  return await import("../../../src/persistence/db");
}

// ── Sample builders (schema-validated at construction) ──────────────────────

/** A schema-valid standalone article (ArticleSchema.parse — the
 * ingestion-client.test.ts sampleArticle shape) with an asset-ref figure. */
function sampleArticle(overrides: Partial<CanonicalArticle> = {}): CanonicalArticle {
  return ArticleSchema.parse({
    id: "asset-article-slug",
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
      {
        kind: "figure",
        alt: "A test figure",
        src: "asset:img-aaaaaaaaaaaa",
        caption: [],
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
      fetchedAt: "2026-08-31T00:00:00.000Z",
      extractionConfidence: "high",
      extractionWarnings: [],
    },
    ...overrides,
  });
}

/** A ValidatedAsset literal — the exact shape IngestionSuccess.assets
 * exposes after transport re-validation (20-02 Task 3). */
function sampleAsset(
  hex: string,
  byteLength = 8,
  contentType: ValidatedAsset["contentType"] = "image/png",
): ValidatedAsset {
  const bytes = new Uint8Array(byteLength);
  for (let i = 0; i < byteLength; i += 1) bytes[i] = i;
  return {
    assetId: `img-${hex.padEnd(12, "0").slice(0, 12)}`,
    contentType,
    byteLength,
    bytes,
  };
}

/** A schema-valid book + its two chapter articles (the books-store.test.ts
 * sampleBook/sampleChapter shapes). */
function sampleBookFixture(): { book: Book; chapters: CanonicalArticle[] } {
  const book = BookSchema.parse({
    id: "epub-abc123def456",
    title: "A Sample Book",
    authors: ["An Author"],
    language: "en",
    chapterArticleIds: ["epub-abc123def456-c00", "epub-abc123def456-c01"],
    skippedChapterCount: 0,
    source: "epub-upload",
    originalFileHash: "sha256:" + "b".repeat(64),
    addedAt: "2026-08-31T00:00:00.000Z",
  });
  const chapter = (index: number, hashChar: string): CanonicalArticle =>
    ArticleSchema.parse({
      id: `epub-abc123def456-c0${index}`,
      revision: 1,
      lang: "en",
      provenance: {
        sourceUrl: undefined,
        title: `Chapter ${index}`,
        retrievedAt: "2026-08-31T00:00:00.000Z",
        originalHtmlHash: "sha256:" + hashChar.repeat(64),
      },
      blocks: [
        { kind: "paragraph", content: [{ text: "Chapter body.", marks: [] }] },
      ],
      footnotes: [],
      ingestionMeta: {
        source: "epub-chapter",
        origin: "upload",
        originalHtmlHash: "sha256:" + hashChar.repeat(64),
        extractionConfidence: "high",
        extractionWarnings: [],
        bookId: "epub-abc123def456",
        chapterIndex: index,
      },
    });
  return { book, chapters: [chapter(0, "c"), chapter(1, "d")] };
}

// ── Call helpers (the real save/saveBook signatures — the RED-gate
// scaffolding casts were removed once the assets parameters shipped). ────────

async function saveArticleWithAssets(
  article: CanonicalArticle,
  assets: ValidatedAsset[],
): Promise<void> {
  const { DexieLibrarySource } = await loadLibrarySource();
  const source = new DexieLibrarySource();
  await source.save(article, assets);
}

async function saveBookWithAssets(
  book: Book,
  chapters: CanonicalArticle[],
  assets: Array<ValidatedAsset & { articleId: string }>,
): Promise<void> {
  const { saveBook } = await loadBooksStore();
  await saveBook(book, chapters, assets);
}

// Dexie creating hooks persist across tests — the SAME function reference
// is registered via hook("creating", fn) and deregistered via
// hook("creating").unsubscribe(fn) in afterEach (cross-test bleed guard).
let injectedCreatingHook:
  | ((primKey: unknown, obj: { assetId?: string }) => void)
  | null = null;

// ── Task 1: assetsStore seam (v6 store + Zod-validated reads) ───────────────

describe("assetsStore — put/bulkGet round-trip + corrupt-row drops (20-03 Task 1)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  afterEach(async () => {
    if (injectedCreatingHook !== null) {
      const { db } = await loadDb();
      db.assets.hook("creating").unsubscribe(injectedCreatingHook);
      injectedCreatingHook = null;
    }
  });

  it("putAssets → bulkGetAssets round-trip preserves assetId, contentType, byteLength, and blob bytes", async () => {
    const { putAssets, bulkGetAssets } = await loadAssetsStore();
    const asset = sampleAsset("abcd", 16, "image/webp");

    const write = await putAssets("asset-article-slug", [asset]);
    expect(write).toEqual({ ok: true });

    const read = await bulkGetAssets("asset-article-slug", [asset.assetId]);
    expect(read.ok).toBe(true);
    if (!read.ok) throw new Error("expected ok read");
    expect(read.assets).toHaveLength(1);
    const row = read.assets[0];
    if (!row) throw new Error("expected one asset row");
    expect(row.articleId).toBe("asset-article-slug");
    expect(row.assetId).toBe("img-abcd00000000");
    expect(row.contentType).toBe("image/webp");
    expect(row.byteLength).toBe(16);
    expect(row.data).toBeInstanceOf(Blob);
    // Blob bytes survive the IndexedDB round-trip byte-identically.
    const roundTripped = new Uint8Array(await row.data.arrayBuffer());
    expect(Array.from(roundTripped)).toEqual(Array.from(asset.bytes));
  });

  it("bulkGetAssets DROPS a corrupt row (bad assetId shape) calmly — never coerces, never throws (T-20-12)", async () => {
    const { db } = await loadDb();
    const { putAssets, bulkGetAssets } = await loadAssetsStore();
    const good = sampleAsset("aaaa");

    await putAssets("asset-article-slug", [good]);
    // A corrupt row seeded DIRECTLY through Dexie (no seam validation):
    // assetId fails the img-<12hex> shape. Cast through unknown — the row
    // is INTENTIONALLY corrupt (the safeParse-drop path under test).
    await db.assets.put({
      articleId: "asset-article-slug",
      assetId: "not-img-shaped",
      contentType: "image/png",
      byteLength: 4,
      data: new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" }),
      createdAt: "2026-08-31T00:00:00.000Z",
    } as unknown as Parameters<typeof db.assets.put>[0]);

    const read = await bulkGetAssets("asset-article-slug", [
      good.assetId,
      "not-img-shaped",
    ]);
    expect(read.ok).toBe(true);
    if (!read.ok) throw new Error("expected ok read");
    // The corrupt row is dropped; the valid sibling survives.
    expect(read.assets.map((r) => r.assetId)).toEqual(["img-aaaa00000000"]);
  });

  it("loadAllAssets returns [] on an empty store (loadAllHighlights precedent)", async () => {
    const { loadAllAssets } = await loadAssetsStore();
    expect(await loadAllAssets()).toEqual([]);
  });

  it("loadAllAssets drops corrupt rows and returns the whole-library plain array", async () => {
    const { db } = await loadDb();
    const { putAssets, loadAllAssets } = await loadAssetsStore();
    await putAssets("asset-article-slug", [sampleAsset("bbbb")]);
    await db.assets.put({
      articleId: "asset-article-slug",
      assetId: "short",
      contentType: "image/gif",
      byteLength: 2,
      data: new Blob([new Uint8Array([9, 9])], { type: "image/gif" }),
      createdAt: "2026-08-31T00:00:00.000Z",
    } as unknown as Parameters<typeof db.assets.put>[0]);

    const rows = await loadAllAssets();
    expect(rows.map((r) => r.assetId)).toEqual(["img-bbbb00000000"]);
  });
});

// ── Task 2: LibrarySource.save — atomic article+assets upsert ───────────────

describe("LibrarySource.save — ONE transaction, upsert replacement (20-03 Task 2)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  afterEach(async () => {
    if (injectedCreatingHook !== null) {
      const { db } = await loadDb();
      db.assets.hook("creating").unsubscribe(injectedCreatingHook);
      injectedCreatingHook = null;
    }
  });

  it("(a) save(article, assets) persists the article AND its asset rows", async () => {
    const { db } = await loadDb();
    const article = sampleArticle();
    const asset = sampleAsset("aaaa", 12, "image/jpeg");

    await saveArticleWithAssets(article, [asset]);

    expect(await db.articles.get(article.id)).toBeDefined();
    expect(await db.assets.count()).toBe(1);
    const row = await db.assets.get([article.id, asset.assetId]);
    expect(row?.contentType).toBe("image/jpeg");
    expect(row?.byteLength).toBe(12);
  });

  it("(b) an injected asset-put failure rolls back the article put — a saved article is always complete (D20-04 / T-20-14)", async () => {
    const { db } = await loadDb();
    const { DexieLibrarySource } = await loadLibrarySource();
    const article = sampleArticle();
    const asset = sampleAsset("bbbb");

    const creatingHook = (
      _primKey: unknown,
      obj: { assetId?: string },
    ): void => {
      if (obj?.assetId === asset.assetId) {
        throw new Error("injected asset-put failure");
      }
    };
    injectedCreatingHook = creatingHook;
    db.assets.hook("creating", creatingHook);

    const source = new DexieLibrarySource();
    await expect(
      saveArticleWithAssets(article, [asset]),
    ).rejects.toThrow("injected asset-put failure");

    // FULL rollback: no article row, no asset rows — the transaction
    // guarantees neither landed.
    expect(await db.articles.count()).toBe(0);
    expect(await db.assets.count()).toBe(0);
    expect(await source.has(article.id)).toBe(false);
  });

  it("(c) re-save of the same article id replaces the old asset rows — no orphan blobs (D20-07 / D9-14)", async () => {
    const { db } = await loadDb();
    const article = sampleArticle();
    const first = sampleAsset("cccc");
    const second = sampleAsset("dddd");
    const third = sampleAsset("eeee");

    await saveArticleWithAssets(article, [first]);
    expect(await db.assets.count()).toBe(1);

    // Re-ingest: same id, a DIFFERENT asset set (one figure now refuses).
    await saveArticleWithAssets(article, [second, third]);

    expect(await db.assets.count()).toBe(2);
    const ids = (await db.assets.toArray()).map((r) => r.assetId).sort();
    expect(ids).toEqual([second.assetId, third.assetId].sort());
    // The first ingest's row is gone — not orphaned.
    expect(await db.assets.get([article.id, first.assetId])).toBeUndefined();
  });

  it("(c+) re-save with NO assets clears the old rows — a fully-refused re-ingest orphans nothing", async () => {
    const { db } = await loadDb();
    const article = sampleArticle();
    await saveArticleWithAssets(article, [sampleAsset("ffff")]);
    expect(await db.assets.count()).toBe(1);

    await saveArticleWithAssets(article, []);

    expect(await db.assets.count()).toBe(0);
    expect(await db.articles.count()).toBe(1);
  });
});

// ── Task 2: LibrarySource.remove — assets join the existing cascade ─────────

describe("LibrarySource.remove — asset rows cascade in the SAME transaction (20-03 Task 2)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("(d) remove(id) deletes the article AND every asset row keyed to it", async () => {
    const { db } = await loadDb();
    const { DexieLibrarySource } = await loadLibrarySource();
    const source = new DexieLibrarySource();
    const article = sampleArticle();

    await saveArticleWithAssets(article, [
      sampleAsset("1234"),
      sampleAsset("5678"),
    ]);
    // Seed the existing cascade surface too — the assets delete joins the
    // SAME transaction as highlights/notes/location.
    await db.highlights.put({
      schemaVersion: 1,
      id: "h-1",
      articleId: article.id,
      revision: 1,
      position: { start: 0, end: 5 },
      quote: { prefix: "", exact: "Hello", suffix: "" },
      createdAt: "2026-08-31T00:00:00.000Z",
    });
    await db.notes.put({
      schemaVersion: 1,
      id: "n-1",
      highlightId: "h-1",
      text: "a note",
      updatedAt: "2026-08-31T00:00:00.000Z",
    });
    await db.location.put({
      schemaVersion: 1,
      articleId: article.id,
      revision: 1,
      graphemeOffset: 0,
      savedAt: "2026-08-31T00:00:00.000Z",
    });

    await source.remove(article.id);

    expect(await db.articles.count()).toBe(0);
    expect(await db.assets.count()).toBe(0);
    expect(await db.highlights.count()).toBe(0);
    expect(await db.notes.count()).toBe(0);
    expect(await db.location.count()).toBe(0);
  });
});

// ── Task 2: booksStore — saveBook/removeBook asset lifecycle ─────────────────

describe("booksStore — per-chapter asset upsert + removeBook cascade (20-03 Task 2)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("(e) saveBook(book, chapters, assets) writes per-chapter rows; removeBook deletes every chapter's assets (D20-15 / T-20-13)", async () => {
    const { db } = await loadDb();
    const { removeBook } = await loadBooksStore();
    const { book, chapters } = sampleBookFixture();
    const [c00, c01] = chapters as [CanonicalArticle, CanonicalArticle];

    await saveBookWithAssets(book, chapters, [
      { ...sampleAsset("a1b2"), articleId: c00.id },
      { ...sampleAsset("c3d4"), articleId: c00.id },
      { ...sampleAsset("e5f6"), articleId: c01.id },
    ]);
    expect(await db.books.count()).toBe(1);
    expect(await db.articles.count()).toBe(2);
    expect(await db.assets.count()).toBe(3);

    await removeBook(book.id);

    expect(await db.books.count()).toBe(0);
    expect(await db.articles.count()).toBe(0);
    expect(await db.assets.count()).toBe(0);
  });

  it("(e+) saveBook re-save replaces each chapter's asset rows — no orphans across re-upload upserts", async () => {
    const { db } = await loadDb();
    const { book, chapters } = sampleBookFixture();
    const [c00, c01] = chapters as [CanonicalArticle, CanonicalArticle];

    await saveBookWithAssets(book, chapters, [
      { ...sampleAsset("1111"), articleId: c00.id },
      { ...sampleAsset("2222"), articleId: c01.id },
    ]);
    // Re-save with a different asset set per chapter.
    await saveBookWithAssets(book, chapters, [
      { ...sampleAsset("3333"), articleId: c00.id },
    ]);

    expect(await db.assets.count()).toBe(1);
    const row = (await db.assets.toArray())[0];
    expect(row?.articleId).toBe(c00.id);
    expect(row?.assetId).toBe("img-333300000000");
  });

  it("(e++) saveBook without the assets parameter writes ZERO asset rows (back-compat)", async () => {
    const { db } = await loadDb();
    const { saveBook } = await loadBooksStore();
    const { book, chapters } = sampleBookFixture();

    await saveBook(book, chapters);

    expect(await db.books.count()).toBe(1);
    expect(await db.articles.count()).toBe(2);
    expect(await db.assets.count()).toBe(0);
  });
});
