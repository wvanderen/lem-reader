// src/content/render/BlockRenderer.tsx
// Recursive semantic renderer (DOC-02 reading order, DOC-06 unsupported
// disclosure). BlockView is an exhaustive switch over the 9 locked block kinds;
// TypeScript narrowing flags any missing case at compile time (no default
// fallthrough that swallows exhaustiveness). ArticleBody renders all blocks in
// array order (DOM reading order == array order == document order, by
// construction) followed by an optional footnotes region.
//
// Security (Pitfall 6): the renderer emits ONLY React text children / JSX
// elements — code-block source renders as an auto-escaped text child of
// <pre><code>. The React raw-HTML injection prop is FORBIDDEN anywhere in this
// file; ESLint react/no-danger (enabled in Plan 01) enforces statically.
//
// DOM clobbering (Pitfall 4): footnote ids are schema-locked to /^fn-\d+$/.
// The reference anchor derives its own "fn-ref-N" id and links to the body's
// "fn-N" id — the two ids never collide, and source HTML id attributes are
// never carried through.
//
// Phase 5 Plan 05-02 (D5-15 — inline highlight rendering): ArticleBody accepts
// an optional `highlights` prop and threads per-block highlight slices through
// BlockView → InlineList via sliceRunsForHighlights (Plan 05-01). The overlay
// renders INTO the existing semantic output (NO parallel renderer — DOC-02
// reading order + D-05 offset integrity preserved). When `highlights` is
// absent or empty, ArticleBody renders exactly as before (existing tests
// regress nothing).
import type { Block, CanonicalArticle } from "../types";
import { Fragment, memo, useMemo, useState } from "react";
import { InlineList } from "./InlineRenderer";
import { highlightAriaLabelForText } from "./InlineRenderer";
import type { TextPositionSelector } from "../normalizeText";
import { BLOCK_SEPARATOR, blockNormalizedText, graphemeClusters } from "../normalizeText";
import { sliceRunsForHighlights } from "../../annotations/highlightRanges";
import { sliceCodeForHighlights } from "../../annotations/highlightRanges";
import type { HighlightSliceEntry } from "../../annotations/highlightRanges";
import type { CodeSegment } from "../../annotations/highlightRanges";
// Phase 5 Plan 05-02: ArticleBody reads from the highlight overlay context
// when no explicit highlights prop is passed, so the scrolling ArticleBody
// renders <mark> overlays from the provider state. The measurement body
// (hidden) passes highlights={[]} to suppress. The useOptionalHighlightOverlay
// hook returns null outside a provider, so legacy callers (component tests
// without a provider) render without marks — byte-unchanged behavior.
import { useOptionalHighlightOverlay } from "../../reader/annotations/HighlightOverlay";
// Phase 20 Plan 20-04 (IMG-03/IMG-05/IMG-06 render-half): figure media
// resolution through the per-article object-URL provider. The hook is
// optional-context (null outside a provider), consumed ONLY by FigureMedia.
import { useAssetUrl } from "../assets/AssetProvider";

/**
 * The subset of a ResolvedHighlight the renderer needs. Defined locally so
 * BlockRenderer does not take a runtime dependency on the annotation state
 * layer (reader/annotations/) — the caller maps its ResolvedHighlight[] to
 * this shape. `status` drives the unresolved marker rendering (D5-04 —
 * ambiguous/orphan highlights render as a dashed-outline marker instead of
 * the normal fill).
 */
export interface ArticleBodyHighlight {
  id: string;
  /** The article-global D-05 grapheme range to render. */
  position: TextPositionSelector;
  hasNote: boolean;
  /** D5-02 tri-state — drives the unresolved marker (D5-04). */
  status: "confident" | "ambiguous" | "orphan";
}

/**
 * Optional data-* attributes forwarded to the rendered element. ArticleBody
 * passes `data-block-index` per top-level block (Plan 04-06) so the measurement
 * phase + pagination engine share a 1:1 block↔element mapping. Recursive
 * BlockView calls inside containers omit these props — only the top-level map
 * emits them. React does NOT auto-forward arbitrary props from a function
 * component to the underlying DOM intrinsic, so we destructure + spread.
 */
