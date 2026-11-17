// Bounded layout work over the ORIGINAL article. Windows are ephemeral:
// neither article identities nor annotation coordinates are rewritten.
//
// Issue #233 — the intra-block source cursor: when a SINGLE block exceeds
// the window capacity (an enormous paragraph), the walk slices that block
// into ordered intra-block continuations of at most MAX_GRAPHEMES graphemes
// each. Ordinary blocks keep the block-aligned grouping — a capacity flush
// never cuts mid-block, so existing works keep their exact windows.
// Continuations are windows like any other: each is measured and paginated
// on its own, the article's block identities/offsets are untouched, and the
// window sequence covers every source grapheme exactly once in order.
//
// Issue #235 — footnote bodies participate in the SAME traversal. A work's
// windows are its BODY windows followed by its FOOTNOTE windows: homogeneous
// ranges (a window carries either body rows or footnote rows, never both).
// Footnote rows are the canonical non-empty footnote bodies (the substrate's
// footnoteRows — the offsets normalizeText itself produces), addressed by
// footnote INDICES into article.footnotes plus the same intra-row cursor
// fields. Footnote bodies are pure inline-run streams — every grapheme
// boundary is a legal cut — so an oversized body repeats continuations like
// giant prose does. Footnotes are never forged into article.blocks: the
// body range of a footnote window is the empty [blocks.length, blocks.length)
// sentinel, and normalized-text order, separators, and offsets are untouched.
//
// Issue #303 — the cold-mount chunk walk: an OVERSIZED scope (above the
// pre-#301 admission bound) keeps its single whole-work identity but mounts
// its hidden measurement projection in cooperative block/row-aligned chunks
// (coldMountChunks below) — the 260820 slicing invariant restored at the
// mount seam; scopes at or under the bound mount whole, unchanged.
import { z } from "zod";
import type { CanonicalArticle } from "../content/types";
import { articleGraphemeIndex, footnoteRowFor, footnoteRows } from "../content/normalizeText";
import { blockSliceBoundary, classifyBlock, hasOversizedAtomicDescendant } from "./splitBlock";
import { PAGINATION_PAGE_CEILING } from "./capacity";
import type { SourceCursor, PageFragment } from "./types";

const BlockWindowBase = z.object({
  includeFootnotes: z.boolean().optional(),
  startBlock: z.number().int().nonnegative(),
  endBlock: z.number().int().positive(),
  /** Intra-block D-05 start within blocks[startBlock]; absent = block start. */
  startGrapheme: z.number().int().nonnegative().optional(),
  /** Intra-block D-05 exclusive end within blocks[endBlock - 1]; absent = full. */
  endGrapheme: z.number().int().positive().optional(),
  /** Issue #235 — first footnote row (an index into article.footnotes). */
  startFootnote: z.number().int().nonnegative().optional(),
  /** Exclusive footnote-row end (an index INTO article.footnotes, +1 style). */
  endFootnote: z.number().int().positive().optional(),
  /** Intra-row D-05 start within footnotes[startFootnote]; absent = row start. */
  startFootnoteGrapheme: z.number().int().nonnegative().optional(),
  /** Intra-row D-05 exclusive end within footnotes[endFootnote - 1]. */
  endFootnoteGrapheme: z.number().int().positive().optional(),
});

/**
 * The ONE homogeneous-boundary rule both window schemas enforce (a merged
 * base would silently drop the refinement — the schemas share this named
 * predicate instead of two inline closures that can drift).
 */
function windowBoundsAreValid(range: {
  startBlock: number;
  endBlock: number;
  startGrapheme?: number;
  endGrapheme?: number;
  startFootnote?: number;
  endFootnote?: number;
}): boolean {
  if (range.startFootnote !== undefined || range.endFootnote !== undefined) {
    // Homogeneous footnote window: a non-empty footnote range over an EMPTY
    // body range anchored past the last body block (the #235 sentinel — the
    // window walks footnote rows only, never body rows).
    if (range.startBlock !== range.endBlock) return false;
    if (range.startFootnote === undefined || range.endFootnote === undefined) return false;
    if (range.startFootnote >= range.endFootnote) return false;
    if (range.startGrapheme !== undefined || range.endGrapheme !== undefined) return false;
    return true;
  }
  return range.startBlock < range.endBlock;
}

