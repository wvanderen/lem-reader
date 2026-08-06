// src/reader/PaginatedSurface.tsx
// Paginated mode renderer — derives page fragments from the trusted
// measurement view and mounts ONE PageFragmentView at a time (Pattern 5
// single content tree — A11Y-03). The surface owns currentPageIdx + pages
// state; chevrons turn the page; ProgressHairline + PageIndicator reflect
// N/M (D4-08).
//
// PAGE-05 substrate: the staleness contract (PAGE-06 last-valid-view + PAGE-07
// stale-epoch drop) is inherited from useMeasurement — this surface consumes
// trustedView as-is, never re-implements trust.
//
// PAGE-04 fallback: if paginateDocument returns status "fallback" the surface
// leaves pages null. Plan 04-05 wires the fallback banner + session-mode flip;
// for this plan a null pages renders nothing and the reader sees the article
// header only. That is the MVP fallback state — Plan 04-05 closes it.
//
// D4-06 quiet chevrons: 44x44 hit-area buttons at the viewport edges with
// --ink-soft default / --accent on hover/focus-visible / 40% opacity at
// aria-disabled. Plan 04-04 adds the keyboard bundle + swipe via
// PageTurnControls — the chevrons share the SAME turn path (commitTurn) as
// the imperative handle so pointer + keyboard + swipe stay in sync.
//
// D4-11 repagination anchor: the pagination effect captures the current
// page's article-global offset (via pageStartGlobalOffset on the OLD pages)
// BEFORE setPages, then re-anchors currentPageIdx via fragmentContainingOffset
// on the NEW pages. The old page stays mounted until the new one commits
// (Phase 3 trustedView retention — PAGE-06). Capture reads from refs (not
// closure) so the effect deps do not include currentPageIdx (which would
// re-trigger pagination on every turn).
//
// D4-10 mode-switch anchor (scrolling→paginated): the parent passes the
// captured scrolling offset as `initialAnchorOffset`; the first pagination
// pass uses it (pages is null → no current-page offset to preserve).
//
// The surface exposes an imperative handle ({ turn, getCurrentAnchorOffset,
// getState }) via forwardRef so PageTurnControls (keyboard + swipe) and
// ArticleView (D4-10 paginated→scrolling capture) can drive the same state
// without lifting it up. The handle is ADDITIVE — existing callers that pass
// no ref (e.g. Plan 04-03's component tests) keep working unchanged.
//
// The surface does NOT re-mount a second <article> — ArticleView owns the
// shared <article class="article-body paginated-surface"> and decides via the
// mode branch which children to mount inside it. This component renders ONLY
// its fragment + chevrons + indicator + hairline as children of that shared
// article element.

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { CanonicalArticle } from "../content/types";
import type { MeasurementResult } from "../measurement/types";
import type { DiagnosticBus } from "../measurement/diagnostics";
import type { PageFragment } from "../pagination/types";
import { paginateDocument } from "../pagination/fragment";
import { fragmentContainingOffset, pageStartGlobalOffset, blockGraphemeLength } from "../pagination/anchor";
import { PageFragmentView } from "../pagination/fragmentRenderer";
import { ProgressHairline } from "./ProgressHairline";
import { PageIndicator } from "./PageIndicator";
import { BLOCK_SEPARATOR } from "../content/normalizeText";

export interface PaginatedSurfaceProps {
  /** The canonical article being paginated. */
  article: CanonicalArticle;
  /** Phase 3's trusted view — the staleness contract is inherited, not re-implemented. */
  trustedView: MeasurementResult;
  /**
   * The shared <article> DOM node owned by ArticleView. The surface queries
   * it via paginateDocument; it does NOT render a second <article>.
   */
  articleEl: HTMLElement;
  /** The single DiagnosticBus instance from useMeasurement — never a second `new DiagnosticBus()`. */
  diagnostics: DiagnosticBus;
  /** The current page content-box height in CSS pixels (from articleEl.getBoundingClientRect). */
  pageContentBoxHeightPx: number;
  /**
   * D4-10 scrolling→paginated anchor: the article-global grapheme offset
   * captured by ArticleView BEFORE the mode swap (from computeTopVisibleOffset).
   * The first successful pagination pass sets currentPageIdx to the page
   * containing this offset. Defaults to 0 (top of article). Ignored on
   * subsequent (repagination) passes — those use the D4-11 current-page
   * anchor captured from the OLD pages.
   */
  initialAnchorOffset?: number;
  /**
   * D4-10/D4-11 anchor reporting: fired whenever currentPageIdx or pages
   * change, with the article-global offset of the current page's first
   * block. ArticleView stores this in a ref so the NEXT mode swap (paginated
   * →scrolling) can capture it synchronously before the render swap. Optional.
   */
  onAnchorChange?: (offset: number) => void;
}

