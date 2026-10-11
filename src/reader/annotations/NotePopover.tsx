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
//   - Two-step delete confirm (D5-12) + Keep [data-initial-focus]: unchanged
//     for highlights WITH a note; Keep stays the non-destructive default.
//   - Debounced note save (D5-10/D2-03) + flushNoteSave on close: the close
//     listener flushes before the trigger regains focus — no edit lost.
//
// Issue #174 — deletion proportional to the written content removed:
//   - A highlight with NO note (empty OR whitespace-only commentary — the
//     shared hasNoteContent predicate) deletes IMMEDIATELY on the Delete
//     click: there is no written content to lose, so confirmation would
//     only add friction. The existing Undo affordance on the fresh-create
//     toolbar already deletes without confirm — this extends the same
//     proportionality to every no-note delete.
//   - A highlight WITH a nonempty note keeps the two-step confirm (D5-12)
//     with Keep [data-initial-focus]; the confirm prompt is cascade-honest
//     (the attached note goes with the highlight — the D10-12 register).
//   - Focus restore near the passage: the triggering <mark> unmounts on a
//     successful delete, so triggerRef.current?.focus() would silently
//     no-op and drop focus to <body> (the article top). Before deleting,
//     the highlight's VISIBLE mark's containing block ([data-block-index],
//     never the hidden measurement clone — the resolveTocDestination
//     discipline) is captured and focused through the close path instead,
//     so keyboard/screen-reader readers stay at the passage they were
//     reading. Never a scroll/jump — the reader is already there.
//   - Honest failure: a rejected deleteHighlight ROLLBACKS in-memory (the
//     mark stays) and RETHROWS; the popover STAYS OPEN with the calm inline
//     line through the ONE StatusRegion primitive (the DeleteHighlightConfirm
//     / issue #98 discipline) instead of closing as if the delete landed.
//
// Two-step delete (D5-12, mirrors WipeConfirm Pitfall 8): step 1 Delete replaces
// the popover body with the confirm prompt "Delete this highlight?" + two
// buttons; step 2 confirm Delete (--destructive border) calls deleteHighlight
// then closes. The Keep button carries [data-initial-focus] — non-destructive
// default focus so an accidental Enter cannot destroy a highlight+note.
// Issue #174: the confirm step is only reachable when the highlight carries a
// NONEMPTY note (hasNoteContent) — a no-note delete runs immediately from the
// step-1 Delete click itself.
//
// Pitfall 8 (note XSS): the note text is rendered as a React text child
// (`<textarea value={text} />` + excerpt as `<p>{excerpt}</p>`). NEVER raw
// HTML. The `react/no-danger` ESLint rule (enabled since Phase 1) statically
// forbids the raw-HTML prop.
//
// Issue #174 rendering notes: the delete-failure line renders through the
// ONE shared StatusRegion primitive inside each view (branch-exclusive, so
// the region is mounted before the failure text can ever arrive), and the
// confirm prompt is cascade-honest (the D10-12 register — the attached note
// is removed with the highlight).
//
// Issue #116 — the popover is the highlight's READER DETAILS surface: the
// shared TagPicker (via TagEntry with a saveTags override) edits the
// highlight's tags beside the note. The note has NO independent tag set —
// it shares the highlight's tags by construction. Tags stay EDITABLE when
// the anchor is ambiguous/orphaned (unlike the note textarea, tagging does
// not depend on re-anchoring); the write runs through tagsStore's ONE
// seam and never touches article or book tag assignments.
//
// Issue #118 — the same surface hosts the named-color picker
// (HighlightColorEntry): Default + four named choices, commit-per-change
// through updateHighlightColor (the ONE highlightsStore seam). Color is
// visual organization — separate from tags and anchor status — so the
// picker is NOT gated on isUnresolved either.
import { useEffect, useRef, useState } from "react";
import { useHighlightOverlay } from "./HighlightOverlay";
// Plan 19-02 (D19-10) — the excerpt derivation routes through the ONE
// shared pure helper (first fragment + calm ellipsis for spans).
import { firstFragmentExcerpt } from "../../annotations/excerpt";
// Issue #174 — the ONE "does this note carry written content?" predicate
// (empty OR whitespace-only commentary counts as no note; never trims
// stored content).
import { hasNoteContent } from "../../annotations/noteText";
// Issue #116 — the ONE shared tag entry (TagPicker host): same fieldset +
// legend + picker + StatusRegion anatomy as the article/book surfaces.
import { TagEntry } from "../TagEntry";
// Issue #118 — the named-color picker (the TagEntry anatomy applied to the
// closed color vocabulary: fieldset + legend + radio pills + StatusRegion).
import { HighlightColorEntry } from "./HighlightColorEntry";
// Issue #174 — the ONE polite status-region primitive (the honest-failure
// line for a rejected delete).
import { StatusRegion } from "../../ui/StatusRegion";

