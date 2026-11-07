// src/routes/collections/DeleteCollectionConfirm.tsx
// Issue #243 — the collection-scoped destructive confirm. STRUCTURAL CLONE
// of src/ingestion/library/BookRemoveConfirm.tsx (itself a clone of
// RemoveConfirm ← WipeConfirm): same focus-trap + showModal + focus-restore
// + close-listener discipline (Pitfall 1) and the same data-initial-focus
// on the CANCEL button (Pitfall 8 — safer non-destructive default; an
// accidental Enter cannot delete a collection). Its OWN .delete-collection-
// confirm* class hooks (NOT the rename/add dialog classes) so e2e dialog
// locators stay strict-mode-unique — RenameCollectionDialog AND this dialog
// mount simultaneously in CollectionsView.
//
// CRITICAL — Pitfall 8: the seam call `collectionsStore.deleteCollection(id)`
// runs ONLY inside the destructive button's handler in THIS file — the SOLE
// executable deleteCollection call site in the codebase (the grep-isolation
// discipline). Never in a catch block, never in an effect. The seam's
// transaction opens over db.collections ALONE, so this confirm can never
// cascade into articles, books, chapters, highlights, notes, locations, or
// completion rows (ADR 0011 — a collection references, never owns) — the
// body copy states exactly that preservation.
//
// Issue #98 — HONEST WRITE FAILURES: a failed delete keeps the dialog open
// with the calm error line through the ONE StatusRegion primitive, and
// onConfirm fires only after the write resolves. The fresh-open reset
// clears a prior session's error (the D16-08 discipline).
import { useEffect, useRef } from "react";
import { deleteCollection } from "../../persistence/collectionsStore";
import { StatusRegion } from "../../ui/StatusRegion";
import { BusyButton } from "../../ui/BusyButton";
import { useHonestWrite } from "../../ui/honestWrite";
import type { Collection } from "../../content/schema";

interface DeleteCollectionConfirmProps {
  /** When true, the dialog is open via showModal (focus-trapped). */
  open: boolean;
  /** The collection being deleted (null while closed). */
  collection: Collection | null;
  /** Invoked AFTER the delete resolves (the caller closes + reloads + announces). */
  onConfirm: () => void;
  /** Invoked by the cancel button (or Esc / scrim). */
  onCancel: () => void;
}

/** The honest preservation line for one membership count — the reader must
 * know the readings themselves are untouched (the AC's "deleting a collection
 * preserves all underlying articles/books/chapters, shared passage positions,
 * highlights, notes, and shared completion records"). */
function preservationLine(entryCount: number): string {
  if (entryCount === 0) {
    return "This collection is empty — deleting it removes only the collection itself.";
  }
  const readings = entryCount === 1 ? "reading" : "readings";
  const verb = entryCount === 1 ? "stays" : "stay";
  const their = entryCount === 1 ? "its" : "their";
  return `Its ${entryCount} ${readings} ${verb} in your library, with ${their} highlights, notes, and progress.`;
}

export function DeleteCollectionConfirm({
  open,
  collection,
  onConfirm,
  onCancel,
}: DeleteCollectionConfirmProps) {
  const ref = useRef<HTMLDialogElement>(null);
  // Capture the previously-focused element on open so the close handler can
  // restore focus (Pitfall 1 — the BookRemoveConfirm discipline).
  const triggerRef = useRef<HTMLElement | null>(null);
  // Set the moment a delete LANDS: the close handler then skips the trigger
  // restore — the view's focus handoff owns the final focus, and the
  // captured trigger is the doomed card's Delete button, which the reload
  // is about to unmount (focusing soon-to-be-removed content buys a
  // moment of dead focus). The canceled/failed paths keep the restore
  // (Pitfall 1 unchanged).
  const landedRef = useRef(false);
  const { pending, writeError, reset: resetWrite, run: runWrite } = useHonestWrite();
  // Live mirror rewritten EVERY render (the AddDialog discipline): the
  // long-lived `cancel` listener must read the CURRENT saving state.
  const submittingRef = useRef(false);
  submittingRef.current = pending;

  // Sync the `open` prop with the underlying <dialog> state (idempotent
  // guards; fresh-open reset per the D16-08 discipline).
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      triggerRef.current = document.activeElement as HTMLElement | null;
      landedRef.current = false; // fresh session — the restore re-arms
      dlg.showModal(); // browser: focus trap, inert backdrop, Esc fires cancel
      resetWrite();
      // The CANCEL button carries [data-initial-focus] — focusing the
      // destructive action by default would risk an accidental Enter
      // deleting the collection (Pitfall 8).
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

  // Register the `close` + `cancel` + scrim listeners (with cleanup) — the
  // RemoveConfirm shape. The in-flight dismissal gate: no cancel while the
  // write is running (the live-mirror ref discipline).
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const handleClose = () => {
      if (landedRef.current) return; // the view's handoff owns focus
      triggerRef.current?.focus();
    };
    const handleDialogCancel = (e: Event) => {
      e.preventDefault(); // the React open-prop mirror owns every close path
      if (submittingRef.current) return;
      onCancel();
    };
    const handleScrimClick = (e: MouseEvent) => {
      if (e.target !== dlg) return;
      if (submittingRef.current) return;
      onCancel();
    };
    dlg.addEventListener("close", handleClose);
    dlg.addEventListener("cancel", handleDialogCancel);
    dlg.addEventListener("click", handleScrimClick);
    return () => {
      dlg.removeEventListener("close", handleClose);
      dlg.removeEventListener("cancel", handleDialogCancel);
      dlg.removeEventListener("click", handleScrimClick);
    };
  }, [onCancel]);

  // ── PITFALL 8 LOAD-BEARING HANDLER ──────────────────────────────────────
  // The ONLY call site for `collectionsStore.deleteCollection` in the
  // codebase. It lives in the destructive button's onClick — never in a
  // catch block or effect. Issue #98 — honest failure: a rejected delete
  // keeps the dialog open with the calm error line; onConfirm runs ONLY on
  // success.
  const onDestructiveClick = async () => {
    if (!collection) return;
    if (await runWrite(() => deleteCollection(collection.id))) {
      landedRef.current = true;
      onConfirm();
    }
  };

  return (
    <dialog
      ref={ref}
      className="delete-collection-confirm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="delete-collection-title"
      aria-describedby="delete-collection-body"
    >
      <div className="delete-collection-confirm-inner">
        <h2 id="delete-collection-title">Delete collection</h2>
        <p id="delete-collection-body">
          Delete {collection?.name ?? "this collection"}?{" "}
          {preservationLine(collection?.entries.length ?? 0)}
        </p>
        <StatusRegion>
          {writeError && <p>Couldn't delete this collection. Try again.</p>}
        </StatusRegion>
        <div className="dialog-actions delete-collection-confirm-actions">
          {/* Destructive action — Pitfall 8: deleteCollection fires ONLY in
              onDestructiveClick above. The label names the outcome. */}
          <BusyButton
            busy={pending}
            className="btn btn-destructive delete-collection-destructive"
            onClick={onDestructiveClick}
          >
            Delete collection
          </BusyButton>
          {/* Cancel — names the actual outcome: the reader keeps the
              collection. Carries [data-initial-focus] (Pitfall 8). */}
          <button
            type="button"
            className="btn btn-quiet delete-collection-cancel"
            disabled={pending}
            onClick={() => {
              if (!submittingRef.current) onCancel();
            }}
            data-initial-focus
          >
            Keep collection
          </button>
        </div>
      </div>
    </dialog>
  );
}
