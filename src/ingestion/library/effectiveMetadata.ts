// src/ingestion/library/effectiveMetadata.ts
// Plan 17-01 Task 1 — PURE effective-metadata derivation (META-02's
// structural guarantee, on the D14-20 one-derivation-point precedent:
// ONE derivation owned by ONE module). Computes the display title/author
// and the transcript video duration for an article from EXISTING row
// fields — zero I/O, zero React, zero Dexie queries of its own (the
// readingState.ts store-seam discipline: components own the reads, this
// module owns the algebra).
//
// Consumers (every surface imports THIS module — never fork the ?? chain;
// forking title derivation is the Phase 17 anti-pattern):
//   - Library rows (LibraryRow heading/byline/aria-label) + the strip
//     (ContinueReadingStrip) + search (libraryFilter haystack, D17-07)
//   - Reader header: document.title, byline, published date, source link,
//     export filename (ArticleView)
//   - Review surfaces (ReviewView options/sections/sort, reviewFilter sort,
//     source-host suffix)
//   - Markdown export citations/headings (portability/markdown.ts)
//
// Policy edges pinned by the truth table
// (tests/unit/library/effective-metadata.test.ts):
//   - META-02/D17-09: override present → the override is the ONE name the
//     article has everywhere; the canonical value is the fallback, never a
//     second visible identity (D17-08).
//   - META-03: absent override ⇔ canonical value — including the ABSENT
//     author case: `undefined ?? undefined === undefined`, and every
//     consumer's existing truthy guard renders nothing (restoring an
//     absent canonical author makes the override disappear entirely, not
//     become an empty string — the schema has no blank-override state,
//     D17-04).
//   - META-01: the canonical record is NEVER touched by derivation — the
//     override is layered ON TOP of it.
import type { CanonicalArticle } from "../../content/types";
import { formatDuration } from "./readingStats";

/**
 * effectiveTitle (META-02) — the ONE display-title derivation. The
 * reader-owned override wins; the canonical title is the fallback. Always
 * a string: the canonical title is min(1), so an article with no override
 * always has a name to fall back to (D17-04 — no override can produce an
 * untitled article).
 */
export function effectiveTitle(article: CanonicalArticle): string {
  return article.readerTitle ?? article.provenance.title;
}

/**
 * effectiveAuthor (META-03) — the ONE display-author derivation. With no
 * override key the canonical author returns — INCLUDING the absent case:
 * when both the override and the canonical author are undefined this
 * returns undefined, and every consumer's existing truthy guard renders
 * nothing (an absent canonical author restores to "no author shown",
 * never to an empty-string override — the schema's min(1) makes that
 * state unrepresentable, D17-04).
 */
export function effectiveAuthor(
  article: CanonicalArticle,
): string | undefined {
  return article.readerAuthor ?? article.provenance.author;
}

/**
 * effectivePublishedAt — the ONE display-date derivation, the
 * effectiveAuthor mechanism extended to the provenance date: the
 * reader-owned override wins; the canonical publishedAt is the fallback.
 * Absent override + absent canonical → undefined, and every consumer's
 * existing truthy guard renders nothing. Both sides are ISO datetime, so
 * every consumer's existing formatter works unchanged.
 */
export function effectivePublishedAt(
  article: CanonicalArticle,
): string | undefined {
  return article.readerPublishedAt ?? article.provenance.publishedAt;
}

/**
 * effectiveSourceUrl — the ONE display-source derivation: the override
 * corrects the "Originally published at {domain}" link (and the review
 * host suffix); the canonical sourceUrl is the fallback. The same absent-
 * and-both-undefined → undefined discipline as effectiveAuthor: a cleared
 * override on a paste article restores "no source link", never an empty
 * href.
 */
export function effectiveSourceUrl(
  article: CanonicalArticle,
): string | undefined {
  return article.readerSourceUrl ?? article.provenance.sourceUrl;
}

/**
 * videoDuration (issue #41, flow N3) — the ONE display-duration derivation:
 * the persisted transcript video duration through the ONE duration voice
 * (readingStats.formatDuration). Undefined for every non-transcript
 * article — absence is the empty state, never a placeholder (the same
 * silence discipline as effectiveAuthor's absent-author case).
 */
export function videoDuration(
  article: CanonicalArticle,
): string | undefined {
  const transcript = article.ingestionMeta?.transcript;
  return transcript ? formatDuration(transcript.durationSeconds) : undefined;
}
