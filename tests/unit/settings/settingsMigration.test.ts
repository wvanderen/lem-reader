// tests/unit/settings/settingsMigration.test.ts
// Issue #120 — unit proofs for the legacy ONE-slot custom-theme migration at
// every settings-entry seam (the D21-03 clampLegacyMeasure discipline, which
// migrateReaderSettings composes):
//
//   1. migrateReaderSettings (the pure pre-parse transform,
//      src/settings/settingsMigration.ts): a dark-seeded legacy record
//      (theme "custom" + customTheme) migrates into Custom dark; any other
//      seeding migrates into Custom light; the OTHER slot starts from its
//      matching preset; the five edited tokens ride byte-exact (case
//      preserved); the legacy customTheme key is gone. EVERY other shape —
//      new-format rows, theme "custom" WITHOUT a record, non-objects —
//      passes through UNCHANGED so the downstream ReaderSettingsSchema
//      .safeParse still fails and the seam's corrupt/null contract fires
//      (STATE-04 never-silently-coerce).
//   2. Seam proofs: settingsStore.loadSettings (Dexie row read — seam 1),
//      settingsMirror.readSettingsMirror (localStorage mirror — seam 2),
//      ExportImportService.validateBundle (import preferences block —
//      seam 3, including the manifest legacy-shape tolerance: the claimed
//      hash of a pre-#120 exporter is computed over the LEGACY block and
//      must be accepted; a genuinely mismatching hash still refuses).
//   3. Old-bundle import end-to-end: the migrated preferences land in the
//      validated bundle with both slots present.
//
// Harness notes mirror tests/unit/settings/measure-clamp.test.ts: the
// loadSettings seam mocks the Dexie db import boundary; the import seam
// lazy-loads ExportImportService against fake-indexeddb globals.
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../src/persistence/db", () => {
  const settings = {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };
  return {
    db: {
      settings,
      delete: vi.fn(),
      open: vi.fn(),
    },
  };
});

import { migrateReaderSettings } from "../../../src/settings/settingsMigration";
import { PRESET_SEEDS, seedCustomTheme } from "../../../src/settings/customTheme";
import { readSettingsMirror, SETTINGS_MIRROR_KEY } from "../../../src/settings/settingsMirror";
import { loadSettings } from "../../../src/persistence/settingsStore";
import { db } from "../../../src/persistence/db";

const settingsGet = vi.mocked(db.settings.get);

// ── Shared fixtures ──────────────────────────────────────────────────────────

/** A real pre-#120 (issue #86) reader-prefs row: theme "custom", one edited
 * token (ink), UPPERCASE hex deliberately (hydration never coerces). Key
 * order mirrors the pre-#120 ReaderSettingsSchema (the export manifest
 * determinism contract — the seam-3 fixture hashes this exact shape). */
const LEGACY_CUSTOM_RECORD = {
  schemaVersion: 4,
  font: "serif",
  size: 18,
  measure: 64,
  spacing: "comfortable",
  theme: "custom",
  customTheme: {
    baseTheme: "dark",
    tokens: { ...PRESET_SEEDS.dark, ink: "#EDE6D9" },
  },
  animatePageTurns: false,
  readingMode: "paginated",
  rate: 1,
  librarySort: "recently-added",
};

/** The same record with a sepia seeding — the "otherwise Custom light" arm. */
const LEGACY_CUSTOM_SEPIA = {
  ...LEGACY_CUSTOM_RECORD,
  customTheme: {
    baseTheme: "sepia",
    tokens: { ...PRESET_SEEDS.sepia, accent: "#6B4423" },
  },
};

beforeEach(() => {
  settingsGet.mockReset();
  window.localStorage.clear();
});

// ── 1. The pure pre-parse transform (issue #120) ─────────────────────────────

