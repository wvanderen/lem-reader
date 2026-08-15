// tests/unit/portability/export-service.test.ts
// Plan 09-04 Task 1 (TDD RED → GREEN) — the PORT-01 export truth:
//   - buildBundleBytes returns bytes that unzip to EXACTLY the entries
//     bundle.json + manifest.json (D9-01)
//   - the two seeded Dexie articles serialize; the bundled FIXTURE article
//     never does (ARCHITECTURE L615 — fixtures excluded by construction)
//   - the seeded article's provenance.sourceUrl rides verbatim (SC#1
//     per-article source URLs)
//   - fixtureIds lists the bundled fixture the highlight/note reference
//   - preferences are ALWAYS present: the stored row, or DEFAULT_SETTINGS
//     when none exists (D9-12)
//   - NO key matching /page/i anywhere in bundle.json (SC#4 data
//     minimization — page numbers/page-derived data never serialize)
//   - manifest.json's blocks.articles equals the recomputed computeManifest
//     over the Zod-parsed bundle (determinism self-consistency, Pitfall 2)
//
// Harness mirrors tests/unit/portability/conflicts.test.ts (which mirrors
// tests/unit/ingestion-tags.test.ts): fake-indexeddb via Dexie.dependencies
// at module top-level, wipeDatabase beforeEach, lazy module imports so the
// service's module body sees a populated Dexie.dependencies. The test file
// may import unzipSync/strFromU8 from fflate for side-of-truth extraction —
// the four-name src allowlist (zipSync, unzipSync, strToU8, strFromU8) does
// not constrain tests.
import { beforeEach, describe, expect, it } from "vitest";
import {
  ArticleSchema,
  HighlightRecordSchema,
  LocationRecordSchema,
  NoteRecordSchema,
  ReaderSettingsSchema,
} from "../../../src/content/schema";
import type {
  CanonicalArticle,
  HighlightRecord,
  LocationRecord,
  NoteRecord,
  ReaderSettings,
} from "../../../src/content/schema";
import {
  graphemeClusters,
  normalizeText,
} from "../../../src/content/normalizeText";
import { fixtures } from "../../../src/fixtures";
import { ExportBundleSchema } from "../../../src/portability/bundle";
import { computeManifest } from "../../../src/portability/manifest";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";
import type { z } from "zod";
import { unzipSync, strFromU8 } from "fflate";
import fakeIndexedDB, { IDBKeyRange } from "fake-indexeddb";
import { Dexie } from "dexie";

// Dexie 4 captures `indexedDB` + `IDBKeyRange` on `Dexie.dependencies` at
// dexie-module-load time. Install BOTH onto `Dexie.dependencies` (the
// Dexie-internal read path) AND `globalThis` (the direct-read path Dexie
// uses for deleteDatabase) at this module's top-level — the documented
// Dexie + Node test pattern (mirrors tests/unit/ingestion-tags.test.ts).
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

// Lazy imports — the modules under test are imported AFTER the fake-indexeddb
// install so their module-body top-level sees a populated Dexie.dependencies.
async function loadService() {
  return await import("../../../src/portability/ExportImportService");
}
async function loadDb() {
  return await import("../../../src/persistence/db");
}

// ── Sample builders (schema-validated at construction) ──────────────────────

function samplePrefs(overrides: Partial<ReaderSettings> = {}): ReaderSettings {
  return ReaderSettingsSchema.parse({
    schemaVersion: 2,
    font: "serif",
    size: 18,
    measure: 58,
    spacing: "comfortable",
    theme: "sepia",
    readingMode: "paginated",
    ...overrides,
  });
}

type ArticleInput = z.input<typeof ArticleSchema>;

function sampleArticle(overrides: Partial<ArticleInput> = {}): CanonicalArticle {
  return ArticleSchema.parse({
    id: "art-sample",
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: "https://example.com/article",
      title: "Sample Article",
      author: "An Author",
      retrievedAt: "2026-08-11T00:00:00.000Z",
      originalHtmlHash: "sha256:" + "a".repeat(64),
    },
    blocks: [
      {
        kind: "paragraph",
        content: [{ text: "Alpha beta gamma delta epsilon zeta eta.", marks: [] }],
      },
    ],
    footnotes: [],
    ...overrides,
  });
}

