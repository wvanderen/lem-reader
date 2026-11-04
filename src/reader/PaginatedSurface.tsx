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
  useCallback,
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
import type { PageFragment, SourceCursor } from "../pagination/types";
import type { BlockWindow } from "../pagination/blockWindow";
import { paginateDocument } from "../pagination/fragment";
import { refragmentOverflowingPage } from "../pagination/overflowGuard";
import { fragmentContainingOffset, pageAnchorOffset } from "../pagination/anchor";
import { isWorkStart, windowScopeKey } from "../pagination/blockWindow";
import { committedPageProgressRatio } from "../pagination/progress";
import { PageFragmentView } from "../pagination/fragmentRenderer";
import type { ArticleBodyHighlight } from "../content/render/BlockRenderer";
import { ProgressHairline } from "./ProgressHairline";
import { PageIndicator } from "./PageIndicator";
import { articleGraphemeIndex, BLOCK_SEPARATOR } from "../content/normalizeText";
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
// Issue #177 — the ONE has-note predicate (whitespace-only = no note).
import { hasNoteContent } from "../annotations/noteText";
// Issue #196 — the active-theme tint derivation for the paginated twin's
// mapping (the same seam + conditional spelling the scrolling twin maps with).
import { customSnapshotFields } from "../settings/highlightTint";
import { ChevronLeftIcon, ChevronRightIcon } from "../ui/icons";
import { acknowledgePaginationTurn, paginationTurnReceipt } from "./paginationTurnReceipt";
// Issue #255 — the opt-in DEV/test event trail: identity + ordering evidence
// for turn receipt, publication/scope changes, anchor movement, and overflow
// correction. No-op unless the reader enabled it (query/localStorage flag).
import {
  recordTrailEvent,
  startPaginationTrail,
  type PaginationTrailCause,
} from "./paginationTrail";

export type AnchorChangeCause = "navigation" | "layout";

// Issue #254 — DEV-only publication sequence. Module-level so every
// publication of every mounted surface advances ONE monotonic counter: a
// test that reads `publicationSeq` before triggering a turn can demand a
// strictly-greater value after (the turn/publication acknowledgment —
// tests/e2e/pagination/_harness.ts waitForTurnAcknowledged). DEV-only by
// construction: publishDev never runs in a production build.
let devPublicationSeq = 0;

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
   * D4-10/D4-11 page-anchor reporting (pinned to the article total on the
   * final page of a multi-page set). Navigation reports synchronously with
   * its ref update; replacement layout reports after DOM commit. The host
   * can distinguish deliberate navigation from reflow, which must not undo
   * a newer canonical completion. Optional.
   */
  onAnchorChange?: (offset: number, cause: AnchorChangeCause) => void;
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
  /** Window boundaries are not work boundaries; the host loads their neighbors. */
  hasPreviousWindow?: boolean;
  hasNextWindow?: boolean;
  onBoundaryTurn?: (direction: "next" | "previous") => void;
  onPageSettled?: () => void;
  /** Refine this measured source window at the first omitted capacity cursor. */
  onCapacity?: (scope: BlockWindow, continuation: SourceCursor) => void;
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
export interface PageState {
  page: number;
  total: number;
  atStart?: boolean;
  atEnd?: boolean;
  scopeLabel?: string;
  windowStart?: number;
}
export type PageTurnResult = PageState & { moved: boolean };

