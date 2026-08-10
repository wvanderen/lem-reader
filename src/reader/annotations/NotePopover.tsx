// src/reader/annotations/NotePopover.tsx
// Phase 5 Plan 05-03 — note editor + two-step delete confirm (D5-10, D5-12,
// ANNO-02/03).
//
// Mechanism: native `<dialog>` + `showModal()` (the proven codebase pattern —
// SettingsPanel + AnnotationsDrawer both use it; Flow F is the VO-passing
// reference). The browser supplies the modal-dialog accessibility context
// VoiceOver needs to ENTER the dialog and honor programmatic focus: it fires
// the platform "modal shown" AT event, inerts the rest of the document
// (focus scope + VO browse cannot pass the textarea), and provides a focus
// trap + Escape-to-close for free.
//
// HISTORY (debug session `vo-note-popover-focus`, ACPT-02 finding #2): the
// original Phase 5 implementation used `<div popover="manual" role="dialog">`
// to keep the article "visible/interactive behind" the editor with no
// backdrop. That choice produced a VoiceOver blocker — `popover="manual"` on
// a non-`<dialog>` element does NOT establish the modal accessibility
// context, so VO browse passed the textarea and the field was unreachable
// (programmatic `textarea.focus()` only moves DOM focus; VO's virtual cursor
// ignores it without the modal AT event). Native `<dialog>` + showModal is
// the robust fix and matches the existing SettingsPanel/Drawer discipline.
//
// Constraint tradeoff (the ONE that changes): the article is now INERT
// behind the popover while a note is being edited (modal). It remains
// VISIBLE — `::backdrop` is styled transparent (app.css), so there is no
// full-screen dimmed overlay; the popover stays a centered box, visually
// identical to the prior backdrop-less manual popover (which was already
// centered by the Popover API's default positioning). The reader closes the
// editor (Done / Delete-confirm / Escape) to interact with the article
// again — which is the correct semantic for "editing a note about one
// highlight." All other Phase 5 constraints are preserved:
//   - No light-dismiss while typing: modal <dialog> does NOT close on
//     outside click (unlike `popover="auto"`). Typing is safe.
//   - Reduced motion: instant show/hide (no transition property; the global
//     prefers-reduced-motion gate is unaffected).
//   - Focus restore to the triggering <mark>: the `close` event listener
//     calls triggerRef.current?.focus() (mirrors SettingsPanel).
//   - Two-step delete confirm (D5-12) + Keep [data-initial-focus]: unchanged.
//   - Debounced note save (D5-10/D2-03) + flushNoteSave on close: the close
//     listener flushes before the trigger regains focus — no edit lost.
//
// Two-step delete (D5-12, mirrors WipeConfirm Pitfall 8): step 1 Delete replaces
// the popover body with the confirm prompt "Delete this highlight?" + two
// buttons; step 2 confirm Delete (--destructive border) calls deleteHighlight
// then closes. The Keep button carries [data-initial-focus] — non-destructive
// default focus so an accidental Enter cannot destroy a highlight+note.
//
// Pitfall 8 (note XSS): the note text is rendered as a React text child
// (`<textarea value={text} />` + excerpt as `<p>{excerpt}</p>`). NEVER raw
// HTML. The `react/no-danger` ESLint rule (enabled since Phase 1) statically
// forbids the raw-HTML prop.
import { useEffect, useRef, useState } from "react";
import { useHighlightOverlay } from "./HighlightOverlay";

/** Truncation limits for the excerpt context (UI-SPEC §Interaction 29). */
const EXCERPT_MAX_CHARS = 200;

/**
 * Truncate text to `max` chars + an ellipsis if it exceeds the limit.
 * Plain string operation — the result is rendered as a React text child.
 */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "\u2026";
}

