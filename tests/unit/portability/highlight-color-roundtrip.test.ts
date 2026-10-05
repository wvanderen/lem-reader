// tests/unit/portability/highlight-color-roundtrip.test.ts
// Issue #118 — the named highlight color survives export → import under the
// existing highlight-ID conflict policy (D9-14). The additive-field
// discipline is the issue #116 tags twin — this file mirrors
// highlight-tags-roundtrip.test.ts with the color field:
//   - default skip on a FRESH device → the colored highlight lands whole.
//   - keep-both on a clashing id → the MINTED id carries the incoming color
//     (the record spread in the keep-both path).
//   - overwrite on a clashing id → the same-id put carries the INCOMING
//     color (the local color is replaced).
//   - a pre-#118 row (no color field) exports + re-imports hydrated to
//     "default" (the exporter's Zod self-check).
//
// Pipeline under test (the real seams, no mocks): saveHighlight →
// buildBundle → validateBundle → resolveImportPlan → applyImport →
// loadAllHighlights.
import { beforeEach, describe, expect, it } from "vitest";
import { ArticleSchema } from "../../../src/content/schema";
import type { CanonicalArticle } from "../../../src/content/schema";
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
async function loadStores() {
  const highlights = await import("../../../src/persistence/highlightsStore");
  return { ...highlights };
}

function sampleArticle(): CanonicalArticle {
  return ArticleSchema.parse({
    id: "art-color-roundtrip",
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: "https://example.com/color-roundtrip",
      title: "Color Round Trip Article",
      author: "An Author",
      retrievedAt: "2026-09-20T00:00:00.000Z",
      originalHtmlHash: "sha256:" + "c".repeat(64),
    },
    blocks: [{ kind: "paragraph", content: [{ text: "Round trip body text.", marks: [] }] }],
    footnotes: [],
    ingestionMeta: {
      source: "url",
      origin: "url",
      sourceUrl: "https://example.com/color-roundtrip",
      originalHtmlHash: "sha256:" + "c".repeat(64),
      fetchedAt: "2026-09-20T00:00:00.000Z",
      extractionConfidence: "high",
      extractionWarnings: [],
    },
  });
}

const COLORED_HIGHLIGHT = {
  schemaVersion: 1 as const,
  id: "hl-colored-1",
  articleId: "art-color-roundtrip",
  revision: 1,
  position: { start: 0, end: 18 },
  quote: { prefix: "", exact: "Round trip body text.", suffix: "" },
  createdAt: "2026-09-20T00:00:00.000Z",
  tags: [],
  color: "green" as const,
};

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

/** Seed device A: the article + the colored highlight. */
async function seedLibrary(): Promise<void> {
  const { dexieLibrarySource } = await import("../../../src/ingestion/LibrarySource");
  const { saveHighlight } = await loadStores();
  await dexieLibrarySource.save(sampleArticle());
  await saveHighlight(COLORED_HIGHLIGHT);
}

async function exportToFreshDevice() {
  const { buildBundle } = await loadService();
  const { bytes } = await buildBundle();
  await wipeDatabase();
  const { validateBundle } = await loadService();
  const validation = await validateBundle(
    new File([new Uint8Array(bytes)], "lem-reader-bundle-v1.zip", { type: "application/zip" }),
  );
  expect(validation.ok).toBe(true);
  if (!validation.ok) throw new Error("bundle failed validation");
  return validation.bundle;
}

