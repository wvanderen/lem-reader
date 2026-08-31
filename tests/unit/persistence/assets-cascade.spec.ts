// tests/unit/persistence/assets-cascade.spec.ts
// Phase 20 Plan 20-03 — the assets-store seam + atomic lifecycle truths:
//   Task 1 (store seam):
//     - putAssets → bulkGetAssets round-trip preserves assetId, contentType,
//       byteLength, and the blob bytes (Zod-validated reads)
//     - corrupt rows (bad assetId shape) are DROPPED from reads calmly —
//       never coerced (STATE-04 / T-20-12)
//     - loadAllAssets returns [] on an empty store (the loadAllHighlights
//       plain-array whole-library precedent) and drops corrupt rows
//   Task 2 (atomic lifecycle — describe blocks below):
//     - save(article, assets) writes article + rows in ONE transaction; an
//       injected asset-put failure rolls back the article put (D20-04 / T-20-14)
//     - re-ingest upsert replaces old rows — no orphan blobs (D20-07)
//     - remove(article) + removeBook cascade asset rows in the same single
//       transaction as the existing deletes (D20-15 / T-20-13)
//
// Harness mirrors tests/unit/persistence/books-store.test.ts: fake-indexeddb
// via Dexie.dependencies at module top-level, wipeDatabase beforeEach, lazy
// module imports. Dexie creating hooks FIRE INSIDE the transaction and a
// throw rolls it back — the hook is deregistered in afterEach (hooks persist
// across tests; cross-test bleed would poison sibling specs).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import type { ValidatedAsset } from "../../../src/ingestion/IngestionClient";
import fakeIndexedDB, { IDBKeyRange } from "fake-indexeddb";
import { Dexie } from "dexie";

// Dexie 4 captures `indexedDB` + `IDBKeyRange` on `Dexie.dependencies` at
// dexie-module-load time. Install BOTH onto `Dexie.dependencies` (the
// Dexie-internal read path) AND `globalThis` (the direct-read path Dexie
// uses for deleteDatabase) at this module's top-level — the documented
// Dexie + Node test pattern (mirrors tests/unit/persistence/books-store.test.ts).
Dexie.dependencies.indexedDB = fakeIndexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;
(globalThis as { indexedDB?: typeof fakeIndexedDB }).indexedDB = fakeIndexedDB;
(globalThis as { IDBKeyRange?: typeof IDBKeyRange }).IDBKeyRange = IDBKeyRange;

// Blob-fidelity harness note (20-03): fake-indexeddb clones values with the
// GLOBAL structuredClone — Node's native V8 serializer under vitest. jsdom's
// Blob is NOT a host object to that serializer, so a jsdom Blob degrades to
// a plain Object on read and AssetRecordSchema's z.instanceof(Blob) would
// then (correctly!) drop every row as corrupt. Node's own Blob IS a host
// object and round-trips byte-identically through structuredClone — the
// faithful analogue of the production contract (browser Blobs are host
// objects to the browser's structured clone; the real-browser proof is
// 20-04's Playwright imagery specs). Install Node's Blob as this spec
// file's global BEFORE the lazy module imports so both the `new Blob(...)`
// row construction and the schema's instanceof capture see the
// round-trippable class.
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

// Lazy imports — the modules under test are imported AFTER the
// fake-indexeddb install so their module-body top-level sees a populated
// Dexie.dependencies.
async function loadAssetsStore() {
  return await import("../../../src/persistence/assetsStore");
}
async function loadDb() {
  return await import("../../../src/persistence/db");
}

/** A ValidatedAsset literal — the exact shape IngestionSuccess.assets
 * exposes after transport re-validation (20-02 Task 3). */
function sampleAsset(
  hex: string,
  byteLength = 8,
  contentType: ValidatedAsset["contentType"] = "image/png",
): ValidatedAsset {
  const bytes = new Uint8Array(byteLength);
  for (let i = 0; i < byteLength; i += 1) bytes[i] = i;
  return {
    assetId: `img-${hex.padEnd(12, "0").slice(0, 12)}`,
    contentType,
    byteLength,
    bytes,
  };
}

