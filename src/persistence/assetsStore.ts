// src/persistence/assetsStore.ts
// Phase 20 Plan 20-03 Task 1 — persistence seam for article-owned image
// asset blobs (IMG-03/IMG-04, D20-15). Mirrors the booksStore /
// highlightsStore seam conventions: header citing the locked decisions,
// Zod-at-boundary on every read, calm corrupt-row drop (STATE-04),
// classifyStorageError routing on Dexie-level failures.
//
// Contracts (20-03-PLAN.md §must_haves truths):
//   1. Asset rows are ARTICLE-OWNED (D20-15): their lifecycle is exactly
//      the owning article's — saved together, replaced together on
//      re-ingest, deleted together. The atomic save/upsert/cascade
//      TRANSACTIONS live in DexieLibrarySource.save/remove +
//      booksStore.saveBook/removeBook (Task 2); this seam provides the
//      standalone store primitives that 20-04 (renderer reads via
//      bulkGetAssets) and 20-05 (portability reads via loadAllAssets)
//      consume. No refcounting/GC machinery — article-owned rows only.
//   2. Zod-at-boundary on read (STATE-04 / T-20-12): every row passes
//      AssetRecordSchema.safeParse; corrupt rows are dropped calmly —
//      never coerced — so a tampered/drifted row renders the placeholder
//      (20-04), never a bad blob.
//   3. putAssets stamps createdAt OUTSIDE any transaction and keeps the
//      transaction closure puts-only (the saveBook stamp-before-transaction
//      discipline; no Zod, no crypto, no network inside — the 09-04 rule).
//
// Threat register (20-03-PLAN.md `<threat_model>`):
//   - T-20-12 (Tampering, tampered asset rows at read) → per-row
//     AssetRecordSchema.safeParse on every read; corrupt rows dropped
//     calmly (never coerced).
import { z } from "zod";
import { db } from "./db";
import type { AssetRecordRow } from "./db";
import { classifyStorageError } from "./errors";
import type { ValidatedAsset } from "../ingestion/IngestionClient";

/**
 * AssetRecordSchema — the Zod twin of AssetRecordRow (db.ts; the
 * HighlightRecordRow/HighlightRecordSchema discipline). `assetId` is the
 * assetRef BODY — `img-<12 lowercase hex>`, i.e. exactly the FigureBlock
 * `asset:img-…` reference minus the scheme prefix (the shared img-<12hex>
 * contract with src/content/schema.ts). `contentType` is the closed
 * five-type sniff gate (D20-10 — sniff over declaration); `data` is the
 * IndexedDB-native Blob (createObjectURL-direct, no ArrayBuffer copy).
 */
export const AssetRecordSchema = z.object({
  articleId: z.string().min(1),
  assetId: z.string().regex(/^img-[a-z0-9]{12}$/),
  contentType: z.enum([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/avif",
  ]),
  byteLength: z.number().int().min(1),
  data: z.instanceof(Blob),
  createdAt: z.string().datetime(), // ISO-8601
});

/**
 * Discriminated result of reading assets from Dexie.
 * - `ok: true`  → the read succeeded; corrupt rows were dropped (STATE-04).
 * - `ok: false` → recovery routing required; `reason` selects the surface
 *   (the BooksLoadResult / HighlightsLoadResult vocabulary — `corrupt` is
 *   reserved parity: per-row drops never surface it here).
 */
export type AssetsLoadResult =
  | { ok: true; assets: AssetRecordRow[] }
  | { ok: false; reason: "unavailable" | "corrupt" | "unupgradeable" };

/**
 * Discriminated result of a standalone asset write. `ok: false` carries the
 * classifyStorageError vocabulary so callers route recovery without try/
 * catch (the never-throw write seam; the ATOMIC article+asset transactions
 * in LibrarySource/booksStore intentionally let throws propagate instead —
 * a swallowed failure there would break rollback).
 */
export type AssetsWriteResult =
  | { ok: true }
  | { ok: false; reason: "unavailable" | "corrupt" | "unupgradeable" };

