// src/reader/annotations/notePlacement.ts
// Issue #176 — the ONE placement decision for the reading note editor
// (NotePopover's dialog + its delete-confirm view, which share the editor's
// footprint). The acceptance ladder, chosen ON OPEN and re-run only when the
// viewport changes (resize / mobile keyboard):
//
//   1. GUTTER — desktop-first: sit BESIDE the passage in the empty margin
//      next to the article column, vertically near the passage. The passage
//      stays fully readable; no article text is covered at all. Requires the
//      column rect and a gutter at least MIN width wide; the larger gutter
//      wins (tie → inline-start/left, keeping the inline end clear for the
//      annotations drawer).
//   2. ABOVE / BELOW — when no gutter fits: place the editor entirely above
//      or entirely below the anchor rect (never obscuring the passage),
//      above first (the §25 flip contract's preference order), clamped into
//      the viewport horizontally.
//   3. SHEET — when neither vertical side fits (small viewports, screen-
//      filling selections): dock to the viewport bottom with the editor's
//      bounded footprint, preserving everything above it.
//   4. CENTER — no visible anchor (drawer-path edits on scrolled-away
//      passages, jsdom/degenerate rects): the UA-centered dialog (the
//      pre-#176 look; no inline geometry, CSS keeps margin:auto).
//
// Space math runs in the SAME visual-pixel space as getBoundingClientRect
// (the computeAnchoredPosition convention); the caller divides the returned
// left/top/width by effectiveZoom() before applying them as position:fixed
// inline styles in the zoomed local space. Pure — all geometry is passed in,
// so the ladder is unit-testable without a layout engine.
//
// Layout stability (the issue's core invariant): the chooser only ever
// positions a top-layer position:fixed dialog — article flow content is
// never touched, so opening, typing, confirming, and closing cannot shift
// the article or change pagination.

/** Preferred editor width (the CSS .highlight-popover cap — one number). */
export const NOTE_EDITOR_PREFERRED_WIDTH = 380;

/** Narrowest usable gutter (a writing surface below this is cramped enough
 *  that above/below at full width serves the reader better). */
export const NOTE_EDITOR_MIN_GUTTER_WIDTH = 280;

/** Edge margin — --space-sm (the §25 clamp register). */
export const NOTE_EDITOR_EDGE_GUTTER = 8;

export type NoteEditorPlacementMode = "gutter" | "above" | "below" | "sheet" | "center";

export interface NoteEditorPlacement {
  mode: NoteEditorPlacementMode;
  left: number;
  top: number;
  width: number;
}

/** A viewport-shaped rect in the same pixel space as the anchor/column rects
 *  (the layout viewport at {0,0}, or the visualViewport rect when the mobile
 *  keyboard has shrunk the visible area). */
export interface ViewportRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface EditorSize {
  width: number;
  height: number;
}