export const BlockWindowSchema = BlockWindowBase.refine(windowBoundsAreValid);
export type BlockWindow = z.infer<typeof BlockWindowSchema>;

export const MeasurementScopeSchema = z
  .object({
    articleId: z.string(),
    revision: z.number().int().positive(),
  })
  .extend(BlockWindowBase.shape)
  .refine(
    // The SAME boundary rule BlockWindowSchema enforces — one named
    // predicate, both boundary schemas (a merged base would silently drop
    // the refinement).
    windowBoundsAreValid,
  );
export type MeasurementScope = z.infer<typeof MeasurementScopeSchema>;

// Content-work bounds, not page counts or a performance budget. Giant atomic
// kinds still belong to the legacy path (explicit failure): they have no
// intra-block split semantic to continue through. Footnote bodies are pure
// inline-run streams — always splittable — so a footnote-carrying work is
// admissible once its windows cover the whole stream (#235).
export const MAX_BLOCKS = 32;
// Independent DOM admission bound, not an estimate of rendered page count.
const MAX_WHOLE_ARTICLE_ROWS = 2_048;
// Independent aggregate source budget (including notes), not a page estimate
// derived from the continuation tile size. Moderate readings should not lose
// continuous numbering merely because they need several small tiles. The
// paginator still enforces its unchanged page ceiling and refines capacity.
const MAX_WHOLE_ARTICLE_GRAPHEMES = 256_000;
export const MAX_GRAPHEMES = 8_000;
// Issue #303 — the pre-#301 effective whole-article admission bound
// (MAX_GRAPHEMES × floor(PAGINATION_PAGE_CEILING / MAX_BLOCKS)). #301 raised
// admission to MAX_WHOLE_ARTICLE_GRAPHEMES so moderate readings keep one
// continuous publication; works between this bound and that one are exactly
// the class #301 newly mounts in ONE synchronous projection pass, whose
// cold-open longtask breached the 250ms tripwire. They keep the single
// whole-work scope but mount cooperatively (coldMountChunks below).
export const WHOLE_ARTICLE_MOUNT_BOUND_GRAPHEMES =
  MAX_GRAPHEMES * Math.floor(PAGINATION_PAGE_CEILING / MAX_BLOCKS);
const cache = new WeakMap<CanonicalArticle, readonly BlockWindow[]>();

/**
 * True when block `i` exceeds the window capacity AND has an intra-block
 * split semantic (issue #233 prose; issue #234 extends the same cursor to
 * lists and quotations — a giant atomic kind keeps the honest legacy path
 * until a dedicated slice exists).
 */
function isGiantSplittable(article: CanonicalArticle, i: number, length: number): boolean {
  return length > MAX_GRAPHEMES && classifyBlock(article.blocks[i]!).kind === "split";
}

