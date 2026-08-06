// src/pagination/fragmentRenderer.tsx
// PageFragmentView renders ONE page fragment's worth of semantic blocks by
// REUSING BlockView (DOC-02 reading order, D-05 integrity, A11Y-03 single
// content tree — the same renderer the scrolling ArticleBody uses). The
// renderer never forks a parallel block-kind switch; its only job is to
// resolve the source block for each fragment entry and, when the entry
// carries a sub-block grapheme range, slice the block and feed the slice to
// BlockView.
//
// D4-01 (booklike line-boundary splitting — the load-bearing path): when a
// fragment entry carries a sub-block range (startGrapheme > 0 OR endGrapheme
// < blockLength), the renderer MUST slice the block and render only the
// intra-block slice. For paragraphs this means calling splitParagraphRuns to
// cut the InlineRun[] at the grapheme boundary; BOTH halves inherit
// boundary-run marks verbatim (Pitfall 4 — a link run split mid-text becomes
// two link runs with the same href). Rendering the whole block for a sub-
// range entry would violate PAGE-03 exactly-once (the text would appear on
// two pages) and PAGE-03 no-clipping (the whole block may not fit).
//
// Security (T-04-07 mitigation — identical to BlockRenderer.tsx L9-17): the
// fragment renderer emits ONLY React text children / JSX elements. The React
// raw-HTML injection prop is FORBIDDEN anywhere in this file; ESLint
// react/no-danger enforces statically. The renderer slices the same Block
// model the scrolling ArticleBody renders — no new injection surface.
//
// D4-02 atomic kinds (figure, heading, code-block, footnote-reference,
// unsupported) NEVER split — the engine always emits whole-block ranges for
// them. The renderer short-circuits these to a direct BlockView render.
// Splitting kinds (paragraph + blockquote + bulleted-list + numbered-list)
// carry the D4-01 slicing path; for paragraphs the slicer is splitParagraphRuns
// (the project's InlineRun primitive); for container kinds the renderer walks
// children/items recursively. The MVP engine assumes a 1:1 article.blocks ↔
// querySelectorAll mapping and currently trips a block-element-mismatch
// fallback for containers (they render extra selector matches), so the
// container slicing path is implemented but not yet exercised by the engine;
// Plan 05's corpus matrix lands container coverage and proves the recursive
// slicing path.
import type { Block, CanonicalArticle } from "../content/types";
import { BlockView } from "../content/render/BlockRenderer";
import { splitParagraphRuns } from "./splitBlock";
import { BLOCK_SEPARATOR, graphemeClusters } from "../content/normalizeText";
import type { PageFragment } from "./types";

/**
 * PageFragmentView — render one PageFragment as a semantic <section>.
 *
 * Maps each fragment.blocks entry to a BlockView via resolveBlockSlice. The
 * section carries an `aria-label={`Page ${pageIndex + 1}`}` so a screen-reader
 * user can identify the page boundary (the SectionAnnouncer live region
 * conveys structural progress; this label is a per-page anchor).
 *
 * @param fragment   The PageFragment to render (entries are {blockIndex, startGrapheme, endGrapheme}).
 * @param pageIndex  0-based page ordinal — used for the aria-label (rendered as Page N+1).
 * @param article    The canonical article (source for resolving blockIndex → Block).
 * @param lang       BCP-47 locale — passed to splitParagraphRuns for Intl.Segmenter.
 */
export function PageFragmentView({
  fragment,
  pageIndex,
  article,
  lang,
}: {
  fragment: PageFragment;
  pageIndex: number;
  article: CanonicalArticle;
  lang: string;
}): React.ReactElement {
  return (
    <section className="page-fragment" aria-label={`Page ${pageIndex + 1}`}>
      {fragment.blocks.map((entry, i) => {
        const sourceBlock = article.blocks[entry.blockIndex]!;
        const resolved = resolveBlockSlice(
          sourceBlock,
          entry.startGrapheme,
          entry.endGrapheme,
          lang,
        );
        return <BlockView key={i} block={resolved} />;
      })}
    </section>
  );
}

/**
 * Resolve a fragment entry to the Block that should be rendered.
 *
 * Whole-block entries (startGrapheme === 0 AND endGrapheme === blockLength)
 * return the source block unchanged; intra-block entries return a sliced
 * block via the per-kind D4-01 path. Atomic kinds (D4-02) short-circuit to
 * the source block — the engine never splits them, so the renderer never
 * slices them either.
 *
 * Uses per-kind `if` branches rather than a switch so the rendering decision
 * stays owned by BlockView (no parallel switch here). The slicing decision
 * is orthogonal to rendering: this helper resolves WHAT Block to render;
 * BlockView decides HOW.
 */