/**
 * Phase 19 Plan 19-03 (D19-13/D19-15): precomputed highlight slices for a
 * list block's items — the items-shape twin of the blockquote
 * childHighlightSlices walk. `perItem[i][j]` addresses
 * `block.items[i].content[j]`:
 *   - HighlightSlice[] for leaf paragraph/heading children (forwarded as
 *     that child BlockView's `highlightSlices`),
 *   - a nested ListItemSlices for nested bulleted/numbered-list children
 *     (D19-15 recursion — forwarded as the child's `itemHighlightSlices`),
 *   - undefined when no highlight intersects that child.
 * Self-contained recursion via props: each nested list BlockView receives
 * its OWN precomputed structure, so no global-start plumbing leaks through
 * BlockView (the helper computed everything against article-global offsets
 * up front).
 */
export interface ListItemSlices {
  /** items[i] → content[j] → child slices (dense, positional). */
  perItem: ListChildSlices[][];
}

/** One child's entry inside ListItemSlices.perItem (see the interface). */
type ListChildSlices =
  | ReturnType<typeof sliceRunsForHighlights> // leaf paragraph/heading child
  | ListItemSlices // nested list child (D19-15)
  | undefined; // no intersecting highlight / non-readable kind

type BlockViewProps = {
  block: Block;
  /** Allow paginated mode to expose one semantic block as a programmatic-only
   * page-entry anchor without adding it to ordinary Tab order. */
  tabIndex?: number;
  /**
   * Phase 5 Plan 05-02: per-block highlight slices (from sliceRunsForHighlights).
   * When present, InlineList wraps highlighted slices in <mark>. Absent for
   * non-paragraph/heading kinds + the measurement body.
   */
  highlightSlices?: ReturnType<typeof sliceRunsForHighlights>;
  /**
   * Phase 5 Plan 05-07: per-child highlight slices for a blockquote block,
   * indexed by child position in block.children. Consumed ONLY by the
   * blockquote case to forward childHighlightSlices[i] as each child
   * BlockView's `highlightSlices` — so a child paragraph renders its <mark>.
   * An element may be undefined when that child has no intersecting highlight
   * or is a non-paragraph/heading kind. Absent for non-container kinds + the
   * measurement body.
   */
  childHighlightSlices?: (ReturnType<typeof sliceRunsForHighlights> | undefined)[];
  /**
   * Phase 19 Plan 19-03 (D19-13/D19-15): per-item highlight slices for a
   * bulleted/numbered-list block (from computeListItemSlices). Consumed ONLY
   * by the list cases to thread each item's content children — leaf children
   * get highlightSlices, nested-list children get their own itemHighlightSlices.
   * Absent for non-list kinds + the measurement body.
   */
  itemHighlightSlices?: ListItemSlices;
  /**
   * Phase 19 Plan 19-03 (D19-01): highlight slices for a figure's CAPTION
   * runs (computed against the Pitfall 1 symmetric captionGlobalStart —
   * see ArticleBody's figure branch). Consumed ONLY by the figure case to
   * feed the figcaption InlineList. The <img>/alt surface renders no marks
   * ever (alt is an attribute — the interior-gap visual is plain surface
   * per D19-02/UI-SPEC). Absent for non-figure kinds + the measurement body.
   */
  captionHighlightSlices?: ReturnType<typeof sliceRunsForHighlights>;
  /**
   * Phase 19 Plan 19-03 (D19-01): verbatim-source segments for a code block
   * (from sliceCodeForHighlights). Consumed ONLY by the code-block case:
   * plain segments render as React text children, highlighted segments wrap
   * in <mark class="highlight"> with the InlineRenderer mark discipline.
   * Absent for non-code kinds + the measurement body → byte-unchanged
   * `<code>{block.source}</code>`.
   */
  codeSegments?: CodeSegment[];
} & {
  [K in `data-${string}`]?: string | number | undefined;
};