export function blockWindows(article: CanonicalArticle): readonly BlockWindow[] {
  const cached = cache.get(article);
  if (cached) return cached;
  const { perBlockLengths } = articleGraphemeIndex(article);
  const windows: BlockWindow[] = [];
  let startBlock = 0;
  let startGrapheme = 0; // intra-block start of the current window's head block
  let length = 0; // graphemes already accumulated into the current window
  const flushPending = (throughBlock: number): void => {
    windows.push(
      startGrapheme > 0
        ? { startBlock, endBlock: throughBlock, startGrapheme }
        : { startBlock, endBlock: throughBlock },
    );
    startBlock = throughBlock;
    startGrapheme = 0;
    length = 0;
  };
  for (let i = 0; i < article.blocks.length; i++) {
    const next = perBlockLengths[i]!;
    if (isGiantSplittable(article, i, next)) {
      // The giant block's FIRST chunk fills the pending window's remaining
      // capacity (preceding whole blocks stay with it — no heading-only
      // window at the open); interior full-capacity chunks become their own
      // single-block windows; the FINAL chunk stays the pending window's
      // head so following whole blocks can share its capacity. A window
      // may therefore begin AND/OR end mid-block — slice bounds always
      // belong to its own first/last block.
      if (i > startBlock && (i - startBlock >= MAX_BLOCKS || length >= MAX_GRAPHEMES)) {
        flushPending(i);
      }
      let g = 0;
      const block = article.blocks[i]!;
      while (next - g > MAX_GRAPHEMES - length) {
        const candidate = g + MAX_GRAPHEMES - length;
        let cut = blockSliceBoundary(block, candidate, article.lang);
        if (cut <= g) {
          if (length > 0) {
            // The next atomic descendant needs a fresh window's capacity.
            flushPending(i);
            continue;
          }
          // Oversized atomic descendants keep the legacy limit path, but
          // constructing its window cover must still terminate honestly.
          cut = blockSliceBoundary(block, candidate, article.lang, "after");
          if (cut >= next) break;
        }
        windows.push({
          startBlock,
          endBlock: i + 1,
          ...(startGrapheme > 0 ? { startGrapheme } : {}),
          endGrapheme: cut,
        });
        g = cut;
        startBlock = i;
        startGrapheme = g;
        length = 0;
      }
      length += next - g;
      continue;
    }
    if (i > startBlock && (i - startBlock >= MAX_BLOCKS || length + next > MAX_GRAPHEMES)) {
      flushPending(i);
    }
    length += next;
  }
  flushPending(article.blocks.length);

  // Issue #235 — footnote rows follow the body rows as homogeneous footnote
  // windows over the SAME canonical stream (footnoteRows offsets). The walk
  // mirrors the body rules: a capacity flush never cuts mid-row; an
  // oversized row slices into ordered intra-row continuations of at most
  // MAX_GRAPHEMES graphemes (a footnote body is a pure inline-run stream —
  // every grapheme boundary is a legal cut, like a paragraph's).
  const rows = footnoteRows(article);
  if (rows.length > 0) {
    const bodyEnd = article.blocks.length;
    let fnStart = rows[0]!.index;
    let fnGrapheme = 0; // intra-row start of the pending window's head row
    let fnLength = 0; // graphemes already accumulated into the pending window
    let fnRows = 0; // rows already accumulated into the pending window
    const flushFootnotes = (throughRowIndex: number): void => {
      windows.push({
        startBlock: bodyEnd,
        endBlock: bodyEnd,
        startFootnote: fnStart,
        // The exclusive end follows the last INCLUDED row, not the next
        // non-empty row: there may be empty note bodies between the two.
        endFootnote: rows[throughRowIndex - 1]!.index + 1,
        ...(fnGrapheme > 0 ? { startFootnoteGrapheme: fnGrapheme } : {}),
      });
      fnStart = rows[throughRowIndex]!.index;
      fnGrapheme = 0;
      fnLength = 0;
      fnRows = 0;
    };
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r]!;
      if (row.length > MAX_GRAPHEMES) {
        // Mirror of the body walk's giant-prose branch: the giant row's
        // FIRST chunk fills the pending window's remaining capacity; interior
        // full-capacity chunks become their own single-row windows; the
        // FINAL chunk stays the pending window's head. Every grapheme
        // boundary is a legal cut (a footnote body is a pure inline-run
        // stream — no atomic descendants), so the cut is the capacity edge.
        if (fnRows > 0 && (fnRows >= MAX_BLOCKS || fnLength >= MAX_GRAPHEMES)) {
          flushFootnotes(r);
        }
        let g = 0;
        while (row.length - g > MAX_GRAPHEMES - fnLength) {
          const cut = g + MAX_GRAPHEMES - fnLength;
          windows.push({
            startBlock: bodyEnd,
            endBlock: bodyEnd,
            startFootnote: fnStart,
            endFootnote: row.index + 1,
            ...(fnGrapheme > 0 ? { startFootnoteGrapheme: fnGrapheme } : {}),
            endFootnoteGrapheme: cut,
          });
          g = cut;
          fnStart = row.index;
          fnGrapheme = g;
          fnLength = 0;
          fnRows = 1;
        }
        fnLength += row.length - g;
        if (g === 0) fnRows += 1;
        continue;
      }
      if (fnRows > 0 && (fnRows >= MAX_BLOCKS || fnLength + row.length > MAX_GRAPHEMES)) {
        flushFootnotes(r);
      }
      fnLength += row.length;
      fnRows += 1;
    }
    windows.push({
      startBlock: bodyEnd,
      endBlock: bodyEnd,
      startFootnote: fnStart,
      endFootnote: rows.at(-1)!.index + 1,
      ...(fnGrapheme > 0 ? { startFootnoteGrapheme: fnGrapheme } : {}),
    });
  }
  cache.set(article, windows);
  return windows;
}

