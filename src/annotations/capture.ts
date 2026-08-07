// src/annotations/capture.ts
// DOM Selection → durable TextPositionSelector capture (ANNO-01 substrate).
//
// The REVERSE direction of src/reader/restoreLocation.ts: restoreLocation maps
// a saved grapheme offset → DOM block; capture maps an ephemeral DOM
// Selection/Range → a durable article-global grapheme offset that can survive
// every relayout. Both MUST reuse the SAME normalizeRunText + graphemeClusters
// from src/content/normalizeText.ts.
//
// REUSE-DO-NOT-FORK (Pattern 5 / Pitfall 5): the capture path, the resolution
// path, and the rendering path all import from src/content/normalizeText.ts.
// Any divergence shifts every anchor. We NEVER anchor on the engine-dependent
// serialization of the live Selection (Pitfall 2 — its whitespace handling
// varies by browser); the TextPositionSelector derives from the DOM Range +
// the D-05 substrate directly.
//
// The load-bearing detail (Pitfall 1 — DOM textContent ≠ normalizeText):
// normalizeRunText collapses [\t\n\f\r ]+ to a single space and trims;
// inlineText joins runs with " ". The DOM renders adjacent runs WITHOUT
// separators. So a raw DOM character offset does NOT directly map to a
// grapheme offset in the normalized text. We build an explicit raw-cluster →
// normalized-grapheme-offset map by walking both cluster arrays and aligning
// non-whitespace clusters (see domRangeToIntraBlockGraphemeRange).
//
// Eligibility (D5-07 — "if you can read it, you can highlight it"): paragraph,
// heading, blockquote, bulleted-list, numbered-list, figure, code-block,
// footnote-reference. Unsupported blocks are NOT eligible (degradation notice,
// not readable content). The per-kind switch is exhaustive with NO default
// (Pattern F) so TS flags a missing case at compile time.
//
// The eligible-block check operates on the TOP-LEVEL article block resolved
// from data-block-index. Nested-children eligibility (a paragraph inside a
// blockquote, an item inside a list) is handled by the renderer mounting each
// readable child with its own data-block-index in Plan 05-02; capture simply
// resolves whatever data-block-index the selection's ancestor carries.
import type { Block, CanonicalArticle } from "../content/types";
import {
  BLOCK_SEPARATOR,
  blockNormalizedText,
  graphemeClusters,
} from "../content/normalizeText";
import type { TextPositionSelector } from "../content/normalizeText";

/**
 * The result of attempting to capture a selection. INVALID selections
 * (multi-block, empty, outside eligible blocks) return a discriminated reason
 * so the toolbar can show the right hint (D5-06/D5-13).
 */
export type CaptureResult =
  | { ok: true; blockIndex: number; position: TextPositionSelector }
  | {
      ok: false;
      reason: "empty" | "multi-block" | "ineligible" | "measurement-body";
    };

/**
 * A whitespace cluster: a grapheme cluster consisting solely of ASCII
 * [\t\n\f\r ] (the set normalizeRunText collapses). Unicode whitespace
 * (NBSP, ZWJ, RTL marks) is NOT in this set — those are readable text and
 * must NOT be collapsed (Pitfall 2 rule from normalizeText.ts).
 */
function isWsCluster(cluster: string): boolean {
  return /^[\t\n\f\r ]+$/.test(cluster);
}

/**
 * Build a map from raw-cluster offset → normalized-grapheme offset.
 *
 * `rawClusters` is the grapheme clustering of the DOM block element's
 * textContent. `normClusters` is the grapheme clustering of
 * blockNormalizedText(block). Both contain the same non-whitespace clusters in
 * the same order; whitespace may differ (raw has extra spaces from
 * non-collapsed runs / run-boundary concatenation that normalizeRunText
 * collapses + trims, or norm has separator spaces that raw lacks at run
 * boundaries).
 *
 * The returned array has length `rawClusters.length + 1`. `map[i]` is the
 * normalized-grapheme offset corresponding to raw-cluster offset `i`. The
 * extra trailing entry `map[rawClusters.length]` is the normalized length
 * (past-the-end), so an end-exclusive DOM offset maps cleanly.
 */
