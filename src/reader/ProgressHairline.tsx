// src/reader/ProgressHairline.tsx
// READ-05 + A11Y-08: a 2px-tall, full-width scroll-progress hairline mounted
// immediately under the persistent header. Decorative-only — `aria-hidden`
// because structural progress is conveyed to assistive tech via the
// SectionAnnouncer's polite live region (NOT this element).
//
// The fill width is driven by `transform: scaleX({progress})` with
// `transform-origin: left`. The earlier `inline-start` value is NOT in the
// transform-origin grammar (its keywords are left|center|right|top|bottom —
// no logical-keyword variants), so browsers ignored it and fell back to the
// initial `50% 50%` (center), making the fill expand from the middle. LTR
// English content uses the physical `left` keyword so scaleX grows from the
// inline-start edge; a `[dir="rtl"]` override to `right` is deferred
// (UI-SPEC content is LTR English). CRITICAL (UI-SPEC §Interaction 12,
// 02-RESEARCH anti-pattern #6): the .progress-hairline-fill CSS rule applies
// NO transition/animation of any kind to the transform. The global
// prefers-reduced-motion gate is trivially satisfied and the hairline never
// animates — it reflects scroll position immediately, like a native scrollbar.
//
// Mirrors src/a11y/SkipLink.tsx minimal-component pattern: header comment
// citing the locked decisions, single responsibility, verbatim UI-SPEC class
// hook. Mounted only on ArticleView (hidden on FixtureList per UI-SPEC
// §Layout line 491 — no scroll progress to show there).
interface ProgressHairlineProps {
  /**
   * Position progress as a ratio in [0, 1]. 0 = at the start of the article;
   * 1 = at the end. Ratio-only since POLISH-02 (Phase 13 Plan 02): scrolling
   * mode passes window.scrollY / (scrollHeight - viewportHeight); paginated
   * mode passes paginatedProgressRatio(article, fragment) — the offset-
   * anchored D-05 position, replacing the old N/M division that read 100%
   * on a one-page open. The inline-style write happens on every position
   * change so the fill tracks like a native scrollbar.
   */
  progress?: number;
}

export function ProgressHairline({ progress }: ProgressHairlineProps) {
  // Clamp the ratio to [0, 1] defensively — a position edge case (e.g. an
  // article shorter than the viewport, or a stale paginated offset) could
  // otherwise produce a negative or >1 ratio that flips or over-extends
  // the fill. paginatedProgressRatio clamps upstream too; this is the
  // presentational last line of defense.
  const ratio = Math.max(0, Math.min(1, progress ?? 0));
  return (
    <div className="progress-hairline" aria-hidden="true">
      <div
        className="progress-hairline-fill"
        style={{
          transform: `scaleX(${ratio})`,
          transformOrigin: "left",
        }}
      />
    </div>
  );
}
