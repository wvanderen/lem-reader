// src/reader/ProgressHairline.tsx
// READ-05 + A11Y-08: a 2px-tall, full-width scroll-progress hairline mounted
// immediately under the persistent header. Decorative-only — `aria-hidden`
// because structural progress is conveyed to assistive tech via the
// SectionAnnouncer's polite live region (NOT this element).
//
// The fill width is driven by `transform: scaleX({progress})` with
// `transform-origin: inline-start`. CRITICAL (UI-SPEC §Interaction 12,
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
   * Scroll progress as a clamped ratio in [0, 1]. 0 = at the top of the
   * article; 1 = at the bottom. Driven by ArticleView's scroll listener
   * (window.scrollY / (scrollHeight - viewportHeight)). The inline-style
   * write happens on every scroll so the fill tracks the scrollbar.
   */
  progress: number;
}

export function ProgressHairline({ progress }: ProgressHairlineProps) {
  // Clamp to [0, 1] defensively — a scroll-position edge case (e.g. an
  // article shorter than the viewport) could otherwise produce a negative
  // or >1 ratio that flips or over-extends the fill.
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <div className="progress-hairline" aria-hidden="true">
      <div
        className="progress-hairline-fill"
        style={{
          transform: `scaleX(${clamped})`,
          transformOrigin: "inline-start",
        }}
      />
    </div>
  );
}
