// src/routes/review/reviewFilter.ts
// Plan 10-01 Task 1 — the pure review-list derivation for the annotation
// review panel (RECV-01, D10-09/D10-05/D10-08/D10-13). The `filterLibrary`
// pattern (src/ingestion/library/libraryFilter.ts) applied to the whole
// annotation library: join → classify → filter → group → sort, all in ONE
// pure function so the panel's data logic is unit-testable without Dexie,
// React, or a DOM (tests/unit/review-filter.test.ts).
//
// Locked decisions:
//   - D10-09: filtering/sorting is a PURE derivation — no Dexie, no React,
//     no IO in this module. Callers own loading (the LibraryView pattern).
//   - D10-05: never-drop — every highlight appears exactly once. An absent
//     article means status "orphan" with the row KEPT (orphanEntries tail,
//     the D9-09 markdown-export rule extended to the panel).
//   - D10-08: filters AND-compose (articleTag + highlightTag + articleId +
//     confidence); confidence "all" includes ambiguous and orphan rows —
//     tri-state is never silently filtered away.
//   - D10-13: tri-state re-derivation runs through the SHIPPED
//     resolveQuoteSelectorInText (src/annotations/resolution.ts — the
//     canonical D5-02 core, REUSE-DO-NOT-FORK) with per-article memoized
//     clusters via the LIFTED MemoizedArticleText
//     (src/portability/conflicts.ts) — zero per-highlight recompute of
//     normalizeText/graphemeClusters (the Phase 9 conflicts pattern).
//
// Sort keys (three verified precedents):
//   - date:     ISO-8601 lexicographic == chronological (markdown.ts L238-240)
//   - article:  provenance.title localeCompare (markdown.ts L253)
//   - position: position.start ascending (AnnotationsDrawer.tsx L75-79)
//
// Threat register (10-01-PLAN.md `<threat_model>`):
//   - T-10-01a: HighlightRecord.id/articleId are foreign-controlled strings
//     (imported bundles). They enter Map.get lookups ONLY — never dynamic
//     property access, never eval-shaped use.
//   - T-10-01b: stored note/highlight text moves through here as data only;
//     rendering plans (10-02) render it as React text children — never raw
//     HTML (react/no-danger + lint:no-danger enforced repo-wide).
import { resolveQuoteSelectorInText } from "../../annotations/resolution";
import { MemoizedArticleText } from "../../portability/conflicts";
import { effectiveTitle } from "../../ingestion/library/effectiveMetadata";
// Issue #117 — the ONE case-insensitive tag comparison (tagText.sameTag —
// the Q7A discipline) backs the highlight-tag dimension: highlight tags are
// highlight-local casings (the write seam folds only against the library
// vocabulary), so two rows may carry "Margin" and "margin".
import { sameTag } from "../../ingestion/library/tagText";
import type { TextPositionSelector } from "../../content/normalizeText";
import type { CanonicalArticle, HighlightRecord, NoteRecord } from "../../content/schema";

// ── Types ────────────────────────────────────────────────────────────────────

/** The three section sorts the panel offers (CONTEXT D10 sort set). */
export type ReviewSort = "date" | "article" | "position";

/** The honest tri-state vocabulary (D5-02/ANNO-07 — reused, not redefined). */
export type ConfidenceValue = "confident" | "ambiguous" | "orphan";

/** Confidence filter value; "all" passes every status (D10-08). */
export type ConfidenceFilter = "all" | ConfidenceValue;

/**
 * The filter shape consumed by deriveReviewSections — AND-composed (D10-08).
 * Issue #117 splits the ONE tag dimension into two clearly named ones:
 */
export interface ReviewFilters {
  /**
   * Single-select ARTICLE-tag filter; null = no filter. Byte-identical
   * meaning to the pre-#117 `tag` field (exact match on the article's own
   * tags): orphans have no article to carry a tag, so they drop out ONLY
   * while this filter is active — existing article-tag searches return
   * the same matches as before.
   */
  articleTag: string | null;
  /**
   * Single-select HIGHLIGHT-tag filter; null = no filter (issue #117).
   * Matches the highlight's OWN tags (case-insensitive, sameTag — the
   * annotation-tag namespace is highlight-local), so an orphan can still
   * match its own annotation tag. Never consults the article's tags.
   */
  highlightTag: string | null;
  /** Restrict to one article's highlights; null = no article filter. */
  articleId: string | null;
  /** Tri-state filter; "all" never silently filters ambiguous/orphan rows. */
  confidence: ConfidenceFilter;
}

