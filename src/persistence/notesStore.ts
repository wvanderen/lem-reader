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
