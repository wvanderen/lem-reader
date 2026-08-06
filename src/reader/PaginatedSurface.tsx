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
// aria-disabled (Plan 04 adds the keyboard bundle + swipe — this plan ships
// the pointer path only).
//
// The surface does NOT re-mount a second <article> — ArticleView owns the
// shared <article class="article-body paginated-surface"> and decides via the
// mode branch which children to mount inside it. This component renders ONLY
// its fragment + chevrons + indicator + hairline as children of that shared
// article element.

import { useEffect, useState } from "react";
import type { CanonicalArticle } from "../content/types";
import type { MeasurementResult } from "../measurement/types";
import type { DiagnosticBus } from "../measurement/diagnostics";
import type { PageFragment } from "../pagination/types";
import { paginateDocument } from "../pagination/fragment";
import { PageFragmentView } from "../pagination/fragmentRenderer";
import { ProgressHairline } from "./ProgressHairline";
import { PageIndicator } from "./PageIndicator";

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
}

export function PaginatedSurface({
  article,
  trustedView,
  articleEl,
  diagnostics,
  pageContentBoxHeightPx,
}: PaginatedSurfaceProps): React.ReactElement | null {
  const [pages, setPages] = useState<PageFragment[] | null>(null);
  const [currentPageIdx, setCurrentPageIdx] = useState(0);

  // Cancelled-flag pagination effect (mirrors ArticleView L107-129 pattern):
  // a stale pagination pass (e.g. after a rapid article swap or viewport
  // change) cannot overwrite a newer one. AbortController + the engine's
  // internal AbortError handling guarantee silent cancel.
  useEffect(() => {
    // Wait for geometry — the engine needs a non-zero page height to produce
    // pages. ArticleView's rAF-deferred getBoundingClientRect effect sets
    // this; on the very first render it's 0.
    if (pageContentBoxHeightPx <= 0) return;
    const controller = new AbortController();
    let cancelled = false;
    try {
      const result = paginateDocument({
        article,
        measurement: trustedView,
        articleEl,
        pageContentBoxHeightPx,
        diagnostics,
        signal: controller.signal,
      });
      if (cancelled) return;
      if (result.status === "ok" && result.pages.length > 0) {
        setPages(result.pages);
        setCurrentPageIdx(0);
      } else {
        // PAGE-04 fallback — Plan 04-05 wires the banner + session-mode flip.
        // For this plan, render nothing (ArticleView's article-body still
        // shows the provenance header so the surface isn't blank chrome).
        setPages(null);
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

  const goPrevious = () => {
    setCurrentPageIdx((i) => Math.max(0, i - 1));
  };
  const goNext = () => {
    setCurrentPageIdx((i) =>
      pages ? Math.min(i + 1, pages.length - 1) : i,
    );
  };

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
        onClick={goPrevious}
      >
        <ChevronLeftIcon aria-hidden="true" />
      </button>
      <button
        type="button"
        className="page-turn page-turn-next"
        aria-label="Next page"
        aria-disabled={isLast}
        onClick={goNext}
      >
        <ChevronRightIcon aria-hidden="true" />
      </button>
    </>
  );
}

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
