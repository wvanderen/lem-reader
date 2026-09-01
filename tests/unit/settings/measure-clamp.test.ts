// tests/unit/settings/measure-clamp.test.ts
// Phase 21 (POLISH-09, D21-01/D21-02/D21-03): unit proofs for the truthful
// reading-measure range and the bounded legacy-value clamp at every
// settings-entry seam.
//
//   1. clampLegacyMeasure (the pure map, src/settings/legacyMeasure.ts):
//      the enumerated legacy maximum 72 maps to 64 with every other field
//      identical; EVERY other shape — 71, a string, null, a missing measure
//      key, a non-object — passes through UNCHANGED so the downstream
//      ReaderSettingsSchema.safeParse still fails and the seam's
//      corrupt/null contract fires (STATE-04 never-silently-coerce; the map
//      contains exactly one entry — T-21-01/T-21-02).
//   2. Seam proofs: settingsStore.loadSettings (Dexie row read — D21-03
//      seam 1), settingsMirror.readSettingsMirror (localStorage mirror —
//      seam 2), ExportImportService.validateBundle (import preferences
//      block — seam 3, including the manifest legacy-value tolerance).
//   3. Paint-hint sync check: the index.html inline LEGACY_MEASURE copy
//      matches the module map (the mirror.test.ts marker-comment
//      discipline) so first paint matches hydration — no 72ch
//      flash-then-clamp (D21-03 seam 4).
//
// Harness notes: the loadSettings seam mocks the Dexie db import boundary
// (the storageFallback.test.ts convention); the import seam lazy-loads
// ExportImportService against fake-indexeddb globals (the
// validate-bundle.test.ts convention — the module imports db.ts at load
// time).
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

import {
  clampLegacyMeasure,
  LEGACY_MEASURE,
} from "../../../src/settings/legacyMeasure";
import {
  readSettingsMirror,
  SETTINGS_MIRROR_KEY,
} from "../../../src/settings/settingsMirror";
import { loadSettings } from "../../../src/persistence/settingsStore";
import { db } from "../../../src/persistence/db";
import type { ReaderSettings } from "../../../src/content/schema";

const settingsGet = vi.mocked(db.settings.get);

// ── Shared fixtures ──────────────────────────────────────────────────────────

/** A fully valid record at the enumerated legacy maximum (the v2.1-era
 * far-right slider value a real reader could have persisted). Key order
 * mirrors ReaderSettingsSchema so JSON.stringify round-trips match the
 * export manifest determinism contract. */
const LEGACY_MAX_RECORD = {
  schemaVersion: 2,
  font: "sans",
  size: 22,
  measure: 72,
  spacing: "spacious",
  theme: "dark",
  readingMode: "scrolling",
};

/** The same record after the clamp — ONLY measure changes (D21-03). */
const CLAMPED_RECORD = { ...LEGACY_MAX_RECORD, measure: 64 };

beforeEach(() => {
  settingsGet.mockReset();
  window.localStorage.clear();
});

// ── 1. The pure bounded map (D21-03 / T-21-01) ───────────────────────────────

describe("clampLegacyMeasure — the bounded legacy-value map", () => {
  it("maps the enumerated legacy maximum 72 → 64 preserving every other field", () => {
    const out = clampLegacyMeasure(LEGACY_MAX_RECORD) as typeof LEGACY_MAX_RECORD;
    expect(out).toEqual(CLAMPED_RECORD);
    expect(out.measure).toBe(64);
    expect(out.font).toBe("sans");
    expect(out.size).toBe(22);
    expect(out.spacing).toBe("spacious");
    expect(out.theme).toBe("dark");
    expect(out.readingMode).toBe("scrolling");
    expect(out.schemaVersion).toBe(2);
  });

  it("returns a NEW record on a map hit (input not mutated)", () => {
    const input = { ...LEGACY_MAX_RECORD };
    const out = clampLegacyMeasure(input);
    expect(out).not.toBe(input);
    expect(input.measure).toBe(72); // untouched
  });

  it.each([
    ["out-of-range neighbor 71 (garbage — never coerced)", { ...LEGACY_MAX_RECORD, measure: 71 }],
    ["measure as string", { ...LEGACY_MAX_RECORD, measure: "64" }],
    ["measure null", { ...LEGACY_MAX_RECORD, measure: null }],
    ["record without a measure key", { schemaVersion: 2, font: "sans", size: 22 }],
  ])(
    "returns the input UNCHANGED for %s (downstream safeParse still fails → corrupt/null per seam contract)",
    (_label, input) => {
      expect(clampLegacyMeasure(input)).toBe(input);
    },
  );

  it.each([
    ["a bare number", 72],
    ["null", null],
    ["a string", "72"],
  ])("returns non-object input UNCHANGED (%s)", (_label, input) => {
    expect(clampLegacyMeasure(input)).toBe(input);
  });

  it("LEGACY_MEASURE contains exactly one entry — 72 → 64 (bounded map, T-21-02)", () => {
    expect(Object.keys(LEGACY_MEASURE)).toEqual(["72"]);
    expect(LEGACY_MEASURE[72]).toBe(64);
  });
});

