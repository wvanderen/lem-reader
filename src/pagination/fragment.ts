// src/pagination/fragment.ts
// Pagination orchestrator — the pure domain function that turns Phase 3's
// trusted MeasurementResult + a DOM line-box pass into explicit source-
// range PageFragments covering the article exactly once in canonical order.
//
// Pipeline trace (mirrors src/measurement/engine.ts header discipline):
//   walk the scope's SOURCE ROWS (issue #235: body blocks for body scopes,
//     canonical footnote rows through their inline-run slicing views for
//     footnote scopes — homogeneous, never mixed) → for each: classify
//     atomic vs splitting → place whole OR split at a widow-legal line
//     boundary → fill pages from pageContentBoxHeightPx → emit PageFragment
//     on flush (footnote rows emit explicit footnoteIndex entries with the
//     past-body blockIndex sentinel) → enforce 3 termination guards every
//     pass.
//
// PAGE-03 (exactly-once + canonical order): the returned pages' row ranges
// are contiguous, non-overlapping, intra-row grapheme slices whose
// article-global union covers the measured source scope exactly (for a
// full-document legacy pass, [0, bodyLength) — footnote rows paginate only
// through their windows, never the scope-less walk).
//
// PAGE-04 (termination + oversize fallback): three guards — (1) an atomic
// block whose measured height exceeds its kind-specific page threshold
// (75% generally, 90% for code) → status "fallback" + dom-fallback
// diagnostic; (2) at 300 pages, source-scoped callers receive a usable
// prefix + advancing continuation (legacy full-document callers fall back);
// (3) a page produced with zero new content →
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
// the MEASUREMENT phase (single batched pass over [data-block-index]
// elements, before any page construction). The engine consumes the
// resulting LineBox[][] via opts.measurement; it performs no DOM reads of
// its own. The returned FragmentationResult is a pure value; the caller
// decides the React state commit.
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
//
// Plan 13-04 (Option A — human decision 2026-08-18): the additive
// `firstPageReservedPx` option reserves vertical space at the top of the
// FIRST page for ArticleView's article-top metadata spot (page-1 budget =
// pageContentBoxHeightPx - reserve, floor-clamped; pages 2+ unchanged;
// default 0 byte-equivalent). The overflow guard, DEV hook, and anchors
// stay reserve-unaware by decision.

import type { CanonicalArticle, Block } from "../content/types";
import type { MeasurementResult } from "../measurement/types";
import type { DiagnosticBus } from "../measurement/diagnostics";
import type { LineBox, PageFragment, FragmentationResult, SourceCursor } from "./types";
import { AbortError } from "../measurement/fontGate";
import { articleGraphemeIndex, footnoteRows } from "../content/normalizeText";
import {
  blockRawPrefixUtf16,
  blockCharOffsetToNormGrapheme,
  blockSliceBoundary,
  classifyBlock,
  footnoteBodyBlock,
} from "./splitBlock";
import { applyLineWidowOrphan, SPLIT_WIDOW_LINES } from "./widowRules";

/**
 * PAGE-04 termination guard 1: an atomic block whose measured height
 * exceeds this fraction of the page content-box height triggers a
 * whole-article fallback (status "fallback" + dom-fallback diagnostic).
 * The 0.75 threshold leaves room for a heading + a few lines of the next
 * block, preserving spatial context before the engine gives up.
 */
const OVERSIZE_THRESHOLD = 0.75;
/** Code remains readable as a mostly-full standalone page; allow extra room. */
const CODE_BLOCK_OVERSIZE_THRESHOLD = 0.9;

/**
 * PAGE-04 termination guard 2: the absolute page-count ceiling. If the
 * engine needs more pages in one pass, a scoped host receives the successful
 * prefix plus the first omitted source cursor; legacy full-document callers
 * without a continuation host retain the honest fallback. Never raise this
 * bound to admit longer works — refine their source windows instead.
 */
import { PAGINATION_PAGE_CEILING as PAGE_CEILING } from "./capacity";

/**
 * Plan 13-04 (Option A — human decision 2026-08-18): the safety floor for
 * the first page's reserved content budget. `firstPageReservedPx` can never
 * push page 1's budget below this fraction of the page height — a floor
 * ABOVE the physically remaining space would only manufacture overflow the
 * post-render guard must repeatedly heal, so the floor is kept MODEST
 * (anti-degenerate, not space-making): it guarantees the widow-legal
 * minimum (2 lines) stays budgetable on any realistic page. ArticleView's
 * compact metadata spot keeps the corpus reserves well away from the
 * floor; a degenerate reserve (pathological spot growth) surfaces as a
 * clean typed fallback rather than a poisoned empty first page.
 */
