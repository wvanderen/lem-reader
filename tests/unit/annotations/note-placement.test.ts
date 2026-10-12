// tests/unit/annotations/note-placement.test.ts
// Issue #176 — the note editor's placement ladder (notePlacement.ts), pure
// and layout-engine-free. The ladder is the issue's core contract:
//
//   1. GUTTER first (desktop): beside the article column, vertically near
//      the passage — the passage stays fully readable, nothing covered.
//      Larger gutter wins; a symmetric tie goes inline-start (left), keeping
//      the inline end clear for the annotations drawer.
//   2. ABOVE / BELOW next: entirely above or below the anchor (never
//      obscuring the passage), above preferred, edge-clamped.
//   3. SHEET when neither vertical side fits (small viewports, screen-
//      filling selections): docked to the viewport bottom.
//   4. CENTER fallback when no visible anchor exists (degenerate/off-
//      viewport rect, missing column) — the caller keeps UA centering.
//
// Real-browser placement geometry is the Playwright suite's truth
// (note-placement.spec.ts); these tests pin the DECISION math.
import { describe, expect, it } from "vitest";
import {
  chooseNoteEditorPlacement,
  visibleHighlightRect,
  NOTE_EDITOR_MIN_GUTTER_WIDTH,
  NOTE_EDITOR_PREFERRED_WIDTH,
  type EditorSize,
  type ViewportRect,
} from "../../../src/reader/annotations/notePlacement";

const VP: ViewportRect = { left: 0, top: 0, width: 1280, height: 720 };
const EDITOR: EditorSize = { width: 380, height: 220 };

function rect(left: number, top: number, width: number, height: number): DOMRect {
  // DOMRect is available in the jsdom/node test environment (vitest node
  // ≥18 exposes the global); construct plainly so callers read honest values.
  return new DOMRect(left, top, width, height);
}

// The centered article column on a 1280 viewport (symmetric 280px bands
// — wide enough for the gutter placement to win).
const SYMMETRIC_COLUMN = rect(296, 0, 688, 720); // -> 280px bands

describe("chooseNoteEditorPlacement — centered fallback (no visible anchor)", () => {
  it("falls back to center when the anchor rect is null", () => {
    const p = chooseNoteEditorPlacement(null, EDITOR, VP, SYMMETRIC_COLUMN);
    expect(p.mode).toBe("center");
  });

  it("falls back to center for a degenerate (zero-size) anchor — the jsdom register", () => {
    const p = chooseNoteEditorPlacement(rect(0, 0, 0, 0), EDITOR, VP, SYMMETRIC_COLUMN);
    expect(p.mode).toBe("center");
  });

  it("falls back to center when the anchor is entirely outside the viewport (scrolled-away drawer path)", () => {
    const above = chooseNoteEditorPlacement(rect(300, -400, 200, 60), EDITOR, VP, SYMMETRIC_COLUMN);
    const below = chooseNoteEditorPlacement(rect(300, 800, 200, 60), EDITOR, VP, SYMMETRIC_COLUMN);
    expect(above.mode).toBe("center");
    expect(below.mode).toBe("center");
  });

  it("falls back to center when the column rect is missing", () => {
    const p = chooseNoteEditorPlacement(rect(300, 300, 200, 30), EDITOR, VP, null);
    expect(p.mode).toBe("center");
  });
});

describe("chooseNoteEditorPlacement — gutter (desktop preferred)", () => {
  it("places beside the column (left gutter on a symmetric layout), vertically centered on the passage", () => {
    const anchor = rect(400, 300, 300, 30);
    const p = chooseNoteEditorPlacement(anchor, EDITOR, VP, SYMMETRIC_COLUMN);
    expect(p.mode).toBe("gutter");
    // Right edge flush with the column's left edge minus the 8px margin.
    expect(p.left + p.width).toBeCloseTo(SYMMETRIC_COLUMN.left - 8, 5);
    // Vertical midpoint tracks the passage midpoint.
    expect(p.top + EDITOR.height / 2).toBeCloseTo(anchor.top + anchor.height / 2, 5);
  });

  it("prefers the larger band when only one side fits", () => {
    // Column pushed right: only the left band is wide enough.
    const column = rect(990, 0, 280, 720); // left band 974, right band ~-16
    const anchor = rect(1050, 300, 100, 30);
    const p = chooseNoteEditorPlacement(anchor, EDITOR, VP, column);
    expect(p.mode).toBe("gutter");
    expect(p.left + p.width).toBeCloseTo(column.left - 8, 5);
  });

  it("caps the gutter editor at the preferred width when the band is wider", () => {
    const column = rect(900, 0, 280, 720); // left band 884 → width caps at 380
    const anchor = rect(950, 300, 100, 30);
    const p = chooseNoteEditorPlacement(anchor, EDITOR, VP, column);
    expect(p.mode).toBe("gutter");
    expect(p.width).toBe(NOTE_EDITOR_PREFERRED_WIDTH);
  });

  it("skips the gutter when both sides are narrower than the usable minimum", () => {
    // 250px bands each — below the 280 minimum → ladder continues.
    expect(NOTE_EDITOR_MIN_GUTTER_WIDTH).toBeGreaterThan(250);
    const p = chooseNoteEditorPlacement(
      rect(400, 300, 300, 30),
      EDITOR,
      VP,
      rect(266, 0, 748, 720),
    );
    expect(p.mode).toBe("above");
  });

  it("clamps the gutter editor inside the viewport vertically near the viewport edges", () => {
    const nearTop = chooseNoteEditorPlacement(rect(400, 10, 300, 20), EDITOR, VP, SYMMETRIC_COLUMN);
    expect(nearTop.mode).toBe("gutter");
    expect(nearTop.top).toBeGreaterThanOrEqual(8);
    const nearBottom = chooseNoteEditorPlacement(
      rect(400, 680, 300, 30),
      EDITOR,
      VP,
      SYMMETRIC_COLUMN,
    );
    expect(nearBottom.mode).toBe("gutter");
    expect(nearBottom.top + EDITOR.height).toBeLessThanOrEqual(720 - 8 + 0.001);
  });
});

