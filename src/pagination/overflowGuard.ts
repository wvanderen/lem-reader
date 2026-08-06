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
//   caller mounts pages[currentPageIdx] → measures .page-fragment scrollHeight
//     → if scrollHeight > articleClientHeight + tolerance:
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
import type { LineBox, PageFragment } from "./types";
import { classifyBlock } from "./splitBlock";
import { applyLineWidowOrphan, SPLIT_WIDOW_LINES } from "./widowRules";
import {
  blockNormalizedText,
  charOffsetToGrapheme,
  readLineBoxes,
} from "./lineBoxes";

/**
 * PAGE_CEILING mirrors src/pagination/fragment.ts. If the input pages[] is
 * already at the ceiling, emit dom-fallback rather than splitting further
 * (T-04-07-02 mitigation: provable termination ceiling). 300 is a generous
 * bound (the longest fixture is essay-long-form); reaching it implies a
 * pathological input or an upstream bug.
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
  /** The article clientHeight — the available page content-box height in CSS px. */
  pageContentBoxHeightPx: number;
  /** Sub-pixel slack (2px per the no-overflow e2e). */
  tolerance: number;
  /** Diagnostic bus — emit dom-fallback when refragmentation cannot resolve. */
  diagnostics: DiagnosticBus;
  /** Cancel signal; abort mid-walk returns null (silent cancel). */
  signal: AbortSignal;
}

/**
 * Post-render overflow guard. Mirrors src/pagination/fragment.ts's discipline
 * (PAGE-03 + PAGE-04 contracts; pure domain function; emits dom-fallback on
 * the same DiagnosticBus). Reuses readLineBoxes + applyLineWidowOrphan +
 * classifyBlock + charOffsetToGrapheme — NO normalization fork (Pitfall 3),
 * NO Pretext import (Pitfall 6).
 *
 * @returns null when the rendered fragment does NOT overflow (pass-through);
 *          a corrected PageFragment[] (length = input length + 1, indices
 *          renumbered 0..length-1) when refragmentation succeeded; or an
 *          empty array (length 0) when the engine emits dom-fallback (single
 *          atomic block too tall, splitting block alone on page with no
 *          widow-legal fit, or pages.length >= PAGE_CEILING).
 *
 * PAGE-03 invariant: the returned PageFragment[] (when non-empty) covers the
 * SAME article-global source range as the input; corrections strictly
 * redistribute entries, never drop or duplicate them.
 */
