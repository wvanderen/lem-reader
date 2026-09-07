// src/portability/conflicts.ts
// Plan 09-03 — the PORT-02 dry-run core (D9-11 / D9-13 / D9-14).
//
// Locked decisions (09-CONTEXT.md + 09-RESEARCH.md):
//   - D9-11: import flow = dry-run preview + bulk per-kind overrides.
//   - D9-13: EAGER tri-state re-resolution — every incoming highlight runs
//     the shipped resolveQuoteSelector machinery against the winning article
//     BEFORE any write, so the preview can honestly report
//     "N highlights will import as ambiguous / M as orphan".
//   - D9-14: skip-by-default + bulk per-kind overrides; the conflict table is
//     article-revision | article-content-divergence | highlight-id | note-id
//     | location (extended by Phase 12's book kind and Phase 17's
//     article-metadata-override kind — 17-04, D17-11). Never silently
//     overwrite.
//   - RESEARCH Pattern 7: the ImportPreview interface (adapted here as
//     ImportPreviewData — pure data, no UI).
//   - RESEARCH Pattern 8: the three-source article lookup with EXACT
//     precedence bundle.articles > local Dexie articles > bundled fixtures,
//     plus REQUIRED per-article cluster memoization (compute
//     normalizeText/graphemeClusters once per article id, not per highlight).
//
// ⚠️ This module MUST NOT WRITE. detectImportPreview and resolveImportPlan
// are the dry-run / plan-computation passes — their only I/O is READING
// local state through the same Zod-validated loaders (STATE-04). The single
// Dexie transaction lives in Plan 09-04's applyImport, which consumes the
// fully-computed ResolvedImportPlan with puts only (RESEARCH Pattern 3).
import { dexieLibrarySource } from "../ingestion/LibrarySource";
import { loadAllHighlights } from "../persistence/highlightsStore";
import { loadAllNotes } from "../persistence/notesStore";
import { loadAllLocations } from "../persistence/locationStore";
import { listBooks } from "../persistence/booksStore";
import { db } from "../persistence/db";
import { bundledFixtures } from "../fixtures";
import { figureAssetIds } from "../content/assets/AssetProvider";
import { graphemeClusters, normalizeText } from "../content/normalizeText";
import { resolveQuoteSelectorInText } from "../annotations/resolution";
import { effectiveTitle } from "../ingestion/library/effectiveMetadata";
import type {
  Book,
  CanonicalArticle,
  HighlightRecord,
  LocationRecord,
  NoteRecord,
  ReaderSettings,
} from "../content/schema";
import type { AssetExportMeta, ExportBundle } from "./bundle";

// ── Phase 20 (Plan 20-05) — validated import assets + the no-broken-refs
//    gate (IMG-04). Assets ride their article's D9-14 resolution; there is
//    NO new ConflictKind and no new reader choice ──────────────────────────

/**
 * ValidatedImportAsset — one asset row validateBundle verified against its
 * zip entry (entry bytes included). Declared here — the CONSUMER side — so
 * this module stays import-cycle-free (ExportImportService already imports
 * from here; its ok-result carries structurally-identical rows, and the
 * structural match is locked by the bundle-v4 spec driving both sides).
 */
export interface ValidatedImportAsset {
  articleId: string;
  assetId: string;
  contentType: AssetExportMeta["contentType"];
  byteLength: number;
  bytes: Uint8Array<ArrayBuffer>;
}

/**
 * The no-broken-refs gate's pure core: the set of incoming article ids
 * holding at least one `asset:` figure ref that cannot resolve against the
 * VALIDATED asset rows (no meta entry, or the zip entry was missing or
 * bomb-filtered). Such articles skip import with the explicit preview
 * warning — never a silent placeholder rewrite (honesty constraint, the
 * D12-11 chapter-skip mirror). The block walk reuses AssetProvider's
 * exported figureAssetIds exactly (the one container-recursing walk shape
 * — the AddDialog attribution twin discipline, no fork).
 */
function danglingAssetArticleIds(
  bundle: ExportBundle,
  importAssets: readonly ValidatedImportAsset[],
): Set<string> {
  const available = new Set(importAssets.map((row) => `${row.articleId}\u0000${row.assetId}`));
  const dangling = new Set<string>();
  for (const article of bundle.articles) {
    for (const assetId of figureAssetIds(article)) {
      if (!available.has(`${article.id}\u0000${assetId}`)) {
        dangling.add(article.id);
        break;
      }
    }
  }
  return dangling;
}

// ── Conflict taxonomy (D9-14 table, extended by Phase 12 Plan 12-07 and
//    Phase 17 Plan 17-04) ──────────────────────────────────────────────────