/** Excerpt cap for the popover context block (UI-SPEC §Interaction 29) —
 * Plan 19-02: the cap parameter feeding the shared firstFragmentExcerpt
 * derivation (per-surface caps stay EXACTLY as shipped; the dialog's
 * accessible description IS this excerpt block via aria-describedby). */
const EXCERPT_MAX_CHARS = 200;

/** Issue #174 — the honest-failure copy for a rejected delete (the
 *  DeleteHighlightConfirm register: the dialog stays open, the highlight +
 *  note stay visible, the reader can retry or close). The verb deliberately
 *  tracks THIS surface's button ("Delete") while the review panel's twin
 *  constant tracks "Remove" — two surfaces, two action vocabularies; the
 *  shape (calm retry line) is shared, the copy must not be. */
const DELETE_FAILED_COPY = "Couldn't delete this highlight. Try again.";

export function NotePopover(): React.ReactElement | null {
  const {
    highlights,
    openPopoverFor,
    setOpenPopoverFor,
    updateNote,
    flushNoteSave,
    updateHighlightTags,
    updateHighlightColor,
    deleteHighlight,
  } = useHighlightOverlay();

  const popoverRef = useRef<HTMLDialogElement | null>(null);
  // The trigger element that opened the popover (the <mark>). Captured on open
  // so the `close` listener can restore focus to it (Pitfall 1 — mirrors
  // SettingsPanel/AnnotationsDrawer).
  const triggerRef = useRef<HTMLElement | null>(null);
  // Issue #174 — the focus target for a close that followed a SUCCESSFUL
  // delete: the deleted highlight's visible containing block (the <mark>
  // unmounts, so the default trigger restore would silently no-op and drop
  // focus to <body> — the article top). The close listener prefers this over
  // the trigger and clears it after use.
  const focusRestoreRef = useRef<HTMLElement | null>(null);

  // Two-step delete confirm state (D5-12, mirrors WipeConfirm). Issue #174 —
  // only reachable for highlights with a nonempty note.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Issue #174 — the honest-failure register for a rejected delete: the
  // popover stays open with the calm inline line (the DeleteHighlightConfirm
  // discipline). Reset on every fresh open.
  const [deleteFailed, setDeleteFailed] = useState(false);

  // Find the resolved highlight for the open popover.
  const resolved = openPopoverFor
    ? (highlights.find((h) => h.record.id === openPopoverFor) ?? null)
    : null;

  const noteText = resolved?.note?.text ?? "";
  // Issue #174 — deletion is proportional to the written content removed:
  // empty OR whitespace-only commentary counts as "no note" (the ONE shared
  // predicate; the stored text itself is never trimmed).
  const noteHasContent = hasNoteContent(noteText);
  // Plan 19-02 (D19-10): the excerpt derives from the FIRST FRAGMENT of the
  // stored quote via the shared pure helper — cap unchanged (200). The same
  // derived value feeds both the confirm-path and edit-path context blocks
  // (and therefore the dialog's accessible description).
  const excerpt = firstFragmentExcerpt(resolved?.record.quote.exact ?? "", EXCERPT_MAX_CHARS);
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
      // Reset the confirm state on each open (fresh edit session). Issue
      // #174 — a prior session's delete-failure line never leaks in either.
      setConfirmingDelete(false);
      setDeleteFailed(false);
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
  // and restore focus — to the captured passage block when the close followed
  // a successful delete (issue #174: the <mark> is gone, so the trigger
  // restore would silently no-op), else to the captured trigger <mark>
  // (Pitfall 1 / A11Y-02 — showModal does NOT auto-restore). The dialog has
  // left the top layer by close-event time, so focusing the in-flow block is
  // unobstructed.
  useEffect(() => {
    const dlg = popoverRef.current;
    if (!dlg) return;
    const handleClose = () => {
      flushNoteSave();
      setOpenPopoverFor(null);
      const restoreTo = focusRestoreRef.current ?? triggerRef.current;
      focusRestoreRef.current = null;
      if (restoreTo) {
        // A passage block is not focusable by default — the programmatic-focus
        // discipline sets tabindex="-1" before focusing (the resolveToc-
        // Destination/settleFocus pattern). The guard keeps a <mark> trigger's
        // existing tabindex="0" untouched (normal Done/Escape restore).
        if (!restoreTo.hasAttribute("tabindex")) restoreTo.setAttribute("tabindex", "-1");
        restoreTo.focus();
      }
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
    const keepBtn = popoverRef.current?.querySelector<HTMLButtonElement>("[data-initial-focus]");
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

  /** Step 1: show the confirm prompt (D5-12 — reachable ONLY for highlights
   *  with a nonempty note; the no-note Delete runs immediately). Focus moves
   *  to the Keep button via the [confirmingDelete] effect below (not a
   *  click-handler rAF) so it runs AFTER React commits the confirm view + the
   *  browser settles modal focus relocation when the clicked Delete button
   *  unmounts (a rAF raced WebKit's modal focus management). */
  const handleDeleteStart = () => {
    setDeleteFailed(false);
    setConfirmingDelete(true);
  };

  /** Issue #174 — resolve the deleted highlight's VISIBLE containing block
   *  (its first [data-block-index] ancestor in the live reading surface).
   *  The <mark> unmounts on deletion, so the close path focuses THIS block
   *  instead — the reader stays at the passage, never dropped to the article
   *  top. The hidden measurement clone (paginated mode) is skipped — the
   *  resolveTocDestination discipline. Returns null when no visible mark
   *  exists (e.g. a jsdom unit render) — the close path then falls back to
   *  the plain trigger restore. */
  const captureDeleteFocusTarget = (highlightId: string): HTMLElement | null => {
    const marks = document.querySelectorAll<HTMLElement>(
      `mark.highlight[data-highlight-id="${highlightId}"]`,
    );
    for (const mark of marks) {
      if (mark.closest(".article-body-measurement")) continue;
      return mark.closest<HTMLElement>("[data-block-index]");
    }
    return null;
  };

  /** Issue #174 — run the delete from EITHER entry point (the immediate
   *  no-note step-1 click, or the step-2 confirm): capture the passage
   *  block, run the write, route the honest failure / successful close.
   *  Named for the DOING, not the step — both buttons call this. */
  const performDelete = async () => {
    if (!openPopoverFor) return;
    // Capture the passage block BEFORE the optimistic removal unmounts the
    // <mark> (after the await, the mark is gone from the DOM).
    const focusTarget = captureDeleteFocusTarget(openPopoverFor);
    try {
      await deleteHighlight(openPopoverFor);
    } catch {
      // Honest failure (issue #98 register): deleteHighlight rolled the
      // in-memory removal back (mark + note stay) and routed the error to
      // StorageBanner. The popover STAYS OPEN with the inline line so the
      // reader can retry or close — never a close that implies success.
      setDeleteFailed(true);
      return;
    }
    // The close listener prefers this block over the (now unmounted) trigger
    // — focus lands near the passage, not at the article top.
    focusRestoreRef.current = focusTarget;
    // handleClose routes through setOpenPopoverFor(null) → the effect calls
    // dlg.close() → the close listener flushes + restores focus.
    handleClose();
  };

  /** Step 2 cancel: return to the edit view. */
  const handleDeleteCancel = () => {
    setDeleteFailed(false);
    setConfirmingDelete(false);
    // Return focus to the textarea.
    const textarea = popoverRef.current?.querySelector<HTMLTextAreaElement>("textarea");
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
      {resolved &&
        (confirmingDelete ? (
          <div className="highlight-popover-confirm">
            <p className="highlight-popover-confirm-prompt">Delete this highlight?</p>
            {/* Cascade-honest copy (issue #174, the D10-12 register): the
                confirm step is only reachable when a nonempty note exists,
                so the note consequence is always true here. */}
            <p className="highlight-popover-confirm-cascade">
              The note attached to it will also be removed.
            </p>
            {excerpt.length > 0 && (
              <p className="highlight-popover-excerpt" id="highlight-popover-excerpt">
                <span className="visually-hidden">Highlighted text:</span> {excerpt}
              </p>
            )}
            {/* Issue #174 — the honest-failure line (always-mounted live
                region; idle it renders no children). */}
            <StatusRegion>{deleteFailed && <p>{DELETE_FAILED_COPY}</p>}</StatusRegion>
            <div className="dialog-actions highlight-popover-actions">
              <button
                type="button"
                className="btn btn-destructive highlight-popover-destructive"
                onClick={() => void performDelete()}
              >
                Delete
              </button>
              {/* Non-destructive default focus (Pitfall 8 — mirrors WipeConfirm).
                  An accidental Enter keeps the highlight. */}
              <button
                type="button"
                className="btn btn-quiet highlight-popover-cancel"
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
                <span className="visually-hidden">Highlighted text:</span> {excerpt}
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
                onKeyDown={(e) => {
                  // Cmd/Ctrl+Enter saves and closes (the Done path: flush
                  // the debounced write first, then close — no edit lost).
                  // Plain Enter/Shift+Enter keep native textarea behavior.
                  // The isComposing guard keeps the shortcut from firing when
                  // Enter CONFIRMS an IME composition (the confirming keyDown
                  // reports isComposing=true — save-and-close mid-composition
                  // would discard the in-flight text).
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    handleDone();
                  }
                }}
                rows={3}
                disabled={isUnresolved}
              />
            </div>
            {/* Issue #116 — the highlight's tags, edited through the ONE
                shared TagPicker. The key forces a fresh local mirror when the
                popover re-points at a different highlight; the saveTags
                override routes the commit to updateHighlightTags (the
                tagsStore seam — highlight row only). The fieldset has NO
                isUnresolved gate: tagging never depends on the anchor, so
                tags stay editable for ambiguous/orphaned highlights (the
                note textarea above keeps its D5-04 disabled state). */}
            {resolved && (
              <TagEntry
                key={resolved.record.id}
                recordId={resolved.record.id}
                tags={resolved.record.tags ?? []}
                saveTags={(next) => updateHighlightTags(resolved.record.id, next)}
                inputId="highlight-popover-tags-input"
              />
            )}
            {/* Issue #118 — the named-color picker. The key forces a fresh
                error-mirror when the popover re-points at a different
                highlight (the TagEntry discipline); saveColor routes to
                updateHighlightColor (the highlightsStore seam). NO
                isUnresolved gate: the color choice never depends on the
                anchor, exactly like tags above. */}
            {resolved && (
              <HighlightColorEntry
                key={resolved.record.id}
                color={resolved.record.color}
                saveColor={(next) => updateHighlightColor(resolved.record.id, next)}
              />
            )}
            {/* Issue #174 — the honest-failure line for a rejected delete
                (always-mounted live region; idle it renders no children). */}
            <StatusRegion>{deleteFailed && <p>{DELETE_FAILED_COPY}</p>}</StatusRegion>
            <div className="highlight-popover-actions dialog-actions">
              {/* Issue #174 — deletion proportional to the written content
                  removed: with NO note (empty or whitespace-only), the click
                  deletes immediately; with a nonempty note it opens the
                  two-step confirm (D5-12). The write fires ONLY from this
                  reader click either way (the Pitfall 8 register). */}
              <button
                type="button"
                className="btn btn-destructive highlight-popover-delete"
                onClick={noteHasContent ? handleDeleteStart : () => void performDelete()}
              >
                Delete
              </button>
              <button
                type="button"
                className="btn btn-primary highlight-popover-done"
                onClick={handleDone}
              >
                Done
              </button>
            </div>
          </>
        ))}
    </dialog>
  );
}
