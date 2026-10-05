// tests/unit/portability/added-at-roundtrip.test.ts
// Issue #114 — the addedAt round trip: export → import → read back. The
// acceptance row under test: "Newly saved articles receive an immutable
// added date; existing books keep their added date. The date survives
// export/import."
//
// Pipeline under test (the real seams, no mocks):
//   save (DexieLibrarySource.save — the #114 stamp) → buildBundle (the
//   exporter's Zod self-check) → validateBundle (unzip + manifest + parse)
//   → resolveImportPlan → applyImport (the one-transaction put) →
//   dexieLibrarySource.open (the Zod-at-boundary read).
//
// Harness mirrors tests/unit/portability/conflicts.test.ts: fake-indexeddb
// via Dexie.dependencies at module top-level, wipeDatabase beforeEach, lazy
// module imports.
import { beforeEach, describe, expect, it } from "vitest";
import { ArticleSchema, BookSchema } from "../../../src/content/schema";
import type { CanonicalArticle, Book } from "../../../src/content/schema";
import type { z } from "zod";
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

async function loadLibrarySource() {
  return await import("../../../src/ingestion/LibrarySource");
}
async function loadBooksStore() {
  return await import("../../../src/persistence/booksStore");
}
async function loadService() {
  return await import("../../../src/portability/ExportImportService");
}
async function loadConflicts() {
  return await import("../../../src/portability/conflicts");
}

type ArticleInput = z.input<typeof ArticleSchema>;

function sampleArticle(overrides: Partial<ArticleInput> = {}): CanonicalArticle {
  return ArticleSchema.parse({
    id: "art-roundtrip",
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: "https://example.com/roundtrip",
      title: "Round Trip Article",
      author: "An Author",
      retrievedAt: "2026-09-10T00:00:00.000Z",
      originalHtmlHash: "sha256:" + "a".repeat(64),
    },
    blocks: [{ kind: "paragraph", content: [{ text: "Round trip body text.", marks: [] }] }],
    footnotes: [],
    ingestionMeta: {
      source: "url",
      origin: "url",
      sourceUrl: "https://example.com/roundtrip",
      originalHtmlHash: "sha256:" + "a".repeat(64),
      fetchedAt: "2026-09-10T00:00:00.000Z",
      extractionConfidence: "high",
      extractionWarnings: [],
    },
    ...overrides,
  });
}

type BookInput = z.input<typeof BookSchema>;

function sampleBook(overrides: Partial<BookInput> = {}): Book {
  return BookSchema.parse({
    id: "epub-roundtrip0000",
    title: "Round Trip Book",
    authors: ["An Author"],
    language: "en",
    chapterArticleIds: ["epub-roundtrip0000-c00"],
    skippedChapterCount: 0,
    source: "epub-upload",
    originalFileHash: "sha256:" + "b".repeat(64),
    addedAt: "2026-09-09T00:00:00.000Z",
    ...overrides,
  });
}

function sampleChapter(bookId: string, overrides: Partial<ArticleInput> = {}): CanonicalArticle {
  return sampleArticle({
    id: `${bookId}-c00`,
    provenance: {
      sourceUrl: undefined,
      title: "Round Trip Chapter",
      retrievedAt: "2026-09-09T00:00:00.000Z",
      originalHtmlHash: "sha256:" + "c".repeat(64),
    },
    ingestionMeta: {
      source: "epub-chapter",
      origin: "upload",
      originalHtmlHash: "sha256:" + "c".repeat(64),
      extractionConfidence: "high",
      extractionWarnings: [],
      bookId,
      chapterIndex: 0,
    },
    ...overrides,
  });
}

/** The D9-14 default — skip every kind (nothing conflicts on a fresh device). */
const ALL_SKIP = {
  book: "skip",
  "article-revision": "skip",
  "article-content-divergence": "skip",
  "article-metadata-override": "skip",
  "highlight-id": "skip",
  "note-id": "skip",
  location: "skip",
} as const;

describe("addedAt survives export → import (issue #114)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("a dated article and a dated book re-land on a fresh device with their dates intact", async () => {
    // ── Device A: save through the real seams. ──
    const { dexieLibrarySource } = await loadLibrarySource();
    const { saveBook } = await loadBooksStore();
    const { buildBundle } = await loadService();

    const article = sampleArticle();
    await dexieLibrarySource.save(article); // stamps addedAt (issue #114)
    const book = sampleBook();
    await saveBook(book, [sampleChapter(book.id)]); // book keeps its own addedAt

    const savedArticle = await dexieLibrarySource.open(article.id);
    const exportedAddedAt = savedArticle?.addedAt;
    expect(exportedAddedAt).toBeDefined();

    // ── Export. ──
    const { bytes } = await buildBundle();

    // ── Device B: a fresh library imports the bundle. ──
    await wipeDatabase();

    const { validateBundle, applyImport } = await loadService();
    const { detectImportPreview, resolveImportPlan } = await loadConflicts();
    const { dexieLibrarySource: freshSource } = await loadLibrarySource();

    const validation = await validateBundle(
      new File([new Uint8Array(bytes)], "lem-reader-bundle-v1.zip", { type: "application/zip" }),
    );
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    // The parsed bundle already carries both stamps.
    expect(validation.bundle.articles[0]?.addedAt).toBe(exportedAddedAt);
    expect(validation.bundle.books?.[0]?.addedAt).toBe("2026-09-09T00:00:00.000Z");

    const preview = await detectImportPreview(validation.bundle);
    const plan = await resolveImportPlan(
      validation.bundle,
      preview,
      ALL_SKIP,
      false,
      undefined,
      validation.assets,
    );
    expect(plan.articlesToWrite).toHaveLength(2); // article + chapter
    await applyImport(plan);

    // Read back through the Zod-at-boundary seam: the dates landed.
    const reReadArticle = await freshSource.open(article.id);
    expect(reReadArticle?.addedAt).toBe(exportedAddedAt);
    const { listBooks } = await loadBooksStore();
    const books = await listBooks();
    expect(books.ok && books.books[0]?.addedAt).toBe("2026-09-09T00:00:00.000Z");
  });
});