describe("migrateReaderSettings — the legacy one-slot custom theme", () => {
  it("a dark-seeded legacy record migrates into Custom dark; Custom light starts from its matching preset", () => {
    const out = migrateReaderSettings({ ...LEGACY_CUSTOM_RECORD }) as Record<string, unknown>;
    expect(out.theme).toBe("custom-dark");
    // The five edited tokens ride BYTE-EXACT (case preserved)…
    expect(out.customDarkTheme).toEqual({
      baseTheme: "dark",
      tokens: { ...PRESET_SEEDS.dark, ink: "#EDE6D9" },
    });
    // …the other slot starts from ITS matching preset…
    expect(out.customLightTheme).toEqual(seedCustomTheme("light"));
    // …and the legacy key is gone from the migrated shape.
    expect(out).not.toHaveProperty("customTheme");
  });

  it("a sepia-seeded legacy record migrates into Custom light; Custom dark starts from its matching preset", () => {
    const out = migrateReaderSettings({ ...LEGACY_CUSTOM_SEPIA }) as Record<string, unknown>;
    expect(out.theme).toBe("custom-light");
    expect(out.customLightTheme).toEqual({
      baseTheme: "sepia",
      tokens: { ...PRESET_SEEDS.sepia, accent: "#6B4423" },
    });
    expect(out.customDarkTheme).toEqual(seedCustomTheme("dark"));
    expect(out).not.toHaveProperty("customTheme");
  });

  it("a light-seeded legacy record migrates into Custom light (the 'otherwise' arm)", () => {
    const record = {
      ...LEGACY_CUSTOM_RECORD,
      customTheme: { baseTheme: "light", tokens: PRESET_SEEDS.light },
    };
    const out = migrateReaderSettings(record) as Record<string, unknown>;
    expect(out.theme).toBe("custom-light");
    expect(out.customLightTheme).toEqual({
      baseTheme: "light",
      tokens: PRESET_SEEDS.light,
    });
    expect(out.customDarkTheme).toEqual(seedCustomTheme("dark"));
  });

  it("the migrated slot keeps its ORIGINAL baseTheme (a sepia seeding resets to sepia in Custom light — deliberate preservation: the slot's tokens and reset base ride verbatim, only the slot label and the other slot's seed are new)", () => {
    const out = migrateReaderSettings({ ...LEGACY_CUSTOM_SEPIA }) as Record<string, unknown>;
    expect(out.theme).toBe("custom-light");
    expect((out.customLightTheme as { baseTheme: string }).baseTheme).toBe("sepia");
  });

  it("carries every OTHER field untouched (schemaVersion included — parse never mutates it)", () => {
    const out = migrateReaderSettings({ ...LEGACY_CUSTOM_RECORD }) as Record<string, unknown>;
    expect(out.schemaVersion).toBe(4);
    expect(out.font).toBe("serif");
    expect(out.size).toBe(18);
    expect(out.measure).toBe(64);
    expect(out.spacing).toBe("comfortable");
    expect(out.animatePageTurns).toBe(false);
    expect(out.readingMode).toBe("paginated");
    expect(out.rate).toBe(1);
    expect(out.librarySort).toBe("recently-added");
  });

  it("composes the D21-03 measure clamp (a legacy 72 lands at 70 alongside the slot migration)", () => {
    const out = migrateReaderSettings({
      ...LEGACY_CUSTOM_RECORD,
      measure: 72,
    }) as Record<string, unknown>;
    expect(out.measure).toBe(70);
    expect(out.theme).toBe("custom-dark");
  });

  it("returns a NEW record on a migration hit (input not mutated)", () => {
    const input = JSON.parse(JSON.stringify(LEGACY_CUSTOM_RECORD));
    const out = migrateReaderSettings(input);
    expect(out).not.toBe(input);
    expect(input.theme).toBe("custom"); // untouched
    expect(input.customTheme).toBeDefined();
  });

  it("already-migrated rows pass through UNCHANGED (same reference — idempotent at the seams)", () => {
    const row = {
      ...LEGACY_CUSTOM_RECORD,
      theme: "custom-dark",
      customDarkTheme: seedCustomTheme("dark"),
    };
    delete (row as Record<string, unknown>).customTheme;
    expect(migrateReaderSettings(row)).toBe(row);
  });

  it.each([
    [
      "a preset row without a saved palette",
      { ...LEGACY_CUSTOM_RECORD, theme: "sepia", customTheme: undefined },
    ],
    ["a garbage theme", { ...LEGACY_CUSTOM_RECORD, theme: "solarized" }],
  ])("%s passes through UNCHANGED (same reference)", (_label, row) => {
    expect(migrateReaderSettings(row)).toBe(row);
  });

  it.each([
    ["customTheme missing", { ...LEGACY_CUSTOM_RECORD, customTheme: undefined }],
    ["customTheme null", { ...LEGACY_CUSTOM_RECORD, customTheme: null }],
    ["customTheme a string", { ...LEGACY_CUSTOM_RECORD, customTheme: "dark" }],
  ])(
    "theme 'custom' with %s passes through UNCHANGED — downstream parse still fails → the honest corrupt routing",
    (_label, row) => {
      expect(migrateReaderSettings(row)).toBe(row);
      expect(migrateReaderSettings(row)).toHaveProperty("theme", "custom");
    },
  );

  it.each([
    ["a bare number", 42],
    ["null", null],
    ["a string", "custom"],
  ])("returns non-object input UNCHANGED (%s)", (_label, input) => {
    expect(migrateReaderSettings(input)).toBe(input);
  });
});