export interface PaginatedSurfaceHandle {
  /** Hosts with asynchronous window loading resolve only after a usable page commits. */
  turnAsync?: (direction: "next" | "previous") => Promise<PageTurnResult | null>;
  goToOffset?: (offset: number, onSettled?: () => void) => void;
  containsOffset?: (offset: number) => boolean;
  /**
   * Turn the page. Bounds-checked (no wrap at first/last page). Returns the
   * new {page (1-based), total, moved} so the caller can announce + apply
   * D4-07 focus restoration, or null when no pages are mounted.
   */
  turn: (direction: "next" | "previous") => PageTurnResult | null;
  /**
   * Turn to a SPECIFIC page index (0-based). Used by D5-11 navigate-back
   * (drawer entry → target page). Bounds-checked (clamps to [0, pages.length-1]).
   * Returns the new {page (1-based), total, moved} or null when no pages mounted.
   *
   * `anchorOffset` (issue #233) pins the OVERFLOW-CORRECTION anchor to the
   * caller's PRECISE passage offset: a jump/restore that resolved to this
   * page must survive the post-render guard's refragmentations without
   * drifting to the page's head (a late-passage restore into a not-yet-
   * corrected window would otherwise walk back to the page start).
   */
  turnToPage: (pageIndex: number, anchorOffset?: number) => PageTurnResult | null;
  /**
   * The article-global D-05 grapheme offset of the current page's committed
   * anchor (first-block offset; the article total on the final page of a
   * multi-page set — 260908-oht). Used by ArticleView to capture the
   * paginated→scrolling anchor BEFORE the mode-swap re-render (Pitfall 7).
   * Returns 0 when no pages are mounted.
   */
  getCurrentAnchorOffset: () => number;
  /** Current {page (1-based), total}, or null when no pages are mounted. */
  getState: () => PageState | null;
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
      hasPreviousWindow = false,
      hasNextWindow = false,
      onBoundaryTurn,
      onPageSettled,
      onCapacity,
    },
    ref,
  ): React.ReactElement | null {
    const [pages, setPages] = useState<PageFragment[] | null>(null);
    const [currentPageIdx, setCurrentPageIdx] = useState(0);
    // Issue #233: the key carries the scope's intra-block slice bounds (the
    // ONE windowScopeKey definition in blockWindow.ts) so two continuation
    // windows of the SAME block are distinct scopes — a stale same-key match
    // would re-anchor from the PREVIOUS window's pages instead of the
    // pending jump's offset.
    const scopeKey = windowScopeKey(trustedView.scope);
    const pagesScopeRef = useRef<string | null>(null);
    const boundaryRef = useRef({ hasPreviousWindow, hasNextWindow, onBoundaryTurn });
    boundaryRef.current = { hasPreviousWindow, hasNextWindow, onBoundaryTurn };

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
    const onAnchorChangeRef = useRef(onAnchorChange);
    onAnchorChangeRef.current = onAnchorChange;
    const navigationReportRef = useRef<{ pages: PageFragment[]; index: number } | null>(null);
    const onPageSettledRef = useRef(onPageSettled);
    onPageSettledRef.current = onPageSettled;
    const onCapacityRef = useRef(onCapacity);
    onCapacityRef.current = onCapacity;

    const pendingTurnMotion = useRef(false);
    const pendingManualTurn = useRef<"next" | "previous" | null>(null);

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
            // Issue #177 — the has-note modifier rides the ONE shared
            // predicate (whitespace-only rows render as no-note).
            hasNote: hasNoteContent(h.note?.text ?? ""),
            status: h.status,
            // Issue #118 — the hydrated record's color is typed non-optional
            // (the schema's `.default("default")` parse output).
            color: h.record.color,
            // Issue #196 — the custom snapshot + its tint, derived against
            // the SAME context bases the scrolling twin uses (one derivation,
            // one conditional spelling, one anatomy in both reading modes).
            ...customSnapshotFields(h.record.customColor, overlayCtx.bases),
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
    // Issue #255 — why the NEXT publication committed. Set at every commit
    // site (turn, programmatic jump, repagination, scope change, overflow
    // correction, fallback) and consumed by publishDev when the publication
    // mirror effect fires. "unknown" is exposed as-is when a path fails to
    // declare one — never silently guessed.
    const lastPublicationCauseRef = useRef<PaginationTrailCause>("initial");
    // Source swaps and overflow corrections must publish both ref mirrors
    // synchronously. Otherwise an imperative turn before React's next commit
    // can pair old pages with a new index (or a new prefix with an old index).
    const commitPages = useCallback(
      (nextPages: PageFragment[] | null, nextIdx: number, cause: PaginationTrailCause) => {
        pagesRef.current = nextPages;
        currentPageIdxRef.current = nextIdx;
        lastPublicationCauseRef.current = cause;
        setPages(nextPages);
        setCurrentPageIdx(nextIdx);
      },
      [],
    );
    const devPublication = useRef<{
      status: "ok" | "fallback";
      reason?: string;
      scope?: MeasurementResult["scope"];
    } | null>(null);
    const publishDev = useCallback(
      (
        publication: NonNullable<typeof devPublication.current>,
        committedPages: PageFragment[] | null,
        committedIndex: number,
        cause: PaginationTrailCause,
      ) => {
        if (!import.meta.env.DEV) return;
        const blockLens = articleGraphemeIndex(articleRef.current).perBlockLengths;
        const receipt = paginationTurnReceipt(articleRef.current);
        const seq = ++devPublicationSeq;
        const anchorOffset = committedPages
          ? pageAnchorOffset(articleRef.current, committedPages, committedIndex)
          : null;
        (window as unknown as Record<string, unknown>).__lemPagination = {
          ...publication,
          articleId: articleRef.current.id,
          ...receipt,
          pages: committedPages,
          currentPageIdx: committedIndex,
          pagesLength: committedPages?.length ?? 0,
          blockGraphemeLengths: blockLens,
          articleGraphemeLength:
            blockLens.reduce((acc, n) => acc + n, 0) +
            Math.max(0, blockLens.length - 1) * BLOCK_SEPARATOR.length,
          overflowSettled: false,
          // Issue #254 — the turn/publication acknowledgment substrate. Every
          // commit (initial pass, a turn, an overflow correction, a
          // repagination) publishes a NEW dev object with the next sequence
          // number, so a test can demand "a publication AFTER this read"
          // instead of trusting stale settled state or an unchanged page
          // index. anchorOffset is the reader's canonical passage in the
          // original article-global D-05 coordinate (pageAnchorOffset's
          // end-pin rule included) — movement/preservation assertions anchor
          // on it, independent of the mutable page numbers.
          publicationSeq: seq,
          // null when no pages committed (fallback) — 0 would collide with
          // a genuine offset-0 publication.
          anchorOffset,
        };
        // Issue #255 — the opt-in event trail's publication record: enough
        // identity + ordering to distinguish a turn, a scope change, a
        // reflow, and a fallback from the trail alone.
        recordTrailEvent({
          kind: "publication",
          articleId: articleRef.current.id,
          cause,
          status: publication.status,
          reason: publication.reason,
          publicationSeq: seq,
          turnSeq: receipt.turnSeq,
          turnDirection: receipt.turnDirection ?? undefined,
          pagesLength: committedPages?.length ?? 0,
          pageIndex: committedIndex,
          anchorOffset,
          scopeStartBlock: publication.scope?.startBlock,
          scopeEndBlock: publication.scope?.endBlock,
        });
      },
      [],
    );
    // Successful readiness describes the matching committed semantic tree,
    // never a new engine result paired with the previous DOM. Fallback is
    // terminal and is published directly below: it may unmount this surface
    // without another commit (or leave its initial null page state unchanged).
    useLayoutEffect(() => {
      const publication = devPublication.current;
      if (publication)
        publishDev(publication, pages, currentPageIdx, lastPublicationCauseRef.current);
    }, [pages, currentPageIdx, publishDev]);
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

    // Issue #255 — begin the opt-in DEV/test event trail on mount. Cheap and
    // unconditional: it records nothing unless the reader enabled the flag.
    useEffect(() => {
      startPaginationTrail();
    }, []);

    // Cancelled-flag pagination effect (mirrors ArticleView L107-129 pattern):
    // a stale pagination pass (e.g. after a rapid article swap or viewport
    // change) cannot overwrite a newer one. AbortController + the engine's
    // internal AbortError handling guarantee silent cancel.
    //
    // D4-11 repagination anchor (PAGE-05): preserve the precise passage
    // chosen by the latest turn/jump across ALL replacement passes. A font
    // change and resize can arrive separately; using each intermediate page
    // head would cumulatively drift backwards. First/source-swap passes use
    // the D4-10 initialAnchorOffset (scrolling→paginated mode switch).
    useEffect(() => {
      // Wait for geometry — the engine needs a non-zero page height to produce
      // pages. The surface's OWN geometry effect (Issue #10) sets this from
      // its resize observation; on the very first render it's 0.
      if (pageContentBoxHeightPx <= 0) return;
      const currentArticle = articleRef.current;
      const currentPages = pagesRef.current;
      const currentIdx = currentPageIdxRef.current;

      // Capture BEFORE setPages (Pitfall 7). commitTurn/turnToPage update
      // this intent anchor, while interim page-head reports deliberately do not.
      const changingScope = pagesScopeRef.current !== scopeKey;
      const anchorOffset =
        !changingScope && currentPages && currentPages[currentIdx]
          ? lastAnchorOffsetRef.current
          : initialAnchorOffsetRef.current;
      // Plan 04-09: only update lastAnchorOffsetRef on the FIRST pass (when
      // currentPages was null). On repagination passes (currentPages non-null),
      // the ref already holds the correct anchor from the initial pass or from
      // commitTurn — overwriting it with the current page's start offset would
      // cause the overflow guard to re-anchor to page 0 after splitting.
      if (!currentPages || changingScope) {
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
          firstPageReservedPx: isWorkStart(trustedView.scope) ? firstPageReservedPx : 0,
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
        devPublication.current = {
          status: result.status,
          reason: result.reason,
          scope: trustedView.scope,
        };
        if (result.status === "ok" && result.pages.length > 0) {
          const nextIdx = fragmentContainingOffset(result.pages, anchorOffset, currentArticle);
          pagesScopeRef.current = scopeKey;
          commitPages(
            result.pages,
            nextIdx,
            !currentPages
              ? "initial"
              : changingScope
                ? "scope-change"
                : "repagination",
          );
          if (result.continuation && trustedView.scope) {
            onCapacityRef.current?.(trustedView.scope, result.continuation);
          }
        } else {
          // PAGE-04 fallback — Plan 04-05 wires the banner + session-mode flip
          // in ArticleView via the DiagnosticBus subscription (the engine
          // already emitted dom-fallback). Render nothing here; the shared
          // <article> header stays visible so the surface isn't blank chrome.
          publishDev(devPublication.current, null, 0, "fallback");
          commitPages(null, 0, "fallback");
        }
      } catch (e) {
        // AbortError is the silent-cancel path (rapid article swap or viewport
        // change). Any other error is unexpected — leave pages null so the
        // parent's scrolling branch is the natural fallback (Plan 04-05).
        if (e instanceof Error && e.name === "AbortError") return;
        commitPages(null, 0, "fallback");
      }
      return () => {
        cancelled = true;
        controller.abort();
      };
    }, [
      article,
      trustedView,
      articleEl,
      pageContentBoxHeightPx,
      firstPageReservedPx,
      diagnostics,
      scopeKey,
      commitPages,
      publishDev,
    ]);

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
      // A preceding pagination effect may already have queued another source
      // commit. This effect's DOM still belongs to its render, not those refs.
      if (pagesRef.current !== pages || currentPageIdxRef.current !== currentPageIdx) return;
      // Geometry not ready or no pages mounted — nothing to guard.
      if (pageContentBoxHeightPx <= 0) return;
      const currentPages = pagesRef.current;
      const currentIdx = currentPageIdxRef.current;
      if (!currentPages || currentPages.length === 0) return;
      if (currentIdx < 0 || currentIdx >= currentPages.length) return;
      const currentPage = currentPages[currentIdx];
      if (!currentPage) return;

      const dev = import.meta.env.DEV
        ? (
            window as unknown as {
              __lemPagination?: {
                overflowSettled: boolean;
                status: string;
                reason?: string;
                publicationSeq?: number;
              };
            }
          ).__lemPagination
        : undefined;
      if (dev) dev.overflowSettled = false;
      const currentArticle = articleRef.current;
      let cancelled = false;
      const controller = new AbortController();

      // rAF-deferred: the browser must finish layout for the just-committed
      // page fragment before we can trust its live child geometry. React commits
      // synchronously; layout happens in the next animation frame.
      const rafId = requestAnimationFrame(() => {
        if (
          cancelled ||
          controller.signal.aborted ||
          pagesRef.current !== currentPages ||
          currentPageIdxRef.current !== currentIdx
        )
          return;
        // Another pagination rAF can commit before this passive effect's
        // cleanup runs. Never pair that newer fragment's DOM with older
        // source slices (a valid reflow otherwise looks like zero progress).
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
          onCapacity:
            trustedView.scope && onCapacityRef.current
              ? (cursor) => onCapacityRef.current?.(trustedView.scope!, cursor)
              : undefined,
        });

        if (cancelled || controller.signal.aborted) return;
        if (result === null) {
          // DEV readiness records the completed geometry check, including
          // every correction pass; tests need not guess a settle duration.
          if (dev) dev.overflowSettled = true;
          // Issue #255 — the guard RAN and found no overflow: without this
          // record, an empty trail cannot distinguish "guard never ran"
          // from "guard ran and passed".
          recordTrailEvent({
            kind: "overflow-check",
            articleId: currentArticle.id,
            publicationSeq: dev?.publicationSeq,
            pageIndex: currentIdx,
            pagesLength: currentPages.length,
            note: "guard pass complete — no overflow",
          });
          if (pendingManualTurn.current) {
            acknowledgePaginationTurn(currentArticle, pendingManualTurn.current);
            pendingManualTurn.current = null;
          }
          onPageSettledRef.current?.();
          return;
        }
        if (result.length === 0) {
          if (dev) {
            const event = diagnostics.recent().at(-1);
            dev.status = "fallback";
            dev.reason = event?.kind === "dom-fallback" ? event.reason : "overflow-guard";
            dev.overflowSettled = true;
          }
          recordTrailEvent({
            kind: "fallback",
            articleId: currentArticle.id,
            cause: "fallback",
            reason: "dom-fallback",
            publicationSeq: dev?.publicationSeq,
            pageIndex: currentIdx,
            pagesLength: currentPages.length,
          });
          // dom-fallback emitted by the guard. ArticleView's DiagnosticBus
          // subscription flips the session-mode override to scrolling + shows
          // the banner (the existing PAGE-04/PAGE-09 fallback path). Leave
          // pages state as-is; PaginatedSurface stays mounted briefly until
          // ArticleView unmounts it on the mode flip.
          return;
        }

        // Corrected pages: commit + re-anchor to the same passage.
        const nextIdx = fragmentContainingOffset(result, anchorOffset, currentArticle);
        recordTrailEvent({
          kind: "overflow-correction",
          articleId: currentArticle.id,
          cause: "overflow-correction",
          publicationSeq: dev?.publicationSeq,
          pageIndex: currentIdx,
          pagesLength: currentPages.length,
          anchorOffset,
          note: `guard re-split page ${currentIdx}; committing ${result.length} pages`,
        });
        commitPages(result, nextIdx, "overflow-correction");
      });

      return () => {
        cancelled = true;
        controller.abort();
        cancelAnimationFrame(rafId);
      };
    }, [
      pages,
      currentPageIdx,
      pageContentBoxHeightPx,
      article,
      articleEl,
      diagnostics,
      trustedView,
      commitPages,
    ]);

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
      // A preceding pagination effect may have queued a replacement. Never
      // pair its new refs with this render's old page index.
      if (pagesRef.current !== pages || currentPageIdxRef.current !== currentPageIdx) return;
      const p = pagesRef.current;
      if (!p || !p[currentPageIdx]) return;
      const reported = navigationReportRef.current;
      navigationReportRef.current = null;
      // The navigation intent was already reported at its synchronous ref
      // update, before a later event (e.g. speech completion) can supersede it.
      if (reported?.pages === p && reported.index === currentPageIdx) return;
      onAnchorChangeRef.current?.(
        pageAnchorOffset(articleRef.current, p, currentPageIdx),
        "layout",
      );
    }, [currentPageIdx, pages]);

    const reportNavigation = useCallback((p: PageFragment[], index: number): void => {
      navigationReportRef.current = { pages: p, index };
      onAnchorChangeRef.current?.(pageAnchorOffset(articleRef.current, p, index), "navigation");
    }, []);

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
    const commitTurn = useCallback(
      (direction: "next" | "previous"): { page: number; total: number; moved: boolean } | null => {
        const p = pagesRef.current;
        if (!p || p.length === 0) return null;
        const cur = currentPageIdxRef.current;
        const next = direction === "next" ? Math.min(cur + 1, p.length - 1) : Math.max(0, cur - 1);
        const moved = next !== cur;
        if (
          !moved &&
          (direction === "next"
            ? boundaryRef.current.hasNextWindow
            : boundaryRef.current.hasPreviousWindow)
        ) {
          boundaryRef.current.onBoundaryTurn?.(direction);
        }
        if (moved) {
          if (import.meta.env.DEV) pendingManualTurn.current = direction;
          pendingTurnMotion.current = true;
          currentPageIdxRef.current = next;
          lastAnchorOffsetRef.current = pageAnchorOffset(articleRef.current, p, next);
          lastPublicationCauseRef.current = "turn";
          setCurrentPageIdx(next);
          // Issue #42: this is a MANUAL turn (chevrons/keyboard/swipe — the
          // only commitTurn callers); the read-aloud follower suspends so it
          // never fights the reader. The programmatic turnToPage path stays
          // silent here by construction.
          onUserTurnRef.current?.();
          reportNavigation(p, next);
        }
        return { page: next + 1, total: p.length, moved };
      },
      [reportNavigation],
    );

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
     * `anchorOffset` (issue #233) pins the guard's re-anchor to the caller's
     * precise passage offset — without it a late-window jump/restore would
     * drift to the page's head as the guard corrects the unvisited window.
     */
    const turnToPage = useCallback(
      (
        targetIdx: number,
        anchorOffset?: number,
      ): { page: number; total: number; moved: boolean } | null => {
        const p = pagesRef.current;
        if (!p || p.length === 0) return null;
        const cur = currentPageIdxRef.current;
        const next = Math.max(0, Math.min(targetIdx, p.length - 1));
        const moved = next !== cur;
        if (moved) {
          pendingTurnMotion.current = true;
          currentPageIdxRef.current = next;
          lastAnchorOffsetRef.current =
            anchorOffset ?? pageAnchorOffset(articleRef.current, p, next);
          lastPublicationCauseRef.current = "programmatic-jump";
          setCurrentPageIdx(next);
          reportNavigation(p, next);
        } else if (anchorOffset !== undefined) {
          // Same-page jump: the page start was never the target passage —
          // still pin the guard's anchor to the precise offset.
          lastAnchorOffsetRef.current = anchorOffset;
        }
        return { page: next + 1, total: p.length, moved };
      },
      [reportNavigation],
    );

    // Imperative handle — ADDITIVE (existing no-ref callers are unaffected).
    useImperativeHandle(
      ref,
      (): PaginatedSurfaceHandle => ({
        turn: (direction) => commitTurn(direction),
        turnToPage: (pageIndex, anchorOffset) => turnToPage(pageIndex, anchorOffset),
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
      [commitTurn, turnToPage],
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
      return isWorkStart(trustedView.scope) && articleStartChrome !== undefined ? (
        <>{articleStartChrome}</>
      ) : null;
    }

    const isFirst = currentPageIdx === 0 && isWorkStart(trustedView.scope);
    const isLast = currentPageIdx === pages.length - 1;
    const windowed = trustedView.scope !== undefined;

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
        <ProgressHairline progress={progressRatio} placement="viewport" stepped />
        <PageIndicator
          current={currentPageIdx + 1}
          total={pages.length}
          scopeLabel={windowed ? "in this portion" : undefined}
        />

        <h2
          key={`page-start-${scopeKey}-${currentPageIdx}`}
          className="visually-hidden page-start-heading"
          tabIndex={-1}
        >
          Page {currentPageIdx + 1}
          {windowed ? " in this portion" : ""} begins
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
          aria-disabled={currentPageIdx === 0 && !hasPreviousWindow}
          onClick={() => handleChevronTurn("previous")}
        >
          <ChevronLeftIcon />
        </button>
        <button
          type="button"
          className="page-turn page-turn-next"
          aria-label="Next page"
          aria-disabled={isLast && !hasNextWindow}
          onClick={() => handleChevronTurn("next")}
        >
          <ChevronRightIcon />
        </button>
      </>
    );
  },
);
