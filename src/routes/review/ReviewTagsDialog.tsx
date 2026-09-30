// src/routes/review/ReviewTagsDialog.tsx
// Issue #117 — the review panel's in-place HIGHLIGHT-tag editor. The
// ReviewNoteDialog twin in mechanism (native <dialog> + showModal: the
// browser supplies the modal accessibility context, the focus trap, and
// Esc-to-close; the trigger is captured BEFORE showModal and focus is
// restored on EVERY close path — Pitfall 1) with the RowTagsPopover commit
// discipline (every picker change writes through the ONE setHighlightTags
// seam immediately, so no edit is ever lost on any close path; the panel's
// snapshot invalidation waits for CLOSE — one reload per editing session).
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
import { useEffect, useRef, useState } from "react";
import { setHighlightTags } from "../../ingestion/library/tagsStore";
import { TagEntry } from "../../reader/TagEntry";

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
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  // The trigger element that opened the dialog (the row's Edit tags
  // button). Captured on open so the `close` listener can restore focus
  // (Pitfall 1 — mirrors ReviewNoteDialog/NotePopover).
  const triggerRef = useRef<HTMLElement | null>(null);

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
  //   reported (ref) — exactly-once onDone guard per session (true
  //                  initially: nothing to report before the first open;
  //                  re-armed on every open transition).
  //   pendingWrite (ref) — the latest write's settlement. Done/Escape
  //                  AWAIT it before reporting, so a close racing an
  //                  in-flight write can never report "untouched" for an
  //                  edit that is about to land (WebKit e2e pinned this).
  const [session, setSession] = useState(0);
  const outcomeRef = useRef<ReviewTagsOutcome>("untouched");
  const reportedRef = useRef(true);
  const pendingWriteRef = useRef<Promise<void>>(Promise.resolve());

  // Sync the `open` prop with the underlying <dialog> state (the
  // ReviewNoteDialog clone shape).
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      // Fresh session state BEFORE showModal: re-key TagEntry (fresh seed),
      // arm the honest outcome + the exactly-once report guard, and capture
      // the trigger BEFORE showModal moves focus into the dialog (Pitfall 1).
      setSession((s) => s + 1);
      outcomeRef.current = "untouched";
      reportedRef.current = false;
      pendingWriteRef.current = Promise.resolve();
      triggerRef.current = document.activeElement as HTMLElement | null;
      try {
        dlg.showModal();
      } catch {
        // showModal throws if the element is already in the top layer or if
        // the browser doesn't support <dialog>. Either way the editor is in
        // the DOM; the close path is guarded by dlg.open below.
      }
    } else if (!open && dlg.open) {
      // State-driven close (Done reported → onDone() → parent flipped the
      // open prop). dlg.close() fires the `close` event → the listener
      // below restores focus (the guarded report is a no-op after Done).
      dlg.close();
    }
  }, [open]);

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
  }, [open, session]);

  // Register the `close` event listener (with cleanup). Native <dialog>
  // fires `close` on EVERY close path — Escape (browser-default) and the
  // state-driven dlg.close() above. On close: restore focus to the captured
  // trigger and report the session outcome exactly once (Done already
  // reported — the guard makes that path a no-op here), AFTER the latest
  // write settles so the reported outcome is the write's truth.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    const handleClose = () => {
      triggerRef.current?.focus();
      if (reportedRef.current) return;
      reportedRef.current = true;
      void pendingWriteRef.current.then(() => onDone(outcomeRef.current));
    };
    dlg.addEventListener("close", handleClose);
    return () => dlg.removeEventListener("close", handleClose);
  }, [onDone]);

  /** Done button — report the honest outcome (after the latest write
   * settles); the parent's open-prop flip routes the actual close through
   * the sync effect + close listener. */
  const handleDone = () => {
    if (reportedRef.current) return;
    reportedRef.current = true;
    void pendingWriteRef.current.then(() => onDone(outcomeRef.current));
  };

  /** The ONE write path — TagEntry's commitTags calls this on every picker
   * change (write-through, the RowTagsPopover discipline). Tracks the
   * honest outcome for the close-path announcement; a failure is RETHROWN
   * so TagEntry surfaces its calm "Couldn't save tag." line in the
   * dialog's own StatusRegion (A11Y-08) while the panel announces the
   * session failure on close. The write's SETTLEMENT is also tracked
   * (pendingWriteRef) so Done/Escape can await it before reporting — a
   * close racing an in-flight write must never report "untouched" for an
   * edit that is about to land (the write-through fire-starts before the
   * vocabulary + Dexie reads resolve, so the race is real). Never throws
   * to a caller that doesn't catch. */
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
          onClick={handleDone}
          data-initial-focus
        >
          Done
        </button>
      </div>
    </dialog>
  );
}
