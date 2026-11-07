// src/pagination/assignmentWindows.ts
// Issue #244 — the chapter assignment's SOURCE windows: blockWindows
// (issue #233) filtered and clamped to one chapter's canonical offset range,
// so the windowed pagination adapter reads a BOUNDED work — internal layout
// windows are crossed inside the assignment exactly as they are inside a
// whole article, and no window ever reaches past the assigned chapter's
// end (the AC's "reading stays within the chapter assignment, including
// internal layout-window turns").
//
// Pure and deterministic: the same (article, range) always derives the same
// window list. Windows never change the canonical coordinates — clamping
// adjusts their own block/grapheme bounds to the assignment's range; the
// OFFSETS are the assignment's D-05 bounds verbatim. The result validates
// against BlockWindowSchema (the same homogeneous-boundary rule windows
// always obey) and is cached per (article, range) — the blockWindows cache
// discipline.
import type { CanonicalArticle, StructureDestination } from "../content/schema";
import { articleGraphemeIndex } from "../content/normalizeText";
import { BlockWindowSchema, blockWindows, windowGlobalEnd, windowGlobalStart } from "./blockWindow";
import type { BlockWindow } from "./blockWindow";

/** The window list one chapter assignment reads (empty when the range
 * covers no speakable source — honest absence, the caller renders the
 * unscoped path). */
const cache = new WeakMap<CanonicalArticle, Map<string, readonly BlockWindow[]>>();

/**
 * assignmentWindows — the windows of `article` that intersect the
 * assignment range [startOffset, endOffset), each clamped to it. Boundary
 * windows carry the assignment's intra-block bounds (the SAME
 * BlockWindow semantics structure destinations use), so a chapter opening
 * mid-block renders from exactly its first grapheme and a chapter ending
 * mid-block stops at exactly its last one.
 */
export function assignmentWindows(
  article: CanonicalArticle,
  startOffset: number,
  endOffset: number,
): readonly BlockWindow[] {
  if (endOffset <= startOffset) return [];
  const perArticle = cache.get(article) ?? new Map<string, readonly BlockWindow[]>();
  const key = `${startOffset}:${endOffset}`;
  const cached = perArticle.get(key);
  if (cached) return cached;
  const result = deriveAssignmentWindows(article, startOffset, endOffset);
  perArticle.set(key, result);
  cache.set(article, perArticle);
  return result;
}

/**
 * The assignment windows for one STRUCTURE DESTINATION (the shape the
 * reader route resolves) — offsets straight off the destination.
 */
export function destinationWindows(
  article: CanonicalArticle,
  destination: StructureDestination,
): readonly BlockWindow[] {
  return assignmentWindows(article, destination.startOffset, destination.endOffset);
}

function deriveAssignmentWindows(
  article: CanonicalArticle,
  startOffset: number,
  endOffset: number,
): readonly BlockWindow[] {
  const out: BlockWindow[] = [];
  for (const window of blockWindows(article)) {
    const ws = windowGlobalStart(article, window);
    const we = windowGlobalEnd(article, window);
    if (we <= startOffset || ws >= endOffset) continue;
    const clamped = clampWindowToRange(article, window, startOffset, endOffset);
    // Schema-validate the clamp (the homogeneous-boundary rule); a failed
    // clamp drops the window — honest absence, never a malformed window.
    if (clamped !== null) {
      const parsed = BlockWindowSchema.safeParse(clamped);
      if (parsed.success) out.push(parsed.data);
    }
  }
  return out;
}

/**
 * Clamp one window to [startOffset, endOffset). Returns null when the
 * clamped range is empty or degenerate (the window contributed nothing
 * inside the assignment).
 */
