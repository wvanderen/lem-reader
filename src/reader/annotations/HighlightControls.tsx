// src/reader/annotations/HighlightControls.tsx
// Issue #175 — the lightweight highlight controls: the surface mark
// activation exposes INSTEAD of the full note editor. Cohesion contract from
// the issue:
//
//   - Activating an existing highlight (click, Enter, Space) shows THESE
//     controls near the mark; keyboard activation moves focus into them.
//   - The controls carry the color choices DIRECTLY (HighlightColorEntry),
//     alongside Add/Edit note, Tags, and Delete. The passage quotation is
//     never reproduced here.
//   - "Add note"/"Edit note" opens the writing-only editor (NotePopover);
//     "Tags" opens the compact tags editor (HighlightTagsDialog); Delete is
//     proportional (issue #174): a highlight with NO note (empty or
//     whitespace-only — the shared hasNoteContent predicate) deletes
//     immediately, a noted highlight opens the two-step confirm (Keep keeps
//     the default focus) inside the editor's dialog footprint.
//
// Mechanism: a conditionally-rendered position:fixed element — the SAME
// pattern as SelectionToolbar (NOT popover="auto", NOT a dialog): a
// popover="auto" surface would light-dismiss on the finalizing mouseup of
// the mark click, and the modal-dialog context is reserved for the editors
// (the VoiceOver history in NotePopover's header). Geometry rides the ONE
// shared anchored-surface helper (anchorPosition.ts — the §25 contract).
//
// Dismissal matrix (all suppressed while a modal editor is open — the
// controls hold their place BEHIND the dialog so closing the editor returns
// the reader to them):
//   - Escape → dismiss, focus back to the anchor mark (keyboard users stay
//     at the highlight).
//   - pointerdown outside the surface (the anchor mark excluded — clicking
//     it re-points the controls through ArticleView's activation handler).
//   - focusout with the incoming target outside the surface (Tab past the
//     last control) — the SelectionToolbar focusout discipline. The anchor
//     mark counts as intra-surface: the dialog-opening actions focus the
//     mark FIRST (so the dialog's Pitfall-1 trigger capture restores to the
//     highlight), and that intra-gesture focus move must not dismiss.
//   - scroll (capture) / resize / page-turn keys / surface swap → dismiss
//     (the anchor rect is captured once at activation, SelectionToolbar's
//     saved-rect discipline — a moved anchor invalidates the geometry).
//
// Unresolved anchors (ambiguous/orphan) keep their safeguards: tags and
// color stay editable (they never depend on re-anchoring), Delete stays
// available, and "Add/Edit note" opens the editor whose textarea carries the
// existing disabled state (D5-04) — no new gating is invented here.
//
// Honest failure: a rejected no-note delete ROLLBACKS in-memory (the mark
// stays) and RETHROWS; the controls STAY OPEN with the calm inline line
// through the ONE StatusRegion primitive (the issue #174 register).
import { useCallback, useEffect, useRef, useState } from "react";
import { useHighlightOverlay } from "./HighlightOverlay";
import { computeAnchoredPosition, effectiveZoom } from "./anchorPosition";
// Issue #174 — the ONE "does this note carry written content?" predicate
// (empty OR whitespace-only commentary counts as no note).
import { hasNoteContent } from "../../annotations/noteText";
// Issue #118 — the named-color picker (the TagEntry anatomy applied to the
// closed color vocabulary). Failure reporting rides its own StatusRegion.
import { HighlightColorEntry } from "./HighlightColorEntry";
// Issue #98 — the ONE polite status-region primitive (the delete-failure
// line).
import { StatusRegion } from "../../ui/StatusRegion";
// The isFormField guard shared with the page-turn/M shortcuts — form-field
// keys (typing in the tag editor, etc.) must never dismiss the controls.
import { isFormField } from "../PageTurnControls";
import { deleteHighlightNearPassage, focusHighlightMark, visibleMarkForId } from "./highlightMarks";
// Issue #175 — the honest-failure copy shared with the editor dialog's
// confirm view (same action verb, same surface family — ONE constant).
import { DELETE_FAILED_COPY } from "./NotePopover";

