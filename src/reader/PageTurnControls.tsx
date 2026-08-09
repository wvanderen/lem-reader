// src/reader/PageTurnControls.tsx
// D4-05 (PAGE-02, A11Y-01/08): the full page-turn keyboard bundle — PageUp/
// PageDown + ArrowLeft/ArrowRight + Space (forward) / Shift+Space (back).
// Covers web convention (PageUp/Down), book convention (arrows), and reader
// convention (Space). Registered on `window` while an article is mounted in
// paginated mode; removed when the article unmounts or the mode switches to
// scrolling (A11Y-01 — no trap, no global hijack).
//
// D4-06 (PAGE-02, A11Y-07): single-touch horizontal swipe turns the page.
// Multi-touch (touches.length > 1) bails the moment a second touch starts so
// the browser's pinch-zoom + reflow (A11Y-04) stays NATIVE — the handler
// never calls preventDefault on multi-touch sequences (Pitfall 10). Vertical-
// dominant gestures bail so vertical pan stays native.
//
// D4-07 (A11Y-02/03): context-aware focus restoration after a turn.
//   - Turn triggered while focus was on a control (chevron, toggle, gear):
//     focus STAYS on the control. The reader used the control; they expect
//     to remain on it.
//   - Turn triggered while focus was inside the article content (a link, a
//     paragraph via SR virtual cursor): focus moves to the TOP of the new
//     page — first heading, else first focusable, else first paragraph.
//   - The M shortcut and the swipe gesture do not move focus (they did not
//     start from a control).
//
// A11Y-08: a visually-hidden polite live region announces "Page N of M."
// debounced (~250ms) so rapid turns reflect the FINAL page of a burst, not
// every intermediate. Mirrors SectionAnnouncer's timerRef debounce.
//
// T-04-10 mitigation (Information Disclosure): the keydown handler reads ONLY
// event.key + event.shiftKey; bails when event.target is a form field, dialog,
// or contenteditable; calls preventDefault ONLY on the keys it actually
// handles (never on Space inside an input — UI-SPEC §16).
//
// T-04-11 mitigation (Tampering): the swipe handler reads only start/end
// coordinates + touches.length; bails on multi-touch; never transmits touch
// data (local-only).
//
// T-04-12 mitigation (Denial of Service): turn handler is bounds-checked (no
// wrap at first/last page — surfaceRef.turn returns moved:false); the announce
// is debounced so a rapid key/swipe burst produces ONE announce for the final
// page.
//
// Listener registration note: the keydown listener is registered WITHOUT
// `{ passive: true }` (default non-passive) because it MUST call preventDefault
// on PageDown/Space/etc. so those keys do not also scroll the window.
// passive:true would silently no-op preventDefault (UI-SPEC §16 says "calls
// preventDefault only on handled keys" — a passive listener cannot honor
// that, so keydown is non-passive by design). The touch listeners ARE passive
// — the swipe handler never calls preventDefault (D4-06 Pitfall 10: never
// preventDefault on multi-touch; single-touch horizontal is already excluded
// from native pan by .paginated-surface's `touch-action: pan-y pinch-zoom`).

import { useEffect, useRef, useState } from "react";
import type { PaginatedSurfaceHandle } from "./PaginatedSurface";

interface PageTurnControlsProps {
  /**
   * Whether the keyboard + swipe listeners are active. ArticleView sets this
   * true ONLY when paginated mode is active (isPaginated && trustedView &&
   * articleEl). When false the listeners are not registered (and any existing
   * ones are cleaned up) so scrolling mode + the fixture list are unaffected.
   */
  enabled: boolean;
  /**
   * Ref to the PaginatedSurface imperative handle. Keyboard + swipe call
   * surfaceRef.current.turn(...); the handle shares the SAME turn path as the
   * chevrons so all three input routes stay in lockstep. Nullable because the
   * surface mounts after ArticleView's first render.
   */
  surfaceRef: React.RefObject<PaginatedSurfaceHandle | null>;
  /**
   * The shared <article> DOM node. Used for (a) the swipe listener target and
   * (b) D4-07 focus restoration (querying the new page's first heading).
   */
  articleEl: HTMLElement | null;
  // NOTE: The M shortcut (D4-09) is NO LONGER handled here. Plan 04-09 moved
  // the M listener to ArticleView so it survives the paginated↔scrolling mode
  // swap (PageTurnControls unmounts when paginated mode is off, which broke
  // the M round-trip — the second M in scrolling mode had no listener). The
  // page-turn keys (PageDown/ArrowRight/Space/etc.) stay paginated-only here.
}

