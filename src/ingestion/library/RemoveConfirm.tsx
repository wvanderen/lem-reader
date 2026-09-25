// src/ingestion/library/RemoveConfirm.tsx
// Plan 08-04 — LibraryRemoveConfirm (LIB-02, D8-13/D8-14). Native <dialog>/
// alertdialog that gates the destructive cascade `dexieLibrarySource.remove(id)`
// behind explicit reader consent. Structural clone of src/reader/WipeConfirm.tsx
// (Phase 02-02) — same focus-trap + showModal + focus-restore + close-listener
// discipline (Pitfall 1) and the same data-initial-focus on the CANCEL button
// (Pitfall 8 — safer non-destructive default; an accidental Enter cannot remove
// an article).
//
// CRITICAL — Pitfall 8 (T-8-17): the existing cascade `dexieLibrarySource.
// remove(id)` runs ONLY inside the destructive button's onClick handler in
// THIS file. Never in a catch block, never in an effect, never automatically.
// LibraryView routes `removeTarget !== null` to this dialog (open); the actual
// remove fires only when the reader clicks "Remove article" below.
//
// Cascade behavior (D8-13, D8-14): removes the article + every highlight +
// every note + every location row keyed to it, in one Dexie transaction
// (DexieLibrarySource.remove, Phase 7 Plan 07-06). The body copy names the
// consequence ("Your highlights and notes for it will also be removed.") per
// UI-SPEC §Copywriting L262 — D7-04 calm voice; zero jargon.
//
// Issue #98 (decision #96) — HONEST WRITE FAILURES: a failed cascade keeps
// the dialog open with a calm error line through the ONE StatusRegion
// primitive (the state-kind table's ERROR kind: the failure is named, the
// next step is obvious — try again). The dialog NEVER closes as if the
// remove succeeded: onConfirm (which closes + invalidates the snapshot)
// fires only after the write resolves. The destructive button carries the
// unified in-flight register while the write runs (spinner arc + aria-busy
// + disabled — the ReadingStateButton pattern). The fresh-open reset clears
// a prior session's error (the D16-08 discipline).
// Issue #98 review — the pending/writeError state machine and the busy
// register are the SHARED useHonestWrite hook + BusyButton primitive now;
// only the write itself (and the copy) stay local to this dialog.
import { useEffect, useRef } from "react";
import { dexieLibrarySource } from "../LibrarySource";
// Issue #98 — the ONE polite status-region primitive + the shared
// honest-write/busy primitives.
import { StatusRegion } from "../../ui/StatusRegion";
import { BusyButton } from "../../ui/BusyButton";
import { useHonestWrite } from "../../ui/honestWrite";

interface RemoveConfirmProps {
  /** When true, the dialog is open via showModal (focus-trapped). */
  open: boolean;
  /** The article id to remove on confirm. */
  articleId: string;
  /** The article title — currently informational; the dialog uses generic copy. */
  articleTitle: string;
  /** Invoked by the destructive button AFTER the cascade resolves. */
  onConfirm: () => void;
  /** Invoked by the cancel button (or Esc / scrim). */
  onCancel: () => void;
}

