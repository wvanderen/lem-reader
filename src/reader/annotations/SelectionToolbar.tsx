// src/reader/annotations/SelectionToolbar.tsx
// Phase 5 Plan 05-02 Task 2 — floating selection toolbar (D5-05, D5-06/D5-13
// invalid hints, UI-SPEC §Interaction 25/34).
//
// A conditionally-rendered position:fixed element (NOT a popover, NOT a dialog
// — see UI-SPEC §Design System rationale: popover="auto" would light-dismiss
// on the mouseup that finalizes the selection; <dialog> is too heavy). The
// toolbar appears near a VALID non-collapsed selection and offers "Highlight"
// + "Highlight + note". It shows a calm hint replacing the buttons when the
// selection is invalid (multi-block / overlap / empty / ineligible).
//
// Geometry (UI-SPEC §Interaction 25): centered on the selection midpoint,
// placed --space-sm above the top edge; edge-clamped horizontally to
// --space-sm from viewport (or pageContentBoxRect in paginated mode); flips
// below when <60px above. z-index: 8 (above content at 1 + hairline/chevrons
// at 5; below header at 10 + top-layer dialogs/popovers).
//
// Reduced motion (A11Y-06): instant mount/unmount. No transition/animation
// property on any toolbar selector (mirrors ProgressHairline.tsx L17
// discipline — the global prefers-reduced-motion gate is trivially satisfied).
//
// Keyboard path (Plan 13-11, G6 — ACPT-05 Flow C2/C3): the toolbar IS the
// primary screen-reader path (the Phase 6 protocol rewrite). It is
// reachable by a SINGLE Tab from the reading context in all engines
// (ArticleView's Tab routing), and its lifecycle keeps it mounted while it
// contains document.activeElement (Gecko/WebKit collapse the selection on
// any DOM focus move — .planning/debug/flowc-selection-toolbar-nvda.md)
// and dismisses it when focus exits (focusout with the incoming target
// outside the toolbar). H/N remain the sighted keyboard convenience
// (screen readers consume bare letters).
import { useEffect, useRef, useState } from "react";
import type { ToolbarCaptureResult } from "./HighlightOverlay";

export interface SelectionToolbarProps {
  /**
   * The live selection rect (from ArticleView's selectionchange listener).
   * Null when no non-collapsed selection exists within the reading surface.
   * When null, the toolbar does not render.
   */
  selectionRect: DOMRect | null;
  /**
   * The enriched capture result. When null, capture hasn't been computed yet
   * (the toolbar stays hidden). When ok:true, buttons render. When ok:false,
   * the corresponding hint replaces the buttons.
   */
  captureResult: ToolbarCaptureResult | null;
  /** Activate "Highlight" (bare). */
  onHighlight: () => void;
  /** Activate "Highlight + note" (creates + opens note popover in Plan 05-03). */
  onHighlightAndNote: () => void;
  /**
   * Plan 13-11 (G6): invoked when focus EXITS the toolbar root (native
   * focusout, detected via React's onFocusOut on the root — focusout
   * bubbles from the two buttons, so one root handler covers every exit).
   * The owner (ArticleView's dismissToolbarFromFocusExit) clears the
   * toolbar state, unmounting it. Intra-toolbar moves (Highlight →
   * Highlight + note) do NOT fire this — relatedTarget stays inside the
   * root. This is the ONLY Tab-past dismissal mechanism in Chromium, where
   * the live selection survives focus moves so selectionchange never
   * clears anything.
   */
  onFocusExit: () => void;
}

/** Minimum room above the selection for the toolbar to stay above (UI-SPEC §25). */
const FLIP_BELOW_THRESHOLD_PX = 60;

/**
 * Compute the toolbar's position from the selection rect + available space.
 * Returns { left, top } in viewport coordinates for position:fixed.
 *
 * Edge-clamp: pin to --space-sm (8px) from the viewport edge. Flip-below:
 * if the selection top is within FLIP_BELOW_THRESHOLD_PX of the viewport top,
 * place the toolbar below the selection bottom instead.
 */
function computePosition(
  selectionRect: DOMRect,
  toolbarWidth: number,
  toolbarHeight: number,
): { left: number; top: number } {
  const GUTTER = 8; // --space-sm
  // Horizontal: center on the selection midpoint.
  const centerX = selectionRect.left + selectionRect.width / 2;
  let left = centerX - toolbarWidth / 2;

  // Edge-clamp horizontally to the viewport.
  const clampLeft = GUTTER;
  const clampRight = window.innerWidth - GUTTER;
  const maxLeft = clampRight - toolbarWidth;
  if (left < clampLeft) left = clampLeft;
  if (left > maxLeft) left = maxLeft;

  // Vertical: place --space-sm above the selection top, or flip below if too
  // close to the viewport top.
  const flipBelow =
    selectionRect.top < FLIP_BELOW_THRESHOLD_PX + toolbarHeight + GUTTER;
  const top = flipBelow
    ? selectionRect.bottom + GUTTER
    : selectionRect.top - GUTTER - toolbarHeight;

  return { left, top };
}

