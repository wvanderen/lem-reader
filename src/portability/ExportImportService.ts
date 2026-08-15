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
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { fixtures } from "../fixtures";
import { dexieLibrarySource } from "../ingestion/LibrarySource";
import { loadAllHighlights } from "../persistence/highlightsStore";
import { loadAllNotes } from "../persistence/notesStore";
import { loadAllLocations } from "../persistence/locationStore";
import { loadSettings } from "../persistence/settingsStore";
import { DEFAULT_SETTINGS } from "../settings/defaults";
import { ExportBundleSchema, resolveAppVersion } from "./bundle";
import type { ExportBundle } from "./bundle";
import { computeManifest } from "./manifest";
import type { Manifest } from "./manifest";
import { isSafeEntryName } from "./zipSlip";

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

// ── Import validation side (PORT-02, pre-write) ──────────────────────────────

/** The six calm-reportable refusal kinds (09-RESEARCH Code Examples). The
 * 09-05 UI maps each kind to one locked .status string — this union is the
 * entire failure vocabulary of the import pipeline. */
export type ImportRefusal =
  | { kind: "not-a-zip" }
  | { kind: "unsafe-entry"; name: string }
  | { kind: "missing-entry"; name: string }
  | { kind: "newer-schema-version"; bundleVersion: number }
  | { kind: "invalid"; issues: string[] } // ALL Zod issues, never just the first (Pitfall 11 #2)
  | { kind: "corrupted"; failedBlocks: string[] }; // manifest mismatches, by block name

/** validateBundle's result: the validated bundle + recomputed manifest, or
 * a specific refusal. The `{ ok, … } | { ok, refusal }` shape follows the
 * settingsStore/locationStore discriminated-result convention (never throw
 * to the reader). */
export type BundleValidationResult =
  | { ok: true; bundle: ExportBundle; manifest: Manifest }
  | { ok: false; refusal: ImportRefusal };

/** Decompression-bomb cap (T-9-02): an entry DECLARING an uncompressed
 * originalSize above this is never inflated — fflate's filter skips it
 * before any allocation. 200 MiB is far above any honest prototype-scale
 * bundle and far below memory trouble. */
const MAX_ENTRY_ORIGINAL_SIZE = 200_000_000;

/**
 * validateBundle — the pre-write validation pipeline, in this exact order
 * (each stage's refusal short-circuits everything after it — and NO stage
 * writes anything; the Dexie transaction in applyImport can only start
 * after this returns ok):
 *
 *   1. unzipSync over the file bytes with the fflate filter capping
 *      f.originalSize at MAX_ENTRY_ORIGINAL_SIZE (bomb guard). Any throw →
 *      not-a-zip.
 *   2. isSafeEntryName on EVERY entry key — one bad name refuses the WHOLE
 *      bundle (SC#2 hard gate; fflate exposes names unsanitized, D9-02).
 *   3. Required entries bundle.json + manifest.json → missing-entry.
 *   4. JSON.parse + PEEK schemaVersion: a number > 1 → newer-schema-version
 *      BEFORE the full schema parse (the calm refusal instead of a Zod
 *      error wall — 09-RESEARCH anti-pattern).
 *   5. ExportBundleSchema.safeParse → invalid with ALL issues mapped to
 *      "path: message" strings.
 *   6. computeManifest over the parsed bundle, compared block-by-block
 *      against the claimed manifest → corrupted with the failed names.
 *
 * Prototype-pollution safety (T-9-14): JSON.parse itself does not invoke
 * setters, and z.object strips unknown keys by default — including
 * underscore-prefixed `__proto__`-style keys in Zod 4 — so the parsed
 * bundle the caller receives carries ONLY schema-known fields. Literal
 * enums (schemaVersion, kinds, theme, …) reject every unexpected value;
 * any problem surfaces loudly through the issues list, never silently.
 */
export async function validateBundle(
  file: File,
): Promise<BundleValidationResult> {
  // 1. Unzip with the bomb cap. A filtered (over-cap) entry is skipped by
  //    fflate without ever being inflated — if that entry was required, the
  //    pipeline refuses below with missing-entry rather than allocating.
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter: (f) => f.originalSize <= MAX_ENTRY_ORIGINAL_SIZE,
    });
  } catch {
    return { ok: false, refusal: { kind: "not-a-zip" } };
  }

  // 2. SC#2 hard gate — EVERY entry, no exceptions, before any entry use.
  for (const name of Object.keys(entries)) {
    if (!isSafeEntryName(name)) {
      return { ok: false, refusal: { kind: "unsafe-entry", name } };
    }
  }

  // 3. Required entries.
  const bundleBytes = entries["bundle.json"];
  const manifestBytes = entries["manifest.json"];
  if (bundleBytes === undefined || manifestBytes === undefined) {
    return {
      ok: false,
      refusal: {
        kind: "missing-entry",
        name: bundleBytes === undefined ? "bundle.json" : "manifest.json",
      },
    };
  }

  // 4. Peek the version BEFORE the full parse → calm "newer version"
  //    refusal. A bundle.json that is not valid JSON at all is an invalid
  //    bundle (the issues list carries it); it can never reach Zod.
  let raw: unknown;
  try {
    raw = JSON.parse(strFromU8(bundleBytes));
  } catch {
    return {
      ok: false,
      refusal: { kind: "invalid", issues: ["bundle.json: not valid JSON"] },
    };
  }
  const peeked = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (typeof peeked === "number" && peeked > 1) {
    return {
      ok: false,
      refusal: { kind: "newer-schema-version", bundleVersion: peeked },
    };
  }

  // 5. Full schema parse — ALL issues, not just the first (Pitfall 11 #2).
  const parsed = ExportBundleSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      refusal: {
        kind: "invalid",
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      },
    };
  }

  // 6. Manifest recompute — per-block SHA-256 over the Zod-PARSED bundle
  //    (determinism contract, manifest.ts). An unusable claimed manifest
  //    fails every block. No transaction has started at any point above.
  const recomputed = await computeManifest(parsed.data);
  let claimed: Manifest | undefined;
  try {
    claimed = JSON.parse(strFromU8(manifestBytes)) as Manifest;
  } catch {
    claimed = undefined; // every block fails verification below
  }
  const failedBlocks = (Object.keys(recomputed.blocks) as Array<
    keyof Manifest["blocks"]
  >).filter((b) => recomputed.blocks[b] !== claimed?.blocks?.[b]);
  if (failedBlocks.length > 0) {
    return { ok: false, refusal: { kind: "corrupted", failedBlocks } };
  }

  return { ok: true, bundle: parsed.data, manifest: recomputed };
}