export function NotePopover(): React.ReactElement | null {
  const {
    highlights,
    openPopoverFor,
    setOpenPopoverFor,
    updateNote,
    flushNoteSave,
    deleteHighlight,
  } = useHighlightOverlay();

  const popoverRef = useRef<HTMLDialogElement | null>(null);
  // The trigger element that opened the popover (the <mark>). Captured on open
  // so the `close` listener can restore focus to it (Pitfall 1 — mirrors
  // SettingsPanel/AnnotationsDrawer).
  const triggerRef = useRef<HTMLElement | null>(null);

  // Two-step delete confirm state (D5-12, mirrors WipeConfirm).
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Find the resolved highlight for the open popover.
  const resolved = openPopoverFor
    ? highlights.find((h) => h.record.id === openPopoverFor) ?? null
    : null;

  const noteText = resolved?.note?.text ?? "";
  const excerpt = resolved?.record.quote.exact ?? "";
  const isUnresolved = resolved?.status === "ambiguous" || resolved?.status === "orphan";

  // Sync the popover's visibility with the openPopoverFor state. Native
  // <dialog> + showModal gives VoiceOver the modal-dialog accessibility context
  // (focus scope + background inert + platform "modal shown" AT event) the
  // Popover-API div lacked. See file header HISTORY note.
  useEffect(() => {
    const dlg = popoverRef.current;
    if (!dlg) return;
    if (openPopoverFor && !dlg.open) {
      // Capture the trigger (the <mark>) BEFORE showModal moves focus into
      // the dialog (Pitfall 1).
      triggerRef.current = document.activeElement as HTMLElement | null;
      try {
        dlg.showModal();
      } catch {
        // showModal throws if the element is already in the top layer or if
        // the browser doesn't support <dialog>. Either way, the editor is in
        // the DOM; the close path is guarded by dlg.open below.
      }
      // Reset the confirm state on each open (fresh edit session).
      setConfirmingDelete(false);
      // Focus the textarea (D5-10 — focus → textarea on open). Cross-engine
      // quirk (Pitfall 1): showModal does not reliably focus the first
      // control (Chromium does; WebKit leaves focus on <body>). Explicit
      // focus makes the initial reading position predictable everywhere.
      const textarea = dlg.querySelector<HTMLTextAreaElement>("textarea");
      if (textarea) {
        textarea.focus();
        // Select existing text so the reader can edit or replace (UI-SPEC §29).
        textarea.select();
      }
    } else if (!openPopoverFor && dlg.open) {
      // State-driven close (Done / Delete-confirm). dlg.close() fires the
      // `close` event → the listener below flushes the note save + restores
      // focus to the trigger <mark>.
      dlg.close();
    }
  }, [openPopoverFor]);

  // Register the `close` event listener (with cleanup). Native <dialog> fires
  // `close` on EVERY close path: Escape (browser-default), the state-driven
  // dlg.close() above, and delete-confirm. On close: flush the debounced note
  // save (D2-03 — no edit lost), sync React state if Escape closed the dialog,
  // and restore focus to the captured trigger <mark> (Pitfall 1 / A11Y-02 —
  // showModal does NOT auto-restore).
  useEffect(() => {
    const dlg = popoverRef.current;
    if (!dlg) return;
    const handleClose = () => {
      flushNoteSave();
      setOpenPopoverFor(null);
      triggerRef.current?.focus();
    };
    dlg.addEventListener("close", handleClose);
    return () => dlg.removeEventListener("close", handleClose);
  }, [flushNoteSave, setOpenPopoverFor]);

  // Two-step delete confirm focus (D5-12, mirrors WipeConfirm Pitfall 8): when
  // the confirm prompt opens, move focus to the non-destructive Keep button
  // ([data-initial-focus]) so an accidental Enter keeps the highlight. A
  // useEffect (not a click-handler rAF) so focus runs AFTER React commits the
  // confirm view AND after the browser settles the modal focus relocation
  // that fires when the just-clicked Delete button unmounts. (A rAF form raced
  // WebKit's modal focus management and left focus on the dialog.)
  useEffect(() => {
    if (!confirmingDelete) return;
    const keepBtn = popoverRef.current?.querySelector<HTMLButtonElement>(
      "[data-initial-focus]",
    );
    keepBtn?.focus();
  }, [confirmingDelete]);

  /** Close the popover (Done / Delete-confirm route through here). The actual
   *  hide + focus-restore happens in the `close` event listener above. */
  const handleClose = () => {
    setOpenPopoverFor(null);
  };

  /** Done button — flush the debounced save + close. */
  const handleDone = () => {
    flushNoteSave();
    handleClose();
  };

  /** Step 1: show the confirm prompt (D5-12). Focus moves to the Keep button
   *  via the [confirmingDelete] effect below (not a click-handler rAF) so it
   *  runs AFTER React commits the confirm view + the browser settles modal
   *  focus relocation when the clicked Delete button unmounts (a rAF raced
   *  WebKit's modal focus management). */
  const handleDeleteStart = () => {
    setConfirmingDelete(true);
  };

  /** Step 2 confirm: delete the highlight + its note, then close. */
  const handleDeleteConfirm = async () => {
    if (!openPopoverFor) return;
    setConfirmingDelete(false);
    await deleteHighlight(openPopoverFor);
    // handleClose routes through setOpenPopoverFor(null) → the effect calls
    // dlg.close() → the close listener flushes + restores focus.
    handleClose();
  };

  /** Step 2 cancel: return to the edit view. */
  const handleDeleteCancel = () => {
    setConfirmingDelete(false);
    // Return focus to the textarea.
    const textarea = popoverRef.current?.querySelector<HTMLTextAreaElement>(
      "textarea",
    );
    textarea?.focus();
  };

  // The <dialog> is always mounted (showModal requires the element to be in
  // the DOM). Until showModal() runs it is display:none (native dialog UA
  // stylesheet) and therefore absent from the accessibility tree — no SR
  // reads the empty editor before it opens.
  return (
    <dialog
      ref={popoverRef}
      id="highlight-popover"
      className="highlight-popover"
      aria-label="Highlight note"
      aria-describedby="highlight-popover-excerpt"
    >
      {resolved && (
        confirmingDelete ? (
          <div className="highlight-popover-confirm">
            <p className="highlight-popover-confirm-prompt">
              Delete this highlight?
            </p>
            {excerpt.length > 0 && (
              <p className="highlight-popover-excerpt" id="highlight-popover-excerpt">
                <span className="visually-hidden">Highlighted text:</span>{" "}
                {truncate(excerpt, EXCERPT_MAX_CHARS)}
              </p>
            )}
            <div className="highlight-popover-actions">
              <button
                type="button"
                className="highlight-popover-destructive"
                onClick={() => void handleDeleteConfirm()}
              >
                Delete
              </button>
              {/* Non-destructive default focus (Pitfall 8 — mirrors WipeConfirm).
                  An accidental Enter keeps the highlight. */}
              <button
                type="button"
                className="highlight-popover-cancel"
                onClick={handleDeleteCancel}
                data-initial-focus
              >
                Keep
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="highlight-popover-context">
              {/* The excerpt is the dialog's accessible description
                  (aria-describedby above) so VoiceOver announces the
                  highlighted text when the editor opens (ACPT-02 finding #5).
                  The visually-hidden "Highlighted text:" prefix lives INSIDE
                  the <p> so the description is a single, unambiguous string —
                  "Highlighted text: <excerpt>" — rather than a separate label
                  VO stops on before reaching the excerpt content. Sighted
                  readers see only the italic excerpt (the prefix is clipped). */}
              <p className="highlight-popover-excerpt" id="highlight-popover-excerpt">
                <span className="visually-hidden">Highlighted text:</span>{" "}
                {truncate(excerpt, EXCERPT_MAX_CHARS)}
              </p>
            </div>
            <div className="highlight-popover-note">
              <label className="visually-hidden" htmlFor="highlight-popover-textarea">
                Note
              </label>
              <textarea
                id="highlight-popover-textarea"
                className="highlight-popover-textarea"
                value={noteText}
                placeholder="Add a note (optional)"
                onChange={(e) => {
                  if (openPopoverFor) {
                    updateNote(openPopoverFor, e.currentTarget.value);
                  }
                }}
                rows={3}
                disabled={isUnresolved}
              />
            </div>
            <div className="highlight-popover-actions">
              <button
                type="button"
                className="highlight-popover-done"
                onClick={handleDone}
              >
                Done
              </button>
              <button
                type="button"
                className="highlight-popover-delete"
                onClick={handleDeleteStart}
              >
                Delete
              </button>
            </div>
           </>
        )
      )}
    </dialog>
  );
}
