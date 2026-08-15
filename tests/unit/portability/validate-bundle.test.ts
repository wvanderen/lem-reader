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
//   4. newer-schema-version — schemaVersion 2 peeked BEFORE the full schema
//                           parse (a v2 bundle with OTHER invalid fields still
//                           refuses newer-schema-version, not invalid)
//   5. invalid            — safeParse issues as a LIST (multiple problems at
//                           once — Pitfall 11 #2), each a path+message string
//   6. corrupted          — manifest articles hash vs a tampered articles block
//   +. decompression bomb — an entry DECLARING an originalSize over the cap is
//                           filtered (never inflated); the function returns a
//                           refusal rather than allocating (T-9-02)
//   +. round trip         — a well-formed bundle built by buildBundleBytes
//                           validates ok with bundle + manifest
//
// Tests build zips in-memory via zipSync; a File is constructed via
// new File([bytes], "x.zip") under jsdom. The bomb entry is crafted by
// patching the zip CENTRAL DIRECTORY's declared uncompressed-size field —
// fflate's filter reads exactly that metadata value, so the entry "declares"
// a >200MB originalSize without the test ever materializing 200MB.
import { beforeEach, describe, expect, it } from "vitest";
import {
  ArticleSchema,
  ReaderSettingsSchema,
} from "../../../src/content/schema";
import type { CanonicalArticle, ReaderSettings } from "../../../src/content/schema";
import { ExportBundleSchema } from "../../../src/portability/bundle";
import { computeManifest } from "../../../src/portability/manifest";
import type { Manifest } from "../../../src/portability/manifest";
import { zipSync } from "fflate";
import fakeIndexedDB, { IDBKeyRange } from "fake-indexeddb";
import { Dexie } from "dexie";

// Dexie 4 captures `indexedDB` + `IDBKeyRange` on `Dexie.dependencies` at
// dexie-module-load time (needed for the round-trip case's buildBundleBytes
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

function bundleJsonOf(value: unknown): Uint8Array {
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

  it("peeks schemaVersion BEFORE the full parse: a v2 bundle with OTHER invalid fields still refuses newer-schema-version", async () => {
    const { validateBundle } = await loadService();
    const { bundle, manifest } = await validRawBundle();
    // schemaVersion 2 AND other damage (articles not an array; fixtureIds
    // dropped entirely) — the calm newer-version refusal must win.
    const damaged: Record<string, unknown> = {
      ...bundle,
      schemaVersion: 2,
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
        bundleVersion: 2,
      });
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
        expect(
          result.refusal.issues.some((i) => i.startsWith("preferences")),
        ).toBe(true);
        expect(
          result.refusal.issues.some((i) => i.startsWith("fixtureIds")),
        ).toBe(true);
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
      articles: [
        ...((bundle.articles as unknown[]).slice(0, 1)),
        sampleArticle2(),
      ],
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
    const bombed = patchDeclaredUncompressedSize(
      zip,
      "bundle.json",
      200_000_001,
    );
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

  it("validates a well-formed bundle built by buildBundleBytes with ok:true + bundle + manifest", async () => {
    const { buildBundleBytes, validateBundle } = await loadService();
    const { db } = await loadDb();
    await db.articles.put(sampleArticle());
    await db.settings.put({ key: "reader-prefs", value: samplePrefs() });

    const bytes = await buildBundleBytes();
    // new Uint8Array(bytes) re-backs the view on a fresh ArrayBuffer —
    // BlobPart requires ArrayBuffer backing under TS 7 (the 09-01
    // sha256Hex typing precedent).
    const result = await validateBundle(
      new File([new Uint8Array(bytes)], "x.zip"),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bundle.schemaVersion).toBe(1);
      expect(result.bundle.articles.map((a) => a.id)).toEqual([
        "example-article",
      ]);
      expect(result.bundle.preferences).toEqual(samplePrefs());
      expect(result.manifest.algorithm).toBe("sha256");
    }
  });
});
