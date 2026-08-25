// src/ingestion/library/pageMeta.ts
// Plan 14-01 Task 2 - the per-destination document.title helper (the
// D14-02 foundation). Pure string building plus ONE text-only DOM-global
// write. Plans 14-02/14-03 consume setDocumentTitle for every
// destination, never their own string building.
//
// Convention (14-UI-SPEC §Copywriting Contract, locked here):
//   - Suffix: "Lem Reader" (TITLE_SUFFIX).
//   - Separator: em dash with one space each side (the D12-08 strip
//     label convention), assembled ONLY inside setDocumentTitle (the
//     separator character appears exactly once in this file by design;
//     this header deliberately avoids it).
//   - Truncation: the content portion is capped at
//     TITLE_CONTENT_MAX_CHARS (64); longer content keeps its first 64
//     characters plus an ellipsis (the ReviewView truncate shape).
//   - D14-06 note: every destination including error states sets its
//     own title on mount. There is deliberately NO restore-on-unmount
//     API.
//
// Security (T-14-01): document.title is a text-only assignment (the
// MDN/WHATWG text-only title model) - no markup path, no injection
// surface. The 64-char cap additionally bounds foreign-title length
// (imported article/chapter titles reach this write in later plans).
export const TITLE_SUFFIX = "Lem Reader";

/** The content-portion cap (the UI-SPEC truncation lock). */
const TITLE_CONTENT_MAX_CHARS = 64;

/**
 * truncateTitle - return content unchanged when at or under the cap;
 * otherwise keep the first TITLE_CONTENT_MAX_CHARS characters plus an
 * ellipsis. Exported so callers can preview the truncated form (e.g.
 * the combined chapter + book title assembly in Plan 14-03) without
 * forking the cap.
 */
export function truncateTitle(content: string): string {
  if (content.length <= TITLE_CONTENT_MAX_CHARS) return content;
  return content.slice(0, TITLE_CONTENT_MAX_CHARS) + "…";
}

/**
 * setDocumentTitle (D14-02) - write the truncated content, then the em
 * dash separator (one space each side), then TITLE_SUFFIX, as a single
 * plain-text assignment to document.title.
 */
export function setDocumentTitle(content: string): void {
  document.title = `${truncateTitle(content)} — ${TITLE_SUFFIX}`;
}
