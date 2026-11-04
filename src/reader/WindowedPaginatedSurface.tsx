// Long-prose adapter: one canonical article, bounded measurement DOM, and
// the SAME paginator/renderer as short works. No persisted window or page IDs.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { articleGraphemeIndex } from "../content/normalizeText";
import { ArticleBody } from "../content/render/BlockRenderer";
import { useMeasurement } from "../measurement/useMeasurement";
import {
  blockWindowForOffset,
  blockWindows,
  refineWindow,
  sameWindow,
  windowGlobalEnd,
  windowGlobalStart,
} from "../pagination/blockWindow";
import type { BlockWindow } from "../pagination/blockWindow";
import type { PageFragment, SourceCursor } from "../pagination/types";
import { fragmentContainingOffset } from "../pagination/anchor";
import { focusNewPageTop } from "./PageTurnControls";
import { PaginatedSurface } from "./PaginatedSurface";
import type {
  AnchorChangeCause,
  PaginatedSurfaceHandle,
  PaginatedSurfaceProps,
  PageState,
  PageTurnResult,
} from "./PaginatedSurface";

const NO_HIGHLIGHTS = Object.freeze([]);
type Props = Omit<
  PaginatedSurfaceProps,
  | "trustedView"
  | "hasPreviousWindow"
  | "hasNextWindow"
  | "onBoundaryTurn"
  | "onPageSettled"
  | "onCapacity"
>;
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
    const [windows, setWindows] = useState(() => blockWindows(article));
    const windowsRef = useRef(windows);
    const [range, setRange] = useState(() => blockWindowForOffset(article, initialAnchorOffset));
    const measurementRef = useRef<HTMLDivElement | null>(null);
    const child = useRef<PaginatedSurfaceHandle | null>(null);
    const pending = useRef<PendingJump | null>(null);
    const settledPage = useRef<{ pages: PageFragment[]; page: number } | null>(null);
    const anchor = useRef(
      Math.max(0, Math.min(initialAnchorOffset, articleGraphemeIndex(article).totalGraphemes)),
    );
    const alive = useRef(true);
    const intent = useRef(0);
    const { trustedView } = useMeasurement(article, measurementRef, range, props.diagnostics);

    function windowFor(offset: number): BlockWindow {
      return blockWindowForOffset(article, offset, windowsRef.current);
    }

    function displayedRange(): BlockWindow | null {
      // Every entry carries original coordinates, including slice origins.
      const first = child.current?.getPages()?.[0]?.blocks[0];
      if (!first) return null;
      const offsets = articleGraphemeIndex(article).blockStartOffsets;
      return windowFor(offsets[first.blockIndex]! + first.startGrapheme);
    }

    function getState(): PageState | null {
      const state = child.current?.getState();
      const current = displayedRange();
      if (!state || !current) return null;
      return {
        ...state,
        atStart: sameWindow(current, windowsRef.current[0]!) && state.page === 1,
        atEnd: sameWindow(current, windowsRef.current.at(-1)!) && state.page === state.total,
        scopeLabel: "in this portion",
        windowStart: current.startBlock,
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
      if (!neighbor) return { ...getState()!, moved: false };
      propsRef.current.onUserTurn?.();
      const result = await requestOffset(
        direction === "next"
          ? windowGlobalStart(article, neighbor)
          : windowGlobalEnd(article, neighbor) - 1,
      );
      return generation === intent.current && alive.current ? result : null;
    }

    function handleCapacity(scope: BlockWindow, cursor: SourceCursor): void {
      const sourceStart = windowGlobalStart(article, scope);
      const index = windowsRef.current.findIndex(
        (w) => windowGlobalStart(article, w) === sourceStart,
      );
      const current = windowsRef.current[index];
      if (!current) return; // stale measurement from an abandoned scope
      const cut =
        articleGraphemeIndex(article).blockStartOffsets[cursor.blockIndex]! + cursor.startGrapheme;
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

    const scope = trustedView?.scope;
    const displayed = scope ? windowFor(windowGlobalStart(article, scope)) : undefined;
    const previous = displayed !== undefined && !sameWindow(displayed, windows[0]!);
    const next = displayed !== undefined && !sameWindow(displayed, windows.at(-1)!);
    return (
      <>
        <div
          ref={measurementRef}
          className="article-body-measurement"
          lang={article.lang}
          aria-hidden="true"
          inert
        >
          <ArticleBody article={article} highlights={NO_HIGHLIGHTS} blockWindow={range} />
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
