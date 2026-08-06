// src/pagination/fragment.ts
// Pagination orchestrator — the pure domain function that turns Phase 3's
// trusted MeasurementResult + a DOM line-box pass into explicit source-
// range PageFragments covering the article exactly once in canonical order.
//
// Pipeline trace (mirrors src/measurement/engine.ts header discipline):
//   walk article.blocks → for each: classify atomic vs splitting →
//     place whole OR split at a widow-legal line boundary →
//     fill pages from pageContentBoxHeightPx → emit PageFragment on flush →
//     enforce 3 termination guards every pass.
//
// PAGE-03 (exactly-once + canonical order): the returned pages' block
// ranges are contiguous, non-overlapping, intra-block grapheme slices
// whose article-global union covers [0, graphemeLength(article)) exactly.
//
// PAGE-04 (termination + oversize fallback): three guards — (1) an atomic
// block whose measured height > 75% of the page content box → status
// "fallback" + dom-fallback diagnostic; (2) pages.length > 300 → status
// "fallback" + dom-fallback; (3) a page produced with zero new content →
// status "fallback" + dom-fallback. The engine NEVER infinite-loops on
// adversarial input.
//
// PAGE-09 (diagnostic surfacing): fallback emissions route through the
// same DiagnosticBus the measurement engine uses
// (src/measurement/diagnostics.ts). The 6 kinds are the closed set
// (D3-05); Phase 4 emits MORE of `dom-fallback`, never a 7th kind.
//
// V7 error classification: AbortError → silent cancel (re-thrown so the
// caller can short-circuit); the engine never throws a reader-facing
// error. Anything unexpected becomes a dom-fallback diagnostic + fallback
// result.
//
// Pitfall 2 (layout thrash): every Range.getClientRects() read happens in
// ONE batched pass over querySelectorAll's result, BEFORE any page-fragment
// construction. The returned FragmentationResult is a pure value; the
// caller decides the React state commit.
//
// Pitfall 6 (no Pretext): split points come ONLY from DOM
// Range.getClientRects() line boxes mapped to D-05 grapheme offsets. The
// @chenglou/pretext package is NEVER imported in src/pagination/ — the
// calibration fingerprint proved paragraphs Pretext-ineligible, and the
// engine trusts DOM truth for every splitting kind.
//
// STACK.md (no persisted boundaries): the engine RETURNS a
// FragmentationResult; it does NOT write to Dexie or any store. Page
// count, indices, and boundaries are ephemeral compute outputs that
// change with every viewport/typography/font/asset change.

import type { CanonicalArticle } from "../content/types";
import type { MeasurementResult } from "../measurement/types";
import type { DiagnosticBus } from "../measurement/diagnostics";
import type { LineBox, PageFragment, FragmentationResult } from "./types";
import { AbortError } from "../measurement/fontGate";
import { graphemeClusters } from "../content/normalizeText";
import {
  readLineBoxes,
  blockNormalizedText,
  charOffsetToGrapheme,
} from "./lineBoxes";
import { classifyBlock } from "./splitBlock";
import { applyLineWidowOrphan, SPLIT_WIDOW_LINES } from "./widowRules";

/**
 * The canonical block selector reused verbatim from 5 prior sites — DO NOT
 * fork a 6th variant. Selector drift between measurement/restore/pagination
 * would read different elements and shift every split point.
 *   - src/measurement/domMeasurer.ts:34
 *   - src/measurement/engine.ts:304
 *   - src/reader/useScrollSave.ts:99
 *   - src/routes/ArticleView.tsx:54
 *   - src/pagination/lineBoxes.ts (comment-only)
 */
const BLOCK_SELECTOR = "h2, h3, h4, p, blockquote, li, pre, figure, sup, details";

/**
 * PAGE-04 termination guard 1: an atomic block whose measured height
 * exceeds this fraction of the page content-box height triggers a
 * whole-article fallback (status "fallback" + dom-fallback diagnostic).
 * The 0.75 threshold leaves room for a heading + a few lines of the next
 * block, preserving spatial context before the engine gives up.
 */
const OVERSIZE_THRESHOLD = 0.75;

/**
 * PAGE-04 termination guard 2: the absolute page-count ceiling. If the
 * engine produces more than this many pages for a single article revision,
 * it aborts + falls back. 300 is a generous bound (the longest fixture is
 * essay-long-form); Plan 05's Playwright matrix validates the actual
 * corpus peak stays well under it.
 */
const PAGE_CEILING = 300;

/** Internal sentinel thrown from the walk to short-circuit into a fallback result. */
class PaginateFallback extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(reason);
    this.name = "PaginateFallback";
    this.reason = reason;
    Object.setPrototypeOf(this, PaginateFallback.prototype);
  }
}

