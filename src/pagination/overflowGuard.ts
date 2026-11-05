// src/pagination/overflowGuard.ts
// Post-render overflow guard — the STACK.md-mandated safety net for the
// pagination engine. Plan 04-06's pre-capture pipeline measures line boxes
// against the full ArticleBody in scrolling geometry; those heights don't
// always predict rendered page-fragment heights inside .paginated-surface
// (paginated geometry, overflow:hidden). Pages can overflow their
// content-box by 4–82px across the corpus → silent clipping. The guard runs
// AFTER the renderer mounts a page fragment and corrects overflow by
// re-splitting against LIVE DOM truth (Range.getClientRects line boxes
// walked on the actual rendered slice).
//
// Pipeline trace:
//   caller mounts pages[currentPageIdx] → invokes the live boundary guard
//         call refragmentOverflowingPage({ pages, fragmentEl, ... })
//           → walk fragmentEl.children, find first whose getBoundingClientRect
//             bottom exceeds pageBox + tolerance
//           → atomic? move whole block + trailing siblings to a new next page
//           → splitting? re-read live line boxes via readLineBoxes
//             → choose largest widow-legal line split whose before-slice fits
//             → emit tighter before-slice on current page, after-slice + any
//               trailing siblings on a new next page
//           → single-block-too-tall / no-widow-legal-fit?
//             emit dom-fallback + return [] (length 0)
//         caller setPages(corrected) → next post-render pass re-checks
//
// PAGE-03b (no silent clipping): the guard's whole purpose. The pre-capture
// pipeline stays as the FIRST pass (Plan 04-06); the guard is the SECOND pass.
//
// PAGE-03a (exactly-once, canonical order): preserved. Each correction
// strictly subdivides the offending page's source range; the union of all
// pages' source ranges still equals [0, graphemeLength(article)) with no
// overlap or omission. The guard emits page indices in 0..length-1 order.
//
// PAGE-03c (termination): preserved. Each correction strictly reduces the
// source range covered by the overflowing page; across at most N corrections
// (one per page) the system reaches a fixed point. PAGE_CEILING is a
// defensive guard against pathological input.
//
// STACK.md contract (AGENTS.md §Stack Patterns by Variant mandates "per-kind
// measurement + a post-render overflow guard"). This module IS that guard.
//
// Pitfall 6 (no Pretext): this module imports ONLY from src/pagination/*,
// src/content/normalizeText, src/measurement/{diagnostics,fontGate}. The
// @chenglou/pretext package is NEVER imported here (T-04-SC).

import type { CanonicalArticle } from "../content/types";
import type { DiagnosticBus } from "../measurement/diagnostics";
import {
  articleGraphemeIndex,
  buildRawToNormMap,
  footnoteRowFor,
  graphemeClusters,
} from "../content/normalizeText";
import type { LineBox, PageFragment, SourceCursor } from "./types";
import { blockSliceBoundary, classifyBlock, footnoteBodyBlock } from "./splitBlock";
import { applyLineWidowOrphan, SPLIT_WIDOW_LINES } from "./widowRules";
import { blockNormalizedText, charOffsetToGrapheme, readLineBoxes } from "./lineBoxes";

/**
 * PAGE_CEILING mirrors src/pagination/fragment.ts. If the input pages[] is
 * already at the ceiling, retain a corrected prefix and yield its first
 * omitted source cursor to a continuation-aware host. Legacy callers without
 * that host retain the explicit fallback. No pass ever returns over 300 pages.
 */
const PAGE_CEILING = 300;

/**
 * Options for {@link refragmentOverflowingPage}.
 */
export interface RefragmentOptions {
  /** The article being paginated. */
  article: CanonicalArticle;
  /** Current pages from the pre-capture pass; the guard reads pages[overflowingPageIndex]. */
  pages: PageFragment[];
  /** Index into pages[] of the page whose rendered fragment overflowed. */
  overflowingPageIndex: number;
  /** The live rendered .page-fragment DOM element of the overflowing page. */
  fragmentEl: HTMLElement;
  /** The dedicated page viewport's available content-box height in CSS px. */
  pageContentBoxHeightPx: number;
  /** Sub-pixel slack (2px per the no-overflow e2e). */
  tolerance: number;
  /** Diagnostic bus — emit dom-fallback when refragmentation cannot resolve. */
  diagnostics: DiagnosticBus;
  /** Cancel signal; abort mid-walk returns null (silent cancel). */
  signal: AbortSignal;
  /** A successful correction may retain only its bounded prefix. Load this tail next. */
  onCapacity?: (continuation: SourceCursor) => void;
}

