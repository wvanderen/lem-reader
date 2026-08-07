// tests/unit/annotations/capture-offset-mapping.test.ts
// DOM Range → D-05 grapheme offset mapping with whitespace-collapse
// correction (ANNO-01 capture substrate). Mirrors tests/unit/restoreLocation
// .test.ts conventions: parseArticle helper, baseArticle fixture, HTMLElement
// stubs built via document.createElement (jsdom provides textContent + the
// Selection/Range APIs sufficient for the pure mapping logic).
//
// Covers:
//   - single-block valid capture with whitespace-collapse correction
//     (the load-bearing Pitfall 1 case);
//   - run-boundary capture (norm inserts a space raw lacks);
//   - multi-block rejection (D5-06);
//   - empty/collapsed rejection;
//   - ineligible rejection (unsupported block — D5-07).
//
// jsdom is NOT authoritative for layout (STACK.md). These tests exercise ONLY
// the offset-mapping + structural logic; cross-browser selection parity is
// validated in Plan 05-05 Playwright specs.
import { describe, expect, it, beforeEach } from "vitest";
import { ArticleSchema } from "../../../src/content/schema";
import { captureSelection } from "../../../src/annotations/capture";
import type { CanonicalArticle } from "../../../src/content/types";
import type { TextPositionSelector } from "../../../src/content/normalizeText";

function parseArticle(raw: unknown): CanonicalArticle {
  return ArticleSchema.parse(raw);
}

const baseArticle = {
  id: "capture-test",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/capture",
    title: "Capture Test",
    retrievedAt: "2026-01-01T00:00:00Z",
    originalHtmlHash: "sha256:capture",
  },
};

/** Build a <p data-block-index="i"> element whose textContent is `text`. */
function makeParagraphBlock(text: string, index: number): HTMLElement {
  const el = document.createElement("p");
  el.setAttribute("data-block-index", String(index));
  el.textContent = text;
  return el;
}

/**
 * Programmatically select raw chars [start, end) inside `el`'s first text
 * node. jsdom's Selection/Range is sufficient for this — we exercise the
 * offset-mapping logic, not layout.
 */
function selectFirstTextNode(
  el: HTMLElement,
  start: number,
  end: number,
): void {
  const textNode = el.firstChild!;
  const range = document.createRange();
  range.setStart(textNode, start);
  range.setEnd(textNode, end);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
}

beforeEach(() => {
  // Ensure a clean selection state across tests.
  const sel = window.getSelection();
  sel?.removeAllRanges();
  // Reset the body.
  document.body.innerHTML = "";
});

// ── Single-block valid capture with whitespace-collapse correction ───────────

describe("captureSelection — whitespace-collapse mapping (Pitfall 1)", () => {
  it("maps a selection over collapsed whitespace to the normalized grapheme range", () => {
    // Article block: normalizeRunText collapses the 3-space run to 1 space.
    const article = parseArticle({
      ...baseArticle,
      blocks: [
        {
          kind: "paragraph",
          content: [{ text: "hello   world" }],
        },
      ],
    });
    // DOM renders the run text verbatim (3 spaces). blockEl.textContent =
    // "hello   world" but blockNormalizedText = "hello world".
    const el = makeParagraphBlock("hello   world", 0);
    document.body.appendChild(el);

    // Select raw chars [3,9) = "lo   w" (l-o-space-space-space-w). The 3 raw
    // spaces collapse to 1 normalized space → normalized [3,7) = "lo w".
    selectFirstTextNode(el, 3, 9);

    const result = captureSelection(article, document.body);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.blockIndex).toBe(0);
      expect(result.position).toEqual({ start: 3, end: 7 } as TextPositionSelector);
    }
  });

  it("maps a selection with leading/trailing whitespace that normalizeRunText trims", () => {
    // Run text has leading + trailing whitespace that normalizeRunText trims.
    const article = parseArticle({
      ...baseArticle,
      blocks: [
        {
          kind: "paragraph",
          content: [{ text: "  hello world  " }],
        },
      ],
    });
    const el = makeParagraphBlock("  hello world  ", 0);
    document.body.appendChild(el);
    // The normalized text is "hello world" (12 chars, no leading/trailing ws).
    // Select raw chars [2,7) = "hello" — these survive trimming unchanged.
    selectFirstTextNode(el, 2, 7);
    const result = captureSelection(article, document.body);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.position).toEqual({ start: 0, end: 5 } as TextPositionSelector);
    }
  });
});

// ── Run-boundary capture (norm inserts a separator raw lacks) ────────────────

