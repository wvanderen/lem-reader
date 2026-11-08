// tests/unit/portability/collections-roundtrip.spec.ts
// Issue #248 — the bundle-v10 truth: collections, their ordered entries,
// shared completion, and remembered active entries ride the ordinary
// whole-library bundle and round-trip through export → wipe → import.
//
//   - writers emit schemaVersion 10 with ALWAYS-present collections /
//     completions / collectionActiveEntries arrays (the presence-is-the-
//     contract books/assets/readingSessions/subscriptions/articleNotes
//     precedent — empty arrays on a collection-free library)
//   - v1..v9 bundles parse exactly as before (legacy importable; they
//     hydrate no collection state and invent nothing)
//   - v11+ forward-refuses at the validateBundle peek (D9-04 preserved)
//   - a collection referencing an article, a whole book, an EPUB book
//     chapter, and a saved web work's chapter round-trips with entry
//     identities and array order intact; no implicit duplication of the
//     underlying readings occurs
//   - shared completion and the remembered active entry ride and merge by
//     their own keys
//
// Harness mirrors tests/unit/portability/bundle-v9-structure.spec.ts
// (fake-indexeddb via Dexie.dependencies at module top-level, wipeDatabase
// beforeEach, lazy module imports).
import { beforeEach, describe, expect, it } from "vitest";
import { zipSync, unzipSync, strFromU8 } from "fflate";
import { ArticleSchema, BookSchema, CollectionActiveEntrySchema, CollectionSchema, CompletionRecordSchema } from "../../../src/content/schema";
import type { CanonicalArticle } from "../../../src/content/schema";
import { deriveWorkStructure } from "../../../src/content/structure";
import type { Overrides } from "../../../src/portability/conflicts";
import { computeManifest } from "../../../src/portability/manifest";
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

async function loadService() {
  return await import("../../../src/portability/ExportImportService");
}
async function loadConflicts() {
  return await import("../../../src/portability/conflicts");
}
async function loadDb() {
  return await import("../../../src/persistence/db");
}

const workArticle = (overrides: Partial<CanonicalArticle> = {}): CanonicalArticle => {
  const base = ArticleSchema.parse({
    id: "art-collection-rt01",
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: "https://example.com/chaptered-work",
      title: "Chaptered Work",
      retrievedAt: "2026-10-01T00:00:00.000Z",
      originalHtmlHash: "sha256:" + "4".repeat(64),
    },
    blocks: [
      { kind: "heading", level: 2, content: [{ text: "First", marks: [] }] },
      { kind: "paragraph", content: [{ text: "Body one.", marks: [] }] },
      { kind: "heading", level: 2, content: [{ text: "Second", marks: [] }] },
      { kind: "paragraph", content: [{ text: "Body two.", marks: [] }] },
    ],
    footnotes: [],
    ...overrides,
  });
  return { ...base, structure: deriveWorkStructure(base)! };
};

const preferences = {
  schemaVersion: 2 as const,
  font: "serif" as const,
  size: 18 as const,
  measure: 58 as const,
  spacing: "comfortable" as const,
  theme: "sepia" as const,
  readingMode: "paginated" as const,
};

const ALL_SKIP: Overrides = {
  book: "skip",
  "article-revision": "skip",
  "article-content-divergence": "skip",
  "article-metadata-override": "skip",
  "highlight-id": "skip",
  "note-id": "skip",
  "article-note-id": "skip",
  location: "skip",
};

