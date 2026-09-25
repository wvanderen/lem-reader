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
import { useEffect, useRef } from "react";
import { deleteHighlight } from "../../persistence/highlightsStore";
// Issue #98 — the ONE polite status-region primitive + the shared
// honest-write/busy primitives.
import { StatusRegion } from "../../ui/StatusRegion";
import { BusyButton } from "../../ui/BusyButton";
import { useHonestWrite } from "../../ui/honestWrite";

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
}

export function DeleteHighlightConfirm({
  open,
  highlightId,
  excerpt,
  onConfirm,
  onCancel,
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

  // Register the `close` event listener (with cleanup). Restore focus to the
  // captured trigger (Pitfall 1), and — when the close was ESC-originated
  // (the open prop still says open) — route cleanup through onCancel so the
  // parent's removeTarget resets on EVERY close path.
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const handleClose = () => {
      triggerRef.current?.focus();
      if (openRef.current) onCancel();
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
      if (e.target === dlg) onCancel();
    };
    dlg.addEventListener("close", handleClose);
    dlg.addEventListener("click", handleScrimClick);
    return () => {
      dlg.removeEventListener("close", handleClose);
      dlg.removeEventListener("click", handleScrimClick);
    };
  }, [onCancel]);

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
          Remove this highlight? The note attached to it will also be
          removed.
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
          {writeError && <p>Couldn't remove this highlight. Try again.</p>}
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
