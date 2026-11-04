// Issue #254 — reusable deterministic contract coverage for bounded
// continuations (generalizes the landed giant-prose/container regressions).
//
// The regression tests that fixed prefix-sized segmentation, whitespace-
// coordinate drift, discarded usable capacity, duplicated atomic descendants,
// and omitted zero-text figures each pinned ONE worked example. This harness
// turns their shared expectations into INVARIANTS any continuation case can
// be driven through:
//
//   1. TILING — the windows' article-global [start, end) ranges partition
//      [0, totalGraphemes) exactly: adjacent, ordered, no gap, no overlap.
//      (Plain prefix-sum arithmetic — not the implementation's cut rule.)
//   2. BOUNDED — every window's projection of the giant block carries at most
//      the window capacity of normalized graphemes, and at least one (a
//      continuation with no usable content is a discarded slice).
//   3. EXACTLY-ONCE RAW COVERAGE — the projections' raw texts concatenate to
//      the giant block's raw text: every source character owned once, in
//      order, none dropped, none duplicated, no whitespace invented.
//   4. ATOMIC DESCENDANTS WHOLE AND ONCE — the multiset of atomic
//      descendants' raw texts across the projections equals the source's
//      (a split or duplicated code block/heading/figure changes its text).
//   5. ZERO-TEXT VISUALS OWNED ONCE — zero-text figures appear across all
//      projections exactly as often as in the source (dropped or duplicated
//      ownership both fail a count).
//
// Expectations come from fixture geometry (child lengths + separator
// arithmetic owned HERE) and the invariants above — never from re-running
// the implementation's boundary algorithm (blockSliceBoundary). Where a case
// needs the implementation's projector to build the slices under test, the
// ASSERTIONS stay property-shaped.
//
// The work-counter seam (trackSegmentationWork) pins bounded PROCESSING:
// after legitimate cache preparation, a bounded late slice must not
// repeatedly segment its entire original prefix/container. Browser layout
// and wall-time evidence stays a separate guarantee (the measurement and
// perf suites own that; this seam owns the deterministic work bound).
import { vi } from "vitest";
import type { CanonicalArticle, Block } from "../../../src/content/types";
import { ArticleSchema } from "../../../src/content/schema";
import {
  BLOCK_SEPARATOR,
  articleGraphemeIndex,
  blockNormalizedText,
  graphemeClusters,
} from "../../../src/content/normalizeText";
import {
  blockWindows,
  windowGlobalEnd,
  windowGlobalStart,
} from "../../../src/pagination/blockWindow";
import type { BlockWindow } from "../../../src/pagination/blockWindow";
import {
  blockRawText,
  classifyBlock,
  resolveBlockSlice,
} from "../../../src/pagination/splitBlock";

/** The window capacity (blockWindow.ts MAX_GRAPHEMES). The harness asserts
 * bounds against this constant so a case cannot silently outgrow it. */
export const CAPACITY = 8_000;

export function giantParagraph(text: string): Block {
  return { kind: "paragraph", content: [{ text, marks: [] }] };
}

export function zeroTextFigure(): Block {
  return { kind: "figure", alt: "", caption: [] };
}

export function proseArticle(giantText: string, id = "continuation-contract"): CanonicalArticle {
  return ArticleSchema.parse({
    id,
    revision: 1,
    lang: "en",
    provenance: {
      title: "Continuation contract",
      retrievedAt: "2026-01-01T00:00:00Z",
      originalHtmlHash: `${id}-v1`,
    },
    blocks: [
      { kind: "heading", level: 2, content: [{ text: "Enormous", marks: [] }] },
      giantParagraph(giantText),
      { kind: "paragraph", content: [{ text: "A calm closing passage.", marks: [] }] },
    ],
  });
}

export function containerArticle(
  kind: "blockquote" | "bulleted-list" | "numbered-list",
  children: Block[],
  id = "continuation-contract-container",
): CanonicalArticle {
  const giant: Block =
    kind === "blockquote"
      ? { kind: "blockquote", children }
      : kind === "bulleted-list"
        ? { kind: "bulleted-list", items: children.map((content) => ({ content: [content] })) }
        : { kind: "numbered-list", start: 1, items: children.map((content) => ({ content: [content] })) };
  return ArticleSchema.parse({
    id,
    revision: 1,
    lang: "en",
    provenance: {
      title: "Continuation contract container",
      retrievedAt: "2026-01-01T00:00:00Z",
      originalHtmlHash: `${id}-v1`,
    },
    blocks: [
      { kind: "heading", level: 2, content: [{ text: "Enormous", marks: [] }] },
      giant,
      { kind: "paragraph", content: [{ text: "A calm closing passage.", marks: [] }] },
    ],
  });
}