export function SelectionToolbar({
  selectionRect,
  captureResult,
  onHighlight,
  onHighlightAndNote,
  onFocusExit,
}: SelectionToolbarProps): React.ReactElement | null {
  // Measure the toolbar's rendered size for position computation. A ref +
  // state bridge: the first render places at (0,0) off-screen, we measure, then
  // the second render places at the computed position. Re-runs when the
  // content changes (buttons vs. hint — different widths). The value
  // comparison prevents the infinite update chain the exhaustive-deps rule
  // guards against (only setState when the size actually changed).
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [measuredSize, setMeasuredSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const isHint = captureResult ? !captureResult.ok : true;
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    setMeasuredSize((prev) => {
      if (
        prev !== null &&
        prev.width === rect.width &&
        prev.height === rect.height
      ) {
        return prev; // no change — bail to avoid re-render loop
      }
      return { width: rect.width, height: rect.height };
    });
  }, [isHint]);

  // Plan 13-11 (G6 — announce-on-appear): the text for the visually-hidden
  // polite live region below. Set ONLY on the transition into the buttons
  // variant (captureResult.ok true, previous render was not buttons — the
  // measuredSize prev-guard discipline above), so the region announces
  // "Highlight actions available." exactly when the actionable toolbar
  // appears. Never fires on rect-only updates (selection reshaping) or the
  // hint variants; never touches ArticleView's separate CRUD announcement
  // region (D5-12 copy unchanged).
  const [announceText, setAnnounceText] = useState<string | null>(null);
  const prevButtonsVariantRef = useRef(false);
  const buttonsVariant = captureResult?.ok === true;
  useEffect(() => {
    if (buttonsVariant && !prevButtonsVariantRef.current) {
      setAnnounceText("Highlight actions available.");
    }
    prevButtonsVariantRef.current = buttonsVariant;
  }, [buttonsVariant]);

  // Plan 13-11 (G6): focus-exit detection via the NATIVE focusout event,
  // attached imperatively on the toolbar root (focusout bubbles from the
  // two buttons, so one root listener covers every exit; @types/react
  // 19.2 does not ship React's onFocusOut prop, and React's onBlur maps
  // the non-bubbling blur, which would miss button→button moves). Pairs
  // with the owner's dismissToolbarFromFocusExit (passed as onFocusExit).
  // An intra-toolbar move (Highlight → Highlight + note) has
  // relatedTarget inside the root — return WITHOUT dismissing
  // (intra-toolbar survival is co-owned by ArticleView's containment
  // guard, which holds the toolbar across the Gecko/WebKit selection
  // collapse the same focus move triggers). relatedTarget null (focus to
  // body, or the focused node unmounting) or any node outside the root →
  // dismiss. The pointer path is untouched: a pointer user's focus enters
  // the toolbar only by clicking a button, which activates (the
  // idempotent dismissal is a no-op after the activation's own
  // state-clear), and a selection-then-click-elsewhere user never focuses
  // the toolbar at all, so today's selectionchange-driven behavior
  // governs unchanged.
  const isToolbarRendered = selectionRect !== null && captureResult !== null;
  useEffect(() => {
    const root = toolbarRef.current;
    if (!root) return;
    const handleFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (next instanceof Node && root.contains(next)) {
        return; // intra-toolbar move — the toolbar holds
      }
      onFocusExit();
    };
    root.addEventListener("focusout", handleFocusOut);
    return () => {
      root.removeEventListener("focusout", handleFocusOut);
    };
  }, [onFocusExit, isToolbarRendered]);

  // Don't render if there's no selection rect or no capture result.
  if (!isToolbarRendered) return null;

  // Compute position from the measured size (or a fallback estimate).
  const size = measuredSize ?? { width: 240, height: 44 };
  const { left, top } = computePosition(
    selectionRect,
    size.width,
    size.height,
  );

  const isValid = captureResult.ok;

  return (
    <div
      ref={toolbarRef}
      className="selection-toolbar"
      role="toolbar"
      aria-label="Highlight actions"
      style={{
        left: `${left}px`,
        top: `${top}px`,
      }}
    >
      {/* Plan 13-11 (G6): the polite announce-on-appear live region (the
          repo's established visually-hidden role=status pattern — app.css
          L154). Rendered whenever the toolbar renders (live regions must
          pre-exist to announce reliably); the text is set only on the
          transition into the buttons variant (the effect above). */}
      <p className="visually-hidden" role="status" aria-live="polite">
        {announceText}
      </p>
      {isValid ? (
        <>
          <button
            type="button"
            className="selection-toolbar-button"
            onClick={onHighlight}
          >
            Highlight
          </button>
          <button
            type="button"
            className="selection-toolbar-button"
            onClick={onHighlightAndNote}
          >
            Highlight + note
          </button>
        </>
      ) : (
        <p className="selection-toolbar-hint">
          {/* Phase 19 (D19-05/D19-06): an endpoint inside ineligible content
              refuses the WHOLE selection — the ONE new reader-facing string
              (19-UI-SPEC §Copywriting, verbatim e2e anchor). The retired
              D5-06 multi-block branch + its copy are gone; the defensive
              empty-span composes reader-indistinguishably from empty (zero
              new strings). */}
          {captureResult.reason === "boundary-ineligible"
            ? "This selection includes content that can't be highlighted."
            : captureResult.reason === "overlap"
              ? "This overlaps an existing highlight."
              : captureResult.reason === "empty" ||
                  captureResult.reason === "empty-span"
                ? "Select text to highlight it."
                : "Select readable text to highlight it."}
        </p>
      )}
    </div>
  );
}