function clampWindowToRange(
  article: CanonicalArticle,
  window: BlockWindow,
  startOffset: number,
  endOffset: number,
): BlockWindow | null {
  const ws = windowGlobalStart(article, window);
  const we = windowGlobalEnd(article, window);
  const cs = Math.max(ws, startOffset);
  const ce = Math.min(we, endOffset);
  if (ce <= cs) return null;
  const clamped: BlockWindow = { ...window };
  if (cs > ws) {
    // Move the start forward.
    if (window.startFootnote !== undefined) {
      const bounds = footnoteBoundsAt(article, cs);
      if (bounds === null) return null;
      clamped.startFootnote = bounds.index;
      clamped.startFootnoteGrapheme = bounds.intra > 0 ? bounds.intra : undefined;
    } else {
      const bounds = bodyBoundsAt(article, cs);
      if (bounds === null) return null;
      clamped.startBlock = bounds.block;
      if (bounds.intra > 0) clamped.startGrapheme = bounds.intra;
      else delete clamped.startGrapheme;
    }
  }
  if (ce < we) {
    // Pull the end back.
    if (window.endFootnote !== undefined) {
      const bounds = footnoteBoundsAt(article, ce);
      if (bounds === null) return null;
      clamped.endFootnote = bounds.index + 1;
      if (bounds.intra > 0) clamped.endFootnoteGrapheme = bounds.intra;
      else delete clamped.endFootnoteGrapheme;
    } else {
      const bounds = bodyEndBoundsAt(article, ce);
      if (bounds === null) return null;
      clamped.endBlock = bounds.endBlock;
      if (bounds.endGrapheme !== undefined) clamped.endGrapheme = bounds.endGrapheme;
      else delete clamped.endGrapheme;
    }
  }
  return clamped;
}

/**
 * The LAST body block whose canonical start is <= `offset` (the ONE binary
 * search both clamp inversions share), or null past the body stream (a
 * footnotes-region offset has no body bounds — the caller's window was
 * misclassified).
 */
function blockIndexAtOrBefore(article: CanonicalArticle, offset: number): number | null {
  const { blockStartOffsets } = articleGraphemeIndex(article);
  const blockCount = article.blocks.length;
  let low = 0;
  let high = blockCount;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (blockStartOffsets[mid]! <= offset) low = mid;
    else high = mid - 1;
  }
  return low < blockCount ? low : null;
}

/**
 * The body block (and intra-block grapheme) covering canonical offset
 * `offset` — the offset→bounds inversion window clamping needs. The
 * separator after a block belongs to that block's span (the half-open
 * window convention), so an offset AT a block's start resolves to that
 * block with intra 0. Returns null past the body stream (a footnotes-region
 * offset has no body bounds — the caller's window was misclassified).
 */
function bodyBoundsAt(
  article: CanonicalArticle,
  offset: number,
): { block: number; intra: number } | null {
  const block = blockIndexAtOrBefore(article, offset);
  if (block === null) return null; // past the body stream
  const { blockStartOffsets, perBlockLengths } = articleGraphemeIndex(article);
  const intra = offset - blockStartOffsets[block]!;
  if (intra > perBlockLengths[block]!) return null; // inside a separator past the block's span
  return { block, intra };
}

/**
 * The EXCLUSIVE end bounds a body window needs so its canonical end is
 * exactly `offset`. A block-aligned offset ends the window at that block
 * (endBlock, no endGrapheme); an intra-block offset ends mid-block
 * (endBlock = block + 1, endGrapheme = intra). Null past the body stream.
 */
function bodyEndBoundsAt(
  article: CanonicalArticle,
  offset: number,
): { endBlock: number; endGrapheme?: number } | null {
  const index = articleGraphemeIndex(article);
  const total = index.totalGraphemes;
  // The work's exact total: the sentinel end (windows end at
  // blocks.length, owning no separator past the final text — #235).
  if (offset >= total) return { endBlock: article.blocks.length };
  const block = blockIndexAtOrBefore(article, offset);
  if (block === null) return null;
  const intra = offset - index.blockStartOffsets[block]!;
  if (intra === 0) return { endBlock: block };
  if (intra > index.perBlockLengths[block]!) return null;
  return { endBlock: block + 1, endGrapheme: intra };
}

/**
 * The footnote row (and intra-row grapheme) covering canonical offset
 * `offset` — the footnote-window clamp inversion. Null when the offset is
 * outside every footnote row's span.
 */
function footnoteBoundsAt(
  article: CanonicalArticle,
  offset: number,
): { index: number; intra: number } | null {
  for (const row of articleGraphemeIndex(article).footnoteRows) {
    if (offset >= row.start && offset < row.start + row.length) {
      return { index: row.index, intra: offset - row.start };
    }
  }
  return null;
}
