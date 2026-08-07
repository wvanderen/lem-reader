// src/routes/ArticleView.tsx
// Article reader route (DOC-03 provenance header). Reads via the repository
// seam (openArticle) and renders the provenance header + ArticleBody. The
// source-URL link opens in a new tab with rel="noopener noreferrer" + a
// visually-hidden new-tab announcement (UI-SPEC §Interaction 2; reverse-
// tabnabbing defense). Inline article links (rendered by InlineRenderer inside
// the body) do NOT carry target="_blank" — they open in the same tab.
// Publish date uses Intl.DateTimeFormat with the user's locale (never
// hand-rolled date strings — UI-SPEC §Copywriting). Never exposes internal
// jargon in user-facing copy.
//
// Phase 2 Plan 02-03 (STATE-01 + READ-05 + A11Y-08): wires four new surfaces
// after the article loads:
//   1. Location-restore effect (mirror of the cancelled-flag load pattern):
//      loadLocation → findScrollTarget → silent scrollIntoView → show banner.
//   2. useScrollSave(article, articleRef) — debounced ~1200ms save + dual
//      bfcache-safe flush (visibilitychange-hidden + pagehide).
//   3. ProgressHairline + scroll-progress ratio tracking (READ-05).
//   4. SectionAnnouncer (IntersectionObserver scroll-spy, debounced) +
//      ResumeBanner (dismissible, non-modal — auto-dismisses on first scroll
//      or pointer activity OR explicit Resume/Start-from-top/×).
import { useCallback, useEffect, useRef, useState } from "react";
import { openArticle } from "../content/repository";
import type { CanonicalArticle } from "../content/types";
import type { LocationRecord } from "../content/schema";
import { ArticleBody } from "../content/render/BlockRenderer";
import { loadLocation } from "../persistence/locationStore";
import { findScrollTarget, computeTopVisibleOffset } from "../reader/restoreLocation";
import { useScrollSave } from "../reader/useScrollSave";
import { useMeasurement } from "../measurement/useMeasurement";
import { useSettings } from "../settings/SettingsContext";
import { PaginatedSurface } from "../reader/PaginatedSurface";
import type { PaginatedSurfaceHandle } from "../reader/PaginatedSurface";
import { PageTurnControls, isFormField } from "../reader/PageTurnControls";
import { ProgressHairline } from "../reader/ProgressHairline";
import { SectionAnnouncer } from "../reader/SectionAnnouncer";
import { blockGraphemeLength } from "../pagination/anchor";
import { BLOCK_SEPARATOR } from "../content/normalizeText";
import { ResumeBanner } from "../reader/ResumeBanner";
import { PaginationFallbackBanner } from "../reader/PaginationFallbackBanner";
// Phase 5 Plan 05-02: annotation state seam (ANNO-01/05/06). The provider
// wraps the article body; the apiRef bridge lets this component's H/N handler
// call createHighlightFromSelection without consuming the context (a parent
// cannot useContext its own child's provider). The SelectionToolbar (Task 2)
// + NotePopover (Plan 05-03) consume useHighlightOverlay() directly as
// provider children.
import {
  HighlightOverlayProvider,
} from "../reader/annotations/HighlightOverlay";
import type { HighlightOverlayValue } from "../reader/annotations/HighlightOverlay";
import type { CreateFromSelectionResult, ToolbarCaptureResult } from "../reader/annotations/HighlightOverlay";
import { SelectionToolbar } from "../reader/annotations/SelectionToolbar";
// Phase 5 Plan 05-03: NotePopover (Popover API manual + debounced save +
// two-step delete) + AnnotationsDrawer (native <dialog> reading-order list +
// navigate-back). Both consume useHighlightOverlay() inside the provider.
import { NotePopover } from "../reader/annotations/NotePopover";
import { AnnotationsDrawer } from "../reader/annotations/AnnotationsDrawer";
import { fragmentContainingOffset } from "../pagination/anchor";

/** The D4-10 mode-toggle handler signature (App threads a ref of this shape). */
type ModeToggleHandler = () => void;

export interface ArticleViewProps {
  articleId: string;
  /**
   * D4-10 bridge: App passes a ref here. ArticleView registers its anchor-
   * capturing toggle handler on mount so the header ModeToggle button (and
   * the M shortcut via PageTurnControls) preserve the reader's passage across
   * the mode swap. On unmount the ref clears and App falls back to a plain
   * preference flip.
   */
  modeToggleHandlerRef: React.RefObject<ModeToggleHandler | null>;
  /**
   * Phase 5 Plan 05-03 (D5-09): annotations drawer open state — owned by App
   * (same lifting pattern as settingsOpen) so Header (the trigger) and this
   * component (which mounts the drawer + handles navigate-back close) share
   * one source of truth.
   */
  drawerOpen: boolean;
  /** Phase 5 Plan 05-03: close the drawer (App's setter). */
  onCloseDrawer: () => void;
  /**
   * Phase 5 Plan 05-03: push the resolved-highlight count up to App so the
   * Header badge stays in sync.
   */
  onAnnotationCountChange: (count: number) => void;
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(navigator.language, { dateStyle: "medium" }).format(
      new Date(iso),
    );
  } catch {
    // Fall back to the raw ISO date if the user agent's locale is unavailable.
    return iso;
  }
}

/**
 * Query the rendered top-level block elements in document order. Used by both
 * the location-restore effect and the Resume handler. Mirrors the selector
 * used by useScrollSave's offset computation so save/restore round-trip
 * exactly.
 *
 * Plan 04-09 (PAGE-01 round-trip fix): switched from a tag-based selector
 * ("h2, h3, h4, p, blockquote, li, pre, figure, sup, details") to
 * [data-block-index] (emitted by BlockRenderer on each top-level block per
 * Plan 04-06). The tag-based selector DOUBLE-COUNTED: (a) the article
 * header's <p class="meta"> provenance paragraph (not an article block), and
 * (b) blockquote child <p> elements (a <blockquote> and its child <p> both
 * matched "p, blockquote"). The extra elements shifted the grapheme offsets
 * computed by computeTopVisibleOffset so they no longer matched the
 * article-global offsets from pageStartGlobalOffset (which walks article.blocks
 * via blockNormalizedText). [data-block-index] matches exactly the top-level
 * article blocks (verified: 8 vs 13 elements for essay-long-form), aligning
 * the scrolling-mode anchor with the paginated-mode page boundaries.
 */
function queryBlocks(articleEl: HTMLElement): HTMLElement[] {
  return Array.from(
    articleEl.querySelectorAll<HTMLElement>("[data-block-index]"),
  );
}

/**
 * Plan 04-09 (PAGE-01 round-trip fix): check if two article-global grapheme
 * offsets fall within the SAME article block. Used by handleToggleMode to
 * decide whether to prefer the precise paginated-mode anchor over the
 * block-level scrolling-mode anchor when returning scrolling→paginated.
 * Walks article.blocks accumulating per-block grapheme lengths + BLOCK_SEPARATOR
 * (same accumulation as pageStartGlobalOffset / computeTopVisibleOffset).
 */
