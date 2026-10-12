// src/reader/annotations/anchorPosition.ts
// Issue #175 — the ONE viewport-positioning helper for the reader's anchored
// floating surfaces (the selection toolbar + the lightweight highlight
// controls share the identical geometry contract, UI-SPEC §Interaction 25):
// centered on the anchor midpoint, placed --space-sm above the anchor top,
// edge-clamped to --space-sm from the viewport, flipping BELOW the anchor
// when there is no headroom. Pure — the callers measure their own rendered
// size and feed it in.

/** Minimum room above the anchor for the surface to stay above (UI-SPEC §25). */
export const FLIP_BELOW_THRESHOLD_PX = 60;

/**
 * The effective CSS page zoom (body-level `zoom` — the WCAG 1.4.4 400%-zoom
 * scenario). Under zoom, an anchor's getBoundingClientRect reads in VISUAL
 * viewport pixels while a position:fixed descendant's left/top coordinates
 * are in the ZOOMED local space — the caller divides by this factor so the
 * surface lands ON the anchor visually. Also mirrored into CSS by hosts that
 * cap their width in viewport units (100vw reads visual px; the cap applies
 * in the zoomed local space). No zoom support (older engines) or a
 * degenerate value → 1 (no compensation).
 */
export function effectiveZoom(): number {
  try {
    const raw = getComputedStyle(document.body).zoom;
    const parsed = typeof raw === "number" ? raw : Number.parseFloat(raw ?? "");
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  } catch {
    /* getComputedStyle unavailable (jsdom) — keep 1 */
  }
  return 1;
}

/**
 * Compute a floating surface's position from the anchor rect + its measured
 * size. Returns { left, top } in viewport coordinates for position:fixed.
 */
export function computeAnchoredPosition(
  anchorRect: DOMRect,
  surfaceWidth: number,
  surfaceHeight: number,
): { left: number; top: number } {
  const GUTTER = 8; // --space-sm
  // Horizontal: center on the anchor midpoint.
  const centerX = anchorRect.left + anchorRect.width / 2;
  let left = centerX - surfaceWidth / 2;

  // Edge-clamp horizontally to the viewport.
  const clampLeft = GUTTER;
  const clampRight = window.innerWidth - GUTTER;
  const maxLeft = clampRight - surfaceWidth;
  if (left < clampLeft) left = clampLeft;
  if (left > maxLeft) left = maxLeft;

  // Vertical: place --space-sm above the anchor top, or flip below if too
  // close to the viewport top.
  const flipBelow = anchorRect.top < FLIP_BELOW_THRESHOLD_PX + surfaceHeight + GUTTER;
  const top = flipBelow ? anchorRect.bottom + GUTTER : anchorRect.top - GUTTER - surfaceHeight;

  // CSS page-zoom compensation (see effectiveZoom).
  const zoom = effectiveZoom();
  return { left: left / zoom, top: top / zoom };
}
