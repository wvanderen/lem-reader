// src/routes/review/DeleteHighlightConfirm.tsx
// Plan 10-05 Task 2 — the review panel's destructive-confirm dialog
// (RECV-01.f, D10-12). STRUCTURAL CLONE of src/ingestion/library/
// RemoveConfirm.tsx (Plan 08-04; itself a clone of WipeConfirm — the
// 08-04/09-05 Pitfall 8 lineage) — NOT a shared dialog component.
// RemoveConfirm hardcodes `dexieLibrarySource.remove(articleId)`; this clone
// swaps in `deleteHighlight(highlightId)` (highlightsStore L105-110 — ONE
// Dexie transaction cascade-deletes the highlight AND its note(s): one call,
// one rollback unit; the panel never makes a second notes call).
//
// Clone discipline preserved verbatim from RemoveConfirm (+ the 09-06
// ImportPreviewDialog Esc fix, the newest discipline in the lineage):
//   - useEffect syncs the `open` prop with showModal()/close().
//   - Capture document.activeElement on open; restore focus in the `close`
//     listener (Pitfall 1 — showModal does not auto-restore).
//   - An ESC-originated close (open prop still true) routes cleanup through
//     onCancel — otherwise removeTarget would stay set and the effect
//     ([open] deps) could never re-fire, wedging the dialog shut for every
//     later row (the 09-06 same-file-retry guarantee; Esc is not the hole).
//   - Explicit .focus() on [data-initial-focus] after showModal (WebKit
//     quirk — predictable focus trap + initial reading position).
//   - [data-initial-focus] on the NON-DESTRUCTIVE "Keep highlight" button
//     (Pitfall 8 — an accidental Enter cannot delete; T-10-05b).
//
// CRITICAL — Pitfall 8 (T-10-05b): the destructive write
// `deleteHighlight(highlightId)` fires ONLY inside the destructive button's
// onClick handler in THIS file. Never in a catch block, never in an effect,
// never automatically. ReviewView routes `removeTarget !== null` to this
// dialog (open); the actual delete fires only when the reader clicks
// "Remove highlight" below.
//
// Cascade-honest copy (D10-12 / T-10-05c): the body names the consequence —
// the note attached to the highlight is removed with it — in the
// RemoveConfirm register ("…will also be removed."). The excerpt renders as
// informational context (aria-describedby, the NotePopover excerpt pattern)
// so screen-reader users can tell WHICH highlight the dialog is about.
//
// Issue #98 (decision #96) — HONEST WRITE FAILURES: a failed delete keeps
// the dialog open with a calm error line through the ONE StatusRegion
// primitive, and onConfirm (which closes the target + announces "Highlight
// removed.") fires ONLY after the write resolves — the panel can never
// announce a
// removal that did not happen. The destructive button carries the unified
// in-flight register while the write runs. Issue #98 review — the
// pending/writeError state machine and the busy register are the SHARED
// useHonestWrite hook + BusyButton primitive now; only the write itself
// (and the copy) stay local here.
//
// Issue #174 — proportional routing + focus handoff: the panel opens this
// dialog ONLY for highlights carrying a nonempty note (the hasNoteContent
// predicate) — a no-note row removes immediately from the row's Remove
// click in ReviewView, so the destructive write now has TWO sanctioned call
// sites (this button for noted highlights; ReviewView's immediate path for
// note-less ones — both direct results of a deliberate reader click). On a
// SUCCESSFUL delete the deleted row's Remove button (the captured trigger)
// unmounts, so the close listener must NOT restore focus to it — it calls
// onRemovedClose instead, and the panel moves focus to a NEIGHBORING row
// (the focus-nearby discipline; also keeps focus out of the unmounting
// trigger). Cancel/Esc keep the plain trigger restore.
import { useEffect, useRef } from "react";
import { deleteHighlight } from "../../persistence/highlightsStore";
// Issue #98 — the ONE polite status-region primitive + the shared
// honest-write/busy primitives.
import { StatusRegion } from "../../ui/StatusRegion";
import { BusyButton } from "../../ui/BusyButton";
import { useHonestWrite } from "../../ui/honestWrite";

/**
 * Issue #174 — the shared honest-failure copy for a highlight removal that
 * did not land: the inline dialog line AND the panel's page-level
 * announcement (ReviewView's immediate no-note path) render the ONE
 * constant so the two surfaces can never diverge.
 */
export const HIGHLIGHT_REMOVE_FAILED_COPY = "Couldn't remove this highlight. Try again.";

/** Truncation limit for the excerpt context (the NotePopover
 * EXCERPT_MAX_CHARS precedent). Plain string operation — the result renders
 * as a React text child (T-10-05a). */
const EXCERPT_MAX_CHARS = 200;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