const FIRST_PAGE_BUDGET_FLOOR = 0.25;

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

/** Capacity ends this pass without invalidating its successful prefix. */
class PaginateCapacity extends Error {
  constructor(readonly continuation: SourceCursor) {
    super("page-capacity");
  }
}

/** Options for {@link paginateDocument}. */
export interface PaginateOptions {
  /** The article being paginated (article.blocks is walked in canonical order). */
  article: CanonicalArticle;
  /**
   * Phase 3's trusted per-block measurement (heightPx + lineCount + lineBoxes
   * per top-level block). Plan 04-06: lineBoxes is pre-captured during the
   * measurement DOM walk — the engine consumes them directly and does NOT
   * re-read live DOM (PaginatedSurface replaces the full ArticleBody before
   * the engine runs — pre-capture is the only source).
   */
  measurement: MeasurementResult;
  /** The current page content-box height in CSS pixels (from getBoundingClientRect). */
  pageContentBoxHeightPx: number;
  /** Diagnostic bus for dom-fallback emissions (Phase 4 PAGE-09 surfaces them). */
  diagnostics: DiagnosticBus;
  /** Cancel signal; AbortError is thrown if aborted (silent cancel, V7). */
  signal: AbortSignal;
  /**
   * Plan 13-04 (Option A — human decision 2026-08-18): vertical CSS px
   * reserved at the top of the FIRST page for article-top chrome
   * (ArticleView's metadata spot). Page 1's content budget is
   * `pageContentBoxHeightPx - firstPageReservedPx`, floor-clamped to
   * FIRST_PAGE_BUDGET_FLOOR for safety; pages 2+ keep the full viewport
   * budget. The reserve applies to PLACEMENT decisions only — the
   * oversize / page-ceiling / zero-progress termination guards stay
   * measured against the full page height, and a splitting-kind block on
   * an empty first page retries its split at the full height before
   * falling back (see the walk). Default 0 (absent) is byte-equivalent
   * to the pre-13-04 engine for every existing caller and test.
   */
  firstPageReservedPx?: number;
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
 * or moves it to the next page (subject to the kind-specific oversize guard); for
 * splitting kinds reads line boxes via {@link readLineBoxes}, finds the
 * natural split point where the page budget is exceeded, applies
 * {@link applyLineWidowOrphan} (D4-04), and emits a PageFragment with the
 * split slice. The result's pages[] cover [0, graphemeLength(article))
 * exactly once in canonical order on success.
 *
 * The function is pure: it consumes pre-captured line boxes from
 * `opts.measurement.blocks[i].lineBoxes` (Plan 04-06) — it reads no live
 * DOM. The caller commits the result to React state — never persist derived
 * page boundaries (STACK.md).
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