type HighlightInput = z.input<typeof HighlightRecordSchema>;

function sampleHighlight(overrides: Partial<HighlightInput> = {}): HighlightRecord {
  return HighlightRecordSchema.parse({
    schemaVersion: 1,
    id: "hl-sample",
    articleId: "art-sample",
    revision: 1,
    position: { start: 0, end: 10 },
    quote: { prefix: "", exact: "passage", suffix: "" },
    createdAt: "2026-08-15T00:00:00.000Z",
    ...overrides,
  });
}

type NoteInput = z.input<typeof NoteRecordSchema>;

function sampleNote(overrides: Partial<NoteInput> = {}): NoteRecord {
  return NoteRecordSchema.parse({
    schemaVersion: 1,
    id: "note-sample",
    highlightId: "hl-sample",
    text: "a reader note",
    updatedAt: "2026-08-15T00:00:00.000Z",
    ...overrides,
  });
}

type LocationInput = z.input<typeof LocationRecordSchema>;

function sampleLocation(overrides: Partial<LocationInput> = {}): LocationRecord {
  return LocationRecordSchema.parse({
    schemaVersion: 1,
    articleId: "art-sample",
    revision: 1,
    graphemeOffset: 3,
    savedAt: "2026-08-15T00:00:00.000Z",
    ...overrides,
  });
}

/** A REAL passage of a bundled fixture, with its true grapheme span — the
 * highlight seed keys to a real fixture id + real fixture text so resolution
 * semantics are exercised end-to-end (mirrors conflicts.test.ts). */
function fixturePassage(article: CanonicalArticle): {
  text: string;
  start: number;
  end: number;
} {
  const clusters = graphemeClusters(normalizeText(article), article.lang);
  const start = 10;
  const end = Math.min(40, clusters.length);
  return { text: clusters.slice(start, end).join(""), start, end };
}

/** The full export seed surface: 2 Dexie articles (one carrying
 * provenance.sourceUrl), 1 highlight keyed to a REAL bundled fixture id,
 * 1 note on that highlight, 1 location on the first article, and a stored
 * reader-prefs row. Returns everything the assertions need. */
async function seedExportSurface(withSettings: boolean) {
  const { db } = await loadDb();
  const fixture = fixtures[0]!;
  const passage = fixturePassage(fixture);

  const articleWithSource = sampleArticle({
    id: "art-with-source",
    provenance: {
      sourceUrl: "https://example.com/original-a",
      title: "Article With Source",
      author: "An Author",
      retrievedAt: "2026-08-11T00:00:00.000Z",
      originalHtmlHash: "sha256:" + "a".repeat(64),
    },
  });
  const articlePlain = sampleArticle({
    id: "art-plain",
    provenance: {
      title: "Article Without Source",
      retrievedAt: "2026-08-12T00:00:00.000Z",
      originalHtmlHash: "sha256:" + "b".repeat(64),
    },
  });
  await db.articles.put(articleWithSource);
  await db.articles.put(articlePlain);

  const highlight = sampleHighlight({
    id: "hl-fx",
    articleId: fixture.id,
    revision: fixture.revision,
    position: { start: passage.start, end: passage.end },
    quote: { prefix: "", exact: passage.text, suffix: "" },
  });
  await db.highlights.put(highlight);

  const note = sampleNote({ id: "note-fx", highlightId: "hl-fx" });
  await db.notes.put(note);

  const location = sampleLocation({
    articleId: "art-with-source",
    revision: 1,
    graphemeOffset: 5,
  });
  await db.location.put(location);

  const prefs = samplePrefs({ theme: "dark", measure: 58 });
  if (withSettings) {
    await db.settings.put({ key: "reader-prefs", value: prefs });
  }
  return { fixture, highlight, note, location, prefs };
}

/** Recursive walk over an unknown JSON value collecting every object key
 * matching /page/i with its path (SC#4: page numbers and page-derived data
 * NEVER appear in the bundle). */
