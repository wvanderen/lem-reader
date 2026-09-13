import { describe, expect, it } from "vitest";
import {
  _test_computeEntryListItemSlices,
} from "../../../src/pagination/fragmentRenderer";
import { sliceRunsForHighlights } from "../../../src/annotations/highlightRanges";
import type { HighlightSliceEntry } from "../../../src/annotations/highlightRanges";
import { blockGraphemeLength } from "../../../src/pagination/anchor";
import { splittingGraphemeLength } from "../../../src/pagination/splitBlock";
import { articleGraphemeIndex, blockNormalizedText } from "../../../src/content/normalizeText";
import type { Block } from "../../../src/content/types";
import {
  HARD_ARTICLE,
  HIGHLIGHT_SETS,
  run,
} from "./fixtures";
import {
  clipRange,
  sliceBlockHighlights,
} from "./unifiedHighlightSlicer";
import {
  resolveBlockSlice,
  splittingBlockGraphemeLength,
} from "./legacyFreeze";

function toEntry(h: {
  id: string;
  position: { start: number; end: number };
  hasNote: boolean;
  status: "confident" | "ambiguous" | "orphan";
}): HighlightSliceEntry {
  return {
    id: h.id,
    position: h.position,
    hasNote: h.hasNote,
    status: h.status,
  };
}

describe("clipRange — the single intersection primitive", () => {
  it("clips on both sides and drops empty intersections (end-exclusive)", () => {
    expect(clipRange({ start: 5, end: 20 }, 0, 10)).toEqual({ start: 5, end: 10 });
    expect(clipRange({ start: 0, end: 30 }, 10, 20)).toEqual({ start: 10, end: 20 });
    expect(clipRange({ start: 0, end: 10 }, 10, 20)).toBeNull();
    expect(clipRange({ start: 20, end: 30 }, 0, 20)).toBeNull();
    expect(clipRange({ start: 12, end: 18 }, 12, 18)).toEqual({ start: 12, end: 18 });
  });
});