/** Page-turn / layout-invalidating keys that dismiss the anchored controls
 *  (the anchor rect is captured once — a moved page invalidates it). The
 *  color radio group's OWN arrow navigation is excluded by the
 *  target-inside-surface guard, and form fields by isFormField. */
const DISMISS_KEYS = new Set(["ArrowLeft", "ArrowRight", "PageUp", "PageDown"]);

export function HighlightControls({
  surfaceKey,
}: {
  /** Changes when the visible page or reading mode changes (the route's
   *  surfaceKey) — a swap invalidates the captured anchor rect. */
  surfaceKey?: string | number;
}): React.ReactElement | null {
  const {
    highlights,
    controlsFor,
    setControlsFor,
    openPopoverFor,
    confirmDeleteFor,
    openTagsFor,
    setOpenPopoverFor,
    setOpenTagsFor,
    setConfirmDeleteFor,
    updateHighlightColor,
    deleteHighlight,
  } = useHighlightOverlay();

  const rootRef = useRef<HTMLDivElement | null>(null);
  // Honest-failure register for a rejected no-note delete (the controls stay
  // open with the inline line). Reset when the controls re-point or open.
  const [deleteFailed, setDeleteFailed] = useState(false);

  const activeId = controlsFor?.id ?? null;
  const resolved = activeId ? (highlights.find((h) => h.record.id === activeId) ?? null) : null;
  const noteText = resolved?.note?.text ?? "";
  // Issue #174 — deletion is proportional to the written content removed:
  // empty OR whitespace-only commentary counts as "no note" (the ONE shared
  // predicate; the stored text itself is never trimmed).
  const noteHasContent = hasNoteContent(noteText);

  // A modal editor is open — the controls hold their place behind it (all
  // dismissal paths suppressed) so closing the editor returns the reader
  // here, focused on the highlight.
  const dialogOpen = openPopoverFor !== null || confirmDeleteFor !== null || openTagsFor !== null;

  const dismiss = useCallback(() => {
    setControlsFor(null);
  }, [setControlsFor]);

  // Fresh controls never inherit a prior session's failure line.
  useEffect(() => {
    setDeleteFailed(false);
  }, [activeId]);

  // Re-anchor when a modal editor closes: the anchor rect was captured at
  // activation, and scroll/resize dismissal is SUPPRESSED behind the modal —
  // a viewport change during editing would otherwise reopen the controls at
  // a stale position. One mark re-measure on the open→closed transition (a
  // deleted highlight cleared controlsFor at the write, so the request is
  // still live here only when the mark survived). focus drops to false: the
  // activation's focus handoff already happened — re-anchoring must never
  // steal focus back from the mark the dialog just restored it to.
  const prevDialogOpenRef = useRef(false);
  useEffect(() => {
    const wasOpen = prevDialogOpenRef.current;
    prevDialogOpenRef.current = dialogOpen;
    if (wasOpen === dialogOpen || wasOpen !== true) return;
    if (controlsFor === null) return;
    const mark = visibleMarkForId(controlsFor.id);
    if (!mark) return;
    setControlsFor({ ...controlsFor, rect: mark.getBoundingClientRect(), focus: false });
  }, [dialogOpen, controlsFor, setControlsFor]);

  // Surface swap (page turn / mode change) invalidates the captured anchor
  // rect — dismiss (the route remounts the reading surface under us). The
  // prev-ref guard keeps the MOUNT pass (initial render) from dismissing the
  // very activation that mounted the surface.
  const prevSurfaceKeyRef = useRef(surfaceKey);
  useEffect(() => {
    if (prevSurfaceKeyRef.current === surfaceKey) return;
    prevSurfaceKeyRef.current = surfaceKey;
    dismiss();
  }, [surfaceKey, dismiss]);

  // Keyboard activation moves focus INTO the controls (the pointer path
  // leaves focus where the browser put it — the mark). Runs after commit so
  // the button exists; the effect deps fire once per activation request AND
  // when the resolved highlight arrives (highlights load async — the surface
  // may mount a render after the request landed).
  useEffect(() => {
    if (!controlsFor?.focus) return;
    rootRef.current?.querySelector<HTMLElement>("button")?.focus();
  }, [controlsFor, resolved]);

  // Measure the rendered size for position computation (the SelectionToolbar
  // ref+state bridge: first render at (0,0), then re-place once measured).
  const [measuredSize, setMeasuredSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    setMeasuredSize((prev) => {
      if (prev !== null && prev.width === rect.width && prev.height === rect.height) {
        return prev;
      }
      return { width: rect.width, height: rect.height };
    });
  }, [activeId, noteHasContent, deleteFailed]);

  // ── Dismissal wiring (all suppressed while a modal editor is open) ───────

  // Focusout: Tab past the last control (or any focus exit) dismisses — the
  // SelectionToolbar discipline. Intra-surface moves hold: inside the root,
  // or onto the anchor mark (the dialog-opening actions focus the mark first
  // so the dialog restores to the highlight; that gesture must not dismiss).
  //
  // relatedTarget null HOLDS, deliberately: every pointer-driven exit is
  // already covered by the pointerdown-outside listener, and keyboard +
  // programmatic focus moves carry a non-null relatedTarget in all engines.
  // A null relatedTarget is WebKit's mousedown blur quirk (pressing the
  // already-focused "Add note" button blurs to <body> with no re-focus —
  // observed killing the surface mid-click) or a focused-node unmount (a
  // deleted highlight renders null on the next pass anyway) — never a
  // dismissal-worthy exit.
  const isRendered = controlsFor !== null && resolved !== null;
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !isRendered) return;
    const handleFocusOut = (event: FocusEvent) => {
      if (dialogOpen) return;
      const next = event.relatedTarget;
      if (next === null) return; // WebKit mousedown blur / node unmount — hold
      if (next instanceof Node && root.contains(next)) return;
      if (next instanceof Element && next.getAttribute("data-highlight-id") === controlsFor?.id) {
        return; // the anchor mark — intra-surface (dialog handoff focus move)
      }
      dismiss();
    };
    root.addEventListener("focusout", handleFocusOut);
    return () => root.removeEventListener("focusout", handleFocusOut);
  }, [dialogOpen, dismiss, isRendered, controlsFor?.id]);

  // Escape (focus back to the anchor mark) + page-turn keys dismiss. The
  // isFormField guard only protects the OUTSIDE-target page-turn path —
  // inside the surface the controls own their keys (the color radios are
  // real <input>s; Escape from a focused pill must still dismiss).
  useEffect(() => {
    if (!isRendered) return;
    const onKey = (event: KeyboardEvent) => {
      if (dialogOpen) return;
      const target = event.target;
      const insideSurface = target instanceof Element && rootRef.current?.contains(target) === true;
      if (event.key === "Escape") {
        if (isFormField(target) && !insideSurface) return;
        dismiss();
        if (insideSurface && activeId) {
          focusHighlightMark(activeId);
          event.preventDefault();
        }
        return;
      }
      if (DISMISS_KEYS.has(event.key) && !insideSurface && !isFormField(target)) {
        dismiss();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialogOpen, dismiss, isRendered, activeId]);

  // Outside pointerdown dismisses (the anchor mark excluded — clicking it
  // re-points the controls through the activation handler instead).
  useEffect(() => {
    if (!isRendered) return;
    const onPointerDown = (event: PointerEvent) => {
      if (dialogOpen) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (rootRef.current?.contains(target)) return;
      if (target.getAttribute("data-highlight-id") === controlsFor?.id) return;
      dismiss();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [dialogOpen, dismiss, isRendered, controlsFor?.id]);

  // Scroll / resize invalidate the captured anchor rect.
  useEffect(() => {
    if (!isRendered) return;
    const dismissUnlessDialog = () => {
      if (dialogOpen) return;
      dismiss();
    };
    window.addEventListener("resize", dismissUnlessDialog);
    document.addEventListener("scroll", dismissUnlessDialog, true);
    return () => {
      window.removeEventListener("resize", dismissUnlessDialog);
      document.removeEventListener("scroll", dismissUnlessDialog, true);
    };
  }, [dialogOpen, dismiss, isRendered]);

  // ── Actions ──────────────────────────────────────────────────────────────

  /** Add/Edit note: focus the anchor mark (the dialog's Pitfall-1 capture
   *  restores to the highlight), then open the writing-only editor. The
   *  controls stay mounted behind the modal. */
  const handleEditNote = () => {
    if (!activeId) return;
    setDeleteFailed(false);
    focusHighlightMark(activeId);
    setOpenPopoverFor(activeId);
  };

  /** Tags: the same handoff into the compact tags editor. */
  const handleEditTags = () => {
    if (!activeId) return;
    focusHighlightMark(activeId);
    setOpenTagsFor(activeId);
  };

  /** Delete, proportional to the written content removed (issue #174): a
   *  highlight WITH a nonempty note opens the two-step confirm inside the
   *  editor dialog (Keep the default focus); NO note deletes immediately —
   *  focus stays near the passage (the captured containing block), and a
   *  rejected write leaves the controls open with the honest inline line. */
  const handleDelete = async () => {
    if (!activeId) return;
    setDeleteFailed(false);
    if (noteHasContent) {
      focusHighlightMark(activeId);
      setConfirmDeleteFor(activeId);
      return;
    }
    // The ONE shared immediate-delete routine (the issue #174 focus
    // discipline — the drawer's no-note path shares it). A rejected write
    // rolled back in memory + routed to StorageBanner: the controls STAY
    // OPEN with the inline line.
    const deleted = await deleteHighlightNearPassage(deleteHighlight, activeId);
    if (!deleted) {
      setDeleteFailed(true);
      return;
    }
    dismiss();
  };

  // Don't render without an activation, a resolvable highlight, or an anchor
  // rect (a deleted highlight's stale request simply paints nothing).
  if (controlsFor === null || resolved === null || controlsFor.rect === null) return null;

  // Position from the captured anchor rect + the measured size (or a
  // fallback estimate until measured — the SelectionToolbar bridge). The
  // effective page zoom mirrors into --effective-zoom so the CSS viewport
  // width cap divides by it (100vw reads visual px; the cap applies in the
  // zoomed local space — the 400%-zoom a11y scenario).
  const size = measuredSize ?? { width: 240, height: 96 };
  const { left, top } = computeAnchoredPosition(controlsFor.rect, size.width, size.height);

  return (
    <div
      ref={rootRef}
      className="highlight-controls"
      role="toolbar"
      aria-label="Highlight controls"
      style={
        {
          left: `${left}px`,
          top: `${top}px`,
          "--effective-zoom": effectiveZoom(),
        } as React.CSSProperties
      }
    >
      <div className="highlight-controls-actions">
        <button type="button" className="highlight-controls-button" onClick={handleEditNote}>
          {noteHasContent ? "Edit note" : "Add note"}
        </button>
        <button type="button" className="highlight-controls-button" onClick={handleEditTags}>
          Tags
        </button>
        {/* Destructive consequence beyond copy (D5-12 register, mirrors the
            popover's .highlight-popover-delete): border + hover treatment
            come from the shared destructive-hover rule. */}
        <button
          type="button"
          className="highlight-controls-button highlight-controls-delete"
          onClick={() => void handleDelete()}
        >
          Delete
        </button>
      </div>
      {/* Issue #174 — the honest-failure line for a rejected no-note delete
          (always-mounted live region; idle it renders no children). */}
      <StatusRegion>{deleteFailed && <p>{DELETE_FAILED_COPY}</p>}</StatusRegion>
      {/* Issue #118 — the named-color picker, exposed DIRECTLY in the
          controls. The key forces a fresh error-mirror when the controls
          re-point at a different highlight (the TagEntry discipline);
          saveColor routes to updateHighlightColor (the ONE highlightsStore
          seam). NO unresolved gate: the color choice never depends on the
          anchor, exactly like tags. */}
      <HighlightColorEntry
        key={resolved.record.id}
        color={resolved.record.color}
        saveColor={(next) => updateHighlightColor(resolved.record.id, next)}
      />
    </div>
  );
}