  // Plan 04-06: line boxes come PRE-CAPTURED in measurement.blocks[i].lineBoxes.
  // The engine no longer queries articleEl — PaginatedSurface replaces the
  // full ArticleBody with a single page fragment BEFORE the engine runs, so
  // articleEl has no full body to walk. The measurement phase (which runs
  // earlier, against the full ArticleBody) is the sole source of truth.
  //
  // Spike 0007 F2 reconciliation: per-block normalized text + grapheme
  // lengths derive from article.blocks via blockNormalizedText — the D-05
  // substrate ITSELF (Pitfall 3, no fork; previously the engine used the
  // raw run-concatenating splittingBlockText, whose coordinate drifted from
  // the D-05 positions highlights are stored in). Fragment entry ranges are
  // therefore D-05 ordinals, exactly what sliceHighlightsForEntry, the
  // anchors, and the unified highlight slicer address.
  const scope = opts.measurement.scope;
  const startBlock = scope?.startBlock ?? 0;
  const endBlock = scope?.endBlock ?? articleBlocks.length;
  // Issue #233 — the intra-block source cursor: a scope may begin/end INSIDE
  // its boundary blocks (a giant-prose continuation). Slice fields are whole-
  // block D-05 ordinals; absent means whole-block, exactly as before.
  const scopeStartGrapheme = scope?.startGrapheme ?? 0;
  const scopeEndGrapheme = scope?.endGrapheme;
  // Issue #235 — footnote scopes walk the canonical non-empty footnote rows
  // (the substrate's offsets) instead of body blocks. The scope is HOMOGENEOUS:
  // an empty body range anchored at the body's end (the past-body sentinel).
  const footnoteScope = scope?.startFootnote !== undefined;
  const scopeStartFootnoteGrapheme = scope?.startFootnoteGrapheme ?? 0;
  const scopeEndFootnoteGrapheme = scope?.endFootnoteGrapheme;
  const perBlockLengths = articleGraphemeIndex(article).perBlockLengths;
  const allFootnoteRows = footnoteScope ? footnoteRows(article) : [];
  const scopeFootnoteRows = footnoteScope
    ? allFootnoteRows.filter(
        (row) => row.index >= scope!.startFootnote! && row.index < scope!.endFootnote!,
      )
    : [];
  const lastBlockIndex = endBlock - 1;
  const wholeNotes = scope?.includeFootnotes ? footnoteRows(article) : [];
  const expectedMeasurementRows = footnoteScope
    ? scopeFootnoteRows.length
    : endBlock - startBlock + wholeNotes.length;
  if (
    (scope && (scope.articleId !== article.id || scope.revision !== article.revision)) ||
    opts.measurement.blocks.length !== expectedMeasurementRows ||
    (footnoteScope
      ? // Homogeneous footnote scope: empty body range at the body's end,
        // valid footnote range, no body slice bounds, footnote cursors legal.
        scope!.endFootnote === undefined ||
        (scope!.startFootnote ?? 0) >= (scope!.endFootnote ?? Number.POSITIVE_INFINITY) ||
        (scope!.endFootnote ?? 0) > article.footnotes.length ||
        startBlock !== articleBlocks.length ||
        endBlock !== articleBlocks.length ||
        scope!.startGrapheme !== undefined ||
        scope!.endGrapheme !== undefined ||
        scopeStartFootnoteGrapheme >= (scopeFootnoteRows[0]?.length ?? 0) ||
        (scopeEndFootnoteGrapheme !== undefined &&
          (scopeEndFootnoteGrapheme <= 0 ||
            scopeEndFootnoteGrapheme > (scopeFootnoteRows.at(-1)?.length ?? 0)))
      : startBlock < 0 ||
        endBlock > articleBlocks.length ||
        startBlock >= endBlock ||
        (scope?.startGrapheme !== undefined &&
          (scope.startGrapheme >= perBlockLengths[startBlock]! ||
            // A slice scope is a SLICE-SEMANTIC scope (issues #233/#234): the
            // guard enforces the invariant the line-box rebase + window
            // projection rely on — measurement and rendering must agree the
            // block slices.
            classifyBlock(articleBlocks[startBlock]!).kind !== "split" ||
            blockSliceBoundary(articleBlocks[startBlock]!, scope.startGrapheme, lang) !==
              scope.startGrapheme)) ||
        (scopeEndGrapheme !== undefined &&
          (scopeEndGrapheme <= 0 ||
            scopeEndGrapheme > perBlockLengths[lastBlockIndex]! ||
            classifyBlock(articleBlocks[lastBlockIndex]!).kind !== "split" ||
            blockSliceBoundary(articleBlocks[lastBlockIndex]!, scopeEndGrapheme, lang) !==
              scopeEndGrapheme)))
  ) {
    diagnostics.emit({
      kind: "dom-fallback",
      ts: new Date().toISOString(),
      reason: "measurement-scope-mismatch",
    });
    return {
      schemaVersion: 1,
      status: "fallback",
      pages: [],
      reason: "measurement-scope-mismatch",
    };
  }

