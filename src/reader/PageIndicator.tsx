// src/reader/PageIndicator.tsx
// D4-08 + READ-05: a decorative "N of M" indicator shown alongside the
// progress hairline in paginated mode. aria-hidden because page number is
// informational (D-05 — page numbers are never persistent identity); the
// SectionAnnouncer live region conveys structural progress to AT, not this
// span. Plan 04-04's PageTurnControls adds a polite announce for
// screen-reader users; this span is visual-only.
//
// Mirrors ProgressHairline.tsx presentational discipline: header comment
// citing locked decisions, single responsibility, verbatim UI-SPEC class
// hook. Rendered as a sibling of ProgressHairline when paginated.

interface PageIndicatorProps {
  /** 1-based current page number. */
  current: number;
  /** Total page count. */
  total: number;
}

export function PageIndicator({ current, total }: PageIndicatorProps) {
  // Defensive: never render "0 of 0" or "N of 0" — the parent (PaginatedSurface)
  // already short-circuits when pages is null, but be total-tolerant here too.
  if (total <= 0) return null;
  let fmt: Intl.NumberFormat;
  try {
    fmt = new Intl.NumberFormat(navigator.language);
  } catch {
    // Fall back to the default locale if navigator.language is unavailable.
    fmt = new Intl.NumberFormat();
  }
  return (
    <span className="page-indicator" aria-hidden="true">
      {fmt.format(current)} of {fmt.format(total)}
    </span>
  );
}
