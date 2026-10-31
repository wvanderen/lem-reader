// tests/unit/portability/highlight-slots-preferences.test.ts
// Issue #195 — the five highlight slots + the explicit default-slot choice
// travel in the versioned bundle's ALWAYS-present preferences block (D9-12),
// with the existing consent/conflict behavior untouched and backward
// compatibility intact:
//   - edited slots + default export → validate → a FRESH import with
//     applyPreferences lands them whole (the round-trip spine).
//   - a pre-#195 export (preferences WITHOUT the slot fields) validates via
//     the manifest legacy-shape tolerance and imports with the slot fields
//     hydrated — upgrading never refuses an old bundle.
//   - a claimed-v7 preferences block missing a slot field is TAMPERING: the
//     manifest mismatches and the bundle refuses as corrupted (a missing
//     field in a current-version export must still fail its manifest).
//
// Pipeline under test (the real seams, no mocks): saveSettings → buildBundle
// → validateBundle → (tamper) → loadSettings after applyImport.
import { beforeEach, describe, expect, it } from "vitest";
import { zipSync, unzipSync, strFromU8, strToU8 } from "fflate";
import fakeIndexedDB, { IDBKeyRange } from "fake-indexeddb";
import { Dexie } from "dexie";
import { ExportBundleSchema } from "../../../src/portability/bundle";
import type { HighlightSlot } from "../../../src/content/schema";

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
async function loadManifest() {
  return await import("../../../src/portability/manifest");
}

/** The D9-14 default — skip every kind (nothing conflicts on a fresh device). */
const ALL_SKIP = {
  book: "skip",
  "article-revision": "skip",
  "article-content-divergence": "skip",
  "article-metadata-override": "skip",
  "highlight-id": "skip",
  "note-id": "skip",
  "article-note-id": "skip",
  location: "skip",
} as const;

/** Edited slots a reader might have saved (renamed slot 1 with tags, slot 3
 * recolored, and the EXPLICIT default moved to slot 3). */
const EDITED_SLOTS: HighlightSlot[] = [
  { name: "Reading list", color: "default", tags: ["to-read"] },
  { name: "Yellow", color: "yellow", tags: [] },
  { name: "Key ideas", color: "blue", tags: ["key-idea", "essays"] },
  { name: "Blue", color: "blue", tags: [] },
  { name: "Pink", color: "pink", tags: [] },
];

/** Issue #196 — the same edited slots with slot 3 carrying a custom color
 * snapshot (strict hex — the schema validated it) and slot 1 switched to a
 * custom color source. */
const EDITED_SLOTS_CUSTOM: HighlightSlot[] = [
  { name: "Reading list", color: "default", customColor: "#e9c46a", tags: ["to-read"] },
  { name: "Yellow", color: "yellow", tags: [] },
  { name: "Key ideas", color: "blue", customColor: "#1234AB", tags: ["key-idea", "essays"] },
  { name: "Blue", color: "blue", tags: [] },
  { name: "Pink", color: "pink", tags: [] },
];

function zipFileOf(entries: Record<string, Uint8Array>): File {
  return new File([zipSync(entries)], "lem-reader-bundle-v1.zip", { type: "application/zip" });
}

/** A minimal real article so the mixed bundle's highlight has an owner (the
 * import merge keys highlights to their article rows — the roundtrip-suite
 * convention, trimmed to one paragraph). */
async function seedArticle(): Promise<void> {
  const { ArticleSchema } = await import("../../../src/content/schema");
  const { dexieLibrarySource } = await import("../../../src/ingestion/LibrarySource");
  await dexieLibrarySource.save(
    ArticleSchema.parse({
      id: "art-slots-prefs",
      revision: 1,
      lang: "en",
      provenance: {
        sourceUrl: "https://example.com/slots-prefs",
        title: "Slots Prefs Article",
        author: "An Author",
        retrievedAt: "2026-10-29T00:00:00.000Z",
        originalHtmlHash: "sha256:" + "d".repeat(64),
      },
      blocks: [{ kind: "paragraph", content: [{ text: "Slots prefs body text.", marks: [] }] }],
      footnotes: [],
      ingestionMeta: {
        source: "url",
        origin: "url",
        sourceUrl: "https://example.com/slots-prefs",
        originalHtmlHash: "sha256:" + "d".repeat(64),
        fetchedAt: "2026-10-29T00:00:00.000Z",
        extractionConfidence: "high",
        extractionWarnings: [],
      },
    }),
  );
}