function buildRawToNormMap(
  rawClusters: readonly string[],
  normClusters: readonly string[],
): number[] {
  const rawLen = rawClusters.length;
  const map: number[] = new Array<number>(rawLen + 1);
  let r = 0; // raw-cluster index
  let n = 0; // norm-cluster index

  // Skip leading raw whitespace (normalizeRunText trims leading). These map to
  // norm offset 0 (before the first norm cluster).
  while (r < rawLen && isWsCluster(rawClusters[r]!)) {
    map[r] = 0;
    r++;
  }

  while (r < rawLen) {
    const rc = rawClusters[r]!;
    if (isWsCluster(rc)) {
      if (n < normClusters.length && isWsCluster(normClusters[n]!)) {
        // Aligned whitespace — map and advance both pointers.
        map[r] = n;
        r++;
        n++;
        // Collapse: skip any additional raw whitespace clusters that
        // normalizeRunText would have folded into this single space.
        while (r < rawLen && isWsCluster(rawClusters[r]!)) {
          map[r] = n;
          r++;
        }
      } else {
        // norm has no whitespace here — this raw whitespace was collapsed into
        // the previous norm space or trimmed. Map to the current norm offset
        // and advance only the raw pointer.
        map[r] = n;
        r++;
      }
    } else {
      // Non-whitespace raw cluster — must align with a non-ws norm cluster.
      if (n < normClusters.length && !isWsCluster(normClusters[n]!)) {
        map[r] = n;
        r++;
        n++;
      } else if (n < normClusters.length && isWsCluster(normClusters[n]!)) {
        // norm inserted a separator space here (inlineText joins runs with
        // " ") but raw concatenated without a separator. Skip the norm space
        // and align.
        n++;
        map[r] = n;
        r++;
        n++;
      } else {
        // norm exhausted (raw has trailing content not in the normalized
        // text — defensive; should not happen for well-formed blocks). Clamp.
        map[r] = normClusters.length;
        r++;
      }
    }
  }
  // Past-the-end: maps to the normalized length (end-exclusive DOM offset).
  map[rawLen] = normClusters.length;
  return map;
}

/**
 * Walk the block element's text nodes in document order and return the
 * absolute raw-grapheme offset of `(node, offset)` within the concatenation of
 * all text-node cluster arrays.
 *
 * `node` is a text node inside `blockEl`. `offset` is the CHARACTER offset
 * into `node.data` (the Range API's startOffset/endOffset). We convert it to
 * a GRAPHENE offset by clustering `node.data.slice(0, offset)`.
 */
function absoluteRawGraphemeOffset(
  blockEl: HTMLElement,
  node: Node,
  offset: number,
  lang: string,
): number {
  const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);
  let abs = 0;
  let current = walker.nextNode();
  while (current) {
    if (current === node) {
      // Reached the endpoint's text node. The intra-node grapheme offset is
      // the cluster count of the text up to `offset`.
      const text = current.textContent ?? "";
      const prefix = text.slice(0, Math.min(offset, text.length));
      return abs + graphemeClusters(prefix, lang).length;
    }
    abs += graphemeClusters(current.textContent ?? "", lang).length;
    current = walker.nextNode();
  }
  // Defensive: node not found under blockEl (should not happen — the Range
  // endpoint is inside blockEl by construction). Clamp to the end.
  return abs;
}

/**
 * Map a DOM Range's (startContainer, startOffset) / (endContainer, endOffset)
 * to an intra-block grapheme range over blockNormalizedText(block), accounting
 * for the whitespace-collapse divergence between DOM textContent and the
 * normalized text (Pitfall 1).
 *
 * Returns `{ start, end }` grapheme offsets into the block's normalized text
 * (NOT yet article-global — the caller adds the block's global start offset).
 */
function domRangeToIntraBlockGraphemeRange(
  blockEl: HTMLElement,
  range: Range,
  lang: string,
  normClusters: readonly string[],
): { start: number; end: number } {
  const rawText = blockEl.textContent ?? "";
  const rawClusters = graphemeClusters(rawText, lang);
  const map = buildRawToNormMap(rawClusters, normClusters);

  const rawStart = absoluteRawGraphemeOffset(
    blockEl,
    range.startContainer,
    range.startOffset,
    lang,
  );
  const rawEnd = absoluteRawGraphemeOffset(
    blockEl,
    range.endContainer,
    range.endOffset,
    lang,
  );
  // Clamp to the map's domain (defensive against Ranges extending past the
  // block's text — should not happen for an in-block selection).
  const clampedStart = Math.max(0, Math.min(rawStart, map.length - 1));
  const clampedEnd = Math.max(clampedStart, Math.min(rawEnd, map.length - 1));
  return { start: map[clampedStart]!, end: map[clampedEnd]! };
}

/**
 * Walk up from a DOM node to the nearest ancestor (inclusive) carrying
 * `data-block-index` AND contained within `root`. Returns null when no such
 * ancestor exists before hitting `root`'s boundary (or the document root).
 */
function findBlockAncestor(
  node: Node,
  root: HTMLElement,
): HTMLElement | null {
  let current: Node | null = node;
  while (current && current !== root) {
    if (
      current.nodeType === Node.ELEMENT_NODE &&
      (current as HTMLElement).hasAttribute("data-block-index")
    ) {
      return current as HTMLElement;
    }
    current = current.parentNode;
  }
  // Check root itself (the readingRoot may carry data-block-index in edge
  // layouts — defensive).
  if (
    root.nodeType === Node.ELEMENT_NODE &&
    root.hasAttribute("data-block-index")
  ) {
    return root;
  }
  return null;
}

