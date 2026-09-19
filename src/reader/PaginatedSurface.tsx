// src/reader/PaginatedSurface.tsx
// Paginated mode renderer — derives page fragments from the trusted
// measurement view and mounts ONE PageFragmentView at a time (Pattern 5
// single content tree — A11Y-03). The surface owns currentPageIdx + pages
// state; chevrons turn the page; ProgressHairline carries the offset-anchored
// progress ratio (POLISH-02) while PageIndicator keeps the N/M readout
// (D4-08 — page numbers stay informational, never identity).
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
// page's article-global offset (via pageAnchorOffset on the OLD pages)
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

import {
  forwardRef,
  useLayoutEffect,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CanonicalArticle } from "../content/types";
import type { MeasurementResult } from "../measurement/types";
import type { DiagnosticBus } from "../measurement/diagnostics";
import type { PageFragment } from "../pagination/types";
import { paginateDocument } from "../pagination/fragment";
import { refragmentOverflowingPage } from "../pagination/overflowGuard";
import { fragmentContainingOffset, pageAnchorOffset } from "../pagination/anchor";
import { committedPageProgressRatio } from "../pagination/progress";
import { blockGraphemeLength } from "../pagination/anchor";
import { PageFragmentView } from "../pagination/fragmentRenderer";
import type { ArticleBodyHighlight } from "../content/render/BlockRenderer";
import { ProgressHairline } from "./ProgressHairline";
import { PageIndicator } from "./PageIndicator";
import { BLOCK_SEPARATOR } from "../content/normalizeText";
// Plan 21-07 (D4-07 WebKit amendment): the chevron path reuses PageTurnControls'
// ONE focusNewPageTop implementation (the Plan 04-09 isFormField export
// precedent — never forked). PageTurnControls imports only the TYPE
// PaginatedSurfaceHandle from this module (erased at compile time), so this
// reverse RUNTIME import creates no runtime cycle.
import { focusNewPageTop } from "./PageTurnControls";
// Phase 5 Plan 05-04 (D5-16 cross-fragment slicing): PaginatedSurface reads
// the resolved highlights from the HighlightOverlay context (the same
// provider ArticleView mounts around both the scrolling + paginated
// branches) and passes confident + ambiguous/orphan highlights down to
// PageFragmentView. PageFragmentView intersects each highlight range with
// each fragment's article-global visible range so a split-block highlight
// renders a <mark> slice on EACH containing fragment (both sharing
// data-highlight-id — no silent gaps at a page turn). useOptionalHighlight
// Overlay returns null outside the provider so legacy component tests that
// render PaginatedSurface without a provider regress nothing.
import { useOptionalHighlightOverlay } from "./annotations/HighlightOverlay";
// Issue #42: the spoken-range type — the same GraphemeRange the slicer and
// the render twins share.
import type { GraphemeRange } from "../annotations/unifiedHighlightSlicer";

export interface PaginatedSurfaceProps {
  /** Opt-in presentation only; never participates in page measurement. */
  animatePageTurns?: boolean;
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
   * change, with the committed-page anchor (the current page's first-block
   * offset, pinned to the article total on the final page of a multi-page
   * set — 260908-oht passive completion). ArticleView stores this in a ref
   * so the NEXT mode swap (paginated →scrolling) can capture it
   * synchronously before the render swap. Optional.
   */
  onAnchorChange?: (offset: number) => void;
  /**
   * Issue #10 — geometry readiness, reported UPWARD through this ONE
   * callback. The surface measures its own geometry (resize observation of
   * its .page-viewport + the article-start chrome reserve below), so the
   * parent no longer tracks page geometry at all; this callback is the
   * single signal that the surface has a usable page height and pagination
   * is about to run. Fired exactly once per mount, on the transition from
   * "no geometry" (viewport height 0) to "geometry ready" (height > 0).
   * Optional — legacy callers that pass nothing keep working unchanged.
   */
  onGeometryReady?: () => void;
  /**
   * Plan 13-04 (Option A — human decision 2026-08-18): the article-top
   * metadata spot, OWNED by ArticleView but MOUNTED by this surface. The
   * surface shows it exactly when the reader is at the article's first
   * page — including the pre-pagination window before the first commit.
   * The spot is also the surface's OWN reserve source: since Issue #10 the
   * surface measures the mounted spot's margin-box height once (at settle —
   * the surface mounts only after trustedView commits, so fonts are final)
   * and uses that ONE value for BOTH halves of the reserved-height
   * convention — the engine's page-1 budget (below) and the rendered page-1
   * fragment height below. Absent for legacy callers — the surface renders
   * identically (reserve 0).
   */
  articleStartChrome?: React.ReactNode;
  /**
   * Issue #42 — the article-global D-05 grapheme range the read-aloud voice
   * is currently inside, threaded to the mounted PageFragmentView so the
   * synthetic aria-hidden spoken-word marker renders on the visible page.
   * Null/absent → no marker. Identity changes per spoken word during
   * playback; the surface's render is otherwise stable (the pagination
   * effect reads refs, so marker churn never re-triggers pagination).
   */
  spokenRange?: GraphemeRange | null;
  /**
   * Issue #42 — fired when the reader MANUALLY turns a page (chevrons,
   * keyboard, swipe — the commitTurn paths). The read-aloud follower uses
   * this to suspend auto page-turns so it never fights the reader.
   * NOT fired by turnToPage (the programmatic path — jumps and the follower
   * itself), so follower turns stay silent here. Optional.
   */
  onUserTurn?: () => void;
}

