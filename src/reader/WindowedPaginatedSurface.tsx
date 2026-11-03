// Long-prose adapter: one canonical article, bounded measurement DOM, and
// the SAME paginator/renderer as short works. No persisted window or page IDs.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { articleGraphemeIndex } from "../content/normalizeText";
import { ArticleBody } from "../content/render/BlockRenderer";
import { useMeasurement } from "../measurement/useMeasurement";
import {
  blockWindowForOffset,
  blockWindows,
  sameWindow,
  windowGlobalEnd,
  windowGlobalStart,
  windowHasNext,
  windowHasPrevious,
} from "../pagination/blockWindow";
import type { BlockWindow } from "../pagination/blockWindow";
import { fragmentContainingOffset } from "../pagination/anchor";
import { focusNewPageTop } from "./PageTurnControls";
import { PaginatedSurface } from "./PaginatedSurface";
import type {
  PaginatedSurfaceHandle,
  PaginatedSurfaceProps,
  PageState,
  PageTurnResult,
} from "./PaginatedSurface";

const NO_HIGHLIGHTS = Object.freeze([]);
type Props = Omit<
  PaginatedSurfaceProps,
  "trustedView" | "hasPreviousWindow" | "hasNextWindow" | "onBoundaryTurn" | "onPageSettled"
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
    const windows = blockWindows(article);
    const [range, setRange] = useState(() => blockWindowForOffset(article, initialAnchorOffset));
    const measurementRef = useRef<HTMLDivElement | null>(null);
    const child = useRef<PaginatedSurfaceHandle | null>(null);
    const pending = useRef<PendingJump | null>(null);
    const anchor = useRef(initialAnchorOffset);
    const alive = useRef(true);
    const intent = useRef(0);
    const { trustedView } = useMeasurement(article, measurementRef, range, props.diagnostics);

    function displayedRange(): BlockWindow | null {
      // The mounted page's first entry carries original whole-block source
      // coordinates; its global offset addresses the containing continuation
      // directly (giant-prose windows of the SAME block distinguish by their
      // slice origin — never by block index alone).
      const first = child.current?.getPages()?.[0]?.blocks[0];
      if (!first) return null;
      const offsets = articleGraphemeIndex(article).blockStartOffsets;
      return blockWindowForOffset(article, offsets[first.blockIndex]! + (first.startGrapheme ?? 0));
    }

    function getState(): PageState | null {
      const state = child.current?.getState();
      const current = displayedRange();
      if (!state || !current) return null;
      // A window end is not the work end (issue #233): only the FIRST
      // window's first page reads atStart and only the LAST window's final
      // page reads atEnd — intermediate continuations neither.
      return {
        ...state,
        atStart: sameWindow(current, windows[0]!) && state.page === 1,
        atEnd: sameWindow(current, windows.at(-1)!) && state.page === state.total,
        scopeLabel: "in this portion",
        windowStart: current.startBlock,
      };
    }

    function containsOffset(offset: number): boolean {
      const current = displayedRange();
      return current !== null && sameWindow(current, blockWindowForOffset(article, offset));
    }

    function requestOffset(offset: number): Promise<PageTurnResult | null> {
      const target = blockWindowForOffset(article, offset);
      anchor.current = offset;
      if (containsOffset(offset)) {
        pending.current?.resolve(null);
        pending.current = null;
        setRange(target); // also cancels a superseded measurement for another window
        const pages = child.current?.getPages();
        const result = pages
          ? child.current?.turnToPage(fragmentContainingOffset(pages, offset, article), offset)
          : null;
        return Promise.resolve(result ? { ...getState()!, moved: result.moved } : null);
      }
      // Spoken-word updates can retarget a pending window without starting
      // another measurement or discarding the last valid visible page.
      if (pending.current && sameWindow(pending.current.range, target)) {
        pending.current.offset = offset;
        return pending.current.promise;
      }
      pending.current?.resolve(null);
      let resolve!: PendingJump["resolve"];
      const promise = new Promise<PageTurnResult | null>((done) => {
        resolve = done;
      });
      pending.current = { range: target, offset, promise, resolve };
      setRange(target);
      return promise;
    }

    async function turnAsync(direction: "next" | "previous"): Promise<PageTurnResult | null> {
      const state = child.current?.getState();
      const current = displayedRange();
      if (!state || !current) return null;
      // Coalesce repeats without skipping unseen windows or invalidating the
      // pending commit. The caller's latest turn owns its focus/announcement.
      if (pending.current) return pending.current.promise;
      const generation = ++intent.current;
      const inside = direction === "next" ? state.page < state.total : state.page > 1;
      if (inside) {
        const result = child.current!.turn(direction);
        return result ? { ...getState()!, moved: result.moved } : null;
      }
      const index = windows.indexOf(current);
      const neighbor = windows[index + (direction === "next" ? 1 : -1)];
      if (!neighbor) return { ...getState()!, moved: false };
      propsRef.current.onUserTurn?.();
      // Slice-aware neighbor cursors: a continuation's first source grapheme
      // / last source grapheme in original global coordinates.
      const result = await requestOffset(
        direction === "next"
          ? windowGlobalStart(article, neighbor)
          : windowGlobalEnd(article, neighbor) - 1,
      );
      return generation === intent.current && alive.current ? result : null;
    }

    // Latest closures behind a stable handle: changing measurement state must
    // not invalidate a caller's in-flight navigation/focus generation.
    const methods = useRef({ getState, containsOffset, requestOffset, turnAsync });
    methods.current = { getState, containsOffset, requestOffset, turnAsync };
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

    function handleSettled(): void {
      const jump = pending.current;
      const current = displayedRange();
      if (!jump || !current || !sameWindow(jump.range, current)) return;
      const pages = child.current?.getPages();
      if (!pages) return;
      const index = fragmentContainingOffset(pages, jump.offset, article);
      const state = child.current?.getState();
      if (state?.page !== index + 1) {
        // Pin the guard's re-anchor to the JUMP's precise offset (issue
        // #233): corrections that split this page must keep the reader at
        // the passage they jumped to, never drift to the page head.
        child.current?.turnToPage(index, jump.offset);
        return; // wait for that page's live overflow check before resolving
      }
      pending.current = null;
      jump.resolve({ ...getState()!, moved: true });
    }

    const scope = trustedView?.scope;
    // Neighbor existence is window identity (issue #233 — a scope may begin
    // or end mid-block), owned by blockWindow.ts, not decomposed here.
    const previous = scope !== undefined && windowHasPrevious(article, scope as BlockWindow);
    const next = scope !== undefined && windowHasNext(article, scope as BlockWindow);
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
            onAnchorChange={(offset) => {
              const current = displayedRange();
              if (pending.current && (!current || !sameWindow(current, pending.current.range)))
                return;
              propsRef.current.onAnchorChange?.(offset);
            }}
            onPageSettled={handleSettled}
            onBoundaryTurn={(direction) => {
              const active = document.activeElement;
              const onControl =
                active instanceof Element &&
                active.closest(".page-turn,.mode-toggle,.gear-button") !== null;
              void methods.current.turnAsync(direction).then((result) => {
                if (result?.moved && alive.current && !onControl) focusNewPageTop(articleEl);
              });
            }}
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