/**
 * Per-block-kind eligibility check (D5-07). Exhaustive over Block.kind with NO
 * default (Pattern F) so a future kind addition is flagged at compile time.
 * Unsupported blocks are NOT eligible (degradation notice, not readable
 * content); every readable kind is.
 */
function isEligibleBlock(block: Block): boolean {
  switch (block.kind) {
    case "paragraph":
    case "heading":
    case "blockquote":
    case "bulleted-list":
    case "numbered-list":
    case "figure":
    case "code-block":
    case "footnote-reference":
      return true;
    case "unsupported":
      return false;
  }
}

/**
 * Compute the article-global D-05 grapheme start offset of `article.blocks[i]`.
 * Walks blocks 0..i-1 accumulating per-block grapheme lengths + one
 * BLOCK_SEPARATOR between blocks (mirrors normalizeText's join rule + the
 * pageStartGlobalOffset accumulation in src/pagination/anchor.ts).
 */
function computeBlockGlobalStart(
  article: CanonicalArticle,
  blockIndex: number,
): number {
  let offset = 0;
  for (let i = 0; i < blockIndex && i < article.blocks.length; i++) {
    const blockText = blockNormalizedText(article.blocks[i]!);
    offset += graphemeClusters(blockText, article.lang).length;
    offset += BLOCK_SEPARATOR.length;
  }
  return offset;
}

/**
 * Capture the current window.getSelection() as a durable TextPositionSelector
 * over the D-05 grapheme substrate.
 *
 * The caller (ArticleView) passes the article + the visible reading-surface
 * root (the scrolling .article-body OR the visible .page-fragment). The hidden
 * .article-body-measurement is excluded by user-select:none (D5-08 / Pitfall 3)
 * so the browser never produces a selection inside it; this function
 * additionally defends by requiring the selection's block ancestor to live
 * inside `readingRoot`.
 *
 * INVALID selections return a typed reason:
 *   - "empty"            → collapsed or no selection
 *   - "multi-block"      → endpoints resolve to different data-block-index
 *                          ancestors (D5-06 single-block rule)
 *   - "ineligible"       → ancestor missing data-block-index, outside
 *                          readingRoot, or the resolved block is unsupported
 *   - "measurement-body" → reserved for the paginated-mode hidden measurement
 *                          body (defensive — user-select:none should already
 *                          prevent this; kept distinct so a future regression
 *                          is identifiable)
 */
export function captureSelection(
  article: CanonicalArticle,
  readingRoot: HTMLElement,
): CaptureResult {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return { ok: false, reason: "empty" };
  }
  const range = selection.getRangeAt(0);

  // Defensive: the measurement body is excluded by user-select:none. If a
  // Range somehow landed inside an element marked `.article-body-measurement`,
  // reject explicitly (D5-08 / Pitfall 3).
  const startContainerEl =
    range.startContainer.nodeType === Node.ELEMENT_NODE
      ? (range.startContainer as HTMLElement)
      : range.startContainer.parentElement;
  if (startContainerEl?.closest(".article-body-measurement")) {
    return { ok: false, reason: "measurement-body" };
  }

  // 1. Find the [data-block-index] ancestor of BOTH endpoints.
  const startBlock = findBlockAncestor(range.startContainer, readingRoot);
  const endBlock = findBlockAncestor(range.endContainer, readingRoot);
  if (!startBlock || !endBlock) {
    return { ok: false, reason: "ineligible" };
  }
  if (startBlock !== endBlock) {
    return { ok: false, reason: "multi-block" };
  }
  const blockIndexAttr = startBlock.getAttribute("data-block-index");
  if (blockIndexAttr === null) {
    return { ok: false, reason: "ineligible" };
  }
  const blockIndex = Number(blockIndexAttr);
  if (!Number.isInteger(blockIndex) || blockIndex < 0) {
    return { ok: false, reason: "ineligible" };
  }
  const block = article.blocks[blockIndex];
  if (!block || !isEligibleBlock(block)) {
    return { ok: false, reason: "ineligible" };
  }

  // 2. Map the DOM Range to intra-block grapheme offsets (whitespace-collapse
  //    correction via the explicit raw-cluster → norm-cluster map).
  const normClusters = graphemeClusters(
    blockNormalizedText(block),
    article.lang,
  );
  const intraRange = domRangeToIntraBlockGraphemeRange(
    startBlock,
    range,
    article.lang,
    normClusters,
  );

  // 3. Add the block's article-global start offset (D-05 substrate coordinate).
  const blockGlobalStart = computeBlockGlobalStart(article, blockIndex);
  const position: TextPositionSelector = {
    start: blockGlobalStart + intraRange.start,
    end: blockGlobalStart + intraRange.end,
  };
  return { ok: true, blockIndex, position };
}
