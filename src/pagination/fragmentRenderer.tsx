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
import type { CanonicalArticle } from "../content/types";
import { BlockView } from "../content/render/BlockRenderer";
import type { ArticleBodyHighlight } from "../content/render/BlockRenderer";
import type { ListItemSlices } from "../content/render/BlockRenderer";
import { resolveBlockSlice, footnoteBodyBlock } from "./splitBlock";
import {
  BLOCK_SEPARATOR,
  blockNormalizedText,
  footnoteRowFor,
  graphemeClusters,
  inlineText,
  isWhitespaceCluster,
} from "../content/normalizeText";
import { blockGraphemeLength } from "./anchor";
// Issue #234: the ONE container projection primitive (splitBlock.ts) —
// the same slicing the windowed measurement projection uses, never a fork.
import type { HighlightSlice } from "../annotations/highlightRanges";
import type { HighlightSliceEntry } from "../annotations/highlightRanges";
import type { CodeSegment } from "../annotations/highlightRanges";
// Spike 0007 promotion (issue #36): the ONE unified highlight slicer serves
// the paginated walk here (entry-local origin) and the scrolling walk in
// BlockRenderer.tsx (article-global origin). F2 is reconciled: both twins
// and the pagination engine address the SAME D-05 coordinate stream, so the
// spike's measureChild parameter is gone — there is one child measure.
import { blockViewSlices, sliceBlockHighlights } from "../annotations/unifiedHighlightSlicer";
import { InlineList } from "../content/render/InlineRenderer";
import type { GraphemeRange } from "../annotations/unifiedHighlightSlicer";
// Issue #42: the synthetic spoken-word marker entry — appended to the SAME
// per-entry highlight translation the annotation highlights ride, then
// rendered (via the InlineRenderer/BlockView branch on the reserved id) as
// the aria-hidden spoken-word mark.
import { spokenMarkerEntry } from "../annotations/spokenMarker";
import type { PageFragment } from "./types";

/**
 * PageFragmentView — render one PageFragment as a semantic <section>.
 *
 * Maps each fragment.blocks entry to a BlockView via resolveBlockSlice. The
 * section carries an `aria-label={`Page ${pageIndex + 1}`}` so a screen-reader
 * user can identify the page boundary (the SectionAnnouncer live region
 * conveys structural progress; this label is a per-page anchor).
 *
 * D5-16 cross-fragment highlight slicing (Plan 05-04): the optional
 * `highlights` prop carries the article's resolved highlights (confident +
 * ambiguous/orphan). For each fragment entry the renderer computes the
 * entry's article-global visible range, intersects each highlight's range
 * with it, and — for any non-empty intersection — passes a per-entry slice
 * to BlockView/InlineList so the renderer wraps the visible slice in
 * `<mark data-highlight-id={id}>`. A single-block highlight whose block is
 * split across a page boundary therefore renders a `<mark>` slice on EACH
 * fragment containing part of its range — both fragments share the same
 * data-highlight-id (D5-16: no silent gaps at a page turn; the popover/note
 * is reachable from either page).
 *
 * Phase 19 Plan 19-04 (D5-16 extension over SPANS + the items-shape): the
 * per-entry threading now covers EVERY readable kind — list entries thread
 * per-item/per-child slices in entry-local coordinates (the paginated twin
 * of BlockRenderer's computeListItemSlices, nested-list recursion included),
 * figure entries forward caption slices (Pitfall 1 symmetric offset), and
 * code-block entries forward verbatim-source segments. Both reading modes
 * render identical span coverage.
 *
 * @param fragment   The PageFragment to render (entries are {blockIndex, startGrapheme, endGrapheme}).
 * @param pageIndex  0-based page ordinal — used for the aria-label (rendered as Page N+1).
 * @param article    The canonical article (source for resolving blockIndex → Block).
 * @param lang       BCP-47 locale — passed to splitParagraphRuns for Intl.Segmenter.
 * @param highlights Optional resolved highlights to render as cross-fragment
 *                  `<mark>` overlays. PaginatedSurface threads these from the
 *                  HighlightOverlay context; absent/empty → no marks (the
 *                  pre-Phase-5 path, byte-unchanged so existing tests regress
 *                  nothing).
 */
