// src/reader/annotations/NotePopover.tsx
// Phase 5 Plan 05-03 — note editor + two-step delete confirm (D5-10, D5-12,
// ANNO-02/03). Issue #175 reshape: the dialog is now the WRITING-ONLY note
// editor, hosting the two-step delete confirm as its second view; the tags,
// color choices, and the Delete entry moved OUT to the lightweight
// HighlightControls surface.
//
// Issue #176 — placement beside the passage: the editor keeps the highlighted
// passage readable while it is open. Placement is CHOSEN ON OPEN through the
// ONE ladder in notePlacement.ts (gutter beside the article column → entirely
// above/below the passage → bottom sheet when neither fits → UA-centered
// fallback when no visible anchor exists, e.g. drawer-path edits on
// scrolled-away passages) and applied as inline position:fixed geometry +
// data-placement (CSS drops margin:auto centering only when anchored). The
// chosen placement is STABLE while typing (the dialog is top-layer/fixed, so
// opening/typing/confirming/closing can never shift article content or
// pagination); it re-runs ONLY on viewport changes (window resize, and the
// mobile keyboard shrinking visualViewport). The confirm view shares the
// session's placement — same footprint, no reposition between views.
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
// behind the dialog while a note is being edited (modal). It remains
// VISIBLE — `::backdrop` is styled transparent (app.css), so there is no
// full-screen dimmed overlay. Reduced motion: instant show/hide (no
// transition property). No light-dismiss while typing: modal <dialog> does
// NOT close on outside click — typing is safe.
//
// Issue #175 — writing-only editor:
//   - The edit view is the note textarea + Done. Tags moved to the compact
//     HighlightTagsDialog, color choices moved into HighlightControls, and
//     the Delete entry moved to HighlightControls (proportional, issue
//     #174) — Tags and Delete remain OUTSIDE the note editor.
//   - The passage quotation is NOT reproduced visually: the excerpt block is
//     fully visually-hidden now, kept ONLY as the dialog's accessible
//     description (aria-describedby) so VoiceOver still announces the
//     highlighted text as context. Accessible names + context without the
//     visual repetition.
//   - Opening handoff: HighlightControls focuses the anchor <mark> BEFORE
//     setting openPopoverFor, so the trigger capture below restores focus to
//     the HIGHLIGHT on every close path (the acceptance criteria: "closing
//     note editing returns to highlight controls with focus on the
//     highlight" — the controls hold their place behind the modal). The
//     drawer's "Edit note" path captures the drawer button the same way it
//     always has (activeElement at open).
//   - Footprint: consistent width + bounded height (app.css) — long notes
//     scroll INSIDE the textarea; the dialog itself never grows past the
//     viewport.
//
// Issue #174 — deletion proportional to the written content removed:
//   - The confirm step is reachable ONLY for highlights with a nonempty
//     note, and ONLY from HighlightControls' Delete (or the drawer's) — the
//     no-note delete runs immediately at those call sites. This dialog owns
//     the confirm VIEW: cascade-honest copy, destructive Delete +
//     Keep [data-initial-focus] (an accidental Enter keeps the highlight).
//   - Focus restore near the passage: on a successful delete the <mark>
//     unmounts, so the VISIBLE containing block ([data-block-index], never
//     the hidden measurement clone) is captured BEFORE the write and focused
//     through the close path — and the HighlightControls state is cleared
//     (the mark is gone; the controls must not linger).
//   - Honest failure: a rejected deleteHighlight ROLLBACKS in-memory (the
//     mark stays) and RETHROWS; the dialog STAYS OPEN with the calm inline
//     line through the ONE StatusRegion primitive (the DeleteHighlightConfirm
//     / issue #98 discipline) instead of closing as if the delete landed.
//
// Issue #116/#118 history: the popover hosted the highlight's tags + color
// picker beside the note until #175 moved them to their own surfaces (the
// compact tags editor + the controls' color row). The TagPicker/ColorEntry
// components themselves are unchanged — only their mount points moved.
//
// Pitfall 8 (note XSS): the note text is rendered as a React text child
// (`<textarea value={text} />`). NEVER raw HTML. The `react/no-danger`
// ESLint rule (enabled since Phase 1) statically forbids the raw-HTML prop.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useHighlightOverlay } from "./HighlightOverlay";
// Plan 19-02 (D19-10) — the excerpt derivation routes through the ONE
// shared pure helper (first fragment + calm ellipsis for spans).
import { firstFragmentExcerpt } from "../../annotations/excerpt";
// Issue #175 — the shared mark-resolution helpers (the post-delete focus
// target walk — the ONE copy, shared with HighlightControls).
import { captureDeleteFocusTarget, visibleMarkForId } from "./highlightMarks";
// Issue #174 — the ONE polite status-region primitive (the honest-failure
// line for a rejected delete).
import { StatusRegion } from "../../ui/StatusRegion";
// Issue #176 — the ONE placement ladder (gutter → above/below → sheet →
// center) + the viewport/column DOM-resolution helpers. The edge constant
// feeds the session's visual-viewport height cap (the dialog must fit the
// VISIBLE area, not the layout viewport behind a mobile keyboard).
import {
  chooseNoteEditorPlacement,
  currentViewportRect,
  NOTE_EDITOR_EDGE_GUTTER,
  visibleReadingColumnRect,
  type NoteEditorPlacement,
} from "./notePlacement";
// Issue #176 — the shared zoom-compensation factor (the §25 register; the
// inline left/top/width are divided by it for the zoomed local space).
import { effectiveZoom } from "./anchorPosition";

