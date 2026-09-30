// src/routes/review/useDialogSession.ts
// Issue #117 review follow-up — the ONE dialog-session lifecycle shared by
// the review panel's native-<dialog> editors (ReviewNoteDialog,
// ReviewTagsDialog). The mechanics both dialogs cloned verbatim from
// NotePopover now live here exactly once:
//   - the open/close prop sync: showModal() on the open transition; the
//     state-driven dlg.close() otherwise (its `close` event drives every
//     close path, Escape included);
//   - Pitfall 1 focus: the trigger (document.activeElement) is captured
//     BEFORE anything that can move focus (an onOpen that focuses the first
//     control, then showModal) and restored on EVERY close path;
//   - the exactly-once close-path report guard, re-armed on every open.
//
// The WRITE paths deliberately stay in each dialog (the structural-clone
// discipline — each commit path stays grep-isolated): onOpen arms fresh
// per-session state before showModal; onClose is the dialog's OWN close-path
// report (async-capable — the TagsDialog awaits its in-flight write before
// reporting; the NoteDialog routes through its guarded commit). The Done
// buttons keep their own report discipline: the NoteDialog stays OPEN on a
// failed Done (so its Done never marks the session reported — the next Done
// retries), while the TagsDialog reports through reportClose() to share the
// guard with the close listener.
import { useEffect, useRef } from "react";

/** The lifecycle the host dialog supplies (see the module header). */
interface DialogSessionOptions {
  /**
   * Fresh per-session state, armed after the trigger capture and BEFORE
   * showModal — the dialog element is passed so the host can focus its
   * first control (the explicit-focus WebKit quirk).
   */
  onOpen: (dlg: HTMLDialogElement) => void;
  /**
   * The close-path report — invoked at most ONCE per session, after the
   * trigger focus is restored. Async work happens inside: the guard is
   * already marked, so a racing second close path can never double-report.
   */
  onClose: () => void;
}

/**
 * Native-<dialog> session lifecycle: prop-synced showModal/close, Pitfall 1
 * trigger capture + restore on every close path, and the exactly-once
 * close-report guard (re-armed per session). Returns the ref to bind to the
 * <dialog> and reportClose() for Done-style close paths that must share the
 * guard with the close listener.
 */
export function useDialogSession(open: boolean, { onOpen, onClose }: DialogSessionOptions) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  // The trigger element that opened the dialog. Captured on open so the
  // `close` listener can restore focus (Pitfall 1 — showModal does not
  // auto-restore focus).
  const triggerRef = useRef<HTMLElement | null>(null);
  // True until the first open: nothing to report before any session exists;
  // re-armed (false) on every open transition.
  const reportedRef = useRef(true);

  // Sync the `open` prop with the underlying <dialog> state.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      // Capture the trigger BEFORE anything that might move focus (an
      // onOpen that focuses the first control, then showModal — Pitfall 1).
      triggerRef.current = document.activeElement as HTMLElement | null;
      reportedRef.current = false;
      onOpen(dlg);
      try {
        dlg.showModal();
      } catch {
        // showModal throws if the element is already in the top layer or if
        // the browser doesn't support <dialog>. Either way the editor is in
        // the DOM; the close path is guarded by dlg.open below.
      }
    } else if (!open && dlg.open) {
      // State-driven close (the report already happened → the parent flipped
      // the open prop). dlg.close() fires the `close` event → the listener
      // below restores focus (the guarded report is a no-op after Done).
      dlg.close();
    }
  }, [open, onOpen]);

  // The `close` event fires on EVERY close path — Escape (browser-default)
  // and the state-driven dlg.close() above. Restore the trigger focus, then
  // report the session exactly once.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    const handleClose = () => {
      triggerRef.current?.focus();
      if (reportedRef.current) return;
      reportedRef.current = true;
      onClose();
    };
    dlg.addEventListener("close", handleClose);
    return () => dlg.removeEventListener("close", handleClose);
  }, [onClose]);

  /** The Done-path report — the close listener's guard, shared. */
  const reportClose = () => {
    if (reportedRef.current) return;
    reportedRef.current = true;
    onClose();
  };

  return { dialogRef, reportClose };
}
