// src/reader/PaginationFallbackBanner.tsx
// PAGE-04 + PAGE-09 fallback surface: a non-modal, dismissible `.status`
// banner shown when the pagination engine returns status "fallback" (an
// atomic block > 75% of page height, the 300-page ceiling, or a zero-progress
// stall) OR when the measurement layer emits a `measurement-error` that
// prevents a page from committing.
//
// Mirrors src/reader/StorageBanner.tsx + ResumeBanner.tsx discipline:
//   - role="status" + aria-live="polite" + aria-atomic="true" + .status card
//   - NON-modal: does NOT trap focus, does NOT block reading
//   - Copy is STATIC UI-SPEC §Copywriting text (lines 351–355) — the
//     DiagnosticEvent fields (kind/message) are NEVER rendered raw (T-04-14
//     XSS mitigation: react/no-danger enforced; the banner maps
//     dom-fallback/measurement-error to fixed copy).
//   - NOT sticky (READ-04 — sticky chrome competes with content).
//
// Lifecycle (UI-SPEC §Interaction 23): the banner auto-dismisses on the
// reader's first scroll or pointer activity (mirrors ResumeBanner) OR on an
// explicit action (Switch to pages / ×). It reappears if fallback re-triggers
// on a later repagination (it is NOT a one-per-session banner — unlike
// StorageBanner). The parent (ArticleView) drives the auto-dismiss listener +
// the visibility flag so this component stays a controlled presentational
// surface. A polite announce ("Switched to scrolling reading.") fires on
// appearance via the same role=status region (aria-live regions announce
// initial content when freshly inserted into the DOM).
//
// Switch to pages clears the session-mode override in ArticleView so the
// reader returns to their persisted preference (paginated) at the SAME D-05
// passage via the D4-10 anchor — the engine re-emits dom-fallback and the
// banner reappears if the oversize persists. The persisted readingMode is
// NEVER overwritten by the fallback path (T-04-15).
interface PaginationFallbackBannerProps {
  /** Switch back to paginated mode — clears the session override (NOT a persist). */
  onSwitchToPages: () => void;
  /** Dismiss (× button, or auto-dismiss on first scroll/pointer activity). */
  onDismiss: () => void;
}

export function PaginationFallbackBanner({
  onSwitchToPages,
  onDismiss,
}: PaginationFallbackBannerProps) {
  return (
    <div
      className="status pagination-fallback-banner"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="pagination-fallback-main">
        {/* UI-SPEC §Copywriting line 351 — heading */}
        <h2>This part of the article is too large to fit on one page.</h2>
        {/* UI-SPEC §Copywriting line 352 — body */}
        <p>
          Switched to scrolling so you can keep reading. You can switch back to
          pages anytime.
        </p>
        {/* UI-SPEC §Copywriting line 354 — polite announce on appearance. The
            region's aria-live="polite" announces this text on mount. */}
        <span className="visually-hidden">Switched to scrolling reading.</span>
      </div>
      <div className="pagination-fallback-actions">
        {/* UI-SPEC §Copywriting line 355 — secondary action (reversible, NOT
            destructive). Mirrors ResumeBanner's secondary-action class
            discipline (neutral border). */}
        <button
          type="button"
          className="pagination-fallback-switch"
          onClick={onSwitchToPages}
        >
          Switch to pages
        </button>
        {/* Dismiss × — reuses the StorageBanner dismiss geometry. aria-label
            carries the accessible name; the × glyph is decorative. */}
        <button
          type="button"
          className="pagination-fallback-dismiss"
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