/** Options for {@link paginateDocument}. */
export interface PaginateOptions {
  /** The article being paginated (article.blocks is walked in canonical order). */
  article: CanonicalArticle;
  /** Phase 3's trusted per-element measurement (heightPx + lineCount per block). */
  measurement: MeasurementResult;
  /** The rendered <article> element; queried via BLOCK_SELECTOR for line boxes. */
  articleEl: HTMLElement;
  /** The current page content-box height in CSS pixels (from getBoundingClientRect). */
  pageContentBoxHeightPx: number;
  /** Diagnostic bus for dom-fallback emissions (Phase 4 PAGE-09 surfaces them). */
  diagnostics: DiagnosticBus;
  /** Cancel signal; AbortError is thrown if aborted (silent cancel, V7). */
  signal: AbortSignal;
}

/** The widow-legal split decision returned by {@link chooseSplit}. */
interface SplitPlan {
  /** Line-box index where the split lands (lines [0, splitLineIdx) on current page). */
  splitLineIdx: number;
  /** Intra-block grapheme offset of the split (the before-slice's exclusive end). */
  beforeEndGrapheme: number;
  /** Vertical span (px) of the before-slice (lines [0, splitLineIdx)). */
  beforeHeightPx: number;
  /** Vertical span (px) of the after-slice (lines [splitLineIdx, length)). */
  afterHeightPx: number;
}

/**
 * Paginate an article into contiguous source-range PageFragments.
 *
 * Walks article.blocks in canonical order; classifies each block via
 * {@link classifyBlock} (D4-02); for atomic kinds places the whole block
 * or moves it to the next page (subject to the 75% oversize guard); for
 * splitting kinds reads line boxes via {@link readLineBoxes}, finds the
 * natural split point where the page budget is exceeded, applies
 * {@link applyLineWidowOrphan} (D4-04), and emits a PageFragment with the
 * split slice. The result's pages[] cover [0, graphemeLength(article))
 * exactly once in canonical order on success.
 *
 * The function is pure: it reads DOM geometry via articleEl but produces
 * only a value (FragmentationResult). The caller commits the result to
 * React state — never persist derived page boundaries (STACK.md).
 *
 * @throws AbortError if `signal` is or becomes aborted (silent cancel; the
 *   caller's catch path treats AbortError as "newer pass supersedes me").
 */
