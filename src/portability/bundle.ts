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

export const ExportBundleSchema = z.object({
  // PORT-01/02 versioning hook — the 1|2 union reads both generations;
  // v3+ forward-rejects (D9-04).
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
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
