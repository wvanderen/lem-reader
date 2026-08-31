// tests/unit/portability/bundle-v4.spec.ts
// Phase 20 Plan 20-05 — the IMG-04 bundle-v4 truth: assets leave and
// re-enter the device as first-class bundle citizens.
//
//   Task 1 cells (v4 schema + manifest assets block + writer asset entries):
//     - A5 (Wave-0): fflate zipSync accepts MIXED strToU8 + raw Uint8Array
//       values in one call and both round-trip byte-equal (the write-side
//       twin of 12-02's unzipSync byte map)
//     - writers emit schemaVersion 4 with per-asset meta (canonical
//       service-generated entry names, honest sha256/byteLength) + raw zip
//       entries under assets/<articleId>/<assetId>; an asset-free library
//       still emits the ALWAYS-PRESENT empty assets array (the v2 books
//       write-contract precedent)
//     - the manifest gains an assets block hashing JSON.stringify of the
//       parsed bundle.assets on BOTH sides (the manifest.ts determinism
//       contract extended; v1-v3 claimed manifests predate the key and are
//       read as the empty-array hash)
//     - union read: v1/v2/v3 fixtures parse exactly as before; a v4 bundle
//       with an assets array parses and retains it; v5+ forward-refuses at
//       the validateBundle peek (D9-04 preserved, threshold > 4)
//   Task 2 cells (import gates) live in the describes further down.
//
// Harness mirrors tests/unit/portability/atomic-import.test.ts (fake-indexeddb
// via Dexie.dependencies at module top-level, wipeDatabase beforeEach, lazy
// module imports) + the 20-03 Blob-fidelity note: Node's Blob is installed as
// this spec file's global BEFORE the lazy imports so db.assets rows round-trip
// through fake-indexeddb's structuredClone byte-identically (jsdom Blobs
// degrade to plain objects — see assets-cascade.spec.ts L40-52).
import { beforeEach, describe, expect, it } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import {
  ArticleSchema,
  BookSchema,
} from "../../../src/content/schema";
import type { CanonicalArticle } from "../../../src/content/schema";
import { ExportBundleSchema } from "../../../src/portability/bundle";
import { computeManifest, sha256Hex } from "../../../src/portability/manifest";
import { sampleBundle } from "./bundle-schema.test";
import fakeIndexedDB, { IDBKeyRange } from "fake-indexeddb";
import { Dexie } from "dexie";

// Dexie 4 captures `indexedDB` + `IDBKeyRange` on `Dexie.dependencies` at
// dexie-module-load time — the documented Dexie + Node test pattern.
Dexie.dependencies.indexedDB = fakeIndexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;
(globalThis as { indexedDB?: typeof fakeIndexedDB }).indexedDB = fakeIndexedDB;
(globalThis as { IDBKeyRange?: typeof IDBKeyRange }).IDBKeyRange = IDBKeyRange;

// Blob-fidelity harness (20-03 discipline — assets-cascade.spec.ts L40-52):
// Node's Blob IS a host object to the global structuredClone fake-indexeddb
// uses, so seeded asset rows survive the Dexie round-trip for the writer's
// row.data.arrayBuffer() read.
(globalThis as { Blob?: unknown }).Blob = NodeBlob;

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

// Lazy imports — the modules under test must see a populated
// Dexie.dependencies + the Node Blob global at module-body time.
async function loadService() {
  return await import("../../../src/portability/ExportImportService");
}
async function loadDb() {
  return await import("../../../src/persistence/db");
}

// ── Sample builders (schema-validated at construction) ──────────────────────

/** A 1x1 transparent PNG — real decoder-valid bytes (Task 3's e2e renders
 * them); portability itself only hashes, so any bytes would do, but sharing
 * the fixture keeps the unit + e2e corpora aligned. */
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/** ArrayBuffer-backed (TS 7 BufferSource discipline — the 09-01 lesson). */
function tinyPngBytes(): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Buffer.from(TINY_PNG_BASE64, "base64"));
}

const FIGURE_ARTICLE_ID = "art-figure-rt01";
const FIGURE_ASSET_ID = "img-0123456789ab";
const FIGURE_ENTRY = `assets/${FIGURE_ARTICLE_ID}/${FIGURE_ASSET_ID}`;

/** An article whose single figure carries a local asset ref (D20-12). */
function figureArticle(): CanonicalArticle {
  return ArticleSchema.parse({
    id: FIGURE_ARTICLE_ID,
    revision: 1,
    lang: "en",
    provenance: {
      sourceUrl: "https://example.com/figure-article",
      title: "Figure Round Trip Article",
      author: "Fia Asset",
      retrievedAt: "2026-08-31T00:00:00.000Z",
      originalHtmlHash: "sha256:" + "e".repeat(64),
    },
    blocks: [
      {
        kind: "paragraph",
        content: [
          { text: "A paragraph precedes the figure so the corpus resolves anchors.", marks: [] },
        ],
      },
      {
        kind: "figure",
        alt: "A tiny transparent square",
        src: `asset:${FIGURE_ASSET_ID}`,
        originalSrc: "https://example.com/tiny.png",
        width: 1,
        height: 1,
        caption: [],
      },
    ],
    footnotes: [],
  });
}