export function refragmentOverflowingPage(
  opts: RefragmentOptions,
): PageFragment[] | null {
  if (opts.signal.aborted) return null;

  // T-04-07-02 termination guard: never subdivide past the ceiling. If the
  // input already has PAGE_CEILING pages, the guard would otherwise happily
  // produce PAGE_CEILING + 1, +2, ... across successive post-render passes.
  // Short-circuit before any DOM measurement.
  if (opts.pages.length >= PAGE_CEILING) {
    emitFallback(opts.diagnostics);
    return [];
  }

  const overflowPage = opts.pages[opts.overflowingPageIndex];
  if (!overflowPage) return null;
  if (opts.signal.aborted) return null;

  // Measure children against the live fragment. The fragment's
  // getBoundingClientRect().top is the reference for "fragment-relative"
  // bottoms — the renderer can mount the fragment at any viewport offset.
  const fragmentTop = opts.fragmentEl.getBoundingClientRect().top;
  const pageBox = opts.pageContentBoxHeightPx;
  const tolerance = opts.tolerance;
  const children = Array.from(opts.fragmentEl.children) as HTMLElement[];

  // Find the FIRST child whose bottom (relative to fragment top) exceeds the
  // page box + tolerance. Children are rendered in fragment.blocks order, so
  // child[i] ↔ overflowPage.blocks[i] (1:1 correspondence — the renderer
  // walks fragment.blocks left-to-right).
  let offendingChildIndex = -1;
  for (let i = 0; i < children.length; i++) {
    if (opts.signal.aborted) return null;
    const child = children[i]!;
    const childBottomRel = child.getBoundingClientRect().bottom - fragmentTop;
    if (childBottomRel > pageBox + tolerance) {
      offendingChildIndex = i;
      break;
    }
  }
  if (offendingChildIndex === -1) return null; // no overflow detected

  const offendingEntry = overflowPage.blocks[offendingChildIndex];
  if (!offendingEntry) return null; // children/pages mismatch — defensive
  const offendingBlock = opts.article.blocks[offendingEntry.blockIndex];
  if (!offendingBlock) return null;

  const entriesBefore = overflowPage.blocks.slice(0, offendingChildIndex);
  const entriesFromOffending = overflowPage.blocks.slice(offendingChildIndex);
  const decision = classifyBlock(offendingBlock);
  const childEl = children[offendingChildIndex]!;
  const offendingRect = childEl.getBoundingClientRect();
  const offendingHeight = offendingRect.height;

  // ── ATOMIC: move whole block + trailing siblings to a new next page ──────
  if (decision.kind === "atomic") {
    // The offending atomic block alone exceeds the page box (even on a fresh
    // empty page) → refragmentation cannot resolve. Emit dom-fallback; the
    // PAGE-04/PAGE-09 scrolling fallback path takes over.
    if (offendingHeight > pageBox - tolerance) {
      emitFallback(opts.diagnostics);
      return [];
    }
    // Otherwise: split the overflowing page into [entriesBefore] + [entriesFromOffending].
    return splitPageAtChild(opts.pages, opts.overflowingPageIndex, entriesBefore, entriesFromOffending);
  }

  // ── SPLITTING: try to re-split at a tighter widow-legal line ─────────────
  // The live rendered element contains the slice [offendingEntry.startGrapheme,
  // offendingEntry.endGrapheme) of the block. readLineBoxes walks THAT slice's
  // text (Range.getClientRects over the rendered text nodes). blockNormalizedText
  // gives us the slice's normalized text — for paragraphs in clean ASCII this
  // equals splittingBlockText of the slice (the renderer concatenates run texts
  // without separators), so the grapheme offsets round-trip through the
  // renderer's slicing (Pitfall 3 — no normalization fork).
  const sliceText = blockNormalizedText(childEl);
  if (opts.signal.aborted) return null;
  const lineBoxes = readLineBoxes(childEl, sliceText, opts.signal);

  const sliceSplitGrapheme = chooseLargestWidowLegalSplit(
    lineBoxes,
    sliceText,
    opts.article.lang,
    pageBox,
    tolerance,
  );

  if (sliceSplitGrapheme === null) {
    // No widow-legal re-split fits the current page. If the block alone
    // exceeds the page box, emit dom-fallback; otherwise move it whole to
    // the next page (the next post-render pass will re-attempt the split).
    if (entriesBefore.length === 0 || offendingHeight > pageBox + tolerance) {
      emitFallback(opts.diagnostics);
      return [];
    }
    return splitPageAtChild(opts.pages, opts.overflowingPageIndex, entriesBefore, entriesFromOffending);
  }

  // Build the new entries: the offending entry is split at
  // (offendingEntry.startGrapheme + sliceSplitGrapheme). The slice-local
  // grapheme offset is added to the entry's existing startGrapheme to produce
  // block-level endGrapheme / startGrapheme values that round-trip through
  // the renderer's slicing. Defensive clamp: sliceSplitGrapheme is bounded
  // to [0, sliceLen].
  const sliceLen = offendingEntry.endGrapheme - offendingEntry.startGrapheme;
  const clampedSplit = Math.max(0, Math.min(sliceSplitGrapheme, sliceLen));
  const blockLevelSplit = offendingEntry.startGrapheme + clampedSplit;

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
  if (clampedSplit === 0 || clampedSplit === sliceLen) {
    if (entriesBefore.length === 0 || offendingHeight > pageBox + tolerance) {
      emitFallback(opts.diagnostics);
      return [];
    }
    return splitPageAtChild(opts.pages, opts.overflowingPageIndex, entriesBefore, entriesFromOffending);
  }

  const newCurrentBlocks = [
    ...entriesBefore,
    {
      blockIndex: offendingEntry.blockIndex,
      startGrapheme: offendingEntry.startGrapheme,
      endGrapheme: blockLevelSplit,
    },
  ];
  const newNextBlocks = [
    {
      blockIndex: offendingEntry.blockIndex,
      startGrapheme: blockLevelSplit,
      endGrapheme: offendingEntry.endGrapheme,
    },
    ...overflowPage.blocks.slice(offendingChildIndex + 1),
  ];

  return replaceOverflowPage(opts.pages, opts.overflowingPageIndex, [
    { schemaVersion: 1, pageIndex: 0, blocks: newCurrentBlocks },
    { schemaVersion: 1, pageIndex: 0, blocks: newNextBlocks },
  ]);
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
  sliceText: string,
  lang: string,
  pageBox: number,
  tolerance: number,
): number | null {
  if (lineBoxes.length === 0) return null;
  if (lineBoxes.length < 2 * SPLIT_WIDOW_LINES) return null;
  const firstLineTop = lineBoxes[0]!.topPx;
  const limit = pageBox + tolerance;
  // Walk from the END backward — we want the LARGEST k whose widow-adjusted
  // before-slice fits. applyLineWidowOrphan clamps to
  // [SPLIT_WIDOW_LINES, length - SPLIT_WIDOW_LINES]; iterating k from
  // (length - 1) down through SPLIT_WIDOW_LINES covers every valid adjusted
  // value at least once.
  for (let k = lineBoxes.length - 1; k >= SPLIT_WIDOW_LINES; k--) {
    const adjusted = applyLineWidowOrphan(lineBoxes, k);
    if (adjusted <= 0 || adjusted >= lineBoxes.length) continue;
    const beforeBottom =
      lineBoxes[adjusted - 1]!.bottomPx - firstLineTop;
    if (beforeBottom <= limit) {
      const splitCharOffset = lineBoxes[adjusted]!.charOffset;
      return charOffsetToGrapheme(sliceText, splitCharOffset, lang);
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
function emitFallback(diagnostics: DiagnosticBus): void {
  diagnostics.emit({ kind: "dom-fallback", ts: new Date().toISOString() });
}