/** The seven conflict kinds (the five D9-14 kinds + the Phase 12 book kind +
 * the Phase 17 metadata kind), in preview display order. */
export type ConflictKind =
  | "book" // same book id, different originalFileHash (Phase 12 12-07 — D9-14 extended)
  | "article-revision" // same id, different revision (keep-higher-revision under overwrite)
  | "article-content-divergence" // same id+revision, different provenance.originalHtmlHash
  | "article-metadata-override" // same id, readerTitle/readerAuthor differ — incl. one-side-only (Phase 17 17-04 — D17-11)
  | "highlight-id" // incoming highlight id exists locally
  | "note-id" // incoming note id exists locally
  | "location"; // incoming [articleId+revision] exists locally (savedAt LWW under overwrite)

/** Bulk per-kind override choices (D9-11/D9-14). "keep-both" is meaningful
 * only for the id kinds (highlight-id/note-id) where a minted id can hold
 * both records; on article/location/book kinds it behaves as skip
 * (documented — the dialog in Plan 09-05 offers keep-both only for the id
 * kinds). */
export type PerKindOverride = "skip" | "overwrite" | "keep-both";

/** One override per conflict kind — the bulk toggles the preview dialog
 * collects. Default for every kind is "skip" (skip-by-default, D9-14). */
export type Overrides = Record<ConflictKind, PerKindOverride>;

/** One conflict kind's preview entry. `sampleIds` is capped at 5 for calm
 * preview copy (article ids for the article kinds; highlight/note ids for
 * the id kinds; "articleId@revision" for the compound location key). */
export interface ConflictSummary {
  kind: ConflictKind;
  count: number;
  sampleIds: string[];
}

/** One per-article metadata-conflict detail (Phase 17 17-04 — D17-11): the
 * local and incoming override values for EVERY conflicted article id, so
 * the dialog can render every per-item choice row — the summarize
 * sampleIds cap of 5 is display-only and must not limit the per-item
 * choice. `localName`/`incomingName` are the effective names each side's
 * library displays (the ONE derivation — effectiveMetadata, META-02). */
export interface MetadataConflictDetail {
  id: string;
  localReaderTitle?: string;
  incomingReaderTitle?: string;
  localReaderAuthor?: string;
  incomingReaderAuthor?: string;
  localName: string;
  incomingName: string;
}

/** The dry-run preview data (RESEARCH Pattern 7's ImportPreview interface,
 * pure data). `added` counts incoming records with NO local PK match (these
 * always import). `resolution` is the D9-13 eager tri-state over EVERY
 * incoming highlight. `fixtureBackedHighlights` counts highlights whose
 * article came from the bundled-fixtures tier (Pattern 8 tier 3 — the
 * "N highlights anchor to bundled sample articles" preview line).
 * `applyPreferencesDefault` is the D9-12 fresh-device default for the
 * "apply imported reading preferences?" choice. `metadataConflicts`
 * (Phase 17 17-04) is the per-article detail array behind every
 * article-metadata-override conflict — one entry per conflicted id.
 * `danglingAssetArticles` (Phase 20 20-05) counts incoming articles the
 * no-broken-refs gate will SKIP because a figure's image bytes are not
 * included in the bundle — the count behind the verbatim preview warning
 * (never a silent placeholder rewrite; assets never conflict
 * independently of their article, so there is no new ConflictKind). */
export interface ImportPreviewData {
  incoming: {
    books: number;
    articles: number;
    highlights: number;
    notes: number;
    locations: number;
  };
  added: {
    books: number;
    articles: number;
    highlights: number;
    notes: number;
    locations: number;
  };
  conflicts: ConflictSummary[];
  metadataConflicts: MetadataConflictDetail[];
  resolution: {
    confident: number;
    ambiguous: number;
    orphan: number;
  };
  fixtureBackedHighlights: number;
  applyPreferencesDefault: boolean;
  danglingAssetArticles: number;
}

/** The fully-computed import plan (RESEARCH Pattern 3's apply-step contract).
 * Plan 09-04's applyImport consumes this with Dexie puts ONLY — every
 * per-record decision, id mint, and FK rewrite has already happened here,
 * BEFORE the transaction. `idRewrites` maps old incoming ids → minted
 * crypto.randomUUID() ids (keep-both). `skipped` counts conflicted records
 * excluded from the *ToWrite arrays. `preferences` is present iff
 * `applyPreferences` is true. `booksToWrite` (Phase 12 12-07) carries the
 * winning Book rows; their chapters ride `articlesToWrite` as ordinary
 * articles — a chapter whose book was skipped or absent from the bundle
 * STILL rides (orphan-tolerant: it imports as a standalone epub-chapter
 * article the library renders ungrouped). `assetsToWrite` (Phase 20
 * 20-05) carries the VALIDATED asset rows riding every winning article —
 * incoming-wins = article + its assets upsert together; an identical or
 * skipped article contributes nothing (its assets are untouched or
 * absent); orphan rows for articles that never ride drop inertly. */
