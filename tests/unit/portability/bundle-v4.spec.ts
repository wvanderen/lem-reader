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
import type { Overrides } from "../../../src/portability/conflicts";
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
async function loadConflicts() {
  return await import("../../../src/portability/conflicts");
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

// ════════════════════════════════════════════════════════════════════════════
// Task 2 — Import gates: caps, sha256, no-broken-refs, conflict ride, apply
// ════════════════════════════════════════════════════════════════════════════

/** Gate accessors over the REAL signatures (the RED-phase wider-call-shape
 * scaffolding was removed once the importAssets parameters landed — the
 * 20-03 GREEN-cleanup precedent). */
async function loadGates() {
  const { validateBundle, applyImport } = await loadService();
  const { detectImportPreview, resolveImportPlan } = await loadConflicts();
  return {
    validate: validateBundle,
    detect: detectImportPreview,
    resolve: resolveImportPlan,
    apply: applyImport,
  };
}

/** The figure article at a different revision + content hash (the
 * incoming-wins refresh vector). */
function figureArticleAtRevision(revision: number): CanonicalArticle {
  const base = figureArticle();
  return ArticleSchema.parse({
    ...base,
    revision,
    provenance: {
      ...base.provenance,
      originalHtmlHash: `sha256:${String(revision).repeat(64)}`,
    },
  });
}

/** A second figure asset's bytes — differs from tinyPngBytes so replacement
 * is observable at the row level. */
function tinyPngBytes2(): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(tinyPngBytes());
  copy[copy.length - 1] = copy[copy.length - 1]! ^ 0xff;
  return copy;
}

/** A plain companion article (no asset refs) — the "others import" probe. */
function plainArticle(id = "art-plain-rt02"): CanonicalArticle {
  return ArticleSchema.parse({
    id,
    revision: 1,
    lang: "en",
    provenance: {
      title: "Plain Companion Article",
      retrievedAt: "2026-08-31T00:00:00.000Z",
      originalHtmlHash: "sha256:" + "f".repeat(64),
    },
    blocks: [
      {
        kind: "paragraph",
        content: [{ text: "Plain prose without any figure references.", marks: [] }],
      },
    ],
    footnotes: [],
  });
}

/** Build a REAL v4 bundle zip: schema-parsed envelope + honestly-computed
 * manifest (incl. the assets block) + raw asset entries. `omitEntries`
 * drops matching entry names from the zip (the missing-entry vectors). */
async function v4BundleFile(
  articles: CanonicalArticle[],
  assetSpecs: Array<{
    articleId: string;
    assetId: string;
    bytes: Uint8Array<ArrayBuffer>;
  }>,
  opts: { omitEntries?: string[] } = {},
): Promise<File> {
  const assets = [];
  for (const spec of assetSpecs) {
    assets.push({
      articleId: spec.articleId,
      assetId: spec.assetId,
      contentType: "image/png" as const,
      byteLength: spec.bytes.byteLength,
      sha256: await sha256Hex(spec.bytes),
      entry: `assets/${spec.articleId}/${spec.assetId}`,
    });
  }
  const bundle = ExportBundleSchema.parse({
    schemaVersion: 4 as const,
    exportedAt: "2026-08-31T00:00:00.000Z",
    appVersion: "test",
    articles,
    locations: [],
    highlights: [],
    notes: [],
    preferences: {
      schemaVersion: 2 as const,
      font: "serif" as const,
      size: 18 as const,
      measure: 58 as const,
      spacing: "comfortable" as const,
      theme: "sepia" as const,
      readingMode: "paginated" as const,
    },
    fixtureIds: [],
    books: [],
    assets,
  });
  const manifest = await computeManifest(bundle);
  const entries: Record<string, Uint8Array> = {
    "bundle.json": bundleJsonOf(JSON.parse(JSON.stringify(bundle))),
    "manifest.json": bundleJsonOf(manifest),
  };
  const omitted = new Set(opts.omitEntries ?? []);
  for (const spec of assetSpecs) {
    const entry = `assets/${spec.articleId}/${spec.assetId}`;
    if (!omitted.has(entry)) entries[entry] = spec.bytes;
  }
  return new File([zipSync(entries)], "v4.zip");
}

