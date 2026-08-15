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
//     | location. Never silently overwrite.
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
import { db } from "../persistence/db";
import { fixtures } from "../fixtures";
import {
  graphemeClusters,
  normalizeText,
} from "../content/normalizeText";
import { resolveQuoteSelectorInText } from "../annotations/resolution";
import type {
  CanonicalArticle,
  HighlightRecord,
  LocationRecord,
  NoteRecord,
  ReaderSettings,
} from "../content/schema";
import type { ExportBundle } from "./bundle";

// ── Conflict taxonomy (D9-14 table) ──────────────────────────────────────────

/** The five D9-14 conflict kinds, in preview display order. */
export type ConflictKind =
  | "article-revision" // same id, different revision (keep-higher-revision under overwrite)
  | "article-content-divergence" // same id+revision, different provenance.originalHtmlHash
  | "highlight-id" // incoming highlight id exists locally
  | "note-id" // incoming note id exists locally
  | "location"; // incoming [articleId+revision] exists locally (savedAt LWW under overwrite)

/** Bulk per-kind override choices (D9-11/D9-14). "keep-both" is meaningful
 * only for the id kinds (highlight-id/note-id) where a minted id can hold
 * both records; on article/location kinds it behaves as skip (documented —
 * the dialog in Plan 09-05 offers keep-both only for the id kinds). */
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

/** The dry-run preview data (RESEARCH Pattern 7's ImportPreview interface,
 * pure data). `added` counts incoming records with NO local PK match (these
 * always import). `resolution` is the D9-13 eager tri-state over EVERY
 * incoming highlight. `fixtureBackedHighlights` counts highlights whose
 * article came from the bundled-fixtures tier (Pattern 8 tier 3 — the
 * "N highlights anchor to bundled sample articles" preview line).
 * `applyPreferencesDefault` is the D9-12 fresh-device default for the
 * "apply imported reading preferences?" choice. */
export interface ImportPreviewData {
  incoming: {
    articles: number;
    highlights: number;
    notes: number;
    locations: number;
  };
  added: {
    articles: number;
    highlights: number;
    notes: number;
    locations: number;
  };
  conflicts: ConflictSummary[];
  resolution: {
    confident: number;
    ambiguous: number;
    orphan: number;
  };
  fixtureBackedHighlights: number;
  applyPreferencesDefault: boolean;
}

/** The fully-computed import plan (RESEARCH Pattern 3's apply-step contract).
 * Plan 09-04's applyImport consumes this with Dexie puts ONLY — every
 * per-record decision, id mint, and FK rewrite has already happened here,
 * BEFORE the transaction. `idRewrites` maps old incoming ids → minted
 * crypto.randomUUID() ids (keep-both). `skipped` counts conflicted records
 * excluded from the *ToWrite arrays. `preferences` is present iff
 * `applyPreferences` is true. */
