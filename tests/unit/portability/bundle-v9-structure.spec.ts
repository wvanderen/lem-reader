// tests/unit/portability/bundle-v9-structure.spec.ts
// Issue #236 — the bundle-v9 truth: structural snapshots ride the ARTICLE
// rows (ArticleSchema.structure — the readerTitle composition precedent;
// never a separate envelope block) and survive ordinary backup round trips.
//
//   - writers emit schemaVersion 9 (the ACTUAL current writer version, 8,
//     extended — never an assumed number); v1..v8 bundles parse exactly as
//     before (legacy importable; their articles carry no structure and the
//     reader derives it locally)
//   - v10+ forward-refuses at the validateBundle peek (D9-04 preserved)
//   - a structured article round-trips: export → wipe → import restores the
//     snapshot byte-identically alongside canonical content
//   - import validates revision/range compatibility BEFORE accepting a
//     snapshot: an invalid incoming snapshot (wrong revision, broken tiling
//     against the row's canonical content) is STRIPPED, not trusted, not a
//     refusal — the article itself imports and the reader's local derivation
//     re-establishes structure. Nothing reader-authored is lost (a snapshot
//     is always re-derivable), so stripping is not a conflict kind.
//   - a keep-local resolution keeps the LOCAL row (and its snapshot)
//     untouched.
//
// Harness mirrors tests/unit/portability/bundle-v5.spec.ts (fake-indexeddb
// via Dexie.dependencies at module top-level, wipeDatabase beforeEach, lazy
// module imports).
import { beforeEach, describe, expect, it } from "vitest";
import { unzipSync, zipSync, strFromU8 } from "fflate";
import { ArticleSchema } from "../../../src/content/schema";
import type { CanonicalArticle } from "../../../src/content/schema";
import { deriveWorkStructure, validateWorkStructure } from "../../../src/content/structure";
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