/** Patch the zip CENTRAL DIRECTORY's declared uncompressed size for one
 * entry — the 09-04 bomb technique (fflate's filter reads exactly this
 * metadata value and skips the entry without ever inflating it). */
function patchDeclaredUncompressedSize(
  zip: Uint8Array<ArrayBuffer>,
  entryName: string,
  newSize: number,
): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(zip); // own copy
  const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);
  let e = out.length - 22;
  for (; e >= 0; --e) {
    if (dv.getUint32(e, true) === 0x06054b50) break;
  }
  if (e < 0) throw new Error("EOCD not found");
  const count = dv.getUint16(e + 8, true);
  let o = dv.getUint32(e + 16, true);
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

const ALL_SKIP: Overrides = {
  book: "skip",
  "article-revision": "skip",
  "article-content-divergence": "skip",
  "article-metadata-override": "skip",
  "highlight-id": "skip",
  "note-id": "skip",
  location: "skip",
};

describe("import gates — bombs, tampering, limits (20-05 Task 2)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("a bomb DECLARING an over-cap originalSize on an asset entry is filtered: never-throw, the referencing article dangles, others import", async () => {
    const { validate, detect, resolve, apply } = await loadGates();
    const { db } = await loadDb();

    const bytes = tinyPngBytes();
    const file = await v4BundleFile(
      [figureArticle(), plainArticle()],
      [{ articleId: FIGURE_ARTICLE_ID, assetId: FIGURE_ASSET_ID, bytes }],
    );
    // Bomb the ASSET entry (not bundle.json): fflate's filter skips it, so
    // the validated asset set loses the row and the figure article's ref
    // dangles — calmly, inside the ok result (never-throw).
    const zipBytes = new Uint8Array(await file.arrayBuffer());
    const bombed = patchDeclaredUncompressedSize(
      zipBytes,
      FIGURE_ENTRY,
      200_000_001,
    );
    const result = await validate(new File([bombed], "v4.zip"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.assets).toEqual([]);

    const preview = await detect(result.bundle, result.assets);
    expect(preview.danglingAssetArticles).toBe(1);
    const plan = await resolve(result.bundle, preview, ALL_SKIP, false, undefined, result.assets);
    await apply(plan);
    // The plain article imported; the figure article did NOT; zero rows in
    // the assets store (no silent placeholder-rewrite — the honest skip).
    expect(await db.articles.get("art-plain-rt02")).toBeDefined();
    expect(await db.articles.get(FIGURE_ARTICLE_ID)).toBeUndefined();
    expect(await db.assets.count()).toBe(0);
  });

  it("a present-but-tampered asset entry (same length, different bytes than the meta sha256) refuses corrupted with failedBlocks [assets]", async () => {
    const { validate } = await loadGates();
    const honestBytes = tinyPngBytes();
    const file = await v4BundleFile(
      [figureArticle()],
      [{ articleId: FIGURE_ARTICLE_ID, assetId: FIGURE_ASSET_ID, bytes: honestBytes }],
    );
    // The transit-tampering vector: a WELL-FORMED zip whose asset entry
    // holds different bytes of the SAME LENGTH — only the importer's
    // sha256-over-entry-bytes comparison can catch it (T-20-18).
    const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
    const tamperedBytes = tinyPngBytes2(); // same length, flipped byte
    const result = await validate(
      new File(
        [
          zipSync({
            "bundle.json": entries["bundle.json"]!,
            "manifest.json": entries["manifest.json"]!,
            [FIGURE_ENTRY]: tamperedBytes,
          }),
        ],
        "v4.zip",
      ),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal).toEqual({
        kind: "corrupted",
        failedBlocks: ["assets"],
      });
    }
  });

  it("per-asset byte cap and per-article total budget refuse calmly via the corrupted channel (meta-level, no allocation)", async () => {
    const { validate } = await loadGates();
    const bytes = tinyPngBytes();

    // (a) meta.byteLength lies above MAX_ASSET_BYTES (16 MiB) — refused
    // from the metadata alone, before any entry read.
    const file = await v4BundleFile(
      [figureArticle()],
      [{ articleId: FIGURE_ARTICLE_ID, assetId: FIGURE_ASSET_ID, bytes }],
    );
    const bundleJson = JSON.parse(
      strFromU8(unzipSync(new Uint8Array(await file.arrayBuffer()))["bundle.json"]!),
    ) as { assets: Array<Record<string, unknown>> };
    bundleJson.assets[0]!.byteLength = 16 * 1024 * 1024 + 1;
    const manifest = await computeManifest(ExportBundleSchema.parse(bundleJson));
    const perAsset = await validate(
      new File(
        [
          zipSync({
            "bundle.json": bundleJsonOf(bundleJson),
            "manifest.json": bundleJsonOf(manifest),
            [FIGURE_ENTRY]: bytes,
          }),
        ],
        "v4.zip",
      ),
    );
    expect(perAsset.ok).toBe(false);
    if (!perAsset.ok) {
      expect(perAsset.refusal).toEqual({
        kind: "corrupted",
        failedBlocks: ["assets"],
      });
    }

    // (b) Total budget: eleven metas under the per-asset cap whose summed
    // byteLengths exceed MAX_ARTICLE_ASSET_BYTES (150 MiB) — each 14 MiB,
    // sum 154 MiB (T-20-19).
    const specs = Array.from({ length: 11 }, (_, i) => ({
      articleId: FIGURE_ARTICLE_ID,
      assetId: `img-${(i + 1).toString().padStart(12, "0")}`,
      bytes,
    }));
    expect(specs[0]!.assetId).toBe("img-000000000001");
    expect(specs[10]!.assetId).toMatch(/^img-[a-z0-9]{12}$/);
    const budgetFile = await v4BundleFile([figureArticle()], specs);
    const budgetJson = JSON.parse(
      strFromU8(unzipSync(new Uint8Array(await budgetFile.arrayBuffer()))["bundle.json"]!),
    ) as { assets: Array<Record<string, unknown>> };
    for (const meta of budgetJson.assets) meta.byteLength = 14 * 1024 * 1024;
    const budgetManifest = await computeManifest(
      ExportBundleSchema.parse(budgetJson),
    );
    const budgetResult = await validate(
      new File(
        [
          zipSync({
            "bundle.json": bundleJsonOf(budgetJson),
            "manifest.json": bundleJsonOf(budgetManifest),
            ...Object.fromEntries(
              specs.map((s) => [`assets/${s.articleId}/${s.assetId}`, s.bytes]),
            ),
          }),
        ],
        "v4.zip",
      ),
    );
    expect(budgetResult.ok).toBe(false);
    if (!budgetResult.ok) {
      expect(budgetResult.refusal).toEqual({
        kind: "corrupted",
        failedBlocks: ["assets"],
      });
    }
  });

  it("a non-canonical meta.entry (free-text path) refuses corrupted — entry names are service-generated only (T-20-20)", async () => {
    const { validate } = await loadGates();
    const bytes = tinyPngBytes();
    const file = await v4BundleFile(
      [figureArticle()],
      [{ articleId: FIGURE_ARTICLE_ID, assetId: FIGURE_ASSET_ID, bytes }],
    );
    const bundleJson = JSON.parse(
      strFromU8(unzipSync(new Uint8Array(await file.arrayBuffer()))["bundle.json"]!),
    ) as { assets: Array<Record<string, unknown>> };
    // A path that still matches the schema regex but is NOT the canonical
    // construction from the row's own ids.
    bundleJson.assets[0]!.entry = `assets/other-article/${FIGURE_ASSET_ID}`;
    const manifest = await computeManifest(ExportBundleSchema.parse(bundleJson));
    const result = await validate(
      new File(
        [
          zipSync({
            "bundle.json": bundleJsonOf(bundleJson),
            "manifest.json": bundleJsonOf(manifest),
            [FIGURE_ENTRY]: bytes,
          }),
        ],
        "v4.zip",
      ),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal).toEqual({
        kind: "corrupted",
        failedBlocks: ["assets"],
      });
    }
  });
});