/**
 * Whole-work measurement is bounded independently of the small continuation
 * tiles. Bound both DOM rows and aggregate text (including a single long
 * block). Source rows are not pages: many short paragraphs can share a page.
 * The independent 2,048-row DOM bound and aggregate-text bound limit admission;
 * the engine's unchanged 300-page ceiling limits actual layout work.
 * This is a source-work admission bound, NOT a page estimate:
 * extreme layouts can still hit capacity and refine through the scoped host.
 * Body and note rows share a bounded publication, with homogeneous pages.
 */
export function readingWindows(article: CanonicalArticle): readonly BlockWindow[] {
  const { totalGraphemes } = articleGraphemeIndex(article);
  if (
    article.blocks.length > 0 &&
    article.blocks.length + footnoteRows(article).length <= MAX_WHOLE_ARTICLE_ROWS &&
    totalGraphemes <= MAX_WHOLE_ARTICLE_GRAPHEMES
  ) {
    return [{ startBlock: 0, endBlock: article.blocks.length, includeFootnotes: true }];
  }
  return blockWindows(article);
}

/**
 * Issue #303 — the window's note-row range as CANONICAL footnote INDICES
 * [start, end): the window's own fields for a footnote scope, ALL rows for
 * an includeFootnotes (whole-work) scope, and no range (undefined start)
 * for a body-only scope. The ONE derivation — the span walk and the chunk
 * walk share it so they can never disagree about which rows a scope owns.
 */
function noteRowRange(
  article: CanonicalArticle,
  window: BlockWindow,
): { start: number | undefined; end: number } {
  const firstRow = footnoteRows(article)[0]?.index;
  return {
    start: window.startFootnote ?? (window.includeFootnotes ? firstRow : undefined),
    end: window.endFootnote ?? (window.includeFootnotes ? article.footnotes.length : 0),
  };
}

/**
 * Issue #303 — the window's rendered source span, in the same currency the
 * admission bounds use (body + note row grapheme lengths). Coarse by
 * design: it decides a 72,000-grapheme mounting threshold, so separator
 * bookkeeping is out of scope.
 */
function windowGraphemeSpan(article: CanonicalArticle, window: BlockWindow): number {
  const { perBlockLengths } = articleGraphemeIndex(article);
  const rows = footnoteRows(article);
  const bodyStart = window.startBlock;
  const bodyEnd = window.startFootnote !== undefined ? window.startBlock : window.endBlock;
  let span = 0;
  for (let i = bodyStart; i < bodyEnd; i++) span += perBlockLengths[i]!;
  const notes = noteRowRange(article, window);
  if (notes.start !== undefined) {
    for (const row of rows) {
      if (row.index >= notes.start && row.index < notes.end) span += row.length;
    }
  }
  return span;
}

/**
 * Issue #303 — cooperative cold-mount chunks for an oversized scope.
 *
 * Returns null when the window's projection is small enough to mount in one
 * synchronous pass (every scope at or under the pre-#301 whole-article
 * bound — byte-identical rendering path). Otherwise returns BLOCK-ALIGNED
 * body chunk windows followed by ROW-ALIGNED footnote chunk windows whose
 * concatenation covers exactly the window's rows in canonical order:
 * the projection mounts one chunk per task (WindowedPaginatedSurface),
 * restoring the 260820 slicing invariant over the cold open while the
 * scope — and therefore the publication's whole-work numbering — stays
 * exactly what readingWindows admitted.
 *
 * Chunks never cut a block or a note row: the measurement engine counts the
 * scope's rendered rows 1:1 (measureAllBlocks + the alignment guard), so a
 * mid-row cut would change the row count the engine must find. A giant row
 * mounts whole inside its chunk (over capacity, never over scope). The
 * window's own boundary cursors (a refined/assignment scope's slice bounds)
 * ride the boundary chunks; interior chunks are whole-row windows.
 */
