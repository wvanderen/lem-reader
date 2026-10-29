// src/reader/annotations/useSelectionToolbar.ts
// Issue #9 — the text-selection lifecycle extracted from the article route.
//
// Owns, behind ONE interface:
//   - selectionchange tracking (rAF-coalesced) → toolbar position + capture
//     result (UI-SPEC §Interaction 24),
//   - the Gecko/WebKit focus-containment hold + saved-range restore
//     (Plan 13-11 G6 — .planning/debug/flowc-selection-toolbar-nvda.md),
//   - the keyboard routing matrix (Enter/Space on <mark>, Tab routing onto
//     the toolbar, Tab-past dismissal, H/N shortcuts),
//   - focus-exit dismissal.
//
// The route renders <SelectionToolbar> purely from the returned state and
// handlers; every lifecycle invariant is testable at hook level (jsdom
// component tests) without mounting the whole reader. Layout truth stays in
// the Playwright annotation specs (jsdom is not authoritative for layout).
import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject, RefObject } from "react";
import type { CanonicalArticle } from "../../content/types";
import type { HighlightSlot } from "../../content/schema";
import { defaultHighlightSlots } from "../../content/schema";
// Issue #195 — the ONE slot→creation-preset vocabulary (normalizeTags-backed).
import { defaultSlotPreset, slotPreset } from "../../annotations/highlightSlots";
import type { HighlightSlotPreset } from "../../annotations/highlightSlots";
import { isFormField } from "../PageTurnControls";
import type {
  CreateFromSelectionResult,
  HighlightOverlayValue,
  ToolbarCaptureResult,
} from "./HighlightOverlay";

/** The shipped-slot fallback for callers without settings (the unit harness;
 * any caller that omits the args keeps the pre-#195 behavior byte-for-byte). */
const FALLBACK_SLOTS = defaultHighlightSlots();

export interface UseSelectionToolbarArgs {
  /**
   * The loaded article. Null while loading — the lifecycle no-ops (rules of
   * hooks: every listener registration is gated inside the effects) and a
   * swap clears the toolbar state (never carry a rect/capture/saved Range
   * across articles).
   */
  article: CanonicalArticle | null;
  /** Changes when the visible page or reading mode changes. */
  surfaceKey?: string | number;
  /**
   * The reading surface (<article> element) ref. Selection containment,
   * the measurement-body guard, and the H/N capture root all read it at
   * event/effect time.
   */
  readingRootRef: RefObject<HTMLElement | null>;
  /**
   * The article element as STATE (the route's callback-ref bridge). Effects
   * re-run when the element mounts; a bare ref would not re-trigger them.
   */
  articleEl: HTMLElement | null;
  /**
   * The HighlightOverlayProvider apiRef bridge (populated synchronously
   * during the provider's render). The hook reads captureCurrentSelection /
   * createHighlightFromSelection / setOpenPopoverFor through it.
   */
  highlightApiRef: MutableRefObject<HighlightOverlayValue | null>;
  /**
   * Issue #195 — the settings' five highlight slots. Defaults to the shipped
   * set so the hook's unit harness (and any caller without settings) keeps
   * the pre-slot behavior byte-for-byte.
   */
  highlightSlots?: HighlightSlot[];
  /**
   * Issue #195 — the settings' explicit default-slot index (0..4). Ordinary
   * creation routes (Highlight button, H/N, the completed pointer gesture
   * showing slots) read it per creation; defaults to 0 (slot 1).
   */
  defaultHighlightSlotIndex?: number;
}

/**
 * The entire interface the article route needs to render the selection
 * toolbar: toolbar position, capture result, the highlight and
 * highlight-and-note activation handlers (toolbar buttons AND H/N share
 * ONE create path), and the focus-exit dismissal (SelectionToolbar's
 * onFocusExit prop).
 */