  // Unified source rows (issue #235): body blocks for body scopes, canonical
  // footnote rows through their inline-run slicing VIEWS for footnote scopes
  // (footnoteBodyBlock — the view is a slicing coordinate over footnote
  // content, never a canonical block; entries carry footnoteIndex instead).
  // One walk, one set of guards, one emission shape.
  interface SourceRow {
    footnote: boolean;
    /** blockIndex (body rows) or footnoteIndex (footnote rows). */
    index: number;
    /** The block-like slicing view the classification/conversion walk reads. */
    slice: Block;
    /** Row index into opts.measurement.blocks. */
    measureIndex: number;
    /** Whole-row D-05 length. */
    length: number;
  }
  const sourceRows: SourceRow[] = footnoteScope
    ? scopeFootnoteRows.map((row, k) => ({
        footnote: true,
        index: row.index,
        slice: footnoteBodyBlock(article.footnotes[row.index]!, lang),
        measureIndex: k,
        length: row.length,
      }))
    : articleBlocks.slice(startBlock, endBlock).map((block, k) => ({
        footnote: false,
        index: startBlock + k,
        slice: block,
        measureIndex: k,
        length: perBlockLengths[startBlock + k]!,
      }));
  sourceRows.push(
    ...wholeNotes.map((row, k) => ({
      footnote: true,
      index: row.index,
      slice: footnoteBodyBlock(article.footnotes[row.index]!, lang),
      measureIndex: endBlock - startBlock + k,
      length: row.length,
    })),
  );
  // The scope's slice cursors, per row kind: a footnote scope clips its
  // boundary rows through the footnote cursor fields, a body scope through
  // the intra-block fields (issues #233/#235).
  const scopeStartSlice = (sourceRow: SourceRow): number =>
    sourceRow.footnote ? scopeStartFootnoteGrapheme : scopeStartGrapheme;
  const scopeEndSlice = (sourceRow: SourceRow): number | undefined =>
    sourceRow.footnote ? scopeEndFootnoteGrapheme : scopeEndGrapheme;
  // The ONE entry constructor (issue #235): footnote rows emit explicit
  // footnoteIndex entries with blockIndex carrying the past-body sentinel —
  // footnotes are never forged into the canonical block list.
  const entryFor = (
    sourceRow: SourceRow,
    startGrapheme: number,
    endGrapheme: number,
  ): PageFragment["blocks"][number] =>
    sourceRow.footnote
      ? {
          blockIndex: articleBlocks.length,
          footnoteIndex: sourceRow.index,
          startGrapheme,
          endGrapheme,
        }
      : { blockIndex: sourceRow.index, startGrapheme, endGrapheme };
  const blockLineBoxes: LineBox[][] = opts.measurement.blocks.map((b) => b.lineBoxes);
  // Per-block lengths come from the per-article grapheme index (one cached
  // segmentation per parsed article) — a giant-prose row must never be
  // re-segmented per pagination pass.

  // Issues #233/#234/#235 — line-box rebase cache, per row. A slice-scope head
  // row's run/container clusters are cached (per run and per block object in
  // splitBlock.ts), so the walk and the split-offset conversion below are
  // O(window) per pagination pass — never a whole-block re-segmentation. The
  // prefix walk is the SAME cut rule the render-side projection primitive
  // (resolveBlockSlice) draws, so rebased line boxes always address exactly
  // the rendered slice's stream — prose, container rows, AND footnote rows.
  const rowPrefixCache = new Map<number, number>();
  const headSliceRawPrefixUtf16 = (row: number, slice: Block, sliceStart: number): number => {
    let prefix = rowPrefixCache.get(row);
    if (prefix === undefined) {
      prefix = blockRawPrefixUtf16(slice, sliceStart, lang);
      rowPrefixCache.set(row, prefix);
    }
    return prefix;
  };
  // Line boxes for a row, in whole-row raw coordinates. A tail-slice row
  // (slice start > 0) had its prefix rendered away, so every charOffset
  // shifts by the omitted prefix; a head-slice row (endGrapheme < full) is
  // a raw PREFIX of the row — its charOffsets are already whole-row.
  const rowLineBoxCache = new Map<number, LineBox[]>();
  const lineBoxesForRow = (row: number, sourceRow: SourceRow, sliceStart: number): LineBox[] => {
    // Only a split-semantic head row can carry a slice origin (issues
    // #233/#234/#235), and its rendered slice omits the raw prefix.
    if (
      !(sourceRow.measureIndex === 0 && sliceStart > 0) ||
      classifyBlock(sourceRow.slice).kind !== "split"
    ) {
      return blockLineBoxes[row]!;
    }
    let adjusted = rowLineBoxCache.get(row);
    if (!adjusted) {
      const prefix = headSliceRawPrefixUtf16(row, sourceRow.slice, sliceStart);
      adjusted = blockLineBoxes[row]!.map((lb) => ({ ...lb, charOffset: lb.charOffset + prefix }));
      rowLineBoxCache.set(row, adjusted);
    }
    return adjusted;
  };

  // Walk state.
  const pages: PageFragment[] = [];
  let currentPageBlocks: PageFragment["blocks"] = [];
  let currentPageHeightPx = 0;
  let currentTrailingMarginPx = 0;

