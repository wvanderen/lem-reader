// src/reader/WipeConfirm.tsx
// Focus-trapped alertdialog for STATE-05 explicit-data-wipe consent (D2-13,
// 02-UI-SPEC §Interaction 13). Surfaced when SettingsContext reports
// `storageState === "corrupt" | "unupgradeable"` — the persisted DB or
// settings record cannot be opened/upgraded/parsed, so reading must fall
// back to in-memory defaults. The reader is NEVER silently wiped; this
// dialog asks for explicit consent before any local data is cleared.
//
// CRITICAL — Pitfall 8 (T-02-06, STATE-05): `db.delete()` runs ONLY inside
// the destructive button's onClick handler in THIS file. NEVER in a catch
// block, NEVER in an effect, NEVER automatically. A catch block that
// detects corruption may OPEN this dialog (SettingsContext routes
// `storageState` to it via App.tsx); the actual wipe fires only when the
// reader clicks the explicitly-destructive "Reset local data" button below.
//
// Mirrors src/reader/SettingsPanel.tsx dialog/showModal/focus-restore
// discipline (sibling component, same phase). Pitfall 1 applies: showModal
// does NOT auto-restore focus to the trigger — we capture activeElement on
// open and .focus() it in the close listener. role="alertdialog" +
// aria-modal + aria-labelledby + aria-describedby per UI-SPEC line 468.
// Copy is verbatim UI-SPEC §Copywriting lines 328–331.
import { useEffect, useRef } from "react";
import { db } from "../persistence/db";

interface WipeConfirmProps {
  /** When true, the dialog is open via showModal (focus-trapped). */
  open: boolean;
  /**
   * Invoked by the destructive button AFTER db.delete() resolves and the DB
   * is re-initialized. The parent (App) uses this to call
   * SettingsContext.resetLocalData() so in-memory state returns to defaults.
   */
  onReset: () => void;
  /**
   * Invoked by the cancel button (or Esc / scrim). The reader keeps reading
   * with in-memory defaults; the StorageBanner stays shown (D2-13).
   */
  onCancel: () => void;
}

export function WipeConfirm({ open, onReset, onCancel }: WipeConfirmProps) {
  const ref = useRef<HTMLDialogElement>(null);
  // Capture the previously-focused element on open so the close handler can
  // restore focus (Pitfall 1 — same discipline as SettingsPanel).
  const triggerRef = useRef<HTMLElement | null>(null);

  // Sync the `open` prop with the underlying <dialog> state.
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      triggerRef.current = document.activeElement as HTMLElement | null;
      dlg.showModal(); // browser: focus→first focusable, trap, inert backdrop, Esc closes
      // Cross-engine focus management (Pitfall 1 + WebKit quirk, same as
      // SettingsPanel): explicitly focus the [data-initial-focus] element so
      // the focus trap and the initial reading position are predictable in
      // WebKit. The CANCEL button carries the marker — focusing the
      // destructive action by default would risk an accidental Enter wiping
      // local data. The reader must move focus to "Reset local data"
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
  // The ONLY path in the entire codebase that calls db.delete(). It lives in
  // the destructive button's onClick — never in a catch block or effect.
  // The reader must click "Reset local data" to fire this; nothing else
  // triggers it. After the wipe + re-open, App's onReset hook calls
  // SettingsContext.resetLocalData() to clear in-memory state.
  const onDestructiveClick = async () => {
    try {
      await db.delete(); // wipe ALL local data (settings + location)
      await db.open(); // re-initialize the DB instance with the same schema
    } catch {
      // Even the destructive path defends itself: if db.delete/open throws,
      // we still reset in-memory state so the reader can keep reading. The
      // storage-failure banner may resurface on the next load attempt.
      // (No db.delete retry here — the reader explicitly consented ONCE.)
    }
    onReset();
  };

  return (
    <dialog
      ref={ref}
      className="wipe-confirm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="wipe-title"
      aria-describedby="wipe-body"
    >
      <div className="wipe-confirm-inner">
        <h2 id="wipe-title">Reset local data?</h2>
        <p id="wipe-body">
          Reading history and saved settings are damaged and can&apos;t be
          used. Resetting clears them so you can start fresh. This can&apos;t
          be undone.
        </p>
        <div className="wipe-confirm-actions">
          {/* Destructive action — Pitfall 8: db.delete() fires ONLY in
              onDestructiveClick above. The button label names the consequence
              unambiguously (UI-SPEC §Copywriting line 330). */}
          <button
            type="button"
            className="wipe-confirm-destructive"
            onClick={onDestructiveClick}
          >
            Reset local data
          </button>
          {/* Cancel — names the actual outcome: the reader stays reading with
              in-memory defaults and the banner still shown (UI-SPEC line 331).
              Carries [data-initial-focus] so the explicit focus call lands
              here on open (NOT on the destructive button — safer default). */}
          <button
            type="button"
            className="wipe-confirm-cancel"
            onClick={onCancel}
            data-initial-focus
          >
            Keep reading
          </button>
        </div>
      </div>
    </dialog>
  );
}
