// src/reader/RestorationMarker.tsx
// Phase 18 Plan 18-03 (ORNT-06): the PASSIVE transient restoration cue that
// replaces the retired ResumeBanner (D18-06). "The cue IS the location"
// (D18-05): a 4px solid var(--accent) bar attached AT the restored spot —
//   - scrolling mode: the restored BLOCK (resolved via the restoreLocation
//     machinery + [data-block-index] on the VISIBLE surface — the hidden
//     .article-body-measurement clone is excluded, Pitfall 7), sitting
//     calc(-1 * var(--space-md)) into the gutter, height = the block's
//     rendered height;
//   - paginated mode: the restored PAGE fragment's inline-start edge
//     (page height — D18-05's "restored page edge").
// Plus the polite announce — the retiring banner's announce discipline
// VERBATIM (D18-05): a visually-hidden role=status / aria-live=polite /
// aria-atomic=true region whose freshly-inserted content announces the
// ANNOUNCE_COPY constant (below) on mount — the one sanctioned
// carry-forward string in src/.
//
// Lifecycle (D18-07): at 3400ms the bar gains .is-fading (a 600ms CSS
// opacity transition); at 4000ms the component renders null. Timers are
// cleaned up on unmount. ZERO JS animation code — the fade is a CSS
// transition the global prefers-reduced-motion gate (app.css L84-92) kills,
// so under reduced motion the bar clears as an instant step (Pitfall 8 —
// never a rAF-driven style write). No dismissal interaction exists.
//
// Honesty (D18-08): the PARENT gates mounting — the marker mounts ONLY when
// a reopen-restore genuinely landed (a saved LocationRecord existed AND the
// restore resolved this mount). It never fires on first open without a
// location, never on TOC jumps (their cue is focus-on-heading), never on
// Highlights deep-links (the jumpPendingRef guard suppresses the restore
// effect entirely). This component makes no claims of its own.
//
// Zero layout impact (ORNT-06): the bar is absolutely positioned (the
// parent <article> is its positioned anchor) with pointer-events none — it
// never shifts content, blocks a page turn, or intercepts a pointer event.

import { useEffect, useLayoutEffect, useState } from "react";
import type { CanonicalArticle } from "../content/types";
import { findScrollTarget } from "./restoreLocation";

/** D18-07 (UI-SPEC §Auto-Resolved #10): fade class lands at 3400ms… */
const FADE_START_MS = 3400;
/** …and the component is gone by 4000ms (600ms CSS opacity transition). */
const UNMOUNT_MS = 4000;
/** D18-05 — verbatim carry-forward from the retiring banner (UI-SPEC
 *  §Copywriting "Restoration announce"). */
const ANNOUNCE_COPY = "Returned to where you left off.";
/** The 4px bar's gutter offset from the attach target's inline-start edge. */
const BAR_WIDTH_PX = 4;
/** Scrolling mode: the bar sits one --space-md (16px) into the gutter. */
const SCROLLING_GUTTER_PX = 16;

interface RestorationMarkerProps {
  /** The canonical article (drives findScrollTarget's D-05 walk). */
  article: CanonicalArticle;
  /**
   * The rendered <article> element — the query scope for attach-target
   * resolution AND the absolute-positioning anchor (the bar's geometry is
   * computed relative to its box, so it scrolls with the content).
   */
  articleEl: HTMLElement | null;
  /** The restored D-05 grapheme offset (the saved LocationRecord's value). */
  offset: number;
  /** The reading mode the restore landed in (selects the attach target). */
  mode: "scrolling" | "paginated";
}

/**
 * Resolve the attach target + bar geometry once at mount. Layout-effect
 * (measure before paint) — a plain read of getBoundingClientRect, never a
 * frame-driven style write (Pitfall 8). Returns null when no target
 * resolves (no blocks / no page fragment): the BAR stays absent while the
 * announce still fires — the restore DID land; only the geometry is
 * unavailable (honest degradation, never a false position claim).
 */
function useAttachGeometry({
  article,
  articleEl,
  offset,
  mode,
}: RestorationMarkerProps):
  | { top: number; height: number; insetInlineStart: number }
  | null {
  const [geometry, setGeometry] = useState<{
    top: number;
    height: number;
    insetInlineStart: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!articleEl) return;
    const articleRect = articleEl.getBoundingClientRect();
    let target: HTMLElement | null = null;
    if (mode === "paginated") {
      // The restored page's fragment — PaginatedSurface mounts exactly ONE
      // .page-fragment at a time, and the parent mounts this marker only
      // AFTER the restore turn committed, so the visible fragment IS the
      // restored page (D18-05's restored page edge).
      target = articleEl.querySelector<HTMLElement>(".page-fragment");
    } else {
      // The restored block via the SHIPPED resolver (never a fork) over
      // the VISIBLE surface's blocks — the hidden measurement clone is
      // excluded (Pitfall 7).
      const blocks = Array.from(
        articleEl.querySelectorAll<HTMLElement>("[data-block-index]"),
      ).filter((el) => !el.closest(".article-body-measurement"));
      target = findScrollTarget(article, blocks, offset);
    }
    if (!target) return;
    const rect = target.getBoundingClientRect();
    setGeometry({
      top: rect.top - articleRect.top,
      height: rect.height,
      insetInlineStart:
        rect.left -
        articleRect.left -
        (mode === "paginated" ? BAR_WIDTH_PX : SCROLLING_GUTTER_PX),
    });
  }, [article, articleEl, mode, offset]);

  return geometry;
}

export function RestorationMarker(props: RestorationMarkerProps) {
  const geometry = useAttachGeometry(props);
  const [fading, setFading] = useState(false);
  const [gone, setGone] = useState(false);

  // D18-07 transient lifecycle — plain timers, CSS classes only. The fade
  // itself is a CSS transition (.restoration-marker.is-fading in app.css);
  // under prefers-reduced-motion the global gate kills the transition so
  // the bar clears as an instant step (Pitfall 8). Both timers are cleaned
  // up on unmount so nothing fires after the component is gone.
  useEffect(() => {
    const fadeTimer = window.setTimeout(() => setFading(true), FADE_START_MS);
    const unmountTimer = window.setTimeout(() => setGone(true), UNMOUNT_MS);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(unmountTimer);
    };
  }, []);

  if (gone) return null;

  return (
    <>
      {/* The retiring banner's announce discipline, verbatim (D18-05): a
          freshly-inserted polite region announces its initial content on
          mount — no extra effect needed. */}
      <div
        className="visually-hidden"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {ANNOUNCE_COPY}
      </div>
      {geometry && (
        <div
          className={`restoration-marker${fading ? " is-fading" : ""}`}
          style={{
            top: geometry.top,
            height: geometry.height,
            insetInlineStart: geometry.insetInlineStart,
            pointerEvents: "none",
          }}
        />
      )}
    </>
  );
}