export function RemoveConfirm({
  open,
  articleId,
  articleTitle,
  onConfirm,
  onCancel,
}: RemoveConfirmProps) {
  const ref = useRef<HTMLDialogElement>(null);
  // Capture the previously-focused element on open so the close handler can
  // restore focus (Pitfall 1 — same discipline as WipeConfirm + SettingsPanel).
  const triggerRef = useRef<HTMLElement | null>(null);
  // Issue #98 — the write's honest state (the SHARED useHonestWrite hook):
  // pending drives the unified busy register on the destructive button;
  // writeError keeps the dialog open with the calm error line. Both reset
  // on every fresh open (below).
  const { pending, writeError, reset: resetWrite, run: runWrite } = useHonestWrite();

  // Sync the `open` prop with the underlying <dialog> state.
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      triggerRef.current = document.activeElement as HTMLElement | null;
      dlg.showModal(); // browser: focus→first focusable, trap, inert backdrop, Esc closes
      // Issue #98 — fresh session state (the D16-08 discipline): a prior
      // session's failed-write error never leaks into the next open.
      resetWrite();
      // Cross-engine focus management (Pitfall 1 + WebKit quirk, same as
      // WipeConfirm): explicitly focus the [data-initial-focus] element so
      // the focus trap and the initial reading position are predictable in
      // WebKit. The CANCEL button carries the marker — focusing the
      // destructive action by default would risk an accidental Enter removing
      // the article. The reader must move focus to "Remove article"
      // deliberately.
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
  // captured trigger (Pitfall 1). Deps [onCancel]: the scrim listener below
  // routes through onCancel, so the effect must re-register when the parent's
  // callback identity changes (never a stale closure — the live-mirror
  // discipline these files preach).
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const handleClose = () => {
      triggerRef.current?.focus();
    };
    // A click whose target IS the dialog element itself is the dimmed
    // ::backdrop (padding: 0 + the .library-remove-confirm-inner wrapper
    // mean the dialog border box == the visible card, so clicks on visible
    // content always target descendants). Route it through the SAME
    // onCancel path the "Keep article" button / Esc use — the parent's
    // open-prop flip owns every close (never dlg.close() here; the 09-06
    // wedge lesson).
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
  // The ONLY call site for `dexieLibrarySource.remove` in the new code. It
  // lives in the destructive button's onClick — never in a catch block or
  // effect. The reader must click "Remove article" to fire this; nothing else
  // triggers it.
  //
  // Issue #98 — honest failure: a rejected cascade keeps the dialog open
  // with the calm error line; onConfirm runs ONLY on success. The reader
  // can retry (the consent to remove stands; the write just didn't land)
  // or cancel.
  const onDestructiveClick = async () => {
    // The cascade closure stays in the click handler (Pitfall 8); the hook
    // owns only the pending/error bookkeeping around it.
    if (await runWrite(() => dexieLibrarySource.remove(articleId))) {
      onConfirm();
    }
  };

  // Silence unused-prop lint: articleTitle is informational and reserved for
  // future personalization ("Remove '{title}'?"); the current copy is generic
  // per UI-SPEC §Copywriting L262.
  void articleTitle;

  return (
    <dialog
      ref={ref}
      className="library-remove-confirm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="remove-title"
      aria-describedby="remove-body"
    >
      <div className="library-remove-confirm-inner">
        <h2 id="remove-title">Remove this article?</h2>
        <p id="remove-body">
          Remove this article? Your highlights and notes for it will also be
          removed.
        </p>
        {/* Issue #98 — the honest-failure line. Always-mounted StatusRegion
            (a live region must pre-exist to announce); idle it renders no
            children and the shared :empty collapse keeps the card invisible. */}
        <StatusRegion>{writeError && <p>Couldn't remove this article. Try again.</p>}</StatusRegion>
        <div className="dialog-actions library-remove-confirm-actions">
          {/* Destructive action — Pitfall 8: dexieLibrarySource.remove fires
              ONLY in onDestructiveClick above. The button label names the
              consequence unambiguously (UI-SPEC §Copywriting L262). Issue
              #98 — the unified in-flight register while the write runs. */}
          <BusyButton
            busy={pending}
            className="btn btn-destructive library-remove-destructive"
            onClick={onDestructiveClick}
          >
            Remove article
          </BusyButton>
          {/* Cancel — names the actual outcome: the reader keeps the article
              and its highlights/notes. Carries [data-initial-focus] so the
              explicit focus call lands here on open (NOT on the destructive
              button — safer default per Pitfall 8). */}
          <button
            type="button"
            className="btn btn-quiet library-remove-cancel"
            onClick={onCancel}
            data-initial-focus
          >
            Keep article
          </button>
        </div>
      </div>
    </dialog>
  );
}