// The migrated output must parse through the CURRENT schema (compile + runtime
// proof that the seam output is a valid ReaderSettings in both arms).
describe("the migrated record parses through ReaderSettingsSchema", () => {
  it("the dark arm parses with both slots present", async () => {
    const { ReaderSettingsSchema } = await import("../../../src/content/schema");
    const parsed = ReaderSettingsSchema.safeParse(
      migrateReaderSettings({ ...LEGACY_CUSTOM_RECORD }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.theme).toBe("custom-dark");
      expect(parsed.data.customDarkTheme?.tokens.ink).toBe("#EDE6D9");
      expect(parsed.data.customLightTheme).toEqual(seedCustomTheme("light"));
    }
  });

  it("the sepia arm parses with both slots present", async () => {
    const { ReaderSettingsSchema } = await import("../../../src/content/schema");
    const parsed = ReaderSettingsSchema.safeParse(
      migrateReaderSettings({ ...LEGACY_CUSTOM_SEPIA }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.theme).toBe("custom-light");
      expect(parsed.data.customLightTheme?.tokens.accent).toBe("#6B4423");
      expect(parsed.data.customDarkTheme).toEqual(seedCustomTheme("dark"));
    }
  });

  it("an unmigratable row (theme 'custom', no record) still fails parse — never coerced", async () => {
    const { ReaderSettingsSchema } = await import("../../../src/content/schema");
    const raw = { ...LEGACY_CUSTOM_RECORD, customTheme: undefined };
    expect(ReaderSettingsSchema.safeParse(migrateReaderSettings(raw)).success).toBe(false);
  });
});

// ── 2a. Seam 1 — settingsStore.loadSettings (Dexie row read) ─────────────────

describe("loadSettings migrates the legacy custom theme calmly (issue #120 seam 1)", () => {
  it("a stored pre-#120 row loads ok with both slots (never WipeConfirm), tokens byte-exact", async () => {
    settingsGet.mockResolvedValue({ key: "reader-prefs", value: { ...LEGACY_CUSTOM_RECORD } });
    const result = await loadSettings();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settings.theme).toBe("custom-dark");
      expect(result.settings.customDarkTheme?.tokens.ink).toBe("#EDE6D9");
      expect(result.settings.customLightTheme).toEqual(seedCustomTheme("light"));
      expect(result.settings.customDarkTheme?.baseTheme).toBe("dark");
    }
  });
});

// ── 2b. Seam 2 — settingsMirror.readSettingsMirror (localStorage) ────────────

describe("readSettingsMirror migrates the legacy custom theme calmly (issue #120 seam 2)", () => {
  it("a painted pre-#120 mirror returns parsed two-slot settings (not null)", () => {
    window.localStorage.setItem(SETTINGS_MIRROR_KEY, JSON.stringify(LEGACY_CUSTOM_SEPIA));
    const settings = readSettingsMirror();
    expect(settings).not.toBeNull();
    expect(settings?.theme).toBe("custom-light");
    expect(settings?.customLightTheme?.tokens.accent).toBe("#6B4423");
    expect(settings?.customDarkTheme).toEqual(seedCustomTheme("dark"));
  });

  it("an unmigratable mirror (theme 'custom', no record) still returns null — null-on-doubt holds", () => {
    window.localStorage.setItem(
      SETTINGS_MIRROR_KEY,
      JSON.stringify({ ...LEGACY_CUSTOM_RECORD, customTheme: undefined }),
    );
    expect(readSettingsMirror()).toBeNull();
  });
});

