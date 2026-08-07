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
// Keyboard path (A11Y-01): the toolbar is a pointer/touch affordance; the
// keyboard path is the H/N shortcuts (ArticleView Task 1). Tab still reaches
// the toolbar buttons as a fallback.
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

  // Don't render if there's no selection rect or no capture result.
  if (!selectionRect || !captureResult) return null;

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
          {captureResult.reason === "multi-block"
            ? "Select within a single block to highlight it."
            : captureResult.reason === "overlap"
              ? "This overlaps an existing highlight."
              : captureResult.reason === "empty"
                ? "Select text to highlight it."
                : "Select readable text to highlight it."}
        </p>
      )}
    </div>
  );
}
