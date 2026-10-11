// tests/unit/portability/validate-bundle.test.ts
// Plan 09-04 Task 2 (TDD RED → GREEN) — the PORT-02 pre-write validation
// pipeline. Every malformed or hostile bundle is refused with a SPECIFIC,
// calm-reportable refusal kind — and zero writes occur (no transaction ever
// starts on any of these paths; validateBundle has no write surface at all).
//
// Refusal kinds asserted (09-04-PLAN.md <behavior>):
//   1. not-a-zip          — random non-zip bytes
//   2. unsafe-entry       — ../../evil.sh alongside valid entries; AND the
//                           URL-encoded traversal form ..%2F..%2Fevil.sh
//   3. missing-entry      — zip without manifest.json (and without bundle.json)
//   4. newer-schema-version — schemaVersion 7 (v3 is readable since Phase
//                           17 17-04, v4 since 20-05, v5 since issue #37,
//                           v6 since issue #121) peeked BEFORE the full
//                           schema parse (a v8 bundle with OTHER invalid
//                           fields still refuses newer-schema-version, not
//                           invalid)
//   5. invalid            — safeParse issues as a LIST (multiple problems at
//                           once — Pitfall 11 #2), each a path+message string
//   6. corrupted          — manifest articles hash vs a tampered articles block
//   +. decompression bomb — an entry DECLARING an originalSize over the cap is
//                           filtered (never inflated); the function returns a
//                           refusal rather than allocating (T-9-02)
//   +. round trip         — a well-formed bundle built by buildBundle
//                           validates ok with bundle + manifest
//
// Tests build zips in-memory via zipSync; a File is constructed via
// new File([bytes], "x.zip") under jsdom. The bomb entry is crafted by
// patching the zip CENTRAL DIRECTORY's declared uncompressed-size field —
// fflate's filter reads exactly that metadata value, so the entry "declares"
// a >200MB originalSize without the test ever materializing 200MB.
import { beforeEach, describe, expect, it } from "vitest";
import { ArticleSchema, BookSchema, ReaderSettingsSchema } from "../../../src/content/schema";
import type { CanonicalArticle, ReaderSettings } from "../../../src/content/schema";
import { ExportBundleSchema } from "../../../src/portability/bundle";
import { computeManifest, sha256Hex } from "../../../src/portability/manifest";
import type { Manifest } from "../../../src/portability/manifest";
import { seedCustomTheme } from "../../../src/settings/customTheme";
import { zipSync } from "fflate";
import fakeIndexedDB, { IDBKeyRange } from "fake-indexeddb";
import { Dexie } from "dexie";

// Dexie 4 captures `indexedDB` + `IDBKeyRange` on `Dexie.dependencies` at
// dexie-module-load time (needed for the round-trip case's buildBundle
// seed). Mirrors tests/unit/ingestion-tags.test.ts.
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

// Lazy imports — the service module must see a populated Dexie.dependencies.
async function loadService() {
  return await import("../../../src/portability/ExportImportService");
}
async function loadDb() {
  return await import("../../../src/persistence/db");
}

// ── Sample builders ──────────────────────────────────────────────────────────

function samplePrefs(): ReaderSettings {
  return ReaderSettingsSchema.parse({
    schemaVersion: 2,
    font: "serif",
    size: 18,
    measure: 64,
    spacing: "comfortable",
    theme: "sepia",
    readingMode: "paginated",
  });
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
    blocks: [
      {
        kind: "paragraph",
        content: [{ text: "Example paragraph text.", marks: [] }],
      },
    ],
    footnotes: [],
  });
}

/** A raw (pre-parse) valid v1 envelope + its honestly-computed manifest. */
async function validRawBundle(): Promise<{
  bundle: Record<string, unknown>;
  manifest: Manifest;
}> {
  const bundle = {
    schemaVersion: 1 as const,
    exportedAt: "2026-08-15T00:00:00.000Z",
    appVersion: "test",
    articles: [sampleArticle()],
    locations: [],
    highlights: [],
    notes: [],
    preferences: samplePrefs(),
    fixtureIds: [],
  };
  const manifest = await computeManifest(ExportBundleSchema.parse(bundle));
  return { bundle, manifest };
}

function zipFileOf(entries: Record<string, Uint8Array>): File {
  return new File([zipSync(entries)], "x.zip");
}

function bundleJsonOf(value: unknown): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify(value));
}

