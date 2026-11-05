// src/persistence/structureStore.ts
// Issue #236 — lazy persistence for the OPTIONAL structural snapshot on an
// existing article row.
//
// The reader derives a legacy record's structure locally and tries to save
// it once, in the background. The save is deliberately narrow:
//
//   - PARTIAL update: `db.articles.update(id, { structure })` — never a
//     whole-row put, so the write cannot clobber concurrent reader metadata
//     edits (readerTitle/readerAuthor/overrides — the EditMetadataDialog's
//     whole-row-put contract stays untouched; the reverse direction, a
//     metadata put that races AFTER a structure write, carries whatever it
//     read and the next open's lazy save re-establishes the snapshot — the
//     snapshot is always re-derivable, never reader-authored).
//   - REVISION-GUARDED: the transaction re-reads the row and refuses a
//     stale write whose revision no longer matches (a re-ingest between
//     derivation and save must never stamp the old revision's ranges onto
//     new content).
//   - HONESTLY BOUNDED: every miss is a typed outcome — a missing row
//     (bundled fixtures have no Dexie row) or a write failure is reported,
//     never thrown, so reading access is never blocked by an auxiliary
//     persistence optimization.
//
// The row shape is the ArticleSchema contract (structure is an additive
// optional field — the readerTitle mechanism); validation against canonical
// content lives in src/content/structure.ts (validateWorkStructure) and
// runs at every consumer seam, including this write's callers.

import { db } from "./db";
import type { WorkStructure } from "../content/schema";

/** One save attempt's honest outcome. */
export type SaveStructureOutcome =
  { saved: true } | { saved: false; reason: "missing-row" | "revision-changed" | "write-failed" };

/**
 * Persist `structure` onto the article row `[articleId]` — only when the
 * row exists AND still carries `revision` (the revision the ranges were
 * derived from). Resolves with the outcome instead of throwing: a failed
 * auxiliary write is disclosed by the caller, never a blocked reader.
 */
export async function saveWorkStructure(
  articleId: string,
  revision: number,
  structure: WorkStructure,
): Promise<SaveStructureOutcome> {
  try {
    return await db.transaction("rw", db.articles, async (): Promise<SaveStructureOutcome> => {
      const row = await db.articles.get(articleId);
      if (row === undefined) return { saved: false, reason: "missing-row" };
      if (row.revision !== revision) return { saved: false, reason: "revision-changed" };
      await db.articles.update(articleId, { structure });
      return { saved: true };
    });
  } catch {
    // Storage unavailable (quota, private mode, closed connection): the
    // structure stays an in-memory derivation; the reader loses nothing
    // visible and the next open tries again.
    return { saved: false, reason: "write-failed" };
  }
}