interface DeleteHighlightConfirmProps {
  /** When true, the dialog is open via showModal (focus-trapped). */
  open: boolean;
  /** The highlight id to remove on confirm (its note cascades with it). */
  highlightId: string;
  /** The highlight's quote excerpt — informational context for the copy. */
  excerpt: string;
  /** Invoked by the destructive button AFTER the cascade resolves. */
  onConfirm: () => void;
  /** Invoked by the cancel button (or Esc). Nothing is written. */
  onCancel: () => void;
  /**
   * Issue #174 — invoked (instead of the trigger focus restore) when the
   * close event follows a SUCCESSFUL delete: the deleted row's Remove
   * button (the captured trigger) unmounts, so the panel hands focus to a
   * neighboring row's control. Cancel/Esc paths keep the plain restore.
   */
  onRemovedClose?: () => void;
}

export function DeleteHighlightConfirm({
  open,
  highlightId,
  excerpt,
  onConfirm,
  onCancel,
  onRemovedClose,
}: DeleteHighlightConfirmProps) {
  const ref = useRef<HTMLDialogElement>(null);
  // Capture the previously-focused element on open so the close handler can
  // restore focus (Pitfall 1 — same discipline as RemoveConfirm).
  const triggerRef = useRef<HTMLElement | null>(null);
  // Issue #98 — the write's honest state (the SHARED useHonestWrite hook —
  // the RemoveConfirm discipline): pending drives the unified busy register;
  // writeError keeps the dialog open with the calm error line. Both reset on
  // every fresh open (below).
  const { pending, writeError, reset: resetWrite, run: runWrite } = useHonestWrite();
  // Mirror the `open` prop at event time so the `close` listener can tell an
  // ESC-originated close (open still true — the parent doesn't know yet, so
  // the listener must route cleanup via onCancel) from the CONTROLLED close
  // (open already false — the Confirm/Cancel handler already ran its own
  // cleanup; calling onCancel again would wipe the announcement the
  // onConfirm path just wrote) — the ImportPreviewDialog L123-129 fix.
  const openRef = useRef(open);
  openRef.current = open;
  // Issue #174 — set immediately before onConfirm fires; the `close` event
  // then routes to onRemovedClose (focus-nearby handoff) instead of the
  // trigger restore (the deleted row's Remove button is unmounting).
  const removedSucceededRef = useRef(false);

  // Latest-handler mirrors so BOTH listeners below can be registered ONCE
  // (mount-only effect) and still call the CURRENT props at event time (the
  // useSelectionToolbar event-time-ref discipline). Re-registering on every
  // render (the former [onCancel, onRemovedClose] deps — onCancel is a fresh
  // inline arrow per render) raced React's passive-effect pass, which runs
  // ALL destroys before ALL creates: on the render where `open` flips false,
  // the [open] effect's dlg.close() dispatched the close event AFTER the old
  // listener was destroyed but BEFORE the new one existed — the event fired
  // into the void, so the removed-close focus handoff (and every close path's
  // trigger restore) silently never ran.
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const onRemovedCloseRef = useRef(onRemovedClose);
  onRemovedCloseRef.current = onRemovedClose;

  // Sync the `open` prop with the underlying <dialog> state.
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      triggerRef.current = document.activeElement as HTMLElement | null;
      dlg.showModal(); // browser: focus→first focusable, trap, inert backdrop, Esc closes
      // Issue #98 — fresh session state (the D16-08 discipline).
      resetWrite();
      // Cross-engine focus management (Pitfall 1 + WebKit quirk, same as
      // RemoveConfirm): explicitly focus the [data-initial-focus] element so
      // the focus trap and the initial reading position are predictable in
      // WebKit. The CANCEL button carries the marker — focusing the
      // destructive action by default would risk an accidental Enter
      // removing a highlight+note. The reader must move focus to
      // "Remove highlight" deliberately.
      const initial =
        dlg.querySelector<HTMLElement>("[data-initial-focus]") ??
        dlg.querySelector<HTMLElement>(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
        ) ??
        dlg;
      initial.focus();
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open, resetWrite]);

  // Register the `close` + scrim-click listeners ONCE (mount-only — see the
  // latest-handler mirrors above for why these must never re-register).
  // Restore focus to the captured trigger (Pitfall 1), and — when the close
  // was ESC-originated (the open prop still says open) — route cleanup
  // through onCancel so the parent's removeTarget resets on EVERY close
  // path.
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const handleClose = () => {
      // Issue #174 — a close following a successful delete must NOT restore
      // focus to the deleted row's Remove button (it is unmounting; the
      // restore would silently no-op and drop focus). The panel's
      // onRemovedClose moves focus to a neighboring row instead. Every other
      // close path (Keep highlight, Esc, scrim) restores the trigger — the
      // row is still there.
      if (removedSucceededRef.current) {
        removedSucceededRef.current = false;
        onRemovedCloseRef.current?.();
      } else {
        triggerRef.current?.focus();
      }
      if (openRef.current) onCancelRef.current();
    };
    // A click whose target IS the dialog element itself is the dimmed
    // ::backdrop (padding: 0 + the .library-remove-confirm-inner wrapper
    // mean the dialog border box == the visible card, so clicks on visible
    // content always target descendants). Route it through the SAME
    // onCancel path the "Keep highlight" button uses — the parent flips
    // the open prop, the sync effect calls dlg.close(), and the close
    // listener's openRef check then skips its own onCancel (no
    // double-cancel). Never dlg.close() from here (the 09-06 wedge
    // lesson).
    const handleScrimClick = (e: MouseEvent) => {
      if (e.target === dlg) onCancelRef.current();
    };
    dlg.addEventListener("close", handleClose);
    dlg.addEventListener("click", handleScrimClick);
    return () => {
      dlg.removeEventListener("close", handleClose);
      dlg.removeEventListener("click", handleScrimClick);
    };
    // Mount-only: the handlers read the latest props through refs.
  }, []);

  // ── PITFALL 8 LOAD-BEARING HANDLER ──────────────────────────────────────
  // The ONLY call site for `deleteHighlight` in the review feature. It lives
  // in the destructive button's onClick — never in a catch block or effect.
  // The reader must click "Remove highlight" to fire this; nothing else
  // triggers it.
  // Issue #98 — honest failure: a rejected delete keeps the dialog open
  // with the calm error line; onConfirm runs ONLY on success — the panel's
  // snapshot invalidation + "Highlight removed." announcement therefore
  // describe a removal that actually happened. ONE call: the Dexie
  // transaction cascade-deletes the highlight AND its note(s) atomically
  // (D5-12 / Pitfall 10 — no second notes call). The delete closure stays
  // in the click handler (Pitfall 8); the shared hook owns only the
  // pending/error bookkeeping around it.
  const onDestructiveClick = async () => {
    if (await runWrite(() => deleteHighlight(highlightId))) {
      // Issue #174 — flag the success BEFORE onConfirm flips the parent's
      // open prop: the close event that follows routes focus to the panel's
      // onRemovedClose (nearby-row handoff), never the unmounting trigger.
      removedSucceededRef.current = true;
      onConfirm();
    }
  };

  return (
    <dialog
      ref={ref}
      className="library-remove-confirm review-remove-confirm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="review-remove-title"
      aria-describedby="review-remove-body review-remove-excerpt"
    >
      <div className="library-remove-confirm-inner">
        <h2 id="review-remove-title">Remove this highlight?</h2>
        {/* Cascade-honest copy (D10-12 / T-10-05c): the attached note is
            removed with the highlight — RemoveConfirm's "will also be
            removed" register. The Dexie transaction makes that removal
            atomic, so the copy never overstates or understates. */}
        <p id="review-remove-body">
          Remove this highlight? The note attached to it will also be removed.
        </p>
        {/* Informational excerpt context (the NotePopover aria-describedby
            pattern) — a React text child, never raw HTML (T-10-05a). */}
        {excerpt.length > 0 && (
          <p id="review-remove-excerpt" className="highlight-popover-excerpt">
            <span className="visually-hidden">Highlighted text:</span>{" "}
            {truncate(excerpt, EXCERPT_MAX_CHARS)}
          </p>
        )}
        {/* Issue #98 — the honest-failure line. Always-mounted StatusRegion
            (a live region must pre-exist to announce); idle it renders no
            children and paints nothing (the shared dialog :empty rules). */}
        <StatusRegion>
          {writeError && <p>{HIGHLIGHT_REMOVE_FAILED_COPY}</p>}
        </StatusRegion>
        <div className="dialog-actions library-remove-confirm-actions">
          {/* Destructive action — Pitfall 8: deleteHighlight fires ONLY in
              onDestructiveClick above. The button label names the action
              unambiguously. Issue #98 — the unified in-flight register
              while the write runs. */}
          <BusyButton
            busy={pending}
            className="btn btn-destructive library-remove-destructive"
            onClick={onDestructiveClick}
          >
            Remove highlight
          </BusyButton>
          {/* Cancel — names the actual outcome: the reader keeps the
              highlight and its note. Carries [data-initial-focus] so the
              explicit focus call lands here on open (NOT on the destructive
              button — safer default per Pitfall 8 / T-10-05b). */}
          <button
            type="button"
            className="btn btn-quiet library-remove-cancel"
            onClick={onCancel}
            data-initial-focus
          >
            Keep highlight
          </button>
        </div>
      </div>
    </dialog>
  );
}