  // Plan 13-04 (Option A — human decision 2026-08-18): the reserved page-1
  // budget. Negative/absent reserves normalize to 0; the floor clamp keeps
  // page 1 viable no matter how tall the measured metadata spot is. Pages
  // 2+ always keep the full viewport budget — the spot only ever renders at
  // article start, so only the article's first page pays for it.
  const firstPageReservedPx = Math.max(0, opts.firstPageReservedPx ?? 0);
  const firstPageBudgetPx = Math.max(
    pageHeight - firstPageReservedPx,
    FIRST_PAGE_BUDGET_FLOOR * pageHeight,
  );
  /** Placement budget for the page currently being built (page 1 reserved). */
  const currentBudgetPx = (): number => (pages.length === 0 ? firstPageBudgetPx : pageHeight);

  const emitFallback = (reason: string): FragmentationResult => {
    diagnostics.emit({ kind: "dom-fallback", ts: new Date().toISOString(), reason });
    return { schemaVersion: 1, status: "fallback", pages: [], reason };
  };

  const flushPage = (): void => {
    // Zero-progress guard (PAGE-04 termination guard 3): if we are about
    // to flush a page with NO block entries, the walk has stalled — every
    // remaining block is too tall for an empty page. Bail to fallback.
    if (currentPageBlocks.length === 0) {
      throw new PaginateFallback("zero-progress");
    }
    if (pages.length === PAGE_CEILING) {
      // Full-document legacy callers have no continuation host. Only a
      // source-scoped pass can retain a prefix and resume it safely.
      if (!scope) throw new PaginateFallback("page-ceiling");
      const first = currentPageBlocks[0]!;
      throw new PaginateCapacity({
        blockIndex: first.blockIndex,
        startGrapheme: first.startGrapheme,
        ...(first.footnoteIndex !== undefined ? { footnoteIndex: first.footnoteIndex } : {}),
      });
    }
    pages.push({
      schemaVersion: 1,
      pageIndex: pages.length,
      blocks: currentPageBlocks,
    });
    currentPageBlocks = [];
    currentPageHeightPx = 0;
    currentTrailingMarginPx = 0;
  };

  // At most one source row is pending.
  let sliceRemainder:
    | {
        footnote: boolean;
        index: number;
        startGrapheme: number;
        heightPx: number;
        lineBoxes: LineBox[];
      }
    | undefined;

