// src/reader/sectionSpy.ts
// Shared scroll-spy detection (Phase 18, Plan 18-01 — extracted verbatim
// from SectionAnnouncer.tsx L48-113 so D18-12's TOC aria-current shares ONE
// implementation with the announcer, not a fork).
//
// The heading selector is a PARAMETER — the whole point of the extraction:
//   - SectionAnnouncer pins "h2, h3, h4" (the paginator / skip-link set —
//     its `Section: {text}.` announce contract stays byte-stable).
//   - TocPanel (Plan 18-02) passes "h2, h3, h4, h5, h6" and maps the current
//     heading element's data-block-index to its aria-current entry.
//
// Detection mechanics (carried over byte-for-byte from the 02-03 original):
//   - Primary trigger: IntersectionObserver with a sentinel rootMargin band
//     just under the header. Pitfall 6 (02-RESEARCH): IO alone is flaky — it
//     batches callbacks and percentage-based rootMargin misbehaves across
//     engines.
//   - Fallback trigger: passive rAF-throttled window scroll listener. Both
//     triggers feed the same detect() function.
//   - The rule: the most-recently-passed heading — the LAST heading whose
//     viewport-relative top has crossed HEADER_PX + 8 (the sentinel line
//     just under the 48px sticky header) — is "current".
//   - Notify on CHANGE only (tracked by text), debounced ~250ms, so a scroll
//     within the same section (or a fast scroll past several headings)
//     cannot flood the consumer (Pitfall 6 anti-flood).
//   - FULL cleanup: observer disconnect, scroll listener removal, pending
//     rAF cancel, debounce timer clear — nothing fires after unmount.
import { useEffect, useRef } from "react";

/** Options for {@link useSectionSpy}. */
export interface UseSectionSpyOptions {
  /**
   * The rendered <article>-root element. Null until the article mounts; the
   * effect re-runs when it transitions to non-null (e.g. on article swap).
   */
  articleEl: HTMLElement | null;
  /**
   * Heading selector to spy on (e.g. "h2, h3, h4"). PARAMETERIZED — never
   * hardcoded in this shared module.
   */
  selector: string;
  /**
   * Invoked (debounced) when the current heading CHANGES, receiving the
   * current heading ELEMENT — not just text — so consumers can map
   * data-block-index → their own entry model (the TOC's aria-current), plus
   * the detect-time trimmed text (so the announcer rebuilds its exact
   * `Section: {text}.` string from the value the change was measured on).
   */
  onCurrent: (heading: HTMLHeadingElement, text: string) => void;
}

/** Approximate header height — sentinel line sits just under the header. */
const HEADER_PX = 48;

/** Debounce window for the on-change notify (Pitfall 6 — anti-flood). */
const NOTIFY_DEBOUNCE_MS = 250;

/**
 * Watch the article's headings and notify (debounced, on change only) with
 * the most-recently-passed heading element. See the module header for the
 * full detection contract.
 */
export function useSectionSpy({
  articleEl,
  selector,
  onCurrent,
}: UseSectionSpyOptions): void {
  // Ref-tracked current section text so we notify only on CHANGE (Pitfall 6
  // — non-flooding). Refs are stable across renders so the callbacks always
  // see the latest value without re-registering. Persists across article
  // swaps exactly like the original component-level ref did.
  const currentRef = useRef<string>("");
  // Latest-callback ref: keeps the observer/observer-cleanup lifecycle tied
  // to [articleEl, selector] ONLY (the original effect's dependency shape),
  // so consumers may pass an inline arrow without re-registering observers
  // on every render.
  const onCurrentRef = useRef(onCurrent);
  onCurrentRef.current = onCurrent;

  useEffect(() => {
    if (!articleEl) return;
    const headings = Array.from(
      articleEl.querySelectorAll<HTMLHeadingElement>(selector),
    );
    if (headings.length === 0) return;

    // Debounce timer — cleared on cleanup so it cannot fire after unmount.
    let timer: number | null = null;

    /**
     * Shared detection logic: find the most-recently-passed heading (the
     * last heading whose top has scrolled past the sentinel line under the
     * header). If it differs from the last-notified heading, schedule a
     * debounced notify.
     */
    const detect = () => {
      const passed = headings.filter(
        (h) => h.getBoundingClientRect().top < HEADER_PX + 8,
      );
      const current = passed.length > 0 ? passed[passed.length - 1] : null;
      const text = current?.textContent?.trim() ?? "";
      // Pitfall 6: only notify when the section actually changes. A scroll
      // within the same section produces no notify.
      if (text && text !== currentRef.current) {
        currentRef.current = text;
        if (timer !== null) {
          window.clearTimeout(timer);
        }
        timer = window.setTimeout(() => {
          timer = null;
          // text is non-empty only when current exists.
          if (current) onCurrentRef.current(current, text);
        }, NOTIFY_DEBOUNCE_MS);
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
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };
  }, [articleEl, selector]);
}