export function coldMountChunks(
  article: CanonicalArticle,
  window: BlockWindow,
): readonly BlockWindow[] | null {
  if (windowGraphemeSpan(article, window) <= WHOLE_ARTICLE_MOUNT_BOUND_GRAPHEMES) return null;
  const { perBlockLengths } = articleGraphemeIndex(article);
  const rows = footnoteRows(article);
  const chunks: BlockWindow[] = [];

  // Body walk — block-aligned, the tiled-window capacities per chunk.
  if (window.startFootnote === undefined) {
    let count = 0;
    let length = 0;
    let start = window.startBlock;
    const flushBody = (throughBlock: number): void => {
      chunks.push({
        startBlock: start,
        endBlock: throughBlock,
        ...(start === window.startBlock && window.startGrapheme !== undefined
          ? { startGrapheme: window.startGrapheme }
          : {}),
        ...(throughBlock === window.endBlock && window.endGrapheme !== undefined
          ? { endGrapheme: window.endGrapheme }
          : {}),
      });
      start = throughBlock;
      count = 0;
      length = 0;
    };
    for (let i = window.startBlock; i < window.endBlock; i++) {
      const next = perBlockLengths[i]!;
      if (count > 0 && (count >= MAX_BLOCKS || length + next > MAX_GRAPHEMES)) flushBody(i);
      count += 1;
      length += next;
    }
    flushBody(window.endBlock);
  }

  // Footnote walk — row-aligned over the scope's canonical rows (the
  // substrate's non-empty bodies), homogeneous windows on the past-body
  // sentinel. The window's boundary intra-row cursors ride the ends.
  const notes = noteRowRange(article, window);
  if (notes.start !== undefined) {
    const noteStart = notes.start;
    const noteEnd = notes.end;
    const scopeRows = rows.filter((row) => row.index >= noteStart && row.index < noteEnd);
    const bodyEnd = article.blocks.length;
    let count = 0;
    let length = 0;
    let startRow = 0; // index into scopeRows
    const flushNotes = (throughRow: number): void => {
      chunks.push({
        startBlock: bodyEnd,
        endBlock: bodyEnd,
        startFootnote: scopeRows[startRow]!.index,
        // The exclusive end follows the last INCLUDED row (empty bodies
        // between windows are no rows — the tiled walk's convention).
        endFootnote: scopeRows[throughRow - 1]!.index + 1,
        ...(startRow === 0 && window.startFootnoteGrapheme !== undefined
          ? { startFootnoteGrapheme: window.startFootnoteGrapheme }
          : {}),
        ...(throughRow === scopeRows.length && window.endFootnoteGrapheme !== undefined
          ? { endFootnoteGrapheme: window.endFootnoteGrapheme }
          : {}),
      });
      startRow = throughRow;
      count = 0;
      length = 0;
    };
    for (let r = 0; r < scopeRows.length; r++) {
      const row = scopeRows[r]!;
      if (count > 0 && (count >= MAX_BLOCKS || length + row.length > MAX_GRAPHEMES)) {
        flushNotes(r);
      }
      count += 1;
      length += row.length;
    }
    if (scopeRows.length > 0) flushNotes(scopeRows.length);
  }

  // A single chunk is the whole window — nothing to cooperate over (an
  // oversized span in one row cannot chunk without cutting the row).
  return chunks.length > 1 ? chunks : null;
}

/** A capacity-limited prefix must not briefly advertise a whole-work count. */
export function hasWholeArticlePagination(
  article: CanonicalArticle,
  range: BlockWindow | undefined,
  pages: readonly PageFragment[],
): boolean {
  if (!isWholeArticleWindow(article, range)) return false;
  const expected = [
    ...articleGraphemeIndex(article).perBlockLengths.map((length, blockIndex) => ({
      blockIndex,
      footnoteIndex: undefined as number | undefined,
      length,
    })),
    ...footnoteRows(article).map((row) => ({
      blockIndex: article.blocks.length,
      footnoteIndex: row.index,
      length: row.length,
    })),
  ].filter((row) => row.length > 0);
  let rowIndex = 0;
  let offset = 0;
  for (const entry of pages.flatMap((page) => page.blocks)) {
    const row = expected[rowIndex];
    if (
      !row ||
      entry.blockIndex !== row.blockIndex ||
      entry.footnoteIndex !== row.footnoteIndex ||
      entry.startGrapheme !== offset ||
      entry.endGrapheme <= offset ||
      entry.endGrapheme > row.length
    )
      return false;
    offset = entry.endGrapheme;
    if (offset === row.length) {
      rowIndex++;
      offset = 0;
    }
  }
  return rowIndex === expected.length && offset === 0;
}