/** Patch the zip CENTRAL DIRECTORY's declared uncompressed size for one
 * entry — exactly the "declares an originalSize over the cap" semantics.
 * fflate's unzip filter reads this metadata value (zh → su) and skips the
 * entry without ever inflating it. */
function patchDeclaredUncompressedSize(
  zip: Uint8Array,
  entryName: string,
  newSize: number,
): Uint8Array {
  const out = new Uint8Array(zip); // own copy
  const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);
  // Locate the End Of Central Directory record (signature 0x06054B50).
  let e = out.length - 22;
  for (; e >= 0; --e) {
    if (dv.getUint32(e, true) === 0x06054b50) break;
  }
  if (e < 0) throw new Error("EOCD not found");
  const count = dv.getUint16(e + 8, true);
  let o = dv.getUint32(e + 16, true); // central directory offset
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(o, true) !== 0x02014b50) throw new Error("bad CD entry");
    const nameLen = dv.getUint16(o + 28, true);
    const extraLen = dv.getUint16(o + 30, true);
    const commentLen = dv.getUint16(o + 32, true);
    const name = dec.decode(out.subarray(o + 46, o + 46 + nameLen));
    if (name === entryName) {
      dv.setUint32(o + 24, newSize, true); // uncompressed-size field
      return out;
    }
    o += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`entry ${entryName} not found in central directory`);
}

// ── The six refusal kinds ────────────────────────────────────────────────────