/** The giant block is always body index 1 (heading, giant, closing). */
export const GIANT_BLOCK_INDEX = 1;

/** The D-05 container-stream extents of `children`: separator BEFORE each
 * child after the first (the coordinate definition in splitBlock.ts's
 * sourceIndex). Owned here as the cases' independent geometry oracle. */
export function childExtents(children: Block[], lang = "en"): { start: number; end: number }[] {
  let cursor = 0;
  return children.map((child) => {
    if (cursor > 0) cursor += BLOCK_SEPARATOR.length;
    const start = cursor;
    const length = graphemeClusters(blockNormalizedText(child), lang).length;
    cursor = start + length;
    return { start, end: cursor };
  });
}

/** Atomic descendants (recursive through containers) with their raw texts. */
export function atomicDescendants(block: Block): { kind: string; raw: string }[] {
  const found: { kind: string; raw: string }[] = [];
  const walk = (node: Block): void => {
    if (classifyBlock(node).kind === "atomic") {
      found.push({ kind: node.kind, raw: blockRawText(node) });
      return;
    }
    if (node.kind === "blockquote") node.children.forEach(walk);
    if (node.kind === "bulleted-list" || node.kind === "numbered-list")
      node.items.forEach((item) => item.content.forEach(walk));
  };
  walk(block);
  return found;
}

/** Zero-text visual children (figures with no alt/caption text). */
export function zeroTextVisuals(block: Block): number {
  let count = 0;
  const walk = (node: Block): void => {
    if (node.kind === "figure" && blockRawText(node).length === 0) count += 1;
    if (node.kind === "blockquote") node.children.forEach(walk);
    if (node.kind === "bulleted-list" || node.kind === "numbered-list")
      node.items.forEach((item) => item.content.forEach(walk));
  };
  walk(block);
  return count;
}

export interface ContractReport {
  windows: readonly BlockWindow[];
  /** The giant block's slice under each window that covers it. */
  projections: Block[];
  rawConcat: string;
  /** Total normalized graphemes carried by each window's giant-block slice. */
  sliceNormLengths: number[];
}

/** Project the article through its windows and check the universal
 * source-ownership invariants. Throws a message naming the violated
 * invariant — the cases below only add case-specific geometry. */
