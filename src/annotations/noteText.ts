// src/annotations/noteText.ts
// Issue #174 — the ONE "does this highlight carry written content?" predicate.
//
// Deletion must be proportional to the written content being removed: a
// highlight with no note deletes immediately, while deleting one that carries
// a nonempty note requires confirmation. "No note" means EMPTY OR
// WHITESPACE-ONLY commentary — a note of "" or "   " protects nothing, so it
// gates nothing, consistently in reading mode (NotePopover) and the
// cross-library Highlights view (ReviewView / DeleteHighlightConfirm).
//
// PREDICATE, NOT A NORMALIZER: callers never trim the stored text. A note
// with meaningful content keeps its exact bytes (leading/trailing whitespace
// included) everywhere it is saved, rendered, or exported — this helper only
// DECIDES presence. Issue #177: the predicate IS the persistence policy now
// (commitNoteSave / ReviewNoteDialog commit gate the write vs delete on it,
// and the optimistic draft collapses whitespace-only text to no note), not
// just the deletion/preview gate — empty AND whitespace-only commentary are
// "no note" everywhere: reading mode, the Highlights view, and the saved
// rows' rendered has-note shape.
export function hasNoteContent(text: string): boolean {
  return text.trim().length > 0;
}
