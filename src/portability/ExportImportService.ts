// src/portability/ExportImportService.ts
// Plan 09-04 — the PORT-01/PORT-02 service core: the serialize →
// parse/validate → atomic-apply pipeline over the 09-01..09-03 substrate.
//
// Locked decisions (09-CONTEXT.md):
//   - D9-01: the bundle is a ZIP carrying bundle.json + manifest.json.
//   - D9-02: fflate is the zip library; fflate exposes entry names
//     unsanitized, so the Zip Slip guard (zipSlip.ts) is app-level and runs
//     on EVERY entry before any use (wired into validateBundle below).
//   - D9-03: SHA-256 integrity manifest; the importer recomputes per block
//     and refuses on mismatch — the transaction never starts.
//   - D9-04: schemaVersion z.literal(1); a NEWER schemaVersion is peeked
//     BEFORE the full schema parse and refused calmly (no Zod error wall,
//     no silent partial import).
//   - D9-05: export delivery (Blob + <a download>) lives in download.ts +
//     the 09-05 UI — this module produces the bytes.
//   - D9-12: preferences are ALWAYS exported (always-present in the
//     envelope); the apply choice is made at import.
//
// Pitfalls honored (09-RESEARCH.md):
//   - Pitfall 11 #2 (validate-before-write): validateBundle surfaces ALL
//     Zod issues as a list, never only the first, and every refusal returns
//     BEFORE any transaction can start.
//   - Pitfall 11 #7 / SC#4 (data minimization): page numbers and any
//     page-derived data never enter the bundle — offsets are grapheme
//     positions into normalizeText by construction (the record schemas
//     carry no page field at all).
//   - Pitfall 1 (no async-non-Dexie work inside the Dexie transaction):
//     applyImport's closure contains ONLY awaited db.*.put calls; the
//     ResolvedImportPlan from 09-03 is fully-computed data.
//
// fflate import discipline (D9-02, tree-shaking per the fflate README):
// ONLY the four named identifiers zipSync, unzipSync, strToU8, strFromU8
// may ever be imported from "fflate" in src/ — nothing else.
import { zipSync, strToU8 } from "fflate";
import { fixtures } from "../fixtures";
import { dexieLibrarySource } from "../ingestion/LibrarySource";
import { loadAllHighlights } from "../persistence/highlightsStore";
import { loadAllNotes } from "../persistence/notesStore";
import { loadAllLocations } from "../persistence/locationStore";
import { loadSettings } from "../persistence/settingsStore";
import { DEFAULT_SETTINGS } from "../settings/defaults";
import { ExportBundleSchema, resolveAppVersion } from "./bundle";
import { computeManifest } from "./manifest";

// ── Export side (PORT-01) ────────────────────────────────────────────────────

/**
 * buildBundleBytes — read the five record sources through the Zod-validated
 * loaders (STATE-04 — never raw db.* reads, never N+1 per-article loaders),
 * derive fixtureIds, self-check the envelope, and zip bundle.json (pretty,
 * human-debuggable — negligible after DEFLATE) + manifest.json (minified).
 *
 * fixtureIds (D9-04): the ids of bundled fixtures the reader's records
 * actually reference — highlights.articleId, locations.articleId, and notes
 * via their OWNING highlight's articleId (notes reference highlights, not
 * articles). Fixtures themselves NEVER serialize (ARCHITECTURE L615); on
 * import, 09-03's Pattern 8 lookup re-resolves fixture-keyed highlights
 * against the receiving build's bundled fixture copies.
 *
 * The ExportBundleSchema.parse call is the exporter's SELF-CHECK: it
 * validates its own output before zipping. A throw here is an export-side
 * bug surfaced to the caller (the 09-05 UI catches and reports calmly) —
 * it can never produce a half-valid bundle.
 */
export async function buildBundleBytes(): Promise<Uint8Array> {
  const [articles, highlights, notes, locations, settingsResult] =
    await Promise.all([
      dexieLibrarySource.list(), // Dexie articles ONLY — fixtures never ride
      loadAllHighlights(),
      loadAllNotes(),
      loadAllLocations(),
      loadSettings(), // ok ⇒ settings (first run yields DEFAULT_SETTINGS);
      // !ok ⇒ storage trouble — still export, with defaults (D9-12
      // always-present; the reader's records must not be hostage to a
      // settings-read failure).
    ]);
  const preferences = settingsResult.ok
    ? settingsResult.settings
    : DEFAULT_SETTINGS;

  // fixtureIds: referenced article ids ∩ bundled fixture ids.
  const highlightById = new Map(highlights.map((h) => [h.id, h]));
  const referenced = new Set<string>();
  for (const h of highlights) referenced.add(h.articleId);
  for (const l of locations) referenced.add(l.articleId);
  for (const n of notes) {
    const owner = highlightById.get(n.highlightId);
    if (owner !== undefined) referenced.add(owner.articleId);
  }
  const fixtureIds = fixtures
    .filter((f) => referenced.has(f.id))
    .map((f) => f.id);

  const bundle = ExportBundleSchema.parse({
    schemaVersion: 1 as const,
    exportedAt: new Date().toISOString(),
    appVersion: resolveAppVersion(),
    articles,
    locations,
    highlights,
    notes,
    preferences,
    fixtureIds,
  });

  const manifest = await computeManifest(bundle);
  return zipSync({
    "bundle.json": strToU8(JSON.stringify(bundle, null, 2)),
    "manifest.json": strToU8(JSON.stringify(manifest)),
  });
}
