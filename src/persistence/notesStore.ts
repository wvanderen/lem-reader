// src/persistence/notesStore.ts
// Persistence seam for note records attached to highlights (Phase 5 —
// ANNO-02, STATE-03/04/05). Mirrors src/persistence/locationStore.ts +
// settingsStore.ts sibling-seam conventions: Zod safeParse on read, single-
// record put on write, STATE-05 error classification left to the caller.
//
// D5-10: an empty-text note = no NoteRecord (the caller deletes or never
// creates it). This store persists whatever it is given — the empty-text
// policy is owned by the annotation state hook (Plan 05-03's popover).
//
// Cascade-delete is NOT handled here — `deleteHighlight` in highlightsStore.ts
// owns the Dexie transaction that removes a highlight AND its note atomically
// (Pitfall 10). This store's saveNote only writes the single note row.
import { db } from "./db";
import { NoteRecordSchema } from "../content/schema";
import type { NoteRecord } from "../content/schema";

/**
 * Load the note attached to a highlight (1:1 via the `highlightId` index).
 * Returns null when no note exists for the highlight (the common case for a
 * bare highlight created via "Highlight" without "+ note").
 *
 * Validates the row with `NoteRecordSchema.safeParse()`. A corrupt row is
 * treated as "no note" (null) — the note is the less-critical half of the
 * highlight+note pair, and silently dropping a corrupt note preserves the
 * highlight itself. The caller never sees a corrupt NoteRecord.
 *
 * Throws propagate to the caller for STATE-05 routing (this store does not
 * own a LoadResult discriminated union because notes are loaded alongside
 * highlights by the annotation state hook, which already routes via
 * classifyStorageError).
 */
export async function loadNote(highlightId: string): Promise<NoteRecord | null> {
  const raw = await db.notes.where("highlightId").equals(highlightId).first();
  if (!raw) return null;
  const parsed = NoteRecordSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Save (upsert) a note. `note` is validated by construction (the only
 * producer is the annotation state hook). Throws propagate to the caller for
 * STATE-05 routing. Empty-text notes are persisted as-is if the caller
 * chooses to write them (D5-10's empty-text policy is enforced upstream).
 */
export async function saveNote(note: NoteRecord): Promise<void> {
  await db.notes.put(note);
}

/**
 * Delete the note attached to a highlight (1:1 via the `highlightId` index).
 * Used by the annotation state hook's debounced save when the reader clears
 * the textarea (D5-10 empty-text policy — an empty note = no NoteRecord).
 * Throws propagate to the caller for STATE-05 routing.
 */
export async function deleteNote(highlightId: string): Promise<void> {
  await db.notes.where("highlightId").equals(highlightId).delete();
}

/**
 * `loadAllNotes` — Load EVERY persisted NoteRecord in a single
 * `db.notes.toArray()` read (Plan 09-02 — PORT-01 export side; RESEARCH
 * Pitfall 5: the export service must not N+1 `loadNote` per highlight or
 * bypass STATE-04 validation with a raw read).
 *
 * Mirrors `loadAllLocations` (locationStore.ts L136-147) exactly: whole-store
 * toArray + per-row `NoteRecordSchema.safeParse()` + silent corrupt-row drop
 * (STATE-04 says never coerce) + a plain-array return — the whole-library
 * read contract, symmetric with `loadAllHighlights` in highlightsStore.ts.
 */
export async function loadAllNotes(): Promise<NoteRecord[]> {
  const rows = await db.notes.toArray();
  const valid: NoteRecord[] = [];
  for (const row of rows) {
    const parsed = NoteRecordSchema.safeParse(row);
    if (parsed.success) {
      valid.push(parsed.data);
    }
    // else: drop the corrupt row silently — STATE-04 says never coerce.
  }
  return valid;
}