// ── 2c. Seam 3 — the import preferences block (validateBundle) ───────────────
//
// A pre-#120 exported bundle whose preferences block carries theme "custom"
// must re-import calmly (ok, migrated two-slot shape) — NOT refuse the whole
// bundle. The claimed manifest of such a bundle hashes the preferences block
// WITH the legacy shape (it was in-union at export time), so the seam also
// proves the manifest legacy-shape tolerance. A genuinely mismatching hash
// still refuses (corrupted).

import fakeIndexedDB, { IDBKeyRange } from "fake-indexeddb";
import { Dexie } from "dexie";
import { zipSync } from "fflate";
import { computeManifest, sha256Hex } from "../../../src/portability/manifest";
import type { ExportBundle } from "../../../src/portability/bundle";
import type { CanonicalArticle } from "../../../src/content/schema";
import { ArticleSchema } from "../../../src/content/schema";

Dexie.dependencies.indexedDB = fakeIndexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;
(globalThis as { indexedDB?: typeof fakeIndexedDB }).indexedDB = fakeIndexedDB;
(globalThis as { IDBKeyRange?: typeof IDBKeyRange }).IDBKeyRange = IDBKeyRange;

async function loadService() {
  return await import("../../../src/portability/ExportImportService");
}

function sampleArticle(): CanonicalArticle {
  return ArticleSchema.parse({
    id: "example-article",
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: "https://example.com/article",
      title: "Example article",
      author: "An Author",
      retrievedAt: "2026-08-01T00:00:00.000Z",
      originalHtmlHash: "sha256:" + "a".repeat(64),
    },
    blocks: [{ kind: "paragraph", content: [{ text: "Example paragraph text.", marks: [] }] }],
    footnotes: [],
  });
}

/** The export-era (pre-#120) parsed preferences view — the exact string an
 * old exporter's Zod parse emitted and its manifest hashed: OLD schema key
 * order (customTheme directly after theme), defaults filled, absent
 * optionals dropped by JSON.stringify. */
async function legacyPreferencesHash(record: typeof LEGACY_CUSTOM_RECORD): Promise<string> {
  const view = {
    schemaVersion: record.schemaVersion,
    font: record.font,
    size: record.size,
    measure: record.measure,
    spacing: record.spacing,
    theme: record.theme,
    customTheme: record.customTheme,
    animatePageTurns: record.animatePageTurns,
    readingMode: record.readingMode,
    voice: (record as { voice?: string }).voice,
    rate: record.rate,
    librarySort: record.librarySort,
  };
  return sha256Hex(new TextEncoder().encode(JSON.stringify(view)));
}

/** A pre-#120 exported bundle: the envelope's preferences block carries the
 * legacy one-slot custom shape, and the claimed manifest honestly hashes
 * that LEGACY block (exactly what an exporter running the pre-#120 schema
 * produced). */
async function legacyCustomBundle(claimedPreferencesHash?: string, record = LEGACY_CUSTOM_RECORD) {
  const hash = claimedPreferencesHash ?? (await legacyPreferencesHash(record));
  const rawBundle = {
    schemaVersion: 5 as const,
    exportedAt: "2026-09-01T00:00:00.000Z",
    appVersion: "test",
    articles: [sampleArticle()],
    locations: [],
    highlights: [],
    notes: [],
    preferences: { ...record },
    fixtureIds: [],
    books: [],
    assets: [],
    readingSessions: [],
  };
  // The current-writer manifest over the MIGRATED preferences — every block
  // hashes as today, then the claimed preferences hash is swapped for the
  // export-era (legacy-shape) hash below.
  const migrated = migrateReaderSettings({ ...record });
  const parsed = await import("../../../src/portability/bundle").then((m) =>
    m.ExportBundleSchema.parse({ ...rawBundle, preferences: migrated }),
  );
  const manifest = await computeManifest(parsed);
  const finalManifest = {
    ...manifest,
    blocks: {
      ...manifest.blocks,
      preferences: hash,
    },
  };
  return new File(
    [
      zipSync({
        "bundle.json": new TextEncoder().encode(JSON.stringify(rawBundle)),
        "manifest.json": new TextEncoder().encode(JSON.stringify(finalManifest)),
      }),
    ],
    "legacy-custom.zip",
  );
}

