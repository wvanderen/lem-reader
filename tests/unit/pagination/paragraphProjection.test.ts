import { describe, expect, it, vi } from "vitest";
import type { Block, InlineRun } from "../../../src/content/types";
import { blockNormalizedText, graphemeClusters } from "../../../src/content/normalizeText";
import {
  blockRawText,
  charOffsetToNormGrapheme,
  rawPrefixUtf16ForNormOffset,
  splitParagraphBlock,
  splitParagraphRuns,
} from "../../../src/pagination/splitBlock";

function paragraph(runs: InlineRun[]): Extract<Block, { kind: "paragraph" }> {
  return { kind: "paragraph", content: runs };
}

const rawText = (runs: InlineRun[]) => runs.map((run) => run.text).join("");

describe("bounded paragraph projection", () => {
  it("does not segment discarded prefixes when projecting a late page after warmup", () => {
    const block = paragraph([{ text: "a".repeat(100_000), marks: [] }]);
    splitParagraphBlock(block, 10, 40, "en");
    const segment = vi.spyOn(Intl.Segmenter.prototype, "segment");
    try {
      const sliced = splitParagraphBlock(block, 90_000, 98_000, "en");
      expect(blockRawText(sliced)).toBe("a".repeat(8_000));
      expect(segment.mock.calls.every(([input]) => input.length <= 8_000)).toBe(true);
    } finally {
      segment.mockRestore();
    }
  });

  it("rebases a run-boundary slice past whitespace assigned to the preceding piece", () => {
    const block = paragraph([
      { text: "abc", marks: [] },
      { text: " ", marks: [] },
      { text: "defghijk", marks: [{ type: "strong" }] },
    ]);
    const sliced = splitParagraphBlock(block, 4, 8, "en");
    expect(blockRawText(sliced)).toBe("defg");
    const prefix = rawPrefixUtf16ForNormOffset(block.content, 4, "en");
    expect(prefix).toBe(4);
    expect(charOffsetToNormGrapheme(block.content, prefix + 2, "en")).toBe(6);
  });

  it("uses the partition's exact raw cut at every whitespace/markup boundary", () => {
    const runs: InlineRun[] = [
      { text: " \t", marks: [] },
      { text: "Alpha  ", marks: [{ type: "em" }] },
      { text: " \t ", marks: [] },
      { text: " β👩‍💻eta", marks: [{ type: "link", href: "https://example.com" }] },
      { text: "\n", marks: [] },
      { text: "last ", marks: [] },
    ];
    const total = graphemeClusters(blockNormalizedText(paragraph(runs)), "en").length;
    for (let start = 1; start <= total; start++) {
      const { before, after } = splitParagraphRuns(runs, start, "en");
      const prefix = rawPrefixUtf16ForNormOffset(runs, start, "en");
      expect(prefix, `cut ${start}`).toBe(rawText(before).length);
      expect(rawText(runs).slice(prefix), `after ${start}`).toBe(rawText(after));
    }
  });

  it("maps the exclusive raw end to the canonical end even with whitespace-only trailing runs", () => {
    const runs: InlineRun[] = [
      { text: "abc", marks: [] },
      { text: " ", marks: [] },
      { text: "def", marks: [] },
      { text: "\t ", marks: [] },
    ];
    expect(charOffsetToNormGrapheme(runs, rawText(runs).length, "en")).toBe(7);
  });

  it("partitions raw source exactly once while preserving marks and UTF-16 boundaries", () => {
    const block = paragraph([
      { text: " \tAlpha  ", marks: [{ type: "strong" }] },
      { text: " \t ", marks: [] },
      { text: "β👩‍💻eta", marks: [{ type: "link", href: "https://example.com" }] },
      { text: " final\n", marks: [] },
    ]);
    const total = graphemeClusters(blockNormalizedText(block), "en").length;
    const pieces = Array.from({ length: total }, (_, start) =>
      splitParagraphBlock(block, start, start + 1, "en"),
    );
    expect(pieces.map(blockRawText).join("")).toBe(blockRawText(block));
    for (const piece of pieces) {
      if (piece.kind !== "paragraph") throw new Error("expected paragraph projection");
      for (const run of piece.content) {
        expect(block.content.some((source) => source.marks === run.marks)).toBe(true);
      }
    }
  });
});
