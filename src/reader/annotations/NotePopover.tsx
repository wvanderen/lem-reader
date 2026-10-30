// One annotation session: controls, optional note, tags, and delete confirmation
// share a native modal boundary. Dismissal saves before returning to the origin.
// Keep showModal: the earlier nonmodal editor was unreachable in VoiceOver.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useHighlightOverlay } from "./HighlightOverlay";
// Plan 19-02 (D19-10) — the excerpt derivation routes through the ONE
// shared pure helper (first fragment + calm ellipsis for spans). Issue #194
// adds the Copy action's clipboard derivation (the same verification gate;
// paragraph breaks for multi-block spans).
import { firstFragmentExcerpt, passagePlainText } from "../../annotations/excerpt";
// Issue #175 — the shared mark-resolution helpers (the post-delete focus
// target walk — the ONE copy, shared with HighlightControls).
import {
  captureDeleteFocusTarget,
  captureListDeleteFocusTarget,
  visibleMarkForId,
} from "./highlightMarks";
// Issue #174 — the ONE polite status-region primitive (the honest-failure
// line for a rejected delete).
import { StatusRegion } from "../../ui/StatusRegion";
// Issue #177 — the ONE unified in-flight button register (spinner arc +
// aria-busy + disabled) for the Retry control (and Done while the awaited
// write runs).
import { BusyButton } from "../../ui/BusyButton";
// Issue #176 — the ONE placement ladder (gutter → above/below → sheet →
// center) + the viewport/column DOM-resolution helpers. The edge constant
// feeds the session's visual-viewport height cap (the dialog must fit the
// VISIBLE area, not the layout viewport behind a mobile keyboard).
import {
  chooseNoteEditorPlacement,
  currentViewportRect,
  NOTE_EDITOR_EDGE_GUTTER,
  visibleReadingColumnRect,
  visibleHighlightRect,
  type NoteEditorPlacement,
} from "./notePlacement";
// Issue #176 — the shared zoom-compensation factor (the §25 register; the
// inline left/top/width are divided by it for the zoomed local space).
import { hasNoteContent } from "../../annotations/noteText";
import { HighlightColorEntry } from "./HighlightColorEntry";
// Issue #195 — the "Apply slot" section (color + additive tags in one
// labeled control per settings slot).
import { HighlightSlotEntry } from "./HighlightSlotEntry";
import { TagEntry } from "../TagEntry";
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
  const viewport = currentViewportRect();
  // Apply the current cap before measuring: both keyboard shrink and expansion
  // must use the resulting box, rather than the previous session's height.
  dlg.style.maxHeight = `${Math.max(viewport.height - 2 * NOTE_EDITOR_EDGE_GUTTER, 0) / effectiveZoom()}px`;
  const box = dlg.getBoundingClientRect();
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

/** Issue #177 — the honest-failure copy for a rejected note save (the
 *  ReviewNoteDialog register: the editor stays open, the draft stays
 *  editable, Retry re-attempts). The review panel's twin constant carries
 *  the same sentence — two surface families, one shape. */
export const NOTE_SAVE_FAILED_COPY = "Couldn't save the note. Try again.";

/** Issue #178 — the recovered-draft marker copy. Rendered (visible +
 *  politely announced through the persistent StatusRegion) when a persisted
 *  recovery draft is applied to a fresh editor session; cleared when the
 *  recovered text lands ("Saved.") — it marks UNLANDED recovered writing. */
export const NOTE_RECOVERED_DRAFT_COPY = "Recovered draft";

/** Issue #194 — the Copy action's registers. Success confirms in one word
 *  (the "Saved." register); failure names the operation's outcome honestly
 *  WITH the next step (native selection + copy stays available — passage
 *  metadata is never claimed copied when the clipboard failed). */
export const COPY_OK_COPY = "Copied.";
export const COPY_FAILED_COPY = "Couldn't copy. Select the highlighted text and copy it manually.";

