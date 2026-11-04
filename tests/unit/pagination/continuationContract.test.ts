// Issue #254 — deterministic continuation CONTRACT coverage, driven through
// the shared harness (continuationContract.ts). The cases generalize the
// landed regression examples (late offsets, whitespace-only runs + mixed
// Unicode, atomic descendants at seams, exactly-once zero-text visual
// ownership, usable-prefix continuation at capacity) into table-driven
// invariant checks whose expectations come from fixture geometry — never
// from re-running the implementation's boundary algorithm.
//
// Fixture geometry note: the window model accumulates BODY-block graphemes
// (no separators), so the first capacity candidate inside the giant block is
// CAPACITY − (preceding blocks' lengths). The cases compute that candidate
// from the article index and place children against it — the geometry is
// the case's own arithmetic, asserted against the harness's extents.
//
// The work-counter scenarios pin bounded PROCESSING (issue #254): after
// legitimate cache preparation, requesting a bounded late slice — repeatedly,
// including through the pagination engine — must not re-segment the entire
// original prefix/container. Browser layout/performance evidence remains a
// separate guarantee (the measurement + perf suites).
import { describe, expect, it } from "vitest";
import type { Block } from "../../../src/content/types";
import {
  articleGraphemeIndex,
  graphemeClusters,
  blockNormalizedText,
} from "../../../src/content/normalizeText";
import { DiagnosticBus } from "../../../src/measurement/diagnostics";
import type { MeasurementResult } from "../../../src/measurement/types";
import { paginateDocument } from "../../../src/pagination/fragment";
import { resolveBlockSlice } from "../../../src/pagination/splitBlock";
import {
  CAPACITY,
  GIANT_BLOCK_INDEX,
  childExtents,
  containerArticle,
  giantParagraph,
  proseArticle,
  runContinuationContract,
  seamAt,
  trackSegmentationWork,
  zeroTextFigure,
} from "./continuationContract";

const norm = (block: Block, lang = "en"): number =>
  graphemeClusters(blockNormalizedText(block), lang).length;

/** The first capacity candidate inside the giant block: CAPACITY − (the
 * preceding body blocks' lengths). The window model accumulates body-block
 * graphemes without separators, so the heading's length is the head budget. */
function capacityCandidate(article: ReturnType<typeof containerArticle>): number {
  return CAPACITY - articleGraphemeIndex(article).perBlockLengths[0]!;
}

describe("continuation contract — late offsets", () => {
  it("slices a 100k-character paragraph so every window owns a bounded, exactly-once slice", () => {
    const text = "a".repeat(100_000);
    const article = proseArticle(text);
    const report = runContinuationContract(article);
    // 100,000 graphemes cannot fit one window: the tiling invariant already
    // required adjacent non-empty windows covering all 100k exactly once.
    expect(report.windows.length).toBeGreaterThan(1);
    // Independent oracle: for a single-run ASCII paragraph the normalized
    // stream IS the raw stream, so each window's slice must be exactly
    // text.slice(start, end) — the implementation's boundary algorithm is
    // never consulted for the expectation.
    const giant = article.blocks[GIANT_BLOCK_INDEX] as Extract<Block, { kind: "paragraph" }>;
    for (const window of report.windows) {
      if (window.startBlock > GIANT_BLOCK_INDEX || window.endBlock <= GIANT_BLOCK_INDEX) continue;
      const start = window.startBlock === GIANT_BLOCK_INDEX ? (window.startGrapheme ?? 0) : 0;
      const end =
        window.endBlock - 1 === GIANT_BLOCK_INDEX ? (window.endGrapheme ?? 100_000) : 100_000;
      const sliced = resolveBlockSlice(giant, start, end, "en");
      expect(sliced).toMatchObject({ kind: "paragraph" });
      expect((sliced as Extract<Block, { kind: "paragraph" }>).content[0]!.text).toBe(
        text.slice(start, end),
      );
      expect(end - start).toBeLessThanOrEqual(CAPACITY);
    }
    expect(report.rawConcat).toBe(text);
  });
});

