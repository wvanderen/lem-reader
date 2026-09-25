// src/routes/review/ReviewNoteDialog.tsx
// Plan 10-05 Task 1 — the review panel's in-place note editor (RECV-01.f,
// D10-11, D5-10). STRUCTURAL CLONE of src/reader/annotations/NotePopover.tsx
// (Phase 5 Plan 05-03) — NOT a shared component and NOT an import of it.
// NotePopover reads useHighlightOverlay() (the per-article provider mounted
// inside ArticleView); the review panel lives OUTSIDE that provider, so this
// clone takes its data as PROPS and calls the notes store directly (the
// 08-04/09-05 Pitfall 8 structural-clone lineage — two ~150-line dialogs is
// the priced cost of keeping each commit path grep-isolated).
//
// Clone discipline preserved verbatim from NotePopover:
//   - Native <dialog> + showModal(): the browser supplies the modal-dialog
//     accessibility context (focus scope + background inert + the "modal
//     shown" AT event VoiceOver needs), the focus trap, and Esc-to-close.
//   - Open path captures document.activeElement into triggerRef BEFORE
//     showModal (Pitfall 1 — showModal does not auto-restore focus).
//   - The `close` event listener restores triggerRef.current?.focus() on
//     EVERY close path (Pitfall 1 / A11Y-02).
//   - The textarea value renders as a React text child — NEVER raw HTML
//     (Pitfall 8 note XSS; react/no-danger + lint:no-danger enforced
//     repo-wide; T-10-05a).
//
// COMMIT SEMANTICS (research Pitfall 7, simple option — NOT the debounce):
// the panel editor commits ONCE per session through a single commit()
// function, invoked from BOTH the Done button onClick AND the dialog close
// listener — so every close path (Done, Esc) routes through the same commit
// and no keystrokes are lost. A session guard ref keeps the write
// exactly-once: the Done path commits, onDone() flips the parent's open prop,
// the sync effect calls dlg.close(), and the close listener's guarded commit
// is a no-op.
//
// D5-10 empty-text policy (owned HERE, as the dialog): empty text →
// deleteNote(highlightId) (an empty note = no NoteRecord); non-empty text →
// saveNote(...) built to the NoteRecord schema shape (id reused from the
// existing note, else crypto.randomUUID() — the useAnnotationState L365
// upsert precedent; text.length > 0 check mirrors commitNoteSave L270
// verbatim so panel edits behave identically to reader edits).
//
// D10-11 orphan editability is automatic: notes are keyed to highlightId
// (NoteRecordSchema has no article join), so a ghost-article row edits its
// note exactly like any other row — no article needed. The articleId prop is
// informational (carried from the highlight row; reserved for future
// per-article copy) — RemoveConfirm's `void articleTitle` precedent.
//
// A failed write must not strand the dialog (the RemoveConfirm catch
// discipline) — and, issue #98, it must never be REPORTED as a save:
// commit() resolves to a boolean. Done keeps the dialog OPEN on failure
// (calm error line through the ONE StatusRegion primitive; the guard ref
// re-arms so the next Done retries); a close-path failure (Esc while the
// write already failed once) reports saved=false so the panel announces
// the honest failure instead of "Note saved.". "Note saved." can only ever
// announce a write that landed.
import { useCallback, useEffect, useRef, useState } from "react";
import { deleteNote, saveNote } from "../../persistence/notesStore";
import type { NoteRecord } from "../../content/schema";
// Issue #98 — the ONE polite status-region primitive.
import { StatusRegion } from "../../ui/StatusRegion";

interface ReviewNoteDialogProps {
  /** When true, the dialog is open via showModal (focus-trapped). */
  open: boolean;
  /** The highlight whose note is being edited (notes are 1:1 via this id). */
  highlightId: string;
  /** The highlight's articleId — informational; notes never join it (D10-11). */
  articleId: string;
  /** The highlight's current note, or null when it has none yet. */
  existing: NoteRecord | null;
  /**
   * Invoked when the dialog closes with the session's write outcome —
   * `saved` is true only when the commit landed (issue #98: the panel's
   * "Note saved." announcement is gated on it). Every close path calls it
   * exactly once so the parent's target state never wedges.
   */
  onDone: (saved: boolean) => void;
}

