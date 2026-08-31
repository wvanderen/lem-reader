// src/portability/bundle.ts
// Plan 09-01 Task 2 — the versioned export/import bundle envelope.
//
// Locked decisions (09-CONTEXT.md):
//   - D9-01: the bundle is a ZIP archive (lem-reader-bundle-v1.zip) carrying
//     bundle.json (this envelope) + manifest.json (SHA-256 integrity).
//   - D9-04: envelope shape follows ARCHITECTURE Pattern 7. schemaVersion
//     is the PORT-01/02 versioning hook (now the 1|2 union — see the Phase
//     12 note below) — an importer that sees a higher schemaVersion refuses
//     ("exported by a newer Lem Reader version"); NO silent partial import.
//     appVersion is diagnostic only.
//   - D9-12: preferences are ALWAYS present in the bundle (the apply choice
//     is made at import, not export).
//   - Phase 12 (Plan 12-07) — the Phase 9 books-absence note is now the
//     FILLED contract Pattern 7 anticipated: books ride the bundle. The
//     envelope widens additively per 12-RESEARCH Pattern 6: schemaVersion is
//     the 1|2 UNION (the ReaderSettingsSchema v1|v2 read precedent) — a v1
//     bundle (no books key) hydrates exactly as before, a v3+ bundle
//     forward-rejects (D9-04 preserved; the validateBundle peek threshold
//     moved to > 2), and writers emit schemaVersion 2 with an ALWAYS-present
//     books array (empty on book-free libraries — the field's presence is
//     the v2 write contract). Book rows compose BookSchema — the record
//     shape is never re-declared here — and their chapters ride `articles`
//     as ordinary articles (ingestionMeta.bookId survives serialization;
//     book tags travel inside BookSchema.tags exactly as article tags do).
//   - Phase 17 (Plan 17-04) — the union widens again on the same 12-07
//     discipline: schemaVersion is the 1|2|3 UNION. A v3 bundle carries
//     reader-owned metadata overrides (readerTitle/readerAuthor) inside
//     each article record via ArticleSchema composition — no separate
//     block (D17-12). v1/v2 bundles parse exactly as before; a v4+ bundle
//     forward-rejects (D9-04 preserved; the validateBundle peek threshold
//     moved to > 3), and writers emit schemaVersion 3
//     (ExportImportService.buildBundleBytes).
//   - Phase 20 (Plan 20-05) — the fourth application of the union
//     discipline: schemaVersion is the 1|2|3|4 UNION. A v4 bundle carries
//     image assets as raw zip entries at assets/<articleId>/<assetId> with
//     per-asset sha256 in the assets metadata array (IMG-04). v1/v2/v3
//     bundles parse exactly as before (assets hydrates to undefined); a
//     v5+ bundle forward-rejects (D9-04 preserved; the validateBundle peek
//     threshold moved to > 4), and writers emit schemaVersion 4 with an
//     ALWAYS-present assets array (empty on an asset-free library — the
//     field's presence is the v4 write contract, the books precedent).
//     The zip FILENAME stays lem-reader-bundle-v1.zip (D9-01 — the
//     filename is not the version contract).
//
// This module COMPOSES the existing record schemas — no record shape is
// re-declared here (REUSE-DO-NOT-FORK; the schemas are the STATE-04 trust
// boundary shared with every Dexie read/write path).
import { z } from "zod";
import {
  ArticleSchema,
  BookSchema,
  HighlightRecordSchema,
  LocationRecordSchema,
  NoteRecordSchema,
  ReaderSettingsSchema,
} from "../content/schema";

/**
 * AssetExportMeta — one exported image asset's metadata row (IMG-04 /
 * 20-RESEARCH Pattern 6). The RAW bytes never live in bundle.json — they
 * ride the zip as the `entry` named here, and the importer re-verifies
 * byteLength + sha256 against this metadata (mismatch → corrupted, the
 * never-throw refusal channel). Field notes:
 *   - assetId is the assetRef BODY (img-<12 lowercase hex> — the shared
 *     img-<12hex> contract with src/content/schema.ts assetRef and
 *     assetsStore's AssetRecordSchema; duplicated here as a VALUE-level
 *     regex because bundle.ts must stay free of persistence/db imports).
 *   - contentType is the closed five-type sniff gate (D20-08/D20-10) —
 *     the same set AssetRecordSchema locks.
 *   - sha256 is hex-64 lowercase of the entry's raw bytes.
 *   - entry is the canonical SERVICE-GENERATED zip path
 *     assets/<articleId>/<assetId>; the importer requires the exact
 *     canonical construction from the row's own ids (never trusts a
 *     bundle-supplied free-text path — T-20-20).
 */
export const AssetExportMetaSchema = z.object({
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
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  entry: z.string().regex(/^assets\/[^/]+\/img-[a-z0-9]{12}$/),
});
export type AssetExportMeta = z.infer<typeof AssetExportMetaSchema>;

export const ExportBundleSchema = z.object({
  // PORT-01/02 versioning hook — the 1|2|3|4 union reads all four
  // generations; v5+ forward-rejects (D9-04). Phase 17 (17-04): v3 carries
  // reader-owned metadata overrides (readerTitle/readerAuthor) inside each
  // article row via ArticleSchema composition (D17-12). Phase 20 (20-05):
  // v4 carries the assets metadata array (raw bytes ride the zip).
  schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  exportedAt: z.string().datetime(), // ISO-8601
  appVersion: z.string(), // diagnostic only (D9-04)
  articles: z.array(ArticleSchema), // Dexie articles ONLY — fixtures never serialize
  locations: z.array(LocationRecordSchema),
  highlights: z.array(HighlightRecordSchema),
  notes: z.array(NoteRecordSchema),
  preferences: ReaderSettingsSchema, // always present (D9-12)
  fixtureIds: z.array(z.string()), // ids of bundled fixtures the reader's records reference
  // Phase 12 (Plan 12-07) — absent on v1 bundles (hydrates to undefined);
  // ALWAYS present on v2 writes (empty array on book-free libraries).
  books: z.array(BookSchema).optional(),
  // Phase 20 (Plan 20-05) — absent on v1/v2/v3 bundles (hydrates to
  // undefined); ALWAYS present on v4 writes (empty array on asset-free
  // libraries — the presence-is-the-contract books precedent).
  assets: z.array(AssetExportMetaSchema).optional(),
});
export type ExportBundle = z.infer<typeof ExportBundleSchema>;

/** The D9-01 locked download filename for the whole-library zip export. */
export const BUNDLE_FILENAME = "lem-reader-bundle-v1.zip";

/**
 * resolveAppVersion — the bundle's diagnostic appVersion source (D9-04).
 * Under the Vite build the `__APP_VERSION__` identifier is define-replaced
 * (vite.config.ts reads package.json at config load — A3, no hardcoded
 * copy). Under vitest no define is applied, so the typeof guard yields
 * "dev" instead of a ReferenceError — the guard exists purely to keep unit
 * tests runnable; the field is diagnostic-only and no security decision
 * reads it (T-9-04).
 */
export function resolveAppVersion(): string {
  return typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
}
