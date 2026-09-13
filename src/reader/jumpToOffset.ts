// src/reader/jumpToOffset.ts
// Issue #5 — the ONE home for the mode-aware passage-jump tail. Navigating to
// a passage (deep-link /h/ jump, location restore, annotations-drawer
// navigate-back, TOC jump — and the D4-10 paginated→scrolling mode-swap
// re-anchor) used to re-implement the same tail at every call site inside
// ArticleView: pick the page-or-scroll target, turn/scroll, then the
// settle/focus guard. This module owns the branch, the target resolution,
// and the discipline; call sites become one-liners and the behavior has one
// unit suite (tests/unit/jumpToOffset.test.ts).
//
// What the module composes (REUSE, DO NOT FORK — Pattern 5):
//   - PAGINATED: fragmentContainingOffset (pagination/anchor.ts — the D4-10/
//     D4-11 anchor machinery in reverse) → PaginatedSurfaceHandle.turnToPage.
//     No committed pages (null/empty) is a calm no-op — readiness gating
//     (the bounded rAF retry) stays at the call sites that need it, because
//     each call site's readiness predicate is genuinely its own (annotation
//     load for deep-link, mode-flip guard for restore).
//   - SCROLLING: findScrollTarget (restoreLocation.ts — the Phase 2 helper)
//     → scrollIntoView with the caller's alignment ("start" default; the
//     highlight jumps pass "center"). Silent + instant (A11Y-06) — never
//     behavior: "smooth".
//   - END LANDING (260908-oht, opt-in via endLanding): a scrolling offset at
//     or past the article total lands at the absolute document BOTTOM so the
//     first scroll-save re-pins total instead of un-finishing a finished
//     article. The decision routes through readingPosition's
//     landingForRestore/endPinOffset — this module only performs the scroll.
//   - SETTLE GUARD (D4-07): the focus/settle callback double-calls on the
//     SAME closure — once via rAF (after the turn/scroll commits) and again
//     after FOCUS_SETTLE_MS (120ms). Firefox quirk: scrollIntoView's async
//     settle can race a single rAF (the mark is in the DOM + focusable, but
//     the rAF fires before the scroll completes and focus doesn't land);
//     the timeout re-focuses after firefox's scroll settle cross-engine.
//     The guard runs whenever onSettled is provided — including the
//     paginated no-op path (handleNavigateBack's focus-the-mark parity) and
//     after an end landing.
import type { CanonicalArticle } from "../content/types";
import type { ReadingMode } from "./ModeToggle";
import type { PaginatedSurfaceHandle } from "./PaginatedSurface";
import { fragmentContainingOffset } from "../pagination/anchor";
import { findScrollTarget } from "./restoreLocation";
import { endPinOffset, landingForRestore } from "./readingPosition";

/** Belt-and-suspenders re-call delay for the D4-07 firefox-settle guard. */
export const FOCUS_SETTLE_MS = 120;

/**
 * settleFocus — the D4-07 double-call discipline, standalone: BOTH calls on
 * the same closure. Exported for tails that are pure focus sinks (the TOC
 * "Top" entry) so the rAF + 120ms pattern still has exactly one home.
 */
export function settleFocus(onSettled: () => void): void {
  requestAnimationFrame(onSettled);
  window.setTimeout(onSettled, FOCUS_SETTLE_MS);
}

/** Everything a jump needs from its call site. */
export interface JumpToOffsetInput {
  /** Effective reading mode — the branch owner. */
  readonly mode: ReadingMode;
  /**
   * The paginated surface's imperative handle (surfaceRef.current). Read in
   * scrolling mode; may be null pre-mount in paginated mode (calm no-op —
   * the call site's retry loop decides whether to re-attempt).
   */
  readonly surface: PaginatedSurfaceHandle | null;
  /**
   * Visible rendered block elements in document order (queryBlocks — which
   * already filters the hidden measurement clone). Read only in scrolling
   * mode; may be empty there (calm no target, no scroll).
   */
  readonly blocks: HTMLElement[];
  /**
   * Scrolling-mode scroll alignment (the scrollIntoView `block` option).
   * Default "start" (restore/TOC tails); highlight jumps pass "center" to
   * land the mark mid-viewport.
   */
  readonly scrollAlignment?: ScrollLogicalPosition;
  /**
   * Opt-in 260908-oht end landing (restore + mode-swap tails): a scrolling
   * offset at or past the article total lands at the absolute document
   * bottom (window.scrollTo) instead of a block scroll. The highlight/TOC
   * tails keep it off — an at-total highlight still scrolls to its passage.
   */
  readonly endLanding?: boolean;
  /**
   * Focus/settle callback, run through the D4-07 guard (rAF + 120ms
   * double-call on this exact closure). Omit for tails with no focus claim
   * (restore sets its marker directly; the mode-swap re-anchor is silent).
   */
  readonly onSettled?: () => void;
}

/**
 * jumpToOffset — navigate to the passage at `offset` (an article-global D-05
 * grapheme offset) in the effective mode, then run the settle guard.
 *
 * PAGINATED: resolve offset → page index via fragmentContainingOffset, then
 * turnToPage. SCROLLING: end landing (opt-in) or findScrollTarget +
 * scrollIntoView. Never throws, never smooth-scrolls (A11Y-06).
 */
export function jumpToOffset(
  article: CanonicalArticle,
  offset: number,
  input: JumpToOffsetInput,
): void {
  if (input.mode === "paginated") {
    const surface = input.surface;
    const pages = surface?.getPages() ?? null;
    if (surface && pages && pages.length > 0) {
      const pageIdx = fragmentContainingOffset(pages, offset, article);
      surface.turnToPage(pageIdx);
    }
  } else if (
    input.endLanding &&
    landingForRestore(offset, endPinOffset(article)) === "end"
  ) {
    // 260908-oht: absolute document bottom so the first scroll-save re-pins
    // total instead of un-finishing a finished article.
    window.scrollTo(0, document.documentElement.scrollHeight);
  } else {
    const target = findScrollTarget(article, input.blocks, offset);
    // Silent + instant (A11Y-06) — never behavior: "smooth".
    target?.scrollIntoView({ block: input.scrollAlignment ?? "start" });
  }
  if (input.onSettled) settleFocus(input.onSettled);
}
