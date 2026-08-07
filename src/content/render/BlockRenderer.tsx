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
  /**
   * Phase 5 Plan 05-02: per-block highlight slices (from sliceRunsForHighlights).
   * When present, InlineList wraps highlighted slices in <mark>. Absent for
   * non-paragraph/heading kinds + the measurement body.
   */
  highlightSlices?: ReturnType<typeof sliceRunsForHighlights>;
} & {
  [K in `data-${string}`]?: string | number | undefined;
};

export function BlockView({ block, highlightSlices, ...rest }: BlockViewProps) {
  switch (block.kind) {
    case "heading": {
      const Tag = `h${block.level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      return (
        <Tag {...rest}>
          <InlineList runs={block.content} highlightSlices={highlightSlices} />
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p {...rest}>
          <InlineList runs={block.content} highlightSlices={highlightSlices} />
        </p>
      );
    case "blockquote":
      return (
        <blockquote {...rest}>
          {block.children.map((child, i) => (
            <BlockView key={i} block={child} />
          ))}
        </blockquote>
      );
    case "bulleted-list":
      return (
        <ul {...rest}>
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
        <ol {...rest} start={block.start}>
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
        <figure {...rest}>
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
        <pre {...rest}>
          <code>{block.source}</code>
        </pre>
      );
    case "footnote-reference": {
      // footnoteId matches /^fn-\d+$/ (Plan 01 Task 2). Extract N and derive
      // distinct ids: anchor gets "fn-ref-N", body <li> keeps "fn-N"
      // (Pitfall 4 fix — DO NOT set the anchor id to block.footnoteId).
      const n = block.footnoteId.replace(/^fn-/, "");
      return (
        <sup {...rest}>
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
        <details {...rest} className="disclosure">
          <summary>Some content from the original article isn't supported yet.</summary>
          <ul>
            <li>{block.plainDescription}</li>
          </ul>
        </details>
      );
  }
}

/**
 * Compute the article-global D-05 grapheme start offset of article.blocks[i].
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

export function ArticleBody({
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

  return (
    <>
      {article.blocks.map((block, i) => {
        const blockGlobalStart = computeBlockGlobalStart(article, i);
        // Compute highlight slices ONLY for the paragraph/heading path
        // (the kinds InlineList serves). Container kinds (blockquote/list)
        // and atomic kinds (figure/code-block/footnote-reference/unsupported)
        // do not carry inline highlight overlays in this MVP slice — they
        // follow the same per-kind exhaustive switch (Pattern F) in a later
        // plan. For paragraph/heading, compute the slices via
        // sliceRunsForHighlights so InlineList wraps the highlighted runs.
        let highlightSlices: ReturnType<typeof sliceRunsForHighlights> | undefined;
        if (
          effectiveHighlights.length > 0 &&
          (block.kind === "paragraph" || block.kind === "heading")
        ) {
          const blockLen = blockGraphemeLen(block, article.lang);
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
}
