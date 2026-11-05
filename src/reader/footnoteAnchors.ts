import type { Block, CanonicalArticle } from "../content/types";
import { articleGraphemeIndex, BLOCK_SEPARATOR, footnoteRowFor } from "../content/normalizeText";
import { blockGraphemeLength } from "../pagination/anchor";

/** Find a reference's canonical offset, including references inside nested
 * lists/quotations. Child lengths use the shared D-05 substrate; separators
 * between children and list items follow blockNormalizedText's join rules. */
function referenceOffset(
  block: Block,
  footnoteId: string,
  origin: number,
  lang: string,
): number | null {
  if (block.kind === "footnote-reference") {
    return block.footnoteId === footnoteId ? origin : null;
  }
  const groups =
    block.kind === "blockquote"
      ? [block.children]
      : block.kind === "bulleted-list" || block.kind === "numbered-list"
        ? block.items.map((item) => item.content)
        : [];
  let cursor = origin;
  for (const children of groups) {
    for (const child of children) {
      const found = referenceOffset(child, footnoteId, cursor, lang);
      if (found !== null) return found;
      cursor += blockGraphemeLength(child, lang) + BLOCK_SEPARATOR.length;
    }
    // An empty list item still contributes its inter-item separator.
    if (children.length === 0) cursor += BLOCK_SEPARATOR.length;
  }
  return null;
}

/** Resolve a note/return fragment to the reader's canonical position currency.
 * Missing IDs and empty note bodies have no destination. */
export function footnoteAnchorOffset(article: CanonicalArticle, href: string): number | null {
  const id = href.slice(1);
  if (/^fn-\d+$/.test(id)) {
    const index = article.footnotes.findIndex((fn) => fn.id === id);
    return index < 0 ? null : (footnoteRowFor(article, index)?.start ?? null);
  }
  const refMatch = /^fn-ref-(\d+)$/.exec(id);
  if (!refMatch) return null;
  const { blockStartOffsets } = articleGraphemeIndex(article);
  for (const [i, block] of article.blocks.entries()) {
    const found = referenceOffset(block, `fn-${refMatch[1]}`, blockStartOffsets[i]!, article.lang);
    if (found !== null) return found;
  }
  return null;
}
