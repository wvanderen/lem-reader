// tests/unit/annotations/list-highlight-render.test.tsx
// Phase 19 Plan 19-03 — scrolling-mode mark coverage for the readable kinds a
// span can cross: list items (incl. NESTED lists — D19-13/D19-15), figure
// captions (D19-01 render-side symmetric offset — Pitfall 1), and code-block
// interiors (verbatim-source segmentation). Plus the first-slice-only DOM id
// discipline (Pitfall 2 — exactly ONE id="hl-<id>" per highlight per mounted
// document; data-highlight-id on every slice).
//
// Semantic-only (React Testing Library, jsdom — NO layout assertions; jsdom
// is NOT authoritative for layout). The slicer-level cells call
// sliceRunsForHighlights / sliceCodeForHighlights directly (pure logic); the
// render cells mount ArticleBody with explicit highlights (the mount
// conventions of blockquote-highlight-render.test.tsx).
//
// All fixtures use ASCII text where character offset === grapheme offset so
// the D-05 join arithmetic stays hand-checkable (items joined by
// BLOCK_SEPARATOR; each item's content blocks joined by BLOCK_SEPARATOR —
// normalizeText.ts L48-52).
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ArticleBody } from "../../../src/content/render/BlockRenderer";
import type { ArticleBodyHighlight } from "../../../src/content/render/BlockRenderer";
import {
  sliceRunsForHighlights,
  sliceCodeForHighlights,
} from "../../../src/annotations/highlightRanges";
import type { HighlightSliceEntry } from "../../../src/annotations/highlightRanges";
import type {
  Block,
  CanonicalArticle,
  InlineRun,
} from "../../../src/content/types";

// ── Article fixture helpers (blockquote-highlight-render.test.tsx shape) ────

const paragraph = (text: string): Block => ({
  kind: "paragraph",
  content: [{ text, marks: [] }],
});

const paragraphRuns = (runs: InlineRun[]): Block => ({
  kind: "paragraph",
  content: runs,
});

const bulletedList = (items: Block[][]): Block => ({
  kind: "bulleted-list",
  items: items.map((content) => ({ content })),
});

const figure = (alt: string, caption: string): Block => ({
  kind: "figure",
  alt,
  src: "https://example.com/picture.png",
  caption: caption.length > 0 ? [{ text: caption, marks: [] }] : [],
});

const codeBlock = (source: string): Block => ({
  kind: "code-block",
  source,
});

