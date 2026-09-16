// src/persistence/readingSessionsStore.ts
// Persistence seam for reading-session records (issue #34 — reading-history
// milestone). Mirrors the locationStore / highlightsStore seam conventions:
// header citing the locked decisions, `import type` for types
// (verbatimModuleSyntax), Zod-at-boundary on every read, module-level
// exported functions as the single-import surface.
//
// Contracts (issue #34 + decision #24):
//   1. ONE append-only row per visit. The row's primary key is the per-visit
//      uuid (ReadingSessionRecord.id); a visit's row is UPSERTED as its
//      totals refine (the flush discipline) but never duplicated — a second
//      visit appends a SECOND row with its own uuid. There is no update-by-
//      anything-else, no merge, no rewrite of a foreign row.
//   2. Recording never interrupts reading (D2-13): the store functions are
//      thin puts/reads; the caller (useReadingSession) swallows failures —
//      stats are local-first and non-critical.
//   3. Zod-at-boundary on read (STATE-04): every row passes
//      ReadingSessionRecordSchema.safeParse; corrupt rows are dropped calmly
//      (the loadAllHighlights/loadAllLocations precedent — a single corrupt
//      row never blocks the rest of the history).
//   4. Cascade deletion does NOT live here: it rides the existing
//      single-transaction cascades in DexieLibrarySource.remove and
//      booksStore.removeBook via the v7 `articleId` index (the v6 assets
//      precedent — the delete must be atomic with the article delete).
import { db } from "./db";
import type { ReadingSessionRecordRow } from "./db";
import { ReadingSessionRecordSchema } from "../content/schema";
import type { ReadingSessionRecord } from "../content/schema";

/**
 * putReadingSession — upsert one visit's row by its per-visit uuid primary
 * key. `record` is validated by construction (the only producer is the
 * ReadingSessionRecorder, which builds typed fields); we do not re-parse on
 * write (the saveLocation precedent). A throw propagates to the caller,
 * which swallows it (recording never interrupts reading — D2-13).
 */
export async function putReadingSession(
  record: ReadingSessionRecord,
): Promise<void> {
  const row: ReadingSessionRecordRow = {
    schemaVersion: record.schemaVersion,
    id: record.id,
    articleId: record.articleId,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    startOffset: record.startOffset,
    endOffset: record.endOffset,
    activeSeconds: record.activeSeconds,
  };
  await db.readingSessions.put(row);
}

/**
 * loadAllReadingSessions — load EVERY persisted reading-session row in a
 * single `db.readingSessions.toArray()` read. Read discipline mirrors
 * loadAllLocations (STATE-04 — Zod safeParse on every row): corrupt rows
 * are DROPPED silently, never coerced; a single malformed row must not
 * block the history. Callers (the future stats surfaces, tests) sort by
 * `startedAt` for recency — the v7 index makes Dexie-only queries possible
 * later, but the whole-library plain array is the seam today (the
 * loadAllHighlights precedent).
 */
export async function loadAllReadingSessions(): Promise<ReadingSessionRecord[]> {
  const rows = await db.readingSessions.toArray();
  const valid: ReadingSessionRecord[] = [];
  for (const row of rows) {
    const parsed = ReadingSessionRecordSchema.safeParse(row);
    if (parsed.success) {
      valid.push(parsed.data);
    }
    // else: drop the corrupt row silently — STATE-04 says never coerce.
  }
  return valid;
}