// ── 2a. Seam 1 — settingsStore.loadSettings (Dexie row read) ─────────────────

describe("loadSettings clamps the legacy maximum calmly (D21-03 seam 1)", () => {
  it("a stored-72 Dexie row loads ok at measure 64 with every other field intact (never WipeConfirm)", async () => {
    settingsGet.mockResolvedValue({ key: "reader-prefs", value: { ...LEGACY_MAX_RECORD } });
    const result = await loadSettings();
    expect(result).toEqual({ ok: true, settings: CLAMPED_RECORD });
  });

  it.each([
    ["71 (adjacent garbage)", 71],
    ["a string measure", "64"],
    ["null measure", null],
  ])(
    "a garbage-measure Dexie row (%s) still returns { ok: false, reason: 'corrupt' } — STATE-04 never-silently-coerce",
    async (_label, measure) => {
      settingsGet.mockResolvedValue({
        key: "reader-prefs",
        value: { ...LEGACY_MAX_RECORD, measure },
      });
      const result = await loadSettings();
      expect(result).toEqual({ ok: false, reason: "corrupt" });
    },
  );
});

// ── 2b. Seam 2 — settingsMirror.readSettingsMirror (localStorage) ────────────

describe("readSettingsMirror clamps the legacy maximum calmly (D21-03 seam 2)", () => {
  it("a painted-72 mirror returns parsed settings at 64 (not null), every other field intact", () => {
    window.localStorage.setItem(
      SETTINGS_MIRROR_KEY,
      JSON.stringify(LEGACY_MAX_RECORD),
    );
    expect(readSettingsMirror()).toEqual(CLAMPED_RECORD);
  });

  it.each([
    ["71 (adjacent garbage)", 71],
    ["a string measure", "64"],
  ])(
    "a garbage-measure mirror (%s) still returns null — null-on-doubt holds",
    (_label, measure) => {
      window.localStorage.setItem(
        SETTINGS_MIRROR_KEY,
        JSON.stringify({ ...LEGACY_MAX_RECORD, measure }),
      );
      expect(readSettingsMirror()).toBeNull();
    },
  );
});

// ── 2c. Seam 3 — the import preferences block (validateBundle) ───────────────
//
// A v2.1-era exported bundle whose preferences block carries the legacy
// maximum must re-import calmly (ok, measure 64) — NOT refuse the whole
// bundle. The claimed manifest of such a bundle hashes the preferences
// block WITH the legacy value (it was in-union at export time), so the
// seam also proves the manifest legacy-value tolerance: the recomputed
// (clamped) hash differs, and the v2.1-era hash is accepted as the
// preferences-block match. Garbage still refuses (invalid); a genuinely
// mismatching manifest still refuses (corrupted).

import fakeIndexedDB, { IDBKeyRange } from "fake-indexeddb";
import { Dexie } from "dexie";
import { zipSync } from "fflate";
import { ExportBundleSchema } from "../../../src/portability/bundle";
import { computeManifest } from "../../../src/portability/manifest";
import type { Manifest, } from "../../../src/portability/manifest";
import type { ExportBundle } from "../../../src/portability/bundle";
import type { CanonicalArticle } from "../../../src/content/schema";

// Dexie 4 captures indexedDB + IDBKeyRange at module-load time (the
// validate-bundle.test.ts convention — the service imports db.ts eagerly).
Dexie.dependencies.indexedDB = fakeIndexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;
(globalThis as { indexedDB?: typeof fakeIndexedDB }).indexedDB = fakeIndexedDB;
(globalThis as { IDBKeyRange?: typeof IDBKeyRange }).IDBKeyRange = IDBKeyRange;

async function loadService() {
  return await import("../../../src/portability/ExportImportService");
}

function sampleArticle(): CanonicalArticle {
  return {
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
    blocks: [
      { kind: "paragraph", content: [{ text: "Example paragraph text.", marks: [] }] },
    ],
    footnotes: [],
  };
}

/** The v2.1-era equivalent of a validRawBundle: an envelope whose
 * preferences block carries the legacy maximum, with the claimed manifest
 * honestly computed over the LEGACY block (exactly what an exporter running
 * the pre-D21-01 schema produced). */