export function BlockView({
  block,
  highlightSlices,
  childHighlightSlices,
  itemHighlightSlices,
  captionHighlightSlices,
  codeSegments,
  tabIndex,
  ...rest
}: BlockViewProps) {
  const elementProps = { ...rest, tabIndex };
  switch (block.kind) {
    case "heading": {
      const Tag = `h${block.level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      return (
        <Tag {...elementProps}>
          <InlineList runs={block.content} highlightSlices={highlightSlices} />
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p {...elementProps}>
          <InlineList runs={block.content} highlightSlices={highlightSlices} />
        </p>
      );
    case "blockquote":
      return (
        <blockquote {...elementProps}>
          {block.children.map((child, i) => (
            // Plan 05-07: forward the per-child slice (computed by ArticleBody
            // walking block.children) so each child paragraph reaches InlineList
            // with its own slices and renders the <mark>. Optional chaining
            // keeps absent/undefined as "no slices" (byte-unchanged when no
            // highlight intersects this child).
            <BlockView
              key={i}
              block={child}
              highlightSlices={childHighlightSlices?.[i]}
            />
          ))}
        </blockquote>
      );
    case "bulleted-list":
      return (
        <ul {...elementProps}>
          {block.items.map((item, i) => (
            <li key={i}>
              {item.content.map((c, j) => (
                // Plan 19-03 (D19-13/D19-15): forward the per-child slice
                // computed by computeListItemSlices — leaf paragraph/heading
                // children consume highlightSlices; nested list children
                // consume itemHighlightSlices (self-contained recursion via
                // props). Optional lookups keep absent/undefined as "no
                // slices" (byte-unchanged when no highlight intersects).
                <BlockView
                  key={j}
                  block={c}
                  highlightSlices={leafSlicesFor(itemHighlightSlices, i, j)}
                  itemHighlightSlices={nestedSlicesFor(itemHighlightSlices, i, j)}
                />
              ))}
            </li>
          ))}
        </ul>
      );
    case "numbered-list":
      return (
        <ol {...elementProps} start={block.start}>
          {block.items.map((item, i) => (
            <li key={i}>
              {item.content.map((c, j) => (
                <BlockView
                  key={j}
                  block={c}
                  highlightSlices={leafSlicesFor(itemHighlightSlices, i, j)}
                  itemHighlightSlices={nestedSlicesFor(itemHighlightSlices, i, j)}
                />
              ))}
            </li>
          ))}
        </ol>
      );
    case "figure":
      return (
        <figure {...elementProps}>
          <FigureMedia block={block} />
          {block.caption.length > 0 && (
            <figcaption>
              {/* Plan 19-03 (D19-01): caption marks — the figcaption
                  InlineList consumes slices computed against the Pitfall 1
                  symmetric offset (ArticleBody's figure branch). Mark
                  anatomy identical to prose. The img/alt surface renders no
                  marks ever (alt is an attribute — D19-02 gap by
                  construction). */}
              <InlineList
                runs={block.caption}
                highlightSlices={captionHighlightSlices}
              />
            </figcaption>
          )}
        </figure>
      );
    case "code-block": {
      // NEVER inject raw HTML (Pitfall 6); React escapes source text.
      // Plan 19-03 (D19-01): when codeSegments are present (verbatim-source
      // segmentation via sliceCodeForHighlights), highlighted segments wrap
      // in <mark class="highlight"> carrying the SAME discipline as
      // InlineRenderer's marks — data-highlight-id, tabIndex, aria-haspopup,
      // per-segment aria-label, hasNote/unresolved modifiers, and the DOM id
      // only on the highlight's first segment (Pitfall 2). Segments
      // concatenate to EXACTLY the source (whitespace/newlines preserved);
      // plain segments render as bare text children via keyed Fragments (no
      // wrapper DOM node — pre/code geometry byte-stable, UI-SPEC
      // Interaction 7).
      if (!codeSegments) {
        return (
          <pre {...elementProps}>
            <code>{block.source}</code>
          </pre>
        );
      }
      return (
        <pre {...elementProps}>
          <code>
            {codeSegments.map((seg, i) => {
              if (seg.entry === null) {
                return <Fragment key={i}>{seg.text}</Fragment>;
              }
              const status = seg.entry.status ?? "confident";
              const unresolved = status !== "confident";
              const className = `highlight${seg.entry.hasNote ? " has-note" : ""}${unresolved ? " unresolved" : ""}`;
              return (
                <mark
                  key={i}
                  id={seg.isFirst === true ? `hl-${seg.entry.id}` : undefined}
                  className={className}
                  data-highlight-id={seg.entry.id}
                  tabIndex={0}
                  aria-label={highlightAriaLabelForText(
                    seg.text,
                    seg.entry.hasNote,
                    status,
                  )}
                  aria-haspopup="dialog"
                >
                  {seg.text}
                </mark>
              );
            })}
          </code>
        </pre>
      );
    }
    case "footnote-reference": {
      // footnoteId matches /^fn-\d+$/ (Plan 01 Task 2). Extract N and derive
      // distinct ids: anchor gets "fn-ref-N", body <li> keeps "fn-N"
      // (Pitfall 4 fix — DO NOT set the anchor id to block.footnoteId).
      const n = block.footnoteId.replace(/^fn-/, "");
      return (
        <sup {...elementProps}>
          <a id={`fn-ref-${n}`} href={`#fn-${n}`}>
            {block.marker}
          </a>
        </sup>
      );
    }
    case "unsupported":
      // DOC-06: inline <details> at canonical position (UI-SPEC §Interaction 3).
      // Native <details> is keyboard-accessible + screen-reader-compatible by
      // default. Summary microcopy is verbatim from UI-SPEC §Copywriting.
      return (
        <details {...elementProps} className="disclosure">
          <summary>Some content from the original article isn't supported yet.</summary>
          <ul>
            <li>{block.plainDescription}</li>
          </ul>
        </details>
      );
  }
}

