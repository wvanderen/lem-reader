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
import { Dexie } from "dexie";

export class LemReaderDB extends Dexie {
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
