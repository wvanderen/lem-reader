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

// ── Span capture (Phase 19 / D19-01 — the retired D5-06 case flips to success) ──

describe("captureSelection — cross-block span success (D19-01; D5-06 retired)", () => {
  it("composes ONE global range from two blocks' endpoints (was: D5-06 rejection)", () => {
    // D19: the D5-06 single-block rule is retired — a selection spanning two
    // eligible mounted blocks captures ONE highlight. Expected offsets derive
    // from the blockText join rule: block 0's full norm length + ONE
    // BLOCK_SEPARATOR + the per-endpoint intra offsets.
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
    expect(result.ok).toBe(true);
    if (result.ok) {
      // b0 norm = "first block" (11 graphemes) + BLOCK_SEPARATOR(1) ⇒ b1's
      // global start = 12. start = 0 + 2; end = 12 + 5 = 17. The composed
      // range [2,17) over "first block\nsecond block" = "rst block\nseco".
      expect(result.position).toEqual({ start: 2, end: 17 } as TextPositionSelector);
      // blockIndex carries the START endpoint's index (span vocabulary).
      expect(result.blockIndex).toBe(0);
    }
  });
});

// ── Span composition cells (Phase 19 / D19 — ANNO-08 + ANNO-12) ──────────────

describe("captureSelection — span composition (D19)", () => {
  it("(a) backwards Range construction composes identically to forwards", () => {
    // D19 / 19-RESEARCH Pitfall 9: DOM Range normalizes start/end to document
    // order regardless of drag direction. jsdom proves the mechanism: setting
    // the END boundary first (the later block — where a backwards drag
    // anchors) then the START boundary yields the identical normalized
    // boundary points, so capture composes the same global range with NO
    // swap step.
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

    // Reverse CONSTRUCTION order: end boundary (later block) first.
    const range = document.createRange();
    range.setEnd(b1.firstChild!, 5);
    range.setStart(b0.firstChild!, 2);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    expect(range.startContainer).toBe(b0.firstChild!);
    expect(range.endContainer).toBe(b1.firstChild!);

    const result = captureSelection(article, document.body);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Same composed selector as the forwards cell above.
      expect(result.position).toEqual({ start: 2, end: 17 } as TextPositionSelector);
    }
  });

  it("(b1) both endpoints carrying data-block-grapheme-start compose (paginated within-page)", () => {
    // D19 / D5-08: a paginated page fragment may mount SLICES of two
    // consecutive blocks (block 0's tail + block 1's head). Both endpoint
    // elements carry the slice attribute; per-endpoint window math composes.
    const article = parseArticle({
      ...baseArticle,
      blocks: [
        { kind: "paragraph", content: [{ text: "first block" }] },
        { kind: "paragraph", content: [{ text: "second block" }] },
      ],
    });
    // Block 0's tail slice: "first block" from grapheme 6 = "block".
    const b0Slice = makeParagraphBlock("block", 0);
    b0Slice.setAttribute("data-block-grapheme-start", "6");
    // Block 1's head slice: "second block" from grapheme 0 = "secon".
    const b1Slice = makeParagraphBlock("secon", 1);
    b1Slice.setAttribute("data-block-grapheme-start", "0");
    document.body.appendChild(b0Slice);
    document.body.appendChild(b1Slice);

    // Select from offset 1 in block 0's slice to offset 3 in block 1's slice.
    const range = document.createRange();
    range.setStart(b0Slice.firstChild!, 1);
    range.setEnd(b1Slice.firstChild!, 3);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    const result = captureSelection(article, document.body);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // A: 0 + (1 + 6) = 7. B: (11 + 1) + 3 = 15. Over
      // "first block\nsecond block", [7,15) = "lock\nsec" — exactly the
      // visible selection ("lock" + "sec").
      expect(result.position).toEqual({ start: 7, end: 15 } as TextPositionSelector);
    }
  });

  it("(b2) whole-block start endpoint + non-zero tail-slice end endpoint compose", () => {
    // D19: the slice attribute may sit on EITHER endpoint — here the END
    // endpoint is block 1's tail slice ("second block" from grapheme 7).
    const article = parseArticle({
      ...baseArticle,
      blocks: [
        { kind: "paragraph", content: [{ text: "first block" }] },
        { kind: "paragraph", content: [{ text: "second block" }] },
      ],
    });
    const b0 = makeParagraphBlock("first block", 0);
    const b1Tail = makeParagraphBlock("block", 1);
    b1Tail.setAttribute("data-block-grapheme-start", "7");
    document.body.appendChild(b0);
    document.body.appendChild(b1Tail);

    const range = document.createRange();
    range.setStart(b0.firstChild!, 2);
    range.setEnd(b1Tail.firstChild!, 3);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    const result = captureSelection(article, document.body);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // A: 0 + 2 = 2. B: 12 + (3 + 7) = 22. [2,22) = "rst block\nsecond blo".
      expect(result.position).toEqual({ start: 2, end: 22 } as TextPositionSelector);
    }
  });

  it("(c1) figure caption endpoint with non-empty alt lands at the caption's true global offset (Pitfall 1)", () => {
    // D19 / 19-RESEARCH Pitfall 1: blockNormalizedText(figure) =
    // [alt, caption].filter(Boolean).join("\n") but the <figure> element's
    // textContent is caption-only. The captionLocalStart alignment makes the
    // stored offset address the true normalized passage (previously it was
    // silently wrong by alt.length + separator).
    const article = parseArticle({
      ...baseArticle,
      blocks: [
        {
          kind: "figure",
          alt: "A chart",
          src: "https://example.com/chart.png",
          caption: [{ text: "Quarterly data" }],
        },
      ],
    });
    const figure = document.createElement("figure");
    figure.setAttribute("data-block-index", "0");
    const img = document.createElement("img");
    img.setAttribute("alt", "A chart");
    const figcaption = document.createElement("figcaption");
    figcaption.textContent = "Quarterly data";
    figure.appendChild(img);
    figure.appendChild(figcaption);
    document.body.appendChild(figure);

    // Select the caption's first 9 chars ("Quarterly"). The figure's
    // textContent is "Quarterly data" (img alt is NOT a text node).
    selectFirstTextNode(figcaption, 0, 9);
    const result = captureSelection(article, document.body);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // captionLocalStart = graphemes("A chart") + BLOCK_SEPARATOR = 7 + 1
      // = 8. Position [8,17) over "A chart\nQuarterly data" = "Quarterly"
      // — the TRUE passage (the pre-fix capture stored [0,9) = "A chart\nQ").
      expect(result.position).toEqual({ start: 8, end: 17 } as TextPositionSelector);
    }
  });

  it("(c2) figure caption endpoint with EMPTY alt lands at caption-local 0", () => {
    // The filter(Boolean) join drops an empty alt entirely — the caption IS
    // the whole normalized text, captionLocalStart = 0.
    const article = parseArticle({
      ...baseArticle,
      blocks: [
        {
          kind: "figure",
          alt: "",
          src: "https://example.com/chart.png",
          caption: [{ text: "Quarterly data" }],
        },
      ],
    });
    const figure = document.createElement("figure");
    figure.setAttribute("data-block-index", "0");
    const img = document.createElement("img");
    img.setAttribute("alt", "");
    const figcaption = document.createElement("figcaption");
    figcaption.textContent = "Quarterly data";
    figure.appendChild(img);
    figure.appendChild(figcaption);
    document.body.appendChild(figure);

    selectFirstTextNode(figcaption, 0, 9);
    const result = captureSelection(article, document.body);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.position).toEqual({ start: 0, end: 9 } as TextPositionSelector);
    }
  });

  it("(d) cross-block span with an unsupported END block refuses whole (boundary-ineligible, no position)", () => {
    // D19-05/D19-08: one eligible endpoint does not rescue an ineligible
    // boundary — the WHOLE selection is refused (never narrowed).
    const article = parseArticle({
      ...baseArticle,
      blocks: [
        { kind: "paragraph", content: [{ text: "readable text" }] },
        {
          kind: "unsupported",
          originalKind: "table",
          plainDescription: "a table we cannot render",
        },
      ],
    });
    const b0 = makeParagraphBlock("readable text", 0);
    const b1 = document.createElement("div");
    b1.setAttribute("data-block-index", "1");
    b1.textContent = "a table we cannot render";
    document.body.appendChild(b0);
    document.body.appendChild(b1);

    const range = document.createRange();
    range.setStart(b0.firstChild!, 0);
    range.setEnd(b1.firstChild!, 5);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    const result = captureSelection(article, document.body);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("boundary-ineligible");
      // Reason-only refusal — NO position (no range-shrinking machinery).
      expect("position" in result).toBe(false);
    }
  });

  it("(e) footnote-body endpoint refuses as ineligible (no data-block-index ancestor)", () => {
    // 19-RESEARCH Pitfall 6: footnote BODIES render without data-block-index
    // (only the reference markers are eligible blocks) — the ancestor walk
    // terminates at readingRoot → the existing "ineligible" reason.
    const article = parseArticle({
      ...baseArticle,
      blocks: [{ kind: "paragraph", content: [{ text: "body text" }] }],
      footnotes: [
        { id: "fn-1", content: [{ text: "footnote body text" }] },
      ],
    });
    const p = makeParagraphBlock("body text", 0);
    const section = document.createElement("section");
    const li = document.createElement("li");
    li.id = "fn-1";
    li.textContent = "footnote body text";
    section.appendChild(li);
    document.body.appendChild(p);
    document.body.appendChild(section);

    // Span from the readable block INTO the footnote body.
    const range = document.createRange();
    range.setStart(p.firstChild!, 0);
    range.setEnd(li.firstChild!, 6);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    const result = captureSelection(article, document.body);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("ineligible");
      expect("position" in result).toBe(false);
    }
  });

  it("(f) whitespace-only selection composes empty → defensive empty-span", () => {
    // D19: a NON-collapsed DOM selection can cover only whitespace that
    // normalizeRunText collapses (raw [6,7) selects the middle space of the
    // 3-space run) — both endpoints map to norm offset 6, so the composed
    // range collapses and capture refuses with "empty-span" (mirrors the
    // TextPositionSelectorSchema end > start refine). No position returned.
    const article = parseArticle({
      ...baseArticle,
      blocks: [
        {
          kind: "paragraph",
          content: [{ text: "hello   world" }],
        },
      ],
    });
    const el = makeParagraphBlock("hello   world", 0);
    document.body.appendChild(el);

    selectFirstTextNode(el, 6, 7); // one raw space among "   "
    const result = captureSelection(article, document.body);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("empty-span");
      expect("position" in result).toBe(false);
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
  it("returns { ok:false, reason:'boundary-ineligible' } when the block is unsupported", () => {
    // D19: an endpoint that RESOLVES to unsupported content now returns the
    // boundary-ineligible reason (D19-05/D19-08 — reject whole) with NO
    // position on the refusal.
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
      expect(result.reason).toBe("boundary-ineligible");
      // Refusals carry NO position (no range-shrinking machinery — D19-05).
      expect("position" in result).toBe(false);
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
