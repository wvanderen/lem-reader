import type { Block, CanonicalArticle } from "../../../src/content/types";
import { BLOCK_SEPARATOR, graphemeClusters } from "../../../src/content/normalizeText";
import { blockGraphemeLength } from "../../../src/pagination/anchor";
import { splitParagraphRuns } from "../../../src/pagination/splitBlock";
import { BlockView } from "../../../src/content/render/BlockRenderer";
import type { ArticleBodyHighlight } from "../../../src/content/render/BlockRenderer";
import {
  _test_sliceHighlightsForEntry,
  _test_claimSlicesFirstOccurrence,
  _test_claimItemSlicesFirstOccurrence,
  _test_claimCodeSegmentsFirstOccurrence,
} from "../../../src/pagination/fragmentRenderer";
import type { PageFragment } from "../../../src/pagination/types";
import {
  blockViewSlices,
  sliceBlockHighlights,
} from "./unifiedHighlightSlicer";
import type { UnifiedBlockSlices } from "./unifiedHighlightSlicer";

function claimUnifiedSlices(
  result: UnifiedBlockSlices | null,
  seen: Set<string>,
): void {
  if (result === null) return;
  switch (result.kind) {
    case "children":
      for (const childSlices of result.perChild) {
        if (childSlices) {
          _test_claimSlicesFirstOccurrence(childSlices, seen);
        }
      }
      return;
    case "inline":
      _test_claimSlicesFirstOccurrence(result.slices, seen);
      return;
    case "items":
      _test_claimItemSlicesFirstOccurrence(result.slices, seen);
      return;
    case "caption":
      _test_claimSlicesFirstOccurrence(result.slices, seen);
      return;
    case "code":
      _test_claimCodeSegmentsFirstOccurrence(result.segments, seen);
      return;
  }
}

export function splittingBlockGraphemeLength(
  block: Block,
  lang: string,
): number {
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
  return 0;
}

export function resolveBlockSlice(
  block: Block,
  startGrapheme: number,
  endGrapheme: number,
  lang: string,
): Block {
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
  if (block.kind === "paragraph") {
    return sliceParagraph(block, startGrapheme, endGrapheme, lang);
  }
  if (block.kind === "blockquote") {
    return {
      kind: "blockquote",
      children: sliceChildBlocks(
        block.children,
        startGrapheme,
        endGrapheme,
        lang,
      ),
    };
  }
  return sliceList(block, startGrapheme, endGrapheme, lang);
}

function sliceParagraph(
  block: Block,
  startGrapheme: number,
  endGrapheme: number,
  lang: string,
): Block {
  const paragraphBlock = block as Extract<Block, { kind: "paragraph" }>;
  const originalLen = paragraphBlock.content.reduce(
    (sum, r) => sum + graphemeClusters(r.text, lang).length,
    0,
  );
  let runs = paragraphBlock.content;
  if (startGrapheme > 0) {
    runs = splitParagraphRuns(paragraphBlock.content, startGrapheme, lang).after;
  }
  if (endGrapheme < originalLen) {
    const span = endGrapheme - startGrapheme;
    runs = splitParagraphRuns(runs, span, lang).before;
  }
  return { kind: "paragraph", content: runs };
}

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
      consumed = itemEndWithSep + BLOCK_SEPARATOR.length;
      continue;
    }
    if (consumed >= endGrapheme) {
      break;
    }
    const relStart = Math.max(0, startGrapheme - consumed);
    const relEnd = Math.min(itemContentLen, endGrapheme - consumed);
    slicedItems.push({
      content: sliceChildBlocks(item.content, relStart, relEnd, lang),
    });
    consumed = itemEndWithSep + BLOCK_SEPARATOR.length;
  }
  if (listBlock.kind === "bulleted-list") {
    return { kind: "bulleted-list", items: slicedItems };
  }
  return { kind: "numbered-list", items: slicedItems, start: listBlock.start };
}

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

export function SpikeArticleBody({
  article,
  highlights,
}: {
  article: CanonicalArticle;
  highlights: readonly ArticleBodyHighlight[];
}): React.ReactElement {
  const lang = article.lang;
  const starts: number[] = [];
  const lens: number[] = [];
  let acc = 0;
  for (const block of article.blocks) {
    starts.push(acc);
    const len = blockGraphemeLength(block, lang);
    lens.push(len);
    acc += len + BLOCK_SEPARATOR.length;
  }
  return (
    <>
      {article.blocks.map((block, i) => {
        const result = sliceBlockHighlights({
          block,
          origin: starts[i]!,
          visibleLen: lens[i]!,
          highlights,
          measureChild: blockGraphemeLength,
          lang,
        });
        return (
          <BlockView
            key={i}
            block={block}
            data-block-index={i}
            {...blockViewSlices(result)}
          />
        );
      })}
    </>
  );
}

export function SpikePageFragmentView({
  fragment,
  pageIndex,
  article,
  lang,
  highlights,
}: {
  fragment: PageFragment;
  pageIndex: number;
  article: CanonicalArticle;
  lang: string;
  highlights?: readonly ArticleBodyHighlight[];
}): React.ReactElement {
  const seenHighlightIds = new Set<string>();
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
        let result: UnifiedBlockSlices | null = null;
        if (highlights && highlights.length > 0) {
          const entrySlices = _test_sliceHighlightsForEntry(
            highlights,
            article,
            entry.blockIndex,
            entry.startGrapheme,
            entry.endGrapheme,
            lang,
          );
          if (entrySlices.length > 0) {
            result = sliceBlockHighlights({
              block: resolved,
              origin: 0,
              visibleLen: entry.endGrapheme - entry.startGrapheme,
              highlights: entrySlices,
              measureChild: splittingBlockGraphemeLength,
              lang,
            });
          }
        }
        claimUnifiedSlices(result, seenHighlightIds);
        return (
          <BlockView
            key={i}
            block={resolved}
            data-block-index={entry.blockIndex}
            data-block-grapheme-start={entry.startGrapheme}
            {...blockViewSlices(result)}
          />
        );
      })}
    </section>
  );
}
