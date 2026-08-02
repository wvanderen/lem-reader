// src/reader/SectionAnnouncer.tsx
// A11Y-08: a polite live region that announces the current section heading
// when it changes during scroll. First IntersectionObserver in the codebase.
// Mirrors src/routes/FixtureList.tsx `.status` region aria pattern
// (role="status" + aria-live="polite" + aria-atomic="true") + ArticleView's
// useEffect + cleanup pattern.
//
// Pitfall 6 (02-RESEARCH): IntersectionObserver may not fire reliably for
// every scroll position change (it batches callbacks, and percentage-based
// rootMargin is flaky across engines). To guarantee the announce tracks the
// reader's actual position, we ALSO register a passive scroll listener that
// triggers the same detection logic. Both feed into a shared debounced
// announce (~250ms) that only fires when the NEW section differs from the
// last-announced section. Polite (never assertive) — assertive interrupts
// screen readers mid-utterance.
//
// The sentinel line is HEADER_PX + 8 = 56px from the viewport top (just
// under the 48px sticky header). A heading is "current" when its top has
// scrolled past this line.
import { useEffect, useRef, useState } from "react";

interface SectionAnnouncerProps {
  /**
   * The rendered <article> element. Null until the article mounts; the
   * effect re-runs when it transitions to non-null (e.g. on article swap).
   * The observer queries `h2, h3, h4` inside this element — the same set
   * the paginator and skip-link target. (h1 is rendered by ArticleView from
   * provenance and is not a section heading.)
   */
  articleEl: HTMLElement | null;
}

/** Approximate header height — sentinel line sits just under the header. */
const HEADER_PX = 48;

/** Debounce window for the announce (Pitfall 6 — anti-flood). */
const ANNOUNCE_DEBOUNCE_MS = 250;

export function SectionAnnouncer({ articleEl }: SectionAnnouncerProps) {
  const [announce, setAnnounce] = useState("");
  // Ref-tracked current section text so we only announce on CHANGE (Pitfall 6
  // — non-flooding). Refs are stable across renders so the callbacks always
  // see the latest value without re-registering.
  const currentRef = useRef<string>("");
  // Debounce timer ref — cleared on cleanup so it cannot fire after unmount.
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!articleEl) return;
    const headings = Array.from(
      articleEl.querySelectorAll<HTMLHeadingElement>("h2, h3, h4"),
    );
    if (headings.length === 0) return;

    /**
     * Shared detection logic: find the most-recently-passed heading (the
     * last heading whose top has scrolled past the sentinel line under the
     * header). If it differs from the last-announced heading, schedule a
     * debounced announce.
     */
    const detect = () => {
      const passed = headings.filter(
        (h) => h.getBoundingClientRect().top < HEADER_PX + 8,
      );
      const current = passed.length > 0 ? passed[passed.length - 1] : null;
      const text = current?.textContent?.trim() ?? "";
      // Pitfall 6: only announce when the section actually changes. A
      // scroll within the same section produces no announce.
      if (text && text !== currentRef.current) {
        currentRef.current = text;
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current);
        }
        timerRef.current = window.setTimeout(() => {
          // UI-SPEC §Copywriting line 324: "Section: {heading text}."
          setAnnounce(`Section: ${text}.`);
        }, ANNOUNCE_DEBOUNCE_MS);
      }
    };

    // Primary trigger: IntersectionObserver. rootMargin places a sentinel
    // band just under the header (negative top) with a narrow bottom margin
    // so only headings near the top of the viewport are considered "current".
    const obs = new IntersectionObserver(detect, {
      rootMargin: `-${HEADER_PX}px 0px -60% 0px`,
      threshold: [0],
    });
    headings.forEach((h) => obs.observe(h));

    // Fallback trigger: passive scroll listener. IntersectionObserver batches
    // callbacks and may miss fast scroll positions; the scroll listener
    // guarantees detection runs on every scroll frame (rAF-throttled to
    // avoid jank). Both triggers call the same `detect` function.
    let rafId: number | null = null;
    const onScroll = () => {
      if (rafId !== null) return; // already scheduled
      rafId = requestAnimationFrame(() => {
        rafId = null;
        detect();
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      obs.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [articleEl]);

  return (
    <div
      className="visually-hidden"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {announce}
    </div>
  );
}