/**
 * TOLERANCE_PX for the post-render overflow guard (Plan 04-07). Mirrors the
 * no-overflow e2e's 2px slack (sub-pixel rounding between engine measurement
 * and scrollHeight). A real fragmentation overflow is tens of pixels; this
 * tolerance keeps the guard from thrashing on sub-pixel drift.
 */
const TOLERANCE_PX = 2;

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
  turn: (direction: "next" | "previous") => { page: number; total: number; moved: boolean } | null;
  /**
   * Turn to a SPECIFIC page index (0-based). Used by D5-11 navigate-back
   * (drawer entry → target page). Bounds-checked (clamps to [0, pages.length-1]).
   * Returns the new {page (1-based), total, moved} or null when no pages mounted.
   */
  turnToPage: (pageIndex: number) => { page: number; total: number; moved: boolean } | null;
  /**
   * The article-global D-05 grapheme offset of the current page's committed
   * anchor (first-block offset; the article total on the final page of a
   * multi-page set — 260908-oht). Used by ArticleView to capture the
   * paginated→scrolling anchor BEFORE the mode-swap re-render (Pitfall 7).
   * Returns 0 when no pages are mounted.
   */
  getCurrentAnchorOffset: () => number;
  /** Current {page (1-based), total}, or null when no pages are mounted. */
  getState: () => { page: number; total: number } | null;
  /**
   * The current pages array (or null when not yet paginated). Used by D5-11
   * navigate-back to compute the target page index via
   * fragmentContainingOffset (anchor.ts — D4-10/D4-11 machinery in reverse).
   */
  getPages: () => PageFragment[] | null;
}