const chapteredArticle = (overrides: Partial<CanonicalArticle> = {}): CanonicalArticle => {
  const base = ArticleSchema.parse({
    id: "art-structure-rt01",
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: "https://example.com/chaptered",
      title: "Chaptered Round Trip",
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

async function v9BundleFile(articles: CanonicalArticle[]): Promise<File> {
  const { ExportBundleSchema } = await import("../../../src/portability/bundle");
  const bundle = ExportBundleSchema.parse({
    schemaVersion: 9,
    exportedAt: "2026-10-01T12:00:00.000Z",
    appVersion: "test",
    articles: JSON.parse(JSON.stringify(articles)),
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

describe("bundle v9 — structural snapshots (issue #236)", () => {
  beforeEach(wipeDatabase);

  it("the writer emits schemaVersion 10 (the current 9 extended)", async () => {
    const { buildBundle } = await loadService();
    const { db } = await loadDb();
    await db.articles.put(chapteredArticle());
    const entries = unzipSync((await buildBundle()).bytes);
    const bundleJson = JSON.parse(strFromU8(entries["bundle.json"]!)) as { schemaVersion: number };
    expect(bundleJson.schemaVersion).toBe(10);
  });

  it("round-trips a structural snapshot through export → wipe → import", async () => {
    const { buildBundle, validateBundle } = await loadService();
    const { detectImportPreview, resolveImportPlan } = await loadConflicts();
    const { applyImport } = await loadService();
    const { db } = await loadDb();
    const article = chapteredArticle();
    await db.articles.put(article);

    const entries = unzipSync((await buildBundle()).bytes);
    const ridden = JSON.parse(strFromU8(entries["bundle.json"]!)) as {
      articles: { structure?: unknown }[];
    };
    expect(ridden.articles[0]?.structure).toEqual(article.structure);

    // Wipe and re-import: the snapshot comes back with the row.
    await db.articles.clear();
    const file = new File([zipSync(entries)], "x.zip");
    const validated = await validateBundle(file);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const preview = await detectImportPreview(validated.bundle, []);
    const plan = await resolveImportPlan(validated.bundle, preview, ALL_SKIP, false);
    await applyImport(plan);
    const restored = await db.articles.get(article.id);
    expect(restored?.structure).toEqual(article.structure);
    expect(
      validateWorkStructure(ArticleSchema.parse(restored!), restored?.structure),
    ).not.toBeNull();
  });

  it("a legacy v8 bundle (articles without structure) still imports", async () => {
    const { ExportBundleSchema } = await import("../../../src/portability/bundle");
    const { computeManifest } = await import("../../../src/portability/manifest");
    const { validateBundle, applyImport } = await loadService();
    const { detectImportPreview, resolveImportPlan } = await loadConflicts();
    const { db } = await loadDb();
    const legacy = chapteredArticle();
    delete (legacy as { structure?: unknown }).structure;
    const bundle = ExportBundleSchema.parse({
      schemaVersion: 8,
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
    await applyImport(plan);
    const stored = await db.articles.get(legacy.id);
    expect(stored?.structure).toBeUndefined(); // derived locally on open — never invented
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

  it("strips an incoming snapshot whose revision no longer matches the row", async () => {
    const { db } = await loadDb();
    const article = chapteredArticle();
    const hostile = { ...article, structure: { ...article.structure!, revision: 7 } };
    await importBundle(await v9BundleFile([hostile]));
    const stored = await db.articles.get(article.id);
    expect(stored).toBeDefined();
    expect(stored?.structure).toBeUndefined(); // stripped — derived on open
    // The article itself imported (only the snapshot was refused).
    expect(stored?.blocks).toEqual(article.blocks);
  });

  it("strips an incoming snapshot whose ranges do not tile the row's content", async () => {
    const { db } = await loadDb();
    const article = chapteredArticle();
    const broken = {
      ...article,
      structure: {
        ...article.structure!,
        destinations: article.structure!.destinations.map((d, i) =>
          i === 0 ? { ...d, endOffset: d.endOffset + 5 } : d,
        ),
      },
    };
    await importBundle(await v9BundleFile([broken]));
    const stored = await db.articles.get(article.id);
    expect(stored?.structure).toBeUndefined();
  });

  it.each(["invalid", "absent", "different-valid"] as const)(
    "preserves frozen local structure on a metadata-only import with %s incoming structure",
    async (snapshotKind) => {
      const { db } = await loadDb();
      const local = chapteredArticle({ readerTitle: "Local title" });
      await db.articles.put(local);
      const incoming = chapteredArticle({ readerTitle: "Imported title" });
      if (snapshotKind === "absent") {
        delete incoming.structure;
      } else if (snapshotKind === "invalid") {
        incoming.structure!.revision += 1;
      } else {
        incoming.structure!.generatorVersion = 99;
        incoming.structure!.destinations[0]!.title = "A different established title";
      }
      await importBundle(await v9BundleFile([incoming]), {
        ...ALL_SKIP,
        "article-metadata-override": "overwrite",
      });
      const stored = await db.articles.get(local.id);
      expect(stored?.readerTitle).toBe("Imported title");
      expect(stored?.structure).toEqual(local.structure);
    },
  );

  it("does not carry local structure over a canonical content replacement", async () => {
    const { db } = await loadDb();
    const local = chapteredArticle();
    await db.articles.put(local);
    const incoming = chapteredArticle({
      provenance: { ...local.provenance, originalHtmlHash: "sha256:" + "9".repeat(64) },
      blocks: [{ kind: "paragraph", content: [{ text: "Replacement content.", marks: [] }] }],
    });
    await importBundle(await v9BundleFile([incoming]), {
      ...ALL_SKIP,
      "article-content-divergence": "overwrite",
    });
    const stored = await db.articles.get(local.id);
    expect(stored?.structure).toEqual(incoming.structure);
    expect(stored?.structure).not.toEqual(local.structure);
  });

  it("a valid incoming snapshot is accepted as-is", async () => {
    const { db } = await loadDb();
    const article = chapteredArticle();
    await importBundle(await v9BundleFile([article]));
    const stored = await db.articles.get(article.id);
    expect(stored?.structure).toEqual(article.structure);
  });

  it("publisher-titled destinations round-trip verbatim (issue #237)", async () => {
    const { db } = await loadDb();
    const base = ArticleSchema.parse({
      id: "art-publisher-rt01",
      revision: 1,
      lang: "en",
      provenance: {
        sourceUrl: "https://example.com/all-pages",
        title: "Publisher Round Trip",
        retrievedAt: "2026-10-01T00:00:00.000Z",
        originalHtmlHash: "sha256:" + "5".repeat(64),
      },
      blocks: [
        { kind: "heading", level: 2, content: [{ text: "Letters", marks: [] }] },
        { kind: "paragraph", content: [{ text: "First run.", marks: [] }] },
        { kind: "heading", level: 2, content: [{ text: "Letters", marks: [] }] },
        { kind: "paragraph", content: [{ text: "Second run.", marks: [] }] },
        { kind: "heading", level: 2, content: [{ text: "Coda", marks: [] }] },
        { kind: "paragraph", content: [{ text: "Closing.", marks: [] }] },
      ],
      footnotes: [],
    });
    // The publisher numbered its own repeated-title entries; the derivation
    // resolves them to successive occurrences with the verbatim labels.
    const structure = deriveWorkStructure({ ...base, provenanceTitle: base.provenance.title }, [
      "Letters",
      "Letters (2)",
      "Coda",
    ]);
    expect(structure).not.toBeNull();
    const chapters = structure!.destinations.filter((d) => d.kind === "chapter");
    expect(chapters.map((c) => c.title)).toEqual(["Letters", "Letters (2)", "Coda"]);
    expect(chapters.every((c) => c.titleSource === "publisher")).toBe(true);
    const article = { ...base, structure: structure! };
    await importBundle(await v9BundleFile([article]));
    const stored = await db.articles.get(article.id);
    // Byte-identical restore: the publisher's own labels (ordinals and all)
    // survive the bundle unchanged.
    expect(stored?.structure).toEqual(structure);
  });
});