/** One highlight row: the record, its optional note, its honest tri-state
 * status, and the article it joined to (absent for orphan-tail rows). */
export interface ReviewEntry {
  highlight: HighlightRecord;
  note?: NoteRecord;
  status: ConfidenceValue;
  article?: CanonicalArticle;
  /** Current resolved range; display verifies exact text before using its boundaries. */
  resolvedPosition?: TextPositionSelector;
}

/** One article's group of entries. `key` is the article id (stable for
 * React list keys and section anchoring). */
export interface ReviewSection {
  key: string;
  article: CanonicalArticle;
  entries: ReviewEntry[];
}

/** The derivation result: per-article sections + the never-drop orphan tail
 * (D10-05 — article-less entries are collected here, never discarded). */
export interface ReviewDerivation {
  sections: ReviewSection[];
  orphanEntries: ReviewEntry[];
}

// ── The derivation ───────────────────────────────────────────────────────────

/**
 * deriveReviewSections — join every highlight with its article and note,
 * classify each row's honest tri-state status, apply the AND-composed
 * filters, group under articles, and sort. Pure: no mutation of the inputs,
 * no IO, no React. Every highlight survives to exactly one output row
 * unless a filter explicitly excludes it (D10-05 never-drop).
 *
 * Pipeline order (locked by the plan):
 *   (a) JOIN — articleById + noteByHighlightId Maps (Map.get lookups only —
 *       foreign bundle ids never reach property access; T-10-01a), exactly
 *       the markdown.ts collectHighlightEntries join shape.
 *   (b) CLASSIFY — ONE MemoizedArticleText per call; each highlight with an
 *       article resolves through resolveQuoteSelectorInText against the
 *       per-article memoized clusters (D10-13). Non-string results map to
 *       "confident" (the conflicts.ts resolveHighlightStatus mapping).
 *       An absent article → "orphan", row KEPT.
 *   (c) FILTER — articleTag ∧ highlightTag ∧ articleId ∧ confidence,
 *       AND-composed (D10-08; the two tag dimensions are independent —
 *       issue #117).
 *   (d) GROUP — article-backed entries under their article; article-less
 *       entries into orphanEntries.
 *   (e) SORT — date: sections by newest entry createdAt descending
 *       (ISO-8601 lexicographic), entries newest-first; article: sections
 *       by provenance.title localeCompare, entries ascending by
 *       position.start; position: sections in the input articles-array
 *       order, entries ascending by position.start.
 *
 * @param articles   The whole library (composite fixtures + ingested rows).
 * @param highlights Every stored highlight (whole-library read).
 * @param notes      Every stored note (joined 1:1 via highlightId).
 * @param filters    AND-composed filter set.
 * @param sort       One of the three ReviewSort orders.
 */
