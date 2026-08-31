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
//
// Phase 19 (ANNO-08, D19-01..08): capture is ENDPOINT-COMPOSED. A selection
// spanning multiple eligible mounted blocks captures ONE highlight — the
// global range derives from the TWO endpoints alone (19-RESEARCH Pattern 1);
// intermediate blocks are NEVER walked (their text is interior to the global
// range by construction, and interior non-text gaps cross calmly per D19-02).
// The former D5-06 single-block rule (its multi-block refusal reason) is
// retired: the
// shipped single-block path is the degenerate case blockIndexA === blockIndexB
// on the SAME code path.
import type { Block, CanonicalArticle } from "../content/types";
import {
  BLOCK_SEPARATOR,
  blockNormalizedText,
  graphemeClusters,
} from "../content/normalizeText";
import type { TextPositionSelector } from "../content/normalizeText";

/**
 * The result of attempting to capture a selection. INVALID selections (empty,
 * ineligible boundaries, overlap-adjacent refusals) return a discriminated
 * reason — with NO position field — so the toolbar can show the right hint
 * (D5-13 + the Phase 19 refusal taxonomy).
 *
 * The ok-variant's `blockIndex` carries the START endpoint's resolved block
 * index (Phase 19 span vocabulary). Consumers are grep-verified to read only
 * `.ok` + `.position` (HighlightOverlay's captureCurrentSelection /
 * createHighlightFromSelection); the field is retained for debuggability and
 * is NOT a span descriptor.
 */