export interface ResolvedImportPlan {
  booksToWrite: Book[];
  articlesToWrite: CanonicalArticle[];
  highlightsToWrite: HighlightRecord[];
  notesToWrite: NoteRecord[];
  locationsToWrite: LocationRecord[];
  assetsToWrite: ValidatedImportAsset[];
  preferences?: ReaderSettings;
  applyPreferences: boolean;
  idRewrites: Map<string, string>;
  skipped: {
    books: number;
    articles: number;
    highlights: number;
    notes: number;
    locations: number;
  };
}

// ── Shared helpers ───────────────────────────────────────────────────────────

/** Deterministic string form of the location compound key [articleId+revision]
 * (D-06) — array keys are awkward as Map keys; this keeps one canonical form. */
function locationKey(l: Pick<LocationRecord, "articleId" | "revision">): string {
  return `${l.articleId}\u0000${l.revision}`;
}

/** The settings-store key of the composite reader-prefs record (D2
 * discretion; settingsStore.ts KEY — mirrored here because the presence
 * check below is the D9-12 fresh-device signal, which loadSettings cannot
 * answer: loadSettings returns ok:true + DEFAULT_SETTINGS for a FIRST RUN
 * exactly like ok:true + parsed data for a persisted row, so "ok ⇒ a row
 * exists" is not distinguishable through that load. Reading the row's
 * presence directly is the honest implementation of the behavior contract
 * "applyPreferencesDefault is true when no local reader-prefs row exists,
 * false when one does" — a READ, never a write.) */
const READER_PREFS_KEY = "reader-prefs";

/** Which tier an article was found in (RESEARCH Pattern 8 precedence). */
type ArticleLookupSource = "bundle" | "local" | "fixture";

/**
 * metadataDiffers (Phase 17 17-04 — D17-11): strict inequality on
 * readerTitle OR readerAuthor, which makes one-side-only differences
 * (present here, absent there) count as differing — the D9-14 identical-
 * duplicate calm no-op therefore requires override state to match too
 * (Pitfall 4 fix: an incoming override never arrives silently dropped).
 */
export function metadataDiffers(a: CanonicalArticle, local: CanonicalArticle): boolean {
  return a.readerTitle !== local.readerTitle || a.readerAuthor !== local.readerAuthor;
}

type ArticleLookupEntry = {
  article: CanonicalArticle;
  source: ArticleLookupSource;
};

/**
 * Build the Pattern 8 three-source article lookup with EXACT precedence:
 *   1. bundle.articles (the common case — the article is being imported),
 *   2. local Dexie articles (incoming article skipped as a conflict but its
 *      highlight is new — ids not already present only),
 *   3. bundled fixtures from src/fixtures (readers highlight fixture
 *      articles; those highlights ride in the bundle while their articles
 *      never do — this is exactly why ExportBundle.fixtureIds exists).
 *
 * First-seen wins (the seen-Set PK-merge shape from
 * compositeLibraryRepository.list, LibrarySource.ts L173-190) — an incoming
 * bundle article therefore SHADOWS a same-id fixture (T-9-10: no
 * fixture-text substitution for a real article id).
 */
export function buildArticleLookup(
  bundle: ExportBundle,
  localArticles: readonly CanonicalArticle[],
): Map<string, ArticleLookupEntry> {
  const lookup = new Map<string, ArticleLookupEntry>();
  for (const a of bundle.articles) {
    lookup.set(a.id, { article: a, source: "bundle" });
  }
  for (const a of localArticles) {
    if (!lookup.has(a.id)) lookup.set(a.id, { article: a, source: "local" });
  }
  for (const a of bundledFixtures) {
    if (!lookup.has(a.id)) lookup.set(a.id, { article: a, source: "fixture" });
  }
  return lookup;
}

/**
 * Memoized re-resolution substrate (RESEARCH Pattern 8 — memoization is
 * REQUIRED, not optional): normalizeText + graphemeClusters run ONCE per
 * article id regardless of how many incoming highlights key to it. The
 * clusters reuse the canonical D-05 functions exactly (REUSE-DO-NOT-FORK —
 * any divergence shifts every anchor).
 *
 * Exported since Plan 10-01 (D10-13): the review-panel derivation
 * (src/routes/review/reviewFilter.ts) imports THIS class for per-article
 * cluster caching — lifted in place, never mirrored as a twin (Phase 10
 * research Open Question 1, preferred option). Zero behavior change for the
 * Phase 9 usage above.
 */