  try {
    for (let ri = 0; ri < sourceRows.length; ri++) {
      if (signal.aborted) throw new AbortError();

      const sourceRow = sourceRows[ri]!;
      // Overflow validation and rendering use homogeneous pages, even in a
      // complete publication. Notes continue the same page denominator.
      if (
        ri > 0 &&
        sourceRow.footnote !== sourceRows[ri - 1]!.footnote &&
        currentPageBlocks.length > 0
      )
        flushPage();
      const block = sourceRow.slice;
      let decision = classifyBlock(block);
      const row = sourceRow.measureIndex;
      const remainder =
        sliceRemainder?.footnote === sourceRow.footnote && sliceRemainder?.index === sourceRow.index
          ? sliceRemainder
          : undefined;
      sliceRemainder = undefined;
      const heightPx = remainder?.heightPx ?? opts.measurement.blocks[row]?.heightPx ?? 0;
      // A continuation starts at the split line, not at the source row's
      // outer top margin (matching the legacy after-slice placement below).
      // Issue #234: a CONTAINER remainder renders a fresh list/quote element
      // on the fresh page — its structural margin renders again, so the
      // measured margin stays in its remainder accounting (a prose remainder
      // keeps the shipped zero: paragraph rhythm has no such chrome).
      // Issue #235: a footnote row renders a fresh <li> on the fresh page —
      // list chrome, so its measured margin stays in its remainder accounting
      // exactly like a container's.
      const marginBlockStartPx = remainder
        ? (block.kind === "paragraph" || block.kind === "heading") && !sourceRow.footnote
          ? 0
          : (opts.measurement.blocks[row]?.marginBlockStartPx ?? 0)
        : (opts.measurement.blocks[row]?.marginBlockStartPx ?? 0);
      const marginBlockEndPx = opts.measurement.blocks[row]?.marginBlockEndPx ?? 0;
      const lineBoxes =
        remainder?.lineBoxes ?? lineBoxesForRow(row, sourceRow, scopeStartSlice(sourceRow));
      const measuredLineSpanPx =
        lineBoxes.length > 0 ? lineBoxes[lineBoxes.length - 1]!.bottomPx - lineBoxes[0]!.topPx : 0;
      // Range line boxes describe glyph rows, not container chrome such as
      // list indentation, nested paragraph rhythm, padding, or line leading.
      // Preserve the measured difference as structural overhead on either
      // side of an intra-block split so a list/blockquote/footnote slice is
      // not packed as though its text rows were its entire rendered height.
      const splitLayoutOverheadPx = Math.max(0, heightPx - measuredLineSpanPx);
      // Effective source bounds of THIS row in whole-row D-05 ordinals:
      // the scope's slice bounds clip the boundary rows; interior rows stay
      // whole. Every entry the walk emits addresses [rowStart, rowEnd).
      const rowStart = remainder?.startGrapheme ?? (ri === 0 ? scopeStartSlice(sourceRow) : 0);
      const rowEnd =
        ri === sourceRows.length - 1 && scopeEndSlice(sourceRow) !== undefined
          ? scopeEndSlice(sourceRow)!
          : sourceRow.length;

      // Keep a heading whole when it fits a fresh page. Oversized headings
      // instead use the shared inline continuation path, preserving semantics
      // and canonical offsets rather than forcing a scrolling fallback.
      if (
        block.kind === "heading" &&
        heightPx + marginBlockStartPx + marginBlockEndPx <= pageHeight &&
        !(
          currentPageBlocks.length === 0 &&
          heightPx + marginBlockStartPx + marginBlockEndPx > currentBudgetPx()
        )
      ) {
        decision = { kind: "atomic" };
      }

      // PAGE-04 termination guard 1: atomic block > its safe page fraction.
      // Code may occupy up to 90% because it remains readable as a standalone
      // page; other atomic content retains the calmer 75% ceiling.
      // Atomic blocks can't split; if one alone dominates the page, the
      // reader is better served by the scrolling fallback at the same
      // passage. (Splitting kinds skip this guard — they can split.)
      if (
        decision.kind === "atomic" &&
        block.kind !== "heading" &&
        heightPx >
          (block.kind === "code-block" ? CODE_BLOCK_OVERSIZE_THRESHOLD : OVERSIZE_THRESHOLD) *
            pageHeight
      ) {
        return emitFallback("oversized-block");
      }

      // DOMRect.height excludes margins. The visible fragment uses normal
      // block flow, where adjacent vertical margins collapse to the larger
      // margin. Keep the trailing margin in the running total so page-budget
      // arithmetic matches the rendered DOM instead of over-packing pages and
      // relying on a visible post-render correction.
      const occupiedBeforeBlockPx =
        currentPageBlocks.length === 0
          ? marginBlockStartPx
          : currentPageHeightPx -
            currentTrailingMarginPx +
            Math.max(currentTrailingMarginPx, marginBlockStartPx);
      const wholeBlockPageHeightPx = occupiedBeforeBlockPx + heightPx + marginBlockEndPx;

      // Case A: whole block fits on the current page — place + continue.
      // Plan 13-04 (Option A): the placement budget is the current page's
      // budget (page 1 carries the reserve; pages 2+ are the full page). A
      // block that cannot fit its page's budget moves on through Case B/C —
      // including on an empty page 1, where an atomic block that exceeds
      // the reserved budget yields the honest typed fallback (Case B's
      // zero-progress guard) rather than a placed-overflow page the guard
      // would have to correct into an empty first page (anchor poison).
      if (wholeBlockPageHeightPx <= currentBudgetPx()) {
        currentPageBlocks.push(entryFor(sourceRow, rowStart, rowEnd));
        currentPageHeightPx = wholeBlockPageHeightPx;
        currentTrailingMarginPx = marginBlockEndPx;
        continue;
      }

      // Case B: block doesn't fit.
      if (decision.kind === "atomic") {
        // Atomic + doesn't fit + not oversized (the guard above caught
        // its safe threshold): flush the current page and start a new one
        // with this block alone.
        flushPage();
        const freshPageHeightPx = marginBlockStartPx + heightPx + marginBlockEndPx;
        if (freshPageHeightPx > pageHeight) {
          return emitFallback("oversized-block");
        }
        currentPageBlocks.push(entryFor(sourceRow, rowStart, rowEnd));
        currentPageHeightPx = freshPageHeightPx;
        currentTrailingMarginPx = marginBlockEndPx;
        continue;
      }

      // Case C: splitting kind + doesn't fit — find a widow-legal split.
      // Container lines inside an atomic descendant are not legal page
      // boundaries. Back off to an earlier line rather than render the
      // atomic child whole on both pages.
      const legalSplit = (charOffset: number): boolean => {
        const offset = blockCharOffsetToNormGrapheme(block, charOffset, lang);
        return blockSliceBoundary(block, offset, lang) === offset;
      };
      let plan = chooseSplit(
        lineBoxes,
        occupiedBeforeBlockPx,
        marginBlockEndPx,
        splitLayoutOverheadPx,
        currentBudgetPx(),
        legalSplit,
      );
      if (plan === null && currentPageBlocks.length > 0) {
        // No valid split on the current (partially-filled) page — flush it
        // and re-evaluate. Two sub-cases:
        //   (a) the block fits whole on a fresh page → place whole;
        //   (b) the block doesn't fit whole → re-try the split with the
        //       fresh-page geometry (handles the case where the previous
        //       block's after-slice left too little room for the boundary
        //       paragraph's widow-legal minimum).
        flushPage();
        const freshPageHeightPx = marginBlockStartPx + heightPx + marginBlockEndPx;
        if (freshPageHeightPx <= pageHeight) {
          currentPageBlocks.push(entryFor(sourceRow, rowStart, rowEnd));
          currentPageHeightPx = freshPageHeightPx;
          currentTrailingMarginPx = marginBlockEndPx;
          continue;
        }
        // currentBudgetPx() now resolves to the FULL page height — the
        // flush above emitted page 1, so the fresh page pays no reserve.
        plan = chooseSplit(
          lineBoxes,
          marginBlockStartPx,
          marginBlockEndPx,
          splitLayoutOverheadPx,
          currentBudgetPx(),
          legalSplit,
        );
      }
      if (
        plan === null &&
        firstPageBudgetPx < pageHeight &&
        pages.length === 0 &&
        currentPageBlocks.length === 0
      ) {
        // Plan 13-04 (Option A) soft-budget escape for splitting kinds: no
        // widow-legal split fit page 1's reserved budget while the page is
        // still empty. Retry against the FULL page height before falling
        // back — the reserve must never manufacture a fallback the
        // unreserved engine would not produce. The transient overshoot is
        // the post-render overflow guard's documented net.
        //
        // Post-merge repair (human-sanctioned Option A refinement,
        // 2026-08-19): when the block fits WHOLE at the full page height,
        // the unreserved engine would PLACE it whole — chooseSplit returns
        // null in exactly that geometry ("whole block fits after all"), so
        // a split-only retry fell through to the unsplittable fallback and
        // manufactured the very fallback the reserve must never produce
        // (recorded reproducer class: 640×360 — 251px page box, 209px
        // reserve → 62.75px floor budget; a 180px whole paragraph no
        // widow-legal split fits). Place it whole; the guard heals the
        // transient overshoot past the reserved budget exactly as it
        // heals the split retry below.
        if (wholeBlockPageHeightPx <= pageHeight) {
          currentPageBlocks.push(entryFor(sourceRow, rowStart, rowEnd));
          currentPageHeightPx = wholeBlockPageHeightPx;
          currentTrailingMarginPx = marginBlockEndPx;
          continue;
        }
        plan = chooseSplit(
          lineBoxes,
          occupiedBeforeBlockPx,
          marginBlockEndPx,
          splitLayoutOverheadPx,
          pageHeight,
          legalSplit,
        );
      }
      if (plan === null) {
        // Still no valid split even on an empty page — the block is
        // unsplittable (too few lines + too tall, or some other edge case).
        // This is the zero-progress defense: emitting an empty page would
        // infinite-loop, so fall back.
        return emitFallback("unsplittable-block-overflow");
      }

      // Convert the split line-box charOffset to a D-05 grapheme ordinal
      // over THIS block's stream (the row's line boxes were already rebased
      // to whole-block raw coordinates above). This is the seam between DOM
      // Range offsets (UTF-16 code units) and the D-05 substrate (grapheme
      // clusters).
      //
      // Every split-semantic kind converts through the cached source
      // extents/per-run bridge. Never reconstruct or segment a giant
      // container's discarded prefix at each page split.
      //
      // Spike 0007 F2 reconciliation: the line-box charOffset is a UTF-16
      // ordinal over the rendered DOM text (raw run concatenation —
      // InlineRenderer adds no separators, no whitespace collapsing), while
      // the D-05 stream is the normalized text (collapse + " " joins). The
      // shared raw↔norm bridge aligns the two streams so the emitted split
      // ordinals address the SAME stream highlight positions address. For
      // clean prose (raw == norm) the bridge is the identity.
      const beforeEndGrapheme = blockCharOffsetToNormGrapheme(
        block,
        lineBoxes[plan.splitLineIdx]!.charOffset,
        lang,
      );

      if (scope && (beforeEndGrapheme <= rowStart || beforeEndGrapheme >= rowEnd)) {
        return emitFallback("zero-progress");
      }

      // Place the before-slice on the current page, then flush + start
      // the next page with the after-slice. Both entries reference the
      // SAME blockIndex; the renderer (Plan 03) interprets the slice.
      currentPageBlocks.push(entryFor(sourceRow, rowStart, beforeEndGrapheme));
      currentPageHeightPx = occupiedBeforeBlockPx + plan.beforeHeightPx + marginBlockEndPx;
      currentTrailingMarginPx = marginBlockEndPx;
      flushPage();
      if (scope && decision.kind === "split") {
        sliceRemainder = {
          footnote: sourceRow.footnote,
          index: sourceRow.index,
          startGrapheme: beforeEndGrapheme,
          heightPx: plan.afterHeightPx,
          lineBoxes: lineBoxes.slice(plan.splitLineIdx),
        };
        ri--; // the next iteration consumes this same row's advancing remainder
        continue;
      }
      currentPageBlocks.push(entryFor(sourceRow, beforeEndGrapheme, rowEnd));
      currentPageHeightPx = marginBlockStartPx + plan.afterHeightPx + marginBlockEndPx;
      currentTrailingMarginPx = marginBlockEndPx;
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
    if (e instanceof PaginateCapacity) {
      return { schemaVersion: 1, status: "ok", pages, continuation: e.continuation };
    }
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
  occupiedBeforeTextPx: number,
  marginBlockEndPx: number,
  splitLayoutOverheadPx: number,
  pageHeight: number,
  legalSplit: (charOffset: number) => boolean,
): SplitPlan | null {
  if (lineBoxes.length === 0) return null;
  if (lineBoxes.length < 2 * SPLIT_WIDOW_LINES) return null;
  // No room on the current page — caller should flush + move whole.
  if (occupiedBeforeTextPx + marginBlockEndPx >= pageHeight) return null;
  const firstLineTop = lineBoxes[0]!.topPx;

  // Find the first line whose bottom (relative to the page top) exceeds
  // the page height. Lines [0, candidateSplitIdx) fit; [candidateSplitIdx,
  // length) don't.
  let candidateSplitIdx = lineBoxes.length;
  for (let li = 0; li < lineBoxes.length; li++) {
    const lineBox = lineBoxes[li]!;
    const lineBottomRelativeToPageTop =
      occupiedBeforeTextPx +
      (lineBox.bottomPx - firstLineTop) +
      splitLayoutOverheadPx +
      marginBlockEndPx;
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
  let adjusted = applyLineWidowOrphan(lineBoxes, candidateSplitIdx);
  while (
    adjusted >= SPLIT_WIDOW_LINES &&
    adjusted < lineBoxes.length &&
    !legalSplit(lineBoxes[adjusted]!.charOffset)
  )
    adjusted--;

  // Preserve the widow/orphan minimum when backing off atomic boundaries.
  if (adjusted < SPLIT_WIDOW_LINES || adjusted >= lineBoxes.length) {
    return null;
  }

  // Verify the before-slice ACTUALLY fits on the current page. The widow
  // bump may push the split to a point where the before-slice exceeds the
  // remaining budget (e.g. candidate=0 because line 0 doesn't fit, but
  // orphan bump moved the split to SPLIT_WIDOW_LINES). In that case the
  // block must move whole to the next page rather than produce an
  // overflowing page-1 entry.
  const beforeHeightPx = lineBoxes[adjusted - 1]!.bottomPx - firstLineTop + splitLayoutOverheadPx;
  if (occupiedBeforeTextPx + beforeHeightPx + marginBlockEndPx > pageHeight) {
    return null;
  }

  const splitLineBox = lineBoxes[adjusted]!;
  const lastLineBox = lineBoxes[lineBoxes.length - 1]!;
  return {
    splitLineIdx: adjusted,
    beforeEndGrapheme: splitLineBox.charOffset,
    beforeHeightPx,
    afterHeightPx: lastLineBox.bottomPx - splitLineBox.topPx + splitLayoutOverheadPx,
  };
}