/** Horizontal- swipe threshold (px). Below this, a touch is not a swipe. */
const SWIPE_MIN_PX = 40;
/** Horizontal-dominance ratio. Below this, the gesture is vertical (native pan). */
const SWIPE_RATIO = 1.5;
/** Announce debounce — rapid turns reflect the FINAL page (A11Y-08 anti-flood). */
const ANNOUNCE_DEBOUNCE_MS = 250;
/**
 * PageTurnControls — registers the keyboard bundle + swipe listener + the
 * polite "Page N of M" announce. Renders only the visually-hidden live region
 * (no visible chrome — the chevrons live in PaginatedSurface).
 */
export function PageTurnControls({
  enabled,
  surfaceRef,
  articleEl,
}: PageTurnControlsProps): React.ReactElement {
  const [announce, setAnnounce] = useState("");
  // Debounce timer ref — cleared on cleanup so it cannot fire after unmount.
  const timerRef = useRef<number | null>(null);

  /**
   * Shared turn path for keyboard + swipe. Reads focus BEFORE the turn (D4-07
   * context detection), calls the surface's imperative turn, then — if the
   * turn moved the page — schedules the debounced announce and (when focus
   * was in content) moves focus to the new page's top.
   */
  function handleTurn(direction: "next" | "previous"): void {
    const activeBefore = document.activeElement;
    const fromContent = isFocusInContent(activeBefore, articleEl);
    const result = surfaceRef.current?.turn(direction);
    if (!result || !result.moved) return;
    scheduleAnnounce(result.page, result.total);
    // D4-07: if the turn was triggered while focus was inside the article
    // content, move focus to the new page's first heading/focusable/paragraph.
    // rAF-deferred so the new page fragment is committed to the DOM first.
    // If focus was on a control, it stays put (the reader used the control).
    if (fromContent) {
      requestAnimationFrame(() => focusNewPageTop(articleEl));
    }
  }

  /** Debounced "Page N of M." announce (A11Y-08). */
  function scheduleAnnounce(page: number, total: number): void {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      // UI-SPEC §Copywriting: concise, uses the user's locale number formatting.
      const nf = new Intl.NumberFormat(navigator.language);
      setAnnounce(`Page ${nf.format(page)} of ${nf.format(total)}.`);
    }, ANNOUNCE_DEBOUNCE_MS);
  }

  // Keyboard bundle (D4-05). Registered on window; bails on form fields/dialogs
  // (T-04-10) so Tab + typing + the settings panel are never hijacked.
  useEffect(() => {
    if (!enabled || !articleEl) return;
    const onKey = (event: KeyboardEvent) => {
      // Bail when the key landed inside a form field, dialog, or contenteditable
      // (T-04-10 / A11Y-01 — never hijack Space inside an input).
      if (isFormField(event.target)) return;
      const key = event.key;
      if (key === "PageDown" || key === "ArrowRight" || (key === " " && !event.shiftKey)) {
        // preventDefault ONLY on handled keys so the key does not also scroll.
        event.preventDefault();
        handleTurn("next");
      } else if (
        key === "PageUp" ||
        key === "ArrowLeft" ||
        (key === " " && event.shiftKey)
      ) {
        event.preventDefault();
        handleTurn("previous");
      }
      // NOTE: The M shortcut (D4-09) was handled here prior to Plan 04-09. It
      // moved to ArticleView (global listener in BOTH modes) so the round-trip
      // works — this component unmounts in scrolling mode and the second M
      // would have no listener. See ArticleView.tsx handleToggleMode + the
      // global keydown effect.
    };
    // Non-passive: the handler MUST preventDefault on PageDown/Space/etc.
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
    // handleTurn reads surfaceRef + articleEl via closure; articleEl is in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, articleEl]);

  // Single-touch horizontal swipe (D4-06). Registered on the article element.
  useEffect(() => {
    if (!enabled || !articleEl) return;
    let startX = 0;
    let startY = 0;
    // Multi-touch flag — set the moment a second touch starts so touchend bails
    // and the browser's pinch-zoom stays native (Pitfall 10).
    let multiTouch = false;
    const onStart = (event: TouchEvent) => {
      if (event.touches.length > 1) {
        multiTouch = true;
        return;
      }
      if (event.touches.length === 1) {
        const t = event.touches[0];
        if (t) {
          startX = t.clientX;
          startY = t.clientY;
          multiTouch = false;
        }
      }
    };
    const onEnd = (event: TouchEvent) => {
      // Bail if any multi-touch occurred between start and end — pinch-zoom
      // owns that gesture (Pitfall 10). Reset the flag for the next gesture.
      if (multiTouch) {
        multiTouch = false;
        return;
      }
      if (event.changedTouches.length !== 1) return;
      const t = event.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      // Horizontal-dominant + above-threshold = page turn (right-to-left = next,
      // natural book convention — UI-SPEC §18).
      if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) >= SWIPE_RATIO * Math.abs(dy)) {
        handleTurn(dx < 0 ? "next" : "previous");
      }
      // Never preventDefault — vertical pan stays native; .paginated-surface's
      // touch-action: pan-y pinch-zoom already declares the intent.
    };
    // Passive: the swipe handler never preventDefaults (D4-06 Pitfall 10).
    articleEl.addEventListener("touchstart", onStart, { passive: true });
    articleEl.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      articleEl.removeEventListener("touchstart", onStart);
      articleEl.removeEventListener("touchend", onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, articleEl]);

  // Cleanup the announce debounce timer on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return (
    <div
      className="visually-hidden"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {announce}
    </div>
  );
}