export function ReviewNoteDialog({
  open,
  highlightId,
  articleId,
  existing,
  onDone,
}: ReviewNoteDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  // The trigger element that opened the dialog (the row's Edit note button).
  // Captured on open so the `close` listener can restore focus to it
  // (Pitfall 1 — mirrors NotePopover/SettingsPanel/RemoveConfirm).
  const triggerRef = useRef<HTMLElement | null>(null);

  // Local textarea state — seeded fresh from `existing` on every open (a
  // prior canceled session never leaks into the next one; the
  // ImportPreviewDialog fresh-choices reset precedent). Rendered as a React
  // text child (T-10-05a — never raw HTML).
  const [text, setText] = useState("");

  // Session guard: exactly ONE commit per open session. True initially
  // (nothing to commit before the first open); flipped false on the open
  // transition, back true by commit(). Issue #98 — a FAILED commit re-arms
  // the guard so the next Done retries the write.
  const committedRef = useRef(true);

  // Issue #98 — the honest-failure state: a rejected write keeps the dialog
  // open (Done path) with this calm line; reset on every fresh open.
  const [writeError, setWriteError] = useState(false);

  // Silence unused-prop lint: articleId is informational (D10-11 — the note
  // is keyed to highlightId; the article need not exist for the edit to
  // work). Reserved for future per-article copy (RemoveConfirm precedent).
  void articleId;

  // Sync the `open` prop with the underlying <dialog> state (the NotePopover
  // L99-131 clone shape).
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      // Fresh session state BEFORE showModal: seed the textarea and arm the
      // commit guard (a canceled prior session never leaks). Issue #98 —
      // including a prior session's failed-write error.
      setText(existing?.text ?? "");
      setWriteError(false);
      committedRef.current = false;
      // Capture the trigger BEFORE showModal moves focus into the dialog
      // (Pitfall 1).
      triggerRef.current = document.activeElement as HTMLElement | null;
      try {
        dlg.showModal();
      } catch {
        // showModal throws if the element is already in the top layer or if
        // the browser doesn't support <dialog>. Either way the editor is in
        // the DOM; the close path is guarded by dlg.open below.
      }
      // Focus the textarea (D5-10 — focus → textarea on open) + select the
      // existing text so the reader can edit or replace in one gesture
      // (UI-SPEC §29). Explicit focus: showModal does not reliably focus
      // the first control in WebKit (Pitfall 1 cross-engine quirk).
      const textarea = dlg.querySelector<HTMLTextAreaElement>("textarea");
      if (textarea) {
        textarea.focus();
        textarea.select();
      }
    } else if (!open && dlg.open) {
      // State-driven close (Done committed → onDone() → parent flipped the
      // open prop). dlg.close() fires the `close` event → the listener
      // below runs the guarded commit (a no-op after Done) + restores
      // focus to the trigger.
      dlg.close();
    }
  }, [open, existing]);

  // ── THE ONE COMMIT PATH (Pitfall 7) ─────────────────────────────────────
  // Invoked from BOTH the Done button onClick AND the dialog close listener;
  // the committedRef guard keeps the write exactly-once per session (a
  // FAILED commit re-arms it — issue #98 — so the next Done retries).
  // D5-10 empty-text policy lives here: empty text → deleteNote (no
  // NoteRecord); non-empty → saveNote upsert to the NoteRecord schema shape.
  //
  // Outcome vocabulary (issue #98):
  //   - "handled" — the guard was already set: another path owns the
  //     outcome (the close listener's no-op after Done; the caller must
  //     NOT re-report). Pre-#98 behavior preserved (the old guard early-
  //     return never called onDone either).
  //   - "saved"   — the write landed this call.
  //   - "failed"  — the write rejected this call (guard re-armed).
  type CommitOutcome = "handled" | "saved" | "failed";
  const commit = useCallback(async (): Promise<CommitOutcome> => {
    if (committedRef.current) return "handled";
    committedRef.current = true;
    try {
      if (text.length > 0) {
        await saveNote({
          schemaVersion: 1,
          // Upsert: reuse the existing note id, else mint one (the
          // useAnnotationState L365 crypto.randomUUID() precedent).
          id: existing?.id ?? crypto.randomUUID(),
          highlightId,
          text,
          updatedAt: new Date().toISOString(),
        });
      } else {
        // D5-10: an empty note = no NoteRecord. Delete the persisted row
        // if one exists (mirrors commitNoteSave's else branch verbatim).
        await deleteNote(highlightId);
      }
    } catch {
      // Issue #98 — the honest failure. Re-arm the guard (a Done retry
      // must re-attempt the write) and report the failure.
      setWriteError(true);
      committedRef.current = false;
      return "failed";
    }
    return "saved";
  }, [text, highlightId, existing]);

  // Register the `close` event listener (with cleanup). Native <dialog>
  // fires `close` on EVERY close path — Escape (browser-default) and the
  // state-driven dlg.close() above. On close: route through the single
  // commit (Pitfall 7 — an Esc never loses edits; the no-op after Done's
  // guarded commit reports "handled" and does NOT re-report the outcome)
  // and restore focus to the captured trigger (Pitfall 1). Issue #98 —
  // a resolved close reports the outcome ("saved"/"failed") so the panel
  // never announces "Note saved." for a write that did not land. onDone
  // still fires on every RESOLVED close path (the parent's target state
  // must never wedge).
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    const handleClose = () => {
      triggerRef.current?.focus();
      void commit().then((outcome) => {
        if (outcome === "handled") return;
        onDone(outcome === "saved");
      });
    };
    dlg.addEventListener("close", handleClose);
    return () => dlg.removeEventListener("close", handleClose);
  }, [commit, onDone]);

  /** Done button — routes through the same single commit. Issue #98: on
   * success the commit's onDone(true) flips the parent's open prop (the
   * sync effect then closes the dialog and the close listener's guarded
   * commit reports "handled" — no double report). On FAILURE the dialog
   * STAYS OPEN with the calm error line; the guard is re-armed so the
   * next Done retries the write. */
  const handleDone = () => {
    void commit().then((outcome) => {
      if (outcome === "saved") onDone(true);
    });
  };

  // The <dialog> is always mounted (showModal requires the element to be in
  // the DOM). Until showModal() runs it is display:none (UA stylesheet) and
  // absent from the accessibility tree.
  return (
    <dialog
      ref={dialogRef}
      className="highlight-popover review-note-dialog"
      aria-labelledby="review-note-title"
    >
      <h2 id="review-note-title" className="review-note-title">
        Edit note
      </h2>
      <div className="highlight-popover-note">
        <label className="visually-hidden" htmlFor="review-note-textarea">
          Note
        </label>
        <textarea
          id="review-note-textarea"
          className="highlight-popover-textarea"
          value={text}
          placeholder="Add a note (optional)"
          onChange={(e) => setText(e.currentTarget.value)}
          rows={3}
        />
      </div>
      {/* Issue #98 — the honest-failure line. Always-mounted StatusRegion
          (a live region must pre-exist to announce); idle it renders no
          children and paints nothing (the shared dialog rules). */}
      <StatusRegion>
        {writeError && <p>Couldn't save the note. Try again.</p>}
      </StatusRegion>
      <div className="highlight-popover-actions">
        {/* Non-destructive default (Pitfall 8): Enter confirms the edit,
            never deletes. Carries [data-initial-focus] as the documented
            non-destructive default; the open path still focuses+selects the
            textarea explicitly (the NotePopover D5-10 discipline). */}
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
