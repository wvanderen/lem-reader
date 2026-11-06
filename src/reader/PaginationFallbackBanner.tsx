// src/reader/PaginationFallbackBanner.tsx
// PAGE-04 + PAGE-09 + issue #240 fallback surface: a non-modal, dismissible
// `.status` banner carrying the VALIDATED pagination failure explanation
// (src/reader/paginationFailure.ts) — never a generic inference. The two
// failure classes are explicit and distinct:
//
//   unpageable-content — a genuine content limit (an element too large for
//     one page, an element that can't be divided, a one-pass length limit).
//     ArticleView has already made the DISCLOSED, reversible session flip to
//     scrolling; the banner offers "Switch to pages" (back to the persisted
//     preference at the same passage) and, where the article has one, the
//     original source.
//   processing-error — the reader's pipeline failed (zero-progress stall,
//     capacity continuation it cannot refine, measurement failure,
//     unexpected error). Modes are NOT flipped; the banner offers "Try pages
//     again" (re-runs pagination at the affected passage) and "Read in
//     scrolling" (an explicit, session-scoped escape), plus the original
//     source where available.
//
// Mirrors src/reader/StorageBanner.tsx + ResumeBanner.tsx discipline:
//   - role="status" + aria-live="polite" + aria-atomic="true" + .status card
//     (the ONE polite status-region primitive — issue #98).
//   - NON-modal: does NOT trap focus, does NOT block reading.
//   - Copy is the classifier's STATIC text (failure.heading/body/announce) —
//     diagnostic fields (kind/reason/message) are NEVER rendered raw
//     (T-04-14; react/no-danger enforced).
//   - NOT sticky (READ-04 — sticky chrome competes with content).
//
// Lifecycle (UI-SPEC §Interaction 23, unchanged): the banner auto-dismisses
// on the reader's first scroll or pointer activity (ArticleView owns the
// listeners + the visibility flag — this component stays a controlled
// presentational surface). A polite announce fires on appearance via the
// role=status region (aria-live regions announce freshly inserted content).
import type { PaginationFailure } from "./paginationFailure";
import { CloseIcon } from "../ui/icons";
// Issue #98 (decision #96) — the ONE polite status-region primitive; the
// banner composes its own class over the shared .status card.
import { StatusRegion } from "../ui/StatusRegion";

interface PaginationFallbackBannerProps {
  /** The validated failure explanation (never constructed ad hoc). */
  failure: PaginationFailure;
  /**
   * The article's original source URL — the "See the original" escape route
   * (where applicable, issue #240). Absent for paste-HTML articles: no
   * canonical source exists, so the route stays silent.
   */
  originalSourceUrl?: string;
  /** Processing errors: re-run pagination at the affected passage. */
  onRetryPages?: () => void;
  /** Unpageable content: clear the session override (reversible, NOT a persist). */
  onSwitchToPages?: () => void;
  /** Processing errors: explicit, session-scoped switch to scrolling. */
  onContinueScrolling?: () => void;
  /** Dismiss (× button, or auto-dismiss on first scroll/pointer activity). */
  onDismiss: () => void;
}

export function PaginationFallbackBanner({
  failure,
  originalSourceUrl,
  onRetryPages,
  onSwitchToPages,
  onContinueScrolling,
  onDismiss,
}: PaginationFallbackBannerProps) {
  return (
    <StatusRegion className="pagination-fallback-banner">
      <div className="pagination-fallback-main">
        {/* The classifier's static, specific heading — never raw diagnostics. */}
        <h2>{failure.heading}</h2>
        <p>{failure.body}</p>
        {/* Polite announce on appearance. The region's aria-live="polite"
            announces this text on mount. */}
        <span className="visually-hidden">{failure.announce}</span>
      </div>
      <div className="pagination-fallback-actions">
        {failure.failureClass === "processing-error" ? (
          <>
            {/* Retry re-runs pagination at the affected passage — the reader
                keeps their place (issue #240; the anchor flows through
                ArticleView's retry epoch). */}
            <button type="button" className="btn btn-primary pagination-fallback-primary" onClick={onRetryPages}>
              Try pages again
            </button>
            {/* The explicit scrolling escape — session-scoped, reversible,
                never persisted (T-04-15). Quiet register: a deliberate
                secondary path beside the primary retry. */}
            {onContinueScrolling && (
              <button
                type="button"
                className="btn btn-quiet pagination-fallback-scrolling"
                onClick={onContinueScrolling}
              >
                Read in scrolling
              </button>
            )}
          </>
        ) : (
          <>
            {onSwitchToPages && (
              <button
                type="button"
                className="btn btn-primary pagination-fallback-primary"
                onClick={onSwitchToPages}
              >
                Switch to pages
              </button>
            )}
          </>
        )}
        {/* Original-source escape route (where applicable, issue #240).
            Mirrors ArticleView's seeOriginal link contract byte-for-byte:
            rel + target + the visually-hidden new-tab announcement. */}
        {originalSourceUrl !== undefined && (
          <a
            href={originalSourceUrl}
            rel="noopener noreferrer"
            target="_blank"
            className="btn btn-quiet pagination-fallback-source"
          >
            See the original
            <span className="visually-hidden"> (opens in a new tab)</span>
          </a>
        )}
        {/* Dismiss × — reuses the StorageBanner dismiss geometry. aria-label
            carries the accessible name; the × glyph is decorative. */}
        <button
          type="button"
          className="btn btn-icon pagination-fallback-dismiss"
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          <CloseIcon />
        </button>
      </div>
    </StatusRegion>
  );
}