/** Exact page denominators are legal only for a complete canonical scope. */
export function isWholeArticleWindow(article: CanonicalArticle, range?: BlockWindow): boolean {
  return (
    range === undefined ||
    (range.startBlock === 0 &&
      range.endBlock === article.blocks.length &&
      range.startGrapheme === undefined &&
      range.endGrapheme === undefined &&
      range.startFootnote === undefined &&
      (range.includeFootnotes === true || footnoteRows(article).length === 0))
  );
}

export function canUseBlockWindows(article: CanonicalArticle): boolean {
  // Do not newly admit a body-only paginated view when it would omit source
  // content. Giant prose AND giant containers are covered (intra-block
  // continuations); any other oversized block (atomic kinds — no split
  // semantic) keeps the honest legacy path rather than an unbounded
  // measurement. Issue #235: footnote bodies are pure inline-run streams —
  // every grapheme boundary is a legal cut — so footnote rows are always
  // coverable. Even a short footnoted work uses the note-aware path: the
  // legacy paginator emits body entries only, so it cannot expose note
  // destinations or reach true completion. Short works without note text
  // still keep the legacy path. The empty-body degenerate (every
  // block contributes zero clusters) also keeps the legacy path: its
  // footnotes region starts at offset 0 and the block-aligned body windows
  // would misaddress it.
  const windows = blockWindows(article);
  if (windows.length <= 1) return false;
  const { perBlockLengths } = articleGraphemeIndex(article);
  if (article.footnotes.length > 0 && perBlockLengths.every((len) => len === 0)) return false;
  return article.blocks.every((_, i) => {
    const length = perBlockLengths[i]!;
    return (
      (length <= MAX_GRAPHEMES || isGiantSplittable(article, i, length)) &&
      !hasOversizedAtomicDescendant(article.blocks[i]!, MAX_GRAPHEMES, article.lang)
    );
  });
}

/** The canonical D-05 start of the footnote row covering `footnoteIndex`. */
function footnoteRowStart(article: CanonicalArticle, footnoteIndex: number): number {
  const row = footnoteRowFor(article, footnoteIndex);
  if (!row) {
    throw new Error(`footnoteWindow: footnote fn-${footnoteIndex} has no canonical row`);
  }
  return row.start;
}

/** The article-global D-05 offset of a window's first source grapheme. */
export function windowGlobalStart(article: CanonicalArticle, window: BlockWindow): number {
  if (window.startFootnote !== undefined) {
    return footnoteRowStart(article, window.startFootnote) + (window.startFootnoteGrapheme ?? 0);
  }
  const { blockStartOffsets } = articleGraphemeIndex(article);
  return blockStartOffsets[window.startBlock]! + (window.startGrapheme ?? 0);
}

/**
 * The article-global D-05 offset one past the window's last source grapheme.
 * A window that ends at its last row's full length also owns the block
 * separator that follows it (the pre-#233 half-open convention) — EXCEPT the
 * work's final row, which owns nothing past its text: the last window's end
 * is exactly the canonical total, so a footnoted work finishes only when its
 * footnote text is truly reached (#235).
 */
export function windowGlobalEnd(article: CanonicalArticle, window: BlockWindow): number {
  if (window.includeFootnotes) return articleGraphemeIndex(article).totalGraphemes;
  if (window.endFootnote !== undefined) {
    // The row covering footnote index (endFootnote - 1) — looked up by
    // CANONICAL INDEX, never by position: footnote ranges may span empty
    // bodies (empty bodies are no rows), so rows[window.endFootnote - 1]
    // would misaddress or miss whenever a note body is whitespace-only.
    const lastRow = footnoteRowFor(article, window.endFootnote - 1);
    if (!lastRow) {
      throw new Error(`footnoteWindow: footnote fn-${window.endFootnote - 1} has no canonical row`);
    }
    if (window.endFootnoteGrapheme !== undefined) {
      return lastRow.start + window.endFootnoteGrapheme;
    }
    const ownsTrailingSeparator = lastRow !== footnoteRows(article).at(-1);
    return lastRow.start + lastRow.length + (ownsTrailingSeparator ? 1 : 0);
  }
  const { blockStartOffsets } = articleGraphemeIndex(article);
  if (window.endGrapheme !== undefined) {
    return blockStartOffsets[window.endBlock - 1]! + window.endGrapheme;
  }
  return blockStartOffsets[window.endBlock]!;
}