async function legacyBundle(manifestPreferencesOverride?: Manifest["blocks"]) {
  const rawBundle = {
    schemaVersion: 4 as const,
    exportedAt: "2026-08-30T00:00:00.000Z",
    appVersion: "test",
    articles: [sampleArticle()],
    locations: [],
    highlights: [],
    notes: [],
    preferences: { ...LEGACY_MAX_RECORD },
    fixtureIds: [],
    books: [],
    assets: [],
  };
  // What the CURRENT writer would have produced (clamped preferences) —
  // used to build the full manifest, then the preferences hash is swapped
  // for the v2.1-era (legacy-value) hash below.
  const clampedForParse = { ...rawBundle, preferences: { ...CLAMPED_RECORD } };
  const parsed = ExportBundleSchema.parse(clampedForParse);
  const manifest = await computeManifest(parsed);
  const legacyManifest: Manifest = {
    ...manifest,
    blocks: {
      ...manifest.blocks,
      // Hash of the block WITH measure 72 (schema key order — the
      // determinism contract; the exporter's own parse emitted 72).
      preferences: await computeManifest({
        ...parsed,
        preferences: { ...parsed.preferences, measure: 72 },
      } as unknown as ExportBundle).then((m) => m.blocks.preferences),
    },
  };
  const finalManifest: Manifest =
    manifestPreferencesOverride === undefined
      ? legacyManifest
      : { ...legacyManifest, blocks: manifestPreferencesOverride };
  const file = new File(
    [
      zipSync({
        "bundle.json": new TextEncoder().encode(JSON.stringify(rawBundle)),
        "manifest.json": new TextEncoder().encode(JSON.stringify(finalManifest)),
      }),
    ],
    "legacy.zip",
  );
  return { file, manifest };
}

describe("validateBundle clamps the legacy maximum calmly (D21-03 seam 3)", () => {
  it("a v2.1-era bundle whose preferences carry measure 72 imports ok at 64 (manifest legacy hash accepted)", async () => {
    const { validateBundle } = await loadService();
    const { file } = await legacyBundle();
    const result = await validateBundle(file);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bundle.preferences.measure).toBe(64);
      expect(result.bundle.preferences.font).toBe("sans");
      expect(result.bundle.preferences.theme).toBe("dark");
    }
  });

  it("a garbage measure (71) in the preferences block still refuses invalid — never coerced", async () => {
    const { validateBundle } = await loadService();
    const rawBundle = {
      schemaVersion: 4 as const,
      exportedAt: "2026-08-30T00:00:00.000Z",
      appVersion: "test",
      articles: [sampleArticle()],
      locations: [],
      highlights: [],
      notes: [],
      preferences: { ...LEGACY_MAX_RECORD, measure: 71 },
      fixtureIds: [],
      books: [],
      assets: [],
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

  it("a legacy bundle with a TAMPERED claimed preferences hash (neither clamped nor legacy) still refuses corrupted", async () => {
    const { validateBundle } = await loadService();
    const { manifest } = await legacyBundle();
    const { file } = await legacyBundle({
      ...manifest.blocks,
      preferences: "0".repeat(64),
    });
    const result = await validateBundle(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal).toEqual({
        kind: "corrupted",
        failedBlocks: ["preferences"],
      });
    }
  });
});

// ── 3. Paint-hint sync check (D21-03 seam 4) ─────────────────────────────────
//
// The index.html pre-React script cannot import modules, so it carries an
// INLINE COPY of the legacy map between marker comments (the FONT_STACKS /
// SPACING_PRESETS discipline documented in mirror.test.ts). These checks
// pin the copy to the module map so a legacyMeasure.ts change that forgets
// index.html fails here.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const INDEX_HTML = readFileSync(resolve(process.cwd(), "index.html"), "utf-8");

function extractMarked(name: string): string {
  const re = new RegExp(
    `//\\s*tokens:${name}:start([\\s\\S]*?)//\\s*tokens:${name}:end`,
  );
  const match = re.exec(INDEX_HTML);
  if (!match) {
    throw new Error(`marker tokens:${name}:start/end not found in index.html`);
  }
  return match[1] ?? "";
}

describe("index.html paint-hint legacy map sync check", () => {
  it("the inline LEGACY_MEASURE copy equals the module map (first paint matches hydration — no 72ch flash)", () => {
    const src = extractMarked("LEGACY_MEASURE");
    expect(src).toContain("72");
    expect(src).toContain("64");
    // Evaluate the `var LEGACY_MEASURE = { ... };` block (repo-authored
    // literal, not user input — the mirror.test.ts eval discipline).
    const stripped = src
      .replace(/^\s*var\s+LEGACY_MEASURE\s*=/, "")
      .replace(/;\s*$/, "")
      .trim();
    const inline = new Function(`return (${stripped});`)() as Record<number, number>;
    expect(inline).toEqual({ ...LEGACY_MEASURE });
    expect(Object.keys(inline)).toEqual(["72"]);
  });

  it("the --measure write routes through the legacy map (never paints the dead 72ch width)", () => {
    const measureBranch = INDEX_HTML.slice(
      INDEX_HTML.indexOf('s.measure === "number"'),
    );
    expect(measureBranch).toContain("LEGACY_MEASURE");
  });
});

// ── Type-level sanity: the CLAMPED record satisfies the schema ───────────────

describe("the clamped record parses through ReaderSettingsSchema", () => {
  it("CLAMPED_RECORD is a valid ReaderSettings (compile + runtime)", async () => {
    const { ReaderSettingsSchema } = await import("../../../src/content/schema");
    const parsed = ReaderSettingsSchema.parse(CLAMPED_RECORD) as ReaderSettings;
    expect(parsed.measure).toBe(64);
  });
});