export class MemoizedArticleText {
  private readonly clustersById = new Map<string, readonly string[]>();

  clustersFor(article: CanonicalArticle): readonly string[] {
    let clusters = this.clustersById.get(article.id);
    if (clusters === undefined) {
      clusters = graphemeClusters(normalizeText(article), article.lang);
      this.clustersById.set(article.id, clusters);
    }
    return clusters;
  }
}

/**
 * Eager tri-state re-resolution of one highlight against the winning article
 * (D9-13). This is the memoized form of resolveQuoteSelector
 * (src/content/normalizeText.ts re-export / src/annotations/resolution.ts):
 * identical semantics — the exported in-text core consumes the per-article
 * memoized cluster array instead of recomputing it per highlight.
 */
function resolveHighlightStatus(
  article: CanonicalArticle,
  clusters: readonly string[],
  highlight: HighlightRecord,
): "confident" | "ambiguous" | "orphan" {
  const resolved = resolveQuoteSelectorInText(
    clusters,
    highlight.quote,
    article.lang,
    highlight.position,
  );
  return resolved === "ambiguous" || resolved === "orphan" ? resolved : "confident";
}

// ── detectImportPreview — the dry-run pass (PURE READS) ──────────────────────

/**
 * detectImportPreview — the D9-11 dry-run conflict pass + the D9-13 eager
 * tri-state re-resolution. Classifies every incoming record of the
 * Zod-validated bundle against existing local state per the D9-14 table
 * (+ the Phase 12 book kind: same id + different originalFileHash).
 *
 * Reads (and ONLY reads): local articles via dexieLibrarySource.list()
 * (Zod-validated read path, STATE-04), highlights/notes/locations via
 * loadAllHighlights()/loadAllNotes()/loadAllLocations(), books via
 * listBooks() (the 12-03 Zod-validated seam; a !ok read classifies against
 * an empty local set — the transaction in applyImport is still atomic, so
 * an unavailable store can never yield a partial write), reader-prefs row
 * presence via a settings-store get. Zero writes — the transaction lives
 * in Plan 09-04's applyImport.
 */
