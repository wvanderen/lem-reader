// src/reader/useScrollSave.ts
// First custom React hook in the codebase (STACK.md sanctions hooks over
// Redux/Zustand). Captures the reader's scroll position as a grapheme offset
// over normalizeText(article) (D-05) and persists it via locationStore,
// debounced (~1200ms per 02-RESEARCH Open Question #2) with a bfcache-safe
// dual flush on visibilitychange-hidden + pagehide (Pitfall 4).
//
// Mirror of SettingsContext's persistence discipline (Plan 02-02):
//   - debounced save (prevents a write storm during continuous scroll)
//   - dual-event flush (visibilitychange-hidden is the primary session-end
//     signal; pagehide is the navigation/closure safety net)
//   - the deprecated bfcache-breaking session-end events are FORBIDDEN here
//     (Pitfall 4 — never registered; verified by acceptance-criteria grep)
//   - save failures are routed via the optional onStorageError callback so
//     ArticleView can surface them through the STATE-05 path — reading is
//     NEVER interrupted (T-02-10 mitigation)
//
// Offset computation: walks the rendered block elements in document order,
// finds the topmost visible block (the last whose top edge has scrolled past
// the header line), and reports its starting grapheme offset. This is the
// inverse of findScrollTarget and reuses the SAME per-block rules via
// normalizeElText so the saved offset round-trips with the restored target.
//
// Side-effect hook — returns nothing. Mounted by ArticleView with the
// rendered <article> element.
import { useEffect, useRef } from "react";
import type { CanonicalArticle } from "../content/types";
import type { LocationRecord } from "../content/schema";
import { computeTopVisibleOffset } from "./restoreLocation";
import { saveLocation } from "../persistence/locationStore";
import { classifyStorageError } from "../persistence/errors";

/** Debounce window for location writes (02-RESEARCH Open Question #2). */
const SAVE_DEBOUNCE_MS = 1200;

/**
 * Approximate header height in CSS pixels — used to identify the "topmost
 * visible block" as the last block whose top edge has scrolled past the
 * header line. Mirrors SectionAnnouncer's HEADER_PX.
 */
const HEADER_PX = 48;

interface UseScrollSaveOptions {
  /**
   * Invoked when a save fails (STATE-05). When provided, ArticleView wires
   * this to the SettingsContext storage-failure surface so the StorageBanner
   * surfaces location-save failures too (D2-13/T-02-10 mitigation). Optional
   * so the hook stays unit-testable without the provider.
   */
  onStorageError?: (reason: "unavailable" | "corrupt" | "unupgradeable") => void;
}

/**
 * useScrollSave(article, articleElRef, options?) — schedules a debounced
 * location save on every scroll and flushes pending on
 * visibilitychange-hidden + pagehide.
 *
 * @param article The canonical article (id + revision + lang Drive the key
 *   and the Intl.Segmenter locale; the saved offset is into
 *   normalizeText(article)). Pass `null` during loading — the hook no-ops
 *   (ArticleView must call hooks unconditionally, so the nullable type lets
 *   it call useScrollSave even before the article is ready).
 * @param articleElRef Ref to the rendered <article> element. Used to query
 *   the block elements for offset computation on each scroll.
 * @param options Optional overrides (onStorageError for STATE-05 surfacing).
 */
export function useScrollSave(
  article: CanonicalArticle | null,
  articleElRef: React.RefObject<HTMLElement | null>,
  options?: UseScrollSaveOptions,
): void {
  // Stash the latest options + article in refs so the listener closures stay
  // stable across re-renders without re-registering (mirrors the pendingRef
  // pattern in SettingsContext). The article ref lets computeOffset read the
  // current article without capturing it in a closure that would go stale.
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const articleRef = useRef(article);
  articleRef.current = article;

  const saveTimer = useRef<number | null>(null);
  const pendingRef = useRef<LocationRecord | null>(null);

  /**
   * Compute the grapheme offset of the topmost visible block. Delegates to the
   * shared `computeTopVisibleOffset` helper (exported from restoreLocation.ts)
   * so save/restore + the Phase 4 Plan 04-04 D4-10 mode-switch anchor all share
   * ONE implementation — never fork the block-walk accumulation.
   */
  function computeOffset(): number {
    const article = articleRef.current;
    if (!article) return 0;
    const articleEl = articleElRef.current;
    if (!articleEl) return 0;
    const blocks = Array.from(
      articleEl.querySelectorAll<HTMLElement>(
        "h2, h3, h4, p, blockquote, li, pre, figure, sup, details",
      ),
    );
    return computeTopVisibleOffset(article, blocks, HEADER_PX);
  }

  /**
   * Flush the pending write immediately (called by the debounce timer AND by
   * the visibilitychange-hidden / pagehide listeners). STATE-05: failures
   * route through onStorageError so the caller can surface them — never
   * throws to the reader (T-02-10 mitigation).
   */
  function flush() {
    const loc = pendingRef.current;
    if (!loc) return;
    pendingRef.current = null;
    saveLocation(loc).catch((e) => {
      const reason = classifyStorageError(e);
      optionsRef.current?.onStorageError?.(reason);
    });
  }

  /**
   * Schedule a debounced save. The latest record is stashed in pendingRef so
   * the dual-event flush can persist it immediately on tab-hide without
   * waiting for the debounce window.
   */
  function scheduleSave(loc: LocationRecord) {
    pendingRef.current = loc;
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
    }
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      flush();
    }, SAVE_DEBOUNCE_MS);
  }

  // Scroll listener — register on mount, cleanup on unmount. Re-registers
  // only if the article identity changes (article swap). No-ops while article
  // is null (loading state) — the hook is safe to call unconditionally.
  useEffect(() => {
    if (!article) return; // loading state — no scroll listener
    const onScroll = () => {
      const currentArticle = articleRef.current;
      if (!currentArticle) return;
      const offset = computeOffset();
      scheduleSave({
        schemaVersion: 1,
        articleId: currentArticle.id,
        revision: currentArticle.revision,
        graphemeOffset: offset,
        savedAt: new Date().toISOString(),
      });
    };
    // Passive scroll listener — we never preventDefault; just observe.
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
    };
    // article is captured by closure; re-register only if identity changes
    // (which happens on article swap). scheduleSave/computeOffset/flush are
    // stable closures that read the latest refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article]);

  // Dual-event flush (Pitfall 4 — bfcache-safe). Register BOTH:
  //   - visibilitychange (primary; treat document.visibilityState === "hidden"
  //     as flush)
  //   - pagehide (navigation/closure safety net)
  // The deprecated bfcache-breaking session-end events are FORBIDDEN here
  // (unreliable on mobile; break bfcache — 02-RESEARCH anti-pattern). The
  // flush() function reads pendingRef.current so the listener closures stay
  // stable across re-renders without re-registering.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const onPageHide = () => flush();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
    // Flush reads pendingRef.current, which always reflects the latest scroll.
    // No re-registration needed on article change beyond closure refresh.
  }, [article]);

  // Cleanup the pending debounce timer on unmount so it cannot fire after the
  // component is gone (no setState-after-unmount, no leaked write).
  useEffect(() => {
    return () => {
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      pendingRef.current = null;
    };
  }, []);
}
