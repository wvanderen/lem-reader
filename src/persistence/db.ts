// src/persistence/db.ts
// Reserved Dexie schema for Phase 2 (D-08). Phase 1 does NOT read or write
// through Dexie — fixtures are bundled JSON imported at build time, read via
// an in-memory ArticleRepository.
//
// CRITICAL (Pitfall 9): this `version(1)` declaration is shipped ONCE in
// Phase 1 and MUST NEVER be edited. Phase 2 extends the schema by appending a
// second version block WITHOUT touching this declaration. All slots
// are reserved now to minimize future version bumps.
//
// Index syntax: "primaryKey, index1, index2, &uniqueIndex, [compound+index]"
import { Dexie, type Table } from "dexie";
import type { Book } from "../content/schema";

/** Shape of a row in the `settings` store (composite reader-prefs record). */
export interface SettingsRecord {
  key: string; // "reader-prefs"
  value: unknown; // validated via ReaderSettingsSchema on read (settingsStore)
}

/** Shape of a row in the `location` store (STATE-01, compound key [articleId+revision]).
 * Dexie's `[articleId+revision]` store declaration creates a COMPOUND primary
 * key constructed from the row's `articleId` and `revision` properties — NOT
 * a field literally named "[articleId+revision]". The key is queried as the
 * array `[articleId, revision]` via db.location.get([id, rev]). */
export interface LocationRecordRow {
  schemaVersion: 1;
  articleId: string;
  revision: number;
  graphemeOffset: number;
  savedAt: string;
}

/** Shape of a row in the `highlights` store (Phase 5 — ANNO-05/06/07, STATE-03).
 * Mirrors HighlightRecordSchema (src/content/schema.ts); the compound index
 * `[articleId+revision]` is queried as an array range for cross-revision
 * lookup (D5-01). The row does NOT carry a literal "[articleId+revision]"
 * field — Dexie derives the compound key from `articleId` + `revision`. */
export interface HighlightRecordRow {
  schemaVersion: 1;
  id: string;
  articleId: string;
  revision: number;
  position: { start: number; end: number };
  quote: { prefix: string; exact: string; suffix: string };
  createdAt: string;
}

/** Shape of a row in the `notes` store (Phase 5 — ANNO-02, STATE-03).
 * 1:1 with a HighlightRecord via the `highlightId` index. text is plain
 * string (never HTML — Pitfall 8). */
export interface NoteRecordRow {
  schemaVersion: 1;
  id: string;
  highlightId: string;
  text: string;
  updatedAt: string;
}

export class LemReaderDB extends Dexie {
  // Declared table properties give TypeScript a handle on the stores reserved
  // by the version blocks below. Without these, `db.settings.get(...)` would
  // fail tsc (Phase 2 Plan 02 settingsStore + Plan 03 locationStore need the
  // typed access). 02-PATTERNS.md line 106 notes Phase 2 may add these (LOW
  // risk — runtime behavior is unaffected; Dexie already resolves the stores
  // by name from the version declarations).
  settings!: Table<SettingsRecord, string>;
  location!: Table<LocationRecordRow, [string, number]>;
  articles!: Table<{
    id: string;
    revision: number;
    source?: string;
    addedAt?: string;
    ingestionMeta?: unknown;
    provenance?: unknown;
    blocks?: unknown;
    footnotes?: unknown;
    lang?: string;
    tags?: string[];
    // Phase 12 (ING-05): the bookId FK → books.id powers grouping reads
    // (D12-01). Additive-optional — existing rows parse unchanged (Pitfall 9).
    bookId?: string;
  }, string>;
  // Phase 5: real row types replace the Phase 1 placeholder annotations
  // (LOW risk — runtime-unaffected; Dexie resolves stores by name from the
  // version declarations, not from TS types). Mirrors the Phase 02-02
  // definite-assignment precedent. NO Dexie version bump (Pitfall 9 — the v1/v2
  // declaration blocks below are byte-unchanged; the v1 store declarations
  // for highlights and notes are already sufficient — NO new version block is
  // added this phase).
  highlights!: Table<HighlightRecordRow, string>;
  notes!: Table<NoteRecordRow, string>;
  // Phase 12 (ING-05, Plan 12-03): the books table is typed by Book
  // (z.infer of BookSchema — src/content/schema.ts is the single source of
  // truth). Definite-assignment annotation mirrors the Phase 02-02
  // precedent; runtime-unaffected (Dexie resolves stores by name from the
  // version declarations below).
  books!: Table<Book, string>;

