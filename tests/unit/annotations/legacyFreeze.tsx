// tests/unit/annotations/legacyFreeze.tsx
// FROZEN copies of the pre-Spike-0007-promotion highlight walks (issue #36).
//
// These are verbatim ports of the twin walkers the promotion deleted from
// production: the scrolling ArticleBody per-kind branches (paragraph/heading,
// blockquote per-child, list per-item recursion, figure caption, code) and
// the paginated PageFragmentView per-entry branches with the raw
// splitting-coordinate child measure. They exist ONLY so the differential
// suite can prove the refactor changed nothing the coordinates already
// agreed on — and, on the divergent fixture, document exactly what the F2
// reconciliation intentionally fixed. Never import these from production.
//
// Freeze fidelity notes:
//   - Leaf slicers (sliceRunsForHighlights / sliceCodeForHighlights) and the
//     D5-16 entry translation + claim primitives are imported from
//     production — the old twins consumed the same functions, and those
//     contracts are unchanged (leaf accounting moved to the D-05 stream, so
//     the frozen twins stay byte-faithful exactly where the old and new
//     coordinates agree — the F2-clean corpus the differentials assert on).
//   - resolveBlockSlice + splitParagraphRuns: the frozen paginated twin calls
//     the production splitParagraphRuns. On F2-clean content (per-leaf raw
//     join == D-05 join) the old raw walk and the reconciled D-05 walk cut
//     identically, so the frozen output is unchanged there; the divergent
//     fixture's frozen cell never reaches run splitting (its entry is whole).
import type { Block, CanonicalArticle } from "../../../src/content/types";
import {
  BLOCK_SEPARATOR,
  blockNormalizedText,
  graphemeClusters,
} from "../../../src/content/normalizeText";
import { splitParagraphRuns } from "../../../src/pagination/splitBlock";
import { BlockView } from "../../../src/content/render/BlockRenderer";
import type { ArticleBodyHighlight } from "../../../src/content/render/BlockRenderer";
import type { ListItemSlices } from "../../../src/content/render/BlockRenderer";
import {
  sliceRunsForHighlights,
  sliceCodeForHighlights,
} from "../../../src/annotations/highlightRanges";
import type { HighlightSliceEntry } from "../../../src/annotations/highlightRanges";
import type { HighlightSlice } from "../../../src/annotations/highlightRanges";
import type { CodeSegment } from "../../../src/annotations/highlightRanges";
import {
  _test_sliceHighlightsForEntry,
  _test_claimSlicesFirstOccurrence,
  _test_claimItemSlicesFirstOccurrence,
  _test_claimCodeSegmentsFirstOccurrence,
} from "../../../src/pagination/fragmentRenderer";
import type { PageFragment } from "../../../src/pagination/types";

// ── Frozen scrolling twin (pre-promotion ArticleBody walk) ──────────────────

interface BlockHighlightIndex {
  starts: number[];
  lens: number[];
}

function legacyBlockGraphemeLen(block: Block, lang: string): number {
  return graphemeClusters(blockNormalizedText(block), lang).length;
}

function legacyBuildIndex(article: CanonicalArticle): BlockHighlightIndex {
  const starts = new Array<number>(article.blocks.length);
  const lens = new Array<number>(article.blocks.length);
  let acc = 0;
  for (let i = 0; i < article.blocks.length; i++) {
    starts[i] = acc;
    const len = legacyBlockGraphemeLen(article.blocks[i]!, article.lang);
    lens[i] = len;
    acc += len + BLOCK_SEPARATOR.length;
  }
  return { starts, lens };
}

function highlightsForBlock(
  highlights: readonly ArticleBodyHighlight[],
  blockGlobalStart: number,
  blockLen: number,
): HighlightSliceEntry[] {
  const entries: HighlightSliceEntry[] = [];
  for (const h of highlights) {
    const interStart = Math.max(0, h.position.start - blockGlobalStart);
    const interEnd = Math.min(blockLen, h.position.end - blockGlobalStart);
    if (interStart < interEnd) {
      entries.push({
        id: h.id,
        position: h.position,
        hasNote: h.hasNote,
        status: h.status,
      });
    }
  }
  return entries;
}

