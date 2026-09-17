// server/titleMatch.ts
// The ONE home of the D11-09 fuzzy-title algebra, shared by every consumer
// that needs a case/separator-insensitive title comparison key:
//   - ingest.ts consumeDuplicatedTitle (the PDF filename-fallback doubled-
//     title consume — D11-09),
//   - transcriptToBlocks.ts restatesVideoTitle (the #39 duplicate-0:00
//     chapter edge rule — decision #26 rule 3).
// Forked normalizers here would drift (one side learns a new separator, the
// other doesn't) and the two rules would silently disagree about what
// "the same title" means — hence one exported key function.
//
// Pure string algebra — no DOM, no I/O.

/**
 * normalizeForTitleMatch — lowercase + separator-collapse (the D11-09 fuzzy
 * matching basis: case/whitespace-insensitive equality and containment).
 * Hyphens and underscores count as whitespace because the filename channel
 * slugifies spaces ("calm-report.pdf" ↔ page-1 heading "Calm Report") and
 * the transcript's chapter titles slugify the same way — comparisons only
 * match when word separators are normalized uniformly on both sides.
 */
export function normalizeForTitleMatch(s: string): string {
  return s.toLowerCase().replace(/[-_\s]+/g, " ").trim();
}
