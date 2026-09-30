// src/routes/discover/DiscoverRemoveConfirm.tsx
// Issue #121 — the subscription-scoped destructive confirm. STRUCTURAL CLONE
// of src/ingestion/library/BookRemoveConfirm.tsx (itself a RemoveConfirm →
// WipeConfirm clone) — same focus-trap + showModal + focus-restore +
// close-listener discipline (Pitfall 1) and the same data-initial-focus on
// the CANCEL button (Pitfall 8 — safer non-destructive default; an
// accidental Enter cannot remove a subscription). Own class hooks
// (.discover-remove-confirm*) so e2e dialog locators stay strict-mode-unique
// — every dialog in the app mounts with its own class family (the
// BookRemoveConfirm L19-23 rule).
//
// CRITICAL — Pitfall 8: the destructive `deleteSubscription(id)` runs ONLY
// inside the destructive button's onClick handler in THIS file — the SOLE
// executable call site for unsubscribing. Never in a catch block, never in
// an effect, never automatically.
import { useEffect, useRef } from "react";
import { deleteSubscription } from "../../persistence/subscriptionsStore";
// Issue #98 — the ONE polite status-region primitive + the shared
// honest-write/busy primitives.
import { StatusRegion } from "../../ui/StatusRegion";
import { BusyButton } from "../../ui/BusyButton";
import { useHonestWrite } from "../../ui/honestWrite";

interface DiscoverRemoveConfirmProps {
  /** When true, the dialog is open via showModal (focus-trapped). */
  open: boolean;
  /** The subscription id to delete on confirm. */
  subscriptionId: string;
  /** The feed title — named in the body copy so the consequence is unambiguous. */
  feedTitle: string;
  /** Invoked by the destructive button AFTER the delete resolves. */
  onConfirm: () => void;
  /** Invoked by the cancel button (or Esc / scrim). */
  onCancel: () => void;
}

export function DiscoverRemoveConfirm({
  open,
  subscriptionId,
  feedTitle,
  onConfirm,
  onCancel,
}: DiscoverRemoveConfirmProps) {
  const ref = useRef<HTMLDialogElement>(null);
  // Capture the previously-focused element on open so the close handler can
  // restore focus (Pitfall 1 — the RemoveConfirm discipline).
  const triggerRef = useRef<HTMLElement | null>(null);
  // Issue #98 — the write's honest state (the SHARED useHonestWrite hook):
  // pending drives the unified busy register; writeError keeps the dialog
  // open with the calm error line. Both reset on every fresh open (below).
  const { pending, writeError, reset: resetWrite, run: runWrite } = useHonestWrite();

  // Sync the `open` prop with the underlying <dialog> state.
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      triggerRef.current = document.activeElement as HTMLElement | null;
      dlg.showModal(); // browser: focus→first focusable, trap, inert backdrop, Esc closes
      // Issue #98 — fresh session state (the D16-08 discipline).
      resetWrite();
      // Cross-engine focus management (Pitfall 1 + WebKit quirk): explicitly
      // focus the [data-initial-focus] element. The CANCEL button carries
      // the marker — the destructive action must be deliberate.
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

  // Register the `close` + `cancel` + scrim-click listeners (with cleanup) —
  // the BookRemoveConfirm clone; every close path routes through onCancel so
  // the open-prop mirror resets (the 09-06 wedge lesson).
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const handleClose = () => {
      triggerRef.current?.focus();
    };
    const handleCancel = (e: Event) => {
      e.preventDefault();
      onCancel();
    };
    const handleScrimClick = (e: MouseEvent) => {
      if (e.target === dlg) onCancel();
    };
    dlg.addEventListener("close", handleClose);
    dlg.addEventListener("cancel", handleCancel);
    dlg.addEventListener("click", handleScrimClick);
    return () => {
      dlg.removeEventListener("close", handleClose);
      dlg.removeEventListener("cancel", handleCancel);
      dlg.removeEventListener("click", handleScrimClick);
    };
  }, [onCancel]);

  // ── PITFALL 8 LOAD-BEARING HANDLER ──────────────────────────────────────
  // The ONLY call site for `subscriptionsStore.deleteSubscription` in the
  // codebase. The reader must click "Remove subscription" to fire this.
  const onDestructiveClick = async () => {
    if (await runWrite(() => deleteSubscription(subscriptionId))) {
      onConfirm();
    }
  };

  return (
    <dialog
      ref={ref}
      className="discover-remove-confirm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="discover-remove-title"
      aria-describedby="discover-remove-body"
    >
      <div className="discover-remove-confirm-inner">
        <h2 id="discover-remove-title">Remove subscription</h2>
        <p id="discover-remove-body">
          Remove {feedTitle}? Its saved previews will be removed.
        </p>
        {/* Issue #98 — the honest-failure line. Always-mounted StatusRegion;
            idle it renders no children and paints nothing. */}
        <StatusRegion>
          {writeError && <p>Couldn't remove this subscription. Try again.</p>}
        </StatusRegion>
        <div className="dialog-actions discover-remove-confirm-actions">
          {/* Destructive action — Pitfall 8: deleteSubscription fires ONLY
              in onDestructiveClick above. The label names the outcome
              unambiguously (UI-SPEC §Copywriting). */}
          <BusyButton
            busy={pending}
            className="btn btn-destructive discover-remove-destructive"
            onClick={onDestructiveClick}
          >
            Remove subscription
          </BusyButton>
          {/* Cancel — names the actual outcome: the reader keeps the
              subscription and its previews. Carries [data-initial-focus]
              (Pitfall 8 — the safer default). */}
          <button
            type="button"
            className="btn btn-quiet discover-remove-cancel"
            onClick={onCancel}
            data-initial-focus
          >
            Keep subscription
          </button>
        </div>
      </div>
    </dialog>
  );
}