export interface SelectionToolbarController {
  /** Live selection rect (position:fixed geometry). Null → toolbar hidden. */
  selectionRect: DOMRect | null;
  /** Enriched capture result. Null → toolbar hidden; !ok → hint variant. */
  captureResult: ToolbarCaptureResult | null;
  /**
   * Issue #195 — the resolved five-slot configuration the toolbar renders
   * (the settings' slots, or the shipped fallback). The route renders the
   * slot row from THIS value so the toolbar stays purely controller-driven.
   */
  slots: HighlightSlot[];
  /** Activate "Highlight" (bare) — toolbar button + H shortcut. */
  handleHighlight: () => void;
  savedHighlight: boolean;
  handleUndo: () => void;
  /**
   * Issue #195 — activate slot `index` (0-based) from the toolbar's visible
   * slot row: with a fresh selection it creates the highlight with that
   * slot's color + tags (no annotation panel opens); while the toolbar shows
   * a just-created highlight (saved state) it APPLIES the slot to that
   * highlight — color changes, the slot's tags join without removing
   * existing ones — and retires the Undo offer (an application is an edit).
   */
  handleActivateSlot: (index: number) => void;
  /**
   * Issue #195 — retire the toolbar's creation-Undo offer when `id` matches
   * the saved (just-created, untouched) highlight. Wired to the overlay's
   * onHighlightEdited so a note/tag/color edit (or deletion) can never leave
   * a stale Undo that would discard the reader's subsequent writing.
   */
  retireUndoFor: (id: string) => void;
  /** Activate "Highlight + note" — toolbar button + N shortcut. */
  handleHighlightAndNote: () => void;
  /** Focus-exit dismissal (the toolbar's focusout → this). */
  dismissFromFocusExit: () => void;
}