/** Seed one Dexie asset row for the figure article (AssetRecordRow shape). */
async function seedFigureAsset(): Promise<Uint8Array<ArrayBuffer>> {
  const { db } = await loadDb();
  const bytes = tinyPngBytes();
  await db.assets.put({
    articleId: FIGURE_ARTICLE_ID,
    assetId: FIGURE_ASSET_ID,
    contentType: "image/png",
    byteLength: bytes.byteLength,
    data: new Blob([bytes], { type: "image/png" }),
    createdAt: "2026-08-31T00:00:00.000Z",
  });
  return bytes;
}

function zipFileOf(entries: Record<string, Uint8Array>): File {
  return new File([zipSync(entries)], "x.zip");
}

function bundleJsonOf(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

// ── Task 1: A5 (Wave-0 assumption proof) ─────────────────────────────────────

describe("fflate A5 — mixed-value zipSync round-trips byte-equal (20-05 Task 1)", () => {
  it("accepts one strToU8 entry + one raw Uint8Array entry in ONE call; both come back exact", () => {
    const bytes = tinyPngBytes();
    const out = unzipSync(
      zipSync({
        "bundle.json": strToU8("hello assets"),
        [FIGURE_ENTRY]: bytes,
      }),
    );
    expect(strFromU8(out["bundle.json"]!)).toBe("hello assets");
    expect(out[FIGURE_ENTRY]).toBeDefined();
    expect(Array.from(out[FIGURE_ENTRY]!)).toEqual(Array.from(bytes));
    expect(out[FIGURE_ENTRY]!.byteLength).toBe(bytes.byteLength);
  });
});

// ── Task 1: writer emits v4 with asset meta + entries ────────────────────────

describe("buildBundleBytes — v4 asset emission (20-05 Task 1)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("emits schemaVersion 4 with per-asset meta and a raw zip entry at assets/<articleId>/<assetId>", async () => {
    const { buildBundleBytes } = await loadService();
    const { db } = await loadDb();
    await db.articles.put(figureArticle());
    const bytes = await seedFigureAsset();

    const entries = unzipSync(await buildBundleBytes());
    const bundleJson = JSON.parse(strFromU8(entries["bundle.json"]!)) as {
      schemaVersion: number;
      assets?: Array<Record<string, unknown>>;
    };

    // Writers emit v4 (the fourth union-widening application — 12-07/17-04).
    expect(bundleJson.schemaVersion).toBe(4);

    // The assets meta block: one row, canonical service-generated entry name,
    // honest sha256 + byteLength over the actual bytes.
    const meta = bundleJson.assets ?? [];
    expect(meta).toHaveLength(1);
    expect(meta[0]).toMatchObject({
      articleId: FIGURE_ARTICLE_ID,
      assetId: FIGURE_ASSET_ID,
      contentType: "image/png",
      byteLength: bytes.byteLength,
      entry: FIGURE_ENTRY,
    });
    expect(meta[0]!.sha256).toBe(await sha256Hex(bytes));

    // The raw entry rides the SAME zipSync call, byte-equal.
    const entryBytes = entries[FIGURE_ENTRY];
    expect(entryBytes, "the asset zip entry must exist").toBeDefined();
    expect(Array.from(entryBytes!)).toEqual(Array.from(bytes));
  });

  it("an asset-free library still emits the ALWAYS-PRESENT empty assets array with zero asset entries", async () => {
    const { buildBundleBytes } = await loadService();
    const { db } = await loadDb();
    // An article with NO matching asset row (the beforeEach wiped the store).
    await db.articles.put(figureArticle());

    const entries = unzipSync(await buildBundleBytes());
    const bundleJson = JSON.parse(strFromU8(entries["bundle.json"]!)) as {
      assets?: unknown[];
    };
    // The field's presence is the v4 write contract (the v2 books precedent).
    expect(bundleJson.assets).toEqual([]);
    expect(
      Object.keys(entries).filter((k) => k.startsWith("assets/")),
    ).toEqual([]);
  });

  it("validates back through validateBundle with schemaVersion 4 (round trip)", async () => {
    const { buildBundleBytes, validateBundle } = await loadService();
    const { db } = await loadDb();
    await db.articles.put(figureArticle());
    await seedFigureAsset();

    const bytes = await buildBundleBytes();
    const result = await validateBundle(new File([new Uint8Array(bytes)], "x.zip"));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bundle.schemaVersion).toBe(4);
      expect(result.bundle.assets).toHaveLength(1);
      expect(result.bundle.assets?.[0]?.entry).toBe(FIGURE_ENTRY);
    }
  });
});

// ── Task 1: manifest assets block on BOTH compute sides ──────────────────────