describe("no-broken-refs gate + conflict ride + apply (20-05 Task 2)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  it("a dangling ref (no meta entry at all) skips the article with the preview warning count; others import", async () => {
    const { validate, detect, resolve, apply } = await loadGates();
    const { db } = await loadDb();

    // assets: [] — the figure article's ref resolves to nothing.
    const file = await v4BundleFile([figureArticle(), plainArticle()], []);
    const result = await validate(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const preview = await detect(result.bundle, result.assets);
    expect(preview.danglingAssetArticles).toBe(1);
    // The dangling article is not counted as "new" (it will not import).
    expect(preview.added.articles).toBe(1);

    const plan = await resolve(result.bundle, preview, ALL_SKIP, false, undefined, result.assets);
    expect(plan.skipped.articles).toBe(1);
    await apply(plan);
    expect(await db.articles.get("art-plain-rt02")).toBeDefined();
    expect(await db.articles.get(FIGURE_ARTICLE_ID)).toBeUndefined();
    expect(await db.assets.count()).toBe(0);
  });

  it("an incoming-wins article replaces its old asset rows in-transaction (upsert-replacement from 20-03)", async () => {
    const { validate, detect, resolve, apply } = await loadGates();
    const { db } = await loadDb();

    // LOCAL: article at revision 1 with an OLD asset row (different assetId).
    await db.articles.put(figureArticle());
    const oldBytes = tinyPngBytes2();
    await db.assets.put({
      articleId: FIGURE_ARTICLE_ID,
      assetId: "img-fedcba987654",
      contentType: "image/png",
      byteLength: oldBytes.byteLength,
      data: new Blob([oldBytes], { type: "image/png" }),
      createdAt: "2026-08-30T00:00:00.000Z",
    });

    // BUNDLE: revision 2 (a different content hash) carrying the NEW asset.
    const refreshed = figureArticleAtRevision(2);
    const newBytes = tinyPngBytes();
    const file = await v4BundleFile(
      [refreshed],
      [{ articleId: FIGURE_ARTICLE_ID, assetId: FIGURE_ASSET_ID, bytes: newBytes }],
    );
    const result = await validate(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const preview = await detect(result.bundle, result.assets);
    const plan = await resolve(
      result.bundle,
      preview,
      { ...ALL_SKIP, "article-revision": "overwrite" },
      false,
      undefined,
      result.assets,
    );
    expect(plan.assetsToWrite).toHaveLength(1);
    await apply(plan);

    // The article advanced; the OLD asset row is GONE (replaced, not
    // accumulated); the NEW row holds the bundle's bytes exactly.
    expect((await db.articles.get(FIGURE_ARTICLE_ID))?.revision).toBe(2);
    expect(await db.assets.count()).toBe(1);
    const row = await db.assets.get([FIGURE_ARTICLE_ID, FIGURE_ASSET_ID]);
    expect(row).toBeDefined();
    expect(row!.byteLength).toBe(newBytes.byteLength);
    const stored = new Uint8Array(await row!.data.arrayBuffer());
    expect(Array.from(stored)).toEqual(Array.from(newBytes));
  });

  it("an injected mid-transaction failure rolls back articles AND assets — the old asset row survives", async () => {
    const { validate, detect, resolve } = await loadGates();
    const { db } = await loadDb();

    await db.articles.put(figureArticle());
    const oldBytes = tinyPngBytes2();
    await db.assets.put({
      articleId: FIGURE_ARTICLE_ID,
      assetId: "img-fedcba987654",
      contentType: "image/png",
      byteLength: oldBytes.byteLength,
      data: new Blob([oldBytes], { type: "image/png" }),
      createdAt: "2026-08-30T00:00:00.000Z",
    });

    const refreshed = figureArticleAtRevision(2);
    const file = await v4BundleFile(
      [refreshed],
      [{ articleId: FIGURE_ARTICLE_ID, assetId: FIGURE_ASSET_ID, bytes: tinyPngBytes() }],
    );
    const result = await validate(file);
    if (!result.ok) throw new Error("expected ok");
    const preview = await detect(result.bundle, result.assets);
    const plan = await resolve(
      result.bundle,
      preview,
      { ...ALL_SKIP, "article-revision": "overwrite" },
      false,
      undefined,
      result.assets,
    );

    // Inject a creating-hook failure on the incoming asset put — the throw
    // must unwind the WHOLE seven-table transaction (T-20-22).
    const hook = (_key: unknown, obj: { assetId?: string }): void => {
      if (obj?.assetId === FIGURE_ASSET_ID) {
        throw new Error("injected asset-put failure");
      }
    };
    db.assets.hook("creating", hook);
    try {
      const { applyImport } = await loadService();
      await expect(applyImport(plan)).rejects.toThrow("injected asset-put failure");
    } finally {
      db.assets.hook("creating").unsubscribe(hook);
    }

    // FULL rollback: the local article + OLD asset row are untouched.
    expect((await db.articles.get(FIGURE_ARTICLE_ID))?.revision).toBe(1);
    expect(await db.assets.count()).toBe(1);
    expect(await db.assets.get([FIGURE_ARTICLE_ID, "img-fedcba987654"])).toBeDefined();
  });

  it("an identical article (same id+revision+hash) is a calm no-op — its local assets stay untouched", async () => {
    const { validate, detect, resolve, apply } = await loadGates();
    const { db } = await loadDb();

    // LOCAL: the article + its asset row, stamped at a known time.
    await db.articles.put(figureArticle());
    const localBytes = tinyPngBytes();
    await db.assets.put({
      articleId: FIGURE_ARTICLE_ID,
      assetId: FIGURE_ASSET_ID,
      contentType: "image/png",
      byteLength: localBytes.byteLength,
      data: new Blob([localBytes], { type: "image/png" }),
      createdAt: "2026-08-30T00:00:00.000Z",
    });

    // BUNDLE: the IDENTICAL article + the same asset (same content-hash id).
    const file = await v4BundleFile(
      [figureArticle()],
      [{ articleId: FIGURE_ARTICLE_ID, assetId: FIGURE_ASSET_ID, bytes: localBytes }],
    );
    const result = await validate(file);
    if (!result.ok) throw new Error("expected ok");
    const preview = await detect(result.bundle, result.assets);
    expect(preview.danglingAssetArticles).toBe(0);
    const plan = await resolve(result.bundle, preview, ALL_SKIP, false, undefined, result.assets);
    expect(plan.articlesToWrite).toHaveLength(0);
    expect(plan.assetsToWrite).toHaveLength(0);
    await apply(plan);

    // The local row is byte-untouched — createdAt proves no re-put.
    const row = await db.assets.get([FIGURE_ARTICLE_ID, FIGURE_ASSET_ID]);
    expect(row?.createdAt).toBe("2026-08-30T00:00:00.000Z");
    expect(row?.byteLength).toBe(localBytes.byteLength);
  });

  it("orphan asset entries (no referencing article) drop inertly — the assets store gains nothing", async () => {
    const { validate, detect, resolve, apply } = await loadGates();
    const { db } = await loadDb();

    // A bundle whose only article has NO figure; the asset belongs to an
    // article id that never rides.
    const file = await v4BundleFile(
      [plainArticle()],
      [{ articleId: FIGURE_ARTICLE_ID, assetId: FIGURE_ASSET_ID, bytes: tinyPngBytes() }],
    );
    const result = await validate(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The entry itself validated fine (bytes + sha)…
    expect(result.assets).toHaveLength(1);

    const preview = await detect(result.bundle, result.assets);
    expect(preview.danglingAssetArticles).toBe(0);
    const plan = await resolve(result.bundle, preview, ALL_SKIP, false, undefined, result.assets);
    expect(plan.assetsToWrite).toHaveLength(0); // …but nothing references it
    await apply(plan);
    expect(await db.articles.get("art-plain-rt02")).toBeDefined();
    expect(await db.assets.count()).toBe(0);
  });
});