export function useSelectionToolbar({
  article,
  readingRootRef,
  articleEl,
  highlightApiRef,
  surfaceKey,
  highlightSlots,
  defaultHighlightSlotIndex = 0,
}: UseSelectionToolbarArgs): SelectionToolbarController {
  // The live selection rect + enriched capture result for the current
  // selection (ok / overlap / empty / empty-span / ineligible /
  // boundary-ineligible / measurement-body — Phase 19 vocabulary).
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  const [captureResult, setCaptureResult] = useState<ToolbarCaptureResult | null>(null);
  // Plan 13-11 (G6): the saved live Range from the last VALID selection.
  // Gecko/WebKit collapse the document selection synchronously whenever DOM
  // focus moves, so the toolbar's keyboard activation path cannot rely on
  // the live selection. Cleared in every branch that clears
  // selectionRect/captureResult so it can never resurrect a stale
  // selection. The clone is the ONLY persisted selection state.
  const [saved, setSaved] = useState<{
    id: string;
    rect: DOMRect;
    capture: ToolbarCaptureResult;
  } | null>(null);
  const pendingSavesRef = useRef(0);
  const generationRef = useRef(0);
  const lastValidRangeRef = useRef<Range | null>(null);
  // Issue #195 — the slot configuration the creation routes read at event
  // time. The defaults keep the hook's unit harness (and any caller without
  // settings) byte-compatible with the pre-slot behavior.
  const slots = highlightSlots ?? FALLBACK_SLOTS;
  /** The explicit default slot's creation payload, read per invocation. */
  const defaultPreset = useCallback(
    (): HighlightSlotPreset => defaultSlotPreset(slots, defaultHighlightSlotIndex),
    [slots, defaultHighlightSlotIndex],
  );
  // Event-time mirrors for the window keydown listener (registered once per
  // article mount — NO state deps; the Tab branches read refs at EVENT time,
  // never a stale closure).
  const captureOkRef = useRef(false);
  captureOkRef.current = saved !== null || captureResult?.ok === true;
  const toolbarRectActiveRef = useRef<DOMRect | null>(null);
  toolbarRectActiveRef.current = saved?.rect ?? selectionRect;

  /** The exact trio every clear-branch clears. */
  const clearToolbarState = useCallback(() => {
    setSelectionRect(null);
    setCaptureResult(null);
    lastValidRangeRef.current = null;
  }, []);

  // Article mount/swap reset: a stale rect/capture/saved Range from the
  // previous article must never flash (or resurrect a detached selection)
  // across an article transition.
  useEffect(() => {
    clearToolbarState();
    setSaved(null);
    generationRef.current += 1;
  }, [article, surfaceKey, clearToolbarState]);

  // Plan 13-11 (G6 — truth 4, the Tab-past exit): stable focus-exit
  // dismissal passed to SelectionToolbar as onFocusExit (the focusout
  // detection itself lives on the toolbar root). Idempotent by construction
  // (clearing already-cleared state is a no-op), which is what makes it safe
  // around both activation paths: the Enter/click activation relies on its
  // OWN clear above, which runs before any focus move. This is the ONLY
  // Tab-past dismissal mechanism in Chromium, where the live selection
  // survives the focus move so selectionchange never fires a collapse.
  // Declared BEFORE the creation callbacks so the slot-apply path (#195)
  // can list it as a dependency without a TDZ ordering hazard.
  const dismissFromFocusExit = useCallback(() => {
    generationRef.current += 1;
    clearToolbarState();
    setSaved(null);
  }, [clearToolbarState]);

  const savedRef = useRef(saved);
  savedRef.current = saved;

  /**
   * H/N shortcuts (UI-SPEC §Interaction 33) + the toolbar buttons' +
   * slot row's activation path — ONE create path. SELECTION-DEPENDENT: bails
   * (no action) when window.getSelection() is collapsed or captureSelection
   * returns ok:false, so H/N are never hijacked while just reading.
   *
   * Issue #195 — `preset` is the creating slot's payload: the ordinary
   * routes (Highlight button, H/N) pass the explicit default slot; a slot
   * activation passes that slot. The route itself is unchanged — capture,
   * overlap check, and persistence all stay the single shared path.
   *
   * Saved-range restore (Plan 13-11 G6): Gecko/WebKit collapse the selection
   * synchronously when focus moved onto the toolbar, so Enter on a focused
   * toolbar button (or H/N with focus inside the toolbar) arrives with a
   * collapsed live selection. If focus is INSIDE the toolbar and we hold the
   * last valid Range, restore it and fall through — the restored Range
   * re-enters createHighlightFromSelection, so the single-block rule,
   * overlap check, measurement-body guard, and grapheme capture all
   * re-validate against the live DOM (ONE creation path, zero forked
   * validation). H/N with focus anywhere else can never resurrect a stale
   * selection.
   */
  const runCreation = useCallback(
    async (withNote: boolean, preset: HighlightSlotPreset, offerUndo = false): Promise<void> => {
      const api = highlightApiRef.current;
      const readingRoot = readingRootRef.current;
      if (!api || !readingRoot || pendingSavesRef.current > 0) return;
      const selection = window.getSelection();
      // selectionchange is rAF-coalesced: a new native selection can already
      // exist before its handler retires the saved state. Read it directly.
      if (saved && (!selection || selection.isCollapsed || selection.rangeCount === 0)) {
        if (withNote) api.setOpenPopoverFor(saved.id);
        setSaved(null);
        return;
      }
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        const active = document.activeElement;
        if (
          selection &&
          active instanceof Element &&
          active.closest(".selection-toolbar") !== null &&
          lastValidRangeRef.current !== null
        ) {
          selection.removeAllRanges();
          selection.addRange(lastValidRangeRef.current);
        } else {
          return;
        }
      }
      // The saved-state rect reads BEFORE the await (the pointer-path
      // precedent — the toolbar's Undo flip re-uses the selection geometry).
      const range =
        offerUndo && selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      const rect = range?.getBoundingClientRect() ?? null;
      const generation = generationRef.current;
      const result: CreateFromSelectionResult = await api.createHighlightFromSelection(
        readingRoot,
        preset,
      );
      if (!result.ok) return; // invalid selection — toolbar shows the hint
      if (offerUndo && generation !== generationRef.current) return; // superseded gesture
      // Clear the selection so the <mark> renders cleanly, then the toolbar
      // state so it dismisses on highlight creation (UI-SPEC §Interaction
      // 25). Runs BEFORE any focus move (Enter does not move focus), so the
      // focus-exit dismissal can only ever be a no-op after this.
      window.getSelection()?.removeAllRanges();
      clearToolbarState();
      if (offerUndo && rect !== null) {
        // Issue #195 — a successful quick slot creation offers Undo: the
        // toolbar flips to the saved variant (the pointer path's register),
        // displaying the REAL capture the creation validated.
        setSaved({ id: result.highlightId, rect, capture: result.capture });
      }
      if (withNote) {
        // N: open the note popover for the new highlight. Strictly ordered:
        // state-clear → toolbar unmount → popover opens — any focusout the
        // unmount dispatches is an idempotent no-op, never a double-dismiss.
        api.setOpenPopoverFor(result.highlightId);
      }
    },
    [highlightApiRef, readingRootRef, clearToolbarState, saved],
  );

  /** Stable `() => void` wrappers for the toolbar buttons + keydown refs. */
  const handleHighlight = useCallback(() => {
    void runCreation(false, defaultPreset(), true);
  }, [runCreation, defaultPreset]);
  const handleHighlightAndNote = useCallback(() => {
    void runCreation(true, defaultPreset());
  }, [runCreation, defaultPreset]);
  /**
   * Issue #195 — a visible slot activation. Fresh selection → create with
   * that slot's payload (no panel opens; the toolbar flips to the Undo
   * state). Saved state (the just-created highlight) → APPLY the slot via
   * the ONE applyHighlightSlot seam (color changes, the slot's tags join
   * the existing ones, the Undo offer retires — an application is an edit),
   * then the toolbar dismisses.
   */
  const handleActivateSlot = useCallback(
    (index: number): void => {
      const slot = slots[index] ?? FALLBACK_SLOTS[0]!;
      const current = savedRef.current;
      const selection = window.getSelection();
      if (!current || (selection && !selection.isCollapsed && selection.rangeCount > 0)) {
        // Quick creation WITH the Undo offer (issue #195 — the toolbar flips
        // to the saved variant; the annotation panel never opens).
        void runCreation(false, slotPreset(slot), true);
        return;
      }
      const api = highlightApiRef.current;
      if (!api) return;
      // Retire the Undo offer up front — the application is an edit — and
      // dismiss the toolbar; the applied highlight stays on the page.
      dismissFromFocusExit();
      void api.applyHighlightSlot(current.id, slot).catch(() => {
        // applyHighlightSlot classified + routed to StorageBanner and rolled
        // its fields back; nothing further to surface here.
      });
    },
    [slots, highlightApiRef, runCreation, dismissFromFocusExit],
  );
  const handleHighlightRef = useRef(handleHighlight);
  handleHighlightRef.current = handleHighlight;
  const handleHighlightAndNoteRef = useRef(handleHighlightAndNote);
  handleHighlightAndNoteRef.current = handleHighlightAndNote;

  const handleUndo = useCallback(() => {
    const current = savedRef.current;
    if (!current) return;
    // Issue #174 — deleteHighlight RETHROWS after routing a failed write to
    // StorageBanner (the optimistic removal rolls back, so the just-created
    // mark stays); the no-op catch keeps the fire-and-forget undo path from
    // turning that routed error into an unhandled rejection.
    void highlightApiRef.current?.deleteHighlight(current.id)?.catch(() => {});
    dismissFromFocusExit();
  }, [highlightApiRef, dismissFromFocusExit]);

  // Issue #195 — retire the creation-Undo offer when an edit (note, tags,
  // color, or deletion) targets the saved highlight. Wired from ArticleView
  // to the overlay's onHighlightEdited notification; only the matching id
  // clears (an edit to an OLDER highlight never dismisses a new creation's
  // Undo). Functional update — no stale-closure read of `saved`.
  const retireUndoFor = useCallback((id: string): void => {
    setSaved((prev) => (prev !== null && prev.id === id ? null : prev));
  }, []);

  useEffect(() => {
    if (!article || !articleEl) return;
    const onKey = (event: KeyboardEvent) => {
      if (isFormField(event.target)) return;
      const key = event.key;
      // Keyboard selection shaping must invalidate pending pointer feedback.
      if (
        event.shiftKey &&
        [
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "Home",
          "End",
          "PageUp",
          "PageDown",
        ].includes(key)
      ) {
        generationRef.current += 1;
        setSaved(null);
      }
      if (key === "Escape" && savedRef.current) {
        handleUndo();
        return;
      }
      // Enter/Space on a focused <mark> (D5-10 / UI-SPEC §Interaction 29)
      // exposes the lightweight highlight controls via setControlsFor —
      // issue #175: keyboard activation moves focus INTO the controls (the
      // focus flag), the writing-only editor stays one step away.
      if (key === "Enter" || key === " ") {
        const target = event.target as HTMLElement | null;
        const mark = target?.closest?.("mark.highlight[data-highlight-id]") as HTMLElement | null;
        if (mark) {
          event.preventDefault();
          const id = mark.getAttribute("data-highlight-id");
          const api = highlightApiRef.current;
          if (id && api) {
            api.setControlsFor({ id, rect: mark.getBoundingClientRect(), focus: true });
          }
          return;
        }
      }
      // Plan 13-11 (G6 — Flow C2 Tab routing): a plain Tab from the reading
      // context routes focus DIRECTLY onto the toolbar's first button. The
      // toolbar sits near the END of DOM order, so "Tab to it" would mean a
      // long walk; and in Gecko/WebKit the FIRST Tab collapsed the selection
      // and unmounted the toolbar before focus could ever arrive. Per
      // engine: chromium keeps the live selection (activation proceeds
      // normally); firefox/webkit collapse it synchronously inside focus()
      // → the containment guard in the selectionchange listener keeps the
      // toolbar mounted. Guards, ALL evaluated at EVENT time:
      //   - plain Tab only (never touch Shift+Tab);
      //   - captureOk — never route into a hint-only toolbar;
      //   - toolbarRectActive non-null — the toolbar is actually mounted;
      //   - activeElement is document.body OR contained by the article
      //     (dialogs/popovers are never intercepted);
      //   - activeElement NOT already inside .selection-toolbar;
      //   - a toolbar button actually exists right before preventDefault
      //     (trap-proofing: after a focus-exit dismissal unmounts the
      //     toolbar, Tab proceeds natively — no bounce-back loop).
      if (key === "Tab" && !event.shiftKey) {
        const active = document.activeElement;
        const activeEl = active instanceof Element ? active : null;
        const articleNode = readingRootRef.current;
        const inReadingContext =
          active === document.body ||
          (activeEl !== null && articleNode !== null && articleNode.contains(activeEl));
        const insideToolbar = activeEl !== null && activeEl.closest(".selection-toolbar") !== null;
        if (
          captureOkRef.current &&
          toolbarRectActiveRef.current !== null &&
          inReadingContext &&
          !insideToolbar
        ) {
          const toolbarBtn = document.querySelector<HTMLElement>(".selection-toolbar button");
          if (toolbarBtn) {
            event.preventDefault();
            toolbarBtn.focus();
            return;
          }
        }
        // Plan 13-11 (G6 — truth 4 completion): a Tab pressed ON the
        // toolbar's LAST button is "tabbing past the toolbar" — dismiss.
        // Firefox parks focus on the last focusable when nothing follows it
        // (no focusout fires — the dismissal would wedge otherwise). No
        // preventDefault; idempotent with any focusout that follows.
        if (insideToolbar) {
          const toolbarRoot = document.querySelector(".selection-toolbar");
          const toolbarButtons = toolbarRoot?.querySelectorAll("button");
          const lastBtn = toolbarButtons?.[toolbarButtons.length - 1];
          if (activeEl !== null && lastBtn instanceof Element && lastBtn.contains(activeEl)) {
            dismissFromFocusExit();
          }
        }
      }
      // H/N highlight the current selection (UI-SPEC §Interaction 33) — the
      // explicit default slot's payload rides the ONE creation path (#195).
      // No preventDefault — no native default action worth suppressing.
      if (key === "h" || key === "H") {
        handleHighlightRef.current();
      } else if (key === "n" || key === "N") {
        handleHighlightAndNoteRef.current();
      }
    };
    // Registered on window (shortcuts from anywhere in the app while an
    // article is mounted, EXCEPT inside form fields per isFormField).
    // Never passive — the Tab branch's preventDefault needs it.
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
    // dismissFromFocusExit is stable — listed for the exhaustive-deps rule.
    // NO state deps: the Tab branches read refs at event time.
  }, [
    article,
    articleEl,
    readingRootRef,
    highlightApiRef,
    dismissFromFocusExit,
    handleUndo,
    clearToolbarState,
  ]);

  // Save only on a completed primary pointer gesture, never while dragging
  // or extending a keyboard selection. Reuse the canonical capture boundary.
  useEffect(() => {
    if (!article || !articleEl) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".selection-toolbar")) {
        generationRef.current += 1;
        setSaved(null);
      }
    };
    const onPointerUp = async (event: PointerEvent) => {
      if (event.button !== 0) return;
      const root = readingRootRef.current;
      const api = highlightApiRef.current;
      const selection = window.getSelection();
      if (
        !root ||
        !api ||
        !selection ||
        selection.isCollapsed ||
        !selection.rangeCount ||
        !(event.target instanceof Node) ||
        !root.contains(event.target)
      )
        return;
      const range = selection.getRangeAt(0);
      if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
      const capture = api.captureCurrentSelection(root);
      if (!capture.ok) return;
      // Issue #195 — the completed pointer gesture is an ORDINARY creation
      // route: it uses the explicit default slot's payload (read at event
      // time — a slot edit applies to the next creation, never retroactively).
      const preset = defaultPreset();
      // Copy boundaries before awaiting: DOM Range objects remain live.
      const { startContainer, startOffset, endContainer, endOffset } = range;
      const rect = range.getBoundingClientRect();
      const generation = generationRef.current;
      pendingSavesRef.current += 1;
      try {
        const result = await api.createHighlightFromSelection(root, preset);
        if (!result.ok || generation !== generationRef.current) return;
        // Do not clear a newer selection made while persistence was pending.
        const current = window.getSelection();
        if (current?.rangeCount && !current.isCollapsed) {
          const currentRange = current.getRangeAt(0);
          if (
            currentRange.startContainer !== startContainer ||
            currentRange.startOffset !== startOffset ||
            currentRange.endContainer !== endContainer ||
            currentRange.endOffset !== endOffset
          ) {
            // Rendering marks replaces the selected text nodes and can
            // retarget the browser's live Range to block boundaries. That
            // is our render, not a newer gesture. Real pointer/keyboard
            // gestures invalidate the generation above; unchanged DOM
            // endpoints still let us detect newer selections during saving.
            if (startContainer.isConnected && endContainer.isConnected) return;
          }
          current.removeAllRanges();
        }
        clearToolbarState();
        setSaved({ id: result.highlightId, rect, capture });
      } finally {
        pendingSavesRef.current -= 1;
      }
    };
    const dismissSaved = () => {
      generationRef.current += 1;
      setSaved(null);
    };
    window.addEventListener("resize", dismissSaved);
    document.addEventListener("scroll", dismissSaved, true);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointerup", onPointerUp);
    return () => {
      generationRef.current += 1;
      window.removeEventListener("resize", dismissSaved);
      document.removeEventListener("scroll", dismissSaved, true);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointerup", onPointerUp);
    };
    // defaultPreset rides the settings' slot configuration (#195) — a slot
    // edit must reach the next pointer creation, never a stale payload.
  }, [article, articleEl, readingRootRef, highlightApiRef, clearToolbarState, defaultPreset]);

  // UI-SPEC §Interaction 24: selectionchange tracking for the toolbar.
  // rAF-throttled (coalesce — one update per frame) so rapid selection
  // shaping doesn't thrash React state. Clear branches: collapsed (unless
  // the focus-containment hold applies), outside the reading surface, or
  // inside the hidden measurement body (D5-08).
  useEffect(() => {
    if (!article || !articleEl) return;
    let rafId: number | null = null;
    const onSelectChange = () => {
      if (rafId !== null) return; // coalesce — one rAF per frame
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
          // Plan 13-11 (G6 focus-containment hold): if the toolbar currently
          // owns focus, this collapse was caused by the focus move itself
          // (Gecko/WebKit collapse the selection synchronously inside
          // focus()). Keep the toolbar mounted with its last
          // captureResult/selectionRect while it contains
          // document.activeElement. Focus-INTO and intra-toolbar survival
          // are owned here; focus-EXIT is owned by the toolbar's focusout →
          // dismissFromFocusExit. They never conflict: the hold applies only
          // while activeElement is inside the toolbar, the dismissal only
          // when the incoming focus target is outside it.
          const active = document.activeElement;
          if (active instanceof Element && active.closest(".selection-toolbar") !== null) {
            return; // the toolbar stays mounted while it owns focus
          }
          clearToolbarState();
          return;
        }
        // Only track selections inside the reading surface. Selections
        // outside (e.g. in chrome) don't trigger the toolbar.
        const range = selection.getRangeAt(0);
        const articleNode = readingRootRef.current;
        if (
          !articleNode ||
          !articleNode.contains(range.startContainer) ||
          !articleNode.contains(range.endContainer)
        ) {
          clearToolbarState();
          return;
        }
        // Skip selections inside the hidden measurement body (D5-08 — should
        // never happen due to user-select:none, but defend).
        const measurementBody = articleNode.querySelector(".article-body-measurement");
        if (
          measurementBody &&
          (measurementBody.contains(range.startContainer) ||
            measurementBody.contains(range.endContainer))
        ) {
          clearToolbarState();
          return;
        }
        // A fresh native selection starts a new creation context, including
        // assistive-technology selection changes without pointer/key events.
        // Keep the previous highlight; only retire its saved Undo feedback.
        setSaved(null);
        setSelectionRect(range.getBoundingClientRect());
        // Plan 13-11 (G6): persist the valid Range for the keyboard
        // activation path's restore branch. Cloned — the live Range mutates
        // with the selection.
        lastValidRangeRef.current = range.cloneRange();
        // Enriched capture result (capture + D5-13 overlap check — no
        // highlight created).
        const api = highlightApiRef.current;
        if (api) {
          setCaptureResult(api.captureCurrentSelection(articleNode));
        }
      });
    };
    document.addEventListener("selectionchange", onSelectChange, {
      passive: true,
    });
    return () => {
      document.removeEventListener("selectionchange", onSelectChange);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [article, articleEl, readingRootRef, highlightApiRef, clearToolbarState]);

  return {
    selectionRect: saved?.rect ?? selectionRect,
    captureResult: saved?.capture ?? captureResult,
    slots,
    savedHighlight: saved !== null,
    handleUndo,
    handleActivateSlot,
    retireUndoFor,
    handleHighlight,
    handleHighlightAndNote,
    dismissFromFocusExit,
  };
}
