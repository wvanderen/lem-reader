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
import { memo, useMemo } from "react";
import { InlineList } from "./InlineRenderer";
import type { TextPositionSelector } from "../normalizeText";
import { BLOCK_SEPARATOR, blockNormalizedText, graphemeClusters } from "../normalizeText";
import { sliceRunsForHighlights } from "../../annotations/highlightRanges";
import type { HighlightSliceEntry } from "../../annotations/highlightRanges";
// Phase 5 Plan 05-02: ArticleBody reads from the highlight overlay context
// when no explicit highlights prop is passed, so the scrolling ArticleBody
// renders <mark> overlays from the provider state. The measurement body
// (hidden) passes highlights={[]} to suppress. The useOptionalHighlightOverlay
// hook returns null outside a provider, so legacy callers (component tests
// without a provider) render without marks — byte-unchanged behavior.
import { useOptionalHighlightOverlay } from "../../reader/annotations/HighlightOverlay";

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
} & {
  [K in `data-${string}`]?: string | number | undefined;
};

export function BlockView({
  block,
  highlightSlices,
  childHighlightSlices,
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
                <BlockView key={j} block={c} />
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
                <BlockView key={j} block={c} />
              ))}
            </li>
          ))}
        </ol>
      );
    case "figure":
      return (
        <figure {...elementProps}>
          <img src={block.src} alt={block.alt} />
          {block.caption.length > 0 && (
            <figcaption>
              <InlineList runs={block.caption} />
            </figcaption>
          )}
        </figure>
      );
    case "code-block":
      // NEVER inject raw HTML (Pitfall 6); React escapes source text.
      return (
        <pre {...elementProps}>
          <code>{block.source}</code>
        </pre>
      );
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
          // AND the blockquote container path (per-child). Other container kinds
          // (lists — different items-shape, no failing UAT case) and atomic kinds
          // (figure/code-block/footnote-reference/unsupported) do not carry inline
          // highlight overlays in this MVP slice. Code-block + figure-caption
          // remain deferred: a figure's blockNormalizedText includes alt +
          // separator + caption, which diverges from the DOM textContent the
          // capture map walks — handling that divergence is deferred to keep the
          // D-05 substrate stable.
          //
          // D5-07 capture eligibility is independent of inline rendering: every
          // CAPTURABLE kind persists + re-resolves; inline <mark> coverage is
          // per-kind. For paragraph/heading, sliceRunsForHighlights wraps the
          // highlighted runs directly. For blockquote, Plan 05-07 threads slices
          // per child (mirrors the paragraph path per child paragraph).
          let highlightSlices: ReturnType<typeof sliceRunsForHighlights> | undefined;
          // Plan 05-07: per-child slices for a blockquote block (undefined for
          // non-blockquote kinds + when no highlight intersects any child).
          let childHighlightSlices:
            | (ReturnType<typeof sliceRunsForHighlights> | undefined)[]
            | undefined;
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
