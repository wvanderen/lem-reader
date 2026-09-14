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
import { isFormField } from "../PageTurnControls";
import type {
  CreateFromSelectionResult,
  HighlightOverlayValue,
  ToolbarCaptureResult,
} from "./HighlightOverlay";

export interface UseSelectionToolbarArgs {
  /**
   * The loaded article. Null while loading — the lifecycle no-ops (rules of
   * hooks: every listener registration is gated inside the effects) and a
   * swap clears the toolbar state (never carry a rect/capture/saved Range
   * across articles).
   */
  article: CanonicalArticle | null;
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
  /** Activate "Highlight" (bare) — toolbar button + H shortcut. */
  handleHighlight: () => void;
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
}: UseSelectionToolbarArgs): SelectionToolbarController {
  // The live selection rect + enriched capture result for the current
  // selection (ok / overlap / empty / empty-span / ineligible /
  // boundary-ineligible / measurement-body — Phase 19 vocabulary).
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  const [captureResult, setCaptureResult] =
    useState<ToolbarCaptureResult | null>(null);
  // Plan 13-11 (G6): the saved live Range from the last VALID selection.
  // Gecko/WebKit collapse the document selection synchronously whenever DOM
  // focus moves, so the toolbar's keyboard activation path cannot rely on
  // the live selection. Cleared in every branch that clears
  // selectionRect/captureResult so it can never resurrect a stale
  // selection. The clone is the ONLY persisted selection state.
  const lastValidRangeRef = useRef<Range | null>(null);
  // Event-time mirrors for the window keydown listener (registered once per
  // article mount — NO state deps; the Tab branches read refs at EVENT time,
  // never a stale closure).
  const captureOkRef = useRef(false);
  captureOkRef.current = captureResult?.ok === true;
  const toolbarRectActiveRef = useRef<DOMRect | null>(null);
  toolbarRectActiveRef.current = selectionRect;

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
  }, [article, clearToolbarState]);

  /**
   * H/N shortcuts (UI-SPEC §Interaction 33) + the toolbar buttons' activation
   * path — ONE create path. SELECTION-DEPENDENT: bails (no action) when
   * window.getSelection() is collapsed or captureSelection returns ok:false,
   * so H/N are never hijacked while just reading.
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
  const handleHighlightShortcut = useCallback(
    async (withNote: boolean): Promise<void> => {
      const api = highlightApiRef.current;
      const readingRoot = readingRootRef.current;
      if (!api || !readingRoot) return;
      const selection = window.getSelection();
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
      const result: CreateFromSelectionResult =
        await api.createHighlightFromSelection(readingRoot);
      if (!result.ok) return; // invalid selection — toolbar shows the hint
      // Clear the selection so the <mark> renders cleanly, then the toolbar
      // state so it dismisses on highlight creation (UI-SPEC §Interaction
      // 25). Runs BEFORE any focus move (Enter does not move focus), so the
      // focus-exit dismissal can only ever be a no-op after this.
      window.getSelection()?.removeAllRanges();
      clearToolbarState();
      if (withNote) {
        // N: open the note popover for the new highlight. Strictly ordered:
        // state-clear → toolbar unmount → popover opens — any focusout the
        // unmount dispatches is an idempotent no-op, never a double-dismiss.
        api.setOpenPopoverFor(result.highlightId);
      }
    },
    [highlightApiRef, readingRootRef, clearToolbarState],
  );

  /** Stable `() => void` wrappers for the toolbar buttons + keydown refs. */
  const handleHighlight = useCallback(() => {
    void handleHighlightShortcut(false);
  }, [handleHighlightShortcut]);
  const handleHighlightAndNote = useCallback(() => {
    void handleHighlightShortcut(true);
  }, [handleHighlightShortcut]);
  const handleHighlightShortcutRef = useRef(handleHighlightShortcut);
  handleHighlightShortcutRef.current = handleHighlightShortcut;

  // Plan 13-11 (G6 — truth 4, the Tab-past exit): stable focus-exit
  // dismissal passed to SelectionToolbar as onFocusExit (the focusout
  // detection itself lives on the toolbar root). Idempotent by construction
  // (clearing already-cleared state is a no-op), which is what makes it safe
  // around both activation paths: the Enter/click activation relies on its
  // OWN clear above, which runs before any focus move. This is the ONLY
  // Tab-past dismissal mechanism in Chromium, where the live selection
  // survives the focus move so selectionchange never fires a collapse.
  const dismissFromFocusExit = useCallback(() => {
    clearToolbarState();
  }, [clearToolbarState]);

  useEffect(() => {
    if (!article || !articleEl) return;
    const onKey = (event: KeyboardEvent) => {
      if (isFormField(event.target)) return;
      const key = event.key;
      // Enter/Space on a focused <mark> (D5-10 / UI-SPEC §Interaction 29)
      // opens the inline note popover via setOpenPopoverFor.
      if (key === "Enter" || key === " ") {
        const target = event.target as HTMLElement | null;
        const mark = target?.closest?.(
          "mark.highlight[data-highlight-id]",
        ) as HTMLElement | null;
        if (mark) {
          event.preventDefault();
          const id = mark.getAttribute("data-highlight-id");
          const api = highlightApiRef.current;
          if (id && api) api.setOpenPopoverFor(id);
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
          (activeEl !== null &&
            articleNode !== null &&
            articleNode.contains(activeEl));
        const insideToolbar =
          activeEl !== null &&
          activeEl.closest(".selection-toolbar") !== null;
        if (
          captureOkRef.current &&
          toolbarRectActiveRef.current !== null &&
          inReadingContext &&
          !insideToolbar
        ) {
          const toolbarBtn = document.querySelector<HTMLElement>(
            ".selection-toolbar button",
          );
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
          if (
            activeEl !== null &&
            lastBtn instanceof Element &&
            lastBtn.contains(activeEl)
          ) {
            dismissFromFocusExit();
          }
        }
      }
      // H/N highlight the current selection (UI-SPEC §Interaction 33). No
      // preventDefault — no native default action worth suppressing.
      if (key === "h" || key === "H") {
        void handleHighlightShortcutRef.current(false);
      } else if (key === "n" || key === "N") {
        void handleHighlightShortcutRef.current(true);
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
  ]);

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
          if (
            active instanceof Element &&
            active.closest(".selection-toolbar") !== null
          ) {
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
        const measurementBody = articleNode.querySelector(
          ".article-body-measurement",
        );
        if (
          measurementBody &&
          (measurementBody.contains(range.startContainer) ||
            measurementBody.contains(range.endContainer))
        ) {
          clearToolbarState();
          return;
        }
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
    selectionRect,
    captureResult,
    handleHighlight,
    handleHighlightAndNote,
    dismissFromFocusExit,
  };
}