/** Issue #176 — the ONE measure-and-choose step shared by the open path and
 *  the viewport-change reposition (they must never drift): read the open
 *  dialog's real box, read the current viewport, run the ladder. Returns the
 *  placement plus the viewport height the dialog's inline max-height cap is
 *  derived from. */
function placeEditor(
  dlg: HTMLDialogElement,
  anchorRect: DOMRect | null,
): { placement: NoteEditorPlacement; viewportHeight: number } {
  const box = dlg.getBoundingClientRect();
  const viewport = currentViewportRect();
  return {
    placement: chooseNoteEditorPlacement(
      anchorRect,
      { width: box.width, height: box.height },
      viewport,
      visibleReadingColumnRect(),
    ),
    viewportHeight: viewport.height,
  };
}

/** Excerpt cap for the dialog's accessible description (UI-SPEC §Interaction
 * 29) — Plan 19-02: the cap parameter feeding the shared firstFragmentExcerpt
 * derivation. The excerpt is visually-hidden (issue #175): context for the
 * accessible description only, never a visual repetition of the quotation. */
const EXCERPT_MAX_CHARS = 200;

/** Issue #174 — the honest-failure copy for a rejected delete (the
 *  DeleteHighlightConfirm register: the dialog stays open, the highlight +
 *  note stay visible, the reader can retry or close). Exported for
 *  HighlightControls (the SAME action verb on both surfaces of this reader —
 *  the review panel's twin constant tracks "Remove"; two surface families,
 *  two vocabularies, the shape shared). */
export const DELETE_FAILED_COPY = "Couldn't delete this highlight. Try again.";