  constructor() {
    super("lem-reader");
    this.version(1).stores({
      // Phase 2: saved articles (may mirror fixture imports + future user imports)
      articles: "id, revision",
      // Phase 2: reader preferences (theme, typography, mode)
      settings: "key",
      // Phase 2: STATE-01 reading location, keyed by [articleId+revision]
      location: "[articleId+revision]",
      // Phase 5: ANNO highlights; compound key for orphan detection
      highlights: "id, [articleId+revision]",
      // Phase 5: ANNO notes attached to highlights
      notes: "id, highlightId",
    });
    // ── Phase 2 (STATE-04 anchor + Pitfall 9): the second version block is an APPEND ──
    // The first version declaration above is byte-unchanged (Pitfall 9 — never
    // edit a shipped version block; that breaks the upgrade chain for any
    // client that already opened it). Re-declaring the same reserved stores
    // at the second version is a schema no-op in Dexie ≥3 (the slots were
    // already declared in the first block); the new version anchors the
    // STATE-04 migration hook and gives a clean place to evolve the stores in
    // later phases. The first block wrote ZERO records (Phase 1 reads bundled
    // JSON only), so no data migration is needed.
    this.version(2).stores({
      articles: "id, revision",
      settings: "key",
      location: "[articleId+revision]",
    });
    // ── Phase 7 (D7-02 + Pitfall 9): the third version block is an APPEND. ──
    // v1/v2 byte-unchanged. v3 adds `source` + `addedAt` indexes to `articles`
    // for filter-by-origin (compositeLibraryRepository in 07-06) and
    // sort-by-recency. NO `.upgrade()` callback — additive indexes only; Dexie
    // re-indexes on next open without row migration. The articles store wrote
    // ZERO records in v1/v2 (fixtures are bundled JSON imported at build time,
    // read via an in-memory ArticleRepository — see src/content/repository.ts);
    // v3 is the first version that writes user rows (ingested articles from
    // Phase 7's /api/ingest pipeline). The remaining stores (settings,
    // location, highlights, notes) are re-declared at their existing shapes
    // because Dexie requires the full stores object at each version; their
    // values match v2 verbatim. The table-property type annotation widening at
    // L68 mirrors the documented Phase 5 highlights/notes transition
    // (PATTERNS.md L403-407 — definite-assignment annotation, runtime-unaffected).
    this.version(3).stores({
      articles: "id, revision, source, addedAt",
      settings: "key",
      location: "[articleId+revision]",
      highlights: "id, [articleId+revision]",
      notes: "id, highlightId",
    });
    // ── Phase 8 (D8-05 + Pitfall 9): the fourth version block is an APPEND. ──
    // v1/v2/v3 byte-unchanged. v4 adds the `*tags` multi-entry index on
    // `articles` for Plan 03's chip-filter derivation + Plan 04's tag-edit
    // surface (D8-05 — document-tag namespace). The `*tags` syntax (per
    // RESEARCH §Pattern 2 L393) declares a MULTI-ENTRY index: a row carrying
    // `tags: ["essay", "philosophy"]` produces two index entries so
    // `db.articles.where("tags").equals("essay")` finds it. NO `.upgrade()`
    // callback — additive index only; Dexie re-indexes on next open (mirrors
    // the v3 additive-index precedent at L131-137). Existing v3 rows hydrate
    // `tags: undefined`/`[]` via the ArticleSchema `.default([])` mechanism
    // landed in Plan 01 (Pitfall 9 — additive; the absent field is filled on
    // Zod read, NOT written back to the row). D8-08 (auto-prune): a tag no
    // longer carried by any article disappears from `loadAllTags()` on the
    // next read — the `*tags` index makes future Dexie-only queries possible
    // but the current `loadAllTags` implementation uses `toArray()` + an
    // in-memory Set for simplicity (see src/ingestion/library/tagsStore.ts).
    // The remaining stores are re-declared at their existing shapes because
    // Dexie requires the full stores object at each version; their values
    // match v3 verbatim.
    this.version(4).stores({
      articles: "id, revision, source, addedAt, *tags",
      settings: "key",
      location: "[articleId+revision]",
      highlights: "id, [articleId+revision]",
      notes: "id, highlightId",
    });
    // ── Phase 12 (D12-01..D12-04 + Pitfall 9): the fifth version block is an
    // APPEND. ──
    // v1/v2/v3/v4 byte-unchanged. v5 adds the `bookId` index on `articles`
    // (grouping reads — D12-01 expandable book rows key on it) plus the NEW
    // `books` store ("id, title, *tags" — the *tags multi-entry index powers
    // D12-04 book-tag filtering, mirroring the v4 articles *tags mechanism).
    // NO `.upgrade()` callback — additive indexes + a new store that starts
    // EMPTY; Dexie re-indexes on next open without row migration (the v3/v4
    // additive precedent at L132-164). Existing v4 article rows simply omit
    // `bookId` (absent from the index — additive, Pitfall 9); the books
    // store bootstraps empty until the first .epub upload saves into it
    // (12-03 booksStore.saveBook). The remaining stores are re-declared at
    // their existing shapes because Dexie requires the full stores object at
    // each version; their values match v4 verbatim.
    this.version(5).stores({
      articles: "id, revision, source, addedAt, *tags, bookId",
      settings: "key",
      location: "[articleId+revision]",
      highlights: "id, [articleId+revision]",
      notes: "id, highlightId",
      books: "id, title, *tags",
    });
  }
}

export const db = new LemReaderDB();
