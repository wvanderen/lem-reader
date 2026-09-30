// tests/unit/portability/highlight-tags-roundtrip.test.ts
// Issue #116 — highlight tags survive export → import under the existing
// highlight-ID conflict policy. The acceptance rows under test:
//   - "Older highlights hydrate with no tags" (covered in
//     highlight-schema.test.ts — the additive schema hydration)
//   - "Export/import preserves tags under the existing highlight-ID
//     conflict policy"
//
// Pipeline under test (the real seams, no mocks) — mirrors
// added-at-roundtrip.test.ts:
//   saveHighlight/saveNote (the persistence seams) → buildBundle (the
//   exporter's Zod self-check) → validateBundle (unzip + manifest + parse)
//   → resolveImportPlan → applyImport (the one-transaction put) →
//   loadAllHighlights (the Zod-at-boundary read).
//
// The three policies:
//   - default skip on a FRESH device → the tagged highlight lands whole.
//   - keep-both on a clashing id → the MINTED id carries the incoming tags
//     (the record spread in the keep-both path) and the note follows the
//     rewritten highlightId (Pitfall 7).
//   - overwrite on a clashing id → the same-id put carries the INCOMING
//     tags (the local tags are replaced).
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
  const notes = await import("../../../src/persistence/notesStore");
  return { ...highlights, ...notes };
}

function sampleArticle(): CanonicalArticle {  return ArticleSchema.parse({
    id: "art-tag-roundtrip",
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: "https://example.com/tag-roundtrip",
      title: "Tag Round Trip Article",
      author: "An Author",
      retrievedAt: "2026-09-10T00:00:00.000Z",
      originalHtmlHash: "sha256:" + "d".repeat(64),
    },
    blocks: [
      { kind: "paragraph", content: [{ text: "Round trip body text.", marks: [] }] },
    ],
    footnotes: [],
    ingestionMeta: {
      source: "url",
      origin: "url",
      sourceUrl: "https://example.com/tag-roundtrip",
      originalHtmlHash: "sha256:" + "d".repeat(64),
      fetchedAt: "2026-09-10T00:00:00.000Z",
      extractionConfidence: "high",
      extractionWarnings: [],
    },
  });
}

const TAGGED_HIGHLIGHT = {
  schemaVersion: 1 as const,
  id: "hl-tagged-1",
  articleId: "art-tag-roundtrip",
  revision: 1,
  position: { start: 0, end: 18 },
  quote: { prefix: "", exact: "Round trip body text.", suffix: "" },
  createdAt: "2026-09-10T00:00:00.000Z",
  tags: ["essays", "to-revisit"],
};

