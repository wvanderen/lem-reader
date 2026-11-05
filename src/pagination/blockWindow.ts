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
import { z } from "zod";
import type { CanonicalArticle } from "../content/types";
import { articleGraphemeIndex, footnoteRows } from "../content/normalizeText";
import { blockSliceBoundary, classifyBlock, hasOversizedAtomicDescendant } from "./splitBlock";
import type { SourceCursor } from "./types";

const BlockWindowBase = z.object({
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

export const BlockWindowSchema = BlockWindowBase.refine((range) => {
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
});
export type BlockWindow = z.infer<typeof BlockWindowSchema>;

export const MeasurementScopeSchema = z
  .object({
    articleId: z.string(),
    revision: z.number().int().positive(),
  })
  .extend(BlockWindowBase.shape)
  .refine(
    // The SAME boundary rule BlockWindowSchema enforces — one rule, both
    // boundary schemas (a merged base would silently drop the refinement).
    (scope) => {
      if (scope.startFootnote !== undefined || scope.endFootnote !== undefined) {
        if (scope.startBlock !== scope.endBlock) return false;
        if (scope.startFootnote === undefined || scope.endFootnote === undefined) return false;
        if (scope.startFootnote >= scope.endFootnote) return false;
        if (scope.startGrapheme !== undefined || scope.endGrapheme !== undefined) return false;
        return true;
      }
      return scope.startBlock < scope.endBlock;
    },
  );
export type MeasurementScope = z.infer<typeof MeasurementScopeSchema>;

  // Content-work bounds, not page counts or a performance budget. Giant atomic
  // kinds still belong to the legacy path (explicit failure): they have no
  // intra-block split semantic to continue through. Footnote bodies are pure
  // inline-run streams — always splittable — so a footnote-carrying work is
  // admissible once its windows cover the whole stream (#235).
const MAX_BLOCKS = 32;
const MAX_GRAPHEMES = 8_000;
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
        endFootnote: rows[throughRowIndex]!.index,
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

export function canUseBlockWindows(article: CanonicalArticle): boolean {
  // Do not newly admit a body-only paginated view when it would omit source
  // content. Giant prose AND giant containers are covered (intra-block
  // continuations); any other oversized block (atomic kinds — no split
  // semantic) keeps the honest legacy path rather than an unbounded
  // measurement. Issue #235: footnote bodies are pure inline-run streams —
  // every grapheme boundary is a legal cut — so footnote rows are always
  // coverable. Admission needs GENUINE bounded-pagination demand: several
  // BODY windows (the long-work slice) or several FOOTNOTE windows (notes
  // alone past one window). A short work whose footnotes fit beside its one
  // body window keeps the legacy full-document path — existing short-work
  // behavior is unchanged by this slice. The empty-body degenerate (every
  // block contributes zero clusters) also keeps the legacy path: its
  // footnotes region starts at offset 0 and the block-aligned body windows
  // would misaddress it.
  const windows = blockWindows(article);
  if (windows.length <= 1) return false;
  const { perBlockLengths } = articleGraphemeIndex(article);
  if (article.footnotes.length > 0 && perBlockLengths.every((len) => len === 0)) return false;
  const bodyWindows = windows.filter((w) => w.startFootnote === undefined).length;
  if (bodyWindows <= 1 && windows.length - bodyWindows <= 1) return false;
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
  const row = footnoteRows(article).find((r) => r.index === footnoteIndex);
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
  if (window.endFootnote !== undefined) {
    const rows = footnoteRows(article);
    const lastRow = rows[window.endFootnote - 1];
    if (!lastRow) {
      throw new Error(`footnoteWindow: footnote fn-${window.endFootnote - 1} has no canonical row`);
    }
    if (window.endFootnoteGrapheme !== undefined) {
      return lastRow.start + window.endFootnoteGrapheme;
    }
    const ownsTrailingSeparator = window.endFootnote - 1 < rows.at(-1)!.index;
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
    const rows = footnoteRows(article);
    const row = rows.find((r) => r.index === cursor.footnoteIndex);
    const { footnoteIndex, startGrapheme } = cursor;
    if (
      !row ||
      window.startFootnote === undefined ||
      window.endFootnote === undefined ||
      footnoteIndex < window.startFootnote ||
      footnoteIndex >= window.endFootnote ||
      startGrapheme > row.length ||
      startGrapheme === 0 ||
      startGrapheme === row.length
    )
      return null;
    const cut = row.start + startGrapheme;
    if (cut <= windowGlobalStart(article, window) || cut >= windowGlobalEnd(article, window))
      return null;
    const prefix: BlockWindow = {
      startBlock: window.startBlock,
      endBlock: window.endBlock,
      startFootnote: window.startFootnote,
      endFootnote: footnoteIndex + 1,
      ...(window.startFootnoteGrapheme !== undefined
        ? { startFootnoteGrapheme: window.startFootnoteGrapheme }
        : {}),
      endFootnoteGrapheme: startGrapheme,
    };
    const tail: BlockWindow = {
      startBlock: window.startBlock,
      endBlock: window.endBlock,
      startFootnote: footnoteIndex,
      endFootnote: window.endFootnote,
      startFootnoteGrapheme: startGrapheme,
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
  if (window.startFootnote !== undefined) {
    return `fn:${window.startFootnote}:${window.endFootnote}:${
      window.startFootnoteGrapheme ?? 0
    }:${window.endFootnoteGrapheme ?? "end"}`;
  }
  return `${window.startBlock}:${window.endBlock}:${window.startGrapheme ?? 0}:${
    window.endGrapheme ?? "end"
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