export function paginateDocument(opts: PaginateOptions): FragmentationResult {
  if (opts.signal.aborted) throw new AbortError();

  const article = opts.article;
  const articleBlocks = article.blocks;
  const lang = article.lang;
  const pageHeight = opts.pageContentBoxHeightPx;
  const diagnostics = opts.diagnostics;
  const signal = opts.signal;

  // Single DOM read-phase (Pitfall 2): querySelectorAll up front + every
  // Range.getClientRects() walk before any page construction. The result
  // is a parallel array of per-element LineBox[] the walk below consumes.
  const elements = Array.from(
    opts.articleEl.querySelectorAll<HTMLElement>(BLOCK_SELECTOR),
  );

  // MVP scope: the engine assumes a 1:1 mapping between article.blocks
  // and the rendered BLOCK_SELECTOR elements. This holds for top-level
  // paragraph/heading/figure/code/footnote/unsupported blocks. Container
  // blocks (blockquote + bulleted/numbered lists) render their inner
  // children as additional selector matches, breaking the 1:1 mapping;
  // until Plan 03's recursive fragment renderer lands, we fall back
  // rather than emit wrong ranges. Plan 05's e2e matrix will exercise
  // containers and confirm the recursive path.
  if (elements.length !== articleBlocks.length) {
    diagnostics.emit({ kind: "dom-fallback", ts: new Date().toISOString() });
    return {
      schemaVersion: 1,
      status: "fallback",
      pages: [],
      reason: "block-element-mismatch",
    };
  }

  // Per-element normalized text + grapheme length (reuses the D-05
  // substrate — no parallel normalization, Pitfall 3). The per-element
  // text is produced by blockNormalizedText, which delegates to
  // normalizeElText (the exact per-block rule normalizeText applies).
  const blockTexts: string[] = [];
  const blockGraphemeLengths: number[] = [];
  for (let i = 0; i < elements.length; i++) {
    if (signal.aborted) throw new AbortError();
    const text = blockNormalizedText(elements[i]!);
    blockTexts.push(text);
    blockGraphemeLengths.push(graphemeClusters(text, lang).length);
  }

  // Batched line-box read-phase: ONE readLineBoxes call per element, all
  // before any page construction. Per-element AbortSignal check happens
  // inside readLineBoxes.
  const blockLineBoxes: LineBox[][] = [];
  for (let i = 0; i < elements.length; i++) {
    if (signal.aborted) throw new AbortError();
    blockLineBoxes.push(readLineBoxes(elements[i]!, blockTexts[i]!, signal));
  }

  // Walk state.
  const pages: PageFragment[] = [];
  let currentPageBlocks: PageFragment["blocks"] = [];
  let currentPageHeightPx = 0;

  const emitFallback = (reason: string): FragmentationResult => {
    diagnostics.emit({ kind: "dom-fallback", ts: new Date().toISOString() });
    return { schemaVersion: 1, status: "fallback", pages: [], reason };
  };

  const flushPage = (): void => {
    // Zero-progress guard (PAGE-04 termination guard 3): if we are about
    // to flush a page with NO block entries, the walk has stalled — every
    // remaining block is too tall for an empty page. Bail to fallback.
    if (currentPageBlocks.length === 0) {
      throw new PaginateFallback("zero-progress");
    }
    pages.push({
      schemaVersion: 1,
      pageIndex: pages.length,
      blocks: currentPageBlocks,
    });
    // Page ceiling guard (PAGE-04 termination guard 2): 300 pages max.
    if (pages.length > PAGE_CEILING) {
      throw new PaginateFallback("page-ceiling");
    }
    currentPageBlocks = [];
    currentPageHeightPx = 0;
  };

  try {
    for (let i = 0; i < articleBlocks.length; i++) {
      if (signal.aborted) throw new AbortError();

      const block = articleBlocks[i]!;
      const decision = classifyBlock(block);
      const heightPx = opts.measurement.blocks[i]?.heightPx ?? 0;
      const lineBoxes = blockLineBoxes[i]!;
      const blockGraphemeLen = blockGraphemeLengths[i]!;
      const blockText = blockTexts[i]!;

      // PAGE-04 termination guard 1: atomic block > 75% of page height.
      // Atomic blocks can't split; if one alone dominates the page, the
      // reader is better served by the scrolling fallback at the same
      // passage. (Splitting kinds skip this guard — they can split.)
      if (
        decision.kind === "atomic" &&
        heightPx > OVERSIZE_THRESHOLD * pageHeight
      ) {
        return emitFallback("oversized-block");
      }

      const remainingPx = pageHeight - currentPageHeightPx;

      // Case A: whole block fits on the current page — place + continue.
      if (heightPx <= remainingPx) {
        currentPageBlocks.push({
          blockIndex: i,
          startGrapheme: 0,
          endGrapheme: blockGraphemeLen,
        });
        currentPageHeightPx += heightPx;
        continue;
      }

      // Case B: block doesn't fit.
      if (decision.kind === "atomic") {
        // Atomic + doesn't fit + not oversized (the guard above caught
        // > 75%): flush the current page and start a new one with this
        // block alone. The block fits in a fresh page because it's
        // <= 75% of the page height.
        flushPage();
        currentPageBlocks.push({
          blockIndex: i,
          startGrapheme: 0,
          endGrapheme: blockGraphemeLen,
        });
        currentPageHeightPx += heightPx;
        continue;
      }

      // Case C: splitting kind + doesn't fit — find a widow-legal split.
      let plan = chooseSplit(lineBoxes, currentPageHeightPx, pageHeight);
      if (plan === null && currentPageBlocks.length > 0) {
        // No valid split on the current (partially-filled) page — flush it
        // and re-evaluate. Two sub-cases:
        //   (a) the block fits whole on a fresh page → place whole;
        //   (b) the block doesn't fit whole → re-try the split with the
        //       fresh-page geometry (handles the case where the previous
        //       block's after-slice left too little room for the boundary
        //       paragraph's widow-legal minimum).
        flushPage();
        if (heightPx <= pageHeight) {
          currentPageBlocks.push({
            blockIndex: i,
            startGrapheme: 0,
            endGrapheme: blockGraphemeLen,
          });
          currentPageHeightPx += heightPx;
          continue;
        }
        plan = chooseSplit(lineBoxes, 0, pageHeight);
      }
      if (plan === null) {
        // Still no valid split even on an empty page — the block is
        // unsplittable (too few lines + too tall, or some other edge case).
        // This is the zero-progress defense: emitting an empty page would
        // infinite-loop, so fall back.
        return emitFallback("unsplittable-block-overflow");
      }

      // Convert the split line-box charOffset to a D-05 grapheme ordinal
      // using THIS block's normalized text. This is the seam between DOM
      // Range offsets (UTF-16 code units) and the D-05 substrate (grapheme
      // clusters). Reuses charOffsetToGrapheme — never re-implement.
      const beforeEndGrapheme = charOffsetToGrapheme(
        blockText,
        lineBoxes[plan.splitLineIdx]!.charOffset,
        lang,
      );

      // Place the before-slice on the current page, then flush + start
      // the next page with the after-slice. Both entries reference the
      // SAME blockIndex; the renderer (Plan 03) interprets the slice.
      currentPageBlocks.push({
        blockIndex: i,
        startGrapheme: 0,
        endGrapheme: beforeEndGrapheme,
      });
      currentPageHeightPx += plan.beforeHeightPx;
      flushPage();
      currentPageBlocks.push({
        blockIndex: i,
        startGrapheme: beforeEndGrapheme,
        endGrapheme: blockGraphemeLen,
      });
      currentPageHeightPx += plan.afterHeightPx;
    }

    // Flush the trailing page if it has content. (If currentPageBlocks is
    // empty here, the loop placed every block on prior pages — no flush
    // needed; flushPage would also no-op via its zero-progress guard,
    // but we short-circuit to avoid the fallback path on a healthy end.)
    if (currentPageBlocks.length > 0) {
      flushPage();
    }

    return { schemaVersion: 1, status: "ok", pages };
  } catch (e) {
    if (e instanceof PaginateFallback) {
      return emitFallback(e.reason);
    }
    throw e;
  }
}