export function NotePopover(): React.ReactElement | null {
  const {
    highlights,
    openPopoverFor,
    setOpenPopoverFor,
    confirmDeleteFor,
    setConfirmDeleteFor,
    setControlsFor,
    updateNote,
    flushNoteSave,
    deleteHighlight,
  } = useHighlightOverlay();

  const popoverRef = useRef<HTMLDialogElement | null>(null);
  // The trigger element that opened the dialog (the anchor <mark> via the
  // HighlightControls handoff, the drawer's Edit-note/Delete button, or the
  // pre-activation focus on the create paths). Captured on open so the
  // `close` listener can restore focus to it (Pitfall 1 — mirrors
  // SettingsPanel/AnnotationsDrawer).
  const triggerRef = useRef<HTMLElement | null>(null);
  const readingHighlightRef = useRef<string | null>(null);
  // Issue #174 — the focus target for a close that followed a SUCCESSFUL
  // delete: the deleted highlight's visible containing block (the <mark>
  // unmounts, so the default trigger restore would silently no-op and drop
  // focus to <body> — the article top). The close listener prefers this over
  // the trigger and clears it after use.
  const focusRestoreRef = useRef<HTMLElement | null>(null);

  // Issue #175 — the honest-failure register for a rejected delete: the
  // dialog stays open with the calm inline line. Reset on every fresh open.
  const [deleteFailed, setDeleteFailed] = useState(false);

  // Issue #176 — the session's editor placement (null = UA-centered fallback:
  // no visible anchor — drawer paths on scrolled-away passages, jsdom unit
  // renders). Chosen ONCE at open (pre-paint, so no centered frame ever
  // flashes); re-run only by the viewport-change listeners below. The
  // confirm view inherits the session's placement (same footprint — no
  // reposition between the edit and confirm views).
  const [placement, setPlacement] = useState<NoteEditorPlacement | null>(null);
  // The session's viewport height (issue #176): the dialog's inline
  // max-height is derived from it so the editor stays bounded by the
  // VISIBLE area — the CSS 100vh cap reads the layout viewport, which
  // behind a mobile keyboard is larger than what the reader can see.
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  // The anchor rect the session was placed from. Repositioning reuses it
  // when the mark is momentarily unresolvable (a paginated resize can
  // repaginate and unmount the mark mid-listener) — the editor never jumps
  // to center because of a transient remount.
  const anchorRectRef = useRef<DOMRect | null>(null);

  // The dialog is open when EITHER editor state points at a highlight; the
  // confirm view is the confirmDeleteFor mode. The two states are mutually
  // exclusive by construction (every setter path opens exactly one).
  const activeId = openPopoverFor ?? confirmDeleteFor;
  const isConfirm = confirmDeleteFor !== null;

  // Find the resolved highlight for the open dialog.
  const resolved = activeId ? (highlights.find((h) => h.record.id === activeId) ?? null) : null;

  const noteText = resolved?.note?.text ?? "";
  // Plan 19-02 (D19-10): the excerpt derives from the FIRST FRAGMENT of the
  // stored quote via the shared pure helper — cap unchanged (200). It feeds
  // the dialog's accessible description in BOTH views (visually hidden).
  const excerpt = firstFragmentExcerpt(resolved?.record.quote.exact ?? "", EXCERPT_MAX_CHARS);
  const isUnresolved = resolved?.status === "ambiguous" || resolved?.status === "orphan";

  // Sync the dialog's visibility with the editor states. Native <dialog> +
  // showModal gives VoiceOver the modal-dialog accessibility context (focus
  // scope + background inert + platform "modal shown" AT event). See file
  // header HISTORY note.
  //
  // useLayoutEffect (issue #176): the open branch must measure the dialog
  // and choose its placement BEFORE the browser paints — otherwise the
  // freshly opened editor flashes at the CSS-centered position for one
  // frame before jumping beside the passage. A layout effect runs before
  // paint, and the placement setState inside it re-renders in the same
  // render cycle (the style application and the open are one visual step).
  useLayoutEffect(() => {
    const dlg = popoverRef.current;
    if (!dlg) return;
    if (activeId && !dlg.open) {
      // Capture the trigger (the anchor <mark> or the drawer action) BEFORE
      // showModal moves focus into the dialog (Pitfall 1).
      triggerRef.current = document.activeElement as HTMLElement | null;
      // Drawer actions restore their own trigger; reading editors return to
      // the surviving highlight, including selection-created notes.
      readingHighlightRef.current = triggerRef.current?.closest(".annotations-drawer")
        ? null
        : activeId;
      try {
        dlg.showModal();
      } catch {
        // showModal throws if the element is already in the top layer or if
        // the browser doesn't support <dialog>. Either way, the editor is in
        // the DOM; the close path is guarded by dlg.open below.
      }
      // Issue #176 — choose the placement on open (pre-paint): the anchor is
      // the highlight's visible mark; the editor's measured box comes from
      // the just-opened dialog (real content, real footprint). A missing or
      // off-viewport mark → the centered fallback (placement stays null).
      const markRect = visibleMarkForId(activeId)?.getBoundingClientRect() ?? null;
      anchorRectRef.current = markRect;
      const chosen = placeEditor(dlg, markRect);
      setPlacement(chosen.placement.mode === "center" ? null : chosen.placement);
      setViewportHeight(chosen.viewportHeight);
      // Reset per open (fresh session). A prior session's delete-failure
      // line never leaks either.
      setDeleteFailed(false);
      if (isConfirm) {
        // The confirm view's initial focus is the Keep button — handled by
        // the [data-initial-focus] effect below (after React commits the
        // view, and after the browser settles the modal focus relocation).
      } else {
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
      }
    } else if (!activeId && dlg.open) {
      // State-driven close (Done / Keep / delete-confirm). dlg.close() fires
      // the `close` event → the listener below flushes the note save +
      // restores focus.
      dlg.close();
    }
  }, [activeId, isConfirm]);

  // Issue #176 — reposition ONLY on viewport change (the AC ladder: stable
  // while typing — typing fires no events here; the dialog's box is content-
  // bounded so note length cannot resize it). Window resize covers desktop
  // viewports + the 400%-zoom scenario; visualViewport resize/scroll covers
  // the mobile keyboard shrinking (or panning) the visible area. A fresh
  // mark measure keeps the anchored placements truthful after a resize-
  // driven repagination; a transiently unresolvable mark (mid-repagination)
  // falls back to the session's captured anchor rect instead of jumping to
  // center. Identical results never re-render (the position is stable).
  useEffect(() => {
    if (!activeId) return;
    const reposition = () => {
      const dlg = popoverRef.current;
      if (!dlg || !dlg.open) return;
      const markRect = visibleMarkForId(activeId)?.getBoundingClientRect() ?? null;
      if (markRect) anchorRectRef.current = markRect;
      const chosen = placeEditor(dlg, anchorRectRef.current);
      setViewportHeight(chosen.viewportHeight);
      setPlacement((prev) => {
        const next = chosen.placement;
        if (
          prev !== null &&
          prev.mode === next.mode &&
          Math.round(prev.left) === Math.round(next.left) &&
          Math.round(prev.top) === Math.round(next.top) &&
          Math.round(prev.width) === Math.round(next.width)
        ) {
          return prev;
        }
        return next.mode === "center" ? null : next;
      });
    };
    window.addEventListener("resize", reposition);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", reposition);
    vv?.addEventListener("scroll", reposition);
    return () => {
      window.removeEventListener("resize", reposition);
      vv?.removeEventListener("resize", reposition);
      vv?.removeEventListener("scroll", reposition);
    };
  }, [activeId]);

  // Register the `close` event listener (with cleanup). Native <dialog> fires
  // `close` on EVERY close path: Escape (browser-default), the state-driven
  // dlg.close() above, and delete-confirm. On close: flush the debounced note
  // save (D2-03 — no edit lost), clear BOTH editor states (whichever was
  // open), and restore focus — to the captured passage block when the close
  // followed a successful delete (issue #174: the <mark> is gone, so the
  // trigger restore would silently no-op), else to the surviving reading
  // highlight (including creation paths), or the captured drawer trigger
  // (Pitfall 1 / A11Y-02 — showModal does NOT auto-restore). The dialog has
  // left the top layer by close-event time, so focusing the in-flow block is
  // unobstructed. The lightweight controls hold their place behind the modal
  // (their dismissals were suppressed) — restoring to the mark returns the
  // reader to them (issue #175).
  useEffect(() => {
    const dlg = popoverRef.current;
    if (!dlg) return;
    const handleClose = () => {
      flushNoteSave();
      setOpenPopoverFor(null);
      setConfirmDeleteFor(null);
      const mark = readingHighlightRef.current
        ? visibleMarkForId(readingHighlightRef.current)
        : null;
      const restoreTo = focusRestoreRef.current ?? mark ?? triggerRef.current;
      if (!focusRestoreRef.current && mark && readingHighlightRef.current) {
        setControlsFor({
          id: readingHighlightRef.current,
          rect: mark.getBoundingClientRect(),
          focus: false,
        });
      }
      readingHighlightRef.current = null;
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
  }, [flushNoteSave, setOpenPopoverFor, setConfirmDeleteFor, setControlsFor]);

  // Confirm-view initial focus (D5-12, mirrors WipeConfirm Pitfall 8): move
  // focus to the non-destructive Keep button ([data-initial-focus]) so an
  // accidental Enter keeps the highlight. A useEffect (not a click-handler
  // rAF) so focus runs AFTER React commits the confirm view AND after the
  // browser settles the modal focus relocation (a rAF form raced WebKit's
  // modal focus management and left focus on the dialog).
  useEffect(() => {
    if (!isConfirm) return;
    const keepBtn = popoverRef.current?.querySelector<HTMLButtonElement>("[data-initial-focus]");
    keepBtn?.focus();
  }, [isConfirm]);

  /** Close the dialog (Done / Keep route through here). The actual hide +
   *  focus-restore happens in the `close` event listener above. */
  const handleClose = () => {
    setOpenPopoverFor(null);
    setConfirmDeleteFor(null);
  };

  /** Done button — flush the debounced save + close. */
  const handleDone = () => {
    flushNoteSave();
    handleClose();
  };

  /** Run the delete from the confirm view: capture the passage block, run
   *  the write, route the honest failure / successful close. */
  const performDelete = async () => {
    if (!confirmDeleteFor) return;
    // Capture the passage block BEFORE the optimistic removal unmounts the
    // <mark> (after the await, the mark is gone from the DOM).
    const focusTarget = captureDeleteFocusTarget(confirmDeleteFor);
    try {
      await deleteHighlight(confirmDeleteFor);
    } catch {
      // Honest failure (issue #98 register): deleteHighlight rolled the
      // in-memory removal back (mark + note stay) and routed the error to
      // StorageBanner. The dialog STAYS OPEN with the inline line so the
      // reader can retry or close — never a close that implies success.
      setDeleteFailed(true);
      return;
    }
    // The close listener prefers this block over the (now unmounted) trigger
    // — focus lands near the passage, not at the article top. The
    // lightweight controls were anchored at the deleted mark: clear them too.
    focusRestoreRef.current = focusTarget;
    setControlsFor(null);
    // handleClose routes through the state clear → the effect calls
    // dlg.close() → the close listener flushes + restores focus.
    handleClose();
  };

  // The <dialog> is always mounted (showModal requires the element to be in
  // the DOM). Until showModal() runs it is display:none (native dialog UA
  // stylesheet) and therefore absent from the accessibility tree — no SR
  // reads the empty editor before it opens.
  //
  // Issue #176 — anchored placement: data-placement flips the CSS margin:auto
  // centering off (dialog.highlight-popover[data-placement]), and the inline
  // left/top/width carry the chosen geometry. Coordinates are divided by the
  // effective page zoom (the §25 register — getBoundingClientRect reads
  // visual px; position:fixed offsets apply in the zoomed local space), and
  // --effective-zoom is mirrored for any viewport-unit CSS. The centered
  // fallback (no visible anchor) sets NEITHER — the dialog keeps the
  // pre-#176 UA-centered look.
  //
  // The inline max-height is derived from the session's VISUAL viewport
  // height (not the CSS 100vh cap, which reads the layout viewport): behind
  // a mobile keyboard the visible area is smaller, and the editor — sheet
  // included — must stay bounded by what the reader can actually see. The
  // textarea scrolls internally under the tighter cap (the dialog's own
  // overflow-y is the last-resort clamp, unchanged).
  const anchored = placement !== null;
  const zoom = effectiveZoom();
  const placementStyle: React.CSSProperties | undefined =
    viewportHeight !== null
      ? ({
          ...(anchored
            ? {
                left: `${placement.left / zoom}px`,
                top: `${placement.top / zoom}px`,
                width: `${placement.width / zoom}px`,
              }
            : {}),
          maxHeight: `${(viewportHeight - 2 * NOTE_EDITOR_EDGE_GUTTER) / zoom}px`,
          "--effective-zoom": zoom,
        } as React.CSSProperties)
      : undefined;
  return (
    <dialog
      ref={popoverRef}
      id="highlight-popover"
      className="highlight-popover"
      aria-label={isConfirm ? "Delete highlight" : "Highlight note"}
      aria-describedby={excerpt.length > 0 ? "highlight-popover-excerpt" : undefined}
      data-placement={anchored ? placement.mode : undefined}
      style={placementStyle}
    >
      {resolved &&
        (isConfirm ? (
          <div className="highlight-popover-confirm">
            <p className="highlight-popover-confirm-prompt">Delete this highlight?</p>
            {/* Cascade-honest copy (issue #174, the D10-12 register): the
                confirm step is only reachable when a nonempty note exists,
                so the note consequence is always true here. */}
            <p className="highlight-popover-confirm-cascade">
              The note attached to it will also be removed.
            </p>
            {/* Issue #175 — the excerpt is visually-hidden context (the
                dialog's accessible description), never a visual repetition
                of the quotation. */}
            {excerpt.length > 0 && (
              <p
                className="highlight-popover-excerpt visually-hidden"
                id="highlight-popover-excerpt"
              >
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
                  An accidental Enter keeps the highlight. Keep closes back to
                  the lightweight controls (the trigger restore lands on the
                  highlight mark). */}
              <button
                type="button"
                className="btn btn-quiet highlight-popover-cancel"
                onClick={handleClose}
                data-initial-focus
              >
                Keep
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Issue #175 — writing-only editor: the SR-only context block
                (the dialog's accessible description, aria-describedby above)
                keeps VoiceOver announcing the highlighted text when the
                editor opens (ACPT-02 finding #5), while nothing repeats the
                quotation visually. The visually-hidden "Highlighted text:"
                prefix lives INSIDE the <p> so the description is a single,
                unambiguous string. */}
            {excerpt.length > 0 && (
              <div className="highlight-popover-context">
                <p
                  className="highlight-popover-excerpt visually-hidden"
                  id="highlight-popover-excerpt"
                >
                  <span className="visually-hidden">Highlighted text:</span> {excerpt}
                </p>
              </div>
            )}
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
            {/* Issue #175 — Tags and Delete remain OUTSIDE the note editor
                (HighlightControls' Tags button + compact tags dialog / the
                proportional Delete). The editor's only actions: Done (+ the
                Cmd/Ctrl+Enter shortcut). */}
            <div className="highlight-popover-actions dialog-actions">
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