/**
 * Is the keydown event target a form field, dialog, or contenteditable? The
 * keyboard bundle bails in that case so Tab + typing + the settings panel are
 * never hijacked (T-04-10 / A11Y-01 — never trap, never hijack Space inside
 * an input).
 *
 * Exported (Plan 04-09) so ArticleView's global M-shortcut listener reuses
 * the SAME bail rule — one implementation, one contract. The M shortcut must
 * NOT fire when focus is inside an input/dialog/contenteditable (T-04-10).
 */
export function isFormField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (target.isContentEditable) return true;
  // Inside an open <dialog> (settings panel or wipe-confirm) — let the dialog
  // own its keystrokes. The [data-dialog] hook covers both native + synthetic.
  if (tag === "dialog") return true;
  const dialogAncestor = target.closest("dialog,[data-dialog]");
  return dialogAncestor !== null;
}

/**
 * Was focus inside the article CONTENT (not on a control) right before the turn?
 * D4-07 context detection — if so, focus moves to the new page's top; if focus
 * was on a control, it stays put.
 */
function isFocusInContent(active: Element | null, articleEl: HTMLElement | null): boolean {
  if (!active || !articleEl) return false;
  if (!articleEl.contains(active)) return false;
  // Controls that live inside the article element: the page-turn chevrons
  // (.page-turn) and the mode toggle (.mode-toggle). If focus was on one of
  // those, this is a control-triggered turn → focus stays.
  if (active.closest(".page-turn,.mode-toggle,.gear-button")) return false;
  return true;
}

/**
 * D4-07: move focus to a fresh semantic boundary at the start of the newly
 * committed page. Mutable article paragraphs are deliberately not focus
 * targets: replacing them loses VoiceOver's cursor, while reusing them can
 * retain stale AX bounds. The keyed heading provides a deterministic handoff;
 * the next screen-reader navigation step enters the first article block.
 *
 * Callers rAF-defer this so the new page fragment is committed to the DOM
 * before the query runs.
 */
function focusNewPageTop(articleEl: HTMLElement | null): void {
  if (!articleEl) return;
  const pageFragment =
    articleEl.querySelector<HTMLElement>(".page-fragment");
  if (!pageFragment) return;
  pageFragment
    .querySelectorAll<HTMLElement>(":scope > [data-block-index][tabindex='-1']")
    .forEach((block) => block.removeAttribute("tabindex"));
  const pageStart = articleEl.querySelector<HTMLElement>(".page-start-heading");
  pageStart?.focus({ preventScroll: true });
}
