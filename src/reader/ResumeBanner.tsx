// src/reader/ResumeBanner.tsx
// STATE-01 resume surface: a dismissible, non-modal "You left off here" banner
// shown after the reader reopens an article and is silently scrolled to their
// saved location. Mirrors src/reader/StorageBanner.tsx sibling discipline:
// role="status" + aria-live="polite" + .status card styling. NON-modal — does
// NOT trap focus, does NOT block reading (UI-SPEC §Interaction 10).
//
// Copy verbatim from 02-UI-SPEC §Copywriting lines 318-323:
//   heading:  "You left off here"
//   body:     "Resume reading where you stopped, or start from the top."
//   primary:  "Resume reading"
//   secondary:"Start from top"
//   dismiss:  aria-label="Dismiss" (× glyph)
//   announce: "Returned to where you left off." (polite, on mount)
//
// Lifecycle (UI-SPEC §Interaction 10): the banner auto-dismisses on the
// reader's first scroll or pointer activity, OR on an explicit action. The
// parent (ArticleView) drives the auto-dismiss listener so this component
// stays a controlled presentational surface. Polite announce on open is set
// via the same role=status region (the initial children text announces on
// mount because aria-live regions announce initial content when the region
// is freshly inserted into the DOM).
interface ResumeBannerProps {
  /** Primary action — re-trigger the silent scroll to the saved offset. */
  onResume: () => void;
  /** Secondary action — scroll to the article top (the h1). */
  onStartFromTop: () => void;
  /** Dismiss (× button, or auto-dismiss on first scroll/pointer activity). */
  onDismiss: () => void;
}

export function ResumeBanner({ onResume, onStartFromTop, onDismiss }: ResumeBannerProps) {
  return (
    <div
      className="status resume-banner"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="resume-banner-main">
        {/* UI-SPEC §Copywriting line 318 */}
        <h2>You left off here</h2>
        {/* UI-SPEC §Copywriting line 319 */}
        <p>Resume reading where you stopped, or start from the top.</p>
        {/* UI-SPEC §Copywriting line 323 — polite announce on open. The
            region's aria-live="polite" announces this text on mount. */}
        <span className="visually-hidden">Returned to where you left off.</span>
      </div>
      <div className="resume-banner-actions">
        {/* UI-SPEC §Copywriting line 320 — primary */}
        <button
          type="button"
          className="resume-banner-primary"
          onClick={onResume}
        >
          Resume reading
        </button>
        {/* UI-SPEC §Copywriting line 321 — secondary */}
        <button
          type="button"
          className="resume-banner-secondary"
          onClick={onStartFromTop}
        >
          Start from top
        </button>
        {/* UI-SPEC §Copywriting line 322 — dismiss */}
        <button
          type="button"
          className="resume-banner-dismiss"
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          <DismissIcon aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function DismissIcon({ ariaHidden }: { ariaHidden?: "true" }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaHidden}
      focusable="false"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