/**
 * Post-render overflow guard. Mirrors src/pagination/fragment.ts's discipline
 * (PAGE-03 + PAGE-04 contracts; pure domain function; emits dom-fallback on
 * the same DiagnosticBus). Reuses readLineBoxes + applyLineWidowOrphan +
 * classifyBlock + charOffsetToGrapheme — NO normalization fork (Pitfall 3),
 * NO Pretext import (Pitfall 6).
 *
 * @returns null when the rendered fragment does NOT overflow (pass-through);
 *          corrected pages (at most 300, indices renumbered 0..length-1),
 *          with onCapacity(firstOmittedSource) if a tail must load next; or an
 *          empty array (length 0) when the engine emits dom-fallback (single
 *          atomic block too tall, splitting block alone on page with no
 *          widow-legal fit, or capacity without an onCapacity host).
 *
 * PAGE-03 invariant: the returned PageFragment[] (when non-empty) covers the
 * SAME source range as the input, or its exactly-once prefix plus the
 * onCapacity cursor that resumes the remaining range. No source is lost.
 */
export function refragmentOverflowingPage(opts: RefragmentOptions): PageFragment[] | null {
  if (opts.signal.aborted) return null;

  const overflowPage = opts.pages[opts.overflowingPageIndex];
  if (!overflowPage) return null;
  if (opts.signal.aborted) return null;

  // Measure against the containing page viewport. A first child's block
  // margin can collapse through .page-fragment and shift the fragment's own
  // border box downward, so fragmentEl.top is not a stable page origin. The
  // parent .page-viewport is the box whose height the caller supplied.
  const pageTop =
    opts.fragmentEl.parentElement?.getBoundingClientRect().top ??
    opts.fragmentEl.getBoundingClientRect().top;
  const pageBox = opts.pageContentBoxHeightPx;
  const tolerance = opts.tolerance;
  const children = Array.from(opts.fragmentEl.children) as HTMLElement[];

  // Issue #235 — pages are homogeneous. A footnote page's rendered entries
  // are the <li data-footnote-index> items inside the footnotes region (the
  // fragment's only child is that section); a body page's entries are the
  // fragment's direct children. Either way element[i] ↔ blocks[i] in order.
  const isFootnotePage = overflowPage.blocks[0]?.footnoteIndex !== undefined;
  const footnoteItems = isFootnotePage
    ? Array.from(opts.fragmentEl.querySelectorAll<HTMLElement>("li[data-footnote-index]"))
    : [];
  const renderedEls: HTMLElement[] = isFootnotePage ? footnoteItems : children;

  // Find the FIRST rendered element whose bottom (relative to the page
  // viewport) exceeds the page box + tolerance. Elements render in
  // blocks order, so renderedEls[i] ↔ overflowPage.blocks[i] (1:1 — the
  // renderer walks fragment.blocks left-to-right).
  let offendingChildIndex = -1;
  for (let i = 0; i < renderedEls.length; i++) {
    if (opts.signal.aborted) return null;
    const child = renderedEls[i]!;
    const childBottomRel = child.getBoundingClientRect().bottom - pageTop;
    if (childBottomRel > pageBox + tolerance) {
      offendingChildIndex = i;
      break;
    }
  }
  if (offendingChildIndex === -1) return null; // no overflow detected

  // Validate/correct first: capacity must not disguise genuine layout failure.
  // A successful correction yields its first omitted source position while
  // retaining at most 300 pages (including the corrected current page).
  const bounded = (corrected: PageFragment[]): PageFragment[] => {
    const firstOmitted = corrected[PAGE_CEILING]?.blocks[0];
    if (firstOmitted) {
      if (!opts.onCapacity) {
        emitFallback(opts.diagnostics, "overflow-page-ceiling");
        return [];
      }
      opts.onCapacity({
        blockIndex: firstOmitted.blockIndex,
        startGrapheme: firstOmitted.startGrapheme,
        ...(firstOmitted.footnoteIndex !== undefined
          ? { footnoteIndex: firstOmitted.footnoteIndex }
          : {}),
      });
    }
    return corrected.slice(0, PAGE_CEILING);
  };

  const offendingEntry = overflowPage.blocks[offendingChildIndex];
  if (!offendingEntry) return null; // rendered/pages mismatch — defensive
  // Issue #235 — footnote entries slice through the footnote body's inline-run
  // VIEW (never a forged block); blockIndex on such entries is the past-body
  // sentinel and must not read article.blocks.
  const entryFootnoteIndex = offendingEntry.footnoteIndex;
  const offendingBlock =
    entryFootnoteIndex !== undefined
      ? footnoteBodyBlock(opts.article.footnotes[entryFootnoteIndex]!, opts.article.lang)
      : opts.article.blocks[offendingEntry.blockIndex];
  if (!offendingBlock) return null;

  const entriesBefore = overflowPage.blocks.slice(0, offendingChildIndex);
  const entriesFromOffending = overflowPage.blocks.slice(offendingChildIndex);
  const decision = classifyBlock(offendingBlock);
  const childEl = renderedEls[offendingChildIndex]!;
  const offendingRect = childEl.getBoundingClientRect();
  const offendingHeight = offendingRect.height;

  // ── ATOMIC: move whole block + trailing siblings to a new next page ──────
  if (decision.kind === "atomic") {
    // The offending atomic block alone exceeds the page box (even on a fresh
    // empty page) → refragmentation cannot resolve. Emit dom-fallback; the
    // PAGE-04/PAGE-09 scrolling fallback path takes over.
    if (offendingHeight > pageBox - tolerance) {
      emitFallback(opts.diagnostics, "overflow-atomic-too-tall");
      return [];
    }
    if (entriesBefore.length === 0) {
      emitFallback(opts.diagnostics, "overflow-no-progress");
      return [];
    }
    // Otherwise: split the overflowing page into [entriesBefore] + [entriesFromOffending].
    return bounded(
      splitPageAtChild(opts.pages, opts.overflowingPageIndex, entriesBefore, entriesFromOffending),
    );
  }

  // ── SPLITTING: try to re-split at a tighter widow-legal line ─────────────
  // The live rendered element contains the slice [offendingEntry.startGrapheme,
  // offendingEntry.endGrapheme) of the row. readLineBoxes walks THAT slice's
  // text (Range.getClientRects over the rendered text nodes). Spike 0007 F2
  // reconciliation: entry ranges are D-05 ordinals, so the slice-local split
  // the guard chooses must be bridged onto the slice's D-05 window through
  // the SHARED buildRawToNormMap walk (the same seam the pagination engine's
  // line-box conversion uses in fragment.ts) — raw rendered text ↔ the
  // window's normalized text. For clean prose the bridge is the identity
  // (Pitfall 3 — no normalization fork).
  // Issue #235 — footnote rows read the CONTENT WRAPPER (data-footnote-
  // content): its textContent is exactly the entry's raw run text, while the
  // li itself also carries the ↩ back-link chrome, which is not source text.
  const guardEl =
    entryFootnoteIndex !== undefined
      ? (childEl.querySelector<HTMLElement>("[data-footnote-content]") ?? childEl)
      : childEl;
  const sliceRawText = guardEl.textContent ?? "";
  const index = articleGraphemeIndex(opts.article);
  const rowOrigin =
    entryFootnoteIndex !== undefined
      ? (footnoteRowFor(opts.article, entryFootnoteIndex)?.start ?? 0)
      : index.blockStartOffsets[offendingEntry.blockIndex]!;
  const sliceNormText = index.clusters
    .slice(rowOrigin + offendingEntry.startGrapheme, rowOrigin + offendingEntry.endGrapheme)
    .join("");
  if (opts.signal.aborted) return null;
  const lineBoxes = readLineBoxes(guardEl, blockNormalizedText(guardEl), opts.signal);

  const sliceSplitGrapheme = chooseLargestWidowLegalSplit(
    lineBoxes,
    sliceRawText,
    sliceNormText,
    opts.article.lang,
    pageTop,
    pageBox,
    tolerance,
  );

  if (sliceSplitGrapheme === null) {
    // No widow-legal re-split fits the current page. If the block alone
    // exceeds the page box, emit dom-fallback; otherwise move it whole to
    // the next page (the next post-render pass will re-attempt the split).
    if (entriesBefore.length === 0 || offendingHeight > pageBox + tolerance) {
      emitFallback(opts.diagnostics, "overflow-no-legal-split");
      return [];
    }
    return bounded(
      splitPageAtChild(opts.pages, opts.overflowingPageIndex, entriesBefore, entriesFromOffending),
    );
  }

  // Build the new entries: the offending entry is split at
  // (offendingEntry.startGrapheme + sliceSplitGrapheme). The slice-local
  // grapheme offset is added to the entry's existing startGrapheme to produce
  // block-level endGrapheme / startGrapheme values that round-trip through
  // the renderer's slicing. Defensive clamp: sliceSplitGrapheme is bounded
  // to [0, sliceLen].
  const sliceLen = offendingEntry.endGrapheme - offendingEntry.startGrapheme;
  const candidateSplit =
    offendingEntry.startGrapheme + Math.max(0, Math.min(sliceSplitGrapheme, sliceLen));
  // The live line walk can land inside an atomic descendant of a list or
  // quotation. Its start is an earlier (therefore fitting) legal boundary;
  // never repeat the whole child on both sides of a repair.
  const blockLevelSplit = blockSliceBoundary(offendingBlock, candidateSplit, opts.article.lang);
  const clampedSplit = blockLevelSplit - offendingEntry.startGrapheme;

  // Defensive (Rule 1 — empty-slice guard): if the chosen split lands at the
  // slice boundary (clampedSplit === 0 or === sliceLen), the resulting before-
  // or after-slice would be empty — violating PAGE-03a exactly-once coverage.
  // This can happen when the live DOM textContent disagrees with the entry's
  // startGrapheme/endGrapheme range (e.g., when the slice was JUST emitted by
  // a prior refragmentation pass and React hasn't re-rendered the sliced
  // block yet, OR when the block has multi-byte UTF-16 chars whose grapheme
  // vs UTF-16 lengths diverge from the line-box walk's coordinate). Treat as
  // "cannot find a widow-legal split" and fall back to moving the whole block
  // to the next page (or emit dom-fallback if it can't fit alone).
  if (clampedSplit <= 0 || clampedSplit >= sliceLen) {
    if (entriesBefore.length === 0 || offendingHeight > pageBox + tolerance) {
      emitFallback(opts.diagnostics, "overflow-no-progress");
      return [];
    }
    return bounded(
      splitPageAtChild(opts.pages, opts.overflowingPageIndex, entriesBefore, entriesFromOffending),
    );
  }

  // The corrected before/after entries — one shape, the footnote identity
  // riding conditionally (issue #235).
  const splitEntry = (
    startGrapheme: number,
    endGrapheme: number,
  ): PageFragment["blocks"][number] =>
    entryFootnoteIndex !== undefined
      ? {
          blockIndex: offendingEntry.blockIndex,
          footnoteIndex: entryFootnoteIndex,
          startGrapheme,
          endGrapheme,
        }
      : { blockIndex: offendingEntry.blockIndex, startGrapheme, endGrapheme };
  const newCurrentBlocks = [
    ...entriesBefore,
    splitEntry(offendingEntry.startGrapheme, blockLevelSplit),
  ];
  const newNextBlocks = [
    splitEntry(blockLevelSplit, offendingEntry.endGrapheme),
    ...overflowPage.blocks.slice(offendingChildIndex + 1),
  ];

  return bounded(
    replaceOverflowPage(opts.pages, opts.overflowingPageIndex, [
      { schemaVersion: 1, pageIndex: 0, blocks: newCurrentBlocks },
      { schemaVersion: 1, pageIndex: 0, blocks: newNextBlocks },
    ]),
  );
}

