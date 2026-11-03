// Bounded layout work over the ORIGINAL article. Windows are ephemeral:
// neither article identities nor annotation coordinates are rewritten.
import { z } from "zod";
import type { CanonicalArticle } from "../content/types";
import { articleGraphemeIndex } from "../content/normalizeText";

export const BlockWindowSchema = z
  .object({
    startBlock: z.number().int().nonnegative(),
    endBlock: z.number().int().positive(),
  })
  .refine((range) => range.startBlock < range.endBlock);
export type BlockWindow = z.infer<typeof BlockWindowSchema>;

export const MeasurementScopeSchema = z.object({
  articleId: z.string(),
  revision: z.number().int().positive(),
  startBlock: z.number().int().nonnegative(),
  endBlock: z.number().int().positive(),
});
export type MeasurementScope = z.infer<typeof MeasurementScopeSchema>;

// Content-work bounds, not page counts or a performance budget. This first
// block-boundary slice does not replace the legacy path for giant single
// blocks or footnotes; those require intra-block/footnote source cursors.
const MAX_BLOCKS = 32;
const MAX_GRAPHEMES = 8_000;
const cache = new WeakMap<CanonicalArticle, readonly BlockWindow[]>();

export function blockWindows(article: CanonicalArticle): readonly BlockWindow[] {
  const cached = cache.get(article);
  if (cached) return cached;
  const { perBlockLengths } = articleGraphemeIndex(article);
  const windows: BlockWindow[] = [];
  let startBlock = 0;
  let length = 0;
  for (let i = 0; i < article.blocks.length; i++) {
    const next = perBlockLengths[i]!;
    if (i > startBlock && (i - startBlock >= MAX_BLOCKS || length + next > MAX_GRAPHEMES)) {
      windows.push({ startBlock, endBlock: i });
      startBlock = i;
      length = 0;
    }
    length += next;
  }
  windows.push({ startBlock, endBlock: article.blocks.length });
  cache.set(article, windows);
  return windows;
}

export function canUseBlockWindows(article: CanonicalArticle): boolean {
  // Do not newly admit a body-only paginated view when it would omit footnote
  // bodies, or call a giant unsliced measurement bounded. Preserve the old
  // path until the next source-cursor slice can represent those cases.
  return (
    article.footnotes.length === 0 &&
    blockWindows(article).length > 1 &&
    articleGraphemeIndex(article).perBlockLengths.every((length) => length <= MAX_GRAPHEMES)
  );
}

export function blockWindowForOffset(article: CanonicalArticle, offset: number): BlockWindow {
  const windows = blockWindows(article);
  const { blockStartOffsets } = articleGraphemeIndex(article);
  // Offsets in a block separator belong to the preceding window. An end-pin
  // lands in the final window; zero-text visual blocks remain in the cover.
  return windows.find(
    (range, i) => i === windows.length - 1 || offset < blockStartOffsets[range.endBlock]!,
  )!;
}

export function sameWindow(a: BlockWindow, b: BlockWindow): boolean {
  return a.startBlock === b.startBlock && a.endBlock === b.endBlock;
}
