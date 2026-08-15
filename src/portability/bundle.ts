// src/portability/bundle.ts
// Plan 09-01 Task 2 — the versioned export/import bundle envelope.
//
// Locked decisions (09-CONTEXT.md):
//   - D9-01: the bundle is a ZIP archive (lem-reader-bundle-v1.zip) carrying
//     bundle.json (this envelope) + manifest.json (SHA-256 integrity).
//   - D9-04: envelope shape follows ARCHITECTURE Pattern 7. schemaVersion
//     z.literal(1) is the PORT-01/02 versioning hook — an importer that sees
//     a higher schemaVersion refuses ("exported by a newer Lem Reader
//     version"); NO silent partial import. appVersion is diagnostic only.
//   - D9-12: preferences are ALWAYS present in the bundle (the apply choice
//     is made at import, not export).
//   - D9-01/D9-04 note: books/articleTags blocks are deliberately ABSENT —
//     no Book record exists until Phase 12, and tags already travel inside
//     each ArticleSchema.tags (denormalized D8-05). Absence is the
//     forward-compatible form (09-RESEARCH Pattern 1 recommendation).
//
// This module COMPOSES the existing record schemas — no record shape is
// re-declared here (REUSE-DO-NOT-FORK; the schemas are the STATE-04 trust
// boundary shared with every Dexie read/write path).
import { z } from "zod";
import {
  ArticleSchema,
  HighlightRecordSchema,
  LocationRecordSchema,
  NoteRecordSchema,
  ReaderSettingsSchema,
} from "../content/schema";

export const ExportBundleSchema = z.object({
  // PORT-01/02 versioning hook — forward-reject v2+ (D9-04).
  schemaVersion: z.literal(1),
  exportedAt: z.string().datetime(), // ISO-8601
  appVersion: z.string(), // diagnostic only (D9-04)
  articles: z.array(ArticleSchema), // Dexie articles ONLY — fixtures never serialize
  locations: z.array(LocationRecordSchema),
  highlights: z.array(HighlightRecordSchema),
  notes: z.array(NoteRecordSchema),
  preferences: ReaderSettingsSchema, // always present (D9-12)
  fixtureIds: z.array(z.string()), // ids of bundled fixtures the reader's records reference
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