describe("validateBundle — refusal kinds (09-04 Task 2)", () => {
  it("refuses random non-zip bytes with not-a-zip", async () => {
    const { validateBundle } = await loadService();
    const file = new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])], "x.zip");
    const result = await validateBundle(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal).toEqual({ kind: "not-a-zip" });
    }
  });

  it("refuses a zip carrying ../../evil.sh alongside valid entries with unsafe-entry naming it", async () => {
    const { validateBundle } = await loadService();
    const { bundle, manifest } = await validRawBundle();
    const file = zipFileOf({
      "bundle.json": bundleJsonOf(bundle),
      "manifest.json": bundleJsonOf(manifest),
      "../../evil.sh": new TextEncoder().encode("malicious"),
    });
    const result = await validateBundle(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal).toEqual({
        kind: "unsafe-entry",
        name: "../../evil.sh",
      });
    }
  });

  it("refuses the URL-encoded traversal form ..%2F..%2Fevil.sh with unsafe-entry", async () => {
    const { validateBundle } = await loadService();
    const { bundle, manifest } = await validRawBundle();
    const file = zipFileOf({
      "bundle.json": bundleJsonOf(bundle),
      "manifest.json": bundleJsonOf(manifest),
      "..%2F..%2Fevil.sh": new TextEncoder().encode("malicious"),
    });
    const result = await validateBundle(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal).toEqual({
        kind: "unsafe-entry",
        name: "..%2F..%2Fevil.sh",
      });
    }
  });

  it("refuses a zip missing manifest.json with missing-entry naming manifest.json", async () => {
    const { validateBundle } = await loadService();
    const { bundle } = await validRawBundle();
    const file = zipFileOf({ "bundle.json": bundleJsonOf(bundle) });
    const result = await validateBundle(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal).toEqual({
        kind: "missing-entry",
        name: "manifest.json",
      });
    }
  });

  it("refuses a zip missing bundle.json with missing-entry naming bundle.json", async () => {
    const { validateBundle } = await loadService();
    const { manifest } = await validRawBundle();
    const file = zipFileOf({ "manifest.json": bundleJsonOf(manifest) });
    const result = await validateBundle(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal).toEqual({
        kind: "missing-entry",
        name: "bundle.json",
      });
    }
  });

  it("peeks schemaVersion BEFORE the full parse: a v8 bundle with OTHER invalid fields still refuses newer-schema-version", async () => {
    const { validateBundle } = await loadService();
    const { bundle, manifest } = await validRawBundle();
    // schemaVersion 8 (v7 now carries the starter choice) AND other damage
    // (articles not an array; fixtureIds dropped entirely) — the calm
    // newer-version refusal must win.
    const damaged: Record<string, unknown> = {
      ...bundle,
      schemaVersion: 8,
      articles: "not-an-array",
    };
    delete damaged.fixtureIds;
    const file = zipFileOf({
      "bundle.json": bundleJsonOf(damaged),
      "manifest.json": bundleJsonOf(manifest),
    });
    const result = await validateBundle(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal).toEqual({
        kind: "newer-schema-version",
        bundleVersion: 8,
      });
    }
  });

  it("refuses a schemaVersion 8 bundle with newer-schema-version; v3, v4, v5, and v6 bundles pass the peek (17-04 → 20-05 → #37 → #121 threshold bumps)", async () => {
    const { validateBundle } = await loadService();
    const { bundle } = await validRawBundle();

    // v3 (retained from 17-04): a FULLY valid v3 bundle — articles carrying
    // reader-owned metadata overrides (D17-12) — parses through the peek.
    const overridden = ArticleSchema.parse({
      ...sampleArticle(),
      id: "example-overridden",
      readerTitle: "My Chosen Title",
      readerAuthor: "My Chosen Author",
    });
    const v3 = {
      ...bundle,
      schemaVersion: 3 as const,
      articles: [sampleArticle(), overridden],
    };
    const v3Manifest = await computeManifest(ExportBundleSchema.parse(v3));
    const v3Result = await validateBundle(
      zipFileOf({
        "bundle.json": bundleJsonOf(v3),
        "manifest.json": bundleJsonOf(v3Manifest),
      }),
    );
    expect(v3Result.ok).toBe(true);
    if (v3Result.ok) {
      expect(v3Result.bundle.schemaVersion).toBe(3);
      expect(v3Result.bundle.articles[1]?.readerTitle).toBe("My Chosen Title");
      expect(v3Result.bundle.articles[1]?.readerAuthor).toBe("My Chosen Author");
    }

    // v4 (Phase 20 20-05): a FULLY valid v4 bundle — carrying the assets
    // metadata array (IMG-04) — parses through the peek and the full schema.
    const v4 = {
      ...bundle,
      schemaVersion: 4 as const,
      assets: [
        {
          articleId: "example-article",
          assetId: "img-0123456789ab",
          contentType: "image/png",
          byteLength: 70,
          sha256: "a".repeat(64),
          entry: "assets/example-article/img-0123456789ab",
        },
      ],
    };
    const v4Manifest = await computeManifest(ExportBundleSchema.parse(v4));
    const v4Result = await validateBundle(
      zipFileOf({
        "bundle.json": bundleJsonOf(v4),
        "manifest.json": bundleJsonOf(v4Manifest),
      }),
    );
    expect(v4Result.ok).toBe(true);
    if (v4Result.ok) {
      expect(v4Result.bundle.schemaVersion).toBe(4);
      expect(v4Result.bundle.assets).toHaveLength(1);
    }

    // v5 (issue #37): a FULLY valid v5 bundle — carrying the readingSessions
    // array — parses through the peek and the full schema.
    const v5 = {
      ...bundle,
      schemaVersion: 5 as const,
      readingSessions: [
        {
          schemaVersion: 1 as const,
          id: "visit-peek",
          articleId: "example-article",
          startedAt: "2026-09-15T10:00:00.000Z",
          endedAt: "2026-09-15T10:05:00.000Z",
          startOffset: 0,
          endOffset: 4_200,
          activeSeconds: 240,
        },
      ],
    };
    const v5Manifest = await computeManifest(ExportBundleSchema.parse(v5));
    const v5Result = await validateBundle(
      zipFileOf({
        "bundle.json": bundleJsonOf(v5),
        "manifest.json": bundleJsonOf(v5Manifest),
      }),
    );
    expect(v5Result.ok).toBe(true);
    if (v5Result.ok) {
      expect(v5Result.bundle.schemaVersion).toBe(5);
      expect(v5Result.bundle.readingSessions).toHaveLength(1);
    }

    // v6 (issue #121): a FULLY valid v6 bundle — carrying the
    // subscriptions array — parses through the peek and the full schema.
    const v6 = {
      ...bundle,
      schemaVersion: 6 as const,
      subscriptions: [
        {
          schemaVersion: 1 as const,
          id: "sub-peek",
          feedUrl: "https://example.com/feed.xml",
          title: "The Peeked Feed",
          items: [],
          subscribedAt: "2026-09-29T10:00:00.000Z",
        },
      ],
    };
    const v6Manifest = await computeManifest(ExportBundleSchema.parse(v6));
    const v6Result = await validateBundle(
      zipFileOf({
        "bundle.json": bundleJsonOf(v6),
        "manifest.json": bundleJsonOf(v6Manifest),
      }),
    );
    expect(v6Result.ok).toBe(true);
    if (v6Result.ok) {
      expect(v6Result.bundle.schemaVersion).toBe(6);
      expect(v6Result.bundle.subscriptions).toHaveLength(1);
    }

    // The same envelope at schemaVersion 8 calm-refuses at the peek —
    // before any schema parse, manifest check, or transaction.
    const v8 = { ...bundle, schemaVersion: 8 };
    const v8Result = await validateBundle(
      zipFileOf({
        "bundle.json": bundleJsonOf(v8),
        "manifest.json": bundleJsonOf(v6Manifest),
      }),
    );
    expect(v8Result.ok).toBe(false);
    if (!v8Result.ok) {
      expect(v8Result.refusal).toEqual({
        kind: "newer-schema-version",
        bundleVersion: 8,
      });
    }
  });

  it("accepts a v2 bundle (books-capable) through the peek — Phase 12 12-07 threshold bump", async () => {
    const { validateBundle } = await loadService();
    const { bundle } = await validRawBundle();
    const v2 = {
      ...bundle,
      schemaVersion: 2 as const,
      books: [
        BookSchema.parse({
          id: "epub-222222222222",
          title: "The Peeked Book",
          authors: [],
          language: "en",
          chapterArticleIds: [],
          skippedChapterCount: 0,
          source: "epub-upload",
          originalFileHash: "sha256:" + "f".repeat(64),
          addedAt: "2026-08-17T00:00:00.000Z",
        }),
      ],
    };
    // An honestly-computed manifest over the v2 shape (books are not a
    // manifest block — the five Phase-9 blocks are unchanged).
    const v2Manifest = await computeManifest(ExportBundleSchema.parse(v2));
    const file = zipFileOf({
      "bundle.json": bundleJsonOf(v2),
      "manifest.json": bundleJsonOf(v2Manifest),
    });
    const result = await validateBundle(file);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bundle.schemaVersion).toBe(2);
      expect(result.bundle.books).toHaveLength(1);
    }
  });

  it("refuses an invalid bundle with ALL schema issues as a list, each a path+message string (Pitfall 11 #2)", async () => {
    const { validateBundle } = await loadService();
    const { bundle, manifest } = await validRawBundle();
    // TWO independent problems: preferences dropped AND fixtureIds dropped.
    const { preferences: _p, fixtureIds: _f, ...damaged } = bundle;
    const file = zipFileOf({
      "bundle.json": bundleJsonOf(damaged),
      "manifest.json": bundleJsonOf(manifest),
    });
    const result = await validateBundle(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal.kind).toBe("invalid");
      if (result.refusal.kind === "invalid") {
        expect(result.refusal.issues.length).toBeGreaterThanOrEqual(2);
        for (const issue of result.refusal.issues) {
          expect(typeof issue).toBe("string");
          expect(issue.length).toBeGreaterThan(0);
          expect(issue).toMatch(/: /); // "path: message" form
        }
        expect(result.refusal.issues.some((i) => i.startsWith("preferences"))).toBe(true);
        expect(result.refusal.issues.some((i) => i.startsWith("fixtureIds"))).toBe(true);
      }
    }
  });

  it("refuses a tampered articles block with corrupted naming the failed block", async () => {
    const { validateBundle } = await loadService();
    const { bundle, manifest } = await validRawBundle();
    // Tamper: append a SECOND schema-valid article WITHOUT recomputing the
    // manifest — still schema-valid (so `invalid` cannot fire), but the
    // recomputed articles hash no longer matches the claimed manifest.
    const tampered = {
      ...bundle,
      articles: [...(bundle.articles as unknown[]).slice(0, 1), sampleArticle2()],
    };
    const file = zipFileOf({
      "bundle.json": bundleJsonOf(tampered),
      "manifest.json": bundleJsonOf(manifest),
    });
    const result = await validateBundle(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal).toEqual({
        kind: "corrupted",
        failedBlocks: ["articles"],
      });
    }
  });

  it("refuses rather than allocates when an entry DECLARES an originalSize over the 200MB cap (T-9-02 bomb guard)", async () => {
    const { validateBundle } = await loadService();
    const { bundle, manifest } = await validRawBundle();
    const zip = zipSync({
      "bundle.json": bundleJsonOf(bundle),
      "manifest.json": bundleJsonOf(manifest),
    });
    // bundle.json now DECLARES a 200,000,001-byte uncompressed size in the
    // central directory (the payload is unchanged). The fflate filter cap
    // skips the entry — never inflating it — so the required entry is
    // absent and the function returns a REFUSAL instead of allocating.
    const bombed = patchDeclaredUncompressedSize(zip, "bundle.json", 200_000_001);
    const result = await validateBundle(new File([new Uint8Array(bombed)], "x.zip"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal.kind).toBe("missing-entry");
    }
  });
});