describe("highlight slots travel in the versioned bundle (issue #195)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("edited slots + the explicit default export and land whole on a fresh device", async () => {
    const { saveSettings } = await import("../../../src/persistence/settingsStore");
    const current = await import("../../../src/settings/defaults");
    await saveSettings({
      ...current.DEFAULT_SETTINGS,
      highlightSlots: EDITED_SLOTS,
      defaultHighlightSlot: 2,
    });

    const { buildBundle, validateBundle, applyImport } = await loadService();
    const { detectImportPreview, resolveImportPlan } = await loadConflicts();
    const { bytes } = await buildBundle();

    // Fresh device: wipe, then validate + apply with preferences consented.
    await wipeDatabase();
    const validation = await validateBundle(
      new File([new Uint8Array(bytes)], "lem-reader-bundle-v1.zip", { type: "application/zip" }),
    );
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.bundle.preferences.highlightSlots).toEqual(EDITED_SLOTS);
    expect(validation.bundle.preferences.defaultHighlightSlot).toBe(2);

    const preview = await detectImportPreview(validation.bundle);
    const plan = await resolveImportPlan(
      validation.bundle,
      preview,
      ALL_SKIP,
      true, // applyPreferences — the consented import
      undefined,
      validation.assets,
    );
    await applyImport(plan);

    const { loadSettings } = await import("../../../src/persistence/settingsStore");
    const result = await loadSettings();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.settings.highlightSlots).toEqual(EDITED_SLOTS);
    expect(result.settings.defaultHighlightSlot).toBe(2);
  });

  it("a pre-#195 export (no slot fields in preferences) validates via the legacy tolerance and imports hydrated", async () => {
    const { buildBundle, validateBundle, applyImport } = await loadService();
    const { computeManifest } = await loadManifest();
    const { detectImportPreview, resolveImportPlan } = await loadConflicts();

    // Build a REAL bundle, then reshape its preferences block to the pre-#195
    // export-era shape (schemaVersion 6, slot fields stripped) and rebuild the
    // manifest over THAT parsed shape — exactly what a v6-era writer emitted.
    const { bytes } = await buildBundle();
    const raw = JSON.parse(strFromU8(unzipSync(bytes)["bundle.json"]!)) as Record<string, unknown>;
    const prefs = raw.preferences as Record<string, unknown>;
    expect(prefs.highlightSlots).toBeDefined(); // the current writer emits the fields
    const exportEraPrefs: Record<string, unknown> = { ...prefs };
    delete exportEraPrefs.highlightSlots;
    delete exportEraPrefs.defaultHighlightSlot;
    exportEraPrefs.schemaVersion = 6;
    const exportEraBundle = { ...raw, preferences: exportEraPrefs };
    const parsed = ExportBundleSchema.parse(exportEraBundle);
    const manifest = await computeManifest(parsed);

    await wipeDatabase();
    const validation = await validateBundle(
      zipFileOf({
        "bundle.json": strToU8(JSON.stringify(exportEraBundle)),
        "manifest.json": strToU8(JSON.stringify(manifest)),
      }),
    );
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    // The parse hydrated the slot fields (Pitfall 9) — the tolerance accepted
    // the export-era hash and the imported row carries the shipped slots.
    expect(validation.bundle.preferences.highlightSlots).toBeDefined();
    expect(validation.bundle.preferences.defaultHighlightSlot).toBe(0);

    const preview = await detectImportPreview(validation.bundle);
    const plan = await resolveImportPlan(
      validation.bundle,
      preview,
      ALL_SKIP,
      true,
      undefined,
      validation.assets,
    );
    await applyImport(plan);
    const { loadSettings } = await import("../../../src/persistence/settingsStore");
    const result = await loadSettings();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.settings.highlightSlots).toHaveLength(5);
    expect(result.settings.defaultHighlightSlot).toBe(0);
  });

  it("a claimed-v7 preferences block missing a slot field refuses as corrupted (tampering stays detected)", async () => {
    const { buildBundle, validateBundle } = await loadService();
    const { computeManifest } = await loadManifest();

    // A REAL export with EDITED slots, then strip highlightSlots from the raw
    // bundle.json while keeping the manifest — the claimed preferences hash
    // was computed WITH the slots, so the removal must fail verification (a
    // missing field in a current-version export is never tolerated).
    const { saveSettings } = await import("../../../src/persistence/settingsStore");
    const current = await import("../../../src/settings/defaults");
    await saveSettings({ ...current.DEFAULT_SETTINGS, highlightSlots: EDITED_SLOTS });
    const { bytes } = await buildBundle();
    const raw = JSON.parse(strFromU8(unzipSync(bytes)["bundle.json"]!)) as Record<string, unknown>;
    const prefs = { ...(raw.preferences as Record<string, unknown>) };
    delete prefs.highlightSlots;
    const tampered = { ...raw, preferences: prefs };
    const manifest = await computeManifest(ExportBundleSchema.parse(raw));

    await wipeDatabase();
    const result = await validateBundle(
      zipFileOf({
        "bundle.json": strToU8(JSON.stringify(tampered)),
        "manifest.json": strToU8(JSON.stringify(manifest)),
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal).toEqual({ kind: "corrupted", failedBlocks: ["preferences"] });
  });

  // ── Issue #196 — slots carrying custom color snapshots travel the same way ──

  it("slots with custom color snapshots + the default export and land whole on a fresh device", async () => {
    const { saveSettings } = await import("../../../src/persistence/settingsStore");
    const current = await import("../../../src/settings/defaults");
    await saveSettings({
      ...current.DEFAULT_SETTINGS,
      highlightSlots: EDITED_SLOTS_CUSTOM,
      defaultHighlightSlot: 0,
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
    expect(validation.bundle.preferences.highlightSlots).toEqual(EDITED_SLOTS_CUSTOM);

    const preview = await detectImportPreview(validation.bundle);
    const plan = await resolveImportPlan(
      validation.bundle,
      preview,
      ALL_SKIP,
      true,
      undefined,
      validation.assets,
    );
    await applyImport(plan);

    const { loadSettings } = await import("../../../src/persistence/settingsStore");
    const result = await loadSettings();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.settings.highlightSlots).toEqual(EDITED_SLOTS_CUSTOM);
  });

  it("a mixed bundle: custom slots in preferences + a custom snapshot on a highlight land together (the same v7 bundle)", async () => {
    const { saveSettings } = await import("../../../src/persistence/settingsStore");
    const { saveHighlight } = await import("../../../src/persistence/highlightsStore");
    const current = await import("../../../src/settings/defaults");
    await saveSettings({ ...current.DEFAULT_SETTINGS, highlightSlots: EDITED_SLOTS_CUSTOM });
    await seedArticle();
    await saveHighlight({
      schemaVersion: 1,
      id: "hl-custom-pref",
      articleId: "art-slots-prefs",
      revision: 1,
      position: { start: 0, end: 18 },
      quote: { prefix: "", exact: "Slots prefs body text.", suffix: "" },
      createdAt: "2026-10-29T00:00:00.000Z",
      tags: [],
      color: "default",
      customColor: "#e9c46a",
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

    const preview = await detectImportPreview(validation.bundle);
    const plan = await resolveImportPlan(
      validation.bundle,
      preview,
      ALL_SKIP,
      true,
      undefined,
      validation.assets,
    );
    await applyImport(plan);

    const { loadSettings } = await import("../../../src/persistence/settingsStore");
    const { loadAllHighlights } = await import("../../../src/persistence/highlightsStore");
    const settings = await loadSettings();
    const highlights = await loadAllHighlights();
    expect(settings.ok && settings.settings.highlightSlots[0]?.customColor).toBe("#e9c46a");
    expect(highlights.find((h) => h.id === "hl-custom-pref")?.customColor).toBe("#e9c46a");
  });
});
