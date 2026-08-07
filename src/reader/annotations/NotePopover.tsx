// src/reader/annotations/NotePopover.tsx
// Phase 5 Plan 05-03 — Popover API (`popover="manual"`) note editor + two-step
// delete confirm (D5-10, D5-12, ANNO-02/03).
//
// Mechanism: Popover API (NOT <dialog>/showModal — UI-SPEC §Design System
// rationale: <dialog> is too heavy with its centered + backdrop overlay; the
// popover needs top-layer rendering + no light-dismiss + no backdrop so typing
// doesn't close it and the article stays visible/interactive behind it).
// `popover="manual"` → typing doesn't light-dismiss. showPopover()/hidePopover()
// are controlled by React state via the HighlightOverlay context's openPopoverFor.
//
// Two-step delete (D5-12, mirrors WipeConfirm Pitfall 8): step 1 Delete replaces
// the popover body with the confirm prompt "Delete this highlight?" + two
// buttons; step 2 confirm Delete (--destructive border) calls deleteHighlight
// then closes. The Keep button carries [data-initial-focus] — non-destructive
// default focus so an accidental Enter cannot destroy a highlight+note.
//
// Debounced save (D5-10, D2-03 pattern): the textarea persists debounced
// (no Save button). Each change calls updateNote (optimistic in-memory +
// scheduleNoteSave internally). On Done/Escape, flushNoteSave fires a final
// write before close so no edit is lost. Empty textarea = no NoteRecord.
//
// Pitfall 8 (note XSS): the note text is rendered as a React text child
// (`<textarea value={text} />` + excerpt as `<p>{excerpt}</p>`). NEVER raw
// HTML. The `react/no-danger` ESLint rule (enabled since Phase 1) statically
// forbids the raw-HTML prop.
//
// Reduced motion (A11Y-06): the popover appears/disappears as an instant
// show/hide. No transition/animation property on any popover selector — the
// Popover API's own transition is disabled by the global prefers-reduced-motion
// gate.
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

  const popoverRef = useRef<HTMLDivElement | null>(null);
  // The trigger element that opened the popover (the <mark>). Captured on open
  // so Done/Escape can restore focus to it (Pitfall 1 — mirrors SettingsPanel).
  const triggerRef = useRef<HTMLElement | null>(null);
  // Track whether we've called showPopover so the effect can guard hidePopover
  // (avoids the :popover-open pseudo-class which jsdom does not implement).
  const isOpenRef = useRef(false);

  // Two-step delete confirm state (D5-12, mirrors WipeConfirm).
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Find the resolved highlight for the open popover.
  const resolved = openPopoverFor
    ? highlights.find((h) => h.record.id === openPopoverFor) ?? null
    : null;

  const noteText = resolved?.note?.text ?? "";
  const excerpt = resolved?.record.quote.exact ?? "";
  const isUnresolved = resolved?.status === "ambiguous" || resolved?.status === "orphan";

  // Sync the popover's visibility with the openPopoverFor state.
  useEffect(() => {
    const el = popoverRef.current;
    if (!el) return;
    if (openPopoverFor && !isOpenRef.current) {
      // Capture the trigger (the <mark>) for focus restore on close.
      triggerRef.current = document.activeElement as HTMLElement | null;
      try {
        el.showPopover();
        isOpenRef.current = true;
      } catch {
        // showPopover throws if the element is already in the top layer or
        // if the browser doesn't support Popover API. Either way, the popover
        // is visually rendered (it's in the DOM); track as open so the close
        // path knows to attempt hidePopover.
        isOpenRef.current = true;
      }
      // Reset the confirm state on each open (fresh edit session).
      setConfirmingDelete(false);
      // Focus the textarea (D5-10 — focus → textarea on open). WebKit quirk:
      // showPopover does not auto-focus; explicit focus is required.
      const textarea = el.querySelector<HTMLTextAreaElement>("textarea");
      if (textarea) {
        textarea.focus();
        // Select existing text so the reader can edit or replace (UI-SPEC §29).
        textarea.select();
      }
    } else if (!openPopoverFor && isOpenRef.current) {
      // Flush any pending note save before closing (D2-03 — no edit lost).
      flushNoteSave();
      try {
        el.hidePopover();
      } catch {
        // Same defensive guard as showPopover.
      }
      isOpenRef.current = false;
    }
  }, [openPopoverFor, flushNoteSave]);

  /** Close the popover + restore focus to the trigger <mark> (Pitfall 1). */
  const handleClose = () => {
    setOpenPopoverFor(null);
    // Focus restore is deferred so the hidePopover effect runs first.
    requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  };

  /** Done button — flush the debounced save + close. */
  const handleDone = () => {
    flushNoteSave();
    handleClose();
  };

  /** Step 1: show the confirm prompt (D5-12). */
  const handleDeleteStart = () => {
    setConfirmingDelete(true);
    // Focus the Keep button (non-destructive default — Pitfall 8). Deferred
    // so the confirm view renders first.
    requestAnimationFrame(() => {
      const keepBtn = popoverRef.current?.querySelector<HTMLButtonElement>(
        "[data-initial-focus]",
      );
      keepBtn?.focus();
    });
  };

  /** Step 2 confirm: delete the highlight + its note, then close. */
  const handleDeleteConfirm = async () => {
    if (!openPopoverFor) return;
    setConfirmingDelete(false);
    await deleteHighlight(openPopoverFor);
    setOpenPopoverFor(null);
    requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
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

  // Don't render the popover element at all if there's no article/highlight.
  // (The element must exist in the DOM for showPopover to work, so we always
  // render it but it's visually hidden until showPopover is called.)
  return (
    <div
      ref={popoverRef}
      popover="manual"
      id="highlight-popover"
      className="highlight-popover"
      role="dialog"
      aria-label="Highlight note"
    >
      {resolved && (
        confirmingDelete ? (
          <div className="highlight-popover-confirm">
            <p className="highlight-popover-confirm-prompt">
              Delete this highlight?
            </p>
            {excerpt.length > 0 && (
              <p className="highlight-popover-excerpt">
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
              <span className="visually-hidden">Highlighted text:</span>
              <p className="highlight-popover-excerpt">
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
    </div>
  );
}
