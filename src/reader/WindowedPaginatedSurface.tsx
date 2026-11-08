// Long-prose adapter: one canonical article, bounded measurement DOM, and
// the SAME paginator/renderer as short works. No persisted window or page IDs.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { articleGraphemeIndex } from "../content/normalizeText";
import { footnoteAnchorOffset } from "./footnoteAnchors";
import { ArticleBody } from "../content/render/BlockRenderer";
import { useMeasurement } from "../measurement/useMeasurement";
import {
  blockWindowForOffset,
  blockWindows,
  cursorGlobalOffset,
  refineWindow,
  sameWindow,
  windowGlobalEnd,
  windowGlobalStart,
} from "../pagination/blockWindow";
import type { BlockWindow } from "../pagination/blockWindow";
import type { PageFragment, SourceCursor } from "../pagination/types";
import { fragmentContainingOffset, pageStartGlobalOffset } from "../pagination/anchor";
import { focusNewPageTop } from "./PageTurnControls";
import { PaginatedSurface } from "./PaginatedSurface";
import { acknowledgePaginationTurn } from "./paginationTurnReceipt";
import type {
  AnchorChangeCause,
  PaginatedSurfaceHandle,
  PaginatedSurfaceProps,
  PageState,
  PageTurnResult,
} from "./PaginatedSurface";

const NO_HIGHLIGHTS = Object.freeze([]);
// Issue #238 — hasPreviousWindow / hasNextWindow / onBoundaryTurn stay in
// the props type: they are the host's BOOK-level contract (a neighboring
// existing chapter exists; turn past this chapter's true end), OR-ed with
// the adapter's internal window availability. A layout-window end is not a
// chapter end — internal crossings never consult the outer seam.
// Issue #244 — `windows` is the host's ASSIGNMENT contract: the clamped
// source windows of a chapter assignment (assignmentWindows) replace the
// whole-article derivation, so the adapter reads a bounded work. Absent →
// blockWindows(article) exactly as before. The host memoizes the list
// (reference-stable); a changed identity re-binds the adapter's windows and
// re-measures its current scope (the continue-the-work expansion).
type Props = Omit<PaginatedSurfaceProps, "trustedView" | "onPageSettled" | "onCapacity"> & {
  windows?: readonly BlockWindow[];
};

interface PendingJump {
  range: BlockWindow;
  offset: number;
  resolve: (result: PageTurnResult | null) => void;
  promise: Promise<PageTurnResult | null>;
}