describe("article-global origin reproduces the scrolling twin", () => {
  const index = articleGraphemeIndex(HARD_ARTICLE);
  const allEntries = Object.values(HIGHLIGHT_SETS)
    .flat()
    .map(toEntry);

  it("paragraph: unified slices === sliceRunsForHighlights at the block's global start", () => {
    const blockIndex = 1;
    const para = HARD_ARTICLE.blocks[blockIndex]! as Extract<Block, { kind: "paragraph" }>;
    const origin = index.blockStartOffsets[blockIndex]!;
    const visibleLen = blockGraphemeLength(para, "en");
    const result = sliceBlockHighlights({
      block: para,
      origin,
      visibleLen,
      highlights: allEntries,
      measureChild: blockGraphemeLength,
      lang: "en",
    });
    const active = allEntries.filter(
      (h) => clipRange(h.position, origin, origin + visibleLen) !== null,
    );
    expect(result).toEqual({
      kind: "inline",
      slices: sliceRunsForHighlights(para.content, origin, active, "en"),
    });
  });

  it("isFirst: the block containing the highlight's global start claims the id; continuations do not", () => {
    const head = HIGHLIGHT_SETS.crossBlockHead![0]!;
    const block0 = HARD_ARTICLE.blocks[0]!;
    const block1 = HARD_ARTICLE.blocks[1]!;
    const r0 = sliceBlockHighlights({
      block: block0,
      origin: 0,
      visibleLen: blockGraphemeLength(block0, "en"),
      highlights: [head],
      measureChild: blockGraphemeLength,
      lang: "en",
    });
    const r1 = sliceBlockHighlights({
      block: block1,
      origin: index.blockStartOffsets[1]!,
      visibleLen: blockGraphemeLength(block1, "en"),
      highlights: [head],
      measureChild: blockGraphemeLength,
      lang: "en",
    });
    expect(r0?.kind).toBe("inline");
    expect(r1?.kind).toBe("inline");
    if (r0?.kind !== "inline" || r1?.kind !== "inline") return;
    const marked0 = r0.slices.find((s) => s.highlightId === head.id)!;
    const marked1 = r1.slices.find((s) => s.highlightId === head.id)!;
    expect(marked0.isFirst).toBe(true);
    expect(marked1.isFirst).toBe(false);
  });

  it("figure caption (alt present): marked slice text === the caption substring", () => {
    const blockIndex = 6;
    const figure = HARD_ARTICLE.blocks[blockIndex]!;
    const origin = index.blockStartOffsets[blockIndex]!;
    const result = sliceBlockHighlights({
      block: figure,
      origin,
      visibleLen: blockGraphemeLength(figure, "en"),
      highlights: HIGHLIGHT_SETS.captionWithAlt!,
      measureChild: blockGraphemeLength,
      lang: "en",
    });
    expect(result?.kind).toBe("caption");
    if (result?.kind !== "caption") return;
    const marked = result.slices.filter((s) => s.highlightId === "hl-k");
    expect(marked.map((s) => s.runs.map((r) => r.text).join(""))).toEqual([
      "caption prose",
    ]);
    expect(marked[0]!.isFirst).toBe(true);
  });

  it("figure caption (empty alt): caption window starts at origin (no alt+separator offset)", () => {
    const blockIndex = 7;
    const figure = HARD_ARTICLE.blocks[blockIndex]!;
    const origin = index.blockStartOffsets[blockIndex]!;
    const result = sliceBlockHighlights({
      block: figure,
      origin,
      visibleLen: blockGraphemeLength(figure, "en"),
      highlights: HIGHLIGHT_SETS.captionNoAltCross!,
      measureChild: blockGraphemeLength,
      lang: "en",
    });
    expect(result?.kind).toBe("caption");
    if (result?.kind !== "caption") return;
    const marked = result.slices.filter((s) => s.highlightId === "hl-l");
    expect(marked.map((s) => s.runs.map((r) => r.text).join(""))).toEqual([
      "No-alt caption.",
    ]);
  });

  it("code-block: segments concatenate to the exact source; marked segment carries the substring", () => {
    const blockIndex = 5;
    const code = HARD_ARTICLE.blocks[blockIndex]! as Extract<Block, { kind: "code-block" }>;
    const origin = index.blockStartOffsets[blockIndex]!;
    const result = sliceBlockHighlights({
      block: code,
      origin,
      visibleLen: blockGraphemeLength(code, "en"),
      highlights: [...HIGHLIGHT_SETS.codeHead!, ...HIGHLIGHT_SETS.codeMid!],
      measureChild: blockGraphemeLength,
      lang: "en",
    });
    expect(result?.kind).toBe("code");
    if (result?.kind !== "code") return;
    expect(result.segments.map((s) => s.text).join("")).toBe(code.source);
    const marked = result.segments.filter((s) => s.entry !== null);
    expect(marked.map((s) => s.text)).toEqual(["const a ", "return a"]);
    expect(marked.every((s) => s.isFirst === true)).toBe(true);
  });

  it("end-exclusive boundary highlight produces no slice on the next block", () => {
    const block2 = HARD_ARTICLE.blocks[2]!;
    const origin = index.blockStartOffsets[2]!;
    const result = sliceBlockHighlights({
      block: block2,
      origin,
      visibleLen: blockGraphemeLength(block2, "en"),
      highlights: HIGHLIGHT_SETS.endExclusiveAtBlockBoundary!,
      measureChild: blockGraphemeLength,
      lang: "en",
    });
    expect(result).toBeNull();
  });

  it("blockquote in article-global origin: blockquote child highlight window uses the D-05 measure", () => {
    const blockIndex = 3;
    const quote = HARD_ARTICLE.blocks[blockIndex]!;
    const origin = index.blockStartOffsets[blockIndex]!;
    const result = sliceBlockHighlights({
      block: quote,
      origin,
      visibleLen: blockGraphemeLength(quote, "en"),
      highlights: HIGHLIGHT_SETS.quoteChildBoundary!,
      measureChild: blockGraphemeLength,
      lang: "en",
    });
    expect(result?.kind).toBe("children");
    if (result?.kind !== "children") return;
    expect(result.perChild).toHaveLength(3);
    expect(result.perChild[0]).toBeUndefined();
    const child1 = result.perChild[1]!;
    const marked = child1.find((s) => s.highlightId === "hl-e")!;
    expect(marked.runs.map((r) => r.text).join("")).toBe("ner heading");
    const child2 = result.perChild[2]!;
    const marked2 = child2.find((s) => s.highlightId === "hl-e")!;
    expect(marked2.runs.map((r) => r.text).join("")).toBe("Quote ");
  });
});