function sampleArticle2(): CanonicalArticle {
  return ArticleSchema.parse({
    id: "second-article",
    revision: 1,
    lang: "en",
    provenance: {
      title: "Second article",
      retrievedAt: "2026-08-02T00:00:00.000Z",
      originalHtmlHash: "sha256:" + "b".repeat(64),
    },
    blocks: [
      {
        kind: "paragraph",
        content: [{ text: "Second article body.", marks: [] }],
      },
    ],
    footnotes: [],
  });
}

// ── Round trip ───────────────────────────────────────────────────────────────

describe("validateBundle — round trip (09-04 Task 2)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("validates a well-formed bundle built by buildBundle with ok:true + bundle + manifest", async () => {
    const { buildBundle, validateBundle } = await loadService();
    const { db } = await loadDb();
    await db.articles.put(sampleArticle());
    await db.settings.put({ key: "reader-prefs", value: samplePrefs() });

    const bytes = (await buildBundle()).bytes;
    // new Uint8Array(bytes) re-backs the view on a fresh ArrayBuffer —
    // BlobPart requires ArrayBuffer backing under TS 7 (the 09-01
    // sha256Hex typing precedent).
    const result = await validateBundle(new File([new Uint8Array(bytes)], "x.zip"));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bundle.schemaVersion).toBe(7); // writers preserve starter removal
      expect(result.bundle.articles.map((a) => a.id)).toEqual(["example-article"]);
      expect(result.bundle.preferences).toEqual(samplePrefs());
      expect(result.manifest.algorithm).toBe("sha256");
    }
  });

  // Issue #18 (D22-01) acceptance: the reader's width choice survives
  // export/import AT the new maximum — an 88ch preference round-trips
  // byte-identically (no legacy clamp touches in-union values; the
  // manifest hash is computed over the parsed 88 block and re-verifies).
  it("round-trips the new maximum measure 88 through buildBundle → validateBundle unchanged", async () => {
    const { buildBundle, validateBundle } = await loadService();
    const { db } = await loadDb();
    const widePrefs = ReaderSettingsSchema.parse({
      ...samplePrefs(),
      measure: 88,
    });
    await db.articles.put(sampleArticle());
    await db.settings.put({ key: "reader-prefs", value: widePrefs });

    const bytes = (await buildBundle()).bytes;
    const result = await validateBundle(new File([new Uint8Array(bytes)], "wide.zip"));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bundle.preferences.measure).toBe(88);
      expect(result.bundle.preferences).toEqual(widePrefs);
    }
  });

  // Issue #86 acceptance, extended by issue #120: BOTH custom slots survive
  // the WHOLE portability pipeline — buildBundle → validateBundle →
  // resolveImportPlan → applyImport → the local reader-prefs row —
  // byte-stable and independently edited. The seeded token carries
  // UPPERCASE hex deliberately: hydration never coerces (the schema
  // preserves case) and neither may the bundle path.
  it("round-trips both custom slots byte-stable through buildBundle → validateBundle → applyImport", async () => {
    const { buildBundle, validateBundle, applyImport } = await loadService();
    const { detectImportPreview, resolveImportPlan } =
      await import("../../../src/portability/conflicts");
    const { db } = await loadDb();
    const customPrefs = ReaderSettingsSchema.parse({
      ...samplePrefs(),
      schemaVersion: 5,
      theme: "custom-dark",
      customLightTheme: {
        baseTheme: "light",
        tokens: { ...seedCustomTheme("light").tokens, ink: "#1A1A1A" },
      },
      customDarkTheme: {
        baseTheme: "dark",
        tokens: { ...seedCustomTheme("dark").tokens, ink: "#EDE6D9" },
      },
    });
    await db.articles.put(sampleArticle());
    await db.settings.put({ key: "reader-prefs", value: customPrefs });

    const bytes = (await buildBundle()).bytes;
    const result = await validateBundle(new File([new Uint8Array(bytes)], "custom.zip"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The validated preferences block is byte-identical to the stored one
    // (this is the string the manifest hash was computed over).
    expect(JSON.stringify(result.bundle.preferences)).toBe(JSON.stringify(customPrefs));

    // Import with the dialog's skip-defaults (overwrite the identical
    // article) and the reader's "apply preferences" choice ON.
    const preview = await detectImportPreview(result.bundle);
    const plan = await resolveImportPlan(
      result.bundle,
      preview,
      {
        book: "skip",
        "article-revision": "overwrite",
        "article-content-divergence": "skip",
        "article-metadata-override": "skip",
        "highlight-id": "skip",
        "note-id": "skip",
        location: "skip",
      },
      true,
    );
    await applyImport(plan);

    const row = await db.settings.get("reader-prefs");
    expect(row?.key).toBe("reader-prefs");
    expect(JSON.stringify(row?.value)).toBe(JSON.stringify(customPrefs));
    // Spot-check the case preservation rode the whole way — in BOTH slots.
    const imported = row?.value as ReaderSettings;
    expect(imported.customLightTheme?.tokens.ink).toBe("#1A1A1A");
    expect(imported.customDarkTheme?.tokens.ink).toBe("#EDE6D9");
  });
});

