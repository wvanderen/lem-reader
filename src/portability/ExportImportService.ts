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
import { bundledFixtures } from "../fixtures";
import { dexieLibrarySource } from "../ingestion/LibrarySource";
import { db } from "../persistence/db";
import type { AssetRecordRow, LocationRecordRow } from "../persistence/db";
import { listBooks } from "../persistence/booksStore";
import { loadAllHighlights } from "../persistence/highlightsStore";
import { loadAllNotes } from "../persistence/notesStore";
import { loadAllLocations } from "../persistence/locationStore";
import { loadSettings } from "../persistence/settingsStore";
import { MAX_ARTICLE_ASSET_BYTES, MAX_ASSET_BYTES } from "../ingestion/types";
import { DEFAULT_SETTINGS } from "../settings/defaults";
import { clampLegacyMeasure } from "../settings/legacyMeasure";
import { ExportBundleSchema, resolveAppVersion } from "./bundle";
import type { ExportBundle, AssetExportMeta } from "./bundle";
import { computeManifest, sha256Hex } from "./manifest";
import type { Manifest } from "./manifest";
import { isSafeEntryName } from "./zipSlip";
import type { ResolvedImportPlan, ValidatedImportAsset } from "./conflicts";
import { loadAllAssets } from "../persistence/assetsStore";

// ── Export side (PORT-01) ────────────────────────────────────────────────────

/**
 * buildBundleBytes — read the six record sources (five Phase-9 sources +
 * books since Phase 12) through the Zod-validated loaders (STATE-04 — never
 * raw db.* reads, never N+1 per-article loaders), derive fixtureIds,
 * self-check the envelope, and zip bundle.json (pretty, human-debuggable —
 * negligible after DEFLATE) + manifest.json (minified).
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
export async function buildBundleBytes(): Promise<Uint8Array<ArrayBuffer>> {
  const [articles, highlights, notes, locations, settingsResult, booksResult, assetRows] =
    await Promise.all([
      dexieLibrarySource.list(), // Dexie articles ONLY — fixtures never ride
      loadAllHighlights(),
      loadAllNotes(),
      loadAllLocations(),
      loadSettings(), // ok ⇒ settings (first run yields DEFAULT_SETTINGS);
      // !ok ⇒ storage trouble — still export, with defaults (D9-12
      // always-present; the reader's records must not be hostage to a
      // settings-read failure).
      listBooks(), // Phase 12 (12-07) — Book records ride the v2 bundle.
      // Same D9-12-shaped tolerance as settings: !ok ⇒ storage trouble —
      // still export the records that DID read (books: []; chapters keep
      // riding articles with ingestionMeta.bookId, so machine B re-groups
      // them only if the book row also traveled — the never-silent ethos is
      // served by refusing to hostage the whole export to one store read).
      loadAllAssets(), // Phase 20 (20-05) — asset blobs ride the v4 bundle.
      // Plain-array whole-library read with calm corrupt-row drops (the
      // loadAllHighlights precedent): one drifted row never blocks the
      // reader's export.
    ]);
  const preferences = settingsResult.ok ? settingsResult.settings : DEFAULT_SETTINGS;
  // Writers ALWAYS emit the books field on v2 (empty array on a book-free
  // library) — the field's presence is the v2 write contract (bundle.ts).
  const books = booksResult.ok ? booksResult.books : [];

  // Phase 20 (20-05, IMG-04): the asset export set — only rows whose owning
  // article rides the bundle. Fixtures never serialize and a stray row for
  // a removed article drops here (minimization — it would only become an
  // inert orphan entry on import). Blob → bytes → sha256 all happen HERE,
  // outside any transaction (there is none on the export path; the note
  // keeps the 09-04 no-crypto-in-closures rule explicit for future edits).
  const articleIds = new Set(articles.map((a) => a.id));
  const exportAssetRows = assetRows.filter((row) => articleIds.has(row.articleId));
  const assetEntries: Record<string, Uint8Array> = {};
  const assets: AssetExportMeta[] = [];
  for (const row of exportAssetRows) {
    // ArrayBuffer-backed view (TS 7 BufferSource — the 09-01 lesson); a
    // fresh copy so the hashed bytes are exactly the zipped bytes.
    const bytes = new Uint8Array(await row.data.arrayBuffer());
    // Entry names are SERVICE-GENERATED from validated id fields only —
    // never bundle-supplied free text (T-20-20; both ids are regex-locked
    // by the store seam + AssetExportMetaSchema).
    const entry = `assets/${row.articleId}/${row.assetId}`;
    assetEntries[entry] = bytes;
    assets.push({
      articleId: row.articleId,
      assetId: row.assetId,
      contentType: row.contentType,
      byteLength: bytes.byteLength,
      sha256: await sha256Hex(bytes),
      entry,
    });
  }

  // fixtureIds: referenced article ids ∩ bundled fixture ids.
  const highlightById = new Map(highlights.map((h) => [h.id, h]));
  const referenced = new Set<string>();
  for (const h of highlights) referenced.add(h.articleId);
  for (const l of locations) referenced.add(l.articleId);
  for (const n of notes) {
    const owner = highlightById.get(n.highlightId);
    if (owner !== undefined) referenced.add(owner.articleId);
  }
  const fixtureIds = bundledFixtures.filter((f) => referenced.has(f.id)).map((f) => f.id);

  const bundle = ExportBundleSchema.parse({
    // Phase 12 (12-07) + Phase 17 (17-04) + Phase 20 (20-05): writers emit
    // v4 — reader-owned metadata overrides ride each article row via
    // ArticleSchema composition (D17-12) and image assets ride the assets
    // metadata array + raw zip entries (IMG-04); the 1|2|3|4 union read
    // stays in bundle.ts; a v5+ bundle is refused by the peek below (D9-04).
    schemaVersion: 4 as const,
    exportedAt: new Date().toISOString(),
    appVersion: resolveAppVersion(),
    articles,
    locations,
    highlights,
    notes,
    preferences,
    fixtureIds,
    books,
    // ALWAYS present on v4 writes (empty array on an asset-free library) —
    // the field's presence is the v4 write contract (the books precedent).
    assets,
  });

  const manifest = await computeManifest(bundle);
  // The SAME zipSync call carries the text entries (strToU8 values) and the
  // raw asset entries (Uint8Array values) — the A5 Wave-0 proof in
  // bundle-v4.spec.ts locks fflate's mixed-value behavior byte-exact.
  return zipSync({
    "bundle.json": strToU8(JSON.stringify(bundle, null, 2)),
    "manifest.json": strToU8(JSON.stringify(manifest)),
    ...assetEntries,
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

/** validateBundle's result: the validated bundle + recomputed manifest + the
 * per-asset rows that verified against their zip entries (Phase 20 20-05 —
 * entry bytes included; rows whose entry was missing or bomb-filtered are
 * simply absent, and the no-broken-refs gate in conflicts.ts turns that
 * absence into the honest per-article skip), or a specific refusal. The
 * `{ ok, … } | { ok, refusal }` shape follows the settingsStore/
 * locationStore discriminated-result convention (never throw to the
 * reader). */