describe("chooseNoteEditorPlacement — above / below (never obscuring the passage)", () => {
  // Bands too narrow (264px each — below the usable minimum) → the
  // vertical ladder runs.
  const NARROW_COLUMN = rect(280, 0, 720, 720);

  it("places entirely ABOVE the anchor when there is headroom", () => {
    const anchor = rect(300, 500, 300, 30);
    const p = chooseNoteEditorPlacement(anchor, EDITOR, VP, NARROW_COLUMN);
    expect(p.mode).toBe("above");
    expect(p.top + EDITOR.height).toBeLessThanOrEqual(anchor.top - 8 + 0.001);
    // Horizontally centered on the passage midpoint, edge-clamped.
    expect(p.left + p.width / 2).toBeCloseTo(anchor.left + anchor.width / 2, 5);
  });

  it("flips BELOW the anchor when it sits near the viewport top", () => {
    const anchor = rect(300, 40, 300, 30);
    const p = chooseNoteEditorPlacement(anchor, EDITOR, VP, NARROW_COLUMN);
    expect(p.mode).toBe("below");
    expect(p.top).toBeGreaterThanOrEqual(anchor.bottom + 8 - 0.001);
  });

  it("falls to the sheet when the passage leaves no headroom on either vertical side", () => {
    // Top at 200 (no 228px headroom above), bottom at 600 (no 228px room
    // below) — the editor must dock without covering judgment calls.
    const anchor = rect(300, 200, 300, 400);
    const p = chooseNoteEditorPlacement(anchor, EDITOR, VP, NARROW_COLUMN);
    expect(p.mode).toBe("sheet");
    expect(p.top + EDITOR.height).toBeLessThanOrEqual(720 + 0.001);
  });
});

describe("chooseNoteEditorPlacement — bottom sheet (last resort)", () => {
  it("docks to the viewport bottom for a screen-filling selection", () => {
    const anchor = rect(0, 0, 1280, 720);
    const p = chooseNoteEditorPlacement(anchor, EDITOR, VP, rect(0, 0, 1280, 720));
    expect(p.mode).toBe("sheet");
    expect(p.top + EDITOR.height).toBeCloseTo(720, 5);
    expect(p.width).toBeLessThanOrEqual(380);
  });

  it("uses the full-width cap on narrow viewports and stays inside them", () => {
    const vp: ViewportRect = { left: 0, top: 0, width: 375, height: 667 };
    const anchor = rect(8, 40, 359, 560); // a tall passage near the top
    const p = chooseNoteEditorPlacement(anchor, EDITOR, vp, rect(8, 0, 359, 667));
    expect(p.mode).toBe("sheet");
    expect(p.width).toBeLessThanOrEqual(375 - 16);
    expect(p.left).toBeGreaterThanOrEqual(8);
    expect(p.top + EDITOR.height).toBeLessThanOrEqual(667 + 0.001);
  });

  it("respects a shrunk visual viewport (mobile keyboard) when docking", () => {
    const keyboardVp: ViewportRect = { left: 0, top: 0, width: 375, height: 300 };
    const anchor = rect(8, 20, 359, 120);
    const p = chooseNoteEditorPlacement(anchor, EDITOR, keyboardVp, rect(8, 0, 359, 667));
    expect(p.mode).toBe("sheet");
    expect(p.top + EDITOR.height).toBeLessThanOrEqual(300 + 0.001);
  });
});

describe("oversized editor geometry", () => {
  it("bounds the gutter height before clamping a keyboard-shrunk viewport", () => {
    const p = chooseNoteEditorPlacement(
      rect(400, 40, 200, 20),
      EDITOR,
      { ...VP, height: 150 },
      SYMMETRIC_COLUMN,
    );
    expect(p.mode).toBe("gutter");
    expect(p.top).toBe(8);
  });
});

describe("highlight fragment bounds", () => {
  it("includes later visible fragments when the first is scrolled away", () => {
    const first = document.createElement("mark");
    const second = document.createElement("mark");
    for (const mark of [first, second]) {
      mark.className = "highlight";
      mark.dataset.highlightId = "span";
      document.body.append(mark);
    }
    Object.defineProperty(first, "getClientRects", { value: () => [rect(100, -100, 100, 20)] });
    Object.defineProperty(second, "getClientRects", {
      value: () => [rect(100, 50, 100, 20), rect(100, 100, 200, 20)],
    });
    try {
      const bounds = visibleHighlightRect("span");
      expect(bounds?.top).toBe(50);
      expect(bounds?.bottom).toBe(120);
      expect(bounds?.width).toBe(200);
    } finally {
      first.remove();
      second.remove();
    }
  });
});
