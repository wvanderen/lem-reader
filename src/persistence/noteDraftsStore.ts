// src/persistence/noteDraftsStore.ts
// Persistence seam for the note-write recovery draft (issue #178). Mirrors
// src/persistence/notesStore.ts sibling-seam conventions: Zod safeParse on
// read, single-record put on write, STATE-05 error classification left to
// the caller.
//
// Scope (issue #178): the draft is the write-through mirror of the
// annotation state hook's in-memory pending note edit, keyed by the
// highlightId itself — the recovery scope is exactly the original
// highlight. Lifecycle owned by the callers:
//   - written on every pending edit (useAnnotationState.updateNote),
//   - cleared on a landed save (identity-gated — a late older success must
//     never clear a newer draft) and inside deleteHighlight's cascade
//     transaction (confirmed deletion only),
//   - retained across failed saves (the Retry flow keeps the net up),
//   - restored (or retired as stale) by restoreNoteDraft on the next open.
//
// Deliberately OUTSIDE the versioned export bundle: recovery is local-first
// device state (the settings-mirror precedent). There is NO loadAllNoteDrafts
// — the exporter's loadAll* seam set must never grow a drafts read, so the
// bundle schema, the manifest blocks, and the import merge stay untouched.
//
// Cascade-delete is NOT handled here — `deleteHighlight` in highlightsStore.ts
// owns the Dexie transaction that removes a highlight, its note(s), AND its
// recovery draft atomically (Pitfall 10). Cancelled or failed deletions never
// reach this store, so a cancelled deletion keeps the draft.
import { db } from "./db";
import { NoteDraftRecordSchema } from "../content/schema";
import type { NoteDraftRecord } from "../content/schema";

/**
 * Load the recovery draft for one highlight. Returns null when no draft
 * exists (the common case — nothing pending).
 *
 * Validates the row with `NoteDraftRecordSchema.safeParse()`. A corrupt row
 * is treated as "no draft" (null) — the draft is a best-effort recovery net,
 * and silently dropping a corrupt row preserves the highlight + note. The
 * caller never sees a corrupt NoteDraftRecord.
 *
 * Throws propagate to the caller (useAnnotationState.restoreNoteDraft, which
 * degrades to "no draft" — recovery never blocks opening the editor).
 */
export async function loadNoteDraft(highlightId: string): Promise<NoteDraftRecord | null> {
  const raw = await db.noteDrafts.get(highlightId);
  if (!raw) return null;
  const parsed = NoteDraftRecordSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Save (upsert) the recovery draft for one highlight. The primary key is the
 * highlightId, so consecutive edits replace the row in place — one draft per
 * highlight, always the latest pending text. `draft` is validated by
 * construction (the only producer is the annotation state hook). Throws
 * propagate to the caller (the write-through is best-effort and swallows
 * them — a failed net must never disturb the reading surface).
 */
export async function saveNoteDraft(draft: NoteDraftRecord): Promise<void> {
  await db.noteDrafts.put(draft);
}

/**
 * Delete the recovery draft for one highlight. Used on a landed note save
 * (identity-gated by the caller) and for stale-draft retirement at restore.
 * When expected is supplied, compare and delete in one transaction so
 * retirement of an older read cannot discard a newer edit.
 * A missing row is a no-op. Throws propagate to the caller (same best-effort
 * contract as saveNoteDraft).
 */
export async function deleteNoteDraft(
  highlightId: string,
  expected?: NoteDraftRecord,
): Promise<void> {
  await db.transaction("rw", db.noteDrafts, async () => {
    if (expected) {
      const current = await db.noteDrafts.get(highlightId);
      if (current?.updatedAt !== expected.updatedAt || current.text !== expected.text) return;
    }
    await db.noteDrafts.delete(highlightId);
  });
}