export type BundleValidationResult =
  | { ok: true; bundle: ExportBundle; manifest: Manifest; assets: ValidatedImportAsset[] }
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
 *   4. JSON.parse + PEEK schemaVersion: a number > 3 → newer-schema-version
 *      BEFORE the full schema parse (the calm refusal instead of a Zod
 *      error wall — 09-RESEARCH anti-pattern; v3 bundles parse normally
 *      since Phase 17 17-04 — overrides ride them; v2 since Phase 12).
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
export async function validateBundle(file: File): Promise<BundleValidationResult> {
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
  //    Phase 12 (12-07): the threshold moved from > 1 to > 2 — v2 bundles
  //    (books-capable) parse. Phase 17 (17-04): > 2 → > 3 — v3 bundles
  //    (metadata-override-capable) parse. Phase 20 (20-05): > 3 → > 4 — v4
  //    bundles (asset-capable) parse; v5+ still refuses loudly (D9-04).
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
  if (typeof peeked === "number" && peeked > 4) {
    return {
      ok: false,
      refusal: { kind: "newer-schema-version", bundleVersion: peeked },
    };
  }

  // 4.5 D21-03 (POLISH-09): clamp the enumerated legacy measure value
  //     (72 → 64) on the RAW preferences block BEFORE the full schema
  //     parse — a v2.1-era bundle whose preferences carry the
  //     pre-truthful-range maximum re-imports calmly instead of failing
  //     the measure union (which would refuse the whole bundle). Bounded
  //     map: only the known legacy value maps; garbage still fails parse
  //     → the invalid refusal below (STATE-04 / V5 / T-21-01).
  const rawPrefs =
    raw !== null && typeof raw === "object"
      ? (raw as { preferences?: unknown }).preferences
      : undefined;
  const legacyMeasurePreferences =
    rawPrefs !== null &&
    typeof rawPrefs === "object" &&
    (rawPrefs as { measure?: unknown }).measure === 72
      ? rawPrefs
      : undefined;
  if (legacyMeasurePreferences !== undefined) {
    raw = {
      ...(raw as object),
      preferences: clampLegacyMeasure(legacyMeasurePreferences),
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
  //    Phase 20 (20-05): v1/v2/v3 claimed manifests predate the assets
  //    block — an absent claimed assets key is read as the empty-array hash
  //    so old bundles never false-positive as corrupted; a v4 bundle with
  //    actual assets still mismatches (tampering stays detected).
  const recomputed = await computeManifest(parsed.data);
  let claimed: Manifest | undefined;
  try {
    claimed = JSON.parse(strFromU8(manifestBytes)) as Manifest;
  } catch {
    claimed = undefined; // every block fails verification below
  }
  const claimedBlocks: Record<string, string | undefined> = {
    ...claimed?.blocks,
  };
  if (claimedBlocks.assets === undefined) {
    claimedBlocks.assets = await sha256Hex(new TextEncoder().encode(JSON.stringify([])));
  }
  // D21-03 (POLISH-09) manifest legacy-value tolerance: when the pre-parse
  // clamp mapped the enumerated legacy value (72 → 64), a v2.1-era
  // exporter's claimed preferences hash was computed over the block WITH
  // the legacy value (it was in-union at export time) — it can never equal
  // the recomputed (clamped) hash. Accept the export-era hash as the
  // preferences-block match: recompute it from the parsed block with
  // measure back-mapped to 72 (same schema key order per the determinism
  // contract above). Every other block — and every other preferences
  // modification — still mismatches (T-9-03; the manifest is a corruption
  // DETECTION surface, not a security boundary — manifest.ts).
  if (
    legacyMeasurePreferences !== undefined &&
    claimedBlocks.preferences !== recomputed.blocks.preferences
  ) {
    const legacyHash = await sha256Hex(
      new TextEncoder().encode(JSON.stringify({ ...parsed.data.preferences, measure: 72 })),
    );
    if (claimedBlocks.preferences === legacyHash) {
      claimedBlocks.preferences = recomputed.blocks.preferences;
    }
  }
  const failedBlocks = (Object.keys(recomputed.blocks) as Array<keyof Manifest["blocks"]>).filter(
    (b) => recomputed.blocks[b] !== claimedBlocks[b],
  );
  if (failedBlocks.length > 0) {
    return { ok: false, refusal: { kind: "corrupted", failedBlocks } };
  }

  // 7. Per-asset validation (Phase 20 20-05, IMG-04 — T-20-18/T-20-19/
  //    T-20-20): the metadata array passed the schema parse + the manifest
  //    hash; now each row is verified against its zip ENTRY. Damage routes
  //    to the corrupted refusal channel (never-throw); a MISSING entry
  //    (never present, or filtered by the MAX_ENTRY_ORIGINAL_SIZE bomb
  //    guard) is NOT bundle-level corruption — the row is simply absent
  //    from the validated set and conflicts.ts's no-broken-refs gate turns
  //    that absence into the honest per-article skip with the preview
  //    warning. Order: canonical-name → per-asset cap → per-article budget
  //    → presence → byteLength → sha256 (metadata-level checks first, so
  //    lying metadata refuses without reading a byte).
  const assets: ValidatedImportAsset[] = [];
  const budgetByArticle = new Map<string, number>();
  for (const meta of parsed.data.assets ?? []) {
    // Entry names are service-generated from the row's OWN validated ids —
    // a free-text meta.entry is damage, never a lookup key (T-20-20; the
    // every-key isSafeEntryName guard in step 2 already covered the raw
    // zip side).
    if (meta.entry !== `assets/${meta.articleId}/${meta.assetId}`) {
      return { ok: false, refusal: { kind: "corrupted", failedBlocks: ["assets"] } };
    }
    if (meta.byteLength > MAX_ASSET_BYTES) {
      return { ok: false, refusal: { kind: "corrupted", failedBlocks: ["assets"] } };
    }
    const budget = (budgetByArticle.get(meta.articleId) ?? 0) + meta.byteLength;
    if (budget > MAX_ARTICLE_ASSET_BYTES) {
      return { ok: false, refusal: { kind: "corrupted", failedBlocks: ["assets"] } };
    }
    budgetByArticle.set(meta.articleId, budget);
    const entryBytes = entries[meta.entry];
    if (entryBytes === undefined) continue; // missing/bomb-filtered — dangling gate owns it
    // ArrayBuffer-backed copy (TS 7 BufferSource): one copy serves both the
    // hash and the row that rides into applyImport.
    const bytes = new Uint8Array(entryBytes);
    if (bytes.byteLength !== meta.byteLength) {
      return { ok: false, refusal: { kind: "corrupted", failedBlocks: ["assets"] } };
    }
    if ((await sha256Hex(bytes)) !== meta.sha256) {
      return { ok: false, refusal: { kind: "corrupted", failedBlocks: ["assets"] } };
    }
    assets.push({
      articleId: meta.articleId,
      assetId: meta.assetId,
      contentType: meta.contentType,
      byteLength: meta.byteLength,
      bytes,
    });
  }

  return { ok: true, bundle: parsed.data, manifest: recomputed, assets };
}

// ── Import apply side (PORT-02, atomic) ──────────────────────────────────────

/** The settings-store key of the composite reader-prefs record — the single
 * value applyImport ever writes to db.settings (mirrors settingsStore.ts's
 * KEY and conflicts.ts's READER_PREFS_KEY). */
const READER_PREFS_KEY = "reader-prefs";

/**
 * applyImport — apply the FULLY-COMPUTED ResolvedImportPlan (09-03) in ONE
 * Dexie transaction across every touched store. Atomicity (Pitfall 11 #3 /
 * T-9-11): any throw — from a put, a Dexie creating hook, or anything else
 * inside the closure — rolls back EVERY store this transaction locked; no
 * partial import can survive. The injected-failure rollback test in
 * tests/unit/portability/atomic-import.test.ts is the proof.
 *
 * Phase 12 (Plan 12-07): db.books joins BOTH table sets — books write in
 * the SAME transaction as their chapters + annotations, so a half-imported
 * book is impossible (the saveBook atomicity discipline, applied to
 * import). Chapters ride the existing article puts; each chapter row is
 * written with the top-level `bookId` denormalization saveBook stamps (the
 * 12-03 v5 index contract — imported chapter rows stay index-uniform with
 * saved ones; the canonical FK remains ingestionMeta.bookId, and
 * ArticleSchema strips the top-level key on every Zod read). A chapter
 * whose book is NOT written (skipped conflict or absent from the bundle)
 * still rides — orphan-tolerant: it lands as a standalone epub-chapter
 * article the library renders ungrouped.
 *
 * ⚠️ THE RULE (09-RESEARCH Pitfall 1 / T-9-15): everything async-non-Dexie
 * completed BEFORE this function is called. The plan is plain data — every
 * per-record decision, keep-both id mint, and note-FK rewrite happened in
 * resolveImportPlan. The closure below contains ONLY awaited db.*.put
 * calls (plus the synchronous bookId spread — pure data shaping, the exact
 * saveBook pattern): NO crypto.subtle, NO Zod, NO setTimeout, NO network,
 * NO non-Dexie await — Dexie silently aborts transactions whose closure
 * awaits foreign microtasks (code-review gate: read the closure before
 * touching it).
 *
 * Store set: db.settings joins ONLY when plan.applyPreferences is true —
 * the same conditional-table shape as the DexieLibrarySource.remove
 * cascade precedent (LibrarySource.ts L108-151), extended with db.settings;
 * db.books joins unconditionally (books are record data, like articles).
 * Location rows are put with the LocationRecordRow shape — Dexie derives
 * the compound [articleId+revision] primary key from the row's fields;
 * there is no literal bracketed field name anywhere.
 */
export async function applyImport(plan: ResolvedImportPlan): Promise<void> {
  // Phase 20 (20-05): asset ROWS build BEFORE the transaction opens — the
  // stamp-before-transaction discipline (assetsStore.putAssets): createdAt
  // stamping + Blob construction are synchronous pure data shaping, but
  // keeping them outside the closure preserves the puts-only rule's
  // plain-reading (the closure inspects ONLY plan-shaped puts/deletes).
  const assetCreatedAt = new Date().toISOString();
  const assetRows: AssetRecordRow[] = plan.assetsToWrite.map((asset) => ({
    articleId: asset.articleId,
    assetId: asset.assetId,
    contentType: asset.contentType,
    byteLength: asset.byteLength,
    // TS 7 BlobPart strictness (the 20-03 save-time-copy lesson): a view
    // over generic ArrayBufferLike is not assignable — copy into a fresh
    // ArrayBuffer-backed Uint8Array (the Blob constructor copies anyway).
    data: new Blob([new Uint8Array(asset.bytes)], {
      type: asset.contentType,
    }),
    createdAt: assetCreatedAt,
  }));
  // The per-article replacement set: every article this plan WRITES gets
  // its old asset rows range-deleted before the new puts — the 20-03
  // upsert-replacement discipline (a winning article's superseded rows
  // never linger, and an incoming asset-free winner clears stale local
  // rows exactly like re-ingest does).
  const assetArticleIds = [...new Set(plan.articlesToWrite.map((a) => a.id))];

  // The puts-only closure, defined once. It is passed to whichever explicit
  // db.transaction overload matches the plan's touched-store set: db.settings
  // joins ONLY when plan.applyPreferences is true (the
  // DexieLibrarySource.remove cascade precedent, extended with db.settings);
  // db.books always joins (Phase 12 — books are record data); db.assets
  // always joins (Phase 20 — assets are record data, riding their
  // articles). BOTH branches use the readonly-ARRAY overload — adding
  // db.assets makes SEVEN tables on the settings branch and SIX on the
  // other, and the tuple overloads stop at five (the STATE 12-07 lesson;
  // the saveBook/removeBook array-form standardization).
  const applyPuts = async (): Promise<void> => {
    for (const book of plan.booksToWrite) {
      await db.books.put(book);
    }
    for (const article of plan.articlesToWrite) {
      // Denormalize the top-level `bookId` onto each stored chapter row so
      // the v5 Dexie index ("...,*tags, bookId") serves grouping reads +
      // removeBook's live-truth cascade for IMPORTED chapters exactly as it
      // does for saveBook-written ones (the 12-03 store-seam discipline).
      // The CANONICAL contract stays `ingestionMeta.bookId` — the spread is
      // synchronous data shaping inside the puts-only closure (saveBook
      // precedent); non-chapter articles pass through byte-identically.
      const bookId = article.ingestionMeta?.bookId;
      await db.articles.put(bookId !== undefined ? { ...article, bookId } : article);
    }
    // Phase 20 (20-05): assets ride their winning articles — the per-range
    // delete of superseded rows FIRST, then the puts (puts/deletes only;
    // rollback covers both — T-20-22).
    for (const articleId of assetArticleIds) {
      await db.assets.where("articleId").equals(articleId).delete();
    }
    for (const row of assetRows) {
      await db.assets.put(row);
    }
    for (const highlight of plan.highlightsToWrite) {
      await db.highlights.put(highlight);
    }
    for (const note of plan.notesToWrite) {
      await db.notes.put(note);
    }
    for (const location of plan.locationsToWrite) {
      // LocationRecordRow shape — Dexie derives [articleId+revision].
      const row: LocationRecordRow = {
        schemaVersion: location.schemaVersion,
        articleId: location.articleId,
        revision: location.revision,
        graphemeOffset: location.graphemeOffset,
        savedAt: location.savedAt,
      };
      await db.location.put(row);
    }
    if (plan.applyPreferences && plan.preferences !== undefined) {
      await db.settings.put({ key: READER_PREFS_KEY, value: plan.preferences });
    }
  };

  if (plan.applyPreferences) {
    // SEVEN tables (articles/highlights/notes/location/settings/books/
    // assets) — the readonly-array overload (the tuple overloads stop at
    // FIVE; the 12-07 lesson, now on both branches).
    await db.transaction(
      "rw",
      [db.articles, db.highlights, db.notes, db.location, db.settings, db.books, db.assets],
      applyPuts,
    );
  } else {
    // SIX tables without settings — the same array-overload form.
    await db.transaction(
      "rw",
      [db.articles, db.highlights, db.notes, db.location, db.books, db.assets],
      applyPuts,
    );
  }
}
