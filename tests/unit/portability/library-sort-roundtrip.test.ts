// tests/unit/portability/library-sort-roundtrip.test.ts
// Issue #115 — the library sort preference travels in the versioned bundle:
// "The sort choice persists and travels in a versioned bundle."
//
// The preferences block is ALWAYS present (D9-12) and composes
// ReaderSettingsSchema — so the persisted librarySort rides every export,
// and the reader's "apply imported reading preferences?" choice (D9-12)
// lands it in the receiving device's reader-prefs row. Two pins:
//   1. Full pipeline (the real seams, no mocks — the added-at-roundtrip
//      harness): saveSettings("title") → buildBundle → validateBundle →
//      resolveImportPlan(applyPreferences: true) → applyImport →
//      loadSettings reads librarySort "title" back on the fresh device.
//   2. Bundle-side legacy hydration: a pre-#115 (settings v3) preferences
//      block inside an envelope parses with librarySort hydrated to the
//      schema default "recently-added" — old bundles import unchanged
//      (Pitfall 9, the readingMode/voice/rate mechanism).
//
// Harness mirrors tests/unit/portability/added-at-roundtrip.test.ts:
// fake-indexeddb via Dexie.dependencies at module top-level,
// wipeDatabase beforeEach, lazy module imports.
import { beforeEach, describe, expect, it } from "vitest";
import fakeIndexedDB, { IDBKeyRange } from "fake-indexeddb";
import { Dexie } from "dexie";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";
import { ExportBundleSchema } from "../../../src/portability/bundle";

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
async function loadSettingsStore() {
  return await import("../../../src/persistence/settingsStore");
}
async function loadConflicts() {
  return await import("../../../src/portability/conflicts");
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

describe("librarySort travels in the versioned bundle (issue #115)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("export → import with applyPreferences lands the chosen sort on the fresh device", async () => {
    // ── Device A: the reader picked Title as their library sort. ──
    const { saveSettings, loadSettings } = await loadSettingsStore();
    const { buildBundle } = await loadService();
    await saveSettings({ ...DEFAULT_SETTINGS, librarySort: "title" });

    // ── Export (the stored row rides the always-present preferences block). ──
    const { bytes } = await buildBundle();

    // ── Device B: a fresh device imports and APPLIES the preferences. ──
    await wipeDatabase();

    const { validateBundle, applyImport } = await loadService();
    const { detectImportPreview, resolveImportPlan } = await loadConflicts();

    const validation = await validateBundle(
      new File([new Uint8Array(bytes)], "lem-reader-bundle-v1.zip", { type: "application/zip" }),
    );
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    // The parsed bundle carries the choice with its v6 write version
    // (issue #120 bumped the canonical write version 4 → 5; issue #163
    // bumped 5 → 6 — the pin rides DEFAULT_SETTINGS by construction).
    expect(validation.bundle.preferences.librarySort).toBe("title");
    expect(validation.bundle.preferences.schemaVersion).toBe(6);

    const preview = await detectImportPreview(validation.bundle);
    const plan = await resolveImportPlan(
      validation.bundle,
      preview,
      ALL_SKIP,
      true, // applyPreferences — the reader accepted the imported prefs
      undefined,
      validation.assets,
    );
    await applyImport(plan);

    // Read back through the Zod-at-boundary seam: the choice landed.
    const result = await loadSettings();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.settings.librarySort).toBe("title");
    expect(result.settings.schemaVersion).toBe(6); // the #163 canonical write version
  });

  it("the preferences block is ALWAYS exported — even on a settings-read failure (D9-12)", async () => {
    const { buildBundle } = await loadService();
    const { bytes } = await buildBundle();
    const { validateBundle } = await loadService();
    const validation = await validateBundle(
      new File([new Uint8Array(bytes)], "lem-reader-bundle-v1.zip", { type: "application/zip" }),
    );
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.bundle.preferences.librarySort).toBe("recently-added");
  });
});

describe("a pre-#115 (settings v3) preferences block hydrates at the bundle boundary (issue #115, Pitfall 9)", () => {
  it("a v3 preferences row without librarySort parses with the 'recently-added' default", () => {
    // The exact shape a pre-#115 build wrote: settings schemaVersion 3, no
    // librarySort key. The envelope parse must not refuse it and must not
    // mutate its version — the hydration is value-shape only.
    const legacyPreferences = {
      schemaVersion: 3,
      font: "serif",
      size: 18,
      measure: 64,
      spacing: "comfortable",
      theme: "sepia",
      readingMode: "paginated",
      rate: 1,
    };
    const bundle = ExportBundleSchema.parse({
      schemaVersion: 5,
      exportedAt: "2026-09-10T00:00:00.000Z",
      appVersion: "test",
      articles: [],
      locations: [],
      highlights: [],
      notes: [],
      preferences: legacyPreferences,
      fixtureIds: [],
      books: [],
      assets: [],
      readingSessions: [],
    });
    expect(bundle.preferences.schemaVersion).toBe(3); // NOT mutated by parse
    expect(bundle.preferences.librarySort).toBe("recently-added");
  });
});