function collectPageKeys(value: unknown, path: string, found: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => collectPageKeys(v, `${path}[${i}]`, found));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const here = path === "" ? k : `${path}.${k}`;
      if (/page/i.test(k)) found.push(here);
      collectPageKeys(v, here, found);
    }
  }
}

/** Unzip buildBundleBytes output into its entries (test-side truth). */
async function buildEntries() {
  const { buildBundleBytes } = await loadService();
  const bytes = await buildBundleBytes();
  return unzipSync(bytes);
}

// ── The contract ─────────────────────────────────────────────────────────────

describe("buildBundleBytes (09-04 Task 1)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("returns bytes that unzip to exactly the entries bundle.json and manifest.json", async () => {
    await seedExportSurface(true);
    const entries = await buildEntries();
    expect(Object.keys(entries).sort()).toEqual(["bundle.json", "manifest.json"]);
  });

  it("serializes the two Dexie articles — never the fixture article — with provenance.sourceUrl verbatim", async () => {
    const { fixture } = await seedExportSurface(true);
    const entries = await buildEntries();

    const bundle = ExportBundleSchema.parse(JSON.parse(strFromU8(entries["bundle.json"]!)));
    expect(bundle.schemaVersion).toBe(1);
    expect(bundle.articles).toHaveLength(2);
    expect(bundle.articles.map((a) => a.id).sort()).toEqual([
      "art-plain",
      "art-with-source",
    ]);
    // Fixtures NEVER serialize (ARCHITECTURE L615) — the highlight's fixture
    // article is absent from the articles block.
    expect(bundle.articles.map((a) => a.id)).not.toContain(fixture.id);

    const withSource = bundle.articles.find((a) => a.id === "art-with-source");
    expect(withSource?.provenance.sourceUrl).toBe("https://example.com/original-a");
  });

  it("fixtureIds lists the bundled fixture the highlight/note reference", async () => {
    const { fixture } = await seedExportSurface(true);
    const entries = await buildEntries();

    const bundle = ExportBundleSchema.parse(JSON.parse(strFromU8(entries["bundle.json"]!)));
    // Only fixtures[0] is referenced (highlight articleId + note via its
    // owning highlight; the location references a Dexie article).
    expect(bundle.fixtureIds).toEqual([fixture.id]);
  });

  it("preferences equal the stored reader-prefs row", async () => {
    const { prefs } = await seedExportSurface(true);
    const entries = await buildEntries();

    const bundle = ExportBundleSchema.parse(JSON.parse(strFromU8(entries["bundle.json"]!)));
    expect(bundle.preferences).toEqual(prefs);
  });

  it("preferences default to DEFAULT_SETTINGS when no reader-prefs row exists (D9-12 always-present)", async () => {
    await seedExportSurface(false);
    const entries = await buildEntries();

    const bundle = ExportBundleSchema.parse(JSON.parse(strFromU8(entries["bundle.json"]!)));
    expect(bundle.preferences).toEqual(DEFAULT_SETTINGS);
  });

  it("no key matching /page/i appears anywhere in bundle.json (SC#4 data minimization)", async () => {
    await seedExportSurface(true);
    const entries = await buildEntries();

    const raw = JSON.parse(strFromU8(entries["bundle.json"]!)) as unknown;
    const found: string[] = [];
    collectPageKeys(raw, "", found);
    expect(found).toEqual([]);
  });

  it("manifest.json blocks.articles equals the recomputed computeManifest over the parsed bundle", async () => {
    await seedExportSurface(true);
    const entries = await buildEntries();

    // The contract: both sides hash JSON.stringify of the Zod-PARSED block.
    const bundle = ExportBundleSchema.parse(JSON.parse(strFromU8(entries["bundle.json"]!)));
    const claimed = JSON.parse(strFromU8(entries["manifest.json"]!)) as {
      blocks: { articles: string };
    };
    const recomputed = await computeManifest(bundle);
    expect(claimed.blocks.articles).toBe(recomputed.blocks.articles);
  });
});
