// src/routes/review/ReviewColorDialog.tsx
// Issue #119 — the review panel's in-place highlight-color editor. Issue #222
// — the dialog hosts the SAME slot-pills entry the annotation panel hosts
// (src/reader/annotations/HighlightSlotEntry.tsx): ONE vocabulary across
// surfaces — the five slots are THE color controls everywhere a highlight's
// color is chosen. Activating a pill applies the slot through the review
// seam: the slot's ACTIVE color + its tags JOIN the existing ones (the
// additive union — never a replace).
//
// Dialog discipline preserved from DeleteHighlightConfirm (the review
// panel's established modal grammar):
//   - Native <dialog> + showModal(): the browser supplies the modal
//     accessibility context (focus scope + background inert + the "modal
//     shown" AT event), the focus trap, and Esc-to-close.
//   - useEffect syncs the `open` prop with showModal()/close().
//   - Capture document.activeElement on open; restore focus in the `close`
//     listener (Pitfall 1 — showModal does not auto-restore).
//   - An ESC-originated close (open prop still true) routes cleanup through
//     onClose — otherwise colorTarget would stay set and the effect
//     ([open] deps) could never re-fire, wedging the dialog shut for every
//     later row (the 09-06 same-file-retry guarantee).
//   - Explicit .focus() on [data-initial-focus] after showModal (the WebKit
//     quirk); the marker rides the NON-destructive "Done" button.
//
// COMMIT SEMANTICS — deliberately NOT the note dialog's commit-on-close:
// a slot application is a discrete, idempotent write pair (the #118 TagEntry
// commit-per-change discipline), so there is nothing to commit at close.
// Every close path (Done, Esc, scrim) merely dismisses; HighlightSlotEntry
// owns the per-apply write AND the inline honest-failure status ("Couldn't
// apply slot." in its own StatusRegion — announced INSIDE the open dialog).
// The applySlot closure routes through the TWO review seams
// (setHighlightTags union → setHighlightColor); ReviewView's closure
// invalidates the ONE Library Snapshot only after both writes resolve. There
// is no success card — the visible color + tag change is the register.
//
// Anchor status is untouched by construction: a slot application field-scopes
// the color + tags fields; the tri-state status is always re-derived from
// quote/position against the article text (D5-02) and never stored, so
// recoloring an ambiguous or orphaned highlight cannot change its anchor
// status or its note.
import { useEffect, useRef } from "react";
import type { HighlightSlot } from "../../content/schema";
import { HighlightSlotEntry } from "../../reader/annotations/HighlightSlotEntry";
// Issue #196 — the Custom pill's tint bases (type-only pass-through).
import type { HighlightTintBases } from "../../settings/highlightTint";

/** Truncation limit for the excerpt context (the DeleteHighlightConfirm
 * EXCERPT_MAX_CHARS precedent). Plain string operation — the result renders
 * as a React text child (T-10-05a). */
const EXCERPT_MAX_CHARS = 200;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

interface ReviewColorDialogProps {
  /** When true, the dialog is open via showModal (focus-trapped). */
  open: boolean;
  /** The settings' five numbered slots (issue #195) — the ONE color
   * vocabulary (issue #222). */
  slots: HighlightSlot[];
  /**
   * Issue #196 — the active theme's surface + ink pair, so a custom-color
   * slot's swatch paints its derived tint. Optional: absent (unit tests)
   * keeps the named-swatch fallback.
   */
  bases?: HighlightTintBases;
  /** Apply one slot through the TWO review seams (additive tags, then
   * color+hex). Rejects on persistence failure (HighlightSlotEntry surfaces
   * the failure inline; this dialog stays open). */
  applySlot: (slot: HighlightSlot) => Promise<void>;
  /** The highlight's quote excerpt — informational context so the reader
   * can tell WHICH highlight is being recolored. */
  excerpt: string;
  /** Invoked on EVERY close path (Done, Esc, scrim). Nothing is written
   * here — applies have already committed. */
  onClose: () => void;
}