export type CaptureResult =
  | { ok: true; blockIndex: number; position: TextPositionSelector }
  | {
      ok: false;
      reason:
        | "empty"
        | "ineligible"
        | "measurement-body"
        | "boundary-ineligible"
        | "empty-span";
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
 * Map ONE DOM point `(node, offset)` to an intra-block grapheme offset over
 * the given norm-cluster window of the block's normalized text, accounting
 * for the whitespace-collapse divergence between DOM textContent and the
 * normalized text (Pitfall 1).
 *
 * Phase 19: the former pair-mapper (domRangeToIntraBlockGraphemeRange)
 * became this single-point form so each selection endpoint resolves
 * independently against its OWN block element + window — the shape span
 * composition requires (a cross-block Range's two endpoints live in
 * different elements, so one shared map cannot serve both).
 *
 * Returns a grapheme offset into the block's normalized text RELATIVE TO the
 * passed `normClusters` window (the caller adds the window's start offset
 * back — the D5-08 slice math below).
 */
function domPointToIntraBlockGraphemeOffset(
  blockEl: HTMLElement,
  node: Node,
  offset: number,
  lang: string,
  normClusters: readonly string[],
): number {
  const rawText = blockEl.textContent ?? "";
  const rawClusters = graphemeClusters(rawText, lang);
  const map = buildRawToNormMap(rawClusters, normClusters);
  const rawOffset = absoluteRawGraphemeOffset(blockEl, node, offset, lang);
  // Clamp to the map's domain (defensive against points extending past the
  // block's text — should not happen for an in-block selection endpoint).
  const clamped = Math.max(0, Math.min(rawOffset, map.length - 1));
  return map[clamped]!;
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
 * True when the node sits inside the hidden `.article-body-measurement`
 * wrapper (Plan 04-08). Phase 19: checked for BOTH Range endpoints — the
 * retired `startBlock !== endBlock` element-equality gate used to incidentally
 * refuse visible→hidden-body pairs (the hidden body renders a SECOND element
 * with the same data-block-index); with that gate gone the explicit D5-08
 * defense is the load-bearing refusal for cross-page selections
 * (ANNO-13 stays Future).
 */
function isInsideMeasurementBody(node: Node): boolean {
  const el =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : node.parentElement;
  return el !== null && el.closest(".article-body-measurement") !== null;
}

/** One endpoint's successful resolution (Phase 19 span capture). */
interface EndpointResolution {
  ok: true;
  /** The article block index resolved from the endpoint's block ancestor. */
  blockIndex: number;
  /** The endpoint's INTRA-BLOCK grapheme offset (window-corrected). */
  intraOffset: number;
}

/**
 * Resolve ONE selection endpoint `(container, offset)` independently to its
 * block index + intra-block grapheme offset (19-RESEARCH Pattern 1 — the
 * per-endpoint half of span composition; the single-block case is the
 * degenerate both-endpoints-same-block pass through this same code).
 *
 * Refusal taxonomy (D19-05/D19-08 — reject whole, never narrow; no position
 * is returned on any refusal):
 *   - "ineligible"          → no data-block-index ancestor within the reading
 *                             root (footnote BODIES land here — they carry no
 *                             data-block-index; 19-RESEARCH Pitfall 6), a bad
 *                             index, or the ancestor outside readingRoot.
 *   - "boundary-ineligible" → the endpoint RESOLVED to a block that fails
 *                             isEligibleBlock (unsupported content).
 */
function resolveSelectionEndpoint(
  article: CanonicalArticle,
  readingRoot: HTMLElement,
  container: Node,
  offset: number,
): EndpointResolution | { ok: false; reason: "ineligible" | "boundary-ineligible" } {
  // 1. The [data-block-index] ancestor (footnote bodies have none → the walk
  //    terminates at readingRoot → "ineligible").
  const blockEl = findBlockAncestor(container, readingRoot);
  if (!blockEl) {
    return { ok: false, reason: "ineligible" };
  }
  // Defensive containment: findBlockAncestor's walk stops at readingRoot for
  // in-root nodes, but a node OUTSIDE the reading surface (a sibling surface)
  // can still find a data-block-index ancestor past root — refuse those.
  if (!readingRoot.contains(blockEl)) {
    return { ok: false, reason: "ineligible" };
  }
  const blockIndexAttr = blockEl.getAttribute("data-block-index");
  const blockIndex =
    blockIndexAttr === null ? Number.NaN : Number(blockIndexAttr);
  if (!Number.isInteger(blockIndex) || blockIndex < 0) {
    return { ok: false, reason: "ineligible" };
  }
  const block = article.blocks[blockIndex];
  if (!block) {
    // Bad index (out of range) — structural, not content eligibility.
    return { ok: false, reason: "ineligible" };
  }
  if (!isEligibleBlock(block)) {
    // D19-05/D19-08: the endpoint resolved to INELIGIBLE CONTENT — reject
    // the WHOLE selection (the toolbar's boundary hint; no narrowing).
    return { ok: false, reason: "boundary-ineligible" };
  }

  // 2. FIGURE ALIGNMENT (19-RESEARCH Pitfall 1 — fixed in Phase 19; extended
  //    for the 20-04 placeholder surface). blockNormalizedText(figure) =
  //    [alt, caption].filter(Boolean).join(BLOCK_SEPARATOR), but what the
  //    rendered <figure> exposes as TEXT depends on the media state:
  //      - img surface: alt is an ATTRIBUTE — the figure's text nodes are
  //        caption-only (the Phase 19 assumption).
  //      - placeholder surface (D20-14 refused/legacy/broken): the alt is
  //        VISIBLE DOM text (D20-06), so the figure's textContent is
  //        alt+caption concatenated — the caption-only window would
  //        misalign every caption offset (the refusal-matrix D19-01 cell).
  //    Caption endpoints therefore align against the figcaption ELEMENT
  //    (its text is byte-identical in every media state — D19-01) with the
  //    caption window; a placeholder alt endpoint aligns from windowStart 0
  //    (the alt IS substrate text; buildRawToNormMap's separator-skip branch
  //    absorbs the DOM's missing BLOCK_SEPARATOR); the empty-alt fallback
  //    note ("Image unavailable.") is placeholder chrome with NO substrate
  //    coordinates and refuses whole (D19-02's gap rule extends to the
  //    media surface — never a silently-wrong anchor).
  if (block.kind === "figure") {
    const captionEl = blockEl.querySelector("figcaption");
    if (captionEl !== null && captionEl.contains(container)) {
      const captionLocalStart =
        block.alt.length > 0
          ? graphemeClusters(block.alt, article.lang).length +
            BLOCK_SEPARATOR.length
          : 0;
      const fullNorm = graphemeClusters(
        blockNormalizedText(block),
        article.lang,
      );
      const captionWindowEnd = Math.min(
        fullNorm.length,
        captionLocalStart + fullNorm.length,
      );
      const normWindow =
        captionLocalStart > 0
          ? fullNorm.slice(captionLocalStart, captionWindowEnd)
          : fullNorm;
      const inCaption = domPointToIntraBlockGraphemeOffset(
        captionEl as HTMLElement,
        container,
        offset,
        article.lang,
        normWindow,
      );
      return {
        ok: true,
        blockIndex,
        intraOffset: inCaption + captionLocalStart,
      };
    }
    const placeholderEl = blockEl.querySelector(".figure-placeholder");
    if (
      placeholderEl !== null &&
      placeholderEl.contains(container) &&
      block.alt.length === 0
    ) {
      // The visible "Image unavailable." note is not substrate text — there
      // is nothing honest to anchor ("no silent garbage").
      return { ok: false, reason: "ineligible" };
    }
  }

  // 3. D5-08 paginated-mode slicing: the block element may carry
  //    data-block-grapheme-start when it is a SLICE of a split block (the
  //    page fragment renders slices, not whole blocks, when D4-01 booklike
  //    splitting divides a block across a page boundary). The slice's
  //    textContent is a substring of the full block's text starting at
  //    startGrapheme; the raw→norm map must align against the slice's portion
  //    of the normalized text, and the result is offset back by startGrapheme
  //    to yield the true intra-block range. Figures are ATOMIC in pagination
  //    (D4-02 — never sliced), so the figure + slice windows never overlap
  //    in practice; layering them additively keeps each correction exact.
  const sliceStartAttr = blockEl.getAttribute("data-block-grapheme-start");
  const sliceStart =
    sliceStartAttr !== null && Number.isInteger(Number(sliceStartAttr))
      ? Number(sliceStartAttr)
      : 0;
  // The Phase 19 caption-skip applies ONLY to the img surface (alt as an
  // attribute). A placeholder figure's raw text already includes the alt —
  // skipping the caption window here would misalign; windowStart 0 lets the
  // separator-skip branch align alt→alt and caption→caption.
  const captionLocalStart =
    block.kind === "figure" &&
    block.alt.length > 0 &&
    blockEl.querySelector(".figure-placeholder") === null
      ? graphemeClusters(block.alt, article.lang).length +
        BLOCK_SEPARATOR.length
      : 0;
  const windowStart = captionLocalStart + sliceStart;
  const fullNormClusters = graphemeClusters(
    blockNormalizedText(block),
    article.lang,
  );
  // The element's normalized text ≈ the full normalized text from
  // windowStart on. For whole blocks (windowStart = 0) this is the entire
  // array. We align the map against the element's portion so the raw→norm
  // indices match its textContent (Pitfall 1).
  const windowEnd = Math.min(
    fullNormClusters.length,
    windowStart + fullNormClusters.length,
  );
  const normClusters =
    windowStart > 0
      ? fullNormClusters.slice(windowStart, windowEnd)
      : fullNormClusters;
  const windowedOffset = domPointToIntraBlockGraphemeOffset(
    blockEl,
    container,
    offset,
    article.lang,
    normClusters,
  );
  return { ok: true, blockIndex, intraOffset: windowedOffset + windowStart };
}

/**
 * Capture the current window.getSelection() as a durable TextPositionSelector
 * over the D-05 grapheme substrate.
 *
 * The caller (ArticleView) passes the article + the visible reading-surface
 * root (the scrolling .article-body OR the visible .page-fragment). The hidden
 * .article-body-measurement is excluded by user-select:none (D5-08 / Pitfall 3)
 * so the browser never produces a selection inside it; this function
 * additionally defends by checking BOTH endpoints against the measurement
 * wrapper and requiring each endpoint's block ancestor to live inside
 * `readingRoot`.
 *
 * Phase 19 (ANNO-08): the global range composes from the TWO endpoints alone
 * (19-RESEARCH Pattern 1) — no intermediate-block DOM walk. The DOM Range
 * normalizes start/end to document order regardless of drag direction
 * (backwards drags included), so no swap step exists (Pitfall 9 validated).
 * The single-block highlight is the degenerate case of the same code path.
 *
 * INVALID selections return a typed reason (NO position on any refusal):
 *   - "empty"               → collapsed or no selection
 *   - "ineligible"          → an endpoint has no data-block-index ancestor
 *                             within readingRoot (footnote bodies — Pitfall 6),
 *                             a bad index, or an ancestor outside readingRoot
 *   - "measurement-body"    → an endpoint sits inside the hidden measurement
 *                             body (D5-08; checked on BOTH endpoints in
 *                             Phase 19 — cross-page selections still refuse,
 *                             ANNO-13 is Future)
 *   - "boundary-ineligible" → an endpoint resolved to a block failing
 *                             isEligibleBlock (unsupported content — D19-05
 *                             reject-whole; the whole selection is refused)
 *   - "empty-span"          → defensive: the composed global range collapsed
 *                             to start === end (reachable when a non-collapsed
 *                             DOM selection covers only whitespace that
 *                             normalizeRunText collapses; matches the schema's
 *                             end > start refine)
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
  // Range endpoint somehow landed inside an element marked
  // .article-body-measurement, reject explicitly (D5-08 / Pitfall 3). BOTH
  // endpoints are checked in Phase 19 — see isInsideMeasurementBody.
  if (
    isInsideMeasurementBody(range.startContainer) ||
    isInsideMeasurementBody(range.endContainer)
  ) {
    return { ok: false, reason: "measurement-body" };
  }

  // 1. Resolve EACH endpoint independently to { blockIndex, intraOffset }.
  //    (Endpoint-only composition — intermediate blocks are never walked.)
  const startEndpoint = resolveSelectionEndpoint(
    article,
    readingRoot,
    range.startContainer,
    range.startOffset,
  );
  if (!startEndpoint.ok) {
    return { ok: false, reason: startEndpoint.reason };
  }
  const endEndpoint = resolveSelectionEndpoint(
    article,
    readingRoot,
    range.endContainer,
    range.endOffset,
  );
  if (!endEndpoint.ok) {
    return { ok: false, reason: endEndpoint.reason };
  }

  // 2. Compose ONE global TextPositionSelector (D-05 substrate coordinates):
  //    each endpoint's block-global start + its intra-block offset. The DOM
  //    Range is already in document order — no swap step (Pitfall 9).
  const start =
    computeBlockGlobalStart(article, startEndpoint.blockIndex) +
    startEndpoint.intraOffset;
  const end =
    computeBlockGlobalStart(article, endEndpoint.blockIndex) +
    endEndpoint.intraOffset;
  if (start === end) {
    // Defensive — never reachable from an ordinary non-collapsed Range, but
    // a whitespace-only selection over text normalizeRunText collapses can
    // compose empty (mirrors TextPositionSelectorSchema's end > start).
    return { ok: false, reason: "empty-span" };
  }
  return {
    ok: true,
    blockIndex: startEndpoint.blockIndex,
    position: { start, end },
  };
}
