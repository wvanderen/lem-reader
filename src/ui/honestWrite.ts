// src/ui/honestWrite.ts
// Issue #98 (decision #96) — the ONE honest-write state machine shared by
// the destructive confirm dialogs (RemoveConfirm, BookRemoveConfirm,
// DeleteHighlightConfirm). Owns the exact `pending`/`writeError` shape every
// dialog used to hand-roll:
//
//   - `pending` drives the unified in-flight register on the destructive
//     button (BusyButton: spinner arc + aria-busy + disabled).
//   - `writeError` keeps the dialog OPEN with the calm error line through
//     the ONE StatusRegion primitive — the dialog NEVER closes as if the
//     write succeeded; the success callback fires only after the write
//     resolves (the #98 honest-failure law).
//   - `reset` is the fresh-open discipline (the D16-08 lineage): a prior
//     session's failed-write error never leaks into the next open.
//
// The write itself stays at the call site — Pitfall 8's grep-isolation is
// unchanged: the destructive call still appears verbatim inside the
// destructive button's onClick handler in the dialog file, passed to `run`
// as a closure. This module never sees the destructive API.
import { useCallback, useState } from "react";

export function useHonestWrite() {
  const [pending, setPending] = useState(false);
  const [writeError, setWriteError] = useState(false);

  /** Fresh-open reset: clear both flags (a prior session's error state). */
  const reset = useCallback(() => {
    setPending(false);
    setWriteError(false);
  }, []);

  /**
   * Run the destructive write. Resolves to true ONLY when the write
   * landed — the caller may then fire its success callback (close +
   * invalidate). A rejection resolves to false with `writeError` set (the
   * dialog stays open; the reader can retry or cancel).
   */
  const run = useCallback(async (write: () => Promise<void>): Promise<boolean> => {
    setPending(true);
    setWriteError(false);
    try {
      await write();
    } catch {
      setPending(false);
      setWriteError(true);
      return false;
    }
    setPending(false);
    return true;
  }, []);

  return { pending, writeError, reset, run };
}