/**
 * Walk line boxes from the END backward to find the LARGEST widow-legal line
 * index `k` whose before-slice bottomPx ≤ pageBox + tolerance. Returns the
 * slice-local GRAPHENE ordinal at the chosen split (i.e. the grapheme offset
 * corresponding to lineBoxes[k].charOffset within sliceText), or null when
 * no valid split exists.
 *
 * Mirrors the chooseSplit logic in src/pagination/fragment.ts but walks
 * backward (the guard wants the LARGEST fit, not the first overflow) and
 * reads live DOM line boxes (not pre-captured).
 *
 * Returns null when:
 *   - lineBoxes.length === 0 (no text rendered), OR
 *   - lineBoxes.length < 2 * SPLIT_WIDOW_LINES (block too short to split
 *     under the 2/2 rule — caller falls back to whole-block move), OR
 *   - no widow-adjusted k in [SPLIT_WIDOW_LINES, length - SPLIT_WIDOW_LINES]
 *     yields a before-slice that fits.
 */
function chooseLargestWidowLegalSplit(
  lineBoxes: readonly LineBox[],
  sliceRawText: string,
  sliceNormText: string,
  lang: string,
  pageTopPx: number,
  pageBox: number,
  tolerance: number,
): number | null {
  if (lineBoxes.length === 0) return null;
  if (lineBoxes.length < 2 * SPLIT_WIDOW_LINES) return null;
  const limit = pageBox + tolerance;
  // Walk from the END backward — we want the LARGEST k whose widow-adjusted
  // before-slice fits. applyLineWidowOrphan clamps to
  // [SPLIT_WIDOW_LINES, length - SPLIT_WIDOW_LINES]; iterating k from
  // (length - 1) down through SPLIT_WIDOW_LINES covers every valid adjusted
  // value at least once.
  for (let k = lineBoxes.length - 1; k >= SPLIT_WIDOW_LINES; k--) {
    const adjusted = applyLineWidowOrphan(lineBoxes, k);
    if (adjusted <= 0 || adjusted >= lineBoxes.length) continue;
    // Line boxes are viewport-relative. Compare their live bottom against the
    // page viewport's actual top so content preceding this paragraph consumes its
    // share of the page. The old line-local calculation treated every
    // offending paragraph as if it started at y=0 and repeatedly chose a split
    // that still extended below the page boundary.
    const beforeBottom = lineBoxes[adjusted - 1]!.bottomPx - pageTopPx;
    if (beforeBottom <= limit) {
      // Slice-local D-05 ordinal: raw cluster the line box addresses →
      // normalized-grapheme ordinal via the shared bridge (see the call
      // site's coordinate note).
      const splitCharOffset = lineBoxes[adjusted]!.charOffset;
      const rawIndex = charOffsetToGrapheme(sliceRawText, splitCharOffset, lang);
      const map = buildRawToNormMap(
        graphemeClusters(sliceRawText, lang),
        graphemeClusters(sliceNormText, lang),
      );
      return map[Math.min(rawIndex, map.length - 1)]!;
    }
  }
  return null;
}