export function blockWindowForOffset(
  article: CanonicalArticle,
  offset: number,
  windows: readonly BlockWindow[] = blockWindows(article),
): BlockWindow {
  // Offsets in a block separator belong to the preceding window. An end-pin
  // lands in the final window; zero-text visual blocks remain in the cover.
  return windows.find(
    (range, i) => i === windows.length - 1 || offset < windowGlobalEnd(article, range),
  )!;
}

/**
 * The canonical D-05 offset of a continuation cursor (issues #233/#235): body
 * cursors read the block prefix sums; footnote cursors read their row's
 * canonical start. The ONE conversion — consumers must never rebuild it.
 */
export function cursorGlobalOffset(article: CanonicalArticle, cursor: SourceCursor): number {
  if (cursor.footnoteIndex !== undefined) {
    const row = footnoteRows(article).find((r) => r.index === cursor.footnoteIndex);
    if (!row) {
      throw new Error(`cursorGlobalOffset: footnote fn-${cursor.footnoteIndex} has no row`);
    }
    return row.start + cursor.startGrapheme;
  }
  return articleGraphemeIndex(article).blockStartOffsets[cursor.blockIndex]! + cursor.startGrapheme;
}

/**
 * Refine an existing source window at a capacity cursor. The two children
 * cover exactly the same original source range; nothing is renumbered.
 * Intra-block cursors refine any split-semantic kind (prose per issue
 * #233, lists/quotations per issue #234); a cursor inside an atomic block
 * has no slice semantic and stays unsupported (honest failure). Issue #235:
 * a cursor carrying footnoteIndex refines a footnote window's rows — a
 * footnote body is a pure inline-run stream, so any interior grapheme
 * boundary is legal.
 */
export function refineWindow(
  article: CanonicalArticle,
  window: BlockWindow,
  cursor: SourceCursor,
): readonly [BlockWindow, BlockWindow] | null {
  const { blockStartOffsets, perBlockLengths } = articleGraphemeIndex(article);
  if (cursor.footnoteIndex !== undefined) {
    const row = footnoteRowFor(article, cursor.footnoteIndex);
    const { footnoteIndex, startGrapheme } = cursor;
    if (
      !row ||
      window.startFootnote === undefined ||
      window.endFootnote === undefined ||
      footnoteIndex < window.startFootnote ||
      footnoteIndex >= window.endFootnote ||
      startGrapheme >= row.length
    )
      return null;
    const cut = row.start + startGrapheme;
    if (cut <= windowGlobalStart(article, window) || cut >= windowGlobalEnd(article, window))
      return null;
    // Capacity can stop BETWEEN notes. A zero intra-row cursor excludes
    // that row from the prefix; skip any intervening empty bodies when
    // choosing its exclusive end. Interior cuts keep both row slices.
    const previousRow =
      startGrapheme === 0
        ? footnoteRows(article)
            .filter(
              (candidate) =>
                candidate.index >= window.startFootnote! && candidate.index < footnoteIndex,
            )
            .at(-1)
        : undefined;
    if (startGrapheme === 0 && !previousRow) return null;
    const prefix: BlockWindow = {
      startBlock: window.startBlock,
      endBlock: window.endBlock,
      startFootnote: window.startFootnote,
      endFootnote: startGrapheme > 0 ? footnoteIndex + 1 : previousRow!.index + 1,
      ...(window.startFootnoteGrapheme !== undefined
        ? { startFootnoteGrapheme: window.startFootnoteGrapheme }
        : {}),
      ...(startGrapheme > 0 ? { endFootnoteGrapheme: startGrapheme } : {}),
    };
    const tail: BlockWindow = {
      startBlock: window.startBlock,
      endBlock: window.endBlock,
      startFootnote: footnoteIndex,
      endFootnote: window.endFootnote,
      ...(startGrapheme > 0 ? { startFootnoteGrapheme: startGrapheme } : {}),
      ...(window.endFootnoteGrapheme !== undefined
        ? { endFootnoteGrapheme: window.endFootnoteGrapheme }
        : {}),
    };
    return [prefix, tail];
  }
  const { blockIndex, startGrapheme } = cursor;
  if (
    blockIndex < window.startBlock ||
    blockIndex >= window.endBlock ||
    startGrapheme > perBlockLengths[blockIndex]! ||
    (startGrapheme > 0 && classifyBlock(article.blocks[blockIndex]!).kind !== "split") ||
    blockSliceBoundary(article.blocks[blockIndex]!, startGrapheme, article.lang) !== startGrapheme
  )
    return null;
  const cut = blockStartOffsets[blockIndex]! + startGrapheme;
  if (cut <= windowGlobalStart(article, window) || cut >= windowGlobalEnd(article, window))
    return null;
  const prefix: BlockWindow = {
    startBlock: window.startBlock,
    ...(window.startGrapheme !== undefined ? { startGrapheme: window.startGrapheme } : {}),
    endBlock: blockIndex + (startGrapheme > 0 ? 1 : 0),
    ...(startGrapheme > 0 ? { endGrapheme: startGrapheme } : {}),
  };
  const tail: BlockWindow = {
    startBlock: blockIndex,
    ...(startGrapheme > 0 ? { startGrapheme } : {}),
    endBlock: window.endBlock,
    ...(window.endGrapheme !== undefined ? { endGrapheme: window.endGrapheme } : {}),
  };
  return [prefix, tail];
}