export function PageFragmentView({
  fragment,
  pageIndex,
  article,
  lang,
  highlights,
  spokenRange,
  style,
}: {
  fragment: PageFragment;
  pageIndex: number;
  article: CanonicalArticle;
  lang: string;
  highlights?: readonly ArticleBodyHighlight[];
  /**
   * Issue #42: the article-global D-05 grapheme range speech is currently
   * inside — rendered through the SAME per-entry intersection + unified
   * slicer walk as the annotation highlights, surfacing as the synthetic
   * aria-hidden spoken-word <mark> (SPOKEN_MARKER_ID). Null/absent → no
   * marker. The route threads it only to the VISIBLE page fragment, never
   * the hidden measurement body.
   */
  spokenRange?: GraphemeRange | null;
  /**
   * Plan 13-04 (Option A): optional style pass-through. The surface sets
   * the page-1 fragment's flow height to calc(100% - firstPageReservedPx)
   * so the article-top metadata spot and page-1 content share .page-
   * viewport. Additive — absent for every legacy caller, which keep the
   * full .page-fragment height from app.css.
   */
  style?: React.CSSProperties;
}): React.ReactElement {
  // Plan 19-04 (Pitfall 2 / T-19-10 — per-page first-occurrence id pass):
  // ONE PageFragmentView is mounted at a time (PaginatedSurface), so a
  // per-render Set of highlight ids == per-MOUNTED-PAGE firstness. While
  // mapping entries in document order, the first slice encountered per
  // highlight id claims isFirst = true; every later slice for the same id
  // on THIS page is isFirst = false — OVERRIDING whatever the entry-local
  // slicer produced (entry-local coordinates cannot know document
  // firstness; see HighlightSlice.isFirst). This guarantees exactly one
  // id="hl-<highlightId>" per highlight per mounted page, and it precedes
  // sibling slices in document order so the D10-03 jump focus lands at the
  // page-local span start.
  const seenHighlightIds = new Set<string>();
  // Issue #235 — pages are homogeneous (the engine flushes at the body→
  // footnotes boundary), so the footnote entries render as ONE accessible
  // footnotes region after the body entries — the SAME section anatomy the
  // scrolling body ends with.
  const footnoteEntries = fragment.blocks.filter(
    (entry) => entry.footnoteIndex !== undefined,
  );
  // Homogeneous pages: body entries render through BlockView here; footnote
  // entries render ONLY in the footnotes region below.
  const bodyEntries = fragment.blocks.filter((entry) => entry.footnoteIndex === undefined);
  return (
    <section className="page-fragment" aria-label={`Page ${pageIndex + 1}`} style={style}>
      {bodyEntries.map((entry, i) => {
        const sourceBlock = article.blocks[entry.blockIndex]!;
        const resolved = resolveBlockSlice(
          sourceBlock,
          entry.startGrapheme,
          entry.endGrapheme,
          lang,
        );
        // D5-16 cross-fragment slicing: sliceHighlightsForEntry computes this
        // entry's article-global visible range, intersects each highlight's
        // range with it, and translates non-empty intersections back to
        // ENTRY-LOCAL coordinates. The unified slicer then walks the resolved
        // (already sliced) block with origin 0 + the entry's D-05 visible
        // length, producing every kind's slice shape in one recursion. A
        // split-block highlight produces a slice on EACH containing fragment —
        // both fragments' <mark> elements share the same data-highlight-id.
        // (Both coordinates are D-05 now — Spike 0007 F2 reconciliation — so
        // the article-global translation is exact, and the slicer's per-kind
        // output is byte-identical to the scrolling twin's.)
        let unified: ReturnType<typeof sliceBlockHighlights> = null;
        // Issue #42: the spoken marker rides the same intersection path —
        // one synthetic entry appended to the page's annotation highlights.
        const entryHighlights: readonly ArticleBodyHighlight[] =
          spokenRange != null
            ? [...(highlights ?? []), spokenMarkerEntry(spokenRange)]
            : (highlights ?? []);
        if (entryHighlights.length > 0) {
          const entrySlices = sliceHighlightsForEntry(
            entryHighlights,
            article,
            entry.blockIndex,
            entry.startGrapheme,
            entry.endGrapheme,
            lang,
          );
          if (entrySlices.length > 0) {
            // The resolved block is already the intra-entry slice; its
            // rendered stream starts at the entry's first real grapheme
            // (edge separators clip via sliceHighlightsForEntry) and its
            // visible length is endGrapheme - startGrapheme minus those
            // edge graphemes (both D-05).
            // paragraph/heading (inline), blockquote (per-child), lists
            // (per-item), figure captions, and code segments all route
            // through the ONE walk; footnote-reference/unsupported thread
            // nothing by construction (D19-02). The RENDER ROUTING stays
            // explicit: every entry renders through the SHARED BlockView
            // via blockViewSlices — no silent bypass.
            unified = sliceBlockHighlights({
              block: resolved,
              origin: 0,
              visibleLen: entry.endGrapheme - entry.startGrapheme,
              highlights: entrySlices,
              lang,
            });
          }
        }
        const {
          highlightSlices,
          childHighlightSlices,
          itemHighlightSlices,
          captionHighlightSlices,
          codeSegments,
        } = blockViewSlices(unified);
        // Per-page first-occurrence pass (Plan 19-04): claim isFirst in
        // DOCUMENT order across every slice shape this entry produced —
        // blockquote children walk in render order, list items recurse
        // depth-first in render order, caption slices and code segments
        // walk their ordered arrays. Exactly one slice per highlight id
        // keeps the DOM id on this mounted page.
        if (childHighlightSlices) {
          for (const childSlices of childHighlightSlices) {
            if (childSlices) {
              claimSlicesFirstOccurrence(childSlices, seenHighlightIds);
            }
          }
        }
        if (highlightSlices) {
          claimSlicesFirstOccurrence(highlightSlices, seenHighlightIds);
        }
        if (itemHighlightSlices) {
          claimItemSlicesFirstOccurrence(itemHighlightSlices, seenHighlightIds);
        }
        if (captionHighlightSlices) {
          claimSlicesFirstOccurrence(captionHighlightSlices, seenHighlightIds);
        }
        if (codeSegments) {
          claimCodeSegmentsFirstOccurrence(codeSegments, seenHighlightIds);
        }
        return (
          <BlockView
            key={i}
            block={resolved}
            // D5-08 paginated-mode capture binding: emit data-block-index on
            // EVERY fragment entry so captureSelection's findBlockAncestor
            // resolves the visible page-fragment blocks (not just the
            // scrolling ArticleBody / hidden measurement body). For a sliced
            // entry, data-block-grapheme-start carries the slice's intra-
            // block start offset so capture can offset the intra-block range
            // (the slice's textContent is a substring of the full block;
            // without this offset the raw→norm map would misalign).
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
      {footnoteEntries.length > 0 && (
        <section aria-label="Footnotes">
          <ol>
            {footnoteEntries.map((entry) => (
              <FootnoteEntryView
                key={`fn-${entry.footnoteIndex}`}
                entry={entry}
                article={article}
                lang={lang}
                highlights={
                  spokenRange != null
                    ? [...(highlights ?? []), spokenMarkerEntry(spokenRange)]
                    : (highlights ?? [])
                }
                seenHighlightIds={seenHighlightIds}
              />
            ))}
          </ol>
        </section>
      )}
    </section>
  );
}

/**
 * One footnote entry of a mounted page (issue #235): the SAME accessible
 * anatomy the scrolling body renders — li#fn-N with the visible body text and
 * the ↩ back-link to #fn-ref-N — with runs sliced to the entry's intra-row
 * range through the ONE shared slicing primitive (never a fork). The row
 * carries NO data-block-index: capture's findBlockAncestor terminates at the
 * reading root, so footnote bodies stay ineligible for highlights exactly as
 * in scrolling mode (D5-07/Pitfall 6 — readability never broadens annotation
 * eligibility). The content wrapper is the overflow guard's read target: its
 * textContent is exactly the entry's raw run text, chrome-free.
 */
function FootnoteEntryView({
  entry,
  article,
  lang,
  highlights,
  seenHighlightIds,
}: {
  entry: PageFragment["blocks"][number];
  article: CanonicalArticle;
  lang: string;
  highlights: readonly ArticleBodyHighlight[];
  seenHighlightIds: Set<string>;
}): React.ReactElement {
  const footnoteIndex = entry.footnoteIndex!;
  const fn = article.footnotes[footnoteIndex]!;
  // The entry's slice through the ONE shared primitive: the footnote body's
  // inline-run view sliced at the entry's D-05 range (marks preserved on both
  // halves per Pitfall 4).
  const resolved = resolveBlockSlice(
    footnoteBodyBlock(fn, lang),
    entry.startGrapheme,
    entry.endGrapheme,
    lang,
  );
  const runs = resolved.kind === "paragraph" ? resolved.content : fn.content;
  // Cross-fragment slicing for the annotation/spoken overlay (the paginated
  // twin of the body-entry path): article-global intersection translated to
  // entry-local coordinates against the footnote ROW's canonical origin.
  let highlightSlices: ReturnType<typeof blockViewSlices>["highlightSlices"] = undefined;
  if (highlights.length > 0) {
    const row = footnoteRowFor(article, footnoteIndex);
    if (row) {
      const entrySlices = sliceHighlightsForEntry(
        highlights,
        article,
        footnoteIndex,
        entry.startGrapheme,
        entry.endGrapheme,
        lang,
        footnoteIndex,
      );
      if (entrySlices.length > 0) {
        const unified = sliceBlockHighlights({
          block: resolved,
          origin: 0,
          visibleLen: entry.endGrapheme - entry.startGrapheme,
          highlights: entrySlices,
          lang,
        });
        highlightSlices = blockViewSlices(unified).highlightSlices;
      }
    }
  }
  if (highlightSlices) {
    claimSlicesFirstOccurrence(highlightSlices, seenHighlightIds);
  }
  const n = fn.id.replace(/^fn-/, "");
  return (
    <li id={fn.id} tabIndex={-1} data-footnote-index={footnoteIndex}>
      <span data-footnote-content>
        <InlineList runs={runs} highlightSlices={highlightSlices} />
      </span>{" "}
      <a href={`#fn-ref-${n}`} aria-label={`Return to reference ${n}`}>
        {"\u21A9"}
      </a>
    </li>
  );
}

/**
 * Compute the per-entry HighlightSliceEntry[] for D5-16 cross-fragment slicing.
 *
 * For each confident-or-unresolved highlight, intersect its article-global
 * `[start, end)` range with the entry's article-global visible range
 * `[blockGlobalStart + startGrapheme, blockGlobalStart + endGrapheme)`. If
 * the intersection is non-empty (intersectStart < intersectEnd), translate
 * it back to ENTRY-LOCAL coordinates (subtract the entry's start offset) and
 * emit a HighlightSliceEntry whose `position` is the entry-local range.
 *
 * The translation is what makes a split-block highlight render on BOTH
 * fragments: fragment A's entry covers [blockStart, splitPoint) and fragment
 * B's entry covers [splitPoint, blockEnd); a highlight at [blockStart+10,
 * blockEnd-10) intersects BOTH entries, producing one entry-local slice on
 * each fragment — both carrying the same `id` (and therefore the same
 * data-highlight-id once InlineList wraps them in <mark>).
 *
 * End-exclusive boundary: a highlight that touches the entry boundary
 * exactly (intersectStart === intersectEnd) produces NO slice — matches the
 * `sliceRunsForHighlights` end-exclusive contract.
 */
function sliceHighlightsForEntry(
  highlights: readonly ArticleBodyHighlight[],
  article: CanonicalArticle,
  blockIndex: number,
  entryStartGrapheme: number,
  entryEndGrapheme: number,
  lang: string,
  footnoteIndex?: number,
): HighlightSliceEntry[] {
  // Issue #235 — footnote entries anchor at the ROW's canonical origin (the
  // substrate's footnoteRows offsets); body entries keep the block walk.
  const row = footnoteIndex !== undefined ? footnoteRowFor(article, footnoteIndex) : undefined;
  const windowClusters =
    row !== undefined
      ? graphemeClusters(inlineText(article.footnotes[row.index]!.content), lang)
      : graphemeClusters(blockNormalizedText(article.blocks[blockIndex]!), lang);
  const blockGlobalStart =
    row !== undefined
      ? row.start
      : (() => {
          // The block's article-global start offset (mirrors
          // pageStartGlobalOffset / computeBlockGlobalStart accumulation).
          let start = 0;
          for (let i = 0; i < blockIndex && i < article.blocks.length; i++) {
            start += blockGraphemeLength(article.blocks[i]!, lang) + BLOCK_SEPARATOR.length;
          }
          return start;
        })();
  const entryStart = blockGlobalStart + entryStartGrapheme;
  const entryEnd = blockGlobalStart + entryEndGrapheme;

  // Visible-window clip (Spike 0007 F2 reconciliation): separator graphemes
  // at the entry window's edges (the inlineText run join, BLOCK_SEPARATOR
  // between children) render in NO run piece — splitParagraphRuns leaves
  // them unrendered and the resolved slice's normalized stream begins/ends
  // at the first/last real grapheme. Clip the intersection to that VISIBLE
  // window so the entry-local positions the unified slicer consumes address
  // the rendered slice's stream exactly — no phantom-separator drift at
  // page seams, for every split offset (the wrap-sweep differential pins
  // this). Interior separators need no special casing: the slicer's child
  // windows account for them via BLOCK_SEPARATOR arithmetic.
  const windowLen = entryEndGrapheme - entryStartGrapheme;
  let lead = 0;
  while (lead < windowLen && isWhitespaceCluster(windowClusters[entryStartGrapheme + lead] ?? "")) {
    lead++;
  }
  let trail = 0;
  while (
    trail < windowLen - lead &&
    isWhitespaceCluster(windowClusters[entryEndGrapheme - 1 - trail] ?? "")
  ) {
    trail++;
  }
  const visibleStart = entryStart + lead;
  const visibleEnd = entryEnd - trail;

  const out: HighlightSliceEntry[] = [];
  for (const h of highlights) {
    const intersectStart = Math.max(h.position.start, visibleStart);
    const intersectEnd = Math.min(h.position.end, visibleEnd);
    if (intersectStart < intersectEnd) {
      // Translate back to entry-local coordinates: the resolved block's
      // rendered stream starts at entry-relative offset `lead` (resolveBlock
      // already sliced to [entryStartGrapheme, entryEndGrapheme), whose edge
      // separators render in no piece). The slice positions are therefore
      // relative to visibleStart.
      out.push({
        id: h.id,
        position: {
          start: intersectStart - visibleStart,
          end: intersectEnd - visibleStart,
        },
        hasNote: h.hasNote,
        status: h.status,
        // Issue #118 — the named color rides the entry-local translation
        // verbatim (visual organization; never participates in the
        // intersection math above).
        color: h.color,
        // Issue #196 — the custom snapshot + its derived tint ride verbatim
        // too (same visual-only discipline; the tint was derived at the
        // mapping site against the active theme).
        ...(h.customColor !== undefined ? { customColor: h.customColor, tint: h.tint } : {}),
      });
    }
  }
  return out;
}

// Test-only export: the D5-16 intersection math is pure (no DOM, no React),
// so Plan 05-04 ships a pure-math unit test that calls this helper with
// synthetic article + PageFragment fixtures (jsdom-safe; the full paginated
// render proof is Plan 05-05's Playwright suite). The function is otherwise
// internal to PageFragmentView's render path.
export { sliceHighlightsForEntry as _test_sliceHighlightsForEntry };

// Test-only exports (Plan 19-04): the per-page first-occurrence claim
// primitives + the entry-local items-shape threading are pure (no DOM, no
// React), so cross-fragment-slicing.test.ts proves the flag arithmetic with
// synthetic slice arrays (jsdom-safe; the real multi-page render proof is
// the cross-fragment-render.spec.ts Playwright cells).
export { claimSlicesFirstOccurrence as _test_claimSlicesFirstOccurrence };
export { claimItemSlicesFirstOccurrence as _test_claimItemSlicesFirstOccurrence };
export { claimCodeSegmentsFirstOccurrence as _test_claimCodeSegmentsFirstOccurrence };
// ── Per-page first-occurrence id pass (Plan 19-04 — Pitfall 2 / T-19-10) ──────

/**
 * Claim isFirst over an ordered HighlightSlice[] for ONE mounted page.
 *
 * Mutates slice.isFirst in place: the first slice carrying a given
 * highlightId (in walk order = document order) claims isFirst = true; every
 * later slice for the same id on THIS mounted page is isFirst = false. The
 * slicer-produced flags are entry-local-blind (see HighlightSlice.isFirst)
 * and are ALWAYS overridden here — the pass, not the slicer, owns the flag
 * in paginated mode. Exactly one isFirst per id per page means exactly one
 * id="hl-<id>" element per mounted document (InlineRenderer stamps the id
 * only when isFirst === true; data-highlight-id stays on EVERY slice).
 */
function claimSlicesFirstOccurrence(slices: readonly HighlightSlice[], seen: Set<string>): void {
  for (const slice of slices) {
    if (slice.highlightId === null) continue;
    if (seen.has(slice.highlightId)) {
      slice.isFirst = false;
    } else {
      seen.add(slice.highlightId);
      slice.isFirst = true;
    }
  }
}

/**
 * Claim isFirst over a ListItemSlices structure — depth-first in RENDER
 * order (items in order, each item's content children in order, nested
 * lists recursing between surrounding siblings), sharing ONE seen-set with
 * the rest of the mounted page.
 */
function claimItemSlicesFirstOccurrence(item: ListItemSlices, seen: Set<string>): void {
  for (const perChild of item.perItem) {
    for (const child of perChild) {
      if (child == null) continue;
      if (Array.isArray(child)) {
        claimSlicesFirstOccurrence(child, seen);
      } else {
        claimItemSlicesFirstOccurrence(child, seen);
      }
    }
  }
}

/**
 * Claim isFirst over sliceCodeForHighlights output — the same first-
 * occurrence rule for code segments (CodeSegment.isFirst gates the
 * id="hl-<id>" stamp in BlockView's code case exactly as HighlightSlice
 * .isFirst gates InlineRenderer's).
 */
function claimCodeSegmentsFirstOccurrence(
  segments: readonly CodeSegment[],
  seen: Set<string>,
): void {
  for (const segment of segments) {
    if (segment.entry === null) continue;
    if (seen.has(segment.entry.id)) {
      segment.isFirst = false;
    } else {
      seen.add(segment.entry.id);
      segment.isFirst = true;
    }
  }
}