export const PaginatedSurface = forwardRef<PaginatedSurfaceHandle, PaginatedSurfaceProps>(
  function PaginatedSurface(
    {
      article,
      trustedView,
      articleEl,
      diagnostics,
      initialAnchorOffset = 0,
      onAnchorChange,
      onGeometryReady,
      articleStartChrome,
      animatePageTurns = false,
      spokenRange,
      onUserTurn,
    },
    ref,
  ): React.ReactElement | null {
    const [pages, setPages] = useState<PageFragment[] | null>(null);
    const [currentPageIdx, setCurrentPageIdx] = useState(0);

    // ── Issue #10 — geometry ownership ────────────────────────────────────
    // The surface measures its OWN geometry; the parent passes none.
    //   pageContentBoxHeightPx — the .page-viewport content-box height in
    //     CSS px, kept fresh by resize observation of that box (the RO's
    //     initial delivery + a synchronous first read below; .page-viewport
    //     has no padding/border, so content-box == the border-box height
    //     the parent's old getBoundingClientRect read produced — value
    //     semantics byte-identical).
    //   firstPageReservedPx — the article-start chrome's margin-box height
    //     (ceil), the ONE reserve value feeding BOTH halves of the
    //     reserved-height convention: the engine's page-1 budget (below)
    //     and the rendered page-1 fragment height (the inline style on
    //     PageFragmentView). Measured once per mount, during the
    //     pre-pagination window (pages === null) while the chrome is
    //     mounted, then FROZEN — a spot unmount/remount at a page turn
    //     must never re-trigger pagination (header-geometry e2e (c)/(d)).
    //     Settle-safety is structural: the surface mounts only when
    //     trustedView has committed, so the font gate has already passed
    //     and the spot's wrap is final at measure time.
    const [pageContentBoxHeightPx, setPageContentBoxHeightPx] = useState(0);
    const [firstPageReservedPx, setFirstPageReservedPx] = useState(0);
    const geometryReadyNotifiedRef = useRef(false);
    // Ref-mirror pattern (initialAnchorOffsetRef precedent): the readiness
    // callback is read from a ref so the geometry effect below never needs
    // the callback in its dependency array.
    const onGeometryReadyRef = useRef(onGeometryReady);
    onGeometryReadyRef.current = onGeometryReady;
    // Issue #42: same ref-mirror for the manual-turn signal — the
    // imperative handle is created once (empty deps) and would otherwise
    // capture the first render's prop.
    const onUserTurnRef = useRef(onUserTurn);
    onUserTurnRef.current = onUserTurn;

    const pendingTurnMotion = useRef(false);

    // Fade the already-committed semantic tree; no duplicate prose, layout
    // transforms, delayed focus, or animation on restoration/repagination.
    useLayoutEffect(() => {
      const requested = pendingTurnMotion.current;
      pendingTurnMotion.current = false;
      if (!requested || !animatePageTurns) return;
      const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
      const fragment = articleEl.querySelector<HTMLElement>(".page-fragment");
      if (motion.matches || !fragment?.animate) return;
      const animation = fragment.animate([{ opacity: 0.45 }, { opacity: 1 }], {
        duration: 180,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      });
      const cancel = () => animation.cancel();
      motion.addEventListener("change", cancel);
      return () => {
        cancel();
        motion.removeEventListener("change", cancel);
      };
    }, [currentPageIdx, pages, articleEl, animatePageTurns]);

    // Phase 5 Plan 05-04 (D5-16 cross-fragment slicing): read the resolved
    // highlights from the HighlightOverlay context (mounted by ArticleView
    // around both the scrolling + paginated branches) so PageFragmentView
    // can intersect each highlight range with the current page fragment's
    // article-global visible range. Confident + ambiguous/orphan highlights
    // are BOTH threaded (ambiguous/orphan render at their best-effort
    // vicinity via the BlockRenderer/InlineRenderer status-driven modifier
    // — D5-04). Returns null outside the provider so legacy component tests
    // that render PaginatedSurface without a provider regress nothing.
    const overlayCtx = useOptionalHighlightOverlay();
    const fragmentHighlights: ArticleBodyHighlight[] | undefined = overlayCtx
      ? overlayCtx.highlights
          .filter((h) => h.resolvedPosition !== null)
          .map((h) => ({
            id: h.record.id,
            position: h.resolvedPosition!,
            hasNote: h.note !== null && h.note.text.length > 0,
            status: h.status,
          }))
      : undefined;

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
    // Plan 04-09 (PAGE-01 round-trip fix): the last anchor offset used by the
    // pagination effect or commitTurn. The post-render overflow guard (Plan
    // 04-07) reads this ref to re-anchor refragmented pages to the SAME
    // passage the pagination effect targeted — NOT just the current page's
    // start offset. Without this, the raw engine output (pre-overflow-guard)
    // may place a mid-block anchor on the wrong page (e.g. 3 large pages
    // where anchor 1284 falls in page 0's [0,1403) range); the guard then
    // splits page 0 but re-anchors to page 0's start (0) instead of the
    // original anchor (1284). The shared ref ensures the guard preserves the
    // precise anchor through refragmentation.
    const lastAnchorOffsetRef = useRef<number>(initialAnchorOffset);

    // Geometry ownership (Issue #10): resize observation of the surface's
    // viewport + top chrome. DOM contract: the surface renders inside a
    // .page-viewport within the shared articleEl (ArticleView's paginated
    // branch) — the same box the parent's old geometry effect queried.
    //
    // The chrome reserve is measured in this effect's synchronous first run:
    // the chrome mounts in the SAME commit (the pre-pagination early return
    // renders articleStartChrome), effects run after that commit, and
    // getBoundingClientRect forces layout — so the spot is laid out and its
    // margin-box is readable immediately. getComputedStyle margins are read
    // exactly as the parent's old measure did (marginTop + marginBottom,
    // ceiled). A reserve of 0 (no chrome — legacy callers, or jsdom's zero
    // layout) is skipped, keeping the default 0.
    //
    // After the synchronous first read, the ResizeObserver keeps BOTH boxes
    // under observation — the viewport (the repagination driver: height
    // changes flow through the pagination effect's dependency) and the
    // article-start chrome (a chrome-only resize — e.g. the epub
    // book-context line resolving after mount — re-wraps the spot without
    // moving the viewport, and the freeze-gated measure below picks it up
    // before the first publication). Once pages has committed the measure
    // no-ops, so a spot unmount (page 2+) or remount (back to page 1) can
    // never re-trigger pagination; a detached-chrome zero box is dropped by
    // the reserve > 0 gate.
    //
    // Readiness (the ONE upward report): publishHeight fires onGeometryReady
    // exactly once per mount when the height first exceeds 0.
    useEffect(() => {
      // The surface is .page-viewport's child — React mounts the parent box
      // before this child's effects run, so the query below cannot miss
      // while the surface is mounted; the early return only guards legacy
      // callers that render the surface outside the paginated branch DOM
      // contract.
      const pageViewport = articleEl.querySelector<HTMLElement>(".page-viewport");
      if (!pageViewport) return;
      const publishHeight = (heightPx: number) => {
        setPageContentBoxHeightPx(heightPx);
        if (heightPx > 0 && !geometryReadyNotifiedRef.current) {
          geometryReadyNotifiedRef.current = true;
          onGeometryReadyRef.current?.();
        }
      };
      const measureChromeReserve = () => {
        if (pagesRef.current !== null) return; // frozen after first publication
        const spot = articleEl.querySelector<HTMLElement>(".article-top-meta");
        if (!spot) return;
        const rect = spot.getBoundingClientRect();
        const style = window.getComputedStyle(spot);
        const reserve = Math.ceil(
          rect.height + (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0),
        );
        if (reserve > 0) setFirstPageReservedPx(reserve);
      };

      // Synchronous first read — the box is already laid out at effect time;
      // no reason to wait a frame for the RO's initial delivery (which would
      // cost the pre-pagination window an extra commit).
      publishHeight(pageViewport.getBoundingClientRect().height);
      measureChromeReserve();

      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.target === pageViewport) {
            publishHeight(entry.contentRect.height);
          }
        }
        measureChromeReserve();
      });
      observer.observe(pageViewport);
      const chromeAtMount = articleEl.querySelector<HTMLElement>(".article-top-meta");
      if (chromeAtMount) observer.observe(chromeAtMount);
      return () => observer.disconnect();
    }, [articleEl]);

    // Cancelled-flag pagination effect (mirrors ArticleView L107-129 pattern):
    // a stale pagination pass (e.g. after a rapid article swap or viewport
    // change) cannot overwrite a newer one. AbortController + the engine's
    // internal AbortError handling guarantee silent cancel.
    //
    // D4-11 repagination anchor (PAGE-05): capture the current view's
    // article-global offset (pageAnchorOffset on the OLD pages) BEFORE
    // setPages, then re-anchor currentPageIdx via fragmentContainingOffset
    // on the NEW pages. On the FIRST pass (pages null), the anchor is the
    // D4-10 initialAnchorOffset prop (scrolling→paginated mode switch).
    useEffect(() => {
      // Wait for geometry — the engine needs a non-zero page height to produce
      // pages. The surface's OWN geometry effect (Issue #10) sets this from
      // its resize observation; on the very first render it's 0.
      if (pageContentBoxHeightPx <= 0) return;
      const currentArticle = articleRef.current;
      const currentPages = pagesRef.current;
      const currentIdx = currentPageIdxRef.current;

      // Capture the anchor BEFORE setPages (Pitfall 7 — capture-before-swap).
      // On repagination (pages exists) preserve the current page's passage;
      // on first mount use the D4-10 initialAnchorOffset.
      let anchorOffset: number;
      if (currentPages && currentPages[currentIdx]) {
        anchorOffset = pageAnchorOffset(currentArticle, currentPages, currentIdx);
      } else {
        anchorOffset = initialAnchorOffsetRef.current;
      }
      // Plan 04-09: only update lastAnchorOffsetRef on the FIRST pass (when
      // currentPages was null). On repagination passes (currentPages non-null),
      // the ref already holds the correct anchor from the initial pass or from
      // commitTurn — overwriting it with the current page's start offset would
      // cause the overflow guard to re-anchor to page 0 after splitting.
      if (!currentPages) {
        lastAnchorOffsetRef.current = anchorOffset;
      }

      const controller = new AbortController();
      let cancelled = false;
      try {
        // Plan 04-06: paginateDocument consumes pre-captured line boxes via
        // measurement.blocks[i].lineBoxes — no articleEl argument. The
        // engine no longer queries live DOM (PaginatedSurface's articleEl
        // contains the single mounted page fragment at this point, not the
        // full ArticleBody the engine would need).
        // Plan 13-04 (Option A): firstPageReservedPx reduces page 1's
        // content budget so the metadata spot and page-1 content fit the
        // viewport together — no post-publication correction, keeping the
        // first-publication==settled contract (page-turn-stability).
        const result = paginateDocument({
          article: currentArticle,
          measurement: trustedView,
          pageContentBoxHeightPx,
          firstPageReservedPx,
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
        const publishDev = (status: "ok" | "fallback", pgs: PageFragment[] | null, idx: number) => {
          if (!import.meta.env.DEV) return;
          // Per-block grapheme lengths in the ENGINE's coordinate system
          // (Plan 04-06 Task 3). Spike 0007 F2 reconciliation: the engine now
          // consumes blockNormalizedText — the D-05 substrate itself — so the
          // engine coordinate IS the D-05 coordinate and blockGraphemeLength
          // is the exact length (graphemeClusters(blockNormalizedText(block),
          // lang).length). Using the engine's coordinate here makes the
          // coverage e2e's `[0, blockLen)` assertion agree with the
          // endGrapheme values the engine emits.
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
          const nextIdx = fragmentContainingOffset(result.pages, anchorOffset, currentArticle);
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
    }, [article, trustedView, articleEl, pageContentBoxHeightPx, firstPageReservedPx, diagnostics]);

    // Post-render overflow guard (Plan 04-07 — PAGE-03b fix). After every page
    // commit AND every turn, inspect the mounted .page-fragment's live child
    // and text-line geometry against its .page-viewport. If it crosses the
    // boundary, call refragmentOverflowingPage (the pure module from Task 1)
    // to produce a corrected PageFragment[] and setPages(corrected). The
    // pre-capture pagination effect above stays as the FIRST pass; this is the
    // SECOND (post-render correction) pass that STACK.md mandates ("per-kind
    // measurement + a post-render overflow guard" per AGENTS.md §Stack Patterns
    // by Variant).
    //
    // Why this guard exists: Plan 04-06's pre-captured LineBox[][] approach
    // measures line boxes against the full ArticleBody in SCROLLING geometry.
    // Those heights do not predict rendered page-fragment heights inside
    // .paginated-surface (paginated geometry, overflow:hidden). Pages overflow
    // their content-box by 4–82px → silent clipping. The guard reads LIVE DOM
    // truth and corrects overflows against the actual rendered heights.
    //
    // Iteration: each setPages triggers a re-fire (deps include `pages`); on
    // the next pass the corrected page is measured again. If it still
    // overflows (the new next page also overflowed, or a sibling block needs
    // to move further down), the guard refragments again. Each iteration adds
    // exactly one page and strictly reduces the overflowing page's source
    // range, so termination is provable; PAGE_CEILING (300) bounds the loop.
    //
    // Anchor discipline (Pitfall 7 — capture-before-swap): capture the current
    // page's article-global offset BEFORE setPages; re-anchor via
    // fragmentContainingOffset on the corrected pages. The reader stays at
    // the same passage through the refragmentation.
    useEffect(() => {
      // Geometry not ready or no pages mounted — nothing to guard.
      if (pageContentBoxHeightPx <= 0) return;
      const currentPages = pagesRef.current;
      const currentIdx = currentPageIdxRef.current;
      if (!currentPages || currentPages.length === 0) return;
      if (currentIdx < 0 || currentIdx >= currentPages.length) return;
      const currentPage = currentPages[currentIdx];
      if (!currentPage) return;

      const currentArticle = articleRef.current;
      let cancelled = false;
      const controller = new AbortController();

      // rAF-deferred: the browser must finish layout for the just-committed
      // page fragment before we can trust its live child geometry. React commits
      // synchronously; layout happens in the next animation frame.
      const rafId = requestAnimationFrame(() => {
        if (cancelled || controller.signal.aborted) return;

        const fragmentEl = articleEl.querySelector(".page-fragment") as HTMLElement | null;
        if (!fragmentEl) return;

        const pageViewportEl = fragmentEl.parentElement as HTMLElement | null;
        const pageViewportHeight = pageViewportEl?.clientHeight ?? pageContentBoxHeightPx;

        // Capture the anchor BEFORE setPages (Pitfall 7).
        // Plan 04-09: use lastAnchorOffsetRef (the SAME anchor the pagination
        // effect or commitTurn targeted) instead of the current page's start
        // offset. This ensures the overflow guard preserves the precise
        // reading position through refragmentation — critical when the raw
        // engine output places a mid-block anchor on the wrong page (the guard
        // splits the overflowing page and re-anchors to the original target).
        const anchorOffset = lastAnchorOffsetRef.current;

        const result = refragmentOverflowingPage({
          article: currentArticle,
          pages: currentPages,
          overflowingPageIndex: currentIdx,
          fragmentEl,
          pageContentBoxHeightPx: pageViewportHeight,
          tolerance: TOLERANCE_PX,
          diagnostics,
          signal: controller.signal,
        });

        if (cancelled || controller.signal.aborted) return;
        if (result === null) return; // guard detected no overflow (race)
        if (result.length === 0) {
          // dom-fallback emitted by the guard. ArticleView's DiagnosticBus
          // subscription flips the session-mode override to scrolling + shows
          // the banner (the existing PAGE-04/PAGE-09 fallback path). Leave
          // pages state as-is; PaginatedSurface stays mounted briefly until
          // ArticleView unmounts it on the mode flip.
          return;
        }

        // Corrected pages: commit + re-anchor to the same passage.
        const nextIdx = fragmentContainingOffset(result, anchorOffset, currentArticle);
        setPages(result);
        setCurrentPageIdx(nextIdx);

        // Update the DEV-only window.__lemPagination helper so the no-overflow
        // e2e sees the corrected pagesLength + currentPageIdx between turns
        // (T-04-16: gated behind import.meta.env.DEV; production unaffected).
        if (import.meta.env.DEV) {
          const dev = (window as unknown as Record<string, unknown>).__lemPagination as
            | {
                pages: PageFragment[] | null;
                currentPageIdx: number;
                status: string;
                pagesLength: number;
              }
            | undefined;
          if (dev) {
            dev.pages = result;
            dev.currentPageIdx = nextIdx;
            dev.pagesLength = result.length;
          }
        }
      });

      return () => {
        cancelled = true;
        controller.abort();
        cancelAnimationFrame(rafId);
      };
    }, [pages, currentPageIdx, pageContentBoxHeightPx, article, articleEl, diagnostics]);

    // Report the current anchor offset whenever the page changes so the
    // parent can capture it synchronously before a future mode swap.
    //
    // Plan 04-09 (PAGE-01 round-trip fix): when pages is null (initial mount
    // before the pagination effect commits, or fallback), do NOT call
    // onAnchorChange. The parent's currentAnchorOffsetRef carries the
    // scrolling→paginated anchor (initialAnchorOffset); overwriting it to 0
    // here would cause PaginatedSurface's re-render (triggered by the geometry
    // effect setting pageContentBoxHeightPx) to receive initialAnchorOffset=0,
    // landing on page 0 instead of the passage's page.
    useEffect(() => {
      const p = pagesRef.current;
      if (!p || !p[currentPageIdx]) {
        return;
      }
      onAnchorChange?.(pageAnchorOffset(articleRef.current, p, currentPageIdx));
    }, [currentPageIdx, pages, onAnchorChange]);

    // DEV-only: keep window.__lemPagination.currentPageIdx fresh on every
    // turn so the Plan 04-05 page-turn e2e can assert the new page without
    // poking the imperative handle. pages/status are published in the
    // pagination effect above; this only refreshes the live index. Gated
    // behind import.meta.env.DEV (T-04-16).
    if (import.meta.env.DEV) {
      const dev = (window as unknown as Record<string, unknown>).__lemPagination as
        | {
            pages: PageFragment[] | null;
            currentPageIdx: number;
            status: string;
            pagesLength: number;
          }
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
     *
     * Plan 04-09 (PAGE-02 keyboard bundle fix): update currentPageIdxRef.current
     * SYNCHRONOUSLY before setCurrentPageIdx. Without this, rapid key presses
     * (e.g. ArrowRight then Space) race React's commit cycle — the ref still
     * holds the OLD value when the second key fires, so commitTurn reads the
     * stale ref and computes next === cur (a no-op). The synchronous ref
     * update makes the imperative turn path the source of truth; setState
     * triggers the re-render. Also updates lastAnchorOffsetRef so the overflow
     * guard re-anchors to the new page if it refragments.
     */
    function commitTurn(
      direction: "next" | "previous",
    ): { page: number; total: number; moved: boolean } | null {
      const p = pagesRef.current;
      if (!p || p.length === 0) return null;
      const cur = currentPageIdxRef.current;
      const next = direction === "next" ? Math.min(cur + 1, p.length - 1) : Math.max(0, cur - 1);
      const moved = next !== cur;
      if (moved) {
        pendingTurnMotion.current = true;
        currentPageIdxRef.current = next;
        lastAnchorOffsetRef.current = pageAnchorOffset(articleRef.current, p, next);
        setCurrentPageIdx(next);
        // Issue #42: this is a MANUAL turn (chevrons/keyboard/swipe — the
        // only commitTurn callers); the read-aloud follower suspends so it
        // never fights the reader. The programmatic turnToPage path stays
        // silent here by construction.
        onUserTurnRef.current?.();
      }
      return { page: next + 1, total: p.length, moved };
    }

    /**
     * Plan 21-07 (D4-07 WebKit amendment): the chevron buttons' shared click
     * path. WebKit/Safari does NOT focus an activated button — after a click,
     * document.activeElement is body (probe-verified 2026-09-02, see
     * .planning/debug/vo-safari-image-page-focus.md) — so the D4-07
     * "focus stays on the control" premise failed there and the button turn
     * silently skipped the boundary handoff entirely. This wrapper commits
     * the turn, then (rAF-deferred, the same discipline as the keyboard path
     * — the new page fragment must commit first) falls back to the SAME
     * "Page N begins" boundary-heading handoff whenever the engine did NOT
     * keep focus on a control (the exact .page-turn/.mode-toggle/.gear-button
     * set isFocusInContent classifies) — precisely the top-of-page reset
     * VoiceOver users expect off an image-only page. Where the engine DID
     * keep focus on the button (chromium/firefox click, Tab+Enter
     * everywhere), the guard matches and nothing changes.
     */
    function handleChevronTurn(direction: "next" | "previous"): void {
      const result = commitTurn(direction);
      if (!result || !result.moved) return;
      requestAnimationFrame(() => {
        const active = document.activeElement;
        const onControl =
          active instanceof Element &&
          active.closest(".page-turn,.mode-toggle,.gear-button") !== null;
        if (!onControl) focusNewPageTop(articleEl);
      });
    }

    /**
     * Turn to a specific page index (D5-11 navigate-back). Shares the same
     * ref-update + re-anchor discipline as commitTurn so the overflow guard
     * + onAnchorChange stay in lockstep. Bounds-checked (clamps to valid range).
     */
    function turnToPage(targetIdx: number): { page: number; total: number; moved: boolean } | null {
      const p = pagesRef.current;
      if (!p || p.length === 0) return null;
      const cur = currentPageIdxRef.current;
      const next = Math.max(0, Math.min(targetIdx, p.length - 1));
      const moved = next !== cur;
      if (moved) {
        pendingTurnMotion.current = true;
        currentPageIdxRef.current = next;
        lastAnchorOffsetRef.current = pageAnchorOffset(articleRef.current, p, next);
        setCurrentPageIdx(next);
      }
      return { page: next + 1, total: p.length, moved };
    }

    // Imperative handle — ADDITIVE (existing no-ref callers are unaffected).
    useImperativeHandle(
      ref,
      (): PaginatedSurfaceHandle => ({
        turn: (direction) => commitTurn(direction),
        turnToPage: (pageIndex) => turnToPage(pageIndex),
        getCurrentAnchorOffset: () => {
          const p = pagesRef.current;
          const idx = currentPageIdxRef.current;
          if (!p || !p[idx]) return 0;
          return pageAnchorOffset(articleRef.current, p, idx);
        },
        getState: () => {
          const p = pagesRef.current;
          if (!p || p.length === 0) return null;
          return { page: currentPageIdxRef.current + 1, total: p.length };
        },
        getPages: () => pagesRef.current,
      }),
      [],
    );

    // POLISH-02 (Phase 13 Plan 02): the hairline's progress is the offset-
    // anchored D-05 ratio of the committed page, memoized per
    // (article, pages, currentPageIdx) the way LibraryRow memoizes its
    // grapheme total — committedPageProgressRatio runs once per committed
    // page, not per render. First page of any article (including a
    // one-page article) reads 0; the final page of a multi-page set reads
    // exactly 1 (the 260908-oht completion pin).
    const progressRatio = useMemo(() => {
      const p = pages;
      if (!p || !p[currentPageIdx]) return 0;
      return committedPageProgressRatio(article, p, currentPageIdx);
    }, [article, pages, currentPageIdx]);

    // Until the first pagination pass commits (or when status is "fallback"),
    // render only the article-start chrome (Plan 13-04 Option A). The spot
    // stays laid out during this window so the surface's OWN settle-time
    // measurement (the geometry effect above) can size the reserve BEFORE
    // the first paginateDocument call — the first publication then already
    // carries the correct page-1 budget (first-publication==settled,
    // page-turn-stability). Without chrome (legacy callers) this is
    // byte-identical to the old null return.
    if (!pages || pages.length === 0) {
      return articleStartChrome !== undefined ? <>{articleStartChrome}</> : null;
    }

    const isFirst = currentPageIdx === 0;
    const isLast = currentPageIdx === pages.length - 1;

    return (
      <>
        {/*
          Plan 13-04 (Option A / D13-13): the article-top metadata spot —
          mounted as .page-viewport's first flow child ONLY on the article's
          first page, in the SAME render that shows page 1 (single owner of
          the decision). It never enters the pagination block stream: the
          engine's firstPageReservedPx budget (the surface's OWN measured
          reserve — Issue #10) is its sanctioned seat, and the post-render
          overflow guard — measuring live child rects against the same
          viewport — remains the documented net for stale-reserve edge
          cases. The .page-viewport box is grid-determined, so
          mounting/unmounting the spot never changes its height (no
          ResizeObserver re-measure loop).
        */}
        {isFirst && articleStartChrome !== undefined ? articleStartChrome : null}
        {/*
          ProgressHairline receives the offset-anchored progress ratio
          (POLISH-02); PageIndicator is the sibling decorative N-of-M span.
          The SectionAnnouncer live region in ArticleView conveys structural
          progress to AT; both elements here are aria-hidden.
        */}
        <ProgressHairline progress={progressRatio} placement="viewport" />
        <PageIndicator current={currentPageIdx + 1} total={pages.length} />

        <h2
          key={`page-start-${currentPageIdx}`}
          className="visually-hidden page-start-heading"
          tabIndex={-1}
        >
          Page {currentPageIdx + 1} begins
        </h2>

        <PageFragmentView
          fragment={pages[currentPageIdx]!}
          pageIndex={currentPageIdx}
          article={article}
          lang={article.lang}
          highlights={fragmentHighlights}
          spokenRange={spokenRange}
          style={
            isFirst && firstPageReservedPx > 0
              ? { height: `calc(100% - ${firstPageReservedPx}px)` }
              : undefined
          }
        />

        <button
          type="button"
          className="page-turn page-turn-previous"
          aria-label="Previous page"
          aria-disabled={isFirst}
          onClick={() => handleChevronTurn("previous")}
        >
          <ChevronLeftIcon aria-hidden="true" />
        </button>
        <button
          type="button"
          className="page-turn page-turn-next"
          aria-label="Next page"
          aria-disabled={isLast}
          onClick={() => handleChevronTurn("next")}
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
