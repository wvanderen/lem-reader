import { describe, expect, it, vi } from "vitest";
import type { Block } from "../../../src/content/types";
import { ArticleSchema } from "../../../src/content/schema";
import {
  articleGraphemeIndex,
  blockNormalizedText,
  graphemeClusters,
} from "../../../src/content/normalizeText";
import {
  blockWindows,
  canUseBlockWindows,
  refineWindow,
} from "../../../src/pagination/blockWindow";
import {
  blockCharOffsetToNormGrapheme,
  blockRawPrefixUtf16,
  blockRawText,
  blockSliceBoundary,
  resolveBlockSlice,
} from "../../../src/pagination/splitBlock";
import { paginateDocument } from "../../../src/pagination/fragment";
import { DiagnosticBus } from "../../../src/measurement/diagnostics";

const paragraph = (text: string): Block => ({
  kind: "paragraph",
  content: [{ text, marks: [] }],
});
const code = (length: number): Block => ({ kind: "code-block", source: "C".repeat(length) });
const figure: Block = { kind: "figure", alt: "", caption: [] };
function article(children: Block[]) {
  return ArticleSchema.parse({
    id: "container-boundaries",
    revision: 1,
    lang: "en",
    provenance: {
      title: "Container boundaries",
      retrievedAt: "2026-01-01T00:00:00Z",
      originalHtmlHash: "container-boundaries",
    },
    blocks: [{ kind: "blockquote", children }],
  });
}
function paginate(
  work: ReturnType<typeof article>,
  start: number,
  end: number,
  rawLength = end - start,
) {
  const count = Math.ceil(rawLength / 20);
  return paginateDocument({
    article: work,
    measurement: {
      schemaVersion: 2,
      computedAt: "2026-01-01T00:00:00Z",
      constraints: {
        font: "serif",
        size: 18,
        measure: 64,
        spacing: "comfortable",
        viewportWidthPx: 800,
        lang: "en",
      },
      scope: {
        articleId: work.id,
        revision: work.revision,
        startBlock: 0,
        endBlock: 1,
        startGrapheme: start,
        endGrapheme: end,
      },
      blocks: [
        {
          kind: "blockquote",
          heightPx: count * 20,
          marginBlockStartPx: 0,
          marginBlockEndPx: 0,
          lineCount: count,
          lineBoxes: Array.from({ length: count }, (_, i) => ({
            charOffset: i * 20,
            topPx: i * 20,
            bottomPx: (i + 1) * 20,
          })),
        },
      ],
    },
    pageContentBoxHeightPx: 200,
    diagnostics: new DiagnosticBus(),
    signal: new AbortController().signal,
  });
}