describe("validateBundle migrates the legacy custom theme calmly (issue #120 seam 3)", () => {
  it("a pre-#120 bundle whose preferences carry theme 'custom' imports ok with both slots (manifest legacy hash accepted)", async () => {
    const { validateBundle } = await loadService();
    const file = await legacyCustomBundle();
    const result = await validateBundle(file);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const prefs: ExportBundle["preferences"] = result.bundle.preferences;
      expect(prefs.theme).toBe("custom-dark");
      expect(prefs.customDarkTheme?.tokens.ink).toBe("#EDE6D9");
      expect(prefs.customLightTheme).toEqual(seedCustomTheme("light"));
      // The legacy key never reaches the parsed bundle.
      expect(prefs).not.toHaveProperty("customTheme");
    }
  });

  it("a pre-#120 bundle with a TAMPERED claimed preferences hash (neither current nor legacy) still refuses corrupted", async () => {
    const { validateBundle } = await loadService();
    const file = await legacyCustomBundle("0".repeat(64));
    const result = await validateBundle(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal).toEqual({
        kind: "corrupted",
        failedBlocks: ["preferences"],
      });
    }
  });

  it("a garbage theme ('custom' with no record) in the preferences block still refuses invalid — never coerced", async () => {
    const { validateBundle } = await loadService();
    const rawBundle = {
      schemaVersion: 5 as const,
      exportedAt: "2026-09-01T00:00:00.000Z",
      appVersion: "test",
      articles: [sampleArticle()],
      locations: [],
      highlights: [],
      notes: [],
      preferences: { ...LEGACY_CUSTOM_RECORD, customTheme: undefined },
      fixtureIds: [],
      books: [],
      assets: [],
      readingSessions: [],
    };
    const file = new File(
      [
        zipSync({
          "bundle.json": new TextEncoder().encode(JSON.stringify(rawBundle)),
          "manifest.json": new TextEncoder().encode("{}"),
        }),
      ],
      "garbage.zip",
    );
    const result = await validateBundle(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal.kind).toBe("invalid");
    }
  });
});

describe("inactive legacy custom palettes", () => {
  for (const theme of ["sepia", "light", "dark"]) {
    for (const baseTheme of ["sepia", "light", "dark"] as const) {
      const record = {
        ...LEGACY_CUSTOM_RECORD,
        theme,
        customTheme: {
          baseTheme,
          tokens: {
            surface: "#123456",
            surfaceRaised: "#234567",
            ink: "#ABCDEF",
            accent: "#456789",
            hairline: "#56789A",
          },
        },
      };
      const slotKey = baseTheme === "dark" ? "customDarkTheme" : "customLightTheme";
      const otherKey = baseTheme === "dark" ? "customLightTheme" : "customDarkTheme";
      const otherBase = baseTheme === "dark" ? "light" : "dark";

      it(`preserves ${baseTheme}-seeded edits with ${theme} active through store and mirror`, async () => {
        settingsGet.mockResolvedValue({ key: "reader-prefs", value: record });
        const loaded = await loadSettings();
        expect(loaded.ok).toBe(true);
        if (!loaded.ok) throw new Error("Legacy settings failed to load");
        expect(loaded.settings.theme).toBe(theme);
        expect(loaded.settings[slotKey]).toEqual(record.customTheme);
        expect(loaded.settings[otherKey]).toEqual(seedCustomTheme(otherBase));
        window.localStorage.setItem(SETTINGS_MIRROR_KEY, JSON.stringify(record));
        expect(readSettingsMirror()).toEqual(loaded.settings);
      });

      it(`imports ${baseTheme}-seeded edits with ${theme} active and rejects tampering`, async () => {
        const { validateBundle } = await loadService();
        const result = await validateBundle(await legacyCustomBundle(undefined, record));
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error("Legacy bundle failed to import");
        expect(result.bundle.preferences.theme).toBe(theme);
        expect(result.bundle.preferences[slotKey]).toEqual(record.customTheme);
        expect(result.bundle.preferences[otherKey]).toEqual(seedCustomTheme(otherBase));
        const tampered = await validateBundle(await legacyCustomBundle("0".repeat(64), record));
        expect(tampered).toMatchObject({
          ok: false,
          refusal: { kind: "corrupted", failedBlocks: ["preferences"] },
        });
      });
    }
  }
});