export function deriveReviewSections(
  articles: readonly CanonicalArticle[],
  highlights: readonly HighlightRecord[],
  notes: readonly NoteRecord[],
  filters: ReviewFilters,
  sort: ReviewSort,
): ReviewDerivation {
  // (a) JOIN — the markdown.ts collectHighlightEntries shape (Map.get only).
  const articleById = new Map(articles.map((a) => [a.id, a] as const));
  const noteByHighlightId = new Map(notes.map((n) => [n.highlightId, n] as const));

  // (b) CLASSIFY — memoized tri-state (D10-13): one MemoizedArticleText per
  // call means normalizeText/graphemeClusters run once per article id, not
  // once per highlight.
  const memoizedText = new MemoizedArticleText();
  const entries: ReviewEntry[] = [];
  for (const highlight of highlights) {
    const article = articleById.get(highlight.articleId); // Map.get — T-10-01a
    const note = noteByHighlightId.get(highlight.id);
    let status: ConfidenceValue;
    let resolvedPosition: ReviewEntry["resolvedPosition"];
    if (!article) {
      status = "orphan"; // absent article → orphan, row KEPT (D10-05)
    } else {
      const resolved = resolveQuoteSelectorInText(
        memoizedText.clustersFor(article),
        highlight.quote,
        article.lang,
        highlight.position,
      );
      if (typeof resolved !== "string") resolvedPosition = resolved;
      status = resolved === "ambiguous" || resolved === "orphan" ? resolved : "confident";
    }
    const entry: ReviewEntry = article ? { highlight, status, article } : { highlight, status };
    if (resolvedPosition) entry.resolvedPosition = resolvedPosition;
    if (note) entry.note = note;
    entries.push(entry);
  }

  // (c) FILTER — AND-composed (D10-08): every active filter must pass.
  // (Hoisted narrowings — property narrowing does not survive callbacks.)
  const { articleTag, highlightTag } = filters;
  const filtered = entries.filter((entry) => {
    if (articleTag !== null) {
      // The pre-#117 meaning, byte-identical: exact match on the ARTICLE's
      // own tags. Orphans have no article to carry a tag — they drop out
      // only while this filter is active.
      if (!entry.article) return false;
      if (!(entry.article.tags ?? []).includes(articleTag)) return false;
    }
    if (highlightTag !== null) {
      // Issue #117 — the highlight's OWN tags (never the article's):
      // case-insensitive (sameTag) because highlight-local casings are not
      // folded across rows. No article requirement — an orphan can still
      // match its own annotation tag.
      if (!(entry.highlight.tags ?? []).some((t) => sameTag(t, highlightTag))) {
        return false;
      }
    }
    if (filters.articleId !== null) {
      if (entry.highlight.articleId !== filters.articleId) return false;
    }
    if (filters.confidence !== "all") {
      if (entry.status !== filters.confidence) return false;
    }
    return true;
  });

  // (d) GROUP — article-backed entries under their article; article-less
  // entries into the never-drop orphan tail. Sections exist only for
  // articles with surviving entries (no empty sections).
  const sectionsByArticleId = new Map<string, ReviewSection>();
  const orphanEntries: ReviewEntry[] = [];
  for (const entry of filtered) {
    const article = entry.article;
    if (!article) {
      orphanEntries.push(entry);
      continue;
    }
    let section = sectionsByArticleId.get(article.id);
    if (section === undefined) {
      section = { key: article.id, article, entries: [] };
      sectionsByArticleId.set(article.id, section);
    }
    section.entries.push(entry);
  }

  // (e) SORT — three key precedents; each branch also orders the entries
  // within every section. Fresh arrays throughout — inputs are not mutated.
  const sections = [...sectionsByArticleId.values()];
  const byPositionStart = (a: ReviewEntry, b: ReviewEntry) =>
    a.highlight.position.start - b.highlight.position.start;
  if (sort === "date") {
    // ISO-8601 strings compare lexicographically == chronologically
    // (markdown.ts L238-240 precedent).
    const newestCreatedAt = (section: ReviewSection): string => {
      let newest = "";
      for (const e of section.entries) {
        if (e.highlight.createdAt > newest) newest = e.highlight.createdAt;
      }
      return newest;
    };
    sections.sort((a, b) => (newestCreatedAt(a) < newestCreatedAt(b) ? 1 : -1));
    for (const section of sections) {
      section.entries.sort((a, b) => (a.highlight.createdAt < b.highlight.createdAt ? 1 : -1));
    }
  } else if (sort === "article") {
    sections.sort((a, b) => effectiveTitle(a.article).localeCompare(effectiveTitle(b.article)));
    for (const section of sections) {
      section.entries.sort(byPositionStart);
    }
  } else {
    // "position" — sections in the INPUT articles-array order (reading-order
    // stability across the library as the caller loaded it).
    const inputOrder = new Map(articles.map((a, i) => [a.id, i] as const));
    sections.sort(
      (a, b) => (inputOrder.get(a.article.id) ?? 0) - (inputOrder.get(b.article.id) ?? 0),
    );
    for (const section of sections) {
      section.entries.sort(byPositionStart);
    }
  }

  return { sections, orphanEntries };
}