function resolveBlockSlice(
  block: Block,
  startGrapheme: number,
  endGrapheme: number,
  lang: string,
): Block {
  // D4-02 atomic set — never splits. The engine always emits whole-block
  // ranges for these. Defensive: if an atomic block ever arrived with a
  // sub-range (engine bug or future schema drift), render it whole — never
  // partially. Atomic blocks have no D4-01 split semantic.
  if (
    block.kind === "figure" ||
    block.kind === "heading" ||
    block.kind === "code-block" ||
    block.kind === "footnote-reference" ||
    block.kind === "unsupported"
  ) {
    return block;
  }

  const blockLen = splittingBlockGraphemeLength(block, lang);
  const isWhole = startGrapheme === 0 && endGrapheme === blockLen;
  if (isWhole) return block;

  // INTRA-BLOCK sub-range — D4-01 booklike splitting.
  if (block.kind === "paragraph") {
    return sliceParagraph(block, startGrapheme, endGrapheme, lang);
  }
  if (block.kind === "blockquote") {
    return sliceBlockquote(block, startGrapheme, endGrapheme, lang);
  }
  // bulleted-list + numbered-list share an items[] shape.
  return sliceList(block, startGrapheme, endGrapheme, lang);
}

/**
 * Slice a paragraph's InlineRun[] at the intra-block [start, end) range.
 *
 * Two-pass: first cut off the leading portion (when start > 0) by calling
 * splitParagraphRuns and taking the `after` slice; then cut off the trailing
 * portion (when end < blockLen) by calling splitParagraphRuns on the
 * remaining runs with the span (end - start) and taking the `before` slice.
 * The result is the intra-block run slice for this fragment.
 *
 * BOTH boundary-run marks survive verbatim per Pitfall 4 — splitParagraphRuns
 * clones the boundary run and copies its marks array onto each half, so a
 * link run split mid-text becomes two link runs with the same href.
 */
function sliceParagraph(
  block: Block,
  startGrapheme: number,
  endGrapheme: number,
  lang: string,
): Block {
  // Caller verified block.kind === "paragraph" via resolveBlockSlice.
  const paragraphBlock = block as Extract<Block, { kind: "paragraph" }>;
  const originalLen = paragraphBlock.content.reduce(
    (sum, r) => sum + graphemeClusters(r.text, lang).length,
    0,
  );

  // First pass: cut off the leading portion (graphemes [0, startGrapheme))
  // by taking the `after` slice.
  let runs = paragraphBlock.content;
  if (startGrapheme > 0) {
    const lead = splitParagraphRuns(paragraphBlock.content, startGrapheme, lang);
    runs = lead.after;
  }

  // Second pass: cut off the trailing portion (graphemes [endGrapheme,
  // originalLen)) by slicing the post-lead runs at the span (endGrapheme -
  // startGrapheme) and taking the `before` slice.
  if (endGrapheme < originalLen) {
    const span = endGrapheme - startGrapheme;
    const trail = splitParagraphRuns(runs, span, lang);
    runs = trail.before;
  }

  return { kind: "paragraph", content: runs };
}

/**
 * Slice a blockquote's children at the intra-block range. Children
 * contribute their splittingBlockGraphemeLength plus a BLOCK_SEPARATOR
 * between adjacent children. Whole children inside the range pass through
 * unchanged; the boundary child (if any) recurses via resolveBlockSlice.
 */
function sliceBlockquote(
  block: Block,
  startGrapheme: number,
  endGrapheme: number,
  lang: string,
): Block {
  const blockquoteBlock = block as Extract<Block, { kind: "blockquote" }>;
  const slicedChildren = sliceChildBlocks(
    blockquoteBlock.children,
    startGrapheme,
    endGrapheme,
    lang,
  );
  return { kind: "blockquote", children: slicedChildren };
}

/**
 * Slice a list's items at the intra-block range. Each item contributes its
 * content blocks plus BLOCK_SEPARATOR between items (and between content
 * blocks inside an item). The list kind + start (for numbered-list) are
 * preserved on the constructed slice.
 */