describe("container boundary regressions", () => {
  it("maps nested Unicode and marked-run offsets onto the original normalized stream", () => {
    const work = article([
      {
        kind: "paragraph",
        content: [
          { text: "  Alpha   ", marks: [] },
          { text: "👩‍🔬 beta ", marks: [{ type: "strong" }] },
        ],
      },
      {
        kind: "numbered-list",
        start: 4,
        items: [
          { content: [paragraph("  Second   passage ")] },
          { content: [{ kind: "blockquote", children: [paragraph("Third witness"), code(12)] }] },
        ],
      },
    ]);
    const block = work.blocks[0]!;
    const raw = blockRawText(block);
    const normalized = blockNormalizedText(block);
    for (const word of ["Alpha", "beta", "Second", "passage", "Third", "witness"]) {
      const rawOffset = raw.indexOf(word);
      const normOffset = graphemeClusters(
        normalized.slice(0, normalized.indexOf(word)),
        "en",
      ).length;
      expect(blockCharOffsetToNormGrapheme(block, rawOffset, "en")).toBe(normOffset);
      const projected = resolveBlockSlice(block, normOffset, Infinity, "en");
      expect(blockRawText(projected)).toBe(raw.slice(blockRawPrefixUtf16(block, normOffset, "en")));
    }
    const insideCode = graphemeClusters(normalized, "en").length - 6;
    expect(blockSliceBoundary(block, insideCode, "en")).toBe(insideCode - 6);
    expect(blockSliceBoundary(block, insideCode, "en", "after")).toBe(insideCode + 6);
  });

  it("does not re-segment the whole container at every split or reflow", () => {
    const work = article([paragraph("X".repeat(20000))]);
    expect(paginate(work, 8000, 16000).status).toBe("ok");
    const segment = vi.spyOn(Intl.Segmenter.prototype, "segment");
    try {
      const result = paginate(work, 8000, 16000);
      expect(result.status).toBe("ok");
      expect(result.pages).toHaveLength(40);
      expect(segment.mock.calls.filter(([text]) => text.length > 8000)).toHaveLength(0);
    } finally {
      segment.mockRestore();
    }
  });

  it("keeps a nested atomic block in exactly one bounded continuation", () => {
    const work = article([paragraph("A".repeat(7800)), code(1000), paragraph("B".repeat(7800))]);
    expect(canUseBlockWindows(work)).toBe(true);
    const projections = blockWindows(work).map((window) =>
      resolveBlockSlice(
        work.blocks[0]!,
        window.startGrapheme ?? 0,
        window.endGrapheme ?? Infinity,
        "en",
      ),
    );
    const children = projections.flatMap((block) =>
      block.kind === "blockquote" ? block.children : [],
    );
    expect(children.filter((block) => block.kind === "code-block")).toHaveLength(1);
    expect(projections.every((block) => blockRawText(block).length <= 8000)).toBe(true);
    expect(projections.map(blockRawText).join("")).toBe(blockRawText(work.blocks[0]!));
  });

  it("does not admit an oversized atomic descendant as a splittable container", () => {
    const work = article([
      paragraph("Before"),
      { kind: "bulleted-list", items: [{ content: [code(9000)] }] },
      paragraph("After"),
    ]);
    expect(canUseBlockWindows(work)).toBe(false);
  });

  it("preserves zero-text visual children at the beginning, seam, and end exactly once", () => {
    const work = article([
      figure,
      paragraph("A".repeat(7998)),
      figure,
      paragraph("B".repeat(9000)),
      figure,
    ]);
    const projections = blockWindows(work).map((window) =>
      resolveBlockSlice(
        work.blocks[0]!,
        window.startGrapheme ?? 0,
        window.endGrapheme ?? Infinity,
        "en",
      ),
    );
    const children = projections.flatMap((block) =>
      block.kind === "blockquote" ? block.children : [],
    );
    expect(children.filter((block) => block.kind === "figure")).toHaveLength(3);
    expect(projections[0]!.kind === "blockquote" && projections[0]!.children[0]!.kind).toBe(
      "figure",
    );
    const last = projections.at(-1)!;
    expect(last.kind === "blockquote" && last.children.at(-1)!.kind).toBe("figure");
  });

  it("reports an honest limit when an atomic descendant cannot fit on a page", () => {
    const work = article([paragraph("A".repeat(150)), code(400), paragraph("B".repeat(500))]);
    const length = articleGraphemeIndex(work).perBlockLengths[0]!;
    const result = paginate(work, 0, length, 1050);
    expect(result.status).toBe("fallback");
    expect(result.reason).toBe("unsplittable-block-overflow");
  });

  it("rejects measurement scopes and refinements inside an atomic descendant", () => {
    const work = article([paragraph("A".repeat(150)), code(120), paragraph("B".repeat(500))]);
    expect(paginate(work, 200, 500).reason).toBe("measurement-scope-mismatch");
    expect(paginate(work, 0, 200).reason).toBe("measurement-scope-mismatch");
    expect(
      refineWindow(work, { startBlock: 0, endBlock: 1 }, { blockIndex: 0, startGrapheme: 200 }),
    ).toBeNull();
  });

  it("never emits a page split inside a nested atomic child", () => {
    const work = article([paragraph("A".repeat(150)), code(120), paragraph("B".repeat(500))]);
    const length = articleGraphemeIndex(work).perBlockLengths[0]!;
    const result = paginate(work, 0, length, 770);
    expect(result.status).toBe("ok");
    const entries = result.pages.flatMap((page) => page.blocks);
    expect(entries.length).toBeGreaterThan(2);
    for (const entry of entries) {
      expect(entry.endGrapheme > 151 && entry.endGrapheme < 271).toBe(false);
    }
    const projections = entries.map((entry) =>
      resolveBlockSlice(work.blocks[0]!, entry.startGrapheme, entry.endGrapheme, "en"),
    );
    expect(projections.map(blockRawText).join("")).toBe(blockRawText(work.blocks[0]!));
  });
});
