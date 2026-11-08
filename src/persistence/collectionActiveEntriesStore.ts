// src/persistence/collectionActiveEntriesStore.ts
// Issue #247 — the persistence seam for the collection's remembered ACTIVE
// ENTRY: the navigation context the Continue collection action resumes.
// Mirrors the completionsStore seam conventions: header citing the locked
// decisions, Zod-at-boundary on every read, typed write that throws so the
// caller can decide (navigation context is never worth blocking a reading
// on — the reader-side callers navigate anyway and let Continue's fallback
// algebra absorb a lost memory).
//
// Contracts (issue #247 acceptance criteria):
//   1. NAVIGATION CONTEXT ONLY (ADR 0011 + ADR 0001): the row carries a
//      stable CollectionEntry id and nothing else — never a passage offset,
//      never a separate reading attempt. The canonical location store is
//      unreachable from this seam, so remembering an entry can never become
//      a second saved position by construction.
//   2. ONE row per collection, keyed by collectionId (the collection's own
//      memory — 1:1): setCollectionActiveEntry is an UPSERT. No history
//      (the recordCompletion discipline): the newest remembered entry IS
//      the state.
//   3. Zod-at-boundary on read (STATE-04): the row must parse
//      CollectionActiveEntrySchema. A corrupt row reads as null — it must
//      never masquerade as a usable resume pointer (the getCompletion
//      precedent). Read failures are ALSO null (fail-quiet, the
//      loadAllCompletions discipline): the memory only ever SELECTIONS the
//      Continue fallback algebra's preferred arm — losing it degrades to
//      the first-unfinished fallback, never to an error surface.
//   4. Deletion rides the collection's own transaction: deleteCollection
//      (collectionsStore) sweeps the context row inside its rw transaction,
//      so the cleanup commits or rolls back WITH the collection (the #245
//      removeCompletionsForDeletedWork discipline). No orphan row outlives
//      its collection.
//
// Threat register:
//   - T-247a (Tampering, corrupt persisted context rows) →
//     CollectionActiveEntrySchema.safeParse per read; corrupt rows read as
//     null, never coerced; the next remember write overwrites the row (the
//     completionsStore T-246a cleanup-through-the-honest-write-path
//     discipline).
import { db } from "./db";
import {
  COLLECTION_ACTIVE_ENTRY_SCHEMA_VERSION,
  CollectionActiveEntrySchema,
} from "../content/schema";
import type { CollectionActiveEntry } from "../content/schema";

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * getCollectionActiveEntry — one collection's remembered active entry, or
 * null when absent, corrupt (T-247a), OR the read fails (fail-quiet — the
 * memory only selects the Continue fallback's preferred arm; losing it
 * degrades to the first-unfinished fallback, never to an error surface).
 * The caller validates the remembered entry against the collection's
 * CURRENT entries at selection time (the continueCollection algebra) — a
 * row pointing at a removed/completed entry is filtered there, not here.
 */
export async function getCollectionActiveEntry(
  collectionId: string,
): Promise<CollectionActiveEntry | null> {
  try {
    const row = await db.collectionActiveEntries.get(collectionId);
    if (!row) return null;
    const parsed = CollectionActiveEntrySchema.safeParse(row);
    return parsed.success ? parsed.data : null; // STATE-04: never coerce
  } catch {
    return null; // fail-quiet — see the contract 3 note above
  }
}

/**
 * setCollectionActiveEntry — remember ONE entry as a collection's active
 * reading context (contract 2). The upsert is keyed by the collectionId, so
 * re-remembering replaces the earlier row. Storage failures PROPAGATE: the
 * callers (the detail view's Continue/row opens, the reader's Next
 * advancement) each decide — navigation proceeds, the lost memory lands in
 * Continue's safe fallback.
 */
export async function setCollectionActiveEntry(
  collectionId: string,
  entryId: string,
): Promise<CollectionActiveEntry> {
  const record: CollectionActiveEntry = {
    schemaVersion: COLLECTION_ACTIVE_ENTRY_SCHEMA_VERSION,
    collectionId,
    entryId,
    updatedAt: nowIso(),
  };
  await db.collectionActiveEntries.put(record);
  return record;
}
