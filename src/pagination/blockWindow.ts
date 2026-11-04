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
import { z } from "zod";
import type { CanonicalArticle } from "../content/types";
import { articleGraphemeIndex } from "../content/normalizeText";
import { classifyBlock } from "./splitBlock";
import type { SourceCursor } from "./types";

const BlockWindowBase = z.object({
  startBlock: z.number().int().nonnegative(),
  endBlock: z.number().int().positive(),
  /** Intra-block D-05 start within blocks[startBlock]; absent = block start. */
  startGrapheme: z.number().int().nonnegative().optional(),
  /** Intra-block D-05 exclusive end within blocks[endBlock - 1]; absent = full. */
  endGrapheme: z.number().int().positive().optional(),
});

export const BlockWindowSchema = BlockWindowBase.refine(
  (range) => range.startBlock < range.endBlock,
);
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
    (scope) => scope.startBlock < scope.endBlock,
  );
export type MeasurementScope = z.infer<typeof MeasurementScopeSchema>;

// Content-work bounds, not page counts or a performance budget. Footnote
// bodies and giant atomic kinds still belong to the legacy path (explicit
// failure): they have no intra-block split semantic to continue through.
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
      const capacity = MAX_GRAPHEMES - length;
      if (capacity > 0 && capacity < next) {
        windows.push({
          startBlock,
          endBlock: i + 1,
          ...(startGrapheme > 0 ? { startGrapheme } : {}),
          endGrapheme: capacity,
        });
        g = capacity;
        length = MAX_GRAPHEMES;
      }
      while (g + MAX_GRAPHEMES < next) {
        windows.push({
          startBlock: i,
          endBlock: i + 1,
          startGrapheme: g,
          endGrapheme: g + MAX_GRAPHEMES,
        });
        g += MAX_GRAPHEMES;
      }
      startBlock = i;
      startGrapheme = g;
      length = next - g;
      continue;
    }
    if (i > startBlock && (i - startBlock >= MAX_BLOCKS || length + next > MAX_GRAPHEMES)) {
      flushPending(i);
    }
    length += next;
  }
  windows.push(
    startGrapheme > 0
      ? { startBlock, endBlock: article.blocks.length, startGrapheme }
      : { startBlock, endBlock: article.blocks.length },
  );
  cache.set(article, windows);
  return windows;
}

export function canUseBlockWindows(article: CanonicalArticle): boolean {
  // Do not newly admit a body-only paginated view when it would omit footnote
  // bodies. Giant prose AND giant containers are covered (intra-block
  // continuations); any other oversized block (atomic kinds — no split
  // semantic) keeps the honest legacy path rather than an unbounded
  // measurement.
  if (article.footnotes.length > 0 || blockWindows(article).length <= 1) return false;
  const { perBlockLengths } = articleGraphemeIndex(article);
  return article.blocks.every((_, i) => {
    const length = perBlockLengths[i]!;
    return length <= MAX_GRAPHEMES || isGiantSplittable(article, i, length);
  });
}

/** The article-global D-05 offset of a window's first source grapheme. */
export function windowGlobalStart(article: CanonicalArticle, window: BlockWindow): number {
  const { blockStartOffsets } = articleGraphemeIndex(article);
  return blockStartOffsets[window.startBlock]! + (window.startGrapheme ?? 0);
}

/**
 * The article-global D-05 offset one past the window's last source grapheme.
 * A window that ends at its last block's full length also owns the block
 * separator that follows it (the pre-#233 half-open convention).
 */
export function windowGlobalEnd(article: CanonicalArticle, window: BlockWindow): number {
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
 * Refine an existing source window at a capacity cursor. The two children
 * cover exactly the same original source range; nothing is renumbered.
 * Intra-block cursors refine any split-semantic kind (prose per issue
 * #233, lists/quotations per issue #234); a cursor inside an atomic block
 * has no slice semantic and stays unsupported (honest failure).
 */
export function refineWindow(
  article: CanonicalArticle,
  window: BlockWindow,
  cursor: SourceCursor,
): readonly [BlockWindow, BlockWindow] | null {
  const { blockStartOffsets, perBlockLengths } = articleGraphemeIndex(article);
  const { blockIndex, startGrapheme } = cursor;
  if (
    blockIndex < window.startBlock ||
    blockIndex >= window.endBlock ||
    startGrapheme > perBlockLengths[blockIndex]! ||
    (startGrapheme > 0 && classifyBlock(article.blocks[blockIndex]!).kind !== "split")
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
    (a.endGrapheme ?? -1) === (b.endGrapheme ?? -1)
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