export async function detectImportPreview(
  bundle: ExportBundle,
  importAssets: readonly ValidatedImportAsset[] = [],
): Promise<ImportPreviewData> {
  const [localArticles, localHighlights, localNotes, localLocations, localBooksResult] =
    await Promise.all([
      dexieLibrarySource.list(),
      loadAllHighlights(),
      loadAllNotes(),
      loadAllLocations(),
      listBooks(),
    ]);
  const localBooks = localBooksResult.ok ? localBooksResult.books : [];

  const localArticleById = new Map(localArticles.map((a) => [a.id, a]));
  const localBookById = new Map(localBooks.map((b) => [b.id, b]));
  const localHighlightIds = new Set(localHighlights.map((h) => h.id));
  const localNoteIds = new Set(localNotes.map((n) => n.id));
  const localLocationByKey = new Map(localLocations.map((l) => [locationKey(l), l]));

  // ── Conflict classification (PK comparisons only) ──
  const bookConflicts: string[] = [];
  const revisionConflicts: string[] = [];
  const divergenceConflicts: string[] = [];
  const metadataConflicts: string[] = [];
  const metadataConflictDetails: MetadataConflictDetail[] = [];
  const highlightIdConflicts: string[] = [];
  const noteIdConflicts: string[] = [];
  const locationConflicts: string[] = [];
  const added = {
    books: 0,
    articles: 0,
    highlights: 0,
    notes: 0,
    locations: 0,
  };

  // Books (Phase 12 12-07 — the D9-14 table's book row): same id +
  // DIFFERENT originalFileHash is a conflict; the same id + identical hash
  // is a calm no-op skip (the 09-03 identical-duplicate precedent applied
  // at book level). Chapters never reference-check their book here — a
  // chapter whose book is absent from the bundle is orphan-TOLERANT and
  // rides `articles` like any other (classified below).
  for (const b of bundle.books ?? []) {
    const local = localBookById.get(b.id);
    if (!local) {
      added.books++;
    } else if (b.originalFileHash !== local.originalFileHash) {
      bookConflicts.push(b.id);
    }
    // else: identical-hash duplicate book — no decision for the reader to
    // make: not a conflict, not added (a calm no-op).
  }

  // ── Phase 20 (20-05): the no-broken-refs gate's skip set. A dangling
  // article is neither "added" nor "conflicting" — it will not import, so
  // the preview must not promise it; the explicit warning count carries
  // the honest reason instead (never a silent placeholder rewrite).
  const dangling = danglingAssetArticleIds(bundle, importAssets);

  for (const a of bundle.articles) {
    if (dangling.has(a.id)) continue; // skipped with the preview warning
    const local = localArticleById.get(a.id);
    if (!local) {
      added.articles++;
    } else if (a.revision !== local.revision) {
      revisionConflicts.push(a.id);
    } else if (a.provenance.originalHtmlHash !== local.provenance.originalHtmlHash) {
      divergenceConflicts.push(a.id);
    } else if (metadataDiffers(a, local)) {
      // Phase 17 17-04 (D17-11): same id+revision+hash but a differing
      // override (incl. one-side-only) is an explicit conflict. Metadata
      // protection on the revision/divergence branches above comes from
      // resolveImportPlan's merge-on-win (D17-10), never a second row.
      metadataConflicts.push(a.id);
      metadataConflictDetails.push({
        id: a.id,
        localName: effectiveTitle(local),
        incomingName: effectiveTitle(a),
        ...(local.readerTitle !== undefined ? { localReaderTitle: local.readerTitle } : {}),
        ...(a.readerTitle !== undefined ? { incomingReaderTitle: a.readerTitle } : {}),
        ...(local.readerAuthor !== undefined ? { localReaderAuthor: local.readerAuthor } : {}),
        ...(a.readerAuthor !== undefined ? { incomingReaderAuthor: a.readerAuthor } : {}),
      });
    }
    // else: identical duplicate (same id+revision+hash) INCLUDING override
    // state — no decision for the reader to make: not a conflict, not added
    // (a calm no-op; the Pitfall 4 fix means this now requires the
    // overrides to match too — metadataDiffers above catches the rest).
  }

  for (const h of bundle.highlights) {
    if (localHighlightIds.has(h.id)) highlightIdConflicts.push(h.id);
    else added.highlights++;
  }

  for (const n of bundle.notes) {
    if (localNoteIds.has(n.id)) noteIdConflicts.push(n.id);
    else added.notes++;
  }

  for (const l of bundle.locations) {
    if (localLocationByKey.has(locationKey(l))) {
      locationConflicts.push(`${l.articleId}@${l.revision}`);
    } else {
      added.locations++;
    }
  }

  const summarize = (kind: ConflictKind, ids: readonly string[]): ConflictSummary | null =>
    ids.length > 0 ? { kind, count: ids.length, sampleIds: ids.slice(0, 5) } : null;

  const conflicts: ConflictSummary[] = [];
  for (const summary of [
    summarize("book", bookConflicts),
    summarize("article-revision", revisionConflicts),
    summarize("article-content-divergence", divergenceConflicts),
    summarize("article-metadata-override", metadataConflicts),
    summarize("highlight-id", highlightIdConflicts),
    summarize("note-id", noteIdConflicts),
    summarize("location", locationConflicts),
  ]) {
    if (summary) conflicts.push(summary);
  }

  // ── D9-13 eager tri-state re-resolution (Pattern 8 lookup + memoization) ──
  const lookup = buildArticleLookup(bundle, localArticles);
  const memoizedText = new MemoizedArticleText();
  const resolution = { confident: 0, ambiguous: 0, orphan: 0 };
  let fixtureBackedHighlights = 0;

  for (const h of bundle.highlights) {
    const entry = lookup.get(h.articleId);
    if (!entry) {
      resolution.orphan++;
      continue;
    }
    if (entry.source === "fixture") fixtureBackedHighlights++;
    const status = resolveHighlightStatus(
      entry.article,
      memoizedText.clustersFor(entry.article),
      h,
    );
    resolution[status]++;
  }

  // ── D9-12 fresh-device preference default (row PRESENCE, a read) ──
  const prefsRow = await db.settings.get(READER_PREFS_KEY);
  const applyPreferencesDefault = prefsRow === undefined;

  return {
    incoming: {
      books: bundle.books?.length ?? 0,
      articles: bundle.articles.length,
      highlights: bundle.highlights.length,
      notes: bundle.notes.length,
      locations: bundle.locations.length,
    },
    added,
    conflicts,
    metadataConflicts: metadataConflictDetails,
    resolution,
    fixtureBackedHighlights,
    applyPreferencesDefault,
    danglingAssetArticles: dangling.size,
  };
}

// ── resolveImportPlan — bulk per-kind overrides → fully-computed plan ────────

/** Per-item import choices (Phase 17 17-04 — D17-11). Optional; every field
 * defaults to its keep-local/empty equivalent so pre-Phase-17 callers are
 * behaviorally unchanged when the parameter is omitted. */