function legacyComputeListItemSlices(
  block: Extract<Block, { kind: "bulleted-list" }> | Extract<Block, { kind: "numbered-list" }>,
  blockGlobalStart: number,
  effectiveHighlights: readonly ArticleBodyHighlight[],
  article: CanonicalArticle,
): ListItemSlices | null {
  let itemLocalOffset = 0;
  const perItem: (HighlightSlice[] | ListItemSlices | undefined)[][] = [];
  let anySlices = false;
  for (const item of block.items) {
    let childLocalOffset = itemLocalOffset;
    const perChild: (HighlightSlice[] | ListItemSlices | undefined)[] = [];
    for (const child of item.content) {
      const childLen = legacyBlockGraphemeLen(child, article.lang);
      const childGlobalStart = blockGlobalStart + childLocalOffset;
      if (child.kind === "paragraph" || child.kind === "heading") {
        const entries = highlightsForBlock(effectiveHighlights, childGlobalStart, childLen);
        if (entries.length > 0) {
          perChild.push(
            sliceRunsForHighlights(child.content, childGlobalStart, entries, article.lang),
          );
          anySlices = true;
        } else {
          perChild.push(undefined);
        }
      } else if (child.kind === "bulleted-list" || child.kind === "numbered-list") {
        const nested = legacyComputeListItemSlices(
          child,
          childGlobalStart,
          effectiveHighlights,
          article,
        );
        perChild.push(nested ?? undefined);
        anySlices = anySlices || nested !== null;
      } else {
        perChild.push(undefined);
      }
      childLocalOffset += childLen + BLOCK_SEPARATOR.length;
    }
    perItem.push(perChild);
    itemLocalOffset = childLocalOffset + (item.content.length === 0 ? BLOCK_SEPARATOR.length : 0);
  }
  return anySlices ? { perItem } : null;
}

export function LegacyArticleBody({
  article,
  highlights,
}: {
  article: CanonicalArticle;
  highlights: readonly ArticleBodyHighlight[];
}): React.ReactElement {
  const highlightIndex = highlights.length > 0 ? legacyBuildIndex(article) : null;
  return (
    <>
      {article.blocks.map((block, i) => {
        const blockGlobalStart = highlightIndex?.starts[i] ?? 0;
        let highlightSlices: HighlightSlice[] | undefined;
        let childHighlightSlices: (HighlightSlice[] | undefined)[] | undefined;
        let itemHighlightSlices: ListItemSlices | undefined;
        let captionHighlightSlices: HighlightSlice[] | undefined;
        let codeSegments: CodeSegment[] | undefined;
        if (highlightIndex) {
          if (block.kind === "paragraph" || block.kind === "heading") {
            const blockLen = highlightIndex.lens[i]!;
            const entries = highlightsForBlock(highlights, blockGlobalStart, blockLen);
            if (entries.length > 0) {
              highlightSlices = sliceRunsForHighlights(
                block.content,
                blockGlobalStart,
                entries,
                article.lang,
              );
            }
          } else if (block.kind === "figure") {
            const captionRunLen = block.caption.reduce(
              (sum, r) => sum + graphemeClusters(r.text, article.lang).length,
              0,
            );
            if (captionRunLen > 0) {
              const captionLocalStart =
                block.alt.length > 0
                  ? graphemeClusters(block.alt, article.lang).length + BLOCK_SEPARATOR.length
                  : 0;
              const captionGlobalStart = blockGlobalStart + captionLocalStart;
              const entries = highlightsForBlock(highlights, captionGlobalStart, captionRunLen);
              if (entries.length > 0) {
                captionHighlightSlices = sliceRunsForHighlights(
                  block.caption,
                  captionGlobalStart,
                  entries,
                  article.lang,
                );
              }
            }
          } else if (block.kind === "code-block") {
            const entries = highlightsForBlock(
              highlights,
              blockGlobalStart,
              highlightIndex.lens[i]!,
            );
            if (entries.length > 0) {
              codeSegments = sliceCodeForHighlights(
                block.source,
                blockGlobalStart,
                entries,
                article.lang,
              );
            }
          } else if (block.kind === "bulleted-list" || block.kind === "numbered-list") {
            itemHighlightSlices =
              legacyComputeListItemSlices(block, blockGlobalStart, highlights, article) ??
              undefined;
          } else if (block.kind === "blockquote") {
            let childIntraStart = 0;
            const perChild: (HighlightSlice[] | undefined)[] = [];
            let anyChildSlices = false;
            for (const child of block.children) {
              const childLen = legacyBlockGraphemeLen(child, article.lang);
              const childGlobalStart = blockGlobalStart + childIntraStart;
              let childSlices: HighlightSlice[] | undefined;
              if (child.kind === "paragraph" || child.kind === "heading") {
                const entries = highlightsForBlock(highlights, childGlobalStart, childLen);
                if (entries.length > 0) {
                  childSlices = sliceRunsForHighlights(
                    child.content,
                    childGlobalStart,
                    entries,
                    article.lang,
                  );
                  anyChildSlices = true;
                }
              }
              perChild.push(childSlices);
              childIntraStart += childLen + BLOCK_SEPARATOR.length;
            }
            if (anyChildSlices) {
              childHighlightSlices = perChild;
            }
          }
        }
        return (
          <BlockView
            key={i}
            block={block}
            data-block-index={i}
            highlightSlices={highlightSlices}
            childHighlightSlices={childHighlightSlices}
            itemHighlightSlices={itemHighlightSlices}
            captionHighlightSlices={captionHighlightSlices}
            codeSegments={codeSegments}
          />
        );
      })}
    </>
  );
}