describe("continuation contract — whitespace-only runs and mixed Unicode", () => {
  it("keeps exactly-once raw coverage across whitespace-only runs, CJK, emoji, and RTL", () => {
    const pieces = [
      " ", // whitespace-only run
      "\t  ", // whitespace-only run
      "Alpha",
      "  β👩‍🔬град ", // combining ZWJ sequence + Cyrillic
      "\u200b", // zero-width space is NOT ASCII whitespace — readable text
      "مرحبا", // RTL
      "\n",
      "東京",
      "   ",
      "fin",
    ];
    // Preserve real InlineRun boundaries. The heading owns 8 graphemes,
    // leaving 7992: 7991 ASCII graphemes + the inter-run separator. Thus
    // the first cut addresses the whitespace-only runs before "Alpha".
    const runs = [
      { text: "a".repeat(7_991), marks: [] },
      ...Array.from({ length: 400 }, () => pieces.map((text) => ({ text, marks: [] }))).flat(),
    ];
    const text = runs.map((run) => run.text).join("");
    const article = proseArticle(runs);
    const giant = article.blocks[GIANT_BLOCK_INDEX]!;
    // Literal normalized contributions give an oracle independent of the
    // slicing implementation, including the spaces it inserts BETWEEN runs.
    const normalizedMixed = "Alpha β👩‍🔬град \u200b مرحبا 東京 fin";
    expect(blockNormalizedText(giant)).toBe(
      "a".repeat(7_991) + " " + Array(400).fill(normalizedMixed).join(" "),
    );
    expect(giant.kind === "paragraph" && giant.content.length).toBe(4_001);
    const report = runContinuationContract(article);
    const [prefix, tail] = seamAt(report, 7_992);
    expect(prefix.kind === "paragraph" && prefix.content.some((run) => run.text === "\t  ")).toBe(
      true,
    );
    expect(blockNormalizedText(tail).startsWith("Alpha")).toBe(true);
    expect(report.windows.length).toBeGreaterThan(1);
    expect(report.rawConcat).toBe(text);
    // The joined raw stream is the round-trip truth: no cluster dropped,
    // duplicated, or re-ordered across any cut — including ZWJ sequences
    // (👩‍🔬 is ONE grapheme, five UTF-16 code units).
    expect(text).toContain("👩‍🔬");
    expect(text).toContain("東京");
  });

  it("slices a container of whitespace-only and mixed-Unicode items exactly once", () => {
    const items: Block[] = [
      giantParagraph(" ".repeat(50)),
      giantParagraph("列表 segunda 详述 🧑‍🚀"),
      giantParagraph("\t"),
      giantParagraph("‏".repeat(20) + "mixed"),
    ];
    const filler = () => giantParagraph("c".repeat(3_000));
    // Pad with ordinary prose so the container exceeds one window while the
    // odd items sit at seams in EVERY region of the stream.
    const children = [filler(), ...items, filler(), ...items, filler()];
    const article = containerArticle("blockquote", children);
    const index = articleGraphemeIndex(article);
    // Fixture guard: the harness's extent arithmetic (separator before each
    // child after the first) must reproduce the article index's own view of
    // the giant block — a drifted fixture would void every expectation.
    expect(childExtents(children).at(-1)!.end).toBe(index.perBlockLengths[GIANT_BLOCK_INDEX]);
    const report = runContinuationContract(article);
    expect(report.windows.length).toBeGreaterThan(1);
  });
});

describe("continuation contract — atomic descendants at seams", () => {
  it("keeps a code descendant straddling the capacity candidate whole, owned by one window", () => {
    // Geometry: children [7000 text, 2000 code, 3000 text]. Extents (the
    // case's own arithmetic): text [0,7000), code [7001,9001), text
    // [9002,12002]. The candidate (8000 − heading) falls INSIDE the code.
    const children = [
      giantParagraph("d".repeat(7_000)),
      { kind: "code-block" as const, source: "C".repeat(2_000), lang: "text" },
      giantParagraph("e".repeat(3_000)),
    ];
    const article = containerArticle("blockquote", children);
    const extents = childExtents(children);
    const [codeStart, codeEnd] = [extents[1]!.start, extents[1]!.end];
    const naive = capacityCandidate(article);
    expect(codeStart).toBeLessThan(naive);
    expect(codeEnd).toBeGreaterThan(naive);

    const report = runContinuationContract(article);
    // The universal contract already proved the code appears whole exactly
    // once (atomic multiset) with exactly-once raw coverage; pin the SEAM:
    // a window ends exactly at the code's start, the next resumes there,
    // and the prefix slice keeps its full usable text — the cut moved OUT
    // of the atomic child, it did not discard the prefix.
    const [prefix, tail] = seamAt(report, codeStart);
    expect(norm(prefix)).toBe(extents[0]!.end);
    expect(norm(prefix)).toBeGreaterThan(0);
    expect(norm(tail)).toBeGreaterThan(codeEnd - codeStart); // the code rides whole
    // And the naive candidate offset is NOT a cut (the atomic moved it).
    const cutOffsets = report.windows
      .filter((w) => w.endBlock - 1 === GIANT_BLOCK_INDEX)
      .map((w) => w.endGrapheme ?? null);
    expect(cutOffsets).not.toContain(naive);
  });

  it("cuts exactly at an atomic child's start when the candidate lands there", () => {
    // Children [7991 text, 900 code, 4000 text]: extents text [0,7991),
    // code [7992,8892) — the candidate (8000 − heading) IS the code's start.
    const children = [
      giantParagraph("f".repeat(7_991)),
      { kind: "code-block" as const, source: "K".repeat(900), lang: "text" },
      giantParagraph("g".repeat(4_000)),
    ];
    const article = containerArticle("bulleted-list", children);
    const extents = childExtents(children);
    expect(extents[1]!.start).toBe(capacityCandidate(article));
    const report = runContinuationContract(article);
    const [prefix, tail] = seamAt(report, extents[1]!.start);
    // The prefix owns the first item exactly (usable prefix); the resuming
    // slice OPENS with the code item whole (the multiset invariant proved
    // "whole" — here it is the tail's first rendered item).
    expect(norm(prefix)).toBe(extents[0]!.end);
    expect(tail.kind === "bulleted-list" ? tail.items[0]?.content[0] : undefined).toMatchObject({
      kind: "code-block",
    });
  });
});