/**
 * Choose a widow-legal line-split index for a splitting-kind block that
 * does not fit on the current page.
 *
 * Walks the block's line boxes to find the first line whose bottom would
 * exceed the page height; applies {@link applyLineWidowOrphan} (D4-04) to
 * adjust for widow/orphan rules; returns the split metadata.
 *
 * Returns null when no valid split exists for this block here:
 *   - the block has fewer than 2 * SPLIT_WIDOW_LINES lines (too short to
 *     split under the 2/2 rule), OR
 *   - the widow-adjusted split index is 0 (the first 2 lines don't fit on
 *     the current page; caller decides whether to flush + move whole), OR
 *   - the widow-adjusted split index is >= length (the last 2 lines don't
 *     fit on the next page; whole block belongs on this page, which is
 *     contradictory since we already know it doesn't fit).
 *
 * The returned `beforeEndGrapheme` is the line-box charOffset at the split
 * index — the orchestrator converts it to a D-05 grapheme ordinal via
 * {@link charOffsetToGrapheme} using the block's normalized text.
 */
function chooseSplit(
  lineBoxes: readonly LineBox[],
  currentPageHeightPx: number,
  pageHeight: number,
): SplitPlan | null {
  if (lineBoxes.length === 0) return null;
  if (lineBoxes.length < 2 * SPLIT_WIDOW_LINES) return null;
  // No room on the current page — caller should flush + move whole.
  if (currentPageHeightPx >= pageHeight) return null;
  const firstLineTop = lineBoxes[0]!.topPx;

  // Find the first line whose bottom (relative to the page top) exceeds
  // the page height. Lines [0, candidateSplitIdx) fit; [candidateSplitIdx,
  // length) don't.
  let candidateSplitIdx = lineBoxes.length;
  for (let li = 0; li < lineBoxes.length; li++) {
    const lineBox = lineBoxes[li]!;
    const lineBottomRelativeToPageTop =
      currentPageHeightPx + (lineBox.bottomPx - firstLineTop);
    if (lineBottomRelativeToPageTop > pageHeight) {
      candidateSplitIdx = li;
      break;
    }
  }

  // Whole block fits after all (shouldn't happen here — the caller already
  // verified it doesn't — but be defensive).
  if (candidateSplitIdx === lineBoxes.length) {
    return null;
  }

  // Apply widow/orphan rule (D4-04).
  const adjusted = applyLineWidowOrphan(lineBoxes, candidateSplitIdx);

  // Widow adjustment pushed the split to a boundary — no valid split.
  if (adjusted <= 0 || adjusted >= lineBoxes.length) {
    return null;
  }

  // Verify the before-slice ACTUALLY fits on the current page. The widow
  // bump may push the split to a point where the before-slice exceeds the
  // remaining budget (e.g. candidate=0 because line 0 doesn't fit, but
  // orphan bump moved the split to SPLIT_WIDOW_LINES). In that case the
  // block must move whole to the next page rather than produce an
  // overflowing page-1 entry.
  const beforeHeightPx = lineBoxes[adjusted - 1]!.bottomPx - firstLineTop;
  if (currentPageHeightPx + beforeHeightPx > pageHeight) {
    return null;
  }

  const splitLineBox = lineBoxes[adjusted]!;
  const lastLineBox = lineBoxes[lineBoxes.length - 1]!;
  return {
    splitLineIdx: adjusted,
    beforeEndGrapheme: splitLineBox.charOffset,
    beforeHeightPx,
    afterHeightPx: lastLineBox.bottomPx - splitLineBox.topPx,
  };
}