/**
 * FigureMedia — Phase 20 Plan 20-04 (D20-13/D20-14, UI-SPEC §Component
 * Inventory): the ONE media surface for the figure block's four states.
 * A dedicated component because the broken-state swap needs local state
 * (onError → placeholder INSIDE the same reserved box) and the resolution
 * hook — both would violate rules-of-hooks inside BlockView's per-kind
 * switch (the same reason ArticleBody calls its context hook at the top).
 *
 * States → surfaces (exactly two):
 *   - accepted + resolvable → `<img>` on the resolved-object-URL branch
 *     ONLY: width/height attributes + inline aspect-ratio from the STORED
 *     dims (the model is the geometry authority — decode is paint, never
 *     layout, D20-13/IMG-06), loading="lazy" decoding="async" (UI-SPEC
 *     Interaction 8), onError → the broken swap below.
 *   - refused (no src) / legacy (remote httpUrl src — NEVER fetched,
 *     IMG-03 by construction: the img element is emitted only on this
 *     resolved branch) / broken (onError, or an unresolved/missing row) →
 *     the `.figure-placeholder` span: framed box + 20px image glyph
 *     (aria-hidden, header-icon stroke anatomy) + the VISIBLE alt text,
 *     or the verbatim "Image unavailable." note when alt is empty (never
 *     both — the note never replaces non-empty alt; alt is the
 *     recoverable content, D20-06). One identical surface for every
 *     non-asset state (D20-14) — geometry from the model never changes
 *     (Pitfall 5): stored dims when present, the
 *     --figure-placeholder-ratio default when absent.
 *
 * The figcaption branch in the figure case above is byte-identical in
 * every state (D19-01); this component renders ONLY the media box. The
 * placeholder's visible alt text is media-box text — unmarkable (D19-02
 * gap rule extends to visible alt, UI-SPEC Auto-Resolved #13).
 */