export interface ResolvedImportPlan {
  articlesToWrite: CanonicalArticle[];
  highlightsToWrite: HighlightRecord[];
  notesToWrite: NoteRecord[];
  locationsToWrite: LocationRecord[];
  preferences?: ReaderSettings;
  applyPreferences: boolean;
  idRewrites: Map<string, string>;
  skipped: {
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
  for (const a of fixtures) {
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
 */
class MemoizedArticleText {
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
  return resolved === "ambiguous" || resolved === "orphan"
    ? resolved
    : "confident";
}

// ── detectImportPreview — the dry-run pass (PURE READS) ──────────────────────

/**
 * detectImportPreview — the D9-11 dry-run conflict pass + the D9-13 eager
 * tri-state re-resolution. Classifies every incoming record of the
 * Zod-validated bundle against existing local state per the D9-14 table.
 *
 * Reads (and ONLY reads): local articles via dexieLibrarySource.list()
 * (Zod-validated read path, STATE-04), highlights/notes/locations via
 * loadAllHighlights()/loadAllNotes()/loadAllLocations(), reader-prefs row
 * presence via a settings-store get. Zero writes — the transaction lives in
 * Plan 09-04's applyImport.
 */
export async function detectImportPreview(
  bundle: ExportBundle,
): Promise<ImportPreviewData> {
  const [localArticles, localHighlights, localNotes, localLocations] =
    await Promise.all([
      dexieLibrarySource.list(),
      loadAllHighlights(),
      loadAllNotes(),
      loadAllLocations(),
    ]);

  const localArticleById = new Map(localArticles.map((a) => [a.id, a]));
  const localHighlightIds = new Set(localHighlights.map((h) => h.id));
  const localNoteIds = new Set(localNotes.map((n) => n.id));
  const localLocationByKey = new Map(
    localLocations.map((l) => [locationKey(l), l]),
  );

  // ── D9-14 conflict classification (PK comparisons only) ──
  const revisionConflicts: string[] = [];
  const divergenceConflicts: string[] = [];
  const highlightIdConflicts: string[] = [];
  const noteIdConflicts: string[] = [];
  const locationConflicts: string[] = [];
  const added = {
    articles: 0,
    highlights: 0,
    notes: 0,
    locations: 0,
  };

  for (const a of bundle.articles) {
    const local = localArticleById.get(a.id);
    if (!local) {
      added.articles++;
    } else if (a.revision !== local.revision) {
      revisionConflicts.push(a.id);
    } else if (
      a.provenance.originalHtmlHash !== local.provenance.originalHtmlHash
    ) {
      divergenceConflicts.push(a.id);
    }
    // else: identical duplicate (same id+revision+hash) — no decision for the
    // reader to make: not a conflict, not added (a calm no-op).
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

  const summarize = (
    kind: ConflictKind,
    ids: readonly string[],
  ): ConflictSummary | null =>
    ids.length > 0
      ? { kind, count: ids.length, sampleIds: ids.slice(0, 5) }
      : null;

  const conflicts: ConflictSummary[] = [];
  for (const summary of [
    summarize("article-revision", revisionConflicts),
    summarize("article-content-divergence", divergenceConflicts),
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
      articles: bundle.articles.length,
      highlights: bundle.highlights.length,
      notes: bundle.notes.length,
      locations: bundle.locations.length,
    },
    added,
    conflicts,
    resolution,
    fixtureBackedHighlights,
    applyPreferencesDefault,
  };
}

// ── resolveImportPlan — bulk per-kind overrides → fully-computed plan ────────

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
 *   - New records (no local PK match) are ALWAYS written.
 *   - skip (default): conflicted records are excluded and counted in skipped.
 *   - article-revision + overwrite: keep-higher-revision (D-06 monotonic) —
 *     the incoming article is written ONLY when its revision is strictly
 *     higher; equal-or-lower stays local and counts as skipped.
 *   - article-content-divergence + overwrite: the incoming article wins
 *     (same id+revision, content replaced).
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
 *   - An incoming article identical to local (same id+revision+hash) is a
 *     calm no-op: not written, counted as skipped, never a conflict.
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
 */
export async function resolveImportPlan(
  bundle: ExportBundle,
  _preview: ImportPreviewData,
  overrides: Overrides,
  applyPreferences: boolean,
): Promise<ResolvedImportPlan> {
  // Same loaders as detectImportPreview — the write-free re-read.
  const [localArticles, localHighlights, localNotes, localLocations] =
    await Promise.all([
      dexieLibrarySource.list(),
      loadAllHighlights(),
      loadAllNotes(),
      loadAllLocations(),
    ]);

  const localArticleById = new Map(localArticles.map((a) => [a.id, a]));
  const localHighlightIds = new Set(localHighlights.map((h) => h.id));
  const localNoteIds = new Set(localNotes.map((n) => n.id));
  const localLocationByKey = new Map(
    localLocations.map((l) => [locationKey(l), l]),
  );

  const plan: ResolvedImportPlan = {
    articlesToWrite: [],
    highlightsToWrite: [],
    notesToWrite: [],
    locationsToWrite: [],
    applyPreferences,
    idRewrites: new Map<string, string>(),
    skipped: { articles: 0, highlights: 0, notes: 0, locations: 0 },
  };
  if (applyPreferences) {
    plan.preferences = bundle.preferences;
  }

  // ── Articles: keep-higher-revision / content overwrite / no-op duplicate ──
  for (const a of bundle.articles) {
    const local = localArticleById.get(a.id);
    if (!local) {
      plan.articlesToWrite.push(a); // new — always written
    } else if (a.revision !== local.revision) {
      // D-06 monotonic: only a STRICTLY higher incoming revision may replace
      // the local row (an explicit reader choice under Overwrite-all).
      if (
        overrides["article-revision"] === "overwrite" &&
        a.revision > local.revision
      ) {
        plan.articlesToWrite.push(a);
      } else {
        plan.skipped.articles++; // skip | keep-both(as skip) | lower revision
      }
    } else if (
      a.provenance.originalHtmlHash !== local.provenance.originalHtmlHash
    ) {
      if (overrides["article-content-divergence"] === "overwrite") {
        plan.articlesToWrite.push(a); // incoming wins (content replaced)
      } else {
        plan.skipped.articles++;
      }
    } else {
      plan.skipped.articles++; // identical duplicate — calm no-op
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

  return plan;
}
