// src/persistence/db.ts
// Reserved Dexie schema for Phase 2 (D-08). Phase 1 does NOT read or write
// through Dexie — fixtures are bundled JSON imported at build time, read via
// an in-memory ArticleRepository.
//
// CRITICAL (Pitfall 9): this `version(1)` declaration is shipped ONCE in
// Phase 1 and MUST NEVER be edited. Phase 2 extends the schema by adding
// db.version(2).stores({...}) WITHOUT touching this declaration. All slots
// are reserved now to minimize future version bumps.
//
// Index syntax: "primaryKey, index1, index2, &uniqueIndex, [compound+index]"
import { Dexie, type Table } from "dexie";

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

export class LemReaderDB extends Dexie {
  // Declared table properties give TypeScript a handle on the stores reserved
  // by the version blocks below. Without these, `db.settings.get(...)` would
  // fail tsc (Phase 2 Plan 02 settingsStore + Plan 03 locationStore need the
  // typed access). 02-PATTERNS.md line 106 notes Phase 2 may add these (LOW
  // risk — runtime behavior is unaffected; Dexie already resolves the stores
  // by name from the version declarations).
  settings!: Table<SettingsRecord, string>;
  location!: Table<LocationRecordRow, [string, number]>;
  articles!: Table<{ id: string; revision: number }, string>;
  highlights!: Table<
    { id: string; "[articleId+revision]": string },
    string
  >;
  notes!: Table<{ id: string; highlightId: string }, string>;

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
    // ── Phase 2 (STATE-04 anchor + Pitfall 9): version(2) is an APPEND ──
    // The version(1) declaration above is byte-unchanged (Pitfall 9 — never
    // edit a shipped version block; that breaks the upgrade chain for any
    // client that already opened v1). Re-declaring the same reserved stores
    // at v2 is a schema no-op in Dexie ≥3 (the slots were already declared in
    // v1); the new version anchors the STATE-04 migration hook and gives a
    // clean place to evolve the stores in later phases. v1 wrote ZERO records
    // (Phase 1 reads bundled JSON only), so no data migration is needed.
    this.version(2).stores({
      articles: "id, revision",
      settings: "key",
      location: "[articleId+revision]",
    });
  }
}

export const db = new LemReaderDB();