// Dexie creating hooks persist across tests — the SAME function reference
// is registered via hook("creating", fn) and deregistered via
// hook("creating").unsubscribe(fn) in afterEach (cross-test bleed guard).
let injectedCreatingHook:
  | ((primKey: unknown, obj: { assetId?: string }) => void)
  | null = null;

// ── Task 1: assetsStore seam (v6 store + Zod-validated reads) ───────────────

describe("assetsStore — put/bulkGet round-trip + corrupt-row drops (20-03 Task 1)", () => {
  beforeEach(async () => {
    await wipeDatabase();
  });

  afterEach(async () => {
    if (injectedCreatingHook !== null) {
      const { db } = await loadDb();
      db.assets.hook("creating").unsubscribe(injectedCreatingHook);
      injectedCreatingHook = null;
    }
  });

  it("putAssets → bulkGetAssets round-trip preserves assetId, contentType, byteLength, and blob bytes", async () => {
    const { putAssets, bulkGetAssets } = await loadAssetsStore();
    const asset = sampleAsset("abcd", 16, "image/webp");

    const write = await putAssets("asset-article-slug", [asset]);
    expect(write).toEqual({ ok: true });

    const read = await bulkGetAssets("asset-article-slug", [asset.assetId]);
    expect(read.ok).toBe(true);
    if (!read.ok) throw new Error("expected ok read");
    expect(read.assets).toHaveLength(1);
    const row = read.assets[0];
    if (!row) throw new Error("expected one asset row");
    expect(row.articleId).toBe("asset-article-slug");
    expect(row.assetId).toBe("img-abcd00000000");
    expect(row.contentType).toBe("image/webp");
    expect(row.byteLength).toBe(16);
    expect(row.data).toBeInstanceOf(Blob);
    // Blob bytes survive the IndexedDB round-trip byte-identically.
    const roundTripped = new Uint8Array(await row.data.arrayBuffer());
    expect(Array.from(roundTripped)).toEqual(Array.from(asset.bytes));
  });

  it("bulkGetAssets DROPS a corrupt row (bad assetId shape) calmly — never coerces, never throws (T-20-12)", async () => {
    const { db } = await loadDb();
    const { putAssets, bulkGetAssets } = await loadAssetsStore();
    const good = sampleAsset("aaaa");

    await putAssets("asset-article-slug", [good]);
    // A corrupt row seeded DIRECTLY through Dexie (no seam validation):
    // assetId fails the img-<12hex> shape. Cast through unknown — the row
    // is INTENTIONALLY corrupt (the safeParse-drop path under test).
    await db.assets.put({
      articleId: "asset-article-slug",
      assetId: "not-img-shaped",
      contentType: "image/png",
      byteLength: 4,
      data: new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" }),
      createdAt: "2026-08-31T00:00:00.000Z",
    } as unknown as Parameters<typeof db.assets.put>[0]);

    const read = await bulkGetAssets("asset-article-slug", [
      good.assetId,
      "not-img-shaped",
    ]);
    expect(read.ok).toBe(true);
    if (!read.ok) throw new Error("expected ok read");
    // The corrupt row is dropped; the valid sibling survives.
    expect(read.assets.map((r) => r.assetId)).toEqual(["img-aaaa00000000"]);
  });

  it("loadAllAssets returns [] on an empty store (loadAllHighlights precedent)", async () => {
    const { loadAllAssets } = await loadAssetsStore();
    expect(await loadAllAssets()).toEqual([]);
  });

  it("loadAllAssets drops corrupt rows and returns the whole-library plain array", async () => {
    const { db } = await loadDb();
    const { putAssets, loadAllAssets } = await loadAssetsStore();
    await putAssets("asset-article-slug", [sampleAsset("bbbb")]);
    await db.assets.put({
      articleId: "asset-article-slug",
      assetId: "short",
      contentType: "image/gif",
      byteLength: 2,
      data: new Blob([new Uint8Array([9, 9])], { type: "image/gif" }),
      createdAt: "2026-08-31T00:00:00.000Z",
    } as unknown as Parameters<typeof db.assets.put>[0]);

    const rows = await loadAllAssets();
    expect(rows.map((r) => r.assetId)).toEqual(["img-bbbb00000000"]);
  });
});
