// src/reader/annotations/HighlightTagsDialog.tsx
// Issue #175 — the reading-mode highlight-tag editor: a SEPARATE compact
// dialog opened from the lightweight HighlightControls ("Tags"), replacing
// the tags section that used to live inside the note editor.
//
// Mechanism: native `<dialog>` + showModal — the ReviewTagsDialog twin in
// the review panel (the browser supplies the modal accessibility context,
// the focus trap, and Esc-to-close; the trigger is captured BEFORE showModal
// and focus is restored on EVERY close path — Pitfall 1). HighlightControls'
// "Tags" action focuses the anchor <mark> BEFORE opening, so the trigger
// restore lands on the highlight — with the controls still holding their
// place behind the modal (their dismissals are suppressed), closing the
// editor returns the reader to the controls at the highlight.
//
// The editor is the ONE shared TagEntry host: fieldset + legend + TagPicker
// + StatusRegion + lazy suggestion stats, with a saveTags override routing
// commits to updateHighlightTags (the highlight row ONLY — article and book
// tag assignments are never touched, and the note shares the highlight's
// tags by construction). Write-through commit-per-pick, exactly as when the
// tags lived in the note editor (no edit is ever lost on any close path).
//
// Unresolved anchors stay editable (tags never depend on re-anchoring — the
// D10-11 rule the note editor already honored), and TagEntry's own
// StatusRegion carries the calm failure line when a write is rejected.
//
// Pitfall 8: tag names render as React text children. NEVER raw HTML.
import { useCallback, useEffect, useRef, useState } from "react";
import { useHighlightOverlay } from "./HighlightOverlay";
import { TagEntry } from "../TagEntry";

export function HighlightTagsDialog(): React.ReactElement | null {
  const { highlights, openTagsFor, setOpenTagsFor, updateHighlightTags } = useHighlightOverlay();

  // Session-scoped bookkeeping: bumped per open; keys TagEntry so every
  // session seeds a FRESH local mirror from the record (a prior session's
  // draft never leaks into the next one). STATE, not a ref: the key must
  // change only when the session does (the ReviewTagsDialog discipline).
  const [session, setSession] = useState(0);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  // The trigger element that opened the dialog (the anchor <mark> via the
  // HighlightControls handoff). Captured on open so the close listener can
  // restore focus (Pitfall 1).
  const triggerRef = useRef<HTMLElement | null>(null);

  const resolved = openTagsFor
    ? (highlights.find((h) => h.record.id === openTagsFor) ?? null)
    : null;

  // Fresh session state BEFORE showModal (called after the trigger capture).
  const handleOpen = useCallback(() => {
    setSession((s) => s + 1);
  }, []);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (openTagsFor && !dlg.open) {
      // Capture the trigger (the anchor <mark>) BEFORE showModal moves focus
      // into the dialog (Pitfall 1).
      triggerRef.current = document.activeElement as HTMLElement | null;
      try {
        dlg.showModal();
      } catch {
        // Already in the top layer (or no <dialog> support) — the close path
        // is guarded by dlg.open below.
      }
      handleOpen();
    } else if (!openTagsFor && dlg.open) {
      dlg.close();
    }
  }, [openTagsFor, handleOpen]);

  // The close listener: clear the state (Escape closes natively too) and
  // restore focus to the trigger — the anchor <mark>, where the lightweight
  // controls are still waiting (issue #175: closing the tags editor returns
  // to the controls, focused on the highlight).
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    const handleClose = () => {
      setOpenTagsFor(null);
      triggerRef.current?.focus();
    };
    dlg.addEventListener("close", handleClose);
    return () => dlg.removeEventListener("close", handleClose);
  }, [setOpenTagsFor]);

  // Focus the picker input AFTER the session-keyed TagEntry remount settles
  // (the open effect's setSession re-render replaces the input node — a
  // focus applied to the pre-remount node would die with it). Explicit focus
  // because showModal does not reliably focus the first control in WebKit
  // (the ReviewNoteDialog/ReviewTagsDialog quirk).
  useEffect(() => {
    if (!openTagsFor) return;
    const dlg = dialogRef.current;
    if (!dlg || !dlg.open) return;
    dlg.querySelector<HTMLInputElement>("input#highlight-tags-input")?.focus();
  }, [openTagsFor, session]);

  // The <dialog> is always mounted (showModal requires the element in the
  // DOM); closed it is display:none and absent from the accessibility tree.
  return (
    <dialog
      ref={dialogRef}
      className="highlight-popover highlight-tags-dialog"
      aria-labelledby="highlight-tags-title"
    >
      <h2 id="highlight-tags-title" className="highlight-dialog-title">
        Edit tags
      </h2>
      {resolved && (
        <TagEntry
          key={`${resolved.record.id}-${session}`}
          recordId={resolved.record.id}
          tags={resolved.record.tags ?? []}
          saveTags={(next) => updateHighlightTags(resolved.record.id, next)}
          inputId="highlight-tags-input"
        />
      )}
      <div className="highlight-popover-actions">
        {/* Non-destructive default (Pitfall 8): Enter confirms the editing
            session. Carries [data-initial-focus] as the documented
            non-destructive default; the open path still focuses the picker
            input explicitly (the ReviewTagsDialog discipline). */}
        <button
          type="button"
          className="btn btn-quiet highlight-popover-done"
          onClick={() => setOpenTagsFor(null)}
          data-initial-focus
        >
          Done
        </button>
      </div>
    </dialog>
  );
}
