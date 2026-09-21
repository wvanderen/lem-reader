// src/ingestion/library/formatDate.ts
// The ONE localized date voice (the formatDuration one-voice precedent).
// Every surface formats an ISO datetime through THIS module — the local
// Intl.DateTimeFormat copies in ArticleView / ReviewView /
// EditMetadataDialog were the D17-03 duplicated-formatter anti-pattern.
// Presentation-only: no React, no I/O beyond navigator.language.

/**
 * formatIsoDate — an ISO datetime in the reader's locale with the given
 * date style. Falls back to the raw ISO string if the user agent's locale
 * is unavailable (the ArticleView fallback discipline).
 */
export function formatIsoDate(
  iso: string,
  dateStyle: "medium" | "short" = "medium",
): string {
  try {
    return new Intl.DateTimeFormat(navigator.language, { dateStyle }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}