export interface ImportItemChoices {
  /** Article ids whose metadata conflict the reader resolved take-incoming
   * (the per-item "Use imported" choice). Empty/omitted ⇒ keep-local
   * everywhere. The per-kind `article-metadata-override` overwrite composes
   * as the bulk take-incoming (union with this set). */
  metadataTakeIncoming: ReadonlySet<string>;
}

/** The shared empty set for omitted itemChoices — allocated once, never
 * mutated (a fresh Set per call would be equally correct; this is cheaper
 * and keeps the default path allocation-free). */
const EMPTY_METADATA_TAKE_INCOMING: ReadonlySet<string> = new Set();

/**
 * Merge-on-win (Phase 17 17-04 — D17-10): the incoming article wins on
 * revision/content, but the reader's LOCAL overrides survive the refresh —
 * "a refresh never renames the library back" — unless the reader explicitly
 * chose take-incoming for this article. Pure data shaping inside
 * articlesToWrite.push(...), BEFORE applyImport's puts-only transaction
 * (this module's zero-writes contract holds; the article put IS the
 * override put — D17-13-adjacent).
 */
function mergeOnWin(
  incoming: CanonicalArticle,
  local: CanonicalArticle,
  takeIncoming: (id: string) => boolean,
): CanonicalArticle {
  if (takeIncoming(incoming.id)) return incoming; // explicit reader choice
  return {
    ...incoming,
    readerTitle: local.readerTitle,
    readerAuthor: local.readerAuthor,
  };
}

/**
 * resolveImportPlan — apply the D9-14 bulk per-kind override semantics to the
 * bundle and return the FULLY-COMPUTED ResolvedImportPlan. Plan 09-04's
 * applyImport consumes the result inside one Dexie transaction with puts
 * ONLY — every decision, id mint, and FK rewrite has already happened here,
 * BEFORE the transaction (RESEARCH Pattern 3: async-non-Dexie work — like
 * crypto.randomUUID minting — never lives inside the tx closure).
 *
 * ZERO WRITES. The only I/O is re-reading the local PK sets through the SAME
 * loaders detectImportPreview uses (hence async). Determinism note: the
 * reader's decisions are re-derived from the bundle against the freshly
 * re-read local state — a mismatch window between the preview the reader saw
 * and this call (local state changed in between) is acceptable at prototype
 * scale, and the 09-04 transaction still applies atomically either way.
 *
 * Semantics (D9-14 + the plan's behavior block):
 *   - New records (no local PK match) are ALWAYS written (their overrides
 *     ride the row as-is — Phase 17).
 *   - book (Phase 12 12-07): a same-id DIFFERENT-originalFileHash book is a
 *     conflict; skip (default) excludes it; overwrite writes the incoming
 *     book (a put over the local row — content replaced); keep-both behaves
 *     as skip (a minted book id would strand the chapter FKs — keep-both is
 *     offered only for the id kinds, the documented narrowing). A same-id
 *     identical-hash book is a calm no-op: skipped, never a conflict.
 *   - Chapters are orphan-tolerant by construction: every chapter rides the
 *     article classification below regardless of whether its book is
 *     written — a chapter whose book was skipped still imports as a
 *     standalone epub-chapter article the library renders ungrouped.
 *   - skip (default): conflicted records are excluded and counted in skipped.
 *   - article-revision + overwrite: keep-higher-revision (D-06 monotonic) —
 *     the incoming article is written ONLY when its revision is strictly
 *     higher; equal-or-lower stays local and counts as skipped. When the
 *     incoming row IS written, merge-on-win keeps the LOCAL overrides
 *     unless the article is take-incoming (D17-10).
 *   - article-content-divergence + overwrite: the incoming article wins
 *     (same id+revision, content replaced), with the same merge-on-win
 *     override protection (D17-10).
 *   - article-metadata-override (Phase 17 17-04 — D17-11): a metadata-only
 *     conflict keeps LOCAL by default (skipped, the local row and its
 *     overrides stay); take-incoming — per-item via itemChoices OR bulk via
 *     the per-kind overwrite — writes the incoming row whole (its overrides
 *     win; a key-less incoming row removes the local override). Keep-both
 *     behaves as skip (meaningless for one row — the narrowing precedent).
 *   - highlight-id/note-id + keep-both: the incoming record is written under
 *     a freshly minted crypto.randomUUID() id; idRewrites records old→new;
 *     every incoming note whose highlightId appears in idRewrites gets its
 *     highlightId rewritten BEFORE the plan returns (notes follow their
 *     highlight — Pitfall 7).
 *   - highlight-id/note-id + overwrite: the incoming record is written under
 *     its OWN id (a put over the local row — upsert semantics).
 *   - location + overwrite: last-write-wins by savedAt — the incoming
 *     location is written only when strictly newer; older incoming stays
 *     skipped.
 *   - keep-both on article/location kinds behaves as skip (documented — the
 *     09-05 dialog offers keep-both only for the id kinds).
 *   - An incoming article identical to local (same id+revision+hash AND
 *     override state) is a calm no-op: not written, counted as skipped,
 *     never a conflict (Pitfall 4 fix — override state must match).
 *   - applyPreferences true ⇒ preferences = bundle.preferences; false ⇒ the
 *     field is absent (the 09-04 tx then omits db.settings entirely).
 *
 * @param bundle The Zod-validated export bundle.
 * @param _preview The preview the reader saw. NOT re-consumed for decisions —
 *   every per-record decision is re-derived from `bundle` against freshly
 *   re-read local PK sets (see the determinism note above). The parameter is
 *   part of the locked call shape so the dialog (09-05) passes the very
 *   preview it rendered.
 * @param overrides One PerKindOverride per conflict kind.
 * @param applyPreferences The reader's D9-12 "apply imported reading
 *   preferences?" choice (defaults from applyPreferencesDefault).
 * @param itemChoices Phase 17 per-item choices (optional — default empty;
 *   pre-Phase-17 callers behave identically to HEAD on a no-override
 *   library).
 */