export function NotePopover(): React.ReactElement | null {
  const {
    article,
    highlights,
    openPopoverFor,
    setOpenPopoverFor,
    confirmDeleteFor,
    setConfirmDeleteFor,
    setControlsFor,
    controlsFor,
    updateHighlightColor,
    updateHighlightTags,
    // Issue #195 — the ONE slot-application seam (color + additive tags).
    applyHighlightSlot,
    updateNote,
    flushNoteSave,
    ensureNoteSaved,
    restoreNoteDraft,
    noteSavePhase,
    resetNoteSaveState,
    deleteHighlight,
    // Issue #195 — the five numbered slots ride the overlay context (the
    // host feeds its settings record in; no settings dependency here).
    highlightSlots,
    // Issue #196 — the active-theme base pair for the custom-color tints
    // (swatch + picker pill; same derivation as every other paint site).
    bases,
  } = useHighlightOverlay();

  const [panelFor, setPanelFor] = useState<string | null>(null);
  const [noteExpanded, setNoteExpanded] = useState(false);
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const [session, setSession] = useState(0);
  const popoverRef = useRef<HTMLDialogElement | null>(null);
  // Latest-ref mirror of the resolved highlights so the restore's async
  // resolution (issue #178) reads the reader's CURRENT text for the
  // newest-writing guard, not the render-captured snapshot.
  const highlightsRef = useRef(highlights);
  highlightsRef.current = highlights;
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
  const listOriginRef = useRef<{ id: string; actionIndex: number } | null>(null);
  const [confirmHeight, setConfirmHeight] = useState<number | null>(null);
  const focusRestoreRef = useRef<HTMLElement | null>(null);

  // Issue #175 — the honest-failure register for a rejected delete: the
  // dialog stays open with the calm inline line. Reset on every fresh open.
  const [deleteFailed, setDeleteFailed] = useState(false);

  // Issue #194 — the Copy action's register ("idle" | "copied" | "failed").
  // A rejected clipboard write keeps the editor open with the honest line +
  // next step; a landed write confirms "Copied." Reset on every fresh open.
  const [copyStatus, setCopyStatus] = useState<{
    phase: "idle" | "copied" | "failed";
    attempt: number;
  }>({ phase: "idle", attempt: 0 });
  // Each attempt and fresh session invalidates older clipboard completions.
  const copyAttemptRef = useRef(0);

  // Issue #177 — the guarded-dismissal register. `working` carries the
  // unified busy register (Retry + Done) while the awaited write runs;
  // workingRef is the synchronous latch that makes rapid repeated actions
  // (double-Done, Escape spam, Retry spam) single-shot. dismissalPendingRef
  // remembers that a dismissal was interrupted by a failed write so a
  // successful Retry COMPLETES it; the textarea onChange clears it (a new
  // edit after the failed dismissal is a decision to stay).
  const [working, setWorking] = useState(false);
  const workingRef = useRef(false);
  const dismissalPendingRef = useRef(false);
  // The highlight id THIS editor session belongs to, captured at open.
  // Retry and the dismissal flush only ever address this id — the
  // ensureNoteSaved guard makes a cross-highlight write impossible even if
  // the surrounding state churned.
  const sessionIdRef = useRef<string | null>(null);

  // Issue #178 — the recovered-draft register: true while THIS session is
  // editing text restored from the persisted recovery draft (the visible +
  // announced "Recovered draft" marker). Reset per open; cleared when the
  // recovered text lands (the register's "saved" phase) — the marker means
  // UNLANDED recovered writing.
  const [recoveredDraft, setRecoveredDraft] = useState(false);

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
  const panelBottomRef = useRef<number | null>(null);
  const placementSessionRef = useRef(-1);
  const initialFocusRef = useRef<"note" | "controls" | "confirm">("controls");

  // Existing entry points feed one session. Expanded sections never create
  // a second dialog or an extra dismissal layer.
  const activeId = openPopoverFor ?? confirmDeleteFor ?? controlsFor?.id ?? panelFor;
  const isConfirm = confirmDeleteFor !== null;

  // Find the resolved highlight for the open dialog.
  const resolved = activeId ? (highlights.find((h) => h.record.id === activeId) ?? null) : null;

  const noteText = resolved?.note?.text ?? "";
  const noteVisible = noteExpanded || openPopoverFor !== null || hasNoteContent(noteText);
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
    if (activeId && resolved && !dlg.open) {
      // Capture the trigger (the anchor <mark> or the drawer action) BEFORE
      // showModal moves focus into the dialog (Pitfall 1).
      triggerRef.current = document.activeElement as HTMLElement | null;
      const originItem = triggerRef.current?.closest<HTMLElement>(".drawer-item");
      listOriginRef.current = originItem
        ? {
            id: activeId,
            actionIndex: Array.from(originItem.querySelectorAll("button")).indexOf(
              triggerRef.current as HTMLButtonElement,
            ),
          }
        : null;
      // Drawer actions restore their own trigger; reading editors return to
      // the surviving highlight, including selection-created notes.
      readingHighlightRef.current = triggerRef.current?.closest(".annotations-drawer")
        ? null
        : activeId;
      setPanelFor(activeId);
      setNoteExpanded(openPopoverFor !== null || hasNoteContent(noteText));
      setSession((value) => value + 1);
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
      const markRect = visibleHighlightRect(activeId);
      anchorRectRef.current = markRect;
      const chosen = placeEditor(dlg, markRect);
      setPlacement(chosen.placement.mode === "center" ? null : chosen.placement);
      setViewportHeight(chosen.viewportHeight);
      panelBottomRef.current = chosen.placement.top + dlg.getBoundingClientRect().height;
      // Reset per open (fresh session). A prior session's delete-failure
      // line never leaks either. Issue #177: the session's highlight id is
      // captured here (Retry + the dismissal flush only ever address THIS
      // id) and the save-state register resets to idle (a prior session's
      // saved/error phase never leaks into the fresh editor).
      setDeleteFailed(false);
      setCopyStatus({ phase: "idle", attempt: ++copyAttemptRef.current });
      sessionIdRef.current = activeId;
      dismissalPendingRef.current = false;
      setRecoveredDraft(false);
      resetNoteSaveState();
      initialFocusRef.current = isConfirm ? "confirm" : openPopoverFor ? "note" : "controls";
    } else if (!activeId && dlg.open) {
      copyAttemptRef.current++;
      // State-driven close (guarded dismissal / Keep / delete-confirm).
      // dlg.close() fires the `close` event → the listener below flushes the
      // note save (safety net) + restores focus.
      dlg.close();
    }
  }, [activeId, isConfirm, resetNoteSaveState, resolved, openPopoverFor, noteText]);

  // Wait for the session's expanded state to commit before focusing: opening
  // an empty highlight after a note must target Add note (the compact bar's
  // first action), not a mid-session structure.
  useLayoutEffect(() => {
    if (session === 0 || initialFocusRef.current === "confirm") return;
    const dlg = popoverRef.current;
    if (!dlg?.open) return;
    if (initialFocusRef.current === "note") {
      const textarea = dlg.querySelector<HTMLTextAreaElement>("textarea");
      textarea?.focus();
      textarea?.select();
    } else dlg.querySelector<HTMLElement>(".highlight-controls-actions button")?.focus();
  }, [session]);

  // Issue #178 — restore an interrupted save's recovery draft for THIS
  // session's highlight. Runs after the open layout effect (sessionIdRef is
  // captured); resolves are session-guarded + cancelled-flag guarded so a
  // slow load can never apply a draft to a closed or swapped session. The
  // resolved draft rides the NORMAL updateNote path — the restored text
  // becomes the pending edit (Done / Retry / the debounce save it), and the
  // "Recovered draft" marker stays until the recovered text lands.
  //
  // A keystroke that lands during the restore's await is NEWER writing —
  // its write-through already refreshed the draft row — so the (now older)
  // resolution is skipped entirely instead of displacing it.
  useEffect(() => {
    if (!activeId || sessionIdRef.current !== activeId) return;
    const id = activeId;
    const noteTextAtOpen = highlightsRef.current.find((h) => h.record.id === id)?.note?.text ?? "";
    let cancelled = false;
    void restoreNoteDraft(id).then((draft) => {
      if (cancelled || !draft) return;
      // Session guard: only the editor session that requested the draft
      // consumes it (the ensureNoteSaved/updateNote guards keep the write
      // on THIS highlight even if the surrounding state churned).
      if (sessionIdRef.current !== id) return;
      // Newer-writing guard: the reader typed during the await.
      const noteTextNow = highlightsRef.current.find((h) => h.record.id === id)?.note?.text ?? "";
      if (noteTextNow !== noteTextAtOpen) return;
      setRecoveredDraft(true);
      setNoteExpanded(true);
      updateNote(id, draft.text);
    });
    return () => {
      cancelled = true;
    };
  }, [activeId, session, restoreNoteDraft, updateNote]);

  // Issue #178 — the "Recovered draft" marker means UNLANDED recovered
  // writing: once the recovered text lands ("Saved."), it is no longer a
  // recovery — the marker clears (an older failure's marker never lingers
  // over landed text).
  useEffect(() => {
    if (noteSavePhase === "saved") setRecoveredDraft(false);
  }, [noteSavePhase]);

  // Issue #176 — reposition on viewport change (the AC ladder: stable while
  // typing — typing fires no events here). Window resize covers desktop
  // viewports + the 400%-zoom scenario; visualViewport resize/scroll covers
  // the mobile keyboard shrinking (or panning) the visible area. A fresh
  // mark measure keeps the anchored placements truthful after a resize-
  // driven repagination; a transiently unresolvable mark (mid-repagination)
  // falls back to the session's captured anchor rect instead of jumping to
  // center. Identical results never re-render (the position is stable).
  //
  // Issue #207 — the dialog's OWN box is a reposition source too: the
  // always-visible organization area changes height mid-session (a tag chip
  // row appears, a slot status line lands, the note grows toward its cap)
  // without touching any React dep. The ResizeObserver routes those box
  // changes through the SAME ladder with the session's bottom-edge retention
  // applied — content growth pushes the panel UP (a sheet re-pins to the
  // viewport bottom instead of overflowing it). Viewport-driven repositions
  // run the fresh ladder instead (the viewport genuinely moved).
  // Issue #176/#207 — the ONE bottom-edge retention (the review-reviewer's
  // single home for the #176 contract): a same-session structural change
  // (note expansion, organization growth) keeps the panel's established
  // bottom edge when the placement mode is unchanged — growth pushes the
  // panel UP — floored at the viewport top (bounds take precedence). A
  // fresh session or a mode flip returns `next` untouched (the ladder's
  // fresh placement stands). The stable-listener closure reads fresh values
  // through the mirrors.
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const placementModeRef = useRef<NoteEditorPlacement["mode"] | null>(null);
  placementModeRef.current = placement?.mode ?? null;
  const retainBottomEdge = useCallback(
    (dlg: HTMLDialogElement, next: NoteEditorPlacement): NoteEditorPlacement => {
      if (
        placementSessionRef.current !== sessionRef.current ||
        panelBottomRef.current === null ||
        next.mode === "center" ||
        next.mode !== placementModeRef.current
      ) {
        return next;
      }
      const vp = currentViewportRect();
      const height = dlg.getBoundingClientRect().height;
      const minTop =
        next.mode === "below" && anchorRectRef.current
          ? Math.max(
              vp.top + NOTE_EDITOR_EDGE_GUTTER,
              anchorRectRef.current.bottom + NOTE_EDITOR_EDGE_GUTTER,
            )
          : vp.top + NOTE_EDITOR_EDGE_GUTTER;
      return {
        ...next,
        top: Math.max(
          minTop,
          Math.min(
            panelBottomRef.current - height,
            vp.top + vp.height - height - NOTE_EDITOR_EDGE_GUTTER,
          ),
        ),
      };
    },
    [],
  );
  useEffect(() => {
    if (!activeId) return;
    const reposition = (retainBottom = false) => {
      const dlg = popoverRef.current;
      if (!dlg || !dlg.open) return;
      const markRect = visibleHighlightRect(activeId);
      if (markRect) anchorRectRef.current = markRect;
      const chosen = placeEditor(dlg, anchorRectRef.current);
      const next = retainBottom ? retainBottomEdge(dlg, chosen.placement) : chosen.placement;
      setViewportHeight(chosen.viewportHeight);
      panelBottomRef.current = next.top + dlg.getBoundingClientRect().height;
      setPlacement((prev) => {
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
    const onViewportChange = () => reposition(false);
    window.addEventListener("resize", onViewportChange);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", onViewportChange);
    vv?.addEventListener("scroll", onViewportChange);
    const panel = popoverRef.current;
    const boxObserver = panel ? new ResizeObserver(() => reposition(true)) : null;
    if (panel && boxObserver) boxObserver.observe(panel);
    return () => {
      window.removeEventListener("resize", onViewportChange);
      vv?.removeEventListener("resize", onViewportChange);
      vv?.removeEventListener("scroll", onViewportChange);
      boxObserver?.disconnect();
    };
    // The stable-listener closure reads fresh values through the mirrors.
  }, [activeId, retainBottomEdge]);

  const placementMode = placement?.mode;
  useLayoutEffect(() => {
    const dlg = popoverRef.current;
    if (!activeId || !dlg?.open || isConfirm) return;
    const chosen = placeEditor(dlg, anchorRectRef.current);
    // Structural expansion grows above the control bar. Preserve passage
    // visibility and viewport bounds when there is insufficient headroom.
    // A fresh session must measure after its status resets commit. A stale
    // Saved./Copied. line can wrap the footer and change the opening height.
    // Only structural changes within the same session retain the panel's
    // bottom edge (retainBottomEdge — the ONE home for that contract, shared
    // with the reposition listeners; a mode flip or a fresh session keeps
    // the ladder's fresh placement).
    const next = retainBottomEdge(dlg, chosen.placement);
    placementSessionRef.current = session;
    panelBottomRef.current = next.top + dlg.getBoundingClientRect().height;
    setPlacement(next.mode === "center" ? null : next);
    setViewportHeight(chosen.viewportHeight);
  }, [
    activeId,
    session,
    noteExpanded,
    isConfirm,
    placementMode,
    placement?.width,
    retainBottomEdge,
  ]);

  /** Close the dialog (the guarded dismissal's success path, Keep, and the
   *  post-delete close route through here). The actual hide + focus-restore
   *  happens in the `close` event listener below. Stable identity so the
   *  guarded-dismissal callbacks can depend on it. */
  const handleClose = useCallback((): void => {
    setPanelFor(null);
    setOpenPopoverFor(null);
    setConfirmDeleteFor(null);
    setControlsFor(null);
  }, [setOpenPopoverFor, setConfirmDeleteFor, setControlsFor]);

  /**
   * Issue #177 — the ONE guarded dismissal seam. Every close path for the
   * note (Done, Escape, outside click, Cmd/Ctrl+Enter) routes through here:
   * flush the pending write via ensureNoteSaved and close ONLY on success.
   *
   *   - A failed write keeps the editor + draft on screen with the
   *     honest-failure line + Retry (the register renders them) and moves
   *     focus to Retry — the reader asked to leave and was refused.
   *   - Escape/outside-click also save and close from confirmation;
   *     only the explicit Delete action removes the highlight.
   *   - The workingRef latch makes rapid repeated actions single-shot: a
   *     double-Done or Escape spam during the awaited write is one write,
   *     one close.
   */
  /**
   * Issue #177 — the shared latch + await shape behind requestDismiss and
   * handleRetry: the workingRef latch (rapid repeated actions are
   * single-shot), the awaited flush for THIS session's highlight, and the
   * busy-register release. Returns the write outcome.
   */
  const guardedSave = useCallback(async (): Promise<boolean> => {
    if (workingRef.current || sessionIdRef.current === null) return false;
    workingRef.current = true;
    setWorking(true);
    try {
      return await ensureNoteSaved(sessionIdRef.current);
    } finally {
      workingRef.current = false;
      setWorking(false);
    }
  }, [ensureNoteSaved]);

  const requestDismiss = useCallback(async (): Promise<void> => {
    if (workingRef.current) return;
    if (sessionIdRef.current === null) {
      handleClose();
      return;
    }
    const ok = await guardedSave();
    if (ok) {
      dismissalPendingRef.current = false;
      handleClose();
    } else {
      dismissalPendingRef.current = true;
      // Focus moves to Retry — AFTER the register's re-render mounts it (the
      // requestDismiss resumption runs before React flushes the "error"
      // phase, so the querySelector-focus below would miss).
      focusRetryOnRenderRef.current = true;
    }
  }, [guardedSave, handleClose]);

  // Issue #177 — move focus to the Retry control once the failed write's
  // re-render has mounted it (the reader asked to leave and was refused —
  // the next action is theirs). Consumed once per failure.
  const focusRetryOnRenderRef = useRef(false);
  useEffect(() => {
    if (noteSavePhase !== "error" || !focusRetryOnRenderRef.current) return;
    focusRetryOnRenderRef.current = false;
    popoverRef.current?.querySelector<HTMLButtonElement>(".highlight-popover-retry")?.focus();
  }, [noteSavePhase]);

  /**
   * Issue #177 — Retry: re-attempt the save for THIS session's highlight
   * (the sessionIdRef capture + the ensureNoteSaved guard mean the draft can
   * only ever be written to the highlight the editor opened for — never a
   * different one). Success completes an interrupted dismissal (the reader
   * asked to leave; the write landed; the dismissal finishes); a
   * mid-typing failure's retry keeps the editor open (they are still
   * writing — the error line clears via the register's "saved" phase).
   */
  const handleRetry = useCallback(async (): Promise<void> => {
    if (workingRef.current) return;
    const ok = await guardedSave();
    if (ok && dismissalPendingRef.current) {
      dismissalPendingRef.current = false;
      handleClose();
    }
  }, [guardedSave, handleClose]);

  // Latest-ref indirection for the NATIVE dialog listeners below (the
  // route's standard pattern): the `cancel` handler reads the freshest
  // requestDismiss without re-binding on every render.
  const requestDismissRef = useRef(requestDismiss);
  requestDismissRef.current = requestDismiss;

  // Register the `close` + `cancel` event listeners (with cleanup). Native
  // <dialog> fires `close` on EVERY close path: the guarded dismissal's
  // success (the state-driven dlg.close()), and delete-confirm. On close:
  // flush the debounced note save (D2-03 safety net — after issue #177 the
  // guarded dismissal has already awaited the write, so this is a no-op on
  // the happy path), clear BOTH editor states (whichever was open), and
  // restore focus — to the captured passage block when the close followed a
  // successful delete (issue #174: the <mark> is gone, so the trigger
  // restore would silently no-op), else to the surviving reading highlight
  // (including creation paths), or the captured drawer trigger (Pitfall 1 /
  // A11Y-02 — showModal does NOT auto-restore). The dialog has left the top
  // layer by close-event time, so focusing the in-flow block is
  // unobstructed. All annotation coordination states clear together;
  // returning focus never recreates the controls or another dismissal layer.
  //
  // `cancel` (issue #177): the browser fires it for Escape BEFORE closing.
  // preventDefault + the guarded dismissal — the browser-default close must
  // never outrun the awaited save, or a failed write would close the editor
  // and strand the draft.
  useEffect(() => {
    const dlg = popoverRef.current;
    if (!dlg) return;
    const handleCloseEvent = () => {
      copyAttemptRef.current++;
      flushNoteSave();
      setPanelFor(null);
      setOpenPopoverFor(null);
      setConfirmDeleteFor(null);
      const mark = readingHighlightRef.current
        ? visibleMarkForId(readingHighlightRef.current)
        : null;
      const origin = listOriginRef.current;
      const originItem = origin
        ? Array.from(document.querySelectorAll<HTMLElement>(".drawer-item")).find(
            (item) => item.dataset.highlightId === origin.id,
          )
        : null;
      const listTrigger =
        originItem?.querySelectorAll<HTMLElement>("button")[origin?.actionIndex ?? 0];
      const restoreTo = focusRestoreRef.current ?? listTrigger ?? mark ?? triggerRef.current;
      setControlsFor(null);
      listOriginRef.current = null;
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
    const handleCancelEvent = (event: Event) => {
      event.preventDefault();
      void requestDismissRef.current();
    };
    dlg.addEventListener("close", handleCloseEvent);
    dlg.addEventListener("cancel", handleCancelEvent);
    return () => {
      dlg.removeEventListener("close", handleCloseEvent);
      dlg.removeEventListener("cancel", handleCancelEvent);
    };
  }, [flushNoteSave, setOpenPopoverFor, setConfirmDeleteFor, setControlsFor]);

  /**
   * Issue #177 — outside click (the ::backdrop) dismisses like Escape. The
   * click must land on the dialog ELEMENT with coordinates OUTSIDE the
   * dialog's own box: the ::backdrop is the element's pseudo-element, so
   * backdrop clicks target the dialog itself — but so do clicks on the
   * card's own padding, which must NOT dismiss. The modal makes the article
   * inert behind the dialog, so the dismissing gesture is swallowed (the
   * article beneath never activates; a subsequent interaction operates the
   * article).
   */
  const handleBackdropClick = (event: React.MouseEvent<HTMLDialogElement>) => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const insideCard =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    if (insideCard) return;
    void requestDismissRef.current();
  };

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

  /** Run the delete from the confirm view: capture the passage block, run
   *  the write, route the honest failure / successful close. */
  const performDelete = async () => {
    if (!activeId || workingRef.current) return;
    // Capture the passage block BEFORE the optimistic removal unmounts the
    // <mark> (after the await, the mark is gone from the DOM).
    const focusTarget =
      captureListDeleteFocusTarget(triggerRef.current) ?? captureDeleteFocusTarget(activeId);
    try {
      workingRef.current = true;
      setWorking(true);
      // Drain pending/in-flight note writes before the cascade delete so a
      // late debounce cannot recreate a note after its highlight is gone.
      if (!(await ensureNoteSaved(activeId))) {
        focusRetryOnRenderRef.current = true;
        return;
      }
      await deleteHighlight(activeId);
    } catch {
      // Honest failure (issue #98 register): deleteHighlight rolled the
      // in-memory removal back (mark + note stay) and routed the error to
      // StorageBanner. The dialog STAYS OPEN with the inline line so the
      // reader can retry or close — never a close that implies success.
      setDeleteFailed(true);
      return;
    } finally {
      workingRef.current = false;
      setWorking(false);
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

  /** Issue #194 — copy ONLY the highlighted passage as plain text (the
   *  verified paragraph-break derivation; notes, tags, title, and URL are
   *  structurally absent — the derivation's only input is the stored quote).
   *  The clipboard write is awaited and honest: a failure (API missing,
   *  permission denied, engine rejection) shows the failure line with the
   *  next step — never a success claim. The dialog stays open either way;
   *  focus remains where the reader left it (the Copy button). */
  const handleCopy = async (): Promise<void> => {
    if (!resolved) return;
    const text = passagePlainText(resolved.record.quote.exact, article, resolved.resolvedPosition);
    const attempt = ++copyAttemptRef.current;
    setCopyStatus({ phase: "idle", attempt });
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      if (copyAttemptRef.current === attempt && popoverRef.current?.open) {
        setCopyStatus({ phase: "copied", attempt });
      }
    } catch {
      if (copyAttemptRef.current === attempt && popoverRef.current?.open) {
        setCopyStatus({ phase: "failed", attempt });
      }
    }
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
  const availableHeight =
    viewportHeight === null
      ? null
      : Math.min(
          viewportHeight - 2 * NOTE_EDITOR_EDGE_GUTTER,
          placement
            ? currentViewportRect().top + viewportHeight - placement.top - NOTE_EDITOR_EDGE_GUTTER
            : Infinity,
        );
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
          ...(isConfirm && confirmHeight !== null ? { height: `${confirmHeight}px` } : {}),
          maxHeight: `${availableHeight! / zoom}px`,
          "--effective-zoom": zoom,
        } as React.CSSProperties)
      : undefined;
  return (
    <dialog
      ref={popoverRef}
      id="highlight-popover"
      className="highlight-popover annotation-panel"
      aria-label={isConfirm ? "Delete highlight" : "Highlight"}
      aria-describedby={excerpt.length > 0 ? "highlight-popover-excerpt" : undefined}
      data-placement={anchored ? placement.mode : undefined}
      style={placementStyle}
      onClick={handleBackdropClick}
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
            <StatusRegion>
              {deleteFailed && <p>{DELETE_FAILED_COPY}</p>}
              {noteSavePhase === "error" && <p>{NOTE_SAVE_FAILED_COPY}</p>}
            </StatusRegion>
            <div className="dialog-actions highlight-popover-actions">
              {noteSavePhase === "error" && (
                <BusyButton
                  className="btn btn-quiet highlight-popover-retry"
                  busy={working}
                  onClick={() => void handleRetry()}
                >
                  Retry
                </BusyButton>
              )}
              <button
                type="button"
                className="btn btn-destructive highlight-popover-destructive"
                onClick={() => void performDelete()}
                disabled={working}
              >
                Delete
              </button>
              {/* Non-destructive default focus (Pitfall 8 — mirrors WipeConfirm).
                  An accidental Enter keeps the highlight. Keep restores the
                  intact editing view, or returns to a direct list trigger. */}
              <button
                type="button"
                className="btn btn-quiet highlight-popover-cancel"
                disabled={working}
                onClick={() => {
                  if (!controlsFor && !openPopoverFor) {
                    void requestDismissRef.current();
                    return;
                  }
                  setConfirmDeleteFor(null);
                  requestAnimationFrame(() => deleteButtonRef.current?.focus());
                }}
                data-initial-focus
              >
                Keep
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* The SR-only passage context block
                (the dialog's accessible description, aria-describedby above)
                keeps VoiceOver announcing the highlighted text when the
                editor opens (ACPT-02 finding #5), while nothing repeats the
                quotation visually. The visually-hidden "Highlighted text:"
                prefix lives INSIDE the <p> so the description is a single,
                unambiguous string. */}
            {excerpt.length > 0 && (
              <p
                className="highlight-popover-excerpt visually-hidden"
                id="highlight-popover-excerpt"
              >
                <span className="visually-hidden">Highlighted text:</span> {excerpt}
              </p>
            )}
            <div className="highlight-popover-note" hidden={!noteVisible}>
              {/* Issue #178 — the recovered-draft marker: visible (calm
                  quiet-line styling, the popover's saved-line register) and
                  announced through the existing persistent status region so a
                  screen reader hears that this session edits restored
                  writing. Cleared when the recovered text lands. */}
              {recoveredDraft && (
                <p className="highlight-popover-recovered">{NOTE_RECOVERED_DRAFT_COPY}</p>
              )}
              <label className="visually-hidden" htmlFor="highlight-popover-textarea">
                Note
              </label>
              <textarea
                id="highlight-popover-textarea"
                className="highlight-popover-textarea"
                value={noteText}
                placeholder="Add a note (optional)"
                onChange={(e) => {
                  if (activeId) {
                    // A new edit after a failed dismissal is a decision to
                    // stay — Retry no longer completes the interrupted close.
                    dismissalPendingRef.current = false;
                    updateNote(activeId, e.currentTarget.value);
                  }
                }}
                onKeyDown={(e) => {
                  // Cmd/Ctrl+Enter saves and closes (the guarded Done path:
                  // the awaited flush must land before the close — no edit
                  // lost, no close that implies a save that failed). Plain
                  // Enter/Shift+Enter keep native textarea behavior.
                  // The isComposing guard keeps the shortcut from firing when
                  // Enter CONFIRMS an IME composition (the confirming keyDown
                  // reports isComposing=true — save-and-close mid-composition
                  // would discard the in-flight text).
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void requestDismissRef.current();
                  }
                }}
                rows={3}
                // Keep native showModal from opening the mobile keyboard on
                // ordinary mark activation. Explicit note entry still focuses
                // writing immediately; the field joins tab order after open.
                inert={openPopoverFor === null && panelFor !== activeId}
                disabled={isUnresolved}
              />
            </div>
            {/* Issue #207 — the organization area is ALWAYS VISIBLE: the
                annotation-tag field + "Apply slot" replace the expansion
                interaction. The wrapper is a flex-wrap bottom area: on wide
                panels the fields share a row when there is room; on narrow
                screens they wrap/stack without ever compressing the editor
                or the action row (each field keeps a flex floor and wraps
                internally). Reuses the ONE TagEntry seam (normalization,
                suggestions, commit-per-change writes); Escape is layered:
                suggestions → uncommitted draft text → the dialog's guarded
                dismissal. */}
            <div className="annotation-panel-organization">
              <section id="annotation-tags" aria-label="Highlight tags">
                <TagEntry
                  key={`${activeId}-${session}`}
                  recordId={resolved.record.id}
                  tags={resolved.record.tags ?? []}
                  saveTags={(next) => updateHighlightTags(resolved.record.id, next)}
                  inputId="highlight-tags-input"
                  dismissSuggestionsOnEscape
                  clearDraftOnEscape
                />
              </section>
              {/* Issue #195 — "Apply slot": the quick path for an existing
                  highlight — the slot's color + its tags JOIN the existing
                  ones (never replace). It lives in the organization area
                  beside the tag editor (the organization tools), always
                  visible now that the tools no longer collapse (issue #207);
                  direct color editing stays in the always-visible picker
                  (color only). The ONE applyHighlightSlot seam owns the
                  write order + rollback; each application retires the
                  creation-Undo offer. */}
              <HighlightSlotEntry
                slots={highlightSlots}
                bases={bases}
                onApply={(slot) => applyHighlightSlot(resolved.record.id, slot)}
              />
            </div>
            <HighlightColorEntry
              key={`${activeId}-${session}`}
              color={resolved.record.color}
              customColor={resolved.record.customColor}
              bases={bases}
              saveColor={(next) => updateHighlightColor(resolved.record.id, next)}
            />
            <StatusRegion>{deleteFailed && <p>{DELETE_FAILED_COPY}</p>}</StatusRegion>
            <div
              className="highlight-controls-actions annotation-panel-footer"
              role="group"
              aria-label="Highlight controls"
            >
              {!noteVisible && (
                <button
                  type="button"
                  className="highlight-controls-button"
                  onClick={() => {
                    setNoteExpanded(true);
                    requestAnimationFrame(() =>
                      popoverRef.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus(),
                    );
                  }}
                >
                  Add note
                </button>
              )}
              {/* Issue #207 — the Tags toggle is GONE: the tag field lives in
                  the always-visible organization area above this row, so
                  there is no expansion state to reflect and no focus to
                  return to a trigger — the dialog's close listener restores
                  the opening control/passage exactly as before. */}
              {/* Issue #194 — Copy sits with the passage actions (non-
                  destructive, before Delete), keyboard-reachable in the same
                  modal tab path, and requires no note editing. */}
              <button
                type="button"
                className="highlight-controls-button"
                onClick={() => void handleCopy()}
              >
                Copy
              </button>
              <button
                ref={deleteButtonRef}
                type="button"
                disabled={working}
                className="highlight-controls-button highlight-controls-delete"
                onClick={() => {
                  setDeleteFailed(false);
                  if (hasNoteContent(noteText)) {
                    setConfirmHeight(
                      (popoverRef.current?.getBoundingClientRect().height ?? 240) / effectiveZoom(),
                    );
                    setConfirmDeleteFor(activeId);
                  } else void performDelete();
                }}
              >
                Delete
              </button>
              {/* Success belongs to the modal's live region: the article-level
                announcement is inert while showModal keeps the editor open. */}
              <StatusRegion>
                {recoveredDraft && (
                  <span className="visually-hidden">{NOTE_RECOVERED_DRAFT_COPY}</span>
                )}
                {noteSavePhase === "error" && <p>{NOTE_SAVE_FAILED_COPY}</p>}
                {noteSavePhase === "saved" && <p className="highlight-popover-saved">Saved.</p>}
                {copyStatus.phase === "copied" && (
                  <p key={copyStatus.attempt} className="highlight-popover-saved">
                    {COPY_OK_COPY}
                  </p>
                )}
                {copyStatus.phase === "failed" && (
                  <p key={copyStatus.attempt}>{COPY_FAILED_COPY}</p>
                )}
              </StatusRegion>
              {noteSavePhase === "error" && (
                <BusyButton
                  className="highlight-controls-button highlight-popover-retry"
                  busy={working}
                  onClick={() => void handleRetry()}
                >
                  Retry
                </BusyButton>
              )}
              <BusyButton
                className="highlight-controls-button highlight-popover-done"
                busy={working}
                onClick={() => void requestDismissRef.current()}
              >
                Done
              </BusyButton>
            </div>
          </>
        ))}
    </dialog>
  );
}
