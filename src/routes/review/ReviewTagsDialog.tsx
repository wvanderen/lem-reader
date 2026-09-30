// src/routes/review/ReviewTagsDialog.tsx
// Issue #117 — the review panel's in-place HIGHLIGHT-tag editor. The
// ReviewNoteDialog twin in mechanism — the shared dialog-session lifecycle
// (native <dialog> + showModal: the browser supplies the modal accessibility
// context, the focus trap, and Esc-to-close; the trigger is captured BEFORE
// showModal and focus is restored on EVERY close path — Pitfall 1) now lives
// in ./useDialogSession — with the RowTagsPopover commit discipline (every
// picker change writes through the ONE setHighlightTags seam immediately, so
// no edit is ever lost on any close path; the panel's snapshot invalidation
// waits for CLOSE — one reload per editing session).
//
// Like NotePopover (issue #116), the editor is the ONE shared TagEntry
// host: fieldset + legend + TagPicker + StatusRegion + lazy suggestion
// stats, with a saveTags override routing commits to setHighlightTags
// (the highlight row ONLY — article and book tag assignments are never
// touched, and the note shares the highlight's tags by construction).
//
// D10-11 orphan/ambiguous editability is automatic: tags are keyed to the
// highlight id, so a ghost-article row edits its tags exactly like any
// other row — no article needed, and NO copy anywhere implies the anchor
// was repaired (tagging never depends on re-anchoring; the copy stays the
// neutral "Edit tags").
//
// Honesty (the issue #98 ReviewNoteDialog discipline): onDone reports the
// session's outcome exactly once — "saved" (≥1 write landed, none failed
// since), "failed" (the last write rejected), or "untouched" (no writes
// this session) — and only AFTER the latest write settles, so a Done or
// Escape racing an in-flight write still reports the write's truth. "Tags
// saved." can only ever announce a write that landed; a failed session
// announces the shared failure copy instead. A later successful write
// heals an earlier failure (the write is the whole normalized array, so
// the last write is authoritative).
import { useCallback, useEffect, useRef, useState } from "react";
import { setHighlightTags } from "../../ingestion/library/tagsStore";
import { TagEntry } from "../../reader/TagEntry";
// The shared dialog-session lifecycle (open/close sync, Pitfall 1 trigger
// capture + restore, exactly-once report guard) — the ReviewNoteDialog twin.
import { useDialogSession } from "./useDialogSession";

/**
 * Issue #117 — the honest commit-failure copy, shared with the panel's
 * close-path announcement (ReviewView's onDone handler). One sentence,
 * two seams — the constant keeps them from ever diverging.
 */
export const TAGS_SAVE_FAILED_COPY = "Couldn't save the tags. Try again.";

/** The session outcome reported to the panel on every close path. */
export type ReviewTagsOutcome = "untouched" | "saved" | "failed";

interface ReviewTagsDialogProps {
  /** When true, the dialog is open via showModal (focus-trapped). */
  open: boolean;
  /** The highlight whose tags are being edited (tags are keyed to this id). */
  highlightId: string;
  /** The highlight's current tags (exact stored casings). */
  tags: string[];
  /**
   * Invoked exactly once per session when the dialog closes, with the
   * session's honest write outcome (see ReviewTagsOutcome). "untouched"
   * sessions close silently — nothing was written, nothing is announced.
   */
  onDone: (outcome: ReviewTagsOutcome) => void;
}

