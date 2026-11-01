// src/reader/annotations/useSelectionToolbar.ts
// Issue #9 — the text-selection lifecycle extracted from the article route.
//
// Owns, behind ONE interface:
//   - selectionchange tracking (rAF-coalesced) → toolbar position + capture
//     result (UI-SPEC §Interaction 24). Issue #220: the toolbar mounts on
//     POINTER-UP only — while the pointer is down the drag's
//     selectionchanges are suppressed (no mid-drag mount, no reposition
//     jumping); keyboard selections show it immediately.
//   - the Gecko/WebKit focus-containment hold + saved-range restore
//     (Plan 13-11 G6 — .planning/debug/flowc-selection-toolbar-nvda.md),
//   - the keyboard routing matrix (Enter/Space on <mark>, Tab routing onto
//     the toolbar, Tab-past dismissal, H/N shortcuts),
//   - focus-exit dismissal,
//   - issue #197/#220 — the ARMED slot-hold creation gesture: a digit 1–5
//     pressed at ANY point during a pointer gesture arms that slot; the
//     creation fires on pointer-up regardless of digit/pointer release
//     order. Escape mid-drag cancels; a new pointerdown re-arms after a
//     cancel. While armed during the sweep, the native selection is tinted
//     live with the slot's derived color (the route paints `heldSlotTint`
//     onto the reading root; the ::selection rule lives in app.css).
//   - issue #220 — the undo grace: every creation path arms a ~4s window in
//     which Escape deletes the just-created, UNEDITED highlight (one shot).
//     Retired by expiry, an edit to that highlight (retireGraceFor), a
//     dialog opening (the focusin retirement effect), or a newer creation.
//     It survives scrolling, resizing, and new selections. The Escape ladder
//     (topmost layer wins): open dialog (handled natively — modal dialogs
//     trap focus into the isFormField bail) → undo grace → fresh toolbar
//     (dismiss + collapse + return focus to the reading surface) → armed
//     hold (cancel) → nothing.
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
// Issue #220 — the ONE slot→selection-tint derivation (same as the mark).
import { slotSelectionTint } from "../../settings/highlightTint";
import type { HighlightTintBases } from "../../settings/highlightTint";
import { isFormField } from "../PageTurnControls";
import type {
  CreateFromSelectionResult,
  HighlightOverlayValue,
  ToolbarCaptureResult,
} from "./HighlightOverlay";

/** The shipped-slot fallback for callers without settings (the unit harness;
 * any caller that omits the args keeps the pre-#195 behavior byte-for-byte). */
const FALLBACK_SLOTS = defaultHighlightSlots();

/** Issue #220 — the undo-grace window (~4s) after every creation. */
const GRACE_MS = 4000;

/** Issue #220 — the 0-based slot index a held digit key names, or null for
 * any other key. The one digit→slot vocabulary for keydown AND keyup. */
function slotIndexFromDigit(key: string): number | null {
  return /^[1-5]$/.test(key) ? Number(key) - 1 : null;
}

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
  /**
   * Issue #220 — the active theme's surface + ink pair, so the armed-hold
   * live paint derives a custom slot's tint against the SAME bases the
   * reader marks derive against (release = visually seamless). Optional:
   * absent (unit tests) falls back to the Default token for custom slots.
   */
  highlightBases?: HighlightTintBases;
}