describe("entry-local origin reproduces the paginated twin", () => {
  const listBlock = HARD_ARTICLE.blocks[4]! as Extract<
    Block,
    { kind: "bulleted-list" }
  >;

  it("whole list: unified items slices === _test_computeEntryListItemSlices", () => {
    const entries: HighlightSliceEntry[] = [
      { id: "hl-x", position: { start: 5, end: 40 }, hasNote: false, status: "confident" },
      { id: "hl-y", position: { start: 44, end: 60 }, hasNote: true, status: "confident" },
    ];
    const legacy = _test_computeEntryListItemSlices(listBlock, entries, "en");
    const result = sliceBlockHighlights({
      block: listBlock,
      origin: 0,
      visibleLen: splittingBlockGraphemeLength(listBlock, "en"),
      highlights: entries,
      measureChild: splittingBlockGraphemeLength,
      lang: "en",
    });
    expect(result).toEqual({ kind: "items", slices: legacy });
  });

  it("sliced list (resolved sub-range): unified === legacy twin on the resolved block", () => {
    const resolved = resolveBlockSlice(listBlock, 3, 40, "en");
    expect(resolved.kind).toBe("bulleted-list");
    const resolvedList = resolved as Extract<Block, { kind: "bulleted-list" }>;
    const entries: HighlightSliceEntry[] = [
      { id: "hl-x", position: { start: 0, end: 20 }, hasNote: false, status: "confident" },
    ];
    const legacy = _test_computeEntryListItemSlices(
      resolvedList,
      entries,
      "en",
    );
    const result = sliceBlockHighlights({
      block: resolvedList,
      origin: 0,
      visibleLen: splittingBlockGraphemeLength(resolvedList, "en"),
      highlights: entries,
      measureChild: splittingBlockGraphemeLength,
      lang: "en",
    });
    expect(result).toEqual({ kind: "items", slices: legacy });
  });

  it("empty item still consumes its separator (offset accounting parity)", () => {
    const withEmpty: Extract<Block, { kind: "bulleted-list" }> = {
      kind: "bulleted-list",
      items: [
        { content: [] },
        { content: [{ kind: "paragraph", content: [run("After empty")] }] },
      ],
    };
    const entries: HighlightSliceEntry[] = [
      { id: "hl-z", position: { start: 1, end: 7 }, hasNote: false, status: "confident" },
    ];
    const legacy = _test_computeEntryListItemSlices(withEmpty, entries, "en");
    const result = sliceBlockHighlights({
      block: withEmpty,
      origin: 0,
      visibleLen: splittingBlockGraphemeLength(withEmpty, "en"),
      highlights: entries,
      measureChild: splittingBlockGraphemeLength,
      lang: "en",
    });
    expect(result).toEqual({ kind: "items", slices: legacy });
    expect(result?.kind).toBe("items");
    if (result?.kind !== "items") return;
    const leaf = result.slices.perItem[1]?.[0];
    expect(Array.isArray(leaf)).toBe(true);
    if (!Array.isArray(leaf)) return;
    const marked = leaf.find((s) => s.highlightId === "hl-z")!;
    expect(marked.runs.map((r) => r.text).join("")).toBe("After ");
  });
});

describe("documented blocker: D-05 measure vs splitting measure diverge on multi-run leaves", () => {
  it("blockGraphemeLength (D-05) != splittingGraphemeLength for runs whose joins differ", () => {
    const multiRun: Block = {
      kind: "paragraph",
      content: [run("See"), run("docs")],
    };
    expect(blockNormalizedText(multiRun)).toBe("See docs");
    expect(blockGraphemeLength(multiRun, "en")).toBe(8);
    expect(splittingGraphemeLength(multiRun, "en")).toBe(7);
  });

  it("one slicer, explicit measure: each measure reproduces its own renderer's coordinate system", () => {
    const multiRun: Block = {
      kind: "paragraph",
      content: [run("See"), run("docs")],
    };
    const entries: HighlightSliceEntry[] = [
      { id: "hl-m", position: { start: 5, end: 8 }, hasNote: false, status: "confident" },
    ];
    const d05 = sliceBlockHighlights({
      block: multiRun,
      origin: 0,
      visibleLen: 8,
      highlights: entries,
      measureChild: blockGraphemeLength,
      lang: "en",
    });
    const splitting = sliceBlockHighlights({
      block: multiRun,
      origin: 0,
      visibleLen: 7,
      highlights: [{ ...entries[0]!, position: { start: 5, end: 7 } }],
      measureChild: splittingBlockGraphemeLength,
      lang: "en",
    });
    expect(d05?.kind).toBe("inline");
    expect(splitting?.kind).toBe("inline");
    if (d05?.kind !== "inline" || splitting?.kind !== "inline") return;
    expect(d05.slices.some((s) => s.highlightId === "hl-m")).toBe(true);
    expect(splitting.slices.some((s) => s.highlightId === "hl-m")).toBe(true);
  });
});

describe("no-highlight and non-readable kinds thread nothing", () => {
  it("returns null when no highlight intersects the visible window", () => {
    const para = HARD_ARTICLE.blocks[1]!;
    expect(
      sliceBlockHighlights({
        block: para,
        origin: 0,
        visibleLen: 10,
        highlights: [toEntry({ id: "hl-far", position: { start: 50, end: 60 }, hasNote: false, status: "confident" })],
        measureChild: blockGraphemeLength,
        lang: "en",
      }),
    ).toBeNull();
  });

  it("footnote-reference and unsupported kinds produce no slices (D19-02)", () => {
    const footnoteRef: Block = {
      kind: "footnote-reference",
      footnoteId: "fn-1",
      marker: "[1]",
    };
    const unsupported: Block = {
      kind: "unsupported",
      originalKind: "table",
      plainDescription: "A table was here.",
    };
    for (const block of [footnoteRef, unsupported]) {
      const entries: HighlightSliceEntry[] = [
        { id: "hl-any", position: { start: 0, end: 100 }, hasNote: false, status: "confident" },
      ];
      expect(
        sliceBlockHighlights({
          block,
          origin: 0,
          visibleLen: 100,
          highlights: entries,
          measureChild: blockGraphemeLength,
          lang: "en",
        }),
      ).toBeNull();
    }
  });
});