/**
 * putAssets — standalone write seam: build rows from ValidatedAsset inputs
 * and put them in ONE transaction over `db.assets`. `createdAt` is stamped
 * and every Blob is constructed BEFORE the transaction opens (the saveBook
 * stamp-before-transaction discipline — the closure stays a pure put
 * sequence). Inputs are validated by construction (the only producer is
 * IngestionClient's validateEnvelopeAssets chain — decode + byteLength
 * re-check + assetId re-hash; Pitfall 10). Never throws: Dexie-level
 * failures route through classifyStorageError into `{ok: false, reason}`.
 */
export async function putAssets(
  articleId: string,
  assets: ValidatedAsset[],
): Promise<AssetsWriteResult> {
  // Stamp + row-build OUTSIDE any transaction (puts-only closure rule).
  const createdAt = new Date().toISOString();
  const rows: AssetRecordRow[] = assets.map((asset) => ({
    articleId,
    assetId: asset.assetId,
    contentType: asset.contentType,
    byteLength: asset.byteLength,
    // TS 7 BlobPart strictness (the 09-01 BufferSource lesson): a view over
    // a generic ArrayBufferLike is not assignable — copy into a fresh
    // ArrayBuffer-backed Uint8Array (save-time copy, not hot; the Blob
    // constructor would copy the bytes anyway).
    data: new Blob([new Uint8Array(asset.bytes)], {
      type: asset.contentType,
    }),
    createdAt,
  }));
  try {
    await db.transaction("rw", db.assets, async () => {
      for (const row of rows) {
        await db.assets.put(row);
      }
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: classifyStorageError(e) };
  }
}

/**
 * bulkGetAssets — the per-article read (20-04's AssetProvider consumes
 * this): query the compound [articleId+assetId] primary keys as arrays
 * (the location [articleId+revision] precedent), then Zod-validate each
 * returned row. Missing keys resolve undefined (skipped — the placeholder
 * owns that surface); corrupt rows are dropped calmly (T-20-12). Never
 * throws (STATE-05): Dexie-level failures classify into `{ok: false}`.
 */
export async function bulkGetAssets(
  articleId: string,
  assetIds: string[],
): Promise<AssetsLoadResult> {
  try {
    const keys = assetIds.map(
      (assetId) => [articleId, assetId] as [string, string],
    );
    const rows = await db.assets.bulkGet(keys);
    const valid: AssetRecordRow[] = [];
    for (const row of rows) {
      if (!row) continue; // absent key → placeholder surface (20-04)
      const parsed = AssetRecordSchema.safeParse(row);
      if (parsed.success) {
        valid.push(parsed.data);
      }
      // else: drop the corrupt row silently — STATE-04 says never coerce.
    }
    return { ok: true, assets: valid };
  } catch (e) {
    return { ok: false, reason: classifyStorageError(e) };
  }
}

/**
 * loadAllAssets — the whole-library plain-array read (20-05's export side).
 * Mirrors loadAllHighlights (highlightsStore.ts) exactly: whole-store
 * toArray + per-row AssetRecordSchema.safeParse + silent corrupt-row drop
 * (one bad row must not block the reader's export) + a plain-array return.
 * This is deliberately NOT the per-article AssetsLoadResult union — the
 * export service owns error handling upstream (the loadAllHighlights
 * precedent).
 */
export async function loadAllAssets(): Promise<AssetRecordRow[]> {
  const rows = await db.assets.toArray();
  const valid: AssetRecordRow[] = [];
  for (const row of rows) {
    const parsed = AssetRecordSchema.safeParse(row);
    if (parsed.success) {
      valid.push(parsed.data);
    }
    // else: drop the corrupt row silently — STATE-04 says never coerce.
  }
  return valid;
}

/**
 * deleteAssetsForArticle — standalone wrapper over the `articleId` index
 * range delete (the exact operation the atomic cascades in
 * DexieLibrarySource.remove / removeBook / save's upsert replacement run
 * INSIDE their transactions via direct db.assets calls — exported here as
 * the calm standalone seam for callers outside those transactions). Never
 * throws: Dexie-level failures classify into `{ok: false, reason}`.
 */
export async function deleteAssetsForArticle(
  articleId: string,
): Promise<AssetsWriteResult> {
  try {
    await db.assets.where("articleId").equals(articleId).delete();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: classifyStorageError(e) };
  }
}
