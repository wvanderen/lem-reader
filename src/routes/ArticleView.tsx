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
//      loadLocation → findScrollTarget → silent scrollIntoView → marker.
//   2. useScrollSave(article, articleRef) — debounced ~1200ms save + dual
//      bfcache-safe flush (visibilitychange-hidden + pagehide); Plan 18-03
//      additionally feeds paginated page-turn offsets through its scheduler.
//   3. ProgressHairline + scroll-progress ratio tracking (READ-05).
//   4. SectionAnnouncer (IntersectionObserver scroll-spy, debounced) +
//      RestorationMarker (Plan 18-03 — the passive transient cue that
//      replaced the retired ResumeBanner, D18-06: reopen-restore only,
//      never blocks or shifts content, auto-clears at 4s).
import { useCallback, useEffect, useRef, useState } from "react";
import { openArticle } from "../content/repository";
import type { CanonicalArticle } from "../content/types";
import type { Book } from "../content/schema";
import { ArticleBody } from "../content/render/BlockRenderer";
import type { ArticleBodyHighlight } from "../content/render/BlockRenderer";
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
// Phase 18 Plan 18-03 (ORNT-06, D18-05/06): the passive transient
// restoration marker replaces the retired ResumeBanner — the banner's
// announce discipline survives verbatim INSIDE the marker.
import { RestorationMarker } from "../reader/RestorationMarker";
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
// Phase 20 Plan 20-04 (IMG-03/IMG-06): per-article figure-asset resolution.
// The provider wraps the <article> element so BOTH the visible body
// (scrolling ArticleBody / paginated page fragments) and the hidden
// measurement body render from the ONE stable object-URL map — per-article
// resolution means deterministic geometry with no per-turn create/revoke
// churn, and measurement sees the same reserved figure boxes the visible
// pages will (decode is paint, never layout — D20-13).
import { AssetProvider } from "../content/assets/AssetProvider";
import { SelectionToolbar } from "../reader/annotations/SelectionToolbar";
// Phase 5 Plan 05-03: NotePopover (Popover API manual + debounced save +
// two-step delete) + AnnotationsDrawer (native <dialog> reading-order list +
// navigate-back). Both consume useHighlightOverlay() inside the provider.
import { NotePopover } from "../reader/annotations/NotePopover";
import { AnnotationsDrawer } from "../reader/annotations/AnnotationsDrawer";
import { fragmentContainingOffset } from "../pagination/anchor";
// Plan 08-04 (LIB-04 + D8-05) — TagEntry edits tags WHILE reading. Plan
// 13-10 (G5) mounts it inside the top-bar tag popover (see the .tag-popover
// surface below). Inert at mount (Pitfall 8-5 — does NOT steal focus from
// the article body).
import { TagEntry } from "../reader/TagEntry";
import { BackToLibrary } from "../reader/BackToLibrary";
// Phase 18 Plan 18-02 (ORNT-01/03/04/05): the non-modal TOC panel + the
// derived-entry type consumed by the mode-aware jump handler (the D5-11
// tail — canonical D-05 offsets, never page numbers or DOM identity).
import { TocPanel } from "../reader/TocPanel";
import type { TocEntry } from "../content/toc";
// Plan 09-05 (D9-06, PORT-03) — per-article "Export highlights": the fixed
// markdown template over this article's highlights+notes (collectHighlight
// Entries re-resolves the honest tri-state through the SHIPPED resolver —
// no forked resolution logic), a sanitizeFilename-derived download name, and
// a calm visually-hidden live-region announcement.
import {
  collectHighlightEntries,
  renderArticleHighlights,
} from "../portability/markdown";
import { sanitizeFilename } from "../portability/zipSlip";
import { downloadBlob } from "../portability/download";
import { loadAllHighlights } from "../persistence/highlightsStore";
import { loadAllNotes } from "../persistence/notesStore";
// Plan 12-06 (ING-05 — D12-08 + D12-05): the epub-chapter context line +
// end-of-chapter navigation. The Book record loads through the booksStore
// seam (getBook is Zod-validated + tolerant — a missing/corrupt row returns
// null and renders neither the line nor the nav, never an error state); the
// "Chapter N" ordinal derives from the book's own TOC via chapterOrdinal
// (D12-06 — publisher intent is the unit of truth). Ordinary articles never
// reach either code path (the load effect gates on source "epub-chapter").
import { getBook } from "../persistence/booksStore";
import { chapterOrdinal } from "../ingestion/library/bookProgress";
// Plan 14-03 Task 2 (D14-02) — the per-destination document.title via the
// ONE shared helper (pageMeta owns the suffix, separator, and 64-char
// truncation; ArticleView never string-builds its own title tail).
import { setDocumentTitle } from "../ingestion/library/pageMeta";
// Plan 17-03 (META-02 downstream / D17-09) — the ONE effective-value
// derivation feeds every article-owned reader display site: document.title
// (standalone + the ARTICLE half of the chapter combo), byline, h1, and the
// per-article export filename (OQ5 pinned effective). The chapter-nav
// NEIGHBOR titles and the chapter-combo's BOOK half stay canonical
// (D17-06/D17-05 — chapters and books are not overridable this phase).
import {
  effectiveTitle,
  effectiveAuthor,
} from "../ingestion/library/effectiveMetadata";

/** The D4-10 mode-toggle handler signature (App threads a ref of this shape). */
type ModeToggleHandler = () => void;

/**
 * 260820 giant-article freeze: the referentially-stable empty highlights
 * array for ArticleBody's memoized measurement-body call sites. An inline
 * `highlights={[]}` literal would defeat React.memo's identity comparator
 * (new array per render → full block-tree re-render on every progress /
 * pageState update in the owner). Module-level const: zero allocations,
 * stable identity across renders, semantically read-only.
 */
const EMPTY_HIGHLIGHTS: readonly ArticleBodyHighlight[] = [];