export const WindowedPaginatedSurface = forwardRef<PaginatedSurfaceHandle, Props>(
  function WindowedPaginatedSurface(props, ref) {
    const { article, articleEl, initialAnchorOffset = 0 } = props;
    const propsRef = useRef(props);
    propsRef.current = props;
    // Initial windows bound source work. Capacity evidence can refine them
    // further, without changing the article or forgetting a successful prefix.
    // Issue #244 — an assignment open derives from the host's clamped
    // assignment windows instead of the whole-article tiling.
    const [windows, setWindows] = useState(() => props.windows ?? blockWindows(article));
    const windowsRef = useRef(windows);
    // The assignment contract can CHANGE within a mount (continue-the-work
    // clears the assignment: the clamped list swaps for the whole-article
    // tiling without a remount — the surface key is the article id). The
    // re-bind effect lives after the methods table (it re-anchors through
    // the ONE requestOffset seam).
    const [range, setRange] = useState(() =>
      // Issue #244 — the initial scope resolves against the SAME window list
      // the adapter reads (an assignment's clamped list, else the whole-
      // article tiling): measuring the article's first window while the
      // adapter owns the assignment's windows would measure the wrong
      // source range and commit a page from outside the assignment.
      blockWindowForOffset(article, initialAnchorOffset, windows),
    );
    const measurementRef = useRef<HTMLDivElement | null>(null);
    const child = useRef<PaginatedSurfaceHandle | null>(null);
    const pending = useRef<PendingJump | null>(null);
    const settledPage = useRef<{ pages: PageFragment[]; page: number } | null>(null);
    const anchor = useRef(
      Math.max(0, Math.min(initialAnchorOffset, articleGraphemeIndex(article).totalGraphemes)),
    );
    const alive = useRef(true);
    const intent = useRef(0);
    const { trustedView } = useMeasurement(
      article,
      measurementRef,
      range,
      props.diagnostics,
      props.paginationRetryEpoch,
    );

    function windowFor(offset: number): BlockWindow {
      return blockWindowForOffset(article, offset, windowsRef.current);
    }

    function displayedRange(): BlockWindow | null {
      // Every entry carries original coordinates — body entries AND footnote
      // entries (issue #235); pageStartGlobalOffset is the ONE canonical
      // translation for both.
      const firstPage = child.current?.getPages()?.[0];
      if (!firstPage || firstPage.blocks.length === 0) return null;
      return windowFor(pageStartGlobalOffset(article, firstPage));
    }

    function getState(): PageState | null {
      const state = child.current?.getState();
      const current = displayedRange();
      if (!state || !current) return null;
      // Issue #236 — the CURRENT page's canonical start: the ONE orientation
      // currency. The window's own start is not it (the reader may be pages
      // into the window), and the child's state.anchorOffset already carries
      // the committed page's start for the full-document path.
      const pages = child.current?.getPages();
      const currentPage = pages?.[state.page - 1];
      return {
        ...state,
        atStart: sameWindow(current, windowsRef.current[0]!) && state.page === 1,
        atEnd: sameWindow(current, windowsRef.current.at(-1)!) && state.page === state.total,
        scopeLabel: "in this portion",
        windowStart: current.startBlock,
        anchorOffset:
          currentPage !== undefined
            ? pageStartGlobalOffset(article, currentPage)
            : state.anchorOffset,
      };
    }

    function containsOffset(offset: number): boolean {
      const current = displayedRange();
      return current !== null && sameWindow(current, windowFor(offset));
    }

    function selectRange(target: BlockWindow): void {
      setRange((current) => (sameWindow(current, target) ? current : target));
    }

    function requestOffset(
      offset: number,
      cause: AnchorChangeCause = "navigation",
    ): Promise<PageTurnResult | null> {
      offset = Math.max(0, Math.min(offset, articleGraphemeIndex(article).totalGraphemes));
      const target = windowFor(offset);
      anchor.current = offset;
      // A cross-window jump is navigation even if its destination initially
      // renders on page 1 (so the child never performs an intra-window turn).
      propsRef.current.onAnchorChange?.(offset, cause);
      // Spoken-word updates may retarget a pending source window without
      // restarting measurement or losing its original completion promise.
      if (pending.current && sameWindow(pending.current.range, target)) {
        const jump = pending.current;
        jump.offset = offset;
        if (
          settledPage.current?.pages === child.current?.getPages() &&
          settledPage.current?.page === child.current?.getState()?.page
        )
          handleSettled();
        return jump.promise;
      }
      pending.current?.resolve(null);
      let resolve!: PendingJump["resolve"];
      const promise = new Promise<PageTurnResult | null>((done) => {
        resolve = done;
      });
      pending.current = { range: target, offset, promise, resolve };
      if (containsOffset(offset)) {
        // Cancel a superseded request while retaining the canonical refined
        // scope (the last valid prefix stays mounted until measurement commits).
        selectRange(target);
        const pages = child.current?.getPages();
        const result = pages
          ? child.current?.turnToPage(fragmentContainingOffset(pages, offset, article), offset)
          : null;
        if (
          result &&
          !result.moved &&
          settledPage.current?.pages === pages &&
          settledPage.current?.page === result.page
        )
          handleSettled();
      } else {
        selectRange(target);
      }
      return promise;
    }

    async function turnAsync(direction: "next" | "previous"): Promise<PageTurnResult | null> {
      const state = child.current?.getState();
      const current = displayedRange();
      if (!state || !current) return null;
      if (pending.current) return pending.current.promise;
      const generation = ++intent.current;
      const inside = direction === "next" ? state.page < state.total : state.page > 1;
      if (inside) {
        const result = child.current!.turn(direction);
        return result ? { ...getState()!, moved: result.moved } : null;
      }
      const index = windowsRef.current.findIndex((w) => sameWindow(w, current));
      const neighbor = windowsRef.current[index + (direction === "next" ? 1 : -1)];
      if (!neighbor) {
        // Issue #238 — no window neighbor means the TRUE chapter boundary:
        // the host (ArticleView) owns the turn from here, gated on the SAME
        // availability the child chevrons render (a host without a next
        // chapter never delegates — back-compat for standalone works). The
        // chapter handoff swaps the article; this surface's promise
        // honestly reports a non-move (the child never turned) and the
        // host's arrival effect owns focus + the boundary landing.
        const outward =
          direction === "next"
            ? propsRef.current.hasNextWindow
            : propsRef.current.hasPreviousWindow;
        if (outward) propsRef.current.onBoundaryTurn?.(direction);
        return { ...getState()!, moved: false };
      }
      propsRef.current.onUserTurn?.();
      const result = await requestOffset(
        direction === "next"
          ? windowGlobalStart(article, neighbor)
          : windowGlobalEnd(article, neighbor) - 1,
      );
      if (generation !== intent.current || !alive.current) return null;
      if (result?.moved) acknowledgePaginationTurn(article, direction);
      return result;
    }

    function handleCapacity(scope: BlockWindow, cursor: SourceCursor): void {
      const sourceStart = windowGlobalStart(article, scope);
      const index = windowsRef.current.findIndex(
        (w) => windowGlobalStart(article, w) === sourceStart,
      );
      const current = windowsRef.current[index];
      if (!current) return; // stale measurement from an abandoned scope
      // The ONE cursor→offset conversion (issue #235: footnote cursors read
      // their footnote row's canonical start, never a block prefix sum).
      const cut = cursorGlobalOffset(article, cursor);
      // Repeated evidence for an already-refined scope is not another split.
      if (cut >= windowGlobalEnd(article, current)) return;
      const refined = refineWindow(article, current, cursor);
      if (!refined) {
        propsRef.current.diagnostics.emit({
          kind: "dom-fallback",
          ts: new Date().toISOString(),
          reason: "unsupported-capacity-continuation",
        });
        return;
      }
      const next = [
        ...windowsRef.current.slice(0, index),
        ...refined,
        ...windowsRef.current.slice(index + 1),
      ];
      windowsRef.current = next;
      setWindows(next);
      const jump = pending.current;
      if (jump) {
        const target = windowFor(jump.offset);
        jump.range = target;
        // A deep jump can require several bounded passes. Retain its promise
        // and precise original offset until the containing refinement settles.
        selectRange(target);
      } else if (anchor.current >= cut && anchor.current < windowGlobalEnd(article, scope)) {
        void requestOffset(anchor.current, "layout");
      } else if (anchor.current >= sourceStart && anchor.current < cut) {
        // Measure the retained prefix as its own scope too. Keeping the old,
        // larger scope would let a later viewport growth span several refined
        // windows and make Next return to an already-visible source range.
        selectRange(refined[0]);
      }
    }

    function handleSettled(): void {
      const pages = child.current?.getPages();
      const state = child.current?.getState();
      if (!pages || !state) return;
      settledPage.current = { pages, page: state.page };
      const jump = pending.current;
      const current = displayedRange();
      if (!jump || !current || !sameWindow(jump.range, current)) return;
      const index = fragmentContainingOffset(pages, jump.offset, article);
      if (state.page !== index + 1) {
        child.current?.turnToPage(index, jump.offset);
        return; // wait for this page's live overflow check
      }
      pending.current = null;
      jump.resolve({ ...getState()!, moved: true });
    }

    function reportAnchor(offset: number, cause: AnchorChangeCause): void {
      const current = displayedRange();
      if (pending.current && (!current || !sameWindow(current, pending.current.range))) return;
      // The latest committed page is also the anchor for any later capacity
      // correction. Never chase an obsolete initial/jump offset after a turn.
      anchor.current = offset;
      propsRef.current.onAnchorChange?.(offset, cause);
    }

    function boundaryTurn(direction: "next" | "previous"): void {
      const active = document.activeElement;
      const onControl =
        active instanceof Element &&
        active.closest(".page-turn,.mode-toggle,.gear-button") !== null;
      void turnAsync(direction).then((result) => {
        if (result?.moved && alive.current && !onControl) focusNewPageTop(articleEl);
      });
    }

    // Stable callbacks matter: changing their identities must not republish
    // anchors (or feed read-aloud state updates back into a render loop).
    const methods = useRef({
      getState,
      containsOffset,
      requestOffset,
      turnAsync,
      handleCapacity,
      handleSettled,
      reportAnchor,
      boundaryTurn,
    });
    methods.current = {
      getState,
      containsOffset,
      requestOffset,
      turnAsync,
      handleCapacity,
      handleSettled,
      reportAnchor,
      boundaryTurn,
    };
    // Issue #244 — the assignment windows contract (see the state init):
    // a changed identity re-binds the windows and re-measures the current
    // anchor's scope in the NEW list. Refinements made under the old list
    // are discarded (the new list re-derives its own on capacity evidence).
    const windowsPropRef = useRef(props.windows);
    useEffect(() => {
      if (props.windows === windowsPropRef.current) return;
      windowsPropRef.current = props.windows;
      const next = props.windows ?? blockWindows(article);
      windowsRef.current = next;
      setWindows(next);
      void methods.current.requestOffset(anchor.current, "layout");
    }, [props.windows, article]);
    const onCapacity = useCallback(
      (scope: BlockWindow, cursor: SourceCursor) => methods.current.handleCapacity(scope, cursor),
      [],
    );
    const onPageSettled = useCallback(() => methods.current.handleSettled(), []);
    const onAnchorChange = useCallback(
      (offset: number, cause: AnchorChangeCause) => methods.current.reportAnchor(offset, cause),
      [],
    );
    const onBoundaryTurn = useCallback(
      (direction: "next" | "previous") => methods.current.boundaryTurn(direction),
      [],
    );
    useImperativeHandle(
      ref,
      () => ({
        turn: (direction) => {
          const state = child.current?.getState();
          if (!state) return null;
          if (
            (direction === "next" && state.page < state.total) ||
            (direction === "previous" && state.page > 1)
          ) {
            return child.current!.turn(direction);
          }
          void methods.current.turnAsync(direction);
          return null;
        },
        turnAsync: (direction) => methods.current.turnAsync(direction),
        turnToPage: (index) => child.current?.turnToPage(index) ?? null,
        goToOffset: (offset, onSettled) => {
          const generation = ++intent.current;
          void methods.current.requestOffset(offset).then((result) => {
            if (result && alive.current && generation === intent.current) onSettled?.();
          });
        },
        containsOffset: (offset) => methods.current.containsOffset(offset),
        getCurrentAnchorOffset: () => child.current?.getCurrentAnchorOffset() ?? anchor.current,
        getPages: () => child.current?.getPages() ?? null,
        getState: () => methods.current.getState(),
      }),
      [],
    );

    useEffect(() => {
      alive.current = true;
      return () => {
        alive.current = false;
        intent.current = -1;
        pending.current?.resolve(null);
        pending.current = null;
      };
    }, []);

    // Issue #235 — reference↔note navigation. In the windowed paginated path
    // a footnote reference and its body usually live in DIFFERENT source
    // windows (and pages), so the native fragment hop has no target to scroll
    // to. This delegated handler routes both directions through the ONE
    // passage operation (requestOffset — the same seam as TOC/restore/speech
    // jumps): it loads the required source window, turns to the page, and
    // moves focus to the destination so keyboard and screen-reader readers
    // land ON the note (li tabIndex=-1) or back ON the referring marker.
    // preventDefault keeps the URL free of dead fragment churn; scrolling
    // mode never mounts this surface and keeps the native behavior.
    useEffect(() => {
      const root = articleEl;
      if (!root) return;
      const onClick = (event: MouseEvent) => {
        const anchor = (event.target as HTMLElement | null)?.closest?.(
          "a[href^='#fn-']",
        ) as HTMLAnchorElement | null;
        if (!anchor) return;
        const href = anchor.getAttribute("href");
        if (!href) return;
        const target = footnoteAnchorOffset(article, href);
        if (target === null) return; // unknown id — let the browser no-op
        event.preventDefault();
        void methods.current.requestOffset(target, "navigation").then((result) => {
          // A superseded request resolves null; only the surviving navigation
          // claims the destination focus.
          if (!result || !alive.current) return;
          // The destination page has committed (requestOffset resolves after
          // the settled page). One rAF lets the commit paint before focus.
          requestAnimationFrame(() => {
            if (!alive.current) return;
            root
              .querySelector<HTMLElement>(`#${CSS.escape(href.slice(1))}`)
              ?.focus({ preventScroll: true });
          });
        });
      };
      root.addEventListener("click", onClick);
      return () => root.removeEventListener("click", onClick);
    }, [article, articleEl]);

    const scope = trustedView?.scope;
    const displayed = scope ? windowFor(windowGlobalStart(article, scope)) : undefined;
    // Issue #238 — the chevron availability ORs the adapter's internal
    // window neighbors with the host's book-level neighbors: at this
    // chapter's true start/end the ordinary Previous/Next affordance stays
    // enabled exactly when a neighboring existing chapter exists. Internal
    // window turns still take priority in turnAsync (a window end is not a
    // chapter end).
    const previous =
      (displayed !== undefined && !sameWindow(displayed, windows[0]!)) ||
      (propsRef.current.hasPreviousWindow ?? false);
    const next =
      (displayed !== undefined && !sameWindow(displayed, windows.at(-1)!)) ||
      (propsRef.current.hasNextWindow ?? false);
    return (
      <>
        <div
          ref={measurementRef}
          className="article-body-measurement"
          lang={article.lang}
          aria-hidden="true"
          inert
        >
          <ArticleBody
            article={article}
            highlights={NO_HIGHLIGHTS}
            blockWindow={range}
            measurementProjection
          />
        </div>
        {trustedView &&
        trustedView.scope?.articleId === article.id &&
        trustedView.scope.revision === article.revision ? (
          <PaginatedSurface
            {...props}
            ref={child}
            trustedView={trustedView}
            initialAnchorOffset={anchor.current}
            hasPreviousWindow={previous}
            hasNextWindow={next}
            onAnchorChange={onAnchorChange}
            onPageSettled={onPageSettled}
            onCapacity={onCapacity}
            onBoundaryTurn={onBoundaryTurn}
          />
        ) : (
          <p className="meta" role="status">
            Preparing pages…
          </p>
        )}
      </>
    );
  },
);
