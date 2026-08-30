// src/reader/SectionAnnouncer.tsx
// A11Y-08: a polite live region that announces the current section heading
// when it changes during scroll. Mirrors src/routes/FixtureList.tsx `.status`
// region aria pattern (role="status" + aria-live="polite" + aria-atomic=
// "true").
//
// Phase 18 (Plan 18-01): the detection itself (IntersectionObserver primary
// trigger + rAF-throttled passive scroll fallback, most-recently-passed
// heading past the 48+8px sentinel line, 250ms debounced on-change notify,
// full cleanup — Pitfall 6) now lives in ./sectionSpy, extracted verbatim so
// the TOC's aria-current (D18-12) shares ONE implementation, not a fork.
// This consumer pins the announcer's selector to "h2, h3, h4" — the same
// set the paginator and skip-link target — and its announce contract
// (`Section: {text}.`, polite, debounced) is byte-stable: the 02-03 e2e
// spec (tests/e2e/section-announce.spec.ts) must keep passing unchanged.
// (h1 is rendered by ArticleView from provenance and is not a section
// heading.)
import { useState } from "react";
import { useSectionSpy } from "./sectionSpy";

interface SectionAnnouncerProps {
  /**
   * The rendered <article> element. Null until the article mounts; the spy
   * effect re-runs when it transitions to non-null (e.g. on article swap).
   */
  articleEl: HTMLElement | null;
}

export function SectionAnnouncer({ articleEl }: SectionAnnouncerProps) {
  const [announce, setAnnounce] = useState("");

  useSectionSpy({
    articleEl,
    selector: "h2, h3, h4",
    onCurrent: (_heading, text) => {
      // UI-SPEC §Copywriting line 324: "Section: {heading text}."
      setAnnounce(`Section: ${text}.`);
    },
  });

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