export interface ArticleViewProps {
  articleId: string;
  /**
   * Plan 10-03 (D10-03 / RECV-01.c): the /h/<highlightId> deep-link param
   * captured by parseHash (Plan 10-02). When present, a dedicated on-mount
   * jump effect waits out the three async settles (article load, highlight
   * resolution, first pagination commit), jumps to the highlight using the
   * existing D5-11 machinery, focuses the <mark>, and silently strips the
   * suffix via history.replaceState (never a location.hash assignment —
   * that would re-fire the router mid-view). Unresolvable ids are a calm
   * no-op (Pitfall 4). Undefined for normal opens — the effect does not
   * run and behavior is byte-identical to pre-10-03.
   */
  jumpHighlightId?: string;
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
   * Plan 13-10 (G5 — the drawerOpen pattern): tag-popover open state, owned
   * by App so Header (the tags-trigger) and this component (which mounts the
   * popover surface wrapping the byte-unchanged TagEntry) share one source
   * of truth. The popover's native light-dismiss/Esc close routes back
   * through onCloseTags (the toggle-event close seam below).
   */
  tagsOpen: boolean;
  /** Plan 13-10: close the tag popover (App's setter). */
  onCloseTags: () => void;
  /**
   * Phase 18 Plan 18-02 (D18-02 — the tagsOpen pattern): TOC panel open
   * state, owned by App so Header (the toc-trigger) and this component
   * (which mounts the TocPanel + owns the controlled popover seam) share one
   * source of truth. Every close path routes through the ONE toggle-event
   * seam below → onCloseToc (rule 18: view swaps close the panel through
   * the same seam via App's [view] reset).
   */
  tocOpen: boolean;
  /** Plan 18-02: close the TOC panel (App's setter). */
  onCloseToc: () => void;
  /**
   * Phase 5 Plan 05-03: push the resolved-highlight count up to App so the
   * Header badge stays in sync.
   */
  onAnnotationCountChange: (count: number) => void;
  /**
   * Plan 13-04 (D13-15): App's in-app navigation flag — true once an in-app
   * hashchange routed AFTER initial mount. Drives the BackToLibrary
   * affordance's history.back() vs "#/" fallback choice (Pitfall 7 — a
   * fresh deep-link tab must never exit the app on back).
   */
  hasAppHistory: boolean;
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
  jumpHighlightId,
  modeToggleHandlerRef,
  drawerOpen,
  onCloseDrawer,
  tagsOpen,
  onCloseTags,
  tocOpen,
  onCloseToc,
  onAnnotationCountChange,
  hasAppHistory,
}: ArticleViewProps) {
  const [article, setArticle] = useState<CanonicalArticle | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  // Phase 18 Plan 18-03 (ORNT-06, D18-05/08): the restoration marker mount
  // state — replaces the retired ResumeBanner's showResumeBanner flag. The
  // marker mounts ONLY when a reopen-restore genuinely landed (a saved
  // LocationRecord existed AND the restore resolved this mount); the offset
  // is the saved record's value and the mode is the mode the restore landed
  // in. Never on first open with no location, never on TOC jumps (their cue
  // is focus-on-heading), never on Highlights deep-links (jumpPendingRef
  // suppresses the restore effect entirely).
  const [restorationMarker, setRestorationMarker] = useState<{
    offset: number;
    mode: "scrolling" | "paginated";
  } | null>(null);
  // One-shot guard (the shipped previous-value comparison pattern): the
  // restore effect may re-run (StrictMode twin-mount, effect re-entry) —
  // only the FIRST resolution per article mounts the marker, keeping twin
  // runs idempotent (rule 17).
  const restorationMarkerArticleRef = useRef<CanonicalArticle | null>(null);
  const [progress, setProgress] = useState(0);

  // Plan 12-06 (D12-08 + D12-05): epub-chapter context. chapterContext holds
  // the resolved Book plus the derived neighbor chapter ids (next/prev within
  // the book's ordered TOC); null renders NEITHER the context line NOR the
  // chapter nav (tolerant lookup — a missing/corrupt book record is a calm
  // no-chrome read, never an error state). neighborTitles carries the
  // next/prev chapter titles for the nav's lighter span (null → the bare
  // "Next chapter" / "Previous chapter" text). Both reset on article swap.
  const [chapterContext, setChapterContext] = useState<{
    book: Book;
    prevId: string | undefined;
    nextId: string | undefined;
  } | null>(null);
  const [neighborTitles, setNeighborTitles] = useState<{
    prev: string | null;
    next: string | null;
  }>({ prev: null, next: null });
  // Plan 12-06 (D12-05): the paginated surface's current {page, total},
  // mirrored from onAnchorChange (which fires on every page/pages commit) so
  // the chapter nav can mount the Next link ONLY on the final page and the
  // Previous link ONLY on the first page — never permanent chrome.
  const [pageState, setPageState] = useState<{ page: number; total: number } | null>(
    null,
  );

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
  // The enriched capture result for the current selection (ok / overlap /
  // empty / empty-span / ineligible / boundary-ineligible / measurement-body
  // — Phase 19 vocabulary). Computed in the selectionchange listener via the
  // provider's captureCurrentSelection (no highlight created). Drives the
  // toolbar's buttons-vs-hint rendering.
  const [captureResult, setCaptureResult] =
    useState<ToolbarCaptureResult | null>(null);
  // Plan 13-11 (G6 — ACPT-05 Flow C2/C3): the saved live Range from the
  // last VALID selection. Gecko/WebKit collapse the document selection
  // synchronously whenever DOM focus moves (verified inside the focus()
  // call itself — .planning/debug/flowc-selection-toolbar-nvda.md), so
  // the toolbar's keyboard activation path cannot rely on the live
  // selection. This ref holds range.cloneRange() from the
  // selectionchange valid branch below; its ONLY consumer is the restore
  // branch in handleHighlightShortcut (gated on focus being INSIDE the
  // toolbar). Cleared in every branch that clears
  // selectionRect/captureResult so it can never resurrect a stale
  // selection. The clone is the ONLY persisted selection state;
  // captureResult/selectionRect continue to drive display as before.
  const lastValidRangeRef = useRef<Range | null>(null);
  // Plan 13-11 (G6): event-time mirrors for the Tab-routing guard in the
  // window keydown listener below. That listener is registered once per
  // article mount (deps [article, articleEl] — the established
  // ref-stable pattern, cf. handleToggleModeRef), so it must NEVER close
  // over toolbar state; it reads these refs at EVENT time. Without this,
  // a Tab pressed from body AFTER a focus-exit dismissal would bounce
  // focus back to a stale toolbar in Chromium (the selection survives
  // focus moves there, so selectionchange never clears anything on its
  // own — the trap-proofing requirement).
  const captureOkRef = useRef(false);
  captureOkRef.current = captureResult?.ok === true;
  const toolbarRectActiveRef = useRef<DOMRect | null>(null);
  toolbarRectActiveRef.current = selectionRect;

  // Plan 09-05 (D9-06, PORT-03): per-article highlights export state. The
  // busy flag disables the header button while a download is in flight; the
  // announcement carries the result through a SECOND visually-hidden
  // role=status region (below) so export messages never clobber in-flight
  // annotation announces (mirrors the annotationAnnouncement pattern).
  const [exportingHighlights, setExportingHighlights] = useState(false);
  const [exportAnnouncement, setExportAnnouncement] = useState<string | null>(
    null,
  );

  // Plan 13-10 (G5 — the AnnotationsDrawer ownership pattern): the tag
  // popover surface (a native popover="auto" panel wrapping the
  // byte-unchanged TagEntry). App lifts tagsOpen; this component owns the
  // surface + its focus discipline. The trigger captured on open (Pitfall 1)
  // is the header tags-trigger button — restored on every close path.
  const tagPopoverRef = useRef<HTMLDivElement>(null);
  const tagsTriggerRef = useRef<HTMLElement | null>(null);

  // Sync the tagsOpen prop with the underlying popover's shown state
  // (mirrors the AnnotationsDrawer open/close effect). When opening,
  // capture document.activeElement as the trigger BEFORE showPopover() so
  // the close seam can restore it. When the prop closes programmatically
  // (view-swap reset), hide the surface; the hidePopover() call fires the
  // same toggle event the native paths use — one close seam for everything.
  useEffect(() => {
    const el = tagPopoverRef.current;
    if (!el) return;
    if (tagsOpen && !el.matches(":popover-open")) {
      tagsTriggerRef.current = document.activeElement as HTMLElement | null;
      el.showPopover();
    } else if (!tagsOpen && el.matches(":popover-open")) {
      el.hidePopover();
    }
  }, [tagsOpen]);

  // The popover toggle event: fires after every state change (open or
  // closed) — from showPopover()/hidePopover() AND the native light-dismiss
  // + Esc paths popover="auto" provides for free. On close, route through
  // onCloseTags (so App state stays in sync) and restore focus to the
  // captured trigger (Pitfall 1 — the same discipline as AnnotationsDrawer
  // and SettingsPanel).
  useEffect(() => {
    const el = tagPopoverRef.current;
    if (!el) return;
    const handleToggle = (event: Event) => {
      if ((event as ToggleEvent).newState === "closed") {
        onCloseTags();
        tagsTriggerRef.current?.focus();
      }
    };
    el.addEventListener("toggle", handleToggle);
    return () => el.removeEventListener("toggle", handleToggle);
  }, [onCloseTags]);

  // ── Phase 18 Plan 18-02: the TOC controlled seam (Pattern 1, adapted
  // from the tag popover above for popover="manual" — the first non-dialog
  // overlay; D18-01). Three coordinated pieces, and only these:
  //   (a) prop ↔ shown-state sync (captures the trigger BEFORE showPopover),
  //   (b) the ONE toggle-event close seam (state reset + focus restore),
  //   (c) the width-scoped outside-pointerdown policy (sheet mode only).
  // TocPanel owns its own manual-Esc keydown (routes into hidePopover, so
  // Esc lands in the same seam) and the entry-activation onActivate below.
  const tocPanelRef = useRef<HTMLDivElement>(null);
  const tocTriggerRef = useRef<HTMLElement | null>(null);

  // (a) Sync the tocOpen prop with the popover's shown state. When opening,
  // capture document.activeElement as the trigger BEFORE showPopover() so
  // the close seam can restore it (Pitfall 1). StrictMode-safe via the
  // :popover-open checks (rule 17 — twin-mount runs are idempotent).
  useEffect(() => {
    const el = tocPanelRef.current;
    if (!el) return;
    if (tocOpen && !el.matches(":popover-open")) {
      tocTriggerRef.current = document.activeElement as HTMLElement | null;
      el.showPopover();
    } else if (!tocOpen && el.matches(":popover-open")) {
      el.hidePopover(); // fires the same toggle event as every other path
    }
  }, [tocOpen]);

  // (b) The ONE close seam: trigger toggle, Esc (via TocPanel's keydown),
  // entry activation (handleTocJump), the sheet-mode outside pointerdown
  // below, and view swaps (App's [view] reset → prop false → (a)'s
  // hidePopover) ALL funnel through this single toggle listener — state
  // reset + focus-restore-to-trigger fire exactly once per close. There is
  // deliberately NO second focus-restore path (the Pattern 1 anti-pattern).
  useEffect(() => {
    const el = tocPanelRef.current;
    if (!el) return;
    const handleToggle = (event: Event) => {
      if ((event as ToggleEvent).newState === "closed") {
        onCloseToc();
        tocTriggerRef.current?.focus();
      }
    };
    el.addEventListener("toggle", handleToggle);
    return () => el.removeEventListener("toggle", handleToggle);
  }, [onCloseToc]);

  // (c) Width-scoped outside dismissal (UI-SPEC rule 4): at ≥640px the rail
  // is a persistent reading companion — outside clicks NEVER dismiss; at
  // ≤639px the full-width sheet covers the page, so a pointerdown outside
  // the panel (and outside the trigger) closes it through the seam. The
  // width check runs at EVENT time (a resized viewport needs no re-render).
  useEffect(() => {
    if (!tocOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!window.matchMedia("(max-width: 639px)").matches) return;
      const el = tocPanelRef.current;
      const target = event.target;
      if (!el || !(target instanceof Node)) return;
      if (el.contains(target)) return;
      if (tocTriggerRef.current?.contains(target)) return;
      el.hidePopover(); // routes through the one toggle seam
    };
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [tocOpen]);

  // (d) Manual Esc, the trigger half (UI-SPEC rule 3: "a keydown handler on
  // the open panel (and the trigger) routes Esc through hidePopover()").
  // TocPanel's own onKeyDown covers focus-inside-the-panel; this seam covers
  // focus on the TRIGGER — which is exactly where focus rests when Esc
  // arrives before the panel's open-focus rAF lands (the click that opened
  // the panel focused the trigger first). Scoped to those two targets only:
  // never a page-wide Esc hijack. preventDefault + hidePopover route into
  // the ONE close seam like every other path.
  useEffect(() => {
    if (!tocOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const el = tocPanelRef.current;
      const target = event.target;
      if (!el || !(target instanceof Node)) return;
      const inPanel = el.contains(target);
      const onTrigger = tocTriggerRef.current?.contains(target) ?? false;
      if (!inPanel && !onTrigger) return;
      event.preventDefault();
      el.hidePopover(); // routes through the one toggle seam
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [tocOpen]);

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
  // loading → ready transition. Phase 18 Plan 18-03 (Pitfall 2 closure):
  // the returned scheduler feeds paginated per-turn offsets
  // (handleAnchorChange) through the SAME debounced save + dual flush —
  // page turns fire no window scroll, so without this a pure-paginated
  // reader never persists a location at all.
  const scheduleLocationSave = useScrollSave(article, articleRef);

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
  // Phase 18 Plan 18-03: mode mirror for ASYNC-RESOLUTION-time reads. The
  // restore effect's loadLocation promise resolves after the render that
  // scheduled it — a closure capture would freeze the pre-hydration mode
  // (cold loads hydrate settings asynchronously; a scrolling-preferring
  // reader's article can settle while the default paginated value still
  // stands). The ref read at resolution time always sees the current mode.
  const isPaginatedRef = useRef(isPaginated);
  isPaginatedRef.current = isPaginated;

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
    // Phase 18 Plan 18-03 (Pitfall 2 closure — D18-06/UI-SPEC §Auto-Resolved
    // #8): persist the per-turn offset through the SHARED debounced save +
    // dual-flush discipline in useScrollSave (SAVE_DEBOUNCE_MS 1200; the
    // saveLocation call-site family stays singular there — never a direct
    // call here). Latest-wins: the initial page-1 commit's offset-0 save is
    // replaced by the restore turn's offset before the debounce fires, so a
    // reopen-restore never overwrites the reader's saved location with 0.
    scheduleLocationSave(offset);
    // Plan 12-06 (D12-05): mirror the committed page state (the handle reads
    // from refs, so by the time this effect-scoped callback runs the values
    // are post-commit) so the chapter nav's first/last-page gating reacts to
    // every turn WITHOUT lifting PaginatedSurface's page state up. The
    // functional update keeps object identity stable when the page did not
    // change (refragmentation that re-lands on the same page causes zero
    // re-render churn).
    setPageState((prev) => {
      const next = surfaceRef.current?.getState() ?? null;
      if (prev === next) return prev;
      if (
        prev !== null &&
        next !== null &&
        prev.page === next.page &&
        prev.total === next.total
      ) {
        return prev;
      }
      return next;
    });
    // scheduleLocationSave is a stable useCallback (empty deps in
    // useScrollSave) — listing it keeps the exhaustive-deps rule satisfied
    // without changing this callback's identity.
  }, [scheduleLocationSave]);

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
        // Plan 13-11 (G6 saved-range restore): Gecko/WebKit collapse the
        // selection synchronously when focus moved onto the toolbar, so
        // Enter on a focused toolbar button (or H/N with focus inside the
        // toolbar) arrives with a collapsed live selection. If focus is
        // INSIDE the toolbar and we hold the last valid Range, restore it
        // and fall through. The restored Range re-enters
        // createHighlightFromSelection → captureCurrentSelection, so the
        // single-block rule (D5-05/D5-06), overlap check (D5-13),
        // measurement-body guard, and grapheme capture all re-validate
        // against the live DOM — ONE creation path, zero forked
        // validation. The activeElement-inside-toolbar guard means H/N
        // pressed with focus anywhere else can never resurrect a stale
        // selection — the pre-fix keyboard-shortcut behavior is preserved
        // exactly. A stale/detached Range fails containment inside capture
        // and returns a typed not-ok → calm bail (no crash path).
        const active = document.activeElement;
        if (
          selection &&
          active instanceof Element &&
          active.closest(".selection-toolbar") !== null &&
          lastValidRangeRef.current !== null
        ) {
          selection.removeAllRanges();
          selection.addRange(lastValidRangeRef.current);
        } else {
          return;
        }
      }
      const result: CreateFromSelectionResult =
        await api.createHighlightFromSelection(readingRoot);
      if (!result.ok) return; // invalid selection — toolbar shows the hint
      // ANNO-01: clear the selection so the <mark> renders cleanly (the
      // ephemeral DOM Range is gone; the durable anchor persists).
      window.getSelection()?.removeAllRanges();
      // Clear the toolbar state so it dismisses on highlight creation
      // (UI-SPEC §Interaction 25 lifecycle: "Either action button is
      // activated → the toolbar's job is done"). Runs BEFORE any focus
      // move (Enter does not move focus), so the focus-exit dismissal
      // below can only ever be a no-op after this.
      setSelectionRect(null);
      setCaptureResult(null);
      lastValidRangeRef.current = null;
      if (withNote) {
        // N: open the note popover for the new highlight (Plan 05-03's
        // NotePopover reads openPopoverFor from the provider). Strictly
        // ordered: state-clear → toolbar unmount → popover opens — any
        // focusout the unmount dispatches is an idempotent no-op, never a
        // double-dismiss or resurrection.
        api.setOpenPopoverFor(result.highlightId);
      }
    },
    [],
  );
  const handleHighlightShortcutRef = useRef(handleHighlightShortcut);
  handleHighlightShortcutRef.current = handleHighlightShortcut;

  // Plan 13-11 (G6 — truth 4, the Tab-past exit): stable focus-exit
  // dismissal passed to SelectionToolbar as onFocusExit (the focusout
  // detection itself lives on the toolbar root — React's onFocusOut).
  // Clears the exact trio every other clear-branch clears. Idempotent by
  // construction (clearing already-cleared state is a no-op), which is
  // what makes it safe around both activation paths: the Enter/click
  // activation relies on its OWN clear above, which runs before any focus
  // move, and the withNote handoff is strictly ordered state-clear →
  // toolbar unmount → setOpenPopoverFor opens NotePopover. This is the
  // ONLY Tab-past dismissal mechanism in Chromium, where the live
  // selection survives the focus move so selectionchange never fires a
  // collapse — without it the toolbar would stay wedged (and the Tab
  // routing below would pull focus back from body indefinitely).
  const dismissToolbarFromFocusExit = useCallback(() => {
    setSelectionRect(null);
    setCaptureResult(null);
    lastValidRangeRef.current = null;
  }, []);

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
      // Plan 13-11 (G6 — Flow C2 Tab routing): a plain Tab from the reading
      // context routes focus DIRECTLY onto the toolbar's first button.
      // Without this, the toolbar sits near the END of DOM order (after
      // every article focusable — L1976-1990), so "Tab to it" meant a long
      // walk; and in Gecko/WebKit the FIRST Tab collapsed the selection and
      // unmounted the toolbar before focus could ever arrive (the G6
      // defect). Per engine: chromium keeps the live selection (activation
      // proceeds normally); firefox/webkit collapse it synchronously inside
      // focus() → the containment guard in the selectionchange listener
      // keeps the toolbar mounted. Guards, ALL evaluated at EVENT time
      // (refs — never a stale closure; this listener is registered once
      // per article mount):
      //   - plain Tab only (event.key === "Tab", NOT shiftKey — never
      //     touch Shift+Tab);
      //   - captureResult?.ok — never route into a hint-only toolbar (no
      //     buttons to focus);
      //   - selectionRect non-null — the toolbar is actually mounted;
      //   - activeElement is document.body OR contained by the article
      //     (the reading context). Dialogs/popovers (NotePopover, tag
      //     popover, AnnotationsDrawer) are never intercepted: their focus
      //     targets are outside articleRef and are not body;
      //   - activeElement NOT already inside .selection-toolbar — focus
      //     moves naturally within/past the toolbar;
      //   - a .selection-toolbar button actually exists in the mounted DOM
      //     right before preventDefault (trap-proofing: after the
      //     focus-exit dismissal unmounts the toolbar, this check fails →
      //     a Tab pressed from body proceeds natively → no bounce-back
      //     loop; load-bearing in Chromium, where the selection survives
      //     focus moves so stale state never clears on its own).
      if (key === "Tab" && !event.shiftKey) {
        const active = document.activeElement;
        const activeEl = active instanceof Element ? active : null;
        const articleNode = articleRef.current;
        const inReadingContext =
          active === document.body ||
          (activeEl !== null &&
            articleNode !== null &&
            articleNode.contains(activeEl));
        const insideToolbar =
          activeEl !== null &&
          activeEl.closest(".selection-toolbar") !== null;
        if (
          captureOkRef.current &&
          toolbarRectActiveRef.current !== null &&
          inReadingContext &&
          !insideToolbar
        ) {
          const toolbarBtn = document.querySelector<HTMLElement>(
            ".selection-toolbar button",
          );
          if (toolbarBtn) {
            event.preventDefault();
            toolbarBtn.focus();
            return;
          }
        }
        // Plan 13-11 (G6 — truth 4 completion): a Tab pressed ON the
        // toolbar's LAST button is "tabbing past the toolbar" — dismiss.
        // The focusout dismissal (SelectionToolbar's onFocusExit) covers
        // engines where focus actually moves OUT (chromium: focus →
        // body/next focusable → focusout → dismiss). Firefox, however,
        // leaves focus parked on the last focusable when nothing follows
        // it in the document (the toolbar IS the last focusable cluster —
        // verified: Tab from "Highlight + note" never moves focus → no
        // focusout fires → the toolbar would wedge). No preventDefault:
        // if the engine can move focus natively it may; this dismissal is
        // idempotent with any focusout that follows.
        if (insideToolbar) {
          const toolbarRoot = document.querySelector(".selection-toolbar");
          const toolbarButtons = toolbarRoot?.querySelectorAll("button");
          const lastBtn = toolbarButtons?.[toolbarButtons.length - 1];
          if (
            activeEl !== null &&
            lastBtn instanceof Element &&
            lastBtn.contains(activeEl)
          ) {
            dismissToolbarFromFocusExit();
          }
        }
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
    // Keydown listeners are never passive, so the Tab branch's
    // preventDefault (G6 routing) works; M/H/N have no default action of
    // their own.
    // The listener is registered on window (captures shortcuts from anywhere
    // in the app while an article is mounted, EXCEPT inside form fields per
    // isFormField).
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
    // dismissToolbarFromFocusExit is stable (useCallback, empty deps) — it
    // never re-registers this listener; listed for the exhaustive-deps rule
    // (Plan 13-11: NO state deps — the Tab branch reads refs at event time).
  }, [article, articleEl, dismissToolbarFromFocusExit]);

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
          // Plan 13-11 (G6 focus-containment hold): if the toolbar
          // currently owns focus, this collapse was caused by the focus
          // move itself (Gecko/WebKit collapse the selection
          // synchronously inside focus() — verified in
          // .planning/debug/flowc-selection-toolbar-nvda.md). The standard
          // floating-toolbar focus-containment pattern: keep the toolbar
          // mounted with its last captureResult/selectionRect while it
          // contains document.activeElement (the one-line check:
          // activeElement.closest(".selection-toolbar")). Intra-toolbar
          // survival (the Highlight → Highlight + note Tab move also
          // collapses the selection in Gecko/WebKit — activeElement stays
          // inside .selection-toolbar) routes here too. Focus-INTO and
          // intra-toolbar survival are owned by this guard; focus-EXIT is
          // owned by the toolbar's focusout → dismissToolbarFromFocusExit
          // (the onFocusExit prop). They never conflict: the guard holds
          // only while activeElement is inside the toolbar, and the
          // dismissal fires only when the incoming focus target is outside
          // it.
          const active = document.activeElement;
          if (
            active instanceof Element &&
            active.closest(".selection-toolbar") !== null
          ) {
            return; // the toolbar stays mounted while it owns focus
          }
          setSelectionRect(null);
          setCaptureResult(null);
          lastValidRangeRef.current = null;
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
          lastValidRangeRef.current = null;
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
          lastValidRangeRef.current = null;
          return;
        }
        setSelectionRect(range.getBoundingClientRect());
        // Plan 13-11 (G6): persist the valid Range for the toolbar's
        // keyboard activation path (the restore branch in
        // handleHighlightShortcut). Cloned — the live Range mutates with
        // the selection; the clone is the ONLY persisted selection state.
        lastValidRangeRef.current = range.cloneRange();
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

  // Paginated geometry: derive the usable page height from .page-viewport,
  // not from the surrounding <article>. The article also contains its visible
  // provenance header; treating the article's full height as page capacity
  // over-packs every fragment by roughly the header height and leaves clipped
  // text in the accessibility tree.
  const [pageContentBoxHeightPx, setPageContentBoxHeightPx] = useState(0);
  // Plan 13-04 (Option A — human decision 2026-08-18): the measured
  // margin-box height of the article-top metadata spot, threaded BOTH into
  // PaginatedSurface's firstPageReservedPx (the engine's page-1 budget) and
  // the --article-top-meta-reserve CSS var on .page-viewport (the page-1
  // fragment's flow height) — one value, one source, so the engine budget
  // and the rendered geometry always agree. Measured ONCE per article at
  // settle (same rAF batch as pageContentBoxHeightPx below, so the FIRST
  // pagination publication already carries the reserve — the
  // first-publication==settled contract holds). A mid-article typography
  // change or tag-add producing a stale reserve is the documented
  // guard-covered edge (the post-render overflow guard corrects any
  // overshoot); re-measuring would re-trigger pagination and oscillate.
  const [metaSpotReservePx, setMetaSpotReservePx] = useState(0);
  // null = not yet measured for this article; guards the measure-once rule.
  const metaSpotReserveRef = useRef<number | null>(null);
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
    // Plan 12-06 (D12-05): no stale page state across a mode swap — the
    // chapter nav's first/last-page gating re-arms on the next pagination
    // commit (onAnchorChange), so a stale "final page" from the previous
    // paginated session can never flash the Next link on re-entry.
    setPageState(null);
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
      // Plan 13-04 (Option A): measure the metadata spot's margin-box
      // height ONCE per article, after the measurement view commits
      // (fonts settled — the spot's wrap is final) and BEFORE the page
      // height below lands in the same rAF batch. PaginatedSurface's first
      // pagination pass therefore sees the reserve together with the
      // height: no intermediate reserve=0 publication, so first-publication
      // == settled (page-turn-stability) and page 1 is never displaced by
      // an unaccounted spot. The spot is mounted in BOTH modes at this
      // point (scrolling flow above the body / first child of
      // .page-viewport at article start), and its height is
      // width-determined — identical in either home.
      if (trustedView !== null && metaSpotReserveRef.current === null) {
        const spot = articleEl.querySelector<HTMLElement>(".article-top-meta");
        if (spot) {
          const rect = spot.getBoundingClientRect();
          const style = getComputedStyle(spot);
          const marginTop = parseFloat(style.marginTop) || 0;
          const marginBottom = parseFloat(style.marginBottom) || 0;
          const reserve = Math.ceil(rect.height + marginTop + marginBottom);
          metaSpotReserveRef.current = reserve;
          setMetaSpotReservePx(reserve);
        }
      }
      // Plan 13-09 (G4): the pinned-frame class no longer orders this read —
      // it now arrives with the pending placeholder frame at first paint, so
      // it is present BEFORE the engine has committed a trusted measurement
      // view, and reading the viewport height in that window would publish
      // page geometry with no metadata-spot reserve measured yet (an early
      // reserve-less first publication — the exact 13-04 regression class:
      // first-publication ≠ settled). The trustedView check below now does
      // the ordering: the height read runs only once the engine has
      // committed, in the same rAF batch as the reserve measurement above,
      // so the first publication still carries height + reserve together
      // (the 05-06 mega-page guard and the 13-04 measure-once contract,
      // both preserved). In scrolling mode the early return keeps the
      // height at its useState(0) initial value, so the pagination effect
      // (which guards on a positive height) never runs there.
      if (!isPaginated || trustedView === null) return;
      const pageViewport = articleEl.querySelector<HTMLElement>(".page-viewport");
      if (!pageViewport) return;
      const rect = pageViewport.getBoundingClientRect();
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
    // Reset restore state on article swap so a stale marker from the
    // previous article doesn't flash before the new article's restore runs.
    setRestorationMarker(null);
    restorationMarkerArticleRef.current = null;
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
    // Plan 13-11 (G6): never carry a saved Range across an article swap —
    // a stale (detached) Range would fail capture containment anyway, but
    // clearing here keeps the ref's lifetime identical to the toolbar state.
    lastValidRangeRef.current = null;
    highlightApiRef.current = null;
    // Phase 5 Plan 05-04: reset the one-time unresolved-announce guard so
    // the new article's eager batch-resolve can fire its own "{N} couldn't
    // be relocated." announce if it has unresolved highlights.
    unresolvedAnnouncedRef.current = false;
    // Plan 12-06 (D12-08 + D12-05): reset the epub-chapter context so a
    // stale book line / nav from the previous article never flashes.
    setChapterContext(null);
    setNeighborTitles({ prev: null, next: null });
    setPageState(null);
    // Plan 13-04 (Option A): reset the metadata-spot reserve so the next
    // article's spot (different byline/tags shape) re-measures at its own
    // settle. A stale cross-article reserve would mis-bound page 1.
    metaSpotReserveRef.current = null;
    setMetaSpotReservePx(0);
    // Plan 12-06 (Rule 1 — chapter links are the first article→article
    // navigation that keeps ArticleView MOUNTED): reset the D4-10 anchor
    // refs on swap. A stale offset from the previous article would feed
    // PaginatedSurface's initialAnchorOffset on its fresh mount and land
    // the NEXT chapter at the previous article's passage (its final page)
    // instead of the chapter start. Resetting mirrors the fresh-mount
    // behavior every library open already gets.
    currentAnchorOffsetRef.current = 0;
    lastPreciseAnchorRef.current = null;
    openArticle(articleId)
      .then(async (a) => {
        if (cancelled) return;
        setArticle(a);
        setStatus(a ? "ready" : "error");
        // Plan 12-06 (D12-08 + D12-05): epub-chapter context + neighbor
        // links. Ordinary articles (no epub-chapter ingestionMeta with a
        // bookId) return here — zero new code paths for them. The book
        // lookup is TOLERANT: getBook returns null for a missing/corrupt
        // row (Zod-at-boundary) and renders neither the context line nor
        // the nav; a Dexie-level throw is caught into the same calm null.
        const meta = a?.ingestionMeta;
        if (!a || meta?.source !== "epub-chapter" || !meta.bookId) return;
        let book: Book | null = null;
        try {
          book = await getBook(meta.bookId);
        } catch {
          book = null; // tolerant — reading continues without chapter chrome
        }
        if (cancelled) return;
        if (!book) return; // missing/corrupt record → no line, no nav
        // Neighbor derivation (D12-05): prefer the stamped chapterIndex when
        // it still agrees with the book's own TOC (partial imports can leave
        // the declared list stale), else fall back to indexOf — either way a
        // chapter outside the record gets NO links (never a self-reference).
        const idx =
          meta.chapterIndex !== undefined &&
          book.chapterArticleIds[meta.chapterIndex] === a.id
            ? meta.chapterIndex
            : book.chapterArticleIds.indexOf(a.id);
        const prevId = idx >= 0 ? book.chapterArticleIds[idx - 1] : undefined;
        const nextId = idx >= 0 ? book.chapterArticleIds[idx + 1] : undefined;
        setChapterContext({ book, prevId, nextId });
        // Neighbor titles for the nav's lighter span — light repository
        // reads through the same Zod-validated seam (tolerant of missing
        // rows: a null title renders the bare "Next chapter" text).
        const loadTitle = async (
          id: string | undefined,
        ): Promise<string | null> => {
          if (!id) return null;
          try {
            const neighbor = await openArticle(id);
            return neighbor?.provenance.title ?? null;
          } catch {
            return null;
          }
        };
        const [prevTitle, nextTitle] = await Promise.all([
          loadTitle(prevId),
          loadTitle(nextId),
        ]);
        if (cancelled) return;
        setNeighborTitles({ prev: prevTitle, next: nextTitle });
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [articleId]);

  // Plan 14-03 Task 2 (D14-02/D14-06/D14-07 — Pitfall 8) — the
  // per-destination title effect, keyed on ALL THREE truth inputs so
  // every async truth change rewrites: the tolerant Book lookup
  // upgrades an EPUB chapter's title when chapterContext resolves
  // (standalone form first, combined chapter—book form after). Loading
  // (article null) writes NOTHING — a transient state is never a stale
  // lie (T-14-06); the previous destination's title (or the index.html
  // static default on cold load) stands until real truth arrives. The
  // error branch is a truthful destination of its own (D14-06):
  // apostrophe, no trailing period — the visible h1 keeps its own
  // period. Writes only — no cleanup/restore-on-unmount (every
  // destination sets its own title; D14-11: overlays carry zero title
  // code by construction).
  useEffect(() => {
    if (status === "error") {
      setDocumentTitle("Couldn't open this article");
      return;
    }
    if (!article) return; // loading transient — no write
    if (chapterContext) {
      // D14-07 — the combined content portion; the helper truncates the
      // COMBINED chapter—book string at 64 chars and appends the suffix
      // (mirrors the D12-08 reader context line's shape). Plan 17-03: the
      // ARTICLE half is the effective (reader-owned) title; the BOOK half
      // stays chapterContext.book.title byte-identical (books are not
      // overridable — D17-05).
      setDocumentTitle(
        `${effectiveTitle(article)} — ${chapterContext.book.title}`,
      );
    } else {
      // Standalone article OR missing/corrupt book row (the tolerant
      // lookup returned null) — the effective title (Plan 17-03: the
      // override is the one name; canonical is the fallback).
      setDocumentTitle(effectiveTitle(article));
    }
  }, [article, chapterContext, status]);

  // Plan 14-03 Task 3 (D14-01/D14-06) — the two route-change h1 focus
  // targets (tabindex=-1 pattern; texts and levels byte-stable).
  // articleH1Ref serves the h1-default branch inside the restore effect's
  // no-restore fall-through below; errorH1Ref serves the status-keyed
  // error-parity effect. Both are read ONLY inside those two sites (Pitfall
  // 1 — one decision point per destination truth, never a third competing
  // mount effect).
  const articleH1Ref = useRef<HTMLHeadingElement>(null);
  const errorH1Ref = useRef<HTMLHeadingElement>(null);

  // Plan 10-03 (D10-03 / RECV-01.c + .i — deep-link jump): coordination
  // refs shared with the location-restore effect below.
  //   - jumpPendingRef: TRUE while a /h/<highlightId> param has neither
  //     jumped nor terminally no-op'd. The restore effect early-returns on
  //     it (Pitfall 3 — the deep-link jump wins because the reader
  //     explicitly asked for the highlight; the two restores never race).
  //   - jumpConsumedRef: the `${articleId}::${highlightId}` key already
  //     jumped (or calmly no-op'd) in THIS mount — effect re-runs (article
  //     identity churn, highlight reloads) cannot re-jump.
  const jumpPendingRef = useRef(false);
  const jumpConsumedRef = useRef<string | null>(null);

  // Plan 10-03: the on-mount deep-link jump. DECLARED BEFORE the
  // location-restore effect on purpose — effects run in declaration order,
  // so this effect claims jumpPendingRef in the same commit before the
  // restore effect checks it (Pitfall 3). The readiness gate waits out the
  // three async settles (research Pitfall 2) via a bounded rAF retry loop:
  //   (a) article truthy (effect gate below),
  //   (b) highlights loaded + the entry resolved,
  //   (c) in paginated mode only, the first pagination commit
  //       (surfaceRef.getPages() non-empty).
  // Once ready it reuses the handleNavigateBack tail EXACTLY (D5-11 — no
  // forked math), then strips the /h/ suffix. Every terminal path strips:
  // jump committed, loaded-but-unresolved, loaded-but-absent, or the retry
  // cap (T-10-03c — a never-settling pagination/annotation load cannot
  // spin forever; calm no-op).
  useEffect(() => {
    if (!jumpHighlightId) return; // normal open — no jump, restore runs
    // Claim pending BEFORE the early returns so the restore effect
    // (declared below) can never start racing the jump while the article
    // is still loading.
    jumpPendingRef.current = true;
    if (!article) return; // settle (a) not reached yet
    const jumpKey = `${article.id}::${jumpHighlightId}`;
    if (jumpConsumedRef.current === jumpKey) {
      // Already consumed within this mount — release the restore
      // suppression; later real navigation restores normally.
      jumpPendingRef.current = false;
      return;
    }

    let cancelled = false;
    const RETRY_CAP_MS = 5000; // ~5s of rAF retries before calm no-op
    const startedAt = performance.now();

    // Terminal path shared by every outcome: silently strip the /h/ suffix
    // and release the restore suppression. history.replaceState fires NO
    // hashchange/popstate (research Pitfall 1 — a location.hash assignment
    // would re-run the router, re-parse mid-view, and knock focus off the
    // <mark>). The URL is template-built from the validated article id
    // only — same-origin by construction, no user text enters it
    // (T-10-03b).
    const finish = () => {
      history.replaceState(null, "", `#/article/${article.id}`);
      jumpConsumedRef.current = jumpKey;
      jumpPendingRef.current = false;
    };

    const attempt = () => {
      if (cancelled) return;
      // Settle (b): the provider's eager batch-resolve populates
      // api.highlights atomically ([] → the full resolved set — see
      // useAnnotationState). [] = not loaded yet (keep waiting); non-empty
      // means the load completed, so an absent entry is terminal (Pitfall
      // 4 — deleted in another tab / hand-typed garbage → calm no-op).
      const api = highlightApiRef.current;
      const highlights = api?.highlights ?? [];
      const resolved = highlights.find(
        (h) => h.record.id === jumpHighlightId,
      );
      const position = resolved?.resolvedPosition ?? null;
      if (resolved && !position) {
        // Loaded and unresolved — terminal calm no-op (Pitfall 4; the
        // drawer precedent disables jumps for uncertain anchors).
        finish();
        return;
      }
      if (highlights.length > 0 && !resolved) {
        // Loaded and the id is not among the rows — terminal calm no-op.
        finish();
        return;
      }
      // Settle (c): paginated mode only — the first pagination commit.
      const pages = isPaginated
        ? surfaceRef.current?.getPages() ?? null
        : null;
      if (isPaginated && (!pages || pages.length === 0)) {
        if (performance.now() - startedAt >= RETRY_CAP_MS) {
          finish(); // bounded — never-committing surface (T-10-03c)
          return;
        }
        requestAnimationFrame(attempt);
        return;
      }
      if (!resolved || !position || !articleRef.current) {
        // Highlight rows still loading (empty array), or the article DOM
        // not yet committed — keep waiting under the same cap.
        if (performance.now() - startedAt >= RETRY_CAP_MS) {
          finish();
          return;
        }
        requestAnimationFrame(attempt);
        return;
      }

      // ── Ready: the handleNavigateBack tail, verbatim (D5-11) ──
      const offset = position.start;
      if (isPaginated && pages && pages.length > 0) {
        // PAGINATED: resolve offset → page index via
        // fragmentContainingOffset (anchor.ts), then turn to that page.
        const surface = surfaceRef.current;
        if (surface) {
          const pageIdx = fragmentContainingOffset(pages, offset, article);
          surface.turnToPage(pageIdx);
        }
      } else {
        // SCROLLING: findScrollTarget + scrollIntoView (reusing the
        // Phase 2 helper EXACTLY — no fork).
        const blocks = queryBlocks(articleRef.current);
        const target = findScrollTarget(article, blocks, offset);
        target?.scrollIntoView({ block: "center" });
      }
      // Firefox settle guard — BOTH calls on the same closure, verbatim
      // (scrollIntoView's async settle can race a single rAF on firefox).
      const focusMark = () => {
        document.getElementById(`hl-${jumpHighlightId}`)?.focus();
      };
      requestAnimationFrame(focusMark);
      window.setTimeout(focusMark, 120);

      // Strip AFTER the jump commits.
      finish();
    };

    requestAnimationFrame(attempt);
    return () => {
      cancelled = true;
    };
  }, [article, jumpHighlightId, isPaginated]);

  // Restore saved location on article ready (STATE-01). Mirrors the
  // cancelled-flag async pattern: a slow loadLocation cannot overwrite an
  // article swap. The scrollIntoView is silent (no behavior: "smooth") —
  // under prefers-reduced-motion the global CSS gate sets scroll-behavior:
  // auto; otherwise the default is also instant (we never declare smooth).
  useEffect(() => {
    if (!article) return;
    // Plan 10-03 (Pitfall 3): while a deep-link jump param is pending (not
    // yet consumed + stripped), the saved-location restore skips entirely —
    // the deep-link jump wins because the reader explicitly asked for the
    // highlight, and the two restores must never race. jumpPendingRef is
    // owned by the on-mount jump effect above (declared before this effect
    // so it claims the flag first in every shared commit). After the jump
    // consumes and strips, subsequent mounts / real navigation restore
    // normally.
    if (jumpPendingRef.current) return;
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
        //
        // Plan 14-03 Task 3 (D14-01/D14-03/D14-10) — the h1-default focus
        // branch lives HERE, at the restore pipeline's terminal
        // fall-through (Pitfall 1: ONE decision point inside the existing
        // effects — never a third competing mount effect). Reached only
        // when no deep-link jump is pending (the jumpPendingRef early
        // return above already exited — a pending /h/ jump can NEVER reach
        // the h1 default, D14-05) AND there is nothing to restore: a warm
        // in-app swap into a fresh article announces its destination via
        // the article h1. Cold loads/reloads never move focus —
        // hasAppHistory is false by construction on those arrivals
        // (D14-03). A successful restore returns below and NEVER focuses
        // the h1: the restored position is the orientation (D14-10 —
        // never fight the restore scroll). No cleanup (focusing twice is
        // idempotent — Pitfall 9).
        if (!result.ok || !result.location) {
          if (hasAppHistory) articleH1Ref.current?.focus();
          return;
        }
        const loc = result.location;
        // Phase 18 Plan 18-03 (Pitfall 1 closure — D18-06/UI-SPEC
        // §Auto-Resolved #8): the PAGINATED reopen-restore branch. The mode
        // is read from isPaginatedRef at RESOLUTION time (never the stale
        // closure — see the ref's declaration comment). The readiness gate
        // reuses the deep-link effect's bounded rAF retry template VERBATIM
        // in shape: wait for the first pagination commit
        // (surfaceRef.getPages() non-empty) under RETRY_CAP_MS, then
        // resolve the saved offset to its page via
        // fragmentContainingOffset (anchor.ts — the D5-11 machinery in
        // reverse) and surfaceRef.turnToPage(pageIdx). Failure degrades to
        // the calm page-1 landing with NO marker claim (T-18-08 — honest
        // absence, never an unbounded loop).
        if (isPaginatedRef.current) {
          const RETRY_CAP_MS = 5000; // the deep-link template's cap
          const startedAt = performance.now();
          const attemptPaginatedRestore = () => {
            if (cancelled) return;
            // The mode flipped mid-retry (settings hydration landed on
            // scrolling, or the reader toggled): stop — the D4-10 mode-swap
            // anchor already owns the passage, and a marker here would
            // claim a restore that did not land this way.
            if (!isPaginatedRef.current) return;
            const surface = surfaceRef.current;
            const pages = surface?.getPages() ?? null;
            if (!surface || !pages || pages.length === 0) {
              if (performance.now() - startedAt >= RETRY_CAP_MS) {
                return; // bounded — never-committing surface degrades to page 1
              }
              requestAnimationFrame(attemptPaginatedRestore);
              return;
            }
            const pageIdx = fragmentContainingOffset(
              pages,
              loc.graphemeOffset,
              article,
            );
            surface.turnToPage(pageIdx);
            // Plan 18-03: the passive marker replaces the retired banner —
            // gated on genuine restore-landing (one-shot per article).
            if (restorationMarkerArticleRef.current !== article) {
              restorationMarkerArticleRef.current = article;
              setRestorationMarker({
                offset: loc.graphemeOffset,
                mode: "paginated",
              });
            }
          };
          requestAnimationFrame(attemptPaginatedRestore);
          return;
        }
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
          // Plan 18-03: the passive marker replaces the retired banner —
          // gated on genuine restore-landing (one-shot per article).
          if (restorationMarkerArticleRef.current !== article) {
            restorationMarkerArticleRef.current = article;
            setRestorationMarker({
              offset: loc.graphemeOffset,
              mode: "scrolling",
            });
          }
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
    // hasAppHistory is per-arrival truth: App flips it only on real
    // destination hashchange, which coincides with the articleId change
    // that re-runs this effect via [article]. Listing it would re-fire the
    // restore (scroll + a cleared restoration marker resurrecting) if it
    // ever flipped with the article unchanged — a regression this effect
    // must not gain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article]);

  // Plan 14-03 Task 3 (D14-06) — error parity: a failed open is a truthful
  // destination, so an in-app arrival at the error branch announces via its
  // own h1 (title parity lives in the title effect above). Keyed on status
  // only; hasAppHistory is read per-arrival (same per-mount-stable rationale
  // as the restore effect — documented above). No cleanup (focusing twice is
  // idempotent — Pitfall 9).
  useEffect(() => {
    if (status === "error" && hasAppHistory) {
      errorH1Ref.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Scroll-progress ratio for the hairline (READ-05). Registered once the
  // article is ready; re-registers on article swap. Computed on every scroll
  // from window.scrollY / (scrollHeight - viewportHeight). Clamped to [0, 1]
  // by ProgressHairline defensively.
  //
  // 260820 giant-article freeze: the read is rAF-COALESCED (one per animation
  // frame — the selectionchange pattern at this file's D5-10 effect). The
  // former unthrottled listener called setProgress per scroll EVENT; scroll
  // events fire faster than frames during a fling, and every call re-rendered
  // this component (the owner of the full ArticleBody tree), starving paint
  // on long articles — readers saw unpainted white space that "snapped in"
  // when the main thread caught up. Values are unchanged; only the schedule
  // tightens (the rAF callback reads live geometry at frame time, strictly
  // fresher than the old per-event read).
  useEffect(() => {
    if (!article) return;
    let rafId: number | null = null;
    const read = () => {
      rafId = null;
      const scrollMax =
        document.documentElement.scrollHeight - window.innerHeight;
      setProgress(scrollMax > 0 ? window.scrollY / scrollMax : 0);
    };
    const onScroll = () => {
      if (rafId !== null) return; // coalesce — one read per frame
      rafId = requestAnimationFrame(read);
    };
    // Initialize on mount so the hairline reflects the initial scroll
    // position (e.g. after a restore) rather than flashing from 0.
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [article]);

  // Phase 4 Plan 04-05 (PAGE-09): auto-dismiss the fallback banner on the
  // reader's first scroll or pointer activity (UI-SPEC §Interaction 23 —
  // mirrors the retired resume banner's original pattern, D18-06).
  // Registered ONLY while the banner
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

  // ── Phase 18 Plan 18-02: TOC entry activation (ORNT-01/03, D18-03) ──

  /**
   * Resolve a TOC destination to its VISIBLE rendered element via
   * [data-block-index] (Shared Pattern 7). NEVER by invented DOM ids
   * (T-18-02 — the schema carries none; a string id would be a clobbering
   * surface), and never the hidden measurement clone (Pitfall 7: in
   * paginated mode .article-body-measurement carries the same
   * [data-block-index] set — it is filtered out here so the focus lands on
   * the page fragment the reader actually sees).
   */
  const resolveTocDestination = useCallback(
    (blockIndex: number): HTMLElement | null => {
      const root = articleRef.current;
      if (!root) return null;
      const candidates = root.querySelectorAll<HTMLElement>(
        `[data-block-index="${blockIndex}"]`,
      );
      for (const el of candidates) {
        if (el.closest(".article-body-measurement")) continue;
        return el;
      }
      return null;
    },
    [],
  );

  /**
   * Phase 18 Plan 18-02 (D18-03 + the D5-11 tail VERBATIM from
   * handleNavigateBack above): close the panel through the ONE seam, then
   * jump to the entry's canonical D-05 grapheme offset —
   *   - PAGINATED: fragmentContainingOffset(pages, offset, article) →
   *     surfaceRef.turnToPage(pageIdx) (anchor.ts machinery in reverse).
   *   - SCROLLING: findScrollTarget(article, queryBlocks(el), offset) →
   *     scrollIntoView({ block: "start" }) (the Phase 2 helper EXACTLY —
   *     never a fork).
   * Then focus the destination heading: resolve via [data-block-index] on
   * the visible surface, set tabIndex -1, focus through the rAF + 120ms
   * double-call (the D4-07 firefox-settle guard). The same entry lands on
   * the same structural destination in BOTH modes because the currency is
   * the canonical offset — never a page number, never DOM identity
   * (ORNT-03). The Top entry (blockIndex -1, offset 0) scrolls to the
   * article start / page 1 with focus on the article h1 (the D14-03
   * articleH1Ref precedent). The hash router is NEVER touched — activations
   * were intercepted in the panel (preventDefault; Pitfall 4), and this
   * handler never assigns the hash (no re-parse, no remount).
   */
  const handleTocJump = useCallback(
    (entry: TocEntry) => {
      // Close FIRST, through the seam: hidePopover fires the toggle event →
      // state reset + focus restore to the trigger; the destination focus
      // below (rAF + 120ms) then wins the final focus position.
      const panel = tocPanelRef.current;
      if (panel?.matches(":popover-open")) panel.hidePopover();
      if (!article) return;

      if (entry.blockIndex === -1) {
        // Top of article: offset 0 → scroll-to-top / page 1; focus the h1.
        if (isPaginated) {
          surfaceRef.current?.turnToPage(0);
        } else {
          window.scrollTo({ top: 0 });
        }
        const focusH1 = () => articleH1Ref.current?.focus();
        requestAnimationFrame(focusH1);
        window.setTimeout(focusH1, 120);
        return;
      }

      const offset = entry.offset;
      if (isPaginated) {
        const surface = surfaceRef.current;
        const pages = surface?.getPages();
        if (surface && pages && pages.length > 0) {
          const pageIdx = fragmentContainingOffset(pages, offset, article);
          surface.turnToPage(pageIdx);
        }
      } else {
        if (articleRef.current) {
          const blocks = queryBlocks(articleRef.current);
          const target = findScrollTarget(article, blocks, offset);
          target?.scrollIntoView({ block: "start" });
        }
      }

      // Focus the destination heading after the turn/scroll commits (the
      // D4-07 double-call guard — verbatim from handleNavigateBack).
      const focusDestination = () => {
        const el = resolveTocDestination(entry.blockIndex);
        if (!el) return;
        el.tabIndex = -1;
        el.classList.add("toc-destination"); // the :focus-visible ring hook
        el.focus();
      };
      requestAnimationFrame(focusDestination);
      window.setTimeout(focusDestination, 120);
    },
    [article, isPaginated, resolveTocDestination],
  );

  if (status !== "ready" || !article) {
    return (
      <main id="main">
        <div className="status" role="status" aria-live="polite" aria-atomic="true">
          {status === "loading" ? (
            <p>Opening article…</p>
          ) : (
            <>
              {/* Plan 14-03 Task 3 (D14-06): gains ONLY tabIndex={-1} + the
                  focus ref — text and level byte-stable (period kept). */}
              <h1 ref={errorH1Ref} tabIndex={-1}>
                Couldn't open this article.
              </h1>
              <p>The article could not be loaded. Select it again from the list, or try a different article.</p>
            </>
          )}
        </div>
      </main>
    );
  }

  // D7-08 + threat T-7-06: sourceUrl is optional (paste-HTML articles omit it).
  // The "Originally published at {domain}" affordance hides when sourceUrl is
  // absent — there is no canonical source URL for a pasted article. v1.0
  // fixtures always supply sourceUrl so they render identically; paste-HTML
  // articles (07-06+) trigger the conditional. originalHtmlHash still provides
  // traceability for paste-sourced articles.
  const sourceUrl = article.provenance.sourceUrl;
  const domain = sourceUrl !== undefined ? new URL(sourceUrl).hostname : undefined;

  /**
   * Plan 09-05 (D9-06, PORT-03) — export this article's highlights (+ their
   * notes) as one .md via the fixed D9-06 template. Highlights/notes load
   * fresh at click time (loadAllHighlights/loadAllNotes filtered by
   * articleId — the whole-library loaders from 09-02; notes join through
   * their OWNING highlight's highlightId inside collectHighlightEntries, so
   * the note filter only needs the article's highlight ids). The tri-state
   * status is computed by collectHighlightEntries through the SHIPPED
   * resolveQuoteSelector — no forked resolution logic. The download filename
   * derives from sanitizeFilename(title, article.id) (T-9-06 — the title is
   * arbitrary web text). Results announce calmly; a throw announces
   * "Export didn't complete." and never interrupts reading.
   */
  const handleExportHighlights = async () => {
    setExportingHighlights(true);
    try {
      const [allHighlights, allNotes] = await Promise.all([
        loadAllHighlights(),
        loadAllNotes(),
      ]);
      const articleHighlights = allHighlights.filter(
        (h) => h.articleId === article.id,
      );
      const highlightIds = new Set(articleHighlights.map((h) => h.id));
      const articleNotes = allNotes.filter((n) =>
        highlightIds.has(n.highlightId),
      );
      const entries = collectHighlightEntries(
        [article],
        articleHighlights,
        articleNotes,
      );
      const md = renderArticleHighlights(article, entries);
      // Plan 17-03 (OQ5 pinned effective): the download filename carries the
      // effective title — the exported file is named what the reader calls
      // the article (id unchanged; sanitizeFilename still guards the text).
      const filename = `highlights-${sanitizeFilename(effectiveTitle(article), article.id)}.md`;
      downloadBlob([md], filename, "text/markdown");
      const noun = articleHighlights.length === 1 ? "highlight" : "highlights";
      setExportAnnouncement(
        `Exported ${articleHighlights.length} ${noun} for this article.`,
      );
    } catch {
      setExportAnnouncement("Export didn't complete.");
    } finally {
      setExportingHighlights(false);
    }
  };

  // Paginated mode mounts PaginatedSurface only when trustedView + articleEl
  // are both ready (paginatedActive). The .paginated-surface frame class,
  // however, is applied to the shared <article> whenever the EFFECTIVE mode
  // is paginated (see the className below) so the pinned frame is present
  // from the first paint — a fallback flip (session override → scrolling)
  // reverts the class in the same render that mounts the scrolling body, so
  // the overflow locks never clip a fallback rendering.
  const paginatedActive = isPaginated && trustedView !== null && articleEl !== null;
  // Plan 13-09 (G4 — 13-UAT stable first paint): the pending window — the
  // effective mode is paginated but measurement has not settled. Render the
  // stable paginated frame with a calm placeholder, NEVER the scrolling
  // surface (the old code mounted the scrolling ArticleBody + its hairline
  // here, then swapped once trustedView committed — a visible jump on every
  // paginated first load).
  const paginatedPending = isPaginated && !paginatedActive;

  // Plan 13-10 (G5 — the recorded user-direction change): the article-top
  // metadata spot is a COMPACT, quiet PROVENANCE block — byline·date, the
  // epub book-context line, and the "Originally published at {domain}"
  // source link. NO tag controls (the tag affordance is the top-bar
  // popover), NO Export button (the per-article export lives in the
  // annotations drawer — a highlight-scoped action in the highlight-scoped
  // surface). Placement contract (13-04 Option A, unchanged): render-once
  // page-1 mount + the measured firstPageReservedPx reserve; the anatomy is
  // now provenance-only, so the reserve is simply much smaller — a generous
  // page-1 content budget at 360×640.
  //   - scrolling mode: ordinary flow content above the article body —
  //     scrolls away naturally.
  //   - paginated mode: mounted INSIDE .page-viewport as flow content above
  //     the fragment ONLY on the article's first page — OUTSIDE the grid
  //     header row (the page-viewport row height never oscillates between
  //     turns) and OUTSIDE the pagination block stream (the engine's
  //     firstPageReservedPx budget — fed with the once-measured spot height
  //     below — is its sanctioned seat per the Option A human decision,
  //     2026-08-18).
  const articleTopMeta = (
    <div className="article-top-meta">
      {/* Plan 17-03 (META-02/D17-09): the byline reads the effective author
          (override ?? canonical) at all three expressions so the guard, the
          rendered text, and the " · " separator condition stay one truth;
          the publishedAt branch logic is byte-unchanged. */}
      {(effectiveAuthor(article) || article.provenance.publishedAt) && (
        <p className="meta">
          {effectiveAuthor(article)}
          {effectiveAuthor(article) && article.provenance.publishedAt && " · "}
          {article.provenance.publishedAt && formatDate(article.provenance.publishedAt)}
        </p>
      )}
      {/* Plan 12-06 (D12-08): epub-chapter context line — calm book
          provenance below the article provenance, epub-chapter only
          (chapterContext is non-null ONLY when the source is epub-chapter
          AND the Book record resolved through the tolerant lookup).
          Rendered as a paragraph, never a heading — the h1 chapter title
          owns the heading structure. A chapter outside the book's declared
          TOC (partial import) shows the title alone; chapterOrdinal returns
          0 there and the callers-skip-0 contract (bookProgress.ts) keeps
          the label honest. The separator is the U+00B7 middle dot with
          surrounding spaces — byte-identical to the .meta separator above.
          No book-progress indicator here (progress lives on the library
          row). */}
      {chapterContext && (
        <p className="meta book-context">
          {chapterContext.book.title}
          {chapterOrdinal(chapterContext.book, article.id) > 0 &&
            ` · Chapter ${chapterOrdinal(chapterContext.book, article.id)} of ${chapterContext.book.chapterArticleIds.length}`}
        </p>
      )}
      {sourceUrl !== undefined && domain !== undefined && (
        <a href={sourceUrl} rel="noopener noreferrer" target="_blank">
          Originally published at {domain}
          <span className="visually-hidden"> (opens in a new tab)</span>
        </a>
      )}
    </div>
  );

  return (
    <>
      {/* READ-05: hairline is fixed under the header via CSS. Decorative —
          progress is conveyed to AT via the SectionAnnouncer live region.
          In paginated mode PaginatedSurface renders its own ProgressHairline
          with the N/M ratio (D4-08), so we skip the scrolling-mode hairline
          here to avoid a duplicate. Plan 13-09 (G4): the gate is the
          EFFECTIVE mode, not the settled state — the scrolling hairline must
          never paint during the paginated pending window either (it would
          appear, then vanish at the swap — the exact first-load jump this
          plan closes). */}
      {!isPaginated && (
        <ProgressHairline progress={progress} placement="viewport" />
      )}
      {/* A11Y-08: polite live region announcing section changes during scroll.
          articleEl is null during loading; the callback ref sets it once the
          <article> mounts, triggering a re-render so this component receives
          the actual DOM node. */}
      <SectionAnnouncer articleEl={articleEl} />
      {/* Plan 13-09 (G4 — stable first paint): paginated-main locks from the
          FIRST paint whenever the effective mode is paginated (pending
          window included). The html/body :has overflow locks + the viewport
          inset therefore engage before measurement settles, so the frame
          never changes shape when pagination commits. */}
      <main id="main" className={isPaginated ? "paginated-main" : undefined}>
        {/*
          A11Y-08 (UI-SPEC §Copywriting "keyboard-help affordance"): a single
          concise visually-hidden paragraph at the top of <main>, preceding the
          article header in DOM order so it is announced once to AT on article
          open. Never visible — progressive enhancement for keyboard-first
          readers. Mirrors the skip-link pattern.
        */}
        <p className="visually-hidden">
          Keyboard shortcuts: M switches reading mode. PageUp and PageDown,
          ArrowLeft and ArrowRight, and Space and Shift+Space turn pages. To
          highlight selected text, keyboard and mouse users can press H, or N to
          highlight and open a note. Screen-reader users: after selecting text,
          Tab to the "Highlight" toolbar button and press Enter — screen readers
          reserve single-letter keys like H and N for their own navigation.
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
        {/* Plan 09-05 (D9-06, PORT-03): a SECOND visually-hidden polite
            region for the per-article highlights-export result ("Exported N
            highlights for this article." / "Export didn't complete."). Kept
            separate from the annotation region above so an export announce
            never clobbers an in-flight annotation announce (each live region
            announces its own atomic phrase — D2-13 pattern). */}
        <div
          className="visually-hidden"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {exportAnnouncement}
        </div>
        {/* Phase 18 Plan 18-03 (ORNT-06, D18-05/08): the passive restoration
            marker mounts ONLY when a reopen-restore genuinely landed (the
            restorationMarker state above is set exclusively inside the
            restore effect's two landed branches — never on first-open-no-
            location, never on TOC jumps, never on deep-link arrivals). It
            lives INSIDE the shared <article> so its absolute geometry
            anchors to the article box and scrolls with the content. */}
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
        {/* Plan 13-09 (G4 — stable first paint): the pinned paginated frame
            (fixed viewport height + grid + overflow clip) is applied whenever
            the EFFECTIVE mode is paginated — including the pre-settle pending
            window — so the frame is byte-stable from the first article paint
            through the placeholder→page-1 transition. A fallback flip
            reverts the class in the same render that mounts the scrolling
            body (disclosed by the banner), so the clip never traps a
            scrolling rendering. */}
        {/* Phase 20 Plan 20-04: AssetProvider wraps the whole <article>
            element — every figure-rendering subtree (both reading bodies)
            resolves through the one per-article object-URL map. Siblings
            outside (toolbar/popovers/drawer) render no figures and stay
            outside the provider. */}
        <AssetProvider article={article}>
        <article
          ref={articleCallbackRef}
          className={isPaginated ? "article-body paginated-surface" : "article-body"}
        >
          {/* Plan 13-04 (POLISH-03 / D13-13): the pinned per-page header is
              SLIM — BackToLibrary + the title ONLY. Byline/source/book
              context moved to the article-top metadata spot (13-10 G5:
              provenance-only); tags live in the top-bar popover and export
              in the annotations drawer. The header row's 09-07 geometry cap
              stays byte-unchanged; the slimmer content keeps it far under
              the cap (no internal scrolling at 360×640). */}
          <header>
            {/* Plan 13-04 (POLISH-05 / D13-15) — the standardized back
                affordance at the article header start, BEFORE the title
                cluster. Native button = keyboard-reachable by construction;
                history.back() only when App's in-app flag is set, else the
                "#/" fallback (Pitfall 7 — deep-link tabs never exit). */}
            <BackToLibrary hasAppHistory={hasAppHistory} />
            {/* Plan 14-03 Task 3: gains ONLY tabIndex={-1} + the focus ref —
                text and level byte-stable. Plan 17-03: the text VALUE source
                is now the effective title (ref + tabIndex untouched). */}
            <h1 ref={articleH1Ref} tabIndex={-1}>
              {effectiveTitle(article)}
            </h1>
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
                <ArticleBody article={article} highlights={EMPTY_HIGHLIGHTS} />
              </div>
              {/*
                PaginatedSurface owns pages + currentPageIdx + the turn handler.
                The ref lets PageTurnControls (keyboard + swipe) drive the same
                state. initialAnchorOffset is the D4-10 scrolling→paginated
                anchor captured BEFORE the mode swap; onAnchorChange keeps
                currentAnchorOffsetRef fresh for the NEXT swap (paginated→
                scrolling).
              */}
              {/* Plan 13-04 (Option A — human decision 2026-08-18): the
                  metadata spot is OWNED here but MOUNTED by
                  PaginatedSurface (articleStartChrome) — the surface shows
                  it exactly on page 1, in the same render as the page-1
                  fragment whose height yields the measured reserve (the
                  same value threaded as firstPageReservedPx). Single-owner
                  mounting keeps spot, fragment height, and page index in
                  one commit — a parent-state spot can lag a turn by one
                  effect cycle and transiently render page 2 inside page-1
                  geometry (observed: guard overflow → dom-fallback flip).
                  The viewport box itself is grid-determined: the spot
                  mount/unmount never changes its height (no ResizeObserver
                  re-measure loop). */}
              <div className="page-viewport">
                <PaginatedSurface
                  animatePageTurns={settings.animatePageTurns}
                  ref={surfaceRef}
                  article={article}
                  trustedView={trustedView}
                  articleEl={articleEl}
                  diagnostics={diagnostics}
                  pageContentBoxHeightPx={pageContentBoxHeightPx}
                  firstPageReservedPx={metaSpotReservePx}
                  articleStartChrome={articleTopMeta}
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
              </div>
              {/* Plan 12-06 (D12-05): paginated chapter nav — ArticleView-
                  owned chrome rendered AFTER the surface element (never
                  inside page fragments), so it is geometrically stable: the
                  CSS places it in the fixed chrome band below the pinned
                  article surface (position:fixed is out of the grid flow —
                  mounting it can NEVER change .page-viewport geometry and
                  re-trigger pagination). The Next link mounts ONLY while the
                  current page is the final page and the Previous link ONLY
                  on the first page — state-conditional on the mirrored page
                  state, never permanent chrome. Native focusable anchors
                  (Tab/Enter only, no shortcut registration); the page-turn
                  key handlers in PageTurnControls are untouched. */}
              {chapterContext?.nextId &&
                pageState !== null &&
                pageState.page === pageState.total && (
                  <nav
                    className="chapter-nav chapter-nav-page chapter-nav-next"
                    aria-label="Book chapters"
                  >
                    <a
                      className="chapter-next"
                      href={`#/article/${chapterContext.nextId}`}
                    >
                      Next chapter
                      {neighborTitles.next && (
                        <span className="chapter-nav-title">
                          {" "}
                          {neighborTitles.next}
                        </span>
                      )}
                    </a>
                  </nav>
                )}
              {chapterContext?.prevId && pageState !== null && pageState.page === 1 && (
                <nav
                  className="chapter-nav chapter-nav-page chapter-nav-previous"
                  aria-label="Book chapters"
                >
                  <a
                    className="chapter-prev"
                    href={`#/article/${chapterContext.prevId}`}
                  >
                    Previous chapter
                    {neighborTitles.prev && (
                      <span className="chapter-nav-title">
                        {" "}
                        {neighborTitles.prev}
                      </span>
                    )}
                  </a>
                </nav>
              )}
            </>
          ) : paginatedPending ? (
            <>
              {/*
                Plan 13-09 (G4): the pending window — the effective mode is
                paginated but measurement has not settled (trustedView or
                articleEl not yet ready). This branch renders the SAME hidden
                measurement wrapper the active branch mounts (Plan 04-08 —
                the engine's measureAllBlocks reads the full
                [data-block-index] set from the <article> subtree with valid
                geometry; it is the ONLY ArticleBody here, so the scrolling
                surface never paints while the effective mode is paginated —
                the G4 must-not). See app.css for the wrapper's geometry
                contract (position:absolute out of flow, visibility:hidden
                boxes preserved).
              */}
              <div className="article-body-measurement" aria-hidden="true">
                <ArticleBody article={article} highlights={EMPTY_HIGHLIGHTS} />
              </div>
              {/*
                Plan 13-09 (G4): a calm placeholder inside the REAL page
                viewport — the frame rides the pinned .paginated-surface
                geometry already applied to the <article>, and this paragraph
                rides the existing .meta typography (zero new CSS). Polite
                role=status announcement; no motion, no spinner. Placeholder
                cannot wedge: a measurement failure/oversize emits
                dom-fallback → the session override flips to scrolling →
                this branch unmounts and the banner discloses the mode
                change.
              */}
              <div className="page-viewport">
                <p className="meta" role="status" aria-live="polite">Preparing pages…</p>
              </div>
            </>
          ) : (
            <>
              {/* Plan 13-10 (G5): in scrolling mode the metadata spot is
                  ordinary flow content above the article body — byline,
                  source, book context (provenance-only) — scrolling away
                  naturally with the article (rendered once, never pinned). */}
              {articleTopMeta}
              {/* Plan 12-06 (D12-05): Previous chapter at chapter START —
                  mounted BEFORE the body in the article flow so it is
                  reachable from the top of the chapter (symmetric with the
                  Next link at the end). */}
              {chapterContext?.prevId && (
                <nav
                  className="chapter-nav chapter-nav-previous"
                  aria-label="Book chapters"
                >
                  <a
                    className="chapter-prev"
                    href={`#/article/${chapterContext.prevId}`}
                  >
                    Previous chapter
                    {neighborTitles.prev && (
                      <span className="chapter-nav-title">
                        {" "}
                        {neighborTitles.prev}
                      </span>
                    )}
                  </a>
                </nav>
              )}
              <ArticleBody article={article} />
              {/* Plan 12-06 (D12-05): Next chapter exactly at chapter END —
                  after the last block in the article flow; a calm link, not
                  permanent chrome. */}
              {chapterContext?.nextId && (
                <nav
                  className="chapter-nav chapter-nav-next"
                  aria-label="Book chapters"
                >
                  <a
                    className="chapter-next"
                    href={`#/article/${chapterContext.nextId}`}
                  >
                    Next chapter
                    {neighborTitles.next && (
                      <span className="chapter-nav-title">
                        {" "}
                        {neighborTitles.next}
                      </span>
                    )}
                  </a>
                </nav>
              )}
            </>
          )}
          {/* Phase 18 Plan 18-03 (ORNT-06): the passive marker — rendered as
              the LAST child of the shared <article> so it never disturbs the
              mode branches; absolutely positioned (zero layout impact) with
              pointer-events none; transient (unmounts itself at 4s). */}
          {restorationMarker && articleEl && (
            <RestorationMarker
              article={article}
              articleEl={articleEl}
              offset={restorationMarker.offset}
              mode={restorationMarker.mode}
            />
          )}
        </article>
        </AssetProvider>
        {/* Phase 5 Plan 05-02 Task 2: SelectionToolbar mounts as a sibling of
            the article body, INSIDE the provider so it can consume
            useHighlightOverlay() for createHighlightFromSelection. Passes
            selectionRect (tracked by the selectionchange listener above) +
            captureResult (computed via captureCurrentSelection — no highlight
            created) so the toolbar can show buttons vs. invalid hints.
            onHighlight/onHighlightAndNote reuse the SAME handleHighlightShortcut
            the H/N keyboard path uses (ONE create path, ONE capture → persist
            → clear-selection flow). Plan 13-11 (G6): onFocusExit wires the
            toolbar's focusout-driven dismissal (Tab-past / focus-exit) to the
            stable dismissToolbarFromFocusExit callback. */}
        <SelectionToolbar
          selectionRect={selectionRect}
          captureResult={captureResult}
          onHighlight={() => void handleHighlightShortcut(false)}
          onHighlightAndNote={() => void handleHighlightShortcut(true)}
          onFocusExit={dismissToolbarFromFocusExit}
        />
        {/* Phase 5 Plan 05-03: NotePopover mounts inside the provider so it
            can consume useHighlightOverlay() for openPopoverFor coordination
            state + CRUD (updateNote/flushNoteSave/deleteHighlight). The
            popover is controlled by the provider's openPopoverFor state
            (set by the N shortcut, "Highlight + note" toolbar button, or
            activating a <mark>). popover="manual" → typing doesn't
            light-dismiss; top-layer rendering with no backdrop. */}
        <NotePopover />
        {/* Plan 13-10 (G5 — the AnnotationsDrawer ownership pattern): the
            tag-editing popover. A native popover="auto" panel in the top
            layer — free light-dismiss + Esc; the toggle-event close seam
            above restores focus to the trigger and routes the state back to
            App. Wraps the byte-unchanged TagEntry (only its mount point
            moved); TagEntry stays inert at popover-show until the reader
            activates it (Pitfall 8-5 carries verbatim — no focus-on-mount
            call anywhere in this path). role="dialog" + aria-label give the
            surface its accessible name; the closed panel is display:none
            (UA popover styling) so it never leaks into the reading flow. */}
        <div
          ref={tagPopoverRef}
          popover="auto"
          role="dialog"
          aria-label="Article tags"
          className="tag-popover"
        >
          <TagEntry articleId={article.id} tags={article.tags ?? []} />
        </div>
        {/* Phase 18 Plan 18-02: the TOC panel — popover="manual", NON-modal
            (no dialog role, no modal state, no popup hint — Pitfall 3; the
            first non-dialog overlay, D18-01). The controlled seam above owns
            open/close + focus restore; the panel owns rendering, the shared
            sectionSpy aria-current mapping, open-time focus/scroll, manual
            Esc, and intercepted entry activation (onActivate →
            handleTocJump). The UA hides the closed panel (display:none) so
            it never leaks into the reading flow. */}
        <TocPanel
          ref={tocPanelRef}
          article={article}
          articleEl={articleEl}
          open={tocOpen}
          mode={isPaginated ? "paginated" : "scrolling"}
          onActivate={handleTocJump}
        />
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
          onExportHighlights={handleExportHighlights}
          exportingHighlights={exportingHighlights}
        />
        </HighlightOverlayProvider>
      </main>
    </>
  );
}