function intersectsViewport(anchor: DOMRect, vp: ViewportRect): boolean {
  return (
    anchor.width > 0 &&
    anchor.height > 0 &&
    anchor.right > vp.left &&
    anchor.left < vp.left + vp.width &&
    anchor.bottom > vp.top &&
    anchor.top < vp.top + vp.height
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Choose the note editor's placement. `anchorRect` is the highlight mark's
 * viewport rect (visual px), `editorSize` the dialog's measured box,
 * `viewportRect` the available viewport (visual-viewport rect when the
 * keyboard is up), `columnRect` the visible article column (null when the
 * reading surface is absent — jsdom/unit renders).
 */
export function chooseNoteEditorPlacement(
  anchorRect: DOMRect | null,
  editorSize: EditorSize,
  viewportRect: ViewportRect,
  columnRect: DOMRect | null,
): NoteEditorPlacement {
  const edge = NOTE_EDITOR_EDGE_GUTTER;
  const vpRight = viewportRect.left + viewportRect.width;
  const vpBottom = viewportRect.top + viewportRect.height;

  // Full-width cap (narrow viewports — the 320px reflow contract keeps the
  // editor inside the viewport with edge margins).
  const fullWidth = Math.min(
    NOTE_EDITOR_PREFERRED_WIDTH,
    Math.max(viewportRect.width - 2 * edge, edge),
  );

  const noAnchor =
    anchorRect === null || columnRect === null || !intersectsViewport(anchorRect, viewportRect);
  if (noAnchor) {
    // Center fallback — the caller leaves the dialog's CSS centering in
    // place (no data-placement, no inline geometry).
    return { mode: "center", left: 0, top: 0, width: fullWidth };
  }

  const anchor = anchorRect;

  // ── 1. GUTTER (preferred): beside the column, vertically near the passage ──
  // Each gutter is the band between the viewport edge margin and the column
  // edge margin — the editor never touches either edge.
  const leftBand = columnRect.left - edge - (viewportRect.left + edge);
  const rightBand = vpRight - edge - (columnRect.right + edge);
  const gutterWidth = (space: number) => Math.min(NOTE_EDITOR_PREFERRED_WIDTH, Math.max(space, 0));
  const leftFits = leftBand >= NOTE_EDITOR_MIN_GUTTER_WIDTH;
  const rightFits = rightBand >= NOTE_EDITOR_MIN_GUTTER_WIDTH;
  if (leftFits || rightFits) {
    // Larger band wins; a tie (the common symmetric layout) goes to the
    // inline-start/left gutter, keeping the inline end clear for the
    // annotations drawer.
    const useLeft = leftBand >= rightBand;
    const width = gutterWidth(useLeft ? leftBand : rightBand);
    const left = useLeft ? columnRect.left - edge - width : columnRect.right + edge;
    const height = Math.min(editorSize.height, Math.max(viewportRect.height - 2 * edge, 0));
    const top = clamp(
      anchor.top + anchor.height / 2 - height / 2,
      viewportRect.top + edge,
      vpBottom - edge - height,
    );
    return { mode: "gutter", left, top, width };
  }

  // ── 2. ABOVE / BELOW: never obscure the passage, edge-clamped ──────────────
  const width = fullWidth;
  const height = Math.min(editorSize.height, Math.max(viewportRect.height - 2 * edge, 0));
  const left = clamp(
    anchor.left + anchor.width / 2 - width / 2,
    viewportRect.left + edge,
    vpRight - edge - width,
  );
  const aboveTop = anchor.top - edge - height;
  if (aboveTop >= viewportRect.top + edge) {
    return { mode: "above", left, top: aboveTop, width };
  }
  const belowTop = anchor.bottom + edge;
  if (belowTop + height <= vpBottom - edge) {
    return { mode: "below", left, top: belowTop, width };
  }

  // ── 3. SHEET: dock to the viewport bottom, preserve what's above ───────────
  const sheetTop = Math.max(vpBottom - height, viewportRect.top + edge);
  return { mode: "sheet", left, top: sheetTop, width };
}

/**
 * The visible article column's viewport rect, or null. The measurement-clone
 * discipline (visibleMarkForId): the paginated surface keeps a hidden
 * .article-body-measurement clone mounted — geometry decisions read the
 * VISIBLE reading surface only. Returns the FIRST visible .article-body.
 */
export function visibleReadingColumnRect(): DOMRect | null {
  const bodies = document.querySelectorAll<HTMLElement>(".article-body");
  for (const body of bodies) {
    if (body.closest(".article-body-measurement")) continue;
    return body.getBoundingClientRect();
  }
  return null;
}

/**
 * The available viewport for placement: the visualViewport rect when the
 * browser exposes one (the mobile-keyboard case — the keyboard shrinks the
 * visual viewport, and the editor must stay inside the VISIBLE area), else
 * the full layout viewport. Values are CSS px in layout-viewport coordinates,
 * the same space position:fixed offsets apply in.
 */
export function currentViewportRect(): ViewportRect {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  if (vv) {
    return { left: vv.offsetLeft, top: vv.offsetTop, width: vv.width, height: vv.height };
  }
  return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
}

/** Bounds of every on-screen fragment of a highlight, excluding measurement clones.
 * A span can cross blocks or inline elements; its first mark is only a focus anchor. */
export function visibleHighlightRect(highlightId: string): DOMRect | null {
  const viewport = currentViewportRect();
  const rects = Array.from(
    document.querySelectorAll<HTMLElement>("mark.highlight[data-highlight-id]"),
  )
    .filter(
      (mark) =>
        mark.dataset.highlightId === highlightId && !mark.closest(".article-body-measurement"),
    )
    .flatMap((mark) => Array.from(mark.getClientRects()))
    .filter((rect) => intersectsViewport(rect, viewport));
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  return new DOMRect(left, top, right - left, bottom - top);
}
