// src/reader/SectionAnnouncer.tsx
// A11Y-08: a polite live region that announces the current section heading
// when it changes during scroll. First IntersectionObserver in the codebase.
// Mirrors src/routes/FixtureList.tsx `.status` region aria pattern
// (role="status" + aria-live="polite" + aria-atomic="true") + ArticleView's
// useEffect + cleanup pattern.
//
// Pitfall 6 (02-RESEARCH): IntersectionObserver fires on every intersect
// change. Without debouncing, a single scroll past several headings floods
// the live region (a screen-reader user hears every heading in sequence).
// We (1) debounce the announce (~250ms — well within the polite-live-region
// coalescing window) and (2) only announce when the NEW section heading text
// differs from the last-announced text. Polite (never assertive) — assertive
// interrupts screen readers mid-utterance.
//
// rootMargin negative-top places a sentinel line UNDER the 48px header so a
// heading "passes" when it crosses under the header (not the viewport top).
// The bottom -60% margin shrinks the observable band so a heading near the
// bottom of the viewport does not prematurely become "current".
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
  // — non-flooding). Refs are stable across renders so the observer callback
  // always sees the latest value without re-registering.
  const currentRef = useRef<string>("");
  // Debounce timer ref — cleared on cleanup so it cannot fire after unmount.
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!articleEl) return;
    const headings = Array.from(
      articleEl.querySelectorAll<HTMLHeadingElement>("h2, h3, h4"),
    );
    if (headings.length === 0) return;

    const obs = new IntersectionObserver(
      () => {
        // The observer fires whenever any heading's intersection with the
        // root box changes. Compute the most-recently-passed heading by
        // finding the last heading whose top edge has scrolled to (or past)
        // the sentinel line under the header.
        const passed = headings.filter(
          (h) => h.getBoundingClientRect().top < HEADER_PX + 8,
        );
        const current = passed.length > 0 ? passed[passed.length - 1] : null;
        const text = current?.textContent?.trim() ?? "";
        // Pitfall 6: only announce when the section actually changes. A
        // scroll within the same section produces no announce.
        if (text && text !== currentRef.current) {
          currentRef.current = text;
          // Debounce the announce so a fast scroll past multiple headings
          // coalesces into a single update of the live region.
          if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
          }
          timerRef.current = window.setTimeout(() => {
            // UI-SPEC §Copywriting line 324: "Section: {heading text}."
            setAnnounce(`Section: ${text}.`);
          }, ANNOUNCE_DEBOUNCE_MS);
        }
      },
      {
        // rootMargin negative-top places the sentinel line UNDER the header.
        // -60% bottom shrinks the observable band so headings near the
        // bottom of the viewport do not prematurely become "current".
        rootMargin: `-${HEADER_PX}px 0px -60% 0px`,
        threshold: [0],
      },
    );
    headings.forEach((h) => obs.observe(h));
    return () => {
      obs.disconnect();
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