/**
 * Build corrected pages by replacing the overflowing page with TWO new pages:
 * [entriesBefore] + [entriesFromOffending]. The result is renumbered so
 * pageIndex fields are 0..length-1 in canonical order.
 *
 * PAGE-03 invariant: the entries of entriesBefore + entriesFromOffending
 * together exactly equal the original overflowPage.blocks (no drop, no
 * duplication) — this is a strict subdivision of one page into two.
 */
function splitPageAtChild(
  pages: readonly PageFragment[],
  overflowingPageIndex: number,
  entriesBefore: PageFragment["blocks"],
  entriesFromOffending: PageFragment["blocks"],
): PageFragment[] {
  return replaceOverflowPage(pages, overflowingPageIndex, [
    { schemaVersion: 1, pageIndex: 0, blocks: entriesBefore },
    { schemaVersion: 1, pageIndex: 0, blocks: entriesFromOffending },
  ]);
}

/**
 * Replace pages[overflowingPageIndex] with `replacementPages` (one or more),
 * then renumber every pageIndex field across the result so indices are
 * 0..length-1 in canonical order. The relative order of all OTHER pages is
 * preserved.
 */
function replaceOverflowPage(
  pages: readonly PageFragment[],
  overflowingPageIndex: number,
  replacementPages: PageFragment[],
): PageFragment[] {
  const result: PageFragment[] = [];
  for (let i = 0; i < pages.length; i++) {
    if (i === overflowingPageIndex) {
      for (const replacement of replacementPages) {
        result.push({ ...replacement, pageIndex: result.length });
      }
    } else {
      result.push({ ...pages[i]!, pageIndex: result.length });
    }
  }
  return result;
}

/** Emit a dom-fallback diagnostic on the bus (PAGE-09 surfaces it to the reader). */
function emitFallback(diagnostics: DiagnosticBus, reason: string): void {
  diagnostics.emit({ kind: "dom-fallback", ts: new Date().toISOString(), reason });
}
