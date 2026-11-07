// src/routes/collections/RenameCollectionDialog.tsx
// Issue #242 — the rename dialog for one collection (the five-part dialog
// grammar cloned verbatim from EditMetadataDialog/RemoveConfirm: showModal
// sync, [data-initial-focus] focus for the WebKit quirk, the preventDefault
// cancel + scrim-close routing, the in-flight dismissal gate, Pitfall 1
// trigger-focus restore, the issue #98 honest-failure line — a rejected
// rename keeps the dialog OPEN; onSaved never fires for a write that did
// not land).
//
// Rename is a FORM submit (Enter commits — a rename is expected, not
// destructive; the RemoveConfirm focus-Cancel-on-open safety is a
// destruction-specific rule). The input is the initial focus: the reader
// opened the dialog to type.
//
// The ONLY rename call site (the Pitfall 8 grep-isolation discipline — the
// write appears verbatim in the destructive-ish button's handler here).
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { StatusRegion } from "../../ui/StatusRegion";
import { BusyButton } from "../../ui/BusyButton";
import { renameCollection } from "../../persistence/collectionsStore";
import type { Collection } from "../../content/schema";

interface RenameCollectionDialogProps {
  /** When true, the dialog is open via showModal (focus-trapped). */
  open: boolean;
  /** The collection being renamed (null while closed). */
  collection: Collection | null;
  /** Invoked after the rename put resolves (the caller reloads + announces). */
  onSaved: (updated: Collection) => void;
  /** Invoked by the cancel button (or Esc). */
  onCancel: () => void;
}

export function RenameCollectionDialog({
  open,
  collection,
  onSaved,
  onCancel,
}: RenameCollectionDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  // Capture the previously-focused element (the row's Rename button) on
  // open so the close handler can restore focus (Pitfall 1).
  const triggerRef = useRef<HTMLElement | null>(null);
  const [nameValue, setNameValue] = useState("");
  const [saving, setSaving] = useState(false);
  // Issue #98 — the honest-failure state: a rejected rename keeps the
  // dialog open with the calm error line (never closes as if it saved).
  const [saveError, setSaveError] = useState(false);
  // Live mirror rewritten EVERY render (the AddDialog discipline): the
  // long-lived `cancel` listener must read the CURRENT saving state.
  const submittingRef = useRef(false);
  submittingRef.current = saving;

  // Sync the `open` prop with the underlying <dialog> state (idempotent
  // guards). On EVERY false→true transition the field state RESETS from
  // the captured collection — a prior canceled edit never leaks into the
  // next open (the D16-08 fresh-open discipline).
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      triggerRef.current = document.activeElement as HTMLElement | null;
      dlg.showModal(); // browser: focus trap, inert backdrop, Esc fires cancel
      setNameValue(collection?.name ?? "");
      setSaving(false);
      setSaveError(false);
      // The input is the initial focus — the reader opened the dialog to
      // type (a rename, not a destruction; Enter commits via the form).
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open transition only; `collection` is read solely for the fresh-open reset
  }, [open]);

  // Register the `close` + `cancel` listeners (with cleanup) — the
  // RemoveConfirm focus-restore clone + the in-flight dismissal gate.
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const handleClose = () => {
      triggerRef.current?.focus();
    };
    const handleDialogCancel = (e: Event) => {
      // Esc on an open <dialog> fires `cancel` then `close`. ALWAYS
      // preventDefault so the browser never closes the dialog itself —
      // the React open-prop mirror owns every close path.
      e.preventDefault();
      if (submittingRef.current) return; // no dismissal while in flight
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

  // The ONLY rename write site. Fires ONLY from the prevented-submit
  // form's Save path — never in a catch block or effect. A blank name
  // cannot be submitted (the button blocks it; the seam refuses it too).
  async function handleSave() {
    if (!collection || saving) return;
    const trimmed = nameValue.trim();
    if (trimmed.length === 0) return; // the disabled rule, defensively
    setSaving(true);
    setSaveError(false); // a retry clears the prior failure line
    try {
      const updated = await renameCollection(collection.id, trimmed);
      setSaving(false);
      onSaved(updated);
      return;
    } catch {
      // Issue #98 — honest failure: the dialog stays OPEN with the calm
      // error line; onSaved never fires, so nothing claims a save that
      // did not land. The reader can retry or Cancel.
      setSaving(false);
      setSaveError(true);
      return;
    }
  }

  function handleFormSubmit(e: FormEvent<HTMLFormElement>) {
    // ONE prevented-submit form — never a method-dialog form.
    e.preventDefault();
    if (saving || nameValue.trim().length === 0) return;
    void handleSave();
  }

  return (
    <dialog ref={ref} className="rename-collection" aria-labelledby="rename-collection-heading">
      <div className="rename-collection-inner">
        <h2 id="rename-collection-heading">Rename collection</h2>
        <form onSubmit={handleFormSubmit} className="rename-collection-form">
          <div className="rename-collection-field">
            <label htmlFor="rename-collection-name">Name</label>
            <input
              id="rename-collection-name"
              name="name"
              type="text"
              autoComplete="off"
              data-initial-focus
              value={nameValue}
              disabled={saving}
              onChange={(e) => setNameValue(e.target.value)}
            />
          </div>
          {/* The honest-failure line: only a FAILED write renders here —
              never a success (the write's caller announces successes). */}
          <StatusRegion>{saveError && <p>Couldn't save the new name. Try again.</p>}</StatusRegion>
          <div className="dialog-actions rename-collection-actions">
            <button type="button" className="btn btn-quiet" disabled={saving} onClick={onCancel}>
              Cancel
            </button>
            <BusyButton
              type="submit"
              busy={saving}
              className="btn btn-primary"
              disabled={nameValue.trim().length === 0}
            >
              Save
            </BusyButton>
          </div>
        </form>
      </div>
    </dialog>
  );
}
