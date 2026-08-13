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
import { useEffect, useRef } from "react";
import { dexieLibrarySource } from "../LibrarySource";

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

  // Sync the `open` prop with the underlying <dialog> state.
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      triggerRef.current = document.activeElement as HTMLElement | null;
      dlg.showModal(); // browser: focus→first focusable, trap, inert backdrop, Esc closes
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
  }, [open]);

  // Register the `close` event listener (with cleanup). Restore focus to the
  // captured trigger (Pitfall 1).
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const handleClose = () => {
      triggerRef.current?.focus();
    };
    dlg.addEventListener("close", handleClose);
    return () => dlg.removeEventListener("close", handleClose);
  }, []);

  // ── PITFALL 8 LOAD-BEARING HANDLER ──────────────────────────────────────
  // The ONLY call site for `dexieLibrarySource.remove` in the new code. It
  // lives in the destructive button's onClick — never in a catch block or
  // effect. The reader must click "Remove article" to fire this; nothing else
  // triggers it.
  const onDestructiveClick = async () => {
    try {
      await dexieLibrarySource.remove(articleId); // cascade: article + highlights + notes + location
    } catch {
      // Even the destructive path defends itself: if the cascade throws, we
      // still close the dialog so the reader isn't stuck. The LibraryView
      // refresh will reveal the row is still present; the reader can retry.
      // (No remove retry here — the reader explicitly consented ONCE.)
    }
    onConfirm();
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
        <div className="library-remove-confirm-actions">
          {/* Destructive action — Pitfall 8: dexieLibrarySource.remove fires
              ONLY in onDestructiveClick above. The button label names the
              consequence unambiguously (UI-SPEC §Copywriting L262). */}
          <button
            type="button"
            className="library-remove-destructive"
            onClick={onDestructiveClick}
          >
            Remove article
          </button>
          {/* Cancel — names the actual outcome: the reader keeps the article
              and its highlights/notes. Carries [data-initial-focus] so the
              explicit focus call lands here on open (NOT on the destructive
              button — safer default per Pitfall 8). */}
          <button
            type="button"
            className="library-remove-cancel"
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