describe("captureSelection — run-boundary mapping (norm joins runs with ' ')", () => {
  it("maps a selection spanning a run boundary where normalized text inserts a space", () => {
    // Two runs, each clean: normalizeRunText is a no-op per run; inlineText
    // joins with " " → "hello world". The DOM concatenates the two run text
    // nodes into "helloworld" (no separator).
    const article = parseArticle({
      ...baseArticle,
      blocks: [
        {
          kind: "paragraph",
          content: [
            { text: "hello" },
            { text: "world" },
          ],
        },
      ],
    });
    const el = document.createElement("p");
    el.setAttribute("data-block-index", "0");
    // Mirror InlineRenderer: each run is a separate text node.
    el.appendChild(document.createTextNode("hello"));
    el.appendChild(document.createTextNode("world"));
    document.body.appendChild(el);

    // Select across the boundary: raw chars [3,8) = "lowor" (l-o from run 1,
    // w-o-r from run 2). Normalized "hello world"[3,8) = "lo wo" (the space
    // is inserted at the boundary).
    const tn1 = el.firstChild!;
    const tn2 = el.lastChild!;
    const range = document.createRange();
    range.setStart(tn1, 3);
    range.setEnd(tn2, 3);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    const result = captureSelection(article, document.body);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Raw offset 3 (in tn1) → abs raw grapheme 3 → map → norm 3.
      // Raw offset 8 (abs: tn1 has 5 chars + tn2 offset 3 = 8) → map → norm 9
      // (the boundary space inserted by normalizeText is INSIDE the selection
      // because the reader's selection spans the run boundary; the highlight
      // renders as <mark>lo wor</mark> over norm "hello world").
      // norm = "hello world": h(0)e(1)l(2)l(3)o(4) (5)w(6)o(7)r(8)l(9)d(10).
      // map: r0-4 → n0-4. r5 'w' non-ws, n5 ' ' ws → skip norm space, r5→n6.
      // So raw[3]→3, raw[8]→9. Position = {start:3, end:9} = "lo wor".
      expect(result.position).toEqual({ start: 3, end: 9 } as TextPositionSelector);
    }
  });
});

// ── Article-global offset (multi-block accumulation) ─────────────────────────

describe("captureSelection — article-global offset accumulation", () => {
  it("adds the block's article-global start offset to the intra-block range", () => {
    const article = parseArticle({
      ...baseArticle,
      blocks: [
        { kind: "heading", level: 2, content: [{ text: "Title" }] },
        {
          kind: "paragraph",
          content: [{ text: "second block body text" }],
        },
      ],
    });
    // Block 0 normalized = "Title" (5 graphemes). Block 1 starts at
    // 5 + BLOCK_SEPARATOR(1) = 6.
    const block1 = makeParagraphBlock("second block body text", 1);
    document.body.appendChild(block1);
    // Select "block" inside block 1: raw chars [7,12) = "block".
    selectFirstTextNode(block1, 7, 12);
    const result = captureSelection(article, document.body);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Intra-block [7,12); blockGlobalStart = 6; article-global = [13,18).
      expect(result.position.start).toBe(13);
      expect(result.position.end).toBe(18);
    }
  });
});

// ── Multi-block rejection (D5-06) ────────────────────────────────────────────

describe("captureSelection — multi-block rejection (D5-06)", () => {
  it("returns { ok:false, reason:'multi-block' } when endpoints fall in different blocks", () => {
    const article = parseArticle({
      ...baseArticle,
      blocks: [
        { kind: "paragraph", content: [{ text: "first block" }] },
        { kind: "paragraph", content: [{ text: "second block" }] },
      ],
    });
    const b0 = makeParagraphBlock("first block", 0);
    const b1 = makeParagraphBlock("second block", 1);
    document.body.appendChild(b0);
    document.body.appendChild(b1);

    // Select from b0's text node into b1's text node.
    const range = document.createRange();
    range.setStart(b0.firstChild!, 2);
    range.setEnd(b1.firstChild!, 5);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    const result = captureSelection(article, document.body);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("multi-block");
    }
  });
});

// ── Empty / collapsed rejection ──────────────────────────────────────────────

describe("captureSelection — empty / collapsed rejection", () => {
  it("returns { ok:false, reason:'empty' } when there is no selection", () => {
    const article = parseArticle({
      ...baseArticle,
      blocks: [{ kind: "paragraph", content: [{ text: "hello" }] }],
    });
    makeParagraphBlock("hello", 0);
    // No selection set — window.getSelection() is collapsed.
    const result = captureSelection(article, document.body);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("empty");
    }
  });

  it("returns { ok:false, reason:'empty' } when the selection is collapsed", () => {
    const article = parseArticle({
      ...baseArticle,
      blocks: [{ kind: "paragraph", content: [{ text: "hello world" }] }],
    });
    const el = makeParagraphBlock("hello world", 0);
    document.body.appendChild(el);
    // Collapsed range (start === end).
    const range = document.createRange();
    range.setStart(el.firstChild!, 3);
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    const result = captureSelection(article, document.body);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("empty");
    }
  });
});

// ── Ineligible rejection (D5-07 — unsupported block) ─────────────────────────

describe("captureSelection — ineligible rejection (D5-07)", () => {
  it("returns { ok:false, reason:'ineligible' } when the block is unsupported", () => {
    const article = parseArticle({
      ...baseArticle,
      blocks: [
        {
          kind: "unsupported",
          originalKind: "table",
          plainDescription: "a table we cannot render",
        },
      ],
    });
    const el = document.createElement("div");
    el.setAttribute("data-block-index", "0");
    el.textContent = "a table we cannot render";
    document.body.appendChild(el);
    selectFirstTextNode(el, 2, 6);
    const result = captureSelection(article, document.body);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("ineligible");
    }
  });

  it("returns { ok:false, reason:'ineligible' } when no data-block-index ancestor exists", () => {
    const article = parseArticle({
      ...baseArticle,
      blocks: [{ kind: "paragraph", content: [{ text: "loose text" }] }],
    });
    // Text directly in body — no data-block-index ancestor.
    const el = document.createElement("p");
    el.textContent = "loose text";
    document.body.appendChild(el);
    selectFirstTextNode(el, 0, 4);
    const result = captureSelection(article, document.body);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("ineligible");
    }
  });
});