async function v10BundleFile(payload: {
  articles: CanonicalArticle[];
  books?: unknown[];
  collections?: unknown[];
  completions?: unknown[];
  collectionActiveEntries?: unknown[];
}): Promise<File> {
  const { ExportBundleSchema } = await import("../../../src/portability/bundle");
  const bundle = ExportBundleSchema.parse({
    schemaVersion: 10,
    exportedAt: "2026-10-01T12:00:00.000Z",
    appVersion: "test",
    articles: JSON.parse(JSON.stringify(payload.articles)),
    locations: [],
    highlights: [],
    notes: [],
    preferences,
    fixtureIds: [],
    books: payload.books ?? [],
    assets: [],
    readingSessions: [],
    subscriptions: [],
    articleNotes: [],
    starterRemoved: true,
    collections: payload.collections ?? [],
    completions: payload.completions ?? [],
    collectionActiveEntries: payload.collectionActiveEntries ?? [],
  });
  const manifest = await computeManifest(bundle);
  return zipFileOf({
    "bundle.json": new TextEncoder().encode(JSON.stringify(JSON.parse(JSON.stringify(bundle)))),
    "manifest.json": new TextEncoder().encode(JSON.stringify(manifest)),
  });
}

function zipFileOf(entries: Record<string, Uint8Array>): File {
  return new File([zipSync(entries)], "x.zip");
}

async function importBundle(file: File, overrides: Overrides = ALL_SKIP) {
  const { validateBundle, applyImport } = await loadService();
  const { detectImportPreview, resolveImportPlan } = await loadConflicts();
  const validated = await validateBundle(file);
  if (!validated.ok)
    throw new Error(`fixture bundle invalid: ${JSON.stringify(validated.refusal)}`);
  const preview = await detectImportPreview(validated.bundle, []);
  const plan = await resolveImportPlan(validated.bundle, preview, overrides, false);
  await applyImport(plan);
  return { validated, preview, plan };
}