function sameBlock(article: CanonicalArticle, offsetA: number, offsetB: number): boolean {
  let blockStart = 0;
  for (const block of article.blocks) {
    const blockLen = blockGraphemeLength(block, article.lang);
    const blockEnd = blockStart + blockLen;
    const aInBlock = offsetA >= blockStart && offsetA <= blockEnd;
    const bInBlock = offsetB >= blockStart && offsetB <= blockEnd;
    if (aInBlock && bInBlock) return true;
    if (aInBlock || bInBlock) return false; // different blocks
    blockStart = blockEnd + BLOCK_SEPARATOR.length;
  }
  return false;
}

export function ArticleView({
  articleId,
  modeToggleHandlerRef,
  drawerOpen,
  onCloseDrawer,
  onAnnotationCountChange,
}: ArticleViewProps) {
  const [article, setArticle] = useState<CanonicalArticle | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  // The restored location (STATE-01). Null when no saved location was found
  // OR after the reader dismisses the banner. Used by the Resume handler to
  // re-scroll to the saved offset if the reader clicked Resume.
  const [restoredOffset, setRestoredOffset] = useState<LocationRecord | null>(null);
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [progress, setProgress] = useState(0);

  // Phase 5 Plan 05-02 (ANNO-01/05/06): annotation state seam. The apiRef
  // bridge lets this component's H/N keydown handler call
  // createHighlightFromSelection. The provider populates apiRef.current
  // synchronously during render; the handler reads the latest value via the
  // mutable ref. SelectionToolbar (Task 2) consumes via useHighlightOverlay().
  const highlightApiRef = useRef<HighlightOverlayValue | null>(null);
  // Polite live region for annotation announces (D5-12, A11Y-08). Concise
  // copy: "Highlight saved." / "Highlight deleted." Rendered as a visually-
  // hidden role=status region so it announces to AT without visual clutter.
  const [annotationAnnouncement, setAnnotationAnnouncement] = useState<
    string | null
  >(null);
  // Phase 5 Plan 05-02: the live selection rect (for the SelectionToolbar's
  // position:fixed geometry — Task 2 consumes this). Null when no non-collapsed
  // selection exists within the reading surface. rAF-throttled via the
  // selectionchange listener below so rapid selection shaping doesn't thrash.
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  // The enriched capture result for the current selection (multi-block /
  // overlap / empty / ineligible / ok). Computed in the selectionchange
  // listener via the provider's captureCurrentSelection (no highlight created).
  // Drives the toolbar's buttons-vs-hint rendering.
  const [captureResult, setCaptureResult] =
    useState<ToolbarCaptureResult | null>(null);

  // Phase 5 Plan 05-03: push the resolved-highlight count up to App so the
  // Header badge stays in sync. Runs whenever the apiRef bridge updates (which
  // happens on every render of the provider — highlights, CRUD, etc.).
  const highlightCount = highlightApiRef.current?.highlights.length ?? 0;
  useEffect(() => {
    onAnnotationCountChange(highlightCount);
  }, [highlightCount, onAnnotationCountChange]);

  // Phase 5 Plan 05-04 (D5-04 / ANNO-07 — one-time open-announce): after the
  // eager batch-resolve completes on article open, count highlights that
  // resolved to "ambiguous" or "orphan" (the reader's anchor engine could
  // not confidently relocate them). If N ≥ 1, fire a ONE-TIME polite
  // `.status` announce: "{N} highlight(s) couldn't be relocated." The guard
  // ref prevents re-announcing on every provider re-render (CRUD, debounced
  // note save, etc.) — the announce fires ONCE per article-open and is reset
  // on article swap (the load effect below clears highlightApiRef.current).
  // The reader is NOT interrupted (the drawer does not auto-open); the
  // announce directs them to it (UI-SPEC §Interaction 30 / §Copywriting).
  const unresolvedAnnouncedRef = useRef(false);
  const unresolvedHighlightsCount =
    highlightApiRef.current?.highlights.filter((h) => h.status !== "confident").length ?? 0;
  useEffect(() => {
    if (unresolvedAnnouncedRef.current) return;
    // Wait until the apiRef is populated AND has at least one unresolved
    // highlight. The apiRef is null during loading + immediately after an
    // article swap (the load effect clears it); the eager batch-resolve
    // then populates it with the resolved set.
    if (!highlightApiRef.current) return;
    if (unresolvedHighlightsCount < 1) return;
    unresolvedAnnouncedRef.current = true;
    const formatter = new Intl.NumberFormat(navigator.language);
    const noun = unresolvedHighlightsCount === 1 ? "highlight" : "highlights";
    setAnnotationAnnouncement(
      `${formatter.format(unresolvedHighlightsCount)} ${noun} couldn't be relocated.`,
    );
  }, [unresolvedHighlightsCount]);

  // Phase 4 Plan 04-05 (PAGE-04 + PAGE-09): the fallback banner visibility +
  // a SESSION-scoped mode override. On a pagination fallback (dom-fallback /
  // measurement-error DiagnosticEvent), the override flips the effective mode
  // to scrolling at the same D-05 passage WITHOUT overwriting the persisted
  // readingMode preference (T-04-15 — only the user-initiated toggle path
  // persists). Cleared by the reader's explicit Switch to pages / M / header
  // toggle (returns to the persisted preference) or by an article swap.
  const [showFallbackBanner, setShowFallbackBanner] = useState(false);
  const [sessionModeOverride, setSessionModeOverride] = useState<
    "paginated" | "scrolling" | null
  >(null);

  // Ref + state for the rendered <article> element. The ref lets
  // useScrollSave/restoreLocation read the DOM imperatively; the state
  // (articleEl) triggers a re-render when the element mounts so
  // SectionAnnouncer receives the actual DOM node (refs alone don't trigger
  // re-renders — React's callback-ref pattern bridges the gap).
  const articleRef = useRef<HTMLElement>(null);
  const [articleEl, setArticleEl] = useState<HTMLElement | null>(null);

  /**
   * Callback ref: React calls this with the DOM node when the <article>
   * mounts/unmounts. We sync both the ref (for imperative useScrollSave /
   * restoreLocation reads) AND the state (so SectionAnnouncer re-renders
   * with the actual element).
   */
  const articleCallbackRef = useCallback((el: HTMLElement | null) => {
    articleRef.current = el;
    setArticleEl(el);
  }, []);

  // useScrollSave must be called unconditionally (rules of hooks). It no-ops
  // while article is null (the hook early-returns its scroll listener when
  // article is null). The dual-flush listeners stay registered across the
  // loading → ready transition.
  useScrollSave(article, articleRef);

  // Phase 3 (PAGE-06 + PAGE-07): mount the staleness-safe measurement
  // pipeline. The hook no-ops during article loading (rules of hooks). The
  // returned trustedView is the "last valid view" — replaced only by a
  // result that survived the font gate (D3-06) + the epoch commit guard
  // (PAGE-07). In scrolling mode the engine runs but its visible effect is
  // the reflow applyTheme already produces; the paginated payoff lands in
  // Phase 4. D3-04: measurement is invisible by default — the hook writes
  // NOTHING to the `.status` live region (reserved for consequential
  // fallback, a Phase 4 concern).
  //
  // Phase 4 Plan 04-03: destructure BOTH fields. `trustedView` feeds
  // PaginatedSurface; `diagnostics` is the SAME DiagnosticBus instance owned
  // by the hook (T-04 threading contract — never construct a second
  // `new DiagnosticBus()` here; Plan 04-05's fallback banner subscribes to
  // this same instance).
  const { trustedView, diagnostics } = useMeasurement(article, articleRef);

  // Phase 4 Plan 04-03: mode-aware render branch. settings.readingMode comes
  // from the Plan 04-02 Zod value-shape evolution (default "paginated"). The
  // branch is additive — scrolling mode stays byte-unchanged so existing
  // tests regress nothing.
  const { settings, update } = useSettings();
  // Phase 4 Plan 04-05: effectiveMode honors a session-scoped override (set
  // on pagination fallback) WITHOUT overwriting the persisted preference.
  // The render branch + every mode-aware effect below read effectiveMode, NOT
  // settings.readingMode directly, so the fallback flip takes effect while
  // the persisted readingMode stays byte-unchanged (T-04-15).
  const effectiveMode = sessionModeOverride ?? settings.readingMode;
  const isPaginated = effectiveMode === "paginated";

  // Phase 4 Plan 04-04: imperative handle to the paginated surface. Drives
  // keyboard + swipe (PageTurnControls) and reads the current page's anchor
  // offset for the D4-10 paginated→scrolling capture.
  const surfaceRef = useRef<PaginatedSurfaceHandle | null>(null);

  // Phase 4 Plan 04-04 (D4-10 mode-switch anchor): the reader's current
  // article-global grapheme offset, kept fresh CONTINUOUSLY so a mode swap
  // can capture it synchronously BEFORE the render swap (Pitfall 7). In
  // scrolling mode a passive scroll listener updates it; in paginated mode
  // PaginatedSurface's onAnchorChange callback updates it. The value is the
  // offset of the topmost-visible block (scrolling) / the current page's
  // first block (paginated) — both in the SAME D-05 coordinate system.
  const currentAnchorOffsetRef = useRef(0);
  // D4-10 pending mode-swap: {from, offset} captured synchronously in the
  // toggle handler, consumed by the post-commit apply effect. Cleared on
  // consumption so a stale swap cannot re-apply.
  const pendingModeSwapRef = useRef<{ from: string; offset: number } | null>(null);
  // Plan 04-09 (PAGE-01 round-trip fix): the last known PRECISE paginated-mode
  // anchor offset (from PaginatedSurface's onAnchorChange, which carries
  // sub-block grapheme precision via pageStartGlobalOffset). The scrolling-mode
  // anchor (computeTopVisibleOffset) has BLOCK-LEVEL granularity only — it
  // returns the block's starting offset, losing the intra-block split point.
  // When the reader toggles scrolling→paginated, if the scrolling anchor and
  // this precise offset are in the SAME block, we prefer the precise offset
  // so the reader re-lands on the exact page (not the page before the split).
  const lastPreciseAnchorRef = useRef<number | null>(null);
  const handleAnchorChange = useCallback((offset: number) => {
    currentAnchorOffsetRef.current = offset;
    // Track the latest precise offset (only updated in paginated mode where
    // PaginatedSurface reports via onAnchorChange).
    lastPreciseAnchorRef.current = offset;
  }, []);

  // Phase 4 Plan 04-04 (D4-09 + D4-10): the mode-toggle handler. Captures the
  // anchor SYNCHRONOUSLY before calling update() so the post-swap render can
  // re-anchor to the same passage. Registered on the App-provided ref so the
  // header ModeToggle button (and the M shortcut via PageTurnControls) share
  // ONE toggle path with ONE anchor capture.
  const handleToggleMode = useCallback(() => {
    // Capture BEFORE the mode swap re-renders (Pitfall 7). currentAnchor
    // OffsetRef is kept fresh by the scroll listener / onAnchorChange above.
    let offset = currentAnchorOffsetRef.current;
    const currentEffective = sessionModeOverride ?? settings.readingMode;
    // Plan 04-09 (PAGE-01 round-trip fix): when returning scrolling→paginated,
    // the scrolling-mode anchor has BLOCK-LEVEL granularity only. If the last
    // known PRECISE paginated offset (from onAnchorChange) falls in the SAME
    // block as the scrolling anchor, prefer the precise offset so the reader
    // re-lands on the exact page (not the page before a mid-block split).
    // This is the load-bearing fix for the D4-10 round-trip: without it,
    // block 2's start offset maps to page 0 (which contains block 2 [0-298]),
    // not page 1 (which starts at block 2 grapheme 299).
    if (currentEffective === "scrolling" && article && lastPreciseAnchorRef.current !== null) {
      const precise = lastPreciseAnchorRef.current;
      if (sameBlock(article, offset, precise)) {
        offset = precise;
        // Also update the ref so PaginatedSurface's initialAnchorOffset prop
        // (which reads currentAnchorOffsetRef.current) receives the precise
        // value, not the block-level scrolling anchor.
        currentAnchorOffsetRef.current = precise;
      }
    }
    pendingModeSwapRef.current = {
      from: currentEffective,
      offset,
    };
    if (sessionModeOverride !== null) {
      // Reader is in a session-overridden fallback mode and toggling back to
      // their persisted preference — clear the override WITHOUT persisting.
      // The fallback never persisted; the reader returns to the mode they
      // chose. The D4-10 anchor in pendingModeSwapRef preserves the passage.
      // This SAME path serves the banner's "Switch to pages" action so the
      // anchor applies either way (header button / M / banner button share
      // ONE toggle path).
      setSessionModeOverride(null);
      setShowFallbackBanner(false);
    } else {
      // Normal user-initiated toggle — persist the choice. T-04-15: only
      // this user-initiated path writes the persisted readingMode; the
      // fallback subscription NEVER calls update({readingMode}).
      update({
        readingMode: settings.readingMode === "paginated" ? "scrolling" : "paginated",
      });
    }
  }, [settings.readingMode, sessionModeOverride, update, article]);

  // Register the handler on the App-provided ref. Updated every render so the
  // closure always sees the latest settings.readingMode; cleared on unmount
  // so App falls back to the plain-preference-flip path.
  useEffect(() => {
    modeToggleHandlerRef.current = handleToggleMode;
    return () => {
      modeToggleHandlerRef.current = null;
    };
  }, [handleToggleMode, modeToggleHandlerRef]);

  // Plan 04-09 (PAGE-01 M-toggle round-trip fix): register the M shortcut
  // GLOBALLY on window in BOTH paginated and scrolling modes. Prior to this
  // fix the M listener lived in PageTurnControls, which only mounts when
  // `paginatedActive === true`. After the first M flips mode to scrolling,
  // PageTurnControls unmounts → the listener is removed → the second M (in
  // scrolling mode) has no handler → the persisted readingMode never flips
  // back. Moving the listener here (registered whenever an article + its
  // <article> element are mounted, regardless of mode) closes the round-trip.
  //
  // Ref-stable closure pattern (mirrors PageTurnControls L107-108): the
  // listener is registered once per article mount and reads the LATEST
  // handleToggleMode via a ref, so it always invokes a closure that sees the
  // current effectiveMode (settings.readingMode OR sessionModeOverride). The
  // D4-10 anchor capture inside handleToggleMode is unchanged — it captures
  // currentAnchorOffsetRef BEFORE the swap (Pitfall 7).
  //
  // T-04-10 mitigation preserved: the listener bails on form fields / dialogs
  // / contenteditable via the SAME isFormField helper PageTurnControls uses
  // (one implementation, one contract). The M shortcut reads ONLY event.key;
  // never reads form-field values (T-04-09-01).
  const handleToggleModeRef = useRef(handleToggleMode);
  handleToggleModeRef.current = handleToggleMode;

  // Phase 5 Plan 05-02 (ANNO-01 — H/N shortcuts, UI-SPEC §Interaction 33):
  // H highlights the current selection (bare); N highlights + opens the note
  // popover (Plan 05-03). Both are SELECTION-DEPENDENT — they bail (no
  // preventDefault, no action) when window.getSelection() is collapsed or
  // captureSelection returns ok:false, so H/N are never hijacked while just
  // reading (UI-SPEC §Interaction 33 guard). The handler reads the annotation
  // API via the highlightApiRef bridge (populated by HighlightOverlayProvider
  // during render — see the provider's "PARENT ACCESS" comment).
  //
  // Ref-stable so the keydown closure always reads the latest bridge value
  // without re-registering the listener on every annotation state change.
  const handleHighlightShortcut = useCallback(
    async (withNote: boolean): Promise<void> => {
      const api = highlightApiRef.current;
      const readingRoot = articleRef.current;
      if (!api || !readingRoot) return;
      // Bail on collapsed/empty selection — H/N are selection-dependent.
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        return;
      }
      const result: CreateFromSelectionResult =
        await api.createHighlightFromSelection(readingRoot);
      if (!result.ok) return; // invalid selection — toolbar shows the hint
      // ANNO-01: clear the selection so the <mark> renders cleanly (the
      // ephemeral DOM Range is gone; the durable anchor persists).
      window.getSelection()?.removeAllRanges();
      // Clear the toolbar state so it dismisses on highlight creation
      // (UI-SPEC §Interaction 25 lifecycle: "Either action button is
      // activated → the toolbar's job is done").
      setSelectionRect(null);
      setCaptureResult(null);
      if (withNote) {
        // N: open the note popover for the new highlight (Plan 05-03's
        // NotePopover reads openPopoverFor from the provider).
        api.setOpenPopoverFor(result.highlightId);
      }
    },
    [],
  );
  const handleHighlightShortcutRef = useRef(handleHighlightShortcut);
  handleHighlightShortcutRef.current = handleHighlightShortcut;

  useEffect(() => {
    if (!article || !articleEl) return;
    const onKey = (event: KeyboardEvent) => {
      if (isFormField(event.target)) return;
      const key = event.key;
      // Phase 5 Plan 05-05 (D5-10 / UI-SPEC §Interaction 29): activating a
      // focused <mark> via Enter/Space opens the inline note popover. The
      // <mark> carries tabindex=0 + data-highlight-id; the delegated
      // activation calls setOpenPopoverFor so NotePopover's showPopover
      // effect runs. (Click activation is handled by the delegated click
      // listener below.)
      if (key === "Enter" || key === " ") {
        const target = event.target as HTMLElement | null;
        const mark = target?.closest?.("mark.highlight[data-highlight-id]") as HTMLElement | null;
        if (mark) {
          event.preventDefault();
          const id = mark.getAttribute("data-highlight-id");
          const api = highlightApiRef.current;
          if (id && api) api.setOpenPopoverFor(id);
          return;
        }
      }
      if (key === "m" || key === "M") {
        // Does NOT preventDefault (M has no native default action to suppress)
        // and does NOT move focus (the shortcut did not start from the toggle
        // — UI-SPEC §19). handleToggleMode captures the D4-10 anchor + flips
        // the persisted readingMode (or clears the session override).
        handleToggleModeRef.current();
        return;
      }
      // Phase 5 Plan 05-02 (UI-SPEC §Interaction 33): H/N highlight the
      // current selection. preventDefault is NOT called — H/N have no native
      // default action worth suppressing, and calling preventDefault
      // unconditionally would break H/N inside inputs (already guarded by
      // isFormField above, but defense-in-depth).
      if (key === "h" || key === "H") {
        void handleHighlightShortcutRef.current(false);
      } else if (key === "n" || key === "N") {
        void handleHighlightShortcutRef.current(true);
      }
    };
    // Non-passive is fine here — M/H/N have no default action to suppress.
    // The listener is registered on window (captures shortcuts from anywhere
    // in the app while an article is mounted, EXCEPT inside form fields per
    // isFormField).
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [article, articleEl]);

  // Phase 5 Plan 05-05 (D5-10 / UI-SPEC §Interaction 29): delegated click
  // activation on inline <mark.highlight> elements. Clicking a highlight opens
  // the inline note popover (setOpenPopoverFor → NotePopover's showPopover
  // effect). Delegation (rather than per-mark onClick props) avoids drilling
  // an activation callback through BlockRenderer → InlineList → mark and
  // keeps InlineRenderer a pure presentational component. The listener is
  // scoped to the article element so clicks in chrome/header don't trigger.
  useEffect(() => {
    const root = articleRef.current;
    if (!article || !root) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const mark = target?.closest?.("mark.highlight[data-highlight-id]") as HTMLElement | null;
      if (!mark) return;
      const id = mark.getAttribute("data-highlight-id");
      const api = highlightApiRef.current;
      if (id && api) {
        api.setOpenPopoverFor(id);
      }
    };
    root.addEventListener("click", onClick);
    return () => {
      root.removeEventListener("click", onClick);
    };
  }, [article, articleEl]);

  // Phase 5 Plan 05-02 (UI-SPEC §Interaction 24): selectionchange listener
  // tracking the live selection rect for the SelectionToolbar (Task 2
  // consumes selectionRect via props). rAF-throttled so rapid selection
  // shaping doesn't thrash React state. Registered whenever an article + its
  // element are mounted (both modes — the scrolling .article-body and the
  // paginated .page-fragment are both inside articleRef).
  useEffect(() => {
    if (!article || !articleEl) return;
    let rafId: number | null = null;
    const onSelectChange = () => {
      if (rafId !== null) return; // coalesce — one rAF per frame
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
          setSelectionRect(null);
          setCaptureResult(null);
          return;
        }
        // Only track selections inside the article element (the reading
        // surface). Selections outside (e.g. in chrome) don't trigger the
        // toolbar.
        const range = selection.getRangeAt(0);
        const articleNode = articleRef.current;
        if (
          !articleNode ||
          !articleNode.contains(range.startContainer) ||
          !articleNode.contains(range.endContainer)
        ) {
          setSelectionRect(null);
          setCaptureResult(null);
          return;
        }
        // Skip selections inside the hidden measurement body (D5-08 — should
        // never happen due to user-select:none, but defend).
        const measurementBody = articleNode.querySelector(
          ".article-body-measurement",
        );
        if (
          measurementBody &&
          (measurementBody.contains(range.startContainer) ||
            measurementBody.contains(range.endContainer))
        ) {
          setSelectionRect(null);
          setCaptureResult(null);
          return;
        }
        setSelectionRect(range.getBoundingClientRect());
        // Compute the enriched capture result for the toolbar display
        // (capture + D5-13 overlap check — no highlight created).
        const api = highlightApiRef.current;
        if (api) {
          setCaptureResult(api.captureCurrentSelection(articleNode));
        }
      });
    };
    document.addEventListener("selectionchange", onSelectChange, {
      passive: true,
    });
    return () => {
      document.removeEventListener("selectionchange", onSelectChange);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [article, articleEl]);

  // Phase 4 Plan 04-04 (D4-10 anchor tracking — scrolling mode): keep
  // currentAnchorOffsetRef fresh on every scroll so the capture at toggle
  // time reads the live position. Only registered in scrolling mode.
  useEffect(() => {
    if (isPaginated || !article || !articleEl) return;
    const capture = () => {
      if (!articleRef.current) return;
      currentAnchorOffsetRef.current = computeTopVisibleOffset(
        article,
        queryBlocks(articleRef.current),
      );
    };
    capture(); // initialize at current scroll
    window.addEventListener("scroll", capture, { passive: true });
    return () => window.removeEventListener("scroll", capture);
  }, [isPaginated, article, articleEl]);

  // Phase 4 Plan 04-04 (D4-10 anchor apply — paginated→scrolling): after the
  // mode swap commits, silent-scroll the scrolling ArticleBody to the captured
  // offset via the SAME findScrollTarget helper Phase 2's location-restore
  // uses (no fork). rAF-deferred so the blocks are positioned before the query.
  //
  // Phase 4 Plan 04-05: tracks effectiveMode (NOT settings.readingMode) so a
  // session-override fallback flip (which does NOT change settings.readingMode)
  // still triggers the paginated→scrolling re-anchor.
  const prevEffectiveModeRef = useRef(effectiveMode);
  useEffect(() => {
    const prev = prevEffectiveModeRef.current;
    prevEffectiveModeRef.current = effectiveMode;
    const swap = pendingModeSwapRef.current;
    if (!swap || prev === effectiveMode) return;
    pendingModeSwapRef.current = null;
    // Only the paginated→scrolling path needs a post-commit apply here — the
    // scrolling→paginated path is handled by PaginatedSurface's
    // initialAnchorOffset prop (read at mount from currentAnchorOffsetRef).
    if (swap.from === "paginated" && effectiveMode === "scrolling") {
      if (swap.offset > 0 && article && articleRef.current) {
        const rafId = requestAnimationFrame(() => {
          if (!articleRef.current || !article) return;
          const blocks = queryBlocks(articleRef.current);
          // Silent + instant (A11Y-06) — never behavior: "smooth".
          findScrollTarget(article, blocks, swap.offset)?.scrollIntoView({
            block: "start",
          });
        });
        return () => cancelAnimationFrame(rafId);
      }
    }
  }, [effectiveMode, article]);

  // Paginated geometry: derive the page content-box height from the rendered
  // <article class="paginated-surface"> element after mount. rAF-deferred
  // (mirror L172-188) so the browser has completed layout before we read.
  // Recomputed on articleEl change (article swap or first mount).
  const [pageContentBoxHeightPx, setPageContentBoxHeightPx] = useState(0);
  // Plan 04-09 (PAGE-01 round-trip fix): reset pageContentBoxHeightPx to 0
  // SYNCHRONOUSLY DURING RENDER when the mode changes. React child effects
  // (PaginatedSurface's pagination effect) run BEFORE parent effects
  // (ArticleView's geometry effect), so the effect-based reset below was too
  // late — the pagination effect ran with stale scrolling-mode height on the
  // first render after a mode swap, produced wrong pages, and overwrote the
  // D4-10 anchor via onAnchorChange before the correct-height pass could run.
  // This is the official React pattern for adjusting state when a prop changes
  // (https://react.dev/reference/react/useState#storing-information-from-previous-renders).
  const [prevIsPaginated, setPrevIsPaginated] = useState(isPaginated);
  if (isPaginated !== prevIsPaginated) {
    setPrevIsPaginated(isPaginated);
    setPageContentBoxHeightPx(0);
  }
  // Plan 04-06: recompute the page-content-box height on article mount AND
  // when the active render mode changes (trustedView commits → paginatedActive
  // flips → PaginatedSurface mounts with the .paginated-surface geometry).
  // The .paginated-surface CSS pins the height to calc(100vh - 48px - 2px -
  // 2*var(--space-2xl)) — a much smaller value than the natural scrolling
  // ArticleBody height. Without recomputing on mode swap, the engine would
  // receive the OLD scrolling height (~1148px for a long-form essay) and
  // produce 1 giant overflowing page. Deps are primitives so this hook runs
  // unconditionally (no hooks-after-conditional-return violation).
  useEffect(() => {
    if (!articleEl) return;
    let cancelled = false;
    const rafId = requestAnimationFrame(() => {
      if (cancelled) return;
      // Plan 05-06: gate the geometry read on the .paginated-surface class.
      // On initial load trustedView is null, so the scrolling article branch
      // (className "article-body", no pinned height) mounts first; the first
      // rAF would otherwise read the full natural scrolling-body height
      // (~1148–1313px) and the first pagination pass would pack the ENTIRE
      // article onto P1 (the mega-page regression). The .paginated-surface
      // class is applied only once trustedView commits and the paginated
      // branch mounts (app.css pins height to calc(100vh - 48px - 2px -
      // 2*var(--space-2xl)) ≈ 654px desktop). Because trustedView is in the
      // effect deps, the effect re-runs when trustedView commits (class flips
      // to paginated-surface), the rAF re-fires, and the now-pinned height is
      // accepted. The pagination effect (PaginatedSurface) guards on
      // pageContentBoxHeightPx > 0, so it waits for the correct height and
      // never consumes the inflated scrolling height. The useState(0) initial
      // value keeps the first render at 0 (pagination waits), so no separate
      // initial-mount reset is needed.
      if (!articleEl.classList.contains("paginated-surface")) return;
      const rect = articleEl.getBoundingClientRect();
      setPageContentBoxHeightPx(rect.height);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [articleEl, isPaginated, trustedView]);

  // Phase 4 Plan 04-05 (PAGE-04 + PAGE-09 — DiagnosticBus subscription):
  // subscribe to the SAME DiagnosticBus instance threaded from useMeasurement
  // (T-04 contract — never construct a second `new DiagnosticBus()` here).
  // Only dom-fallback + measurement-error events surface the reader-visible
  // banner + flip the session-mode override to scrolling; the other 4 kinds
  // stay silent record (UI-SPEC §23 mapping — D3-05 closed set). The banner
  // copy is STATIC UI-SPEC text (T-04-14: DiagnosticEvent fields are NEVER
  // rendered raw). The session flip does NOT call update({readingMode}) — the
  // persisted preference is untouched (T-04-15).
  useEffect(() => {
    // Seed from recent() in case a fallback fired before subscribe registered
    // (parent effects run after the child useMeasurement engine mount; a
    // synchronous emit would otherwise be missed).
    const recent = diagnostics.recent();
    const hasReaderVisibleFallback = recent.some(
      (e) => e.kind === "dom-fallback" || e.kind === "measurement-error",
    );
    if (hasReaderVisibleFallback) {
      setShowFallbackBanner(true);
      setSessionModeOverride((prev) => prev ?? "scrolling");
    }
    const unsub = diagnostics.subscribe((event) => {
      if (event.kind === "dom-fallback" || event.kind === "measurement-error") {
        setShowFallbackBanner(true);
        setSessionModeOverride("scrolling");
      }
    });
    return unsub;
  }, [diagnostics]);

  // Load article on articleId change (cancelled-flag pattern preserved from
  // Phase 1 — a slow load cannot overwrite a fast in-flight update).
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setArticle(null);
    // Reset restore state on article swap so a stale banner from the previous
    // article doesn't flash before the new article's restore runs.
    setRestoredOffset(null);
    setShowResumeBanner(false);
    setProgress(0);
    // Phase 4 Plan 04-05: reset the fallback banner + session-mode override
    // on article swap so a fallback from the previous article doesn't carry
    // over (the DiagnosticBus ring buffer is shared across articles via the
    // stable useMeasurement diagnosticsRef, so recent() seed alone cannot
    // distinguish articles).
    setShowFallbackBanner(false);
    setSessionModeOverride(null);
    // Phase 5 Plan 05-02: reset annotation state on article swap so a stale
    // announcement + selection rect from the previous article don't flash.
    setAnnotationAnnouncement(null);
    setSelectionRect(null);
    setCaptureResult(null);
    highlightApiRef.current = null;
    // Phase 5 Plan 05-04: reset the one-time unresolved-announce guard so
    // the new article's eager batch-resolve can fire its own "{N} couldn't
    // be relocated." announce if it has unresolved highlights.
    unresolvedAnnouncedRef.current = false;
    openArticle(articleId)
      .then((a) => {
        if (cancelled) return;
        setArticle(a);
        setStatus(a ? "ready" : "error");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [articleId]);

  // Restore saved location on article ready (STATE-01). Mirrors the
  // cancelled-flag async pattern: a slow loadLocation cannot overwrite an
  // article swap. The scrollIntoView is silent (no behavior: "smooth") —
  // under prefers-reduced-motion the global CSS gate sets scroll-behavior:
  // auto; otherwise the default is also instant (we never declare smooth).
  useEffect(() => {
    if (!article) return;
    let cancelled = false;
    loadLocation(article.id, article.revision)
      .then((result) => {
        if (cancelled) return;
        // Three silent fall-through cases (no banner, no error surface):
        //   - storage failure (result.ok === false) — STATE-05 handles via
        //     the StorageBanner; reading continues from the top
        //   - no saved location (result.location === null) — first open or
        //     revision changed since save (D-06 key isolates)
        //   - findScrollTarget returns null — corpus has no blocks
        if (!result.ok || !result.location) return;
        const loc = result.location;
        // Wait one animation frame so the article body is committed to the
        // DOM before we query block elements. The effect already runs after
        // React's commit, but the browser layout pass may not have positioned
        // the blocks yet — rAF defers to just before paint.
        const rafId = requestAnimationFrame(() => {
          if (cancelled) return;
          const articleEl = articleRef.current;
          if (!articleEl) return;
          const blocks = queryBlocks(articleEl);
          const target = findScrollTarget(article, blocks, loc.graphemeOffset);
          if (target) {
            // Silent restore — never behavior: "smooth". The global reduced-
            // motion gate (app.css) sets scroll-behavior: auto so this is
            // instant under reduced motion; the default elsewhere is also
            // instant (no scroll-behavior: smooth declared anywhere).
            target.scrollIntoView({ block: "start" });
          }
          setRestoredOffset(loc);
          setShowResumeBanner(true);
        });
        // rAF cleanup on unmount/re-render — if the article swaps before the
        // frame fires, we cancel it so we don't scroll a stale article.
        return () => cancelAnimationFrame(rafId);
      })
      .catch(() => {
        // loadLocation never throws (it classifies internally), but defend
        // against any unexpected path — silent fall-through to top-of-article.
        if (cancelled) return;
      });
    return () => {
      cancelled = true;
    };
  }, [article]);

  // Scroll-progress ratio for the hairline (READ-05). Registered once the
  // article is ready; re-registers on article swap. Computed on every scroll
  // from window.scrollY / (scrollHeight - viewportHeight). Clamped to [0, 1]
  // by ProgressHairline defensively.
  useEffect(() => {
    if (!article) return;
    const onScroll = () => {
      const scrollMax =
        document.documentElement.scrollHeight - window.innerHeight;
      setProgress(scrollMax > 0 ? window.scrollY / scrollMax : 0);
    };
    // Initialize on mount so the hairline reflects the initial scroll
    // position (e.g. after a restore) rather than flashing from 0.
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [article]);

  // Auto-dismiss the resume banner on the reader's first scroll or pointer
  // activity (UI-SPEC §Interaction 10). Registered ONLY while the banner is
  // shown — so the restore-scroll cannot trigger the dismiss (the listener
  // is added after setShowResumeBanner(true) commits). Uses { once: true }
  // so a single event dismisses; cleanup removes both listeners on dismiss.
  useEffect(() => {
    if (!showResumeBanner) return;
    const dismiss = () => setShowResumeBanner(false);
    window.addEventListener("scroll", dismiss, { passive: true, once: true });
    window.addEventListener("pointerdown", dismiss, {
      passive: true,
      once: true,
    });
    return () => {
      window.removeEventListener("scroll", dismiss);
      window.removeEventListener("pointerdown", dismiss);
    };
  }, [showResumeBanner]);

  // Phase 4 Plan 04-05 (PAGE-09): auto-dismiss the fallback banner on the
  // reader's first scroll or pointer activity (UI-SPEC §Interaction 23 —
  // mirrors the ResumeBanner pattern above). Registered ONLY while the banner
  // is shown. The banner reappears if fallback re-triggers on a later
  // repagination (it is NOT one-per-session — the subscription re-shows it).
  // Auto-dismiss hides the banner only; the session-mode override stays so
  // the reader remains in scrolling until they explicitly Switch to pages /
  // toggle (the banner is non-blocking chrome, not the fallback itself).
  //
  // Plan 04-10 (PAGE-09 banner-race fix): the ORIGINAL ResumeBanner-style
  // pattern ({ passive: true, once: true } on BOTH scroll + pointerdown)
  // tears the banner down BEFORE the reader's "Switch to pages" / × click
  // lands on firefox + webkit. Two races compound:
  //   (a) Playwright's click actionability check fires a "scroll into view"
  //       which generates a scroll event → the scroll listener dismisses →
  //       React unmounts the banner → the subsequent click event finds the
  //       element detached → 30s timeout ("element was detached from the
  //       DOM, retrying").
  //   (b) The pointerdown that precedes the click fires on the banner (the
  //       pointer IS on the banner to click it) → the pointerdown listener
  //       dismisses → same detach.
  // Chromium passed both by timing luck; firefox + webkit expose the race.
  //
  // Fix (combines the plan's Fix A + a scroll debounce): the pointerdown
  // listener IGNORES events originating INSIDE the banner (pointer activity
  // ON the banner is the reader acting on it — the explicit onClick handlers
  // on the buttons handle their own dismissal). The scroll listener does NOT
  // use { once: true } — instead it SCHEDULES a dismiss after a short delay
  // (DISMISS_DELAY_MS). If a pointerdown inside the banner follows within
  // that window (the actual click on Switch to pages / ×), the pending
  // scroll-dismiss is CANCELLED so the click-action sequence completes
  // without the banner being torn down. A real user scrolling still dismisses
  // — the 300ms delay is imperceptible. A real user clicking outside the
  // banner dismisses immediately (the pointerdown-outside path). The
  // bannerEl.contains check reads only DOM geometry (EventTarget →
  // Node.contains) — pure layout check, no reader data (T-04-10-02 accept).
  useEffect(() => {
    if (!showFallbackBanner) return;
    const DISMISS_DELAY_MS = 300;
    let dismissTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleDismiss = () => {
      if (dismissTimer) return; // already scheduled — coalesce
      dismissTimer = setTimeout(() => {
        setShowFallbackBanner(false);
      }, DISMISS_DELAY_MS);
    };
    const cancelDismiss = () => {
      if (dismissTimer) {
        clearTimeout(dismissTimer);
        dismissTimer = null;
      }
    };
    const onScroll = () => {
      // Schedule rather than dismiss immediately so Playwright's scroll-into-
      // view (part of click actionability) doesn't tear the banner down
      // before the pointerdown/click that follows. If a pointerdown inside
      // the banner follows within DISMISS_DELAY_MS, cancelDismiss aborts it.
      scheduleDismiss();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      const bannerEl = document.querySelector(".pagination-fallback-banner");
      if (target instanceof Node && bannerEl && bannerEl.contains(target)) {
        // Pointer inside the banner — the reader is interacting with the
        // banner's own controls (Switch to pages / ×). Cancel any pending
        // scroll-dismiss so the click-action sequence completes without the
        // banner being torn down (the PAGE-09 race). The explicit onClick
        // handlers on the buttons handle their own dismissal.
        cancelDismiss();
        return;
      }
      // Pointer outside the banner — the reader is interacting elsewhere.
      // Dismiss immediately (no delay — this is unambiguous intent).
      setShowFallbackBanner(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    return () => {
      cancelDismiss();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [showFallbackBanner]);

  /** Resume reading — re-trigger the silent scroll to the saved offset. */
  const handleResume = () => {
    if (article && restoredOffset && articleRef.current) {
      const blocks = queryBlocks(articleRef.current);
      const target = findScrollTarget(
        article,
        blocks,
        restoredOffset.graphemeOffset,
      );
      target?.scrollIntoView({ block: "start" });
    }
    setShowResumeBanner(false);
  };

  /** Start from top — scroll to the article <h1> (provenance title). */
  const handleStartFromTop = () => {
    articleRef.current?.querySelector("h1")?.scrollIntoView({ block: "start" });
    setShowResumeBanner(false);
  };

  /**
   * Phase 5 Plan 05-03 (D5-11 navigate-back): drawer entry → passage.
   *
   * Closes the drawer, resolves the highlight's grapheme offset to its block
   * via data-block-index, then:
   *   - PAGINATED: fragmentContainingOffset(pages, offset) → turnToPage(pageIdx)
   *     (the D4-10/D4-11 anchor machinery in reverse — reuses anchor.ts).
   *   - SCROLLING: findScrollTarget(article, blocks, offset).scrollIntoView
   *     (reusing Phase 2's findScrollTarget EXACTLY — do not fork).
   * Then focuses the <mark> (D4-07 pattern — the reader navigated TO this
   * highlight, so they expect to land on it).
   *
   * Ambiguous/orphan entries never call this (their jump button is disabled —
   * the drawer component enforces ANNO-07's "never jump to an uncertain spot").
   */
  const handleNavigateBack = useCallback(
    (highlightId: string) => {
      onCloseDrawer();
      if (!article || !articleRef.current) return;
      const api = highlightApiRef.current;
      if (!api) return;
      const resolved = api.highlights.find(
        (h) => h.record.id === highlightId,
      );
      if (!resolved || !resolved.resolvedPosition) return;

      const offset = resolved.resolvedPosition.start;

      if (isPaginated) {
        // PAGINATED: resolve offset → page index via fragmentContainingOffset
        // (anchor.ts — D4-10/D4-11 machinery in reverse), then turn to that
        // page via the surface's turnToPage imperative handle.
        const surface = surfaceRef.current;
        const pages = surface?.getPages();
        if (surface && pages && pages.length > 0) {
          const pageIdx = fragmentContainingOffset(pages, offset, article);
          surface.turnToPage(pageIdx);
        }
      } else {
        // SCROLLING: findScrollTarget + scrollIntoView (reusing Phase 2 EXACTLY).
        const blocks = queryBlocks(articleRef.current);
        const target = findScrollTarget(article, blocks, offset);
        target?.scrollIntoView({ block: "center" });
      }

      // Focus the <mark> after the turn/scroll commits (D4-07 pattern). The
      // rAF defers so the browser completes the layout before we query the mark.
      // Firefox quirk: scrollIntoView's async settle can race a single rAF
      // (the mark is in the DOM + focusable, but the rAF fires before the
      // scroll completes + the focus call doesn't land). A short setTimeout
      // belt-and-suspenders re-focuses after firefox's scroll settle so the
      // mark reclaims focus cross-engine.
      const focusMark = () => {
        document.getElementById(`hl-${highlightId}`)?.focus();
      };
      requestAnimationFrame(focusMark);
      window.setTimeout(focusMark, 120);
    },
    [article, isPaginated, onCloseDrawer],
  );

  if (status !== "ready" || !article) {
    return (
      <main id="main">
        <div className="status" role="status" aria-live="polite" aria-atomic="true">
          {status === "loading" ? (
            <p>Opening article…</p>
          ) : (
            <>
              <h1>Couldn't open this article.</h1>
              <p>The article could not be loaded. Select it again from the list, or try a different article.</p>
            </>
          )}
        </div>
      </main>
    );
  }

  const domain = new URL(article.provenance.sourceUrl).hostname;

  // Paginated mode mounts only when trustedView + articleEl are both ready;
  // otherwise we render the scrolling ArticleBody (the additive branch —
  // scrolling behavior stays byte-unchanged so existing tests regress
  // nothing). The .paginated-surface class is applied to the shared
  // <article> only when PaginatedSurface is actually mounted so the
  // overflow:hidden geometry never clips a fallback rendering.
  const paginatedActive = isPaginated && trustedView !== null && articleEl !== null;

  return (
    <>
      {/* READ-05: hairline is fixed under the header via CSS. Decorative —
          progress is conveyed to AT via the SectionAnnouncer live region.
          In paginated mode PaginatedSurface renders its own ProgressHairline
          with the N/M ratio (D4-08), so we skip the scrolling-mode hairline
          here to avoid a duplicate. */}
      {!paginatedActive && <ProgressHairline progress={progress} />}
      {/* A11Y-08: polite live region announcing section changes during scroll.
          articleEl is null during loading; the callback ref sets it once the
          <article> mounts, triggering a re-render so this component receives
          the actual DOM node. */}
      <SectionAnnouncer articleEl={articleEl} />
      <main id="main">
        {/*
          A11Y-08 (UI-SPEC §Copywriting "keyboard-help affordance"): a single
          concise visually-hidden paragraph at the top of <main>, preceding the
          article header in DOM order so it is announced once to AT on article
          open. Never visible — progressive enhancement for keyboard-first
          readers. Mirrors the skip-link pattern.
        */}
        <p className="visually-hidden">
          Keyboard shortcuts: M switches reading mode. PageUp and PageDown,
          ArrowLeft and ArrowRight, and Space and Shift+Space turn pages. H
          highlights the current selection. N highlights it and opens a note.
        </p>
        {/* Phase 5 Plan 05-02 (D5-12, A11Y-08): polite live region for
            annotation announces. Concise copy ("Highlight saved." / "Highlight
            deleted.") is written by useAnnotationState via the
            onStatusAnnounce callback wired below. Visually-hidden so it
            announces to AT without visual clutter (mirrors the SectionAnnouncer
            pattern). */}
        <div
          className="visually-hidden"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {annotationAnnouncement}
        </div>
        {showResumeBanner && (
          <ResumeBanner
            onResume={handleResume}
            onStartFromTop={handleStartFromTop}
            onDismiss={() => setShowResumeBanner(false)}
          />
        )}
        {showFallbackBanner && (
          <PaginationFallbackBanner
            // Switch to pages reuses the SAME toggle path as the header
            // button + M shortcut (handleToggleMode). When a session override
            // is active it clears the override (returns to the persisted
            // preference) WITHOUT persisting — the D4-10 anchor in
            // pendingModeSwapRef preserves the passage. If the oversize
            // persists the engine re-emits dom-fallback and the banner
            // reappears.
            onSwitchToPages={handleToggleMode}
            onDismiss={() => setShowFallbackBanner(false)}
          />
        )}
        {/* Phase 5 Plan 05-02: HighlightOverlayProvider wraps the article body
            (both scrolling + paginated branches) so the renderer (Task 2's
            BlockRenderer/InlineRenderer threading) + SelectionToolbar (Task 2)
            + NotePopover (Plan 05-03) all consume useHighlightOverlay(). The
            apiRef bridge lets this component's H/N handler call
            createHighlightFromSelection (a parent cannot useContext its own
            child's provider). onStatusAnnounce routes "Highlight saved." /
            "Highlight deleted." to the visually-hidden .status region above
            (D5-12, A11Y-08). onStorageError is a calm no-op for now — reading
            continues with in-memory state (D2-13); the existing StorageBanner
            handles STATE-05 for settings, and annotation failures degrade
            gracefully (highlights don't render but the article is readable). */}
        <HighlightOverlayProvider
          article={article}
          apiRef={highlightApiRef}
          onStatusAnnounce={setAnnotationAnnouncement}
          onStorageError={() => {
            /* STATE-05: annotation storage failure degrades gracefully —
               highlights don't render/save but reading continues. The
               existing StorageBanner (driven by SettingsContext) surfaces
               settings-level failures; annotation persistence is local-first
               and non-critical to the reading experience (D2-13). */
          }}
        >
        <article
          ref={articleCallbackRef}
          className={paginatedActive ? "article-body paginated-surface" : "article-body"}
        >
          <header>
            <h1>{article.provenance.title}</h1>
            {(article.provenance.author || article.provenance.publishedAt) && (
              <p className="meta">
                {article.provenance.author}
                {article.provenance.author && article.provenance.publishedAt && " · "}
                {article.provenance.publishedAt && formatDate(article.provenance.publishedAt)}
              </p>
            )}
            <a href={article.provenance.sourceUrl} rel="noopener noreferrer" target="_blank">
              Originally published at {domain}
              <span className="visually-hidden"> (opens in a new tab)</span>
            </a>
          </header>
          {paginatedActive && trustedView && articleEl ? (
            <>
              {/*
                Plan 04-08 (PAGE-06 + PAGE-07 cross-phase regression fix):
                a hidden ArticleBody is kept mounted alongside PaginatedSurface
                so the measurement engine's measureAllBlocks always finds the
                full set of [data-block-index] elements with valid geometry.
                Without this, PaginatedSurface replaces ArticleBody → the
                ResizeObserver-triggered re-measure (and every typography
                re-measure) reads 0 [data-block-index] elements → the engine's
                partial-DOM defense silently skips the commit → trustedView
                freezes at the initial value (PAGE-07) and the article DOM
                loses its block children when paginated activates (PAGE-06).

                The wrapper is aria-hidden + visually-hidden-but-layout-
                preserved (CSS class .article-body-measurement): visibility:
                hidden keeps boxes for getBoundingClientRect; position:absolute
                removes it from flow so PaginatedSurface owns the visible
                article height. aria-hidden keeps screen readers on the visible
                page fragment (the accessible content tree). pointer-events:
                none prevents any interaction. See app.css for the geometry
                contract.
              */}
              <div className="article-body-measurement" aria-hidden="true">
                <ArticleBody article={article} highlights={[]} />
              </div>
              {/*
                PaginatedSurface owns pages + currentPageIdx + the turn handler.
                The ref lets PageTurnControls (keyboard + swipe) drive the same
                state. initialAnchorOffset is the D4-10 scrolling→paginated
                anchor captured BEFORE the mode swap; onAnchorChange keeps
                currentAnchorOffsetRef fresh for the NEXT swap (paginated→
                scrolling).
              */}
              <PaginatedSurface
                ref={surfaceRef}
                article={article}
                trustedView={trustedView}
                articleEl={articleEl}
                diagnostics={diagnostics}
                pageContentBoxHeightPx={pageContentBoxHeightPx}
                initialAnchorOffset={currentAnchorOffsetRef.current}
                onAnchorChange={handleAnchorChange}
              />
              {/*
                PageTurnControls registers the keyboard bundle + swipe + the
                "Page N of M" announce. Enabled only while paginated mode is
                active. The M shortcut routes through the SAME handleToggleMode
                as the header button so the D4-10 anchor applies either way.
              */}
              <PageTurnControls
                enabled={paginatedActive}
                surfaceRef={surfaceRef}
                articleEl={articleEl}
              />
            </>
          ) : (
            <ArticleBody article={article} />
          )}
        </article>
        {/* Phase 5 Plan 05-02 Task 2: SelectionToolbar mounts as a sibling of
            the article body, INSIDE the provider so it can consume
            useHighlightOverlay() for createHighlightFromSelection. Passes
            selectionRect (tracked by the selectionchange listener above) +
            captureResult (computed via captureCurrentSelection — no highlight
            created) so the toolbar can show buttons vs. invalid hints.
            onHighlight/onHighlightAndNote reuse the SAME handleHighlightShortcut
            the H/N keyboard path uses (ONE create path, ONE capture → persist
            → clear-selection flow). */}
        <SelectionToolbar
          selectionRect={selectionRect}
          captureResult={captureResult}
          onHighlight={() => void handleHighlightShortcut(false)}
          onHighlightAndNote={() => void handleHighlightShortcut(true)}
        />
        {/* Phase 5 Plan 05-03: NotePopover mounts inside the provider so it
            can consume useHighlightOverlay() for openPopoverFor coordination
            state + CRUD (updateNote/flushNoteSave/deleteHighlight). The
            popover is controlled by the provider's openPopoverFor state
            (set by the N shortcut, "Highlight + note" toolbar button, or
            activating a <mark>). popover="manual" → typing doesn't
            light-dismiss; top-layer rendering with no backdrop. */}
        <NotePopover />
        {/* Phase 5 Plan 05-03 Task 2: AnnotationsDrawer — native <dialog>
            reading-order list + empty-state + navigate-back. Reads highlights
            from useHighlightOverlay(); the onNavigate handler runs D5-11
            (fragmentContainingOffset/commitTurn paginated OR findScrollTarget/
            scrollIntoView scrolling → focus the <mark>). onEditNote opens the
            inline popover for Edit/Delete after a navigate-back or directly. */}
        <AnnotationsDrawer
          open={drawerOpen}
          onClose={onCloseDrawer}
          onNavigate={handleNavigateBack}
          onEditNote={(id) => {
            const api = highlightApiRef.current;
            if (api) api.setOpenPopoverFor(id);
          }}
        />
        </HighlightOverlayProvider>
      </main>
    </>
  );
}