function sliceList(
  block: Block,
  startGrapheme: number,
  endGrapheme: number,
  lang: string,
): Block {
  const listBlock = block as
    | Extract<Block, { kind: "bulleted-list" }>
    | Extract<Block, { kind: "numbered-list" }>;
  const slicedItems: { content: Block[] }[] = [];
  let consumed = 0;
  for (const item of listBlock.items) {
    const itemContentLen = item.content.reduce(
      (sum, c, j) =>
        sum +
        splittingBlockGraphemeLength(c, lang) +
        (j > 0 ? BLOCK_SEPARATOR.length : 0),
      0,
    );
    const itemEndWithSep = consumed + itemContentLen;
    if (itemEndWithSep <= startGrapheme) {
      // Entirely before the range — skip.
      consumed = itemEndWithSep + BLOCK_SEPARATOR.length;
      continue;
    }
    if (consumed >= endGrapheme) {
      // Entirely after the range — done.
      break;
    }
    // Item overlaps the range — slice its content blocks.
    const relStart = Math.max(0, startGrapheme - consumed);
    const relEnd = Math.min(itemContentLen, endGrapheme - consumed);
    const slicedContent = sliceChildBlocks(item.content, relStart, relEnd, lang);
    slicedItems.push({ content: slicedContent });
    consumed = itemEndWithSep + BLOCK_SEPARATOR.length;
  }
  if (listBlock.kind === "bulleted-list") {
    return { kind: "bulleted-list", items: slicedItems };
  }
  return { kind: "numbered-list", items: slicedItems, start: listBlock.start };
}

/**
 * Recursive walker: slice a list of child blocks at the intra-parent range.
 * Children contribute their splittingBlockGraphemeLength plus BLOCK_SEPARATOR
 * between adjacent children. Whole children inside the range pass through
 * unchanged; the boundary child (if any) recurses via resolveBlockSlice so
 * the D4-01 paragraph slicer applies to nested paragraphs.
 */
function sliceChildBlocks(
  children: Block[],
  startGrapheme: number,
  endGrapheme: number,
  lang: string,
): Block[] {
  const out: Block[] = [];
  let consumed = 0;
  for (const child of children) {
    const childLen = splittingBlockGraphemeLength(child, lang);
    const childEndWithSep = consumed + childLen;
    if (childEndWithSep <= startGrapheme) {
      consumed = childEndWithSep + BLOCK_SEPARATOR.length;
      continue;
    }
    if (consumed >= endGrapheme) {
      break;
    }
    const relStart = Math.max(0, startGrapheme - consumed);
    const relEnd = Math.min(childLen, endGrapheme - consumed);
    out.push(resolveBlockSlice(child, relStart, relEnd, lang));
    consumed = childEndWithSep + BLOCK_SEPARATOR.length;
  }
  return out;
}

/**
 * Compute a splitting-kind block's intra-block grapheme length.
 *
 * For paragraphs the length is the sum of `graphemeClusters(run.text, lang)
 * .length` across content runs. This matches splitParagraphRuns' internal
 * accounting so the whole-vs-subrange check agrees with the slicer (the
 * engine's per-block grapheme length derives from DOM textContent, which
 * for clean ASCII paragraphs is the same as the per-run sum).
 *
 * For container kinds (blockquote + bulleted-list + numbered-list) the
 * length is the recursive sum of child/content lengths joined by
 * BLOCK_SEPARATOR — mirroring normalizeText.ts blockText's join rule.
 *
 * Atomic kinds are handled by the resolveBlockSlice short-circuit and
 * never reach this helper.
 */
function splittingBlockGraphemeLength(block: Block, lang: string): number {
  if (block.kind === "paragraph" || block.kind === "heading") {
    return block.content.reduce(
      (sum, r) => sum + graphemeClusters(r.text, lang).length,
      0,
    );
  }
  if (block.kind === "blockquote") {
    return block.children.reduce(
      (sum, c, i) =>
        sum +
        splittingBlockGraphemeLength(c, lang) +
        (i > 0 ? BLOCK_SEPARATOR.length : 0),
      0,
    );
  }
  if (block.kind === "bulleted-list" || block.kind === "numbered-list") {
    return block.items.reduce((sum, item, i) => {
      const contentLen = item.content.reduce(
        (s, c, j) =>
          s +
          splittingBlockGraphemeLength(c, lang) +
          (j > 0 ? BLOCK_SEPARATOR.length : 0),
        0,
      );
      return sum + contentLen + (i > 0 ? BLOCK_SEPARATOR.length : 0);
    }, 0);
  }
  // Unreachable for splitting kinds (resolveBlockSlice short-circuits atomic
  // kinds before calling this helper). Defensive: return 0 so the whole-vs-
  // subrange check fails open (renders whole) for any future kind not yet
  // wired into the splitting set.
  return 0;
}