describe("bundle v10 — collections round trip (issue #248)", () => {
  beforeEach(wipeDatabase);

  it("the writer emits schemaVersion 10 with always-present collection arrays", async () => {
    const { buildBundle } = await loadService();
    const { db } = await loadDb();
    await db.articles.put(workArticle());
    const entries = unzipSync((await buildBundle()).bytes);
    const bundleJson = JSON.parse(strFromU8(entries["bundle.json"]!)) as {
      schemaVersion: number;
      collections?: unknown[];
      completions?: unknown[];
      collectionActiveEntries?: unknown[];
    };
    expect(bundleJson.schemaVersion).toBe(10);
    expect(bundleJson.collections).toEqual([]);
    expect(bundleJson.completions).toEqual([]);
    expect(bundleJson.collectionActiveEntries).toEqual([]);
  });

  it("a legacy v9 bundle (no collection keys) imports with ZERO collection writes", async () => {
    const { ExportBundleSchema } = await import("../../../src/portability/bundle");
    const { validateBundle, applyImport } = await loadService();
    const { detectImportPreview, resolveImportPlan } = await loadConflicts();
    const { db } = await loadDb();
    const legacy = workArticle();
    const bundle = ExportBundleSchema.parse({
      schemaVersion: 9,
      exportedAt: "2026-10-01T12:00:00.000Z",
      appVersion: "test",
      articles: [JSON.parse(JSON.stringify(legacy))],
      locations: [],
      highlights: [],
      notes: [],
      preferences,
      fixtureIds: [],
      books: [],
      assets: [],
      readingSessions: [],
      subscriptions: [],
      articleNotes: [],
      starterRemoved: true,
    });
    const manifest = await computeManifest(bundle);
    const file = zipFileOf({
      "bundle.json": new TextEncoder().encode(JSON.stringify(JSON.parse(JSON.stringify(bundle)))),
      "manifest.json": new TextEncoder().encode(JSON.stringify(manifest)),
    });
    const validated = await validateBundle(file);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const preview = await detectImportPreview(validated.bundle, []);
    const plan = await resolveImportPlan(validated.bundle, preview, ALL_SKIP, false);
    expect(plan.collectionsToWrite).toEqual([]);
    expect(plan.completionsToWrite).toEqual([]);
    expect(plan.collectionActiveEntriesToWrite).toEqual([]);
    await applyImport(plan);
    expect(await db.collections.toArray()).toEqual([]);
    expect(await db.completions.toArray()).toEqual([]);
    expect(await db.collectionActiveEntries.toArray()).toEqual([]);
  });

  it("forward-refuses a v11 bundle at the peek", async () => {
    const { validateBundle } = await loadService();
    const entries = {
      "bundle.json": new TextEncoder().encode(
        JSON.stringify({ schemaVersion: 11, exportedAt: "x", appVersion: "x" }),
      ),
      "manifest.json": new TextEncoder().encode(JSON.stringify({})),
    };
    const file = zipFileOf(entries);
    const result = await validateBundle(file);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.kind).toBe("newer-schema-version");
  });

  it("round-trips collections with ordered entries across all four target kinds through export → wipe → import", async () => {
    const { buildBundle, validateBundle, applyImport } = await loadService();
    const { detectImportPreview, resolveImportPlan } = await loadConflicts();
    const { db } = await loadDb();

    // The library: one saved web work (chapters First/Second), one EPUB book
    // with two chapter articles.
    const work = workArticle();
    const workChapters = work.structure!.destinations.filter((d) => d.kind === "chapter");
    const book = BookSchema.parse({
      id: "epub-collection-rt01",
      title: "Round Trip Book",
      authors: ["A. Author"],
      language: "en",
      chapterArticleIds: ["epub-ch-1", "epub-ch-2"],
      skippedChapterCount: 0,
      source: "epub-upload",
      originalFileHash: "sha256:" + "a".repeat(64),
      addedAt: "2026-09-01T00:00:00.000Z",
    });
    const chapterOf = (id: string, title: string): CanonicalArticle =>
      ArticleSchema.parse({
        id,
        revision: 1,
        lang: "en",
        provenance: {
          sourceUrl: `https://example.com/${id}`,
          title,
          retrievedAt: "2026-09-01T00:00:00.000Z",
          originalHtmlHash: "sha256:" + "b".repeat(64),
        },
        blocks: [{ kind: "paragraph", content: [{ text: `${title} text.`, marks: [] }] }],
        footnotes: [],
        ingestionMeta: {
          source: "epub-chapter",
          originalHtmlHash: "sha256:" + "b".repeat(64),
          extractionConfidence: "high",
          bookId: book.id,
          chapterIndex: id === "epub-ch-1" ? 0 : 1,
        },
      });
    const ch1 = chapterOf("epub-ch-1", "Chapter One");
    const ch2 = chapterOf("epub-ch-2", "Chapter Two");
    await db.articles.put(work);
    await db.books.put(book);
    await db.articles.put(ch1);
    await db.articles.put(ch2);

    // One collection referencing all four target kinds, plus a completion
    // row and the collection's remembered active entry.
    const collection = CollectionSchema.parse({
      schemaVersion: 1,
      id: "coll-rt-222222",
      name: "Evening plan",
      entries: [
        {
          id: "entry-aaaaaaaa",
          target: { kind: "article", articleId: work.id },
          addedAt: "2026-09-02T00:00:00.000Z",
        },
        {
          id: "entry-bbbbbbbb",
          target: { kind: "book", bookId: book.id },
          addedAt: "2026-09-02T00:01:00.000Z",
        },
        {
          id: "entry-cccccccc",
          target: { kind: "book-chapter", bookId: book.id, articleId: ch1.id },
          addedAt: "2026-09-02T00:02:00.000Z",
        },
        {
          id: "entry-dddddddd",
          target: { kind: "work-chapter", articleId: work.id, destinationId: workChapters[1]!.id },
          addedAt: "2026-09-02T00:03:00.000Z",
        },
      ],
      createdAt: "2026-09-02T00:00:00.000Z",
      updatedAt: "2026-09-02T00:03:00.000Z",
    });
    const completion = CompletionRecordSchema.parse({
      schemaVersion: 1,
      targetKey: "article:epub-ch-1", // the book-chapter target's computed identity
      target: { kind: "book-chapter", bookId: book.id, articleId: ch1.id },
      finished: true,
      source: "reader",
      updatedAt: "2026-09-03T00:00:00.000Z",
    });
    const activeEntry = CollectionActiveEntrySchema.parse({
      schemaVersion: 1,
      collectionId: collection.id,
      entryId: "entry-bbbbbbbb",
      updatedAt: "2026-09-03T00:00:00.000Z",
    });
    await db.collections.put(collection);
    await db.completions.put(completion);
    await db.collectionActiveEntries.put(activeEntry);

    // ── Machine B: wipe, import the exported bundle, verify the restore. ──
    const entries = unzipSync((await buildBundle()).bytes);
    await db.articles.clear();
    await db.books.clear();
    await db.collections.clear();
    await db.completions.clear();
    await db.collectionActiveEntries.clear();
    const file = new File([zipSync(entries)], "x.zip");
    const validated = await validateBundle(file);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const preview = await detectImportPreview(validated.bundle, []);
    expect(preview.incoming.collections).toBe(1);
    expect(preview.added.collections).toBe(1);
    expect(preview.unresolvedCollections).toBe(0);
    expect(preview.conflictingCollections).toBe(0);
    const plan = await resolveImportPlan(validated.bundle, preview, ALL_SKIP, false);
    expect(plan.collectionsToWrite).toHaveLength(1);
    await applyImport(plan);

    // The collection row restored byte-identically — name, ordered entry
    // identities, and targets intact.
    const restoredCollection = await db.collections.get(collection.id);
    expect(restoredCollection).toEqual(collection);
    // The shared completion restored (same targetKey identity).
    expect(await db.completions.get(completion.targetKey)).toEqual(completion);
    // The remembered active entry restored.
    expect(await db.collectionActiveEntries.get(collection.id)).toEqual(activeEntry);
    // No implicit duplication: exactly the four readings ride — never a
    // collection-owned copy.
    const articleIds = (await db.articles.toArray()).map((a) => a.id).sort();
    expect(articleIds).toEqual(["art-collection-rt01", "epub-ch-1", "epub-ch-2"].sort());
  });

  it("an empty collection round-trips (entries: [] is a valid arrangement)", async () => {
    const { db } = await loadDb();
    const empty = CollectionSchema.parse({
      schemaVersion: 1,
      id: "coll-empty-1111",
      name: "Someday",
      entries: [],
      createdAt: "2026-09-02T00:00:00.000Z",
      updatedAt: "2026-09-02T00:00:00.000Z",
    });
    await db.collections.put(empty);
    await importBundle(await v10BundleFile({ articles: [], collections: [empty] }));
    expect(await db.collections.get(empty.id)).toEqual(empty);
  });

  it("importing into a library that already holds the readings does not duplicate them", async () => {
    const { db } = await loadDb();
    const work = workArticle();
    await db.articles.put(work);
    const collection = CollectionSchema.parse({
      schemaVersion: 1,
      id: "coll-share-3333",
      name: "Shared",
      entries: [
        {
          id: "entry-eeeeeeee",
          target: { kind: "article", articleId: work.id },
          addedAt: "2026-09-02T00:00:00.000Z",
        },
      ],
      createdAt: "2026-09-02T00:00:00.000Z",
      updatedAt: "2026-09-02T00:00:00.000Z",
    });
    // Fresh-library semantics: the article already exists locally, the
    // collection is new — the plan writes the collection and NOT the article
    // (identical duplicate — calm no-op), so no reading is duplicated.
    await importBundle(await v10BundleFile({ articles: [work], collections: [collection] }));
    const rows = await db.articles.where("id").equals(work.id).toArray();
    expect(rows).toHaveLength(1);
    expect((await db.collections.toArray()).map((c) => c.id)).toEqual([collection.id]);
  });
});
