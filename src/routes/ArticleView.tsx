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
import { PageTurnControls } from "../reader/PageTurnControls";
import { ProgressHairline } from "../reader/ProgressHairline";
import { SectionAnnouncer } from "../reader/SectionAnnouncer";
import { ResumeBanner } from "../reader/ResumeBanner";

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
 * Query the rendered block elements in document order. Used by both the
 * location-restore effect and the Resume handler. Mirrors the selector used
 * by useScrollSave's offset computation so save/restore round-trip exactly.
 */
function queryBlocks(articleEl: HTMLElement): HTMLElement[] {
  return Array.from(
    articleEl.querySelectorAll<HTMLElement>(
      "h2, h3, h4, p, blockquote, li, pre, figure, sup, details",
    ),
  );
}

export function ArticleView({ articleId, modeToggleHandlerRef }: ArticleViewProps) {
  const [article, setArticle] = useState<CanonicalArticle | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  // The restored location (STATE-01). Null when no saved location was found
  // OR after the reader dismisses the banner. Used by the Resume handler to
  // re-scroll to the saved offset if the reader clicked Resume.
  const [restoredOffset, setRestoredOffset] = useState<LocationRecord | null>(null);
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [progress, setProgress] = useState(0);

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
  const isPaginated = settings.readingMode === "paginated";

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
  const handleAnchorChange = useCallback((offset: number) => {
    currentAnchorOffsetRef.current = offset;
  }, []);

  // Phase 4 Plan 04-04 (D4-09 + D4-10): the mode-toggle handler. Captures the
  // anchor SYNCHRONOUSLY before calling update() so the post-swap render can
  // re-anchor to the same passage. Registered on the App-provided ref so the
  // header ModeToggle button (and the M shortcut via PageTurnControls) share
  // ONE toggle path with ONE anchor capture.
  const handleToggleMode = useCallback(() => {
    // Capture BEFORE the settings update re-renders (Pitfall 7). currentAnchor
    // OffsetRef is kept fresh by the scroll listener / onAnchorChange above.
    const offset = currentAnchorOffsetRef.current;
    pendingModeSwapRef.current = {
      from: settings.readingMode,
      offset,
    };
    update({
      readingMode: settings.readingMode === "paginated" ? "scrolling" : "paginated",
    });
  }, [settings.readingMode, update]);

  // Register the handler on the App-provided ref. Updated every render so the
  // closure always sees the latest settings.readingMode; cleared on unmount
  // so App falls back to the plain-preference-flip path.
  useEffect(() => {
    modeToggleHandlerRef.current = handleToggleMode;
    return () => {
      modeToggleHandlerRef.current = null;
    };
  }, [handleToggleMode, modeToggleHandlerRef]);

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
  const prevModeRef = useRef(settings.readingMode);
  useEffect(() => {
    const prev = prevModeRef.current;
    prevModeRef.current = settings.readingMode;
    const swap = pendingModeSwapRef.current;
    if (!swap || prev === settings.readingMode) return;
    pendingModeSwapRef.current = null;
    // Only the paginated→scrolling path needs a post-commit apply here — the
    // scrolling→paginated path is handled by PaginatedSurface's
    // initialAnchorOffset prop (read at mount from currentAnchorOffsetRef).
    if (swap.from === "paginated" && settings.readingMode === "scrolling") {
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
  }, [settings.readingMode, article]);

  // Paginated geometry: derive the page content-box height from the rendered
  // <article class="paginated-surface"> element after mount. rAF-deferred
  // (mirror L172-188) so the browser has completed layout before we read.
  // Recomputed on articleEl change (article swap or first mount).
  const [pageContentBoxHeightPx, setPageContentBoxHeightPx] = useState(0);
  useEffect(() => {
    if (!articleEl) return;
    let cancelled = false;
    const rafId = requestAnimationFrame(() => {
      if (cancelled) return;
      const rect = articleEl.getBoundingClientRect();
      setPageContentBoxHeightPx(rect.height);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [articleEl]);

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
          ArrowLeft and ArrowRight, and Space and Shift+Space turn pages.
        </p>
        {showResumeBanner && (
          <ResumeBanner
            onResume={handleResume}
            onStartFromTop={handleStartFromTop}
            onDismiss={() => setShowResumeBanner(false)}
          />
        )}
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
                onToggleMode={handleToggleMode}
              />
            </>
          ) : (
            <ArticleBody article={article} />
          )}
        </article>
      </main>
    </>
  );
}