describe("continuation contract — exactly-once zero-text visual ownership", () => {
  const filler = () => giantParagraph("h".repeat(4_500));

  it("owns each zero-text figure exactly once at the head, a seam, and the tail", () => {
    for (const position of ["head", "seam", "tail"] as const) {
      const children =
        position === "head"
          ? [zeroTextFigure(), filler(), filler()]
          : position === "seam"
            ? [filler(), zeroTextFigure(), filler()]
            : [filler(), filler(), zeroTextFigure()];
      const article = containerArticle("blockquote", children);
      const report = runContinuationContract(article);
      expect(report.windows.length).toBeGreaterThan(1);
      // The universal zero-text invariant (count preserved across slices)
      // ran inside runContinuationContract; pin the position-specific shape:
      if (position === "head") {
        const first = report.projections[0]!;
        expect(first.kind === "blockquote" ? first.children[0]!.kind : undefined).toBe("figure");
      }
      if (position === "tail") {
        const last = report.projections.at(-1)!;
        expect(last.kind === "blockquote" ? last.children.at(-1)!.kind : undefined).toBe("figure");
      }
    }
  });

  it("owns a zero-text figure once at EVERY list-item boundary (table over seams)", () => {
    const item = () => giantParagraph("i".repeat(3_200));
    for (let before = 0; before <= 3; before++) {
      const children = [item(), item(), item()];
      children.splice(before, 0, zeroTextFigure());
      const article = containerArticle("numbered-list", children);
      const report = runContinuationContract(article);
      expect(report.windows.length).toBeGreaterThan(1);
      // Exactly-once zero-text ownership is asserted by the contract for
      // every placement; slices still concatenate to the source raw text.
    }
  });
});

describe("continuation contract — usable prefix at capacity", () => {
  it("keeps a usable prefix when the capacity candidate is rounded out of an atomic child", () => {
    // Children [7500 text, 1200 code, 4000 text]: extents text [0,7500),
    // code [7501,8701) — the candidate (8000 − heading) falls 300 graphemes
    // INTO the code. The cut rounds back to the code's start; the prefix
    // window keeps its whole first item rather than being discarded.
    const children = [
      giantParagraph("j".repeat(7_500)),
      { kind: "code-block" as const, source: "U".repeat(1_200), lang: "text" },
      giantParagraph("k".repeat(4_000)),
    ];
    const article = containerArticle("blockquote", children);
    const extents = childExtents(children);
    const naive = capacityCandidate(article);
    expect(extents[1]!.start).toBeLessThan(naive);
    expect(extents[1]!.end).toBeGreaterThan(naive);
    const report = runContinuationContract(article);
    const [prefix] = seamAt(report, extents[1]!.start);
    // Discarded-capacity regression shapes: an empty slice, or a slice
    // reduced to the separator. The prefix must be the full first item.
    expect(norm(prefix)).toBe(extents[0]!.end);
    expect(norm(prefix)).toBeGreaterThan(1);
  });
});

// ── Bounded processing (issue #254) — deterministic work counters ──────────

const LINE_PX = 20;
const GRAPHEMES_PER_LINE = 20;

/** Trusted measurement for a window: one row per covered block; `lines[row]`
 * line boxes of GRAPHEMES_PER_LINE graphemes each (row kinds mirror the
 * article blocks). The synthetic lineBox fixture shape the landed engine
 * tests use. */
