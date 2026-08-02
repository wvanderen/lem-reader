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
import { useEffect, useRef, useState } from "react";
import { openArticle } from "../content/repository";
import type { CanonicalArticle } from "../content/types";
import type { LocationRecord } from "../content/schema";
import { ArticleBody } from "../content/render/BlockRenderer";
import { loadLocation } from "../persistence/locationStore";
import { findScrollTarget } from "../reader/restoreLocation";
import { useScrollSave } from "../reader/useScrollSave";
import { ProgressHairline } from "../reader/ProgressHairline";
import { SectionAnnouncer } from "../reader/SectionAnnouncer";
import { ResumeBanner } from "../reader/ResumeBanner";

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

export function ArticleView({ articleId }: { articleId: string }) {
  const [article, setArticle] = useState<CanonicalArticle | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  // The restored location (STATE-01). Null when no saved location was found
  // OR after the reader dismisses the banner. Used by the Resume handler to
  // re-scroll to the saved offset if the reader clicked Resume.
  const [restoredOffset, setRestoredOffset] = useState<LocationRecord | null>(null);
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [progress, setProgress] = useState(0);

  // Ref to the rendered <article> element. Used by restoreLocation's
  // block query, useScrollSave's offset computation, and SectionAnnouncer's
  // heading query. articleRef.current is null during loading/error and after
  // the ready article mounts.
  const articleRef = useRef<HTMLElement>(null);

  // useScrollSave must be called unconditionally (rules of hooks). It no-ops
  // while article is null (the hook early-returns its scroll listener when
  // article is null). The dual-flush listeners stay registered across the
  // loading → ready transition.
  useScrollSave(article, articleRef);

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

  return (
    <>
      {/* READ-05: hairline is fixed under the header via CSS. Decorative —
          progress is conveyed to AT via the SectionAnnouncer live region. */}
      <ProgressHairline progress={progress} />
      {/* A11Y-08: polite live region announcing section changes during scroll.
          articleRef.current is null during loading but the article is ready
          here, so the ref is populated by the time this renders. */}
      <SectionAnnouncer articleEl={articleRef.current} />
      <main id="main">
        {showResumeBanner && (
          <ResumeBanner
            onResume={handleResume}
            onStartFromTop={handleStartFromTop}
            onDismiss={() => setShowResumeBanner(false)}
          />
        )}
        <article ref={articleRef} className="article-body">
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
          <ArticleBody article={article} />
        </article>
      </main>
    </>
  );
}