/**
 * The entire interface the article route needs to render the selection
 * toolbar: toolbar position, capture result, the highlight and
 * highlight-and-note activation handlers (toolbar buttons AND H/N share
 * ONE create path), the focus-exit dismissal (SelectionToolbar's
 * onFocusExit prop), the armed-hold live paint, and the undo-grace wiring.
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
  /**
   * Issue #220 — the CSS value for the reading root's `--held-slot-tint`
   * while an armed hold paints the native selection (armed + pointer down),
   * or null. The route composes the `held-slot-armed` root class + this
   * inline custom property; the ::selection rule lives in app.css.
   */
  heldSlotTint: string | null;
  /** Activate "Highlight" (bare) — toolbar button + H shortcut. */
  handleHighlight: () => void;
  /**
   * Issue #195 — activate slot `index` (0-based) from the toolbar's visible
   * slot row: with a fresh selection it creates the highlight with that
   * slot's color + tags (no annotation panel opens). With no selection it
   * no-ops (the saved-state apply variant retired with issue #220's
   * auto-dismiss — apply reaches an existing highlight through the mark →
   * panel → "Apply slot" path).
   */
  handleActivateSlot: (index: number) => void;
  /**
   * Issue #220 — retire the undo grace when `id` matches its target.
   * Wired to the overlay's onHighlightEdited so a note/tag/color edit (or
   * deletion) can never leave a grace whose Escape would discard the
   * reader's subsequent writing.
   */
  retireGraceFor: (id: string) => void;
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
  highlightBases,
}: UseSelectionToolbarArgs): SelectionToolbarController {
  // The live selection rect + enriched capture result for the current
  // selection (ok / overlap / empty / empty-span / ineligible /
  // boundary-ineligible / measurement-body — Phase 19 vocabulary).
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  const [captureResult, setCaptureResult] = useState<ToolbarCaptureResult | null>(null);
  // Event-time refs shared by the listeners (registered once per article
  // mount; every read happens at EVENT time, never from a stale closure):
  //   pendingSavesRef — in-flight pointer-path persistence (creation
  //     re-entrancy guard).
  //   generationRef — gesture generation; a new gesture invalidates an
  //     in-flight save's result.
  //   lastValidRangeRef — Plan 13-11 (G6): the saved live Range from the
  //     last VALID selection. Gecko/WebKit collapse the document selection
  //     synchronously whenever DOM focus moves, so the toolbar's keyboard
  //     activation path cannot rely on the live selection. Cleared in every
  //     branch that clears selectionRect/captureResult so it can never
  //     resurrect a stale selection. The clone is the ONLY persisted
  //     selection state.
  const pendingSavesRef = useRef(0);
  const generationRef = useRef(0);
  const lastValidRangeRef = useRef<Range | null>(null);
  // Issue #220 — the undo grace: the most recent UNEDITED creation, one
  // Escape-shot. Ref mirror for event-time ladder reads; the state drives
  // the expiry timer + re-renders. A newer creation REPLACES the target
  // (fresh timer); retirement is expiry / edit / dialog-open (focusin).
  const [grace, setGrace] = useState<{ id: string } | null>(null);
  // Dialog focus retires pending creations too, even if the dialog closes
  // before persistence finishes. Each creation captures this generation.
  const dialogGenerationRef = useRef(0);
  const graceRef = useRef(grace);
  graceRef.current = grace;
  // Issue #197/#220 — the armed slot-hold gesture, all read at EVENT time
  // (the listeners register once per article mount):
  //   armedSlotRef — the slot (0-based) a digit press armed for the current
  //     or next pointer gesture. A keyup disarms ONLY outside an active
  //     gesture (release-order independence: a digit released mid-gesture
  //     stays armed until pointer-up, and a successful creation consumes
  //     the arm).
  //   armedKeyCodeRef — physical key identity, surviving modifier changes
  //     between press and release (Shift+digit keyup spells a shifted key).
  //   holdCancelledRef — Escape pressed DURING an armed gesture (pointer
  //     down); suppresses that gesture's creation entirely (the native
  //     selection stays available). Only a new pointerdown re-arms — within
  //     a cancelled gesture nothing, not even a fresh digit press,
  //     resurrects the creation.
  //   pointerDownRef — a pointer button is physically down. It scopes the
  //     armed-cancel Escape rung to real gestures AND suppresses the
  //     toolbar's selectionchange mount/reposition while dragging.
  const armedSlotRef = useRef<number | null>(null);
  const armedKeyCodeRef = useRef<string | null>(null);
  // Whether the ARMED digit's own keyup already arrived (a plain release is
  // tolerated mid-gesture for release-order independence, but the arm must
  // die at gesture end if the digit is no longer down — a stale arm would
  // otherwise create on a later, unrelated plain drag).
  const armedKeyReleasedRef = useRef(false);
  const holdCancelledRef = useRef(false);
  const pointerDownRef = useRef(false);
  // Issue #220 — the live-paint slot as STATE (refs alone never re-render,
  // so the root class + tint could not appear). Non-null exactly while the
  // sweep should paint: armed AND pointer down. The tint itself is computed
  // at render time from the CURRENT slots/bases, so a theme or slot edit
  // mid-hold re-derives like every other paint site.
  const [paintSlot, setPaintSlot] = useState<number | null>(null);
  // Issue #195 — the slot configuration the creation routes read at event
  // time. The defaults keep the hook's unit harness (and any caller without
  // settings) byte-compatible with the pre-slot behavior.
  const slots = highlightSlots ?? FALLBACK_SLOTS;
  /** The slot at `index` — one lookup shape shared by the visible picker's
   * activation and the armed-hold gesture. */
  const slotAt = useCallback(
    (index: number): HighlightSlot => slots[index] ?? FALLBACK_SLOTS[0]!,
    [slots],
  );
  /** The explicit default slot's creation payload, read per invocation. */
  const defaultPreset = useCallback(
    (): HighlightSlotPreset => defaultSlotPreset(slots, defaultHighlightSlotIndex),
    [slots, defaultHighlightSlotIndex],
  );
  // Issue #220 — the armed-hold live paint value (render-derived): the same
  // derivation the eventual mark uses, so the release is seamless.
  const heldSlotTint =
    paintSlot !== null ? slotSelectionTint(slots[paintSlot] ?? slots[0]!, highlightBases) : null;
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

  /** Issue #220 — disarm the armed hold + its live paint. Shared by the
   * consumed-creation, keyup, blur, and article-reset paths. */
  const disarmHold = useCallback(() => {
    armedSlotRef.current = null;
    armedKeyCodeRef.current = null;
    armedKeyReleasedRef.current = false;
    setPaintSlot(null);
  }, []);

  // Article mount/swap reset: a stale rect/capture/saved Range from the
  // previous article must never flash (or resurrect a detached selection)
  // across an article transition. Issue #220: the hold gesture state resets
  // with it (a swap mid-hold never carries the slot into the next article).
  useEffect(() => {
    clearToolbarState();
    generationRef.current += 1;
    disarmHold();
    holdCancelledRef.current = false;
  }, [article, surfaceKey, clearToolbarState, disarmHold]);

  // Issue #220 — the undo grace resets on an ARTICLE swap only (its target
  // highlight belongs to the previous article); surface changes — page
  // turns, mode switches — are scrolling to the grace, and it survives
  // scrolling by contract.
  useEffect(() => {
    setGrace(null);
  }, [article]);

  // Plan 13-11 (G6 — truth 4, the Tab-past exit): stable focus-exit
  // dismissal passed to SelectionToolbar as onFocusExit (the focusout
  // detection itself lives on the toolbar root). Idempotent by construction
  // (clearing already-cleared state is a no-op), which is what makes it safe
  // around both activation paths: the Enter/click activation relies on its
  // OWN clear above, which runs before any focus move. This is the ONLY
  // Tab-past dismissal mechanism in Chromium, where the live selection
  // survives the focus move so selectionchange never fires a collapse.
  const dismissFromFocusExit = useCallback(() => {
    generationRef.current += 1;
    clearToolbarState();
  }, [clearToolbarState]);

  /**
   * Issue #220 — the ONE "publish the live selection into toolbar state"
   * body, shared by the selectionchange rAF (keyboard + AT selections,
   * post-release repositions) and the pointer-up publish. Guards: collapsed
   * (unless the focus-containment hold applies), outside the reading
   * surface, inside the hidden measurement body (D5-08). NOT called while
   * the pointer is down — that is the mid-drag suppression.
   */
  const syncToolbarFromSelection = useCallback(() => {
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
  }, [readingRootRef, highlightApiRef, clearToolbarState]);

  // Issue #220 — the undo-grace expiry: one timer per grace target; a newer
  // creation replaces the target (new object identity → fresh full window).
  useEffect(() => {
    if (grace === null) return;
    const timer = window.setTimeout(() => {
      setGrace(null);
    }, GRACE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [grace]);

  // Issue #220 — "a dialog opening retires the grace": modal dialogs trap
  // focus (showModal moves it in synchronously), so the FIRST focus landing
  // inside any open <dialog> is the observable moment a dialog opened. The
  // annotation panel, note editor, and settings all open such dialogs; from
  // that moment Escape belongs to the dialog (dismiss + save) and the grace
  // is gone — it can never fire "through" a dialog.
  useEffect(() => {
    if (!article || !articleEl) return;
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("dialog[open]") !== null) {
        dialogGenerationRef.current += 1;
        setGrace(null);
      }
    };
    document.addEventListener("focusin", onFocusIn, true);
    return () => {
      document.removeEventListener("focusin", onFocusIn, true);
    };
  }, [article, articleEl]);

  /** Issue #220 — arm the undo grace for a fresh creation. A newer creation
   * replaces the target (and restarts the window). */
  const armGrace = useCallback((id: string, dialogGeneration: number) => {
    if (dialogGeneration !== dialogGenerationRef.current) return;
    setGrace({ id });
  }, []);

  /**
   * H/N shortcuts (UI-SPEC §Interaction 33) + the toolbar buttons' +
   * slot row's activation path — ONE create path. SELECTION-DEPENDENT: bails
   * (no action) when window.getSelection() is collapsed or captureSelection
   * returns ok:false, so H/N are never hijacked while just reading.
   *
   * Issue #220 — every creation auto-dismisses the toolbar (the saved-state
   * variant is gone) and arms the undo grace; the announcement itself
   * ("Highlight saved. Press Escape to undo.") rides the shared creation
   * path in useAnnotationState.
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
    async (withNote: boolean, preset: HighlightSlotPreset): Promise<void> => {
      const api = highlightApiRef.current;
      const readingRoot = readingRootRef.current;
      if (!api || !readingRoot || pendingSavesRef.current > 0) return;
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
      const dialogGeneration = dialogGenerationRef.current;
      const result: CreateFromSelectionResult = await api.createHighlightFromSelection(
        readingRoot,
        preset,
      );
      if (!result.ok) return; // invalid selection — toolbar shows the hint
      // Clear the selection so the <mark> renders cleanly, then the toolbar
      // state so it dismisses on highlight creation (UI-SPEC §Interaction
      // 25). Runs BEFORE any focus move (Enter does not move focus), so the
      // focus-exit dismissal can only ever be a no-op after this.
      window.getSelection()?.removeAllRanges();
      clearToolbarState();
      armGrace(result.highlightId, dialogGeneration);
      if (withNote) {
        // N: open the note popover for the new highlight. Strictly ordered:
        // state-clear → toolbar unmount → popover opens — any focusout the
        // unmount dispatches is an idempotent no-op, never a double-dismiss.
        // The popover is a modal dialog: its opening retires this grace via
        // the focusin effect (Escape there dismisses the dialog — the
        // highlight survives — exactly the panel anchor's contract).
        api.setOpenPopoverFor(result.highlightId);
      }
    },
    [highlightApiRef, readingRootRef, clearToolbarState, armGrace],
  );

  /** Stable `() => void` wrappers for the toolbar buttons + keydown refs. */
  const handleHighlight = useCallback(() => {
    void runCreation(false, defaultPreset());
  }, [runCreation, defaultPreset]);
  const handleHighlightAndNote = useCallback(() => {
    void runCreation(true, defaultPreset());
  }, [runCreation, defaultPreset]);
  /**
   * Issue #195 — a visible slot activation creates with that slot's payload
   * (no panel opens). The no-selection case is owned by runCreation's
   * guards — INCLUDING the Gecko/WebKit restore branch (focus inside the
   * toolbar + the saved Range), which a keyboard Enter on a slot pill NEEDS
   * in Firefox/WebKit where the focus move collapsed the live selection.
   * Issue #220: the saved-state apply variant is gone (apply reaches an
   * existing highlight through mark → panel → Apply slot).
   */
  const handleActivateSlot = useCallback(
    (index: number): void => {
      void runCreation(false, slotPreset(slotAt(index)));
    },
    [slotAt, runCreation],
  );
  const handleHighlightRef = useRef(handleHighlight);
  handleHighlightRef.current = handleHighlight;
  const handleHighlightAndNoteRef = useRef(handleHighlightAndNote);
  handleHighlightAndNoteRef.current = handleHighlightAndNote;

  // Issue #220 — retire the grace when an edit (note, tags, color, or
  // deletion) targets ITS highlight. Wired from ArticleView to the overlay's
  // onHighlightEdited notification; only the matching id clears (an edit to
  // an OLDER highlight never retires a newer creation's grace). Functional
  // update — no stale-closure read.
  const retireGraceFor = useCallback((id: string): void => {
    setGrace((prev) => (prev !== null && prev.id === id ? null : prev));
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
      }
      // Issue #220 — arm-on-press. A bare digit 1–5 (never with modifier
      // keys, never in editable fields — the isFormField bail above) arms
      // that slot for the current or next pointer gesture; auto-repeat
      // re-affirms. The arm survives a digit keyup DURING a gesture
      // (release-order independence) and is consumed by the creation.
      const digitSlot = slotIndexFromDigit(key);
      if (
        digitSlot !== null &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey
      ) {
        armedSlotRef.current = digitSlot;
        armedKeyCodeRef.current = event.code || null;
        armedKeyReleasedRef.current = false;
        // Mid-gesture presses paint immediately (the sweep tints as it goes).
        if (pointerDownRef.current) setPaintSlot(digitSlot);
      }
      if (key === "Escape") {
        // The Escape ladder (issue #220 — topmost layer wins). Rung 1, an
        // open dialog, never reaches here: modal dialogs trap focus, so the
        // isFormField bail above already handed them the key (dismiss +
        // save), and the focusin effect retired the grace at open.
        // Rung 2 — the undo grace: delete the just-created, UNEDITED
        // highlight (one shot).
        const g = graceRef.current;
        if (g !== null) {
          setGrace(null); // consume first — one shot, never a repeat
          // Issue #174 — deleteHighlight RETHROWS after routing a failed
          // write to StorageBanner (the optimistic removal rolls back, so
          // the mark stays); the no-op catch keeps the fire-and-forget
          // grace path from turning that routed error into an unhandled
          // rejection.
          void highlightApiRef.current?.deleteHighlight(g.id)?.catch(() => {});
          return;
        }
        // Rung 3 — the fresh toolbar over a selection: its FIRST explicit
        // keyboard dismissal. Dismiss, collapse the native selection, and
        // return focus to the reading context (body — where focus rests
        // during ordinary keyboard reading; when the reader had Tabbed into
        // the toolbar, unmounting it already drops focus to body).
        if (toolbarRectActiveRef.current !== null) {
          dismissFromFocusExit();
          window.getSelection()?.removeAllRanges();
          document.body.focus();
          return;
        }
        // Rung 4 — an armed hold: Escape cancels the gesture's pending
        // creation (the hold is still physically down; undoing an OLDER
        // highlight is never what a mid-hold Escape means — and with the
        // ladder above, a live grace would already have fired).
        if (armedSlotRef.current !== null && pointerDownRef.current) {
          holdCancelledRef.current = true;
        }
        // Otherwise nothing.
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
      // → the containment guard in syncToolbarFromSelection keeps the
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
    clearToolbarState,
  ]);

  // Issue #220 — the armed hold's release semantics: a digit keyup disarms
  // ONLY outside an active gesture (inside one, the arm survives until
  // pointer-up — release-order independence). A window blur clears the arm,
  // the press tracker, and the paint (a keyup/pointerup can never arrive
  // once the window loses focus mid-hold — without this the hold would
  // stick and silently retarget the NEXT ordinary selection). Only the
  // ARMED digit's own keyup disarms (a second digit released first must not
  // end the first's arm).
  useEffect(() => {
    if (!article || !articleEl) return;
    const onKeyUp = (event: KeyboardEvent) => {
      if (
        armedSlotRef.current !== null &&
        (armedKeyCodeRef.current !== null
          ? event.code === armedKeyCodeRef.current
          : armedSlotRef.current === slotIndexFromDigit(event.key))
      ) {
        // Inside an active gesture a PLAIN digit release keeps the arm
        // (release-order independence — the creation still fires on
        // pointer-up) but is REMEMBERED: once the pointer comes back up
        // without a creation, the arm dies with the gesture. A MODIFIED
        // release (Shift+digit keyup spells another key) ends the hold even
        // mid-gesture: the reader deliberately let go of the number, so
        // neither this nor the next gesture creates. Outside a gesture any
        // release disarms immediately — a tap is transient and never sticks
        // around to retarget a later, unrelated selection.
        if (
          pointerDownRef.current &&
          !event.shiftKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey
        ) {
          armedKeyReleasedRef.current = true;
          return;
        }
        disarmHold();
      }
    };
    const onWindowBlur = () => {
      disarmHold();
      pointerDownRef.current = false;
    };
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [article, articleEl, disarmHold]);

  // Issue #197/#220 — the pointer gesture boundary. Down: open the gesture
  // (re-arming after a cancel; a slot armed before the press paints the
  // sweep as soon as it forms) and invalidate pending saves. Up: publish
  // the release's selection (the drag was suppressed) and fire the armed
  // creation through the ONE creation path — regardless of digit/pointer
  // release order. Cancel: keep the press tracker honest.
  useEffect(() => {
    if (!article || !articleEl) return;
    const onPointerDown = (event: PointerEvent) => {
      pointerDownRef.current = true;
      // A new pointer gesture is the only way to re-arm after Escape.
      holdCancelledRef.current = false;
      if (!(event.target instanceof Element) || !event.target.closest(".selection-toolbar")) {
        generationRef.current += 1;
      }
      // A slot armed before the press (digit-first) paints from the first
      // selected pixel.
      const armed = armedSlotRef.current;
      if (armed !== null) setPaintSlot(armed);
    };
    const onPointerUp = (event: PointerEvent) => {
      pointerDownRef.current = false;
      // The pointer came up — the sweep paint is over either way (creation,
      // cancellation, or plain selection).
      setPaintSlot(null);
      if (event.button !== 0) return;
      // Issue #220 — publish the release's selection state. The drag's
      // selectionchanges were suppressed, so THIS is the toolbar's mount
      // moment for a plain selection (and the hint's for an invalid one).
      // A successful armed creation below clears it again.
      syncToolbarFromSelection();
      // Issue #220 — the armed creation fires on release regardless of
      // digit/pointer release order; a cancelled gesture never does. When
      // the gesture ends WITHOUT a creation and the armed digit is already
      // physically up, the arm dies with it — a stale arm must never
      // retarget a later, unrelated plain drag. (A still-held digit keeps
      // its arm: a fresh gesture from the same hold is new intent — the
      // re-arm-after-cancel contract — and a failed capture leaves the arm
      // alive for an immediate retry while the reader keeps the digit down.)
      // A successful creation consumes the arm explicitly.
      if (holdCancelledRef.current) {
        if (armedKeyReleasedRef.current) disarmHold();
        return;
      }
      const armed = armedSlotRef.current;
      if (armed === null) return;
      const bailWithoutCreation = () => {
        if (armedKeyReleasedRef.current) disarmHold();
      };
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
      ) {
        bailWithoutCreation();
        return;
      }
      const range = selection.getRangeAt(0);
      if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
        bailWithoutCreation();
        return;
      }
      // The canonical capture boundary re-validates BEFORE persisting (the
      // pre-#220 order): an invalid selection never reaches the creation —
      // the publish above already mounted the matching hint.
      if (!api.captureCurrentSelection(root).ok) {
        bailWithoutCreation();
        return;
      }
      const preset = slotPreset(slotAt(armed));
      // Copy boundaries before awaiting: DOM Range objects remain live.
      const { startContainer, startOffset, endContainer, endOffset } = range;
      const generation = generationRef.current;
      const dialogGeneration = dialogGenerationRef.current;
      pendingSavesRef.current += 1;
      void (async () => {
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
          disarmHold();
          armGrace(result.highlightId, dialogGeneration);
        } finally {
          pendingSavesRef.current -= 1;
        }
      })();
    };
    // Issue #197 — an OS-cancelled drag never delivers the pointerup; keep
    // the press tracker (and the sweep paint) from sticking.
    const onPointerCancel = () => {
      pointerDownRef.current = false;
      setPaintSlot(null);
      if (armedKeyReleasedRef.current) disarmHold();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerCancel);
    return () => {
      generationRef.current += 1;
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerCancel);
    };
    // Slots ride the settings' slot configuration (#195, #197) — a slot
    // edit must reach the next pointer creation, never a stale payload for
    // the armed creation. syncToolbarFromSelection is stable per refs.
  }, [
    article,
    articleEl,
    readingRootRef,
    highlightApiRef,
    clearToolbarState,
    slotAt,
    syncToolbarFromSelection,
    disarmHold,
    armGrace,
  ]);

  // UI-SPEC §Interaction 24: selectionchange tracking for the toolbar.
  // rAF-throttled (coalesce — one update per frame) so rapid selection
  // shaping doesn't thrash React state. Issue #220: SUPPRESSED while the
  // pointer is down — the toolbar mounts on pointer-up only (the pointer-up
  // handler publishes then); keyboard/AT selections show it immediately.
  useEffect(() => {
    if (!article || !articleEl) return;
    let rafId: number | null = null;
    const onSelectChange = () => {
      if (rafId !== null) return; // coalesce — one rAF per frame
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (pointerDownRef.current) return; // mid-drag suppression (#220)
        syncToolbarFromSelection();
      });
    };
    document.addEventListener("selectionchange", onSelectChange, {
      passive: true,
    });
    return () => {
      document.removeEventListener("selectionchange", onSelectChange);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [article, articleEl, syncToolbarFromSelection]);

  return {
    selectionRect,
    captureResult,
    slots,
    heldSlotTint,
    handleHighlight,
    handleActivateSlot,
    retireGraceFor,
    handleHighlightAndNote,
    dismissFromFocusExit,
  };
}