// ── Frozen paginated twin (pre-promotion PageFragmentView walk) ─────────────

/** The raw splitting-coordinate child measure the old paginated twin used. */
export function legacySplittingGraphemeLength(block: Block, lang: string): number {
  if (block.kind === "paragraph" || block.kind === "heading") {
    return block.content.reduce((sum, r) => sum + graphemeClusters(r.text, lang).length, 0);
  }
  if (block.kind === "blockquote") {
    return block.children.reduce(
      (sum, c, i) =>
        sum + legacySplittingGraphemeLength(c, lang) + (i > 0 ? BLOCK_SEPARATOR.length : 0),
      0,
    );
  }
  if (block.kind === "bulleted-list" || block.kind === "numbered-list") {
    return block.items.reduce((sum, item, i) => {
      const contentLen = item.content.reduce(
        (s, c, j) =>
          s + legacySplittingGraphemeLength(c, lang) + (j > 0 ? BLOCK_SEPARATOR.length : 0),
        0,
      );
      return sum + contentLen + (i > 0 ? BLOCK_SEPARATOR.length : 0);
    }, 0);
  }
  return 0;
}

/** The pre-reconciliation entry-local list threading (raw child measure). */
export function legacyComputeEntryListItemSlices(
  block: Extract<Block, { kind: "bulleted-list" }> | Extract<Block, { kind: "numbered-list" }>,
  entrySlices: readonly HighlightSliceEntry[],
  lang: string,
  origin = 0,
): ListItemSlices | null {
  let itemIntraStart = origin;
  const perItem: (HighlightSlice[] | ListItemSlices | undefined)[][] = [];
  let anySlices = false;
  for (const item of block.items) {
    let childIntraStart = itemIntraStart;
    const perChild: (HighlightSlice[] | ListItemSlices | undefined)[] = [];
    for (const child of item.content) {
      const childLen = legacySplittingGraphemeLength(child, lang);
      let childSlices: HighlightSlice[] | ListItemSlices | undefined;
      if (child.kind === "paragraph" || child.kind === "heading") {
        const filtered = entrySlices.filter((e) => {
          const intersectStart = Math.max(e.position.start, childIntraStart);
          const intersectEnd = Math.min(e.position.end, childIntraStart + childLen);
          return intersectStart < intersectEnd;
        });
        if (filtered.length > 0) {
          childSlices = sliceRunsForHighlights(child.content, childIntraStart, filtered, lang);
          anySlices = true;
        }
      } else if (child.kind === "bulleted-list" || child.kind === "numbered-list") {
        const nested = legacyComputeEntryListItemSlices(child, entrySlices, lang, childIntraStart);
        if (nested !== null) {
          childSlices = nested;
          anySlices = true;
        }
      }
      perChild.push(childSlices);
      childIntraStart += childLen + BLOCK_SEPARATOR.length;
    }
    perItem.push(perChild);
    itemIntraStart = childIntraStart + (item.content.length === 0 ? BLOCK_SEPARATOR.length : 0);
  }
  return anySlices ? { perItem } : null;
}

export function legacyResolveBlockSlice(
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
  const blockLen = legacySplittingGraphemeLength(block, lang);
  const isWhole = startGrapheme === 0 && endGrapheme === blockLen;
  if (isWhole) return block;
  if (block.kind === "paragraph") {
    return legacySliceParagraph(block, startGrapheme, endGrapheme, lang);
  }
  if (block.kind === "blockquote") {
    return {
      kind: "blockquote",
      children: legacySliceChildBlocks(block.children, startGrapheme, endGrapheme, lang),
    };
  }
  return legacySliceList(block, startGrapheme, endGrapheme, lang);
}

function legacySliceParagraph(
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

function legacySliceList(
  block: Block,
  startGrapheme: number,
  endGrapheme: number,
  lang: string,
): Block {
  const listBlock = block as
    Extract<Block, { kind: "bulleted-list" }> | Extract<Block, { kind: "numbered-list" }>;
  const slicedItems: { content: Block[] }[] = [];
  let consumed = 0;
  for (const item of listBlock.items) {
    const itemContentLen = item.content.reduce(
      (sum, c, j) =>
        sum + legacySplittingGraphemeLength(c, lang) + (j > 0 ? BLOCK_SEPARATOR.length : 0),
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
      content: legacySliceChildBlocks(item.content, relStart, relEnd, lang),
    });
    consumed = itemEndWithSep + BLOCK_SEPARATOR.length;
  }
  if (listBlock.kind === "bulleted-list") {
    return { kind: "bulleted-list", items: slicedItems };
  }
  return { kind: "numbered-list", items: slicedItems, start: listBlock.start };
}