export function sameWindow(a: BlockWindow, b: BlockWindow): boolean {
  return (
    !!a.includeFootnotes === !!b.includeFootnotes &&
    a.startBlock === b.startBlock &&
    a.endBlock === b.endBlock &&
    (a.startGrapheme ?? 0) === (b.startGrapheme ?? 0) &&
    (a.endGrapheme ?? -1) === (b.endGrapheme ?? -1) &&
    (a.startFootnote ?? -1) === (b.startFootnote ?? -1) &&
    (a.endFootnote ?? -1) === (b.endFootnote ?? -1) &&
    (a.startFootnoteGrapheme ?? 0) === (b.startFootnoteGrapheme ?? 0) &&
    (a.endFootnoteGrapheme ?? -1) === (b.endFootnoteGrapheme ?? -1)
  );
}

/**
 * The ONE scope-identity string (issue #233): two continuation windows of
 * the SAME block are different scopes, so consumers that gate repagination
 * anchoring on a scope key must include the slice bounds. Keys built by
 * hand elsewhere drift from this definition — always call this.
 */
export function windowScopeKey(window: BlockWindow | undefined): string {
  if (!window) return "full";
  if (window.includeFootnotes) return "whole-with-notes";
  if (window.startFootnote !== undefined) {
    return footnoteSliceScopeKey(
      window.startFootnote,
      window.endFootnote!,
      window.startFootnoteGrapheme,
      window.endFootnoteGrapheme,
    );
  }
  return `${window.startBlock}:${window.endBlock}:${window.startGrapheme ?? 0}:${
    window.endGrapheme ?? "end"
  }`;
}

/**
 * The footnote-slice identity string (issue #235) — shared by windowScopeKey
 * and the pagination trail's scope-change evidence so two formatters can
 * never drift.
 */
export function footnoteSliceScopeKey(
  startFootnote: number,
  endFootnote: number,
  startFootnoteGrapheme?: number,
  endFootnoteGrapheme?: number,
): string {
  return `fn:${startFootnote}:${endFootnote}:${startFootnoteGrapheme ?? 0}:${
    endFootnoteGrapheme ?? "end"
  }`;
}

/** Article metadata belongs only at the original work's source origin. */
export function isWorkStart(window: BlockWindow | undefined): boolean {
  return (window?.startBlock ?? 0) === 0 && (window?.startGrapheme ?? 0) === 0;
}

/**
 * Whether a neighbor continuation exists BEFORE this scope — a scope may
 * begin mid-block (a giant-prose tail slice), so the block index alone
 * cannot answer (issue #233).
 */
export function windowHasPrevious(article: CanonicalArticle, window: BlockWindow): boolean {
  return windowGlobalStart(article, window) > 0;
}

/** Whether a neighbor continuation exists AFTER this scope (issue #233). */
export function windowHasNext(article: CanonicalArticle, window: BlockWindow): boolean {
  const last = blockWindows(article).at(-1)!;
  return windowGlobalEnd(article, window) < windowGlobalEnd(article, last);
}
