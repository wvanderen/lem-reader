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
// DECIDES presence. The D5-10 empty-text persistence policy (text.length > 0)
// is unchanged; this predicate sits on top of it for the deletion-gating and
// preview decisions.
export function hasNoteContent(text: string): boolean {
  return text.trim().length > 0;
}