function sliceMeasurement(
  article: ReturnType<typeof containerArticle>,
  window: { startBlock: number; endBlock: number; startGrapheme?: number; endGrapheme?: number },
  lines: number[],
): MeasurementResult {
  const rowCount = window.endBlock - window.startBlock;
  return {
    schemaVersion: 2,
    constraints: {
      font: "serif",
      size: 18,
      measure: 64,
      spacing: "comfortable",
      viewportWidthPx: 800,
      lang: "en",
    },
    computedAt: "2026-01-01T00:00:00Z",
    scope: {
      articleId: article.id,
      revision: article.revision,
      startBlock: window.startBlock,
      endBlock: window.endBlock,
      ...(window.startGrapheme !== undefined ? { startGrapheme: window.startGrapheme } : {}),
      ...(window.endGrapheme !== undefined ? { endGrapheme: window.endGrapheme } : {}),
    },
    blocks: Array.from({ length: rowCount }, (_, row) => {
      const count = lines[row] ?? lines.at(-1)!;
      return {
        kind: article.blocks[window.startBlock + row]!.kind,
        heightPx: count * LINE_PX,
        marginBlockStartPx: 0,
        marginBlockEndPx: 0,
        lineCount: count,
        lineBoxes: Array.from({ length: count }, (_, k) => ({
          charOffset: k * GRAPHEMES_PER_LINE,
          topPx: k * LINE_PX,
          bottomPx: (k + 1) * LINE_PX,
        })),
      };
    }),
  };
}

function paginateWindow(
  article: ReturnType<typeof containerArticle>,
  window: { startBlock: number; endBlock: number; startGrapheme?: number; endGrapheme?: number },
  lines: number[],
) {
  return paginateDocument({
    article,
    measurement: sliceMeasurement(article, window, lines),
    pageContentBoxHeightPx: 200,
    diagnostics: new DiagnosticBus(),
    signal: new AbortController().signal,
  });
}

describe("bounded processing — late slices do not reprocess the original prefix", () => {
  it("a repeated late paragraph slice stays bounded by the slice, not the 100k prefix", () => {
    const article = proseArticle("m".repeat(100_000));
    const giant = article.blocks[GIANT_BLOCK_INDEX] as Extract<Block, { kind: "paragraph" }>;
    // Legitimate cache preparation: a full early walk warms the per-article
    // and per-run caches the reader's forward walk genuinely holds by then.
    runContinuationContract(article);
    const track = trackSegmentationWork();
    try {
      for (let repeat = 0; repeat < 3; repeat++) {
        const slice = resolveBlockSlice(giant, 90_000, 98_000, "en");
        expect(slice).toMatchObject({ kind: "paragraph" });
        expect((slice as Extract<Block, { kind: "paragraph" }>).content[0]!.text).toBe(
          "m".repeat(8_000),
        );
      }
      const stats = track.stats();
      // Decisive against the regression shape: the discarded prefix is
      // 90,000 UTF-16 units. Three late slices together must not approach
      // it, and no single segmentation input may exceed the slice bound.
      expect(stats.maxUtf16).toBeLessThanOrEqual(CAPACITY);
      expect(stats.totalUtf16).toBeLessThan(24_000);
    } finally {
      track.stop();
    }
  });

  it("a repeated late CONTAINER slice (and its engine pagination) stays bounded by the slice", () => {
    const children = [
      giantParagraph("n".repeat(30_000)),
      { kind: "code-block" as const, source: "W".repeat(1_000), lang: "text" },
      giantParagraph("o".repeat(30_000)),
    ];
    const article = containerArticle("blockquote", children, "bounded-container");
    const report = runContinuationContract(article);
    const lateWindow = report.windows.at(-2)!; // a genuinely deep window
    expect(lateWindow.startBlock).toBe(GIANT_BLOCK_INDEX);
    expect(lateWindow.startGrapheme ?? 0).toBeGreaterThan(15_000);
    const fullLines = Math.ceil(CAPACITY / GRAPHEMES_PER_LINE);
    // Warm: paginate the FIRST window so every cache the walk legitimately
    // holds (article index, container source index, per-run clusters) is hot.
    expect(paginateWindow(article, report.windows[0]!, [1, fullLines]).status).toBe("ok");
    const track = trackSegmentationWork();
    try {
      for (let repeat = 0; repeat < 2; repeat++) {
        const result = paginateWindow(article, lateWindow, [fullLines, 1]);
        expect(result.status).toBe("ok");
        expect(result.pages.length).toBeGreaterThan(0);
      }
      const stats = track.stats();
      // The original container is ~61k graphemes; two late engine passes
      // (plus their projections/rebases) may not re-segment anything like it.
      expect(stats.maxUtf16).toBeLessThanOrEqual(CAPACITY);
      expect(stats.totalUtf16).toBeLessThan(20_000);
    } finally {
      track.stop();
    }
  });
});