function legacySliceChildBlocks(
  children: Block[],
  startGrapheme: number,
  endGrapheme: number,
  lang: string,
): Block[] {
  const out: Block[] = [];
  let consumed = 0;
  for (const child of children) {
    const childLen = legacySplittingGraphemeLength(child, lang);
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
    out.push(legacyResolveBlockSlice(child, relStart, relEnd, lang));
    consumed = childEndWithSep + BLOCK_SEPARATOR.length;
  }
  return out;
}

export function LegacyPageFragmentView({
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
        const resolved = legacyResolveBlockSlice(
          sourceBlock,
          entry.startGrapheme,
          entry.endGrapheme,
          lang,
        );
        let highlightSlices: HighlightSlice[] | undefined;
        let childHighlightSlices: (HighlightSlice[] | undefined)[] | undefined;
        let itemHighlightSlices: ListItemSlices | undefined;
        let captionHighlightSlices: HighlightSlice[] | undefined;
        let codeSegments: CodeSegment[] | undefined;
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
            if (resolved.kind === "paragraph" || resolved.kind === "heading") {
              highlightSlices = sliceRunsForHighlights(resolved.content, 0, entrySlices, lang);
            } else if (resolved.kind === "blockquote") {
              let childIntraStart = 0;
              const perChild: (HighlightSlice[] | undefined)[] = [];
              let anyChildSlices = false;
              for (const child of resolved.children) {
                const childLen = legacySplittingGraphemeLength(child, lang);
                let childSlices: HighlightSlice[] | undefined;
                if (child.kind === "paragraph" || child.kind === "heading") {
                  const filtered = entrySlices.filter((e) => {
                    const intersectStart = Math.max(e.position.start, childIntraStart);
                    const intersectEnd = Math.min(e.position.end, childIntraStart + childLen);
                    return intersectStart < intersectEnd;
                  });
                  if (filtered.length > 0) {
                    childSlices = sliceRunsForHighlights(
                      child.content,
                      childIntraStart,
                      filtered,
                      lang,
                    );
                    anyChildSlices = true;
                  }
                }
                perChild.push(childSlices);
                childIntraStart += childLen + BLOCK_SEPARATOR.length;
              }
              if (anyChildSlices) {
                childHighlightSlices = perChild;
              }
            } else if (resolved.kind === "bulleted-list" || resolved.kind === "numbered-list") {
              itemHighlightSlices =
                legacyComputeEntryListItemSlices(resolved, entrySlices, lang) ?? undefined;
            } else if (resolved.kind === "figure") {
              const captionRunLen = resolved.caption.reduce(
                (sum, r) => sum + graphemeClusters(r.text, lang).length,
                0,
              );
              if (captionRunLen > 0) {
                const captionIntraStart =
                  resolved.alt.length > 0
                    ? graphemeClusters(resolved.alt, lang).length + BLOCK_SEPARATOR.length
                    : 0;
                const filtered = entrySlices.filter((e) => {
                  const intersectStart = Math.max(e.position.start, captionIntraStart);
                  const intersectEnd = Math.min(e.position.end, captionIntraStart + captionRunLen);
                  return intersectStart < intersectEnd;
                });
                if (filtered.length > 0) {
                  captionHighlightSlices = sliceRunsForHighlights(
                    resolved.caption,
                    captionIntraStart,
                    filtered,
                    lang,
                  );
                }
              }
            } else if (resolved.kind === "code-block") {
              codeSegments = sliceCodeForHighlights(resolved.source, 0, entrySlices, lang);
            }
          }
        }
        if (childHighlightSlices) {
          for (const childSlices of childHighlightSlices) {
            if (childSlices) {
              _test_claimSlicesFirstOccurrence(childSlices, seenHighlightIds);
            }
          }
        }
        if (highlightSlices) {
          _test_claimSlicesFirstOccurrence(highlightSlices, seenHighlightIds);
        }
        if (itemHighlightSlices) {
          _test_claimItemSlicesFirstOccurrence(itemHighlightSlices, seenHighlightIds);
        }
        if (captionHighlightSlices) {
          _test_claimSlicesFirstOccurrence(captionHighlightSlices, seenHighlightIds);
        }
        if (codeSegments) {
          _test_claimCodeSegmentsFirstOccurrence(codeSegments, seenHighlightIds);
        }
        return (
          <BlockView
            key={i}
            block={resolved}
            data-block-index={entry.blockIndex}
            data-block-grapheme-start={entry.startGrapheme}
            highlightSlices={highlightSlices}
            childHighlightSlices={childHighlightSlices}
            itemHighlightSlices={itemHighlightSlices}
            captionHighlightSlices={captionHighlightSlices}
            codeSegments={codeSegments}
          />
        );
      })}
    </section>
  );
}