describe("highlight colors survive export → import (issue #118)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("the exported bundle carries the color; a fresh import lands it whole", async () => {
    await seedLibrary();

    const { buildBundle, validateBundle, applyImport } = await loadService();
    const { detectImportPreview, resolveImportPlan } = await loadConflicts();
    const { bytes } = await buildBundle();

    await wipeDatabase();
    const validation = await validateBundle(
      new File([new Uint8Array(bytes)], "lem-reader-bundle-v1.zip", { type: "application/zip" }),
    );
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    // The envelope's Zod self-check carries the named color verbatim.
    expect(validation.bundle.highlights[0]?.color).toBe("green");

    const preview = await detectImportPreview(validation.bundle);
    const plan = await resolveImportPlan(
      validation.bundle,
      preview,
      ALL_SKIP,
      false,
      undefined,
      validation.assets,
    );
    expect(plan.highlightsToWrite).toHaveLength(1);
    await applyImport(plan);

    const { loadAllHighlights } = await loadStores();
    const rows = await loadAllHighlights();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("hl-colored-1");
    expect(rows[0]?.color).toBe("green");
  });

  it("keep-both mints a new id that CARRIES the color (the record spread)", async () => {
    await seedLibrary();
    const bundle = await exportToFreshDevice();

    // Seed the SAME highlight id locally (the clash) with a DIFFERENT color.
    const { saveHighlight } = await loadStores();
    await saveHighlight({ ...COLORED_HIGHLIGHT, color: "pink" });

    const { detectImportPreview, resolveImportPlan } = await loadConflicts();
    const { applyImport } = await loadService();
    const preview = await detectImportPreview(bundle);
    const plan = await resolveImportPlan(
      bundle,
      preview,
      { ...ALL_SKIP, "highlight-id": "keep-both" },
      false,
      undefined,
      undefined,
    );

    const minted = plan.highlightsToWrite.find((h) => h.id !== "hl-colored-1");
    expect(minted).toBeDefined();
    expect(plan.idRewrites.get("hl-colored-1")).toBe(minted?.id);
    // The minted row carries the incoming color verbatim.
    expect(minted?.color).toBe("green");

    await applyImport(plan);

    const { loadAllHighlights } = await loadStores();
    const rows = await loadAllHighlights();
    expect(rows).toHaveLength(2);
    const local = rows.find((h) => h.id === "hl-colored-1");
    const incoming = rows.find((h) => h.id === minted?.id);
    expect(local?.color).toBe("pink");
    expect(incoming?.color).toBe("green");
  });

  it("overwrite replaces the local row's color with the incoming color (same id)", async () => {
    await seedLibrary();
    const bundle = await exportToFreshDevice();

    // Local row drifted: same id, different color.
    const { saveHighlight } = await loadStores();
    await saveHighlight({ ...COLORED_HIGHLIGHT, color: "yellow" });

    const { detectImportPreview, resolveImportPlan } = await loadConflicts();
    const { applyImport } = await loadService();
    const preview = await detectImportPreview(bundle);
    const plan = await resolveImportPlan(
      bundle,
      preview,
      { ...ALL_SKIP, "highlight-id": "overwrite" },
      false,
      undefined,
      undefined,
    );
    expect(plan.highlightsToWrite).toHaveLength(1);
    await applyImport(plan);

    const { loadAllHighlights } = await loadStores();
    const rows = await loadAllHighlights();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("hl-colored-1");
    expect(rows[0]?.color).toBe("green");
  });

  it("a pre-#118 highlight (no color on the row) exports + re-imports hydrated to default", async () => {
    // The pre-#118 writer never emitted a color field; the exporter's Zod
    // self-check hydrates the old shape to "default" and the importer lands
    // it as an ordinary Default highlight.
    const { dexieLibrarySource } = await import("../../../src/ingestion/LibrarySource");
    const { saveHighlight } = await loadStores();
    await dexieLibrarySource.save(sampleArticle());
    // The pre-#118 writer emitted this exact shape; saveHighlight does not
    // re-parse on write (store contract), so the cast simulates the old row
    // landing in Dexie un-hydrated — the export self-check is what hydrates.
    const PRE_COLOR_ROW = {
      schemaVersion: 1,
      id: "hl-uncolored-old",
      articleId: "art-color-roundtrip",
      revision: 1,
      position: { start: 0, end: 18 },
      quote: { prefix: "", exact: "Round trip body text.", suffix: "" },
      createdAt: "2026-09-20T00:00:00.000Z",
      // NO color field — the old row shape.
    } as unknown as Parameters<typeof saveHighlight>[0];
    await saveHighlight(PRE_COLOR_ROW);

    const { buildBundle, validateBundle, applyImport } = await loadService();
    const { detectImportPreview, resolveImportPlan } = await loadConflicts();
    const { bytes } = await buildBundle();

    await wipeDatabase();
    const validation = await validateBundle(
      new File([new Uint8Array(bytes)], "lem-reader-bundle-v1.zip", { type: "application/zip" }),
    );
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.bundle.highlights[0]?.color).toBe("default");

    const preview = await detectImportPreview(validation.bundle);
    const plan = await resolveImportPlan(
      validation.bundle,
      preview,
      ALL_SKIP,
      false,
      undefined,
      validation.assets,
    );
    await applyImport(plan);
    const { loadAllHighlights } = await loadStores();
    const rows = await loadAllHighlights();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("hl-uncolored-old");
    expect(rows[0]?.color).toBe("default");
  });
});