// Hash the pre-#163 schema shape before the current parser adds defaults.
async function preOpenAfterAddExport(customSlots: boolean) {
  const { bundle, manifest } = await validRawBundle();
  const preferences = {
    schemaVersion: 5,
    font: "serif",
    size: 18,
    measure: 64,
    spacing: "comfortable",
    theme: customSlots ? "custom-dark" : "sepia",
    ...(customSlots
      ? {
          customLightTheme: seedCustomTheme("light"),
          customDarkTheme: seedCustomTheme("dark"),
        }
      : {}),
    animatePageTurns: true,
    readingMode: "scrolling",
    voice: "saved-voice",
    rate: 1.5,
    librarySort: "title",
  };
  bundle.preferences = preferences;
  manifest.blocks.preferences = await sha256Hex(bundleJsonOf(preferences));
  return { bundle, manifest, preferences };
}

describe("validateBundle — pre-openAfterAdd export compatibility", () => {
  it.each([false, true])("imports v5 preferences with custom slots %s", async (customSlots) => {
    const { bundle, manifest, preferences } = await preOpenAfterAddExport(customSlots);
    const { validateBundle } = await loadService();
    const result = await validateBundle(
      zipFileOf({
        "bundle.json": bundleJsonOf(bundle),
        "manifest.json": bundleJsonOf(manifest),
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.bundle.preferences).toEqual({
        ...preferences,
        openAfterAdd: true,
        showReadAloud: true,
        speechNoticeDismissed: false,
      });
  });

  it.each([false, true])(
    "imports pre-speech v6 settings and detects speech preference tampering: %s",
    async (tamper) => {
      const { bundle, manifest, preferences } = await preOpenAfterAddExport(false);
      const legacy = { ...preferences, schemaVersion: 6, openAfterAdd: true };
      bundle.preferences = legacy;
      manifest.blocks.preferences = await sha256Hex(bundleJsonOf(legacy));
      if (tamper) bundle.preferences = { ...legacy, showReadAloud: false };
      const { validateBundle } = await loadService();
      const result = await validateBundle(
        zipFileOf({
          "bundle.json": bundleJsonOf(bundle),
          "manifest.json": bundleJsonOf(manifest),
        }),
      );
      expect(result.ok).toBe(!tamper);
      if (result.ok) {
        expect(result.bundle.preferences.showReadAloud).toBe(true);
        expect(result.bundle.preferences.speechNoticeDismissed).toBe(false);
      }
    },
  );

  it.each(["preference", "manifest", "new-version", "added-field"])(
    "still refuses %s tampering",
    async (change) => {
      const { bundle, manifest, preferences } = await preOpenAfterAddExport(false);
      if (change === "preference") preferences.size = 20;
      if (change === "manifest") manifest.blocks.preferences = "0".repeat(64);
      if (change === "new-version") {
        preferences.schemaVersion = 6;
        manifest.blocks.preferences = await sha256Hex(bundleJsonOf(preferences));
      }
      if (change === "added-field") bundle.preferences = { ...preferences, openAfterAdd: false };
      const { validateBundle } = await loadService();
      const result = await validateBundle(
        zipFileOf({
          "bundle.json": bundleJsonOf(bundle),
          "manifest.json": bundleJsonOf(manifest),
        }),
      );
      expect(result).toEqual({
        ok: false,
        refusal: { kind: "corrupted", failedBlocks: ["preferences"] },
      });
    },
  );
});