export function ReviewTagsDialog({ open, highlightId, tags, onDone }: ReviewTagsDialogProps) {
  // Session-scoped bookkeeping:
  //   session (state) — bumped per open; keys TagEntry so every session
  //                  seeds a FRESH local mirror from the record (a canceled
  //                  or failed prior session never leaks into the next
  //                  one). STATE, not a ref: the key must change only when
  //                  the session does — a ref read during render would
  //                  remount TagEntry mid-session on any unrelated parent
  //                  re-render (a snapshot reload), losing the draft.
  //   outcome (ref)  — the honest per-session write outcome (last write
  //                  wins; a successful retry heals an earlier failure).
  //   pendingWrite (ref) — the latest write's settlement. Done/Escape
  //                  AWAIT it before reporting, so a close racing an
  //                  in-flight write can never report "untouched" for an
  //                  edit that is about to land (WebKit e2e pinned this).
  // The dialog ref, the trigger capture/restore, and the exactly-once
  // report guard live in the shared useDialogSession lifecycle.
  const [session, setSession] = useState(0);
  const outcomeRef = useRef<ReviewTagsOutcome>("untouched");
  const pendingWriteRef = useRef<Promise<void>>(Promise.resolve());

  // Fresh session state BEFORE showModal (the hook calls this after the
  // trigger capture): re-key TagEntry (fresh seed), arm the honest outcome,
  // and reset the write settlement. Focus is NOT here — the session-keyed
  // TagEntry remount replaces the input node, so focus waits for the effect
  // below (the explicitly-opened-host exception; TagEntry itself stays
  // inert at mount by design).
  const handleOpen = useCallback(() => {
    setSession((s) => s + 1);
    outcomeRef.current = "untouched";
    pendingWriteRef.current = Promise.resolve();
  }, []);

  // The close-path report: the session's honest outcome AFTER the latest
  // write settles — a close racing an in-flight write must never report
  // "untouched" for an edit that is about to land (the write-through
  // fire-starts before the vocabulary + Dexie reads resolve, so the race
  // is real). Shared by the `close` listener and Done via the hook's guard.
  const reportOutcome = useCallback(() => {
    void pendingWriteRef.current.then(() => onDone(outcomeRef.current));
  }, [onDone]);

  const { dialogRef, reportClose } = useDialogSession(open, {
    onOpen: handleOpen,
    onClose: reportOutcome,
  });

  // Focus the picker input AFTER the session-keyed TagEntry remount settles
  // (the open effect's setSession re-render replaces the input node — a
  // focus applied to the pre-remount node would die with it). The
  // explicitly-opened-host exception (the RowTagsPopover focusOnMount
  // precedent; TagEntry itself stays inert at mount by design); explicit
  // focus because showModal does not reliably focus the first control in
  // WebKit (the ReviewNoteDialog quirk).
  useEffect(() => {
    if (!open) return;
    const dlg = dialogRef.current;
    if (!dlg || !dlg.open) return;
    dlg.querySelector<HTMLInputElement>("input#review-tags-input")?.focus();
  }, [open, session, dialogRef]);

  /** The ONE write path — TagEntry's commitTags calls this on every picker
   * change (write-through, the RowTagsPopover discipline). Tracks the
   * honest outcome for the close-path announcement; a failure is RETHROWN
   * so TagEntry surfaces its calm "Couldn't save tag." line in the
   * dialog's own StatusRegion (A11Y-08) while the panel announces the
   * session failure on close. The write's SETTLEMENT is also tracked
   * (pendingWriteRef) so the close-path report (reportOutcome) can await it
   * before reporting — see that comment for the race it closes. Never
   * throws to a caller that doesn't catch. */
  const handleSaveTags = (next: string[]): Promise<void> => {
    const write = (async () => {
      try {
        await setHighlightTags(highlightId, next);
        outcomeRef.current = "saved";
      } catch (err) {
        outcomeRef.current = "failed";
        throw err;
      }
    })();
    pendingWriteRef.current = write.then(
      () => {},
      () => {},
    );
    return write;
  };

  // The <dialog> is always mounted (showModal requires the element to be in
  // the DOM). Until showModal() runs it is display:none (UA stylesheet) and
  // absent from the accessibility tree. All text renders as React text
  // children (T-10-02b — escaping by default; stored/imported tag names
  // never become markup).
  return (
    <dialog
      ref={dialogRef}
      className="highlight-popover review-tags-dialog"
      aria-labelledby="review-tags-title"
    >
      <h2 id="review-tags-title" className="review-note-title">
        Edit tags
      </h2>
      <TagEntry
        key={`${highlightId}-${session}`}
        recordId={highlightId}
        tags={tags}
        saveTags={handleSaveTags}
        inputId="review-tags-input"
      />
      <div className="highlight-popover-actions">
        {/* Non-destructive default (Pitfall 8): Enter confirms the edit
            session. Carries [data-initial-focus] as the documented
            non-destructive default; the open path still focuses the picker
            input explicitly. */}
        <button
          type="button"
          className="btn btn-quiet highlight-popover-done"
          onClick={reportClose}
          data-initial-focus
        >
          Done
        </button>
      </div>
    </dialog>
  );
}