export function runContinuationContract(article: CanonicalArticle): ContractReport {
  const index = articleGraphemeIndex(article);
  const giant = article.blocks[GIANT_BLOCK_INDEX]!;
  const giantLength = index.perBlockLengths[GIANT_BLOCK_INDEX]!;
  const windows = blockWindows(article);

  // Fixture guard: the harness's own view of the giant block must equal the
  // article index's (a drifted fixture would void every expectation below).
  if (graphemeClusters(blockNormalizedText(giant), article.lang).length !== giantLength) {
    throw new Error("fixture drift: giant block length disagrees with the article index");
  }

  // (1) TILING — every article grapheme owned by exactly one window. The
  // global range of a window uses the shared coordinate definitions (the
  // SAME windowGlobalStart/End every consumer addresses — REUSE, not a
  // fork); the work end is the blockStartOffsets sentinel the last window's
  // half-open convention owns.
  const workEnd = index.blockStartOffsets[article.blocks.length]!;
  let cursor = 0;
  for (const [i, window] of windows.entries()) {
    const start = windowGlobalStart(article, window);
    const end = windowGlobalEnd(article, window);
    if (start !== cursor) {
      throw new Error(
        `tiling violated at window ${i}: starts at ${start}, previous window ended at ${cursor}`,
      );
    }
    if (end <= start) throw new Error(`tiling violated at window ${i}: empty range`);
    cursor = end;
  }
  if (cursor !== workEnd) {
    throw new Error(`tiling violated at the end: windows cover ${cursor} of ${workEnd} graphemes`);
  }

  // The giant block's slice under each window that covers it (intra-block
  // bounds only on the window's first/last block, per the window model).
  const projections: Block[] = [];
  const sliceNormLengths: number[] = [];
  for (const window of windows) {
    if (window.startBlock > GIANT_BLOCK_INDEX || window.endBlock <= GIANT_BLOCK_INDEX) continue;
    const start = window.startBlock === GIANT_BLOCK_INDEX ? (window.startGrapheme ?? 0) : 0;
    const end =
      window.endBlock - 1 === GIANT_BLOCK_INDEX ? (window.endGrapheme ?? giantLength) : giantLength;
    const projection = resolveBlockSlice(giant, start, end, article.lang);
    const normLength = graphemeClusters(blockNormalizedText(projection), article.lang).length;
    // (2) BOUNDED — at most one window capacity, and never a discarded slice.
    if (normLength > CAPACITY) {
      throw new Error(`bounded violated: window slice carries ${normLength} > ${CAPACITY}`);
    }
    if (giantLength > 0 && normLength === 0) {
      throw new Error("usable-prefix violated: a window owns an empty slice of a text-bearing block");
    }
    projections.push(projection);
    sliceNormLengths.push(normLength);
  }

  // (3) EXACTLY-ONCE RAW COVERAGE.
  const rawConcat = projections.map(blockRawText).join("");
  if (rawConcat !== blockRawText(giant)) {
    throw new Error("exactly-once raw coverage violated: projections' raw text is not the source");
  }

  // (4) ATOMIC DESCENDANTS WHOLE AND ONCE.
  const sourceAtomic = atomicDescendants(giant).map((a) => `${a.kind}:${a.raw}`).sort();
  const slicedAtomic = projections
    .flatMap(atomicDescendants)
    .map((a) => `${a.kind}:${a.raw}`)
    .sort();
  if (sourceAtomic.length !== slicedAtomic.length || sourceAtomic.some((a, i) => a !== slicedAtomic[i])) {
    throw new Error(
      `atomic-descendant ownership violated: source ${sourceAtomic.length}, slices ${slicedAtomic.length}`,
    );
  }

  // (5) ZERO-TEXT VISUALS OWNED ONCE.
  const sourceZero = zeroTextVisuals(giant);
  const slicedZero = projections.reduce((acc, p) => acc + zeroTextVisuals(p), 0);
  if (sourceZero !== slicedZero) {
    throw new Error(
      `zero-text visual ownership violated: source ${sourceZero}, slices ${slicedZero}`,
    );
  }

  return { windows, projections, rawConcat, sliceNormLengths };
}

/** The window whose giant-block slice ENDS at `giantOffset` (the cut a case
 * wants to inspect), with the slice that resumes there. Both must exist —
 * a case asserting a seam that the model never cuts fails here, loudly. */
export function seamAt(report: ContractReport, giantOffset: number): [Block, Block] {
  for (const [i, window] of report.windows.entries()) {
    if (window.endBlock - 1 !== GIANT_BLOCK_INDEX || window.endGrapheme !== giantOffset) continue;
    const next = report.windows[i + 1];
    if (!next || next.startBlock > GIANT_BLOCK_INDEX || (next.startGrapheme ?? 0) !== giantOffset) {
      throw new Error(`seam at ${giantOffset}: no resuming window found`);
    }
    return [report.projections[i]!, report.projections[i + 1]!];
  }
  throw new Error(`seam at ${giantOffset}: no window ends there`);
}

export interface WorkStats {
  calls: number;
  /** Total UTF-16 length handed to Intl.Segmenter.segment. */
  totalUtf16: number;
  /** Longest single input — a late slice must never see the prefix. */
  maxUtf16: number;
}

/** Deterministic work-counter seam over the segmentation substrate. Capture
 * EVERY Intl.Segmenter.segment input between start and stop; after
 * legitimate cache preparation the recorded lengths bound the work a late
 * slice may do. (The same seam the landed regressions spy with — packaged
 * so the contract suite owns one definition.) */
export function trackSegmentationWork(): { stats: () => WorkStats; stop: () => void } {
  // vi.spyOn keeps the real implementation — sizes are recorded, segmentation
  // behaves exactly as production would.
  const segment = vi.spyOn(Intl.Segmenter.prototype, "segment");
  return {
    stats: () => ({
      calls: segment.mock.calls.length,
      totalUtf16: segment.mock.calls.reduce((acc, [text]) => acc + (text?.length ?? 0), 0),
      maxUtf16: segment.mock.calls.reduce((acc, [text]) => Math.max(acc, text?.length ?? 0), 0),
    }),
    stop: () => segment.mockRestore(),
  };
}