export function ReviewColorDialog({
  open,
  slots,
  bases,
  applySlot,
  excerpt,
  onClose,
}: ReviewColorDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  // Capture the previously-focused element on open so the close handler can
  // restore focus (Pitfall 1, the RemoveConfirm discipline).
  const triggerRef = useRef<HTMLElement | null>(null);
  // Mirror the `open` prop at event time so the `close` listener can tell an
  // ESC-originated close (open still true — route cleanup through onClose)
  // from the CONTROLLED close (open already false — the Done handler already
  // cleared the target; calling onClose again would be harmless here but the
  // openRef check keeps one cleanup owner, the ImportPreviewDialog fix).
  const openRef = useRef(open);
  openRef.current = open;

  // Sync the `open` prop with the underlying <dialog> state.
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      triggerRef.current = document.activeElement as HTMLElement | null;
      dlg.showModal(); // browser: focus→first focusable, trap, inert backdrop, Esc closes
      // Cross-engine focus management (Pitfall 1 + the WebKit quirk):
      // explicitly focus the [data-initial-focus] element so the focus trap
      // and the initial reading position are predictable in WebKit. Done
      // carries the marker — non-destructive default, and the slot pills
      // stay one Tab away.
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
  // captured trigger (Pitfall 1), and — when the close was ESC-originated
  // (the open prop still says open) — route cleanup through onClose so the
  // parent's colorTarget resets on EVERY close path. A scrim click (the dim
  // ::backdrop) routes through the SAME onClose path Done uses — the parent
  // flips the open prop, the sync effect calls dlg.close(), and the close
  // listener's openRef check skips its own onClose (no double-close).
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const handleClose = () => {
      triggerRef.current?.focus();
      if (openRef.current) onClose();
    };
    const handleScrimClick = (e: MouseEvent) => {
      if (e.target === dlg) onClose();
    };
    dlg.addEventListener("close", handleClose);
    dlg.addEventListener("click", handleScrimClick);
    return () => {
      dlg.removeEventListener("close", handleClose);
      dlg.removeEventListener("click", handleScrimClick);
    };
  }, [onClose]);

  // The <dialog> is always mounted (showModal requires the element to be in
  // the DOM). Until showModal() runs it is display:none (UA stylesheet) and
  // absent from the accessibility tree.
  return (
    <dialog
      ref={ref}
      className="highlight-popover review-color-dialog"
      aria-labelledby="review-color-title"
      // The excerpt <p> renders only when there is excerpt text to show —
      // the describedby IDREF must never dangle.
      aria-describedby={excerpt.length > 0 ? "review-color-excerpt" : undefined}
    >
      <h2 id="review-color-title" className="review-note-title">
        Change color
      </h2>
      {/* Informational excerpt context (the RemoveConfirm aria-describedby
          pattern) — a React text child, never raw HTML (T-10-05a). */}
      {excerpt.length > 0 && (
        <p id="review-color-excerpt" className="highlight-popover-excerpt">
          <span className="visually-hidden">Highlighted text:</span>{" "}
          {truncate(excerpt, EXCERPT_MAX_CHARS)}
        </p>
      )}
      {/* The SAME slot-pills entry the reader hosts — swatch + number + name
          per pill (A11Y-05), commit-per-apply with the inline honest-failure
          status. Not gated on anchor status: a slot application never depends
          on re-anchoring, so this dialog opens for confident, ambiguous, AND
          orphan rows alike. */}
      {/* A fresh entry per editing session prevents previous failures or
          late completions from appearing on another highlight. */}
      {open && (
        <HighlightSlotEntry key={excerpt} slots={slots} bases={bases} onApply={applySlot} />
      )}
      <div className="highlight-popover-actions">
        {/* Pure dismissal — every apply has already committed through
            applySlot; there is nothing to commit on close (the note
            dialog's commit-on-close contract does not apply to a
            discrete-write entry). */}
        <button
          type="button"
          className="btn btn-quiet highlight-popover-done"
          onClick={onClose}
          data-initial-focus
        >
          Done
        </button>
      </div>
    </dialog>
  );
}