/**
 * Imperative handle exposed via forwardRef. PageTurnControls (keyboard + swipe
 * + announce + focus) and ArticleView (D4-10 capture) consume these without
 * the parent owning currentPageIdx/pages state. The handle reads from refs so
 * it always reflects the latest committed state.
 */
export interface PaginatedSurfaceHandle {
  /**
   * Turn the page. Bounds-checked (no wrap at first/last page). Returns the
   * new {page (1-based), total, moved} so the caller can announce + apply
   * D4-07 focus restoration, or null when no pages are mounted.
   */
  turn: (
    direction: "next" | "previous",
  ) => { page: number; total: number; moved: boolean } | null;
  /**
   * The article-global D-05 grapheme offset of the current page's first block.
   * Used by ArticleView to capture the paginated→scrolling anchor BEFORE the
   * mode-swap re-render (Pitfall 7). Returns 0 when no pages are mounted.
   */
  getCurrentAnchorOffset: () => number;
  /** Current {page (1-based), total}, or null when no pages are mounted. */
  getState: () => { page: number; total: number } | null;
}

export const PaginatedSurface = forwardRef<PaginatedSurfaceHandle, PaginatedSurfaceProps>(
  function PaginatedSurface(
    {
      article,
      trustedView,
      articleEl,
      diagnostics,
      pageContentBoxHeightPx,
      initialAnchorOffset = 0,
      onAnchorChange,
    },
    ref,
  ): React.ReactElement | null {
    const [pages, setPages] = useState<PageFragment[] | null>(null);
    const [currentPageIdx, setCurrentPageIdx] = useState(0);

    // Refs mirror the latest committed state so the imperative handle and the
    // pagination effect read fresh values without re-registering closures.
    // Critically, the pagination effect reads pages/currentPageIdx via these
    // refs (NOT closure capture) so its dependency array excludes them —
    // otherwise every turn (currentPageIdx change) would re-trigger pagination.
    const pagesRef = useRef<PageFragment[] | null>(pages);
    pagesRef.current = pages;
    const currentPageIdxRef = useRef<number>(currentPageIdx);
    currentPageIdxRef.current = currentPageIdx;
    const articleRef = useRef<CanonicalArticle>(article);
    articleRef.current = article;
    const initialAnchorOffsetRef = useRef<number>(initialAnchorOffset);
    initialAnchorOffsetRef.current = initialAnchorOffset;

    // Cancelled-flag pagination effect (mirrors ArticleView L107-129 pattern):
    // a stale pagination pass (e.g. after a rapid article swap or viewport
    // change) cannot overwrite a newer one. AbortController + the engine's
    // internal AbortError handling guarantee silent cancel.
    //
    // D4-11 repagination anchor (PAGE-05): capture the current view's
    // article-global offset (pageStartGlobalOffset on the OLD pages) BEFORE
    // setPages, then re-anchor currentPageIdx via fragmentContainingOffset
    // on the NEW pages. On the FIRST pass (pages null), the anchor is the
    // D4-10 initialAnchorOffset prop (scrolling→paginated mode switch).
    useEffect(() => {
      // Wait for geometry — the engine needs a non-zero page height to produce
      // pages. ArticleView's rAF-deferred getBoundingClientRect effect sets
      // this; on the very first render it's 0.
      if (pageContentBoxHeightPx <= 0) return;
      const currentArticle = articleRef.current;
      const currentPages = pagesRef.current;
      const currentIdx = currentPageIdxRef.current;

      // Capture the anchor BEFORE setPages (Pitfall 7 — capture-before-swap).
      // On repagination (pages exists) preserve the current page's passage;
      // on first mount use the D4-10 initialAnchorOffset.
      let anchorOffset: number;
      if (currentPages && currentPages[currentIdx]) {
        anchorOffset = pageStartGlobalOffset(currentArticle, currentPages[currentIdx]!);
      } else {
        anchorOffset = initialAnchorOffsetRef.current;
      }

      const controller = new AbortController();
      let cancelled = false;
      try {
        const result = paginateDocument({
          article: currentArticle,
          measurement: trustedView,
          articleEl,
          pageContentBoxHeightPx,
          diagnostics,
          signal: controller.signal,
        });
        if (cancelled) return;
        // DEV-only debug hook for the Plan 04-05 e2e suite (coverage /
        // termination / fallback specs). Mirrors useMeasurement.ts L122-125:
        // gated behind import.meta.env.DEV so production never exposes engine
        // state. Exposes the pagination result so e2e can assert the PAGE-03
        // exactly-once / monotonic invariants + PAGE-04 fallback status
        // without probing private React state (T-04-16: page count + status
        // only — no reader content or PII).
        const publishDev = (
          status: "ok" | "fallback",
          pgs: PageFragment[] | null,
          idx: number,
        ) => {
          if (!import.meta.env.DEV) return;
          // Per-block grapheme lengths reuse blockGraphemeLength (the SAME
          // helper the engine + anchor math use — no fork). The coverage e2e
          // asserts each block's slices tile [0, blockLen) exactly once.
          const blockLens = currentArticle.blocks.map((b) =>
            blockGraphemeLength(b, currentArticle.lang),
          );
          const articleGraphemeLength =
            blockLens.reduce((acc, n) => acc + n, 0) +
            Math.max(0, blockLens.length - 1) * BLOCK_SEPARATOR.length;
          (window as unknown as Record<string, unknown>).__lemPagination = {
            pages: pgs,
            currentPageIdx: idx,
            status,
            pagesLength: pgs?.length ?? 0,
            blockGraphemeLengths: blockLens,
            articleGraphemeLength,
          };
        };
        if (result.status === "ok" && result.pages.length > 0) {
          const nextIdx = fragmentContainingOffset(
            result.pages,
            anchorOffset,
            currentArticle,
          );
          setPages(result.pages);
          setCurrentPageIdx(nextIdx);
          publishDev("ok", result.pages, nextIdx);
        } else {
          // PAGE-04 fallback — Plan 04-05 wires the banner + session-mode flip
          // in ArticleView via the DiagnosticBus subscription (the engine
          // already emitted dom-fallback). Render nothing here; the shared
          // <article> header stays visible so the surface isn't blank chrome.
          setPages(null);
          publishDev("fallback", null, 0);
        }
      } catch (e) {
        // AbortError is the silent-cancel path (rapid article swap or viewport
        // change). Any other error is unexpected — leave pages null so the
        // parent's scrolling branch is the natural fallback (Plan 04-05).
        if (e instanceof Error && e.name === "AbortError") return;
        setPages(null);
      }
      return () => {
        cancelled = true;
        controller.abort();
      };
    }, [article, trustedView, articleEl, pageContentBoxHeightPx, diagnostics]);

    // Report the current anchor offset whenever the page changes so the
    // parent can capture it synchronously before a future mode swap.
    useEffect(() => {
      const p = pagesRef.current;
      if (!p || !p[currentPageIdx]) {
        onAnchorChange?.(0);
        return;
      }
      onAnchorChange?.(pageStartGlobalOffset(articleRef.current, p[currentPageIdx]!));
    }, [currentPageIdx, pages, onAnchorChange]);

    // DEV-only: keep window.__lemPagination.currentPageIdx fresh on every
    // turn so the Plan 04-05 page-turn e2e can assert the new page without
    // poking the imperative handle. pages/status are published in the
    // pagination effect above; this only refreshes the live index. Gated
    // behind import.meta.env.DEV (T-04-16).
    if (import.meta.env.DEV) {
      const dev = (window as unknown as Record<string, unknown>).__lemPagination as
        | { pages: PageFragment[] | null; currentPageIdx: number; status: string; pagesLength: number }
        | undefined;
      if (dev && dev.currentPageIdx !== currentPageIdx) {
        dev.currentPageIdx = currentPageIdx;
      }
    }

    /**
     * The shared turn path — chevrons + imperative handle + (via the handle)
     * keyboard + swipe all route through here so aria-disabled bounds, the
     * "Page N of M" announce, and D4-07 focus stay in lockstep. Bounds-checked:
     * at page 1 / last page the corresponding direction is a no-op (returns
     * moved:false so the caller skips the announce + focus step).
     */
    function commitTurn(
      direction: "next" | "previous",
    ): { page: number; total: number; moved: boolean } | null {
      const p = pagesRef.current;
      if (!p || p.length === 0) return null;
      const cur = currentPageIdxRef.current;
      const next =
        direction === "next" ? Math.min(cur + 1, p.length - 1) : Math.max(0, cur - 1);
      const moved = next !== cur;
      if (moved) setCurrentPageIdx(next);
      return { page: next + 1, total: p.length, moved };
    }

    // Imperative handle — ADDITIVE (existing no-ref callers are unaffected).
    useImperativeHandle(
      ref,
      (): PaginatedSurfaceHandle => ({
        turn: (direction) => commitTurn(direction),
        getCurrentAnchorOffset: () => {
          const p = pagesRef.current;
          const idx = currentPageIdxRef.current;
          if (!p || !p[idx]) return 0;
          return pageStartGlobalOffset(articleRef.current, p[idx]!);
        },
        getState: () => {
          const p = pagesRef.current;
          if (!p || p.length === 0) return null;
          return { page: currentPageIdxRef.current + 1, total: p.length };
        },
      }),
      [],
    );

    // Until the first pagination pass commits (or when status is "fallback"),
    // render nothing inside the article body. The shared <article> header stays
    // visible above this surface.
    if (!pages || pages.length === 0) {
      return null;
    }

    const isFirst = currentPageIdx === 0;
    const isLast = currentPageIdx === pages.length - 1;

    return (
      <>
        {/*
          ProgressHairline accepts a `page` prop in paginated mode; the fill
          derives from N/M. PageIndicator is a sibling decorative span. The
          SectionAnnouncer live region in ArticleView conveys structural
          progress to AT; both elements here are aria-hidden.
        */}
        <ProgressHairline page={{ current: currentPageIdx + 1, total: pages.length }} />
        <PageIndicator current={currentPageIdx + 1} total={pages.length} />

        <PageFragmentView
          fragment={pages[currentPageIdx]!}
          pageIndex={currentPageIdx}
          article={article}
          lang={article.lang}
        />

        <button
          type="button"
          className="page-turn page-turn-previous"
          aria-label="Previous page"
          aria-disabled={isFirst}
          onClick={() => commitTurn("previous")}
        >
          <ChevronLeftIcon aria-hidden="true" />
        </button>
        <button
          type="button"
          className="page-turn page-turn-next"
          aria-label="Next page"
          aria-disabled={isLast}
          onClick={() => commitTurn("next")}
        >
          <ChevronRightIcon aria-hidden="true" />
        </button>
      </>
    );
  },
);

// ── Inline chevron glyphs ────────────────────────────────────────────────────
// Mirrors Header.tsx GearIcon discipline (L42-59): inline SVG, viewBox
// 0 0 24 24, stroke currentColor, focusable="false" so IE/Edge legacy doesn't
// put it in the focus order. aria-hidden because the button's aria-label
// carries the accessible name.

function ChevronLeftIcon({ ariaHidden }: { ariaHidden?: "true" }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaHidden}
      focusable="false"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon({ ariaHidden }: { ariaHidden?: "true" }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaHidden}
      focusable="false"
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}