export async function resolveImportPlan(
  bundle: ExportBundle,
  _preview: ImportPreviewData,
  overrides: Overrides,
  applyPreferences: boolean,
  itemChoices?: ImportItemChoices,
  importAssets: readonly ValidatedImportAsset[] = [],
): Promise<ResolvedImportPlan> {
  // Same loaders as detectImportPreview — the write-free re-read.
  const [localArticles, localHighlights, localNotes, localLocations, localBooksResult] =
    await Promise.all([
      dexieLibrarySource.list(),
      loadAllHighlights(),
      loadAllNotes(),
      loadAllLocations(),
      listBooks(),
    ]);
  const localBooks = localBooksResult.ok ? localBooksResult.books : [];

  const localArticleById = new Map(localArticles.map((a) => [a.id, a]));
  const localBookById = new Map(localBooks.map((b) => [b.id, b]));
  const localHighlightIds = new Set(localHighlights.map((h) => h.id));
  const localNoteIds = new Set(localNotes.map((n) => n.id));
  const localLocationByKey = new Map(localLocations.map((l) => [locationKey(l), l]));

  const plan: ResolvedImportPlan = {
    booksToWrite: [],
    articlesToWrite: [],
    highlightsToWrite: [],
    notesToWrite: [],
    locationsToWrite: [],
    assetsToWrite: [],
    applyPreferences,
    idRewrites: new Map<string, string>(),
    skipped: { books: 0, articles: 0, highlights: 0, notes: 0, locations: 0 },
  };
  if (applyPreferences) {
    plan.preferences = bundle.preferences;
  }

  // ── Books: same-id different-hash conflict / overwrite / no-op duplicate ──
  for (const b of bundle.books ?? []) {
    const local = localBookById.get(b.id);
    if (!local) {
      plan.booksToWrite.push(b); // new — always written
    } else if (b.originalFileHash !== local.originalFileHash) {
      if (overrides["book"] === "overwrite") {
        plan.booksToWrite.push(b); // incoming wins (same id — put over the local row)
      } else {
        plan.skipped.books++; // skip | keep-both (behaves as skip — no minted book ids)
      }
    } else {
      plan.skipped.books++; // identical-hash duplicate — calm no-op
    }
  }

  // ── Articles: keep-higher-revision / content overwrite / metadata choice /
  //    no-op duplicate — with merge-on-win override protection (D17-10) ──
  // The metadata take-incoming predicate: the per-item "Use imported" choice
  // (D17-11) OR the per-kind overwrite as the honest bulk take-incoming.
  const metadataTakeIncoming = itemChoices?.metadataTakeIncoming ?? EMPTY_METADATA_TAKE_INCOMING;
  const takeIncomingMetadata = (id: string): boolean =>
    overrides["article-metadata-override"] === "overwrite" || metadataTakeIncoming.has(id);
  // Phase 20 (20-05): the no-broken-refs gate — re-derived exactly as the
  // preview derived it (the determinism note above covers the window). A
  // dangling article skips BEFORE any conflict classification: no honest
  // import of it exists under ANY override (its images are not in the
  // bundle), and the preview already said so with the warning string.
  const dangling = danglingAssetArticleIds(bundle, importAssets);
  for (const a of bundle.articles) {
    if (dangling.has(a.id)) {
      plan.skipped.articles++; // the explicit dangling-assets skip reason
      continue;
    }
    const local = localArticleById.get(a.id);
    if (!local) {
      plan.articlesToWrite.push(a); // new — always written (overrides ride)
    } else if (a.revision !== local.revision) {
      // D-06 monotonic: only a STRICTLY higher incoming revision may replace
      // the local row (an explicit reader choice under Overwrite-all). The
      // LOCAL-wins path (equal-or-lower) stays untouched — no write, the
      // local row and its overrides are already safe.
      if (overrides["article-revision"] === "overwrite" && a.revision > local.revision) {
        plan.articlesToWrite.push(mergeOnWin(a, local, takeIncomingMetadata));
      } else {
        plan.skipped.articles++; // skip | keep-both(as skip) | lower revision
      }
    } else if (a.provenance.originalHtmlHash !== local.provenance.originalHtmlHash) {
      if (overrides["article-content-divergence"] === "overwrite") {
        // Incoming wins (content replaced) — the local name survives unless
        // take-incoming (D17-10).
        plan.articlesToWrite.push(mergeOnWin(a, local, takeIncomingMetadata));
      } else {
        plan.skipped.articles++;
      }
    } else if (metadataDiffers(a, local)) {
      // Metadata-only conflict (D17-11): keep-LOCAL by default; take-incoming
      // (per-item or bulk) writes the incoming row whole — a key-less
      // incoming row removes the local override (explicit reader choice).
      if (takeIncomingMetadata(a.id)) {
        plan.articlesToWrite.push(a);
      } else {
        plan.skipped.articles++; // skip | keep-both (behaves as skip)
      }
    } else {
      plan.skipped.articles++; // identical duplicate INCLUDING override state — calm no-op
    }
  }

  // ── Highlights: keep-both mints ids FIRST so notes can follow (Pitfall 7) ──
  for (const h of bundle.highlights) {
    if (!localHighlightIds.has(h.id)) {
      plan.highlightsToWrite.push(h); // new — always written
    } else if (overrides["highlight-id"] === "keep-both") {
      const minted = crypto.randomUUID();
      plan.idRewrites.set(h.id, minted);
      plan.highlightsToWrite.push({ ...h, id: minted });
    } else if (overrides["highlight-id"] === "overwrite") {
      plan.highlightsToWrite.push(h); // same id — a put over the local row
    } else {
      plan.skipped.highlights++;
    }
  }

  // ── Notes: FK rewrite BEFORE any other decision (notes follow their
  // highlight), then the note-id conflict policy ──
  for (const n of bundle.notes) {
    let note = n;
    const rewrittenHighlightId = plan.idRewrites.get(n.highlightId);
    if (rewrittenHighlightId !== undefined) {
      note = { ...note, highlightId: rewrittenHighlightId };
    }
    if (!localNoteIds.has(note.id)) {
      plan.notesToWrite.push(note); // new — always written (FK already fixed)
    } else if (overrides["note-id"] === "keep-both") {
      const minted = crypto.randomUUID();
      plan.idRewrites.set(note.id, minted);
      plan.notesToWrite.push({ ...note, id: minted });
    } else if (overrides["note-id"] === "overwrite") {
      plan.notesToWrite.push(note); // same id — a put over the local row
    } else {
      plan.skipped.notes++;
    }
  }

  // ── Locations: last-write-wins by savedAt under overwrite ──
  for (const l of bundle.locations) {
    const local = localLocationByKey.get(locationKey(l));
    if (!local) {
      plan.locationsToWrite.push(l); // new — always written
    } else if (
      overrides["location"] === "overwrite" &&
      l.savedAt > local.savedAt // strictly newer — LWW (D9-14)
    ) {
      plan.locationsToWrite.push(l);
    } else {
      plan.skipped.locations++; // skip | keep-both(as skip) | older incoming
    }
  }

  // ── Phase 20 (20-05): assets ride their article's resolution. Only the
  // WINNING articles' validated rows attach — an identical article is a
  // calm no-op (its local assets untouched), a skipped article writes
  // nothing, and rows belonging to no riding article drop inertly
  // (orphan-tolerant, the chapter precedent). applyImport consumes
  // assetsToWrite with per-article range-delete + puts inside the SAME
  // puts-only transaction (the 20-03 upsert-replacement discipline).
  const ridingArticleIds = new Set(plan.articlesToWrite.map((a) => a.id));
  for (const asset of importAssets) {
    if (ridingArticleIds.has(asset.articleId)) {
      plan.assetsToWrite.push(asset);
    }
  }

  return plan;
}