const TAGGED_NOTE = {
  schemaVersion: 1 as const,
  id: "nt-tagged-1",
  highlightId: "hl-tagged-1",
  text: "The note shares the highlight's tags — none of its own.",
  updatedAt: "2026-09-10T00:00:00.000Z",
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

/** Seed device A: the article + the tagged highlight + its note. */
async function seedLibrary(): Promise<void> {
  const { dexieLibrarySource } = await import("../../../src/ingestion/LibrarySource");
  const { saveHighlight, saveNote } = await loadStores();
  await dexieLibrarySource.save(sampleArticle());
  await saveHighlight(TAGGED_HIGHLIGHT);
  await saveNote(TAGGED_NOTE);
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

describe("highlight tags survive export → import (issue #116)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("the exported bundle carries the tags; a fresh import lands them whole", async () => {
    await seedLibrary();

    // Export: the Zod self-check in buildBundle parses the highlights block,
    // so the tags must already round-trip the envelope.
    const { buildBundle } = await loadService();
    const { bytes } = await buildBundle();

    // Fresh device.
    await wipeDatabase();
    const { validateBundle, applyImport } = await loadService();
    const { detectImportPreview, resolveImportPlan } = await loadConflicts();

    const validation = await validateBundle(
      new File([new Uint8Array(bytes)], "lem-reader-bundle-v1.zip", { type: "application/zip" }),
    );
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.bundle.highlights[0]?.tags).toEqual(["essays", "to-revisit"]);

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

    const { loadAllHighlights, loadNote } = await loadStores();
    const rows = await loadAllHighlights();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("hl-tagged-1");
    expect(rows[0]?.tags).toEqual(["essays", "to-revisit"]);
    // The note re-attached to the same highlight id (no tags of its own).
    const note = await loadNote("hl-tagged-1");
    expect(note?.text).toContain("shares the highlight's tags");
  });

  it("keep-both mints a new id that CARRIES the tags; the note follows the rewrite", async () => {
    await seedLibrary();
    const bundle = await exportToFreshDevice();

    // Seed the SAME highlight id locally (the clash) with DIFFERENT tags.
    const { saveHighlight, saveNote } = await loadStores();
    await saveHighlight({ ...TAGGED_HIGHLIGHT, tags: ["local-only"] });
    await saveNote(TAGGED_NOTE);

    const { detectImportPreview, resolveImportPlan } = await loadConflicts();
    const { applyImport } = await loadService();
    const preview = await detectImportPreview(bundle);
    const plan = await resolveImportPlan(
      bundle,
      preview,
      { ...ALL_SKIP, "highlight-id": "keep-both", "note-id": "keep-both" },
      false,
      undefined,
      undefined,
    );

    // The incoming highlight was rewritten to a fresh id.
    const minted = plan.highlightsToWrite.find((h) => h.id !== "hl-tagged-1");
    expect(minted).toBeDefined();
    expect(plan.idRewrites.get("hl-tagged-1")).toBe(minted?.id);
    // The minted row carries the incoming tags verbatim (the record spread).
    expect(minted?.tags).toEqual(["essays", "to-revisit"]);
    // The incoming note follows the rewritten highlightId (Pitfall 7).
    const rewrittenNote = plan.notesToWrite.find((n) => n.id !== "nt-tagged-1");
    expect(rewrittenNote?.highlightId).toBe(minted?.id);

    await applyImport(plan);

    const { loadAllHighlights } = await loadStores();
    const rows = await loadAllHighlights();
    expect(rows).toHaveLength(2);
    const local = rows.find((h) => h.id === "hl-tagged-1");
    const incoming = rows.find((h) => h.id === minted?.id);
    expect(local?.tags).toEqual(["local-only"]);
    expect(incoming?.tags).toEqual(["essays", "to-revisit"]);
  });

  it("overwrite replaces the local row's tags with the incoming tags (same id)", async () => {
    await seedLibrary();
    const bundle = await exportToFreshDevice();

    // Local row drifted: same id, different tags.
    const { saveHighlight } = await loadStores();
    await saveHighlight({ ...TAGGED_HIGHLIGHT, tags: ["drifted"] });

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
    expect(rows[0]?.id).toBe("hl-tagged-1");
    expect(rows[0]?.tags).toEqual(["essays", "to-revisit"]);
  });

  it("a pre-#116 highlight (no tags on the row) exports + re-imports as a no-tag row", async () => {
    // The pre-#116 writer never emitted a tags field; the exporter's Zod
    // self-check hydrates the old shape to [] and the importer lands it as
    // an ordinary no-tag highlight.
    const { dexieLibrarySource } = await import("../../../src/ingestion/LibrarySource");
    const { saveHighlight } = await loadStores();
    await dexieLibrarySource.save(sampleArticle());
    await saveHighlight({
      schemaVersion: 1,
      id: "hl-untagged-old",
      articleId: "art-tag-roundtrip",
      revision: 1,
      position: { start: 0, end: 18 },
      quote: { prefix: "", exact: "Round trip body text.", suffix: "" },
      createdAt: "2026-09-10T00:00:00.000Z",
      // NO tags field — the old row shape.
    });

    const { buildBundle, validateBundle, applyImport } = await loadService();
    const { detectImportPreview, resolveImportPlan } = await loadConflicts();
    const { bytes } = await buildBundle();

    await wipeDatabase();
    const validation = await validateBundle(
      new File([new Uint8Array(bytes)], "lem-reader-bundle-v1.zip", { type: "application/zip" }),
    );
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    // The envelope self-check hydrated the missing field to [].
    expect(validation.bundle.highlights[0]?.tags).toEqual([]);

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
    expect(rows[0]?.id).toBe("hl-untagged-old");
    expect(rows[0]?.tags).toEqual([]);
  });
});