const article = (blocks: Block[]): CanonicalArticle => ({
  id: "test-article",
  revision: 1,
  lang: "en",
  provenance: {
    sourceUrl: "https://example.com/test",
    title: "Test Article",
    retrievedAt: "2026-08-07T00:00:00Z",
    originalHtmlHash:
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  blocks,
  footnotes: [],
});

/** Build an ArticleBodyHighlight at the given D-05 article-global position. */
function makeEntry(
  id: string,
  start: number,
  end: number,
  hasNote = false,
): ArticleBodyHighlight {
  return {
    id,
    position: { start, end },
    hasNote,
    status: "confident",
  };
}

/** Build a slicer-entry at the given D-05 article-global position. */
function slicerEntry(
  id: string,
  start: number,
  end: number,
): HighlightSliceEntry {
  return { id, position: { start, end }, hasNote: false, status: "confident" };
}

// ── Task 1: HighlightSlice.isFirst + first-slice-only DOM id (Pitfall 2) ────

describe("HighlightSlice.isFirst — slicer-level (19-03 Task 1)", () => {
  // Two 15/14-grapheme paragraphs; block 1 starts at article-global 16
  // (15 + BLOCK_SEPARATOR).
  const runsA: InlineRun[] = [{ text: "Alpha text here", marks: [] }];
  const runsB: InlineRun[] = [{ text: "Beta text here", marks: [] }];

  it("a highlight spanning two blocks yields isFirst=true on the FIRST block's slice only", () => {
    // Span [5, 20): block 0 intersection [5, 15), block 1 intersection
    // [16, 20) → intra-block [0, 4). The highlight's global start (5) lies
    // in block 0 → first-block slice carries the flag; the continuation
    // slice does not.
    const slicesA = sliceRunsForHighlights(runsA, 0, [slicerEntry("hl-x", 5, 20)], "en");
    const slicesB = sliceRunsForHighlights(runsB, 16, [slicerEntry("hl-x", 5, 20)], "en");

    const markedA = slicesA.filter((s) => s.highlightId === "hl-x");
    const markedB = slicesB.filter((s) => s.highlightId === "hl-x");
    expect(markedA).toHaveLength(1);
    expect(markedB).toHaveLength(1);
    expect(markedA[0]!.isFirst).toBe(true);
    expect(markedB[0]!.isFirst).not.toBeTruthy();
  });

  it("a highlight starting mid-block marks only that block's slice, with isFirst=true", () => {
    // [10, 25) starts inside block 0 → block 0 is the first (and here only)
    // touched block; block 1's slice [16, 25) → intra [0, 9) carries no flag.
    const slicesA = sliceRunsForHighlights(runsA, 0, [slicerEntry("hl-y", 10, 25)], "en");
    const slicesB = sliceRunsForHighlights(runsB, 16, [slicerEntry("hl-y", 10, 25)], "en");

    const markedA = slicesA.filter((s) => s.highlightId === "hl-y");
    const markedB = slicesB.filter((s) => s.highlightId === "hl-y");
    expect(markedA[0]!.isFirst).toBe(true);
    expect(markedB[0]!.isFirst).not.toBeTruthy();
  });

  it("gap slices never carry isFirst (the flag belongs to intersection slices only)", () => {
    const slices = sliceRunsForHighlights(runsA, 0, [slicerEntry("hl-g", 2, 8)], "en");
    // [gap 0..2) + [mark 2..8) + [gap 8..15)
    expect(slices).toHaveLength(3);
    expect(slices[0]!.highlightId).toBeNull();
    expect(slices[0]!.isFirst).toBeUndefined();
    expect(slices[1]!.highlightId).toBe("hl-g");
    expect(slices[1]!.isFirst).toBe(true);
    expect(slices[2]!.highlightId).toBeNull();
    expect(slices[2]!.isFirst).toBeUndefined();
  });
});

describe("first-slice-only DOM id — rendered output (19-03 Task 1, Pitfall 2)", () => {
  it("a multi-slice span renders N marks sharing data-highlight-id but exactly ONE id attribute", () => {
    // Same two-paragraph article; span [5, 20) crosses the BLOCK_SEPARATOR.
    const art = article([paragraph("Alpha text here"), paragraph("Beta text here")]);
    const hl = makeEntry("hl-span", 5, 20);
    const { container } = render(<ArticleBody article={art} highlights={[hl]} />);

    const marks = container.querySelectorAll("mark.highlight");
    expect(marks.length).toBe(2);
    for (const m of marks) {
      expect(m.getAttribute("data-highlight-id")).toBe("hl-span");
      expect(m.getAttribute("tabindex")).toBe("0");
      expect(m.getAttribute("aria-haspopup")).toBe("dialog");
    }
    // THE Pitfall 2 contract: exactly one element carries the DOM id, and it
    // is the span-start slice (inside the FIRST block — the jump target).
    const idCarriers = container.querySelectorAll('[id="hl-hl-span"]');
    expect(idCarriers.length).toBe(1);
    expect(marks[0]!.id).toBe("hl-hl-span");
    expect(marks[1]!.id).toBe("");
    // The id carrier lives in document order before the continuation mark.
    expect(marks[0]!.compareDocumentPosition(marks[1]!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    // The id carrier is inside the first block; the continuation is in the
    // second.
    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs[0]!.contains(idCarriers[0]!)).toBe(true);
    expect(paragraphs[1]!.contains(marks[1]!)).toBe(true);
  });

  it("a single-block highlight keeps its id (the degenerate case regresses nothing)", () => {
    const art = article([paragraph("Alpha text here"), paragraph("Beta text here")]);
    const hl = makeEntry("hl-single", 2, 9);
    const { container } = render(<ArticleBody article={art} highlights={[hl]} />);
    expect(container.querySelectorAll('[id="hl-hl-single"]').length).toBe(1);
  });
});

// ── Task 2: list per-item threading + nested recursion (D19-13/14/15) ───────

describe("list item highlight rendering (19-03 Task 2)", () => {
  // Flat list article. D-05 offsets (BLOCK_SEPARATOR joins items AND the
  // content blocks within an item — normalizeText.ts L48-52):
  //   block 0 "Intro text."            → [0, 11)
  //   block 1 (bulleted list)          → starts 12
  //     item 0 "First item words"      → [12, 28)   (len 16)
  //     item 1 "Second item words"     → [29, 46)   (len 17)
  //     item 2 "Third item words"      → [47, 63)   (len 16)
  //   block 2 "Closing text."          → starts 64
  const flatListArticle = article([
    paragraph("Intro text."),
    bulletedList([
      [paragraph("First item words")],
      [paragraph("Second item words")],
      [paragraph("Third item words")],
    ]),
    paragraph("Closing text."),
  ]);

  it("(a) a highlight entirely inside ONE item marks that item's text — not its siblings", () => {
    // [36, 40) = item 1's intra range [7, 11) = "item" — wholly inside
    // "Second item words".
    const hl = makeEntry("hl-one-item", 36, 40);
    const { container } = render(
      <ArticleBody article={flatListArticle} highlights={[hl]} />,
    );

    const lis = container.querySelectorAll("ul > li");
    expect(lis.length).toBe(3);
    const marksByItem = Array.from(lis).map((li) =>
      li.querySelectorAll("mark.highlight"),
    );
    expect(marksByItem[0]!.length).toBe(0);
    expect(marksByItem[1]!.length).toBe(1);
    expect(marksByItem[2]!.length).toBe(0);
    expect(marksByItem[1]![0]!.textContent).toBe("item");
  });

  it("(b) a span from item 1 into item 3 marks ALL THREE items (interior item is interior to the range — D19-08) with ONE id", () => {
    // [20, 55): item 0 intra [8, 16), item 1 fully covered, item 2 intra
    // [0, 8). The contiguous global range makes item 1 interior — it is
    // marked, never a silent gap.
    const hl = makeEntry("hl-span-items", 20, 55);
    const { container } = render(
      <ArticleBody article={flatListArticle} highlights={[hl]} />,
    );

    const lis = container.querySelectorAll("ul > li");
    for (const li of lis) {
      const mark = li.querySelector("mark.highlight");
      expect(mark, "every crossed item renders a mark").not.toBeNull();
      expect(mark!.getAttribute("data-highlight-id")).toBe("hl-span-items");
    }
    // ONE DOM id for the whole span (Pitfall 2), on the first item.
    const idCarriers = container.querySelectorAll('[id="hl-hl-span-items"]');
    expect(idCarriers.length).toBe(1);
    expect(lis[0]!.contains(idCarriers[0]!)).toBe(true);
  });

  it("(c) D19-14: a highlight starting at an item's first character marks TEXT only — the mark's first character is the item's first text character, no marker inside", () => {
    // Item 0 starts at 12; [12, 17) = "First".
    const hl = makeEntry("hl-item-start", 12, 17);
    const { container } = render(
      <ArticleBody article={flatListArticle} highlights={[hl]} />,
    );

    const li = container.querySelector("ul > li")!;
    const mark = li.querySelector("mark.highlight");
    expect(mark).not.toBeNull();
    // Markers are CSS ::marker chrome — li.textContent is item text ONLY.
    expect(mark!.textContent).toBe("First");
    expect(mark!.textContent![0]).toBe(li.textContent![0]);
    // The diff adds no marker-rendering element (no .marker spans etc.).
    expect(container.querySelectorAll(".marker, .list-marker").length).toBe(0);
  });
});

describe("nested list recursion rendering (19-03 Task 2, D19-15)", () => {
  // Nested article. D-05 offsets:
  //   block 0 "Intro text."                    → [0, 11)
  //   block 1 (outer bulleted list)            → starts 12
  //     item 0 "Outer item lead"               → [12, 27)  (len 15)
  //     item 1 content (joined by "\n"):
  //       paragraph "Outer second"             → [28, 40)  (len 12)
  //       nested bulleted list "Nested sub"    → [41, 56)  (len 15)
  const nestedArticle = article([
    paragraph("Intro text."),
    bulletedList([
      [paragraph("Outer item lead")],
      [
        paragraph("Outer second"),
        bulletedList([[paragraph("Nested sub text")]]),
      ],
    ]),
  ]);

  it("(d) a span covering outer item text through nested sub-item text marks BOTH levels with one identity", () => {
    // [23, 50): outer item 0 intra [11, 15) = "lead"; item 1's paragraph
    // fully covered [28, 40); nested sub-item intra [0, 9) = "Nested su".
    const hl = makeEntry("hl-nested", 23, 50);
    const { container } = render(
      <ArticleBody article={nestedArticle} highlights={[hl]} />,
    );

    // The FIRST ul in document order is the outer list; scope to its direct
    // items (ul > li alone would also match the nested list's li).
    const outerUl = container.querySelector("ul")!;
    const outerLis = outerUl.querySelectorAll(":scope > li");
    expect(outerLis.length).toBe(2);
    // Outer item 0's mark.
    const mark0 = outerLis[0]!.querySelector("mark.highlight");
    expect(mark0).not.toBeNull();
    expect(mark0!.textContent).toBe("lead");
    // Item 1's direct paragraph mark (not the nested one).
    const item1Para = outerLis[1]!.querySelector(":scope > p mark.highlight");
    expect(item1Para).not.toBeNull();
    expect(item1Para!.textContent).toBe("Outer second");
    // The NESTED sub-item renders the same anatomy (D19-15).
    const nestedLi = container.querySelector("ul ul li")!;
    expect(nestedLi).not.toBeNull();
    const nestedMark = nestedLi.querySelector("mark.highlight");
    expect(nestedMark).not.toBeNull();
    expect(nestedMark!.textContent).toBe("Nested su");
    // One identity: every mark shares data-highlight-id; exactly ONE DOM id.
    const marks = container.querySelectorAll("mark.highlight");
    expect(marks.length).toBe(3);
    for (const m of marks) {
      expect(m.getAttribute("data-highlight-id")).toBe("hl-nested");
    }
    expect(container.querySelectorAll('[id="hl-hl-nested"]').length).toBe(1);
  });
});

describe("multi-run list item alignment (19-03 Task 2, Pitfall 4)", () => {
  it("(e) a link mid-item survives a highlight crossing the run boundary (split runs, link preserved)", () => {
    // Item runs: "Alpha " + [linked](https://example.com/x) + " omega".
    // D-05: inlineText collapses + joins with " " → "Alpha linked omega"
    // (18 graphemes — identical to the raw run-sum, the clean-fixture
    // alignment Pitfall 4 locks). Block 1 = the list at [12, 30).
    const art = article([
      paragraph("Intro text."),
      bulletedList([
        [
          paragraphRuns([
            { text: "Alpha ", marks: [] },
            {
              text: "linked",
              marks: [{ type: "link", href: "https://example.com/x" }],
            },
            { text: " omega", marks: [] },
          ]),
        ],
      ]),
    ]);
    // [14, 26) = item intra [2, 14) = "pha linked o" — crosses BOTH run
    // boundaries of the link.
    const hl = makeEntry("hl-multirun", 14, 26);
    const { container } = render(<ArticleBody article={art} highlights={[hl]} />);

    const mark = container.querySelector("ul li mark.highlight");
    expect(mark).not.toBeNull();
    expect(mark!.textContent).toBe("pha linked o");
    // The link run inside the mark stays an <a> (D5-07 discipline holds for
    // list items — the Inline mark-wrapping loop is reused unchanged).
    const anchor = mark!.querySelector("a");
    expect(anchor).not.toBeNull();
    expect(anchor!.getAttribute("href")).toBe("https://example.com/x");
    expect(anchor!.textContent).toBe("linked");
  });
});

// ── Task 3: caption marks + code marks (D19-01 render coverage) ─────────────

describe("figure caption highlight rendering (19-03 Task 3, Pitfall 1 symmetric offset)", () => {
  // Caption article. D-05 offsets:
  //   block 0 "Intro text."                       → [0, 11)
  //   block 1 figure alt="A diagram" (9)          → starts 12
  //            blockText = "A diagram\nChart caption words" (28) → [12, 40)
  //            captionLocalStart = 9 + 1 = 10 → captionGlobalStart = 22;
  //            caption text "Chart caption words" (18) → [22, 40)
  //   block 2 "Closing text."                     → starts 41
  const captionArticle = article([
    paragraph("Intro text."),
    figure("A diagram", "Chart caption words"),
    paragraph("Closing text."),
  ]);

  it("(a) a caption endpoint highlight renders a mark inside figcaption with the correct extent (non-empty alt)", () => {
    // [22, 27) = caption intra [0, 5) = "Chart" — the Pitfall 1 symmetric
    // pair: WITHOUT the alt offset this would mis-slice into the alt's tail.
    const hl = makeEntry("hl-cap", 22, 27);
    const { container } = render(
      <ArticleBody article={captionArticle} highlights={[hl]} />,
    );

    const figcaption = container.querySelector("figcaption");
    expect(figcaption).not.toBeNull();
    const mark = figcaption!.querySelector("mark.highlight");
    expect(mark).not.toBeNull();
    expect(mark!.textContent).toBe("Chart");
    expect(mark!.getAttribute("data-highlight-id")).toBe("hl-cap");
    // Exactly one mark in the whole document — the img/alt surface is plain.
    expect(container.querySelectorAll("mark.highlight").length).toBe(1);
  });

  it("(b) a span from a paragraph through the caption marks BOTH text surfaces, never the img (gap by construction)", () => {
    // [8, 25): paragraph tail [8, 11) = "xt."; figure fully crossed — the
    // alt portion [12, 22) renders UNMARKED (an attribute, not text), the
    // caption head [22, 25) = "Cha" is marked. The fill continues on both
    // sides of the textless gap (D19-02).
    const hl = makeEntry("hl-gap", 8, 25);
    const { container } = render(
      <ArticleBody article={captionArticle} highlights={[hl]} />,
    );

    const marks = container.querySelectorAll("mark.highlight");
    expect(marks.length).toBe(2);
    const paraMark = container.querySelector("p mark.highlight");
    expect(paraMark).not.toBeNull();
    expect(paraMark!.textContent).toBe("xt.");
    const capMark = container.querySelector("figcaption mark.highlight");
    expect(capMark).not.toBeNull();
    expect(capMark!.textContent).toBe("Cha");
    for (const m of marks) {
      expect(m.getAttribute("data-highlight-id")).toBe("hl-gap");
    }
    // The img exists and carries no marks (alt is an attribute surface).
    const img = container.querySelector("figure img");
    expect(img).not.toBeNull();
    expect(img!.querySelectorAll("mark").length).toBe(0);
    // Every figure mark lives inside the figcaption (the gap surface is plain).
    const figcaption = container.querySelector("figcaption")!;
    const figureMarks = container.querySelectorAll("figure mark.highlight");
    expect(figureMarks.length).toBe(1);
    expect(figcaption.contains(figureMarks[0]!)).toBe(true);
  });
});

describe("code-block highlight rendering (19-03 Task 3, verbatim segmentation)", () => {
  const source = "line one\nline two\n  indented";

  it("(c) segments round-trip byte-exact incl. embedded newlines; a mid-source highlight wraps only its extent; whole-block wraps everything", () => {
    // Block at article-global [5, 33) (source is 28 graphemes; raw == norm —
    // code text is verbatim in the D-05 substrate).
    const blockGlobalStart = 5;

    // No highlights → single whole-source segment.
    const whole = sliceCodeForHighlights(source, blockGlobalStart, [], "en");
    expect(whole).toEqual([{ text: source, entry: null }]);

    // Mid-source highlight [12, 20) → source chars [7, 15) = "e\nline t".
    const mid = sliceCodeForHighlights(
      source,
      blockGlobalStart,
      [slicerEntry("hl-mid", 12, 20)],
      "en",
    );
    expect(mid.map((s) => s.text).join("")).toBe(source);
    const marked = mid.filter((s) => s.entry !== null);
    expect(marked).toHaveLength(1);
    expect(marked[0]!.text).toBe("e\nline t");
    expect(marked[0]!.entry!.id).toBe("hl-mid");
    expect(marked[0]!.isFirst).toBe(true);
    // Newlines survive verbatim inside AND around the segment.
    expect(mid[0]!.text.endsWith("line on")).toBe(true);
    expect(mid[2]!.text.startsWith("wo\n")).toBe(true);

    // Whole-code-block highlight [5, 33) → one segment covering everything.
    const all = sliceCodeForHighlights(
      source,
      blockGlobalStart,
      [slicerEntry("hl-all", 5, 33)],
      "en",
    );
    expect(all.map((s) => s.text).join("")).toBe(source);
    expect(all.filter((s) => s.entry !== null)).toHaveLength(1);
    expect(all.find((s) => s.entry !== null)!.text).toBe(source);
  });

  it("(c-render) a mid-code highlight renders a disciplined mark inside <pre><code> with the source intact", () => {
    // Article: paragraph "Intro text." [0, 11); code block starts 12
    // (source is verbatim → blockLen 28; block = [12, 40)).
    const art = article([paragraph("Intro text."), codeBlock(source)]);
    // Highlight [19, 27) = code intra [7, 15) = "e\nline t".
    const hl = makeEntry("hl-code", 19, 27);
    const { container } = render(<ArticleBody article={art} highlights={[hl]} />);

    const code = container.querySelector("pre code");
    expect(code).not.toBeNull();
    // Verbatim fidelity: the rendered code text is EXACTLY the source.
    expect(code!.textContent).toBe(source);
    const mark = code!.querySelector("mark.highlight");
    expect(mark).not.toBeNull();
    expect(mark!.textContent).toBe("e\nline t");
    expect(mark!.getAttribute("data-highlight-id")).toBe("hl-code");
    expect(mark!.getAttribute("tabindex")).toBe("0");
    expect(mark!.getAttribute("aria-haspopup")).toBe("dialog");
    expect(mark!.getAttribute("aria-label")).toContain("e\nline t".slice(0, 80));
    expect(mark!.id).toBe("hl-hl-code");
  });
});

describe("one id across a paragraph→caption→code span (19-03 Task 3, Pitfall 2)", () => {
  it("(d) a span crossing paragraph, figure gap+caption, and code renders marks on every readable fragment with exactly ONE id", () => {
    // D-05 offsets:
    //   block 0 paragraph "Lead text here." (15)       → [0, 15)
    //   block 1 figure alt="Pic" caption "Cap words."  → starts 16
    //            blockText "Pic\nCap words." (14)      → [16, 30)
    //            captionGlobalStart = 16 + 3 + 1 = 20 → caption [20, 30)
    //   block 2 code "ab\ncd" (5)                      → [31, 36)
    const art = article([
      paragraph("Lead text here."),
      figure("Pic", "Cap words."),
      codeBlock("ab\ncd"),
    ]);
    // Span [13, 35): paragraph tail "e.", figure fully crossed (alt
    // unmarked + caption marked in full), code head "ab\nc".
    const hl = makeEntry("hl-mix", 13, 35);
    const { container } = render(<ArticleBody article={art} highlights={[hl]} />);

    const marks = container.querySelectorAll("mark.highlight");
    expect(marks.length).toBe(3);
    for (const m of marks) {
      expect(m.getAttribute("data-highlight-id")).toBe("hl-mix");
    }
    expect(container.querySelector("p mark.highlight")!.textContent).toBe("e.");
    expect(
      container.querySelector("figcaption mark.highlight")!.textContent,
    ).toBe("Cap words.");
    expect(container.querySelector("pre code mark.highlight")!.textContent).toBe(
      "ab\nc",
    );
    // Exactly ONE DOM id, on the span-start slice inside the paragraph.
    const idCarriers = container.querySelectorAll('[id="hl-hl-mix"]');
    expect(idCarriers.length).toBe(1);
    expect(container.querySelector("p")!.contains(idCarriers[0]!)).toBe(true);
  });
});