describe("manifest assets block (20-05 Task 1)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("manifest.json blocks.assets equals the recomputed computeManifest over the parsed v4 bundle", async () => {
    const { buildBundleBytes } = await loadService();
    const { db } = await loadDb();
    await db.articles.put(figureArticle());
    await seedFigureAsset();

    const entries = unzipSync(await buildBundleBytes());
    const parsed = ExportBundleSchema.parse(
      JSON.parse(strFromU8(entries["bundle.json"]!)),
    );
    const claimed = JSON.parse(strFromU8(entries["manifest.json"]!)) as {
      blocks: Record<string, string>;
    };
    const recomputed = await computeManifest(parsed);
    expect(claimed.blocks.assets).toBe(recomputed.blocks.assets);
    // The other five blocks keep their hashes (strengthen-only).
    expect(claimed.blocks.articles).toBe(recomputed.blocks.articles);
    expect(claimed.blocks.preferences).toBe(recomputed.blocks.preferences);
  });
});

// ── Task 1: union read + forward refusal ─────────────────────────────────────

describe("union read + forward refusal (20-05 Task 1)", () => {
  it("v1/v2/v3 fixtures still parse exactly as before (union read — regression)", () => {
    const v1 = ExportBundleSchema.safeParse(sampleBundle());
    expect(v1.success).toBe(true);
    if (v1.success) {
      expect(v1.data.schemaVersion).toBe(1);
      expect(v1.data.assets).toBeUndefined();
    }
    const v2 = ExportBundleSchema.safeParse({
      ...sampleBundle(),
      schemaVersion: 2,
      books: [
        BookSchema.parse({
          id: "epub-555555555555",
          title: "The Union Book",
          authors: [],
          language: "en",
          chapterArticleIds: [],
          skippedChapterCount: 0,
          source: "epub-upload",
          originalFileHash: "sha256:" + "5".repeat(64),
          addedAt: "2026-08-17T00:00:00.000Z",
        }),
      ],
    });
    expect(v2.success).toBe(true);
    const v3 = ExportBundleSchema.safeParse({
      ...sampleBundle(),
      schemaVersion: 3,
    });
    expect(v3.success).toBe(true);
  });

  it("parses a v4 bundle with an assets array and retains it; tolerates an assets-less v4 envelope on read", () => {
    const meta = {
      articleId: FIGURE_ARTICLE_ID,
      assetId: FIGURE_ASSET_ID,
      contentType: "image/png",
      byteLength: 70,
      sha256: "a".repeat(64),
      entry: FIGURE_ENTRY,
    };
    const v4 = ExportBundleSchema.safeParse({
      ...sampleBundle(),
      schemaVersion: 4,
      assets: [meta],
    });
    expect(v4.success).toBe(true);
    if (v4.success) {
      expect(v4.data.assets).toHaveLength(1);
      expect(v4.data.assets?.[0]?.entry).toBe(FIGURE_ENTRY);
    }
    // Optional field, version-independent (the books tolerance precedent).
    const bare = ExportBundleSchema.safeParse({
      ...sampleBundle(),
      schemaVersion: 4,
    });
    expect(bare.success).toBe(true);
  });

  it("rejects schemaVersion 5 at the schema (forward-compat gate)", () => {
    const result = ExportBundleSchema.safeParse({
      ...sampleBundle(),
      schemaVersion: 5,
    });
    expect(result.success).toBe(false);
  });

  it("peeks a v5 bundle BEFORE the full parse and refuses newer-schema-version calmly", async () => {
    const { validateBundle } = await loadService();
    // schemaVersion 5 AND other damage — the calm newer-version refusal wins.
    const damaged: Record<string, unknown> = {
      ...sampleBundle(),
      schemaVersion: 5,
      articles: "not-an-array",
    };
    const result = await validateBundle(
      zipFileOf({
        "bundle.json": bundleJsonOf(damaged),
        "manifest.json": bundleJsonOf({ algorithm: "sha256", blocks: {} }),
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal).toEqual({
        kind: "newer-schema-version",
        bundleVersion: 5,
      });
    }
  });

  it("a v4 bundle with an honestly-computed manifest (incl. the assets block) passes a v1-v3-era manifest too", async () => {
    // v1-v3 claimed manifests predate the assets key — the reader treats the
    // absent key as the empty-array hash, so old bundles never false-positive
    // as corrupted (union-read compatibility for the manifest evolution).
    const { validateBundle } = await loadService();
    const v1 = { ...sampleBundle() };
    const v1Manifest = await computeManifest(ExportBundleSchema.parse(v1));
    // Simulate the OLD five-block manifest shape (no assets key).
    const { assets: _assets, ...oldBlocks } = v1Manifest.blocks;
    const result = await validateBundle(
      zipFileOf({
        "bundle.json": bundleJsonOf(v1),
        "manifest.json": bundleJsonOf({ algorithm: "sha256", blocks: oldBlocks }),
      }),
    );
    expect(result.ok).toBe(true);
  });
});