function FigureMedia({ block }: { block: Extract<Block, { kind: "figure" }> }) {
  const objectUrl = useAssetUrl(block.src);
  const [broken, setBroken] = useState(false);
  const hasDims = block.width !== undefined && block.height !== undefined;
  const aspectRatio = hasDims
    ? `${block.width} / ${block.height}`
    : "var(--figure-placeholder-ratio)";

  if (objectUrl !== undefined && !broken) {
    return (
      <img
        src={objectUrl}
        alt={block.alt}
        width={block.width}
        height={block.height}
        loading="lazy"
        decoding="async"
        style={{ aspectRatio }}
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span className="figure-placeholder" style={{ aspectRatio }}>
      {/* The 20px image glyph — aria-hidden decorative, mirroring the
          header-icon stroke anatomy (viewBox 24, 1.75 stroke, round
          joins). Color inherits the span's --ink-soft via currentColor. */}
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="9" cy="9" r="1.5" />
        <path d="m21 15-3.5-3.5-9 9" />
      </svg>
      <span>
        {block.alt.length > 0 ? block.alt : "Image unavailable."}
      </span>
    </span>
  );
}

/**
 * Cumulative article-global D-05 grapheme start offset + length for every
 * block, built in ONE linear pass over the article (260820 giant-article
 * freeze: the former per-block computeBlockGlobalStart re-segmented all
 * preceding blocks on EVERY render — O(n²) ≈ 158k Intl.Segmenter
 * segmentations (~48M graphemes) per render of a 562-block article, which
 * CPU profiling attributed 94% of a 192s scroll-burst sample to
 * BlockRenderer.tsx alone). The numbers are byte-identical to the former
 * walk: the same blockNormalizedText + graphemeClusters lengths +
 * BLOCK_SEPARATOR joins, accumulated once instead of re-derived per block.
 *
 * Returns null when no highlights intersect the article — the start/length
 * index is consumed ONLY by highlight slice filtering, so the no-highlight
 * render path (the common case, incl. the hidden measurement body) does
 * zero grapheme segmentation work at all.
 */
interface BlockHighlightIndex {
  /** Article-global D-05 grapheme start of article.blocks[i]. */
  starts: number[];
  /** D-05 grapheme length of article.blocks[i]. */
  lens: number[];
}

function buildBlockHighlightIndex(
  article: CanonicalArticle,
): BlockHighlightIndex | null {
  const starts = new Array<number>(article.blocks.length);
  const lens = new Array<number>(article.blocks.length);
  let acc = 0;
  for (let i = 0; i < article.blocks.length; i++) {
    starts[i] = acc;
    const len = blockGraphemeLen(article.blocks[i]!, article.lang);
    lens[i] = len;
    acc += len + BLOCK_SEPARATOR.length;
  }
  return { starts, lens };
}

/**
 * Filter highlights that intersect a block's article-global range and convert
 * them to HighlightSliceEntry for sliceRunsForHighlights. Confident highlights
 * use their resolvedPosition; ambiguous/orphan highlights use their best-
 * effort vicinity (resolvedPosition = first candidate / stored position hint
 * — set by useAnnotationState from the resolveQuoteSelector tri-state). The
 * status field threads through so InlineRenderer emits the right modifier
 * (mark.highlight.unresolved for ambiguous/orphan — Plan 05-04 / D5-04).
 */
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

/**
 * Per-block grapheme length over the D-05 normalized-text contract (mirrors
 * pagination/anchor.ts blockGraphemeLength but stays local to avoid an extra
 * cross-module import in the renderer).
 */
function blockGraphemeLen(block: Block, lang: string): number {
  return graphemeClusters(blockNormalizedText(block), lang).length;
}

/** Leaf-slice lookup for the list cases: perItem[i][j] when it is a run-slice array. */
function leafSlicesFor(
  slices: ListItemSlices | undefined,
  i: number,
  j: number,
): ReturnType<typeof sliceRunsForHighlights> | undefined {
  const child = slices?.perItem[i]?.[j];
  return Array.isArray(child) ? child : undefined;
}

/** Nested-list lookup for the list cases: perItem[i][j] when it is a ListItemSlices. */
function nestedSlicesFor(
  slices: ListItemSlices | undefined,
  i: number,
  j: number,
): ListItemSlices | undefined {
  const child = slices?.perItem[i]?.[j];
  return child != null && !Array.isArray(child) ? child : undefined;
}

/**
 * Per-item highlight-slice computation for bulleted/numbered lists (Plan
 * 19-03 — D19-13/D19-15). The items-shape mirror of the 05-07 blockquote
 * walk: a list-local accumulator walks items (joined by BLOCK_SEPARATOR per
 * normalizeText.ts L48-52); within each item an item-local accumulator walks
 * `item.content` (content blocks joined by BLOCK_SEPARATOR). For each child,
 * `childGlobalStart = blockGlobalStart + itemLocalOffset` and paragraph/
 * heading children get highlightsForBlock + sliceRunsForHighlights EXACTLY
 * as the blockquote path does (no forked slicer). Nested bulleted/numbered
 * children RECURSE (D19-15), producing the same nested shape at every depth.
 * Kinds without slices (figure/code/etc. inside items) simply produce none —
 * interior gaps render unmarked by construction (D19-02).
 *
 * List markers are CSS ::marker/start-attribute chrome and never render as
 * DOM text (D19-14) — this helper computes offsets over item CONTENT only,
 * exactly matching the D-05 substrate's blockText join.
 *
 * Returns null when no child at any depth produced slices (the list cases
 * then thread nothing — byte-unchanged rendering, mirroring the blockquote
 * path's anyChildSlices discipline).
 */
function computeListItemSlices(
  block:
    | Extract<Block, { kind: "bulleted-list" }>
    | Extract<Block, { kind: "numbered-list" }>,
  blockGlobalStart: number,
  effectiveHighlights: readonly ArticleBodyHighlight[],
  article: CanonicalArticle,
): ListItemSlices | null {
  let itemLocalOffset = 0; // list-local: items joined by BLOCK_SEPARATOR
  const perItem: ListChildSlices[][] = [];
  let anySlices = false;
  for (const item of block.items) {
    let childLocalOffset = itemLocalOffset; // item-local: content blocks joined by BLOCK_SEPARATOR
    const perChild: ListChildSlices[] = [];
    for (const child of item.content) {
      const childLen = blockGraphemeLen(child, article.lang);
      const childGlobalStart = blockGlobalStart + childLocalOffset;
      if (child.kind === "paragraph" || child.kind === "heading") {
        const entries = highlightsForBlock(
          effectiveHighlights,
          childGlobalStart,
          childLen,
        );
        if (entries.length > 0) {
          perChild.push(
            sliceRunsForHighlights(child.content, childGlobalStart, entries, article.lang),
          );
          anySlices = true;
        } else {
          perChild.push(undefined);
        }
      } else if (child.kind === "bulleted-list" || child.kind === "numbered-list") {
        // D19-15: recurse — sub-list items are readable children with the
        // same mark anatomy, addressed in the same D-05 coordinate stream.
        const nested = computeListItemSlices(
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
    // After the child loop, childLocalOffset sits at itemStart + Σ(childLen)
    // + n·SEPARATOR — which equals itemStart + itemLen + SEP for n > 0
    // (the trailing per-child separator coincides with the inter-item
    // separator). An EMPTY item still consumes its inter-item separator.
    itemLocalOffset =
      childLocalOffset +
      (item.content.length === 0 ? BLOCK_SEPARATOR.length : 0);
  }
  return anySlices ? { perItem } : null;
}

/**
 * ArticleBody — memoized on (article identity, explicit highlights identity)
 * so sibling state changes in the owner (ArticleView's per-scroll-event
 * progress ratio, the per-turn pageState mirror) do NOT re-render the whole
 * block tree. Context (HighlightOverlay) updates still propagate — memo only
 * gates PROP-driven re-renders, and useContext subscribes independently —
 * so live highlight changes keep re-rendering the scrolling body (260820
 * giant-article freeze: each owner re-render previously re-ran the whole
 * render at quadratic cost; callers that pass `highlights` must pass a
 * referentially stable value — see EMPTY_HIGHLIGHTS in ArticleView).
 */
export const ArticleBody = memo(
  function ArticleBody({
    article,
    highlights: explicitHighlights,
  }: {
    article: CanonicalArticle;
    /**
     * Optional: resolved highlights to render as <mark> overlays. When absent,
     * ArticleBody reads from the HighlightOverlay context (so the scrolling
     * ArticleBody renders marks from the provider). When explicitly `[]` (the
     * measurement body), marks are suppressed. The caller maps its
     * ResolvedHighlight[] to ArticleBodyHighlight[] — this module does not take
     * a runtime dep on the annotation state layer's ResolvedHighlight type.
     */
    highlights?: readonly ArticleBodyHighlight[];
  }): React.ReactElement {
    // Call the context hook UNCONDITIONALLY (rules-of-hooks) — even when
    // explicitHighlights is provided. The return value is only used when the
    // prop is absent. This is the safe pattern: always call hooks at the top.
    const ctx = useOptionalHighlightOverlay();

    // Effective highlights: the explicit prop, OR context-derived, OR empty.
    // Plan 05-04 (D5-04 / ANNO-07): ambiguous + orphan highlights ALSO render
    // inline — at their best-effort vicinity (resolvedPosition = first candidate
    // for ambiguous, stored position hint for orphan). The status field threads
    // through sliceRunsForHighlights → HighlightSlice → InlineRenderer so the
    // renderer emits mark.highlight.unresolved (dashed outline) instead of the
    // normal fill (Pitfall 7 — never silent re-attach). Filtering to confident-
    // only here would HIDE ambiguous/orphan highlights entirely, which violates
    // ANNO-07's "explicit state instead of silent reattachment" contract.
    let effectiveHighlights: ArticleBodyHighlight[];
    if (explicitHighlights !== undefined) {
      effectiveHighlights = [...explicitHighlights];
    } else {
      const resolved = ctx?.highlights ?? [];
      effectiveHighlights = resolved
        .filter((h) => h.resolvedPosition !== null)
        .map((h) => ({
          id: h.record.id,
          position: h.resolvedPosition!,
          hasNote: h.note !== null && h.note.text.length > 0,
          status: h.status,
        }));
    }

    // 260820: the linear cumulative block-start index (see
    // buildBlockHighlightIndex). Gated on highlights — with zero highlights
    // (the common render, incl. the hidden measurement body) the index is
    // null and the per-block map below does NO grapheme segmentation.
    const highlightIndex = useMemo(
      () =>
        effectiveHighlights.length > 0 ? buildBlockHighlightIndex(article) : null,
      // effectiveHighlights is a fresh array per render by construction (the
      // spread/map above); when non-empty the memo re-runs per render and the
      // rebuild is the one linear pass this fix exists for. When empty the
      // guard short-circuits before any segmentation work.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [article, effectiveHighlights.length > 0],
    );

    return (
      <>
        {article.blocks.map((block, i) => {
          // 260820: O(1) start lookup from the linear index (null when no
          // highlights — the value is consumed only by highlight filtering).
          const blockGlobalStart = highlightIndex?.starts[i] ?? 0;
          // Compute highlight slices for the paragraph/heading path (direct)
          // AND the container paths: blockquote (per-child, Plan 05-07) and
          // lists (per-item with nested-list recursion, Plan 19-03 — the
          // 05-07 items-shape deferral paid down per D19-13/D19-15), AND the
          // two readable atomic surfaces: figure CAPTIONS + code interiors
          // (Plan 19-03 — D19-01 render coverage). The figure alt-divergence
          // that once deferred caption rendering is now PAID DOWN ON BOTH
          // SIDES: Plan 19-01 fixed the capture-side offset
          // (captionLocalStart alignment) and the render side below computes
          // the SYMMETRIC offset (Pitfall 1's pair). Footnote-reference and
          // unsupported remain unmarked (footnote bodies are ineligible
          // boundaries; unsupported interiors are D19-02 gaps).
          //
          // D5-07 capture eligibility is independent of inline rendering: every
          // CAPTURABLE kind persists + re-resolves; inline <mark> coverage is
          // per-kind. For paragraph/heading, sliceRunsForHighlights wraps the
          // highlighted runs directly. For blockquote, Plan 05-07 threads slices
          // per child (mirrors the paragraph path per child paragraph). For
          // lists, Plan 19-03 threads slices per item content child.
          let highlightSlices: ReturnType<typeof sliceRunsForHighlights> | undefined;
          // Plan 05-07: per-child slices for a blockquote block (undefined for
          // non-blockquote kinds + when no highlight intersects any child).
          let childHighlightSlices:
            | (ReturnType<typeof sliceRunsForHighlights> | undefined)[]
            | undefined;
          // Plan 19-03: per-item slices for list blocks (undefined for
          // non-list kinds + when no highlight intersects any item at any
          // nesting depth).
          let itemHighlightSlices: ListItemSlices | undefined;
          // Plan 19-03 (D19-01): caption slices for figures + verbatim-source
          // segments for code blocks (undefined when no highlight intersects).
          let captionHighlightSlices: ReturnType<typeof sliceRunsForHighlights> | undefined;
          let codeSegments: CodeSegment[] | undefined;
          if (highlightIndex) {
          if (block.kind === "paragraph" || block.kind === "heading") {
            const blockLen = highlightIndex.lens[i]!;
            const entries = highlightsForBlock(
              effectiveHighlights,
              blockGlobalStart,
              blockLen,
            );
            if (entries.length > 0) {
              highlightSlices = sliceRunsForHighlights(
                block.content,
                blockGlobalStart,
                entries,
                article.lang,
              );
            }
          } else if (block.kind === "figure") {
            // Caption marks (Plan 19-03 — the Pitfall 1 RENDER-side
            // symmetric offset to 19-01's capture fix). blockText joins
            // [alt, inlineText(caption)].filter(Boolean) with
            // BLOCK_SEPARATOR, so figure-local caption coordinates start
            // after alt + separator when alt is non-empty, 0 otherwise
            // (empty alt drops out of the filter(Boolean) join). The gate
            // length follows the shipped run-sum discipline (the same
            // accounting sliceRunsForHighlights uses internally).
            const captionRunLen = block.caption.reduce(
              (sum, r) => sum + graphemeClusters(r.text, article.lang).length,
              0,
            );
            if (captionRunLen > 0) {
              const captionLocalStart =
                block.alt.length > 0
                  ? graphemeClusters(block.alt, article.lang).length +
                    BLOCK_SEPARATOR.length
                  : 0;
              const captionGlobalStart = blockGlobalStart + captionLocalStart;
              const entries = highlightsForBlock(
                effectiveHighlights,
                captionGlobalStart,
                captionRunLen,
              );
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
            // Code marks (Plan 19-03 — verbatim-source segmentation; raw ==
            // norm in the D-05 substrate, so grapheme offsets over the
            // source address the block's global range directly).
            const entries = highlightsForBlock(
              effectiveHighlights,
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
            // Per-item slice threading (Plan 19-03 — D19-13/D19-15). The
            // items-shape mirror of the blockquote walk below: a list-local
            // accumulator walks items, an item-local accumulator walks each
            // item's content blocks (both joined by BLOCK_SEPARATOR per
            // normalizeText's blockText rule), and each paragraph/heading
            // child reuses highlightsForBlock + sliceRunsForHighlights
            // exactly as the paragraph path does. Nested lists recurse
            // (D19-15). Returns null when nothing intersects — thread
            // nothing (byte-unchanged rendering).
            itemHighlightSlices =
              computeListItemSlices(
                block,
                blockGlobalStart,
                effectiveHighlights,
                article,
              ) ?? undefined;
          } else if (block.kind === "blockquote") {
            // Per-child slice threading (Plan 05-07). Walk block.children
            // accumulating each child's intra-blockquote grapheme offset
            // (BLOCK_SEPARATOR between children — mirrors blockNormalizedText's
            // join rule + sliceChildBlocks in fragmentRenderer). For each
            // paragraph/heading child, reuse highlightsForBlock +
            // sliceRunsForHighlights exactly as the paragraph path does (the
            // child's article-global start = blockGlobalStart + childIntraStart).
            // The resulting array forwards per-child slices to the blockquote
            // BlockView case so each child InlineList renders its <mark>.
            let childIntraStart = 0;
            const perChild: (
              ReturnType<typeof sliceRunsForHighlights>
              | undefined
            )[] = [];
            let anyChildSlices = false;
            for (const child of block.children) {
              const childLen = blockGraphemeLen(child, article.lang);
              const childGlobalStart = blockGlobalStart + childIntraStart;
              let childSlices:
                | ReturnType<typeof sliceRunsForHighlights>
                | undefined;
              if (child.kind === "paragraph" || child.kind === "heading") {
                const entries = highlightsForBlock(
                  effectiveHighlights,
                  childGlobalStart,
                  childLen,
                );
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
            // Only thread when at least one child produced slices (absent =
            // no marks, mirroring the paragraph path's "absent when empty").
            if (anyChildSlices) {
              childHighlightSlices = perChild;
            }
          }
        }
        // data-block-index establishes the 1:1 top-level block↔element mapping
        // the measurement phase + pagination engine share (Plan 04-06). It is
        // emitted ONLY here at the top-level ArticleBody map — recursive
        // <BlockView> calls inside the blockquote/list renderers do NOT carry
        // it (container interiors are not article.blocks entries). The
        // attribute is presentation-only (a numeric array index); React
        // serializes the number to a string attribute value.
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
      {article.footnotes.length > 0 && (
        <section aria-label="Footnotes">
          <ol>
            {article.footnotes.map((fn) => {
              // fn.id is schema-locked to /^fn-\d+$/ (Plan 01 Task 2,
              // Pitfall 4 — DOM-clobbering guard), so the derived suffix `n`
              // is digits-only and safe in both the href fragment and the
              // aria-label. React escapes text/attribute children; the
              // react/no-danger rule forbids raw-HTML injection here.
              const n = fn.id.replace(/^fn-/, "");
              return (
                <li key={fn.id} id={fn.id}>
                  <InlineList runs={fn.content} />
                  {" "}
                  <a href={`#fn-ref-${n}`} aria-label={`Return to reference ${n}`}>
                    {"\u21A9"}
                  </a>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </>
  );
  },
  // Comparator: re-render only when the article identity or the explicit
  // highlights prop identity changes. Absent highlights (undefined) on both
  // sides compare equal — the scrolling body re-renders via its context
  // subscription when live highlights change, NOT via this prop path.
  // Context updates bypass memo entirely, so highlight changes keep working.
  (prev, next) =>
    prev.article === next.article && prev.highlights === next.highlights,
);
